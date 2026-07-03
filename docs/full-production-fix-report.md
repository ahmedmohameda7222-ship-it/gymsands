# Plaivra full production fix report

Date: 2026-07-03  
Branch reviewed: `codex/production-ux-audit-repair`  
Final verdict: **PASS WITH RISKS**

The requested product baseline is implemented and all local quality gates pass. The remaining risks are deployment/runtime checks that cannot be completed in this workspace without a configured Supabase project, a real ChatGPT connector, a physical camera, and an audio-capable manual QA device. The new migration must be applied before release.

Status meanings:

- **DONE** — implemented and checked locally in proportion to the change.
- **PARTIAL** — implementation is present, but an important production integration check remains.
- **NOT DONE** — requested work is absent.
- **BLOCKED** — work could not proceed because of an external dependency.

## 1. Welcome page

Status: **DONE**

- What changed: Added standalone `/welcome`; registration and confirmation redirect there; calm logo → prompt → Workout/Nutrition/Progress sequence; `Plan. Import. Track.`; no shield, no auto-redirect; authenticated and unauthenticated CTA routing implemented.
- Files changed: `app/welcome/page.tsx`, `components/auth/auth-form.tsx`.
- How tested: Production build route inventory; in-app browser at 390×844 in English and Arabic; measured full scroll height and inspected both layouts.
- Review result: **PASS**.
- Remaining risks: Supabase dashboard redirect allow-list still needs `/welcome` configured in the deployed project.

## 2. Auth, register, login, and password recovery

### 2.1–2.4 Register layout, name, password rules, separate reset

Status: **DONE**

- What changed: Register order is Name, email, password, confirmation, remember, agreements, CTA. Name has no placeholder. Password requires 8+ characters, Unicode uppercase/lowercase, and any non-letter/non-number/non-space special character. Live red/green checklist and submit gating were added. Login contains only `Forgot password?`; `/forgot-password` and `/reset-password` are separate functional pages.
- Files changed: `components/auth/auth-form.tsx`, `components/auth/auth-page.tsx`, `app/login/page.tsx`, `app/register/page.tsx`, `app/forgot-password/page.tsx`, `app/reset-password/page.tsx`.
- How tested: Browser filled a valid password and confirmed all four requirements switched to success styling; submit remained disabled until all five agreements were checked, then enabled. Browser verified one login password field, no embedded reset form, and the standalone recovery page.
- Review result: **PASS**.
- Remaining risks: A real reset email and recovery callback were not sent because Supabase credentials are absent.

## 3. English/Arabic language basis

Status: **DONE**

- What changed: Added EN/Arabic switcher and persistent public language cache; applied `lang`/`dir`; localized landing, auth, forgot-password, welcome, public navigation/footer, and the three legal pages. Fixed a hydration mismatch discovered during QA by using an SSR-stable initial language before loading the cached preference.
- Files changed: `lib/i18n/public-copy.ts`, `components/layout/language-switcher.tsx`, `lib/settings/user-settings-context.tsx`, `components/layout/public-nav.tsx`, `components/layout/public-footer.tsx`, `components/legal/legal-page.tsx`, `app/page.tsx`, `components/auth/auth-page.tsx`, `components/auth/auth-form.tsx`, `app/forgot-password/page.tsx`, `app/welcome/page.tsx`, `app/legal/terms/page.tsx`, `app/legal/privacy/page.tsx`, `app/legal/disclaimer/page.tsx`, `app/globals.css`.
- How tested: Browser switched welcome to Arabic, verified `lang=ar`, `dir=rtl`, Arabic content and persistence after reload; legal heading/content followed Arabic. A later browser pass confirmed the hydration error no longer recurred.
- Review result: **PASS**.
- Remaining risks: Arabic legal copy is a concise localized version rather than a clause-for-clause certified legal translation. Legal counsel review is required before public launch.

## 4. Onboarding

### 4.1–4.9 Shell, scroll, coaching context, choices, food UI, wheel pickers

