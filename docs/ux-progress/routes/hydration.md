# Route Audit: `/hydration`

**Audit date:** 2026-07-06  
**Auditor:** ChatGPT  
**Status:** Audited  
**Score:** 68 / 100  
**Flow decision:** Tune flow

---

## Files inspected

- `app/(private)/hydration/page.tsx`
- `services/database/nutrition.ts`
- `types/database.ts`

---

## 1. Product role

`/hydration` is a daily direct-action tracker route.

Unlike calories or meal plan, ChatGPT should not be the primary entry path here. Water logging is simple, frequent, and low-risk. The route should optimize for:

```txt
Open route -> see today's hydration status -> quick add -> progress updates instantly -> recover if save fails -> review recent entries/week context
```

Plaivra's role is the fast tracker and overview layer, not an AI import/review layer.

The current route is directionally correct: it leads with today's total, progress, quick-add controls, manual amount, recent entries, weekly hydration, streak, and reminder suggestion.

---

## 2. AI-first vs manual-entry role

Hydration is a documented exception to the AI-first data-entry hierarchy. Direct quick logging is primary because ChatGPT adds friction and little value for logging a glass of water.

Expected hierarchy:

```txt
1. Quick add common amount
2. Manual amount fallback
3. Remove/correct accidental entries
4. Today and weekly progress overview
5. Target/reminder support
6. Settings/targets secondary path
```

Current hierarchy is close:

```txt
1. Today progress hero
2. Quick add 250/500/750/1000 ml
3. Manual amount
4. Recent entries
5. Weekly hydration
6. Streak/reminder
7. Refresh
8. Edit targets in page heading
```

The route does not need ChatGPT-first reframing. It needs speed, feedback, loading, rollback, target-completion, and tap-target refinements.

---

## 3. User intent and entry points

| User intent | Expected route behavior |
|---|---|
| I just drank water | Log common amount in one tap and see total/progress update immediately. |
| I drank a custom amount | Enter amount and log without heavy form friction. |
| I made a mistake | Delete the entry and see total/progress restore clearly. |
| I want to know how much is left | Show remaining amount, target, and useful next suggestion. |
| I have no target | Explain target is missing and provide a low-friction route to edit targets. |
| I want weekly context | Show week total, target days, average, streak, and day indicators. |
| Something failed | Keep the user certain whether the entry was saved or reverted. |

---

## 4. Current workflow map

```txt
Enter /hydration
-> PageHeading with Edit Targets secondary action
-> load water logs, calorie targets, and nutrition week
-> if loadError: ErrorState with retry + fallback to /calories
-> if no loadError:
   -> Today hero displays total, remaining, target progress
   -> Quick add 250 / 500 / 750 / 1000 ml
   -> Manual amount input + Add
   -> Recent entries list with delete
   -> Empty state with Add 500 ml
   -> Weekly hydration cards
   -> Mobile 7-day scroll indicators
   -> Desktop 7-day grid
   -> Current streak + reminder suggestion
   -> Refresh button
```

Strong points:

- The product role is mostly correct for hydration: direct quick logging first.
- Quick-add buttons are visible, large, and close to today's progress.
- Manual input is secondary but still available.
- Empty state gives an immediate action.
- Route-level `ErrorState` exists for major load failure.
- Weekly overview and reminder suggestion add context without dominating.
- No unnecessary ChatGPT action is forced into a simple daily water log.

Main workflow issues:

- The hero can render `0 L` while initial data is still loading, which can briefly misrepresent the user's true hydration state.
- Quick add and delete wait for server success before the visible total/progress/log list changes.
- `isSaving` is global, so one pending add/delete disables all add/delete actions without showing which action is pending.
- Delete is a small `h-10 w-10` icon button and should meet the 48px baseline.
- Refresh and Edit Targets use small button patterns for route-level actions.
- No clear target-hit completion moment exists when the user reaches the water target.
- Partial backend failures can be hidden because some nutrition service reads return empty/default data instead of surfacing a degraded state.
- There is no explicit offline/sync state for a route that depends on account-backed logs.

---

## 5. Recommended workflow map

