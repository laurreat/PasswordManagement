# Feature: audit-search-remediation

## Objective

Make the security audit actionable: find an account quickly, open only the
cards you care about, and fix a weak password from the finding itself with a
review step instead of an automatic rewrite.

## Problem

The audit ranks every account and prints every finding, but it is a long list
with no search. Report-only findings force the user to leave the audit, find
the same account in the vault, edit it, generate a password elsewhere and
paste it back. That friction is why weak passwords stay weak.

## Scope

In scope:

- Search in the audit by site, email or user, same behavior as the vault
  search.
- Per-account expand/collapse, plus expand-all/collapse-all for the visible
  results. Expanded cards show account facts and findings; collapsed cards
  keep only identity, score and severity.
- A "Fix" action inside the findings of an account that has at least one
  password-related finding.
- A confirmation dialog that generates a CSPRNG password, lets the user edit,
  show, copy or regenerate it, re-audits the candidate live, and only writes
  when the user confirms.
- Applying a fix records the previous password in the account history.

Out of scope:

- Rotating the password on the remote website. LocalPass has no network and
  cannot do that; the dialog says so.
- Fixing `password_stale` or `account_duplicate` from this dialog. Stale is
  advisory per NIST SP 800-63B and duplicates are not a password problem.

## Constraints

- No network. Password generation uses the existing CSPRNG module.
- The vault format does not change: a fix is a normal account update.
- The fix must not introduce a new finding. The generated password is
  re-audited against the whole vault (reuse and similarity included) before it
  is offered, and the apply button stays disabled while the edited candidate
  still fails.
- All visible text goes through the five locales.

## Design

| Concern | Decision |
|---------|----------|
| Search | Case-insensitive substring on `sitio` and `usuario`, combined with the existing severity filters |
| Collapse | A `Set` of expanded account ids; collapsed by default; header is a button with `aria-expanded` |
| Findings visibility | Collapsed header shows identity, score and severity; expanded body shows user, masked password with reveal, notes, last update and the finding list |
| Fix availability | Any finding except `password_stale` and `account_duplicate` |
| Candidate generation | `generatePassword` with 20 chars, all classes, re-audited until clean and unique in the vault |
| Candidate validation | `remainingFindingCodes` runs `auditPassword` plus reuse/similarity checks; apply is disabled while the list is non-empty |
| Apply | `applyPasswordRemediation` updates `password` and `updatedAt`, prepends the old password with its original timestamp to `history` |
| History order | Newest first, matching the manual edit flow in `dashboard.tsx` |
| Remote rotation | Explicit warning in the dialog; LocalPass only stores the new password |

## Tasks

| ID | Task | Route | Acceptance | Status |
|----|------|-------|------------|--------|
| A1 | Audit search and expand/collapse | inline | search matches site/user, combines with filters, cards open and close individually and in bulk, no raw i18n keys | done |
| A2 | Remediation engine and tests | inline | generated candidate passes the audit, avoids reuse/similarity, history is preserved, advisory findings are excluded | done |
| A3 | Fix dialog wired to the vault | inline | modal opens from the findings, candidate can be regenerated/copied/shown, apply is blocked while findings remain, save updates the vault and toasts | done |
| A4 | Translations for five locales | inline | en, es, pt, fr, zh have every new key; guard test passes | done |
| A5 | Docs and verification | inline | TECHNICAL/CHANGELOG updated; typecheck, tests, build and UI verification recorded | done |

## Acceptance criteria

- Typing `github` or `octo@` in the audit search narrows the list without
  touching the vault search.
- A card starts collapsed, opens on click, closes on a second click, and the
  bulk control expands or collapses every visible card.
- An account with a weak password shows a Fix button; an account whose only
  finding is stale or duplicated does not.
- The dialog starts with a clean generated password, exposes entropy and any
  remaining findings, and cannot save while findings remain.
- Confirming writes the new password, prepends the old one to history, closes
  the dialog and updates the audit immediately.
- Cancelling changes nothing.
- No dialog action runs without an explicit confirmation.

## Verification

Recorded on 2026-10-28.

- `npm run typecheck`: clean.
- `npm test`: 85 tests, 85 pass, 0 fail (includes 13 remediation tests).
- `npm run build`: Next.js static export plus NSIS and portable package
  completed. `dist/LocalPass-Setup-1.1.0.exe` and
  `dist/LocalPass-1.1.0-portable.exe` rebuilt. The new audit copy is present in
  `out/_next/static/chunks/3szmtv59axbhi.js` and the identical chunk extracted
  from `dist/win-unpacked/resources/app.asar`.
- Static export served at `http://localhost:3311` and driven in the browser with
  a seeded vault (3 accounts):
  - Cards start collapsed; the header shows site, user, score and severity but
    no password or findings.
  - Search `github` narrows to one card by site; `me@gmail` narrows by email;
    clearing restores all three.
  - Individual toggle opens and closes a card; the bulk control expands all
    three, switches to "Collapse all" and reverses them.
  - Expanded card shows user, masked password, notes, last update, findings and
    "Fix".
  - The Fix dialog generated a 20-character CSPRNG password, reported 131 bits
    of entropy and "passes the audit", and enabled saving.
  - Cancel left the vault byte-identical (`localStorage` length 1478 before and
    after).
  - Saving changed the card to 100/100 "Secure", showed the "Password updated"
    toast, and the vault grew to 1578 characters.
  - The encrypted vault was decrypted offline: the stored password matches the
    candidate exactly and `history` holds `password123` with its original
    `updatedAt`. No console errors during the flow.

Commits:

- `bf7a9e8` feat(audit): add password remediation engine
- `fe8ee32` feat(audit): add search, collapsible cards and fix dialog
- docs work unit committed after verification (TECHNICAL, CHANGELOG and this
  document).


## Known limitations

- The fix cannot change the password on the remote service.
- A candidate is checked against the accounts present in the vault. A password
  reused on a site that is not stored here cannot be detected.
- Duplicate identities are not merged from the audit; the finding explains it
  and the user resolves it in the vault.

## Relevant files

- `src/components/vault/security-audit.tsx`
- `src/lib/audit-remediation.ts`
- `tests/audit-remediation.test.ts`
- `src/lib/translations.ts`
- `docs/TECHNICAL.md`, `docs/CHANGELOG.md`
