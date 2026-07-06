# Route Audit: `/daily-fit-tasks`

**Audit date:** 2026-07-06  
**Auditor:** ChatGPT  
**Status:** Audited  
**Score:** 61 / 100  
**Flow decision:** Tune flow with optimistic completion, edit-state clarity, and task safety hardening

---

## Files inspected

- `app/(private)/daily-fit-tasks/page.tsx`
- `components/lifestyle/daily-fit-tasks-page-client.tsx`
- `components/lifestyle/wellness-trackers.tsx`
- `services/database/wellness.ts`
- Related context from:
  - `docs/ux-progress/routes/habits.md`
  - `docs/ux-progress/routes/wellness.md`

---

## 1. Product role

`/daily-fit-tasks` is Plaivra's lightweight daily action checklist. It is for one-off fitness tasks that support movement, nutrition, recovery, and consistency.

The route should answer:

```txt
What small fitness tasks do I need to do today?
Which tasks are complete?
Can I quickly mark a task done or reopen it?
Can I add, edit, or remove a task safely?
Did saving, completing, or removing fail?
Can I start from useful suggested tasks without creating duplicates?
```

This route is not AI-first and not a full planning route. It is a direct daily checklist. ChatGPT suggestions can later exist as explicit assistance, but the core value is fast task completion, reliable state feedback, and low-friction daily use.

The current route is stronger than several other checklist routes because it already has a dedicated client component, loading state, load error, retry button, save pending state, and a completion celebration hook. The remaining issues are repeated-action reliability and mobile polish: completion is not optimistic, failed completion is toast-only, remove is immediate, edit mode is not visible, starter tasks can duplicate, loading is plain text, and several controls are below the 48px target.

---

## 2. AI-first vs manual-entry role

Daily Fit Tasks is direct checklist logging.

Expected hierarchy:

```txt
1. Today's task status
2. Task cards with quick complete/reopen
3. Add/edit task form
4. Starter tasks when empty
5. Safe save/edit/remove/retry states
```

Current hierarchy:

```txt
1. PageHeading
2. Card / Daily Fit Tasks header
3. Add/edit form
4. Progress card if tasks exist
5. Plain loading text or load error block
6. Starter tasks when empty
7. Task cards
```

The route has the right structure, but the form-first order can feel less immediate than a checklist. Completion and task cards should feel primary once tasks exist.

---

## 3. User intent and entry points

| User intent | Expected route behavior |
|---|---|
| Complete a task | Instant optimistic mark done with rollback on failure. |
| Reopen a task | Same reliability as completion. |
| Add a task | Save pending/saved/failure feedback and duplicate protection. |
| Add starter task | Prevent repeated taps from creating duplicates. |
| Edit task | Visible edit mode, cancel/discard, form focus. |
| Remove task | Confirmation or undo; no immediate destructive removal. |
| Load fails | Inline retry state that does not look empty. |
| No tasks today | Friendly starter state with comfortable 48px chips. |

---

## 4. Current workflow map

```txt
Enter /daily-fit-tasks
-> DailyFitTasksPageClient loads today's tasks
-> if loading, show plain loading text
-> if load fails, show inline error block with Retry
-> form is visible
-> if tasks exist, progress card appears
-> if none, starter task buttons appear
-> task cards allow Mark done/Reopen, Edit, Delete
```

Strong points:

- Route has a dedicated client component instead of only the generic shared tracker.
- It has explicit `isLoading`, `isSaving`, and `loadError` state.
- It includes inline retry for failed load.
- Save button has pending text and is disabled while saving.
- Sign-in required and empty-title validation are handled before save.
- Completion uses `useSuccessFeedback().celebrate("Task complete")`.
- Cards use visible Edit and Delete buttons instead of hidden More menu.
- Route is correctly not AI-first.

Main workflow issues:

- Initial loading is plain text, not a skeleton or stable card state.
- `getDailyFitTasks` returns `[]` on service error, so some failures can still look like no tasks.
- Mark done/Reopen is not optimistic and has no per-row pending state.
- Completion failure is toast-only; no row-level recovery state.
- Save failure is toast-only and no inline form error is shown.
- Edit mode silently fills the form; there is no edit banner, cancel action, or discard path.
- Remove is immediate with no confirmation or undo.
- Remove has no pending/failure recovery state beyond toast.
- Starter task buttons use `size="sm"` and can be tapped repeatedly, creating duplicates.
- Task action buttons use `h-11`, below the 48px target.
- Inputs use `h-11`, below the 48px target.
- Progress bar uses `transition-all` and should respect reduced-motion settings.
- The form is always first; once tasks exist, the checklist/status could be more prominent than adding more tasks.

---

## 5. Recommended workflow map

