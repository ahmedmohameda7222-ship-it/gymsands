# Plaivra UX Progress Tracker

**Version:** 2026.1  
**Status:** Active tracker  
**Source of truth:**

- `docs/product/ai-first-tracker-model.md`
- `docs/ux-constitution/README.md`
- `docs/ux-constitution/flow-and-workflow-audit.md`
- `docs/ux-constitution/motion-and-interaction.md`

This file tracks route-level UX quality against Plaivra's AI-first product model, mobile-first interaction standard, loading/error-state expectations, tap comfort, motion quality, trust, and release readiness.

---

## 1. Scoring model

| Category | Weight |
|---|---:|
| Route purpose and action hierarchy | 15 |
| Button size, placement, and hierarchy | 15 |
| Spacing consistency and visual rhythm | 10 |
| Feedback, optimistic UI, loading, and errors | 15 |
| Motion and interaction quality | 15 |
| Mobile-first behavior and tap comfort | 10 |
| AI safety, privacy, and high-risk action control | 10 |
| Premium/subscription readiness | 10 |
| **Total** | **100** |

| Score | Meaning |
|---:|---|
| 90-100 | Release-grade. Only minor polish allowed. |
| 80-89 | Good but not premium enough yet. Needs targeted fixes. |
| 70-79 | Usable but visibly inconsistent. Needs UI/UX and motion refinement. |
| 50-69 | Functional but not subscription-ready or not product-aligned. |
| Below 50 | Failing route experience. Must be redesigned or simplified. |

---

## 2. Global progress summary

Current global status: **Dashboard, onboarding, workout plans, workout session, workout day editor, exercise library, calories, meal plan, hydration, wellness, progress, settings, AI imports, data privacy, and preferences audited.**

| Area | Status | Score | Notes |
|---|---|---:|---|
| Dashboard | Audited | 72 | Full audit tracked in this file and prompt backlog. |
| Onboarding | Audited | 66 | Full audit tracked in this file and prompt backlog. |
| Workout plans | Audited | 63 | Full audit: `docs/ux-progress/routes/my-workout-plans.md`. |
| Workout session | Audited | 58 | Full audit: `docs/ux-progress/routes/workout-session-day.md`. |
| Workout day editor | Audited | 59 | Full audit: `docs/ux-progress/routes/workout-day-editor.md`. |
| Exercise library | Audited | 58 | Needs verified Start route/action, visible search/filter/detail states, favorite/custom rollback, and 48px mobile controls. Full audit: `docs/ux-progress/routes/exercise-library.md`. |
| Calories / food log | Audited | 54 | Full audit: `docs/ux-progress/routes/calories.md`. |
| Meal plan | Audited | 57 | Full audit: `docs/ux-progress/routes/my-meal-plan.md`. |
| Hydration | Audited | 68 | Full audit: `docs/ux-progress/routes/hydration.md`. |
| Wellness hub | Audited | 60 | Full audit: `docs/ux-progress/routes/wellness.md`. |
| Progress | Audited | 62 | Full audit: `docs/ux-progress/routes/progress.md`. |
| Settings hub | Audited | 64 | Full audit: `docs/ux-progress/routes/settings.md`. |
| AI imports / permissions | Audited | 66 | Full audit: `docs/ux-progress/routes/settings-ai-imports.md`. |
| Data privacy | Audited | 61 | Full audit: `docs/ux-progress/routes/settings-data-privacy.md`. |
| Preferences | Audited | 62 | Full audit: `docs/ux-progress/routes/settings-preferences.md`. |
| Global app shell / navigation | Not audited | — | Needs mobile nav, safe area, route transitions, active states, and offline/sync banner review. |
| Workout history | Not audited | — | Needs empty/history/detail actions, list transitions, loading states, and recovery audit. |
| Food Hub / custom foods and meals | Not audited | — | Audit as manual fallback/edit path, not as the main product entry path. |
| Weekly overview / reports | Not audited | — | Needs report navigation, filters, chart/data motion, loading, empty-state, and reduced-motion audit. |
| Personal records | Not audited | — | Needs tracker, insight actions, PR update highlight, achievement feedback, and empty-state audit. |
| Habits | Not audited | — | Needs repeated toggle/check behavior, streak feedback, optimistic updates, reduced motion, and error recovery audit. |
| Sleep & recovery | Not audited | — | Needs form/action/feedback audit with quiet low-stimulation motion and clear save states. |
| Supplements | Not audited | — | Needs dose/taken/reminder actions, checklist feedback, optimistic behavior, and failure recovery audit. |
| Daily fit tasks | Not audited | — | Needs add/edit/complete actions, task-complete transitions, optimistic behavior, and empty-state audit. |
| Account settings | Not audited | — | Needs sign-out/account action separation, confirmation states, and serious low-motion behavior audit. |
| Public landing/auth | Not audited | — | Needs premium first impression, auth CTA, subtle entrance motion, loading/error auth states, and trust audit. |

