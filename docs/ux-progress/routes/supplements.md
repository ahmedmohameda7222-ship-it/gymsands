# Route Audit: `/supplements`

**Audit date:** 2026-07-06  
**Auditor:** ChatGPT  
**Status:** Audited  
**Score:** 56 / 100  
**Flow decision:** Tune flow with taken-state reliability, reminder clarity, and supplement-log safety

---

## Files inspected

- `app/(private)/supplements/page.tsx`
- `components/lifestyle/wellness-trackers.tsx`
- `services/database/wellness.ts`
- `services/wellness/wellness-data.ts`
- Related context from:
  - `docs/ux-progress/routes/wellness.md`
  - `docs/ux-progress/routes/weekly-overview-reports.md`

---

## 1. Product role

`/supplements` is Plaivra's supplement checklist route. It lets users plan a supplement name, dose text, time, reminder note, taken status, and recent adherence summary.

The route should answer:

```txt
What supplements are planned today?
Which ones are already taken?
Can I mark a supplement taken/reopen it reliably?
Can I add or edit a supplement without losing the taken state?
Can I tell whether reminder text is only a note or an actual notification?
Can I recover from failed save/taken/delete/load states?
```

This route is not AI-first and should not provide dosage, medical, or supplement recommendation advice. It is a direct checklist and adherence tracker. Any future ChatGPT help must be explicit, non-medical, and limited to organizing user-provided information unless reviewed with proper medical context.

The current route has a useful base: supplement form, today taken progress, reusable ActionCard rows, taken/open state, edit/delete actions, and adherence history. The main issues are state reliability and safety. Loading is invisible, load failure can look like empty data, taken toggles wait for persistence without rollback, save/delete have no local pending/error states, delete is immediate, edit mode is not visible, reminder wording can imply more capability than exists, and several controls are below the 48px target.

---

## 2. AI-first vs manual-entry role

Supplements is direct checklist logging.

Expected hierarchy:

```txt
1. Today's supplement taken status
2. One-tap taken/reopen actions
3. Add/edit supplement form
4. Reminder capability clarity
5. Adherence history
6. Safe edit/delete/retry states
```

Current hierarchy:

```txt
1. PageHeading
2. TrackerShell
3. Supplement name / dose / time / reminder note form
4. Save
5. Progress bar if items exist
6. Empty copy if none
7. Action cards
8. Adherence cards
```

The structure is good but needs stronger reliability and clearer reminder semantics.

---

## 3. User intent and entry points

| User intent | Expected route behavior |
|---|---|
| Mark supplement taken | Immediate optimistic feedback with rollback if save fails. |
| Reopen taken supplement | Same reliability as marking taken. |
| Add a supplement | Pending/saved/failure feedback and duplicate protection. |
| Edit supplement | Visible edit mode, cancel/discard, preserved taken state. |
| Delete supplement | Confirmation or undo; no silent destructive deletion. |
| Understand reminders | Clear distinction between note/time and real browser notification capability. |
| Review adherence | Loaded, empty, and failed history states should be separate. |
| Load fails | Inline retry state; failed load must not look empty. |

---

## 4. Current workflow map

```txt
Enter /supplements
-> SupplementsTracker loads today supplement logs and 30-day supplement history
-> form is visible
-> if items exist, taken progress appears
-> if no items, plain empty copy appears
-> ActionCards allow Mark done/Reopen, Edit, Delete
-> adherence summary renders from history
```

Strong points:

- Route is direct and easy to understand.
- Progress bar gives a quick taken count.
- Dose, time, and reminder note are captured.
- Editing preserves current `taken_today` state through the save payload.
- Adherence history exists and is useful for weekly reporting context.
- Service validation requires supplement name before save.
- The route avoids giving supplement recommendations.

Main workflow issues:

- Initial loading has no skeleton/status.
- `getSupplementLogs` and `getSupplementHistory` can return `[]` on error, making failed load indistinguishable from empty state.
- Load failure is toast-only in the component.
- Mark done/Reopen waits for persistence before UI update; no optimistic state or rollback.
- Toggle failure is not caught in the component.
- Save has no pending state, duplicate-submit protection, inline failure, or saved state.
- Delete is immediate with no confirmation or undo.
- Delete has no pending/failure recovery.
- Edit mode silently fills the form; no banner, cancel action, or discard guard.
- Reminder note copy may imply a real reminder, but this tracker only stores text/time; browser reminders live elsewhere.
- Time is optional, but adherence cards do not show missed planned times or schedule quality.
- Empty state is a plain sentence without guidance or safe reminder explanation.
- `ActionCard` uses `h-11` for Mark done and More, `h-10` for menu items, below the 48px target.
- Shared `Field` inputs use `h-11`, below the 48px target.
- Progress bar uses `transition-all` and should respect reduced-motion settings.

