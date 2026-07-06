# Plaivra UX Progress Tracker

**Version:** 2026.1  
**Status:** Active tracker  
**Source of truth:** `docs/ux-constitution/README.md`

This file tracks how close Plaivra is to the UI/UX constitution.

Do not mark a route as passed because it looks better. A route passes only when it has been audited against the constitution and the relevant issues were fixed or explicitly accepted as exceptions.

---

## 1. Scoring model

Each audited route receives a score out of 100.

| Category | Weight |
|---|---:|
| Route purpose and action hierarchy | 20 |
| Button size, placement, and hierarchy | 20 |
| Spacing consistency and visual rhythm | 15 |
| Feedback, optimistic UI, loading, and errors | 20 |
| Mobile-first behavior and tap comfort | 15 |
| Premium/subscription readiness | 10 |
| **Total** | **100** |

### Score interpretation

| Score | Meaning |
|---:|---|
| 90-100 | Release-grade. Only minor polish allowed. |
| 80-89 | Good but not premium enough yet. Needs targeted fixes. |
| 70-79 | Usable but visibly inconsistent. Needs UI/UX refactor. |
| 50-69 | Functional but not subscription-ready. |
| Below 50 | Failing route experience. Must be redesigned or simplified. |

### Status labels

| Status | Meaning |
|---|---|
| Not audited | No route-level audit has been completed yet. |
| Audited | Issues are documented, but fixes are not completed. |
| In progress | Fixes are being implemented. |
| Needs retest | Fixes were made and need verification. |
| Passed | Meets the constitution at release-grade level. |
| Exception accepted | Does not fully meet the constitution, but the exception is documented and approved. |

---

## 2. Global progress summary

Current global status: **Not audited yet against the 2026.1 constitution**

| Area | Status | Score | Notes |
|---|---|---:|---|
| Global app shell / navigation | Not audited | — | Needs mobile nav, safe area, action hierarchy, and offline banner review. |
| Dashboard | Not audited | — | Needs primary-action and quick-action audit. |
| Onboarding | Not audited | — | Needs step hierarchy, sticky actions, AI permissions, and target-weight logic review. |
| Workout plans | Not audited | — | Needs action density and plan-management button audit. |
| Workout day editor | Not audited | — | Needs edit-mode and destructive action audit. |
| Workout session | Not audited | — | Needs focused-session audit: no nav clutter, instant logging feedback, bottom actions. |
| Exercise library | Not audited | — | Needs filters, search, card actions, and custom-video action audit. |
| Workout history | Not audited | — | Needs empty/history/detail action audit. |
| Calories / food log | Not audited | — | Needs target editor, food logging, water logging, and tab/action audit. |
| Food Hub / custom foods and meals | Not audited | — | `/calories/custom-food-meal` redirects here; audit actual builder route. |
| Meal plan | Not audited | — | Needs add/edit/mark-done/shopping-list/AI action audit. |
| Weekly overview / reports | Not audited | — | Needs report navigation, filters, and empty-state audit. |
| Progress | Not audited | — | Needs add entry, photos, goal weight, edit/delete, and privacy-state audit. |
| Personal records | Not audited | — | Needs tracker and insight action audit. |
| Wellness hub | Not audited | — | Needs launcher-card hierarchy and daily check-in audit. |
| Hydration | Not audited | — | Needs quick-add, manual-add, delete, progress, and optimistic feedback audit. |
| Habits | Not audited | — | Needs repeated toggle/check behavior audit. |
| Sleep & recovery | Not audited | — | Needs form/action/feedback audit. |
| Supplements | Not audited | — | Needs dose/taken/reminder action audit. |
| Daily fit tasks | Not audited | — | Needs add/edit/complete/delete action audit. |
| Settings hub | Not audited | — | Needs category hierarchy and account-action audit. |
| Account settings | Not audited | — | Needs sign-out/delete-account/destructive separation audit. |
| AI imports / permissions | Not audited | — | Needs permission clarity, connection status, revoke, and ChatGPT flow audit. |
| Preferences | Not audited | — | Needs settings-row spacing, selects, toggles, and save feedback audit. |
| Data privacy | Not audited | — | Needs export, reset, privacy links, and dangerous-action hierarchy audit. |
| Public landing/auth | Not audited | — | Needs premium first impression, auth CTA, and trust audit. |

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
| Route purpose and action hierarchy | 0 | 20 |  |
| Button size, placement, and hierarchy | 0 | 20 |  |
| Spacing consistency and visual rhythm | 0 | 15 |  |
| Feedback, optimistic UI, loading, and errors | 0 | 20 |  |
| Mobile-first behavior and tap comfort | 0 | 15 |  |
| Premium/subscription readiness | 0 | 10 |  |
| **Total** | **0** | **100** |  |

### Button/action inventory

| Action | Current placement | Current type | Problem | Decision | Priority |
|---|---|---|---|---|---|
| Example action | Card footer | Primary | Too many primaries | Restyle to secondary | P1 |

### Constitution violations

| Rule violated | Evidence | Fix |
|---|---|---|
| 48px touch target | Example button is visually/tappably too small | Increase hit area to 48px |

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
- [ ] Tap feedback appears immediately.
- [ ] Loading, empty, error, and retry states are covered.
- [ ] The route feels subscription-ready.

### Exceptions accepted

- None.
```

---

## 4. Priority definitions

| Priority | Meaning |
|---|---|
| P0 | Blocks trust, safety, data integrity, or core usability. Must fix before release. |
| P1 | Strongly damages premium feel or repeated daily use. Should fix before release. |
| P2 | Polish or consistency issue. Fix after P0/P1. |
| P3 | Optional enhancement. Do not distract from core audit fixes. |

---

## 5. Running audit log

Use this table to track audit events and implementation progress.

| Date | Route/Area | Action | Result | Commit/PR |
|---|---|---|---|---|
| 2026-07-06 | UX reference | Created constitution and progress tracker | Baseline created; no route scored yet | — |

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

Reason: these routes carry the highest daily-use, trust, AI, and future-subscription impact.

---

## 7. Agent instruction for future audits

When asking an AI agent to audit Plaivra UI/UX, include this instruction:

```txt
Use docs/ux-constitution/README.md as the source of truth and update docs/ux-progress/README.md with route-level audit results. Do not make subjective redesigns. Audit buttons, spacing, hierarchy, feedback, mobile tap comfort, loading/error/empty states, AI action safety, and subscription-readiness. Mark every finding with priority P0/P1/P2/P3 and a concrete recommended fix.
```
