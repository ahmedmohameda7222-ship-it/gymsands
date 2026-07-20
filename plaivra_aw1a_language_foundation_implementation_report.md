# PLAIVRA AW-1A Language Foundation — Implementation Report

## Executive summary

AW-1A establishes the multilingual request foundation for English, German, and Arabic without locale-prefixed routes. It adds one central locale registry, deterministic cookie and `Accept-Language` resolution, `next-intl` App Router request configuration, correct server-rendered document language and direction before hydration, account-authoritative client reconciliation, German and `system` device caching, legacy translation compatibility, and targeted raw/rendered validation.

## Repository state

- Actual starting `main` SHA: `604e6210b368a9bbee9305ef365a0beeb5817cba`
- Branch: `feat/active-workout-aw1a-language-foundation`
- Draft PR: [#78](https://github.com/ahmedmohameda7222-ship-it/gymsands/pull/78)
- Final production-code SHA: `1855852348194b59017b1f449bfdaf7fba839666`
- Fully validated implementation head SHA: `ff8f90c61de717c3ba53df6d6872b907ba3a7253`
- Clean PR head before this report metadata correction: `d846b5b75b5cf67f8a41f432fc69ef6d9a74c297`
- Dedicated AW-1A validation run: `29727215650`
- Validation artifact ID: `8454801554`
- Clean-head Phase A Diff Validation: `29727552905` — successful
- Clean-head Quality: `29727552901` — in progress when this report revision was created
- Final PR-head CI state is also recorded in the PR description and completion response after this report-only revision completes.

The dedicated validation workflow's functional checks all succeeded. Its workflow conclusion was `failure` only because its final self-cleanup push attempted to remove workflow files using the GitHub Actions token. The temporary files were subsequently removed through normal repository writes, and the clean PR diff contains only AW-1A implementation files and this report.

## Files created

- `lib/i18n/config.ts`
- `lib/i18n/locale-resolution.ts`
- `lib/i18n/client-language-preference.ts`
- `lib/i18n/server.ts`
- `i18n/request.ts`
- `messages/en.json`
- `messages/de.json`
- `messages/ar.json`
- `types/next-intl.d.ts`
- `lib/i18n/locale-resolution.test.ts`
- `lib/i18n/message-shape.test.ts`
- `plaivra_aw1a_language_foundation_implementation_report.md`

## Files modified

- `package.json`
- `package-lock.json`
- `next.config.mjs`
- `app/layout.tsx`
- `lib/i18n/types.ts`
- `lib/i18n/translations.ts`
- `lib/i18n/use-translation.ts`
- `lib/i18n/train.ts`
- `lib/settings/user-settings-context.tsx`
- `components/settings/app-preference-effects.tsx`

No change was required in `services/database/user-settings.ts` or `app/(private)/settings/preferences/page.tsx`.

## Dependency and lockfile change

- Added only `next-intl` at version `4.13.2`.
- Updated `package-lock.json` through npm dependency resolution.
- No unrelated dependency was intentionally upgraded.

## Locale registry

- Supported locales are exactly `en`, `de`, and `ar`.
- Default locale is `en`.
- Registry metadata:
  - `en -> en-US -> ltr`
  - `de -> de-DE -> ltr`
  - `ar -> ar -> rtl`
- Public compatibility types `SupportedLanguage` and `LanguagePreference` remain available.
- `LanguagePreference` remains `SupportedLanguage | "system"`.
- Direction-aware AW-1A code uses registry metadata rather than duplicated Arabic checks.

## Cookie and local-cache contract

- Logical name for cookie and local storage: `plaivra.language.v1`.
- Allowed persisted values: `en`, `de`, `ar`, `system`.
- Cookie attributes: `Path=/`, `SameSite=Lax`, one-year `Max-Age`, and `Secure` on HTTPS.
- The cookie is intentionally not `HttpOnly` because client reconciliation updates it.
- No user ID, email, token, session data, or secret is serialized.
- Invalid cookie/cache values are ignored safely.
- German is accepted.
- `system` is preserved literally.

## Request resolution behavior

- Explicit supported cookie locale wins over `Accept-Language`.
- `system`, missing, or invalid preferences resolve through weighted `Accept-Language`.
- Regional tags normalize to supported base languages.
- Unsupported languages and wildcard entries do not create another locale.
- Malformed quality values are skipped without throwing.
- Final fallback is English.
- Message loading uses a closed EN/DE/AR map and never constructs an import path from raw input.

## Root-layout behavior

- `app/layout.tsx` is async and request-resolved.
- Initial raw HTML contains `lang`, `dir`, and `data-request-locale` before hydration.
- Theme bootstrap script, body class, `ToastProvider`, `AuthProvider`, `UserSettingsProvider`, `SuccessFeedbackProvider`, and `AppPreferenceEffects` are preserved.
- `NextIntlClientProvider` is installed at the minimum shared root boundary.
- Skip-link copy uses `Common.skipToContent`.
- The settings provider receives the request-resolved initial preference, preventing an immediate fallback to generic English before account settings load.

## Account and device authority

Runtime authority is:

1. successfully loaded account preference;
2. valid device cookie/local cache;
3. browser/system language;
4. English.

A successful account load is authoritative and replaces stale device state. Device state remains the fallback only when no account is available or account loading fails. Optimistic settings updates and rollback behavior remain intact.

## Client reconciliation

- `document.documentElement.lang` and `.dir` use the central registry.
- Cookie/local storage synchronization occurs only after settings hydration.
- The resolved client/account locale is compared with `data-request-locale`.
- A stale server tree receives exactly one guarded `router.refresh()`.
- No refresh loop was observed.
- Failed language-save rollback restores the previous settings state.
- Existing theme and accessibility classes remain operational.

## Legacy compatibility

The following remain operational without caller migrations:

- `useTranslation()`
- `useTrainTranslation()`
- `getTrainLocaleMetadata()`
- `translations`
- `SupportedLanguage`
- `LanguagePreference`

Existing legacy dictionaries remain the content source for current screens. Train metadata and legacy resolution now delegate to the central rules. Authenticated URLs remain unprefixed.

## Database, API, and deployment changes

None.

- No migration.
- No SQL.
- No schema, constraint, index, trigger, RPC, RLS, storage-policy, generated database type, or migration-ledger change.
- No Supabase or production database write.
- No public locale API route.
- No authentication architecture change.
- No deployment.
- No merge.

## Security and privacy review

- Existing CSP and security headers remain preserved.
- No arbitrary dynamic message imports.
- No auth/session data in the locale cookie.
- No remote messages or third-party translation script.
- No analytics or preference-history logging.
- No server-side account-auth architecture was introduced.
- No public private-account-settings endpoint was added.

## Tests added

- Registry and metadata tests.
- Locale normalization tests.
- Weighted `Accept-Language` tests.
- Preference-precedence tests.
- Device helper and cookie-contract tests.
- Legacy resolver compatibility tests.
- Train metadata compatibility tests.
- Recursive EN/DE/AR message-shape tests.
- Raw server-render validation matrix.
- Rendered browser reconciliation QA.

## Commands run and exact results

| Command/check | Result |
|---|---|
| `npm ci` | Passed |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| Targeted AW-1A Vitest command | Passed: 2 files, 39 tests |
| `npm run test:unit` | 3 files / 4 assertions failed; 176 files and 1,174 tests passed |
| Starting-main unit parity | Passed: the same four failures occur on starting `main`; diff of failing test identities was empty |
| `npm run test:scripts` | Passed: 73 tests |
| `npm audit --omit=dev --audit-level=moderate` | Passed: 0 vulnerabilities |
| `npm run build` | Passed |
| Raw production-response QA | Passed: 5/5 cases |
| Rendered browser QA | Passed: 8/8 validations, zero page errors |
| Scope/diff checks | Passed |

The full-unit command is not reported as passing. The four failures are pre-existing Train/Quality contract assertions on the starting `main` SHA and are unchanged on the AW-1A branch. Correcting them would require unrelated Train UI/database-verification/Quality-workflow changes explicitly prohibited by the AW-1A prompt.

## Raw server-response QA matrix

| Case | Cookie | `Accept-Language` | HTTP | `lang` | `dir` | `data-request-locale` | Localized skip link |
|---|---|---|---:|---|---|---|---|
| explicit-de-over-ar | `plaivra.language.v1=de` | `ar` | 200 | `de` | `ltr` | `de` | Pass |
| explicit-ar-over-de | `plaivra.language.v1=ar` | `de` | 200 | `ar` | `rtl` | `ar` | Pass |
| system-de-regional | `plaivra.language.v1=system` | `de-DE` | 200 | `de` | `ltr` | `de` | Pass |
| header-ar-regional | none | `ar-EG` | 200 | `ar` | `rtl` | `ar` | Pass |
| unsupported-fallback | none | `fr-FR, es-ES;q=0.8` | 200 | `en` | `ltr` | `en` | Pass |

## Rendered browser QA matrix

| Scenario | Resolved locale | Direction | Current-route refreshes | Result |
|---|---|---|---:|---|
| Account overrides stale Arabic local cache and German cookie | `en` | `ltr` | 1 | Pass |
| Select German | `de` | `ltr` | 1 | Pass |
| German retained after reload; private URL unchanged | `de` | `ltr` | n/a | Pass |
| Select Arabic | `ar` | `rtl` | 1 | Pass |
| Select English | `en` | `ltr` | 1 | Pass |
| Select `system` with browser `de-DE` | `de` | `ltr` | 1 | Pass |
| Theme behavior | `olive -> elite-noir` | n/a | n/a | Pass |
| Accessibility classes | n/a | n/a | n/a | Pass |

No rendered page errors were recorded.

## Artifacts and screenshots

Dedicated validation artifact:

- Run: `29727215650`
- Artifact: `aw1a-validation-29727215650`
- Artifact ID: `8454801554`
- Digest: `sha256:7da36eab3aac94212928354b1789e33c9532fe79a4b9a6b7ac844970ac0b4115`

It contains:

- raw HTML for all five request-resolution cases;
- `raw-server-qa.json`;
- `rendered-browser-qa.json`;
- `settings-german-390x844.png`;
- `settings-arabic-390x844.png`;
- `settings-system-de-390x844.png`;
- dependency, typecheck, lint, targeted-test, unit-test, script-test, audit, build, and server logs;
- starting-main unit-failure parity evidence.

## Intervening `main` changes inspected

None. Actual `main` remained `604e6210b368a9bbee9305ef365a0beeb5817cba` when AW-1A started.

## Additional files inspected and reasons

- `tsconfig.json`: confirmed JSON-module support and path aliases.
- `.github/workflows/quality.yml`: matched repository CI and browser-verification behavior.
- `scripts/run-rendered-qa.mjs`: preserved existing evidence conventions.
- `components/auth/auth-provider.tsx`: confirmed local/mock-auth validation without changing auth architecture.
- `components/ui/select-field.tsx`: confirmed the native language-selector interaction contract.

The prompt-required duplicate/equivalent searches were run and captured during validation. No pre-existing `next-intl` request configuration, locale-routing middleware, proxy, or duplicate central registry was found.

## Risks

- A completely new device cannot synchronously read the authenticated account row on its first request because authentication remains client-initialized. This is the approved lifecycle: request cookie/header rendering first, then account-authoritative reconciliation after settings load.
- The root request is request-specific because it reads cookies and request headers.

## Limitations

- This phase provides foundation messages only; it does not migrate the complete application dictionaries.
- Public marketing localization, Exercise Library content translation, Activity Catalog translation population, Active Workout copy, and Active Workout UI changes remain out of scope.
- The full repository unit command remains red on four pre-existing assertions already red on starting `main`. AW-1A introduced no additional failing test identity.

## Out-of-scope findings

The four baseline assertions concern existing Phase 1/2 Train UI and database-verification expectations in the Quality workflow. They require a separate approved correction scope and were not changed.

## Final diff and git state

The clean PR diff contains exactly 22 files:

- 11 required created implementation/test/message/type files;
- 10 required modified application/config/dependency files;
- this implementation report.

No temporary AW-1A workflows, helper scripts, diagnostics, generated QA output, Supabase files, migration files, Vercel files, Active Workout UI files, or Heat Map files remain in the PR diff.

## Stop-boundary confirmation

- One subphase: AW-1A only.
- One branch.
- One draft PR.
- One implementation report.
- No merge.
- No deployment.
- No production change.
- No Supabase or migration change.
- AW-1B not started.
- AW-2 not started.
