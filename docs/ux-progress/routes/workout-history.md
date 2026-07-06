# Route Audit: `/workout-history`

**Audit date:** 2026-07-06  
**Auditor:** ChatGPT  
**Status:** Audited  
**Score:** 60 / 100  
**Flow decision:** Tune flow with history-state and detail-readability hardening

---

## Files inspected

- `app/(private)/workout-history/page.tsx`
- `components/workouts/workout-history.tsx`
- `services/database/workout-sessions.ts`
- Related usage from:
  - `app/(private)/workouts/[id]/page.tsx`
  - `app/(private)/progress/page.tsx`

---

## 1. Product role

`/workout-history` is Plaivra's completed workout review route. It should let users understand what they actually trained, when, how much work they completed, and whether the history data is complete.

The route should answer:

```txt
What workouts did I complete recently?
How many did I do this week and month?
Can I filter by week or month?
Can I inspect exercises, sets, reps, weight, notes, and duration?
Is this a real empty state or did history fail to load?
Can I recover from a failed or partial history load?
```

This route is not AI-first and not a logging route. It is a review/history route. ChatGPT trend interpretation can exist later as an explicit user-requested review, but the core route should prioritize accurate history display, clear loading/error states, and readable workout details.

The current route has a useful base: weekly/monthly stats, all/week/month filters, mobile date dialog, combined legacy and scheduled session history, grouped exercise/set details, and a simple empty state. The main problem is history confidence and mobile detail readability. Load failures are mostly toast-only, service functions can return empty arrays on errors, the empty state does not distinguish filtered-empty from no-history or failed-load, detail rows use native `<details>` with 44px summaries, and there is no dedicated detail page or recovery state.

---

## 2. AI-first vs manual-entry role

Workout History is a review route.

Expected hierarchy:

```txt
1. History confidence/status
2. Summary stats
3. Filters and result count
4. Session list
5. Expandable session detail
6. Empty/filtered-empty/failed/degraded recovery
```

Current hierarchy:

```txt
1. PageHeading
2. This week / This month stats
3. Workout history card
4. All / week / month controls
5. Result count
6. CardSkeleton while loading
7. EmptyState when no filtered history
8. Session rows with expandable exercise details
9. Mobile date filter dialog
```

The general hierarchy is close. The missing layer is state confidence: the route must show whether the displayed data is loaded, partial, failed, filtered-empty, or genuinely empty.

---

## 3. User intent and entry points

| User intent | Expected route behavior |
|---|---|
| Review recent workouts | Show a clear list with date, duration, category, exercises, and sets. |
| Check consistency | This week/month stats should be visible after a reliable load. |
| Filter by week/month | Filters should be 48px, mobile-friendly, and make filtered-empty clear. |
| Inspect set details | Expandable rows should be readable, comfortable, and not too dense on mobile. |
| History failed to load | Show ErrorState/degraded state with retry, not a generic empty list. |
| No workouts yet | Show onboarding/start-workout guidance. |
| No matches for filter | Say no workouts match this filter and offer reset, not “No completed workouts.” |
| Scheduled history partially missing | Show partial/degraded state if legacy or scheduled source fails. |

---

## 4. Current workflow map

```txt
Enter /workout-history
-> PageHeading
-> WorkoutHistory loads legacy completed sessions and scheduled completed sessions
-> normalize both into HistoryItem[]
-> compute this week/month stats
-> user filters all/week/month
-> list sessions
-> expand a session to see exercise rows and set lines
```

Strong points:

- The route is simple and focused.
- It merges legacy `workout_sessions` and scheduled `user_workout_sessions` history.
- It groups legacy exercise logs into exercise blocks.
- It shows this week and this month counts.
- It supports week/month filtering.
- Mobile has a filter dialog instead of forcing desktop date inputs.
- The empty state points users toward starting a workout.
- The service sorts exercise logs by workout order where available.

Main workflow issues:

- `getWorkoutHistoryDetailed` returns `[]` on error, hiding failed detailed history as empty history.
- `getScheduledWorkoutHistory` returns `[]` on error, hiding failed scheduled history as empty or partial history.
- Component catch only handles Promise-level failure; individual source failures can be swallowed by services.
- Empty state does not distinguish: no workouts ever, filter returned no matches, or data failed/partially failed.
- No explicit retry action for failed/degraded history loads.
- Stats disappear during loading; there is no stat skeleton or loading placeholder.
- Filter mode buttons use `size="sm"`, below 48px.
- Details summaries use `min-h-11`, below the 48px target.
- Exercise detail rows can be dense on mobile because set lines, notes, and categories are packed into small text rows.
- No dedicated session detail route or “view full session” action for long sessions.
- No action to repeat a completed workout or view the related plan day.
- The action `Start a workout` links to `/today-workout`; route validity should be verified.
- There is no visible partial-source indicator when one history source loads and another fails.
- Hover transitions on rows are desktop-centric and add little mobile value.

