# Plaivra Codex UX Correction Prompt

**Version:** 2026.1  
**Status:** Active compact prompt backlog

Codex must read these first:

- `CHATGPT_CODEX_PROMPT_RULES.md`
- `Ruflo_usage.md`
- `docs/product/ai-first-tracker-model.md`
- `docs/ux-constitution/README.md`
- `docs/ux-constitution/flow-and-workflow-audit.md`
- `docs/ux-constitution/motion-and-interaction.md`
- `docs/ux-progress/README.md`
- `docs/platform-roadmap/README.md`

Completed audits:

- `/dashboard` — 72/100 — fixes open
- `/onboarding?edit=true` — 66/100 — fixes open
- `/my-workout/plans` — 63/100 — fixes open
- `/workouts/session/day/[dayId]` — 58/100 — fixes open
- `/my-workout/day/[dayId]` — 59/100 — fixes open
- `/workouts` — 58/100 — fixes open
- `/workout-history` — 60/100 — fixes open
- Global app shell / navigation — 63/100 — fixes open
- `/calories/food-hub` — 55/100 — fixes open
- `/calories/weekly-overview` — 57/100 — fixes open
- `/calories` — 54/100 — fixes open after AI-first reframing
- `/my-meal-plan` — 57/100 — fixes open after AI-first reframing
- `/hydration` — 68/100 — fixes open
- `/wellness` — 60/100 — fixes open
- `/progress` — 62/100 — fixes open
- `/settings` — 64/100 — fixes open
- `/settings/ai-imports` — 66/100 — fixes open
- `/settings/data-privacy` — 61/100 — fixes open
- `/settings/preferences` — 62/100 — fixes open

General rule: implement workflow corrections before button polish. If a flow is weak, correct the flow first, then refine buttons, states, and motion.

Product rule: Plaivra is AI-first where appropriate, but not every route is ChatGPT-first. Weekly Overview / Reports is a read-only analytical review route. It must show source confidence before adding visual polish or AI interpretation.

---

## Standard setup

```text
/caveman lite

$memory-management $agent-coder $agent-reviewer $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + premium UX reviewer
```

For user-data, privacy, permission, or AI apply flows, add `$security-audit` and use a user-data safety advisor.

---

## Prompt section 1 — Dashboard correction

```text
/caveman lite
$memory-management $agent-coder $agent-reviewer $agent-tester
Task: Implement audited dashboard UX corrections.
Primary route: /dashboard
Required fixes: one next best action, demote competing CTAs, optimistic water and meal Done, clearer imported/active state, calmer meal selector, state-based motion only.
Do not change unrelated routes, schema, auth, API routes, subscriptions, or global theme.
Verification: typecheck, lint, build if feasible, mobile 390x844, optimistic success/rollback.
```

---

## Prompt section 2 — Onboarding edit correction

```text
/caveman lite
$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester
Task: Implement audited onboarding edit UX corrections.
Primary route: /onboarding?edit=true
Required fixes: conditional target weight, edit-mode loading gate, step transitions, 48px controls, AI permission trust framing, calmer mobile navigation.
Do not change schema, auth, or unrelated routes.
Verification: non-weight goals, weight goals, saved target weight case, AI permissions save, mobile 390x844.
```

---

## Prompt section 3 — Workout plans correction

```text
/caveman lite
$memory-management $agent-coder $agent-reviewer $agent-tester
Task: Implement audited workout plans UX corrections.
Primary route: /my-workout/plans
Read first: docs/ux-progress/routes/my-workout-plans.md
Required flow: Today hero -> weekly calendar -> saved plan library -> add/import plan.
Required fixes: active plan Today-first, no-plan import-first setup, create/import area, remove duplicate Start Today, 48px plan menus, separate risky menu actions, stronger ChatGPT import framing.
Do not change workout session tracking, schema, auth, payments, or unrelated routes.
Verification: no-plan, active plan, rest-day, More actions, import visibility, mobile 390x844.
```

---

## Prompt section 4 — Workout session correction

