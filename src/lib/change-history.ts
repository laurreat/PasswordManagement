/**
 * LocalPass - Account change history
 *
 * Every committed account change is kept in the encrypted vault so the user
 * can review what happened even when sync is disabled. Nothing is pruned:
 * entries older than `HISTORY_VISIBLE_DAYS` are only hidden by the UI.
 */

import type {
  AccountChangeRecord,
  AccountChangeSource,
  AccountChangeValues,
  AccountEntry,
  VaultDecrypted,
} from './types.ts';
import type { AccountSnapshot, ChangeEntry, ChangeLogFile } from './sync/types.ts';
import { accountKey } from './vault-merge.ts';

export const HISTORY_VISIBLE_DAYS = 3;
export const HISTORY_TRACKED_FIELDS = ['sitio', 'usuario', 'password', 'notas'] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export type NewAccountChange = {
  type: AccountChangeRecord['type'];
  before: AccountEntry | null;
  after: AccountEntry | null;
  createdAt?: string;
  deviceId: string;
  deviceName?: string;
  source: AccountChangeSource;
  /** Sync change id, when this record also exists in a device log. */
  changeId?: string;
};

export function accountValues(account: AccountEntry | null): AccountChangeValues | null {
  if (!account) return null;
  return {
    sitio: account.sitio,
    usuario: account.usuario,
    password: account.password,
    notas: account.notas ?? '',
  };
}

function valuesFromSnapshot(snapshot: AccountSnapshot): AccountChangeValues {
  return {
    sitio: snapshot.sitio,
    usuario: snapshot.usuario,
    password: snapshot.password,
    notas: snapshot.notas,
  };
}

export function diffAccountFields(
  before: AccountChangeValues | null,
  after: AccountChangeValues | null
): string[] {
  if (!before) return ['created'];
  if (!after) return ['deleted'];
  return HISTORY_TRACKED_FIELDS.filter(
    (field) => (before[field] ?? '') !== (after[field] ?? '')
  );
}

export function createAccountChange(input: NewAccountChange): AccountChangeRecord {
  const target = input.after ?? input.before;
  if (!target) throw new Error('history entry requires an account');

  const before = accountValues(input.before);
  const after = accountValues(input.after);
  const createdAt = input.createdAt ?? new Date().toISOString();

  return {
    historyId: input.changeId ?? globalThis.crypto.randomUUID(),
    changeId: input.changeId,
    accountId: target.id,
    accountKey: accountKey(target),
    type: input.type,
    before,
    after,
    changedFields: diffAccountFields(before, after),
    createdAt,
    deviceId: input.deviceId,
    deviceName: input.deviceName,
    source: input.source,
  };
}

/** Prepends a record, replacing an existing one with the same id. */
export function appendAccountChange(
  vault: VaultDecrypted,
  record: AccountChangeRecord
): VaultDecrypted {
  const existing = vault.history ?? [];
  const history = [record, ...existing.filter((entry) => entry.historyId !== record.historyId)];
  return { ...vault, history };
}

/** Converts a sync entry into a history record. */
export function accountChangeFromEntry(
  entry: ChangeEntry,
  source: AccountChangeSource,
  deviceName?: string
): AccountChangeRecord {
  const identity = entry.before ?? entry.after;
  if (!identity) throw new Error('change entry requires an account');

  return {
    historyId: entry.changeId,
    changeId: entry.changeId,
    accountId: identity.id,
    accountKey: entry.accountKey,
    type: entry.type,
    before: entry.before ? valuesFromSnapshot(entry.before) : null,
    after: entry.after ? valuesFromSnapshot(entry.after) : null,
    changedFields: [...entry.changedFields],
    createdAt: entry.createdAt,
    deviceId: entry.originDeviceId ?? entry.deviceId,
    deviceName,
    source,
  };
}

/** Local entries from a device log, used to backfill history written before this feature. */
export function historyFromLog(log: ChangeLogFile): AccountChangeRecord[] {
  return log.entries
    .filter((entry) => !entry.originDeviceId)
    .map((entry) => accountChangeFromEntry(entry, 'local', log.deviceName));
}

/** Dedupes by `historyId`, newest first. */
export function mergeAccountHistory(
  ...groups: AccountChangeRecord[][]
): AccountChangeRecord[] {
  const merged = new Map<string, AccountChangeRecord>();
  for (const group of groups) {
    for (const entry of group) {
      if (!merged.has(entry.historyId)) merged.set(entry.historyId, entry);
    }
  }
  return [...merged.values()].sort(
    (first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt)
  );
}

export function isHistoryHidden(
  entry: AccountChangeRecord,
  now = Date.now(),
  days = HISTORY_VISIBLE_DAYS
): boolean {
  const createdAt = Date.parse(entry.createdAt);
  if (Number.isNaN(createdAt)) return true;
  return createdAt < now - days * DAY_MS;
}

export function splitHistoryByAge(
  history: AccountChangeRecord[],
  now = Date.now(),
  days = HISTORY_VISIBLE_DAYS
): { visible: AccountChangeRecord[]; hidden: AccountChangeRecord[] } {
  const visible: AccountChangeRecord[] = [];
  const hidden: AccountChangeRecord[] = [];

  for (const entry of mergeAccountHistory(history)) {
    if (isHistoryHidden(entry, now, days)) hidden.push(entry);
    else visible.push(entry);
  }

  return { visible, hidden };
}
