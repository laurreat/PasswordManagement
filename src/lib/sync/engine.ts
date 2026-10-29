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

import type { AccountEntry, VaultDecrypted } from '@/lib/types';
import { applyChange, applyChangeLog, baselineAccounts } from './apply.ts';
import { appendEntry, createBaseline, createChangeEntry, nextSeq } from './changes.ts';
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
