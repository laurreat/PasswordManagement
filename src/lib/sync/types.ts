/**
 * LocalPass - Sync domain types
 *
 * A change log belongs to exactly one device. Peers read it, never write it,
 * so Syncthing never sees two writers on the same file.
 */

import type { PasswordHistory } from '@/lib/types';

export const SYNC_FORMAT_VERSION = '1.0' as const;

export type ChangeType = 'create' | 'update' | 'delete';

/** Immutable copy of an account as it was at a point in time. */
export type AccountSnapshot = {
  id: string;
  sitio: string;
  usuario: string;
  password: string;
  notas: string;
  createdAt: string;
  updatedAt: string;
  deviceId: string;
  history: PasswordHistory[];
  revision: number;
};

export type ChangeEntry = {
  changeId: string;
  deviceId: string;
  /** Monotonic per device. Order comes from here, never from wall clocks. */
  seq: number;
  createdAt: string;
  type: ChangeType;
  accountKey: string;
  baseRevision: number;
  before: AccountSnapshot | null;
  after: AccountSnapshot | null;
  changedFields: string[];
  /**
   * Present only on entries that re-publish a peer change. They let a device
   * recognize its own change coming back through a relay and let a peer that
   * already applied the original skip the copy.
   */
  originDeviceId?: string;
  originSeq?: number;
};

/**
 * Full state at the moment sync was enabled. New devices rebuild from here
 * instead of replaying history that predates the feature.
 */
export type ChangeBaseline = {
  seq: number;
  createdAt: string;
  accounts: AccountSnapshot[];
};

export type ChangeLogFile = {
  syncVersion: typeof SYNC_FORMAT_VERSION;
  deviceId: string;
  deviceName: string;
  baseline: ChangeBaseline | null;
  entries: ChangeEntry[];
};

export type SkipReason = 'own_device' | 'already_applied' | 'missing_account';
export type ConflictReason = 'revision_mismatch' | 'account_exists';

export type ApplyOutcome = {
  changeId: string;
  accountKey: string;
  kind: 'applied' | 'conflict' | 'skipped';
  reason?: SkipReason | ConflictReason;
};
