# Plaivra Codex UX Correction Prompt

**Version:** 2026.1  
**Status:** Active prompt builder

This file stores Codex CLI correction prompts assembled from completed Plaivra UX audits.

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
- `/calories` — 54/100 — fixes open after AI-first reframing
- `/my-meal-plan` — 57/100 — fixes open after AI-first reframing
- `/hydration` — 68/100 — fixes open
- `/wellness` — 60/100 — fixes open
- `/progress` — 62/100 — fixes open

General rule: implement workflow corrections before button polish. If a flow is weak, correct the flow first, then refine buttons, states, and motion.

Product rule: Plaivra is an AI-first tracker where appropriate, but not every route is ChatGPT-first. Hydration is direct quick logging. Wellness is a calm hub/check-in route. Progress is sensitive direct tracking with optional later AI interpretation only by explicit request.

---

## Setup guide

### Standard one-route UI correction

```text
/caveman lite

$memory-management $agent-coder $agent-reviewer $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + premium UX reviewer
```

### User-data, privacy, or AI import/apply correction

```text
/caveman lite

$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + user-data safety reviewer
```

### Future multi-route bundle

```text
/caveman lite

$swarm-orchestration $memory-management $agent-reviewer $agent-tester

Mode: high plus advisor, or xhigh plus advisor only for a large multi-route batch
Advisor: strict senior mobile product engineer + release-quality UX auditor + regression reviewer
```

---

## Prompt section 1 — Dashboard correction

```text
/caveman lite

$memory-management $agent-coder $agent-reviewer $agent-tester

Task: Implement the audited P1 dashboard UX corrections for Plaivra.

Read first:
- CHATGPT_CODEX_PROMPT_RULES.md
- Ruflo_usage.md
- docs/product/ai-first-tracker-model.md
- docs/ux-constitution/README.md
- docs/ux-constitution/flow-and-workflow-audit.md
- docs/ux-constitution/motion-and-interaction.md
- docs/ux-progress/README.md

Primary route:
- /dashboard

Required fixes:
1. Add one clear Next Best Action experience.
2. Demote duplicated or competing CTAs.
3. Add optimistic UI and pending protection for water quick add.
4. Add optimistic UI and pending protection for meal Done.
5. Make Done dominant and Skip secondary in meal rows.
6. Restyle meal type selector into a calmer segmented/horizontal selector.
7. Ensure dashboard reflects Plaivra's AI-first model where relevant: imported/active state and review/apply needs.
8. Use motion only for feedback/state clarity.

Do not touch unrelated routes, env files, schema, migrations, auth, API routes, settings, subscriptions, or global theme.

Verification: typecheck, lint, build if feasible, mobile 390x844, optimistic success/rollback for water and meal Done, review git diff.

Final report: changed files, changes, tests, risks, unverified items, memory_store usage, next step.
```

---

## Prompt section 2 — Onboarding edit correction

```text
/caveman lite

$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Task: Implement the audited P0/P1 onboarding edit UX corrections for Plaivra.

Read first:
- CHATGPT_CODEX_PROMPT_RULES.md
- Ruflo_usage.md
- docs/product/ai-first-tracker-model.md
- docs/ux-constitution/README.md
- docs/ux-constitution/flow-and-workflow-audit.md
- docs/ux-constitution/motion-and-interaction.md
- docs/ux-progress/README.md

Primary route:
- /onboarding?edit=true

Required fixes:
1. Show Target weight only for weight/body-composition goals or when a saved target weight exists.
2. Add edit-mode saved-answer loading gate.
3. Add subtle reduced-motion-safe step transitions.
4. Resize relevant controls to 48px effective tap targets.
5. Improve AI permission trust framing and review summary.
6. Make mobile step navigation calmer.

Inspect onboarding/profile/AI-permission files only. Do not change database schema, auth behavior, or unrelated routes.

Verification: typecheck, lint, build if feasible, mobile 390x844, non-weight goals, weight goals, saved target weight case, AI permissions save.

Final report: changed files, changes, tests, risks, unverified items, memory_store usage, next step.
```

---

## Prompt section 3 — Workout plans correction