```text
/caveman lite
$memory-management $agent-coder $agent-reviewer $agent-tester
Mode: high plus advisor
Advisor: strict senior mobile product engineer + workout logging data-integrity reviewer
Task: Implement audited workout session UX and reliability corrections.
Primary route: /workouts/session/day/[dayId]
Read first: docs/ux-progress/routes/workout-session-day.md
Required fixes: restore/replace in-session mobile sticky CTA, rollback failed finish/restart set persistence, clearer session loading, 48px key controls, exit guard, failed set save feedback, ChatGPT support only, state-based rest/finish motion.
Do not redesign the session or change schema/auth/payments/unrelated routes.
Verification: Finish Set reachable, rest bottom action, final finish action, failed save rollback, exit guard, mobile 390x844.
```

---

## Prompt section 5 — Workout day editor correction

```text
/caveman lite
$memory-management $agent-reviewer $agent-coder $agent-tester
Mode: high plus advisor
Advisor: strict senior mobile product engineer + workout editor data-integrity reviewer + mobile interaction reviewer
Task: Implement audited workout day editor UX and draft-safety corrections.
Primary route: /my-workout/day/[dayId]
Read first: docs/ux-progress/routes/workout-day-editor.md
Required flow: Known day -> visible draft state -> safe edits -> protected cancel/back/remove -> reliable save.
Required fixes: editor status bar, unsaved-change guard, confirmed discard, inline save failure/retry, draft-restored banner, remove confirm/undo, 48px move/edit/remove controls, ErrorState for day load, add-exercise draft guidance, failed add-exercise search vs empty, custom video URL validation, return to plan detail when context known.
Do not change schema, auth, workout session execution, AI import/apply behavior, global theme, or unrelated routes.
Verification: restored draft visible, unsaved changes visible, Back/Cancel protected, save failure keeps draft, remove undo/confirm, 48px controls, mobile 390x844.
```

---

## Prompt section 6 — Exercise Library correction

```text
/caveman lite
$memory-management $agent-reviewer $agent-coder $agent-tester
Mode: high plus advisor
Advisor: strict senior mobile product engineer + route reliability reviewer + exercise-library UX reviewer
Task: Implement audited Exercise Library UX, result-state, detail-state, and route-action corrections.
Primary route: /workouts
Read first: docs/ux-progress/routes/exercise-library.md
Required flow: Verified actions -> visible result states -> reliable favorites/custom saves -> 48px mobile controls.
Required fixes: verify Start route, inline search/filter errors, fallback banner, favorite pending/rollback, custom load failure state, custom exercise validation/pending/failure, custom video URL validation, detail skeleton/ErrorState, custom video inline states, 48px top/filter/card/detail controls, mobile result/status row, sticky mobile filter actions, icon clarity, custom draft discard guard.
Do not change schema, auth, workout session execution semantics, AI import/apply behavior, local fallback behavior, global theme, or unrelated routes.
Verification: search states, fallback, favorite rollback, custom draft retention, detail states, Start action validity, 48px controls, add-to-plan still works, mobile 390x844.
```

---

## Prompt section 7 — Workout History correction

```text
/caveman lite
$memory-management $agent-reviewer $agent-coder $agent-tester
Mode: high plus advisor
Advisor: strict senior mobile product engineer + workout history data-state reviewer + mobile readability reviewer
Task: Implement audited Workout History UX, history-state, and detail-readability corrections.
Primary route: /workout-history
Read first: docs/ux-progress/routes/workout-history.md
Required flow: Loaded history -> known source confidence -> clear filters -> readable session details -> valid next action.
Required fixes: ErrorState/retry, true-empty vs filtered-empty vs failed vs partial states, source degraded state, 48px filters/date/details, verify /today-workout action, stat skeleton, result/status row, reachable filter dialog actions, optional full session detail only if safe.
Do not change schema, auth, workout session execution semantics, AI import/apply behavior, global theme, or unrelated routes.
Verification: failed source states, filtered-empty reset, 48px controls, long sessions readable, valid empty action, mobile 390x844.
```

---

## Prompt section 8 — Global app shell / navigation correction