```txt
Enter Daily Fit Tasks
-> Loading skeleton / ErrorState / loaded state
-> Today status:
   -> completed count
   -> progress
   -> next open task
-> Task cards:
   -> optimistic complete/reopen
   -> per-row pending/failure
   -> 48px Edit/Remove controls
-> Add/edit form:
   -> create vs edit mode
   -> pending/saved/failed
   -> cancel/discard edit
-> Starter tasks when empty:
   -> 48px chips
   -> duplicate prevention
```

This is a **tune flow with optimistic completion, edit-state clarity, and task safety hardening** correction. Keep the current dedicated route and improve reliability rather than rebuilding it.

---

## 6. Flow decision label

**Tune flow with optimistic completion, edit-state clarity, and task safety hardening.**

Do not make this route ChatGPT-first. Do not turn it into a complex planner.

---

## 7. Missing comments / microcopy

Add or improve copy for:

- “Saving task…”
- “Task saved.”
- “Could not save. Your draft is still here.”
- “Completing…” / “Reopening…”
- “Could not update task. Restored previous state.”
- “Editing task: [title].”
- “Cancel edit.”
- “Remove this task from today?”
- “Removed task. Undo.”
- “Start with one small task for today.”

Keep the tone practical and low-pressure.

---

## 8. UI structure

Recommended structure:

```txt
1. Today progress / next task
2. Task cards
3. Add/edit form
4. Starter tasks when empty
5. Loading/error/retry states
```

Current structural issues:

| Current object | Issue | Recommended change | Priority |
|---|---|---|---|
| Loading | Plain text. | Add skeleton/status. | P1 |
| Load failure | Better than many routes, but still service can return [] on failure. | Preserve ErrorState and avoid false empty where feasible. | P1 |
| Completion | No optimistic rollback. | Add optimistic toggle + row pending. | P1 |
| Save | Has pending, but failure is toast-only. | Add inline form status. | P1 |
| Edit mode | Invisible. | Add edit banner and cancel/discard. | P1 |
| Remove | Immediate. | Confirm/undo. | P1 |
| Starter tasks | Small and duplicate-prone. | 48px + per-chip pending/duplicate prevention. | P1 |
| Controls | `h-11` inputs/actions. | Resize to 48px. | P1 |

---

## 9. Buttons and action hierarchy

| Action | Current placement | Problem | Decision | Priority |
|---|---|---|---|---|
| Save / Update | Form | Good pending text, but no inline failure/success. | Keep and add form status. | P1 |
| Retry | Error block | Present, but `h-10`. | Resize to 48px. | P1 |
| Starter task | Empty state | `size=sm`; duplicate risk. | 48px, pending, duplicate guard. | P1 |
| Mark done / Reopen | Task card | `h-11`, no row pending. | 48px optimistic toggle. | P1 |
| Edit | Task card | `h-11`; edit state unclear. | 48px + edit banner/focus. | P1 |
| Delete | Task card | `h-11`; immediate destructive. | Rename Remove, add confirm/undo. | P1 |

---

## 10. Loading / empty / success / error / pending states

| State | Current behavior | Problem | Required fix | Priority |
|---|---|---|---|---|
| Initial loading | Plain text. | Low polish and layout jump. | Skeleton/status. | P1 |
| Load failure | Inline block + toast. | Good base, but retry button small. | Improve ErrorState and 48px retry. | P1 |
| False empty | Service can return []. | Failed load may still look empty. | Add source confidence where feasible. | P2 |
| Completion pending | None. | Slow/failed tap unclear. | Per-row pending and optimistic rollback. | P1 |
| Save pending | Exists. | Good base. | Preserve. | P2 |
| Save failure | Toast-only. | Draft remains but error can be missed. | Inline form error. | P1 |
| Edit mode | Draft changes silently. | User can lose context. | Edit banner + cancel. | P1 |
| Remove pending/failure | None. | Trust risk. | Confirm/undo + restore on failure. | P1 |
| Empty tasks | Basic copy/starter chips. | Good base but small controls. | 48px chips and duplicate guard. | P1 |

---

## 11. Motion and interaction design

Daily Fit Tasks can use slightly more feedback than Sleep/Recovery, but it should stay restrained.

Required motion behavior:

| Interaction | Current behavior | Problem | Required motion | Priority |
|---|---|---|---|---|
| Complete task | Waits for DB, then celebrates. | Tap may feel delayed. | Optimistic check, short success feedback after persistence. | P1 |
| Reopen task | Waits for DB. | Tap may feel delayed. | Optimistic reopen with rollback. | P1 |
| Progress bar | `transition-all`. | Needs reduced-motion respect. | Disable/reduce when reduceAnimations. | P2 |
| Remove task | Row disappears. | Abrupt. | Confirm/undo or pending removal. | P1 |
| Edit task | Form changes silently. | Disorienting. | Focus form + visible edit banner. | P1 |

Completion feedback is fine, but avoid excessive celebration for every small task.

---

## 12. Implementation risk

