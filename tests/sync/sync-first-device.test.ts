/**
 * The first sync between two devices, end to end.
 *
 * This covers the gap that left an Android phone with no accounts at all: the
 * origin publishes its accounts inside the baseline, so a peer that only ever
 * enabled sync produces no entries the remote list could render. The unit tests
 * around `adoptBaseline` never caught it because they never asked the UI
 * question "is there anything to press?".
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { emptyChangeLog } from '../../src/lib/sync/changes.ts';
import { adoptBaseline, enableSync, needsBaseline, pendingBaselines } from '../../src/lib/sync/engine.ts';
import { openChangeLog, parseChangeLogEnvelope } from '../../src/lib/sync/seal.ts';
import { createSyncStore } from '../../src/lib/sync/sync-store.ts';
import type { LocalPassBridge } from '../../src/lib/platform/localpass-bridge.ts';
import type { AccountEntry, VaultDecrypted } from '../../src/lib/vault/types.ts';

const NOW = '2026-11-01T12:00:00.000Z';
const PASSWORD = 'correct horse battery staple';

function account(overrides: Partial<AccountEntry> = {}): AccountEntry {
  return {
    id: 'acc-1',
    sitio: 'github.com',
    usuario: 'octocat',
    password: 'secret',
    notas: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deviceId: 'device-pc',
    history: [],
    revision: 1,
    ...overrides,
  };
}

function vault(overrides: Partial<VaultDecrypted> = {}): VaultDecrypted {
  return {
    vaultVersion: '1.0',
    deviceId: 'device-android',
    createdAt: NOW,
    updatedAt: NOW,
    accounts: [],
    conflicts: [],
    ...overrides,
  };
}

/** A sync folder shared by two devices, backed by the real crypto. */
function sharedFolder() {
  const files = new Map<string, string>();

  const unused = async () => {
    throw new Error('not implemented');
  };

  const bridge: LocalPassBridge = {
    app: { info: async () => ({ version: '1.1.0', platform: 'test', dataDir: 'data' }) },
    vault: { read: unused, write: unused, remove: unused },
    sync: {
      status: async () => ({ folder: '/synced' }),
      chooseFolder: async () => ({ folder: '/synced' }),
      list: async () =>
        Array.from(files.keys()).map((deviceId) => ({
          deviceId,
          fileName: `changes-${deviceId}.enc.json`,
        })),
      read: async (deviceId: string) => files.get(deviceId) ?? null,
      write: async (deviceId: string, payload: string) => {
        files.set(deviceId, payload);
        return true as const;
      },
      remove: async (deviceId: string) => {
        files.delete(deviceId);
        return true as const;
      },
    },
    clipboard: { copyTemp: async () => ({ clearedInMs: 0 }) },
  };

  return { store: createSyncStore(bridge), files };
}

test('a fresh device finds and adopts the baseline a peer published', async () => {
  const folder = sharedFolder();
  assert.ok(folder.store);

  // --- PC: the vault already has accounts, then sync is enabled.
  const pcVault = vault({
    deviceId: 'device-pc',
    accounts: [
      account({ id: 'acc-1', sitio: 'github.com' }),
      account({ id: 'acc-2', sitio: 'banco.com', usuario: 'luis' }),
    ],
  });
  const enabled = enableSync(emptyChangeLog('device-pc', 'PC de escritorio'), pcVault, NOW);
  assert.equal(enabled.log.baseline?.accounts.length, 2);
  assert.deepEqual(enabled.log.entries, []);

  await folder.store.write(enabled.log, PASSWORD);

  // --- Android: brand new vault, same master password, same folder.
  const androidVault = vault();

  const devices = await folder.store.listDevices();
  assert.deepEqual(devices, ['device-pc']);

  const peerLog = await folder.store.read('device-pc', PASSWORD);
  assert.ok(peerLog);

  // The bug: with no entries, the remote list had nothing to render, so the
  // "Cargar" button never existed and the accounts never arrived.
  assert.deepEqual(peerLog.entries, []);
  const loadable = pendingBaselines(androidVault, [peerLog]);
  assert.equal(loadable.length, 1);
  assert.equal(loadable[0].deviceId, 'device-pc');

  // What the button now triggers.
  assert.equal(needsBaseline(androidVault), true);
  const seeded = adoptBaseline(androidVault, peerLog, NOW);
  assert.ok(seeded);

  assert.deepEqual(
    seeded.accounts.map((entry) => entry.sitio).sort(),
    ['banco.com', 'github.com']
  );
  assert.equal(seeded.sync?.appliedSeq['device-pc'], peerLog.baseline?.seq);

  // Nothing left to offer once the vault has accounts.
  assert.deepEqual(pendingBaselines(seeded, [peerLog]), []);
});

test('a peer log sealed with another master password is reported, not ignored', async () => {
  const folder = sharedFolder();
  assert.ok(folder.store);

  const enabled = enableSync(emptyChangeLog('device-pc', 'PC'), vault({ deviceId: 'device-pc' }), NOW);
  await folder.store.write(enabled.log, PASSWORD);

  const raw = await folder.store.read('device-pc', PASSWORD);
  assert.ok(raw);

  // The store surfaces the failure the hook now renders instead of swallowing.
  const sealed = parseChangeLogEnvelope(folder.files.get('device-pc') ?? '');
  await assert.rejects(() => openChangeLog(sealed, 'otra contraseña'), /sync_authentication_failed/);
});
