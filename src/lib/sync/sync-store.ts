/**
 * LocalPass - Sync storage
 *
 * The renderer never touches the sync folder directly. This module turns the
 * bridge's `sync.*` channels into typed operations: the raw file is an
 * envelope, and only a decrypted, validated log ever leaves it.
 */

import { getBridge, type LocalPassBridge } from '../localpass-bridge.ts';
import { SyncError } from './errors.ts';
import { openChangeLog, parseChangeLogEnvelope, sealChangeLog } from './seal.ts';
import type { ChangeLogFile } from './types.ts';

export interface SyncStore {
  readonly kind: 'file';
  folder(): Promise<string | null>;
  /** Opens the native picker; returns the current folder when cancelled. */
  chooseFolder(title?: string): Promise<string | null>;
  listDevices(): Promise<string[]>;
  read(deviceId: string, password: string): Promise<ChangeLogFile | null>;
  write(log: ChangeLogFile, password: string): Promise<void>;
}

class FileSyncStore implements SyncStore {
  readonly kind = 'file' as const;
  private readonly bridge: LocalPassBridge;

  constructor(bridge: LocalPassBridge) {
    this.bridge = bridge;
  }

  async folder(): Promise<string | null> {
    try {
      return (await this.bridge.sync.status()).folder;
    } catch {
      throw new SyncError('sync_read_failed');
    }
  }

  async chooseFolder(title?: string): Promise<string | null> {
    try {
      return (await this.bridge.sync.chooseFolder(title)).folder;
    } catch {
      throw new SyncError('sync_write_failed');
    }
  }

  async listDevices(): Promise<string[]> {
    try {
      const logs = await this.bridge.sync.list();
      return logs.map((log) => log.deviceId);
    } catch {
      throw new SyncError('sync_read_failed');
    }
  }

  async read(deviceId: string, password: string): Promise<ChangeLogFile | null> {
    let raw: string | null;

    try {
      raw = await this.bridge.sync.read(deviceId);
    } catch {
      throw new SyncError('sync_read_failed');
    }

    if (raw === null) return null;

    return openChangeLog(parseChangeLogEnvelope(raw), password);
  }

  async write(log: ChangeLogFile, password: string): Promise<void> {
    const envelope = await sealChangeLog(log, password);

    try {
      await this.bridge.sync.write(log.deviceId, JSON.stringify(envelope));
    } catch {
      throw new SyncError('sync_write_failed');
    }
  }
}

export function createSyncStore(bridge: LocalPassBridge | null = getBridge()): SyncStore | null {
  return bridge ? new FileSyncStore(bridge) : null;
}
