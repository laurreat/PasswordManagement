import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ADVISORY_ISSUES,
  advisoryIssues,
  applyPasswordRemediation,
  generateRemediationPassword,
  isAdvisoryIssue,
  remediationIssues,
  remainingFindingCodes,
} from '../src/lib/audit-remediation.ts';
import type { AccountEntry, VaultDecrypted } from '../src/lib/types.ts';
import type { AccountAudit } from '../src/lib/security-audit.ts';

const NOW = '2026-10-28T12:00:00.000Z';
const OLD = '2026-01-01T00:00:00.000Z';
const STRONG = 'V7#kq2Lm!pR9xT4wZ8@c';

function entry(overrides: Partial<AccountEntry> = {}): AccountEntry {
  return {
    id: 'account-1',
    sitio: 'github.com',
    usuario: 'octocat',
    password: 'old-pass',
    notas: '',
    createdAt: OLD,
    updatedAt: OLD,
    deviceId: 'device-1',
    history: [],
    ...overrides,
  };
}

function vaultWith(accounts: AccountEntry[]): VaultDecrypted {
  return {
    vaultVersion: '1.0',
    deviceId: 'device-1',
    createdAt: OLD,
    updatedAt: OLD,
    accounts,
    conflicts: [],
  };
}

test('remediationIssues keeps password findings and drops advisory ones', () => {
  const audit: AccountAudit = {
    accountId: 'account-1',
    score: 40,
    entropyBits: 40,
    severity: 'medium',
    findings: [
      { code: 'password_too_short', severity: 'high', frameworks: [] },
      { code: 'password_stale', severity: 'info', frameworks: [] },
      { code: 'account_duplicate', severity: 'info', frameworks: [] },
      { code: 'password_too_short', severity: 'high', frameworks: [] },
    ],
  };

  assert.deepEqual(remediationIssues(audit), ['password_too_short']);
  assert.deepEqual(advisoryIssues(audit), ['password_stale', 'account_duplicate']);
});

test('advisory issues are exactly stale and duplicate', () => {
  assert.deepEqual([...ADVISORY_ISSUES], ['password_stale', 'account_duplicate']);
  assert.equal(isAdvisoryIssue('password_stale'), true);
  assert.equal(isAdvisoryIssue('account_duplicate'), true);
  assert.equal(isAdvisoryIssue('password_reused'), false);
});

test('remainingFindingCodes rejects weak candidates', () => {
  const account = entry();
  const weak = remainingFindingCodes(account, 'password123', []);

  assert.ok(weak.includes('password_too_short'));
  assert.ok(weak.includes('password_common'));
});

test('remainingFindingCodes accepts a strong, unique candidate', () => {
  const account = entry();

  assert.deepEqual(remainingFindingCodes(account, STRONG, ['other-password', 'another-one']), []);
});

test('remainingFindingCodes reports an empty candidate', () => {
  assert.deepEqual(remainingFindingCodes(entry(), '', []), ['password_empty']);
});

test('remainingFindingCodes detects reuse against the rest of the vault', () => {
  const account = entry();

  assert.ok(remainingFindingCodes(account, STRONG, [STRONG]).includes('password_reused'));
});

test('remainingFindingCodes detects similarity against the rest of the vault', () => {
  const account = entry();
  const similar = `${STRONG}9`;

  assert.ok(remainingFindingCodes(account, STRONG, [similar]).includes('password_similar'));
});

test('generateRemediationPassword returns a clean CSPRNG candidate', () => {
  const account = entry();
  const otherPasswords = ['xK4$mQ8!tR2#vB6@nL9&'];

  const candidate = generateRemediationPassword(account, otherPasswords);

  assert.equal(candidate.length, 20);
  assert.match(candidate, /[a-z]/);
  assert.match(candidate, /[A-Z]/);
  assert.match(candidate, /[0-9]/);
  assert.match(candidate, /[^A-Za-z0-9]/);
  assert.notEqual(candidate, account.password);
  assert.deepEqual(remainingFindingCodes(account, candidate, otherPasswords), []);
});

test('generateRemediationPassword does not repeat the same password', () => {
  const account = entry();

  assert.notEqual(
    generateRemediationPassword(account, []),
    generateRemediationPassword(account, [])
  );
});

test('applyPasswordRemediation updates the password and keeps the previous one', () => {
  const account = entry({
    history: [{ password: 'older-pass', updatedAt: '2025-06-01T00:00:00.000Z' }],
  });
  const other = entry({ id: 'account-2', usuario: 'someone' });
  const vault = vaultWith([account, other]);

  const result = applyPasswordRemediation(vault, account.id, STRONG, NOW);

  assert.equal(result.accounts[0].password, STRONG);
  assert.equal(result.accounts[0].updatedAt, NOW);
  assert.deepEqual(result.accounts[0].history, [
    { password: 'old-pass', updatedAt: OLD },
    { password: 'older-pass', updatedAt: '2025-06-01T00:00:00.000Z' },
  ]);
  assert.deepEqual(result.accounts[1], other);
  assert.equal(result.conflicts, vault.conflicts);
});

test('applyPasswordRemediation does not mutate the vault it receives', () => {
  const vault = vaultWith([entry()]);
  const before = JSON.stringify(vault);

  applyPasswordRemediation(vault, 'account-1', STRONG, NOW);

  assert.equal(JSON.stringify(vault), before);
});

test('applyPasswordRemediation is a no-op for missing, empty or unchanged passwords', () => {
  const vault = vaultWith([entry()]);

  assert.equal(applyPasswordRemediation(vault, 'missing', STRONG, NOW), vault);
  assert.equal(applyPasswordRemediation(vault, 'account-1', '', NOW), vault);
  assert.equal(applyPasswordRemediation(vault, 'account-1', 'old-pass', NOW), vault);
});

test('applyPasswordRemediation leaves history empty when there was no password', () => {
  const vault = vaultWith([entry({ password: '' })]);

  const result = applyPasswordRemediation(vault, 'account-1', STRONG, NOW);

  assert.equal(result.accounts[0].password, STRONG);
  assert.deepEqual(result.accounts[0].history, []);
});