---

## 5. Recommended workflow map

```txt
Enter Workout History
-> Loading skeleton / ErrorState / degraded banner
-> Stats summary
-> Filter/status row:
   -> all/week/month
   -> count
   -> reset filter when filtered-empty
-> Session list:
   -> readable session cards
   -> 48px expand controls
   -> optional View full session / Repeat action
-> Empty states:
   -> no workouts yet
   -> no workouts for selected filter
   -> failed/partial data with retry
```

This is a **tune flow with history-state and detail-readability hardening** correction. The route should keep its current scope, but must make data confidence and mobile readability stronger.

---

## 6. Flow decision label

**Tune flow with history-state and detail-readability hardening.**

Do not rebuild Workout History. Improve confidence, filters, empty states, details, and mobile controls.

---

## 7. Missing comments / microcopy

Add or improve copy for:

- “Workout history could not fully load. Showing what Plaivra could recover.”
- “No workouts match this filter.”
- “No completed workouts yet.”
- “Reset date filter.”
- “Showing completed workouts only.”
- “Skipped workouts are tracked in activity, but this history view focuses on completed sessions.”
- “View full session details” if a detail route/action is added.
- “Repeat this workout” only if a repeat route is implemented safely.

Avoid implying history is complete if one source failed.

---

## 8. UI structure

Recommended structure:

```txt
1. History load confidence
2. Stats cards
3. Filters and count
4. Session list
5. Detail expansion / full detail route
6. Empty and filtered-empty states
```

Current structural issues:

| Current object | Issue | Recommended change | Priority |
|---|---|---|---|
| Load failure | Toast-only or swallowed by service. | Add ErrorState/degraded state. | P1 |
| Empty state | Same copy for no history and filtered-empty. | Split empty states. | P1 |
| Stats | Hidden while loading. | Add stat skeleton/loading placeholder. | P2 |
| Filter buttons | `size=sm`. | Resize to 48px or segmented control. | P1 |
| Date filter dialog | Basic and usable. | Add sticky actions / clearer reset. | P2 |
| Session details | Dense native details. | 48px summary and readable mobile detail layout. | P1 |
| Long sessions | Everything expands inline. | Add optional full-detail route/action. | P2 |

---

## 9. Buttons and action hierarchy

| Action | Current placement | Problem | Decision | Priority |
|---|---|---|---|---|
| All / week / month | Header controls | `size=sm`, under target. | 48px segmented controls. | P1 |
| Date filter | Mobile button | `size=sm`, under target. | 48px. | P1 |
| Apply / Reset | Dialog footer | Basic, not sticky. | Sticky/reachable 48px actions. | P2 |
| Expand session | Native details summary | 44px and dense. | 48px, clearer label. | P1 |
| Start a workout | Empty state | Route `/today-workout` should be verified. | Verify or replace with valid route. | P1 |
| View full session | Missing | Inline details may be too dense. | Add if a route exists or is easy to add safely. | P2 |
| Repeat workout | Missing | Could be useful but risky. | Only add after safe repeat flow exists. | P3 |

---

## 10. Loading / empty / success / error / pending states

| State | Current behavior | Problem | Required fix | Priority |
|---|---|---|---|---|
| Initial loading | CardSkeleton inside card. | Good start but stats absent. | Add summary skeleton/status. | P2 |
| Legacy history failure | Service returns [] on error. | Looks like no history. | Surface failure/degraded state. | P1 |
| Scheduled history failure | Service returns [] on error. | Looks like partial/empty. | Surface failure/degraded state. | P1 |
| Component load failure | Toast and empty history. | Toast can be missed. | Inline ErrorState with retry. | P1 |
| True no history | EmptyState. | Good, but should be distinct. | Keep with correct copy/action. | P1 |
| Filtered-empty | Same as no history. | Misleading. | Show “No workouts match this filter” + reset. | P1 |
| Partial history | Not shown. | User cannot trust completeness. | Degraded banner. | P1 |
| Filter changes | Instant. | Acceptable. | Add clear count/status. | P2 |

---

## 11. Motion and interaction design

Workout History motion should be calm and functional.

Required motion behavior:

| Interaction | Current behavior | Problem | Required motion | Priority |
|---|---|---|---|---|
| Expand details | Native details + chevron rotation. | 44px and dense. | 48px reduced-motion-safe expand affordance. | P1 |
| Filter change | Instant. | Fine, but count change can be abrupt. | Optional count/status transition. | P3 |
| Loading history | Skeleton only list. | Stats jump in/out. | Stat skeleton; no decorative animation. | P2 |
| Empty to loaded | Re-render. | Acceptable. | No heavy animation. | P3 |

No celebratory animations. History is analytical and should remain stable.

---

## 12. Implementation risk

