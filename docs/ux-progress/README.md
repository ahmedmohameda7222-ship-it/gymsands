# Plaivra UX Progress Tracker

**Version:** 2026.1  
**Status:** Active tracker  
**Source of truth:** `docs/ux-constitution/README.md` and `docs/ux-constitution/motion-and-interaction.md`

This file tracks how close Plaivra is to the UI/UX constitution, including button hierarchy, spacing, touch comfort, feedback, motion, loading, empty states, error recovery, AI action safety, and subscription-readiness.

Do not mark a route as passed because it looks better. A route passes only when it has been audited against the constitution and motion standard, and the relevant issues were fixed or explicitly accepted as exceptions.

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
| 50-69 | Functional but not subscription-ready. |
| Below 50 | Failing route experience. Must be redesigned or simplified. |

### Status labels

| Status | Meaning |
|---|---|
| Not audited | No route-level audit has been completed yet. |
| Audited | Issues are documented, but fixes are not completed. |
| In progress | Fixes are being implemented. |
| Needs retest | Fixes were made and need verification. |
| Passed | Meets the constitution and motion standard at release-grade level. |
| Exception accepted | Does not fully meet the constitution or motion standard, but the exception is documented and approved. |

---

## 2. Global progress summary

Current global status: **Dashboard audited; remaining routes are not audited yet against the 2026.1 constitution and motion standard**

| Area | Status | Score | Notes |
|---|---|---:|---|
| Global app shell / navigation | Not audited | — | Needs mobile nav, safe area, action hierarchy, route transitions, active states, and offline/sync banner review. |
| Dashboard | Audited | 72 | Strong foundation with skeleton/error/empty states and some motion, but not premium-ready yet. Needs clearer primary action, reduced action density, stronger optimistic feedback, better section-level motion, and tighter mobile action grouping. |
| Onboarding | Not audited | — | Needs step hierarchy, sticky actions, step transitions, progress indicator motion, AI permissions, and target-weight logic review. |
| Workout plans | Not audited | — | Needs action density, plan-management buttons, card reveal, default-plan feedback, and edit-mode transition audit. |
| Workout day editor | Not audited | — | Needs edit-mode motion, destructive action protection, exercise row actions, and save feedback audit. |
| Workout session | Not audited | — | Needs focused-session audit: no nav clutter, instant set logging, rest-timer motion, bottom actions, success completion, and error recovery. |
| Exercise library | Not audited | — | Needs filters, search, result-count feedback, card actions, card/detail reveal, and custom-video action audit. |
| Workout history | Not audited | — | Needs empty/history/detail actions, list transitions, loading states, and recovery audit. |
| Calories / food log | Not audited | — | Needs target editor, food logging, water logging, macro progress motion, tabs, optimistic feedback, and error-state audit. |
| Food Hub / custom foods and meals | Not audited | — | `/calories/custom-food-meal` redirects here; audit actual builder route, form reveal, validation feedback, and save success state. |
| Meal plan | Not audited | — | Needs add/edit/mark-done/shopping-list/AI action audit, planned-to-done transitions, totals update, and optimistic feedback. |
| Weekly overview / reports | Not audited | — | Needs report navigation, filters, chart/data motion, loading, empty-state, and reduced-motion audit. |
| Progress | Not audited | — | Needs add entry, photos, goal weight, edit/delete, chart transitions, progress updates, and privacy-state audit. |
| Personal records | Not audited | — | Needs tracker, insight actions, PR update highlight, achievement feedback, and empty-state audit. |
| Wellness hub | Not audited | — | Needs launcher-card hierarchy, daily check-in feedback, calm completion motion, and empty-state audit. |
| Hydration | Not audited | — | Needs quick-add, manual-add, delete, progress fill, target-reached moment, optimistic feedback, and error recovery audit. |
| Habits | Not audited | — | Needs repeated toggle/check behavior, streak feedback, optimistic updates, reduced motion, and error recovery audit. |
| Sleep & recovery | Not audited | — | Needs form/action/feedback audit with quiet low-stimulation motion and clear save states. |
| Supplements | Not audited | — | Needs dose/taken/reminder actions, checklist feedback, optimistic behavior, and failure recovery audit. |
| Daily fit tasks | Not audited | — | Needs add/edit/complete/delete actions, task-complete transitions, optimistic behavior, and empty-state audit. |
| Settings hub | Not audited | — | Needs category hierarchy, row spacing, stable/minimal transitions, and account-action audit. |
| Account settings | Not audited | — | Needs sign-out/delete-account/destructive separation, confirmation states, and serious low-motion behavior audit. |
| AI imports / permissions | Not audited | — | Needs permission clarity, connection status, revoke, ChatGPT flow choreography, pending/success/error states, and AI safety audit. |
| Preferences | Not audited | — | Needs settings-row spacing, selects, toggles, save feedback, reduced-motion preference handling, and pending/error audit. |
| Data privacy | Not audited | — | Needs export, reset, privacy links, dangerous-action hierarchy, serious confirmation states, and progress/error audit. |
| Public landing/auth | Not audited | — | Needs premium first impression, auth CTA, subtle entrance motion, loading/error auth states, and trust audit. |

