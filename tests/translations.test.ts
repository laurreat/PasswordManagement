import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { translations } from '../src/lib/translations.ts';
import { VAULT_ERROR_MESSAGE_KEYS } from '../src/lib/vault-error-messages.ts';

/**
 * The UI never falls back to a raw key: if a string is missing, the user sees
 * `generator.exclude_ambiguous` on screen. These tests make that class of bug
 * fail in CI instead of in front of the user.
 */

type Locale = keyof typeof translations;
type Flat = Record<string, string>;

const LOCALES = Object.keys(translations) as Locale[];

function flatten(node: Record<string, unknown>, prefix = ''): Flat {
  const keys: Flat = {};
  for (const [name, value] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${name}` : name;
    if (value && typeof value === 'object') {
      Object.assign(keys, flatten(value as Record<string, unknown>, key));
    } else {
      keys[key] = String(value);
    }
  }
  return keys;
}

const flat: Record<Locale, Flat> = Object.fromEntries(
  LOCALES.map((locale) => [locale, flatten(translations[locale] as Record<string, unknown>)])
) as Record<Locale, Flat>;

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) files.push(full);
  }
  return files;
}

/** Literal `t('key')` calls. Template-literal keys are dynamic and checked separately. */
function literalKeysInSource(): Set<string> {
  const keys = new Set<string>();
  for (const file of sourceFiles('src')) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\bt\(\s*(['"])([^'"\n]+)\1\s*[,)]/g)) {
      keys.add(match[2]);
    }
  }
  return keys;
}

test('every locale defines the same keys as English', () => {
  const reference = Object.keys(flat.en).sort();
  for (const locale of LOCALES) {
    const keys = new Set(Object.keys(flat[locale]));
    const missing = reference.filter((key) => !keys.has(key));
    const extra = [...keys].filter((key) => !reference.includes(key));
    assert.deepEqual(missing, [], `${locale} is missing ${missing.length} key(s)`);
    assert.deepEqual(extra, [], `${locale} defines ${extra.length} key(s) English does not`);
  }
});

test('every literal translation key used by the UI exists in all locales', () => {
  const used = literalKeysInSource();
  assert.ok(used.size > 50, `expected to find UI keys, found ${used.size}`);

  for (const locale of LOCALES) {
    const missing = [...used].filter((key) => !(key in flat[locale])).sort();
    assert.deepEqual(missing, [], `${locale} has no string for: ${missing.join(', ')}`);
  }
});

test('vault error codes map to strings present in all locales', () => {
  for (const locale of LOCALES) {
    for (const [code, key] of Object.entries(VAULT_ERROR_MESSAGE_KEYS)) {
      assert.ok(key in flat[locale], `${locale} has no string for ${code} (${key})`);
    }
  }
});

test('every audit issue has a recommendation in every locale', () => {
  const issues = Object.keys(flat.en).filter((key) => key.startsWith('audit.issue_'));
  assert.ok(issues.length > 5, `expected audit issue keys, found ${issues.length}`);

  for (const locale of LOCALES) {
    for (const key of issues) {
      const recommendation = key.replace('audit.issue_', 'audit.rec_');
      assert.ok(recommendation in flat[locale], `${locale} has no ${recommendation} for ${key}`);
    }
  }
});

test('no locale contains an empty string or a raw key as a value', () => {
  for (const locale of LOCALES) {
    for (const [key, value] of Object.entries(flat[locale])) {
      assert.equal(typeof value, 'string', `${locale}.${key} is not a string`);
      assert.ok(value.trim().length > 0, `${locale}.${key} is empty`);
      assert.ok(
        !/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/.test(value),
        `${locale}.${key} looks like a raw key instead of a translation: ${value}`
      );
    }
  }
});
