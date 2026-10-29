/**
 * LocalPass - Change log envelope
 *
 * Same cryptography as the vault (PBKDF2-SHA512 + AES-256-GCM) and the same
 * envelope shape, so a change log is exactly as unreadable as the vault if it
 * leaks through the sync folder.
 */

import type { VaultEncryptedFile } from '@/lib/types';
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  base64ToUint8Array,
  decryptData,
  deriveKey,
  encryptData,
  uint8ArrayToBase64,
} from '../crypto-utils.ts';
import { parseChangeLog } from './changes.ts';
import { SyncError } from './errors.ts';
import { SYNC_FORMAT_VERSION } from './types.ts';
import type { ChangeLogFile } from './types.ts';

const SALT_BYTES = 16;

export async function sealChangeLog(log: ChangeLogFile, password: string): Promise<VaultEncryptedFile> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await deriveKey(password, salt);
  const { ciphertext, iv } = await encryptData(JSON.stringify(log), key);

  return {
    salt: uint8ArrayToBase64(salt),
    iv: uint8ArrayToBase64(iv),
    data: arrayBufferToBase64(ciphertext),
    vaultVersion: SYNC_FORMAT_VERSION,
  };
}

/**
 * Validates the envelope a peer file contains before it is handed to the
 * cipher. A file that is not an envelope at all must not be reported as a
 * wrong password.
 */
export function parseChangeLogEnvelope(raw: string): VaultEncryptedFile {
  const text = raw.trim().replace(/^\uFEFF/, '');
  if (!text) throw new SyncError('sync_corrupted');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SyncError('sync_corrupted');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new SyncError('sync_corrupted');
  }

  const { salt, iv, data, vaultVersion } = parsed as Record<string, unknown>;

  if (typeof salt !== 'string' || typeof iv !== 'string' || typeof data !== 'string') {
    throw new SyncError('sync_corrupted');
  }
  if (vaultVersion !== SYNC_FORMAT_VERSION) throw new SyncError('sync_unsupported_version');

  return { salt, iv, data, vaultVersion: SYNC_FORMAT_VERSION };
}

export async function openChangeLog(file: VaultEncryptedFile, password: string): Promise<ChangeLogFile> {
  let plaintext: string;

  try {
    const key = await deriveKey(password, base64ToUint8Array(file.salt));
    plaintext = await decryptData(base64ToArrayBuffer(file.data), key, base64ToUint8Array(file.iv));
  } catch {
    // AES-GCM cannot tell a wrong password from tampered bytes, and claiming
    // otherwise would be a lie.
    throw new SyncError('sync_authentication_failed');
  }

  return parseChangeLog(plaintext);
}
