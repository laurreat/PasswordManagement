"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useVault } from '@/hooks/use-vault';
import { createSyncStore, type SyncStore } from '@/lib/sync/sync-store';
import { emptyChangeLog, diffFields } from '@/lib/sync/changes';
import {
  adoptBaseline,
  commitDraft,
  enableSync as enableSyncEngine,
  ensureRelayBaseline,
  needsBaseline,
  publishAppliedChange,
  relayAppliedChanges,
  type PublishableChange,
} from '@/lib/sync/engine';
import { applyChangeLog, summarizeChangeLog, type ChangeSummary } from '@/lib/sync/apply';
import { createDraft, removeDraft, upsertDraft, type CreateDraftInput } from '@/lib/drafts';
import {
  appendAccountChange,
  createAccountChange,
  historyFromLog,
  mergeAccountHistory,
} from '@/lib/change-history';
import type { ApplyOutcome, ChangeEntry, ChangeLogFile } from '@/lib/sync/types';
import type { AccountChangeRecord, AccountEntry, VaultDecrypted, VaultDraft } from '@/lib/types';
import { toast } from '@/hooks/use-toast';
import { useUISettings } from '@/hooks/use-ui-settings';

export type PeerPendingChange = {
  peerDevice: { deviceId: string; deviceName: string };
  entry: ChangeEntry;
};

export type PeerPreviewItem = {
  entry: ChangeEntry;
  outcome: ApplyOutcome;
};

export type PeerLoadPreview = {
  deviceId: string;
  deviceName: string;
  summary: ChangeSummary;
  attention: PeerPreviewItem[];
  requiresConfirmation: boolean;
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
  publishAccountChanges: (changes: PublishableChange[]) => Promise<boolean>;
  peerChanges: PeerPendingChange[];
  previewPeerChanges: (deviceId: string) => Promise<PeerLoadPreview | null>;
  loadPeerChanges: (deviceId: string) => Promise<void>;
  history: AccountChangeRecord[];
  totalPendingCount: number;
}

