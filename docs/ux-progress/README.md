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

Current global status: **Dashboard and onboarding audited; remaining routes are not audited yet against the 2026.1 constitution and motion standard.**

| Area | Status | Score | Notes |
|---|---|---:|---|
| Global app shell / navigation | Not audited | — | Needs mobile nav, safe area, action hierarchy, route transitions, active states, and offline/sync banner review. |
| Dashboard | Audited | 72 | Strong foundation with skeleton/error/empty states and some motion, but not premium-ready yet. Needs clearer primary action, reduced action density, stronger optimistic feedback, better section-level motion, and tighter mobile action grouping. |
| Onboarding | Audited | 66 | Functional but not launch-quality. Needs conditional target-weight logic, saved-answer loading state, step motion, reduced action density, stronger validation, and 48px touch target cleanup. |
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

## 3. Completed route audits

## Route: `/dashboard`

**Audit date:** 2026-07-06  
**Auditor:** ChatGPT  
**Status:** Audited  
**Score:** 72 / 100

### Route purpose

Primary job of this route:

- Show the user's current day status and push them toward the next best daily action without overwhelming them.

Expected primary action:

- Surface one strongest next action based on today's context: start/resume workout, log food, complete planned meal, add water, or finish setup.

### Score breakdown

| Category | Score | Max | Notes |
|---|---:|---:|---|
| Route purpose and action hierarchy | 10 | 15 | Strong daily scope, but setup, workout, meal, shopping, quick actions, check-ins, and AI review compete. |
| Button size, placement, and hierarchy | 11 | 15 | Base button is strong, but dense small actions need better grouping. |
| Spacing consistency and visual rhythm | 7 | 10 | Mostly on-scale, but several sections feel compact rather than premium. |
| Feedback, optimistic UI, loading, and errors | 11 | 15 | Good skeleton/empty/error states; water and meal done need optimistic behavior. |
| Motion and interaction quality | 9 | 15 | Motion primitives exist; collapsibles and progress changes need better state motion. |
| Mobile-first behavior and tap comfort | 8 | 10 | Generally mobile-safe; meal rows can become cramped. |
| AI safety, privacy, and destructive-action control | 9 | 10 | Weekly ChatGPT review is contextual; deeper AI audit still pending. |
| Premium/subscription readiness | 7 | 10 | Useful but too dense and utility-like. |
| **Total** | **72** | **100** | Usable, not premium-ready. |

### Required fixes

| Priority | Fix | Owner | Status |
|---|---|---|---|
| P1 | Add a top-level Next Best Action card that chooses exactly one primary action. | Codex/Kimi/Human | Open |
| P1 | Remove or demote duplicate visible CTAs that compete with the chosen next action. | Codex/Kimi/Human | Open |
| P1 | Add optimistic UI and pending state for dashboard water quick add. | Codex/Kimi/Human | Open |
| P1 | Add optimistic UI, pending state, and duplicate-tap protection for dashboard meal Done. | Codex/Kimi/Human | Open |
| P1 | Redesign meal row actions so Done is dominant and Skip is clearly secondary/overflow. | Codex/Kimi/Human | Open |
| P1 | Replace meal type button cluster with a calmer segmented/horizontal selector. | Codex/Kimi/Human | Open |
| P2 | Animate metric progress changes using the existing motion system or a shared animated progress primitive. | Codex/Kimi/Human | Open |
| P2 | Add reduced-motion-safe expand/collapse transitions for dashboard collapsible sections. | Codex/Kimi/Human | Open |
| P2 | Hide or defer weekly ChatGPT review until enough weekly data exists or a more appropriate weekly review context. | Codex/Kimi/Human | Open |
| P2 | Tighten vertical rhythm where screen density allows. | Codex/Kimi/Human | Open |

---

## Route: `/onboarding?edit=true`

**Audit date:** 2026-07-06  
**Auditor:** ChatGPT  
**Status:** Audited  
**Score:** 66 / 100

### Route purpose

Primary job of this route:

- Let an existing user review and edit their profile setup, goals, training preferences, schedule, food preferences, coaching context, and AI permissions without corrupting saved state or creating irrelevant fields.

Expected primary action:

- Step through setup calmly, make only relevant edits, then save the full profile safely with clear pending/success/error feedback.

Current assessment:

