"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useVault } from '@/hooks/use-vault';
import { createSyncStore, type SyncStore } from '@/lib/sync/sync-store';
import { emptyChangeLog } from '@/lib/sync/changes';
import { adoptBaseline, commitDraft, enableSync as enableSyncEngine, needsBaseline } from '@/lib/sync/engine';
import { applyChangeLog } from '@/lib/sync/apply';
import { createDraft, removeDraft, upsertDraft, type CreateDraftInput } from '@/lib/drafts';
import type { ChangeEntry, ChangeLogFile } from '@/lib/sync/types';
import type { AccountEntry, VaultDecrypted, VaultDraft } from '@/lib/types';
import { toast } from '@/hooks/use-toast';
import { useUISettings } from '@/hooks/use-ui-settings';

export type PeerPendingChange = {
  peerDevice: { deviceId: string; deviceName: string };
  entry: ChangeEntry;
};

interface SyncContextType {
  isAvailable: boolean;
  folder: string | null;
  chooseFolder: () => Promise<void>;
  deviceName: string;
  setDeviceName: (name: string) => Promise<void>;
  enableSync: () => Promise<void>;
  isSyncEnabled: boolean;
  refresh: () => Promise<void>;
  isRefreshing: boolean;
  drafts: VaultDraft[];
  stageAccountDraft: (input: CreateDraftInput) => Promise<void>;
  discardDraft: (draftId: string) => Promise<void>;
  commitSingleDraft: (draft: VaultDraft) => Promise<void>;
  commitAllDrafts: () => Promise<void>;
  peerChanges: PeerPendingChange[];
  loadPeerChanges: (deviceId: string) => Promise<void>;
  totalPendingCount: number;
}