---

## 3. Completed route audits

| Route | Status | Score | Flow decision | Full audit | Main correction |
|---|---|---:|---|---|---|
| `/dashboard` | Audited | 72 | Tune flow | — | One dominant next best action, imported/active state clarity, and optimistic repeated actions. |
| `/onboarding?edit=true` | Audited | 66 | Tune flow | — | Target-weight relevance, loading gate, step motion, validation, and AI permission framing. |
| `/my-workout/plans` | Audited | 63 | Reorder flow | `docs/ux-progress/routes/my-workout-plans.md` | `Today hero -> weekly calendar -> saved plan library -> add/import plan`. |
| `/workouts/session/day/[dayId]` | Audited | 58 | Tune flow | `docs/ux-progress/routes/workout-session-day.md` | Fix mobile sticky CTA, optimistic rollback, key tap targets, and failure states. |
| `/my-workout/day/[dayId]` | Audited | 59 | Tune flow with editor-state and unsaved-change hardening | `docs/ux-progress/routes/workout-day-editor.md` | `Known day -> visible draft state -> safe edits -> protected cancel/back/remove -> reliable save`. |
| `/workouts` | Audited | 58 | Tune flow with search-state, detail-state, and route-action hardening | `docs/ux-progress/routes/exercise-library.md` | `Verified actions -> visible result states -> reliable favorites/custom saves -> 48px mobile controls`. |
| `/calories` | Audited | 54 | Needs AI-first reframing | `docs/ux-progress/routes/calories.md` | `ChatGPT meal import/review -> Plaivra overview/tracking -> manual fallback/correction`. |
| `/my-meal-plan` | Audited | 57 | Needs AI-first reframing | `docs/ux-progress/routes/my-meal-plan.md` | `ChatGPT meal-plan import/review -> planned overview -> shopping / mark done -> manual fallback/correction`. |
| `/hydration` | Audited | 68 | Tune flow | `docs/ux-progress/routes/hydration.md` | `Today hero -> quick add -> manual fallback -> recent entries -> weekly context -> streak/reminder`. |
| `/wellness` | Audited | 60 | Reorder flow | `docs/ux-progress/routes/wellness.md` | `Today status -> next wellness action -> compact check-in -> focused launchers -> recent history`. |
| `/progress` | Audited | 62 | Tune flow | `docs/ux-progress/routes/progress.md` | `Goal/trend status -> one next logging action -> reliable add/edit/delete/photo states -> private trend review`. |
| `/settings` | Audited | 64 | Tune flow | `docs/ux-progress/routes/settings.md` | `Profile/setup confidence -> grouped sensitive controls -> comfortable navigation -> visible recovery states`. |
| `/settings/ai-imports` | Audited | 66 | Tune flow with trust-state hardening | `docs/ux-progress/routes/settings-ai-imports.md` | `Known connection state -> known permission state -> safe permission changes -> safe setup/revoke -> auditable activity`. |
| `/settings/data-privacy` | Audited | 61 | Tune flow with privacy-action hardening | `docs/ux-progress/routes/settings-data-privacy.md` | `Clear privacy meaning -> reliable toggle saves -> explicit export status -> confirmed reset settings`. |
| `/settings/preferences` | Audited | 62 | Tune flow with settings-state hardening | `docs/ux-progress/routes/settings-preferences.md` | `Loaded preferences -> comfortable controls -> clear pending/save/failure -> reduced-motion-safe UI`. |

---

## 4. Priority definitions

| Priority | Meaning |
|---|---|
| P0 | Blocks trust, safety, data integrity, accessibility, or core usability. Must fix before release. |
| P1 | Strongly damages premium feel, repeated daily use, perceived speed, workflow quality, product alignment, or motion/interaction quality. Should fix before release. |
| P2 | Polish, consistency, or minor motion issue. Fix after P0/P1. |
| P3 | Optional enhancement. Do not distract from core audit fixes. |