- The route is functional and has a clear 8-step structure, progress indicator, sticky bottom actions, safe-area padding, and save pending state.
- It is not release-grade because it has a stale-data/loading risk, no step transition motion, several sub-48px controls, and a major relevance bug: Goal weight is always shown regardless of selected goals.
- AI permissions default to custom/no access, which is safer, but the full-access copy and write toggles need stronger trust framing before native/subscription launch.

### Score breakdown

| Category | Score | Max | Notes |
|---|---:|---:|---|
| Route purpose and action hierarchy | 9 | 15 | Clear step flow, but 8 direct step buttons plus Back/Next create a lot of visible navigation. The edit route lacks a calm saved-state loading gate. |
| Button size, placement, and hierarchy | 9 | 15 | Main sticky actions are good; several controls use 44px (`min-h-11`, `h-11`, `w-11`) instead of the 48px constitution baseline. |
| Spacing consistency and visual rhythm | 7 | 10 | Mostly p-4/gap-4/space-y-4; some dense permission and step-chip areas feel administrative rather than premium. |
| Feedback, optimistic UI, loading, and errors | 8 | 15 | Save pending exists, but initial saved-answer loading has no clear loading state, no retry state, and can overwrite edits if the user starts before fetch completes. |
| Motion and interaction quality | 5 | 15 | Step content switches by conditional render with no transition; progress bar and step chips are mostly static. |
| Mobile-first behavior and tap comfort | 7 | 10 | Sticky bottom nav and safe area are good. Horizontal 8-step chips and 44px controls need cleanup for small screens. |
| AI safety, privacy, and destructive-action control | 8 | 10 | Default custom/no access is safe. Full AI Access and write access need stronger explicit framing and review summary before save. |
| Premium/subscription readiness | 7 | 10 | Useful but still feels form-heavy and slightly admin-like. Needs fewer visible choices per step and better progressive disclosure. |
| **Total** | **66** | **100** | Functional, but not launch/subscription-ready. |

### Button/action inventory

| Action | Current placement | Current type | Problem | Decision | Priority |
|---|---|---|---|---|---|
| Horizontal step buttons | Card header | Direct navigation buttons | 8 visible buttons create dense navigation and allow jumping while saved data may still be loading. | Keep but restyle/demote into compact stepper; disable until saved answers load. | P1 |
| Back | Sticky bottom bar | Secondary outline | Good location, but should remain 48px effective height. | Keep. | P2 |
| Next | Sticky bottom bar | Primary | Correct action, but it advances without validating/relevance checks. | Keep; add lightweight step validation/relevance handling. | P1 |
| Save profile | Sticky bottom final step | Primary pending action | Good pending spinner, but no success state before redirect besides toast/celebration. | Keep; ensure no double submit and keep redirect safe. | P2 |
| Goal weight input | Goals step | Numeric input | Always visible even for non-weight goals. | Show only for weight/body-composition goals or existing saved target weight. | P0 |
| AI Access Mode | AI Permissions step | Choice group | Full access is available but not framed strongly enough as broad read/write access. | Keep; add clearer explanation and safer summary. | P1 |
| Permission Read/Write toggles | AI Permissions step | Tiny segmented buttons | `min-h-11` and dense two-column controls; write enabling read is good but should be more explicit. | Resize to 48px effective area and improve microcopy. | P1 |
| Schedule day buttons | Schedule step | Number grid buttons | Uses `min-h-11`, below 48px standard. | Resize to 48px effective area. | P1 |
| Stepper plus/minus | Schedule step | Icon buttons | `h-11 w-11`, below 48px standard. | Resize to 48px. | P1 |

### Motion/interaction inventory

| Interaction | Current behavior | Problem | Required standard | Decision | Priority |
|---|---|---|---|---|---|
| Initial saved setup load | Async `Promise.all` updates state after render | User can interact with defaults before saved data resolves; late response can overwrite edits. | Loading/pending state with no stale overwrite risk. | Add `isLoadingSavedSetup` gate for edit mode. | P1 |
| Step transition | Conditional render by `step === n` | Abrupt, static page swap. | 180-260ms route/step transition with reduced-motion fallback. | Add subtle fade/slide step transition. | P1 |
| Progress bar | Static Progress value update | Functional but not expressive enough for onboarding. | Progress should animate from previous to new value. | Use existing motion/progress primitive or small transition. | P2 |
| Choice selection | Active style changes immediately | Good basic feedback. | Micro-feedback under 100ms. | Keep; ensure tap target baseline. | P2 |
| Save profile | Spinner and disabled button | Good pending state. | Pending state and duplicate submit protection. | Keep. | P2 |
| AI permission toggle | Immediate active style | Good but dense. | Clear state change plus accessible tap target. | Resize and clarify. | P1 |

