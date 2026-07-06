# Plaivra Motion & Interaction Standard

**Version:** 2026.1  
**Status:** Required part of the Plaivra UX Constitution  
**Parent standard:** `docs/ux-constitution/README.md`  
**Purpose:** Define how Plaivra should feel alive, responsive, premium, and non-static without becoming visually noisy or slow.

---

## 1. Core principle

Plaivra motion exists to explain cause and effect, confirm user input, reduce perceived waiting, guide attention, and make important completion moments feel satisfying.

Motion is not decoration.

A motion pattern is allowed only if it answers at least one of these questions:

```txt
- Did the user's tap register?
- What changed?
- Where did this element come from?
- Where did it go?
- What should the user do next?
- Is something still saving, syncing, loading, or failing?
- Is this an important completion moment worth acknowledging?
```

If the answer is no, the animation is probably unnecessary.

---

## 2. Reference inputs

These references inform the Plaivra motion system. They are not competing rules.

- Apple / WWDC — Designing Fluid Interfaces  
  https://developer.apple.com/videos/play/wwdc2018/803/
- Apple / WWDC — Meet Liquid Glass  
  https://developer.apple.com/videos/play/wwdc2025/219/
- Atlassian Design System — Motion  
  https://atlassian.design/foundations/motion/
- IBM Carbon Design System — Motion  
  https://carbondesignsystem.com/elements/motion/overview/
- Nielsen Norman Group — Response-time limits  
  https://www.nngroup.com/articles/response-times-3-important-limits/
- Nielsen Norman Group — Visibility of system status  
  https://www.nngroup.com/articles/visibility-system-status/
- WCAG 2.2 — Animation from interactions  
  https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html
- MDN — prefers-reduced-motion  
  https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion

---

## 3. What Plaivra must avoid

AI-generated or low-quality apps often feel static or unfinished because they lack meaningful interaction feedback.

Plaivra must avoid:

```txt
1. Static taps with no immediate feedback.
2. Buttons that wait for server sync before visually changing.
3. Generic spinners everywhere.
4. Same animation on every route.
5. Page transitions with no spatial logic.
6. Missing success states.
7. Missing error recovery states.
8. Animations that are decorative but do not clarify anything.
9. Animations that delay repeated daily actions.
10. No reduced-motion support.
```

Plaivra should feel responsive, calm, and deliberate, not animated for entertainment.

---

## 4. Motion hierarchy

Plaivra uses three motion levels.

| Level | Name | Usage | Character |
|---|---|---|---|
| 1 | Micro-feedback | Buttons, toggles, checkmarks, quick logs | Immediate, tactile, tiny |
| 2 | Productive motion | State changes, expand/collapse, route/sheet transitions | Clear, subtle, fast |
| 3 | Expressive motion | Workout completed, weekly target hit, import success | Rare, satisfying, controlled |

Most Plaivra motion should be Level 1 or Level 2. Level 3 is reserved for important moments only.

---

## 5. Motion tokens

Do not invent random durations for every component. Use these tokens unless there is a documented reason not to.

| Token | Duration | Use |
|---|---:|---|
| `motion.instant` | 80 ms | Press feedback, active state response |
| `motion.fast` | 120 ms | Toggle/check feedback, small status change |
| `motion.quick` | 180 ms | Small reveal, inline validation, compact expansion |
| `motion.standard` | 240 ms | Page content transition, card state transition |
| `motion.sheet` | 320 ms | Bottom sheet or dialog enter/exit |
| `motion.expressive` | 500 ms | Important success/state moment |
| `motion.celebrate` | 700 ms | Rare completion moment only |

### Timing rules

```txt
- Repeated daily actions should feel instant: 80-180 ms.
- Page and card transitions should normally stay under 260 ms.
- Sheets/dialogs can use 250-350 ms.
- Expressive animations should be rare and normally stay under 700 ms.
- Exit animations should usually be faster than entrance animations.
```

---

## 6. Easing rules

Use a small set of easing patterns.

| Easing | Use |
|---|---|
| `ease-out` | Entrances, new content, press release, success reveal |
| `ease-in` | Exits, removals, dismissals |
| `ease-in-out` | Repositioning, page transition, modal scale |
| Spring | Only for tactile microinteractions, never uncontrolled bounce |

Avoid:

```txt
- Bounce everywhere.
- Elastic movement everywhere.
- Sudden stops.
- Long slow fades.
- Random spring values.
- Decorative animation that draws attention away from the user's task.
```

