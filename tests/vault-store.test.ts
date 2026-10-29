import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';

import type { LocalPassBridge } from '../src/lib/localpass-bridge.ts';
import { VaultError } from '../src/lib/vault-errors.ts';
import { createVaultStore, VAULT_MIGRATION_KEY } from '../src/lib/vault-store.ts';
import { VAULT_STORAGE_KEY } from '../src/lib/vault-storage.ts';

class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();

  get length(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.items.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

class FullStorage extends MemoryStorage {
  override setItem(): void {
    throw new Error('QuotaExceededError');
  }
}

function installStorage(t: TestContext, storage: Storage): Storage {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });

  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  return storage;
}

type FakeOptions = {
  file?: string | null;
  failRead?: boolean;
  failWrite?: number;
  failRemove?: boolean;
};

function fakeBridge(options: FakeOptions = {}) {
  const state = { file: options.file ?? null, reads: 0, writes: 0 };
  let writeFailures = options.failWrite ?? 0;

  const unused = async () => {
    throw new Error('not implemented');
  };

  const bridge: LocalPassBridge = {
    app: { info: async () => ({ version: '1.1.0', platform: 'test', dataDir: 'data' }) },
    vault: {
      read: async () => {
        state.reads += 1;
        if (options.failRead) throw Object.assign(new Error('read_failed'), { code: 'read_failed' });
        return state.file;
      },
      write: async (payload: string) => {
        state.writes += 1;
        if (writeFailures > 0) {
          writeFailures -= 1;
          throw Object.assign(new Error('write_failed'), { code: 'write_failed' });
        }
        state.file = payload;
        return true as const;
      },
      remove: async () => {
        if (options.failRemove) throw Object.assign(new Error('write_failed'), { code: 'write_failed' });
        state.file = null;
        return true as const;
      },
    },
    sync: {
      status: async () => ({ folder: null }),
      chooseFolder: async () => ({ folder: null }),
      list: async () => [],
      read: unused,
      write: unused,
      remove: unused,
    },
    clipboard: { copyTemp: async () => ({ clearedInMs: 30000 }) },
  };

  return { bridge, state };
}

function assertVaultError(fn: () => Promise<unknown>, code: string): Promise<void> {
  return assert.rejects(fn, (error: unknown) => error instanceof VaultError && error.code === code);
}

test('the bridge selects the file store', () => {
  const { bridge } = fakeBridge();

  assert.equal(createVaultStore(bridge).kind, 'file');
});

test('the file store writes and reads the same envelope', async () => {
  const { bridge, state } = fakeBridge();
  const store = createVaultStore(bridge);

  await store.write('{"salt":"s"}');

  assert.equal(state.file, '{"salt":"s"}');
  assert.equal(await store.read(), '{"salt":"s"}');
});

test('a missing file reads as null', async () => {
  const store = createVaultStore(fakeBridge().bridge);

  assert.equal(await store.read(), null);
});

test('a read failure is reported as vault_read_failed', async () => {
  const store = createVaultStore(fakeBridge({ failRead: true }).bridge);

  await assertVaultError(() => store.read(), 'vault_read_failed');
});

test('a write failure is reported as vault_write_failed', async () => {
  const store = createVaultStore(fakeBridge({ failWrite: 1 }).bridge);

  await assertVaultError(() => store.write('{"a":1}'), 'vault_write_failed');
});

test('a delete failure is reported as vault_write_failed', async () => {
  const store = createVaultStore(fakeBridge({ failRemove: true }).bridge);

  await assertVaultError(() => store.remove(), 'vault_write_failed');
});

test('removing the vault clears the file', async () => {
  const { bridge, state } = fakeBridge({ file: '{"a":1}' });
  const store = createVaultStore(bridge);

  await store.remove();

  assert.equal(state.file, null);
});

test('an existing legacy vault is copied into the file once', async (t) => {
  const storage = installStorage(t, new MemoryStorage());
  storage.setItem(VAULT_STORAGE_KEY, '{"legacy":true}');
  const { bridge, state } = fakeBridge();
  const store = createVaultStore(bridge);

  assert.equal(await store.read(), '{"legacy":true}');
  assert.equal(state.writes, 1);
  assert.equal(storage.getItem(VAULT_MIGRATION_KEY), '1');
});

test('migration never overwrites a file that already exists', async (t) => {
  const storage = installStorage(t, new MemoryStorage());
  storage.setItem(VAULT_STORAGE_KEY, '{"legacy":true}');
  const { bridge, state } = fakeBridge({ file: '{"current":true}' });
  const store = createVaultStore(bridge);

  assert.equal(await store.read(), '{"current":true}');
  assert.equal(state.writes, 0);
  assert.equal(storage.getItem(VAULT_MIGRATION_KEY), '1');
});

test('migration does not run again on later reads', async (t) => {
  const storage = installStorage(t, new MemoryStorage());
  storage.setItem(VAULT_STORAGE_KEY, '{"legacy":true}');
  const { bridge, state } = fakeBridge();
  const store = createVaultStore(bridge);

  await store.read();
  await store.read();

  assert.equal(state.writes, 1);
});

test('migration retries after a failed write', async (t) => {
  const storage = installStorage(t, new MemoryStorage());
  storage.setItem(VAULT_STORAGE_KEY, '{"legacy":true}');
  const { bridge, state } = fakeBridge({ failWrite: 1 });
  const store = createVaultStore(bridge);

  await assertVaultError(() => store.read(), 'vault_write_failed');

  assert.equal(await store.read(), '{"legacy":true}');
  assert.equal(state.file, '{"legacy":true}');
  assert.equal(storage.getItem(VAULT_MIGRATION_KEY), '1');
});

test('without a bridge the local store keeps using localStorage', async (t) => {
  const storage = installStorage(t, new MemoryStorage());
  const store = createVaultStore(null);

  assert.equal(store.kind, 'local');

  await store.write('{"local":true}');
  assert.equal(storage.getItem(VAULT_STORAGE_KEY), '{"local":true}');
  assert.equal(await store.read(), '{"local":true}');

  await store.remove();
  assert.equal(storage.getItem(VAULT_STORAGE_KEY), null);
});

test('a full localStorage is reported as vault_write_failed', async (t) => {
  installStorage(t, new FullStorage());
  const store = createVaultStore(null);

  await assertVaultError(() => store.write('{"a":1}'), 'vault_write_failed');
});
