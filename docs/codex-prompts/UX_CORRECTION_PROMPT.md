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
- `/workouts` — 64/100 — fixes open
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

For user-data, privacy, or AI import/apply routes, add `$security-audit` and use a user-data safety advisor.

---

## Prompt section 1 — Dashboard correction

```text
/caveman lite

$memory-management $agent-coder $agent-reviewer $agent-tester

Task: Implement audited dashboard UX corrections for Plaivra.

Read first:
- docs/product/ai-first-tracker-model.md
- docs/ux-constitution/flow-and-workflow-audit.md
- docs/ux-constitution/motion-and-interaction.md
- docs/ux-progress/README.md

Primary route:
- /dashboard

Required fixes:
1. Add one clear Next Best Action experience.
2. Demote duplicated or competing CTAs.
3. Add optimistic UI and pending protection for water quick add and meal Done.
4. Make Done dominant and Skip secondary in meal rows.
5. Restyle meal type selector into a calmer segmented/horizontal selector.
6. Reflect imported/active AI-first state where relevant.
7. Use motion only for feedback/state clarity.

Do not touch unrelated routes, env files, database schema, auth, API routes, settings, subscriptions, or global theme.

Verification: typecheck, lint, build if feasible, mobile 390x844, optimistic success/rollback for water and meal Done, review git diff.
```

---

## Prompt section 2 — Onboarding edit correction

```text
/caveman lite

$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Task: Implement audited onboarding edit UX corrections for Plaivra.

Primary route:
- /onboarding?edit=true

Required fixes:
1. Show Target weight only for weight/body-composition goals or when a saved target weight exists.
2. Add edit-mode saved-answer loading gate.
3. Add subtle reduced-motion-safe step transitions.
4. Resize relevant controls to 48px effective tap targets.
5. Improve AI permission trust framing and review summary.
6. Make mobile step navigation calmer.

Do not change schema, auth behavior, or unrelated routes.

Verification: typecheck, lint, build if feasible, mobile 390x844, non-weight goals, weight goals, saved target weight case, AI permissions save.
```

---

## Prompt section 3 — Workout plans correction

```text
/caveman lite

$memory-management $agent-coder $agent-reviewer $agent-tester

Task: Implement audited workout plans UX corrections.

Primary route:
- /my-workout/plans

Read first:
- docs/ux-progress/routes/my-workout-plans.md

Required flow:
- Today hero -> weekly calendar -> saved plan library -> add/import plan.

Required fixes:
1. Reorder route so active plan users see Today first.
2. Replace no-plan empty state with Import from ChatGPT primary and Create manually secondary.
3. Move Create manually and Import into an Add plan area.
4. Remove duplicate Start Today patterns.
5. Make plan More actions trigger/menu 48px targets.
6. Separate high-risk menu actions visually.
7. Improve ChatGPT import/access framing.
8. Keep motion state-based only.

Do not change workout session tracking, schema, auth, payments, or unrelated routes.

Verification: typecheck, lint, build if feasible, mobile 390x844, no-plan, active-plan, rest-day, More actions, confirmation patterns, import visibility.
```

---

## Prompt section 4 — Workout session correction

```text
/caveman lite

$memory-management $agent-coder $agent-reviewer $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + workout logging data-integrity reviewer

Task: Implement audited workout session UX and reliability corrections.

Primary route:
- /workouts/session/day/[dayId]

Read first:
- docs/ux-progress/routes/workout-session-day.md

Required fixes:
1. Restore or replace the in-session mobile sticky CTA so Finish Set / Rest / Finish Workout is reachable on mobile.
2. Add rollback for failed optimistic finishSet and restartSet persistence.
3. Add clearer starting/resuming session pending state.
4. Resize close/back/more/exercise chip/set path/advanced sheet controls to 48px.
5. Simplify exit behavior and guard unsaved local changes before leaving.
6. Add clear failure feedback when a set save fails.
7. Keep ChatGPT as support, not required for every set.
8. Use motion only for state/rest/finish clarity.

Do not redesign the session, change workout schema, auth, payments, or unrelated routes.

Verification: typecheck, lint, build if feasible, mobile 390x844, Finish Set reachable, rest bottom action, final finish action, failed save rollback, exit guard.
```

