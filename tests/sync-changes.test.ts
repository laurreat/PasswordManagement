import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendEntry,
  createBaseline,
  createChangeEntry,
  diffFields,
  emptyChangeLog,
  fromSnapshot,
  nextSeq,
  parseChangeLog,
  serializeChangeLog,
  toSnapshot,
} from '../src/lib/sync/changes.ts';
import { SyncError } from '../src/lib/sync/errors.ts';
import type { AccountEntry } from '../src/lib/types.ts';

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

function assertSyncError(fn: () => unknown, code: string): void {
  assert.throws(fn, (error: unknown) => error instanceof SyncError && error.code === code);
}

test('toSnapshot defaults a missing revision to 0', () => {
  const snapshot = toSnapshot(account({ revision: undefined }));

  assert.equal(snapshot.revision, 0);
  assert.equal(snapshot.password, 'old-password');
});

test('fromSnapshot restores an account without losing history', () => {
  const original = account({ history: [{ password: 'older', updatedAt: NOW }] });
  const restored = fromSnapshot(toSnapshot(original));

  assert.deepEqual(restored, original);
});

test('create starts at revision 1 and records the creation', () => {
  const entry = createChangeEntry({
    deviceId: 'device-a',
    seq: 1,
    type: 'create',
    before: null,
    after: account({ revision: undefined }),
    createdAt: NOW,
  });

  assert.equal(entry.baseRevision, 0);
  assert.equal(entry.after?.revision, 1);
  assert.equal(entry.before, null);
  assert.deepEqual(entry.changedFields, ['created']);
  assert.equal(entry.accountKey, 'github.com|octocat');
  assert.equal(entry.after?.updatedAt, NOW);
});

test('update uses the current revision and bumps it', () => {
  const before = account({ revision: 3 });
  const after = account({ revision: 3, password: 'new-password' });

  const entry = createChangeEntry({
    deviceId: 'device-a',
    seq: 4,
    type: 'update',
    before,
    after,
    createdAt: NOW,
  });

  assert.equal(entry.baseRevision, 3);
  assert.equal(entry.after?.revision, 4);
  assert.deepEqual(entry.changedFields, ['password']);
});

test('delete keeps the last snapshot and no after', () => {
  const entry = createChangeEntry({
    deviceId: 'device-a',
    seq: 5,
    type: 'delete',
    before: account({ revision: 4 }),
    after: null,
    createdAt: NOW,
  });

  assert.equal(entry.baseRevision, 4);
  assert.equal(entry.after, null);
  assert.deepEqual(entry.changedFields, ['deleted']);
});

test('rejects a change whose shape contradicts its type', () => {
  assertSyncError(
    () =>
      createChangeEntry({
        deviceId: 'device-a',
        seq: 1,
        type: 'create',
        before: account(),
        after: account(),
      }),
    'sync_invalid_change'
  );
});

test('rejects an update that changes nothing', () => {
  assertSyncError(
    () =>
      createChangeEntry({
        deviceId: 'device-a',
        seq: 2,
        type: 'update',
        before: account(),
        after: account(),
      }),
    'sync_invalid_change'
  );
});

test('rejects a change that moves the account identity', () => {
  assertSyncError(
    () =>
      createChangeEntry({
        deviceId: 'device-a',
        seq: 2,
        type: 'update',
        before: account({ sitio: 'github.com' }),
        after: account({ sitio: 'gitlab.com' }),
      }),
    'sync_invalid_change'
  );
});

test('diffFields reports every tracked field that changed', () => {
  const before = account();
  const after = account({ password: 'new', notas: 'rotated', usuario: 'other' });

  assert.deepEqual(diffFields(before, after), ['usuario', 'password', 'notas']);
});

test('nextSeq follows the baseline and the last entry', () => {
  const log = emptyChangeLog('device-a', 'Windows');
  assert.equal(nextSeq(log), 1);

  const withBaseline = createBaseline(log, [account()], NOW);
  assert.equal(nextSeq(withBaseline), 2);
});

test('createBaseline snapshots every account', () => {
  const log = createBaseline(emptyChangeLog('device-a', 'Windows'), [account()], NOW);

  assert.ok(log.baseline);
  assert.equal(log.baseline.seq, 1);
  assert.equal(log.baseline.accounts[0].sitio, 'github.com');
  assert.equal(log.baseline.accounts[0].revision, 3);
});

test('appendEntry rejects duplicate seq and foreign devices', () => {
  const log = emptyChangeLog('device-a', 'Windows');
  const entry = createChangeEntry({
    deviceId: 'device-a',
    seq: 1,
    type: 'create',
    before: null,
    after: account(),
    createdAt: NOW,
  });

  const withEntry = appendEntry(log, entry);
  assert.equal(withEntry.entries.length, 1);

  assertSyncError(() => appendEntry(withEntry, lightChange(entry, { seq: 1 })), 'sync_invalid_change');
  assertSyncError(() => appendEntry(log, lightChange(entry, { deviceId: 'device-b' })), 'sync_invalid_change');
});

function lightChange(base: ReturnType<typeof createChangeEntry>, overrides: Record<string, unknown>) {
  return { ...base, ...overrides } as ReturnType<typeof createChangeEntry>;
}

test('serializes and parses a log without loss', () => {
  const log = createBaseline(emptyChangeLog('device-a', 'Windows'), [account()], NOW);

  const parsed = parseChangeLog(serializeChangeLog(log));

  assert.deepEqual(parsed, log);
});

test('parse rejects an unsupported version', () => {
  const log = emptyChangeLog('device-a', 'Windows');
  const raw = JSON.stringify({ ...log, syncVersion: '9.9' });

  assertSyncError(() => parseChangeLog(raw), 'sync_unsupported_version');
});

test('parse rejects entries published under another device', () => {
  const log = emptyChangeLog('device-a', 'Windows');
  const entry = createChangeEntry({
    deviceId: 'device-b',
    seq: 1,
    type: 'create',
    before: null,
    after: account(),
    createdAt: NOW,
  });

  assertSyncError(() => parseChangeLog(JSON.stringify({ ...log, entries: [entry] })), 'sync_corrupted');
});

test('parse rejects duplicated seq values', () => {
  const log = emptyChangeLog('device-a', 'Windows');
  const first = createChangeEntry({
    deviceId: 'device-a',
    seq: 1,
    type: 'create',
    before: null,
    after: account(),
    createdAt: NOW,
  });

  const raw = JSON.stringify({ ...log, entries: [first, lightChange(first, { changeId: 'other' })] });

  assertSyncError(() => parseChangeLog(raw), 'sync_corrupted');
});

test('parse rejects an inconsistent after revision', () => {
  const log = emptyChangeLog('device-a', 'Windows');
  const entry = createChangeEntry({
    deviceId: 'device-a',
    seq: 1,
    type: 'create',
    before: null,
    after: account(),
    createdAt: NOW,
  });

  const corrupted = {
    ...entry,
    after: { ...entry.after, revision: 7 },
  };

  assertSyncError(() => parseChangeLog(JSON.stringify({ ...log, entries: [corrupted] })), 'sync_corrupted');
});

test('parse tolerates a BOM and surrounding whitespace', () => {
  const log = emptyChangeLog('device-a', 'Windows');

  const parsed = parseChangeLog(`\uFEFF  ${JSON.stringify(log)}  `);

  assert.equal(parsed.deviceId, 'device-a');
});
