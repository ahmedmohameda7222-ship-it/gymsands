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

## Current focused prompt — Supplements correction

```text
/caveman lite
$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + health-adjacent logging reviewer + shared-component regression reviewer

Task: Implement audited Supplements UX corrections.

Primary route:
- /supplements

Read first:
- docs/ux-progress/routes/supplements.md
- app/(private)/supplements/page.tsx
- components/lifestyle/wellness-trackers.tsx
- services/database/wellness.ts
- services/wellness/wellness-data.ts

Product role:
- Supplements is a direct checklist and adherence tracker.
- Do not make ChatGPT primary.
- Do not add dosage, medical, or supplement recommendation advice.

Required flow:
- Load confidence -> optimistic taken state -> safe save/edit/remove -> reminder clarity -> 48px controls.

Required fixes:
1. Add loading skeleton/status for today's supplements and adherence history.
2. Add inline retry state; failed load must not look empty.
3. Add optimistic taken/reopen with rollback and per-row pending.
4. Add save pending, duplicate protection, inline failure, and saved state.
5. Add visible edit mode banner plus Cancel/Discard.
6. Add confirmation or undo for removing a supplement, with failure recovery.
7. Resize ActionCard controls, inputs, and menu actions to 48px targets.
8. Clarify reminder note/time is not automatically a push notification.
9. Add non-medical logging-only copy.
10. Add duplicate-name handling for same-day supplement entries.
11. Add degraded state when adherence history fails but today's supplements load.
12. Respect reduced-motion for progress bar and taken feedback.

Do not:
- Do not change database schema.
- Do not change sign-in or account behavior.
- Do not change AI import/apply behavior.
- Do not change global theme.
- Do not regress other trackers in components/lifestyle/wellness-trackers.tsx.
- Do not add dosage or medical advice.

Verification:
- Run typecheck, lint, and build if feasible.
- Test /supplements at 390x844.
- Verify failed today load has retry and does not look empty.
- Verify failed adherence history shows degraded state.
- Verify Mark done/Reopen updates immediately and rolls back on failure.
- Verify failed save keeps draft.
- Verify edit mode and Cancel/Discard work.
- Verify remove confirmation/undo and recovery.
- Verify reminder copy clarifies note/time vs real notification.
- Verify inputs, Mark done, More, Edit, Remove, and Save controls are 48px.
- Review git diff before final report.
```
