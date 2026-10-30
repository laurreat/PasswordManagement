/**
 * LocalPass - Change entries
 *
 * An edit is never written straight to the vault. It becomes an entry with
 * enough context to decide, on another device, whether it can be applied
 * (`baseRevision` matches) or must become an explicit conflict.
 */

import type { AccountEntry } from '@/lib/types';
import { accountKey } from '../vault-merge.ts';
import { SyncError } from './errors.ts';
import { SYNC_FORMAT_VERSION } from './types.ts';
import type {
  AccountSnapshot,
  ChangeEntry,
  ChangeLogFile,
  ChangeType,
} from './types.ts';

/** Fields a user can change and that are worth showing in the detail view. */
export const TRACKED_FIELDS = ['sitio', 'usuario', 'password', 'notas'] as const;

export type NewChangeInput = {
  deviceId: string;
  seq: number;
  type: ChangeType;
  before: AccountEntry | null;
  after: AccountEntry | null;
  createdAt?: string;
  /** Stable identity for a retried change; defaults to a fresh UUID. */
  changeId?: string;
  /**
   * Allows an update whose tracked fields are unchanged. Only conflict
   * resolutions use it: the content is already the resolved one, but peers
   * still need the revision bump to stop diverging.
   */
  allowEmptyDiff?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isIsoDate(value: unknown): value is string {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function isChangeType(value: unknown): value is ChangeType {
  return value === 'create' || value === 'update' || value === 'delete';
}

export function toSnapshot(account: AccountEntry): AccountSnapshot {
  return {
    id: account.id,
    sitio: account.sitio,
    usuario: account.usuario,
    password: account.password,
    notas: account.notas ?? '',
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    deviceId: account.deviceId,
    history: account.history.map((entry) => ({ ...entry })),
    revision: account.revision ?? 0,
  };
}

export function fromSnapshot(snapshot: AccountSnapshot): AccountEntry {
  return {
    id: snapshot.id,
    sitio: snapshot.sitio,
    usuario: snapshot.usuario,
    password: snapshot.password,
    notas: snapshot.notas,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    deviceId: snapshot.deviceId,
    history: snapshot.history.map((entry) => ({ ...entry })),
    revision: snapshot.revision,
  };
}

export function emptyChangeLog(deviceId: string, deviceName: string): ChangeLogFile {
  return {
    syncVersion: SYNC_FORMAT_VERSION,
    deviceId,
    deviceName,
    baseline: null,
    entries: [],
  };
}

export function nextSeq(log: ChangeLogFile): number {
  const lastEntry = log.entries.reduce((max, entry) => Math.max(max, entry.seq), 0);
  return Math.max(log.baseline?.seq ?? 0, lastEntry) + 1;
}

export function diffFields(before: AccountEntry, after: AccountEntry): string[] {
  return TRACKED_FIELDS.filter((field) => (before[field] ?? '') !== (after[field] ?? ''));
}

function assertInputShape(input: NewChangeInput): void {
  if (!isNonEmptyString(input.deviceId)) throw new SyncError('sync_invalid_change');
  if (!Number.isInteger(input.seq) || input.seq < 1) throw new SyncError('sync_invalid_change');
  if (!isChangeType(input.type)) throw new SyncError('sync_invalid_change');

  if (input.type === 'create') {
    if (input.before !== null || input.after === null) throw new SyncError('sync_invalid_change');
  }
  if (input.type === 'update') {
    if (input.before === null || input.after === null) throw new SyncError('sync_invalid_change');
  }
  if (input.type === 'delete') {
    if (input.before === null || input.after !== null) throw new SyncError('sync_invalid_change');
  }

  if (input.before && input.after && accountKey(input.before) !== accountKey(input.after)) {
    throw new SyncError('sync_invalid_change');
  }
}

export function createChangeEntry(input: NewChangeInput): ChangeEntry {
  assertInputShape(input);

  const createdAt = input.createdAt ?? new Date().toISOString();
  const baseRevision = input.before?.revision ?? 0;
  const identity = input.before ?? input.after;

  if (!identity) throw new SyncError('sync_invalid_change');

  const afterSnapshot = input.after
    ? { ...toSnapshot(input.after), revision: baseRevision + 1, updatedAt: createdAt }
    : null;

  let changedFields: string[];
  if (input.type === 'create') changedFields = ['created'];
  else if (input.type === 'delete') changedFields = ['deleted'];
  else {
    changedFields = diffFields(input.before as AccountEntry, input.after as AccountEntry);
    if (changedFields.length === 0 && !input.allowEmptyDiff) {
      throw new SyncError('sync_invalid_change');
    }
  }

  return {
    changeId: input.changeId ?? globalThis.crypto.randomUUID(),
    deviceId: input.deviceId,
    seq: input.seq,
    createdAt,
    type: input.type,
    accountKey: accountKey(identity),
    baseRevision,
    before: input.before ? toSnapshot(input.before) : null,
    after: afterSnapshot,
    changedFields,
  };
}

export function appendEntry(log: ChangeLogFile, entry: ChangeEntry): ChangeLogFile {
  if (entry.deviceId !== log.deviceId) throw new SyncError('sync_invalid_change');
  if (log.entries.some((existing) => existing.seq === entry.seq)) {
    throw new SyncError('sync_invalid_change');
  }
  if (log.entries.some((existing) => existing.changeId === entry.changeId)) {
    throw new SyncError('sync_invalid_change');
  }

  return { ...log, entries: [...log.entries, entry] };
}

export function createBaseline(
  log: ChangeLogFile,
  accounts: AccountEntry[],
  createdAt = new Date().toISOString()
): ChangeLogFile {
  return {
    ...log,
    baseline: { seq: nextSeq(log), createdAt, accounts: accounts.map(toSnapshot) },
  };
}

export function serializeChangeLog(log: ChangeLogFile): string {
  return JSON.stringify(log, null, 2);
}

function assertSnapshot(value: unknown): asserts value is AccountSnapshot {
  if (!isRecord(value)) throw new SyncError('sync_corrupted');
  if (!isNonEmptyString(value.id) || !isNonEmptyString(value.sitio) || !isNonEmptyString(value.usuario)) {
    throw new SyncError('sync_corrupted');
  }
  if (typeof value.password !== 'string' || typeof value.notas !== 'string') {
    throw new SyncError('sync_corrupted');
  }
  if (!isIsoDate(value.createdAt) || !isIsoDate(value.updatedAt)) {
    throw new SyncError('sync_corrupted');
  }
  if (typeof value.deviceId !== 'string' || !isNonNegativeInteger(value.revision)) {
    throw new SyncError('sync_corrupted');
  }
  if (!Array.isArray(value.history)) throw new SyncError('sync_corrupted');

  value.history.forEach((entry) => {
    if (!isRecord(entry) || typeof entry.password !== 'string' || !isIsoDate(entry.updatedAt)) {
      throw new SyncError('sync_corrupted');
    }
  });
}

function assertEntry(value: unknown): asserts value is ChangeEntry {
  if (!isRecord(value)) throw new SyncError('sync_corrupted');
  if (!isNonEmptyString(value.changeId) || !isNonEmptyString(value.deviceId)) {
    throw new SyncError('sync_corrupted');
  }
  if (!Number.isInteger(value.seq) || (value.seq as number) < 1) throw new SyncError('sync_corrupted');
  if (!isIsoDate(value.createdAt)) throw new SyncError('sync_corrupted');
  if (!isChangeType(value.type)) throw new SyncError('sync_corrupted');
  if (!isNonEmptyString(value.accountKey)) throw new SyncError('sync_corrupted');
  if (!isNonNegativeInteger(value.baseRevision)) throw new SyncError('sync_corrupted');
  if (!Array.isArray(value.changedFields) || value.changedFields.some((field) => typeof field !== 'string')) {
    throw new SyncError('sync_corrupted');
  }

  // Optional relay provenance. Both fields must be present together; a log
  // written before this field existed simply omits them.
  if (value.originDeviceId !== undefined || value.originSeq !== undefined) {
    if (!isNonEmptyString(value.originDeviceId)) throw new SyncError('sync_corrupted');
    if (!Number.isInteger(value.originSeq) || (value.originSeq as number) < 1) {
      throw new SyncError('sync_corrupted');
    }
  }

  const before = value.before;
  const after = value.after;

  if (value.type === 'create') {
    if (before !== null || after === null) throw new SyncError('sync_corrupted');
    if (value.baseRevision !== 0) throw new SyncError('sync_corrupted');
  }
  if (value.type === 'update' && (before === null || after === null)) {
    throw new SyncError('sync_corrupted');
  }
  if (value.type === 'delete') {
    if (before === null || after !== null) throw new SyncError('sync_corrupted');
  }

  if (before !== null) assertSnapshot(before);
  if (after !== null) assertSnapshot(after);

  const identity = (before ?? after) as AccountSnapshot;
  if (accountKey(identity) !== value.accountKey) throw new SyncError('sync_corrupted');

  if (after !== null && value.type !== 'delete') {
    const expected = (value.baseRevision as number) + 1;
    if ((after as AccountSnapshot).revision !== expected) throw new SyncError('sync_corrupted');
  }
  if (before !== null && value.type !== 'create') {
    if ((before as AccountSnapshot).revision !== value.baseRevision) {
      throw new SyncError('sync_corrupted');
    }
  }
}

/** Validates an unencrypted change log before it is trusted. */
export function parseChangeLog(rawJson: string): ChangeLogFile {
  const raw = rawJson.trim().replace(/^\uFEFF/, '');
  if (!raw) throw new SyncError('sync_corrupted');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SyncError('sync_corrupted');
  }

  if (!isRecord(parsed)) throw new SyncError('sync_corrupted');
  if (typeof parsed.syncVersion !== 'string') throw new SyncError('sync_corrupted');
  if (parsed.syncVersion !== SYNC_FORMAT_VERSION) throw new SyncError('sync_unsupported_version');
  if (!isNonEmptyString(parsed.deviceId) || !isNonEmptyString(parsed.deviceName)) {
    throw new SyncError('sync_corrupted');
  }
  if (!Array.isArray(parsed.entries)) throw new SyncError('sync_corrupted');

  let baseline: ChangeLogFile['baseline'] = null;
  if (parsed.baseline !== null && parsed.baseline !== undefined) {
    const candidate = parsed.baseline;
    if (!isRecord(candidate)) throw new SyncError('sync_corrupted');
    if (!Number.isInteger(candidate.seq) || (candidate.seq as number) < 1) {
      throw new SyncError('sync_corrupted');
    }
    if (!isIsoDate(candidate.createdAt) || !Array.isArray(candidate.accounts)) {
      throw new SyncError('sync_corrupted');
    }
    candidate.accounts.forEach(assertSnapshot);
    baseline = {
      seq: candidate.seq as number,
      createdAt: candidate.createdAt as string,
      accounts: candidate.accounts as AccountSnapshot[],
    };
  }

  const entries = parsed.entries as unknown[];
  entries.forEach(assertEntry);

  const seenSeq = new Set<number>();
  for (const entry of entries as ChangeEntry[]) {
    if (entry.deviceId !== parsed.deviceId) throw new SyncError('sync_corrupted');
    if (seenSeq.has(entry.seq)) throw new SyncError('sync_corrupted');
    seenSeq.add(entry.seq);
  }

  return {
    syncVersion: SYNC_FORMAT_VERSION,
    deviceId: parsed.deviceId as string,
    deviceName: parsed.deviceName as string,
    baseline,
    entries: entries as ChangeEntry[],
  };
}
