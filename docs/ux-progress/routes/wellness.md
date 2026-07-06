# Route Audit: `/wellness`

**Audit date:** 2026-07-06  
**Auditor:** ChatGPT  
**Status:** Audited  
**Score:** 60 / 100  
**Flow decision:** Reorder flow

---

## Files inspected

- `app/(private)/wellness/page.tsx`
- `components/wellness/daily-checkins.tsx`
- `services/database/wellness.ts`
- `services/wellness/wellness-data.ts`
- `services/database/execution-layer.ts`
- `types/database.ts`

---

## 1. Product role

`/wellness` should be the daily wellness command center, not a dense form page and not a generic list of links.

The route should answer:

```txt
How am I doing today?
What is the next useful wellness action?
Where do I go for water, habits, sleep, supplements, and tasks?
```

It should coordinate direct trackers rather than replace them. Hydration, habits, supplements, sleep/recovery, and daily fit tasks already have or should have their own focused routes. The wellness page should summarize status, guide the next action, and provide calm entry points.

The current route has the right raw material: daily check-ins, hydration status, habits, supplements, sleep, tasks, and launcher cards. The problem is hierarchy. The screen opens with the full `DailyCheckins` component, then shows five equal launcher cards. There is no clear top-level wellness status, no single next best action, and no proper loading/degraded state for the summary.

---

## 2. AI-first vs manual-entry role

Wellness is a mixed route:

```txt
Direct input -> Plaivra context -> ChatGPT can use context later
```

It should not be ChatGPT/import-first like meal plan or calories. The primary interaction is a calm daily check-in and navigation to direct trackers. However, the check-in data is valuable because it becomes context for later ChatGPT coaching, low-readiness workout adjustments, recovery suggestions, and weekly review.

Expected hierarchy:

```txt
1. Wellness status / next best action
2. Quick morning or evening check-in
3. Direct launcher cards for focused routes
4. Recent check-in context
5. Optional ChatGPT use later through workout/recovery request flows
```

Current hierarchy:

```txt
1. Full daily check-in form, expanded by default
2. Recent check-in history below check-in form
3. Launcher cards for hydration, habits, sleep, supplements, tasks
4. Toast-only error handling
```

The route is not wrong, but it is too form-first and not enough hub-first.

---

## 3. User intent and entry points

| User intent | Expected route behavior |
|---|---|
| I want to see today’s wellness status | Show a compact status summary first. |
| I want to do the most important thing now | Show one next best action, not five equal choices. |
| I just woke up | Offer morning check-in quickly. |
| I am ending the day | Offer evening review quickly. |
| I want to log water/habit/supplement/sleep/tasks | Provide clear launcher cards after the current priority. |
| I am low readiness | Explain that check-in context can guide workout/recovery decisions. |
| Something failed to load | Show a visible degraded/error state, not only a toast. |
| I already checked in | Collapse the form and show saved state plus next step. |

---

## 4. Current workflow map

```txt
Enter /wellness
-> PageHeading: Wellness
-> useEffect loads water, targets, habits, supplements, tasks, sleep history
-> if loading fails: toast only
-> DailyCheckins renders expanded by default
   -> morning check-in card
   -> evening review card
   -> recent check-ins history
-> launcher grid:
   -> Hydration
   -> Habits
   -> Sleep & Recovery
   -> Supplements
   -> Daily Fit Tasks
```

Strong points:

- The route gathers meaningful summary data across hydration, habits, supplements, tasks, and sleep.
- Launcher cards are mobile-friendly links and each has a status/detail line.
- Daily check-ins save morning/evening context to `user_daily_checkins`.
- The check-in copy correctly explains that readiness context can support future ChatGPT requests.
- The route avoids forcing ChatGPT as the main wellness action.
- Launcher cards use the correct domain routes instead of duplicating every tracker inside the hub.

Main workflow issues:

- There is no initial loading state; summary cards can show `0`, `None`, or `No target` before data is loaded.
- Load failure is toast-only, so the main screen can silently display empty/default wellness state as if real.
- `services/database/wellness.ts` returns empty arrays on several read failures, which can hide backend errors as “None.”
- `DailyCheckins` is expanded by default and visually dominates the hub, even when the user may simply want hydration, habits, or sleep.
- The launcher cards are all equal; there is no computed next best action.
- Morning and evening check-ins are both visible together, creating too much form density for a calm wellness hub.
- Saved check-ins do not collapse or promote the next unfinished wellness action.
- Some touch targets are below 48px: rating buttons use `min-h-11`, compact check-in button uses `size=sm`, badges/action grouping is dense.
- There is minimal meaningful motion around check-in saved, launcher status changes, or completion.

