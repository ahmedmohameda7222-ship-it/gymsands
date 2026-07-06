# Route Audit: `/my-workout/day/[dayId]`

**Audit date:** 2026-07-06  
**Auditor:** ChatGPT  
**Status:** Audited  
**Score:** 59 / 100  
**Flow decision:** Tune flow with editor-state and unsaved-change hardening

---

## Files inspected

- `app/(private)/my-workout/plans/[planId]/page.tsx`
- `components/workouts/workout-plan-detail.tsx`
- `app/(private)/my-workout/day/[dayId]/page.tsx`
- `components/workouts/workout-day-editor.tsx`
- `app/(private)/my-workout/day/[dayId]/add-exercise/page.tsx`
- `components/workouts/workout-day-add-exercise.tsx`
- `app/(private)/my-workout/plans/builder/page.tsx`
- `components/workouts/workout-plan-builder.tsx`
- `services/database/workout-plans.ts`

---

## 1. Product role

`/my-workout/day/[dayId]` is the dedicated workout day editor. It is reached from plan detail and builder flows when a saved day exists.

The route should answer:

```txt
What day am I editing?
What changed and is it saved?
Can I safely add, remove, reorder, or edit exercises?
Can I leave without losing changes?
Can I recover a local draft?
Can I save confidently and return to the right plan context?
```

This route is not AI-first. It is a direct editor/correction route for saved workout plan days. ChatGPT can support plan rebalance or exercise replacement elsewhere, but the editor itself should prioritize precise manual correction, safe local drafts, and explicit save/cancel behavior.

The current route has a useful base: local draft persistence, edit/reorder/remove controls, exercise details, custom video URL support, and a separate add-exercise browser. The main problem is editor reliability and mobile ergonomics: there is no dirty-state indicator, no unsaved-change guard, Cancel clears the local draft without confirmation, destructive remove actions have no confirmation/undo, save failure is toast-only, and many key editor controls use `size=sm` below the 48px target.

---

## 2. AI-first vs manual-entry role

Workout day editor is a manual correction/editor route.

Expected hierarchy:

```txt
1. Editing context and save status
2. Persistent Save / Cancel / Back actions with unsaved-change protection
3. Day metadata
4. Exercise list with edit/reorder/remove controls
5. Add Exercise entry point
6. Draft recovery / save failure recovery
```

Current hierarchy:

```txt
1. PageHeading
2. Back / Cancel / Save Workout row
3. Workout day metadata card
4. Exercise list card
5. Add exercises card linking to add-exercise route
```

The structure is broadly correct, but the state layer is too weak for a real editor. A premium editor must show saved/unsaved/draft-restored/saving/failed states before users commit or leave.

---

## 3. User intent and entry points

| User intent | Expected route behavior |
|---|---|
| Rename the workout day | Update draft, mark unsaved, save clearly. |
| Change weekday/notes | Update draft, mark unsaved, avoid silent loss on back/cancel. |
| Reorder exercises | Immediate local update, visible unsaved state, optional motion. |
| Remove exercise | Require confirm/undo or at least a visible removal state. |
| Edit sets/reps/rest/video URL | Inline edit with validation and saved/unsaved state. |
| Add exercise | Go to add browser, preserve draft, return to editor. |
| Save failed | Keep draft, show inline failure and retry. |
| Cancel/back | Warn if unsaved changes or local draft exists. |
| Open old local draft | Explain draft was restored and allow discard. |

---

## 4. Current workflow map

```txt
Plan detail /my-workout/plans/[planId]
-> select day
-> Edit Day
-> /my-workout/day/[dayId]
-> page loads day via getUserWorkoutPlanDay
-> WorkoutDayEditor hydrates local draft from localStorage if present
-> user edits day metadata/exercises
-> draft auto-persists locally
-> Save Workout calls updateUserWorkoutPlanDay
-> on success clear local draft and route to /my-workout/plans
```

Strong points:

- Dedicated day editor exists and is easy to find from plan detail.
- Local draft persistence protects edits across page navigation/reload.
- Add-exercise route writes into the same draft key, so adding exercises can preserve day edits.
- Save button is disabled when the day has no exercises.
- Save preserves custom video URLs and exercise guide URLs through the service layer.
- Exercise reorder is direct and simple.
- Exercise edit fields cover sets, reps, rest, and custom video URL.
- Service validation requires day name and at least one exercise.

