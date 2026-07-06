# Route Audit: `/personal-records`

**Audit date:** 2026-07-06  
**Auditor:** ChatGPT  
**Status:** Audited  
**Score:** 56 / 100  
**Flow decision:** Tune flow with record-state, edit/delete safety, and achievement feedback hardening

---

## Files inspected

- `app/(private)/personal-records/page.tsx`
- `components/lifestyle/personal-records-insights.tsx`
- `components/lifestyle/wellness-trackers.tsx`
- `services/database/progress.ts`
- Related context from:
  - `docs/ux-progress/routes/progress.md`
  - `docs/ux-progress/routes/workout-history.md`
  - `docs/ux-progress/routes/weekly-overview-reports.md`

---

## 1. Product role

`/personal-records` is Plaivra's strength milestone route. It lets users track best lifts, reps, estimated one-rep maxes, and custom exercise records. It also feeds reporting and progress review.

The route should answer:

```txt
What are my current best records?
Did I recently set or update a PR?
Can I manually add or correct a PR safely?
Can I edit or delete a mistaken record without losing context?
Can I tell manual records from auto-detected records?
Can I recover from failed save/delete/load states?
```

This route is not AI-first and not a general workout logging route. It is a milestone tracker and correction surface. Workout sessions may auto-detect PR candidates, but this page should focus on trustworthy record review, manual correction, and safe record management. ChatGPT interpretation can be added later only as an explicit read-only review action.

The current route has a useful base: a summary hero, exercise group summary, manual record form, grouped record list, edit action, and delete action. The main issues are state reliability and safety. Load failure is toast-only, insights and tracker load independently and can disagree, save/delete have no pending/error states, delete is immediate and destructive, edit mode is not clearly surfaced, and several controls are below the 48px mobile target.

---

## 2. AI-first vs manual-entry role

Personal Records is a direct milestone tracker and correction route.

Expected hierarchy:

```txt
1. PR summary and best records
2. Recent/new PR feedback
3. Add/edit record form
4. Grouped record list
5. Source confidence: manual vs auto-detected
6. Safe edit/delete/retry states
```

Current hierarchy:

```txt
1. PageHeading
2. PersonalRecordsInsights
3. PersonalRecordsTracker
```

The structure is simple, but it misses the confidence and action-safety layer required for a route that stores important progress milestones.

---

## 3. User intent and entry points

| User intent | Expected route behavior |
|---|---|
| Review best records | Summary should load reliably and show source/date context. |
| Add a new PR | Form should validate record type, weight/reps, and date inline. |
| Edit a mistaken PR | Edit mode should be clearly visible with cancel/discard. |
| Delete a mistaken PR | Confirmation or undo; no immediate destructive delete. |
| See recent achievement | New/updated PR should produce clear but restrained achievement feedback. |
| Understand auto-detected records | Auto-detected vs manual records should be labeled where data supports it. |
| Load fails | Inline ErrorState/retry, not toast-only. |
| No records yet | Empty state should explain how records are created and link to workout/session routes. |

---

## 4. Current workflow map

```txt
Enter /personal-records
-> PageHeading
-> PersonalRecordsInsights loads getPersonalRecords separately
-> summary hero shows count, best max weight, best estimated 1RM, top exercise groups
-> PersonalRecordsTracker loads getPersonalRecords separately
-> user fills form and saves record
-> saved record is inserted/updated and local list updates
-> user can edit record by filling form from row
-> user can delete record immediately from row
```

Strong points:

- Route is focused and easy to understand.
- Summary hero gives count, best max weight, and best estimated 1RM.
- Exercise group cards make repeated exercises visible.
- Tracker supports manual add and edit.
- Records are grouped by exercise.
- Service validates exercise name and record type.
- Personal records are used by reports, so the data has downstream value.
- The page is correctly not AI-first.

Main workflow issues:

