/**
 * LocalPass - Sync engine
 *
 * Pure functions: they decide what a change is and how it lands in a vault.
 * Sealing and file writes belong to the caller, so every rule here is testable
 * without a disk, a password or a running app.
 *
 * Two invariants:
 *   1. A device only ever writes its own log.
 *   2. A change applies only when `baseRevision` matches; otherwise it is a
 *      conflict and the user decides.
 */

import type { AccountEntry, VaultDecrypted, VaultDraft } from '@/lib/types';
import { applyChange, applyChangeLog, baselineAccounts } from './apply.ts';
import {
  appendEntry,
  createBaseline,
  createChangeEntry,
  diffFields,
  fromSnapshot,
  nextSeq,
} from './changes.ts';
import { SyncError } from './errors.ts';
import type {
  ApplyOutcome,
  ChangeEntry,
  ChangeLogFile,
  ChangeType,
} from './types.ts';

export type StageChangeInput = {
  type: ChangeType;
  before: AccountEntry | null;
  after: AccountEntry | null;
  createdAt?: string;
  changeId?: string;
};

export type StagedChange = {
  log: ChangeLogFile;
  entry: ChangeEntry;
  vault: VaultDecrypted;
};

function assertSameDevice(log: ChangeLogFile, vault: VaultDecrypted): void {
  if (log.deviceId !== vault.deviceId) throw new SyncError('sync_invalid_change');
}

/**
 * Turns an edit into a change, applies it locally and appends it to the log.
 *
 * An edit that no longer matches the local account (a stale draft, a deleted
 * entry) is rejected instead of being written: the engine never guesses which
 * version the user meant.
 */
export function stageChange(
  log: ChangeLogFile,
  vault: VaultDecrypted,
  input: StageChangeInput
): StagedChange {
  assertSameDevice(log, vault);

  const entry = createChangeEntry({
    deviceId: log.deviceId,
    seq: nextSeq(log),
    type: input.type,
    before: input.before,
    after: input.after,
    createdAt: input.createdAt,
    changeId: input.changeId,
  });

  const applied = applyChange(vault, entry, entry.createdAt);
  if (applied.outcome.kind !== 'applied') throw new SyncError('sync_invalid_change');

  return {
    log: appendEntry(log, entry),
    entry,
    vault: applied.vault,
  };
}

/**
 * Re-publishes the peer entries that actually changed this vault. Without
 * this, a chain Windows → Android → Linux loses the Windows change at the
 * Android hop: Linux never reads the Windows file in that topology.
 *
 * The copy belongs to this device (new `deviceId` and `seq`) but keeps the
 * original author in `originDeviceId`/`originSeq`. That prevents the origin
 * from applying its own change again and prevents a peer that already saw the
 * original from applying it twice.
 */
export function relayAppliedChanges(
  ownLog: ChangeLogFile,
  peerLog: ChangeLogFile,
  outcomes: ApplyOutcome[],
  createdAt?: string
): ChangeLogFile {
  if (ownLog.deviceId === peerLog.deviceId) return ownLog;

  const applied = new Set(
    outcomes.filter((outcome) => outcome.kind === 'applied').map((outcome) => outcome.changeId)
  );
  if (applied.size === 0) return ownLog;

  let next = ownLog;
  const ordered = [...peerLog.entries].sort((first, second) => first.seq - second.seq);

  for (const entry of ordered) {
    if (!applied.has(entry.changeId)) continue;

    const relayed: ChangeEntry = {
      ...createChangeEntry({
        deviceId: next.deviceId,
        seq: nextSeq(next),
        type: entry.type,
        before: entry.before ? fromSnapshot(entry.before) : null,
        after: entry.after ? fromSnapshot(entry.after) : null,
        createdAt: createdAt ?? entry.createdAt,
      }),
      originDeviceId: entry.originDeviceId ?? entry.deviceId,
      originSeq: entry.originSeq ?? entry.seq,
    };

    next = appendEntry(next, relayed);
  }

  return next;
}

/**
 * A relayed change is only useful to a brand-new peer if this device also
 * publishes a snapshot. An empty baseline would leave the new peer with the
 * changes but none of the accounts that existed before them.
 */
export function ensureRelayBaseline(
  log: ChangeLogFile,
  vault: VaultDecrypted,
  createdAt?: string
): ChangeLogFile {
  if (log.baseline && log.baseline.accounts.length > 0) return log;
  if (vault.accounts.length === 0) return log;
  return createBaseline(log, vault.accounts, createdAt);
}

/**
 * A local mutation that was already saved to the vault and only needs to be
 * published. Used by flows that bypass drafts (CSV import, audit remediation,
 * conflict resolution).
 */
export type PublishableChange = {
  type: ChangeType;
  before: AccountEntry | null;
  after: AccountEntry | null;
  /** Set by conflict resolution: a revision-only update still must travel. */
  allowEmptyDiff?: boolean;
};

/**
 * Turns an already-applied mutation into a log entry. Validation is strict on
 * purpose: a revision that did not grow by exactly one cannot be replayed as a
 * change, and publishing it would poison every peer.
 */