---

## 5. Recommended workflow map

```txt
Enter /wellness
-> Loading/degraded gate for summary data
-> Today wellness summary hero:
   -> morning/evening check-in status
   -> hydration/habits/supplements/sleep/tasks status
   -> one clear next best action
-> If next action is check-in:
   -> compact morning or evening check-in card/sheet
   -> save -> collapse -> show saved state
-> Launcher cards:
   -> hydration
   -> habits
   -> sleep/recovery
   -> supplements
   -> daily fit tasks
   -> ordered or visually weighted by urgency
-> Recent check-in context:
   -> collapsed by default or below launchers
-> Recovery:
   -> retry summary load
   -> degraded-state copy if some sections failed
```

Recommended first-screen hierarchy:

```txt
Today status -> Next wellness action -> focused launcher grid -> recent history
```

This is a **reorder flow** correction, not a full redesign.

---

## 6. Flow decision label

**Reorder flow.**

The route has the correct modules, but the order is wrong for a premium daily hub. The user should first understand status and next action, then check in or navigate. The full daily form should not dominate the page before the user sees the wellness overview.

---

## 7. Missing comments / microcopy

Add or improve copy for:

- “Your check-in helps Plaivra adjust coaching context. It does not change your plan automatically.”
- “Next: save your morning check-in” / “Next: finish evening review” / “Next: log water” depending on state.
- “Some wellness data could not load. Existing trackers are unchanged.”
- “Saved. Your readiness context is available for workout and recovery requests.”
- “Nothing urgent. Keep your routine or open any tracker below.”
- For no data states: distinguish “none scheduled” from “could not load.”

Avoid heavy wellness coaching text. The hub should stay calm and glanceable.

---

## 8. UI structure

Recommended structure:

```txt
1. Wellness summary / next best action hero
2. Compact check-in card or sheet
3. Launcher cards
4. Recent check-ins
5. Low-frequency/secondary support
```

Current structural issues:

| Current object | Issue | Recommended change | Priority |
|---|---|---|---|
| `DailyCheckins` at top, expanded | Makes the hub feel like a form page. | Move below a status/next-action hero; default to compact unless check-in is the next action. | P1 |
| Morning + evening both visible | Too much density and wrong time-of-day emphasis. | Show the relevant check-in first; make the other secondary/collapsible. | P1 |
| Launcher grid after form | Good cards but too late. | Move launcher cards directly after next action or keep them visible above recent history. | P1 |
| Recent check-in history | Useful context, but too high when embedded in full check-in. | Collapse or move below launchers. | P2 |
| No summary loading state | Default values can appear as real state. | Add skeleton/loading or status gate. | P1 |
| No visible degraded state | Toast-only errors disappear. | Add inline degraded/error summary. | P1 |
| Equal launcher cards | No prioritization. | Add next-best-action weighting or selected emphasis. | P1 |

---

## 9. Buttons and action hierarchy

| Action | Current placement | Problem | Decision | Priority |
|---|---|---|---|---|
| Save morning check-in | In full top form | Correct action, but appears inside dense form before overview. | Keep, but surface as next action when morning not saved. | P1 |
| Save evening review | Beside morning form | Useful, but should not compete in the morning. | Show based on time/state or collapse secondary. | P1 |
| Rating choices | Segmented buttons | `min-h-11`, below 48px baseline. | Increase to 48px effective height. | P1 |
| Compact Check in / Close | Header button | `size=sm`, below comfort target. | Use 48px effective target. | P1 |
| Launcher cards | Grid links | Generally large enough, but all equal. | Keep, add next-action emphasis. | P1 |
| Recent history | Static rows | No action needed. | Keep lower priority. | P3 |

---

## 10. Loading / empty / success / error / pending states

