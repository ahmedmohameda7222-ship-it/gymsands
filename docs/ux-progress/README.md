# Plaivra UX Progress Tracker

**Version:** 2026.1  
**Status:** Current route audit queue complete

Source documents:

- `docs/product/ai-first-tracker-model.md`
- `docs/ux-constitution/README.md`
- `docs/ux-constitution/flow-and-workflow-audit.md`
- `docs/ux-constitution/motion-and-interaction.md`

---

## Scoring model

| Score | Meaning |
|---:|---|
| 90-100 | Release-grade. |
| 80-89 | Good; targeted fixes remain. |
| 70-79 | Usable; refinement needed. |
| 50-69 | Functional but not subscription-ready. |
| Below 50 | Major route issue. |

---

## Current status

Dashboard, onboarding, workout plans, workout session, workout day editor, exercise library, workout history, global app shell/navigation, food hub, weekly reports, personal records, habits, sleep & recovery, supplements, daily fit tasks, account settings, public landing/auth, calories, meal plan, hydration, wellness, progress, settings, AI imports, data privacy, and preferences have been audited.

| Area | Status | Score | Full audit |
|---|---|---:|---|
| Dashboard | Audited | 72 | — |
| Onboarding | Audited | 66 | — |
| Workout plans | Audited | 63 | `docs/ux-progress/routes/my-workout-plans.md` |
| Workout session | Audited | 58 | `docs/ux-progress/routes/workout-session-day.md` |
| Workout day editor | Audited | 59 | `docs/ux-progress/routes/workout-day-editor.md` |
| Exercise library | Audited | 58 | `docs/ux-progress/routes/exercise-library.md` |
| Workout history | Audited | 60 | `docs/ux-progress/routes/workout-history.md` |
| Global app shell / navigation | Audited | 63 | `docs/ux-progress/routes/global-app-shell.md` |
| Food Hub / custom foods and meals | Audited | 55 | `docs/ux-progress/routes/food-hub.md` |
| Weekly overview / reports | Audited | 57 | `docs/ux-progress/routes/weekly-overview-reports.md` |
| Personal records | Audited | 56 | `docs/ux-progress/routes/personal-records.md` |
| Habits | Audited | 58 | `docs/ux-progress/routes/habits.md` |
| Sleep & recovery | Audited | 57 | `docs/ux-progress/routes/sleep-recovery.md` |
| Supplements | Audited | 56 | `docs/ux-progress/routes/supplements.md` |
| Daily fit tasks | Audited | 61 | `docs/ux-progress/routes/daily-fit-tasks.md` |
| Account settings | Audited | 59 | `docs/ux-progress/routes/account-settings.md` |
| Public landing/auth | Audited | 55 | `docs/ux-progress/routes/public-landing-auth.md` |
| Calories / food log | Audited | 54 | `docs/ux-progress/routes/calories.md` |
| Meal plan | Audited | 57 | `docs/ux-progress/routes/my-meal-plan.md` |
| Hydration | Audited | 68 | `docs/ux-progress/routes/hydration.md` |
| Wellness hub | Audited | 60 | `docs/ux-progress/routes/wellness.md` |
| Progress | Audited | 62 | `docs/ux-progress/routes/progress.md` |
| Settings hub | Audited | 64 | `docs/ux-progress/routes/settings.md` |
| AI imports / permissions | Audited | 66 | `docs/ux-progress/routes/settings-ai-imports.md` |
| Data privacy | Audited | 61 | `docs/ux-progress/routes/settings-data-privacy.md` |
| Preferences | Audited | 62 | `docs/ux-progress/routes/settings-preferences.md` |

---

## Recommended correction order

1. `/calories` — AI-first reframing, primary nutrition positioning
2. `/my-meal-plan` — AI-first meal-plan import/review flow
3. Public landing/auth — AI-first positioning and auth trust states
4. `/dashboard` — next-best action and repeated-action reliability
5. `/onboarding?edit=true` — edit-mode reliability and AI permission framing
6. `/my-workout/plans` — Today-first plan management
7. `/workouts/session/day/[dayId]` — session CTA and persistence rollback
8. Global app shell / navigation — route validity, bottom stack, reduced motion
9. `/settings/ai-imports` — permission and connection trust state
10. `/settings/data-privacy` and `/settings/account` — privacy/account sensitive-action status
11. Remaining direct trackers by daily-use frequency: hydration, habits, sleep, supplements, daily fit tasks, progress, PRs, history, reports, food hub, exercise library

---

## Audit note

The original route audit queue is complete. New audits should be opened only when new routes/features are added or when correction work materially changes the user flow.