---

## 3. Route audit template

Copy this section for every route audit.

```md
## Route: /example

**Audit date:** YYYY-MM-DD  
**Auditor:** ChatGPT / human / agent name  
**Status:** Not audited / Audited / In progress / Needs retest / Passed / Exception accepted  
**Score:** __ / 100

### Route purpose

Primary job of this route:

- ...

Expected primary action:

- ...

### Score breakdown

| Category | Score | Max | Notes |
|---|---:|---:|---|
| Route purpose and action hierarchy | 0 | 15 |  |
| Button size, placement, and hierarchy | 0 | 15 |  |
| Spacing consistency and visual rhythm | 0 | 10 |  |
| Feedback, optimistic UI, loading, and errors | 0 | 15 |  |
| Motion and interaction quality | 0 | 15 |  |
| Mobile-first behavior and tap comfort | 0 | 10 |  |
| AI safety, privacy, and destructive-action control | 0 | 10 |  |
| Premium/subscription readiness | 0 | 10 |  |
| **Total** | **0** | **100** |  |

### Button/action inventory

| Action | Current placement | Current type | Problem | Decision | Priority |
|---|---|---|---|---|---|
| Example action | Card footer | Primary | Too many primaries | Restyle to secondary | P1 |

### Motion/interaction inventory

| Interaction | Current behavior | Problem | Required standard | Decision | Priority |
|---|---|---|---|---|---|
| Example tap | Waits for server before changing | Feels slow/static | Optimistic feedback under 100 ms | Add optimistic UI + rollback | P1 |

### Constitution violations

| Rule violated | Evidence | Fix |
|---|---|---|
| 48px touch target | Example button is visually/tappably too small | Increase hit area to 48px |
| Motion feedback under 100 ms | Example action has no pressed or pending state | Add immediate press feedback and pending state |

### Required fixes

| Priority | Fix | Owner | Status |
|---|---|---|---|
| P0 | Critical fix | Codex/Kimi/Human | Open |
| P1 | High-value fix | Codex/Kimi/Human | Open |
| P2 | Polish fix | Codex/Kimi/Human | Open |

### Retest checklist

- [ ] One primary action is clear.
- [ ] All tap targets are at least 48 x 48 px effective hit area.
- [ ] Button spacing uses the Plaivra spacing scale.
- [ ] Rare actions are hidden in menu/sheet/edit mode.
- [ ] Destructive actions are separated and protected.
- [ ] Tap feedback appears under 100 ms.
- [ ] Safe repeated actions use optimistic UI where appropriate.
- [ ] Risky actions avoid blind optimistic UI.
- [ ] Loading, empty, error, retry, and offline states are covered.
- [ ] Success states exist for meaningful completion moments.
- [ ] Motion clarifies state or navigation instead of decorating randomly.
- [ ] Route/sheet transitions have spatial logic.
- [ ] Animations are section-appropriate rather than generic.
- [ ] Reduced-motion behavior is supported where relevant.
- [ ] The route feels subscription-ready.

### Exceptions accepted

- None.
```

---

## 4. Completed route audits

## Route: `/dashboard`

