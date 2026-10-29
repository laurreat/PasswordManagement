import test from 'node:test';
import assert from 'node:assert/strict';

import type { AccountEntry, VaultDecrypted, VaultDraft } from '../src/lib/types.ts';
import {
  createDraft,
  draftForAccount,
  isDraftStale,
  removeDraft,
  upsertDraft,
} from '../src/lib/drafts.ts';
import { commitDraft } from '../src/lib/sync/engine.ts';
import { emptyChangeLog } from '../src/lib/sync/changes.ts';
import { SyncError } from '../src/lib/sync/errors.ts';

function account(overrides: Partial<AccountEntry> = {}): AccountEntry {
  return {
    id: `acc-${Math.random().toString(36).slice(2)}`,
    sitio: 'github.com',
    usuario: 'dev@localpass.app',
    password: 'secret-password-1',
    notas: 'note',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deviceId: 'device-1',
    history: [],
    revision: 0,
    ...overrides,
  };
}

function vault(overrides: Partial<VaultDecrypted> = {}): VaultDecrypted {
  return {
    vaultVersion: '1.0',
    deviceId: 'device-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    accounts: [],
    conflicts: [],
    drafts: [],
    ...overrides,
  };
}

test('createDraft creates valid draft structure and derives accountKey', () => {
  const target = account({ sitio: 'GitLab.com', usuario: 'User@Org.com' });
  const draft = createDraft({
    type: 'create',
    before: null,
    after: target,
    createdAt: '2026-10-28T20:00:00.000Z',
  });

  assert.equal(draft.type, 'create');
  assert.equal(draft.accountId, target.id);
  assert.equal(draft.accountKey, 'gitlab.com|user@org.com');
  assert.equal(draft.before, null);
  assert.deepEqual(draft.after, target);
  assert.equal(draft.createdAt, '2026-10-28T20:00:00.000Z');
});

test('createDraft throws if neither before nor after is provided', () => {
  assert.throws(() => {
    createDraft({
      type: 'create',
      before: null,
      after: null,
    });
  }, /draft requires an account/);
});

test('upsertDraft adds a new draft and updates an existing one for same account', () => {
  const acc1 = account({ id: 'acc-1' });
  const acc2 = account({ id: 'acc-2' });

  const draft1 = createDraft({ type: 'create', before: null, after: acc1 });
  const list1 = upsertDraft([], draft1);
  assert.equal(list1.length, 1);
  assert.equal(list1[0].draftId, draft1.draftId);

  const draft2 = createDraft({ type: 'create', before: null, after: acc2 });
  const list2 = upsertDraft(list1, draft2);
  assert.equal(list2.length, 2);

  const updatedDraft1 = createDraft({ type: 'update', before: acc1, after: { ...acc1, password: 'changed' } });
  const list3 = upsertDraft(list2, updatedDraft1);
  assert.equal(list3.length, 2);
  assert.equal(list3.find((d) => d.accountId === 'acc-1')?.after?.password, 'changed');
});

test('removeDraft removes by draftId and draftForAccount finds draft', () => {
  const acc = account({ id: 'acc-1' });
  const draft = createDraft({ type: 'create', before: null, after: acc });

  const list = [draft];
  assert.equal(draftForAccount(list, 'acc-1')?.draftId, draft.draftId);
  assert.equal(draftForAccount(list, 'acc-unknown'), undefined);

  const removed = removeDraft(list, draft.draftId);
  assert.equal(removed.length, 0);
});

test('isDraftStale correctly identifies stale drafts', () => {
  const current = account({ id: 'acc-1', revision: 2 });
  const v = vault({ accounts: [current] });

  // Update with matching base revision -> not stale
  const freshDraft = createDraft({
    type: 'update',
    before: { ...current, revision: 2 },
    after: { ...current, revision: 2, password: 'new' },
  });
  assert.equal(isDraftStale(freshDraft, v), false);

  // Update with mismatched revision -> stale
  const staleDraft = createDraft({
    type: 'update',
    before: { ...current, revision: 1 },
    after: { ...current, revision: 1, password: 'new' },
  });
  assert.equal(isDraftStale(staleDraft, v), true);

  // Create where account already exists -> stale
  const duplicateCreate = createDraft({
    type: 'create',
    before: null,
    after: account({ sitio: current.sitio, usuario: current.usuario }),
  });
  assert.equal(isDraftStale(duplicateCreate, v), true);

  // Delete where account does not exist -> stale
  const deleteMissing = createDraft({
    type: 'delete',
    before: account({ id: 'missing' }),
    after: null,
  });
  assert.equal(isDraftStale(deleteMissing, v), true);
});

test('commitDraft commits draft to log and removes it from vault.drafts', () => {
  const log = emptyChangeLog('device-1', 'Laptop');
  const target = account({ id: 'acc-new', revision: 0 });
  const draft = createDraft({
    type: 'create',
    before: null,
    after: target,
  });

  const v = vault({
    deviceId: 'device-1',
    accounts: [],
    drafts: [draft],
  });

  const staged = commitDraft(log, v, draft);

  // Vault accounts updated
  assert.equal(staged.vault.accounts.length, 1);
  assert.equal(staged.vault.accounts[0].id, 'acc-new');
  assert.equal(staged.vault.accounts[0].revision, 1);

  // Draft removed from vault
  assert.equal(staged.vault.drafts?.length, 0);

  // Log updated
  assert.equal(staged.log.entries.length, 1);
  assert.equal(staged.entry.type, 'create');
  assert.equal(staged.entry.seq, 1);
});

test('commitDraft rejects a stale draft with SyncError', () => {
  const log = emptyChangeLog('device-1', 'Laptop');
  const current = account({ id: 'acc-1', revision: 2 });
  const v = vault({
    deviceId: 'device-1',
    accounts: [current],
  });

  const staleDraft = createDraft({
    type: 'update',
    before: { ...current, revision: 1 },
    after: { ...current, password: 'pwned' },
  });

  assert.throws(() => {
    commitDraft(log, v, staleDraft);
  }, (err: unknown) => err instanceof SyncError && err.code === 'sync_invalid_change');
});