```text
/caveman lite

$memory-management $agent-coder $agent-reviewer $agent-tester

Task: Implement the audited P1 workout plans UX corrections for Plaivra.

Read first:
- CHATGPT_CODEX_PROMPT_RULES.md
- Ruflo_usage.md
- docs/product/ai-first-tracker-model.md
- docs/ux-constitution/README.md
- docs/ux-constitution/flow-and-workflow-audit.md
- docs/ux-constitution/motion-and-interaction.md
- docs/ux-progress/README.md
- docs/ux-progress/routes/my-workout-plans.md

Primary route:
- /my-workout/plans

Flow decision:
- Reorder flow.

Required flow:
- Today hero -> weekly calendar -> saved plan library -> add/import plan.

Required fixes:
1. Reorder route so active plan users see a Today hero first.
2. Replace no-plan empty state with setup choice hero: Import from ChatGPT primary, Create manually secondary.
3. Move Create manually and Import into an Add plan area.
4. Remove duplicate Start Today patterns.
5. Make plan More actions trigger and menu items 48px effective tap targets.
6. Separate high-risk menu actions visually from normal actions.
7. Improve ChatGPT import/access framing and standard button styling.
8. Add only useful state/motion feedback; no decorative animation.

Do not change workout session tracking, database schema, auth, payments, or unrelated routes.

Verification: typecheck, lint, build if feasible, mobile 390x844, no-plan state, active plan today workout/rest day, More actions, delete confirmation, import visibility.

Final report: changed files, changes, tests, risks, unverified items, memory_store usage, next step.
```

---

## Prompt section 4 — Workout session correction

```text
/caveman lite

$memory-management $agent-coder $agent-reviewer $agent-tester

Task: Implement the audited P0/P1 workout session UX and reliability corrections for Plaivra.

Mode: high plus advisor
Advisor: strict senior mobile product engineer + workout logging data-integrity reviewer

Read first:
- CHATGPT_CODEX_PROMPT_RULES.md
- Ruflo_usage.md
- docs/product/ai-first-tracker-model.md
- docs/ux-constitution/README.md
- docs/ux-constitution/flow-and-workflow-audit.md
- docs/ux-constitution/motion-and-interaction.md
- docs/ux-progress/README.md
- docs/ux-progress/routes/workout-session-day.md

Primary route:
- /workouts/session/day/[dayId]

Required fixes:
1. Restore or replace the in-session mobile sticky CTA so Finish Set / Rest / Finish Workout is reachable on mobile.
2. Add rollback for failed optimistic finishSet persistence.
3. Add rollback for failed restartSet persistence.
4. Add clearer starting/resuming session pending state while logs/history hydrate.
5. Resize close/back/more/exercise chip/set path/advanced sheet controls to 48px effective tap targets.
6. Simplify exit behavior and guard unsaved local changes before leaving.
7. Add clear failure feedback when a set save fails.
8. Keep ChatGPT as support for replacement/coaching, not as required for every set.
9. Add only useful state/rest/finish motion; no decorative animation.

Do not redesign the whole workout session, change workout schema, auth, payments, or unrelated routes.

Verification: typecheck, lint, build if feasible, mobile 390x844, Finish Set reachable, rest bottom action, all-sets-complete finish action, failed set save rollback, failed reopen rollback, exit guard.

Final report: changed files, changes, tests, risks, unverified items, memory_store usage, next step.
```

---

## Prompt section 5 — Calories AI-first correction

```text
/caveman lite

$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Task: Implement the audited P0/P1 AI-first calories tracking corrections for Plaivra.

Mode: high plus advisor
Advisor: strict senior mobile product engineer + AI import/review/apply safety reviewer + daily nutrition UX reviewer

Read first:
- CHATGPT_CODEX_PROMPT_RULES.md
- Ruflo_usage.md
- docs/product/ai-first-tracker-model.md
- docs/ux-constitution/README.md
- docs/ux-constitution/flow-and-workflow-audit.md
- docs/ux-constitution/motion-and-interaction.md
- docs/ux-progress/README.md
- docs/ux-progress/routes/calories.md

Primary route:
- /calories

Flow decision:
- Needs AI-first reframing.

Required flow:
- ChatGPT meal import/review -> Plaivra overview/tracking -> manual fallback/correction.

Required fixes:
1. Add or surface primary ChatGPT meal import path on /calories Today view.
2. Add review/apply/correct stage for imported ChatGPT meal estimates before saving.
3. Reorder Today view into AI-first overview.
4. Keep manual add/search/custom/barcode/recent as fallback/quick correction.
5. Resize mobile tab selector, date nav, recent food Log, favorite, delete, and water controls to 48px targets.
6. Add optimistic water add with pending duplicate protection and rollback.
7. Add pending/feedback for Recent food Log and prevent duplicate rapid taps.
8. Add pending/rollback or safe unchanged behavior for food/water delete.
9. Replace custom load error UI with shared ErrorState and retry.
10. Add only useful import/review/apply motion; no decorative animation.

Do not rewrite nutrition calculations, database schema, auth, payments, unrelated meal-plan routes, or global theme. Do not silently apply AI-estimated food data without review/apply/correct.

Verification: typecheck, lint, build if feasible, mobile 390x844, AI meal import primary, imported estimates reviewable, manual fallback available, water/recent/delete pending and rollback, weekly/targets/barcode still work, review git diff.

Final report: changed files, changes, tests, risks, unverified items, memory_store usage, next step.
```

