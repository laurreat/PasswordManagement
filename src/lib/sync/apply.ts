/**
 * LocalPass - Applying remote changes
 *
 * The only rule that matters: a change applies when its `baseRevision`
 * matches the local account revision. Anything else becomes an explicit
 * conflict. A conflict is a decision for the user, never a guess.
 */

import type { AccountEntry, ConflictEntry, VaultDecrypted } from '@/lib/types';
import { accountKey } from '../vault-merge.ts';
import { fromSnapshot } from './changes.ts';
import type { AccountSnapshot, ApplyOutcome, ChangeEntry, ChangeLogFile } from './types.ts';

function currentRevision(account: AccountEntry | undefined): number {
  return account?.revision ?? 0;
}

function conflictIdFor(changeId: string): string {
  return `sync:${changeId}`;
}

function buildSyncConflict(
  entry: ChangeEntry,
  current: AccountEntry,
  incoming: AccountSnapshot,
  detectedAt: string
): ConflictEntry {
  return {
    conflictId: conflictIdFor(entry.changeId),
    sitio: incoming.sitio,
    usuario: incoming.usuario,
    versionLocal: { ...current },
    versionImportada: fromSnapshot(incoming),
    detectedAt,
  };
}

function recordConflict(
  vault: VaultDecrypted,
  entry: ChangeEntry,
  current: AccountEntry,
  incoming: AccountSnapshot,
  now: string
): VaultDecrypted {
  const conflictId = conflictIdFor(entry.changeId);
  if (vault.conflicts.some((conflict) => conflict.conflictId === conflictId)) return vault;

  return {
    ...vault,
    conflicts: [...vault.conflicts, buildSyncConflict(entry, current, incoming, now)],
    updatedAt: now,
  };
}

/** Applies one entry to a vault. Pure: the input is never mutated. */
export function applyChange(
  vault: VaultDecrypted,
  entry: ChangeEntry,
  now = new Date().toISOString()
): { vault: VaultDecrypted; outcome: ApplyOutcome } {
  const index = vault.accounts.findIndex((account) => accountKey(account) === entry.accountKey);
  const current = index >= 0 ? vault.accounts[index] : undefined;

  const outcome = (kind: ApplyOutcome['kind'], reason?: ApplyOutcome['reason']): ApplyOutcome => ({
    changeId: entry.changeId,
    accountKey: entry.accountKey,
    kind,
    reason,
  });

  if (entry.type === 'create') {
    const incoming = entry.after;
    if (!incoming) return { vault, outcome: outcome('skipped', 'missing_account') };
    if (current) {
      return { vault: recordConflict(vault, entry, current, incoming, now), outcome: outcome('conflict', 'account_exists') };
    }

    return {
      vault: { ...vault, accounts: [...vault.accounts, fromSnapshot(incoming)], updatedAt: now },
      outcome: outcome('applied'),
    };
  }

  if (entry.type === 'update') {
    const incoming = entry.after;
    if (!incoming) return { vault, outcome: outcome('skipped', 'missing_account') };
    // The account was deleted locally after the origin last saw it. Deleting
    // wins: resurrecting it silently would undo an explicit user action.
    if (!current) return { vault, outcome: outcome('skipped', 'missing_account') };

    if (currentRevision(current) !== entry.baseRevision) {
      return { vault: recordConflict(vault, entry, current, incoming, now), outcome: outcome('conflict', 'revision_mismatch') };
    }

    const accounts = [...vault.accounts];
    accounts[index] = fromSnapshot(incoming);
    return { vault: { ...vault, accounts, updatedAt: now }, outcome: outcome('applied') };
  }

  // delete
  if (!current) return { vault, outcome: outcome('skipped', 'already_applied') };
  if (currentRevision(current) !== entry.baseRevision) {
    const before = entry.before;
    if (!before) return { vault, outcome: outcome('skipped', 'missing_account') };
    return { vault: recordConflict(vault, entry, current, before, now), outcome: outcome('conflict', 'revision_mismatch') };
  }

  return {
    vault: {
      ...vault,
      accounts: vault.accounts.filter((account) => accountKey(account) !== entry.accountKey),
      updatedAt: now,
    },
    outcome: outcome('applied'),
  };
}

/**
 * Applies every entry a peer has published since our last cursor. The cursor
 * advances once an entry is processed — applied, conflicted or skipped — so
 * retrying the same file is a no-op.
 */
export function applyChangeLog(
  vault: VaultDecrypted,
  log: ChangeLogFile,
  now = new Date().toISOString()
): { vault: VaultDecrypted; outcomes: ApplyOutcome[] } {
  const appliedSeq = { ...(vault.sync?.appliedSeq ?? {}) };
  const outcomes: ApplyOutcome[] = [];
  let current = vault;

  const ordered = [...log.entries].sort((first, second) => first.seq - second.seq);

  for (const entry of ordered) {
    if (entry.deviceId === vault.deviceId) {
      outcomes.push({
        changeId: entry.changeId,
        accountKey: entry.accountKey,
        kind: 'skipped',
        reason: 'own_device',
      });
      continue;
    }

    const cursor = appliedSeq[entry.deviceId] ?? 0;
    if (entry.seq <= cursor) {
      outcomes.push({
        changeId: entry.changeId,
        accountKey: entry.accountKey,
        kind: 'skipped',
        reason: 'already_applied',
      });
      continue;
    }

    const result = applyChange(current, entry, now);
    current = result.vault;
    outcomes.push(result.outcome);
    appliedSeq[entry.deviceId] = Math.max(cursor, entry.seq);
  }

  return {
    vault: { ...current, sync: { deviceName: current.sync?.deviceName ?? '', appliedSeq } },
    outcomes,
  };
}

/**
 * Accounts captured in a peer's baseline. A fresh device starts from the
 * newest baseline it can read, then applies the entries that follow it.
 */
export function baselineAccounts(log: ChangeLogFile): AccountEntry[] | null {
  if (!log.baseline) return null;
  return log.baseline.accounts.map(fromSnapshot);
}
