# Production UX audit fix status

Date: 2026-07-03
Status: implementation and local verification complete; live authenticated persistence checks remain a staging gate.

## Goal and product boundary

This pass repairs the mobile, trust, feedback, accessibility, grocery, nutrition-target, coaching, workout-session, wellness, and ChatGPT handoff problems identified in both supplied agent-mode audits. The product rule remains unchanged: Plaivra prepares context and stores user-approved results; it does not generate workout or meal plans internally and does not make hidden OpenAI, Gemini, or other model calls.

The two pasted audit files were byte-for-byte identical. Both supplied PDFs were rendered and inspected page by page before implementation.

## Audit status

### A. Mobile responsiveness

- Fixed global horizontal containment and minimum-width behavior for page, grid, and media content.
- Dialogs now use a mobile sheet layout, `92dvh` maximum height, internal scrolling, overscroll containment, and reachable close/actions.
- Important buttons, tabs, tag controls, inputs, and icon actions use at least 44px effective targets where they were touched by this audit.
- Meal Plan URL synchronization no longer enters a render loop when Day, Week, or Shopping tabs change.
- Verified Dashboard, Workout Plans, workout-session error state, Meal Plan, Grocery, Calories, Wellness, AI & Imports, ChatGPT requests, and Coaching Profile at all required viewports with no horizontal overflow.

### B. ChatGPT request flow

- Added the five-step secure handoff: Review request, Copy for ChatGPT, Open ChatGPT, Review answer, Apply approved.
- Added plain-language “Why copy and paste?” and “What will be shared” explanations.
- The normal UI explicitly excludes raw JSON, internal IDs, tokens, database fields, source IDs, and schema names.
- Added persistent copied/error state in addition to dismissible toasts.
- Added user-facing status labels and descriptions, “Not sent yet”, “Reopen request”, completion, and cancellation actions.
- Added discard confirmation for an unsaved note.
- Added explicit trigger-focus restoration for the controlled dialog; focus trapping and focus return were browser-verified.

### C. Recent ChatGPT requests

- Replaced the log-like presentation with user-facing cards and explanatory copy.
- Added Open, Waiting, Done, Cancelled, and All filters; visible-label search; newest/oldest sorting; and completed-item visibility control.
- Added clear Copy, Open ChatGPT, Mark sent, Mark done, Reopen, Cancel, and “Not sent yet” actions.
- Added error/retry and useful empty-state links to meals, workouts, and weekly review.
- Completed and cancelled requests are hidden by a reversible view filter rather than deleted. No archive migration was needed.

### D. AI permissions

- Added top-level Can view, Can change, and Not allowed summaries.
- Each module explains readable data, allowed approved changes, an example request, and sensitivity where relevant.
- View and Change states now use ON/OFF text, distinct icons, strong borders/backgrounds, and do not rely only on color.
- Clarified that Change includes View only for that area and still applies only to approved changes.
- Added persistent saved status/timestamp while preserving selections in place.
- Added trust copy covering permission categories, approval, and revocation.

### E. Coaching Profile

- Renamed and rewrote the flow as a friendly optional Coaching Profile with a calm non-medical disclaimer.
- Grouped training safety, current limitations, goals/routine, food preferences, and budget/prep/kitchen information.
- Added “Why this matters” descriptions, multiline fields, consistent tag entry, larger labeled tag controls, dirty indicators, sticky section save actions, saved timestamps, and leave-page warnings.
- Fixed programmatic labels for all audited coaching inputs and textareas.

### F. Workout session

- Promoted the active exercise and visible Replace exercise action.
- Enlarged Finish set and kept saved-set feedback beside the sticky action.
- Added multiline set notes and a near-action completion prompt after all sets.
- Added visible workout completion feedback near Finish workout without changing logging or PR calculations.

### G. Grocery list

- Rebuilt rough import around an expected-count confirmation and an explicit explanation that meal names are not ingredient data.
- Dedupe uses source meal-item ID and normalized visible name; feedback reports added and skipped counts, including a useful zero-import reason.
- Added immediate undo using the IDs returned by the last import.
- Added Select all, Select imported, Clear selection, Mark already have, Delete selected, Clear checked, and confirmed Clear list.
- Added imported-item identification.
- Replaced the fake unit dropdown with a real select covering all requested common units plus a separately revealed custom unit field.
- Added visible print, share/copy, and CSV download success/failure feedback, including blocked-print guidance.
- Added a persistent load error with Retry.

### H. Meal Plan ChatGPT actions

- Replace, Cheaper, and Faster are visible directly on each meal card with short text labels.
- Secondary actions live under “More ChatGPT help”.
- Added explicit copy explaining that Plaivra prepares a request and saves only changes the user approves.
- Preserved human-readable context with no raw identifiers in the request UI.

### I. Calories and nutrition targets

- Added one shared active-target resolver for base, default, training, rest, high-activity, and per-day manual override selection.
- Dashboard and Calories resolve from that same implementation; target-profile saves update the Calories summary immediately and manual day selection persists locally for that user/date.
- Added visible Active today label, reason, kcal/macros, and water in ml and litres.
- Added the requested day-type explanation and Base fallback behavior.
- Added clear food-log empty CTAs and persistent Copy previous day success, nothing-to-copy, and error feedback.
- Added accessible names to target setup fields and selects.

### J. Wellness and daily check-ins

- Converted goal, blocker, evening, and tomorrow fields to readable multiline controls.
- Added recent seven-day morning/evening history with key values and no medical claims.
- Added persistent inline save confirmation and accessible field labels.

### K. Empty, loading, error, and offline states