| Risk | Why it matters | Recommendation |
|---|---|---|
| Dedicated component duplicates shared tracker logic. | Fixing one does not fix the shared `DailyFitTasksTracker`. | Prefer the route client as source of truth and consider deprecating shared duplicate later. |
| Service returns [] on error. | UI can still confuse failed and empty. | Improve service or add better component-level error handling where feasible. |
| Starter duplicates. | Repeated taps can create clutter. | Disable duplicate titles for today and per-chip pending. |
| Success feedback can become noisy. | Repeated task completion should not feel excessive. | Keep success subtle and reduced-motion-safe. |
| Remove affects today's checklist only. | Still destructive for the day. | Confirm/undo. |

---

## 13. Score breakdown

| Category | Score | Max | Notes |
|---|---:|---:|---|
| Route purpose and action hierarchy | 10 | 15 | Clear daily checklist role; form could be less dominant after tasks exist. |
| Button size, placement, and hierarchy | 8 | 15 | Visible actions but mostly 44px. |
| Spacing consistency and visual rhythm | 8 | 10 | Clean dedicated route, good card rhythm. |
| Feedback, optimistic UI, loading, and errors | 8 | 15 | Better than peers; still lacks row pending/rollback and inline save error. |
| Motion and interaction quality | 7 | 15 | Success feedback exists, but completion should be optimistic and reduced-motion-aware. |
| Mobile-first behavior and tap comfort | 8 | 10 | Good card layout; controls need 48px. |
| AI safety, privacy, and high-risk action control | 8 | 10 | Correctly not AI-first; remove safety missing. |
| Premium/subscription readiness | 4 | 10 | Useful daily route but still not polished enough for paid feel. |
| **Total** | **61** | **100** | Stronger than other checklist routes, but reliability and action safety still need work. |

---

## 14. Constitution violations

| Rule violated | Evidence | Fix |
|---|---|---|
| 48px tap target baseline | `h-11`, `h-10`, `size=sm`. | Resize controls. |
| Feedback loop completeness | Completion/remove lack pending/recovery. | Add optimistic rollback and undo. |
| High-risk action confirmation | Remove is immediate. | Confirm/undo. |
| Edit workflow clarity | Edit silently populates form. | Edit banner + cancel/discard. |
| Loading polish | Loading is plain text. | Skeleton/status. |

---

## 15. Required fixes

| Priority | Fix | Owner | Status |
|---|---|---|---|
| P1 | Replace plain loading text with skeleton/status. | Codex/Kimi/Human | Open |
| P1 | Add optimistic Mark done/Reopen with rollback and per-row pending. | Codex/Kimi/Human | Open |
| P1 | Add inline save failure and saved state while preserving draft. | Codex/Kimi/Human | Open |
| P1 | Add visible edit mode banner plus Cancel/Discard. | Codex/Kimi/Human | Open |
| P1 | Add remove confirmation or undo with failure recovery. | Codex/Kimi/Human | Open |
| P1 | Resize starter chips, Retry, task actions, and inputs to 48px. | Codex/Kimi/Human | Open |
| P1 | Prevent duplicate starter task creation for the same day. | Codex/Kimi/Human | Open |
| P2 | Respect reduced-motion for progress and completion feedback. | Codex/Kimi/Human | Open |
| P2 | Consider making tasks/status more prominent than the add form once tasks exist. | Codex/Kimi/Human | Open |
| P2 | Decide whether to deprecate or sync shared `DailyFitTasksTracker` to avoid divergence. | Codex/Kimi/Human | Open |

---

## 16. Retest checklist

- [ ] `/daily-fit-tasks` shows skeleton/status while loading.
- [ ] Failed load shows inline retry and does not look empty.
- [ ] Mark done/reopen updates immediately and rolls back on failure.
- [ ] Row pending state prevents repeated taps.
- [ ] Save failure preserves draft and shows inline error.
- [ ] Edit mode is visible and Cancel/Discard works.
- [ ] Remove requires confirmation or undo and recovers on failure.
- [ ] Starter chips cannot create duplicate same-day tasks by repeated taps.
- [ ] Starter chips, Retry, inputs, Mark done, Edit, and Remove controls are 48px on 390x844.
- [ ] Completion feedback respects reduced-motion preferences.
- [ ] No schema, auth, AI import/apply behavior, global theme, or unrelated tracker regressions.

---

## 17. Codex prompt section

Use this route with repeated-action reliability and route-duplication review.

```txt
/caveman lite

$memory-management $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + repeated-action reliability reviewer + duplicate-route/component reviewer
```

Implementation should not change database schema, auth behavior, AI import/apply behavior, global theme, or unrelated wellness tracker behavior.

---

## 18. Implementation note

Do not rebuild Daily Fit Tasks. Preserve the current dedicated route capability set:

```txt
Add task -> starter tasks -> completion progress -> task cards -> retry on failed load
```

The highest-value correction is repeated-action reliability:

```txt
Skeleton/ErrorState -> optimistic complete/reopen -> safe save/edit/remove -> duplicate prevention -> 48px controls
```
