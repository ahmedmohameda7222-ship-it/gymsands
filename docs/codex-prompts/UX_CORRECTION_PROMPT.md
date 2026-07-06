# Plaivra Codex UX Correction Prompt

**Version:** 2026.1  
**Status:** Active compact prompt registry

Read first:

- `CHATGPT_CODEX_PROMPT_RULES.md`
- `Ruflo_usage.md`
- `docs/product/ai-first-tracker-model.md`
- `docs/ux-constitution/README.md`
- `docs/ux-constitution/flow-and-workflow-audit.md`
- `docs/ux-constitution/motion-and-interaction.md`
- `docs/ux-progress/README.md`
- `docs/platform-roadmap/README.md`

Product rule: Plaivra is AI-first where appropriate, but not every route is ChatGPT-first. Manual entry remains fallback, correction, or advanced control where the route role calls for it.

---

## Audited route registry

| Route / area | Score | Full audit |
|---|---:|---|
| `/dashboard` | 72 | tracker notes |
| `/onboarding?edit=true` | 66 | tracker notes |
| `/my-workout/plans` | 63 | `docs/ux-progress/routes/my-workout-plans.md` |
| `/workouts/session/day/[dayId]` | 58 | `docs/ux-progress/routes/workout-session-day.md` |
| `/my-workout/day/[dayId]` | 59 | `docs/ux-progress/routes/workout-day-editor.md` |
| `/workouts` | 58 | `docs/ux-progress/routes/exercise-library.md` |
| `/workout-history` | 60 | `docs/ux-progress/routes/workout-history.md` |
| Global app shell / navigation | 63 | `docs/ux-progress/routes/global-app-shell.md` |
| `/calories/food-hub` | 55 | `docs/ux-progress/routes/food-hub.md` |
| `/calories/weekly-overview` | 57 | `docs/ux-progress/routes/weekly-overview-reports.md` |
| `/personal-records` | 56 | `docs/ux-progress/routes/personal-records.md` |
| `/habits` | 58 | `docs/ux-progress/routes/habits.md` |
| `/sleep-recovery` | 57 | `docs/ux-progress/routes/sleep-recovery.md` |
| `/supplements` | 56 | `docs/ux-progress/routes/supplements.md` |
| `/daily-fit-tasks` | 61 | `docs/ux-progress/routes/daily-fit-tasks.md` |
| `/calories` | 54 | `docs/ux-progress/routes/calories.md` |
| `/my-meal-plan` | 57 | `docs/ux-progress/routes/my-meal-plan.md` |
| `/hydration` | 68 | `docs/ux-progress/routes/hydration.md` |
| `/wellness` | 60 | `docs/ux-progress/routes/wellness.md` |
| `/progress` | 62 | `docs/ux-progress/routes/progress.md` |
| `/settings` | 64 | `docs/ux-progress/routes/settings.md` |
| `/settings/ai-imports` | 66 | `docs/ux-progress/routes/settings-ai-imports.md` |
| `/settings/data-privacy` | 61 | `docs/ux-progress/routes/settings-data-privacy.md` |
| `/settings/preferences` | 62 | `docs/ux-progress/routes/settings-preferences.md` |

---

## Standard correction setup

```text
/caveman lite
$memory-management $agent-reviewer $agent-coder $agent-tester
Mode: high plus advisor
Advisor: strict senior mobile product engineer + premium UX reviewer
```

For personal user data, permissions, health data, nutrition data, reports, or AI apply flows, include the project security review skill listed in `Ruflo_usage.md`.

---

## Current focused prompt — Daily Fit Tasks correction

```text
/caveman lite
$memory-management $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + repeated-action reliability reviewer + duplicate-route/component reviewer

Task: Implement audited Daily Fit Tasks UX corrections.

Primary route:
- /daily-fit-tasks

Read first:
- docs/ux-progress/routes/daily-fit-tasks.md
- app/(private)/daily-fit-tasks/page.tsx
- components/lifestyle/daily-fit-tasks-page-client.tsx
- components/lifestyle/wellness-trackers.tsx
- services/database/wellness.ts

Product role:
- Daily Fit Tasks is a lightweight direct checklist.
- Do not make ChatGPT primary.
- Do not turn it into a complex planner.

Required flow:
- Skeleton/ErrorState -> optimistic complete/reopen -> safe save/edit/remove -> duplicate prevention -> 48px controls.

Required fixes:
1. Replace plain loading text with skeleton/status.
2. Add optimistic Mark done/Reopen with rollback and per-row pending.
3. Add inline save failure and saved state while preserving draft.
4. Add visible edit mode banner plus Cancel/Discard.
5. Add remove confirmation or undo with failure recovery.
6. Resize starter chips, Retry, task actions, and inputs to 48px targets.
7. Prevent duplicate starter task creation for the same day.
8. Respect reduced-motion for progress and completion feedback.
9. Consider making tasks/status more prominent than the add form once tasks exist.
10. Decide whether to deprecate or sync shared DailyFitTasksTracker to avoid route/component divergence.

Do not:
- Do not change database schema.
- Do not change sign-in or account behavior.
- Do not change AI import/apply behavior.
- Do not change global theme.
- Do not regress other wellness tracker routes.

Verification:
- Run typecheck, lint, and build if feasible.
- Test /daily-fit-tasks at 390x844.
- Verify failed load has retry and does not look empty.
- Verify Mark done/Reopen updates immediately and rolls back on failure.
- Verify row pending prevents repeated taps.
- Verify failed save keeps draft and shows inline error.
- Verify edit mode and Cancel/Discard work.
- Verify remove confirmation/undo and recovery.
- Verify starter chips cannot create duplicate same-day tasks.
- Verify 48px starter chips, Retry, inputs, Mark done, Edit, and Remove controls.
- Review git diff before final report.
```
