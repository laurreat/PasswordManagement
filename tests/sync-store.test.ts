import test from 'node:test';
import assert from 'node:assert/strict';

import { createBaseline, emptyChangeLog } from '../src/lib/sync/changes.ts';
import { SyncError } from '../src/lib/sync/errors.ts';
import { createSyncStore } from '../src/lib/sync/sync-store.ts';
import type { LocalPassBridge } from '../src/lib/localpass-bridge.ts';
import type { AccountEntry } from '../src/lib/types.ts';

const NOW = '2026-10-28T12:00:00.000Z';
const PASSWORD = 'correct horse battery staple';

function account(): AccountEntry {
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
    revision: 0,
  };
}

type FakeOptions = {
  failRead?: boolean;
  failWrite?: boolean;
  failList?: boolean;
  folder?: string | null;
};

function fakeBridge(options: FakeOptions = {}) {
  const files = new Map<string, string>();
  const state = { folder: options.folder ?? null, chosen: 0, writes: 0 };

  const unused = async () => {
    throw new Error('not implemented');
  };

  const bridge: LocalPassBridge = {
    app: { info: async () => ({ version: '1.1.0', platform: 'test', dataDir: 'data' }) },
    vault: { read: unused, write: unused, remove: unused },
    sync: {
      status: async () => {
        if (options.failRead) throw new Error('read_failed');
        return { folder: state.folder };
      },
      chooseFolder: async () => {
        state.chosen += 1;
        state.folder = '/chosen';
        return { folder: state.folder };
      },
      list: async () => {
        if (options.failList) throw new Error('read_failed');
        return Array.from(files.keys()).map((deviceId) => ({
          deviceId,
          fileName: `changes-${deviceId}.enc.json`,
        }));
      },
      read: async (deviceId: string) => {
        if (options.failRead) throw new Error('read_failed');
        return files.get(deviceId) ?? null;
      },
      write: async (deviceId: string, payload: string) => {
        if (options.failWrite) throw new Error('write_failed');
        state.writes += 1;
        files.set(deviceId, payload);
        return true as const;
      },
      remove: async (deviceId: string) => {
        files.delete(deviceId);
        return true as const;
      },
    },
    clipboard: { copyTemp: async () => ({ clearedInMs: 30000 }) },
  };

  return { bridge, files, state };
}

function sampleLog(deviceId = 'device-a') {
  return createBaseline(emptyChangeLog(deviceId, 'Windows'), [account()], NOW);
}

function assertSyncError(fn: () => Promise<unknown>, code: string): Promise<void> {
  return assert.rejects(fn, (error: unknown) => error instanceof SyncError && error.code === code);
}

test('without the bridge there is no sync store', () => {
  assert.equal(createSyncStore(null), null);
  assert.equal(createSyncStore(), null);
});

test('a log survives a write and a read through the bridge', async () => {
  const { bridge } = fakeBridge();
  const store = createSyncStore(bridge);
  assert.ok(store);

  await store.write(sampleLog(), PASSWORD);
  const opened = await store.read('device-a', PASSWORD);

  assert.deepEqual(opened, sampleLog());
});

test('a missing peer file reads as null', async () => {
  const store = createSyncStore(fakeBridge().bridge);
  assert.ok(store);

  assert.equal(await store.read('device-zzz', PASSWORD), null);
});

test('a wrong password fails authentication', async () => {
  const { bridge } = fakeBridge();
  const store = createSyncStore(bridge);
  assert.ok(store);

  await store.write(sampleLog(), PASSWORD);

  await assertSyncError(() => store.read('device-a', 'wrong'), 'sync_authentication_failed');
});

test('a file that is not an envelope is reported as corrupted', async () => {
  const { bridge, files } = fakeBridge();
  const store = createSyncStore(bridge);
  assert.ok(store);

  files.set('device-a', 'not json');

  await assertSyncError(() => store.read('device-a', PASSWORD), 'sync_corrupted');

  files.set('device-a', 'null');

  await assertSyncError(() => store.read('device-a', PASSWORD), 'sync_corrupted');
});

test('an envelope from a newer sync format is rejected', async () => {
  const { bridge, files } = fakeBridge();
  const store = createSyncStore(bridge);
  assert.ok(store);

  files.set('device-a', JSON.stringify({ salt: 'a', iv: 'b', data: 'c', vaultVersion: '9.9' }));

  await assertSyncError(() => store.read('device-a', PASSWORD), 'sync_unsupported_version');
});

test('a read failure is typed, not silent', async () => {
  const store = createSyncStore(fakeBridge({ failRead: true }).bridge);
  assert.ok(store);

  await assertSyncError(() => store.read('device-a', PASSWORD), 'sync_read_failed');
  await assertSyncError(() => store.folder(), 'sync_read_failed');
});

test('a write failure is typed', async () => {
  const store = createSyncStore(fakeBridge({ failWrite: true }).bridge);
  assert.ok(store);

  await assertSyncError(() => store.write(sampleLog(), PASSWORD), 'sync_write_failed');
});

test('listing peers returns device ids only', async () => {
  const { bridge, files } = fakeBridge();
  const store = createSyncStore(bridge);
  assert.ok(store);

  files.set('device-a', '{}');
  files.set('device-b', '{}');

  assert.deepEqual((await store.listDevices()).sort(), ['device-a', 'device-b']);
});

test('the folder can be read and chosen', async () => {
  const { bridge, state } = fakeBridge();
  const store = createSyncStore(bridge);
  assert.ok(store);

  assert.equal(await store.folder(), null);

  assert.equal(await store.chooseFolder('Pick one'), '/chosen');
  assert.equal(await store.folder(), '/chosen');
  assert.equal(state.chosen, 1);
});

test('the written file is sealed, not plaintext', async () => {
  const { bridge, files } = fakeBridge();
  const store = createSyncStore(bridge);
  assert.ok(store);

  await store.write(sampleLog(), PASSWORD);

  const raw = files.get('device-a') ?? '';
  assert.equal(raw.includes('github.com'), false);
  assert.equal(raw.includes('secret'), false);
});

test('sealing uses a fresh envelope on every write', async () => {
  const { bridge, files } = fakeBridge();
  const store = createSyncStore(bridge);
  assert.ok(store);

  await store.write(sampleLog(), PASSWORD);
  const first = files.get('device-a');

  await store.write(sampleLog(), PASSWORD);
  const second = files.get('device-a');

  assert.notEqual(first, second);
});