### Constitution violations

| Rule violated | Evidence | Fix |
|---|---|---|
| Relevant fields only | Goal weight is rendered unconditionally on Goals step. | Show target weight only for weight/body-composition goals or if saved target weight exists. |
| 48px touch target baseline | Several controls use `min-h-11`, `h-11`, or `w-11`. | Resize step chips, schedule buttons, steppers, and permission toggles to at least 48px effective hit area. |
| Loading/error state coverage | Saved onboarding and AI permissions load without route-level loading/retry state. | Add edit-mode loading gate and non-destructive retry/error handling. |
| Motion should clarify state changes | Step content swaps with no transition. | Add reduced-motion-safe step transition. |
| Premium forms reduce cognitive load | Eight step buttons and dense permission grids feel administrative. | Compact/demote step navigation and improve progressive disclosure in AI permissions. |

### Required fixes

| Priority | Fix | Owner | Status |
|---|---|---|---|
| P0 | Fix conditional Target weight visibility in Goals step. | Codex/Kimi/Human | Open |
| P1 | Add an edit-mode saved-answer loading gate to prevent default-state interaction and late overwrite. | Codex/Kimi/Human | Open |
| P1 | Add lightweight step transition motion with reduced-motion fallback. | Codex/Kimi/Human | Open |
| P1 | Resize step chips, schedule buttons, stepper buttons/inputs, and permission toggles to 48px effective tap targets. | Codex/Kimi/Human | Open |
| P1 | Improve AI permissions trust framing: explain read/write impact and summarize selected access before save. | Codex/Kimi/Human | Open |
| P1 | Make step navigation calmer on mobile; avoid the 8-chip strip feeling like the main control surface. | Codex/Kimi/Human | Open |
| P2 | Animate onboarding progress value using existing motion tokens. | Codex/Kimi/Human | Open |
| P2 | Add simple per-step validation or guidance before Next where fields are relevant. | Codex/Kimi/Human | Open |
| P2 | Improve save success state if redirect feels abrupt. | Codex/Kimi/Human | Open |

### Retest checklist

- [ ] Target weight is hidden for non-weight goals when no saved target weight exists.
- [ ] Target weight remains visible if a weight/body-composition goal is selected.
- [ ] Target weight remains visible if a saved target weight exists, even after non-weight goal changes, with clear context.
- [ ] Edit mode waits for saved onboarding/AI permission data before the user can edit defaults.
- [ ] Late saved-data load cannot overwrite user edits made after loading completes.
- [ ] All step chips, schedule buttons, steppers, and permission toggles meet 48px effective tap target.
- [ ] Step changes use subtle reduced-motion-safe transitions.
- [ ] AI Full Access and Write Access copy clearly explains broad access before saving.
- [ ] Back/Next/Save remain sticky, mobile-safe, and clear.
- [ ] Save profile still persists onboarding, profile target/body goal, and AI permissions correctly.
- [ ] The route feels guided and calm rather than form-heavy/admin-like.

### Exceptions accepted

- None.

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
| 2026-07-06 | UX progress tracker | Added motion scoring and audit checklist | Route audits now score interaction/motion quality explicitly | `bd347b1bcf531895e0a4642deb4059c6804ad7ca` |
| 2026-07-06 | `/dashboard` | Completed first route audit | Score 72/100; P1 fixes required before route is premium-ready | `2f636e072f82a31d85c824e15de8791c02f02e60` |
| 2026-07-06 | `/onboarding?edit=true` | Completed route audit | Score 66/100; P0/P1 fixes required before route is premium-ready | This commit |

---

## 6. Current recommended audit order

Audit mobile-first, then desktop only where layout differs.

Suggested order:

1. `/dashboard` — audited, fixes open
2. `/onboarding?edit=true` — audited, fixes open
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
