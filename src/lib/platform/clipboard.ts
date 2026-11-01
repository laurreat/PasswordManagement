/**
 * LocalPass - Clipboard
 *
 * Copying a password is convenient and dangerous: it stays in the clipboard
 * forever. Electron cannot clear it from the renderer (the page only has
 * write-only access), so the main process copies and clears it after a delay.
 * In a browser tab there is nothing to clear with, and the copy is all we can
 * offer.
 */

import { getBridge } from './localpass-bridge.ts';

export const CLIPBOARD_CLEAR_MS = 30_000;

export async function copySecret(
  text: string,
  ttlMs: number = CLIPBOARD_CLEAR_MS
): Promise<boolean> {
  if (!text) return false;

  const bridge = getBridge();

  if (bridge) {
    try {
      await bridge.clipboard.copyTemp(text, ttlMs);
      return true;
    } catch {
      // A copy that does not self-clear beats no copy at all.
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