| State | Current behavior | Problem | Required fix | Priority |
|---|---|---|---|---|
| Summary loading | No loading state; default `0`/`None` render. | Misrepresents actual state. | Add summary skeleton or loading gate. | P1 |
| Summary load failure | Toast only. | Screen can look empty instead of failed. | Add inline degraded/error state with retry. | P1 |
| Partial failures | Some service reads return empty arrays. | “None” may mean failed. | Track and display degraded state where feasible. | P2 |
| Check-in load failure | Toast only when not compact. | User may edit stale/default data unknowingly. | Add inline check-in load error/retry. | P1 |
| Save morning/evening pending | Button says Saving and disables both saves. | Acceptable baseline, but could be clearer. | Keep but improve per-section pending/saved state. | P2 |
| Save success | Toast + saved text. | Good baseline; no transition/collapse. | Add calm saved state and collapse/next action. | P1 |
| Save failure | Toast only. | User may not know form was not saved. | Add inline error in the card. | P1 |
| Empty launchers | Status says `None`. | Ambiguous: no data vs failed. | Separate “none scheduled” from “could not load.” | P1 |

---

## 11. Motion and interaction design

Wellness should be calm and low-stimulation. Motion should reduce uncertainty and mark completion without making the page playful.

Required motion behavior:

| Interaction | Current behavior | Problem | Required motion | Priority |
|---|---|---|---|---|
| Check-in save | Text appears after save. | Functional but flat. | Subtle saved-state transition and collapse/next action. | P1 |
| Launcher status changes | Static after load. | No state clarity. | Light progress/status transition only if data changes. | P2 |
| Next best action | Missing. | No focal point. | Use a stable hero with no decorative motion. | P1 |
| Form open/close | Conditional render. | Abrupt. | Reduced-motion-safe reveal/collapse. | P2 |
| Error/degraded state | Toast only. | Easy to miss. | Static inline feedback; no animation needed. | P1 |

Do not add decorative wellness animations, floating gradients, or playful celebrations. Completion should be quiet.

---

## 12. Implementation risk

| Risk | Why it matters | Recommendation |
|---|---|---|
| Wellness aggregates many services. | A route-level loading/error change can accidentally overstate data confidence. | Track loaded/failed sections explicitly where feasible. |
| Some service functions swallow errors and return empty arrays. | UI cannot know whether “None” means truly none or failed. | Avoid broad service refactors in one pass; add route-level degraded handling for direct `Promise.all` failures first. |
| Check-in data feeds future AI context. | Saved readiness/stress/soreness context must be trustworthy. | Do not silently save partial/invalid values; preserve explicit save. |
| Full hub reorder can touch many subroutes if overdone. | The audit target is `/wellness`, not habits/sleep/supplements implementation. | Only change the hub and `DailyCheckins` behavior needed for hierarchy/states. |
| Time-of-day logic can be brittle. | Morning/evening detection may vary by user schedule. | Use saved-state priority first; optional time-of-day copy only as helper. |

---

## 13. Score breakdown

| Category | Score | Max | Notes |
|---|---:|---:|---|
| Route purpose and action hierarchy | 8 | 15 | Correct hub idea, but full check-in dominates before status/next action. |
| Button size, placement, and hierarchy | 9 | 15 | Launcher cards are strong; rating/save/compact controls need 48px and better hierarchy. |
| Spacing consistency and visual rhythm | 7 | 10 | Visually coherent but dense because two check-ins plus history appear before launchers. |
| Feedback, optimistic UI, loading, and errors | 6 | 15 | Save pending exists, but summary loading/error and inline check-in failures are weak. |
| Motion and interaction quality | 5 | 15 | Mostly static; missing saved/collapse/status transitions. |
| Mobile-first behavior and tap comfort | 7 | 10 | Cards are mobile-friendly; form density and 44px segmented controls hurt comfort. |
| AI safety, privacy, and destructive-action control | 8 | 10 | Avoids unsafe AI writes; check-in context copy is useful. Needs clearer “context only” framing. |
| Premium/subscription readiness | 10 | 10 | Wellness is potentially high-value, but needs hierarchy and state quality before it feels premium. |
| **Total** | **60** | **100** | Useful hub with correct modules, but currently too form-first and too weak on loading/error/next-action clarity. |

---

## 14. Constitution violations

