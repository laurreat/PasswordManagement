import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';

import { CLIPBOARD_CLEAR_MS, copySecret } from '../src/lib/clipboard.ts';
import type { LocalPassBridge } from '../src/lib/localpass-bridge.ts';

type FakeClipboard = {
  written: string[];
  writeText(text: string): Promise<void>;
};

function fakeClipboard(fails = false): FakeClipboard {
  const written: string[] = [];

  return {
    written,
    async writeText(text: string) {
      if (fails) throw new Error('clipboard_unavailable');
      written.push(text);
    },
  };
}

type FakeBridge = {
  calls: Array<{ text: string; ttlMs?: number }>;
  fails: boolean;
  bridge: LocalPassBridge;
};

function fakeBridge(fails = false): FakeBridge {
  const calls: Array<{ text: string; ttlMs?: number }> = [];
  const unused = async () => {
    throw new Error('not implemented');
  };

  return {
    calls,
    fails,
    bridge: {
      app: { info: async () => ({ version: '1.1.0', platform: 'test', dataDir: 'data' }) },
      vault: { read: unused, write: unused, remove: unused },
      sync: { status: unused, chooseFolder: unused, list: unused, read: unused, write: unused, remove: unused },
      clipboard: {
        copyTemp: async (text: string, ttlMs?: number) => {
          if (fails) throw Object.assign(new Error('write_failed'), { code: 'write_failed' });
          calls.push({ text, ttlMs });
          return { clearedInMs: ttlMs ?? CLIPBOARD_CLEAR_MS };
        },
      },
    },
  };
}

function installGlobals(
  t: TestContext,
  options: { bridge?: LocalPassBridge; clipboard?: FakeClipboard | null }
): void {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  const windowValue = options.bridge ? { localpass: options.bridge } : {};
  const navigatorValue = options.clipboard === null ? {} : { clipboard: options.clipboard ?? fakeClipboard() };

  Object.defineProperty(globalThis, 'window', { value: windowValue, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'navigator', { value: navigatorValue, configurable: true, writable: true });

  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else delete (globalThis as { window?: unknown }).window;

    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete (globalThis as { navigator?: unknown }).navigator;
  });
}

test('the bridge copies with the default clear delay', async (t) => {
  const fake = fakeBridge();
  installGlobals(t, { bridge: fake.bridge });

  assert.equal(await copySecret('hunter2'), true);
  assert.deepEqual(fake.calls, [{ text: 'hunter2', ttlMs: CLIPBOARD_CLEAR_MS }]);
});

test('the caller can request a different delay', async (t) => {
  const fake = fakeBridge();
  installGlobals(t, { bridge: fake.bridge });

  await copySecret('hunter2', 10_000);

  assert.deepEqual(fake.calls, [{ text: 'hunter2', ttlMs: 10_000 }]);
});

test('without a bridge the web clipboard is used', async (t) => {
  const clipboard = fakeClipboard();
  installGlobals(t, { clipboard });

  assert.equal(await copySecret('from-browser'), true);
  assert.deepEqual(clipboard.written, ['from-browser']);
});

test('a failing bridge falls back to the web clipboard', async (t) => {
  const clipboard = fakeClipboard();
  installGlobals(t, { bridge: fakeBridge(true).bridge, clipboard });

  assert.equal(await copySecret('fallback'), true);
  assert.deepEqual(clipboard.written, ['fallback']);
});

test('no clipboard at all reports failure instead of throwing', async (t) => {
  installGlobals(t, { clipboard: null });

  assert.equal(await copySecret('nowhere'), false);
});

test('an empty secret is rejected without touching the clipboard', async (t) => {
  const fake = fakeBridge();
  installGlobals(t, { bridge: fake.bridge });

  assert.equal(await copySecret(''), false);
  assert.deepEqual(fake.calls, []);
});
