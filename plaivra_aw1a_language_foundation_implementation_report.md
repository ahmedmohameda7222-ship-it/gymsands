# PLAIVRA AW-1A Language Foundation — Implementation Report

## Executive summary

AW-1A establishes the multilingual request foundation for English, German, and Arabic without locale-prefixed routes. It adds a central locale registry, deterministic cookie/header resolution, next-intl request configuration, correct server-rendered document language and direction, account-authoritative client reconciliation, German/system device caching, legacy-wrapper compatibility, and targeted automated validation.

## Repository state

- Actual starting main SHA: `604e6210b368a9bbee9305ef365a0beeb5817cba`
- Branch: `feat/active-workout-aw1a-language-foundation`
- Draft PR: [#78](https://github.com/ahmedmohameda7222-ship-it/gymsands/pull/78)
- Implementation validation workflow run ID: `29727213531`
- Final implementation commit SHA: the commit immediately following this generated report in the draft PR history
- PR head SHA and remote CI run IDs: recorded in the final completion update after the final commit is pushed

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
- `lib/settings/user-settings-context.tsx` (the repository path uses `.tsx`)
- `components/settings/app-preference-effects.tsx`

No change was required in `services/database/user-settings.ts` or `app/(private)/settings/preferences/page.tsx`.

## Dependency and lockfile change

- Added only `next-intl` at `4.13.2`.
- Updated `package-lock.json` through npm dependency resolution.
- No unrelated package was intentionally upgraded.

## Locale registry

- Supported locales are exactly `en`, `de`, and `ar`.
- Default locale is `en`.
- Registry metadata:
  - `en -> en-US -> ltr`
  - `de -> de-DE -> ltr`
  - `ar -> ar -> rtl`
- Public `SupportedLanguage` and `LanguagePreference` compatibility types remain available.
- `system` remains a supported preference.

## Cookie/cache contract

- Cookie and local-storage key: `plaivra.language.v1`.
- Allowed values: `en`, `de`, `ar`, `system`.
- Cookie attributes: `Path=/`, `SameSite=Lax`, one-year `Max-Age`, and `Secure` on HTTPS.
- The cookie contains no user ID, email, token, session, or secret.
- Invalid values are ignored.

## Request resolution behavior

- Explicit supported cookie locale wins over `Accept-Language`.
- `system`, missing, or invalid preferences use weighted `Accept-Language`.
- Regional tags normalize to supported base languages.
- Unsupported languages and wildcard entries do not create locales.
- Malformed quality values are skipped without throwing.
- Final fallback is English.

## Root-layout behavior

- `app/layout.tsx` is async and request-resolved.
- Raw HTML contains initial `lang`, `dir`, and `data-request-locale` before hydration.
- Theme bootstrap, body class, ToastProvider, AuthProvider, UserSettingsProvider, SuccessFeedbackProvider, and AppPreferenceEffects are preserved.
- `NextIntlClientProvider` is installed at the shared root boundary.
- Skip-link copy uses `Common.skipToContent`.
- The settings provider receives the request-resolved initial preference.

## Legacy compatibility

- `useTranslation()`, `useTrainTranslation()`, `getTrainLocaleMetadata()`, `translations`, `SupportedLanguage`, and `LanguagePreference` remain operational.
- Existing dictionaries remain the content source for current screens.
- Existing authenticated URLs remain unprefixed.

## Database and API changes

None.

- No migration, SQL, schema, constraint, index, trigger, RPC, RLS, storage policy, generated database type, migration-ledger, Supabase, or production database change occurred.
- No locale API route was added.

## Security and privacy review

- Message loading uses a closed locale map.
- Raw cookie/header values never construct import paths.
- Existing CSP and security headers remain preserved.
- No auth/session data is stored in the locale cookie.
- No remote messages, third-party translation scripts, analytics, or preference-history logging were added.

## Tests added

- Registry and metadata tests.
- Locale normalization and weighted header tests.
- Preference precedence tests.
- Device helper and cookie contract tests.
- Legacy resolver and Train metadata compatibility tests.
- Recursive EN/DE/AR message-shape tests.
- Raw server-render matrix.
- Rendered cache/cookie/RTL/refresh/theme/accessibility/private-URL QA.

## Commands run and exact results

- `npm ci`: passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- Targeted AW-1A Vitest command: passed, 39 tests.
- `npm run test:unit`: failed with the same four pre-existing assertions as starting main; no AW-1A-specific unit regression was introduced.
- Starting-main failure-parity comparison: success.
- `npm run test:scripts`: passed.
- `npm audit --omit=dev --audit-level=moderate`: passed with zero vulnerabilities.
- `npm run build`: passed.
- Raw production-response assertions: passed.
- Rendered Playwright reconciliation assertions: passed.
- Scope-boundary and diff checks: passed.

Detailed logs and QA evidence are in workflow artifact `aw1a-validation-29727213531`.

## Raw server-response QA matrix

| Case | Cookie | Accept-Language | lang | dir | localized skip link |
|---|---|---|---|---|---|
| explicit-de-over-ar | plaivra.language.v1=de | ar | de | ltr | pass |
| explicit-ar-over-de | plaivra.language.v1=ar | de | ar | rtl | pass |
| system-de-regional | plaivra.language.v1=system | de-DE | de | ltr | pass |
| header-ar-regional | none | ar-EG | ar | rtl | pass |
| unsupported-fallback | none | fr-FR, es-ES;q=0.8 | en | ltr | pass |

## Rendered browser QA matrix

| Scenario | locale | direction | current-route refreshes | result |
|---|---|---|---|---|
| account-overrides-stale-device | en | ltr | 1 | pass |
| de | de | ltr | 1 | pass |
| german-retained | de | ltr | n/a | pass |
| ar | ar | rtl | 1 | pass |
| en | en | ltr | 1 | pass |
| system | de | ltr | 1 | pass |
| theme-behavior | n/a | n/a | n/a | pass |
| accessibility-classes | n/a | n/a | n/a | pass |

## Artifacts and screenshots

The validation artifact contains raw HTML for all five cases, raw and rendered JSON evidence, German/Arabic/system screenshots, command logs, and server logs.

## Intervening main changes inspected

None. Starting `main` matched `604e6210b368a9bbee9305ef365a0beeb5817cba`.

## Additional files inspected and reasons

- `tsconfig.json`: JSON-module and path-alias compatibility.
- `.github/workflows/quality.yml`: remote verification scope.
- `scripts/run-rendered-qa.mjs`: existing rendered-evidence conventions.
- `components/auth/auth-provider.tsx`: mock-auth behavior without auth redesign.
- `components/ui/select-field.tsx`: native selector interaction contract.

The prompt-required duplicate/equivalent searches were captured in the validation artifact. No existing next-intl request configuration, locale middleware, or duplicate central registry was found.

## Risks

- A completely new device cannot synchronously read its authenticated account row on the first request because authentication remains client-initialized. The approved cookie/header lifecycle handles initial rendering, then account settings reconcile after load.
- The root request is request-specific because it reads cookies and request headers.

## Limitations

- This phase provides foundation messages only; it does not migrate the full application dictionaries.
- The repository's starting `main` already fails four unrelated unit assertions in legacy Train/Quality contract tests. The AW-1A branch reproduced exactly the same failure set. Those failures were not modified because the prompt prohibits unrelated Train UI, database-verification, and Quality-workflow changes.

## Out-of-scope findings

The four baseline unit failures concern existing Phase 1/2 Train UI and database-verification workflow expectations. They are not caused by AW-1A and require a separate approved correction scope.

## Final git status

The final implementation workflow removes all temporary AW-1A execution helpers and commits only the required implementation and report files.

## Stop-boundary confirmation

- No merge occurred.
- No deployment occurred.
- No production change occurred.
- No Supabase or migration change occurred.
- AW-1B was not started.
- AW-2 was not started.