Status: **DONE**

- What changed: AppShell now renders onboarding without header/sidebar/hamburger/bottom navigation. Protected routes redirect accounts without onboarding data. Added coaching fields, goal weight, `I don't know`, empty gender default, removed Machines, reused `NutritionPreferenceCard`, and added an accessible reusable iOS-style wheel for all requested numeric ranges. Sticky actions include safe-area spacing.
- Files changed: `components/auth/protected-route.tsx`, `components/layout/app-shell.tsx`, `app/(private)/onboarding/page.tsx`, `components/ui/wheel-picker.tsx`, `types/database.ts`, `services/database/profile.ts`, `supabase/migrations/20260703151807_onboarding_coaching_quick_log_preferences.sql`.
- How tested: Browser at 390×844 found zero app navs/hamburgers; page height 1531px with a maximum scroll of about 687px; bottom Back/Next controls remained fully visible. Wheel listboxes rendered five rows with a selected band. Lint/typecheck/build passed.
- Review result: **PASS**.
- Remaining risks: Touch-wheel behavior should receive one final physical iPhone pass.

### 4.10 Fitness-profile persistence

Status: **PARTIAL**

- What changed: Onboarding upserts by `user_id`; edit mode reloads the existing row; profile target/body goal update by the authenticated profile ID; AI permissions are loaded before edit to prevent an unrelated reset; new and legacy schema fallbacks are retained.
- Files changed: `app/(private)/onboarding/page.tsx`, `services/database/profile.ts`, `components/auth/protected-route.tsx`, migration above.
- How tested: Typecheck/build and mapping inspection passed. Mock edit mode loaded saved onboarding values.
- Review result: **PASS locally; production database re-read is unverified**.
- Remaining risks: No configured Supabase instance was available to save, refresh, and query the same production row. Apply the migration, then run the manual persistence checklist below.

## 5. ChatGPT request-flow cleanup

Status: **DONE**

- What changed: Removed all specified legacy explanations, progress strip, security reconnect banner, `I pasted it into ChatGPT`, and request `Mark done`. Request-ready copy now shows the exact five steps. Copy becomes Refresh, which refreshes/reloads imported data. Human-readable prompt summaries avoid raw identifiers and schema language.
- Files changed: `components/ai/ai-action-request-dialog.tsx`, `components/ai/recent-ai-action-requests.tsx`, `app/(private)/settings/ai-imports/page.tsx`, `components/settings/connected-apps.tsx`, `lib/mcp/phase5.test.ts`.
- How tested: Repository-wide exact-string searches were clear for every removed block and action; unit tests passed.
- Review result: **PASS**.
- Remaining risks: Historical request statuses remain readable, but no removed action is exposed.

## 6. AI permission gating

Status: **DONE**

- What changed: ChatGPT action dialogs infer or receive a section, hide active helpers without access, show `Give ChatGPT access for …`, and offer read/write/both/cancel. Workout import uses the same permission rule. Removing read or write access in settings now requires confirmation and preserves correct read/write dependencies.
- Files changed: `components/ai/ai-action-request-dialog.tsx`, `components/settings/ai-permissions-card.tsx`, `components/shared/chatgpt-import-card.tsx`, `app/(private)/onboarding/page.tsx`.
- How tested: Browser opened the meal-plan access prompt and verified all four choices; static review verified confirmed removal paths; typecheck/tests passed.
- Review result: **PASS**.
- Remaining risks: Permission persistence needs a final live Supabase round trip after migration/deployment.

## 7. Meal plan

Status: **DONE**

- What changed: Empty state includes Import with ChatGPT; the request contains role, onboarding/goal/goal weight/training/nutrition/food/allergy/coaching/lifestyle/cooking context, approval rule, and structured output. Add food now offers Quick add, Add from Food Hub, and permission-gated Import from ChatGPT. Macro inputs start empty.
- Files changed: `components/meals/my-meal-plan-builder.tsx`, `components/ai/ai-action-summary.ts`, `types/database.ts`.
- How tested: Browser verified the empty import card, the three add sources, permission note, and empty calorie/protein/carbs/fat inputs. Build passed.
- Review result: **PASS**.
- Remaining risks: A full approved-plan import through a live ChatGPT connection was not available.

