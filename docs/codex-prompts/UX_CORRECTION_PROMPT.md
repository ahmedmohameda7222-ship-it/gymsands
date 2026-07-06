# Plaivra Codex UX Correction Prompt

**Version:** 2026.1  
**Status:** Active prompt builder

This file stores the Codex CLI correction prompts assembled from completed Plaivra UX audits.

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

General rule: implement workflow corrections before button polish. If a flow is weak, correct the flow first, then refine buttons, states, and motion.

Product rule: Plaivra is an AI-first tracker, not primarily a manual data-entry app. ChatGPT-assisted import/apply should be the primary data-entry path where appropriate. Manual entry remains fallback/edit/power-user behavior.

---

## Setup guide

### One-route UI correction

```text
/caveman lite

$memory-management $agent-coder $agent-reviewer $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + premium UX reviewer
```

### One-route work touching profile, auth, AI permissions, or user data

```text
/caveman lite

$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior product engineer + user-data safety reviewer
```

### One-route work touching active workout logging reliability

```text
/caveman lite

$memory-management $agent-coder $agent-reviewer $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + data-integrity reviewer
```

### One-route work adding or changing AI import/apply flows

```text
/caveman lite

$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + AI import/review/apply safety reviewer
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
7. Ensure dashboard reflects Plaivra's AI-first model: show imported/active state and review/apply needs where relevant.
8. Use motion only for feedback/state clarity.

Inspect relevant dashboard files only. Do not touch unrelated routes, env files, schema, migrations, auth, API routes, MCP routes, settings, subscriptions, or global theme.

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
3. Move Create manually and Import into an Add plan area, not top-level competing controls.
4. Remove duplicate Start Today patterns.
5. Make plan More actions trigger and menu items 48px effective tap targets.
6. Separate destructive menu actions visually from normal actions.
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
2. Add rollback for failed optimistic finishSet persistence, including completed state, active set/exercise, and rest timer where needed.
3. Add rollback for failed restartSet persistence.
4. Add clearer starting/resuming session pending state while logs/history hydrate.
5. Resize close/back/more/exercise chip/set path/advanced sheet controls to 48px effective tap targets.
6. Simplify exit behavior and guard unsaved local changes before leaving.
7. Add clear failure feedback when a set save fails.
8. Keep ChatGPT as support for replacement/coaching, not as required for every set.
9. Add only useful state/rest/finish motion; no decorative animation.

Do not redesign the whole workout session, change workout schema, change unrelated workout plan pages, auth, payments, or unrelated routes.

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
3. Reorder Today view into AI-first overview: status -> import/review -> fast fallback actions -> logs/water.
4. Keep manual add/search/custom/barcode/recent as fallback/quick correction, not primary flow.
5. Resize mobile tab selector, date nav, recent food Log, favorite, delete, and water controls to 48px effective targets.
6. Add optimistic water add with pending duplicate protection and rollback.
7. Add pending/feedback for Recent food Log and prevent duplicate rapid taps.
8. Add pending/rollback or safe unchanged behavior for food/water delete.
9. Replace custom load error UI with shared ErrorState and retry.
10. Add only useful import/review/apply motion; no decorative animation.

Do not rewrite nutrition calculations, database schema, auth, payments, unrelated meal-plan routes, or global theme. Do not silently apply AI-estimated food data without a review/apply/correct step unless an existing explicit permission model already allows it and the UI makes that clear.

Verification:
- Run typecheck, lint, and build if feasible.
- Test /calories at 390x844.
- Verify first screen makes ChatGPT meal import/review primary.
- Verify imported estimates are reviewable/correctable before saving.
- Verify manual add/search/custom/barcode/recent remain available as fallback.
- Verify water optimistic success, duplicate protection, and rollback.
- Verify recent food logging pending behavior and duplicate protection.
- Verify food/water delete pending/rollback or safe unchanged behavior.
- Verify weekly, targets, and barcode scanner still work.
- Review git diff before final report.

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
1. Add a persistent route-level primary CTA: Import/update meal plan with ChatGPT.
2. Add a review/apply/correct stage for structured ChatGPT meal-plan results before saving, using existing AI/import patterns where available.
3. Reframe empty day and empty meal-type states so ChatGPT import/update is primary and manual add is fallback.
4. Reorder the first screen into: meal-plan status/import hero -> pending review/apply area if any -> today planned meals -> week/shopping/manual tools.
5. Change Add source order: ChatGPT import/update first, Quick add and Food Hub secondary.
6. Fix the Done carbs summary detail so it uses done fat, not planned fat.
7. Resize date controls, week chips, meal-type chips, meal plus buttons, meal item actions, delete controls, form selects, and grocery menu items to 48px effective tap targets.
8. Add clearer pending/success/failure states for Mark Done, including whether the meal was logged to Calories and what happens on failure.
9. Add pending/duplicate protection for Add to grocery.
10. Add optimistic grocery checked/already-have interactions with rollback on failure.
11. Replace custom route/grocery load errors with shared ErrorState where practical.
12. Move Food preferences out of the tab row into a secondary action/menu/helper area.
13. Reduce repeated per-item ChatGPT visual density after route-level import becomes primary.
14. Add only useful reduced-motion-safe import/review/apply, mark-done, and checklist feedback. No decorative animation.

Do not:
- Do not redesign the route from scratch.
- Do not rewrite nutrition calculations.
- Do not change database schema unless an existing import/apply path truly requires a documented minimal migration and you explicitly report why.
- Do not change auth, subscriptions, global theme, unrelated calorie routes, unrelated workout routes, or settings.
- Do not silently apply AI-generated meal-plan changes without review/apply/correct.
- Do not remove manual entry; demote it to fallback/correction.

Safety rule:
- If no structured ChatGPT meal-plan apply path exists, do not fake a silent import. Surface the primary ChatGPT request/import/update flow and add a safe review/apply placeholder or pending state that preserves current data until the user explicitly approves. Report the missing backend/import gap clearly.

Verification:
- Run typecheck, lint, and build if feasible.
- Test /my-meal-plan at 390x844.
- Verify first screen makes ChatGPT meal-plan import/update primary.
- Verify existing planned meals do not hide the import/update path.
- Verify imported/generated plans are reviewable/correctable before saving, or that the UI clearly preserves current data if full apply is not implemented.
- Verify manual Add food, Food Hub, item edit, item delete, and Food preferences still work.
- Verify Mark Done logs to Calories, blocks duplicate logs, and has clear pending/failure feedback.
- Verify Add to grocery blocks duplicate rapid taps.
- Verify grocery checked/already-have optimistic success and rollback.
- Verify Done carbs detail uses done fat.
- Verify key tap targets meet 48px effective size.
- Verify Week and Shopping tabs still work.
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
