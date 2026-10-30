/**
 * LocalPass - Browser CSV import
 *
 * Browsers export credentials as plaintext CSV, and every vendor uses slightly
 * different headers. This module reads those files without ever sending them
 * anywhere: it parses RFC 4180 quoting, detects the source format, normalizes
 * the URL into the bare hostname that `AccountEntry.sitio` expects, and hands
 * the rows to the same merge rules used by the encrypted vault import.
 */

import type { AccountEntry, VaultDecrypted } from './types.ts';
import { accountKey, mergeImportedVault } from './vault-merge.ts';
import { appendAccountChange, createAccountChange } from './change-history.ts';
import type { PublishableChange } from './sync/engine.ts';

export type BrowserCsvFormat = 'chrome' | 'firefox' | 'bitwarden' | 'lastpass' | 'generic';

export type ImportedAccount = {
  sitio: string;
  usuario: string;
  password: string;
  notas: string;
};

export type SkippedRowReason = 'missing_password' | 'missing_site' | 'not_a_login';

export type SkippedRow = {
  /** 1-based row number counting non-empty rows only; the header is row 1. */
  line: number;
  reason: SkippedRowReason;
};

export type CsvParseResult = {
  format: BrowserCsvFormat;
  delimiter: string;
  accounts: ImportedAccount[];
  skipped: SkippedRow[];
  /** Rows collapsed because the same sitio + usuario appeared more than once. */
  duplicates: number;
};

export type CsvImportPreview = {
  total: number;
  added: number;
  conflicts: number;
  unchanged: number;
};

export type CsvImportErrorCode = 'csv_empty' | 'csv_unrecognized_format' | 'csv_too_large';

export class CsvImportError extends Error {
  readonly code: CsvImportErrorCode;

  constructor(code: CsvImportErrorCode) {
    super(code);
    this.name = 'CsvImportError';
    this.code = code;
  }
}

/** Defensive cap on characters; the renderer also rejects large files by byte size. */
export const MAX_CSV_BYTES = 5 * 1024 * 1024;
export const MAX_CSV_ROWS = 20000;

const DELIMITERS = [',', ';', '\t'] as const;

const HEADER_ALIASES = {
  url: ['url', 'login_uri', 'website', 'site', 'origin', 'web site', 'login_url'],
  username: ['username', 'login_username', 'user', 'login', 'email', 'e-mail'],
  password: ['password', 'login_password', 'pass'],
  notes: ['note', 'notes', 'extra', 'login_notes', 'comments'],
  name: ['name', 'title'],
  type: ['type'],
} as const;

type HeaderField = keyof typeof HEADER_ALIASES;

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, '').trim().toLowerCase();
}

/** Picks the delimiter that yields the widest header row, ignoring quoted text. */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  let best: string = ',';
  let bestColumns = -1;

  for (const candidate of DELIMITERS) {
    let columns = 1;
    let quoted = false;
    for (const character of firstLine) {
      if (character === '"') quoted = !quoted;
      else if (character === candidate && !quoted) columns += 1;
    }
    if (columns > bestColumns) {
      bestColumns = columns;
      best = candidate;
    }
  }

  return best;
}

