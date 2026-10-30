/**
 * LocalPass - Vault envelope and decryption
 *
 * Pure functions with no DOM dependency: the React hook owns state and
 * storage, this module owns the on-disk format and turns every failure into a
 * typed `VaultError` so the UI can explain what actually happened.
 */

import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  base64ToUint8Array,
  decryptData,
  deriveKey,
  encryptData,
  uint8ArrayToBase64,
} from './crypto-utils.ts';
import { VaultError, type VaultErrorCode } from './vault-errors.ts';
import type {
  AccountEntry,
  ConflictEntry,
  ExportPackage,
  PasswordHistory,
  VaultDecrypted,
  VaultEncryptedFile,
} from './types.ts';

export const VAULT_STORAGE_KEY = 'localpass_vault';
export const VAULT_FORMAT_VERSION = '1.0' as const;
export const SALT_BYTES = 16;

export type VaultSource = 'stored' | 'backup';

function sourceCode(source: VaultSource, suffix: 'corrupted' | 'authentication_failed' | 'unsupported_version'): VaultErrorCode {
  return `${source === 'stored' ? 'vault' : 'backup'}_${suffix}` as VaultErrorCode;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function stripBom(raw: string): string {
  return raw.trim().replace(/^\uFEFF/, '');
}

/** Validates the encrypted envelope without touching any secret material. */
export function parseVaultEnvelope(rawJson: string, source: VaultSource): VaultEncryptedFile {
  const raw = stripBom(rawJson);
  if (!raw) throw new VaultError(sourceCode(source, 'corrupted'));

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new VaultError(sourceCode(source, 'corrupted'));
  }

  // A backup is either the bare envelope or an ExportPackage wrapping it.
  const envelope =
    isRecord(parsed) && isRecord(parsed.vaultData) ? parsed.vaultData : parsed;

  if (!isRecord(envelope)) throw new VaultError(sourceCode(source, 'corrupted'));
  if (!isNonEmptyString(envelope.salt) || !isNonEmptyString(envelope.iv) || !isNonEmptyString(envelope.data)) {
    throw new VaultError(sourceCode(source, 'corrupted'));
  }
  if (envelope.vaultVersion !== undefined && envelope.vaultVersion !== VAULT_FORMAT_VERSION) {
    throw new VaultError(sourceCode(source, 'unsupported_version'));
  }

  return {
    salt: envelope.salt,
    iv: envelope.iv,
    data: envelope.data,
    vaultVersion: VAULT_FORMAT_VERSION,
  };
}

function assertAccount(value: unknown): asserts value is AccountEntry {
  if (!isRecord(value)) throw new VaultError('vault_corrupted');
  if (!isNonEmptyString(value.id) || !isNonEmptyString(value.sitio) || !isNonEmptyString(value.usuario)) {
    throw new VaultError('vault_corrupted');
  }
  if (typeof value.password !== 'string') throw new VaultError('vault_corrupted');
  if (!Array.isArray(value.history)) throw new VaultError('vault_corrupted');
}

function assertChangeValues(value: unknown): void {
  if (!isRecord(value)) throw new VaultError('vault_corrupted');
  if (!isNonEmptyString(value.sitio) || !isNonEmptyString(value.usuario)) {
    throw new VaultError('vault_corrupted');
  }
  if (typeof value.password !== 'string' || typeof value.notas !== 'string') {
    throw new VaultError('vault_corrupted');
  }
}

function assertHistoryEntry(value: unknown): void {
  if (!isRecord(value)) throw new VaultError('vault_corrupted');
  if (!isNonEmptyString(value.historyId) || !isNonEmptyString(value.accountId)) {
    throw new VaultError('vault_corrupted');
  }
  if (!isNonEmptyString(value.accountKey) || !isNonEmptyString(value.createdAt)) {
    throw new VaultError('vault_corrupted');
  }
  if (!isNonEmptyString(value.deviceId)) throw new VaultError('vault_corrupted');
  if (value.type !== 'create' && value.type !== 'update' && value.type !== 'delete') {
    throw new VaultError('vault_corrupted');
  }
  if (value.before !== null) assertChangeValues(value.before);
  if (value.after !== null) assertChangeValues(value.after);
  if (!Array.isArray(value.changedFields)) throw new VaultError('vault_corrupted');
}

function assertVaultShape(value: unknown): asserts value is VaultDecrypted {
  if (!isRecord(value)) throw new VaultError('vault_corrupted');
  if (value.vaultVersion !== VAULT_FORMAT_VERSION) throw new VaultError('vault_unsupported_version');
  if (!isNonEmptyString(value.deviceId)) throw new VaultError('vault_corrupted');
  if (!Array.isArray(value.accounts) || !Array.isArray(value.conflicts)) {
    throw new VaultError('vault_corrupted');
  }

  value.accounts.forEach(assertAccount);

  if (value.history !== undefined) {
    if (!Array.isArray(value.history)) throw new VaultError('vault_corrupted');
    value.history.forEach(assertHistoryEntry);
  }

  (value.conflicts as unknown[]).forEach((conflict) => {
    if (!isRecord(conflict) || !isNonEmptyString(conflict.conflictId) || !isNonEmptyString(conflict.sitio)) {
      throw new VaultError('vault_corrupted');
    }
    assertAccount(conflict.versionLocal);
    assertAccount(conflict.versionImportada);
  });
}

export async function decryptVaultFile(
  file: VaultEncryptedFile,
  password: string,
  source: VaultSource
): Promise<VaultDecrypted> {
  let plaintext: string;

  try {
    const salt = base64ToUint8Array(file.salt);
    const iv = base64ToUint8Array(file.iv);
    const ciphertext = base64ToArrayBuffer(file.data);
    const key = await deriveKey(password, salt);
    plaintext = await decryptData(ciphertext, key, iv);
  } catch {
    // AES-GCM authenticates the ciphertext: a tag mismatch means either a
    // wrong password or tampered data. The two are cryptographically
    // indistinguishable, and pretending otherwise would be a lie.
    throw new VaultError(sourceCode(source, 'authentication_failed'));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext);
  } catch {
    throw new VaultError(sourceCode(source, 'corrupted'));
  }

  assertVaultShape(parsed);
  return parsed;
}

export async function encryptVault(vault: VaultDecrypted, password: string): Promise<VaultEncryptedFile> {
  // A fresh salt per save keeps the KDF output unique for identical passwords.
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await deriveKey(password, salt);
  const { ciphertext, iv } = await encryptData(JSON.stringify(vault), key);

  return {
    salt: uint8ArrayToBase64(salt),
    iv: uint8ArrayToBase64(iv),
    data: arrayBufferToBase64(ciphertext),
    vaultVersion: VAULT_FORMAT_VERSION,
  };
}

export function buildExportPackage(vault: VaultDecrypted, encrypted: VaultEncryptedFile): ExportPackage {
  return {
    exportVersion: VAULT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    deviceId: vault.deviceId,
    vaultData: encrypted,
  };
}

export function emptyVault(): VaultDecrypted {
  const now = new Date().toISOString();
  return {
    vaultVersion: VAULT_FORMAT_VERSION,
    deviceId: globalThis.crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    accounts: [],
    conflicts: [],
    history: [],
  };
}

export function newPasswordHistory(password: string, updatedAt: string): PasswordHistory {
  return { password, updatedAt };
}

export type { AccountEntry, ConflictEntry };
