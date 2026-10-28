/**
 * LocalPass - Local security audit
 *
 * Deterministic, explainable and completely offline. There is no model, no
 * API call and no network access: every finding comes from rules that run in
 * the renderer over data the user already has.
 *
 * The mapping to NIST SP 800-63B, OWASP ASVS V2.1, OWASP Top 10 A07 and CWE is
 * advisory. It explains *why* a finding matters; it is not a certification.
 */

import type { AccountEntry, VaultDecrypted } from './types.ts';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

export type AuditIssueCode =
  | 'password_empty'
  | 'password_too_short'
  | 'password_missing_upper'
  | 'password_missing_lower'
  | 'password_missing_number'
  | 'password_missing_symbol'
  | 'password_common'
  | 'password_contains_account'
  | 'password_sequential'
  | 'password_repeated'
  | 'password_reused'
  | 'password_similar'
  | 'password_stale'
  | 'account_duplicate';

export type FrameworkRef =
  | 'NIST-800-63B-5.1.1.2'
  | 'OWASP-ASVS-V2.1'
  | 'OWASP-TOP10-A07'
  | 'CWE-521';

export const FRAMEWORK_LABELS: Record<FrameworkRef, string> = {
  'NIST-800-63B-5.1.1.2': 'NIST SP 800-63B §5.1.1.2',
  'OWASP-ASVS-V2.1': 'OWASP ASVS V2.1',
  'OWASP-TOP10-A07': 'OWASP Top 10 A07:2021',
  'CWE-521': 'CWE-521',
};

export type AuditFinding = {
  code: AuditIssueCode;
  severity: Severity;
  frameworks: FrameworkRef[];
  /** Other accounts involved, for reuse and similarity findings. */
  relatedAccountIds?: string[];
};

export type AccountAudit = {
  accountId: string;
  score: number;
  entropyBits: number;
  severity: Severity | 'secure';
  findings: AuditFinding[];
};

export type VaultAudit = {
  score: number;
  accounts: Record<string, AccountAudit>;
  counts: Record<Severity, number>;
  generatedAt: string;
};

const MIN_LENGTH = 12;
const RECOMMENDED_LENGTH = 15;
const STALE_AFTER_DAYS = 365;

const COMMON_PATTERNS = [
  'password', 'passw0rd', 'contraseña', 'contrasena', 'admin', 'administrator',
  'welcome', 'letmein', 'qwerty', 'iloveyou', 'monkey', 'dragon', 'master',
  'sunshine', 'princess', 'football', 'baseball', 'superman', 'batman',
  'trustno1', 'shadow', 'michael', 'jennifer', 'hunter', 'freedom', 'whatever',
  'abc123', '123456', '12345678', '123456789', '1234567890', 'qwerty123',
  'default', 'changeme', 'secret', 'login', 'root', 'toor', 'guest',
];

const KEYBOARD_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890'];

const SEQUENTIAL_PATTERN =
  /(012|123|234|345|456|567|678|789|890|abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)/i;

const FRAMEWORKS = {
  length: ['NIST-800-63B-5.1.1.2', 'OWASP-ASVS-V2.1', 'CWE-521'] as FrameworkRef[],
  common: ['NIST-800-63B-5.1.1.2', 'OWASP-ASVS-V2.1', 'CWE-521'] as FrameworkRef[],
  reuse: ['OWASP-TOP10-A07', 'CWE-521'] as FrameworkRef[],
  composition: ['OWASP-ASVS-V2.1'] as FrameworkRef[],
  pattern: ['OWASP-ASVS-V2.1', 'CWE-521'] as FrameworkRef[],
  hygiene: [] as FrameworkRef[],
};

export function detectPoolSize(password: string): number {
  let size = 0;
  if (/[a-z]/.test(password)) size += 26;
  if (/[A-Z]/.test(password)) size += 26;
  if (/[0-9]/.test(password)) size += 10;
  if (/[^A-Za-z0-9]/.test(password)) size += 33;
  return size;
}

/**
 * Entropy of a password drawn uniformly from the detected character pool.
 * This is an upper bound: human-chosen passwords carry structure that the
 * pattern findings below attempt to discount.
 */
export function estimateEntropyBits(password: string): number {
  if (!password) return 0;
  const pool = detectPoolSize(password);
  if (pool < 2) return 0;
  return Math.round(password.length * Math.log2(pool));
}

