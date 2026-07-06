# Route Audit: `/workouts`

**Audit date:** 2026-07-06  
**Auditor:** ChatGPT  
**Status:** Audited  
**Score:** 58 / 100  
**Flow decision:** Tune flow with search-state, detail-state, and route-action hardening

---

## Files inspected

- `app/(private)/workouts/page.tsx`
- `components/workouts/workout-browser.tsx`
- `app/(private)/workouts/[id]/page.tsx`
- `components/workouts/video-player.tsx`
- `app/(private)/my-workout/exercises/[exerciseId]/page.tsx`
- `services/database/workout-library.ts`
- `services/workouts/exercise-library-store.ts`
- Related references from:
  - `components/workouts/workout-plan-builder.tsx`
  - `components/workouts/workout-day-add-exercise.tsx`
  - `components/workouts/workout-day-editor.tsx`

---

## 1. Product role

`/workouts` is Plaivra's global Exercise Library route.

The route should answer:

```txt
Can I find the right exercise quickly?
Can I understand what this exercise is for?
Can I save it as a favorite or custom exercise?
Can I open reliable instructions, video, details, and alternatives?
Can I start or use this exercise without hitting a broken route?
Did search/filter/favorite/custom-video actions succeed or fail?
```

This route is not AI-first. It is a reference, discovery, and manual fallback route. It supports plan building, workout replacement, exercise review, and correction flows, but it should not become the primary full-plan creation path in Plaivra's AI-first model.

The current route is strong in breadth: persisted search/filter state, favorites, custom exercise creation, admin quality checks, detail pages, custom video support, alternatives, and real workout history. The main problems are action-state trust, route-action reliability, and mobile density. Several failures are toast-only, some service fallbacks can make degraded data look complete, key action buttons are 44px instead of the 48px target, and the standalone Start action links to a route that must be verified.

---

## 2. AI-first vs manual-entry role

Exercise Library is a manual/reference fallback route.

Expected hierarchy:

```txt
1. Search / intent entry
2. Active filters and result confidence
3. Exercise cards with verified actions
4. Detail page with instruction/video/history clarity
5. Favorite/custom/custom-video states
6. Degraded/fallback data indicators
```

Current hierarchy:

```txt
1. PageHeading
2. Search card
3. Favorites / Custom / Filters / Reset controls
4. Optional custom exercise form
5. Desktop filters or mobile filter dialog
6. Admin quality checks
7. Results grid
8. Detail page for individual exercise
```

The hierarchy is mostly correct. The gap is that the user cannot always tell whether they are seeing live Supabase results, fallback local results, a real empty state, or a failed result state. Also, Start/Details/Guide card actions need route and state confidence.

---

## 3. User intent and entry points

| User intent | Expected route behavior |
|---|---|
| Find an exercise | Search/filter should show loading, count, empty, and failed states distinctly. |
| Browse all exercises | Show all should be clear, comfortable, and reversible. |
| Filter by muscle/equipment | Filter chips/options should be 48px mobile targets. |
| Favorite an exercise | Optimistic favorite with pending/failure rollback, not toast-only. |
| Create custom exercise | Inline validation, pending, success, and failure states. |
| Open exercise details | Detail route should show skeleton/ErrorState and clear history/video states. |
| Add custom video | URL validation visible before save and inline save/reset states. |
| Start an exercise | Standalone start route must exist or the action must be removed/replaced. |
| Use in workout plan | Library should link/explain plan-add flow, but not become the primary AI plan builder. |

---

## 4. Current workflow map

```txt
Enter /workouts
-> PageHeading Exercise Library
-> Search input and quick controls
-> filters from localStorage/URL hydrate
-> getWorkoutFilterOptions loads filter metadata
-> search/filter/show all triggers getWorkouts
-> results combine custom exercises + library workouts
-> user can Start, Details, Favorite, or open Guide
-> /workouts/[id] shows details, video, history, alternatives, and custom video URL
```

Strong points:

- Search input is prominent and 48px high.
- Filter state persists to URL/localStorage.
- Mobile filter dialog exists.
- Empty state suggests search/show all/filter behavior.
- Custom exercises exist and can be local fallback or user-synced.
- Favorites exist and can be local fallback or user-synced.
- Exercise detail route `/workouts/[id]` exists and includes instructions, mistakes, video, real history, alternatives, and custom video URL.
- Plan-specific exercise detail exists at `/my-workout/exercises/[exerciseId]`.
- Services combine Supabase library data, active exercises, videos, and local sample fallback.
- Admin quality checks flag missing video/instructions/labels/duplicates without deleting anything.