---

## Prompt section 5 — Workout day editor correction

```text
/caveman lite

$memory-management $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + workout editor data-integrity reviewer + mobile interaction reviewer

Task: Implement audited workout day editor UX and draft-safety corrections.

Primary route:
- /my-workout/day/[dayId]

Related routes:
- /my-workout/day/[dayId]/add-exercise
- /my-workout/plans/[planId]
- /my-workout/plans/builder

Read first:
- docs/ux-progress/routes/workout-day-editor.md

Required flow:
- Known day -> visible draft state -> safe edits -> protected cancel/back/remove -> reliable save.

Required fixes:
1. Add editor status bar showing draft restored, unsaved changes, saving, saved, and failed states.
2. Add unsaved-change guard for Back and Cancel; Cancel must confirm before clearing local draft.
3. Add inline save failure state with retry and keep local draft intact.
4. Add draft-restored banner with discard draft action.
5. Add confirm/undo for remove exercise.
6. Resize move/edit/remove exercise controls to 48px effective targets.
7. Replace plain day load failure with ErrorState and retry/back.
8. Add clear add-exercise route guidance: changes are draft until saved.
9. Distinguish add-exercise failed search/filter load from true empty result.
10. Add 48px stacking for details/guide/custom-video controls.
11. Validate custom video URL format inline.
12. Prefer returning to plan detail after save when route context is known.
13. Add reduced-motion-safe reorder/remove feedback.

Do not change workout database schema, auth behavior, workout session execution, AI import/apply behavior, global theme, or unrelated routes.

Verification: typecheck, lint, build if feasible, mobile 390x844, restored draft, unsaved changes, protected Back/Cancel, save failure, remove undo, 48px controls.
```

---

## Prompt section 6 — Exercise Library correction

```text
/caveman lite

$memory-management $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + exercise-library search-state reviewer + mobile interaction reviewer

Task: Implement audited Exercise Library UX, search-state, and exercise-action corrections.

Primary route:
- /workouts

Related route:
- /workouts/[id]

Related plan-add route to regression-test:
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
- services/database/workout-library.ts
- services/workouts/exercise-library-store.ts
- components/workouts/workout-day-add-exercise.tsx
- components/workouts/workout-plan-builder.tsx

Flow decision:
- Tune flow with search-state and exercise-action hardening.

Product rule:
- Exercise Library is not AI/import-first. It is a reference, discovery, and manual fallback route. It must not become the primary plan-building path for Plaivra's AI-first model.

Required flow:
- Known result state -> comfortable actions -> clear favorite/custom/video outcomes -> reliable detail page.

Required fixes:
1. Add visible result/search status strip with loading, count, empty, failed, and fallback/degraded states.
2. Add inline search failure ErrorState/retry while preserving filters.
3. Add inline filter metadata failure/degraded state.
4. Add pending/failure/rollback state for favorite toggles on library and detail pages.
5. Add inline custom exercise validation, pending, success, and failure state; keep draft on failure.
6. Add inline custom video save/reset success/failure state on detail route.
7. Replace detail route plain loading/failure with skeleton and ErrorState.
8. Resize top actions, result card actions, filter group headers/options, and detail summaries to 48px.
9. Clarify Start as standalone exercise session and distinguish it from add-to-plan flow.
10. Add sticky Apply/Clear footer to mobile filters dialog.
11. Add account-vs-device storage microcopy for favorites/custom exercises.
12. Add custom form close/discard guard if draft has content.
13. Add reduced-motion-safe result/filter update feedback.

Do not:
- Do not change database schema.
- Do not change auth behavior.
- Do not change workout session execution.
- Do not change AI import/apply behavior.
- Do not remove intentional local fallback behavior.
- Do not redesign the library from scratch.
- Do not touch global theme or unrelated routes.

Implementation guidance:
- Preserve the current route model: Search/filter -> result cards -> exercise detail -> custom/favorite/video support.
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
- Verify top actions, result card icons, filter controls, and detail accordions meet 48px target.
- Verify mobile filters dialog has comfortable Apply/Clear behavior.
- Verify Start copy clearly means standalone exercise session.
- Verify add-to-plan flow through `/my-workout/day/[dayId]/add-exercise` still works.
- Verify no schema/auth/session/AI/global-theme/unrelated-route changes.
- Review git diff before final report.
```

