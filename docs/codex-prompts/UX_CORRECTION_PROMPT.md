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
| `/settings/account` | 59 | `docs/ux-progress/routes/account-settings.md` |
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

For personal user data, permissions, health data, nutrition data, reports, account actions, or AI apply flows, include the project security review skill listed in `Ruflo_usage.md`.

---

## Current focused prompt — Account Settings correction

```text
/caveman lite
$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + account/privacy safety reviewer + sensitive-action confirmation reviewer

Task: Implement audited Account Settings UX corrections.

Primary route:
- /settings/account

Read first:
- docs/ux-progress/routes/account-settings.md
- app/(private)/settings/account/page.tsx
- components/settings/settings-page-shell.tsx
- components/settings/settings-section-card.tsx
- components/auth/auth-provider.tsx
- app/api/user/privacy-requests/route.ts

Product role:
- Account Settings is a trust/control route.
- Do not add AI/import behavior.
- Deletion is a request flow, not immediate account deletion.

Required flow:
- Account identity -> sign-out state -> deletion status -> app confirmation -> inline success/failure -> 48px controls.

Required fixes:
1. Show signed-in account identity on the route.
2. Add sign-out pending, disabled, and failure state.
3. Replace window.confirm deletion confirmation with app confirmation UI.
4. Load existing privacy request status from /api/user/privacy-requests.
5. Show pending/in-progress/completed deletion request state inline.
6. Wrap deletion POST in try/catch/finally so the button cannot remain stuck.
7. Add inline deletion request success/failure status, not toast-only.
8. Resize Back, Sign out, Request deletion, and related controls to 48px targets.
9. Surface ChatGPT access revocation status/copy when deletion is requested.
10. Add retry for privacy request status load.
11. Improve destructive copy with review/timeline/verification language.

Do not:
- Do not change database schema.
- Do not change auth semantics.
- Do not change AI import/apply behavior.
- Do not change global theme.
- Do not imply immediate account deletion.
- Do not expose service-role or admin-only behavior to the browser.

Verification:
- Run typecheck, lint, and build if feasible.
- Test /settings/account at 390x844.
- Verify signed-in account identity appears.
- Verify sign-out pending/failure behavior.
- Verify deletion request uses app confirmation, not window.confirm.
- Verify existing pending deletion request appears before submit.
- Verify deletion POST cannot leave the button stuck.
- Verify deletion status appears inline.
- Verify ChatGPT revocation copy/status appears when relevant.
- Verify Back, Sign out, Request deletion, and key row controls are 48px.
- Verify /settings, /settings/data-privacy, and /settings/ai-imports still work after shared settings control changes.
- Review git diff before final report.
```