function containsKeyboardRun(password: string): boolean {
  const normalized = password.toLowerCase();
  for (const row of KEYBOARD_ROWS) {
    for (let length = 4; length <= row.length; length += 1) {
      for (let start = 0; start + length <= row.length; start += 1) {
        const run = row.slice(start, start + length);
        if (normalized.includes(run) || normalized.includes([...run].reverse().join(''))) {
          return true;
        }
      }
    }
  }
  return false;
}

function containsCommonPattern(password: string): boolean {
  const normalized = password.toLowerCase();
  return COMMON_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function levenshtein(first: string, second: string): number {
  if (first === second) return 0;
  const previous = Array.from({ length: second.length + 1 }, (_, index) => index);

  for (let i = 1; i <= first.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= second.length; j += 1) {
      const saved = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (first[i - 1] === second[j - 1] ? 0 : 1)
      );
      diagonal = saved;
    }
  }

  return previous[second.length];
}

/** Near-identical passwords matter because one breach would expose both. */
export function arePasswordsSimilar(first: string, second: string): boolean {
  if (!first || !second || first === second) return false;

  const a = first.toLowerCase();
  const b = second.toLowerCase();
  const shortest = Math.min(a.length, b.length);
  if (shortest < 8) return false;

  if (a.startsWith(b) || b.startsWith(a)) return true;

  const distance = levenshtein(a, b);
  const allowed = Math.max(1, Math.floor(Math.max(a.length, b.length) * 0.15));
  return distance <= allowed;
}

