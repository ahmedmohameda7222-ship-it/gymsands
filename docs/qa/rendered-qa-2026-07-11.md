# Rendered launch QA evidence — 2026-07-11

## Provenance

- Branch: `prelaunch-remediation-2026-07`
- Audited base: `60a204d5fc20fc396be1b1b47e748c42ebba6abf`
- Run command: `npm run qa:rendered`
- Browser: repository-local Playwright Chromium 149, headless
- App: local development server with `NEXT_PUBLIC_USE_MOCK_AUTH=true` and the repository synthetic account; no production member data was used.
- The preferred in-app browser launcher failed because it could not resolve `npx`. Playwright was used as the documented fallback, and that failure is not represented as a browser pass.
- Machine-readable observations: [`rendered-qa-results.json`](rendered-qa-results.json)
- Screenshots: [`evidence/2026-07-11`](evidence/2026-07-11)

## Matrix result

The script made 126 route/viewport observations: 18 surfaces at each of these exact CSS viewports:

`390×844`, `393×852`, `430×932`, `768×1024`, `1024×768`, `1280×800`, `1440×900`.

Observed surfaces were landing; login; registration; recovery; onboarding; Today; workout plans; active workout; food log; meal plan/groceries; progress; privacy/export/deletion settings; OAuth consent; subscription; Privacy; Terms; disclaimer; and legal notice.

Current automated result: **126 observations, zero structural failures**. Every response was HTTP 200, document-level horizontal overflow was zero, no unhandled page error was observed, visible interactive elements had accessible names after remediation, and the first keyboard Tab had a computed visible focus treatment. Known React development CSP/eval diagnostics were retained in the JSON and classified as development-only. The synthetic dashboard now renders its real empty/first-value state rather than a false success or fabricated saved data.

## Accessibility and state evidence

- Reduced motion was emulated for the whole matrix.
- Visible buttons, inputs, selects, text areas, role-buttons, and navigation links were measured. Checkbox/radio hit areas were measured through their associated labels. Remediation added names to the meal-plan date arrows and a 44×44 minimum dismissal target.
- A 390×844 landing run with root text at 200% had zero horizontal overflow. Screenshot: [`landing-390x844-200-percent-text.png`](evidence/2026-07-11/landing-390x844-200-percent-text.png).
- Arabic was selected through the real persisted language preference and reloaded at 390×844; horizontal overflow remained zero. Screenshot: [`landing-390x844-arabic.png`](evidence/2026-07-11/landing-390x844-arabic.png).
- DOM-level screen-reader names and alert/status semantics were inspected automatically. NVDA, VoiceOver, and TalkBack were not run and remain manual platform checks.
- Empty and error/retry states were rendered without inventing member records. Positive real-data workout, meal, progress, OAuth, deletion, and paid-subscription states remain unverified.

Representative current evidence includes:

- [`landing-390x844.png`](evidence/2026-07-11/landing-390x844.png)
- [`registration-430x932.png`](evidence/2026-07-11/registration-430x932.png)
- [`dashboard-1280x800.png`](evidence/2026-07-11/dashboard-1280x800.png)
- [`onboarding-1024x768.png`](evidence/2026-07-11/onboarding-1024x768.png)
- [`meal-plan-groceries-430x932.png`](evidence/2026-07-11/meal-plan-groceries-430x932.png)
- [`settings-privacy-deletion-1024x768.png`](evidence/2026-07-11/settings-privacy-deletion-1024x768.png)
- [`oauth-consent-1280x800.png`](evidence/2026-07-11/oauth-consent-1280x800.png)
- [`subscription-1440x900.png`](evidence/2026-07-11/subscription-1440x900.png)

## Launch-blocking follow-up

1. Provision an isolated synthetic reviewer account and rerun successful database-backed flows.
2. Render positive OAuth/CIMD consent, connection, scope reduction, and revocation with real test configuration.
3. Exercise deletion/export workers against an isolated migrated database and synthetic storage bucket.
4. Run NVDA/VoiceOver/TalkBack, browser-native 200% zoom, slow network, offline/retry, sheets/dialogs, and safe-area checks on supported physical platforms.
5. Repeat the matrix against a deployed candidate only after `/api/version` proves its commit.
6. Do not claim iOS or Android QA until native binaries exist.
