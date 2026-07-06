# Route Audit: `/workouts/session/day/[dayId]`

**Audit date:** 2026-07-06  
**Auditor:** ChatGPT  
**Status:** Audited  
**Score:** 58 / 100  
**Flow decision:** Tune flow with one P0 bug fix

---

## 1. Product role

This route is one of the most important Plaivra flows.

It is not a management page. It is a focused workout execution mode.

The route should prioritize:

```txt
Start/resume session -> log current set -> rest -> next set -> finish workout -> summary
```

Everything else should support this loop without stealing attention.

---

## 2. User intent and entry points

Likely user intent:

| User intent | Expected route behavior |
|---|---|
| I tapped Start Today | Open a focused full-screen session immediately. |
| I am between sets | Show rest timer and next set clearly. |
| I need to log a set fast | Reps/weight + dominant Finish Set CTA should be obvious and reachable. |
| I need a replacement | Put replacement in More/actions sheet, not on main screen. |
| I am done | Show finish review and completion summary. |
| Something failed | Do not lie that a set was saved if server save failed. |

---

## 3. Current workflow map

```txt
Enter route
-> Load workout day
-> Full-screen slide-up session shell
-> Start/get session and hydrate logs/history/targets/alternatives
-> Sticky top header with elapsed/rest/progress
-> Horizontal exercise chips
-> Focus exercise card
-> Current set card with reps/weight inputs and Finish Set
-> More/Finish buttons
-> Set path buttons
-> Next exercise preview
-> Optional desktop sidebar
-> Bottom mobile sticky action intended, but disabled by shared hook
-> Finish sheet
-> Summary card
```

Strong points:

- Full-screen session shell exists.
- Route-level loading/error/empty states exist.
- Main reps/weight inputs are large.
- Finish Set is a strong 56px CTA in the set card.
- Rest timer persists using stored timestamp.
- Finish workout sheet and summary card exist.
- Advanced actions are moved to a sheet, which is the right direction.

Critical issue:

- The local mobile sticky action bar inside the session likely never renders because `MobileStickyActions` disables itself on `/workouts/session`. This removes the intended always-reachable mobile Finish Set / rest controls.

---

## 4. Recommended workflow map

```txt
Enter workout session
-> Full-screen slide from bottom
-> Start/resume gate with clear pending status if session is still starting
-> Focus header: day name, elapsed, rest timer, progress
-> Current set card:
   - Exercise name
   - Current set number
   - Reps/weight inputs
   - One dominant Finish Set action
-> Sticky in-session bottom action:
   - Finish Set / Rest Skip / Finish Workout depending on state
-> Rest transition:
   - set saved -> rest timer starts -> next set becomes visible
-> More sheet:
   - guide/video
   - advanced set details
   - replacement
   - timer controls
   - ChatGPT coach
-> Finish workout sheet
-> Completion summary
-> Back to plans/history
```

Flow decision: **Tune flow**.

The flow concept is correct, but the mobile sticky CTA bug and optimistic-save rollback problem must be fixed before this route can be trusted.

---

## 5. Missing comments / microcopy

Add or improve copy for:

- Starting/resuming session: “Loading your session and previous logs…”
- Save failure: “This set was not saved. We restored it so you can try again.”
- Rest timer permission: only ask for notifications with context, not silently during timer start.
- Finish partial workout: clarify that incomplete exercises are kept as skipped/incomplete.
- Replacement: clarify “today only” versus saved plan modification.

Avoid slowing down repeated set logging with unnecessary text.

---

## 6. Score breakdown

| Category | Score | Max | Notes |
|---|---:|---:|---|
| Route purpose and action hierarchy | 9 | 15 | Correct focus-session idea, but duplicate Finish controls and missing mobile sticky CTA weaken execution. |
| Button size, placement, and hierarchy | 7 | 15 | Main Finish Set is strong; close/more/exercise chips/set path/select/menu buttons fall below 48px or feel dense. |
| Spacing consistency and visual rhythm | 7 | 10 | Main cards have good rhythm; advanced sheet and chips are dense. |
| Feedback, optimistic UI, loading, and errors | 7 | 15 | Set completion is optimistic, but failure does not rollback. Starting state is underexplained. |
| Motion and interaction quality | 8 | 15 | Slide-up shell and MotionCard exist, but set transitions/rest/success/failure states need clearer choreography. |
| Mobile-first behavior and tap comfort | 5 | 10 | Full-screen shell is right, but local bottom CTA is disabled and several key controls are below 48px. |
| AI safety, privacy, and destructive-action control | 8 | 10 | AI actions are in sheet and contextual; replacement is today-only. Needs no silent plan mutation. |
| Premium/subscription readiness | 7 | 10 | Strong ambition, but not reliable enough until save rollback and sticky CTA are fixed. |
| **Total** | **58** | **100** | Concept is strong; execution has core reliability and mobile issues. |

---

## 7. Button/action inventory