---

## Prompt section 7 — Calories AI-first correction

```text
/caveman lite

$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + AI import/review/apply safety reviewer + daily nutrition UX reviewer

Task: Implement audited AI-first calories tracking corrections.

Primary route:
- /calories

Read first:
- docs/ux-progress/routes/calories.md

Required flow:
- ChatGPT meal import/review -> Plaivra overview/tracking -> manual fallback/correction.

Required fixes:
1. Add or surface primary ChatGPT meal import on Today view.
2. Add review/apply/correct stage before saving imported estimates.
3. Reorder Today view into AI-first overview.
4. Keep manual add/search/custom/barcode/recent as fallback.
5. Resize mobile tab selector, date nav, recent food Log, favorite, delete, and water controls to 48px.
6. Add optimistic water add with duplicate protection and rollback.
7. Add pending/feedback for Recent food Log.
8. Add pending/rollback or safe unchanged behavior for food/water delete.
9. Use shared ErrorState and retry.
10. Use motion only for import/review/apply state.

Do not rewrite nutrition calculations, schema, auth, payments, unrelated meal-plan routes, or silently apply AI-estimated data.

Verification: typecheck, lint, build if feasible, mobile 390x844, AI import primary, reviewable estimates, fallback paths, water/recent/delete states.
```

---

## Prompt section 8 — Meal plan AI-first correction

```text
/caveman lite

$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + AI import/review/apply safety reviewer + meal planning data-integrity reviewer

Task: Implement audited AI-first meal plan corrections.

Primary route:
- /my-meal-plan

Read first:
- docs/ux-progress/routes/my-meal-plan.md

Required flow:
- ChatGPT meal-plan import/review -> Plaivra planned overview -> shopping / mark done -> manual fallback/correction.

Required fixes:
1. Add persistent route-level primary CTA: Import/update meal plan with ChatGPT.
2. Add review/apply/correct stage for structured ChatGPT meal-plan results.
3. Reframe empty states so ChatGPT import/update is primary and manual add is fallback.
4. Reorder first screen into meal-plan status/import hero -> review/apply -> today planned meals -> week/shopping/manual tools.
5. Put ChatGPT import/update first in Add source.
6. Fix Done carbs summary detail to use done fat.
7. Resize key date, meal, item, form, and grocery controls to 48px.
8. Add pending/success/failure states for Mark Done.
9. Add duplicate protection for Add to grocery.
10. Add optimistic grocery checked/already-have rollback.
11. Use shared ErrorState where practical.
12. Move Food preferences out of tab row.
13. Reduce per-item ChatGPT density after route-level import exists.
14. Add reduced-motion-safe feedback.

Do not silently apply AI-generated data or change schema/auth/subscriptions/global theme/unrelated routes.

Verification: typecheck, lint, build if feasible, mobile 390x844, import/update primary, reviewable plan data, manual fallback, Mark Done, grocery states, Done carbs fixed.
```

---

## Prompt section 9 — Hydration correction

```text
/caveman lite

$memory-management $agent-coder $agent-reviewer $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + daily logging data-integrity reviewer

Task: Implement audited hydration direct-logging corrections.

Primary route:
- /hydration

Read first:
- docs/ux-progress/routes/hydration.md

Product rule:
- Hydration is direct quick logging. Do not add AI as the main hydration action.

Required fixes:
1. Add initial loading gate/skeleton so hero does not show false 0 L.
2. Add optimistic quick-add with rollback.
3. Add per-action pending and rapid-tap protection.
4. Add optimistic delete with rollback/restored-entry copy.
5. Resize delete, Refresh, and Edit Targets to 48px.
6. Add clearer failure copy.
7. Add calm target-hit state.
8. Make missing-target state actionable.
9. Surface degraded/partial-load state where feasible.
10. Add reduced-motion-safe progress/row feedback.

Do not add primary ChatGPT/import, redesign the route, change schema, or touch unrelated routes.

Verification: typecheck, lint, build if feasible, mobile 390x844, loading gate, optimistic add/delete rollback, duplicate protection, target states.
```