Main workflow issues:

- Result card `Start` links to `/workouts/session/${workout.id}`; this route must be verified because the audit did not find a matching route file.
- Filter metadata failure is toast-only; route does not show degraded filter metadata state.
- Search result load failure is toast-only and then empty results can look like true empty.
- `getWorkouts` falls back to local data on partial Supabase failure; the UI does not say results are fallback/partial.
- Favorite toggle has no local pending or rollback state; if it fails, there is no inline recovery.
- Favorites/custom exercise load failures are not surfaced as a page-level degraded state.
- Custom exercise creation has no inline form error/success state and no pending state.
- Custom form cancel can discard typed fields without confirmation.
- Custom video save/reset on `/workouts/[id]` has pending button state but failure is toast-only.
- Detail load failure is plain text, not ErrorState.
- Result card action buttons use `h-11 w-11`, below the 48px target.
- Filter group headers/options are below the 48px target.
- Mobile filter dialog has long scrollable content, but no sticky Apply/Clear footer.
- `Start` from the library is ambiguous: standalone exercise start vs planned workout session.
- Detail page favorite action lacks pending/failure state.
- Custom video label says “Open Custom Video URL,” which sounds like an action instead of an editable field.

---

## 5. Recommended workflow map

```txt
Enter Exercise Library
-> Search / quick intent card
-> Result status strip:
   -> live / fallback / loading / failed / empty
   -> active filter count and result count
-> Results grid:
   -> Details primary or Start primary based on verified route decision
   -> favorite/guide as comfortable secondary actions
-> Filters:
   -> 48px mobile chips/options
   -> sticky Apply/Clear in dialog
-> Custom exercise form:
   -> inline validation + pending/success/failure
-> Detail page:
   -> skeleton/ErrorState
   -> video/instruction/history sections
   -> custom video save/reset inline states
```

This is a **tune flow with search-state, detail-state, and route-action hardening** correction. The route has strong breadth, but needs state honesty, verified actions, and mobile tap comfort.

---

## 6. Flow decision label

**Tune flow with search-state, detail-state, and route-action hardening.**

Do not rebuild the library. Tighten the state model, action feedback, route validity, and mobile controls.

---

## 7. Missing comments / microcopy

Add or improve copy for:

- “Showing fallback exercise data because the full library could not load.”
- “Search failed. Your filters were kept.”
- “Favorites are saved to your account when signed in; otherwise stored on this device.”
- “Custom exercises are private to you.”
- “Create custom exercise failed. Your typed fields are still here.”
- “Start opens a standalone exercise session. To add exercises to a plan, use the workout day editor.”
- “Standalone start is not available yet” if `/workouts/session/[id]` is not implemented.
- “Custom video URL must start with http:// or https://.”
- “Custom video saved for this exercise only.”

Avoid implying that custom exercise creation updates public/global exercise data.

---

## 8. UI structure

Recommended structure:

```txt
1. Search / quick intent
2. Result confidence/status
3. Filters / favorites / custom controls
4. Results grid
5. Detail route states
```

Current structural issues:

| Current object | Issue | Recommended change | Priority |
|---|---|---|---|
| Standalone Start action | Route must be verified. | Implement, redirect, or remove/replace. | P0 |
| Result status | Count exists in desktop filter card only. | Add visible mobile result/status strip. | P1 |
| Load failure | Toast-only. | Add inline ErrorState/degraded state. | P1 |
| Result fallback | Service fallback invisible. | Surface fallback/partial state if known. | P1 |
| Filter controls | Some below 48px. | Resize to 48px. | P1 |
| Mobile filter dialog | Long scroll with non-sticky footer. | Add sticky Apply/Clear footer. | P2 |
| Result card actions | 44px buttons. | Resize/stack to 48px. | P1 |
| Custom form | No inline error/pending. | Add form state and validation. | P1 |
| Detail route | Plain text loading/failure. | Skeleton/ErrorState. | P1 |

---

## 9. Buttons and action hierarchy