export function publishAppliedChange(
  log: ChangeLogFile,
  input: PublishableChange
): { log: ChangeLogFile; entry: ChangeEntry } {
  if (input.type === 'create') {
    if (input.before !== null || input.after === null) throw new SyncError('sync_invalid_change');
    if ((input.after.revision ?? 0) !== 1) throw new SyncError('sync_invalid_change');
  } else if (input.type === 'update') {
    if (input.before === null || input.after === null) throw new SyncError('sync_invalid_change');
    if ((input.after.revision ?? 0) !== (input.before.revision ?? 0) + 1) {
      throw new SyncError('sync_invalid_change');
    }
    if (diffFields(input.before, input.after).length === 0 && !input.allowEmptyDiff) {
      throw new SyncError('sync_invalid_change');
    }
  } else if (input.before === null || input.after !== null) {
    throw new SyncError('sync_invalid_change');
  }

  const entry = createChangeEntry({
    deviceId: log.deviceId,
    seq: nextSeq(log),
    type: input.type,
    before: input.before,
    after: input.after,
    allowEmptyDiff: input.allowEmptyDiff,
  });

  return { log: appendEntry(log, entry), entry };
}

/**
 * Commits a local draft into the vault and appends it to the device log.
 * The committed draft is removed from `vault.drafts`.
 *
 * The change id is derived from `draftId`, so a retry after a failed vault
 * save re-applies the entry that is already published instead of duplicating
 * it with a new `changeId` and `seq`.
 */
export function commitDraft(
  log: ChangeLogFile,
  vault: VaultDecrypted,
  draft: VaultDraft
): StagedChange {
  const remainingDrafts = (vault.drafts ?? []).filter((d) => d.draftId !== draft.draftId);
  const existing = log.entries.find((entry) => entry.changeId === draft.draftId);

  if (existing) {
    const reapplied = applyChange(vault, existing, existing.createdAt);
    if (reapplied.outcome.kind !== 'applied') throw new SyncError('sync_invalid_change');

    return {
      log,
      entry: existing,
      vault: { ...reapplied.vault, drafts: remainingDrafts },
    };
  }

  const staged = stageChange(log, vault, {
    type: draft.type,
    before: draft.before,
    after: draft.after,
    createdAt: draft.createdAt,
    changeId: draft.draftId,
  });

  return {
    ...staged,
    vault: {
      ...staged.vault,
      drafts: remainingDrafts,
    },
  };
}

/**
 * Enables sync on this device. The baseline is the vault as it is right now;
 * later entries are replayed on top of it. Calling it twice keeps the first
 * baseline: a second one would move the starting point of every peer.
 */
export function enableSync(
  log: ChangeLogFile,
  vault: VaultDecrypted,
  createdAt?: string
): { log: ChangeLogFile; vault: VaultDecrypted } {
  assertSameDevice(log, vault);

  const nextLog = log.baseline ? log : createBaseline(log, vault.accounts, createdAt);

  return {
    log: nextLog,
    vault: {
      ...vault,
      sync: {
        deviceName: log.deviceName,
        appliedSeq: { ...(vault.sync?.appliedSeq ?? {}) },
      },
    },
  };
}

/**
 * Applies every peer log. Logs are processed in device-id order so two runs
 * with the same inputs always produce the same conflicts.
 */
export function pullChanges(
  vault: VaultDecrypted,
  logs: ChangeLogFile[],
  now = new Date().toISOString()
): { vault: VaultDecrypted; outcomes: ApplyOutcome[] } {
  const ordered = [...logs].sort((first, second) =>
    first.deviceId.localeCompare(second.deviceId)
  );

  let current = vault;
  const outcomes: ApplyOutcome[] = [];

  for (const log of ordered) {
    const result = applyChangeLog(current, log, now);
    current = result.vault;
    outcomes.push(...result.outcomes);
  }

  return { vault: current, outcomes };
}

/** A device with no accounts and no cursors has never seen a peer. */
export function needsBaseline(vault: VaultDecrypted): boolean {
  return (
    vault.accounts.length === 0 &&
    Object.keys(vault.sync?.appliedSeq ?? {}).length === 0
  );
}

/**
 * Seeds a brand-new device from a peer's baseline. The cursor starts at the
 * baseline `seq`, so the entries already inside it are never replayed.
 *
 * Returns null when there is nothing to adopt; never touches an existing vault.
 */
export function adoptBaseline(
  vault: VaultDecrypted,
  log: ChangeLogFile,
  now = new Date().toISOString()
): VaultDecrypted | null {
  if (log.deviceId === vault.deviceId) return null;
  if (!needsBaseline(vault)) return null;

  const accounts = baselineAccounts(log);
  if (!accounts || !log.baseline) return null;

  return {
    ...vault,
    accounts,
    updatedAt: now,
    sync: {
      deviceName: vault.sync?.deviceName ?? '',
      appliedSeq: {
        ...(vault.sync?.appliedSeq ?? {}),
        [log.deviceId]: log.baseline.seq,
      },
    },
  };
}
