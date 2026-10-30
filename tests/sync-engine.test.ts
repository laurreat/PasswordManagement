import test from 'node:test';
import assert from 'node:assert/strict';

import { createChangeEntry, emptyChangeLog } from '../src/lib/sync/changes.ts';
import {
  adoptBaseline,
  commitDraft,
  enableSync,
  needsBaseline,
  publishAppliedChange,
  pullChanges,
  stageChange,
} from '../src/lib/sync/engine.ts';
import { createDraft } from '../src/lib/drafts.ts';
import { SyncError } from '../src/lib/sync/errors.ts';
import type { ChangeLogFile } from '../src/lib/sync/types.ts';
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
    accounts: [],
    conflicts: [],
    ...overrides,
  };
}

function log(entries: ChangeLogFile['entries'] = [], deviceId = 'device-a'): ChangeLogFile {
  return { ...emptyChangeLog(deviceId, 'Windows'), entries };
}

function assertSyncError(fn: () => unknown, code: string): void {
  assert.throws(fn, (error: unknown) => error instanceof SyncError && error.code === code);
}

test('staging a create applies it locally and appends the change', () => {
  const result = stageChange(log(), vault(), {
    type: 'create',
    before: null,
    after: account({ revision: 0 }),
    createdAt: NOW,
  });

  assert.equal(result.vault.accounts.length, 1);
  assert.equal(result.vault.accounts[0].revision, 1);
  assert.equal(result.log.entries.length, 1);
  assert.equal(result.entry.seq, 1);
  assert.equal(result.entry.baseRevision, 0);
  assert.equal(result.entry.after?.revision, 1);
});

test('staging an update bumps the revision and records the base', () => {
  const before = account({ revision: 4 });
  const result = stageChange(log(), vault({ accounts: [before] }), {
    type: 'update',
    before,
    after: account({ revision: 4, password: 'new-password' }),
    createdAt: NOW,
  });

  assert.equal(result.entry.baseRevision, 4);
  assert.equal(result.vault.accounts[0].revision, 5);
  assert.equal(result.vault.accounts[0].password, 'new-password');
});

test('a stale update is rejected instead of overwritten', () => {
  const current = account({ revision: 5 });

  assertSyncError(
    () =>
      stageChange(log(), vault({ accounts: [current] }), {
        type: 'update',
        before: account({ revision: 3 }),
        after: account({ revision: 3, password: 'closed-tab' }),
      }),
    'sync_invalid_change'
  );
});

test('creating an account that already exists is rejected', () => {
  assertSyncError(
    () =>
      stageChange(log(), vault({ accounts: [account()] }), {
        type: 'create',
        before: null,
        after: account({ revision: 0 }),
      }),
    'sync_invalid_change'
  );
});

test('staging a delete removes the account locally', () => {
  const current = account({ revision: 2 });
  const result = stageChange(log(), vault({ accounts: [current] }), {
    type: 'delete',
    before: current,
    after: null,
    createdAt: NOW,
  });

  assert.equal(result.vault.accounts.length, 0);
  assert.equal(result.entry.baseRevision, 2);
  assert.equal(result.entry.after, null);
});

test('the engine refuses a log that belongs to another device', () => {
  assertSyncError(
    () =>
      stageChange(log([], 'device-b'), vault(), {
        type: 'create',
        before: null,
        after: account({ revision: 0 }),
      }),
    'sync_invalid_change'
  );
});

test('enabling sync writes a baseline and adopts the device name', () => {
  const result = enableSync(log(), vault({ accounts: [account()] }), NOW);

  assert.ok(result.log.baseline);
  assert.equal(result.log.baseline.seq, 1);
  assert.equal(result.log.baseline.accounts.length, 1);
  assert.equal(result.vault.sync?.deviceName, 'Windows');
});

test('enabling sync twice keeps the first baseline', () => {
  const first = enableSync(log(), vault({ accounts: [account()] }), NOW);
  const second = enableSync(first.log, vault({ accounts: [account({ id: 'acc-2' })] }), NOW);

  assert.equal(second.log.baseline?.seq, 1);
  assert.equal(second.log.baseline?.accounts.length, 1);
  assert.equal(second.log.baseline?.accounts[0].id, 'acc-1');
});