---

## Prompt section 10 — Wellness correction

```text
/caveman lite

$memory-management $agent-coder $agent-reviewer $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + calm wellness UX reviewer + data-state reliability reviewer

Task: Implement audited wellness hub corrections.

Primary route:
- /wellness

Read first:
- docs/ux-progress/routes/wellness.md

Product rule:
- Wellness is a calm hub/check-in route. Do not make ChatGPT primary or automatically change plans.

Required flow:
- Today status -> next wellness action -> compact check-in -> focused launchers -> recent history.

Required fixes:
1. Add wellness status / next action hero.
2. Reorder route to status/next action -> compact check-in -> launcher cards -> recent check-ins.
3. Make DailyCheckins compact/contextual by default.
4. Show most relevant check-in first.
5. Add summary loading/degraded states.
6. Add inline check-in save failure and not-saved state.
7. Resize rating/check-in controls to 48px.
8. Add next-action emphasis.
9. Add calm saved-state transition/collapse.
10. Clarify check-in context does not automatically change plans.

Do not add ChatGPT as primary, redesign route, duplicate subroute functionality, change schema, or touch unrelated routes.

Verification: typecheck, lint, build if feasible, mobile 390x844, compact check-in, loading/degraded states, save failure, 48px controls.
```

---

## Prompt section 11 — Progress correction

```text
/caveman lite

$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + privacy-sensitive progress data reviewer + data-state reliability reviewer

Task: Implement audited progress tracker corrections.

Primary route:
- /progress

Read first:
- docs/ux-progress/routes/progress.md

Product rule:
- Progress is direct sensitive tracking. Do not add AI as primary logging flow.

Required fixes:
1. Add route-level ErrorState/degraded state with retry.
2. Distinguish empty progress from failed load.
3. Show photo-specific degraded state if photos fail.
4. Make overview hero goal/trend/next-action focused.
5. Remove duplicate primary Add progress placements.
6. Add goal weight pending and synced/local fallback status.
7. Resize edit/delete/photo/goal/select/link controls to 48px.
8. Add row-level pending/failure states.
9. Use safer mobile history row interaction.
10. Add privacy copy for photos/hidden setting.
11. Add photo delete pending/failure.
12. Add selected-file and inline upload error feedback.
13. Convert raw text controls into comfortable buttons/links.
14. Add restrained reduced-motion-safe update feedback.

Do not change schema, storage policy, auth, subscriptions, global theme, unrelated settings, or make medical claims.

Verification: typecheck, lint, build if feasible, mobile 390x844, load/failed/empty states, goal/trend hero, edit/delete/photo states, no primary AI logging.
```

---

## Prompt section 12 — Settings hub correction

```text
/caveman lite

$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + settings trust/safety reviewer + data-state reliability reviewer

Task: Implement audited settings hub corrections.

Primary route:
- /settings

Read first:
- docs/ux-progress/routes/settings.md

Required flow:
- Profile/setup confidence -> grouped sensitive controls -> comfortable navigation -> visible recovery states.

Required fixes:
1. Add setup status loading skeleton/placeholder.
2. Add inline degraded/error state with retry if setup status fails.
3. Track partial setup confidence.
4. Group cards into Trust & data, Preferences, and Account.
5. Resize setup/back/account actions to 48px.
6. Replace account request browser confirm with app confirmation/status pattern.
7. Add status badges/details for AI imports, data privacy, and coaching context where reliable.
8. Add microcopy clarifying AI/privacy/coaching roles.
9. Add reduced-motion-safe setup expand/collapse.

Do not add AI/import workflow to /settings itself, change schema/auth/AI permission/privacy API semantics, or fix subroutes in this prompt.

Verification: typecheck, lint, build if feasible, mobile 390x844, profile normal/private, setup states, grouped cards, 48px controls.
```

