import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CsvImportError,
  MAX_CSV_BYTES,
  MAX_CSV_ROWS,
  applyCsvImport,
  detectDelimiter,
  detectFormat,
  normalizeSite,
  parseBrowserCsv,
  parseCsvRows,
  previewCsvImport,
} from '../src/lib/browser-csv.ts';
import type { ImportedAccount } from '../src/lib/browser-csv.ts';
import type { AccountEntry, VaultDecrypted } from '../src/lib/types.ts';

const NOW = '2026-10-28T12:00:00.000Z';

function entry(overrides: Partial<AccountEntry> = {}): AccountEntry {
  return {
    id: overrides.id ?? globalThis.crypto.randomUUID(),
    sitio: 'github.com',
    usuario: 'octocat',
    password: 'local-password',
    notas: 'local note',
    createdAt: NOW,
    updatedAt: NOW,
    deviceId: 'device-1',
    history: [],
    ...overrides,
  };
}

function vaultWith(accounts: AccountEntry[]): VaultDecrypted {
  return {
    vaultVersion: '1.0',
    deviceId: 'device-1',
    createdAt: NOW,
    updatedAt: NOW,
    accounts,
    conflicts: [],
  };
}

function imported(overrides: Partial<ImportedAccount> = {}): ImportedAccount {
  return {
    sitio: 'github.com',
    usuario: 'octocat',
    password: 'csv-password',
    notas: '',
    ...overrides,
  };
}

const CHROME_HEADER = 'name,url,username,password,note';

test('parseCsvRows reads quoted fields with delimiters inside them', () => {
  const rows = parseCsvRows('name,url\n"Gmail, personal",https://mail.google.com', ',');

  assert.deepEqual(rows, [
    ['name', 'url'],
    ['Gmail, personal', 'https://mail.google.com'],
  ]);
});

test('parseCsvRows decodes escaped quotes', () => {
  const rows = parseCsvRows('user,note\n"say ""hi""",2', ',');

  assert.equal(rows[1][0], 'say "hi"');
});

test('parseCsvRows keeps embedded newlines inside a quoted field', () => {
  const rows = parseCsvRows('user,note\n"line 1\nline 2",2', ',');

  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], 'line 1\nline 2');
});

test('parseCsvRows handles CRLF and a trailing newline', () => {
  const rows = parseCsvRows('a,b\r\n1,2\r\n', ',');

  assert.deepEqual(rows, [
    ['a', 'b'],
    ['1', '2'],
  ]);
});

test('detectDelimiter picks comma, semicolon or tab from the header', () => {
  assert.equal(detectDelimiter(CHROME_HEADER), ',');
  assert.equal(detectDelimiter('name;url;username;password'), ';');
  assert.equal(detectDelimiter('name\turl\tusername\tpassword'), '\t');
});

test('detectDelimiter ignores separators inside quoted headers', () => {
  assert.equal(detectDelimiter('"name, display";url;password'), ';');
});

test('detectFormat recognizes the supported exporters', () => {
  assert.equal(detectFormat(['name', 'url', 'username', 'password', 'note']), 'chrome');
  assert.equal(
    detectFormat(['url', 'username', 'password', 'httprealm', 'formactionorigin', 'timepasswordchanged']),
    'firefox'
  );
  assert.equal(
    detectFormat(['folder', 'favorite', 'type', 'name', 'login_uri', 'login_username', 'login_password']),
    'bitwarden'
  );
  assert.equal(detectFormat(['url', 'username', 'password', 'totp', 'extra', 'name', 'grouping']), 'lastpass');
  assert.equal(detectFormat(['url', 'password']), 'generic');
});

test('detectFormat rejects files that are not a password export', () => {
  assert.throws(
    () => detectFormat(['foo', 'bar', 'baz']),
    (error: unknown) => error instanceof CsvImportError && error.code === 'csv_unrecognized_format'
  );
});

test('normalizeSite reduces a URL to a bare hostname', () => {
  assert.equal(normalizeSite('https://www.github.com/login?next=/x'), 'github.com');
  assert.equal(normalizeSite('github.com'), 'github.com');
  assert.equal(normalizeSite('http://Sub.Example.com:8080/path'), 'sub.example.com');
  assert.equal(normalizeSite('ftp://files.example.com/pub'), 'files.example.com');
});

test('normalizeSite reduces android:// URIs to the package name', () => {
  assert.equal(normalizeSite('android://oQ6bn4J4Jq0F0nZ1N8uG9A==@com.example.app/'), 'com.example.app');
});