- Added action-oriented empty states and retries in the audited request, grocery, and meal flows.
- Async operations retain loading/saving states and use user-safe copy.
- Added the global “You appear offline. Changes may not save until the connection returns.” indicator.
- Technical Supabase, stack, SQL, token, and identifier details remain out of normal UI.

### L. Toasts and accessibility

- Toasts are dismissible, use status/alert semantics, remain for 7–9 seconds, and sit above mobile navigation.
- Critical results also have inline feedback rather than toast-only communication.
- Dialog close has an accessible name; focus trapping and focus return pass the browser check.
- Fixed nested interactive content in the Dashboard setup checklist.
- Fixed labels for nutrition, wellness, and coaching form controls.
- Strengthened inactive/active permission and tab contrast and enlarged audited touch targets.

### M. Trust and privacy

- AI & Imports now explains what can flow to ChatGPT, approval, permissions, and revocation.
- Request dialogs explain exactly why data is copied and what categories are shared.
- Coaching Profile retains calm non-medical positioning.
- Legal pages, OAuth/MCP security, RLS behavior, and company/legal claims were not altered.

## Files changed

- `app/(private)/calories/page.tsx`
- `app/(private)/dashboard/page.tsx`
- `app/(private)/settings/ai-imports/page.tsx`
- `app/(private)/settings/chatgpt-requests/page.tsx`
- `app/(private)/settings/coaching-profile/page.tsx`
- `app/globals.css`
- `components/ai/ai-action-request-dialog.tsx`
- `components/ai/recent-ai-action-requests.tsx`
- `components/dashboard/dashboard-sections.tsx`
- `components/layout/app-shell.tsx`
- `components/meals/calories-page-sections.tsx`
- `components/meals/food-log-list.tsx`
- `components/meals/grocery-list-panel.tsx`
- `components/meals/meal-ai-actions.tsx`
- `components/meals/my-meal-plan-builder.tsx`
- `components/meals/nutrition-target-profiles.tsx`
- `components/profile/execution-profiles.tsx`
- `components/settings/ai-permissions-card.tsx`
- `components/ui/dialog.tsx`
- `components/ui/tabs.tsx`
- `components/ui/tag-input.tsx`
- `components/ui/toaster.tsx`
- `components/wellness/daily-checkins.tsx`
- `components/workouts/workout-day-session.tsx`
- `services/nutrition/active-target.ts`
- `services/nutrition/active-target.test.ts`
- `docs/production-ux-audit-fix-status.md`

## Database and migrations

No migration was added.

- Grocery undo is deliberately immediate and local to the latest returned ID batch, which meets the audit’s safe fallback without adding `import_batch_id`.
- Completed-request hiding is a reversible UI filter and does not require `archived_at` or data deletion.
- Active manual day selection is scoped in local storage by user and date; saved target values remain in the existing nutrition target profile table.
- Existing owner checks, RLS, MCP/OAuth behavior, and migrations are unchanged.

## Validation evidence

### Commands

- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm test` — passed: 18 files, 176 tests.
- `npm run build` — passed: optimized Next.js production build and 74 routes generated/collected. The only output warning is Next.js workspace-root inference caused by an unrelated parent-directory lockfile.
- `git diff --check` — passed.

### Responsive browser checks

The in-app browser bridge could not be used because its installed accessibility snapshot API was incompatible with the browser controller. The documented fallback used bundled Playwright with local Chromium. CSP bypass was enabled only in this local development browser context because the repository intentionally disallows development `eval`; the production security headers were not changed.

Playwright checked 45 route/viewport combinations plus 15 Meal Plan tab transitions:

- 360 × 800
- 390 × 844
- 430 × 932
- 768 × 1024
- 1440 × 900

Routes/states: Dashboard, Workout Plans, workout-session error state, Meal Plan Day/Week, Grocery Shopping, Calories/Targets, Wellness, AI & Imports, ChatGPT requests, and Coaching Profile. Every check satisfied `scrollWidth <= clientWidth`; no page errors occurred in the hydrated sweep.

### Accessibility and interaction checks

- Axe WCAG 2 A/AA and 2.1 A/AA: zero critical or serious violations on Dashboard, Grocery/Meal Plan, Calories/Targets, Wellness, AI Permissions, ChatGPT Requests, and Coaching Profile at 390 × 844.
- ChatGPT modal: all five steps fit within the 390px viewport; focus remained trapped through repeated Tab navigation and returned to the opening action after close.
- Offline indicator: displayed after browser offline transition.
- Coaching Profile: editing a long safety textarea produced the persistent dirty state.
- Meal Plan: Day, Week, Shopping, and back transitions remained interactive after the URL-sync fix.
- Grocery: custom unit reveal and ChatGPT request dialog opening were browser-verified.
- Nutrition resolver: exact day profile and fallback behavior are covered by unit tests.

## Deferred live-environment checks

The local audit environment uses mock authentication and has no authenticated Supabase project connection. The following persistence journeys therefore need one staging pass with a real test user and seeded data before production promotion:

- grocery create/import/undo/bulk mutations surviving refresh;
- AI permission save and refresh persistence;
- request prepare/copy/status correction/history reopen against `ai_action_requests`;
- Coaching Profile save and refresh persistence;
- a data-rich workout session from first set through completed workout and PR feedback;
- active target parity after saving profiles in Supabase and refreshing both Dashboard and Calories.

These are verification deferrals, not schema or UI implementation gaps. No OpenAI approval or submission readiness is claimed.

## Final UX risk assessment

Local implementation risk is low-to-moderate: static analysis, unit tests, production build, responsive coverage, modal behavior, and representative accessibility checks are green. Release risk remains moderate until the authenticated staging persistence matrix above passes, especially the multi-row grocery mutations and request status lifecycle. The change is ready for staging/pilot validation, not unconditional production promotion.
