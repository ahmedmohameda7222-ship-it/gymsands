# Route Audit: `/calories`

**Audit date:** 2026-07-06  
**Auditor:** ChatGPT  
**Status:** Audited  
**Score:** 61 / 100  
**Flow decision:** Reorder flow

---

## 1. Product role

`/calories` is a daily nutrition execution route, not primarily a reporting/settings page.

The route should prioritize:

```txt
See today's nutrition status -> log food fast -> log water fast -> review today's food -> adjust targets/tools only when needed
```

Current implementation has strong functionality, but the flow is split across tabs and tools in a way that makes the page feel like a nutrition control panel instead of a fast daily tracker.

---

## 2. User intent and entry points

| User intent | Expected route behavior |
|---|---|
| I ate something and want to log it | Search/recent/scan/custom should be immediately available. |
| I drink water | Quick add should respond instantly and not require waiting. |
| I want to see what is left today | Calories/macros/water summary should be visible first. |
| I want to edit targets | Secondary flow, not mixed into daily logging. |
| I want weekly insight | Secondary review flow, not competing with daily logging. |
| I want barcode tools | A logging tool, not a separate mental destination hidden in a Tools tab. |

---

## 3. Current workflow map

```txt
Enter /calories
-> Page heading with desktop actions: Weekly Summary, Food Builder, Copy previous day
-> Tabs: Today / Week / Targets / Tools
-> Mobile uses select for tabs
-> Today tab:
   -> Active target card
   -> Mobile summary
   -> Recent food quick log
   -> Food log list
   -> Water mini summary
   -> More tools disclosure
-> Desktop today:
   -> tracker cards
   -> recent food strip
   -> water card + food log
-> Week tab:
   -> weekly tracker + nutrition coach + overview
-> Targets tab:
   -> target profiles + base target editor/wizard
-> Tools tab:
   -> barcode tools
```

Strong points:

- The route has a clear loading state.
- It has food log, recent/frequent quick logging, water logging, targets, weekly summaries, and barcode tools.
- There is some motion for food rows and animated numbers.
- The empty food log state offers multiple paths.

Problems:

- Daily logging is split into too many destinations: Today, Tools, Food Builder, Weekly Summary, Targets.
- Mobile tab select is `h-11`, below the 48px constitution baseline.
- Barcode scanning is treated as a Tools tab instead of a primary logging method.
- Recent/frequent food logging starts collapsed, so fast repeated logging requires extra taps.
- Recent food `Log` buttons are `h-8`, below baseline and too small for a daily repeated action.
- Water quick add waits for server success before updating UI.
- Delete water/food actions update only after server success or are too small.
- Error state is custom red box rather than shared ErrorState.

---

## 4. Recommended workflow map

```txt
Enter /calories
-> Today command center:
   -> date + active target summary
   -> remaining calories/protein/water
   -> primary action: Add food
   -> secondary quick actions: Recent, Scan barcode, Custom meal, Copy yesterday
-> Fast logging area:
   -> recent/frequent foods visible or one-tap expandable
   -> food log grouped by meal
   -> water quick add with optimistic feedback
-> Secondary tabs/sections:
   -> Week review
   -> Targets
   -> Food tools / barcode scan
```

The route should still support tabs, but the first screen should answer:

```txt
What remains today?
How do I log food now?
How do I log water now?
```

Flow decision: **Reorder flow**.

---

## 5. Missing comments / microcopy

Add or improve copy for:

- If targets are missing: “Set targets once to unlock remaining calories/macros.”
- If barcode scanner is moved into quick actions: “Scan packaged food.”
- If recent/frequent quick log is collapsed: “Repeat foods you already logged.”
- Water save failure: “Water was not saved. We restored the previous total.”
- Food delete failure: “Food was not deleted. Your log is unchanged.”
- Copy previous day: clarify it copies into the selected date.

Avoid overexplaining daily actions.

---

## 6. Score breakdown

