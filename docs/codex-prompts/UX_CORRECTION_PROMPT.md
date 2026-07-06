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

## Current focused prompt — Sleep & Recovery correction

```text
/caveman lite
$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + sensitive recovery-data reviewer + shared-component regression reviewer

Task: Implement audited Sleep & Recovery UX corrections.

Primary route:
- /sleep-recovery

Read first:
- docs/ux-progress/routes/sleep-recovery.md
- app/(private)/sleep-recovery/page.tsx
- components/lifestyle/wellness-trackers.tsx
- services/wellness/wellness-data.ts
- services/database/wellness.ts

Product role:
- Sleep & Recovery is a calm direct recovery check-in route.
- Do not make ChatGPT primary.
- Do not make medical claims.

Required flow:
- Load confidence -> validated save/edit -> protected remove -> cautious readiness copy -> 48px controls.

Required fixes:
1. Add loading skeleton/status for recovery logs.
2. Add inline retry state; failed load must not look empty.
3. Add save pending, duplicate protection, inline failure, and quiet saved state.
4. Preserve draft on failed save.
5. Add visible edit mode banner plus Cancel/Discard.
6. Preserve edited record date or clearly restrict edit behavior.
7. Add confirmation or undo for removing a recovery log, with failure recovery.
8. Add validation for hours slept and rating ranges.
9. Resize inputs/selects and menu actions to 48px targets.
10. Add empty recovery log state.
11. Strengthen non-medical readiness/source copy.
12. Improve log title when hours are missing.

Do not:
- Do not change database schema.
- Do not change sign-in or account behavior.
- Do not change AI import/apply behavior.
- Do not change global theme.
- Do not regress other trackers in components/lifestyle/wellness-trackers.tsx.
- Do not add alarmist or medical language.

Verification:
- Run typecheck, lint, and build if feasible.
- Test /sleep-recovery at 390x844.
- Verify failed load has retry and does not look empty.
- Verify save pending/saved/failed states.
- Verify failed save keeps draft.
- Verify hours slept and rating validation.
- Verify edit mode and Cancel/Discard work.
- Verify editing an older log does not silently change its date.
- Verify remove confirmation/undo and recovery.
- Verify 48px inputs/selects/menu actions.
- Verify readiness copy is non-medical and based on saved data only.
- Verify Weekly Reports still reads sleep average correctly.
- Review git diff before final report.
```
