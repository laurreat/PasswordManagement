/**
 * LocalPass - Vault storage adapter
 *
 * The vault used to live in `localStorage`. That works inside a browser tab,
 * but it is not a file, it does not survive a WebView data wipe on Android and
 * the user cannot back it up. When the Electron bridge is present the vault is
 * written to a real file; the browser build keeps the old behaviour.
 *
 * Nothing here decrypts anything: the store only moves opaque envelopes.
 */

import { VaultError } from './vault-errors.ts';
import { getBridge, type LocalPassBridge } from './localpass-bridge.ts';
import { VAULT_STORAGE_KEY } from './vault-storage.ts';

/** Set once the legacy copy has been handed over (or deliberately skipped). */
export const VAULT_MIGRATION_KEY = 'localpass_vault_migrated';

export interface VaultStore {
  readonly kind: 'file' | 'local';
  read(): Promise<string | null>;
  write(payload: string): Promise<void>;
  remove(): Promise<void>;
}

function browserStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    // Accessing localStorage throws when storage is disabled by policy.
    return null;
  }
}

/**
 * Moves a vault written by an older build into the file, once.
 *
 * The legacy entry is kept as a safety net: it is already encrypted with the
 * same master password, and the flag is what prevents a stale copy from ever
 * overwriting a newer file. A file that already exists always wins.
 */
async function migrateFromLocalStorage(bridge: LocalPassBridge): Promise<void> {
  const storage = browserStorage();
  if (!storage) return;

  try {
    if (storage.getItem(VAULT_MIGRATION_KEY) === '1') return;
  } catch {
    return;
  }

  let legacy: string | null = null;
  try {
    legacy = storage.getItem(VAULT_STORAGE_KEY);
  } catch {
    return;
  }

  if (!legacy) {
    try {
      storage.setItem(VAULT_MIGRATION_KEY, '1');
    } catch {
      /* the flag is an optimisation, not a requirement */
    }
    return;
  }

  let existing: string | null;
  try {
    existing = await bridge.vault.read();
  } catch {
    throw new VaultError('vault_read_failed');
  }

  if (existing === null) {
    try {
      await bridge.vault.write(legacy);
    } catch {
      throw new VaultError('vault_write_failed');
    }

    let written: string | null;
    try {
      written = await bridge.vault.read();
    } catch {
      throw new VaultError('vault_write_failed');
    }

    if (written !== legacy) throw new VaultError('vault_write_failed');
  }

  try {
    storage.setItem(VAULT_MIGRATION_KEY, '1');
  } catch {
    /* see above */
  }
}

class FileVaultStore implements VaultStore {
  readonly kind = 'file' as const;
  private readonly bridge: LocalPassBridge;
  private migration: Promise<void> | null = null;

  constructor(bridge: LocalPassBridge) {
    this.bridge = bridge;
  }

  private ensureMigrated(): Promise<void> {
    if (!this.migration) {
      this.migration = migrateFromLocalStorage(this.bridge).catch((error: unknown) => {
        // A failed migration must not poison every later read.
        this.migration = null;
        throw error;
      });
    }

    return this.migration;
  }

  async read(): Promise<string | null> {
    await this.ensureMigrated();

    try {
      return await this.bridge.vault.read();
    } catch {
      throw new VaultError('vault_read_failed');
    }
  }

  async write(payload: string): Promise<void> {
    try {
      await this.bridge.vault.write(payload);
    } catch {
      throw new VaultError('vault_write_failed');
    }
  }

  async remove(): Promise<void> {
    try {
      await this.bridge.vault.remove();
    } catch {
      throw new VaultError('vault_write_failed');
    }
  }
}

class LocalVaultStore implements VaultStore {
  readonly kind = 'local' as const;

  async read(): Promise<string | null> {
    const storage = browserStorage();
    if (!storage) return null;

    try {
      return storage.getItem(VAULT_STORAGE_KEY);
    } catch {
      throw new VaultError('vault_read_failed');
    }
  }

  async write(payload: string): Promise<void> {
    const storage = browserStorage();
    if (!storage) throw new VaultError('vault_write_failed');

    try {
      storage.setItem(VAULT_STORAGE_KEY, payload);
    } catch {
      throw new VaultError('vault_write_failed');
    }
  }

  async remove(): Promise<void> {
    const storage = browserStorage();
    if (!storage) return;

    try {
      storage.removeItem(VAULT_STORAGE_KEY);
    } catch {
      throw new VaultError('vault_write_failed');
    }
  }
}

export function createVaultStore(bridge: LocalPassBridge | null = getBridge()): VaultStore {
  return bridge ? new FileVaultStore(bridge) : new LocalVaultStore();
}