---

## Prompt section 6 — Meal plan AI-first correction

```text
/caveman lite

$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Task: Implement the audited P0/P1 AI-first meal plan corrections for Plaivra.

Mode: high plus advisor
Advisor: strict senior mobile product engineer + AI import/review/apply safety reviewer + meal planning data-integrity reviewer

Read first:
- CHATGPT_CODEX_PROMPT_RULES.md
- Ruflo_usage.md
- docs/product/ai-first-tracker-model.md
- docs/ux-constitution/README.md
- docs/ux-constitution/flow-and-workflow-audit.md
- docs/ux-constitution/motion-and-interaction.md
- docs/ux-progress/README.md
- docs/ux-progress/routes/my-meal-plan.md

Primary route:
- /my-meal-plan

Relevant files to inspect first:
- app/(private)/my-meal-plan/page.tsx
- components/meals/my-meal-plan-builder.tsx
- components/meals/meal-ai-actions.tsx
- components/meals/grocery-list-panel.tsx
- components/meals/meal-plan-calendar.tsx
- components/ai/ai-action-request-dialog.tsx
- services/database/meal-plan.ts
- services/database/execution-layer.ts
- types/database.ts

Flow decision:
- Needs AI-first reframing.

Required flow:
- ChatGPT meal-plan import/review -> Plaivra planned overview -> shopping / mark done -> manual fallback/correction.

Required fixes:
1. Add persistent route-level primary CTA: Import/update meal plan with ChatGPT.
2. Add review/apply/correct stage for structured ChatGPT meal-plan results before saving.
3. Reframe empty day and empty meal-type states so ChatGPT import/update is primary and manual add is fallback.
4. Reorder first screen into meal-plan status/import hero -> pending review/apply area -> today planned meals -> week/shopping/manual tools.
5. Change Add source order: ChatGPT import/update first, Quick add and Food Hub secondary.
6. Fix Done carbs summary detail so it uses done fat, not planned fat.
7. Resize key date, meal, item, form, and grocery controls to 48px targets.
8. Add clearer pending/success/failure states for Mark Done.
9. Add pending/duplicate protection for Add to grocery.
10. Add optimistic grocery checked/already-have interactions with rollback.
11. Replace custom route/grocery load errors with shared ErrorState where practical.
12. Move Food preferences out of the tab row.
13. Reduce repeated per-item ChatGPT visual density after route-level import becomes primary.
14. Add useful reduced-motion-safe import/review/apply, mark-done, and checklist feedback.

Safety rule: if no structured ChatGPT meal-plan apply path exists, do not fake silent import. Surface the primary request/update flow and add a safe review/apply placeholder or pending state that preserves current data until explicit approval.

Do not redesign from scratch, rewrite nutrition calculations, change auth, subscriptions, global theme, unrelated routes, or silently apply AI-generated data.

Verification: typecheck, lint, build if feasible, mobile 390x844, import/update primary, plans reviewable/correctable or safe placeholder, manual add/Food Hub/edit/delete/preferences still work, Mark Done logs Calories safely, grocery actions protected, Done carbs fixed, Week/Shopping still work, review git diff.

Final report: changed files, changes, tests, risks, unverified items, memory_store usage, next step.
```

---

## Prompt section 7 — Hydration direct-logging correction

