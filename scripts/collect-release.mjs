#!/usr/bin/env node
/**
 * Collects the build artifacts into a versioned, platform-scoped tree:
 *
 *   releases/<version>/windows/...
 *   releases/<version>/linux/...
 *   releases/<version>/android/...
 *   releases/<version>/MANIFEST.txt
 *
 * `dist/` belongs to electron-builder and is wiped on every build, so finished
 * artifacts are copied out of it instead of being organised in place. Binaries
 * are not committed: `releases/` is gitignored and this script rebuilds the
 * layout from whatever the build produced.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

/**
 * Deliverables sit at the top level of `dist`; anything below it is an
 * intermediate unpacked tree (`win-unpacked/`, `linux-unpacked/`) whose
 * binaries are the same code under a different name.
 */
function topLevelFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(dir, entry.name));
}

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

let commit = 'unknown';
try {
  commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {
  // Not a git checkout; the manifest records "unknown" instead of failing.
}

const distFiles = topLevelFiles(join(root, 'dist'));

const sources = [
  {
    platform: 'windows',
    files: distFiles.filter((file) => file.endsWith('.exe')),
  },
  {
    platform: 'linux',
    files: distFiles.filter((file) => /\.(AppImage|deb)$/.test(file)),
  },
  {
    platform: 'android',
    files: walk(join(root, 'android', 'app', 'build', 'outputs', 'apk')).filter((file) =>
      file.endsWith('.apk'),
    ),
  },
];

const releaseRoot = join(root, 'releases', version);
const rows = [];
let copied = 0;

for (const { platform, files } of sources) {
  if (files.length === 0) continue;

  const platformDir = join(releaseRoot, platform);
  mkdirSync(platformDir, { recursive: true });

  // The APK file name already encodes the build type (`app-debug.apk`), so a
  // debug and a release build never collide.
  for (const file of files) {
    const target = join(platformDir, file.split(/[\\/]/).pop());
    copyFileSync(file, target);
    copied += 1;
    rows.push({
      platform,
      file: relative(releaseRoot, target).replaceAll('\\', '/'),
      bytes: statSync(target).size,
      sha256: sha256(target),
    });
  }
}

if (copied === 0) {
  console.error(
    'No artifacts found. Build first: `npm run build` (Windows/Linux) or the Android APK.',
  );
  process.exit(1);
}

const lines = [
  `LocalPass ${version}`,
  `commit: ${commit}`,
  `generated: ${new Date().toISOString()}`,
  '',
  ...rows.map(
    (row) => `${row.sha256}  ${row.bytes.toString().padStart(10)}  ${row.file}`,
  ),
  '',
];

writeFileSync(join(releaseRoot, 'MANIFEST.txt'), lines.join('\n'), 'utf8');

console.log(`releases/${version}/`);
for (const row of rows) {
  console.log(`  ${row.file}  ${(row.bytes / 1024 / 1024).toFixed(1)} MB`);
}
console.log(`  MANIFEST.txt`);