```text
/caveman lite
$memory-management $agent-reviewer $agent-coder $agent-tester
Mode: high plus advisor
Advisor: strict senior mobile product engineer + app-shell reliability reviewer + accessibility/motion reviewer
Task: Implement audited global app shell and navigation corrections.
Primary scope: Global app shell / navigation
Read first: docs/ux-progress/routes/global-app-shell.md
Required flow: Valid links -> safe bottom stack -> 48px shell controls -> reduced-motion-safe transitions -> clear offline/active workout states.
Required fixes: verify /workouts/session/[id] links, reduce route transitions when reduceAnimations, 48px shell controls, bottom overlay stack, ActiveWorkoutIndicator pending/failure, verify More drawer links/active states, branded ProtectedRoute loading, offline banner placement, Preferences link for empty Quick Log.
Do not change schema, auth semantics, AI import/apply behavior, route product flows, global theme redesign, or unrelated feature internals.
Verification: nav at 360x780/390x844/430x932, valid links, reduced motion, overlay collision, 48px controls, branded loading.
```

---

## Prompt section 9 — Food Hub correction

```text
/caveman lite
$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester
Mode: high plus advisor
Advisor: strict senior mobile product engineer + nutrition data-integrity reviewer + AI-first product alignment reviewer
Task: Implement audited Food Hub UX, manual-fallback framing, and custom nutrition safety corrections.
Primary route: /calories/food-hub
Read first: docs/ux-progress/routes/food-hub.md
Required flow: Manual fallback context -> clear data confidence -> safe custom edits -> protected deletes -> 48px mobile controls.
Required fixes: manual fallback copy, inline load/degraded states, per-item pending, favorite rollback, custom food validation/save state, custom meal pending/failure, confirm/undo deletes, edit mode + cancel/discard, 48px controls, skeleton fallback, dirty guard, structured builder, link/copy back to Calories import path.
Do not change nutrition schema, AI import/apply behavior, auth, global theme, or unrelated routes except shared FoodBrowser regression checks.
Verification: fallback framing, load states, pending actions, delete confirmations, draft preservation, 48px controls, /calories regression, mobile 390x844.
```

---

## Prompt section 10 — Weekly Overview / Reports correction

```text
/caveman lite

$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + reporting data-confidence reviewer + health-data privacy reviewer

Task: Implement audited Weekly Overview / Fitness Reports UX and report-confidence corrections.

Primary route:
- /calories/weekly-overview

Relevant files to inspect first:
- app/(private)/calories/weekly-overview/page.tsx
- components/meals/weekly-overview.tsx
- components/reports/reporting-dashboard.tsx
- services/reports/reporting.ts
- services/database/nutrition.ts
- services/database/progress.ts
- services/database/workout-sessions.ts
- services/wellness/wellness-data.ts
- docs/ux-progress/routes/weekly-overview-reports.md

Read first:
- CHATGPT_CODEX_PROMPT_RULES.md
- Ruflo_usage.md
- docs/product/ai-first-tracker-model.md
- docs/ux-constitution/README.md
- docs/ux-constitution/flow-and-workflow-audit.md
- docs/ux-constitution/motion-and-interaction.md
- docs/ux-progress/README.md
- docs/ux-progress/routes/weekly-overview-reports.md

Flow decision:
- Tune flow with report-source confidence, empty-state clarity, and readable period controls.

Product rule:
- Weekly Overview / Reports is a read-only analytical review route. Do not make ChatGPT interpretation primary. Add AI review only later as an explicit read-only action, not a silent analysis or data mutation.

Required flow:
- Readable period controls -> source confidence -> skeleton/ErrorState -> clear missing-data explanations -> optional safe export.

Required fixes:
1. Replace plain loading text with report skeleton.
2. Replace plain failure text/toast-only behavior with inline ErrorState and retry.
3. Add source-level confidence/coverage for nutrition, workouts, progress, habits, sleep, and PRs.
4. Distinguish complete, partial, failed, no-data, and insufficient-data states.
5. Replace “Empty states / period checks” with user-facing “Data coverage this period.”
6. Rework period controls into a 48px segmented Weekly/Monthly control plus readable pager/current/date control.
7. Add empty report guidance with links to Calories, Today Workout, Progress, Wellness/Sleep, and Habits where relevant.
8. Expose CSV export using existing helpers with local-file privacy copy, or leave export disabled and document why.
9. Keep previous report visible while next period loads, with clear loading overlay/status if feasible.
10. Do not add charts until source confidence states are correct.

Do not:
- Do not change database schema.
- Do not change auth behavior.
- Do not change AI import/apply behavior.
- Do not make AI report interpretation primary.
- Do not add silent data mutation.
- Do not redesign global navigation or unrelated route flows.
- Do not overstate health conclusions from incomplete data.

Implementation guidance:
- Preserve the current aggregation model: week/month period -> aggregate user data -> metric cards -> detail sections.
- Prefer source-level result wrappers so one failed source does not collapse the whole report.
- If service functions still return [] on error, expose “unknown/partial” where feasible from the dashboard layer.
- Keep report copy cautious and clear: averages are based only on logged days.
- CSV export contains sensitive health data; add local-file privacy copy and success/failure state if exposed.
- Use sober feedback; no decorative report animation.

Verification:
- Run typecheck, lint, and build if feasible.
- Test `/calories/weekly-overview` at 390x844.
- Verify loading uses skeleton cards.
- Verify whole-report failure shows ErrorState with retry.
- Verify partial source failure shows degraded/partial report banner.
- Verify nutrition/workout/progress/habit/sleep/PR source coverage is visible.
- Verify no-data and insufficient-data are distinct from failed data.
- Verify “Empty states / period checks” copy is replaced.
- Verify Weekly/Monthly and period navigation controls are 48px and readable on mobile.
- Verify empty report guidance links to relevant logging routes.
- Verify CSV export, if added, includes privacy/local-file copy and success/failure state.
- Verify no source failure silently becomes a confident zero-data metric.
- Verify no schema/auth/AI/global-theme/unrelated-route changes.
- Review git diff before final report.
```