function accountTokens(account: AccountEntry): string[] {
  const fromUser = account.usuario.split('@')[0];
  const domain = account.sitio.replace(/^https?:\/\//i, '').split('/')[0].split('.')[0];
  return [fromUser, domain]
    .map((token) => token.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter((token) => token.length >= 4);
}

function severityForScore(score: number, hasCritical: boolean): Severity | 'secure' {
  if (hasCritical) return 'critical';
  if (score < 50) return 'high';
  if (score < 70) return 'medium';
  if (score < 85) return 'low';
  return 'secure';
}

function maxSeverity(findings: AuditFinding[]): Severity | null {
  for (const severity of SEVERITY_ORDER) {
    if (findings.some((finding) => finding.severity === severity)) return severity;
  }
  return null;
}

export function auditPassword(account: AccountEntry): AccountAudit {
  const findings: AuditFinding[] = [];
  const password = account.password ?? '';

  if (!password) {
    findings.push({ code: 'password_empty', severity: 'critical', frameworks: FRAMEWORKS.length });
    return {
      accountId: account.id,
      score: 0,
      entropyBits: 0,
      severity: 'critical',
      findings,
    };
  }

  const entropyBits = estimateEntropyBits(password);

  if (password.length < MIN_LENGTH) {
    findings.push({ code: 'password_too_short', severity: 'high', frameworks: FRAMEWORKS.length });
  } else if (password.length < RECOMMENDED_LENGTH) {
    findings.push({ code: 'password_too_short', severity: 'medium', frameworks: FRAMEWORKS.length });
  }

  if (!/[a-z]/.test(password)) {
    findings.push({ code: 'password_missing_lower', severity: 'low', frameworks: FRAMEWORKS.composition });
  }
  if (!/[A-Z]/.test(password)) {
    findings.push({ code: 'password_missing_upper', severity: 'low', frameworks: FRAMEWORKS.composition });
  }
  if (!/[0-9]/.test(password)) {
    findings.push({ code: 'password_missing_number', severity: 'low', frameworks: FRAMEWORKS.composition });
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    findings.push({ code: 'password_missing_symbol', severity: 'low', frameworks: FRAMEWORKS.composition });
  }

  if (containsCommonPattern(password)) {
    findings.push({ code: 'password_common', severity: 'critical', frameworks: FRAMEWORKS.common });
  }

  const normalizedPassword = password.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (accountTokens(account).some((token) => normalizedPassword.includes(token))) {
    findings.push({
      code: 'password_contains_account',
      severity: 'high',
      frameworks: [...FRAMEWORKS.common, 'OWASP-TOP10-A07'],
    });
  }

  if (SEQUENTIAL_PATTERN.test(password) || containsKeyboardRun(password)) {
    findings.push({ code: 'password_sequential', severity: 'medium', frameworks: FRAMEWORKS.pattern });
  }

  if (/(.)\1{3,}/.test(password)) {
    findings.push({ code: 'password_repeated', severity: 'medium', frameworks: FRAMEWORKS.pattern });
  }

  const ageInDays = (Date.now() - new Date(account.updatedAt).getTime()) / 86_400_000;
  if (Number.isFinite(ageInDays) && ageInDays > STALE_AFTER_DAYS) {
    // NIST discourages forced rotation, so this is context, not a penalty.
    findings.push({ code: 'password_stale', severity: 'info', frameworks: FRAMEWORKS.hygiene });
  }

  const hasCritical = findings.some((finding) => finding.severity === 'critical');
  const score = Math.max(0, Math.min(100, entropyBits));

  return {
    accountId: account.id,
    score,
    entropyBits,
    severity: severityForScore(score, hasCritical),
    findings,
  };
}

function addCrossAccountFindings(vault: VaultDecrypted, accounts: Record<string, AccountAudit>): void {
  const withPassword = vault.accounts.filter((account) => account.password);

  const byPassword = new Map<string, string[]>();
  for (const account of withPassword) {
    const group = byPassword.get(account.password) ?? [];
    group.push(account.id);
    byPassword.set(account.password, group);
  }

  for (const group of byPassword.values()) {
    if (group.length < 2) continue;
    for (const accountId of group) {
      accounts[accountId]?.findings.push({
        code: 'password_reused',
        severity: 'high',
        frameworks: FRAMEWORKS.reuse,
        relatedAccountIds: group.filter((id) => id !== accountId),
      });
    }
  }

  for (let i = 0; i < withPassword.length; i += 1) {
    for (let j = i + 1; j < withPassword.length; j += 1) {
      const first = withPassword[i];
      const second = withPassword[j];
      if (!arePasswordsSimilar(first.password, second.password)) continue;

      accounts[first.id]?.findings.push({
        code: 'password_similar',
        severity: 'medium',
        frameworks: FRAMEWORKS.reuse,
        relatedAccountIds: [second.id],
      });
      accounts[second.id]?.findings.push({
        code: 'password_similar',
        severity: 'medium',
        frameworks: FRAMEWORKS.reuse,
        relatedAccountIds: [first.id],
      });
    }
  }

  const byIdentity = new Map<string, number>();
  for (const account of vault.accounts) {
    const key = `${account.sitio.toLowerCase()}|${account.usuario.toLowerCase()}`;
    byIdentity.set(key, (byIdentity.get(key) ?? 0) + 1);
  }

  for (const account of vault.accounts) {
    const key = `${account.sitio.toLowerCase()}|${account.usuario.toLowerCase()}`;
    if ((byIdentity.get(key) ?? 0) < 2) continue;
    accounts[account.id]?.findings.push({
      code: 'account_duplicate',
      severity: 'info',
      frameworks: FRAMEWORKS.hygiene,
    });
  }
}

function applyFindingPenalties(audit: AccountAudit): void {
  let score = audit.score;

  for (const finding of audit.findings) {
    switch (finding.code) {
      case 'password_common':
        score -= 45;
        break;
      case 'password_contains_account':
        score -= 25;
        break;
      case 'password_reused':
        score -= 20;
        break;
      case 'password_similar':
        score -= 10;
        break;
      case 'password_sequential':
        score -= 10;
        break;
      case 'password_repeated':
        score -= 10;
        break;
      case 'password_empty':
        score = 0;
        break;
      default:
        break;
    }
  }

  audit.score = Math.max(0, Math.min(100, Math.round(score)));
  audit.severity = severityForScore(
    audit.score,
    audit.findings.some((finding) => finding.severity === 'critical')
  );
}

export function auditVault(vault: VaultDecrypted): VaultAudit {
  const accounts: Record<string, AccountAudit> = {};

  for (const account of vault.accounts) {
    accounts[account.id] = auditPassword(account);
  }

  addCrossAccountFindings(vault, accounts);

  for (const audit of Object.values(accounts)) {
    applyFindingPenalties(audit);
  }

  const list = Object.values(accounts);
  const score = list.length === 0
    ? 100
    : Math.round(list.reduce((total, audit) => total + audit.score, 0) / list.length);

  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const audit of list) {
    const severity = maxSeverity(audit.findings);
    if (severity) counts[severity] += 1;
  }

  return {
    score,
    accounts,
    counts,
    generatedAt: new Date().toISOString(),
  };
}

export function recommendationsFor(audit: AccountAudit): AuditIssueCode[] {
  const seen = new Set<AuditIssueCode>();
  const ordered: AuditIssueCode[] = [];

  for (const severity of SEVERITY_ORDER) {
    for (const finding of audit.findings) {
      if (finding.severity !== severity || seen.has(finding.code)) continue;
      seen.add(finding.code);
      ordered.push(finding.code);
    }
  }

  return ordered;
}
