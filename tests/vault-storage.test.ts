import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildExportPackage,
  decryptVaultFile,
  emptyVault,
  encryptVault,
  parseVaultEnvelope,
  VAULT_FORMAT_VERSION,
} from '../src/lib/vault-storage.ts';
import { VaultError } from '../src/lib/vault-errors.ts';
import type { VaultDecrypted } from '../src/lib/types.ts';

const PASSWORD = 'correct horse battery staple';

function vaultWithAccount(overrides: Partial<VaultDecrypted> = {}): VaultDecrypted {
  const base = emptyVault();
  return {
    ...base,
    accounts: [
      {
        id: 'acc-1',
        sitio: 'github.com',
        usuario: 'user@example.com',
        password: 'S3cure-Passphrase!',
        notas: '',
        createdAt: base.createdAt,
        updatedAt: base.updatedAt,
        deviceId: base.deviceId,
        history: [],
      },
    ],
    ...overrides,
  };
}

async function expectVaultCode(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof VaultError, 'expected a VaultError');
    assert.equal(error.code, code);
    return true;
  });
}

test('round-trips a vault through encrypt and decrypt', async () => {
  const vault = vaultWithAccount();
  const envelope = await encryptVault(vault, PASSWORD);
  const decrypted = await decryptVaultFile(envelope, PASSWORD, 'stored');

  assert.deepEqual(decrypted, vault);
});

test('fails authentication with the wrong password', async () => {
  const envelope = await encryptVault(vaultWithAccount(), PASSWORD);
  await expectVaultCode(decryptVaultFile(envelope, 'wrong password', 'stored'), 'vault_authentication_failed');
});

test('fails authentication when the ciphertext is tampered with', async () => {
  const envelope = await encryptVault(vaultWithAccount(), PASSWORD);
  const bytes = Buffer.from(envelope.data, 'base64');
  bytes[0] ^= 0xff;
  const tampered = { ...envelope, data: bytes.toString('base64') };

  await expectVaultCode(decryptVaultFile(tampered, PASSWORD, 'stored'), 'vault_authentication_failed');
});

test('rejects malformed envelopes with the right source code', () => {
  assert.throws(() => parseVaultEnvelope('not json', 'stored'), (error: unknown) => (error as VaultError).code === 'vault_corrupted');
  assert.throws(() => parseVaultEnvelope('{"salt":""}', 'backup'), (error: unknown) => (error as VaultError).code === 'backup_corrupted');
  assert.throws(() => parseVaultEnvelope('', 'stored'), (error: unknown) => (error as VaultError).code === 'vault_corrupted');
});

test('rejects an unsupported format version', () => {
  const envelope = JSON.stringify({
    salt: 's',
    iv: 'i',
    data: 'd',
    vaultVersion: '2.0',
  });

  assert.throws(
    () => parseVaultEnvelope(envelope, 'stored'),
    (error: unknown) => (error as VaultError).code === 'vault_unsupported_version'
  );
});

test('accepts an export package and a bare envelope', async () => {
  const vault = vaultWithAccount();
  const envelope = await encryptVault(vault, PASSWORD);
  const pkg = buildExportPackage(vault, envelope);

  const fromPackage = parseVaultEnvelope(JSON.stringify(pkg), 'backup');
  const fromBare = parseVaultEnvelope(JSON.stringify(envelope), 'backup');

  assert.deepEqual(fromPackage, fromBare);
  assert.equal((await decryptVaultFile(fromPackage, PASSWORD, 'backup')).accounts.length, 1);
});

test('tolerates a BOM and surrounding whitespace', async () => {
  const envelope = await encryptVault(vaultWithAccount(), PASSWORD);
  const parsed = parseVaultEnvelope(`\uFEFF\n ${JSON.stringify(envelope)}\n`, 'backup');
  assert.equal(parsed.vaultVersion, VAULT_FORMAT_VERSION);
});

test('rejects a decrypted vault with an invalid shape', async () => {
  const broken = { ...emptyVault(), accounts: [{ id: 'x' }] } as unknown as VaultDecrypted;
  const envelope = await encryptVault(broken, PASSWORD);

  await expectVaultCode(decryptVaultFile(envelope, PASSWORD, 'stored'), 'vault_corrupted');
});
