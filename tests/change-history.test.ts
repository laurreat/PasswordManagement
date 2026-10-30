import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HISTORY_VISIBLE_DAYS,
  accountChangeFromEntry,
  appendAccountChange,
  createAccountChange,
  historyFromLog,
  mergeAccountHistory,
  splitHistoryByAge,
} from '../src/lib/change-history.ts';
import { createChangeEntry, emptyChangeLog } from '../src/lib/sync/changes.ts';
import type { AccountEntry, VaultDecrypted } from '../src/lib/types.ts';

const NOW = '2026-10-29T12:00:00.000Z';

function account(overrides: Partial<AccountEntry> = {}): AccountEntry {
  return {
    id: 'acc-1',
    sitio: 'github.com',
    usuario: 'octocat',
    password: 'old-password',
    notas: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deviceId: 'device-local',
    history: [],
    revision: 1,
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

test('records the changed fields and keeps only account values', () => {
  const record = createAccountChange({
    type: 'update',
    before: account({ password: 'old-password', notas: 'before' }),
    after: account({ password: 'new-password', notas: 'after' }),
    createdAt: NOW,
    deviceId: 'device-local',
    deviceName: 'Windows',
    source: 'local',
  });

  assert.deepEqual(record.changedFields, ['password', 'notas']);
  assert.equal(record.before?.password, 'old-password');
  assert.equal(record.after?.password, 'new-password');
  assert.equal(record.deviceName, 'Windows');
  assert.equal(record.accountKey, 'github.com|octocat');
  assert.equal(record.before && 'history' in record.before, false);
});

test('create and delete use explicit field markers', () => {
  const created = createAccountChange({
    type: 'create',
    before: null,
    after: account(),
    createdAt: NOW,
    deviceId: 'device-local',
    source: 'local',
  });
  const deleted = createAccountChange({
    type: 'delete',
    before: account(),
    after: null,
    createdAt: NOW,
    deviceId: 'device-local',
    source: 'local',
  });

  assert.deepEqual(created.changedFields, ['created']);
  assert.deepEqual(deleted.changedFields, ['deleted']);
});

test('appending is idempotent by history id', () => {
  const record = createAccountChange({
    type: 'create',
    before: null,
    after: account(),
    createdAt: NOW,
    deviceId: 'device-local',
    source: 'local',
  });

  const once = appendAccountChange(vault(), record);
  const twice = appendAccountChange(once, record);

  assert.equal(once.history?.length, 1);
  assert.equal(twice.history?.length, 1);
});

test('entries older than three days are hidden, not removed', () => {
  const recent = createAccountChange({
    type: 'create',
    before: null,
    after: account({ id: 'recent' }),
    createdAt: '2026-10-28T12:00:00.000Z',
    deviceId: 'device-local',
    source: 'local',
  });
  const old = createAccountChange({
    type: 'create',
    before: null,
    after: account({ id: 'old' }),
    createdAt: '2026-10-25T12:00:00.000Z',
    deviceId: 'device-local',
    source: 'local',
  });

  const split = splitHistoryByAge([old, recent], Date.parse(NOW));

  assert.equal(HISTORY_VISIBLE_DAYS, 3);
  assert.deepEqual(split.visible.map((entry) => entry.accountId), ['recent']);
  assert.deepEqual(split.hidden.map((entry) => entry.accountId), ['old']);
});

test('exactly three days old is still visible', () => {
  const boundary = createAccountChange({
    type: 'create',
    before: null,
    after: account(),
    createdAt: '2026-10-26T12:00:00.000Z',
    deviceId: 'device-local',
    source: 'local',
  });

  const split = splitHistoryByAge([boundary], Date.parse(NOW));

  assert.equal(split.visible.length, 1);
  assert.equal(split.hidden.length, 0);
});

test('a sync entry becomes a history record with its original author', () => {
  const entry = createChangeEntry({
    deviceId: 'device-android',
    seq: 4,
    type: 'create',
    before: null,
    after: account({ revision: 0 }),
    createdAt: NOW,
  });

  const record = accountChangeFromEntry(
    { ...entry, deviceId: 'device-linux', originDeviceId: 'device-android', originSeq: 4 },
    'remote',
    'Linux'
  );

  assert.equal(record.historyId, entry.changeId);
  assert.equal(record.deviceId, 'device-android');
  assert.equal(record.deviceName, 'Linux');
  assert.equal(record.source, 'remote');
  assert.equal(record.after?.password, 'old-password');
});

test('log backfill excludes relayed copies and local changes are deduped', () => {
  const local = createChangeEntry({
    deviceId: 'device-local',
    seq: 1,
    type: 'create',
    before: null,
    after: account({ revision: 0 }),
    createdAt: NOW,
  });
  const relayed = {
    ...createChangeEntry({
      deviceId: 'device-local',
      seq: 2,
      type: 'update',
      before: account({ revision: 1 }),
      after: account({ revision: 1, password: 'other' }),
      createdAt: NOW,
    }),
    originDeviceId: 'device-remote',
    originSeq: 9,
  };
  const log = { ...emptyChangeLog('device-local', 'Windows'), entries: [local, relayed] };

  const records = historyFromLog(log);
  const merged = mergeAccountHistory(records, [records[0]]);

  assert.equal(records.length, 1);
  assert.equal(records[0].source, 'local');
  assert.equal(merged.length, 1);
});
