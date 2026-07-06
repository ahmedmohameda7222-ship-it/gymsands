# Plaivra Codex UX Correction Prompt

**Version:** 2026.1  
**Status:** Active prompt builder

This file stores the Codex CLI correction prompts assembled from completed Plaivra UX audits.

Codex must read these first:

- `CHATGPT_CODEX_PROMPT_RULES.md`
- `Ruflo_usage.md`
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

General rule: implement workflow corrections before button polish. If a flow is weak, correct the flow first, then refine buttons, states, and motion.

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
- docs/ux-constitution/README.md
- docs/ux-constitution/flow-and-workflow-audit.md
- docs/ux-constitution/motion-and-interaction.md
- docs/ux-progress/README.md

Primary route:
- /dashboard

Inspect first:
- app/(private)/dashboard/page.tsx
- components/dashboard/dashboard-sections.tsx
- components/dashboard/metric-card.tsx
- components/ui/button.tsx
- components/motion/index.tsx
- lib/motion.ts

Required fixes:
1. Add one clear Next Best Action experience.
2. Demote duplicated or competing CTAs.
3. Add optimistic UI and pending protection for water quick add.
4. Add optimistic UI and pending protection for meal Done.
5. Make Done dominant and Skip secondary in meal rows.
6. Restyle meal type selector into a calmer segmented/horizontal selector.
7. Use motion only for feedback/state clarity.

Do not touch unrelated routes, env files, schema, migrations, auth, API routes, MCP routes, settings, subscriptions, or global theme.

Verification:
- Run typecheck, lint, and build if feasible.
- Test /dashboard at 390x844.
- Verify optimistic success, duplicate protection, and rollback for water and meal Done.
- Review git diff before final report.

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
- docs/ux-constitution/README.md
- docs/ux-constitution/flow-and-workflow-audit.md
- docs/ux-constitution/motion-and-interaction.md
- docs/ux-progress/README.md

Primary route:
- /onboarding?edit=true

Inspect first:
- app/(private)/onboarding/page.tsx
- services/database/profile.ts
- services/database/ai-permissions.ts
- components/ui/button.tsx
- components/ui/progress.tsx
- components/motion/index.tsx
- lib/motion.ts

Required fixes:
1. Show Target weight only for weight/body-composition goals or when a saved target weight exists.
2. Add edit-mode saved-answer loading gate.
3. Add subtle reduced-motion-safe step transitions.
4. Resize relevant controls to 48px effective tap targets.
5. Improve AI permission trust framing and review summary.
6. Make mobile step navigation calmer.

Do not change database schema, auth behavior, or unrelated routes.

Verification:
- Run typecheck, lint, and build if feasible.
- Test /onboarding?edit=true at 390x844.
- Test non-weight goals and weight-related goals.
- Test saved target weight case.
- Verify onboarding/profile/AI permissions still save correctly.
- Review git diff before final report.

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

Inspect first:
- app/(private)/my-workout/plans/page.tsx
- components/workouts/my-workout-plans.tsx
- components/workouts/workout-calendar.tsx
- components/shared/chatgpt-import-card.tsx
- components/ui/disclosure.tsx
- components/ui/button.tsx
- components/motion/index.tsx
- lib/motion.ts

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

Verification:
- Run typecheck, lint, and build if feasible.
- Test /my-workout/plans at 390x844.
- Test no-plan state.
- Test active plan with today workout.
- Test active plan with rest day/no today workout.
- Test More actions, delete confirmation, archive, duplicate, rename, and set default.
- Test ChatGPT import visibility and access prompt.
- Review git diff before final report.

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
- docs/ux-constitution/README.md
- docs/ux-constitution/flow-and-workflow-audit.md
- docs/ux-constitution/motion-and-interaction.md
- docs/ux-progress/README.md
- docs/ux-progress/routes/workout-session-day.md

Primary route:
- /workouts/session/day/[dayId]

Flow decision:
- Tune flow with one P0 bug fix.

Inspect first:
- app/(private)/workouts/session/day/[dayId]/page.tsx
- components/workouts/workout-session-screen.tsx
- components/workouts/workout-day-focus-session.tsx
- components/layout/mobile-sticky-actions.tsx
- components/ui/button.tsx
- components/motion/index.tsx
- lib/motion.ts
- lib/workout-persistence.ts
- lib/active-workout.ts
- services/database/workout-sessions.ts

Required fixes:
1. Restore or replace the in-session mobile sticky CTA so Finish Set / Rest / Finish Workout is reachable on mobile.
2. Add rollback for failed optimistic finishSet persistence, including completed state, active set/exercise, and rest timer where needed.
3. Add rollback for failed restartSet persistence.
4. Add clearer starting/resuming session pending state while logs/history hydrate.
5. Resize close/back/more/exercise chip/set path/advanced sheet controls to 48px effective tap targets.
6. Simplify exit behavior and guard unsaved local changes before leaving.
7. Add clear failure feedback when a set save fails.
8. Add only useful state/rest/finish motion; no decorative animation.

Do not redesign the whole workout session, change workout schema, change unrelated workout plan pages, auth, payments, or unrelated routes.

Verification:
- Run typecheck, lint, and build if feasible.
- Test /workouts/session/day/[dayId] at 390x844.
- Verify Finish Set is reachable without scrolling on mobile.
- Verify rest-mode bottom action shows timer, +30s, and Skip/Stop clearly.
- Verify all-sets-complete state shows Finish Workout as dominant action.
- Simulate failed set save and confirm rollback + retry path.
- Simulate failed Reopen set and confirm rollback.
- Verify close/back behavior protects unsaved local changes.
- Verify advanced actions remain in a sheet and do not clutter the main set screen.
- Review git diff before final report.

Final report: changed files, changes, tests, risks, unverified items, memory_store usage, next step.
```

---

## Future route correction template

For every audited route, append:

- route
- audit score
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
