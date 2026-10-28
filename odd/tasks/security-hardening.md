# Feature: security-hardening

## Objective

Convert LocalPass into a verifiably offline, local-only password manager with a
security posture that matches its claims: cryptographic password generation, a
local audit engine mapped to recognized cybersecurity frameworks, enforced
network isolation at the Electron layer, and a current runtime (Next.js 16 /
Electron 45).

## Problem

The v1.0.0 codebase made strong security claims that the code did not fully
back:

- `password-generator.tsx` used `Math.random()`, a non-cryptographic PRNG, to
  create credentials.
- The generator did not guarantee at least one character from every selected
  class, so a "symbols enabled" password could contain no symbols.
- `unlock()` swallowed every error and returned `false`, so a corrupted vault
  was indistinguishable from a wrong master password.
- The audit was a remote Genkit flow with no cross-account analysis (reuse,
  similarity), no scoring, and no mapping to a security framework.
- The UI loaded Google Fonts over the network and shipped unused Genkit, Google
  GenAI and Firebase dependencies, contradicting the "100% offline" claim.
- The runtime stack was a year behind: Next.js 15.5.9, Electron 33, React
  19.2.1.

## Scope

In scope:

- `src/lib/password-generator.ts` (new, pure, testable) and the generator UI.
- Typed vault error taxonomy for unlock and import.
- Self-hosted fonts; removal of all runtime network references.
- CSP and navigation hardening in `electron/main.js`.
- `src/lib/security-audit.ts` (new): per-account and cross-account analysis,
  scoring, severity, framework references.
- Audit UI in `dashboard.tsx` plus translations in all five locales.
- Dependency upgrade and Next 16 migration.
- Documentation aligned with the implementation.

Out of scope:

- Changes to the vault file format or KDF parameters. Existing vaults keep
  opening. Backward compatibility is a hard constraint.
- Tailwind 4, TypeScript 7 and other unrelated major migrations.
- OS keychain integration, auto-updater, tray, sync.

## Constraints

- No network access at runtime. No telemetry, no remote AI, no email, no cloud.
- The audit must be deterministic, explainable and fully local.
- Password and vault data never leave the renderer process.
- Every new user-facing string needs keys in `en`, `es`, `pt`, `fr`, `zh`.
- Existing vaults (`vaultVersion: "1.0"`, PBKDF2-SHA512 210k, AES-256-GCM,
  16-byte salt) must open without migration.

## Delivery strategy

`exception-ok`: the security fix, audit engine, UI and docs are interdependent
and land as one coherent, revertible feature branch. The branch holds one
work-unit commit per task plus a dedicated i18n commit and a docs commit.

## Tasks

| ID | Task | Route | Acceptance | Status |
|----|------|-------|------------|--------|
| S1 | Secure password generation module | inline | `crypto.getRandomValues` only, unbiased sampling, every enabled class present, shuffled; unit tests pass | done |
| S2 | Vault error taxonomy | inline | unlock distinguishes wrong password/tampered data, corrupted file, unsupported version, missing vault; UI shows specific message | done |
| S3 | Offline hardening | inline | no external requests in `out/`; CSP and navigation guards in Electron; cloud deps and dead AI code removed | done |
| S4 | Local security audit engine | inline | per-account + cross-account findings, score, severity, framework refs; UI renders them; unit tests pass | done |
| S5 | Stack upgrade | inline | Next 16.4.3, Electron 45.1.0, React 19.3.1; `typecheck` and `build` green | done |
| S6 | Documentation | inline | TECHNICAL/SECURITY/CHANGELOG/README match the implementation | done |

## Progress

- [x] S1 — `6ad6580` feat(generator): use a CSPRNG for password generation
- [x] S2 — `9524e42` refactor(vault): report typed unlock and import errors
- [x] S4 — `d546906` feat(audit): replace the remote AI flow with a local audit
      engine
- [x] S3 — `422b31f` feat(security): enforce offline operation in the desktop
      shell
- [x] S5 — `baa828d` chore(deps): upgrade to Next.js 16.4.3 and Electron 45.1.0
- [x] i18n — `translations.ts` updated for en/es/pt/fr/zh
- [x] S6 — docs and this task document

## Verification

Observed on 2026-10-28, Node v24.18.1, npm 12.2.0, Windows x64:

| Check | Command | Result |
|-------|---------|--------|
| Types | `npm run typecheck` | pass, no diagnostics |
| Tests | `npm test` | 41 passed, 0 failed (generator, storage, merge, audit) |
| Static export | `npm run build:next` | pass, Next.js 16.4.3 (Turbopack), 4/4 pages |
| Packaging | `npm run build:electron` | pass, NSIS + portable produced |
| Installer | `dist/LocalPass-Setup-1.1.0.exe` | 121.9 MB |
| Portable | `dist/LocalPass-1.1.0-portable.exe` | 110.7 MB |
| Installed versions | `npm ls` | next 16.4.3, react 19.3.1, electron 45.1.0, electron-builder 26.18.0 |
| Remote references | grep over `src` and `out` | no `fonts.googleapis`, `fonts.gstatic`, `firebase`, `genkit`, `placehold.co`, `unsplash`, `picsum` |
| Fonts in build | `out/fonts` | 4 WOFF2 files present |
| Randomness | grep `Math.random` | only a warning comment in `password-generator.ts` |

## Known limitations

- The packaged executable uses the default Electron icon: the repo only ships
  `public/icon.svg`, which electron-builder cannot use as a Windows icon.
- No code-signing certificate is configured; the installer and portable are
  unsigned.
- The packaged application was built successfully but not smoke-tested by
  launching it in this environment.
- The audit estimates entropy and pattern risk; it cannot check real breach
  data without network access.

## Relevant files

- `src/lib/password-generator.ts`
- `src/lib/vault-errors.ts`
- `src/lib/vault-storage.ts`
- `src/lib/vault-merge.ts`
- `src/lib/vault-error-messages.ts`
- `src/lib/security-audit.ts`
- `src/components/vault/security-audit.tsx`
- `src/components/vault/password-generator.tsx`
- `src/hooks/use-vault.tsx`
- `electron/main.js`
- `next.config.ts`
- `src/lib/translations.ts`
- `tests/*.test.ts`
- `docs/TECHNICAL.md`, `docs/SECURITY.md`, `docs/CHANGELOG.md`, `README.md`
