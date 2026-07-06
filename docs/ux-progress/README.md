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

Current global status: **Dashboard, onboarding, workout plans, workout session, calories, meal plan, hydration, wellness, progress, settings, AI imports, and data privacy audited. Calories and meal plan were reframed after the AI-first product clarification. Hydration is a direct quick-logging exception. Wellness is a calm hub/check-in route. Progress is a sensitive direct-tracking route. Settings is a trust/control hub. AI imports is the permission/connection trust layer. Data privacy is the sensitive visibility/export/settings-reset route.**

| Area | Status | Score | Notes |
|---|---|---:|---|
| Global app shell / navigation | Not audited | — | Needs mobile nav, safe area, action hierarchy, route transitions, active states, and offline/sync banner review. |
| Dashboard | Audited | 72 | Needs clearer primary action, imported/active state visibility, reduced action density, stronger optimistic feedback, better section-level motion, and tighter mobile action grouping. |
| Onboarding | Audited | 66 | Needs conditional target-weight logic, saved-answer loading state, step motion, reduced action density, stronger validation, and 48px tap cleanup. |
| Workout plans | Audited | 63 | Needs Today-first flow, better no-plan setup, ChatGPT import as primary plan creation, 48px plan menus, and stronger import framing. Full audit: `docs/ux-progress/routes/my-workout-plans.md`. |
| Workout session | Audited | 58 | Needs session-local sticky CTA fix, optimistic rollback, 48px controls, exit protection, and clearer set/rest failure states. Full audit: `docs/ux-progress/routes/workout-session-day.md`. |
| Calories / food log | Audited | 54 | Needs ChatGPT/photo/text meal import as primary path, review/apply/correct stage, manual fallback, optimistic water/recent logging, and shared ErrorState. Full audit: `docs/ux-progress/routes/calories.md`. |
| Meal plan | Audited | 57 | Needs ChatGPT meal-plan import/update as primary, review/apply/correct state, manual add as fallback, mark-done/grocery feedback, and 48px cleanup. Full audit: `docs/ux-progress/routes/my-meal-plan.md`. |
| Hydration | Audited | 68 | Product role is correct as direct quick logging. Needs optimistic quick-add/delete with rollback, initial hero loading gate, target-hit state, 48px cleanup, and useful motion. Full audit: `docs/ux-progress/routes/hydration.md`. |
| Wellness hub | Audited | 60 | Correct modules exist, but the route is too form-first. Needs status/next-action hero, compact/contextual check-in, visible loading/degraded states, 48px check-in controls, and calm saved-state motion. Full audit: `docs/ux-progress/routes/wellness.md`. |
| Progress | Audited | 62 | Feature-rich direct tracker, but needs goal/trend-first hierarchy, visible degraded/error states, privacy/photo copy, synced/local goal state, 48px correction controls, and restrained update motion. Full audit: `docs/ux-progress/routes/progress.md`. |
| Settings hub | Audited | 64 | Solid control hub, but needs setup loading/degraded state, confidence-aware setup status, grouping for trust/data controls, 48px setup/back/account actions, and app confirmation for account request flow. Full audit: `docs/ux-progress/routes/settings.md`. |
| AI imports / permissions | Audited | 66 | Correct AI trust foundation, but needs permission/connection status hero, explicit load/save/revoke failure states, full-access confirmation, 48px permission controls, and visible activity. Full audit: `docs/ux-progress/routes/settings-ai-imports.md`. |
| Data privacy | Audited | 61 | Lightweight and functional, but privacy toggles, export, and reset settings need inline state, clearer hide-vs-delete copy, export scope, reset confirmation, and mobile stacking. Full audit: `docs/ux-progress/routes/settings-data-privacy.md`. |
| Workout day editor | Not audited | — | Needs edit-mode motion, safer high-risk actions, exercise row actions, and save feedback audit. |
| Exercise library | Not audited | — | Needs filters, search, result-count feedback, card actions, card/detail reveal, and custom-video action audit. |
| Workout history | Not audited | — | Needs empty/history/detail actions, list transitions, loading states, and recovery audit. |
| Food Hub / custom foods and meals | Not audited | — | Audit as manual fallback/edit path, not as the main product entry path. |
| Weekly overview / reports | Not audited | — | Needs report navigation, filters, chart/data motion, loading, empty-state, and reduced-motion audit. |
| Personal records | Not audited | — | Needs tracker, insight actions, PR update highlight, achievement feedback, and empty-state audit. |
| Habits | Not audited | — | Needs repeated toggle/check behavior, streak feedback, optimistic updates, reduced motion, and error recovery audit. |
| Sleep & recovery | Not audited | — | Needs form/action/feedback audit with quiet low-stimulation motion and clear save states. |
| Supplements | Not audited | — | Needs dose/taken/reminder actions, checklist feedback, optimistic behavior, and failure recovery audit. |
| Daily fit tasks | Not audited | — | Needs add/edit/complete/delete actions, task-complete transitions, optimistic behavior, and empty-state audit. |
| Account settings | Not audited | — | Needs sign-out/delete-account separation, confirmation states, and serious low-motion behavior audit. |
| Preferences | Not audited | — | Needs settings-row spacing, selects, toggles, save feedback, reduced-motion preference handling, and pending/error audit. |
| Public landing/auth | Not audited | — | Needs premium first impression, auth CTA, subtle entrance motion, loading/error auth states, and trust audit. |

---

## 3. Completed route audits