test('enabling sync preserves the applied cursors', () => {
  const withCursor = vault({ sync: { deviceName: 'Old', appliedSeq: { 'device-b': 7 } } });

  const result = enableSync(log(), withCursor, NOW);

  assert.deepEqual(result.vault.sync?.appliedSeq, { 'device-b': 7 });
  assert.equal(result.vault.sync?.deviceName, 'Windows');
});

test('pulling applies a peer log and ignores our own entries', () => {
  const own = emptyChangeLog('device-a', 'Windows');
  const ownEntry = createChangeEntry({
    deviceId: 'device-a',
    seq: 1,
    type: 'create',
    before: null,
    after: account({ id: 'own', revision: 0 }),
    createdAt: NOW,
  });
  const peerEntry = createChangeEntry({
    deviceId: 'device-b',
    seq: 1,
    type: 'create',
    before: null,
    after: account({ id: 'peer', revision: 0 }),
    createdAt: NOW,
  });

  const result = pullChanges(
    vault(),
    [
      { ...own, entries: [ownEntry] },
      { ...emptyChangeLog('device-b', 'Android'), entries: [peerEntry] },
    ],
    NOW
  );

  assert.deepEqual(result.vault.accounts.map((entry) => entry.id), ['peer']);
  assert.equal(result.outcomes[0].reason, 'own_device');
  assert.equal(result.outcomes[1].kind, 'applied');
});

test('two peers editing the same account resolve to one apply and one conflict', () => {
  const base = account({ revision: 1 });
  const peerA = createChangeEntry({
    deviceId: 'device-a',
    seq: 1,
    type: 'update',
    before: base,
    after: account({ revision: 1, password: 'from-a' }),
    createdAt: NOW,
  });
  const peerB = createChangeEntry({
    deviceId: 'device-b',
    seq: 1,
    type: 'update',
    before: base,
    after: account({ revision: 1, password: 'from-b' }),
    createdAt: NOW,
  });

  const result = pullChanges(
    vault({ deviceId: 'device-local', accounts: [base] }),
    [
      { ...emptyChangeLog('device-a', 'Windows'), entries: [peerA] },
      { ...emptyChangeLog('device-b', 'Android'), entries: [peerB] },
    ],
    NOW
  );

  assert.deepEqual(result.outcomes.map((outcome) => outcome.kind), ['applied', 'conflict']);
  assert.equal(result.vault.conflicts.length, 1);
  assert.equal(result.vault.accounts[0].password, 'from-a');
});

test('pulling the same logs twice does not apply anything again', () => {
  const entry = createChangeEntry({
    deviceId: 'device-b',
    seq: 3,
    type: 'create',
    before: null,
    after: account({ revision: 0 }),
    createdAt: NOW,
  });
  const peerLog = { ...emptyChangeLog('device-b', 'Android'), entries: [entry] };

  const first = pullChanges(vault(), [peerLog], NOW);
  const second = pullChanges(first.vault, [peerLog], NOW);

  assert.equal(second.outcomes[0].reason, 'already_applied');
  assert.equal(second.vault.accounts.length, 1);
});

test('a fresh device is seeded from a peer baseline', () => {
  const peer = enableSync(
    emptyChangeLog('device-b', 'Android'),
    vault({ deviceId: 'device-b', accounts: [account({ revision: 2 })] }),
    NOW
  ).log;

  const adopted = adoptBaseline(vault({ deviceId: 'device-new' }), peer, NOW);

  assert.ok(adopted);
  assert.equal(adopted.accounts.length, 1);
  assert.equal(adopted.accounts[0].revision, 2);
  assert.deepEqual(adopted.sync?.appliedSeq, { 'device-b': 1 });
});

test('a network with accounts is not overwritten by a baseline', () => {
  const peer = enableSync(
    emptyChangeLog('device-b', 'Android'),
    vault({ deviceId: 'device-b', accounts: [account()] }),
    NOW
  ).log;

  assert.equal(adoptBaseline(vault({ accounts: [account()] }), peer, NOW), null);
});