## 8. Food Log behavior from ChatGPT

Status: **DONE**

- What changed: Connector descriptions explicitly route statements such as “I ate …” to `add_food_log`, which inserts directly into `food_logs` as completed rather than creating a planned meal.
- Files changed: `lib/mcp/tools.ts`, `lib/mcp/server.ts`.
- How tested: Existing MCP/tool tests passed; executor path was inspected to confirm direct `food_logs` insertion.
- Review result: **PASS**.
- Remaining risks: Live natural-language connector E2E remains on the deployment checklist.

## 9. Today/dashboard order and shopping collapse

Status: **DONE**

- What changed: Bento ordering is Workout → Meals planned → collapsed Shopping list; metrics follow. Shopping details render only when expanded. Resume now returns to the correct plan-day session route.
- Files changed: `app/(private)/dashboard/page.tsx`.
- How tested: Source ordering and production compilation passed. The collapsed component uses `defaultOpen={false}`.
- Review result: **PASS**.
- Remaining risks: Dashboard data could not render under database-free mock auth, so populated visual order needs one seeded-data production/staging screenshot.

## 10. Wellness checklist removal

Status: **DONE**

- What changed: Removed Daily wellness checklist from the wellness page and reusable tracker dashboard without removing other wellness tools.
- Files changed: `app/(private)/wellness/page.tsx`, `components/lifestyle/wellness-trackers.tsx`.
- How tested: Exact-string repository search returned no matches; lint/build passed.
- Review result: **PASS**.
- Remaining risks: None identified.

## 11. Goal-completion feedback

Status: **PARTIAL**

- What changed: Added a global subtle check animation and always-on Web Audio two-tone success chime. Wired it to workout completion, active-workout finish, meal logging/all-meals completion, onboarding save, and daily-task completion. Reduced motion suppresses movement, not sound.
- Files changed: `components/feedback/success-feedback.tsx`, `app/layout.tsx`, `components/workouts/workout-session-form.tsx`, `components/workouts/workout-day-session.tsx`, `components/workouts/active-workout-indicator.tsx`, `components/meals/my-meal-plan-builder.tsx`, `app/(private)/dashboard/page.tsx`, `components/lifestyle/daily-fit-tasks-page-client.tsx`, `app/(private)/onboarding/page.tsx`.
- How tested: Lint/typecheck/build passed and trigger placement was reviewed.
- Review result: **Implementation pass; audible-device validation pending**.
- Remaining risks: Automation could not capture audio output or complete database-backed actions. Confirm volume and timing on iPhone/Safari and Android/Chrome.

## 12. Quick Log

Status: **PARTIAL**

- What changed: Added eight persisted Quick Log selections, settings controls, and migration column. Mobile FAB/nav use explicit stacking; modal overlay/content now sit above the app nav; bottom padding keeps the final shortcut visible.
- Files changed: `services/database/user-settings.ts`, `app/(private)/settings/preferences/page.tsx`, `components/layout/app-shell.tsx`, `components/ui/dialog.tsx`, `supabase/migrations/20260703151807_onboarding_coaching_quick_log_preferences.sql`.
- How tested: Browser at 390×844 opened Quick Log: dialog z-index 110, nav z-index 80, final Wellness shortcut fully visible at the bottom. Settings showed all eight controls. Duplicate `/progress` React key found during QA was fixed.
- Review result: **PASS visually; database persistence unverified**.
- Remaining risks: Mock auth cannot persist settings across a hard reload; verify the array after applying the Supabase migration.

## 13. Workout

### 13.1 Active workout persistence

Status: **PARTIAL**

