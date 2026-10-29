import test from 'node:test';
import assert from 'node:assert/strict';

import { arrayBufferToBase64, base64ToUint8Array, deriveKey, encryptData, uint8ArrayToBase64 } from '../src/lib/crypto-utils.ts';
import { createBaseline, createChangeEntry, emptyChangeLog } from '../src/lib/sync/changes.ts';
import { SyncError } from '../src/lib/sync/errors.ts';
import { openChangeLog, sealChangeLog } from '../src/lib/sync/seal.ts';
import type { AccountEntry, VaultEncryptedFile } from '../src/lib/types.ts';

const NOW = '2026-10-28T12:00:00.000Z';
const PASSWORD = 'correct horse battery staple';

function account(overrides: Partial<AccountEntry> = {}): AccountEntry {
  return {
    id: 'acc-1',
    sitio: 'github.com',
    usuario: 'octocat',
    password: 'old-password',
    notas: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deviceId: 'device-a',
    history: [],
    revision: 0,
    ...overrides,
  };
}

function sampleLog() {
  const baseline = createBaseline(emptyChangeLog('device-a', 'Windows'), [account({ revision: 2 })], NOW);
  const change = createChangeEntry({
    deviceId: 'device-a',
    seq: 2,
    type: 'update',
    before: account({ revision: 2 }),
    after: account({ revision: 2, password: 'new-password' }),
    createdAt: NOW,
  });

  return { ...baseline, entries: [change] };
}

function assertSyncError(fn: () => Promise<unknown>, code: string) {
  return assert.rejects(fn, (error: unknown) => error instanceof SyncError && error.code === code);
}

/** Builds a sealed envelope around arbitrary plaintext, bypassing validation. */
async function sealRaw(plaintext: string, password: string): Promise<VaultEncryptedFile> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt);
  const { ciphertext, iv } = await encryptData(plaintext, key);

  return {
    salt: uint8ArrayToBase64(salt),
    iv: uint8ArrayToBase64(iv),
    data: arrayBufferToBase64(ciphertext),
    vaultVersion: '1.0',
  };
}

test('sealing and opening round-trips the whole log', async () => {
  const log = sampleLog();

  const opened = await openChangeLog(await sealChangeLog(log, PASSWORD), PASSWORD);

  assert.deepEqual(opened, log);
});

test('the envelope never contains the plaintext', async () => {
  const sealed = await sealChangeLog(sampleLog(), PASSWORD);
  const raw = JSON.stringify(sealed);

  assert.equal(raw.includes('github.com'), false);
  assert.equal(raw.includes('new-password'), false);
});

test('two seals of the same log use different salts and ciphertexts', async () => {
  const log = sampleLog();

  const first = await sealChangeLog(log, PASSWORD);
  const second = await sealChangeLog(log, PASSWORD);

  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.data, second.data);
});

test('the envelope declares the sync format version', async () => {
  const sealed = await sealChangeLog(emptyChangeLog('device-a', 'Windows'), PASSWORD);

  assert.equal(sealed.vaultVersion, '1.0');
});

test('a wrong password fails authentication, not corruption', async () => {
  const sealed = await sealChangeLog(sampleLog(), PASSWORD);

  await assertSyncError(() => openChangeLog(sealed, 'wrong password'), 'sync_authentication_failed');
});

test('tampered ciphertext fails authentication', async () => {
  const sealed = await sealChangeLog(sampleLog(), PASSWORD);
  const bytes = base64ToUint8Array(sealed.data);
  bytes[0] ^= 0xff;

  const tampered: VaultEncryptedFile = { ...sealed, data: uint8ArrayToBase64(bytes) };

  await assertSyncError(() => openChangeLog(tampered, PASSWORD), 'sync_authentication_failed');
});

test('a tampered IV fails authentication', async () => {
  const sealed = await sealChangeLog(sampleLog(), PASSWORD);
  const iv = base64ToUint8Array(sealed.iv);
  iv[0] ^= 0xff;

  const tampered: VaultEncryptedFile = { ...sealed, iv: uint8ArrayToBase64(iv) };

  await assertSyncError(() => openChangeLog(tampered, PASSWORD), 'sync_authentication_failed');
});

test('authenticated but unsupported content is rejected, not trusted', async () => {
  const log = { ...emptyChangeLog('device-a', 'Windows'), syncVersion: '9.9' };
  const sealed = await sealRaw(JSON.stringify(log), PASSWORD);

  await assertSyncError(() => openChangeLog(sealed, PASSWORD), 'sync_unsupported_version');
});

test('authenticated but malformed content is reported as corrupted', async () => {
  const sealed = await sealRaw('{"syncVersion":"1.0"}', PASSWORD);

  await assertSyncError(() => openChangeLog(sealed, PASSWORD), 'sync_corrupted');
});