test('normalizeSite falls back to the name column for non-web schemes', () => {
  assert.equal(normalizeSite('chrome://settings', 'Chrome Settings'), 'Chrome Settings');
  assert.equal(normalizeSite('', 'Some Site'), 'Some Site');
  assert.equal(normalizeSite('', ''), '');
});

test('parseBrowserCsv imports a Chrome export end to end', () => {
  const csv = [
    '\uFEFF' + CHROME_HEADER,
    'GitHub,https://www.github.com/login,octocat,"s3cret, with comma","first line',
    'second line"',
  ].join('\r\n');

  const result = parseBrowserCsv(csv);

  assert.equal(result.format, 'chrome');
  assert.equal(result.delimiter, ',');
  assert.equal(result.duplicates, 0);
  assert.deepEqual(result.skipped, []);
  assert.deepEqual(result.accounts, [
    {
      sitio: 'github.com',
      usuario: 'octocat',
      password: 's3cret, with comma',
      notas: 'first line\r\nsecond line',
    },
  ]);
});

test('parseBrowserCsv reads semicolon and tab exports', () => {
  const semicolon = parseBrowserCsv('name;url;username;password\nGitHub;github.com;octocat;secret');
  const tab = parseBrowserCsv('name\turl\tusername\tpassword\nGitHub\tgithub.com\toctocat\tsecret');

  assert.equal(semicolon.delimiter, ';');
  assert.equal(semicolon.accounts[0].sitio, 'github.com');
  assert.equal(tab.delimiter, '\t');
  assert.equal(tab.accounts[0].password, 'secret');
});

test('parseBrowserCsv imports a Firefox export', () => {
  const result = parseBrowserCsv(
    'url,username,password,httpRealm,formActionOrigin,guid,timeCreated,timeLastUsed,timePasswordChanged\n' +
      'https://example.com,me@example.com,secret,,https://example.com,{guid},1,2,3'
  );

  assert.equal(result.format, 'firefox');
  assert.equal(result.accounts.length, 1);
  assert.equal(result.accounts[0].usuario, 'me@example.com');
});

test('parseBrowserCsv imports Bitwarden logins and skips other item types', () => {
  const result = parseBrowserCsv(
    'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\n' +
      ',0,login,GitHub,work note,,0,https://github.com,octocat,secret,\n' +
      ',0,note,Recovery codes,plain text,,0,,,,\n' +
      ',0,card,Visa,,,0,,,,\n'
  );

  assert.equal(result.format, 'bitwarden');
  assert.equal(result.accounts.length, 1);
  assert.deepEqual(result.accounts[0], {
    sitio: 'github.com',
    usuario: 'octocat',
    password: 'secret',
    notas: 'work note',
  });
  assert.deepEqual(
    result.skipped.map((row) => row.reason),
    ['not_a_login', 'not_a_login']
  );
});

test('parseBrowserCsv imports LastPass and keeps the extra column as notes', () => {
  const result = parseBrowserCsv(
    'url,username,password,totp,extra,name,grouping,fav\n' +
      'https://example.com,me,secret,,recovery question: pet,Example,Work,0'
  );

  assert.equal(result.format, 'lastpass');
  assert.equal(result.accounts[0].notas, 'recovery question: pet');
  assert.equal(result.accounts[0].sitio, 'example.com');
});

test('parseBrowserCsv keeps spaces inside and around passwords', () => {
  const result = parseBrowserCsv(`${CHROME_HEADER}\nGitHub,https://github.com,octocat,"  secret  "`);

  assert.equal(result.accounts[0].password, '  secret  ');
});

test('parseBrowserCsv reports every skipped row with its reason', () => {
  const csv = [
    CHROME_HEADER,
    'No password,https://example.com,user,,',
    ',,user,secret,',
    'No username,https://example.org,,secret,',
  ].join('\n');

  const result = parseBrowserCsv(csv);

  assert.deepEqual(result.skipped, [
    { line: 2, reason: 'missing_password' },
    { line: 3, reason: 'missing_site' },
  ]);
  assert.equal(result.accounts.length, 1);
  assert.equal(result.accounts[0].usuario, '');
});