test('a device never adopts its own baseline', () => {
  const own = enableSync(
    emptyChangeLog('device-a', 'Windows'),
    vault({ accounts: [account()] }),
    NOW
  ).log;

  assert.equal(adoptBaseline(vault(), own, NOW), null);
});

test('a log without a baseline seeds nothing', () => {
  assert.equal(adoptBaseline(vault(), log(), NOW), null);
});

test('after adopting a baseline only newer entries are applied', () => {
  const peerVault = vault({ deviceId: 'device-b', accounts: [account({ revision: 2 })] });
  const enabled = enableSync(emptyChangeLog('device-b', 'Android'), peerVault, NOW);

  const update = stageChange(enabled.log, enabled.vault, {
    type: 'update',
    before: peerVault.accounts[0],
    after: account({ revision: 2, password: 'rotated' }),
    createdAt: NOW,
  });

  const adopted = adoptBaseline(vault({ deviceId: 'device-new' }), update.log, NOW);
  assert.ok(adopted);

  const pulled = pullChanges(adopted, [update.log], NOW);

  assert.equal(pulled.vault.accounts[0].password, 'rotated');
  assert.equal(pulled.vault.accounts[0].revision, 3);
  assert.deepEqual(pulled.outcomes.map((outcome) => outcome.kind), ['applied']);
});

test('needsBaseline is true only for an untouched vault', () => {
  assert.equal(needsBaseline(vault()), true);
  assert.equal(needsBaseline(vault({ accounts: [account()] })), false);
  assert.equal(needsBaseline(vault({ sync: { deviceName: 'X', appliedSeq: { 'device-b': 2 } } })), false);
});

test('committing a draft twice after a failed vault save keeps one entry', () => {
  const draft = createDraft({
    type: 'create',
    before: null,
    after: account({ id: 'draft-1', revision: 0 }),
  });
  const baseVault = vault({ drafts: [draft] });

  const first = commitDraft(log(), baseVault, draft);
  assert.equal(first.log.entries.length, 1);
  assert.equal(first.entry.changeId, draft.draftId);
  assert.equal(first.vault.accounts.length, 1);
  assert.deepEqual(first.vault.drafts, []);

  // The log write succeeded but the vault save failed: the retry starts from
  // the original vault and the log that already holds the entry.
  const retried = commitDraft(first.log, baseVault, draft);

  assert.equal(retried.log.entries.length, 1);
  assert.equal(retried.log.entries[0].changeId, draft.draftId);
  assert.equal(retried.entry.changeId, draft.draftId);
  assert.equal(retried.vault.accounts.length, 1);
  assert.equal(retried.vault.accounts[0].revision, 1);
  assert.deepEqual(retried.vault.drafts, []);
});

test('publishAppliedChange appends one entry for a valid update', () => {
  const before = account({ revision: 2 });
  const after = account({ revision: 3, password: 'rotated' });

  const result = publishAppliedChange(log(), { type: 'update', before, after });

  assert.equal(result.log.entries.length, 1);
  assert.equal(result.entry.seq, 1);
  assert.equal(result.entry.type, 'update');
  assert.equal(result.entry.baseRevision, 2);
  assert.equal(result.entry.after?.revision, 3);
  assert.deepEqual(result.entry.changedFields, ['password']);
});

test('publishAppliedChange rejects an update that skipped a revision', () => {
  assertSyncError(
    () =>
      publishAppliedChange(log(), {
        type: 'update',
        before: account({ revision: 2 }),
        after: account({ revision: 4, password: 'rotated' }),
      }),
    'sync_invalid_change'
  );
});

test('publishAppliedChange rejects a no-op update', () => {
  assertSyncError(
    () =>
      publishAppliedChange(log(), {
        type: 'update',
        before: account({ revision: 2 }),
        after: account({ revision: 3 }),
      }),
    'sync_invalid_change'
  );
});

test('publishAppliedChange accepts a revision-only resolution when allowed', () => {
  const result = publishAppliedChange(log(), {
    type: 'update',
    before: account({ revision: 2 }),
    after: account({ revision: 3 }),
    allowEmptyDiff: true,
  });

  assert.equal(result.log.entries.length, 1);
  assert.deepEqual(result.entry.changedFields, []);
  assert.equal(result.entry.after?.revision, 3);
});
