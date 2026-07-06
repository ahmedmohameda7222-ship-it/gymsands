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

## Current focused prompt — Personal Records correction

```text
/caveman lite
$memory-management $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + milestone data reviewer + shared-component regression reviewer

Task: Implement audited Personal Records UX corrections.

Primary route:
- /personal-records

Read first:
- docs/ux-progress/routes/personal-records.md
- app/(private)/personal-records/page.tsx
- components/lifestyle/personal-records-insights.tsx
- components/lifestyle/wellness-trackers.tsx
- services/database/progress.ts

Product role:
- Personal Records is a milestone tracker and correction surface.
- Do not make it a workout logging route.
- Do not make AI review primary.

Required flow:
- Load confidence -> consistent records state -> safe save/edit/remove -> 48px controls -> clear PR feedback.

Required fixes:
1. Add loading skeleton/status for insights and tracker.
2. Add inline retry state for record load failure; failed load must not look empty.
3. Keep insights and tracker consistent after save/remove, or share one records state.
4. Add save pending, duplicate protection, inline failure, and saved state for Save/Update Record.
5. Add visible edit mode banner plus Cancel/Discard action.
6. Add confirmation or undo for removing a record, with pending/failure recovery.
7. Resize inputs/selects and edit/remove actions to 48px targets.
8. Validate that a record has a meaningful value: weight, reps, or notes depending on record type.
9. Add richer empty state with links to add first record, Today Workout, and Workout History.
10. Add source label for manual vs auto-detected records where feasible.
11. Normalize display labels for 1RM / Estimated 1RM and Best set / Best volume.
12. Add subtle recent/new PR highlight after save/update.

Do not:
- Do not change database schema.
- Do not change sign-in or account behavior.
- Do not change AI import/apply behavior.
- Do not change global theme.
- Do not regress other trackers in components/lifestyle/wellness-trackers.tsx.

Verification:
- Run typecheck, lint, and build if feasible.
- Test /personal-records at 390x844.
- Verify failed load has retry and does not look empty.
- Verify insights and tracker stay consistent after save/remove.
- Verify failed save keeps draft.
- Verify edit mode and Cancel/Discard work.
- Verify record removal confirmation/undo and recovery.
- Verify 48px inputs/selects/edit/remove actions.
- Verify Weekly Reports still reads PRs correctly.
- Review git diff before final report.
```