- What changed: Reuses open sessions instead of starting duplicates for the same workout; stores active route/timer state; AppShell shows a persistent indicator outside session pages with Return, Pause/Resume, Finish, and confirmed Cancel. Finish/cancel synchronize database state.
- Files changed: `lib/active-workout.ts`, `components/workouts/active-workout-indicator.tsx`, `components/layout/app-shell.tsx`, `components/workouts/workout-session-form.tsx`, `components/workouts/workout-day-session.tsx`, `services/database/workout-sessions.ts`.
- How tested: Typecheck/lint/build passed; routes and state transitions were inspected.
- Review result: **Implementation pass; live session E2E pending**.
- Remaining risks: Starting, leaving, pausing, returning, finishing, and cancelling require a real workout-session row for final validation. Single-exercise unsaved form edits are not persisted until completion.

### 13.2 Imported workout details

Status: **PARTIAL**

- What changed: Plan mappings retain `plan_exercise_id`; Details links use the exact plan-exercise route; loader verifies the selected exercise’s day, plan, and owner before rendering.
- Files changed: `types/database.ts`, `services/database/workout-plans.ts`, `services/database/workout-plan-loader.ts`, `components/workouts/workout-day-editor.tsx`, `app/(private)/my-workout/exercises/[exerciseId]/page.tsx`.
- How tested: Route appears in the production build; typecheck passed; ownership/query chain reviewed.
- Review result: **Implementation pass; seeded imported-row comparison pending**.
- Remaining risks: No real ChatGPT-imported workout row was available locally.

### 13.3 Custom video URL

Status: **DONE**

- What changed: MCP workout exercise schema accepts guide/custom video URLs; executor stores both display and custom fields; workout prompt requests optional approved video links; exact plan-exercise detail displays the custom video.
- Files changed: `lib/mcp/tools.ts`, `lib/mcp/tool-executor.ts`, `components/shared/chatgpt-import-card.tsx`, plan-detail files above.
- How tested: Typecheck/tests/build passed; existing database migration support was confirmed.
- Review result: **PASS**.
- Remaining risks: External video embedding depends on provider embed rules.

## 14. Groceries and print removal

Status: **DONE**

- What changed: Removed rough meal-name import and undo UI. Replaced large bulk cards with a three-dot menu containing all eight requested actions. Destructive deletes/clears use confirmation. Removed print code across groceries and reporting. Added direct `pdf-lib` A4 export with Plaivra logo, categories, item/status details, page headers/footers, and page numbering.
- Files changed: `components/meals/grocery-list-panel.tsx`, `components/reports/reporting-dashboard.tsx`, `services/reports/reporting.ts`, `package.json`, `package-lock.json`.
- How tested: Browser verified all eight menu actions and absence of rough import. Repository-wide print searches were clear. A representative PDF using the production layout was generated, checked with `pdfinfo` (A4, one page, PDF 1.7), rendered with Poppler, and visually inspected for logo, grouping, spacing, statuses, and footer.
- Review result: **PASS**.
- Remaining risks: The browser download button was disabled in empty mock data; run one download with a long, multi-page live list.

## 15. Barcode scanner

Status: **DONE**

- What changed: Added GTIN/EAN/UPC length and check-digit validation across client/API/provider; manual numeric correction; camera continuous focus where supported; two matching detections required before lookup; save loading state and exact success/error notifications.
- Files changed: `lib/barcodes.ts`, `lib/barcodes.test.ts`, `components/meals/api-food-tools.tsx`, `app/api/food/open-food-facts/route.ts`, `lib/integrations/open-food-facts.ts`.
- How tested: Unit tests cover valid EAN-13/UPC-A and invalid length/check digits. Browser entered an invalid barcode and received the expected correction error. Build passed.
- Review result: **PASS**.
- Remaining risks: Physical-camera autofocus, real Open Food Facts lookup, and successful save toast need device/API testing.

## 16. General scroll and hidden-section bugs

Status: **DONE**

