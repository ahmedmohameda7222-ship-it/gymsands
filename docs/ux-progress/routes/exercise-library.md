# Route Audit: `/workouts`

**Audit date:** 2026-07-06  
**Auditor:** ChatGPT  
**Status:** Audited  
**Score:** 64 / 100  
**Flow decision:** Tune flow with search-state and exercise-action hardening

---

## Files inspected

- `app/(private)/workouts/page.tsx`
- `components/workouts/workout-browser.tsx`
- `app/(private)/workouts/[id]/page.tsx`
- `components/workouts/video-player.tsx`
- `services/database/workout-library.ts`
- `services/workouts/exercise-library-store.ts`
- `components/workouts/workout-day-add-exercise.tsx`
- `components/workouts/workout-plan-builder.tsx`

---

## 1. Product role

`/workouts` is Plaivra's global Exercise Library route.

The route should answer:

```txt
Can I find the right exercise quickly?
Can I understand what this exercise is for?
Can I save it as favorite or custom?
Can I open reliable instructions/video/details?
Can I start it or use it in a plan without confusion?
Did search/filter/favorite/custom-video actions succeed or fail?
```

This route is not AI-first. It is a reference, discovery, and fallback-manual route. It supports plan building, workout replacement, and correction flows, but it should not be the primary way a user creates an entire workout plan in Plaivra's AI-first model.

The current route is strong in breadth: persisted search/filter state, favorites, custom exercise creation, admin quality checks, detail pages, custom video support, alternatives, and real workout history. The main problem is action-state trust and mobile density. Several failures are toast-only, some service fallbacks can make degraded data look complete, and key action buttons are 44px instead of the 48px target.

---

## 2. AI-first vs manual-entry role

Exercise Library is a manual/reference fallback route.

Expected hierarchy:

```txt
1. Search / intent entry
2. Active filters and result confidence
3. Exercise cards with clear primary action
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

The hierarchy is mostly correct. The gap is that the user cannot always tell whether they are seeing live Supabase results, fallback local results, a real empty state, or a failed result state.

---

## 3. User intent and entry points

| User intent | Expected route behavior |
|---|---|
| Find an exercise | Search/filter should show loading, count, empty, and failed states distinctly. |
| Browse all exercises | Show all should be clear, comfortable, and reversible. |
| Filter by muscle/equipment | Filter chips/options should be 48px mobile targets. |
| Favorite an exercise | Optimistic favorite with pending/failure rollback, not toast-only. |
| Create custom exercise | Inline validation, pending, success, and failure states. |
| Open exercise details | Detail load should use skeleton/ErrorState, not plain text. |
| Add custom video | URL validation visible before save and inline save/reset states. |
| Start an exercise | Clarify standalone start vs plan/session context. |
| Use in workout plan | Library should link or explain plan-add flow where relevant, but not become main AI plan builder. |

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
-> /workouts/[id] shows details, video, history, alternatives, custom video URL
```

Strong points:

- Search input is prominent and 48px high.
- Filter state persists to URL/localStorage.
- Mobile filter dialog exists.
- Empty state suggests search/show all/filter behavior.
- Custom exercises exist and can be local fallback or user-synced.
- Favorites exist and can be local fallback or user-synced.
- Exercise detail route includes instructions, mistakes, video, real history, alternatives, and custom video URL.
- Services combine Supabase library data, active exercises, videos, and local sample fallback.
- Admin quality checks flag missing video/instructions/labels/duplicates without deleting anything.

Main workflow issues:

- Filter metadata failure is toast-only; route does not show degraded filter metadata state.
- Search result load failure is toast-only and then empty results can look like true empty.
- `getWorkouts` falls back to local data on partial Supabase failure; the UI does not say results are fallback/partial.
- Favorite toggle has no local pending or rollback state; if it fails, there is no inline recovery.
- Custom exercise creation has no inline form error/success state and no pending state.
- Custom form cancel can discard typed fields without confirmation.
- Custom video save/reset on `/workouts/[id]` has pending button state but failure is toast-only.
- Detail load failure is plain text, not ErrorState.
- Result card action buttons use `h-11 w-11`, below the 48px target.
- Filter group headers use `min-h-10`; checkbox rows use `min-h-9`, below the 48px target.
- Mobile filter dialog has long scrollable content, but no sticky Apply/Clear footer.
- `Start` from library may be ambiguous: standalone exercise start vs planned workout session.
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
   -> Details primary or Start primary based on product decision
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

This is a **tune flow with search-state and exercise-action hardening** correction. The route has strong breadth, but needs state honesty and mobile tap comfort.

---

## 6. Flow decision label

**Tune flow with search-state and exercise-action hardening.**

Do not rebuild the library. Tighten the state model, action feedback, and mobile controls.