| Action | Current placement | Problem | Decision | Priority |
|---|---|---|---|---|
| Search | Top card | Good 48px input. | Keep. | P3 |
| Favorites | Top card h-11 | Below target, no pending state. | 48px + pending/failure. | P1 |
| Custom | Top card h-11 | Below target, no unsaved form guard. | 48px + draft guard. | P2 |
| Filters | Top card h-11 | Below target. | 48px. | P1 |
| Reset | Top card h-11 | Below target. | 48px. | P1 |
| Show all | Filter panel size sm | Below target. | 48px. | P1 |
| Filter groups | Below target. | 48px headers/options. | P1 |
| Start | Result card h-11 | Below target and route ambiguity. | Verify route; clarify or replace. | P0/P1 |
| Details/favorite/guide | Result card h-11 w-11 | Below target. | 48px and better labels/aria. | P1 |
| Save custom exercise | Custom form | No pending/failure inline. | Add pending/error and disable while saving. | P1 |
| Save/reset custom video | Detail page | Failure toast-only. | Add inline pending/success/failure. | P1 |

---

## 10. Loading / empty / success / error / pending states

| State | Current behavior | Problem | Required fix | Priority |
|---|---|---|---|---|
| Filter metadata loading | Not visible. | Filter options may appear empty. | Add filter metadata loading/degraded state. | P2 |
| Filter metadata failure | Toast only. | Empty options can look real. | Inline degraded filter state. | P1 |
| Results loading | Skeleton only when no filtered workouts. | Stale results can lack loading state. | Add result status strip. | P2 |
| Results failure | Toast only and workouts cleared. | Looks like true empty. | Inline failure with retry; keep prior results if possible. | P1 |
| Fallback results | Silent. | User may think data is complete. | Show fallback/partial banner when possible. | P1 |
| Favorite pending | None. | Rapid taps unclear. | Per-card pending/rollback. | P1 |
| Favorite failure | Unhandled inline. | Toast-only or failed await. | Rollback + inline/card copy. | P1 |
| Custom save pending | None. | Duplicate submit risk. | Pending/disabled. | P1 |
| Custom save failure | Toast only. | User may miss that draft is kept. | Inline error. | P1 |
| Detail loading | Plain text. | Low quality. | Skeleton. | P1 |
| Detail failure | Plain text/toast. | No consistent recovery. | ErrorState with retry/back. | P1 |
| Custom video save/reset failure | Toast only. | State trust weak. | Inline failure/status. | P1 |

---

## 11. Motion and interaction design

Exercise Library motion should help users track filtering, favoriting, and custom creation.

Required motion behavior:

| Interaction | Current behavior | Problem | Required motion | Priority |
|---|---|---|---|---|
| Filter results update | Debounced and re-rendered. | No clear stale/loading distinction. | Result status transition, reduced-motion-safe. | P2 |
| Favorite toggle | Toast only after save. | No immediate state clarity. | Optimistic heart + rollback feedback. | P1 |
| Custom form open/close | Instant. | Acceptable but can jump. | Optional simple reveal; respect reduced motion. | P3 |
| Custom exercise saved | Form disappears. | User may lose context. | Inline success or new-card highlight. | P2 |
| Detail section expand | Uses details disclosure. | `min-h-11`, below target. | 48px, reduced-motion-safe chevron. | P2 |

No decorative card animations. Do not animate large result grids unnecessarily.

---

## 12. Implementation risk

| Risk | Why it matters | Recommendation |
|---|---|---|
| Start route may not exist. | Broken primary action damages trust. | Verify route and implement/redirect/remove. |
| Service falls back to local workouts on Supabase failure. | Good resilience, but hidden degradation can mislead users. | Show degraded/fallback state. |
| Favorites/custom exercises may be local for anonymous users. | Users need sync clarity. | Add saved locally/account copy where appropriate. |
| Custom exercise URL validation exists only at submit. | User gets late failure. | Validate inline. |
| Exercise library feeds builder/add-exercise flows. | Broad changes can affect planning. | Keep changes scoped to `/workouts` and detail route unless touching shared controls carefully. |

---

## 13. Score breakdown

| Category | Score | Max | Notes |
|---|---:|---:|---|
| Route purpose and action hierarchy | 9 | 15 | Correct feature set, but Start action needs route verification and result confidence is weak. |
| Button size, placement, and hierarchy | 8 | 15 | Search is good; many card/filter buttons are 44px or small. |
| Spacing consistency and visual rhythm | 8 | 10 | Generally clean; card actions and filters are dense. |
| Feedback, optimistic UI, loading, and errors | 5 | 15 | Toast-heavy and no favorite/custom rollback clarity. |
| Motion and interaction quality | 5 | 15 | Functional but weak state transitions. |
| Mobile-first behavior and tap comfort | 7 | 10 | Usable, but 44px actions and long filters need polish. |
| AI safety, privacy, and high-risk action control | 8 | 10 | Low AI risk; custom/local sync clarity needed. |
| Premium/subscription readiness | 8 | 10 | Strong catalog base, but action/state gaps block premium feel. |
| **Total** | **58** | **100** | Useful library, but route action validation and state hardening are required before release. |