```txt
Enter /hydration
-> Loading gate or skeleton for today's hero until logs/target are known
-> Today hydration hero:
   -> current total
   -> remaining/target
   -> progress fill
   -> next suggested amount
-> Quick add row:
   -> 250 / 500 / 750 / 1000 ml
   -> optimistic update immediately
   -> rollback and toast if save fails
-> Manual fallback:
   -> custom ml input
   -> Add with per-action pending state
-> Recent entries:
   -> newest first
   -> delete with optimistic remove + rollback
-> Weekly context:
   -> target days, average, streak, 7-day indicators
-> Reminder/target support:
   -> if no target, show clear target setup card
   -> if target hit, show calm completion state
-> Recovery:
   -> load retry
   -> offline/degraded message if logs/targets/week cannot fully load
```

This is a **tune flow**, not a full replacement.

---

## 6. Flow decision label

**Tune flow.**

The route's product model is correct. The correction is execution quality: optimistic interaction, loading accuracy, per-action pending states, tap comfort, and stronger completion/recovery states.

---

## 7. Missing comments / microcopy

Add or improve copy for:

- “Water logs update the dashboard and Calories hydration total.”
- “Target reached. You can keep logging extra water, but today’s goal is complete.”
- “No target set. Add a water target to unlock meaningful progress and streaks.”
- “Saved locally/Syncing…” only if offline or pending behavior exists.
- Failure copy: “Water was not saved. We restored your previous total.”
- Delete failure copy: “Entry was not removed. We restored it.”

Avoid long hydration coaching text. This route is a repeated daily action screen.

---

## 8. UI structure

Recommended structure:

```txt
1. Today hydration hero
2. Quick add controls
3. Manual amount fallback
4. Recent entries
5. Weekly context
6. Target/reminder support
7. Low-frequency refresh/settings actions
```

Current structural issues:

| Current object | Issue | Recommended change | Priority |
|---|---|---|---|
| PageHeading action: Edit Targets | Useful but small and visually detached from missing-target state. | Keep as secondary; also show target setup prompt inside hero when target missing. | P2 |
| Today hero | Correct lead object but can show zero while loading. | Add skeleton/loading gate or preserve previous data until loaded. | P1 |
| Quick add row | Good placement and size. | Add optimistic update and per-button pending. | P1 |
| Manual amount | Correct fallback. | Keep secondary; add validation inline if invalid. | P2 |
| Recent entries | Useful correction path. | Resize delete, optimistic remove, rollback on failure. | P1 |
| Weekly hydration | Good supporting context. | Add controlled progress animation and reduced-motion behavior if possible. | P2 |
| Streak/reminder | Useful but not actionable enough when target missing. | Make missing-target case link to target setup. | P2 |
| Refresh | Low-frequency action at bottom. | Keep, but make 48px and show pending state. | P2 |

---

## 9. Buttons and action hierarchy

| Action | Current placement | Problem | Decision | Priority |
|---|---|---|---|---|
| Quick add 250/500/750/1000 ml | Hero card | Correct primary repeated action; large `min-h-14`. | Keep, add optimistic/per-button pending. | P1 |
| Manual Add | Under quick-add row | Correct fallback and 48px height. | Keep, add inline validation/pending label. | P2 |
| Empty Add 500 ml | EmptyState | Correct next action. | Keep, but ensure duplicate protection with pending state. | P2 |
| Delete water entry | Recent entry row | `h-10 w-10`, below 48px; no rollback. | Resize to 48px and optimistic delete with rollback. | P1 |
| Edit Targets | PageHeading action | `size=sm`, likely below preferred mobile target and not contextual when no target exists. | Keep secondary but resize/treat as target setup helper. | P2 |
| Refresh | Bottom button | `size=sm`, low-frequency but route-level. | Resize to 48px and show pending. | P2 |

---

## 10. Loading / empty / success / error / pending states

