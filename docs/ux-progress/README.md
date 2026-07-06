# Plaivra UX Progress Tracker

**Version:** 2026.1  
**Status:** Active tracker  
**Source of truth:**

- `docs/product/ai-first-tracker-model.md`
- `docs/ux-constitution/README.md`
- `docs/ux-constitution/flow-and-workflow-audit.md`
- `docs/ux-constitution/motion-and-interaction.md`

This file tracks how close Plaivra is to the product model and UI/UX constitution, including AI-first workflow quality, button hierarchy, spacing, touch comfort, feedback, motion, loading, empty states, error recovery, AI action safety, and subscription-readiness.

Do not mark a route as passed because it looks better. A route passes only when it has been audited against the AI-first product model, constitution, workflow standard, and motion standard, and the relevant issues were fixed or explicitly accepted as exceptions.

---

## 1. Scoring model

Each audited route receives a score out of 100.

| Category | Weight |
|---|---:|
| Route purpose and action hierarchy | 15 |
| Button size, placement, and hierarchy | 15 |
| Spacing consistency and visual rhythm | 10 |
| Feedback, optimistic UI, loading, and errors | 15 |
| Motion and interaction quality | 15 |
| Mobile-first behavior and tap comfort | 10 |
| AI safety, privacy, and destructive-action control | 10 |
| Premium/subscription readiness | 10 |
| **Total** | **100** |

### Score interpretation

| Score | Meaning |
|---:|---|
| 90-100 | Release-grade. Only minor polish allowed. |
| 80-89 | Good but not premium enough yet. Needs targeted fixes. |
| 70-79 | Usable but visibly inconsistent. Needs UI/UX and motion refinement. |
| 50-69 | Functional but not subscription-ready or not product-aligned. |
| Below 50 | Failing route experience. Must be redesigned or simplified. |

---

## 2. Global progress summary

Current global status: **Dashboard, onboarding, workout plans, workout session, calories, and meal plan audited. Calories and meal plan were reframed after the AI-first product clarification. Remaining routes are not audited yet against the 2026.1 AI-first product model, constitution, workflow standard, and motion standard.**

