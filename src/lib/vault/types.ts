export type PasswordHistory = {
  password: string;
  updatedAt: string;
};

export type AccountEntry = {
  id: string;
  sitio: string;
  usuario: string;
  password: string;
  notas: string;
  createdAt: string;
  updatedAt: string;
  deviceId: string;
  history: PasswordHistory[];
  /**
   * Monotonic per-account revision. Absent on vaults written before sync
   * existed; every reader treats it as 0. A change applies only when its
   * `baseRevision` matches this value, which is what turns a divergent edit
   * into an explicit conflict instead of a silent overwrite.
   */
  revision?: number;
};

export type VaultSyncState = {
  deviceName: string;
  /** Highest processed `seq` per peer device. */
  appliedSeq: Record<string, number>;
};

export type ConflictEntry = {
  conflictId: string;
  sitio: string;
  usuario: string;
  versionLocal: AccountEntry;
  versionImportada: AccountEntry;
  detectedAt: string;
};

export type DraftType = 'create' | 'update' | 'delete';

export type VaultDraft = {
  draftId: string;
  type: DraftType;
  accountId: string;
  accountKey: string;
  before: AccountEntry | null;
  after: AccountEntry | null;
  createdAt: string;
  updatedAt: string;
};

export type AccountChangeType = 'create' | 'update' | 'delete';

export type AccountChangeSource = 'local' | 'remote' | 'import';

/** Fields kept in a history snapshot. Password history itself is not copied. */
export type AccountChangeValues = Pick<
  AccountEntry,
  'sitio' | 'usuario' | 'password' | 'notas'
>;

export type AccountChangeRecord = {
  historyId: string;
  /** Set when the change also exists in a sync log, so both can be deduped. */
  changeId?: string;
  accountId: string;
  accountKey: string;
  type: AccountChangeType;
  before: AccountChangeValues | null;
  after: AccountChangeValues | null;
  changedFields: string[];
  createdAt: string;
  deviceId: string;
  deviceName?: string;
  source: AccountChangeSource;
};

export type VaultDecrypted = {
  vaultVersion: "1.0";
  deviceId: string;
  createdAt: string;
  updatedAt: string;
  accounts: AccountEntry[];
  conflicts: ConflictEntry[];
  drafts?: VaultDraft[];
  /**
   * Encrypted, device-local account history. Entries older than three days
   * are hidden in the UI, never deleted: traceability is the whole point.
   */
  history?: AccountChangeRecord[];
  /** Device-local sync bookkeeping. Never shared with peers. */
  sync?: VaultSyncState;
};

export type VaultEncryptedFile = {
  salt: string;
  iv: string;
  data: string; // base64 ciphertext (includes authTag automatically in Web Crypto AES-GCM)
  vaultVersion: "1.0";
};

export type ExportPackage = {
  exportVersion: "1.0";
  exportedAt: string;
  deviceId: string;
  vaultData: VaultEncryptedFile;
};
