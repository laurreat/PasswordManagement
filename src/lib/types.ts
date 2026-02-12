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
};

export type ConflictEntry = {
  conflictId: string;
  sitio: string;
  usuario: string;
  versionLocal: AccountEntry;
  versionImportada: AccountEntry;
  detectedAt: string;
};

export type VaultDecrypted = {
  vaultVersion: "1.0";
  deviceId: string;
  createdAt: string;
  updatedAt: string;
  accounts: AccountEntry[];
  conflicts: ConflictEntry[];
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