| Category | Score | Max | Notes |
|---|---:|---:|---|
| Route purpose and action hierarchy | 8 | 15 | The functionality is right, but daily logging competes with tools/targets/reports. |
| Button size, placement, and hierarchy | 8 | 15 | Many buttons inherit good sizing, but mobile select, recent food log, favorite, water, delete, and small controls are below baseline. |
| Spacing consistency and visual rhythm | 7 | 10 | Mostly on-scale; Today screen has many cards and action groups. |
| Feedback, optimistic UI, loading, and errors | 8 | 15 | Loading exists, but water/food deletion/copy/recent logging are server-dependent and lack rollback/pending feedback. |
| Motion and interaction quality | 7 | 15 | Animated numbers and food-row motion exist; tab transitions, quick-log expansion, water progress, and scanner status are basic. |
| Mobile-first behavior and tap comfort | 6 | 10 | Mobile layout exists, but tab select and quick repeated actions are too small or hidden. |
| AI safety, privacy, and destructive-action control | 9 | 10 | No major AI/destructive risk in this route; delete actions are simple but need better target/rollback. |
| Premium/subscription readiness | 8 | 10 | Strong feature set, but currently feels like a dense tracker rather than a premium daily flow. |
| **Total** | **61** | **100** | Functional but needs daily logging hierarchy and tap/feedback cleanup. |

---

## 7. Button/action inventory

| Action | Current placement | Problem | Decision | Priority |
|---|---|---|---|---|
| Weekly Summary | Desktop page heading | Report action appears before daily logging intent. | Move to secondary tab/More area. | P2 |
| Food Builder | Desktop page heading and mobile More tools | Useful, but competes as top-level page action. | Keep as secondary quick action or Add Food option. | P1 |
| Copy previous day | Desktop heading, mobile More tools, food empty state | Useful repeated action but scattered. | Place in Today command center/quick actions; keep copy status inline. | P1 |
| Mobile tab select | Top of tabs | `h-11`, below 48px; routes the user through modes instead of daily command flow. | Resize and consider segmented day/week/targets pattern. | P1 |
| Review targets | Active today card | Secondary action, okay but should not dominate daily logging. | Keep secondary. | P2 |
| Prev/Next date | Mobile Today header | `size=sm`; date navigation should be 48px effective. | Resize and improve date navigation. | P1 |
| Recent/Frequent toggle | RecentFoodStrip | `size=sm`; starts collapsed, causing extra taps. | Make quick log visible or one-tap segmented control with 48px target. | P1 |
| Recent food Log | FoodChip | `h-8`, far below 48px for repeated daily action. | Resize to 48px and add pending/optimistic feedback. | P1 |
| Favorite heart | FoodChip | Raw tiny button/icon. | Increase hit area to 48px or move into card action. | P1 |
| Add food/search | Empty food log | Correct primary when empty. | Keep, but also make Add Food primary in Today command center. | P1 |
| Food delete | Food log row | `h-9 w-9`, below 48px and no optimistic rollback. | Resize to 48px and add pending/rollback. | P1 |
| Water quick add | WaterMiniSummary/WaterCard | Small buttons and server-dependent UI update. | Add optimistic water logging + 48px targets. | P1 |
| Water delete | WaterCard | Icon button depends on default size; should be confirmed enough? | Resize and add pending/rollback. | P1 |
| Barcode Scan/Lookup | Tools tab | Useful logging path hidden in Tools tab. | Surface as Add Food quick action, keep full tool section. | P1 |

---

## 8. Motion/interaction inventory