Main workflow issues:

- No visible “unsaved changes” or “draft restored” status despite local draft persistence.
- Cancel immediately clears local draft and navigates away; no confirmation.
- Back link can leave the route while unsaved draft remains, but the user is not told.
- Save failure is toast-only; no inline failure card or persistent retry state.
- Save success always navigates to `/my-workout/plans`, losing plan-detail context.
- Remove exercise is immediate and has no confirmation/undo.
- Reorder controls are small icon buttons (`size=sm`) and hard to tap on mobile.
- Edit/Details/Guide/Video buttons are small and visually dense.
- The add-exercise route has no explicit “return and save” instruction after adding.
- Add-exercise search/filter failures are toast-only and results state can look like true empty.
- Loading/error states in both editor and add-exercise pages are plain text, not shared ErrorState/skeleton.
- Custom video URL accepts any text without validation beyond later link checks.
- Day editor does not show source context: imported plan/manual plan/default plan/current plan.

---

## 5. Recommended workflow map

```txt
Enter day editor
-> Load skeleton / ErrorState
-> Editor status bar:
   -> Day name + source/context
   -> Draft restored / unsaved / saving / saved / failed
   -> Save primary, Cancel/Back secondary
-> Day metadata card
-> Exercise list:
   -> reorder/edit/remove with 48px controls
   -> remove confirm/undo
   -> inline validation for sets/rest/video URL
-> Add Exercise card/link:
   -> preserve draft and explain return/save behavior
-> Save:
   -> clear draft only on confirmed success
   -> return to plan detail when possible
```

This is a **tune flow with editor-state and unsaved-change hardening** correction. The route does not need a redesign, but it needs editor-grade state handling.

---

## 6. Flow decision label

**Tune flow with editor-state and unsaved-change hardening.**

The editor is functional, but not release-grade for mobile because it does not protect unsaved work clearly enough.

---

## 7. Missing comments / microcopy

Add or improve copy for:

- “Draft restored from this device.”
- “Unsaved changes.”
- “Saved changes to this workout day.”
- “Save failed. Your draft is still on this device.”
- “Cancel editing? This will discard the local draft for this day.”
- “Back keeps your local draft. Save when you return.”
- “Add exercises on the next page, then return here to save the workout day.”
- “Custom video URL must start with http:// or https://.”
- “Removing this exercise only changes the draft until you save.”

Avoid implying the day is saved immediately when edits are only local draft changes.

---

## 8. UI structure

Recommended structure:

```txt
1. Editor status/action bar
2. Day metadata
3. Exercise list editor
4. Add exercise entry point
5. Draft/save failure recovery
```

Current structural issues:

| Current object | Issue | Recommended change | Priority |
|---|---|---|---|
| Page loading/error | Plain text. | Use skeleton/ErrorState with retry/back. | P1 |
| Top action row | No dirty/save status. | Add editor status bar. | P1 |
| Cancel | Clears local draft without confirmation. | Confirm/discard flow. | P1 |
| Back | Leaves route without explaining draft. | Unsaved-change guard or draft-preserved notice. | P1 |
| Exercise remove | Immediate local destructive action. | Confirm/undo or visible draft-only removal state. | P1 |
| Add exercise | Separate route but weak return/save guidance. | Add explicit microcopy and return status. | P2 |
| Save destination | Always `/my-workout/plans`. | Prefer returning to plan detail or preserve previous context. | P2 |

---

## 9. Buttons and action hierarchy

| Action | Current placement | Problem | Decision | Priority |
|---|---|---|---|---|
| Save Workout | Top action row | Correct primary action, but no dirty/failure context. | Keep primary; add status and retry. | P1 |
| Cancel | Top action row | Clears draft without confirm. | Add confirmation. | P1 |
| Back | Top action row | Can leave unsaved draft silently. | Add guard/notice. | P1 |
| Move up/down | Exercise row | `size=sm`, icon-only. | 48px target and clearer labels/aria. | P1 |
| Edit Exercise | Exercise row | `size=sm`, dense. | 48px target. | P1 |
| Remove Exercise | Exercise row | `size=sm`, no confirm/undo. | 48px + confirm/undo. | P1 |
| Details/Guide/Video | Exercise row | `size=sm`, dense. | De-prioritize/stack with 48px targets. | P2 |
| Add Exercise | Separate card | Good primary add entry. | Keep; add draft/save guidance. | P2 |

