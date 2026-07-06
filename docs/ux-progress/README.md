# Plaivra UX Progress Tracker

**Version:** 2026.1  
**Status:** Active tracker

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

Dashboard, onboarding, workout plans, workout session, workout day editor, exercise library, workout history, global app shell/navigation, food hub, weekly reports, personal records, calories, meal plan, hydration, wellness, progress, settings, AI imports, data privacy, and preferences have been audited.

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
| Calories / food log | Audited | 54 | `docs/ux-progress/routes/calories.md` |
| Meal plan | Audited | 57 | `docs/ux-progress/routes/my-meal-plan.md` |
| Hydration | Audited | 68 | `docs/ux-progress/routes/hydration.md` |
| Wellness hub | Audited | 60 | `docs/ux-progress/routes/wellness.md` |
| Progress | Audited | 62 | `docs/ux-progress/routes/progress.md` |
| Settings hub | Audited | 64 | `docs/ux-progress/routes/settings.md` |
| AI imports / permissions | Audited | 66 | `docs/ux-progress/routes/settings-ai-imports.md` |
| Data privacy | Audited | 61 | `docs/ux-progress/routes/settings-data-privacy.md` |
| Preferences | Audited | 62 | `docs/ux-progress/routes/settings-preferences.md` |
| Habits | Not audited | — | — |
| Sleep & recovery | Not audited | — | — |
| Supplements | Not audited | — | — |
| Daily fit tasks | Not audited | — | — |
| Account settings | Not audited | — | — |
| Public landing/auth | Not audited | — | — |

---

## Recommended audit order

1. `/dashboard` — audited, fixes open
2. `/onboarding?edit=true` — audited, fixes open
3. `/my-workout/plans` — audited, fixes open
4. `/workouts/session/day/[dayId]` — audited, fixes open
5. `/my-workout/day/[dayId]` — audited, fixes open
6. `/workouts` — audited, fixes open
7. `/workout-history` — audited, fixes open
8. Global app shell / navigation — audited, fixes open
9. `/calories/food-hub` — audited, fixes open
10. `/calories/weekly-overview` — audited, fixes open
11. `/personal-records` — audited, fixes open
12. `/calories` — audited, fixes open
13. `/my-meal-plan` — audited, fixes open
14. `/hydration` — audited, fixes open
15. `/wellness` — audited, fixes open
16. `/progress` — audited, fixes open
17. `/settings` — audited, fixes open
18. `/settings/ai-imports` — audited, fixes open
19. `/settings/data-privacy` — audited, fixes open
20. `/settings/preferences` — audited, fixes open
21. Habits
22. Sleep & recovery
23. Supplements
24. Daily fit tasks
25. Account settings
26. Public landing/auth
