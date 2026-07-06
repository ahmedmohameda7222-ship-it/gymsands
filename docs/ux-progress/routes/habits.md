# Route Audit: `/habits`

**Audit date:** 2026-07-06  
**Auditor:** ChatGPT  
**Status:** Audited  
**Score:** 58 / 100  
**Flow decision:** Tune flow with optimistic habit toggles, streak-state clarity, and edit/delete safety

---

## Files inspected

- `app/(private)/habits/page.tsx`
- `components/lifestyle/wellness-trackers.tsx`
- `services/database/wellness.ts`
- `services/wellness/wellness-data.ts`
- Related context from:
  - `docs/ux-progress/routes/wellness.md`
  - `docs/ux-progress/routes/weekly-overview-reports.md`

---

## 1. Product role

`/habits` is Plaivra's daily behavior tracker. It is meant for small repeated actions that support nutrition, training, hydration, sleep, and consistency.

The route should answer:

```txt
What habits am I tracking today?
Which habits are done?
Can I quickly mark a habit done or reopen it?
Can I create or edit a habit without losing progress?
Can I trust the streak information?
Did a toggle/save/delete fail?
```

This route is not AI-first and not a planning route. It is a direct daily checklist and habit-streak route. ChatGPT can later help suggest habits explicitly, but the primary experience should be immediate check-off, reliable feedback, and clear streak history.

The current route has a useful base: add habit form, starter habit chips, daily completion progress, reusable ActionCard rows, edit/delete actions, and 14-day streak dots. The main issues are reliability and mobile interaction quality. Load failures are toast-only or swallowed as empty arrays, toggles wait for persistence without optimistic rollback, saves/deletes have no pending/error state, delete is immediate, edit mode is not clearly surfaced, and several controls are below the 48px target.

---

## 2. AI-first vs manual-entry role

Habits is direct repeated logging.

Expected hierarchy:

```txt
1. Today's habit completion status
2. One-tap habit toggles
3. Add/edit habit form
4. Starter habit shortcuts when empty
5. Streak history and recovery context
6. Safe edit/delete/retry states
```

Current hierarchy:

```txt
1. PageHeading
2. TrackerShell
3. Habit/Notes form and Save
4. Progress bar if habits exist
5. Starter buttons when empty
6. Action cards
7. Streak cards
```

The structure is close, but it needs stronger feedback loops for repeated daily actions.

---

## 3. User intent and entry points

| User intent | Expected route behavior |
|---|---|
| Mark a habit done | Instant optimistic feedback with rollback if save fails. |
| Reopen a habit | Same reliability as marking done. |
| Add a habit | Pending/saved/failure feedback and duplicate protection. |
| Add starter habit | Chip should show pending and not create duplicates. |
| Edit habit | Visible edit mode, cancel/discard, preserved completion status. |
| Delete habit | Confirmation or undo; no silent destructive deletion. |
| Understand streak | Streak dots should be labeled enough to trust. |
| Load fails | Inline ErrorState/retry; not an empty state. |
| No habits yet | Clear starter state with comfortable 48px chips. |

---

## 4. Current workflow map

```txt
Enter /habits
-> HabitsTracker loads today habits + 30-day history
-> form is visible
-> if no habits, starter habit buttons are visible
-> if habits exist, progress bar shows done count
-> user toggles done/reopen through ActionCard
-> user opens More -> Edit/Delete
-> streak cards show recent history
```

Strong points:

- Route is simple and focused.
- Progress bar makes today's completion visible.
- Starter habits lower setup friction.
- Habit streak cards exist and use real history.
- `calculateStreakStats` keeps the streak logic centralized.
- The tracker reuses a shared ActionCard pattern.
- Habit save preserves current completed state when editing.

Main workflow issues:

- Initial loading has no skeleton/status.
- Load failure is toast-only; service functions can also return `[]`, making failure look like no habits.
- Toggle waits for the database before UI update; no optimistic state or rollback.
- Toggle errors are not caught in the component.
- Save has no pending state, duplicate protection, inline error, or saved confirmation.
- Starter habit chips can create duplicate habits if tapped repeatedly.
- Delete is immediate with no confirmation or undo.
- Edit mode silently fills the form with no banner or cancel action.
- Field and select primitives in this shared file are `h-11`, below Plaivra's 48px target.
- ActionCard More summary is `h-11 w-11`; menu actions are `h-10`.
- Starter buttons use `size="sm"`, below 48px.
- Progress bar uses `transition-all` and does not explicitly respect reduced motion.
- Streak dots are tiny and mostly color/state-only; they need clearer accessibility labeling.
- History load failure can make streaks look like there is no habit history.

---

## 5. Recommended workflow map