---

## 7. Required interaction feedback

Every tap must visibly respond immediately, even if server sync is still pending.

| Interaction | Required feedback |
|---|---|
| Button press | Pressed/active state under 100 ms |
| Toggle/check | Immediate visual state change, optimistic if safe |
| Save | Pending state immediately, success/error after result |
| Delete/remove | Confirmation or undo, then removal motion |
| Add item | Item appears immediately or with clear pending state |
| AI request | Prepare/copy/open/apply flow must show current state |
| Import/export | Clear progress or pending status |
| Network failure | Revert if needed + visible error/retry |

The user should never wonder whether their tap worked.

---

## 8. Optimistic interaction rules

Use optimistic UI for low-risk, repeated actions where immediate response improves trust.

Good candidates:

```txt
- Log water.
- Mark meal done.
- Mark habit done.
- Mark supplement taken.
- Complete daily task.
- Complete workout set.
- Toggle favorite/saved state.
- Save small preference.
```

If the server fails:

```txt
1. Revert the optimistic state.
2. Show a clear toast or inline error.
3. Keep the user in control.
4. Avoid duplicate submissions.
```

Do not use blind optimistic UI for:

```txt
- Delete account.
- Delete workout plan permanently.
- Cancel subscription.
- Payments.
- Revoke AI permissions.
- Major plan overwrite.
- Bulk delete.
- Medical/safety-sensitive actions.
```

These require confirmation, review, undo, or clearly visible pending state.

---

## 9. Motion categories

### 9.1 Micro-feedback

Used for:

```txt
Button press
Toggle
Checkbox
Habit complete
Water log
Meal done
Set complete
Save preference
```

Standard:

```txt
Duration: 80-120 ms
Effect: subtle scale, opacity, background shift, checkmark reveal
Must start immediately
Must not block the next user action
```

### 9.2 State transitions

Used for:

```txt
Not done -> done
Empty -> has data
Collapsed -> expanded
Disconnected -> connected
Unsaved -> saved
```

Standard:

```txt
Duration: 150-220 ms
Effect: fade + small slide, height expansion, checkmark, progress update
Avoid dramatic movement
```

### 9.3 Route transitions

Web apps do not need heavy page animation, but mobile-first routes should not feel like disconnected static pages.

Standard:

```txt
Duration: 180-260 ms
Effect: subtle fade + 8-16 px movement
Direction must be consistent
Back navigation should feel spatially related to forward navigation
Avoid random zoom/fade/slide combinations
```

### 9.4 Bottom sheets and dialogs

Used for quick contextual tasks and short decisions.

Standard:

```txt
Bottom sheet: slide from bottom + fade backdrop
Dialog: subtle scale/fade if centered
Duration: 250-350 ms
Exit slightly faster than entrance
Backdrop should not feel slow
```

### 9.5 Success moments

Used only for meaningful completion.

Good candidates:

```txt
Workout completed
Meal plan saved
Weekly goal reached
Hydration target completed
AI request copied
ChatGPT connection successful
Data export ready
Onboarding completed
```

Standard:

```txt
Duration: 400-700 ms
Effect: calm checkmark, progress fill, subtle celebration, completion card
Use rarely
Reduced motion: replace with static success state
```

Do not celebrate every small save. Repeated daily apps must stay efficient.

### 9.6 Error moments

Used for failed actions, missing fields, permission problems, and connection failures.

Standard:

```txt
Input error: highlight or tiny shake, 120-180 ms
Page error: static error card + retry action
Permission error: explain what access is missing and how to fix it
Destructive error: clear explanation, no playful motion
```

Errors must feel serious, useful, and recoverable.

### 9.7 Data visualization motion

Used for charts, progress bars, rings, streaks, and summaries.

Standard:

```txt
Charts animate on first meaningful load only
Numbers may count smoothly only for important metrics
Progress bars/rings animate from previous value to new value
Duration: 400-800 ms
Avoid reanimating every render
Avoid visual motion that hides exact values
```

---

## 10. Section-level motion direction

Different sections should not share the same animation personality. Motion must fit the section's job.