---

## 10. Loading / empty / success / error / pending states

| State | Current behavior | Problem | Required fix | Priority |
|---|---|---|---|---|
| Day loading | Plain text. | Low confidence. | Skeleton. | P1 |
| Day load failure | Plain text + toast. | No retry/back pattern. | ErrorState with retry and back. | P1 |
| Draft restored | Silent. | User may not know they are editing stale local draft. | Draft-restored banner. | P1 |
| Unsaved changes | Not shown. | User cannot trust save state. | Dirty-state indicator. | P1 |
| Save pending | Button text only. | Good start but not enough. | Add status bar/pending state. | P2 |
| Save failure | Toast only. | User may miss failure. | Inline failure with retry; keep draft. | P1 |
| Save success | Toast then redirect. | Okay, but loses context. | Prefer contextual return or success state before redirect. | P2 |
| Remove exercise | Immediate local update. | No undo/confirm. | Undo/confirm state. | P1 |
| Empty exercise list | Simple text. | No direct add CTA inside list. | Add CTA/link to add exercise. | P2 |
| Add-exercise loading/error | Plain text/toast. | Can confuse empty vs failed search. | Skeleton/ErrorState and result-state distinction. | P2 |

---

## 11. Motion and interaction design

Editor motion should clarify changes, not decorate.

Required motion behavior:

| Interaction | Current behavior | Problem | Required motion | Priority |
|---|---|---|---|---|
| Reorder exercise | Instant reorder. | Hard to track item movement. | Reduced-motion-safe row move feedback. | P2 |
| Remove exercise | Instant removal. | Easy to lose context. | Undo/toast-inline row removal state. | P1 |
| Save | Button text changes. | Good start. | Status bar transition to saved/failed. | P1 |
| Draft restore | Silent. | User may not know source of state. | Static banner; no animation required. | P1 |
| Edit collapse/expand | Instant. | Acceptable. | Optional simple reveal; respect reduced motion. | P3 |

No decorative editor animation. Use motion only for reorder/remove/save feedback.

---

## 12. Implementation risk

| Risk | Why it matters | Recommendation |
|---|---|---|
| Local draft persistence is useful but silent. | Users can unknowingly edit stale local state. | Show restored draft banner and discard action. |
| Cancel clears localStorage. | This is destructive to unsaved edits. | Confirm before clearing draft. |
| Save deletes/reinserts day exercises. | A failed insert after delete could be risky if not transactional. | Do not rewrite service in this audit unless necessary; at least show failure state clearly. |
| Add-exercise and editor share draft key. | Useful but easy to misunderstand. | Explain add route changes are draft until saved. |
| Imported ChatGPT plans can be edited manually. | Users need clarity that edits are manual and saved only after approval. | Add plan source/context where available. |
| Broad builder changes can affect existing plan flow. | Keep correction scoped to day editor and add-exercise state/tap targets. | Avoid full builder rewrite. |

---

## 13. Score breakdown

| Category | Score | Max | Notes |
|---|---:|---:|---|
| Route purpose and action hierarchy | 10 | 15 | Correct editor purpose, but no editor status layer. |
| Button size, placement, and hierarchy | 8 | 15 | Save/add are okay; many row controls are small/dense. |
| Spacing consistency and visual rhythm | 8 | 10 | Readable, but dense exercise actions on mobile. |
| Feedback, optimistic UI, loading, and errors | 5 | 15 | Draft exists but status/errors/rollback are mostly invisible. |
| Motion and interaction quality | 5 | 15 | Functional but no reorder/remove/save state clarity. |
| Mobile-first behavior and tap comfort | 7 | 10 | Works, but critical row actions need 48px and stacking. |
| AI safety, privacy, and high-risk action control | 8 | 10 | Correctly manual editor; destructive draft actions need confirmation. |
| Premium/subscription readiness | 8 | 10 | Feature-complete but not editor-trust-grade. |
| **Total** | **59** | **100** | Useful editor, but unsaved-change and row-action reliability must improve before release. |