```text
/caveman lite

$memory-management $agent-coder $agent-reviewer $agent-tester

Task: Implement the audited P1/P2 hydration UX and direct-logging reliability corrections for Plaivra.

Mode: high plus advisor
Advisor: strict senior mobile product engineer + daily logging data-integrity reviewer

Read first:
- CHATGPT_CODEX_PROMPT_RULES.md
- Ruflo_usage.md
- docs/product/ai-first-tracker-model.md
- docs/ux-constitution/README.md
- docs/ux-constitution/flow-and-workflow-audit.md
- docs/ux-constitution/motion-and-interaction.md
- docs/ux-progress/README.md
- docs/ux-progress/routes/hydration.md

Primary route:
- /hydration

Relevant files to inspect first:
- app/(private)/hydration/page.tsx
- services/database/nutrition.ts
- types/database.ts

Product rule:
- Hydration is intentionally not ChatGPT/import-first. Direct quick logging is primary. Do not add AI as the main hydration action.

Required flow:
- Today hero -> quick add -> manual fallback -> recent entries -> weekly context -> streak/reminder.

Required fixes:
1. Add initial loading gate/skeleton so the hero does not show false 0 L while hydration data is loading.
2. Add optimistic quick-add for water logs with rollback on failure.
3. Add per-action pending state and duplicate rapid-tap protection for quick add and manual add.
4. Add optimistic delete for recent water entries with rollback and restored-entry error copy.
5. Resize delete controls to 48px effective tap targets.
6. Add clearer failure copy for add/delete.
7. Add a calm target-hit state or success moment when total reaches target.
8. Make missing-target state more actionable.
9. Resize Refresh and Edit Targets to comfortable 48px effective targets.
10. Add controlled progress/row motion for add/delete and respect reduced motion.
11. Surface degraded/partial-load state if week/target/logs cannot fully load where feasible.

Do not add ChatGPT/import as the primary hydration path, redesign route from scratch, change schema, rewrite calorie target editing, or touch unrelated routes.

Verification: typecheck, lint, build if feasible, mobile 390x844, loading gate, optimistic add/delete rollback, duplicate protection, 48px controls, target-hit/missing-target states, weekly totals correct, ErrorState retry, no primary ChatGPT action, review git diff.

Final report: changed files, changes, tests, risks, unverified items, memory_store usage, next step.
```

---

## Prompt section 8 — Wellness hub correction

```text
/caveman lite

$memory-management $agent-coder $agent-reviewer $agent-tester

Task: Implement the audited P1/P2 wellness hub UX and data-state corrections for Plaivra.

Mode: high plus advisor
Advisor: strict senior mobile product engineer + calm wellness UX reviewer + data-state reliability reviewer

Read first:
- CHATGPT_CODEX_PROMPT_RULES.md
- Ruflo_usage.md
- docs/product/ai-first-tracker-model.md
- docs/ux-constitution/README.md
- docs/ux-constitution/flow-and-workflow-audit.md
- docs/ux-constitution/motion-and-interaction.md
- docs/ux-progress/README.md
- docs/ux-progress/routes/wellness.md

Primary route:
- /wellness

Relevant files to inspect first:
- app/(private)/wellness/page.tsx
- components/wellness/daily-checkins.tsx
- services/database/wellness.ts
- services/wellness/wellness-data.ts
- services/database/execution-layer.ts
- types/database.ts

Flow decision:
- Reorder flow.

Product rule:
- Wellness is not ChatGPT/import-first. It is a calm daily hub and check-in route. Check-in context may support later ChatGPT requests, but it must not automatically change plans.

Required flow:
- Today status -> next wellness action -> compact check-in -> focused launchers -> recent history.

Required fixes:
1. Add wellness status / next best action hero before full check-in form.
2. Reorder route to status/next action -> compact check-in -> launcher cards -> recent check-ins.
3. Make DailyCheckins compact/contextual on the hub instead of expanded full form by default.
4. Show only the most relevant check-in first.
5. Add summary loading skeleton/gate.
6. Add inline summary error/degraded state with retry.
7. Add inline check-in save failure and clear not-saved state.
8. Resize rating buttons and compact check-in controls to 48px.
9. Add next-action emphasis.
10. Add calm saved-state transition and optional collapse.
11. Collapse or move recent check-in history below launcher cards.
12. Clarify microcopy that check-in context may support ChatGPT requests but does not automatically change plans.
13. Add reduced-motion-safe reveal/collapse.

Do not add ChatGPT as the primary wellness action, redesign route from scratch, duplicate full subroute functionality, change schema, or touch unrelated routes/settings/auth.

Verification: typecheck, lint, build if feasible, mobile 390x844, status/next action visible, compact contextual check-in, launchers visible, loading/degraded states, save failure state, 48px controls, calm motion, no primary ChatGPT action, review git diff.

Final report: changed files, changes, tests, risks, unverified items, memory_store usage, next step.
```

