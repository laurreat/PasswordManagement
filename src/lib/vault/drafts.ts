/**
 * LocalPass - Vault drafts
 *
 * An edit made in the dashboard is held as an encrypted draft in the vault
 * until the user explicitly commits it via "Guardar". This prevents accidental
 * direct writes and ensures sync logs only receive confirmed user actions.
 */

import type { AccountEntry, DraftType, VaultDecrypted, VaultDraft } from './types.ts';
import { accountKey } from './vault-merge.ts';

export type CreateDraftInput = {
  type: DraftType;
  before: AccountEntry | null;
  after: AccountEntry | null;
  createdAt?: string;
};

export function createDraft(input: CreateDraftInput): VaultDraft {
  const target = input.after ?? input.before;
  if (!target) {
    throw new Error('draft requires an account');
  }

  const now = input.createdAt ?? new Date().toISOString();
  return {
    draftId: globalThis.crypto.randomUUID(),
    type: input.type,
    accountId: target.id,
    accountKey: accountKey(target),
    before: input.before ? { ...input.before } : null,
    after: input.after ? { ...input.after } : null,
    createdAt: now,
    updatedAt: now,
  };
}

export function upsertDraft(drafts: VaultDraft[] = [], draft: VaultDraft): VaultDraft[] {
  const index = drafts.findIndex((d) => d.accountId === draft.accountId);
  if (index >= 0) {
    const next = [...drafts];
    next[index] = draft;
    return next;
  }
  return [...drafts, draft];
}

export function removeDraft(drafts: VaultDraft[] = [], draftId: string): VaultDraft[] {
  return drafts.filter((d) => d.draftId !== draftId);
}

export function draftForAccount(drafts: VaultDraft[] = [], accountId: string): VaultDraft | undefined {
  return drafts.find((d) => d.accountId === accountId);
}

export function isDraftStale(draft: VaultDraft, vault: VaultDecrypted): boolean {
  if (draft.type === 'create') {
    return vault.accounts.some((a) => accountKey(a) === draft.accountKey);
  }
  const current = vault.accounts.find((a) => a.id === draft.accountId);
  if (!current) return true;
  return (current.revision ?? 0) !== (draft.before?.revision ?? 0);
}