---

## Prompt section 11 — Calories AI-first correction

```text
/caveman lite
$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester
Task: Implement audited AI-first calories tracking corrections.
Primary route: /calories
Read first: docs/ux-progress/routes/calories.md
Required flow: ChatGPT meal import/review -> Plaivra overview/tracking -> manual fallback/correction.
Required fixes: primary ChatGPT meal import, review/apply/correct stage, AI-first Today view, manual fallback, 48px controls, optimistic water/recent/delete states, shared ErrorState, state-based motion.
Do not silently apply AI-estimated data or change nutrition calculations/schema/auth/payments/unrelated routes.
Verification: AI import primary, reviewable estimates, fallback paths, water/recent/delete states, mobile 390x844.
```

---

## Prompt section 12 — Meal plan AI-first correction

```text
/caveman lite
$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester
Task: Implement audited AI-first meal plan corrections.
Primary route: /my-meal-plan
Read first: docs/ux-progress/routes/my-meal-plan.md
Required flow: ChatGPT meal-plan import/review -> Plaivra planned overview -> shopping / mark done -> manual fallback/correction.
Required fixes: route-level import/update CTA, review/apply/correct stage, AI-first empty states, reorder first screen, ChatGPT first in Add source, fix Done carbs/fat detail, 48px controls, Mark Done/grocery states, shared ErrorState, reduce per-item ChatGPT density.
Do not silently apply AI-generated data or change schema/auth/subscriptions/global theme/unrelated routes.
Verification: import/update primary, reviewable plan data, manual fallback, Mark Done, grocery states, Done carbs fixed, mobile 390x844.
```

---

## Prompt section 13 — Hydration correction

```text
/caveman lite
$memory-management $agent-coder $agent-reviewer $agent-tester
Task: Implement audited hydration direct-logging corrections.
Primary route: /hydration
Read first: docs/ux-progress/routes/hydration.md
Product rule: Hydration is direct quick logging. Do not add AI as the main hydration action.
Required fixes: loading gate, optimistic add/delete rollback, per-action pending, 48px controls, target-hit/missing-target states, degraded/partial-load state, reduced-motion-safe row/progress feedback.
Verification: loading gate, optimistic rollback, duplicate protection, target states, mobile 390x844.
```

---

## Prompt section 14 — Wellness correction

```text
/caveman lite
$memory-management $agent-coder $agent-reviewer $agent-tester
Task: Implement audited wellness hub corrections.
Primary route: /wellness
Read first: docs/ux-progress/routes/wellness.md
Product rule: Wellness is a calm hub/check-in route. Do not make ChatGPT primary or automatically change plans.
Required flow: Today status -> next wellness action -> compact check-in -> focused launchers -> recent history.
Required fixes: status/next-action hero, compact contextual check-in, loading/degraded states, save failure state, 48px controls, calm saved-state transition, clear ChatGPT context copy.
Verification: compact check-in, loading/degraded states, save failure, 48px controls, mobile 390x844.
```