---

## 7. Missing comments / microcopy

Add or improve copy for:

- “Showing fallback exercise data because the full library could not load.”
- “Search failed. Your filters were kept.”
- “Favorites are saved to your account when signed in; otherwise stored on this device.”
- “Custom exercises are private to you.”
- “Create custom exercise failed. Your typed fields are still here.”
- “Start opens a standalone exercise session. To add exercises to a plan, use the workout day editor.”
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
| Result status | Count exists in desktop filter card only. | Add visible mobile result/status strip. | P1 |
| Load failure | Toast-only. | Add inline ErrorState/degraded state. | P1 |
| Result fallback | Service fallback invisible. | Surface fallback/partial state if known. | P2 |
| Filter controls | Some 40/36px targets. | Resize to 48px. | P1 |
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
| Filter groups | min-h-10 / min-h-9 | Below target. | 48px headers/options. | P1 |
| Start | Result card h-11 | Below target and ambiguous. | 48px; clarify standalone start. | P1 |
| Details/favorite/guide | Result card h-11 w-11 | Below target. | 48px and better labels/aria. | P1 |
| Save custom exercise | Custom form | No pending/failure inline. | Add pending/error and disable while saving. | P1 |
| Save/reset custom video | Detail page | Failure toast-only. | Add inline pending/success/failure. | P1 |

---

## 10. Loading / empty / success / error / pending states

| State | Current behavior | Problem | Required fix | Priority |
|---|---|---|---|---|
| Hydration of filters | Silent. | Acceptable. | Optional status if stale URL state restored. | P3 |
| Filter metadata loading | Not visible. | Filter options may appear empty. | Add filter metadata loading/degraded state. | P2 |
| Filter metadata failure | Toast only. | Empty options can look real. | Inline degraded filter state. | P1 |
| Search loading | Skeleton if no results. | Good baseline. | Keep; add status if replacing existing results. | P2 |
| Search failure | Toast + empty results. | Failed search can look empty. | Inline error/retry with retained filters. | P1 |
| True empty result | EmptyState. | Good but not distinct from failure. | Keep after failure distinction. | P1 |
| Favorite pending/failure | None. | User may think save worked. | Pending/rollback. | P1 |
| Custom exercise pending/failure | Toast only. | Form trust issue. | Inline error; keep draft. | P1 |
| Detail loading/failure | Plain text. | Low quality. | Skeleton/ErrorState. | P1 |
| Custom video save/reset | Button disabled + toast. | Failure can be missed. | Inline success/failure. | P1 |

---

## 11. Motion and interaction design

Exercise Library should use restrained motion for result/filter clarity.

Required motion behavior:

| Interaction | Current behavior | Problem | Required motion | Priority |
|---|---|---|---|---|
| Filter group open | Chevron rotation. | Fine but controls small. | Keep; respect reduced motion. | P2 |
| Results refresh | Skeleton only when empty. | Existing results can change abruptly. | Subtle loading/status indicator. | P2 |
| Favorite toggle | Instant after await. | No pending/rollback. | Pending/favorite state feedback. | P1 |
| Custom form show/hide | Instant. | Acceptable, but unsaved close risk. | Optional reduced-motion reveal + dirty guard. | P2 |
| Detail accordions | Native details. | Fine but summary 44px. | 48px summary and reduced-motion-safe chevron. | P1 |

No decorative exercise-card animations. Use motion to indicate filter/result changes only.

---

## 12. Implementation risk

| Risk | Why it matters | Recommendation |
|---|---|---|
| Service fallbacks are intentional. | Offline/degraded use may still be useful. | Do not remove fallback; expose degraded state if feasible. |
| Custom/favorite storage has local fallback. | Anonymous users can still use library. | Clarify account vs device storage. |
| Detail route loads many sources in one effect. | Partial failure may fail whole detail. | Prefer scoped failure states where practical. |
| Start action may bypass plan context. | Users may expect add-to-plan. | Clarify standalone session vs plan editor add flow. |
| Library is used by plan builder/add-exercise routes. | Broad component changes can affect editor flows. | Keep changes scoped and test related add-exercise route. |

---

## 13. Score breakdown

| Category | Score | Max | Notes |
|---|---:|---:|---|
| Route purpose and action hierarchy | 10 | 15 | Broad and useful, but Start/Details/Add-to-plan context is ambiguous. |
| Button size, placement, and hierarchy | 8 | 15 | Main search is good; many action/filter controls are below 48px. |
| Spacing consistency and visual rhythm | 8 | 10 | Clean cards, but dense mobile action row and filters. |
| Feedback, optimistic UI, loading, and errors | 6 | 15 | Toast-heavy failures and invisible fallback states. |
| Motion and interaction quality | 6 | 15 | Basic open/filter motion, but weak state transitions. |
| Mobile-first behavior and tap comfort | 8 | 10 | Good responsive layout; controls need 48px and sticky filter footer. |
| AI safety, privacy, and high-risk action control | 9 | 10 | Correct non-AI route; custom/private exercise copy should be clearer. |
| Premium/subscription readiness | 9 | 10 | Feature-rich; trust polish needed before release. |
| **Total** | **64** | **100** | Strong feature base, but needs search-state honesty, 48px actions, and inline action recovery. |