```txt
Enter Habits
-> Loading / ErrorState / loaded state
-> Today status:
   -> done count
   -> progress
   -> next open habit
-> Habit cards:
   -> optimistic mark done / reopen
   -> per-row pending/failure
   -> 48px actions
-> Add/edit habit:
   -> create/edit mode
   -> pending/saved/failed
   -> cancel/discard edit
-> Streak history:
   -> loaded / failed / empty states
   -> accessible dots and labels
```

This is a **tune flow with optimistic habit toggles, streak-state clarity, and edit/delete safety** correction. Do not rebuild the tracker; harden repeated actions and state feedback.

---

## 6. Flow decision label

**Tune flow with optimistic habit toggles, streak-state clarity, and edit/delete safety.**

Keep the route direct and lightweight. Do not make ChatGPT primary.

---

## 7. Missing comments / microcopy

Add or improve copy for:

- “Mark done” / “Reopen” pending state.
- “Could not update habit. Restored previous status.”
- “Editing habit: [name].”
- “Cancel edit.”
- “Delete this habit for today?”
- “Deleted habit. Undo.”
- “No habits set today. Start with one small habit.”
- “Streaks are based on saved habit history.”
- “Habit history could not load. Today's habits are still shown.”

Avoid guilt-heavy language. Habits should be supportive and low pressure.

---

## 8. UI structure

Recommended structure:

```txt
1. Today habit status
2. Habit cards and quick toggles
3. Add/edit habit form
4. Starter chips when empty
5. Streak history
6. Loading/error/retry states
```

Current structural issues:

| Current object | Issue | Recommended change | Priority |
|---|---|---|---|
| Loading | Missing. | Add skeleton/status. | P1 |
| Error | Toast-only or empty. | Inline ErrorState/retry. | P1 |
| Toggle | No optimistic rollback. | Add optimistic toggle with rollback. | P1 |
| Save | No pending/error. | Add pending/saved/failed. | P1 |
| Delete | Immediate. | Confirm/undo. | P1 |
| Edit mode | Invisible. | Add edit banner and cancel. | P1 |
| Streaks | Tiny color-only dots. | Add accessible labels and failed-history state. | P2 |
| Controls | 40/44px patterns. | Resize to 48px. | P1 |

---

## 9. Buttons and action hierarchy

| Action | Current placement | Problem | Decision | Priority |
|---|---|---|---|---|
| Save habit | Form | No pending or failure state. | Add pending/saved/failed. | P1 |
| Starter habit chips | Empty state | `size=sm`, duplicate risk. | 48px and per-chip pending. | P1 |
| Mark done / Reopen | ActionCard | `h-11`, no optimistic rollback. | 48px optimistic toggle. | P1 |
| More menu | ActionCard | Summary `h-11`; actions `h-10`. | 48px summary/actions. | P1 |
| Edit | More menu | Edit mode invisible. | Edit banner + focus form. | P1 |
| Delete | More menu | Immediate destructive. | Confirm/undo. | P1 |
| Retry load | Missing | Failure looks empty. | Add retry. | P1 |

---

## 10. Loading / empty / success / error / pending states

| State | Current behavior | Problem | Required fix | Priority |
|---|---|---|---|---|
| Initial loading | No visible loading. | Empty can flash. | Skeleton/status. | P1 |
| Today habits failure | Toast or empty array. | Failed == empty. | Inline ErrorState/retry. | P1 |
| History failure | Streaks look empty. | Misleading. | Degraded streak state. | P1 |
| Toggle pending | None. | Slow/failed tap unclear. | Optimistic pending + rollback. | P1 |
| Toggle failure | Uncaught. | State can be wrong. | Restore previous state + inline/toast. | P1 |
| Save pending/failure | None. | Duplicate save risk. | Pending button and inline error. | P1 |
| Delete pending/failure | None. | Data loss/trust risk. | Confirm/undo + restore on failure. | P1 |
| Empty habits | Basic copy/chips. | Good base but small controls. | 48px chips and better guidance. | P2 |

---

## 11. Motion and interaction design

Habits should feel quick and calm.

Required motion behavior:

| Interaction | Current behavior | Problem | Required motion | Priority |
|---|---|---|---|---|
| Toggle habit | Waits and rerenders. | Tap may feel unregistered. | Immediate check/reopen feedback, reduced-motion-safe. | P1 |
| Progress bar | `transition-all`. | Needs reduced-motion respect. | Disable/reduce when reduceAnimations. | P2 |
| Delete habit | Row disappears. | Abrupt destructive change. | Confirm/undo or soft pending removal. | P1 |
| Edit habit | Form changes silently. | Disorienting. | Focus/banner, no heavy animation. | P1 |

No streak confetti. Use subtle saved/toggled states only.

---

## 12. Implementation risk