| State | Current behavior | Problem | Required fix | Priority |
|---|---|---|---|---|
| Initial load | Today hero renders while `isLoading` can still be true. | May show `0 L` as real data before logs load. | Gate hero with skeleton or show loading values. | P1 |
| Route load error | Shared `ErrorState` with retry and fallback. | Good baseline. | Keep. | P3 |
| Empty today | EmptyState with Add 500 ml. | Good next action but still depends on non-optimistic save. | Keep and add pending/rollback. | P2 |
| Quick add pending | Global `isSaving` disables all actions. | User cannot tell which action is saving; UI does not update instantly. | Per-action pending + optimistic update. | P1 |
| Quick add success | Total/log updates after server returns; toast. | Feels slower than needed for daily repeated logging. | Update immediately, then confirm/silent success. | P1 |
| Quick add failure | Toast only. | No rollback because no optimistic state exists. | Add rollback with explicit restored-total copy. | P1 |
| Delete pending | Global `isSaving`; row remains until server returns. | Slow and unclear. | Optimistic remove + rollback. | P1 |
| Target reached | Progress reaches 100%. | No meaningful completion/end moment. | Calm target-hit state; no excessive celebration. | P2 |
| Missing target | Text says set target in Calories/Macros. | Good but not prominent enough. | Add target setup callout in hero. | P2 |
| Partial/degraded load | Some service functions return empty/defaults on failure. | Route may show incomplete data as if real. | Surface degraded state when possible. | P2 |
| Offline/sync | No explicit state. | User cannot tell if logging is unavailable/offline. | Add conservative offline/pending copy if supported. | P3 |

---

## 11. Motion and interaction design

The route currently relies mostly on static UI and progress bars. Hydration is a good candidate for light productive motion, but it must stay fast.

Required motion behavior:

| Interaction | Current behavior | Problem | Required motion | Priority |
|---|---|---|---|---|
| Quick add | Button disabled while saving; update after server. | No tactile immediate result. | Press feedback + optimistic number/progress update within 100 ms. | P1 |
| Progress bar update | Progress component changes value. | Acceptable but not clearly tied to add action. | Animate from previous value to new value once per logged action. | P2 |
| Target hit | No distinct state. | Missing satisfying end moment. | Calm check/target-hit state, reduced-motion safe. | P2 |
| Delete entry | Waits for server then removes. | Feels delayed. | Optimistic row exit; rollback reinsert if failure. | P1 |
| Weekly indicators | Static. | Fine. | Optional subtle progress-fill, no repeated animation on every render. | P3 |
| Error/failure | Toast only. | Needs clearer recovery. | Static error toast/callout; no playful motion. | P1 |

---

## 12. Implementation risk

| Risk | Why it matters | Recommendation |
|---|---|---|
| Optimistic water adds can diverge from server if save fails. | Daily totals and weekly totals must remain trustworthy. | Store previous logs/week state before optimistic update and rollback on failure. |
| Multiple rapid taps can create duplicate water logs. | Users may double-tap common amounts. | Use per-button pending or idempotency/temporary IDs; prevent duplicate rapid submission. |
| Delete rollback must restore exact log order and weekly total. | Removing the wrong amount damages trust. | Snapshot logs/week before optimistic delete. |
| Service functions sometimes swallow read errors. | UI may show empty/default data as real. | Avoid broad service changes in this prompt unless minimal; show degraded state where the route can detect failures. |
| Target state lives in calorie targets. | Changing target setup may affect Calories route. | Do not rewrite target management; link to existing targets and improve local copy only. |

---

## 13. Score breakdown

| Category | Score | Max | Notes |
|---|---:|---:|---|
| Route purpose and action hierarchy | 12 | 15 | Correct direct quick-log model; no unnecessary AI-first mistake. Needs better target/no-target hierarchy. |
| Button size, placement, and hierarchy | 11 | 15 | Main quick-add buttons are strong; delete, refresh, and target action need 48px cleanup. |
| Spacing consistency and visual rhythm | 8 | 10 | Mostly calm and mobile-friendly. Minor density in recent/weekly sections. |
| Feedback, optimistic UI, loading, and errors | 7 | 15 | ErrorState exists, but quick add/delete are not optimistic and hero can mislead during loading. |
| Motion and interaction quality | 6 | 15 | Very little meaningful motion; missing add/delete/progress/target-hit choreography. |
| Mobile-first behavior and tap comfort | 8 | 10 | Main mobile flow is strong; secondary controls need cleanup. |
| AI safety, privacy, and destructive-action control | 9 | 10 | Correctly avoids unnecessary AI. Delete is low-risk but needs better feedback/rollback. |
| Premium/subscription readiness | 7 | 10 | Useful, focused route, but not premium-feeling until feedback and completion states improve. |
| **Total** | **68** | **100** | Product-aligned and usable, but not yet fast/polished enough for a premium daily logging route. |

