import test from 'node:test';
import assert from 'node:assert/strict';

import {
  arePasswordsSimilar,
  auditPassword,
  auditVault,
  estimateEntropyBits,
  recommendationsFor,
} from '../src/lib/security-audit.ts';
import type { AccountEntry, VaultDecrypted } from '../src/lib/types.ts';

const STRONG = 'Xk9#mQ2$vL7!pR4@tW8&';

function account(overrides: Partial<AccountEntry> = {}): AccountEntry {
  return {
    id: 'acc-1',
    sitio: 'github.com',
    usuario: 'user@example.com',
    password: STRONG,
    notas: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: new Date().toISOString(),
    deviceId: 'device',
    history: [],
    ...overrides,
  };
}

function vault(accounts: AccountEntry[]): VaultDecrypted {
  return {
    vaultVersion: '1.0',
    deviceId: 'device',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    accounts,
    conflicts: [],
  };
}

function codes(accountAudit: ReturnType<typeof auditPassword>): string[] {
  return accountAudit.findings.map((finding) => finding.code);
}

test('empty passwords are critical and score zero', () => {
  const result = auditVault(vault([account({ password: '' })]));
  const audit = result.accounts['acc-1'];

  assert.equal(audit.score, 0);
  assert.equal(audit.severity, 'critical');
  assert.ok(codes(audit).includes('password_empty'));
});

test('a strong random password scores 100 with no findings', () => {
  const result = auditVault(vault([account()]));
  const audit = result.accounts['acc-1'];

  assert.equal(audit.score, 100);
  assert.equal(audit.severity, 'secure');
  assert.deepEqual(audit.findings, []);
  assert.equal(result.score, 100);
});

test('short passwords are flagged with the right severity', () => {
  const medium = auditPassword(account({ password: 'Ab3$efghijkl' }));
  assert.equal(medium.findings.find((finding) => finding.code === 'password_too_short')?.severity, 'medium');

  const high = auditPassword(account({ password: 'Ab3$efg' }));
  assert.equal(high.findings.find((finding) => finding.code === 'password_too_short')?.severity, 'high');
});

test('common patterns are critical and heavily penalized', () => {
  const result = auditVault(vault([account({ password: 'MyPassword123!' })]));
  const audit = result.accounts['acc-1'];

  assert.ok(codes(audit).includes('password_common'));
  assert.ok(audit.score < 70);
  assert.equal(audit.severity, 'critical');
});

test('passwords containing the site or username are flagged', () => {
  const audit = auditPassword(account({ password: 'github-2026-Secure' }));
  assert.ok(codes(audit).includes('password_contains_account'));
});

test('sequences and repeats are detected', () => {
  assert.ok(codes(auditPassword(account({ password: 'Abcdef123456!' }))).includes('password_sequential'));
  assert.ok(codes(auditPassword(account({ password: 'Aaaaa9$bcdefgh' }))).includes('password_repeated'));
});

test('reuse flags every account involved and lowers the score', () => {
  const shared = 'Zx7$Lm3!Qp9@Rt5#';
  const result = auditVault(
    vault([
      account({ id: 'a', sitio: 'one.com' }),
      account({ id: 'b', sitio: 'two.com' }),
    ])
  );

  for (const id of ['a', 'b']) {
    const audit = result.accounts[id];
    const reuse = audit.findings.find((finding) => finding.code === 'password_reused');
    assert.ok(reuse, `missing reuse finding for ${id}`);
    assert.equal(reuse.severity, 'high');
    assert.equal(reuse.relatedAccountIds?.length, 1);
    assert.ok(audit.score < 100);
  }
  assert.equal(shared.length > 0, true);
});

test('similar passwords are detected without being treated as reuse', () => {
  assert.equal(arePasswordsSimilar(STRONG, `${STRONG}x`), true);
  assert.equal(arePasswordsSimilar(STRONG, 'completely-different-9!'), false);
  assert.equal(arePasswordsSimilar('short1!', 'short2!'), false);

  const result = auditVault(
    vault([
      account({ id: 'a' }),
      account({ id: 'b', password: `${STRONG}x` }),
    ])
  );

  assert.ok(codes(result.accounts.a).includes('password_similar'));
  assert.ok(!codes(result.accounts.a).includes('password_reused'));
});

test('duplicate identities are reported as informational', () => {
  const result = auditVault(vault([account({ id: 'a' }), account({ id: 'b' })]));
  const duplicate = result.accounts.a.findings.find((finding) => finding.code === 'account_duplicate');
  assert.equal(duplicate?.severity, 'info');
});

test('old passwords are informational, not a penalty', () => {
  const old = auditPassword(account({ updatedAt: '2019-01-01T00:00:00.000Z' }));
  assert.equal(old.findings.find((finding) => finding.code === 'password_stale')?.severity, 'info');
  assert.equal(old.score, 100);
});

test('entropy grows with length and character pool', () => {
  assert.ok(estimateEntropyBits('abcdefghijkl') < estimateEntropyBits('abcdefghijklmnop'));
  assert.ok(estimateEntropyBits('abcdefghijkl') < estimateEntropyBits('Abcdefgh1234'));
  assert.equal(estimateEntropyBits(''), 0);
});

test('vault score is the average of its accounts', () => {
  const result = auditVault(vault([account({ id: 'a' }), account({ id: 'b', password: '' })]));
  assert.equal(result.score, 50);
  assert.equal(result.counts.critical, 1);
});

test('recommendations are ordered by severity and deduplicated', () => {
  const result = auditVault(vault([account({ password: 'password123' })]));
  const recommendations = recommendationsFor(result.accounts['acc-1']);

  assert.ok(recommendations.length > 0);
  assert.equal(new Set(recommendations).size, recommendations.length);
  assert.equal(recommendations[0], 'password_common');
});
