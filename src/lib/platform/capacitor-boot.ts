/**
 * LocalPass - Capacitor boot
 *
 * Imported for its side effect by `src/app/page.tsx`. On Android there is no
 * preload script, so the renderer would otherwise fall back to `localStorage`
 * and lose the vault on a WebView data wipe. This module installs
 * `window.localpass` before the React tree mounts, which makes `vault-store`
 * and `sync-store` take the file path exactly like they do on the desktop.
 *
 * The import is safe on the server and in the browser: nothing happens unless
 * Capacitor reports a native platform.
 */

import { Capacitor } from '@capacitor/core';
import { createCapacitorBridge } from './capacitor-bridge.ts';
import type { LocalPassBridge } from './localpass-bridge.ts';

type BridgeHost = { localpass?: LocalPassBridge };

/**
 * Returns `true` when this call installed the bridge. Repeated calls are
 * intentionally inert: an existing bridge (Electron preload, or a previous
 * install during hot reload) is never overwritten.
 */
export function installCapacitorBridge(): boolean {
  if (typeof window === 'undefined') return false;
  if (!Capacitor.isNativePlatform()) return false;

  const host = window as unknown as BridgeHost;
  if (host.localpass) return false;

  host.localpass = createCapacitorBridge();
  return true;
}

installCapacitorBridge();