---

## Prompt section 9 — Progress tracker correction

```text
/caveman lite

$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Task: Implement the audited P1/P2 progress tracker UX, privacy, and data-state corrections for Plaivra.

Mode: high plus advisor
Advisor: strict senior mobile product engineer + privacy-sensitive progress data reviewer + data-state reliability reviewer

Read first:
- CHATGPT_CODEX_PROMPT_RULES.md
- Ruflo_usage.md
- docs/product/ai-first-tracker-model.md
- docs/ux-constitution/README.md
- docs/ux-constitution/flow-and-workflow-audit.md
- docs/ux-constitution/motion-and-interaction.md
- docs/ux-progress/README.md
- docs/ux-progress/routes/progress.md

Primary route:
- /progress

Relevant files to inspect first:
- app/(private)/progress/page.tsx
- components/progress/progress-entry-modal.tsx
- components/progress/progress-charts.tsx
- services/database/progress.ts
- services/progress/progress-measurements.ts
- services/progress/progress-photos.ts
- services/database/profile.ts
- types/database.ts

Flow decision:
- Tune flow.

Product rule:
- Progress is not ChatGPT/import-first. It is sensitive direct tracking. ChatGPT trend interpretation may be added later only as an explicit user-requested review path, not as the primary logging flow.

Required flow:
- Goal/trend status -> one next logging action -> reliable add/edit/delete/photo states -> private trend review.

Required fixes:
1. Add route-level ErrorState/degraded state with retry for failed progress load.
2. Distinguish empty progress from failed progress load.
3. Show photo-specific degraded state if photos fail to load instead of silently showing no photos.
4. Make overview hero goal/trend/next-action focused, not only current-weight focused.
5. Remove duplicate primary Add progress entry placements.
6. Add goal weight pending state and explicit synced/local fallback status.
7. Resize edit/delete/photo/goal/select/link controls to 48px effective targets.
8. Add row-level pending/failure states for edit/delete entry actions.
9. Add safer mobile history row interaction instead of action buttons competing inside native summary.
10. Add privacy copy for progress photos and hidden-photo setting.
11. Add clear pending/failure state for photo delete.
12. Add selected-file and inline upload error feedback for photo upload.
13. Convert raw text “See all / View” controls into comfortable secondary buttons/links.
14. Add restrained reduced-motion-safe update feedback for add/edit/delete/goal save.

Do not:
- Do not add ChatGPT/AI as the primary progress logging flow.
- Do not redesign the route from scratch.
- Do not change database schema.
- Do not change storage bucket policy.
- Do not touch auth, subscriptions, global theme, unrelated progress/PR pages, or unrelated settings.
- Do not make medical/body-composition claims from weight or measurements.

Implementation guidance:
- Preserve the major tabs: Overview, Measurements, Photos, History.
- Preserve ProgressEntryModal and its typed-value preservation on failure.
- For route data, do not show failed loads as confident empty states.
- For photo privacy, make “private” and “hidden by setting” visible in the UI.
- For goal weight, show whether it is synced to profile or saved locally as fallback.
- For deletes, keep confirmation and add row/photo pending plus visible failure state.
- Use motion only for data update clarity: saved highlight, row pending/exit, sync-state transition. Respect reduced motion.

Verification:
- Run typecheck, lint, and build if feasible.
- Test /progress at 390x844.
- Verify loading, failed load, empty state, and real data are visually distinct.
- Verify failed progress entries load does not display as confident no entries.
- Verify failed photo load does not display as confident no photos.
- Verify overview hero explains goal/trend status and next useful logging action.
- Verify only one primary Add progress entry action is visible per state.
- Verify goal weight save shows pending and then synced/local fallback state.
- Verify add progress entry still preserves typed values on failure.
- Verify edit entry save shows pending, success, and failure inline.
- Verify delete entry has confirmation, pending state, and clear failure recovery.
- Verify history rows are comfortable on mobile and actions do not conflict with expand/collapse.
- Verify photo upload explains privacy, validates selected file, and shows inline failure.
- Verify photo delete has confirmation, pending, and clear failure state.
- Verify hidden-photo setting is explained when photos are hidden.
- Verify key controls meet 48px effective target.
- Verify no ChatGPT/AI action was added as primary progress logging flow.
- Review git diff before final report.

Final report: changed files, changes, tests, risks, unverified items, memory_store usage, next step.
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