- What changed: Onboarding uses a standalone min-height shell with x-clipping only, scrollable document content, sticky safe-area actions, and bottom spacing. Welcome no longer clips vertical overflow. Dialog stacking and bottom content were corrected globally.
- Files changed: `components/layout/app-shell.tsx`, `app/(private)/onboarding/page.tsx`, `app/welcome/page.tsx`, `components/ui/dialog.tsx`.
- How tested: Browser measured and scrolled onboarding at 390×844 to its maximum; bottom controls remained visible. Welcome had a reachable 1021px document at an 844px viewport. Quick Log’s last row was visible.
- Review result: **PASS**.
- Remaining risks: Test landscape and dynamic large-text settings before release.

## 17. Final unwanted-UI cleanup

Status: **DONE**

- What changed: Removed all print code, specified ChatGPT legacy copy/actions, Daily wellness checklist, and rough grocery import.
- Files changed: ChatGPT, wellness, grocery, report files listed above.
- How tested: Exact repository searches for every banned phrase/function were clear.
- Review result: **PASS**.
- Remaining risks: Task/habit `Mark done` labels remain intentionally because they complete real user tasks, not ChatGPT requests.

## Commands run and results

- `npm install pdf-lib@1.17.1 --save-exact` — installed; lockfile updated.
- `npx.cmd --yes supabase@latest migration new onboarding_coaching_quick_log_preferences` — migration scaffold created and filled.
- `npm.cmd run lint` — **PASS**, zero ESLint findings.
- `npm.cmd run typecheck` — **PASS**.
- `npm.cmd test` — **PASS**, 19 files / 178 tests.
- `npm.cmd run build` — **PASS**, 77 routes generated; warning only about Next.js inferring a broader workspace root because another lockfile exists under `C:\Users\Ahmee`.
- `git diff --check` — **PASS**; line-ending conversion notices only.
- Exact `rg` scans for print APIs and all prohibited legacy copy — **PASS**, no matches outside tests.
- In-app browser at 390×844 — **PASS** for public/auth/welcome/legal/onboarding/meal/permission/grocery/Quick Log/barcode checks described above.
- Poppler `pdftoppm` + `pdfinfo` — **PASS** for representative A4 grocery PDF rendering.
- `npm.cmd audit --omit=dev --json` — **RISK**: 2 moderate production findings, both the PostCSS advisory carried through the installed Next.js dependency tree; npm proposes an invalid major downgrade path rather than a safe current upgrade.

## Known remaining issues and release risks

1. Apply `supabase/migrations/20260703151807_onboarding_coaching_quick_log_preferences.sql` to staging/production before deployment.
2. Supabase Auth redirect allow-list must include the deployed `/welcome` and `/reset-password` URLs.
3. Live database round trips remain for fitness-profile edits, Quick Log settings, AI permissions, workout persistence, imported workout detail, and grocery download with seeded items.
4. Live ChatGPT connector approval/import flows were not available in this local environment.
5. Physical camera scanning and audible success feedback require real-device QA.
6. Arabic legal copy needs qualified legal-language review.
7. `npm audit` reports two moderate PostCSS/Next transitive findings; monitor upstream and update through a supported Next release, not npm’s suggested downgrade.
8. The production build warns that another lockfile at `C:\Users\Ahmee\package-lock.json` affects inferred Turbopack root. Configure `turbopack.root` separately if the warning appears in CI.

## Manual QA checklist