**Audit date:** 2026-07-06  
**Auditor:** ChatGPT  
**Status:** Audited  
**Score:** 72 / 100

### Route purpose

Primary job of this route:

- Show the user's current day status and push them toward the next best daily action without overwhelming them.

Expected primary action:

- The dashboard should surface one strongest next action based on today's context: start/resume workout, log food, complete planned meal, add water, or finish setup.

Current assessment:

- The route has solid functional coverage, strong data aggregation, skeleton/error/empty states, and some motion primitives.
- The route currently behaves more like a dense daily hub than a focused premium dashboard.
- Too many actions appear at similar visual weight: setup action, active target review, workout start/resume/import, meal type chips, skip/done, skip all, shopping list, next actions, daily check-ins, and weekly ChatGPT review.
- The route is usable but not yet release-grade for a paid premium product.

### Score breakdown

| Category | Score | Max | Notes |
|---|---:|---:|---|
| Route purpose and action hierarchy | 10 | 15 | Strong daily scope, but the primary next action is not singular enough. Setup, workout, meal, shopping, quick actions, check-ins, and AI review all compete. |
| Button size, placement, and hierarchy | 11 | 15 | Base Button has strong tap feedback/min height, but dashboard uses many `size="sm"` actions in dense rows. Meal `Skip`/`Done`, meal chips, and next-action shortcuts need stronger grouping. |
| Spacing consistency and visual rhythm | 7 | 10 | Uses mostly p-4/p-5 and gap scale, but `space-y-3`, `gap-1.5`, dense meal rows, and several stacked sections feel compact rather than premium. |
| Feedback, optimistic UI, loading, and errors | 11 | 15 | Good skeleton, empty, error, toast, and inline feedback. Quick water and meal done wait for server before updating state, so repeated daily actions do not feel instant enough. |
| Motion and interaction quality | 9 | 15 | Stagger, inline feedback, animated numbers, and motion tokens exist. Collapsible sections and progress bars are still mostly static, and section-specific motion is not fully realized. |
| Mobile-first behavior and tap comfort | 8 | 10 | Mobile-first structure exists and most buttons inherit acceptable hit area. Dense meal action rows can become cramped on small screens. |
| AI safety, privacy, and destructive-action control | 9 | 10 | Weekly ChatGPT review is contextual and uses approval-oriented dialog. No destructive dashboard action risk found. |
| Premium/subscription readiness | 7 | 10 | Functional and useful, but still too dense and utility-like. Needs fewer visible choices, stronger next-action focus, and more intentional interaction states. |
| **Total** | **72** | **100** | Usable, not premium-ready. |

### Button/action inventory

| Action | Current placement | Current type | Problem | Decision | Priority |
|---|---|---|---|---|---|
| Next setup item action | Compact setup checklist | Primary-ish setup CTA | Good for incomplete users, but competes with today's real primary action if not visually subordinated. | Keep, but make setup card secondary after initial onboarding or collapse by default after first few completions. | P1 |
| Review active target | Active target card | Secondary outline | Useful but appears near top and can steal attention from daily action. | Keep as secondary; consider moving into target card overflow/detail route on mobile. | P2 |
| Start/Resume workout | Today's workout card | Primary daily CTA | Correct primary when training day exists, but it competes with setup/meal/next actions. | Keep; promote as single main CTA when workout is the best next action. | P1 |
| Import plan | No-workout card | Secondary setup action | Correct for empty workout state. | Keep; ensure it does not look equally important once another next action exists. | P2 |
| Meal type chips | Today's meal plan card | Filter/action chips | Four small actions appear before actual meal actions; may feel busy. | Restyle as segmented control or horizontal tabs with clearer active state. | P1 |
| Skip food | Meal item row | Ghost action | Too close to Done and visually similar for a repeated daily row. | Move to overflow/secondary text action; keep Done dominant. | P1 |
| Done meal | Meal item row | Primary small action | Correct action but waits for server before visual completion. | Add optimistic row completion + rollback. | P1 |
| Skip all meal type | Meal plan card bottom | Ghost full-width | Potentially useful but visually prominent for a negative action. | Move to More/secondary area or require softer wording. | P2 |
| Open shopping list | Shopping list collapsible | Secondary outline | Correct, but shopping list probably does not deserve dashboard-level visibility unless items are due. | Keep collapsed; consider hiding if empty. | P2 |
| Next actions shortcuts | Next actions card | Multiple secondary CTAs | Three equal outline buttons can duplicate other CTAs. | Convert into one ranked next-best-action card or keep only if not duplicating visible cards. | P1 |
| Ask ChatGPT to review my week | Weekly ChatGPT review card | AI action | Contextual and clear, but dashboard may not be the right place if it adds end-of-week cognitive load daily. | Keep only when weekly report is meaningful; consider showing later in week or inside reports. | P2 |

