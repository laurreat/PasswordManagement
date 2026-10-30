import test from 'node:test';
import assert from 'node:assert/strict';

import {
  adoptBaseline,
  enableSync,
  ensureRelayBaseline,
  relayAppliedChanges,
  stageChange,
} from '../src/lib/sync/engine.ts';
import { applyChangeLog, summarizeChangeLog } from '../src/lib/sync/apply.ts';
import {
  createChangeEntry,
  emptyChangeLog,
  parseChangeLog,
  serializeChangeLog,
} from '../src/lib/sync/changes.ts';
import type { ChangeEntry, ChangeLogFile } from '../src/lib/sync/types.ts';
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
    deviceId: 'device-windows',
    history: [],
    revision: 1,
    ...overrides,
  };
}

function vault(deviceId: string, overrides: Partial<VaultDecrypted> = {}): VaultDecrypted {
  return {
    vaultVersion: '1.0',
    deviceId,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    accounts: [],
    conflicts: [],
    ...overrides,
  };
}

function changeLog(deviceId: string, name: string, entries: ChangeEntry[] = []): ChangeLogFile {
  return { ...emptyChangeLog(deviceId, name), entries };
}

test('a change relayed by Android reaches Linux and never returns to Windows', () => {
  const windows = 'device-windows';
  const android = 'device-android';
  const linux = 'device-linux';

  const enabledWindows = enableSync(emptyChangeLog(windows, 'Windows'), vault(windows), NOW);
  const created = stageChange(enabledWindows.log, enabledWindows.vault, {
    type: 'create',
    before: null,
    after: account({ revision: 0 }),
    createdAt: NOW,
  });

  const androidAdopted = adoptBaseline(vault(android), created.log, NOW);
  assert.ok(androidAdopted);

  const androidApplied = applyChangeLog(androidAdopted, created.log, NOW);
  assert.equal(androidApplied.vault.accounts.length, 1);

  const androidLog = enableSync(emptyChangeLog(android, 'Android'), androidAdopted, NOW).log;
  const androidRelay = relayAppliedChanges(androidLog, created.log, androidApplied.outcomes);

  assert.equal(androidRelay.entries.length, 1);
  const relayed = androidRelay.entries[0];
  assert.equal(relayed.deviceId, android);
  assert.equal(relayed.originDeviceId, windows);
  assert.equal(relayed.originSeq, created.entry.seq);

  const linuxAdopted = adoptBaseline(vault(linux), androidRelay, NOW);
  assert.ok(linuxAdopted);

  const linuxApplied = applyChangeLog(linuxAdopted, androidRelay, NOW);
  assert.equal(linuxApplied.vault.accounts.length, 1);
  assert.equal(linuxApplied.vault.accounts[0].password, 'old-password');
  assert.equal(linuxApplied.vault.sync?.appliedSeq[android], relayed.seq);
  assert.equal(linuxApplied.vault.sync?.appliedSeq[windows], created.entry.seq);
  assert.deepEqual(linuxApplied.outcomes.map((outcome) => outcome.kind), ['applied']);

  // Android's log returns to Windows: it is Windows' own change, not a conflict.
  const windowsReceivedRelay = applyChangeLog(created.vault, androidRelay, NOW);
  assert.equal(windowsReceivedRelay.outcomes[0].kind, 'skipped');
  assert.equal(windowsReceivedRelay.outcomes[0].reason, 'own_device');
  assert.equal(windowsReceivedRelay.vault.conflicts.length, 0);
  assert.equal(windowsReceivedRelay.vault.accounts.length, 1);

  // If Linux later reads the Windows log directly, the original is already seen.
  const linuxDirect = applyChangeLog(linuxApplied.vault, created.log, NOW);
  assert.equal(linuxDirect.outcomes[0].kind, 'skipped');
  assert.equal(linuxDirect.outcomes[0].reason, 'already_applied');
  assert.equal(linuxDirect.vault.accounts.length, 1);
});