test('parseBrowserCsv collapses duplicate identities keeping the last row', () => {
  const csv = [
    CHROME_HEADER,
    'GitHub,https://github.com,octocat,first,',
    'Other,https://example.com,someone,other,',
    'GitHub,https://www.github.com,Octocat,second,',
  ].join('\n');

  const result = parseBrowserCsv(csv);

  assert.equal(result.duplicates, 1);
  assert.equal(result.accounts.length, 2);
  assert.equal(result.accounts[0].sitio, 'github.com');
  assert.equal(result.accounts[0].password, 'second');
  assert.equal(result.accounts[1].sitio, 'example.com');
});

test('parseBrowserCsv rejects empty and unrecognized files', () => {
  assert.throws(
    () => parseBrowserCsv('   \n  '),
    (error: unknown) => error instanceof CsvImportError && error.code === 'csv_empty'
  );
  assert.throws(
    () => parseBrowserCsv('foo,bar\n1,2'),
    (error: unknown) => error instanceof CsvImportError && error.code === 'csv_unrecognized_format'
  );
});

test('parseBrowserCsv enforces the size and row caps', () => {
  const huge = 'x'.repeat(MAX_CSV_BYTES + 1);
  assert.throws(
    () => parseBrowserCsv(huge),
    (error: unknown) => error instanceof CsvImportError && error.code === 'csv_too_large'
  );

  const rows = [CHROME_HEADER];
  for (let index = 0; index <= MAX_CSV_ROWS; index += 1) {
    rows.push(`Site ${index},https://example.com,user,secret,`);
  }
  assert.throws(
    () => parseBrowserCsv(rows.join('\n')),
    (error: unknown) => error instanceof CsvImportError && error.code === 'csv_too_large'
  );
});

test('previewCsvImport counts added, conflicting and unchanged rows', () => {
  const vault = vaultWith([
    entry({ id: 'same', password: 'csv-password' }),
    entry({ id: 'conflict', usuario: 'other', password: 'local-password' }),
  ]);
  const preview = previewCsvImport(vault, [
    imported(),
    imported({ usuario: 'other' }),
    imported({ sitio: 'example.com', usuario: 'new' }),
  ]);

  assert.deepEqual(preview, { total: 3, added: 1, conflicts: 1, unchanged: 1 });
});

test('applyCsvImport adds new accounts and leaves unchanged local data intact', () => {
  const local = entry({ id: 'same', password: 'csv-password', notas: 'notes I wrote', history: [{ password: 'old', updatedAt: NOW }] });
  const vault = vaultWith([local]);

  const { vault: merged, preview } = applyCsvImport(vault, [
    imported(),
    imported({ sitio: 'example.com', usuario: 'new', password: 'fresh', notas: 'from csv' }),
  ]);

  assert.equal(preview.unchanged, 1);
  assert.equal(preview.added, 1);
  assert.equal(merged.accounts.length, 2);

  const preserved = merged.accounts.find((account) => account.id === 'same');
  assert.equal(preserved?.notas, 'notes I wrote');
  assert.deepEqual(preserved?.history, [{ password: 'old', updatedAt: NOW }]);

  const added = merged.accounts.find((account) => account.sitio === 'example.com');
  assert.equal(added?.password, 'fresh');
  assert.equal(added?.notas, 'from csv');
  assert.equal(added?.deviceId, 'device-1');
  assert.deepEqual(added?.history, []);
});

test('applyCsvImport turns a different password into a conflict instead of overwriting', () => {
  const vault = vaultWith([entry({ id: 'local', password: 'local-password' })]);

  const { vault: merged, preview } = applyCsvImport(vault, [imported({ password: 'csv-password' })]);

  assert.equal(preview.conflicts, 1);
  assert.equal(merged.accounts.length, 1);
  assert.equal(merged.accounts[0].id, 'local');
  assert.equal(merged.accounts[0].password, 'local-password');
  assert.equal(merged.conflicts.length, 1);
  assert.equal(merged.conflicts[0].versionLocal.password, 'local-password');
  assert.equal(merged.conflicts[0].versionImportada.password, 'csv-password');
});

test('applyCsvImport returns the same vault when there is nothing to do', () => {
  const vault = vaultWith([entry({ password: 'csv-password' })]);

  const result = applyCsvImport(vault, [imported()]);

  assert.equal(result.vault, vault);
  assert.deepEqual(result.preview, { total: 1, added: 0, conflicts: 0, unchanged: 1 });
});

test('applyCsvImport does not mutate the vault it receives', () => {
  const vault = vaultWith([entry()]);
  const before = JSON.stringify(vault);

  applyCsvImport(vault, [imported({ sitio: 'example.com', usuario: 'new' })]);

  assert.equal(JSON.stringify(vault), before);
});