| Area | Status | Score | Notes |
|---|---|---:|---|
| Global app shell / navigation | Not audited | — | Needs mobile nav, safe area, action hierarchy, route transitions, active states, and offline/sync banner review. |
| Dashboard | Audited | 72 | Strong foundation but not premium-ready. Needs clearer primary action, imported/active state visibility, reduced action density, stronger optimistic feedback, better section-level motion, and tighter mobile action grouping. |
| Onboarding | Audited | 66 | Functional but not launch-quality. Needs conditional target-weight logic, saved-answer loading state, step motion, reduced action density, stronger validation, and 48px touch target cleanup. |
| Workout plans | Audited | 63 | Functional but workflow is management-heavy. Needs Today-first flow, better no-plan setup flow, ChatGPT import as primary plan creation, 48px plan menus, and stronger import framing. Full audit: `docs/ux-progress/routes/my-workout-plans.md`. |
| Workout session | Audited | 58 | Strong concept but core mobile/reliability issues. Needs session-local sticky CTA fix, optimistic rollback, 48px touch targets, unsaved-exit protection, and clearer set/rest failure states. Full audit: `docs/ux-progress/routes/workout-session-day.md`. |
| Calories / food log | Audited | 54 | Functional manual tracker, but not aligned enough with Plaivra's AI-first model. Needs ChatGPT/photo/text meal import as primary path, review/apply/correct stage, manual fallback, optimistic water/recent logging, and shared ErrorState. Full audit: `docs/ux-progress/routes/calories.md`. |
| Workout day editor | Not audited | — | Needs edit-mode motion, destructive action protection, exercise row actions, and save feedback audit. |
| Exercise library | Not audited | — | Needs filters, search, result-count feedback, card actions, card/detail reveal, and custom-video action audit. |
| Workout history | Not audited | — | Needs empty/history/detail actions, list transitions, loading states, and recovery audit. |
| Food Hub / custom foods and meals | Not audited | — | Audit as manual fallback/edit path, not as the main product entry path. |
| Meal plan | Audited | 57 | Useful day/week/shopping objects exist, but the route still opens as a manual day planner. Needs ChatGPT meal-plan import/update as primary, review/apply/correct state, manual add as fallback, stronger mark-done/grocery feedback, and 48px tap cleanup. Full audit: `docs/ux-progress/routes/my-meal-plan.md`. |
| Weekly overview / reports | Not audited | — | Needs report navigation, filters, chart/data motion, loading, empty-state, and reduced-motion audit. |
| Progress | Not audited | — | Needs overview/trend flow, add entry, photos, goal weight, edit/delete, chart transitions, progress updates, and privacy-state audit. |
| Personal records | Not audited | — | Needs tracker, insight actions, PR update highlight, achievement feedback, and empty-state audit. |
| Wellness hub | Not audited | — | Needs launcher-card hierarchy, daily check-in feedback, calm completion motion, and empty-state audit. |
| Hydration | Not audited | — | Direct quick logging is primary here. Needs quick-add, manual-add, delete, progress fill, target-reached moment, optimistic feedback, and error recovery audit. |
| Habits | Not audited | — | Needs repeated toggle/check behavior, streak feedback, optimistic updates, reduced motion, and error recovery audit. |
| Sleep & recovery | Not audited | — | Needs form/action/feedback audit with quiet low-stimulation motion and clear save states. |
| Supplements | Not audited | — | Needs dose/taken/reminder actions, checklist feedback, optimistic behavior, and failure recovery audit. |
| Daily fit tasks | Not audited | — | Needs add/edit/complete/delete actions, task-complete transitions, optimistic behavior, and empty-state audit. |
| Settings hub | Not audited | — | Needs category hierarchy, row spacing, stable/minimal transitions, and account-action audit. |
| Account settings | Not audited | — | Needs sign-out/delete-account/destructive separation, confirmation states, and serious low-motion behavior audit. |
| AI imports / permissions | Not audited | — | Critical route. Needs permission clarity, connection status, revoke, ChatGPT flow choreography, pending/success/error states, import/apply safety, and AI trust audit. |
| Preferences | Not audited | — | Needs settings-row spacing, selects, toggles, save feedback, reduced-motion preference handling, and pending/error audit. |
| Data privacy | Not audited | — | Needs export, reset, privacy links, dangerous-action hierarchy, serious confirmation states, and progress/error audit. |
| Public landing/auth | Not audited | — | Needs premium first impression, auth CTA, subtle entrance motion, loading/error auth states, and trust audit. |

---

## 3. Completed route audits

### `/dashboard`

**Status:** Audited  
**Score:** 72 / 100  
**Flow decision:** Tune flow

Primary issue: the dashboard has the correct daily data, but too many actions compete. It needs one dominant next best action, imported/active state clarity, optimistic repeated actions, and calmer hierarchy.

### `/onboarding?edit=true`

**Status:** Audited  
**Score:** 66 / 100  
**Flow decision:** Tune flow

Primary issue: onboarding edit is functional, but target-weight relevance, saved-data loading, step motion, tap targets, and AI permission framing are not launch-quality yet.

### `/my-workout/plans`

**Status:** Audited  
**Score:** 63 / 100  
**Flow decision:** Reorder flow  
**Full audit:** `docs/ux-progress/routes/my-workout-plans.md`

Primary issue: the route is too management-heavy. It should lead with today's training intent and keep ChatGPT import as the primary plan creation path.

Recommended flow:

```txt
Today hero -> weekly calendar -> saved plan library -> add/import plan
```

### `/workouts/session/day/[dayId]`

**Status:** Audited  
**Score:** 58 / 100  
**Flow decision:** Tune flow with one P0 bug fix  
**Full audit:** `docs/ux-progress/routes/workout-session-day.md`

Primary issue: the focus-session concept is strong, but the current implementation has core mobile and reliability problems.

Required correction sequence:

```txt
Fix session-local mobile sticky CTA -> add optimistic rollback -> clean key touch targets -> clarify exit/failure states
```

### `/calories`

**Status:** Audited  
**Score:** 54 / 100  
**Flow decision:** Needs AI-first reframing  
**Full audit:** `docs/ux-progress/routes/calories.md`

Primary issue: the route works as a manual calorie tracker, but Plaivra's product model requires ChatGPT/photo/text meal import to be primary, with Plaivra as the review/apply/tracking layer.

Recommended flow:

```txt
ChatGPT meal import/review -> Plaivra overview/tracking -> manual fallback/correction
```

### `/my-meal-plan`

