/**
 * LocalPass - Vault error taxonomy
 *
 * The UI must be able to tell the difference between a wrong master password
 * and a damaged file. Before this module every failure collapsed into
 * `return false`, which made a corrupted vault look like a typo and gave the
 * user no recovery path.
 */

export type VaultErrorCode =
  | 'vault_missing'
  | 'vault_corrupted'
  | 'vault_authentication_failed'
  | 'vault_unsupported_version'
  | 'vault_write_failed'
  | 'backup_corrupted'
  | 'backup_authentication_failed'
  | 'backup_unsupported_version';

export class VaultError extends Error {
  readonly code: VaultErrorCode;

  constructor(code: VaultErrorCode) {
    super(code);
    this.name = 'VaultError';
    this.code = code;
  }
}

export function isVaultError(error: unknown): error is VaultError {
  return error instanceof VaultError;
}

export function toVaultErrorCode(error: unknown, fallback: VaultErrorCode): VaultErrorCode {
  return isVaultError(error) ? error.code : fallback;
}