- `PersonalRecordsInsights` and `PersonalRecordsTracker` each call `getPersonalRecords` separately, so they can show inconsistent data after save/delete until a reload.
- `PersonalRecordsInsights` has no loading, empty, or inline error state; records default to `[]`, so failed load can look like no records.
- `PersonalRecordsTracker` has no explicit loading state or inline ErrorState/retry.
- `getPersonalRecords` catches errors and returns `[]`, making failure indistinguishable from empty history.
- Save has no pending state, duplicate-submit protection, success state, or catch/error feedback in the component.
- Delete has no confirmation or undo and no pending/error state.
- Edit mode silently populates the form; there is no banner, selected record label, cancel button, or discard guard.
- The form accepts weight and reps both empty, depending only on exercise name; a record can become semantically weak.
- Record types in UI are `1RM`, `Max weight`, `Max reps`, `Best set`, while auto-detected service uses `Estimated 1RM` and `Best volume`, creating naming inconsistency.
- The route title says “real estimated 1RM insights,” but the form/type list does not clearly explain estimated vs manually entered values.
- Inputs/selects use `h-11`, below the 48px target.
- Row edit/delete buttons are `h-10 w-10`, below the 48px target.
- Empty state is one plain sentence and does not explain automatic PR detection from saved workouts.
- No recent/new PR highlight or achievement feedback after saving a new best record.
- No source label for manual vs auto-detected records, even though auto-detected notes may exist.

---

## 5. Recommended workflow map

```txt
Enter Personal Records
-> Loading / ErrorState / loaded state
-> Summary hero:
   -> best max weight
   -> best estimated 1RM
   -> recent PR update
   -> source confidence
-> Add/edit record form:
   -> clear create vs edit mode
   -> inline validation
   -> pending/saved/failed state
   -> cancel/discard edit
-> Grouped records:
   -> 48px actions
   -> source/date/value labels
   -> confirm/undo delete
-> Empty state:
   -> add first record
   -> start workout / view workout history
```

This is a **tune flow with record-state, edit/delete safety, and achievement feedback hardening** correction. The route should not be rebuilt; it needs reliability and safety upgrades.

---

## 6. Flow decision label

**Tune flow with record-state, edit/delete safety, and achievement feedback hardening.**

Do not redesign the feature. Keep the summary + tracker structure, but make loading, save, edit, delete, source, and empty states trustworthy.

---

## 7. Missing comments / microcopy

Add or improve copy for:

- “Personal records can be added manually or detected from completed workouts.”
- “Editing record: [exercise] — [type] on [date].”
- “Save failed. Your record draft is still here.”
- “Delete this personal record?”
- “Deleted record. Undo.”
- “No personal records yet. Complete workouts or add your first record manually.”
- “Estimated 1RM is calculated from saved workout sets when available.”
- “Manual record.”
- “Auto-detected from workout session.”

Avoid exaggerated celebration. PR feedback should feel motivating but controlled.

---

## 8. UI structure

Recommended structure:

```txt
1. Summary / best records
2. Recent PR / data confidence
3. Add or edit record form
4. Grouped records list
5. Empty/error/retry states
```

Current structural issues:

| Current object | Issue | Recommended change | Priority |
|---|---|---|---|
| Dual data loading | Insights and tracker load separately. | Share state or refresh both after mutations. | P1 |
| Insights empty/failure | Empty and failed both look like no records. | Add loading/ErrorState/empty state. | P1 |
| Tracker failure | Toast-only. | Inline ErrorState/retry. | P1 |
| Form mode | Edit mode invisible. | Add edit banner and cancel. | P1 |
| Delete action | Immediate destructive delete. | Confirmation/undo. | P1 |
| Controls | h-11/h-10. | 48px targets. | P1 |
| Empty state | One sentence. | Add guidance and links. | P2 |
| PR source | Not shown. | Add source labels from notes/type where feasible. | P2 |

---

## 9. Buttons and action hierarchy

