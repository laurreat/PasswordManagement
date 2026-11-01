/**
 * LocalPass - Renderer bridge types
 *
 * The bridge is injected by `electron/preload.js`. In a plain browser (dev
 * server, web build) it does not exist and the vault falls back to
 * `localStorage`, which is exactly what the app used before sync existed.
 */

export type AppInfo = {
  version: string;
  platform: string;
  dataDir: string;
};

export type SyncFolderStatus = {
  folder: string | null;
};

export type SyncLogFile = {
  deviceId: string;
  fileName: string;
};

export type ClipboardResult = {
  clearedInMs: number;
};

export type LocalPassBridge = {
  app: {
    info(): Promise<AppInfo>;
  };
  vault: {
    read(): Promise<string | null>;
    write(payload: string): Promise<true>;
    remove(): Promise<true>;
  };
  sync: {
    status(): Promise<SyncFolderStatus>;
    chooseFolder(title?: string): Promise<SyncFolderStatus>;
    list(): Promise<SyncLogFile[]>;
    read(deviceId: string): Promise<string | null>;
    write(deviceId: string, payload: string): Promise<true>;
    remove(deviceId: string): Promise<true>;
  };
  clipboard: {
    copyTemp(text: string, ttlMs?: number): Promise<ClipboardResult>;
  };
};

/** Error thrown by the bridge; `code` comes from the main-process envelope. */
export type BridgeError = Error & { code?: string };

export function getBridge(): LocalPassBridge | null {
  if (typeof window === 'undefined') return null;

  const bridge = (window as unknown as { localpass?: LocalPassBridge }).localpass;
  return bridge ?? null;
}