| Section | Motion character | Recommended motion |
|---|---|---|
| Dashboard | Alive but calm | Subtle card reveal, progress updates, quick-action feedback |
| Onboarding | Guided and smooth | Step transition, progress indicator movement, calm completion state |
| Workout plans | Organized and editable | Card reveal, default-plan selection feedback, edit-mode transitions |
| Workout session | Fast and tactile | Set-complete feedback, rest timer motion, sticky action response |
| Exercise library | Search/filter clarity | Filter chip transitions, result count update, card expand/detail reveal |
| Calories / food log | Fast repeated logging | Add-to-log feedback, macro progress update, safe optimistic actions |
| Food Hub / custom foods | Builder-focused | Form reveal, validation feedback, save success state |
| Meal plan | Planned-to-done clarity | Mark-done transition, shopping checklist feedback, planned totals update |
| Hydration | Progress/fill feeling | Quick-add feedback, water/progress fill, target reached moment |
| Progress | Calm data confidence | Chart transitions, measurement update, privacy/photo state transitions |
| Personal records | Achievement | PR update highlight, small achievement feedback |
| Wellness / habits | Calm consistency | Check/streak microinteractions, gentle completion |
| Sleep & recovery | Quiet and low-stimulation | Minimal transitions, calm cards, no energetic motion |
| Supplements | Checklist-like | Taken state feedback, reminder status change |
| Daily fit tasks | Lightweight completion | Task done transition, small streak/status feedback |
| Settings | Minimal and stable | Row transitions only, no expressive animation |
| AI permissions/imports | Trust and status clarity | Prepare -> copy -> open -> apply status choreography |
| Data privacy | Serious and controlled | Minimal motion, strong confirmation states, no playful effects |
| Public landing/auth | Polished first impression | Subtle entrance, CTA feedback, no slow hero gimmicks |

---

## 11. Reduced motion and accessibility

Plaivra must respect reduced-motion preferences.

Rules:

```txt
- Detect prefers-reduced-motion on web.
- Remove non-essential decorative motion.
- Replace long transitions with instant or short fades.
- Keep functional feedback visible even when motion is reduced.
- Do not rely on motion alone to communicate success, failure, or navigation.
```

Reduced motion does not mean no feedback. It means no unnecessary movement.

---

## 12. Implementation expectations

When implementing motion in Plaivra:

```txt
- Centralize motion tokens instead of scattering random durations.
- Prefer reusable motion variants/components.
- Do not animate layout in ways that cause jank.
- Avoid repeated chart animations on every render.
- Avoid delaying navigation for animation.
- Keep server state and visual state synchronized clearly.
- Prevent duplicate submissions during pending actions.
- Always include loading/success/error/retry states where relevant.
```

For Framer Motion or CSS animations, prefer simple reusable patterns:

```txt
- pressable
- fadeIn
- slideUpSmall
- sheetIn
- cardReveal
- listItemEnter
- successCheck
- errorHighlight
- progressFill
```

Do not create one-off animations for every route unless the route genuinely needs a unique pattern.

---

## 13. Motion audit checklist

Use this checklist when auditing each route:

```txt
1. Does every tap provide feedback under 100 ms?
2. Are safe repeated actions optimistic where appropriate?
3. Are risky actions protected instead of blindly optimistic?
4. Are loading states visible and contextual?
5. Are success states present for meaningful completion moments?
6. Are error states clear and recoverable?
7. Do route/sheet transitions have spatial logic?
8. Is motion used to clarify change rather than decorate?
9. Is repeated daily use kept fast?
10. Are animations section-appropriate rather than generic?
11. Are chart/progress animations controlled and not repeated unnecessarily?
12. Is reduced-motion supported?
13. Does the motion make Plaivra feel premium, calm, and deliberate?
```

---

## 14. Definition of done for motion changes

A motion change is done only when:

- It supports a clear user or product purpose.
- It does not delay repeated daily actions.
- It follows the Plaivra motion tokens.
- It includes reduced-motion behavior where relevant.
- It improves perceived responsiveness or clarity.
- It does not introduce distracting visual noise.
- It works on mobile-first web and can translate later to iOS/Android.
- It is documented in the UX progress tracker if part of a route audit.

---

## 15. Agent instruction

When asking a coding agent to implement or audit motion, include this instruction:

```txt
Follow docs/ux-constitution/README.md and docs/ux-constitution/motion-and-interaction.md as the source of truth. Do not add decorative animation by taste. Add motion only where it improves feedback, state clarity, navigation clarity, perceived speed, completion, or error recovery. Use centralized motion tokens, respect reduced-motion preferences, and keep repeated daily actions fast.
```
