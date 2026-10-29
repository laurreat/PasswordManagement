import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_DEVICE_NAME,
  deviceNameOf,
  normalizeDeviceName,
  suggestDeviceName,
  withDeviceName,
} from '../src/lib/sync/device.ts';
import type { AccountEntry, VaultDecrypted } from '../src/lib/types.ts';

function account(overrides: Partial<AccountEntry> = {}): AccountEntry {
  return {
    id: 'acc-1',
    sitio: 'github.com',
    usuario: 'octocat',
    password: 'secret',
    notas: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deviceId: 'device-a',
    history: [],
    revision: 1,
    ...overrides,
  };
}

function vault(overrides: Partial<VaultDecrypted> = {}): VaultDecrypted {
  return {
    vaultVersion: '1.0',
    deviceId: 'device-a',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    accounts: [account()],
    conflicts: [],
    ...overrides,
  };
}

test('normalizeDeviceName trims and collapses whitespace', () => {
  assert.equal(normalizeDeviceName('   Windows   11  '), 'Windows 11');
  assert.equal(normalizeDeviceName('\tAndroid\n'), 'Android');
});

test('normalizeDeviceName caps the length', () => {
  const long = 'x'.repeat(MAX_DEVICE_NAME + 25);

  assert.equal(normalizeDeviceName(long).length, MAX_DEVICE_NAME);
});

test('normalizeDeviceName keeps an empty name empty', () => {
  assert.equal(normalizeDeviceName('   '), '');
});

test('suggestDeviceName recognises the supported platforms', () => {
  assert.equal(suggestDeviceName('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'Windows');
  assert.equal(suggestDeviceName('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)'), 'macOS');
  assert.equal(suggestDeviceName('Mozilla/5.0 (X11; Linux x86_64)'), 'Linux');
});

test('suggestDeviceName prefers Android over the Linux token it also carries', () => {
  const ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36';

  assert.equal(suggestDeviceName(ua), 'Android');
});

test('suggestDeviceName falls back to a generic label', () => {
  assert.equal(suggestDeviceName('something unknown'), 'Device');
  assert.equal(suggestDeviceName(''), 'Device');
});

test('deviceNameOf returns an empty string before the name is set', () => {
  assert.equal(deviceNameOf(vault()), '');
  assert.equal(deviceNameOf(vault({ sync: { deviceName: 'Windows', appliedSeq: {} } })), 'Windows');
});

test('withDeviceName stores a normalized name', () => {
  const updated = withDeviceName(vault(), '  Windows   11 ');

  assert.equal(updated.sync?.deviceName, 'Windows 11');
  assert.equal(deviceNameOf(updated), 'Windows 11');
});

test('withDeviceName keeps the applied cursors', () => {
  const original = vault({ sync: { deviceName: 'Old', appliedSeq: { 'device-b': 4, 'device-c': 9 } } });

  const updated = withDeviceName(original, 'Android');

  assert.deepEqual(updated.sync?.appliedSeq, { 'device-b': 4, 'device-c': 9 });
});

test('withDeviceName falls back when the name is blank', () => {
  assert.equal(withDeviceName(vault(), '   ').sync?.deviceName, 'Device');
});

test('withDeviceName does not mutate the input vault', () => {
  const original = vault();
  const updated = withDeviceName(original, 'Linux');

  assert.equal(original.sync, undefined);
  assert.notEqual(updated, original);
});

test('withDeviceName keeps the rest of the vault untouched', () => {
  const original = vault();
  const updated = withDeviceName(original, 'Linux');

  assert.equal(updated.deviceId, original.deviceId);
  assert.deepEqual(updated.accounts, original.accounts);
});