### Motion/interaction inventory

| Interaction | Current behavior | Problem | Required standard | Decision | Priority |
|---|---|---|---|---|---|
| Dashboard card entrance | Uses `StaggerContainer` and `StaggerItem` | Good baseline, but not enough to create section-specific motion. | Productive motion: subtle card reveal, no slow decoration. | Keep; tune only if route feels slow. | P2 |
| Button press | Base button uses `transition-all duration-100` and `active:scale-[0.98]` | Good immediate tactile feedback. | Tap feedback under 100 ms. | Keep. | P2 |
| Water quick add | Waits for `addWaterLog` then updates local state | Feels server-dependent; repeated action should feel instant. | Optimistic UI with rollback on failure. | Add optimistic water entry/pending state. | P1 |
| Meal done | Waits for `markMealPlanItemDone` then updates item/logs | The row does not complete instantly. | Optimistic done state with rollback and duplicate protection. | Add optimistic done state and disable duplicate tap while pending. | P1 |
| Inline feedback | `InlineFeedback` appears for water and meal success | Good, but only after server success. | Immediate status feedback plus final success/error. | Keep and trigger pending/success phases. | P1 |
| Metric progress | `MetricCard` uses static `Progress`, not animated progress | Progress changes can feel static. | Progress fill should animate from previous to new value. | Replace dashboard metric progress with animated progress pattern. | P2 |
| Collapsible shopping/wellness | Opens/closes instantly by conditional render | Feels abrupt/static. | State transition 150-220 ms with reduced-motion fallback. | Add small expand/collapse motion. | P2 |
| Weekly AI request | Opens dialog through `AiActionRequestDialog` | Flow seems safe; audit deeper in AI route. | Prepare/copy/open/apply status choreography. | Keep pending deeper audit. | P2 |

### Constitution violations

| Rule violated | Evidence | Fix |
|---|---|---|
| One primary action per visible screen/section | Dashboard stacks setup checklist, active target review, workout action, meal actions, shortcuts, check-ins, and AI review. | Introduce a single Next Best Action hero/card and demote duplicates. |
| Safe repeated actions should feel instant | `quickAddWater` and `quickMarkMealDone` update UI only after async DB call returns. | Add optimistic local updates, pending IDs, rollback on failure, and duplicate-tap protection. |
| Motion should clarify state changes | Collapsible sections and metric progress changes are mostly static. | Animate expand/collapse and progress changes using centralized motion tokens and reduced-motion fallback. |
| Rare/secondary actions should not compete | Skip, Skip all, Review target, shopping, shortcuts, and weekly AI can all be visible. | Move lower-frequency actions into overflow, collapsed sections, or contextual cards. |
| Premium dashboard should reduce visible choices | Dashboard currently behaves as a dense hub with many controls. | Reduce to one primary next action, one quick-log cluster, and progressive disclosure for secondary sections. |

### Required fixes

