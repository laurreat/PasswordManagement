import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import storage from '../electron/storage.js';

function tempDir(t: TestContext): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'localpass-storage-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function assertStorageError(fn: () => unknown, code: string): void {
  assert.throws(fn, (error: unknown) => (error as { code?: string }).code === code);
}

test('writeFileAtomic creates the directory and writes UTF-8 content', (t) => {
  const dir = tempDir(t);
  const target = path.join(dir, 'nested', 'vault.enc.json');

  storage.writeFileAtomic(target, '{"hola":"ñandú"}');

  assert.equal(fs.readFileSync(target, 'utf8'), '{"hola":"ñandú"}');
});

test('writeFileAtomic replaces an existing file', (t) => {
  const dir = tempDir(t);
  const target = path.join(dir, 'vault.enc.json');

  storage.writeFileAtomic(target, 'first');
  storage.writeFileAtomic(target, 'second');

  assert.equal(fs.readFileSync(target, 'utf8'), 'second');
});

test('writeFileAtomic leaves no temporary file behind', (t) => {
  const dir = tempDir(t);
  const target = path.join(dir, 'vault.enc.json');

  storage.writeFileAtomic(target, 'payload');

  assert.deepEqual(fs.readdirSync(dir), ['vault.enc.json']);
});

test('readFileIfExists returns null instead of throwing for a missing file', (t) => {
  const dir = tempDir(t);

  assert.equal(storage.readFileIfExists(path.join(dir, 'nope.json')), null);
});

test('readFileIfExists returns the stored bytes', (t) => {
  const dir = tempDir(t);
  const target = path.join(dir, 'vault.enc.json');
  fs.writeFileSync(target, '{"a":1}', 'utf8');

  assert.equal(storage.readFileIfExists(target), '{"a":1}');
});

test('assertPayload rejects anything that is not a JSON object', () => {
  assertStorageError(() => storage.assertPayload(42), 'invalid_argument');
  assertStorageError(() => storage.assertPayload('not json'), 'invalid_argument');
  assertStorageError(() => storage.assertPayload('[1,2,3]'), 'invalid_argument');
  assertStorageError(() => storage.assertPayload('null'), 'invalid_argument');
  assertStorageError(() => storage.assertPayload('"text"'), 'invalid_argument');
});

test('assertPayload rejects an oversized payload before parsing it', () => {
  const huge = 'a'.repeat(storage.MAX_STORED_BYTES + 1);

  assertStorageError(() => storage.assertPayload(huge), 'payload_too_large');
});

test('assertPayload accepts a serialized envelope', () => {
  const payload = JSON.stringify({ salt: 'x', iv: 'y', data: 'z', vaultVersion: '1.0' });

  assert.equal(storage.assertPayload(payload), payload);
});

test('syncLogPath builds the documented file name', () => {
  const result = storage.syncLogPath('/sync', 'a1b2-c3');

  assert.equal(path.basename(result), 'changes-a1b2-c3.enc.json');
});

test('syncLogPath refuses a device id that could escape the folder', () => {
  assertStorageError(() => storage.syncLogPath('/sync', '../../etc/passwd'), 'invalid_argument');
  assertStorageError(() => storage.syncLogPath('/sync', 'a/b'), 'invalid_argument');
  assertStorageError(() => storage.syncLogPath('/sync', ''), 'invalid_argument');
  assertStorageError(() => storage.syncLogPath('/sync', 'x'.repeat(65)), 'invalid_argument');
});

test('listChangeLogs returns only well-formed change logs', (t) => {
  const dir = tempDir(t);
  fs.writeFileSync(path.join(dir, 'changes-device-a.enc.json'), '{}');
  fs.writeFileSync(path.join(dir, 'changes-device-b.enc.json'), '{}');
  fs.writeFileSync(path.join(dir, 'vault.enc.json'), '{}');
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'x');

  const logs = storage.listChangeLogs(dir)
    .map((entry: { deviceId: string }) => entry.deviceId)
    .sort();

  assert.deepEqual(logs, ['device-a', 'device-b']);
});

test('listChangeLogs treats a missing sync folder as empty', (t) => {
  const dir = tempDir(t);

  assert.deepEqual(storage.listChangeLogs(path.join(dir, 'never-created')), []);
});

test('readSettings defaults when the file does not exist', (t) => {
  assert.deepEqual(storage.readSettings(tempDir(t)), { syncFolder: null });
});

test('readSettings reads the stored folder', (t) => {
  const dir = tempDir(t);
  storage.writeSettings(dir, { syncFolder: 'C:\\Sync' });

  assert.deepEqual(storage.readSettings(dir), { syncFolder: 'C:\\Sync' });
});

test('readSettings falls back instead of failing on a corrupt file', (t) => {
  const dir = tempDir(t);
  fs.writeFileSync(path.join(dir, 'settings.json'), '{ not json', 'utf8');

  assert.deepEqual(storage.readSettings(dir), { syncFolder: null });
});

test('writeSettings never persists unexpected fields', (t) => {
  const dir = tempDir(t);
  storage.writeSettings(dir, { syncFolder: '/sync', token: 'secret' });

  const parsed = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));

  assert.deepEqual(parsed, { syncFolder: '/sync' });
});