| Rule violated | Evidence | Fix |
|---|---|---|
| Flow-first hierarchy | Full `DailyCheckins` renders before the user sees the status/launcher overview. | Add status/next-action hero first; make check-in compact/contextual. |
| One primary action per screen | Morning save, evening save, and five launchers compete. | Compute and surface one next wellness action. |
| Loading state accuracy | Summary cards render default `0`/`None` before load completes. | Add loading/skeleton gate. |
| Error recovery | Summary errors are toast-only. | Add inline degraded/error state and retry. |
| 48px tap target baseline | Rating buttons use `min-h-11`; compact check-in uses `size=sm`. | Increase effective touch targets. |
| Motion should clarify state | Check-in save and form open/close are abrupt/static. | Add calm, reduced-motion-safe feedback. |

---

## 15. Required fixes

| Priority | Fix | Owner | Status |
|---|---|---|---|
| P1 | Add a wellness status / next best action hero before the full check-in form. | Codex/Kimi/Human | Open |
| P1 | Reorder route to: status/next action -> compact check-in -> launcher cards -> recent check-ins. | Codex/Kimi/Human | Open |
| P1 | Make `DailyCheckins` compact/contextual on the hub instead of expanded full form by default. | Codex/Kimi/Human | Open |
| P1 | Show only the most relevant check-in first: morning if unsaved, evening if morning saved/evening unsaved, saved summary if both done. | Codex/Kimi/Human | Open |
| P1 | Add summary loading skeleton/gate so default `None`/`0` values are not shown as real data. | Codex/Kimi/Human | Open |
| P1 | Add inline summary error/degraded state with retry instead of toast-only failure. | Codex/Kimi/Human | Open |
| P1 | Add inline check-in save failure message and clear “not saved” state. | Codex/Kimi/Human | Open |
| P1 | Resize rating buttons and compact check-in controls to 48px effective tap targets. | Codex/Kimi/Human | Open |
| P1 | Add next-action emphasis to the relevant launcher or check-in action. | Codex/Kimi/Human | Open |
| P2 | Add calm saved-state transition and optional collapse after successful check-in save. | Codex/Kimi/Human | Open |
| P2 | Collapse or move recent check-in history below launcher cards. | Codex/Kimi/Human | Open |
| P2 | Clarify microcopy that check-in context may support ChatGPT requests but does not automatically change plans. | Codex/Kimi/Human | Open |
| P2 | Add reduced-motion-safe reveal/collapse for check-in sections. | Codex/Kimi/Human | Open |
| P3 | Keep launcher cards; do not duplicate full subroute functionality inside the hub. | Codex/Kimi/Human | Open |

---

## 16. Retest checklist

- [ ] `/wellness` first screen shows wellness status and one next best action.
- [ ] The full daily check-in form no longer dominates above the hub overview.
- [ ] Morning/evening check-in is contextual to saved state.
- [ ] Launcher cards remain visible and useful on mobile.
- [ ] Summary loading does not display false `0`/`None` values.
- [ ] Summary load failure produces visible inline degraded/error state and retry.
- [ ] Check-in load/save failure is visible inside the check-in card.
- [ ] Successful check-in save gives calm feedback and a clear next step.
- [ ] Rating controls and compact action buttons meet 48px effective tap target.
- [ ] Recent check-in history is not above the main launcher grid unless explicitly expanded.
- [ ] Motion is calm, reduced-motion-safe, and only supports saved/open/close/status changes.
- [ ] The route does not add ChatGPT as a primary wellness action.
- [ ] Mobile 390x844 feels like a calm wellness hub, not a dense form page.

---

## 17. Codex prompt section

Use this route with normal one-route UI/UX plus data-state review. It touches wellness check-in data but not destructive writes, auth, or AI import/apply.

```txt
/caveman lite

$memory-management $agent-coder $agent-reviewer $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + calm wellness UX reviewer + data-state reliability reviewer
```

Implementation should not touch database schema, unrelated wellness subroutes, AI permissions, auth, subscriptions, or global theme.

---

## 18. Implementation note

Do not rebuild wellness from scratch. Preserve the current modules:

```txt
Daily check-ins
Hydration launcher
Habits launcher
Sleep & Recovery launcher
Supplements launcher
Daily Fit Tasks launcher
Recent check-in history
```

The high-value correction is hierarchy:

```txt
Today status -> next wellness action -> compact check-in -> focused launchers -> recent history
```

Wellness should feel calm, direct, and context-aware. It should not become another dense dashboard or an AI chat page.