---

## 5. Running audit log

| Date | Route/Area | Action | Result | Commit/PR |
|---|---|---|---|---|
| 2026-07-06 | `/dashboard` | Completed route audit | Score 72/100 | `2f636e072f82a31d85c824e15de8791c02f02e60` |
| 2026-07-06 | `/onboarding?edit=true` | Completed route audit | Score 66/100 | `f1857db2eafe923b5ac4759e01e577919c540488` |
| 2026-07-06 | `/my-workout/plans` | Completed route audit | Score 63/100 | `50e7ccbcb0f341e58cae2d3c91c3d0726a0cb914` |
| 2026-07-06 | `/workouts/session/day/[dayId]` | Completed route audit | Score 58/100 | `1f4efc9baf25d23e778eddd20b0d468a7577adf7` |
| 2026-07-06 | `/my-workout/day/[dayId]` | Completed route audit | Score 59/100 | `bc997484faef6d4576e432c069ae4e14f0e334d1` |
| 2026-07-06 | `/workouts` | Completed exercise library route audit | Score 58/100 | `cc9b50ecdd7447cf80dfc49caa504895260bc23d` |
| 2026-07-06 | `/calories` | Completed/reframed route audit | Score 54/100 | `7c8422fb407bea78fd9cc639472dc444a52a08df` |
| 2026-07-06 | `/my-meal-plan` | Completed route audit | Score 57/100 | `fe33ec561ee07ba7cb26767c7ce7d94b285e4cf0` |
| 2026-07-06 | `/hydration` | Completed route audit | Score 68/100 | `61741d42ef9f7738451442032f80d4cb34c7f4be` |
| 2026-07-06 | `/wellness` | Completed route audit | Score 60/100 | `52e1ef00c01a0a3010ed814604535000ae1009d2` |
| 2026-07-06 | `/progress` | Completed route audit | Score 62/100 | `b56faa0364dfa0a62915c4df3166e79e72997a70` |
| 2026-07-06 | `/settings` | Completed route audit | Score 64/100 | `1b5d2b0936b1257cba19e44d5dea601d0249fcf3` |
| 2026-07-06 | `/settings/ai-imports` | Completed route audit | Score 66/100 | `543b6771ec043446127986e7db36f8399abf985e` |
| 2026-07-06 | `/settings/data-privacy` | Completed route audit | Score 61/100 | `a1fe83d619d0720da5a3e4c3750de12804ce665f` |
| 2026-07-06 | `/settings/preferences` | Completed route audit | Score 62/100 | `3236e76d673347b59f8f9638c6690b7a7f48cb31` |

---

## 6. Current recommended audit order

1. `/dashboard` — audited, fixes open
2. `/onboarding?edit=true` — audited, fixes open
3. `/my-workout/plans` — audited, fixes open
4. `/workouts/session/day/[dayId]` — audited, fixes open
5. `/my-workout/day/[dayId]` — audited, fixes open
6. `/workouts` — audited, fixes open
7. `/calories` — audited, fixes open after AI-first reframing
8. `/my-meal-plan` — audited, fixes open after AI-first reframing
9. `/hydration` — audited, fixes open
10. `/wellness` — audited, fixes open
11. `/progress` — audited, fixes open
12. `/settings` — audited, fixes open
13. `/settings/ai-imports` — audited, fixes open
14. `/settings/data-privacy` — audited, fixes open
15. `/settings/preferences` — audited, fixes open
16. Workout history
17. Global app shell / navigation
18. Food Hub / custom foods and meals

Reason: these routes carry the highest daily-use, trust, AI, motion, and future-subscription impact.

---

## 7. Agent instruction for future audits

```txt
Use docs/product/ai-first-tracker-model.md, docs/ux-constitution/README.md, docs/ux-constitution/flow-and-workflow-audit.md, and docs/ux-constitution/motion-and-interaction.md as the source of truth, and update docs/ux-progress/README.md with route-level audit results. Audit workflow first. Plaivra is AI-first, not manual-entry-first. If a data-entry route treats manual input as primary when ChatGPT/import should be primary, mark it as a product-flow issue before button polish. Then audit buttons, spacing, states, motion, mobile tap comfort, reduced-motion behavior, AI safety, privacy/high-risk action control, and subscription-readiness. Mark every finding with priority P0/P1/P2/P3 and a concrete recommended fix.
```
