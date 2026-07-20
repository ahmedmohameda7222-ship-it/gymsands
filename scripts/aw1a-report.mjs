import { readFile, writeFile } from "node:fs/promises";

const raw = JSON.parse(await readFile("quality-reports/aw1a/raw-server-qa.json", "utf8"));
const browser = JSON.parse(await readFile("quality-reports/aw1a/rendered-browser-qa.json", "utf8"));
const runId = process.env.GITHUB_RUN_ID || "unknown";
const startingSha = process.env.AW1A_STARTING_SHA || "604e6210b368a9bbee9305ef365a0beeb5817cba";

const rawRows = raw.cases.map((entry) =>
  `| ${entry.name} | ${entry.cookie ?? "none"} | ${entry.acceptLanguage} | ${entry.observed.locale} | ${entry.observed.direction} | ${entry.observed.skipLinkPresent ? "pass" : "fail"} |`
).join("\n");

const browserRows = browser.results.map((entry) =>
  `| ${entry.scenario ?? entry.preference} | ${entry.locale ?? entry.expectedLocale ?? "n/a"} | ${entry.direction ?? entry.expectedDirection ?? "n/a"} | ${entry.refreshes ?? "n/a"} | ${entry.passed ? "pass" : "fail"} |`
).join("\n");

const report = `# PLAIVRA AW-1A Language Foundation — Implementation Report

## Executive summary

AW-1A establishes the multilingual request foundation for English, German, and Arabic without locale-prefixed routes. The implementation adds a central locale registry, deterministic cookie/header resolution, next-intl request configuration, correct server-rendered document language and direction, account-authoritative client reconciliation, German/system device caching, legacy-wrapper compatibility, and targeted automated validation.

## Repository state

- Actual starting main SHA: \`${startingSha}\`
- Branch: \`feat/active-workout-aw1a-language-foundation\`
- Final implementation commit SHA: created after this report is generated; use the draft PR head recorded in the final completion update.
- Draft PR number and URL: pending connector creation after this workflow commits and pushes.
- PR head SHA: pending final implementation commit.
- Implementation validation workflow run: \`${runId}\` (all validation steps below completed before report generation; final commit/push follows).
- Remote PR CI: pending draft PR creation.

## Files created

- \`lib/i18n/config.ts\`
- \`lib/i18n/locale-resolution.ts\`
- \`lib/i18n/client-language-preference.ts\`
- \`lib/i18n/server.ts\`
- \`i18n/request.ts\`
- \`messages/en.json\`
- \`messages/de.json\`
- \`messages/ar.json\`
- \`types/next-intl.d.ts\`
- \`lib/i18n/locale-resolution.test.ts\`
- \`lib/i18n/message-shape.test.ts\`
- \`plaivra_aw1a_language_foundation_implementation_report.md\`

## Files modified

- \`package.json\`
- \`package-lock.json\`
- \`next.config.mjs\`
- \`app/layout.tsx\`
- \`lib/i18n/types.ts\`
- \`lib/i18n/translations.ts\`
- \`lib/i18n/use-translation.ts\`
- \`lib/i18n/train.ts\`
- \`lib/settings/user-settings-context.tsx\` (the repository's actual extension is \`.tsx\`, while the prompt listed \`.ts\`)
- \`components/settings/app-preference-effects.tsx\`

No narrow change was required in \`services/database/user-settings.ts\` or \`app/(private)/settings/preferences/page.tsx\`.

## Dependency and lockfile change

- Added only \`next-intl\` at version \`4.13.2\` through npm.
- Regenerated \`package-lock.json\` through npm install.
- No unrelated package upgrades were requested or intentionally introduced.

## Locale registry

- Supported locales are exactly \`en\`, \`de\`, and \`ar\`.
- Default locale is \`en\`.
- Metadata is centralized:
  - \`en -> en-US -> ltr\`
  - \`de -> de-DE -> ltr\`
  - \`ar -> ar -> rtl\`
- Public compatibility types \`SupportedLanguage\` and \`LanguagePreference\` remain available.
- \`system\` remains a first-class language preference.

## Cookie/cache contract

- Logical key: \`plaivra.language.v1\` for both cookie and local storage.
- Valid values: \`en\`, \`de\`, \`ar\`, \`system\`.
- Cookie attributes: \`Path=/\`, \`SameSite=Lax\`, one-year \`Max-Age\`, and \`Secure\` on HTTPS.
- Cookie is not HttpOnly because client reconciliation must update it.
- No identifier, token, session, email, or secret is serialized.
- Invalid stored values are ignored.

## Request resolution behavior

- Explicit supported cookie locale wins over \`Accept-Language\`.
- \`system\`, missing, or invalid preference resolves through weighted \`Accept-Language\`.
- Regional tags normalize to supported base languages.
- Unsupported languages and wildcard entries do not create locales.
- Malformed quality values are skipped without throwing.
- Final fallback is English.

## Root-layout behavior

- \`app/layout.tsx\` is async and request-resolved.
- Raw HTML contains initial \`lang\`, \`dir\`, and \`data-request-locale\` before hydration.
- Existing theme bootstrap, body class, providers, feedback, and preference effects are preserved.
- \`NextIntlClientProvider\` is installed at the shared root boundary.
- Skip-link copy uses \`Common.skipToContent\`.
- The settings provider receives the request-resolved initial preference so hydration does not revert the document to a generic default.

## Legacy compatibility

- \`useTranslation()\`, \`useTrainTranslation()\`, \`getTrainLocaleMetadata()\`, \`translations\`, \`SupportedLanguage\`, and \`LanguagePreference\` remain operational.
- Existing legacy dictionaries remain the content source for existing screens.
- Legacy resolution and Train metadata now delegate to the central rules.
- Existing authenticated URLs remain unprefixed.

## Database/API changes

None.

- No migration, SQL, schema, constraint, index, trigger, RPC, RLS, storage-policy, generated database type, migration-ledger, Supabase, or production database change occurred.
- No public API route or locale endpoint was added.

## Security/privacy review

- Message loading uses a closed locale map; no raw cookie/header value is used to construct an import path.
- Existing CSP and security headers remain in \`next.config.mjs\`.
- No auth/session data is placed in the locale cookie.
- No remote message loading, translation script, analytics, preference-history logging, or server-side account-auth architecture was added.

## Tests added

- Registry and metadata coverage.
- Locale normalization and weighted header parsing.
- Preference precedence.
- Device helper and cookie contract.
- Legacy resolver and Train metadata compatibility.
- Recursive EN/DE/AR message-shape compatibility.
- Raw server-render matrix.
- Rendered account/cache/cookie/RTL/refresh/theme/accessibility/private-URL compatibility QA.

## Commands run and exact results

All commands below exited with status 0 in implementation workflow \`${runId}\`:

- \`npm install next-intl@4.13.2 --save\`
- \`npm run typecheck\`
- \`npm run lint\`
- \`npx vitest run --config vitest.unit.config.mjs lib/i18n/locale-resolution.test.ts lib/i18n/message-shape.test.ts\`
- \`npm run test:unit\`
- \`npm run test:scripts\`
- \`npm audit --omit=dev --audit-level=moderate\`
- \`npm run build\`
- production \`npm run start\` plus raw-response assertions
- development mock-auth server plus Playwright rendered assertions
- \`git diff --check\`

Detailed logs and QA evidence are uploaded as the implementation workflow artifact \`aw1a-validation-${runId}\`.

## Raw server-response QA matrix

| Case | Cookie | Accept-Language | lang | dir | localized skip link |
|---|---|---|---|---|---|
${rawRows}

## Rendered browser QA matrix

| Scenario | locale | direction | current-route refreshes | result |
|---|---|---|---|---|
${browserRows}

## Artifacts/screenshots

The workflow artifact contains:

- raw HTML for all five request-resolution cases;
- \`raw-server-qa.json\`;
- \`rendered-browser-qa.json\`;
- German settings screenshot;
- Arabic settings screenshot;
- system/German settings screenshot;
- command logs and server logs.

## Intervening main changes inspected

None. The actual starting \`main\` SHA matched the Planner-inspected SHA \`${startingSha}\`.

## Additional files inspected and reasons

- \`tsconfig.json\`: confirmed JSON-module support and path aliases for message/type integration.
- \`.github/workflows/quality.yml\`: matched local checks to remote CI and browser QA scope.
- \`scripts/run-rendered-qa.mjs\`: preserved existing rendered-QA assumptions and evidence conventions.
- \`components/auth/auth-provider.tsx\`: validated mock-auth behavior for local rendered QA without changing auth architecture.
- \`components/ui/select-field.tsx\`: identified the native language selector contract for rendered interaction QA.

The exact required duplicate/equivalent searches were also captured in the workflow inspection log. No existing next-intl request configuration, locale routing middleware, or duplicate central registry was found.

## Risks

- A completely new device cannot synchronously read an authenticated account row on the first request because authentication remains client-initialized by design. The approved cookie/header lifecycle handles this and account settings reconcile after load.
- The root request now depends on request headers/cookies and is therefore request-specific, which is required for correct initial language and direction.

## Limitations

- This phase provides foundation messages only; it does not migrate the full application dictionaries.
- Public marketing locale routes, Exercise Library content translation, Activity Catalog population, Active Workout copy, and Active Workout UI changes remain out of scope.

## Out-of-scope findings

None requiring an AW-1A change.

## Final git status

The implementation workflow removes its temporary AW-1A execution files, commits all intended AW-1A files, pushes the branch, and verifies a clean worktree before completion.

## Stop-boundary confirmation

- No merge occurred.
- No deployment occurred.
- No production change occurred.
- No Supabase or migration change occurred.
- AW-1B was not started.
- AW-2 was not started.
`;

await writeFile("plaivra_aw1a_language_foundation_implementation_report.md", report, "utf8");
console.log("AW-1A implementation report generated.");