---

## 14. Constitution violations

| Rule violated | Evidence | Fix |
|---|---|---|
| Safe repeated actions should be optimistic | Quick add waits for server before total/log changes. | Optimistic add with rollback. |
| Feedback loop completeness | Delete waits for server and failure only shows toast. | Optimistic remove + rollback + restored-entry message. |
| Loading state accuracy | Hero can show `0 L` while initial data is loading. | Add skeleton or loading state for hero totals. |
| 48px tap target baseline | Delete uses `h-10 w-10`; Refresh/Edit Targets use `size=sm`. | Increase effective target sizes. |
| Completion moment | Target hit has no distinct state beyond 100% progress. | Add calm target-hit state. |
| Motion should clarify state | Add/delete/progress changes are mostly static. | Add useful progress and row transition feedback only. |

---

## 15. Required fixes

| Priority | Fix | Owner | Status |
|---|---|---|---|
| P1 | Add initial loading gate/skeleton so the hero does not show `0 L` as real data before hydration logs load. | Codex/Kimi/Human | Open |
| P1 | Add optimistic quick-add for water logs with rollback on failure. | Codex/Kimi/Human | Open |
| P1 | Add per-action pending state and duplicate rapid-tap protection for quick add/manual add. | Codex/Kimi/Human | Open |
| P1 | Add optimistic delete for recent water entries with rollback and restored-entry error copy. | Codex/Kimi/Human | Open |
| P1 | Resize delete controls to 48px effective tap targets. | Codex/Kimi/Human | Open |
| P1 | Add clearer failure copy for add/delete so the user knows whether the total changed or was restored. | Codex/Kimi/Human | Open |
| P2 | Add target-hit state or calm success moment when total reaches the target. | Codex/Kimi/Human | Open |
| P2 | Make missing-target state more actionable with a clear target setup prompt. | Codex/Kimi/Human | Open |
| P2 | Resize Refresh and Edit Targets to comfortable 48px effective targets. | Codex/Kimi/Human | Open |
| P2 | Add controlled progress/row motion for add/delete and respect reduced motion. | Codex/Kimi/Human | Open |
| P2 | Surface degraded/partial-load state if week/target/logs cannot fully load. | Codex/Kimi/Human | Open |
| P3 | Keep weekly indicators and reminder suggestion; do not add ChatGPT to this route. | Codex/Kimi/Human | Open |

---

## 16. Retest checklist

- [ ] Hydration opens with a loading skeleton/gate instead of showing false `0 L` while loading.
- [ ] Quick add updates total, progress, recent entries, and weekly total immediately.
- [ ] Failed quick add rolls back total/log/week state and explains that water was not saved.
- [ ] Manual add has validation, pending state, and duplicate protection.
- [ ] Delete removes the row immediately and restores it if delete fails.
- [ ] Delete, Refresh, Edit Targets, and empty-state action meet 48px effective tap size.
- [ ] Reaching target shows a calm, non-disruptive completion state.
- [ ] Missing target state clearly points to target setup.
- [ ] Weekly totals remain correct after optimistic add/delete.
- [ ] Route-level ErrorState retry still works.
- [ ] Motion supports add/delete/progress/target-hit feedback and respects reduced motion.
- [ ] Mobile 390x844 feels like a fast daily tracker, not a static report page.
- [ ] No ChatGPT/import action is added to primary hydration logging.

---

## 17. Codex prompt section

Use this route with the normal one-route UI/UX/data-integrity skill set. Hydration does not require AI import/review/apply safety, but it does require optimistic logging reliability.

```txt
/caveman lite

$memory-management $agent-coder $agent-reviewer $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + daily logging data-integrity reviewer
```

Implementation should not touch database schema, calorie target editing, unrelated Calories tools, AI permissions, auth, or global theme.

---

## 18. Implementation note

Do not redesign the route from scratch. Preserve the current product structure:

```txt
Today hero -> quick add -> manual fallback -> recent entries -> weekly context -> streak/reminder
```

The high-value correction is interaction quality:

```txt
Fast optimistic water logging -> visible progress update -> rollback on failure -> clear correction path
```

Hydration is intentionally not AI-first. It should be direct, fast, and reliable.