"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { AccountEntry, ConflictEntry, VaultDecrypted } from '@/lib/types';
import { decryptVaultFile, encryptVault, buildExportPackage, emptyVault, parseVaultEnvelope, VAULT_STORAGE_KEY } from '@/lib/vault-storage';
import { VaultError, toVaultErrorCode, type VaultErrorCode } from '@/lib/vault-errors';
import { dedupeAccounts, mergeImportedVault } from '@/lib/vault-merge';
import { toast } from '@/hooks/use-toast';
import { useUISettings } from '@/hooks/use-ui-settings';

export type UnlockResult =
  | { ok: true }
  | { ok: false; code: VaultErrorCode };

interface VaultContextType {
  isLocked: boolean;
  isInitialized: boolean;
  vault: VaultDecrypted | null;
  unlock: (password: string) => Promise<UnlockResult>;
  lock: () => void;
  resetVault: () => void;
  initialize: (password: string) => Promise<void>;
  updateVault: (updater: (v: VaultDecrypted) => VaultDecrypted) => Promise<void>;
  saveVault: (decrypted: VaultDecrypted, password: string) => Promise<void>;
  importVault: (fileContent: string, password: string) => Promise<void>;
  exportVault: () => string;
}

const VaultContext = createContext<VaultContextType | null>(null);

const AUTO_LOCK_MINUTES = 10;

function writeStoredVault(payload: string): void {
  try {
    localStorage.setItem(VAULT_STORAGE_KEY, payload);
  } catch {
    throw new VaultError('vault_write_failed');
  }
}

export const VaultProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useUISettings();
  const [vault, setVault] = useState<VaultDecrypted | null>(null);
  const [isLocked, setIsLocked] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [masterPassword, setMasterPassword] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(VAULT_STORAGE_KEY);
    // A damaged vault still counts as initialized: sending the user to setup
    // would invite them to overwrite the file they may be able to recover.
    setIsInitialized(Boolean(saved));
  }, []);

  const lock = useCallback(() => {
    setVault(null);
    setMasterPassword(null);
    setIsLocked(true);
  }, []);

  const resetVault = useCallback(() => {
    localStorage.removeItem(VAULT_STORAGE_KEY);
    setVault(null);
    setMasterPassword(null);
    setIsLocked(true);
    setIsInitialized(false);
  }, []);

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
    const saved = localStorage.getItem(VAULT_STORAGE_KEY);
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
    writeStoredVault(JSON.stringify(encrypted));
    setVault({ ...decrypted });
    setIsInitialized(true);
  };

  const initialize = async (password: string) => {
    const vaultToSave = emptyVault();
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

  const exportVault = (): string => {
    const saved = localStorage.getItem(VAULT_STORAGE_KEY);
    if (!saved || !vault) return '';

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
      isLocked, isInitialized, vault, unlock, lock, resetVault, initialize, updateVault, saveVault, importVault, exportVault
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
