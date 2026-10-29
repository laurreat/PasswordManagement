"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { AccountEntry, ConflictEntry, VaultDecrypted } from '@/lib/types';
import { decryptVaultFile, encryptVault, buildExportPackage, emptyVault, parseVaultEnvelope } from '@/lib/vault-storage';
import { toVaultErrorCode, type VaultErrorCode } from '@/lib/vault-errors';
import { createVaultStore, type VaultStore } from '@/lib/vault-store';
import { suggestDeviceName, withDeviceName } from '@/lib/sync/device';
import { dedupeAccounts, mergeImportedVault } from '@/lib/vault-merge';
import { toast } from '@/hooks/use-toast';
import { useUISettings } from '@/hooks/use-ui-settings';

export type UnlockResult =
  | { ok: true }
  | { ok: false; code: VaultErrorCode };

interface VaultContextType {
  isLocked: boolean;
  isInitialized: boolean;
  /** True while the stored envelope is being located; the UI must wait. */
  isLoading: boolean;
  vault: VaultDecrypted | null;
  unlock: (password: string) => Promise<UnlockResult>;
  lock: () => void;
  resetVault: () => Promise<void>;
  initialize: (password: string) => Promise<void>;
  updateVault: (updater: (v: VaultDecrypted) => VaultDecrypted) => Promise<void>;
  saveVault: (decrypted: VaultDecrypted, password: string) => Promise<void>;
  importVault: (fileContent: string, password: string) => Promise<void>;
  exportVault: () => Promise<string>;
}

const VaultContext = createContext<VaultContextType | null>(null);

const AUTO_LOCK_MINUTES = 10;

export const VaultProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useUISettings();
  const [vault, setVault] = useState<VaultDecrypted | null>(null);
  const [isLocked, setIsLocked] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [masterPassword, setMasterPassword] = useState<string | null>(null);
  const storeRef = useRef<VaultStore | null>(null);

  // Created lazily: the store needs `window`, which does not exist while the
  // static export is being server-rendered.
  const store = useCallback((): VaultStore => {
    if (!storeRef.current) storeRef.current = createVaultStore();
    return storeRef.current;
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const saved = await store().read();
        if (!cancelled) setIsInitialized(Boolean(saved));
      } catch {
        // We could not prove there is no vault. Sending the user to setup
        // would invite them to overwrite a file that may still be readable.
        if (!cancelled) setIsInitialized(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [store]);

  const lock = useCallback(() => {
    setVault(null);
    setMasterPassword(null);
    setIsLocked(true);
  }, []);

  const resetVault = useCallback(async () => {
    try {
      await store().remove();
    } catch {
      // The in-memory vault is gone either way. A failed delete surfaces on
      // the next unlock instead of pretending the data is gone.
    }

    setVault(null);
    setMasterPassword(null);
    setIsLocked(true);
    setIsInitialized(false);
  }, [store]);

  useEffect(() => {
    if (isLocked) return;

    let timer: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        lock();
        toast({
          title: t('app.auto_lock_title'),
          description: t('app.auto_lock_desc'),
        });
      }, AUTO_LOCK_MINUTES * 60 * 1000);
    };

    const activityEvents = ['mousemove', 'keydown', 'mousedown', 'scroll', 'touchstart'];
    activityEvents.forEach(event => window.addEventListener(event, resetTimer));
    resetTimer();

    return () => {
      clearTimeout(timer);
      activityEvents.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, [isLocked, lock, t]);

  const unlock = async (password: string): Promise<UnlockResult> => {
    let saved: string | null;

    try {
      saved = await store().read();
    } catch (error) {
      return { ok: false, code: toVaultErrorCode(error, 'vault_read_failed') };
    }

    if (!saved) return { ok: false, code: 'vault_missing' };

    try {
      const envelope = parseVaultEnvelope(saved, 'stored');
      const decryptedVault = await decryptVaultFile(envelope, password, 'stored');
      setVault(decryptedVault);
      setMasterPassword(password);
      setIsLocked(false);
      setIsInitialized(true);
      return { ok: true };
    } catch (error) {
      return { ok: false, code: toVaultErrorCode(error, 'vault_corrupted') };
    }
  };

  const saveVault = async (decrypted: VaultDecrypted, password: string) => {
    decrypted.updatedAt = new Date().toISOString();
    const encrypted = await encryptVault(decrypted, password);
    await store().write(JSON.stringify(encrypted));
    setVault({ ...decrypted });
    setIsInitialized(true);
  };

  const initialize = async (password: string) => {
    // The name only labels this device in the change list; it is not an
    // account and never leaves the folder the user chose.
    const vaultToSave = withDeviceName(emptyVault(), suggestDeviceName(navigator.userAgent));
    await saveVault(vaultToSave, password);
    setMasterPassword(password);
    setIsLocked(false);
  };

  const updateVault = async (updater: (v: VaultDecrypted) => VaultDecrypted) => {
    if (!vault || !masterPassword) return;

    const updated = updater({ ...vault });
    const { accounts, conflicts } = dedupeAccounts(updated.accounts, updated.conflicts);

    await saveVault({ ...updated, accounts, conflicts }, masterPassword);
  };

  const exportVault = async (): Promise<string> => {
    if (!vault) return '';

    let saved: string | null;

    try {
      saved = await store().read();
    } catch {
      return '';
    }

    if (!saved) return '';

    const envelope = parseVaultEnvelope(saved, 'stored');
    return JSON.stringify(buildExportPackage(vault, envelope), null, 2);
  };

  const importVault = async (fileContent: string, password: string) => {
    const envelope = parseVaultEnvelope(fileContent, 'backup');
    const importedVault = await decryptVaultFile(envelope, password, 'backup');

    if (!vault) {
      await saveVault(importedVault, password);
      setMasterPassword(password);
      setIsLocked(false);
      toast({
        title: t('conflicts.synced_title'),
        description: `${importedVault.accounts.length} ${t('form.accounts_imported')}`,
      });
      return;
    }

    const merged = mergeImportedVault(vault, importedVault);
    await saveVault(merged, masterPassword as string);
    toast({
      title: t('conflicts.synced_title'),
      description: `${merged.accounts.length} ${t('form.accounts_imported')}`,
    });
  };

  return (
    <VaultContext.Provider value={{
      isLocked, isInitialized, isLoading, vault, unlock, lock, resetVault, initialize, updateVault, saveVault, importVault, exportVault
    }}>
      {children}
    </VaultContext.Provider>
  );
};

export const useVault = () => {
  const context = useContext(VaultContext);
  if (!context) throw new Error('useVault must be used within a VaultProvider');
  return context;
};

export type { AccountEntry, ConflictEntry };
