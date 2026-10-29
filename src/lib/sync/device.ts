/**
 * LocalPass - Device identity
 *
 * The device id already lives in the vault; the name is local metadata shown
 * in the change list ("Windows", "Android"). Neither is an account.
 */

import type { VaultDecrypted } from '@/lib/types';

export const MAX_DEVICE_NAME = 40;

export function normalizeDeviceName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, MAX_DEVICE_NAME);
}

/** Best-effort label from the runtime's user agent. Never sent anywhere. */
export function suggestDeviceName(userAgent: string): string {
  const agent = userAgent.toLowerCase();

  if (agent.includes('android')) return 'Android';
  if (agent.includes('windows')) return 'Windows';
  if (agent.includes('mac os') || agent.includes('macintosh')) return 'macOS';
  if (agent.includes('linux')) return 'Linux';

  return 'Device';
}

export function deviceNameOf(vault: VaultDecrypted): string {
  return vault.sync?.deviceName ?? '';
}

/** Sets the device name without dropping the applied cursors. */
export function withDeviceName(vault: VaultDecrypted, rawName: string): VaultDecrypted {
  const deviceName = normalizeDeviceName(rawName) || 'Device';

  return {
    ...vault,
    sync: {
      deviceName,
      appliedSeq: { ...(vault.sync?.appliedSeq ?? {}) },
    },
  };
}
