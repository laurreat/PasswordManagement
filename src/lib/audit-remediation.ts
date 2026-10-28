/**
 * LocalPass - Audit remediation
 *
 * The audit reports password problems; this module turns a finding into a
 * concrete, reviewable change. It never writes to the vault on its own:
 * `applyPasswordRemediation` receives an explicit password the user already
 * saw in the confirmation dialog.
 *
 * A generated candidate is re-audited against the whole vault before it is
 * offered, so the fix cannot introduce reuse, similarity or a weak pattern.
 * `password_stale` and `account_duplicate` are advisory: NIST does not
 * recommend forced rotation, and a duplicate identity is not a password
 * problem, so neither exposes the fix action.
 */

import type { AccountEntry, PasswordHistory, VaultDecrypted } from './types.ts';
import {
  arePasswordsSimilar,
  auditPassword,
  type AccountAudit,
  type AuditIssueCode,
} from './security-audit.ts';
import { generatePassword, type PasswordGeneratorOptions } from './password-generator.ts';

/** Findings that a new password cannot honestly fix. */
export const ADVISORY_ISSUES: readonly AuditIssueCode[] = [
  'password_stale',
  'account_duplicate',
];

export const REMEDIATION_PASSWORD_OPTIONS: PasswordGeneratorOptions = {
  length: 20,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
  excludeAmbiguous: false,
};

const GENERATION_ATTEMPTS = 64;
const FALLBACK_LENGTH = 32;

function uniqueCodes(codes: AuditIssueCode[]): AuditIssueCode[] {
  return [...new Set(codes)];
}

export function isAdvisoryIssue(code: AuditIssueCode): boolean {
  return ADVISORY_ISSUES.includes(code);
}

/** Findings that setting a new password is expected to resolve. */
export function remediationIssues(audit: AccountAudit): AuditIssueCode[] {
  return uniqueCodes(
    audit.findings
      .map((finding) => finding.code)
      .filter((code) => !isAdvisoryIssue(code))
  );
}

/** Findings that remain visible but are not fixed by this dialog. */
export function advisoryIssues(audit: AccountAudit): AuditIssueCode[] {
  return uniqueCodes(audit.findings.map((finding) => finding.code).filter(isAdvisoryIssue));
}

/**
 * Findings a concrete candidate would still have. Reuse and similarity are
 * cross-account rules, so they need every other password in the vault.
 * Informational findings are not blockers.
 */
export function remainingFindingCodes(
  account: AccountEntry,
  candidate: string,
  otherPasswords: string[]
): AuditIssueCode[] {
  if (!candidate) return ['password_empty'];

  const codes = new Set<AuditIssueCode>();
  const audit = auditPassword({ ...account, password: candidate });

  for (const finding of audit.findings) {
    if (finding.severity !== 'info') codes.add(finding.code);
  }

  if (otherPasswords.some((password) => password === candidate)) {
    codes.add('password_reused');
  } else if (otherPasswords.some((password) => arePasswordsSimilar(password, candidate))) {
    codes.add('password_similar');
  }

  return [...codes];
}

/**
 * CSPRNG candidate that passes the audit and is unique in the vault. The
 * fallback is longer and therefore still clean; it exists so a pathological
 * account can never leave the dialog without a usable password.
 */
export function generateRemediationPassword(
  account: AccountEntry,
  otherPasswords: string[]
): string {
  for (let attempt = 0; attempt < GENERATION_ATTEMPTS; attempt += 1) {
    const candidate = generatePassword(REMEDIATION_PASSWORD_OPTIONS);
    if (candidate === account.password) continue;
    if (remainingFindingCodes(account, candidate, otherPasswords).length === 0) return candidate;
  }

  return generatePassword({ ...REMEDIATION_PASSWORD_OPTIONS, length: FALLBACK_LENGTH });
}

/**
 * Applies a password the user confirmed. The previous password is prepended
 * to the history with the timestamp it was last valid, matching the manual
 * edit flow in the vault.
 */
export function applyPasswordRemediation(
  vault: VaultDecrypted,
  accountId: string,
  newPassword: string,
  now: string = new Date().toISOString()
): VaultDecrypted {
  if (!newPassword) return vault;

  const target = vault.accounts.find((account) => account.id === accountId);
  if (!target || target.password === newPassword) return vault;

  const accounts = vault.accounts.map((account) => {
    if (account.id !== accountId) return account;

    const history: PasswordHistory[] = account.password
      ? [{ password: account.password, updatedAt: account.updatedAt }, ...account.history]
      : account.history;

    return {
      ...account,
      password: newPassword,
      updatedAt: now,
      history,
    };
  });

  return { ...vault, accounts };
}