| Route | Status | Score | Flow decision | Full audit | Main correction |
|---|---|---:|---|---|---|
| `/dashboard` | Audited | 72 | Tune flow | — | One dominant next best action, imported/active state clarity, and optimistic repeated actions. |
| `/onboarding?edit=true` | Audited | 66 | Tune flow | — | Target-weight relevance, loading gate, step motion, validation, and AI permission framing. |
| `/my-workout/plans` | Audited | 63 | Reorder flow | `docs/ux-progress/routes/my-workout-plans.md` | `Today hero -> weekly calendar -> saved plan library -> add/import plan`. |
| `/workouts/session/day/[dayId]` | Audited | 58 | Tune flow | `docs/ux-progress/routes/workout-session-day.md` | Fix mobile sticky CTA, optimistic rollback, key tap targets, and failure states. |
| `/calories` | Audited | 54 | Needs AI-first reframing | `docs/ux-progress/routes/calories.md` | `ChatGPT meal import/review -> Plaivra overview/tracking -> manual fallback/correction`. |
| `/my-meal-plan` | Audited | 57 | Needs AI-first reframing | `docs/ux-progress/routes/my-meal-plan.md` | `ChatGPT meal-plan import/review -> planned overview -> shopping / mark done -> manual fallback/correction`. |
| `/hydration` | Audited | 68 | Tune flow | `docs/ux-progress/routes/hydration.md` | `Today hero -> quick add -> manual fallback -> recent entries -> weekly context -> streak/reminder`. |
| `/wellness` | Audited | 60 | Reorder flow | `docs/ux-progress/routes/wellness.md` | `Today status -> next wellness action -> compact check-in -> focused launchers -> recent history`. |
| `/progress` | Audited | 62 | Tune flow | `docs/ux-progress/routes/progress.md` | `Goal/trend status -> one next logging action -> reliable add/edit/delete/photo states -> private trend review`. |
| `/settings` | Audited | 64 | Tune flow | `docs/ux-progress/routes/settings.md` | `Profile/setup confidence -> grouped sensitive controls -> comfortable navigation -> visible recovery states`. |
| `/settings/ai-imports` | Audited | 66 | Tune flow with trust-state hardening | `docs/ux-progress/routes/settings-ai-imports.md` | `Known connection state -> known permission state -> safe permission changes -> safe setup/revoke -> auditable activity`. |
| `/settings/data-privacy` | Audited | 61 | Tune flow with privacy-action hardening | `docs/ux-progress/routes/settings-data-privacy.md` | `Clear privacy meaning -> reliable toggle saves -> explicit export status -> confirmed reset settings`. |

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
| 2026-07-06 | `/hydration` | Completed direct-logging route audit | Score 68/100; product role correct but optimistic logging/recovery and loading polish required | `61741d42ef9f7738451442032f80d4cb34c7f4be` |
| 2026-07-06 | `/wellness` | Completed wellness hub route audit | Score 60/100; needs status/next-action hierarchy, compact check-in, and visible loading/degraded states | `52e1ef00c01a0a3010ed814604535000ae1009d2` |
| 2026-07-06 | `/progress` | Completed progress route audit | Score 62/100; needs goal/trend hierarchy, privacy-state clarity, and reliable correction/photo states | `b56faa0364dfa0a62915c4df3166e79e72997a70` |
| 2026-07-06 | `/settings` | Completed settings hub route audit | Score 64/100; needs setup state confidence, grouped trust/data controls, 48px actions, and safer account request pattern | `1b5d2b0936b1257cba19e44d5dea601d0249fcf3` |
| 2026-07-06 | `/settings/ai-imports` | Completed AI imports route audit | Score 66/100; needs permission/connection state hardening, full-access confirmation, and safer revoke flow | `543b6771ec043446127986e7db36f8399abf985e` |
| 2026-07-06 | `/settings/data-privacy` | Completed data privacy route audit | Score 61/100; needs privacy-action state hardening, export scope/status, and reset confirmation | `a1fe83d619d0720da5a3e4c3750de12804ce665f` |

---

## 6. Current recommended audit order

1. `/dashboard` — audited, fixes open
2. `/onboarding?edit=true` — audited, fixes open
3. `/my-workout/plans` — audited, fixes open
4. `/workouts/session/day/[dayId]` — audited, fixes open
5. `/calories` — audited, fixes open after AI-first reframing
6. `/my-meal-plan` — audited, fixes open after AI-first reframing
7. `/hydration` — audited, fixes open
8. `/wellness` — audited, fixes open
9. `/progress` — audited, fixes open
10. `/settings` — audited, fixes open
11. `/settings/ai-imports` — audited, fixes open
12. `/settings/data-privacy` — audited, fixes open
13. `/settings/preferences`

Reason: these routes carry the highest daily-use, trust, AI, motion, and future-subscription impact.

---

## 7. Agent instruction for future audits

```txt
Use docs/product/ai-first-tracker-model.md, docs/ux-constitution/README.md, docs/ux-constitution/flow-and-workflow-audit.md, and docs/ux-constitution/motion-and-interaction.md as the source of truth, and update docs/ux-progress/README.md with route-level audit results. Audit workflow first. Plaivra is AI-first, not manual-entry-first. If a data-entry route treats manual input as primary when ChatGPT/import should be primary, mark it as a product-flow issue before button polish. Then audit buttons, spacing, states, motion, mobile tap comfort, reduced-motion behavior, AI safety, privacy/high-risk action control, and subscription-readiness. Mark every finding with priority P0/P1/P2/P3 and a concrete recommended fix.
```