/** RFC 4180 parser: quoted fields, escaped quotes and embedded newlines. */
export function parseCsvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let started = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field.trim() === '') {
      quoted = true;
      field = '';
      started = true;
      continue;
    }

    if (character === delimiter) {
      row.push(field);
      field = '';
      started = true;
      continue;
    }

    if (character === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      started = false;
      continue;
    }

    if (character === '\r') continue;

    field += character;
    started = true;
  }

  if (started || field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function headerIndex(header: string[], field: HeaderField): number {
  for (const alias of HEADER_ALIASES[field]) {
    const index = header.indexOf(alias);
    if (index >= 0) return index;
  }
  return -1;
}

function readField(row: string[], index: number): string {
  if (index < 0) return '';
  return (row[index] ?? '').trim();
}

/** Passwords keep their exact value: leading or trailing spaces are significant. */
function readPassword(row: string[], index: number): string {
  if (index < 0) return '';
  return row[index] ?? '';
}

/** Identifies the exporter from its header row. */
export function detectFormat(header: string[]): BrowserCsvFormat {
  const has = (name: string) => header.includes(name);

  if (has('login_uri') || has('login_username')) return 'bitwarden';
  if (has('httprealm') || has('formactionorigin') || has('timepasswordchanged')) return 'firefox';
  if (has('grouping') || has('extra')) return 'lastpass';
  if (has('url') && has('username') && has('password')) return 'chrome';
  if (has('url') && has('password')) return 'generic';

  throw new CsvImportError('csv_unrecognized_format');
}

/**
 * Reduces whatever the exporter wrote into a bare hostname. The detail view
 * links to `https://${sitio}`, so storing a full URL would produce a broken
 * link and would also break identity matching against vault entries.
 */
export function normalizeSite(rawUrl: string, fallbackName = ''): string {
  const url = rawUrl.trim();

  if (/^android:\/\//i.test(url)) {
    const rest = url.replace(/^android:\/\//i, '');
    const at = rest.indexOf('@');
    const bundle = (at >= 0 ? rest.slice(at + 1) : rest).split('/')[0].trim();
    return bundle.toLowerCase();
  }

  if (url) {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`;
    try {
      const parsed = new URL(withScheme);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'ftp:') {
        const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
        if (host) return host;
      } else {
        // chrome://, file://, moz-extension:// carry no useful site name.
        return normalizeSite('', fallbackName);
      }
    } catch {
      // Not a URL: fall through to the bare-host fallback.
    }
  }

  const fallback = (url || fallbackName).trim();
  if (!fallback) return '';

  return fallback
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .split(/[/?#]/)[0]
    .replace(/^www\./i, '')
    .trim();
}

/**
 * Parses a browser export. Throws `CsvImportError` when the file is empty, too
 * large or does not look like any known password export.
 */
export function parseBrowserCsv(text: string): CsvParseResult {
  if (text.length > MAX_CSV_BYTES) throw new CsvImportError('csv_too_large');

  const content = text.replace(/^\uFEFF/, '');
  if (!content.trim()) throw new CsvImportError('csv_empty');

  const delimiter = detectDelimiter(content);
  const rows = parseCsvRows(content, delimiter).filter((row) => row.some((value) => value.trim() !== ''));

  if (rows.length === 0) throw new CsvImportError('csv_empty');
  if (rows.length - 1 > MAX_CSV_ROWS) throw new CsvImportError('csv_too_large');

  const header = rows[0].map(normalizeHeader);
  const format = detectFormat(header);

  const indexes = {
    url: headerIndex(header, 'url'),
    username: headerIndex(header, 'username'),
    password: headerIndex(header, 'password'),
    notes: headerIndex(header, 'notes'),
    name: headerIndex(header, 'name'),
    type: headerIndex(header, 'type'),
  };

  const accounts: ImportedAccount[] = [];
  const skipped: SkippedRow[] = [];
  const seen = new Map<string, number>();
  let duplicates = 0;

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const line = rowIndex + 1;

    if (format === 'bitwarden') {
      const type = readField(row, indexes.type).toLowerCase();
      if (type && type !== 'login') {
        skipped.push({ line, reason: 'not_a_login' });
        continue;
      }
    }

    const password = readPassword(row, indexes.password);
    if (!password) {
      skipped.push({ line, reason: 'missing_password' });
      continue;
    }

    const sitio = normalizeSite(readField(row, indexes.url), readField(row, indexes.name));
    if (!sitio) {
      skipped.push({ line, reason: 'missing_site' });
      continue;
    }

    const account: ImportedAccount = {
      sitio,
      usuario: readField(row, indexes.username),
      password,
      notas: readField(row, indexes.notes),
    };

    // Browsers append the newest row last when an entry is edited, so the last
    // occurrence wins. The count is reported instead of hiding the collapse.
    const key = accountKey(account);
    const previous = seen.get(key);
    if (previous === undefined) {
      seen.set(key, accounts.length);
      accounts.push(account);
    } else {
      duplicates += 1;
      accounts[previous] = account;
    }
  }

  return { format, delimiter, accounts, skipped, duplicates };
}

/** Compares the parsed rows against the open vault without mutating it. */
export function previewCsvImport(vault: VaultDecrypted, accounts: ImportedAccount[]): CsvImportPreview {
  const local = new Map(vault.accounts.map((account) => [accountKey(account), account]));
  const preview: CsvImportPreview = { total: accounts.length, added: 0, conflicts: 0, unchanged: 0 };

  for (const account of accounts) {
    const match = local.get(accountKey(account));
    if (!match) preview.added += 1;
    else if (match.password === account.password) preview.unchanged += 1;
    else preview.conflicts += 1;
  }

  return preview;
}

function toAccountEntries(
  accounts: ImportedAccount[],
  deviceId: string,
  now: string
): AccountEntry[] {
  return accounts.map((account) => ({
    id: globalThis.crypto.randomUUID(),
    sitio: account.sitio,
    usuario: account.usuario,
    password: account.password,
    notas: account.notas,
    createdAt: now,
    updatedAt: now,
    deviceId,
    history: [],
    revision: 1,
  }));
}

/**
 * Merges the parsed rows into the vault. Rows that already exist with the same
 * password are dropped first so `mergeImportedVault` cannot replace richer
 * local data (notes, history) with a bare CSV row.
 */
export function applyCsvImport(
  vault: VaultDecrypted,
  accounts: ImportedAccount[]
): { vault: VaultDecrypted; preview: CsvImportPreview; changes: PublishableChange[] } {
  const preview = previewCsvImport(vault, accounts);

  const local = new Map(vault.accounts.map((account) => [accountKey(account), account]));
  const pending = accounts.filter((account) => {
    const match = local.get(accountKey(account));
    return !match || match.password !== account.password;
  });

  if (pending.length === 0) return { vault, preview, changes: [] };

  const now = new Date().toISOString();
  const imported: VaultDecrypted = {
    vaultVersion: '1.0',
    deviceId: vault.deviceId,
    createdAt: now,
    updatedAt: now,
    accounts: toAccountEntries(pending, vault.deviceId, now),
    conflicts: [],
  };

  const merged = mergeImportedVault(vault, imported);
  const beforeByKey = new Map(vault.accounts.map((account) => [accountKey(account), account]));
  const afterByKey = new Map(merged.accounts.map((account) => [accountKey(account), account]));

  let withHistory = merged;
  const changes: PublishableChange[] = [];
  for (const account of pending) {
    const key = accountKey(account);
    const before = beforeByKey.get(key) ?? null;
    const after = afterByKey.get(key);
    // A different local password becomes a conflict, not an applied import.
    if (!after || after.password !== account.password) continue;

    changes.push({ type: before ? 'update' : 'create', before, after });
    withHistory = appendAccountChange(
      withHistory,
      createAccountChange({
        type: before ? 'update' : 'create',
        before,
        after,
        createdAt: now,
        deviceId: vault.deviceId,
        deviceName: vault.sync?.deviceName || undefined,
        source: 'import',
      })
    );
  }

  return { vault: withHistory, preview, changes };
}
