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

Product rule: Plaivra is AI-first where appropriate, but not every route is ChatGPT-first. Manual entry is fallback/correction where appropriate. Hydration is direct quick logging. Wellness is a calm hub/check-in route. Progress is sensitive direct tracking. Settings is a trust/control hub. Workout day editor and Exercise Library are manual correction/reference routes.

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
Read first: docs/ux-progress/README.md and the UX constitution files.
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
Related routes: /my-workout/day/[dayId]/add-exercise, /my-workout/plans/[planId], /my-workout/plans/builder
Read first: docs/ux-progress/routes/workout-day-editor.md
Required flow: Known day -> visible draft state -> safe edits -> protected cancel/back/remove -> reliable save.
Required fixes: editor status bar, unsaved-change guard, confirmed discard, inline save failure/retry, draft-restored banner, remove confirm/undo, 48px move/edit/remove controls, ErrorState for day load, add-exercise draft guidance, distinguish failed add-exercise search from empty, custom video URL validation, return to plan detail when context known, reduced-motion-safe reorder/remove feedback.
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

Primary route:
- /workouts

Related routes:
- /workouts/[id]
- /workouts/session/[id] or the actual standalone exercise/session route, if it exists
- /my-workout/day/[dayId]/add-exercise

Read first:
- CHATGPT_CODEX_PROMPT_RULES.md
- Ruflo_usage.md
- docs/product/ai-first-tracker-model.md
- docs/ux-constitution/README.md
- docs/ux-constitution/flow-and-workflow-audit.md
- docs/ux-constitution/motion-and-interaction.md
- docs/ux-progress/README.md
- docs/ux-progress/routes/exercise-library.md

Relevant files to inspect first:
- app/(private)/workouts/page.tsx
- components/workouts/workout-browser.tsx
- app/(private)/workouts/[id]/page.tsx
- components/workouts/video-player.tsx
- app/(private)/my-workout/exercises/[exerciseId]/page.tsx
- services/database/workout-library.ts
- services/workouts/exercise-library-store.ts
- components/workouts/workout-day-add-exercise.tsx
- components/workouts/workout-plan-builder.tsx

Flow decision:
- Tune flow with search-state, detail-state, and route-action hardening.

Product rule:
- Exercise Library is not AI/import-first. It is a reference, discovery, and manual fallback route. It must not become the primary full-plan creation path for Plaivra's AI-first model.

Required flow:
- Verified actions -> visible result states -> reliable favorites/custom saves -> 48px mobile controls.

Required fixes:
1. Verify `/workouts/session/[id]` route used by Start actions. Implement, redirect, or replace/remove the Start action if the route does not exist.
2. Add inline search/filter load error with retry and distinguish failed load from true empty.
3. Add degraded/fallback banner when live filter/workout data falls back to local data.
4. Add favorite pending state, optimistic update, and rollback on failure on library and detail pages.
5. Catch favorites/custom load failure and show degraded state.
6. Add custom exercise save pending, duplicate-submit protection, inline validation, success, and failure state.
7. Add inline custom video URL validation.
8. Add detail route skeleton/ErrorState.
9. Add custom video save/reset inline success/failure state on detail route.
10. Resize top actions, filter options, result-card actions, and detail disclosures to 48px.
11. Add mobile result/status row with count, loading, and active filters.
12. Make mobile filter Apply/Clear actions sticky or easier to reach.
13. Improve icon-only action clarity with labels or action sheet where useful.
14. Add discard confirmation for non-empty custom exercise draft.

Do not:
- Do not change workout database schema.
- Do not change auth behavior.
- Do not change workout session execution semantics.
- Do not change AI import/apply behavior.
- Do not remove intentional local fallback behavior.
- Do not redesign the library from scratch.
- Do not touch global theme or unrelated routes.

Implementation guidance:
- Preserve the current route model: Search/filter -> result cards -> exercise detail -> favorites/custom/video support.
- Treat service fallbacks as useful, but surface degraded/fallback state when feasible.
- Keep favorites/custom exercises usable for anonymous/local fallback users.
- Keep add-to-plan behavior in `/my-workout/day/[dayId]/add-exercise` working.
- Use sober state feedback; no decorative exercise-card animation.

Verification:
- Run typecheck, lint, and build if feasible.
- Test /workouts at 390x844.
- Verify search loading, empty, failed, fallback, and loaded states are distinct.
- Verify result count and active filter count are visible on mobile.
- Verify favorite pending/failure/rollback works on library and detail pages.
- Verify custom exercise creation has inline validation and keeps draft on failure.
- Verify detail page skeleton/ErrorState.
- Verify custom video save/reset inline states.
- Verify `/workouts/session/[id]` Start action works or is replaced/removed.
- Verify top actions, result card icons, filter controls, and detail accordions meet 48px target.
- Verify mobile filters dialog has comfortable Apply/Clear behavior.
- Verify add-to-plan flow through `/my-workout/day/[dayId]/add-exercise` still works.
- Verify no schema/auth/session/AI/global-theme/unrelated-route changes.
- Review git diff before final report.
```

---

## Prompt section 7 — Calories AI-first correction

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

## Prompt section 8 — Meal plan AI-first correction

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

## Prompt section 9 — Hydration correction

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

## Prompt section 10 — Wellness correction

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

## Prompt section 11 — Progress correction

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

## Prompt section 12 — Settings hub correction

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

## Prompt section 13 — AI imports correction

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

## Prompt section 14 — Data privacy correction

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

## Prompt section 15 — Preferences correction

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

For every audited route, append:

- route
- audit score
- AI-first/manual-entry role
- flow verdict
- current workflow
- recommended workflow
- flow decision label
- recommended mode
- skills
- advisor
- relevant files
- do-not-touch list
- required fixes
- acceptance criteria
- verification steps
