/**
 * LocalPass - Sync errors
 *
 * Same philosophy as `VaultError`: every failure has a code the UI can
 * translate, and authentication failures are never disguised as corruption.
 */

export type SyncErrorCode =
  | 'sync_corrupted'
  | 'sync_unsupported_version'
  | 'sync_authentication_failed'
  | 'sync_invalid_change'
  | 'sync_read_failed'
  | 'sync_write_failed'
  | 'sync_folder_missing';

export class SyncError extends Error {
  readonly code: SyncErrorCode;

  constructor(code: SyncErrorCode) {
    super(code);
    this.name = 'SyncError';
    this.code = code;
  }
}

export function isSyncError(value: unknown): value is SyncError {
  return value instanceof SyncError;
}