| Action | Current placement | Problem | Decision | Priority |
|---|---|---|---|---|
| Close session | Floating top-left shell button | `h-10 w-10`, below 48px, and exits via router.back without unsaved-change warning. | Resize to 48px and warn/confirm if unsaved local changes exist. | P1 |
| Back to plan | Sticky header mobile | `h-9 w-9`, below 48px and duplicates close/back behavior. | Use one clear exit control; resize to 48px. | P1 |
| Exercise chips | Horizontal strip | Dense, likely below 48px height. | Increase effective tap area and keep horizontal scroll. | P1 |
| More exercise actions | Focus card icon | `h-10 w-10`, below 48px. | Resize to 48px. | P1 |
| Finish Set in card | Current set card | Strong primary 56px action. | Keep. | P2 |
| More / Finish secondary buttons | Current set card | Reasonable, but duplicate Finish appears in several places. | Keep only if hierarchy remains clear. | P2 |
| Set path buttons | Set path grid | `h-11`, below 48px. | Resize to 48px effective height. | P1 |
| Desktop rest timer buttons | Desktop sidebar | `size=sm`, repeated action controls. | Resize to 48px if tap/click target matters. | P2 |
| Advanced sheet close | Bottom sheet | Icon button likely default icon size; ensure 48px. | Resize to 48px effective area. | P1 |
| Advanced sheet small actions | Action blocks | Multiple `size=sm` and `h-10` selects. | Resize frequent controls and keep advanced controls grouped. | P1 |
| Mobile sticky Finish Set | Bottom sticky component | Intended but disabled on session path. | Replace with session-specific sticky CTA or allow local sticky actions. | P0 |

---

## 8. Motion/interaction inventory

| Interaction | Current behavior | Problem | Required standard | Decision | Priority |
|---|---|---|---|---|---|
| Session entry | Full-screen `motion.div` slides from bottom | Good. | Keep. | P2 |
| Session close | Slides down then router.back | Good motion, but no unsaved-change guard. | Add guard if local unsaved changes exist. | P1 |
| Finish set | Optimistically marks set complete and starts timer | Good intent, but failure does not rollback the optimistic state. | Add rollback and clear failure feedback. | P0 |
| Reopen set | Optimistically reopens set | Failure does not rollback. | Add rollback. | P1 |
| Rest timer starts | Starts immediately after set completion | Good, but should depend on save/rollback clarity. | Keep optimistic, rollback if save fails. | P1 |
| Set transition | Active set changes immediately | Functional; could use subtle focus transition. | Add small non-decorative transition only if not distracting. | P2 |
| Completion summary | Summary card appears after save | Good. | Keep; could be stronger success moment. | P2 |
| Advanced actions sheet | Appears as bottom sheet | Good pattern, but no entrance/exit animation beyond conditional render. | Add reduced-motion-safe sheet transition if simple. | P2 |

---

## 9. Constitution violations

| Rule violated | Evidence | Fix |
|---|---|---|
| Core action must remain reachable | Session uses `MobileStickyActions`, but that component disables itself on `/workouts/session`. | Create a session-specific sticky CTA or add opt-in bypass for session-local sticky actions. |
| Optimistic UI must rollback on failure | `finishSet` updates completed state before save but catch only shows toast. | Store previous state and rollback set/timer/active indexes if persistence fails. |
| 48px tap target baseline | Close/back/more/set path/chip/select controls use 36-44px patterns. | Resize effective hit areas to 48px. |
| Focus flow should avoid duplicate exit/action controls | Shell close and inner back both exist; Finish appears in card, sheet, sidebar, and intended sticky. | Define one primary action per state and one clear exit path. |
| Motion should clarify state | Set saved/rest/next set transition lacks clear status choreography on failure. | Add state feedback: saving -> saved/resting -> failed/restore. |

---

## 10. Required fixes

| Priority | Fix | Owner | Status |
|---|---|---|---|
| P0 | Restore/replace the in-session mobile sticky CTA so Finish Set / Rest / Finish Workout is reachable on mobile. | Codex/Kimi/Human | Open |
| P0 | Add rollback for failed optimistic `finishSet` persistence, including completed state, active set/exercise, and rest timer state where needed. | Codex/Kimi/Human | Open |
| P1 | Add rollback for failed `restartSet` persistence. | Codex/Kimi/Human | Open |
| P1 | Add starting/resuming session pending state inside the screen while logs/history are hydrating. | Codex/Kimi/Human | Open |
| P1 | Resize close/back/more/exercise chips/set path/advanced sheet controls to 48px effective tap targets. | Codex/Kimi/Human | Open |
| P1 | Simplify exit behavior: avoid confusing duplicate close/back controls and guard unsaved local changes. | Codex/Kimi/Human | Open |
| P1 | Add clear failure feedback: if set save fails, restore state and tell user the set was not saved. | Codex/Kimi/Human | Open |
| P2 | Add subtle rest/next-set transition feedback without delaying logging. | Codex/Kimi/Human | Open |
| P2 | Add reduced-motion-safe sheet transition for advanced actions and finish sheet. | Codex/Kimi/Human | Open |
| P2 | Improve completion success card with a clearer end moment and next step. | Codex/Kimi/Human | Open |

---

## 11. Retest checklist

- [ ] On mobile `/workouts/session/day/[dayId]`, Finish Set is always reachable without scrolling.
- [ ] Rest mode bottom action shows timer, +30s, and Skip/Stop clearly.
- [ ] Finish Workout appears as the dominant action when all sets are complete.
- [ ] Failed set save rolls back completed state and rest timer correctly.
- [ ] Failed Reopen set rolls back correctly.
- [ ] User receives clear failure feedback and can retry.
- [ ] Close/back controls are not confusing or duplicated.
- [ ] Unsaved local changes are protected before leaving.
- [ ] All key tap targets are at least 48px effective size.
- [ ] Loading, error, empty, and retry states still work.
- [ ] Advanced actions remain in the sheet and do not clutter the main set screen.
- [ ] Motion supports set/rest/completion feedback and does not slow repeated logging.

---

## 12. Implementation note

Do not redesign the whole workout session. The flow concept is already strong.

The high-value correction is reliability and mobile execution:

```txt
Fix mobile sticky CTA -> add optimistic rollback -> clean key touch targets -> clarify exit/failure states
```