| Interaction | Current behavior | Problem | Required standard | Decision | Priority |
|---|---|---|---|---|---|
| Food row entrance | `motion.div` fade/slide | Good small motion. | Keep. | P2 |
| Recent food log | Waits for server, then toast and update | Too slow for repeated action; no pending per chip. | Add pending/optimistic feedback or per-chip disabled state. | P1 |
| Water add | Waits for server before UI update | Feels non-instant for repeated action. | Optimistic water total/log with rollback. | P1 |
| Food delete | Waits for server before local delete callback | Good data safety, but small target and no pending. | Pending state; optional optimistic delete with rollback. | P1 |
| Tab switching | Instant content swap | Acceptable but basic. | Add subtle reduced-motion-safe tab content transition if simple. | P2 |
| Barcode scanner | Scanner message updates | Good status baseline. | Keep; improve command flow placement. | P2 |
| Progress rings/bars | CSS transition/AnimatedNumber | Good baseline. | Keep; avoid reanimating excessively. | P2 |
| More tools disclosure | Native details with no animation | Basic/static. | Replace with standard Disclosure/motion if it remains. | P2 |

---

## 9. Constitution violations

| Rule violated | Evidence | Fix |
|---|---|---|
| Daily action route should be fast | Barcode, builder, copy, recent/frequent are split across tabs/disclosures. | Create Today command center with primary Add Food and quick actions. |
| 48px tap target baseline | Recent food Log `h-8`, favorite heart tiny, food delete `h-9`, tab select `h-11`, water buttons `size=sm`. | Resize repeated actions to 48px effective targets. |
| Safe repeated actions should be optimistic | Water add and recent food log wait for server before visible completion. | Add pending/optimistic behavior and rollback. |
| Error state consistency | Uses custom red load error box instead of shared ErrorState. | Use shared ErrorState with retry/fallback. |
| Progressive disclosure | Important logging tools are hidden under Tools/More, while reports/targets appear as peer tabs. | Prioritize Today logging and demote targets/reports/tools. |

---

## 10. Required fixes

| Priority | Fix | Owner | Status |
|---|---|---|---|
| P1 | Reorder Today tab into a command center: summary, Add Food primary, quick actions, then log/water. | Codex/Kimi/Human | Open |
| P1 | Surface Scan barcode, Recent/Frequent, Custom food/meal, and Copy yesterday as quick logging actions instead of hiding them in Tools/More. | Codex/Kimi/Human | Open |
| P1 | Resize mobile tab selector/date nav/recent food/log/favorite/delete/water controls to 48px effective targets. | Codex/Kimi/Human | Open |
| P1 | Add optimistic water add with pending duplicate protection and rollback. | Codex/Kimi/Human | Open |
| P1 | Add pending/feedback for recent food Log; avoid duplicate rapid taps. | Codex/Kimi/Human | Open |
| P1 | Add pending/rollback or at least clear pending state for food/water delete. | Codex/Kimi/Human | Open |
| P1 | Replace custom load error UI with shared ErrorState and retry. | Codex/Kimi/Human | Open |
| P2 | Add reduced-motion-safe transition for tab content/quick-log expansion if simple. | Codex/Kimi/Human | Open |
| P2 | Keep weekly/targets/tools as secondary sections, not equal to daily logging on the first screen. | Codex/Kimi/Human | Open |
| P2 | Add better degraded-state messaging if recent foods or barcode context fails silently. | Codex/Kimi/Human | Open |

---

## 11. Retest checklist

- [ ] First screen makes Add Food and today’s remaining nutrition obvious.
- [ ] Barcode scan, recent/frequent food, custom food, and copy previous are reachable as quick logging actions.
- [ ] Recent food Log buttons are 48px effective targets.
- [ ] Favorite and delete actions have 48px effective hit areas.
- [ ] Water quick add updates immediately and rolls back on failure.
- [ ] Recent food logging blocks duplicate rapid taps and shows clear success/failure.
- [ ] Food and water delete actions show pending/rollback or safe unchanged behavior.
- [ ] Loading error uses shared ErrorState and retry.
- [ ] Weekly and target editing remain available but do not dominate daily logging.
- [ ] Barcode scanner still works from the surfaced quick action path.
- [ ] Mobile 390x844 feels like a daily logging flow, not a dense nutrition dashboard.

---

## 12. Implementation note

Do not rewrite nutrition logic. The feature set is valuable.

The high-value correction is flow hierarchy and repeated-action interaction quality:

```txt
Today command center -> fast logging actions -> food/water logs -> secondary week/targets/tools
```