---

## 14. Constitution violations

| Rule violated | Evidence | Fix |
|---|---|---|
| Loading/error state clarity | Day/add-exercise pages use plain text and toasts. | Add ErrorState/skeleton. |
| High-risk action confirmation | Cancel clears local draft; remove exercise deletes from draft immediately. | Add confirm/undo. |
| 48px tap target baseline | Move/edit/remove/details/guide buttons use `size=sm`. | Resize and stack actions. |
| Feedback loop completeness | Draft restore/dirty/save failure not visible. | Add editor status bar. |
| Motion should clarify change | Reorder/remove happen instantly without state clarity. | Add reduced-motion-safe feedback. |

---

## 15. Required fixes

| Priority | Fix | Owner | Status |
|---|---|---|---|
| P1 | Add editor status bar showing draft restored, unsaved changes, saving, saved, failed. | Codex/Kimi/Human | Open |
| P1 | Add unsaved-change guard for Back/Cancel; Cancel must confirm before clearing local draft. | Codex/Kimi/Human | Open |
| P1 | Add inline save failure state with retry; keep local draft intact. | Codex/Kimi/Human | Open |
| P1 | Add draft-restored banner with discard draft action. | Codex/Kimi/Human | Open |
| P1 | Add confirm/undo for remove exercise. | Codex/Kimi/Human | Open |
| P1 | Resize move/edit/remove exercise controls to 48px effective targets. | Codex/Kimi/Human | Open |
| P1 | Replace plain day load failure with ErrorState and retry/back. | Codex/Kimi/Human | Open |
| P2 | Add clear add-exercise route guidance: changes are draft until saved. | Codex/Kimi/Human | Open |
| P2 | Distinguish add-exercise failed search/filter load from true empty result. | Codex/Kimi/Human | Open |
| P2 | Add 48px stacking for details/guide/custom-video controls. | Codex/Kimi/Human | Open |
| P2 | Validate custom video URL format inline. | Codex/Kimi/Human | Open |
| P2 | Prefer returning to plan detail after save when route context is known. | Codex/Kimi/Human | Open |
| P2 | Add reduced-motion-safe reorder/remove feedback. | Codex/Kimi/Human | Open |

---

## 16. Retest checklist

- [ ] `/my-workout/day/[dayId]` shows skeleton while loading.
- [ ] Day load failure shows ErrorState with retry/back.
- [ ] Restored local draft is visible and discardable.
- [ ] Unsaved changes are visible after editing day name/weekday/notes/exercises.
- [ ] Back/Cancel does not silently lose edits.
- [ ] Save failure keeps draft and shows inline retry/failure.
- [ ] Remove exercise has confirm/undo behavior.
- [ ] Move/edit/remove controls are 48px effective targets on 390x844.
- [ ] Exercise details/guide/video actions remain reachable but less dense.
- [ ] Add-exercise route explains that added movements are draft until saving the day.
- [ ] Add-exercise failed loads are not shown as true empty results.
- [ ] Custom video URL validation works for invalid non-url text.
- [ ] No database schema, auth, workout session tracking, AI import/apply flow, or unrelated routes are changed.

---

## 17. Codex prompt section

Use this route with editor-state/data-integrity review. It touches workout plan edits and local draft persistence, so keep changes narrow.

```txt
/caveman lite

$memory-management $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + workout editor data-integrity reviewer + mobile interaction reviewer
```

Implementation should not change workout database schema, auth behavior, workout session execution, AI import/apply behavior, global theme, or unrelated routes.

---

## 18. Implementation note

Do not rebuild the workout editor from scratch. Preserve the current route model:

```txt
Plan detail -> edit selected day -> local draft editor -> add exercise browser -> save day
```

The high-value correction is editor trust:

```txt
Known day -> visible draft state -> safe edits -> protected cancel/back/remove -> reliable save
```

This route is a daily-use correction surface. Silent draft behavior is the biggest trust problem.