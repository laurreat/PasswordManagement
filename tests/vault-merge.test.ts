import test from 'node:test';
import assert from 'node:assert/strict';

import {
  accountKey,
  applyConflictResolution,
  dedupeAccounts,
  mergeImportedVault,
} from '../src/lib/vault-merge.ts';
import type { AccountEntry, VaultDecrypted } from '../src/lib/types.ts';

function account(overrides: Partial<AccountEntry> = {}): AccountEntry {
  return {
    id: `id-${Math.random().toString(36).slice(2)}`,
    sitio: 'github.com',
    usuario: 'user@example.com',
    password: 'one',
    notas: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deviceId: 'device',
    history: [],
    ...overrides,
  };
}

function vault(overrides: Partial<VaultDecrypted> = {}): VaultDecrypted {
  return {
    vaultVersion: '1.0',
    deviceId: 'device',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    accounts: [],
    conflicts: [],
    ...overrides,
  };
}

test('account identity ignores case', () => {
  assert.equal(
    accountKey({ sitio: 'GitHub.com', usuario: 'User@Example.com' }),
    accountKey({ sitio: 'github.com', usuario: 'user@example.com' })
  );
});

test('dedupe keeps the newest entry when passwords match', () => {
  const older = account({ updatedAt: '2026-01-01T00:00:00.000Z' });
  const newer = account({ updatedAt: '2026-05-01T00:00:00.000Z' });

  const result = dedupeAccounts([older, newer], []);
  assert.equal(result.accounts.length, 1);
  assert.equal(result.accounts[0].updatedAt, newer.updatedAt);
  assert.equal(result.conflicts.length, 0);
});

test('dedupe records a single conflict when passwords differ', () => {
  const first = account({ password: 'one' });
  const second = account({ password: 'two', updatedAt: '2026-06-01T00:00:00.000Z' });

  const result = dedupeAccounts([first, second, second], []);
  assert.equal(result.accounts.length, 1);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].versionLocal.password, 'one');
  assert.equal(result.conflicts[0].versionImportada.password, 'two');
});

test('merge adds unknown accounts and flags divergent ones', () => {
  const local = vault({ accounts: [account({ password: 'local' })] });
  const imported = vault({
    accounts: [
      account({ password: 'imported' }),
      account({ sitio: 'gitlab.com', usuario: 'other', password: 'new' }),
    ],
  });

  const merged = mergeImportedVault(local, imported);
  assert.equal(merged.accounts.length, 2);
  assert.equal(merged.conflicts.length, 1);
  assert.equal(merged.accounts.find((entry) => entry.sitio === 'gitlab.com')?.password, 'new');
});

test('merge prefers the newer imported account when passwords match', () => {
  const local = vault({ accounts: [account({ password: 'same', updatedAt: '2026-01-01T00:00:00.000Z' })] });
  const imported = vault({ accounts: [account({ password: 'same', updatedAt: '2026-09-01T00:00:00.000Z', notas: 'newer' })] });

  const merged = mergeImportedVault(local, imported);
  assert.equal(merged.accounts.length, 1);
  assert.equal(merged.accounts[0].notas, 'newer');
  assert.equal(merged.conflicts.length, 0);
});

test('merge imports existing conflicts without duplicating identities', () => {
  const conflictAccount = account({ password: 'a' });
  const local = vault({
    accounts: [account({ password: 'a' })],
    conflicts: [
      {
        conflictId: 'c1',
        sitio: 'github.com',
        usuario: 'user@example.com',
        versionLocal: account({ password: 'a' }),
        versionImportada: account({ password: 'b' }),
        detectedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  });

  const imported = vault({
    conflicts: [
      {
        conflictId: 'c2',
        sitio: 'github.com',
        usuario: 'user@example.com',
        versionLocal: conflictAccount,
        versionImportada: account({ password: 'z' }),
        detectedAt: '2026-02-01T00:00:00.000Z',
      },
    ],
  });

  const merged = mergeImportedVault(local, imported);
  assert.equal(merged.conflicts.length, 1);
});

test('conflict resolution replaces the account in place and clears the conflict', () => {
  const local = account({ password: 'local' });
  const imported = account({ password: 'imported' });
  const source = vault({
    accounts: [account({ sitio: 'aaa.com', usuario: 'first' }), local],
    conflicts: [
      {
        conflictId: 'c1',
        sitio: local.sitio,
        usuario: local.usuario,
        versionLocal: local,
        versionImportada: imported,
        detectedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  });

  const resolved = applyConflictResolution(source, 'c1', 'imported');
  assert.equal(resolved.conflicts.length, 0);
  assert.equal(resolved.accounts.length, 2);
  assert.equal(resolved.accounts[1].password, 'imported');
  assert.equal(resolved.accounts[0].sitio, 'aaa.com');
  assert.equal(resolved.accounts[1].revision, 1);
});

test('conflict resolution grows the local revision by exactly one', () => {
  const local = account({ password: 'local', revision: 3 });
  const imported = account({ password: 'imported', revision: 5 });
  const source = vault({
    accounts: [local],
    conflicts: [
      {
        conflictId: 'c2',
        sitio: local.sitio,
        usuario: local.usuario,
        versionLocal: local,
        versionImportada: imported,
        detectedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  });

  const resolved = applyConflictResolution(source, 'c2', 'local');
  assert.equal(resolved.accounts[0].revision, 4);
  assert.equal(resolved.accounts[0].password, 'local');
});

test('conflict resolution ignores a higher imported revision', () => {
  const local = account({ password: 'local', revision: 1 });
  const imported = account({ password: 'imported', revision: 9 });
  const source = vault({
    accounts: [local],
    conflicts: [
      {
        conflictId: 'c3',
        sitio: local.sitio,
        usuario: local.usuario,
        versionLocal: local,
        versionImportada: imported,
        detectedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  });

  const resolved = applyConflictResolution(source, 'c3', 'imported');
  assert.equal(resolved.accounts[0].revision, 2);
  assert.equal(resolved.accounts[0].password, 'imported');
});

test('conflict resolution is a no-op for an unknown id', () => {
  const source = vault();
  assert.equal(applyConflictResolution(source, 'missing', 'local'), source);
});