| Priority | Fix | Owner | Status |
|---|---|---|---|
| P1 | Add a top-level Next Best Action card that chooses exactly one primary action for the user based on setup/workout/food/water/progress context. | Codex/Kimi/Human | Open |
| P1 | Remove or demote duplicate visible CTAs that compete with the chosen next best action. | Codex/Kimi/Human | Open |
| P1 | Add optimistic UI and pending states for dashboard water quick add. | Codex/Kimi/Human | Open |
| P1 | Add optimistic UI, pending state, and duplicate-tap protection for dashboard meal Done action. | Codex/Kimi/Human | Open |
| P1 | Redesign meal row actions so Done is dominant and Skip is clearly secondary/overflow. | Codex/Kimi/Human | Open |
| P1 | Replace meal type button cluster with cleaner segmented tabs or a calmer horizontal selector. | Codex/Kimi/Human | Open |
| P2 | Animate metric progress changes using the existing motion system or a shared animated progress primitive. | Codex/Kimi/Human | Open |
| P2 | Add smooth reduced-motion-safe expand/collapse transitions for Dashboard collapsible sections. | Codex/Kimi/Human | Open |
| P2 | Hide or defer weekly ChatGPT review until enough weekly data exists or until a more appropriate weekly review context. | Codex/Kimi/Human | Open |
| P2 | Tighten dashboard vertical rhythm from compact `space-y-3` to more deliberate premium spacing where screen density allows. | Codex/Kimi/Human | Open |

### Retest checklist

- [ ] One primary next action is obvious within two seconds.
- [ ] Duplicated CTAs are removed, demoted, or hidden.
- [ ] All dashboard tap targets remain at least 48 x 48 px effective hit area.
- [ ] Meal Done updates optimistically and rolls back on failure.
- [ ] Water quick add updates optimistically and rolls back on failure.
- [ ] Pending states prevent duplicate rapid taps.
- [ ] Skip actions are secondary and do not visually compete with Done.
- [ ] Metric progress changes animate without reanimating unnecessarily.
- [ ] Collapsible sections use smooth reduced-motion-safe transitions.
- [ ] Loading, empty, error, retry, and offline/sync behavior remain intact.
- [ ] Weekly ChatGPT review appears only when contextually useful.
- [ ] The route feels calm, deliberate, and subscription-ready on mobile.

### Exceptions accepted

- None.

---

## 5. Priority definitions

| Priority | Meaning |
|---|---|
| P0 | Blocks trust, safety, data integrity, accessibility, or core usability. Must fix before release. |
| P1 | Strongly damages premium feel, repeated daily use, perceived speed, or motion/interaction quality. Should fix before release. |
| P2 | Polish, consistency, or minor motion issue. Fix after P0/P1. |
| P3 | Optional enhancement. Do not distract from core audit fixes. |

---

## 6. Running audit log

Use this table to track audit events and implementation progress.

| Date | Route/Area | Action | Result | Commit/PR |
|---|---|---|---|---|
| 2026-07-06 | UX reference | Created constitution and progress tracker | Baseline created; no route scored yet | — |
| 2026-07-06 | Motion reference | Added motion and interaction standard | Motion now part of the UX constitution | `1eeabb2a0817d28960c2bed5de705a37d32afd80` |
| 2026-07-06 | UX progress tracker | Added motion scoring and audit checklist | Route audits now score interaction/motion quality explicitly | `bd347b1bcf531895e0a4642deb4059c6804ad7ca` |
| 2026-07-06 | `/dashboard` | Completed first route audit | Score 72/100; P1 fixes required before route is premium-ready | This commit |

---

## 7. Current recommended audit order

Audit mobile-first, then desktop only where layout differs.

Suggested order:

1. `/dashboard` — audited, fixes open
2. `/onboarding?edit=true`
3. `/my-workout/plans`
4. `/workouts/session/day/[dayId]`
5. `/calories`
6. `/my-meal-plan`
7. `/hydration`
8. `/wellness`
9. `/progress`
10. `/settings`
11. `/settings/ai-imports`
12. `/settings/data-privacy`

Reason: these routes carry the highest daily-use, trust, AI, motion, and future-subscription impact.

---

## 8. Agent instruction for future audits

When asking an AI agent to audit Plaivra UI/UX, include this instruction:

```txt
Use docs/ux-constitution/README.md and docs/ux-constitution/motion-and-interaction.md as the source of truth, and update docs/ux-progress/README.md with route-level audit results. Do not make subjective redesigns. Audit buttons, spacing, hierarchy, feedback, mobile tap comfort, loading/error/empty states, motion/interaction quality, reduced-motion behavior, AI action safety, privacy/destructive-action control, and subscription-readiness. Mark every finding with priority P0/P1/P2/P3 and a concrete recommended fix.
```
