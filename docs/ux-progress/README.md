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

Current global status: **Not audited yet against the 2026.1 constitution and motion standard**

| Area | Status | Score | Notes |
|---|---|---:|---|
| Global app shell / navigation | Not audited | — | Needs mobile nav, safe area, action hierarchy, route transitions, active states, and offline/sync banner review. |
| Dashboard | Not audited | — | Needs primary-action, quick-action, live-card feedback, progress motion, loading, and empty-state audit. |
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

## 4. Priority definitions

| Priority | Meaning |
|---|---|
| P0 | Blocks trust, safety, data integrity, accessibility, or core usability. Must fix before release. |
| P1 | Strongly damages premium feel, repeated daily use, perceived speed, or motion/interaction quality. Should fix before release. |
| P2 | Polish, consistency, or minor motion issue. Fix after P0/P1. |
| P3 | Optional enhancement. Do not distract from core audit fixes. |

---

## 5. Running audit log

Use this table to track audit events and implementation progress.

| Date | Route/Area | Action | Result | Commit/PR |
|---|---|---|---|---|
| 2026-07-06 | UX reference | Created constitution and progress tracker | Baseline created; no route scored yet | — |
| 2026-07-06 | Motion reference | Added motion and interaction standard | Motion now part of the UX constitution | `1eeabb2a0817d28960c2bed5de705a37d32afd80` |
| 2026-07-06 | UX progress tracker | Added motion scoring and audit checklist | Route audits now score interaction/motion quality explicitly | This commit |

---

## 6. Current recommended audit order

Audit mobile-first, then desktop only where layout differs.

Suggested order:

1. `/dashboard`
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

## 7. Agent instruction for future audits

When asking an AI agent to audit Plaivra UI/UX, include this instruction:

```txt
Use docs/ux-constitution/README.md and docs/ux-constitution/motion-and-interaction.md as the source of truth, and update docs/ux-progress/README.md with route-level audit results. Do not make subjective redesigns. Audit buttons, spacing, hierarchy, feedback, mobile tap comfort, loading/error/empty states, motion/interaction quality, reduced-motion behavior, AI action safety, privacy/destructive-action control, and subscription-readiness. Mark every finding with priority P0/P1/P2/P3 and a concrete recommended fix.
```
