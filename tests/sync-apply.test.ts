import test from 'node:test';
import assert from 'node:assert/strict';

import { applyChange, applyChangeLog, baselineAccounts } from '../src/lib/sync/apply.ts';
import { createBaseline, createChangeEntry, emptyChangeLog } from '../src/lib/sync/changes.ts';
import type { ChangeEntry, ChangeLogFile } from '../src/lib/sync/types.ts';
import type { AccountEntry, VaultDecrypted } from '../src/lib/types.ts';

const NOW = '2026-10-28T12:00:00.000Z';

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
    revision: 3,
    ...overrides,
  };
}

function vault(overrides: Partial<VaultDecrypted> = {}): VaultDecrypted {
  return {
    vaultVersion: '1.0',
    deviceId: 'device-local',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    accounts: [],
    conflicts: [],
    ...overrides,
  };
}

function entry(
  type: ChangeEntry['type'],
  before: AccountEntry | null,
  after: AccountEntry | null,
  seq = 1,
  deviceId = 'device-a'
): ChangeEntry {
  return createChangeEntry({ deviceId, seq, type, before, after, createdAt: NOW });
}

function log(entries: ChangeEntry[], deviceId = 'device-a'): ChangeLogFile {
  return { ...emptyChangeLog(deviceId, 'Windows'), entries };
}

test('applies a create and stamps the first revision', () => {
  const change = entry('create', null, account({ revision: undefined }));
  const result = applyChange(vault(), change, NOW);

  assert.equal(result.outcome.kind, 'applied');
  assert.equal(result.vault.accounts.length, 1);
  assert.equal(result.vault.accounts[0].revision, 1);
  assert.equal(result.vault.accounts[0].password, 'old-password');
});

test('a create over an existing account becomes a conflict', () => {
  const change = entry('create', null, account());
  const result = applyChange(vault({ accounts: [account({ revision: 1 })] }), change, NOW);

  assert.equal(result.outcome.kind, 'conflict');
  assert.equal(result.outcome.reason, 'account_exists');
  assert.equal(result.vault.conflicts.length, 1);
  assert.equal(result.vault.conflicts[0].conflictId, `sync:${change.changeId}`);
  assert.equal(result.vault.accounts[0].password, 'old-password');
});

test('applies an update when the base revision matches', () => {
  const current = account({ revision: 3 });
  const change = entry('update', current, account({ revision: 3, password: 'new-password' }));
  const result = applyChange(vault({ accounts: [current] }), change, NOW);

  assert.equal(result.outcome.kind, 'applied');
  assert.equal(result.vault.accounts[0].password, 'new-password');
  assert.equal(result.vault.accounts[0].revision, 4);
});

test('a stale base revision becomes a conflict and keeps the local value', () => {
  const current = account({ revision: 5, password: 'local-password' });
  const change = entry('update', account({ revision: 3 }), account({ revision: 3, password: 'remote-password' }));
  const result = applyChange(vault({ accounts: [current] }), change, NOW);

  assert.equal(result.outcome.kind, 'conflict');
  assert.equal(result.outcome.reason, 'revision_mismatch');
  assert.equal(result.vault.accounts[0].password, 'local-password');
  assert.equal(result.vault.accounts[0].revision, 5);
  assert.equal(result.vault.conflicts[0].versionImportada.password, 'remote-password');
});

test('the same conflict is never recorded twice', () => {
  const current = account({ revision: 5 });
  const change = entry('update', account({ revision: 3 }), account({ revision: 3, password: 'other' }));

  const first = applyChange(vault({ accounts: [current] }), change, NOW);
  const second = applyChange(first.vault, change, NOW);

  assert.equal(second.vault.conflicts.length, 1);
});

test('applies a delete when the base revision matches', () => {
  const current = account({ revision: 3 });
  const change = entry('delete', current, null);
  const result = applyChange(vault({ accounts: [current] }), change, NOW);

  assert.equal(result.outcome.kind, 'applied');
  assert.equal(result.vault.accounts.length, 0);
});

test('a delete of an unknown account is a no-op', () => {
  const change = entry('delete', account(), null);
  const result = applyChange(vault(), change, NOW);

  assert.equal(result.outcome.kind, 'skipped');
  assert.equal(result.outcome.reason, 'already_applied');
});

test('an update over a locally deleted account is dropped', () => {
  const change = entry('update', account({ revision: 1 }), account({ revision: 1, password: 'new' }));
  const result = applyChange(vault(), change, NOW);

  assert.equal(result.outcome.kind, 'skipped');
  assert.equal(result.outcome.reason, 'missing_account');
  assert.equal(result.vault.accounts.length, 0);
});

test('applyChangeLog processes entries in seq order', () => {
  const first = entry('update', account({ revision: 1, password: 'a' }), account({ revision: 1, password: 'b' }), 1);
  const second = entry('update', account({ revision: 2, password: 'b' }), account({ revision: 2, password: 'c' }), 2);

  const result = applyChangeLog(vault({ accounts: [account({ revision: 1, password: 'a' })] }), log([second, first]), NOW);

  assert.equal(result.vault.accounts[0].password, 'c');
  assert.equal(result.vault.accounts[0].revision, 3);
  assert.deepEqual(result.outcomes.map((outcome) => outcome.kind), ['applied', 'applied']);
});

test('the cursor makes a second pass a no-op', () => {
  const change = entry('create', null, account({ revision: undefined }));
  const first = applyChangeLog(vault(), log([change]), NOW);
  const second = applyChangeLog(first.vault, log([change]), NOW);

  assert.equal(first.vault.accounts.length, 1);
  assert.equal(second.outcomes[0].kind, 'skipped');
  assert.equal(second.outcomes[0].reason, 'already_applied');
  assert.equal(second.vault.accounts.length, 1);
  assert.equal(second.vault.sync?.appliedSeq['device-a'], 1);
});

test('entries from the local device are ignored', () => {
  const change = entry('create', null, account(), 1, 'device-local');
  const result = applyChangeLog(vault(), log([change], 'device-local'), NOW);

  assert.equal(result.outcomes[0].reason, 'own_device');
  assert.equal(result.vault.accounts.length, 0);
});

test('applyChangeLog keeps the local device name', () => {
  const withName = vault({ sync: { deviceName: 'Windows', appliedSeq: {} } });
  const change = entry('create', null, account());

  const result = applyChangeLog(withName, log([change]), NOW);

  assert.equal(result.vault.sync?.deviceName, 'Windows');
  assert.equal(result.vault.sync?.appliedSeq['device-a'], 1);
});

test('baselineAccounts exposes the snapshot for a fresh device', () => {
  const built = createBaseline(emptyChangeLog('device-a', 'Windows'), [account()], NOW);

  const accounts = baselineAccounts(built);

  assert.ok(accounts);
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].sitio, 'github.com');
  assert.equal(accounts[0].revision, 3);
});

test('a log without baseline returns null', () => {
  assert.equal(baselineAccounts(emptyChangeLog('device-a', 'Windows')), null);
});

test('applyChangeLog records applied remote changes in the vault history', () => {
  const change = entry('create', null, account({ revision: undefined }));

  const first = applyChangeLog(vault(), log([change]), NOW);
  const second = applyChangeLog(first.vault, log([change]), NOW);

  assert.equal(first.vault.history?.length, 1);
  assert.equal(first.vault.history?.[0].source, 'remote');
  assert.equal(first.vault.history?.[0].changeId, change.changeId);
  assert.deepEqual(first.vault.history?.[0].changedFields, ['created']);
  assert.equal(first.vault.history?.[0].deviceName, 'Windows');
  assert.equal(second.vault.history?.length, 1);
});