| Action | Current placement | Problem | Decision | Priority |
|---|---|---|---|---|
| Save Record / Update Record | Form bottom | Good primary action, but no pending/error. | Add pending/saved/failed and duplicate protection. | P1 |
| Edit row | Row icon `h-10 w-10` | Below 48px; edit mode unclear. | Resize and show edit mode. | P1 |
| Delete row | Row icon `h-10 w-10` | Below 48px and destructive. | Confirmation/undo + 48px. | P1 |
| Cancel edit | Missing | User cannot exit edit mode except save/reset indirectly. | Add. | P1 |
| Retry load | Missing | Failed data can look empty. | Add retry. | P1 |
| Start workout / view history | Missing in empty state. | Add contextual links. | P2 |
| Review with ChatGPT | Missing. | Acceptable; optional later explicit read-only action. | P3 |

---

## 10. Loading / empty / success / error / pending states

| State | Current behavior | Problem | Required fix | Priority |
|---|---|---|---|---|
| Insights loading | Shows zero/— state. | Can look like no records. | Skeleton or loading state. | P1 |
| Tracker loading | No visible loading state. | Empty list can appear. | Skeleton/status. | P1 |
| Load failure | Toast or service returns []. | Failed == empty. | ErrorState/degraded with retry. | P1 |
| Save pending | None. | Duplicate submit risk. | Pending button + disabled inputs if needed. | P1 |
| Save failure | Uncaught at component level. | Draft may remain but no inline state. | Catch and show inline error. | P1 |
| Save success | Local list updates. | Good, but no PR-specific feedback. | Add saved/recent PR status. | P2 |
| Delete pending | None. | Duplicate/destructive risk. | Pending row state. | P1 |
| Delete failure | Uncaught at component level. | User loses trust. | Catch and restore/show error. | P1 |
| Empty records | Plain sentence. | Weak guidance. | EmptyState with add/start/history links. | P2 |

---

## 11. Motion and interaction design

Personal Records should use restrained achievement feedback.

Required motion behavior:

| Interaction | Current behavior | Problem | Required motion | Priority |
|---|---|---|---|---|
| Save new PR | List updates. | No feedback that a PR changed. | Subtle saved/new PR highlight. | P2 |
| Edit record | Form silently changes. | Can disorient user. | Scroll/focus form and show edit banner. | P1 |
| Delete record | Row disappears. | Abrupt destructive change. | Confirm/undo or soft pending removal. | P1 |
| Load state | No skeleton. | Layout confidence weak. | Skeleton/static placeholders. | P1 |

No confetti or heavy celebration. Use short, reduced-motion-safe highlight for new/updated records.

---

## 12. Implementation risk

| Risk | Why it matters | Recommendation |
|---|---|---|
| Component is shared file with other wellness trackers. | Changes can regress habits/sleep/supplements/tasks. | Scope PersonalRecordsTracker changes carefully. |
| Service returns [] on error. | UI cannot distinguish empty vs failed. | Add component-level source state or modify service carefully. |
| Record type naming mismatch. | Reports and auto-detection can become inconsistent. | Normalize display labels without breaking stored values. |
| Delete action affects reporting. | Deleted PR disappears from weekly reports. | Confirm/undo and explain effect. |
| PR data is motivational but sensitive. | Avoid over-celebration or public/share copy. | Keep private, calm feedback. |

---

## 13. Score breakdown

| Category | Score | Max | Notes |
|---|---:|---:|---|
| Route purpose and action hierarchy | 9 | 15 | Focused route, but state hierarchy is weak. |
| Button size, placement, and hierarchy | 7 | 15 | Main save is good; row actions and form controls under target. |
| Spacing consistency and visual rhythm | 8 | 10 | Clear layout, though grouped rows can be dense. |
| Feedback, optimistic UI, loading, and errors | 5 | 15 | Toast-only load and no save/delete pending/error. |
| Motion and interaction quality | 5 | 15 | Edit/delete transitions are abrupt or invisible. |
| Mobile-first behavior and tap comfort | 7 | 10 | Usable but 44/40px controls. |
| AI safety, privacy, and high-risk action control | 8 | 10 | Correctly not AI-first; delete safety missing. |
| Premium/subscription readiness | 7 | 10 | Useful milestone value, but reliability gaps hurt trust. |
| **Total** | **56** | **100** | Focused feature with useful data, but not release-grade until state safety improves. |