---

## 14. Constitution violations

| Rule violated | Evidence | Fix |
|---|---|---|
| Core action reliability | Start link needs route verification. | Verify/repair route or remove/replace action. |
| Loading/error state clarity | Search/filter/favorite/custom failures rely on toasts. | Add inline states. |
| 48px tap target baseline | Several actions are h-11 or small disclosure rows. | Resize to 48px. |
| Feedback loop completeness | Favorite/custom save lack pending/rollback. | Add per-action state. |
| Premium route clarity | Icon-only actions make meaning unclear. | Add text labels/action sheet where useful. |

---

## 15. Required fixes

| Priority | Fix | Owner | Status |
|---|---|---|---|
| P0 | Verify `/workouts/session/[id]` route used by Start actions. Implement, redirect, or replace/remove Start action. | Codex/Kimi/Human | Open |
| P1 | Add inline search/filter load error with retry and distinguish failed load from true empty. | Codex/Kimi/Human | Open |
| P1 | Add degraded/fallback banner when live filter/workout data falls back to local data. | Codex/Kimi/Human | Open |
| P1 | Add favorite pending state, optimistic update, and rollback on failure. | Codex/Kimi/Human | Open |
| P1 | Catch favorites/custom load failure and show degraded state. | Codex/Kimi/Human | Open |
| P1 | Add custom exercise save pending, duplicate-submit protection, and inline failure state. | Codex/Kimi/Human | Open |
| P1 | Add inline custom video URL validation. | Codex/Kimi/Human | Open |
| P1 | Add detail route skeleton/ErrorState. | Codex/Kimi/Human | Open |
| P1 | Add custom video save/reset inline success/failure state on detail route. | Codex/Kimi/Human | Open |
| P1 | Resize top actions, filter options, result-card actions, and detail disclosures to 48px. | Codex/Kimi/Human | Open |
| P2 | Add mobile result/status row with count, loading, and active filters. | Codex/Kimi/Human | Open |
| P2 | Make mobile filter Apply/Clear actions sticky or easier to reach. | Codex/Kimi/Human | Open |
| P2 | Improve icon-only action clarity with labels or action sheet. | Codex/Kimi/Human | Open |
| P2 | Add discard confirmation for non-empty custom exercise draft. | Codex/Kimi/Human | Open |

---

## 16. Retest checklist

- [ ] `/workouts` loads with a useful empty state before search/filter/show-all.
- [ ] Search loading, loaded, true empty, and failed states are distinct.
- [ ] Filter metadata fallback/degraded state is visible when live data fails.
- [ ] Favorites/custom exercise load failures are handled visibly.
- [ ] Favorite toggle has pending/rollback behavior.
- [ ] Custom exercise save has pending, inline validation, success, and failure states.
- [ ] Invalid custom video URL is caught before or during submit with inline copy.
- [ ] `/workouts/[id]` detail route uses skeleton/ErrorState and inline custom-video save/reset states.
- [ ] `/workouts/session/[id]` Start action routes correctly or is replaced/removed.
- [ ] Top actions, filter options, result card actions, and details disclosures meet 48px target on 390x844.
- [ ] Mobile filter dialog has reachable Apply/Clear controls.
- [ ] Result count/status is visible on mobile.
- [ ] No workout plan/session data model, auth, AI import/apply behavior, or unrelated routes are changed.

---

## 17. Codex prompt section

Use this route with route-action and library-state review. Verify links before UI polish.

```txt
/caveman lite

$memory-management $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + route reliability reviewer + exercise-library UX reviewer
```

Implementation should not change workout database schema, auth behavior, workout session execution semantics, AI import/apply behavior, or unrelated routes.

---

## 18. Implementation note

Do not rebuild the library. Preserve the current route model:

```txt
Search/filter -> result cards -> favorites/custom exercises -> details/guide/start actions
```

The highest-value correction is reliability:

```txt
Verified actions -> visible result states -> reliable favorites/custom saves -> 48px mobile controls
```