| Risk | Why it matters | Recommendation |
|---|---|---|
| `wellness-trackers.tsx` is shared. | Changes can affect tasks, supplements, sleep, and PRs. | Scope Habits-specific state carefully. |
| Services return [] on error. | UI cannot distinguish empty from failed. | Add component-level load state and source status where feasible. |
| Optimistic toggles affect streaks. | History must match reverted state on failure. | Update `items` and `history` together with rollback. |
| Starter chips can duplicate habits. | Duplicate records degrade habit history. | Disable chip while saving and prevent same-name duplicate for today. |
| Delete affects report history. | Removing habits changes weekly reports. | Confirm/undo and clear copy. |

---

## 13. Score breakdown

| Category | Score | Max | Notes |
|---|---:|---:|---|
| Route purpose and action hierarchy | 10 | 15 | Focused route with good direct-logging role. |
| Button size, placement, and hierarchy | 7 | 15 | Shared controls are under 48px. |
| Spacing consistency and visual rhythm | 8 | 10 | Clean and compact, but some rows are dense. |
| Feedback, optimistic UI, loading, and errors | 5 | 15 | No optimistic rollback and weak load/error states. |
| Motion and interaction quality | 6 | 15 | Progress/toggles need state-based motion. |
| Mobile-first behavior and tap comfort | 8 | 10 | Good card layout; control sizing needs work. |
| AI safety, privacy, and high-risk action control | 8 | 10 | Correctly not AI-first; delete safety missing. |
| Premium/subscription readiness | 6 | 10 | Useful daily route but weak reliability states. |
| **Total** | **58** | **100** | Solid foundation; repeated-action feedback and safety need hardening. |

---

## 14. Constitution violations

| Rule violated | Evidence | Fix |
|---|---|---|
| Loading/error state clarity | Failed load can look empty. | Skeleton + ErrorState/retry. |
| 48px tap target baseline | `h-11`, `h-10`, `size=sm`. | Resize controls. |
| Feedback loop completeness | Toggle/save/delete lack pending/failure states. | Add optimistic state and recovery. |
| High-risk action confirmation | Delete is immediate. | Confirm/undo. |
| Reduced-motion care | Progress uses `transition-all`. | Respect reduced-motion settings. |

---

## 15. Required fixes

| Priority | Fix | Owner | Status |
|---|---|---|---|
| P1 | Add loading skeleton/status for habits and history. | Codex/Kimi/Human | Open |
| P1 | Add inline ErrorState/retry; failed load must not look empty. | Codex/Kimi/Human | Open |
| P1 | Add optimistic mark done/reopen with rollback and per-row pending. | Codex/Kimi/Human | Open |
| P1 | Add save pending, duplicate protection, inline failure, and saved state. | Codex/Kimi/Human | Open |
| P1 | Add visible edit mode banner plus Cancel/Discard. | Codex/Kimi/Human | Open |
| P1 | Add delete confirmation or undo with failure recovery. | Codex/Kimi/Human | Open |
| P1 | Resize starter chips, ActionCard controls, inputs, and menu actions to 48px. | Codex/Kimi/Human | Open |
| P1 | Prevent duplicate starter habit creation for the same day. | Codex/Kimi/Human | Open |
| P2 | Add accessible labels/tooltips for streak dots. | Codex/Kimi/Human | Open |
| P2 | Add degraded state when history fails but today's habits load. | Codex/Kimi/Human | Open |
| P2 | Respect reduced-motion for progress bar and toggle feedback. | Codex/Kimi/Human | Open |

---

## 16. Retest checklist

- [ ] `/habits` shows skeleton/status while loading.
- [ ] Failed today-habits load shows retry and does not look empty.
- [ ] Failed history load shows degraded streak state.
- [ ] Mark done/reopen updates immediately and rolls back on failure.
- [ ] Save failure preserves draft.
- [ ] Starter habit chips do not create duplicates from repeated taps.
- [ ] Edit mode is visible and Cancel/Discard works.
- [ ] Delete requires confirmation or undo and recovers on failure.
- [ ] Starter chips, Mark done, More, Edit, Delete, input, and select controls are 48px on 390x844.
- [ ] Streak dots have accessible labels or clear non-color context.
- [ ] Weekly reports still read habit completion correctly.
- [ ] No schema, auth, AI import/apply behavior, global theme, or unrelated tracker regressions.

---

## 17. Codex prompt section

Use this route with repeated-action reliability and shared-component regression review.

```txt
/caveman lite

$memory-management $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + repeated-action reliability reviewer + shared-component regression reviewer
```

Implementation should not change database schema, auth behavior, AI import/apply behavior, global theme, or unrelated wellness tracker behavior.

---

## 18. Implementation note

Do not rebuild Habits. Preserve the current capability set:

```txt
Add habit -> starter habits -> daily toggle cards -> progress -> streak history
```

The highest-value correction is repeated-action reliability:

```txt
Load confidence -> optimistic toggles -> safe save/edit/delete -> accessible streaks -> 48px controls
```