const SyncContext = createContext<SyncContextType | null>(null);

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useUISettings();
  const { vault, masterPassword, saveVault, updateVault } = useVault();

  const [store, setStore] = useState<SyncStore | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [peerLogs, setPeerLogs] = useState<ChangeLogFile[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const s = createSyncStore();
    setStore(s);
  }, []);

  const deviceName = useMemo(() => {
    return vault?.sync?.deviceName || '';
  }, [vault]);

  // Load initial folder status
  useEffect(() => {
    if (!store) return;
    store.folder().then((f) => setFolder(f)).catch(() => {});
  }, [store]);

  const refresh = useCallback(async () => {
    if (!store || !vault || !masterPassword) return;
    setIsRefreshing(true);
    try {
      const activeFolder = await store.folder();
      setFolder(activeFolder);
      if (!activeFolder) {
        setPeerLogs([]);
        return;
      }

      const deviceIds = await store.listDevices();
      const loadedLogs: ChangeLogFile[] = [];

      for (const id of deviceIds) {
        if (id === vault.deviceId) continue;
        try {
          const log = await store.read(id, masterPassword);
          if (log) loadedLogs.push(log);
        } catch {
          // Password mismatch or corrupted peer log
        }
      }
      setPeerLogs(loadedLogs);
    } catch {
      // Non-critical background refresh failure
    } finally {
      setIsRefreshing(false);
    }
  }, [store, vault, masterPassword]);

  useEffect(() => {
    if (folder && vault && masterPassword) {
      refresh();
    }
  }, [folder, vault?.deviceId, masterPassword, refresh]);

  const drafts = useMemo(() => {
    return vault?.drafts ?? [];
  }, [vault?.drafts]);

  const peerChanges = useMemo(() => {
    if (!vault) return [];
    const applied = vault.sync?.appliedSeq ?? {};
    const items: PeerPendingChange[] = [];

    for (const log of peerLogs) {
      const cursor = applied[log.deviceId] ?? 0;
      for (const entry of log.entries) {
        if (entry.seq > cursor) {
          items.push({
            peerDevice: { deviceId: log.deviceId, deviceName: log.deviceName },
            entry,
          });
        }
      }
    }

    return items.sort((a, b) => new Date(b.entry.createdAt).getTime() - new Date(a.entry.createdAt).getTime());
  }, [vault, peerLogs]);

  const totalPendingCount = drafts.length + peerChanges.length;

  const chooseFolder = async () => {
    if (!store) return;
    try {
      const chosen = await store.chooseFolder();
      if (chosen) {
        setFolder(chosen);
        await refresh();
      }
    } catch (e) {
      toast({
        title: t('app.error'),
        description: t('app.error_sync_write_failed'),
        variant: 'destructive',
      });
    }
  };

  const setDeviceName = async (name: string) => {
    if (!vault || !masterPassword) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    let updatedVault: VaultDecrypted = {
      ...vault,
      sync: {
        ...(vault.sync ?? { appliedSeq: {} }),
        deviceName: trimmed,
      },
    };

    if (store && folder) {
      try {
        let ownLog = await store.read(vault.deviceId, masterPassword);
        if (ownLog) {
          ownLog = { ...ownLog, deviceName: trimmed };
          await store.write(ownLog, masterPassword);
        }
      } catch {
        // Continue saving vault
      }
    }

    await saveVault(updatedVault, masterPassword);
    toast({ title: t('sync.saved_title') });
  };

  const isSyncEnabled = Boolean(folder && vault?.sync?.deviceName);

  const enableSync = async () => {
    if (!store || !vault || !masterPassword) return;
    try {
      let activeFolder = folder;
      if (!activeFolder) {
        activeFolder = await store.chooseFolder();
        if (!activeFolder) return;
        setFolder(activeFolder);
      }

      let ownLog = await store.read(vault.deviceId, masterPassword);
      if (!ownLog) {
        ownLog = emptyChangeLog(vault.deviceId, vault.sync?.deviceName || 'Local Device');
      }

      const enabled = enableSyncEngine(ownLog, vault);
      await store.write(enabled.log, masterPassword);
      await saveVault(enabled.vault, masterPassword);

      toast({
        title: t('sync.enabled'),
        description: t('sync.enabled_desc'),
      });
      await refresh();
    } catch {
      toast({
        title: t('app.error'),
        description: t('app.error_sync_write_failed'),
        variant: 'destructive',
      });
    }
  };

  const stageAccountDraft = async (input: CreateDraftInput) => {
    if (!vault) return;
    const draft = createDraft(input);
    const updatedDrafts = upsertDraft(vault.drafts ?? [], draft);
    await updateVault((v) => ({ ...v, drafts: updatedDrafts }));
    toast({
      title: t('changes.pending_draft'),
      description: t('changes.pending_draft_desc'),
    });
  };

  const discardDraft = async (draftId: string) => {
    if (!vault) return;
    const updatedDrafts = removeDraft(vault.drafts ?? [], draftId);
    await updateVault((v) => ({ ...v, drafts: updatedDrafts }));
    toast({ title: t('changes.discarded') });
  };

  const commitSingleDraft = async (draft: VaultDraft) => {
    if (!vault || !masterPassword) return;

    try {
      if (store && folder) {
        let ownLog = await store.read(vault.deviceId, masterPassword);
        if (!ownLog) {
          ownLog = emptyChangeLog(vault.deviceId, vault.sync?.deviceName || 'Local Device');
          const enabled = enableSyncEngine(ownLog, vault);
          ownLog = enabled.log;
        }

        const staged = commitDraft(ownLog, vault, draft);
        await store.write(staged.log, masterPassword);
        await saveVault(staged.vault, masterPassword);
      } else {
        // Local-only commit without sync folder
        let updatedAccounts = [...vault.accounts];
        if (draft.type === 'create' && draft.after) {
          const rev = 1;
          updatedAccounts.push({ ...draft.after, revision: rev });
        } else if (draft.type === 'update' && draft.after) {
          const rev = (draft.before?.revision ?? 0) + 1;
          updatedAccounts = updatedAccounts.map((a) => (a.id === draft.accountId ? { ...draft.after!, revision: rev } : a));
        } else if (draft.type === 'delete') {
          updatedAccounts = updatedAccounts.filter((a) => a.id !== draft.accountId);
        }

        const nextVault: VaultDecrypted = {
          ...vault,
          accounts: updatedAccounts,
          drafts: removeDraft(vault.drafts ?? [], draft.draftId),
          updatedAt: new Date().toISOString(),
        };
        await saveVault(nextVault, masterPassword);
      }

      toast({
        title: t('changes.saved_title'),
        description: t('changes.saved_desc'),
      });
    } catch {
      toast({
        title: t('app.error'),
        description: t('app.error_sync_invalid_change'),
        variant: 'destructive',
      });
    }
  };

  const commitAllDrafts = async () => {
    if (!vault || !drafts.length) return;
    for (const d of drafts) {
      await commitSingleDraft(d);
    }
  };

  const loadPeerChanges = async (deviceId: string) => {
    if (!store || !vault || !masterPassword) return;

    try {
      const peerLog = await store.read(deviceId, masterPassword);
      if (!peerLog) return;

      let currentVault = vault;
      if (needsBaseline(currentVault)) {
        const seeded = adoptBaseline(currentVault, peerLog);
        if (seeded) currentVault = seeded;
      }

      const result = applyChangeLog(currentVault, peerLog);
      await saveVault(result.vault, masterPassword);

      const conflicts = result.outcomes.filter((o) => o.kind === 'conflict').length;
      const applied = result.outcomes.filter((o) => o.kind === 'applied').length;

      toast({
        title: t('changes.loaded_title'),
        description: `${applied} ${t('changes.applied_count')}${conflicts > 0 ? ` · ${conflicts} ${t('changes.conflict_count')}` : ''}`,
      });

      await refresh();
    } catch {
      toast({
        title: t('app.error'),
        description: t('app.error_sync_read_failed'),
        variant: 'destructive',
      });
    }
  };

  return (
    <SyncContext.Provider
      value={{
        isAvailable: Boolean(store),
        folder,
        chooseFolder,
        deviceName,
        setDeviceName,
        enableSync,
        isSyncEnabled,
        refresh,
        isRefreshing,
        drafts,
        stageAccountDraft,
        discardDraft,
        commitSingleDraft,
        commitAllDrafts,
        peerChanges,
        loadPeerChanges,
        totalPendingCount,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = () => {
  const context = useContext(SyncContext);
  if (!context) throw new Error('useSync must be used within a SyncProvider');
  return context;
};