**Status:** Audited  
**Score:** 57 / 100  
**Flow decision:** Needs AI-first reframing  
**Full audit:** `docs/ux-progress/routes/my-meal-plan.md`

Primary issue: the route has useful day, week, shopping, mark-done, and per-item ChatGPT help surfaces, but it still opens as a manual day planner. ChatGPT meal-plan import/update must become the primary route-level workflow, with review/apply/correct before saving.

Recommended flow:

```txt
ChatGPT meal-plan import/review -> planned overview -> shopping / mark done -> manual fallback/correction
```

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
| 2026-07-06 | UX reference | Created constitution and progress tracker | Baseline created; no route scored yet | — |
| 2026-07-06 | Motion reference | Added motion and interaction standard | Motion now part of the UX constitution | `1eeabb2a0817d28960c2bed5de705a37d32afd80` |
| 2026-07-06 | UX progress tracker | Added motion scoring and audit checklist | Route audits now score interaction/motion quality explicitly | `bd347b1bcf531895e0a4642deb4059c6804ad7ca` |
| 2026-07-06 | `/dashboard` | Completed route audit | Score 72/100; P1 fixes required before route is premium-ready | `2f636e072f82a31d85c824e15de8791c02f02e60` |
| 2026-07-06 | `/onboarding?edit=true` | Completed route audit | Score 66/100; P0/P1 fixes required before route is premium-ready | `f1857db2eafe923b5ac4759e01e577919c540488` |
| 2026-07-06 | Flow audit standard | Added flow-first audit standard | Future audits start with workflow before buttons/motion | `34355940625ace2d519368cbf083453cb19aa14b` |
| 2026-07-06 | `/my-workout/plans` | Completed flow-first route audit | Score 63/100; flow reorder required before route is premium-ready | `50e7ccbcb0f341e58cae2d3c91c3d0726a0cb914` |
| 2026-07-06 | `/workouts/session/day/[dayId]` | Completed flow-first route audit | Score 58/100; P0/P1 fixes required for core session reliability | `1f4efc9baf25d23e778eddd20b0d468a7577adf7` |
| 2026-07-06 | `/calories` | Completed flow-first route audit | Initial score 61/100 as manual tracker flow | `7c8422fb407bea78fd9cc639472dc444a52a08df` |
| 2026-07-06 | AI-first product model | Added product source of truth | Plaivra defined as ChatGPT-first tracker, manual entry as fallback | `1c7fb06c3d73958c4191de72e5cf919030a4b958` |
| 2026-07-06 | `/calories` | Reframed calories audit | Score revised to 54/100; needs AI-first meal import/review flow | This commit |
| 2026-07-06 | `/my-meal-plan` | Completed AI-first route audit | Score 57/100; needs ChatGPT meal-plan import/review as primary route flow | `fe33ec561ee07ba7cb26767c7ce7d94b285e4cf0` |

---

## 6. Current recommended audit order

Audit mobile-first, then desktop only where layout differs.

Suggested order:

1. `/dashboard` — audited, fixes open
2. `/onboarding?edit=true` — audited, fixes open
3. `/my-workout/plans` — audited, fixes open
4. `/workouts/session/day/[dayId]` — audited, fixes open
5. `/calories` — audited, fixes open after AI-first reframing
6. `/my-meal-plan` — audited, fixes open after AI-first reframing
7. `/hydration`
8. `/wellness`
9. `/progress`
10. `/settings`
11. `/settings/ai-imports`
12. `/settings/data-privacy`

Reason: these routes carry the highest daily-use, trust, AI, motion, and future-subscription impact.

---

## 7. Agent instruction for future audits

```txt
Use docs/product/ai-first-tracker-model.md, docs/ux-constitution/README.md, docs/ux-constitution/flow-and-workflow-audit.md, and docs/ux-constitution/motion-and-interaction.md as the source of truth, and update docs/ux-progress/README.md with route-level audit results. Audit workflow first. Plaivra is AI-first, not manual-entry-first. If a data-entry route treats manual input as primary when ChatGPT/import should be primary, mark it as a product-flow issue before button polish. Then audit buttons, spacing, states, motion, mobile tap comfort, reduced-motion behavior, AI safety, privacy/destructive-action control, and subscription-readiness. Mark every finding with priority P0/P1/P2/P3 and a concrete recommended fix.
```