| Risk | Why it matters | Recommendation |
|---|---|---|
| Services swallow source errors. | UI cannot distinguish empty from failed. | Return metadata or handle separate calls in UI with source-level try/catch. |
| Legacy and scheduled history schemas differ. | Normalization may hide detail differences. | Keep normalized display but show source confidence. |
| Start empty-state route may be stale. | Broken CTA damages onboarding. | Verify `/today-workout` or point to known valid workout route. |
| Full session detail route may not exist. | Adding route is more work. | Keep optional; improve inline details first. |
| History data is user-owned and sensitive. | Avoid casual public/share language. | Keep privacy-respecting copy. |

---

## 13. Score breakdown

| Category | Score | Max | Notes |
|---|---:|---:|---|
| Route purpose and action hierarchy | 10 | 15 | Clear purpose, but missing confidence layer. |
| Button size, placement, and hierarchy | 8 | 15 | Filters and details controls are under 48px. |
| Spacing consistency and visual rhythm | 8 | 10 | Clean overall; details can get dense on mobile. |
| Feedback, optimistic UI, loading, and errors | 5 | 15 | Errors are toast-only or swallowed as empty arrays. |
| Motion and interaction quality | 6 | 15 | Basic native details; limited state clarity. |
| Mobile-first behavior and tap comfort | 8 | 10 | Mostly usable; details/filter controls need larger targets. |
| AI safety, privacy, and high-risk action control | 8 | 10 | Correctly not AI-first; sensitive user data needs honest load states. |
| Premium/subscription readiness | 7 | 10 | Useful route but not trust-grade until state distinctions are clear. |
| **Total** | **60** | **100** | Focused route with good data model, but failed/empty/partial states need hardening. |

---

## 14. Constitution violations

| Rule violated | Evidence | Fix |
|---|---|---|
| Loading/error state clarity | Service errors return empty arrays or toast only. | Add source-level ErrorState/degraded state. |
| 48px tap target baseline | Filter buttons and details summary are below target. | Resize or restyle controls. |
| Feedback loop completeness | History can fail and appear empty. | Distinguish failed, partial, filtered-empty, and true empty. |
| Motion should clarify state | Expand/collapse works but is dense and small. | 48px reduced-motion-safe details. |
| Premium route confidence | Stats disappear while loading and no retry state. | Add status/skeleton/retry. |

---

## 15. Required fixes

| Priority | Fix | Owner | Status |
|---|---|---|---|
| P1 | Add inline ErrorState/retry for failed history load. | Codex/Kimi/Human | Open |
| P1 | Distinguish true empty, filtered-empty, failed, and partial history states. | Codex/Kimi/Human | Open |
| P1 | Surface degraded state when legacy or scheduled history source fails. | Codex/Kimi/Human | Open |
| P1 | Resize All/week/month and mobile Date controls to 48px. | Codex/Kimi/Human | Open |
| P1 | Resize session detail summary to 48px and improve mobile readability. | Codex/Kimi/Human | Open |
| P1 | Verify `/today-workout` empty-state action route; replace if invalid. | Codex/Kimi/Human | Open |
| P2 | Add stat skeleton/loading placeholder. | Codex/Kimi/Human | Open |
| P2 | Add clearer result/status row with count and active filter. | Codex/Kimi/Human | Open |
| P2 | Improve filter dialog reset/apply layout with sticky/reachable actions. | Codex/Kimi/Human | Open |
| P2 | Add optional View full session details action if route exists or can be added safely. | Codex/Kimi/Human | Open |
| P3 | Optional: add safe repeat-workout action only after a real repeat flow is designed. | Codex/Kimi/Human | Open |

---

## 16. Retest checklist

- [ ] `/workout-history` shows skeleton/status while loading.
- [ ] Failed legacy history load is visible and retryable.
- [ ] Failed scheduled history load is visible as partial/degraded.
- [ ] True empty history is distinct from filtered-empty.
- [ ] Filtered-empty has a reset action.
- [ ] All/week/month controls are 48px effective targets.
- [ ] Mobile Date button and dialog actions are 48px effective targets.
- [ ] Session detail summary is 48px and readable on 390x844.
- [ ] Long sessions remain readable after expansion.
- [ ] `/today-workout` empty-state action is valid or replaced with a valid route.
- [ ] No workout schema, session execution, AI import/apply behavior, auth, or unrelated routes are changed.

---

## 17. Codex prompt section

Use this route with history-state and data-source confidence review.

```txt
/caveman lite

$memory-management $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + workout history data-state reviewer + mobile readability reviewer
```

Implementation should not change workout database schema, auth behavior, workout session execution semantics, AI import/apply behavior, or unrelated routes.

---

## 18. Implementation note

Do not rebuild the route. Preserve the current route model:

```txt
Stats -> filters -> completed workout list -> expandable exercise/set details
```

The highest-value correction is state honesty:

```txt
Loaded history -> known source confidence -> clear filters -> readable session details -> valid next action
```
