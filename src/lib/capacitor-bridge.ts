/**
 * LocalPass - Capacitor bridge (Android)
 *
 * The renderer talks to `window.localpass` everywhere. On the desktop that
 * object is injected by `electron/preload.js`; on Android there is no preload,
 * so this module builds the same shape on top of a native plugin.
 *
 * Keeping the contract identical is the whole point: `vault-store`,
 * `sync-store` and the UI do not know which platform they are running on.
 */

import { registerPlugin } from '@capacitor/core';
import type {
  AppInfo,
  ClipboardResult,
  LocalPassBridge,
  SyncFolderStatus,
  SyncLogFile,
} from '@/lib/localpass-bridge';

type StoragePlugin = {
  appInfo(): Promise<AppInfo>;
  vaultRead(): Promise<{ value: string | null }>;
  vaultWrite(options: { payload: string }): Promise<void>;
  vaultRemove(): Promise<void>;
  syncStatus(): Promise<SyncFolderStatus>;
  syncChooseFolder(): Promise<SyncFolderStatus>;
  syncList(): Promise<{ logs: SyncLogFile[] }>;
  syncRead(options: { deviceId: string }): Promise<{ value: string | null }>;
  syncWrite(options: { deviceId: string; payload: string }): Promise<void>;
  syncRemove(options: { deviceId: string }): Promise<void>;
  clipboardCopyTemp(options: { text: string; ttlMs?: number }): Promise<ClipboardResult>;
};

/** Registered natively in `LocalPassStoragePlugin.java`. */
export const LocalPassStorage = registerPlugin<StoragePlugin>('LocalPassStorage');

/**
 * Android picks folders through the Storage Access Framework, which has no
 * notion of a filesystem path: the folder is a content URI that the user grants
 * once and the app keeps across restarts. The renderer only ever sees that
 * opaque string, so nothing above this line needs to care.
 */
export function createCapacitorBridge(): LocalPassBridge {
  return {
    app: {
      info: () => LocalPassStorage.appInfo(),
    },
    vault: {
      read: async () => (await LocalPassStorage.vaultRead()).value,
      write: async (payload: string) => {
        await LocalPassStorage.vaultWrite({ payload });
        return true as const;
      },
      remove: async () => {
        await LocalPassStorage.vaultRemove();
        return true as const;
      },
    },
    sync: {
      status: () => LocalPassStorage.syncStatus(),
      chooseFolder: async () => {
        try {
          return await LocalPassStorage.syncChooseFolder();
        } catch (error) {
          // Backing out of the picker is not an error: keep whatever folder
          // was already configured, exactly like the desktop dialog does.
          if (isCode(error, 'cancelled')) return LocalPassStorage.syncStatus();
          throw error;
        }
      },
      list: async () => (await LocalPassStorage.syncList()).logs,
      read: async (deviceId: string) => (await LocalPassStorage.syncRead({ deviceId })).value,
      write: async (deviceId: string, payload: string) => {
        await LocalPassStorage.syncWrite({ deviceId, payload });
        return true as const;
      },
      remove: async (deviceId: string) => {
        await LocalPassStorage.syncRemove({ deviceId });
        return true as const;
      },
    },
    clipboard: {
      copyTemp: (text: string, ttlMs?: number) =>
        LocalPassStorage.clipboardCopyTemp({ text, ttlMs }),
    },
  };
}

function isCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}