const SyncContext = createContext<SyncContextType | null>(null);

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useUISettings();
  const { vault, masterPassword, saveVault, updateVault } = useVault();

  const [store, setStore] = useState<SyncStore | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [peerLogs, setPeerLogs] = useState<ChangeLogFile[]>([]);
  const [ownLog, setOwnLog] = useState<ChangeLogFile | null>(null);
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
        setOwnLog(null);
        return;
      }

      try {
        setOwnLog(await store.read(vault.deviceId, masterPassword));
      } catch {
        setOwnLog(null);
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

  const history = useMemo(() => {
    const stored = vault?.history ?? [];
    const backfilled = ownLog ? historyFromLog(ownLog) : [];
    return mergeAccountHistory(stored, backfilled);
  }, [vault, ownLog]);

  const peerChanges = useMemo(() => {
    if (!vault) return [];
    const applied = vault.sync?.appliedSeq ?? {};
    const items: PeerPendingChange[] = [];

    for (const log of peerLogs) {
      const cursor = applied[log.deviceId] ?? 0;
      for (const entry of log.entries) {
        if (entry.seq <= cursor) continue;

        // Relayed copies of our own changes, or of changes we already applied
        // directly, are not pending work for this device.
        if (entry.originDeviceId === vault.deviceId) continue;
        if (
          entry.originDeviceId &&
          entry.originSeq !== undefined &&
          entry.originSeq <= (applied[entry.originDeviceId] ?? 0)
        ) {
          continue;
        }

        items.push({
          peerDevice: { deviceId: log.deviceId, deviceName: log.deviceName },
          entry,
        });
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

  // A folder alone does not make sync active: the baseline entry is what
  // peers rebuild from, and only `enableSync` creates it.
  const isSyncEnabled = Boolean(folder && ownLog?.baseline);

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

  /** Commits one or more drafts against a single vault snapshot. */
  const commitDrafts = async (draftsToCommit: VaultDraft[]) => {
    if (!vault || !masterPassword || draftsToCommit.length === 0) return;

    try {
      let nextVault = vault;

      if (store && folder && isSyncEnabled) {
        let currentLog = await store.read(vault.deviceId, masterPassword);
        if (!currentLog) {
          currentLog = emptyChangeLog(vault.deviceId, vault.sync?.deviceName || 'Local Device');
          currentLog = enableSyncEngine(currentLog, vault).log;
        }

        for (const draft of draftsToCommit) {
          const staged = commitDraft(currentLog, nextVault, draft);
          currentLog = staged.log;
          nextVault = appendAccountChange(
            staged.vault,
            createAccountChange({
              type: draft.type,
              before: draft.before,
              after: draft.after,
              deviceId: vault.deviceId,
              deviceName: vault.sync?.deviceName || undefined,
              source: 'local',
              changeId: staged.entry.changeId,
            })
          );
        }

        await store.write(currentLog, masterPassword);
        setOwnLog(currentLog);
      } else {
        // Local-only commit without sync folder
        for (const draft of draftsToCommit) {
          let updatedAccounts = [...nextVault.accounts];
          if (draft.type === 'create' && draft.after) {
            updatedAccounts.push({ ...draft.after, revision: 1 });
          } else if (draft.type === 'update' && draft.after) {
            const rev = (draft.before?.revision ?? 0) + 1;
            updatedAccounts = updatedAccounts.map((account) =>
              account.id === draft.accountId ? { ...draft.after!, revision: rev } : account
            );
          } else if (draft.type === 'delete') {
            updatedAccounts = updatedAccounts.filter((account) => account.id !== draft.accountId);
          }

          nextVault = appendAccountChange(
            {
              ...nextVault,
              accounts: updatedAccounts,
              drafts: removeDraft(nextVault.drafts ?? [], draft.draftId),
            },
            createAccountChange({
              type: draft.type,
              before: draft.before,
              after: draft.after,
              deviceId: vault.deviceId,
              deviceName: vault.sync?.deviceName || undefined,
              source: 'local',
            })
          );
        }

        nextVault = { ...nextVault, updatedAt: new Date().toISOString() };
      }

      await saveVault(nextVault, masterPassword);

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

  const commitSingleDraft = async (draft: VaultDraft) => commitDrafts([draft]);

  const commitAllDrafts = async () => commitDrafts(drafts);

  /**
   * Publishes mutations that already reached the vault without a draft. The
   * local save happened before this call, so a failed log write never rolls
   * the vault back: the user is told the change is local-only.
   */
  const publishAccountChanges = async (changes: PublishableChange[]): Promise<boolean> => {
    if (!store || !folder || !vault || !masterPassword || !isSyncEnabled) return false;

    const publishable = changes.filter((change) => {
      if (change.type !== 'update' || !change.before || !change.after) return true;
      if (change.allowEmptyDiff) return true;
      return diffFields(change.before, change.after).length > 0;
    });
    if (publishable.length === 0) return true;

    try {
      const currentLog = await store.read(vault.deviceId, masterPassword);
      // The vault is already saved with these mutations, so a missing log is a
      // publish failure: rebuilding a baseline here would capture the mutation
      // and replay it again on every peer.
      if (!currentLog) throw new Error('sync log missing');

      let nextLog = currentLog;
      for (const change of publishable) {
        nextLog = publishAppliedChange(nextLog, change).log;
      }

      await store.write(nextLog, masterPassword);
      setOwnLog(nextLog);
      return true;
    } catch {
      toast({
        title: t('app.error'),
        description: t('sync.publish_failed'),
        variant: 'destructive',
      });
      return false;
    }
  };

  /** Reads and decrypts a peer log, adopting its baseline when this vault is new. */
  const readPeer = async (deviceId: string) => {
    if (!store || !vault || !masterPassword) return null;

    const peerLog = await store.read(deviceId, masterPassword);
    if (!peerLog) return null;

    let baseVault = vault;
    let seededAccounts = 0;

    if (needsBaseline(baseVault)) {
      const seeded = adoptBaseline(baseVault, peerLog);
      if (seeded) {
        baseVault = seeded;
        seededAccounts = seeded.accounts.length;
      }
    }

    const result = applyChangeLog(baseVault, peerLog);
    return { peerLog, baseVault, result, seededAccounts };
  };

  const previewPeerChanges = async (deviceId: string): Promise<PeerLoadPreview | null> => {
    try {
      const data = await readPeer(deviceId);
      if (!data) return null;

      const summary = summarizeChangeLog(data.peerLog, data.result.outcomes);
      const entries = new Map(data.peerLog.entries.map((entry) => [entry.changeId, entry]));
      const attention: PeerPreviewItem[] = [];

      for (const outcome of data.result.outcomes) {
        const entry = entries.get(outcome.changeId);
        if (!entry) continue;
        if (outcome.kind === 'conflict' || (outcome.kind === 'applied' && entry.type === 'delete')) {
          attention.push({ entry, outcome });
        }
      }

      attention.sort((first, second) => first.entry.seq - second.entry.seq);

      return {
        deviceId,
        deviceName: data.peerLog.deviceName,
        summary,
        attention,
        requiresConfirmation: attention.length > 0,
      };
    } catch {
      toast({
        title: t('app.error'),
        description: t('app.error_sync_read_failed'),
        variant: 'destructive',
      });
      return null;
    }
  };

  const loadPeerChanges = async (deviceId: string) => {
    if (!store || !vault || !masterPassword) return;

    try {
      const data = await readPeer(deviceId);
      if (!data) return;

      const { peerLog, baseVault, result, seededAccounts } = data;
      const summary = summarizeChangeLog(peerLog, result.outcomes);

      const storedOwnLog = await store.read(vault.deviceId, masterPassword);
      let ownLog = storedOwnLog ?? emptyChangeLog(vault.deviceId, vault.sync?.deviceName || 'Local Device');

      if (!ownLog.baseline) {
        ownLog = enableSyncEngine(ownLog, baseVault).log;
      } else {
        ownLog = ensureRelayBaseline(ownLog, baseVault);
      }

      const relayed = relayAppliedChanges(ownLog, peerLog, result.outcomes);
      if (relayed !== storedOwnLog) await store.write(relayed, masterPassword);

      // A load can create our own log before sync is enabled. Keep the vault's
      // device name in step with the name published in that log.
      const nextVault = result.vault.sync?.deviceName
        ? result.vault
        : {
            ...result.vault,
            sync: {
              deviceName: ownLog.deviceName,
              appliedSeq: result.vault.sync?.appliedSeq ?? {},
            },
          };

      await saveVault(nextVault, masterPassword);

      const parts: string[] = [];
      if (seededAccounts > 0) parts.push(`${seededAccounts} ${t('changes.baseline_count')}`);
      if (summary.creates > 0) parts.push(`${summary.creates} ${t('changes.new_count')}`);
      if (summary.updates > 0) parts.push(`${summary.updates} ${t('changes.updated_count')}`);
      if (summary.deletes > 0) parts.push(`${summary.deletes} ${t('changes.deleted_count')}`);
      if (summary.conflicts > 0) parts.push(`${summary.conflicts} ${t('changes.conflict_count')}`);

      toast({
        title: t('changes.loaded_title'),
        description: parts.length > 0 ? parts.join(' · ') : t('changes.empty_remote_desc'),
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
        publishAccountChanges,
        peerChanges,
        previewPeerChanges,
        loadPeerChanges,
        history,
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