---

## Prompt section 13 — AI imports correction

```text
/caveman lite

$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + AI permission safety reviewer + connection-state reliability reviewer

Task: Implement audited AI imports permission/connection corrections.

Primary route:
- /settings/ai-imports

Related route:
- /settings/ai-imports/chatgpt-setup

Read first:
- docs/ux-progress/routes/settings-ai-imports.md

Required flow:
- Known connection state -> known permission state -> safe permission changes -> safe setup/revoke -> auditable activity.

Required fixes:
1. Add AI connection/permission status hero.
2. Add permission load error with retry.
3. Treat failed permission load as unknown, not default.
4. Add inline permission save failure.
5. Confirm before saving full access.
6. Add connection loading/error/unknown state.
7. Replace revoke browser confirm with app confirmation/status pattern.
8. Add revoke failure/success state.
9. Resize permission/revoke/reconnect/back controls to 48px.
10. Show recent ChatGPT activity or clear link.
11. Make reconnect-after-permission-change copy prominent.
12. Add copy-to-clipboard failure handling.
13. Reduce custom permission density on mobile.

Do not change OAuth semantics, MCP API behavior, permission scope names, schema, auth, global theme, unrelated routes, broaden permissions silently, or allow ChatGPT changes without approval.

Verification: typecheck, lint, build if feasible, mobile 390x844, confidence hero, failed-load safety, full-access confirmation, revoke app confirm, visible activity.
```

---

## Prompt section 14 — Data privacy correction

```text
/caveman lite

$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + privacy UX reviewer + settings data-state reliability reviewer

Task: Implement audited data privacy corrections.

Primary route:
- /settings/data-privacy

Read first:
- docs/ux-progress/routes/settings-data-privacy.md

Required flow:
- Clear privacy meaning -> reliable toggle saves -> explicit export status -> confirmed reset settings.

Required fixes:
1. Surface settings load/save error inline using existing saveError.
2. Add pending/saved/failed state for privacy toggles.
3. Add descriptions to privacy toggles.
4. Add hide-vs-delete explanation.
5. Add inline export success/failure/retry state.
6. Add export scope summary and local-file warning.
7. Require app confirmation before reset settings.
8. Add reset status clarifying no logs/plans/account data changed.
9. Replace plain loading text with skeleton/degraded state.
10. Stack export/reset rows on mobile.
11. Ensure legal/contact/export/reset/back controls are 48px.
12. Add account settings link under rights/help if appropriate.

Do not change export API semantics, export table selection/CSV shape, auth, schema, account behavior, global theme, unrelated routes, or imply toggles remove database data.

Verification: typecheck, lint, build if feasible, mobile 390x844, hide-vs-delete copy, toggle states, export states, reset confirmation, mobile stacking.
```

---

## Prompt section 15 — Preferences correction

```text
/caveman lite

$memory-management $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + settings-state reliability reviewer + accessibility UX reviewer

Task: Implement audited preferences UX, settings-state, and accessibility corrections.

Primary route:
- /settings/preferences

Read first:
- docs/ux-progress/routes/settings-preferences.md

Required flow:
- Loaded preferences -> comfortable controls -> clear pending/save/failure -> reduced-motion-safe UI.

Required fixes:
1. Surface settings load/save error inline using provider saveError.
2. Add pending/saved/failed state for preference updates.
3. Prevent confusing rapid repeated changes while saving.
4. Resize native selects to 48px height.
5. Stack select rows on narrow mobile.
6. Remove or gate decorative theme-card hover translation.
7. Make reduceAnimations visibly respected by this route.
8. Replace plain loading text with skeleton/degraded state.
9. Add helper copy for Quick Log shortcuts.
10. Add clearer save/sync copy near changed controls.
11. Resize icon/back controls to 48px where relevant.

Do not change schema, auth, settings semantics, theme definitions unless required for UI correction, global theme architecture, unrelated routes, or add AI/import behavior.

Verification: typecheck, lint, build if feasible, mobile 390x844, inline errors, rollback copy, 48px selects, stacked rows, reduced-motion-safe theme picker.
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