---

## 14. Constitution violations

| Rule violated | Evidence | Fix |
|---|---|---|
| Loading/error state clarity | Search/filter/detail/custom/favorite failures mostly toast-only or plain text. | Add inline ErrorState/degraded states. |
| 48px tap target baseline | `h-11`, `min-h-10`, and `min-h-9` controls. | Resize controls to 48px. |
| Feedback loop completeness | Favorite/custom/custom-video actions lack persistent inline failure. | Add pending/success/failure/rollback. |
| Workflow clarity | Start vs add-to-plan context unclear. | Clarify standalone start and plan-add route. |
| Motion should clarify state | Results can change abruptly after filters. | Add restrained state feedback. |

---

## 15. Required fixes

| Priority | Fix | Owner | Status |
|---|---|---|---|
| P1 | Add visible result/search status strip with loading, count, empty, failed, and fallback/degraded states. | Codex/Kimi/Human | Open |
| P1 | Add inline search failure ErrorState/retry while preserving filters. | Codex/Kimi/Human | Open |
| P1 | Add inline filter metadata failure/degraded state. | Codex/Kimi/Human | Open |
| P1 | Add pending/failure/rollback state for favorite toggles on library and detail pages. | Codex/Kimi/Human | Open |
| P1 | Add inline custom exercise validation, pending, success, and failure state; keep draft on failure. | Codex/Kimi/Human | Open |
| P1 | Add inline custom video save/reset success/failure state on detail route. | Codex/Kimi/Human | Open |
| P1 | Replace detail route plain loading/failure with skeleton and ErrorState. | Codex/Kimi/Human | Open |
| P1 | Resize top actions, result card actions, filter group headers/options, and detail summaries to 48px. | Codex/Kimi/Human | Open |
| P1 | Clarify Start as standalone exercise session and distinguish from add-to-plan flow. | Codex/Kimi/Human | Open |
| P2 | Add sticky Apply/Clear footer to mobile filters dialog. | Codex/Kimi/Human | Open |
| P2 | Add account-vs-device storage microcopy for favorites/custom exercises. | Codex/Kimi/Human | Open |
| P2 | Add custom form close/discard guard if draft has content. | Codex/Kimi/Human | Open |
| P2 | Add reduced-motion-safe result/filter update feedback. | Codex/Kimi/Human | Open |

---

## 16. Retest checklist

- [ ] `/workouts` search loading, empty, failed, fallback, and loaded states are visually distinct.
- [ ] Filter metadata failure does not look like genuinely empty filters.
- [ ] Result count and active filter count are visible on mobile.
- [ ] Favorite toggle pending/failure/rollback works on library and detail pages.
- [ ] Custom exercise creation has inline validation and failure state, and keeps draft on failure.
- [ ] Custom exercise form cancel protects non-empty draft or clearly discards it.
- [ ] Detail page uses skeleton/ErrorState instead of plain text.
- [ ] Custom video save/reset has inline success/failure state.
- [ ] Top action buttons, result card icons, filter controls, and detail accordions meet 48px target.
- [ ] Mobile filters dialog has comfortable Apply/Clear behavior.
- [ ] Start action copy clearly means standalone exercise session.
- [ ] Add-to-plan flow through `/my-workout/day/[dayId]/add-exercise` still works.
- [ ] No database schema, auth, workout execution, AI import/apply, or unrelated routes are changed.

---

## 17. Codex prompt section

Use this route with standard UI/state review, plus data-fallback caution because the library intentionally mixes Supabase data, local fallback data, custom exercises, and favorites.

```txt
/caveman lite

$memory-management $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + exercise-library search-state reviewer + mobile interaction reviewer
```

Implementation should not change database schema, auth behavior, workout session execution, AI import/apply behavior, global theme, or unrelated routes.

---

## 18. Implementation note

Do not rebuild the Exercise Library from scratch. Preserve the current route model:

```txt
Search/filter -> result cards -> exercise detail -> custom/favorite/video support
```

The high-value correction is state honesty:

```txt
Known result state -> comfortable actions -> clear favorite/custom/video outcomes -> reliable detail page
```

This route is already feature-rich. Treat missing state feedback as the release blocker, not missing features.