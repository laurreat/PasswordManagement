"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { VaultDecrypted, AccountEntry, ConflictEntry, VaultEncryptedFile, ExportPackage } from '@/lib/types';
import { deriveKey, encryptData, decryptData, base64ToArrayBuffer, base64ToUint8Array, uint8ArrayToBase64, arrayBufferToBase64 } from '@/lib/crypto-utils';
import { toast } from '@/hooks/use-toast';
import { useUISettings } from '@/hooks/use-ui-settings';

interface VaultContextType {
  isLocked: boolean;
  isInitialized: boolean;
  vault: VaultDecrypted | null;
  unlock: (password: string) => Promise<boolean>;
  lock: () => void;
  resetVault: () => void;
  initialize: (password: string) => Promise<void>;
  updateVault: (updater: (v: VaultDecrypted) => VaultDecrypted) => Promise<void>;
  saveVault: (decrypted: VaultDecrypted, password: string) => Promise<void>;
  importVault: (fileContent: string, password: string) => Promise<void>;
  exportVault: () => string;
}

const VaultContext = createContext<VaultContextType | null>(null);

const STORAGE_KEY = 'localpass_vault';
const AUTO_LOCK_MINUTES = 10;

export const VaultProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useUISettings();
  const [vault, setVault] = useState<VaultDecrypted | null>(null);
  const [isLocked, setIsLocked] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [masterPassword, setMasterPassword] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    setIsInitialized(!!saved);
  }, []);

  const lock = useCallback(() => {
    setVault(null);
    setMasterPassword(null);
    setIsLocked(true);
  }, []);

  const resetVault = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setVault(null);
    setMasterPassword(null);
    setIsLocked(true);
    setIsInitialized(false);
  }, []);

  useEffect(() => {
    if (isLocked) return;
    
    let timer: NodeJS.Timeout;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        lock();
        toast({ 
          title: t('app.auto_lock_title'), 
          description: t('app.auto_lock_desc') 
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

  const unlock = async (password: string): Promise<boolean> => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return false;

    try {
      const encryptedFile: VaultEncryptedFile = JSON.parse(saved);
      const salt = base64ToUint8Array(encryptedFile.salt);
      const iv = base64ToUint8Array(encryptedFile.iv);
      const ciphertext = base64ToArrayBuffer(encryptedFile.data);

      const key = await deriveKey(password, salt);
      const decryptedStr = await decryptData(ciphertext, key, iv);
      
      const decryptedVault: VaultDecrypted = JSON.parse(decryptedStr);
      setVault(decryptedVault);
      setMasterPassword(password);
      setIsLocked(false);
      return true;
    } catch (e: any) {
      return false;
    }
  };

  const saveVault = async (decrypted: VaultDecrypted, password: string) => {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(password, salt);
    
    decrypted.updatedAt = new Date().toISOString();
    const { ciphertext, iv } = await encryptData(JSON.stringify(decrypted), key);

    const file: VaultEncryptedFile = {
      salt: uint8ArrayToBase64(salt),
      iv: uint8ArrayToBase64(iv),
      data: arrayBufferToBase64(ciphertext),
      vaultVersion: "1.0"
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
    setVault(decrypted);
    setIsInitialized(true);
  };

  const initialize = async (password: string) => {
    const newVault: VaultDecrypted = {
      vaultVersion: "1.0",
      deviceId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      accounts: [],
      conflicts: []
    };
    await saveVault(newVault, password);
    setMasterPassword(password);
    setVault(newVault);
    setIsLocked(false);
  };

  const updateVault = async (updater: (v: VaultDecrypted) => VaultDecrypted) => {
    if (!vault || !masterPassword) return;
    const updated = updater({ ...vault });
    
    const accounts = [...updated.accounts];
    const conflicts = [...updated.conflicts];
    const seen = new Map<string, AccountEntry>();

    for (const acc of accounts) {
      const key = `${acc.sitio.toLowerCase()}|${acc.usuario.toLowerCase()}`;
      const existing = seen.get(key);
      
      if (existing) {
        if (existing.password !== acc.password) {
          const alreadyHasConflict = conflicts.some(c => 
            (c.versionLocal.password === existing.password && c.versionImportada.password === acc.password) ||
            (c.versionLocal.password === acc.password && c.versionImportada.password === existing.password)
          );

          if (!alreadyHasConflict) {
            conflicts.push({
              conflictId: crypto.randomUUID(),
              sitio: acc.sitio,
              usuario: acc.usuario,
              versionLocal: existing,
              versionImportada: acc,
              detectedAt: new Date().toISOString()
            });
          }
        } else {
          if (new Date(acc.updatedAt) > new Date(existing.updatedAt)) {
            seen.set(key, acc);
          }
        }
      } else {
        seen.set(key, acc);
      }
    }

    updated.accounts = Array.from(seen.values());
    updated.conflicts = conflicts;
    updated.updatedAt = new Date().toISOString();

    await saveVault(updated, masterPassword);
  };

  const exportVault = () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved || !vault) return "";
    
    const exportPackage: ExportPackage = {
      exportVersion: "1.0",
      exportedAt: new Date().toISOString(),
      deviceId: vault.deviceId,
      vaultData: JSON.parse(saved)
    };
    
    return JSON.stringify(exportPackage, null, 2);
  };

  const importVault = async (fileContent: string, password: string) => {
    const rawContent = fileContent.trim().replace(/^\uFEFF/, '');
    if (!rawContent) throw new Error(t('app.import_error'));

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      throw new Error(t('app.import_error'));
    }

    const encryptedData: VaultEncryptedFile = (parsed as any)?.vaultData ?? (parsed as any);
    if (!encryptedData?.salt || !encryptedData?.iv || !encryptedData?.data) {
      throw new Error(t('app.import_error'));
    }

    let decryptedStr: string;
    try {
      const salt = base64ToUint8Array(encryptedData.salt);
      const iv = base64ToUint8Array(encryptedData.iv);
      const ciphertext = base64ToArrayBuffer(encryptedData.data);
      const key = await deriveKey(password, salt);
      decryptedStr = await decryptData(ciphertext, key, iv);
    } catch (e) {
      throw new Error(t('app.import_wrong_password'));
    }

    let importedVault: VaultDecrypted;
    try {
      importedVault = JSON.parse(decryptedStr) as VaultDecrypted;
    } catch {
      throw new Error(t('app.import_error'));
    }

    const importedAccounts = Array.isArray(importedVault.accounts) ? importedVault.accounts : [];
    const importedConflicts = Array.isArray(importedVault.conflicts) ? importedVault.conflicts : [];

    if (!vault) {
      const emptyVault: VaultDecrypted = {
        vaultVersion: '1.0',
        deviceId: importedVault.deviceId ?? crypto.randomUUID(),
        createdAt: importedVault.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        accounts: importedAccounts,
        conflicts: importedConflicts,
      };
      await saveVault(emptyVault, password);
      setMasterPassword(password);
      setIsLocked(false);
      toast({
        title: t('conflicts.synced_title'),
        description: `${importedAccounts.length} ${t('form.accounts_imported')}`,
      });
      return;
    }

    const mergedAccounts: AccountEntry[] = [...vault.accounts];
    const newConflicts: ConflictEntry[] = [...vault.conflicts];

    for (const importedAcc of importedAccounts) {
      const localByMatch = mergedAccounts.find(
        (a) =>
          a.sitio.toLowerCase() === importedAcc.sitio.toLowerCase() &&
          a.usuario.toLowerCase() === importedAcc.usuario.toLowerCase()
      );

      if (!localByMatch) {
        mergedAccounts.push(importedAcc);
      } else {
        if (localByMatch.password !== importedAcc.password) {
          newConflicts.push({
            conflictId: crypto.randomUUID(),
            sitio: importedAcc.sitio,
            usuario: importedAcc.usuario,
            versionLocal: { ...localByMatch },
            versionImportada: { ...importedAcc },
            detectedAt: new Date().toISOString(),
          });
        } else if (new Date(importedAcc.updatedAt) > new Date(localByMatch.updatedAt)) {
          const idx = mergedAccounts.indexOf(localByMatch);
          mergedAccounts[idx] = { ...importedAcc };
        }
      }
    }

    const mergedVault: VaultDecrypted = {
      ...vault,
      accounts: mergedAccounts,
      conflicts: newConflicts,
      updatedAt: new Date().toISOString(),
    };

    await saveVault(mergedVault, masterPassword!);
    setVault(mergedVault);
    toast({
      title: t('conflicts.synced_title'),
      description: `${mergedAccounts.length} ${t('form.accounts_imported')}`,
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