---

## 5. Recommended workflow map

```txt
Enter Supplements
-> Loading / ErrorState / loaded state
-> Today status:
   -> taken count
   -> progress
   -> next open supplement
-> Supplement cards:
   -> optimistic taken/reopen
   -> per-row pending/failure
   -> clear time/dose/reminder-note display
-> Add/edit form:
   -> create/edit mode
   -> pending/saved/failed
   -> cancel/discard edit
-> Adherence history:
   -> loaded / failed / empty states
```

This is a **tune flow with taken-state reliability, reminder clarity, and supplement-log safety** correction. Do not rebuild the route; harden repeated actions and clarify reminder behavior.

---

## 6. Flow decision label

**Tune flow with taken-state reliability, reminder clarity, and supplement-log safety.**

Keep the route direct and non-medical. Do not make ChatGPT primary and do not add supplement advice.

---

## 7. Missing comments / microcopy

Add or improve copy for:

- “Marking taken…” / “Reopening…”
- “Could not update taken status. Restored previous state.”
- “Editing supplement: [name].”
- “Cancel edit.”
- “Delete this supplement from today?”
- “Deleted supplement. Undo.”
- “Reminder note is saved as text. It is not a push notification.”
- “No supplement adherence history yet.”
- “Supplement tracking is for logging only, not medical advice.”

Avoid dosage advice or recommendations.

---

## 8. UI structure

Recommended structure:

```txt
1. Today taken status
2. Supplement cards and quick taken toggles
3. Add/edit supplement form
4. Reminder capability copy
5. Adherence history
6. Loading/error/retry states
```

Current structural issues:

| Current object | Issue | Recommended change | Priority |
|---|---|---|---|
| Loading | Missing. | Add skeleton/status. | P1 |
| Error | Toast-only or empty. | Inline ErrorState/retry. | P1 |
| Taken toggle | No optimistic rollback. | Add optimistic toggle with rollback. | P1 |
| Save | No pending/error. | Add pending/saved/failed. | P1 |
| Delete | Immediate. | Confirm/undo. | P1 |
| Edit mode | Invisible. | Add edit banner and cancel. | P1 |
| Reminder note | Capability unclear. | Clarify text-only vs notification. | P1 |
| Controls | 40/44px patterns. | Resize to 48px. | P1 |

---

## 9. Buttons and action hierarchy

| Action | Current placement | Problem | Decision | Priority |
|---|---|---|---|---|
| Save supplement | Form | No pending or failure state. | Add pending/saved/failed. | P1 |
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
| Today supplements failure | Toast or empty array. | Failed == empty. | Inline ErrorState/retry. | P1 |
| Adherence history failure | Looks like no history. | Misleading. | Degraded history state. | P1 |
| Taken pending | None. | Slow/failed tap unclear. | Optimistic pending + rollback. | P1 |
| Taken failure | Uncaught. | State can be wrong. | Restore previous state + inline/toast. | P1 |
| Save pending/failure | None. | Duplicate save risk. | Pending button and inline error. | P1 |
| Delete pending/failure | None. | Data loss/trust risk. | Confirm/undo + restore on failure. | P1 |
| Empty supplements | Plain copy. | Weak first use. | EmptyState with guidance. | P2 |

---

## 11. Motion and interaction design

Supplements should be low-friction and low-stimulation.

Required motion behavior:

| Interaction | Current behavior | Problem | Required motion | Priority |
|---|---|---|---|---|
| Mark taken/reopen | Waits and rerenders. | Tap may feel unregistered. | Immediate state change, reduced-motion-safe. | P1 |
| Progress bar | `transition-all`. | Needs reduced-motion respect. | Disable/reduce when reduceAnimations. | P2 |
| Delete supplement | Row disappears. | Abrupt destructive change. | Confirm/undo or soft pending removal. | P1 |
| Edit supplement | Form changes silently. | Disorienting. | Edit banner/focus, no heavy animation. | P1 |

No celebratory animation for supplement intake. Use simple state feedback only.

---

## 12. Implementation risk

| Risk | Why it matters | Recommendation |
|---|---|---|
| Shared tracker file. | Changes can affect habits, sleep, tasks, and PRs. | Scope SupplementsTracker changes carefully. |
| Health-adjacent data. | App must not imply medical guidance or dose recommendation. | Keep copy strictly logging-focused. |
| Reminder semantics. | Users may expect notifications. | Clarify whether it is a note/time or real browser reminder. |
| Service returns [] on error. | UI cannot distinguish failed from empty. | Add component-level load state/source status. |
| Weekly reports use supplements indirectly in wellness context. | State changes can affect future reporting. | Retest wellness/reporting states. |

