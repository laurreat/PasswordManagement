import type { VaultErrorCode } from '@/lib/vault-errors';

/**
 * Translation keys for every failure the vault layer can report. Keeping the
 * mapping in one place stops the UI from drifting back to a generic
 * "wrong password" message for every error.
 */
export const VAULT_ERROR_MESSAGE_KEYS: Record<VaultErrorCode, string> = {
  vault_missing: 'app.error_vault_missing',
  vault_corrupted: 'app.error_vault_corrupted',
  vault_authentication_failed: 'app.error_vault_authentication_failed',
  vault_unsupported_version: 'app.error_vault_unsupported_version',
  vault_read_failed: 'app.error_vault_read_failed',
  vault_write_failed: 'app.error_vault_write_failed',
  backup_corrupted: 'app.error_backup_corrupted',
  backup_authentication_failed: 'app.error_backup_authentication_failed',
  backup_unsupported_version: 'app.error_backup_unsupported_version',
};

export function vaultErrorMessageKey(code: VaultErrorCode): string {
  return VAULT_ERROR_MESSAGE_KEYS[code];
}