test('relaying preserves the first origin across a longer chain', () => {
  const windows = 'device-windows';
  const android = 'device-android';
  const linux = 'device-linux';

  const enabledWindows = enableSync(emptyChangeLog(windows, 'Windows'), vault(windows), NOW);
  const created = stageChange(enabledWindows.log, enabledWindows.vault, {
    type: 'create',
    before: null,
    after: account({ revision: 0 }),
    createdAt: NOW,
  });

  const androidLog = changeLog(android, 'Android');
  const firstRelay = relayAppliedChanges(androidLog, created.log, [
    { changeId: created.entry.changeId, accountKey: created.entry.accountKey, kind: 'applied' },
  ]);

  const linuxLog = changeLog(linux, 'Linux');
  const secondRelay = relayAppliedChanges(linuxLog, firstRelay, [
    { changeId: firstRelay.entries[0].changeId, accountKey: firstRelay.entries[0].accountKey, kind: 'applied' },
  ]);

  assert.equal(secondRelay.entries.length, 1);
  assert.equal(secondRelay.entries[0].deviceId, linux);
  assert.equal(secondRelay.entries[0].originDeviceId, windows);
  assert.equal(secondRelay.entries[0].originSeq, created.entry.seq);
});

test('only applied entries are relayed', () => {
  const source = changeLog('device-a', 'Windows', [
    createChangeEntry({
      deviceId: 'device-a',
      seq: 1,
      type: 'create',
      before: null,
      after: account({ revision: 0 }),
      createdAt: NOW,
    }),
  ]);
  const relayed = relayAppliedChanges(changeLog('device-b', 'Android'), source, [
    { changeId: source.entries[0].changeId, accountKey: source.entries[0].accountKey, kind: 'skipped' },
  ]);

  assert.equal(relayed.entries.length, 0);
});

test('an empty baseline is upgraded before relaying accounts that predate this device', () => {
  const withAccounts = vault('device-b', { accounts: [account()] });
  const emptyBaseline = enableSync(changeLog('device-b', 'Android'), vault('device-b'), NOW).log;

  const upgraded = ensureRelayBaseline(emptyBaseline, withAccounts, NOW);

  assert.ok(upgraded.baseline);
  assert.equal(upgraded.baseline.accounts.length, 1);
  assert.ok(upgraded.baseline.seq > emptyBaseline.baseline!.seq);
});

test('summarizeChangeLog separates applied operations from conflicts and skips', () => {
  const create = createChangeEntry({
    deviceId: 'device-a',
    seq: 1,
    type: 'create',
    before: null,
    after: account({ revision: 0 }),
    createdAt: NOW,
  });
  const update = createChangeEntry({
    deviceId: 'device-a',
    seq: 2,
    type: 'update',
    before: account({ revision: 1, password: 'a' }),
    after: account({ revision: 1, password: 'b' }),
    createdAt: NOW,
  });
  const deleted = createChangeEntry({
    deviceId: 'device-a',
    seq: 3,
    type: 'delete',
    before: account({ revision: 2 }),
    after: null,
    createdAt: NOW,
  });
  const log = changeLog('device-a', 'Windows', [create, update, deleted]);

  const summary = summarizeChangeLog(log, [
    { changeId: create.changeId, accountKey: create.accountKey, kind: 'applied' },
    { changeId: update.changeId, accountKey: update.accountKey, kind: 'conflict', reason: 'revision_mismatch' },
    { changeId: deleted.changeId, accountKey: deleted.accountKey, kind: 'skipped', reason: 'missing_account' },
  ]);

  assert.equal(summary.total, 3);
  assert.equal(summary.applied, 1);
  assert.equal(summary.creates, 1);
  assert.equal(summary.updates, 0);
  assert.equal(summary.deletes, 0);
  assert.equal(summary.conflicts, 1);
  assert.equal(summary.skipped, 1);
});

test('summarizeChangeLog counts an applied delete', () => {
  const deleted = createChangeEntry({
    deviceId: 'device-a',
    seq: 1,
    type: 'delete',
    before: account({ revision: 2 }),
    after: null,
    createdAt: NOW,
  });
  const log = changeLog('device-a', 'Windows', [deleted]);

  const summary = summarizeChangeLog(log, [
    { changeId: deleted.changeId, accountKey: deleted.accountKey, kind: 'applied' },
  ]);

  assert.equal(summary.applied, 1);
  assert.equal(summary.deletes, 1);
});

test('relay provenance survives a serialized log round-trip', () => {
  const source = createChangeEntry({
    deviceId: 'device-a',
    seq: 4,
    type: 'create',
    before: null,
    after: account({ revision: 0 }),
    createdAt: NOW,
  });
  const relay: ChangeEntry = {
    ...source,
    deviceId: 'device-b',
    originDeviceId: 'device-a',
    originSeq: 4,
  };
  const log = changeLog('device-b', 'Android', [relay]);

  const parsed = parseChangeLog(serializeChangeLog(log));

  assert.equal(parsed.entries[0].originDeviceId, 'device-a');
  assert.equal(parsed.entries[0].originSeq, 4);
});