---

## 13. Score breakdown

| Category | Score | Max | Notes |
|---|---:|---:|---|
| Route purpose and action hierarchy | 9 | 15 | Focused checklist route; reminder semantics need clarity. |
| Button size, placement, and hierarchy | 7 | 15 | Save is good; shared controls are under 48px. |
| Spacing consistency and visual rhythm | 8 | 10 | Clean layout, but form/card density remains. |
| Feedback, optimistic UI, loading, and errors | 5 | 15 | No visible loading or robust pending/failure states. |
| Motion and interaction quality | 6 | 15 | Needs state-based, reduced-motion-safe feedback. |
| Mobile-first behavior and tap comfort | 8 | 10 | Good card structure; controls need resizing. |
| AI safety, privacy, and high-risk action control | 8 | 10 | Correctly non-AI; medical/dosage boundary should be explicit. |
| Premium/subscription readiness | 5 | 10 | Valuable checklist but weak trust states. |
| **Total** | **56** | **100** | Functional but not launch-polished for repeated daily use. |

---

## 14. Constitution violations

| Rule violated | Evidence | Fix |
|---|---|---|
| Loading/error state clarity | Failed load can look empty. | Skeleton + ErrorState/retry. |
| 48px tap target baseline | `h-11`, `h-10`, `size=sm`. | Resize controls. |
| Feedback loop completeness | Taken/save/delete lack pending/failure states. | Add optimistic state and recovery. |
| High-risk action confirmation | Delete is immediate. | Confirm/undo. |
| Sensitive copy caution | Reminder and supplement context needs clearer boundary. | Add text-only reminder and non-medical logging copy. |

---

## 15. Required fixes

| Priority | Fix | Owner | Status |
|---|---|---|---|
| P1 | Add loading skeleton/status for today's supplements and adherence history. | Codex/Kimi/Human | Open |
| P1 | Add inline ErrorState/retry; failed load must not look empty. | Codex/Kimi/Human | Open |
| P1 | Add optimistic taken/reopen with rollback and per-row pending. | Codex/Kimi/Human | Open |
| P1 | Add save pending, duplicate protection, inline failure, and saved state. | Codex/Kimi/Human | Open |
| P1 | Add visible edit mode banner plus Cancel/Discard. | Codex/Kimi/Human | Open |
| P1 | Add delete confirmation or undo with failure recovery. | Codex/Kimi/Human | Open |
| P1 | Resize ActionCard controls, inputs, and menu actions to 48px. | Codex/Kimi/Human | Open |
| P1 | Clarify reminder note/time is not automatically push notification. | Codex/Kimi/Human | Open |
| P1 | Add non-medical logging-only copy. | Codex/Kimi/Human | Open |
| P2 | Add duplicate-name handling for same-day supplement entries. | Codex/Kimi/Human | Open |
| P2 | Add degraded state when adherence history fails but today's supplements load. | Codex/Kimi/Human | Open |
| P2 | Respect reduced-motion for progress bar and taken feedback. | Codex/Kimi/Human | Open |

---

## 16. Retest checklist

- [ ] `/supplements` shows skeleton/status while loading.
- [ ] Failed today-supplement load shows retry and does not look empty.
- [ ] Failed adherence history shows degraded history state.
- [ ] Mark done/reopen updates immediately and rolls back on failure.
- [ ] Save failure preserves draft.
- [ ] Edit mode is visible and Cancel/Discard works.
- [ ] Delete requires confirmation or undo and recovers on failure.
- [ ] Reminder copy clarifies note/time vs real notification.
- [ ] Supplement copy stays logging-only and avoids dosage/medical advice.
- [ ] Inputs, Mark done, More, Edit, Delete, and Save controls are 48px on 390x844.
- [ ] No schema, auth, AI import/apply behavior, global theme, or unrelated tracker regressions.

---

## 17. Codex prompt section

Use this route with repeated-action reliability, health-adjacent copy, and shared-component regression review.

```txt
/caveman lite

$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + health-adjacent logging reviewer + shared-component regression reviewer
```

Implementation should not change database schema, auth behavior, AI import/apply behavior, global theme, or unrelated wellness tracker behavior.

---

## 18. Implementation note

Do not rebuild Supplements. Preserve the current capability set:

```txt
Add supplement -> taken checklist -> progress -> adherence history
```

The highest-value correction is repeated-action reliability and copy clarity:

```txt
Load confidence -> optimistic taken state -> safe save/edit/delete -> reminder clarity -> 48px controls
```
