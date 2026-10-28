# Feature: browser-csv-import

## Objective

Let a user import the plaintext CSV that browsers export (Chrome, Edge, Brave,
Firefox) and the CSV that other managers export (Bitwarden, LastPass) in one
step, instead of retyping every credential.

## Problem

LocalPass could only import its own encrypted backup (`.json` + master
password). A user coming from a browser had no path except adding accounts one
by one, which is exactly the case where people give up and keep the browser's
password store.

## Scope

In scope:

- `src/lib/browser-csv.ts`: RFC 4180 parser, header detection, URL
  normalization, row validation, dedupe, preview and merge.
- Settings UI: pick a `.csv`, see a preview, confirm the import.
- Translations for the new strings in all five locales.
- Tests for the parser and for the merge semantics.

Out of scope:

- Encrypted exports from other managers (`.1pux`, `.kdbx`).
- Fetching anything from a browser profile directory.
- Automatic re-import or file watching.

## Constraints

- No network. The file is read by the renderer and never leaves the device.
- The CSV is plaintext: the UI must tell the user to delete it afterwards.
- The vault format does not change. Imported accounts are normal `AccountEntry`
  records.
- Existing merge rules apply: same identity with a different password is a
  conflict for the user to resolve, never a silent overwrite.
- An account whose identity and password already exist locally is left
  untouched, so local notes and history are never replaced by the CSV row.

## Design

| Concern | Decision |
|---------|----------|
| Delimiter | Sniff `,`, `;` or tab from the header line, quoted-aware |
| Quoting | RFC 4180: `""` escapes, embedded commas and newlines |
| Encoding | UTF-8 assumed; BOM stripped |
| Passwords | Read verbatim: leading and trailing spaces are significant |
| Site | Normalized to a bare hostname, because the detail view builds `https://${sitio}` |
| `android://<hash>@pkg` | Reduced to the Android package name |
| Non-HTTP schemes | Fall back to the `name` column instead of importing `chrome://settings` as `settings` |
| Duplicates inside the file | Collapsed keeping the last occurrence, counted and shown |
| Same identity, same password | Skipped, local data preserved |
| Same identity, different password | Conflict via `mergeImportedVault` |

Supported headers:

- Chrome / Edge / Brave / Safari: `name,url,username,password,note`
- Firefox: `url,username,password,httpRealm,formActionOrigin,...`
- Bitwarden: `folder,favorite,type,name,login_uri,login_username,login_password,login_totp`
- LastPass: `url,username,password,totp,extra,name,grouping,fav`

## Tasks

| ID | Task | Route | Acceptance | Status |
|----|------|-------|------------|--------|
| C1 | CSV parser and format detection | inline | quoted fields, embedded newlines, BOM, `,`/`;`/tab, unknown format rejected | done |
| C2 | Normalization and row validation | inline | hostname extracted, `www.` stripped, `android://` handled, rows without password skipped and counted | done |
| C3 | Preview and merge | inline | added / conflicts / unchanged / skipped counts; conflicts go through the existing resolver | done |
| C4 | Settings UI | inline | file picker, preview, confirm, result toast, plaintext warning | done |
| C5 | i18n (en, es, pt, fr, zh) | inline | no raw key is visible; the translations guard test passes | done |
| C6 | Tests and docs | inline | parser and merge tests pass; TECHNICAL, SECURITY and CHANGELOG updated | done |

## Verification

Run on 2026-10-28, branch `feat/security-hardening`:

- `npm run typecheck`: pass, no diagnostics.
- `npm test`: 72/72 pass. `tests/browser-csv.test.ts` adds 26 tests for the
  parser, delimiter/format detection, URL normalization, skip reasons,
  duplicates, preview, merge and no-op behavior.
- `npm run build`: pass. Artifacts rebuilt at `dist/LocalPass-Setup-1.1.0.exe`
  and `dist/LocalPass-1.1.0-portable.exe`.
- End-to-end in the exported renderer (static `out/` served over localhost):
  1. Chrome CSV with 4 rows and one duplicate: preview reported format
     `CHROME`, 3 new, 0 conflicts, 0 unchanged, 0 skipped, 1 duplicate.
  2. Import produced 3 accounts; the duplicate kept the last row
     (`github.com` / `octocat` password `newer-secret`, note `latest row wins`).
  3. Re-import with one changed password and two identical rows: preview
     reported 0 new, 1 conflict, 2 unchanged.
  4. Import created the conflict and the toast pointed to the Conflicts view.
  5. "Usar Importada" resolved it; the badge cleared and the view showed
     "Bóveda Sincronizada".

## Commits

- `243c059` fix(i18n): add missing generator translation keys
- `fbaa2e6` feat(import): add browser CSV password import
- `docs(import): document the browser CSV importer` (this document)

## Known limitations

- Only UTF-8 CSV. A UTF-16 export from Excel is rejected as unrecognized
  rather than guessed.
- Bitwarden rows that are notes, cards or identities are skipped: LocalPass
  models logins only.
- The CSV stays on disk until the user deletes it; the app cannot delete it.
- If the same identity already has an unresolved conflict, a later CSV import
  for that identity joins the existing conflict instead of stacking a second
  one; the imported side remains the version captured first.

## Relevant files

- `src/lib/browser-csv.ts`
- `src/components/vault/dashboard.tsx`
- `src/lib/translations.ts`
- `tests/browser-csv.test.ts`
- `docs/TECHNICAL.md`, `docs/SECURITY.md`, `docs/CHANGELOG.md`