---

## Prompt section 15 — Progress correction

```text
/caveman lite
$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester
Task: Implement audited progress tracker corrections.
Primary route: /progress
Read first: docs/ux-progress/routes/progress.md
Product rule: Progress is direct sensitive tracking. Do not add AI as primary logging flow.
Required fixes: ErrorState/degraded state, empty vs failed distinction, photo degraded state, goal/trend hero, remove duplicate Add, synced/local goal status, 48px controls, row-level pending/failure, safer history rows, photo privacy copy, upload/delete states, reduced-motion update feedback.
Verification: load/failed/empty states, goal/trend hero, edit/delete/photo states, no primary AI logging, mobile 390x844.
```

---

## Prompt section 16 — Settings hub correction

```text
/caveman lite
$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester
Task: Implement audited settings hub corrections.
Primary route: /settings
Read first: docs/ux-progress/routes/settings.md
Required flow: Profile/setup confidence -> grouped sensitive controls -> comfortable navigation -> visible recovery states.
Required fixes: setup skeleton, degraded setup state, partial setup confidence, grouped cards, 48px setup/back/account actions, app confirmation/status pattern, trust/data status badges, microcopy, reduced-motion-safe expansion.
Do not add AI/import workflow to /settings itself or change schema/auth/permission/privacy API semantics.
Verification: profile modes, setup states, grouped cards, 48px controls, mobile 390x844.
```

---

## Prompt section 17 — AI imports correction

```text
/caveman lite
$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester
Task: Implement audited AI imports permission/connection corrections.
Primary route: /settings/ai-imports
Related route: /settings/ai-imports/chatgpt-setup
Read first: docs/ux-progress/routes/settings-ai-imports.md
Required flow: Known connection state -> known permission state -> safe permission changes -> safe setup/revoke -> auditable activity.
Required fixes: status hero, permission load error, unknown state for failed load, save failure, full-access confirmation, connection unknown/error, app revoke confirmation/status, 48px controls, visible activity, reconnect copy, clipboard error handling.
Do not change OAuth, MCP API, scopes, schema, auth, or broaden permissions silently.
Verification: confidence hero, failed-load safety, full-access confirmation, revoke app confirm, visible activity, mobile 390x844.
```

---

## Prompt section 18 — Data privacy correction

```text
/caveman lite
$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester
Task: Implement audited data privacy corrections.
Primary route: /settings/data-privacy
Read first: docs/ux-progress/routes/settings-data-privacy.md
Required flow: Clear privacy meaning -> reliable toggle saves -> explicit export status -> confirmed reset settings.
Required fixes: inline load/save errors, privacy toggle states, descriptions, hide-vs-delete copy, export status/retry/scope, reset confirmation/status, loading skeleton, mobile stacking, 48px controls.
Do not change export API semantics, CSV shape, auth, schema, account behavior, global theme, or imply toggles remove data.
Verification: hide-vs-delete, toggle states, export states, reset confirmation, mobile 390x844.
```

---

## Prompt section 19 — Preferences correction

```text
/caveman lite
$memory-management $agent-reviewer $agent-coder $agent-tester
Task: Implement audited preferences UX and accessibility corrections.
Primary route: /settings/preferences
Read first: docs/ux-progress/routes/settings-preferences.md
Required flow: Loaded preferences -> comfortable controls -> clear pending/save/failure -> reduced-motion-safe UI.
Required fixes: inline provider errors, pending/saved/failed states, prevent rapid repeated changes, 48px selects, mobile stacking, reduced-motion-safe theme picker, loading skeleton, Quick Log helper copy, save/sync copy.
Do not change schema, auth, settings semantics, theme architecture, global theme, unrelated routes, or add AI/import behavior.
Verification: inline errors, rollback copy, 48px selects, stacked rows, reduced-motion-safe theme picker, mobile 390x844.
```

---

## Future route correction template

For every audited route, append: route, score, AI/manual role, flow verdict, current workflow, recommended workflow, mode, skills, advisor, relevant files, do-not-touch list, required fixes, acceptance criteria, verification steps.
