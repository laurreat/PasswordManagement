/**
 * LocalPass - Vault merge rules
 *
 * One account identity is `sitio + usuario`, case-insensitive. When two
 * entries share an identity but disagree on the password, the merge never
 * guesses: it records a conflict and lets the user decide. When they agree,
 * the most recently updated entry wins.
 */

import type { AccountEntry, ConflictEntry, VaultDecrypted } from '@/lib/types';

export type ConflictSelection = 'local' | 'imported';

export function accountKey(account: Pick<AccountEntry, 'sitio' | 'usuario'>): string {
  return `${account.sitio.toLowerCase()}|${account.usuario.toLowerCase()}`;
}

export function conflictKey(conflict: Pick<ConflictEntry, 'sitio' | 'usuario'>): string {
  return `${conflict.sitio.toLowerCase()}|${conflict.usuario.toLowerCase()}`;
}

function passwordSetMatches(conflict: ConflictEntry, first: AccountEntry, second: AccountEntry): boolean {
  return (
    (conflict.versionLocal.password === first.password && conflict.versionImportada.password === second.password) ||
    (conflict.versionLocal.password === second.password && conflict.versionImportada.password === first.password)
  );
}

function buildConflict(first: AccountEntry, second: AccountEntry, now: string): ConflictEntry {
  return {
    conflictId: globalThis.crypto.randomUUID(),
    sitio: second.sitio,
    usuario: second.usuario,
    versionLocal: { ...first },
    versionImportada: { ...second },
    detectedAt: now,
  };
}

function isNewer(candidate: AccountEntry, reference: AccountEntry): boolean {
  return new Date(candidate.updatedAt).getTime() > new Date(reference.updatedAt).getTime();
}

/** Removes duplicate identities from a single vault and records divergences. */
export function dedupeAccounts(
  accounts: AccountEntry[],
  conflicts: ConflictEntry[]
): { accounts: AccountEntry[]; conflicts: ConflictEntry[] } {
  const merged = new Map<string, AccountEntry>();
  const resultConflicts = [...conflicts];
  const now = new Date().toISOString();

  for (const account of accounts) {
    const key = accountKey(account);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, account);
      continue;
    }

    if (existing.password !== account.password) {
      const alreadyRecorded = resultConflicts.some((conflict) => passwordSetMatches(conflict, existing, account));
      if (!alreadyRecorded) resultConflicts.push(buildConflict(existing, account, now));
      continue;
    }

    if (isNewer(account, existing)) merged.set(key, account);
  }

  return { accounts: [...merged.values()], conflicts: resultConflicts };
}

/**
 * Merges an imported vault into the local one. Conflicts are deduplicated by
 * account identity: two different passwords for the same account are a single
 * decision for the user, not a growing pile.
 */
export function mergeImportedVault(local: VaultDecrypted, imported: VaultDecrypted): VaultDecrypted {
  const now = new Date().toISOString();
  const mergedAccounts = [...local.accounts];
  const mergedConflicts = [...local.conflicts];

  const knownConflicts = new Set(mergedConflicts.map(conflictKey));
  for (const conflict of imported.conflicts) {
    const key = conflictKey(conflict);
    if (knownConflicts.has(key)) continue;
    mergedConflicts.push(conflict);
    knownConflicts.add(key);
  }

  for (const importedAccount of imported.accounts) {
    const key = accountKey(importedAccount);
    const localMatch = mergedAccounts.find((account) => accountKey(account) === key);

    if (!localMatch) {
      mergedAccounts.push(importedAccount);
      continue;
    }

    if (localMatch.password !== importedAccount.password) {
      if (!knownConflicts.has(key)) {
        mergedConflicts.push(buildConflict(localMatch, importedAccount, now));
        knownConflicts.add(key);
      }
      continue;
    }

    if (isNewer(importedAccount, localMatch)) {
      mergedAccounts[mergedAccounts.indexOf(localMatch)] = { ...importedAccount };
    }
  }

  return {
    ...local,
    accounts: mergedAccounts,
    conflicts: mergedConflicts,
    updatedAt: now,
  };
}

/** Applies the user's decision for a conflict, keeping account order stable. */
export function applyConflictResolution(
  vault: VaultDecrypted,
  conflictId: string,
  selection: ConflictSelection
): VaultDecrypted {
  const conflict = vault.conflicts.find((entry) => entry.conflictId === conflictId);
  if (!conflict) return vault;

  const chosen = selection === 'local' ? conflict.versionLocal : conflict.versionImportada;
  const key = conflictKey(conflict);
  const index = vault.accounts.findIndex((account) => accountKey(account) === key);

  // Exactly one above the local revision keeps the change publishable while
  // still guaranteeing the revision grows.
  const resolved: AccountEntry = {
    ...chosen,
    revision: index >= 0 ? (vault.accounts[index].revision ?? 0) + 1 : 1,
  };

  const accounts = [...vault.accounts];
  if (index >= 0) {
    accounts[index] = resolved;
  } else {
    accounts.push(resolved);
  }

  return {
    ...vault,
    accounts,
    conflicts: vault.conflicts.filter((entry) => entry.conflictId !== conflictId),
    updatedAt: new Date().toISOString(),
  };
}