- [ ] Apply the migration on staging and confirm schema cache refresh.
- [ ] Register with email confirmation: Register → Welcome → Continue setup → Onboarding.
- [ ] Confirm deployed auth redirect allow-list for welcome/reset-password.
- [ ] Save every onboarding field, reload edit mode, and query the same `onboarding_answers.user_id` row.
- [ ] Toggle each Quick Log item, hard reload, and confirm exact persistence.
- [ ] Grant/remove read and write permissions, reload, and confirm helper visibility by section.
- [ ] Complete a ChatGPT meal plan discussion, approve it, import, refresh, and inspect the plan.
- [ ] Tell ChatGPT “I ate …” and confirm one completed Food Log row with no duplicate planned meal.
- [ ] Seed Today data and visually confirm Workout → Meals → collapsed Shopping.
- [ ] Start a workout, navigate away, pause/resume, return, finish, and repeat with Cancel.
- [ ] Open two different imported exercises and confirm each exact detail/video.
- [ ] Download a multi-page grocery PDF with long names and inspect every page.
- [ ] Scan EAN-8, UPC-A, EAN-13, and GTIN-14 on iPhone Safari and Android Chrome; verify save success/failure toasts.
- [ ] Complete a task, all meals, and a workout on physical devices; judge chime volume and reduced-motion behavior.
- [ ] Test 390×844, landscape mobile, desktop, large text, and reduced motion.

## Exact changed-file inventory

### New files

- `app/(private)/my-workout/exercises/[exerciseId]/page.tsx`
- `app/forgot-password/page.tsx`
- `app/reset-password/page.tsx`
- `app/welcome/page.tsx`
- `components/auth/auth-page.tsx`
- `components/feedback/success-feedback.tsx`
- `components/layout/language-switcher.tsx`
- `components/ui/wheel-picker.tsx`
- `components/workouts/active-workout-indicator.tsx`
- `docs/full-production-fix-report.md`
- `lib/active-workout.ts`
- `lib/barcodes.test.ts`
- `lib/barcodes.ts`
- `lib/i18n/public-copy.ts`
- `supabase/migrations/20260703151807_onboarding_coaching_quick_log_preferences.sql`

### Modified files

- `app/(private)/dashboard/page.tsx`
- `app/(private)/onboarding/page.tsx`
- `app/(private)/settings/ai-imports/page.tsx`
- `app/(private)/settings/preferences/page.tsx`
- `app/(private)/wellness/page.tsx`
- `app/api/food/open-food-facts/route.ts`
- `app/globals.css`
- `app/layout.tsx`
- `app/legal/disclaimer/page.tsx`
- `app/legal/privacy/page.tsx`
- `app/legal/terms/page.tsx`
- `app/login/page.tsx`
- `app/page.tsx`
- `app/register/page.tsx`
- `components/ai/ai-action-request-dialog.tsx`
- `components/ai/ai-action-summary.ts`
- `components/ai/recent-ai-action-requests.tsx`
- `components/auth/auth-form.tsx`
- `components/auth/protected-route.tsx`
- `components/layout/app-shell.tsx`
- `components/layout/public-footer.tsx`
- `components/layout/public-nav.tsx`
- `components/legal/legal-page.tsx`
- `components/lifestyle/daily-fit-tasks-page-client.tsx`
- `components/lifestyle/wellness-trackers.tsx`
- `components/meals/api-food-tools.tsx`
- `components/meals/grocery-list-panel.tsx`
- `components/meals/my-meal-plan-builder.tsx`
- `components/reports/reporting-dashboard.tsx`
- `components/settings/ai-permissions-card.tsx`
- `components/settings/connected-apps.tsx`
- `components/shared/chatgpt-import-card.tsx`
- `components/ui/dialog.tsx`
- `components/workouts/workout-day-editor.tsx`
- `components/workouts/workout-day-session.tsx`
- `components/workouts/workout-session-form.tsx`
- `lib/integrations/open-food-facts.ts`
- `lib/mcp/phase5.test.ts`
- `lib/mcp/server.ts`
- `lib/mcp/tool-executor.ts`
- `lib/mcp/tools.ts`
- `lib/settings/user-settings-context.tsx`
- `package-lock.json`
- `package.json`
- `services/database/profile.ts`
- `services/database/user-settings.ts`
- `services/database/workout-plan-loader.ts`
- `services/database/workout-plans.ts`
- `services/database/workout-sessions.ts`
- `services/reports/reporting.ts`
- `types/database.ts`