---

## 14. Constitution violations

| Rule violated | Evidence | Fix |
|---|---|---|
| Loading/error state clarity | Empty and failed load both become zero/empty state. | Skeleton + ErrorState/retry. |
| 48px tap target baseline | Inputs/selects h-11; row actions h-10. | Resize to 48px. |
| High-risk action confirmation | Delete PR is immediate. | Confirm/undo. |
| Feedback loop completeness | Save/delete have no pending/failure states. | Add pending/success/failure. |
| Workflow clarity | Edit mode silently populates form. | Edit banner + cancel/discard. |

---

## 15. Required fixes

| Priority | Fix | Owner | Status |
|---|---|---|---|
| P1 | Add loading skeleton/status for insights and tracker. | Codex/Kimi/Human | Open |
| P1 | Add inline ErrorState/retry for records load failure; distinguish failed from empty. | Codex/Kimi/Human | Open |
| P1 | Avoid separate stale data between insights and tracker, or refresh insights after save/delete. | Codex/Kimi/Human | Open |
| P1 | Add save pending, duplicate protection, inline failure, and saved state for Save/Update Record. | Codex/Kimi/Human | Open |
| P1 | Add visible edit mode banner plus Cancel/Discard action. | Codex/Kimi/Human | Open |
| P1 | Add delete confirmation or undo, with pending/failure recovery. | Codex/Kimi/Human | Open |
| P1 | Resize inputs/selects and edit/delete actions to 48px effective targets. | Codex/Kimi/Human | Open |
| P1 | Validate that a record has meaningful value: weight, reps, or notes depending on record type. | Codex/Kimi/Human | Open |
| P2 | Add richer empty state with links to add first record, Today Workout, and Workout History. | Codex/Kimi/Human | Open |
| P2 | Add source label for manual vs auto-detected records where feasible. | Codex/Kimi/Human | Open |
| P2 | Normalize display labels for `1RM` vs `Estimated 1RM` and `Best set` vs `Best volume`. | Codex/Kimi/Human | Open |
| P2 | Add subtle recent/new PR highlight after save/update. | Codex/Kimi/Human | Open |

---

## 16. Retest checklist

- [ ] `/personal-records` shows skeleton/status while records load.
- [ ] Failed records load shows inline retry and does not look like no records.
- [ ] Insights and tracker stay consistent after save/delete.
- [ ] Save/Update Record has pending, success, and failure states.
- [ ] Failed save preserves draft.
- [ ] Edit mode is visible and has Cancel/Discard.
- [ ] Delete requires confirmation or undo and has failure recovery.
- [ ] Inputs/selects/edit/delete actions are 48px on 390x844.
- [ ] Empty state explains manual and workout-detected PRs.
- [ ] Record type labels are clear and consistent with auto-detected records.
- [ ] Weekly reports still read PRs correctly.
- [ ] No database schema, auth, AI import/apply behavior, global theme, or unrelated tracker routes are changed.

---

## 17. Codex prompt section

Use this route with milestone data-integrity and shared-component safety review.

```txt
/caveman lite

$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + milestone data-integrity reviewer + shared-component regression reviewer
```

Implementation should not change database schema, auth behavior, AI import/apply behavior, global theme, or unrelated wellness tracker behavior.

---

## 18. Implementation note

Do not rebuild Personal Records. Preserve the current capability set:

```txt
Insights summary -> add/edit record form -> grouped record list
```

The highest-value correction is safety and consistency:

```txt
Load confidence -> consistent records state -> safe save/edit/delete -> 48px controls -> clear PR feedback
```
