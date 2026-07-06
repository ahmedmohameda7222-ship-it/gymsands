# Route Audit: `/calories`

**Audit date:** 2026-07-06  
**Updated:** 2026-07-06 after AI-first product clarification  
**Auditor:** ChatGPT  
**Status:** Audited  
**Score:** 54 / 100  
**Flow decision:** Needs AI-first reframing

---

## 1. Product role

`/calories` is not primarily a manual calorie-entry page.

Plaivra's intended product model is:

```txt
User tells/shows ChatGPT what they ate
-> ChatGPT estimates and structures calories/macros
-> Plaivra imports or applies that structured log after review
-> Plaivra becomes the daily overview/tracker/correction layer
```

Manual entry must exist, but it should be fallback, correction, or power-user entry.

The previous audit treated `/calories` too much like a conventional tracker. This updated audit corrects that: the route should be judged by how well it supports ChatGPT-assisted food import and review.

---

## 2. AI-first vs manual-entry role

Expected hierarchy:

```txt
1. Import meal from ChatGPT / photo / text estimate
2. Review and correct imported estimate
3. Fast repeat from previous Plaivra data
4. Simple manual add
5. Advanced manual builder / barcode / targets / weekly tools
```

Current route hierarchy is closer to:

```txt
1. Manual tracker dashboard
2. Recent/frequent manual repeat
3. Manual food log list
4. Manual water logging
5. Barcode/manual tools
6. Targets/weekly reporting
```

This is a product mismatch.

---

## 3. User intent and entry points

| User intent | Expected route behavior |
|---|---|
| I ate something and want Plaivra to track it | Primary path should be “Import from ChatGPT” or “Paste/apply ChatGPT estimate.” |
| I took a meal photo | Route should explain that the user can ask ChatGPT and import/review the estimate. |
| ChatGPT already estimated my meal | Plaivra should offer a clear review/apply path. |
| I need to fix the estimate | Editing quantity/macros/meal type/date should be easy. |
| I eat this often | Recent/frequent should be fast and secondary. |
| I do not want to use ChatGPT | Manual add/search/custom/barcode should still exist as fallback. |
| I drank water | Direct quick water logging remains primary because ChatGPT is unnecessary for water. |

---

## 4. Current workflow map

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

- The route has loading, food log, recent/frequent foods, water logging, targets, weekly summaries, and barcode tools.
- Some motion exists for food rows and animated numbers.
- Manual fallback paths are present.

Core product mismatch:

- There is no visible ChatGPT/photo/text meal import as the primary food-entry path.
- Manual search/builder/barcode/recent paths dominate the route.
- Plaivra is acting like a conventional calorie tracker, not an AI-first tracker overview.

---

## 5. Recommended workflow map

```txt
Enter /calories
-> Today nutrition overview:
   -> remaining calories/protein/water
   -> imported/pending items if any
-> Primary action: Import meal from ChatGPT
   -> Explain: send meal photo/text to ChatGPT, then import/review the estimate in Plaivra
-> Review/apply area:
   -> show parsed meal estimate when available
   -> allow edit calories/macros/meal type/date/quantity
   -> Apply to today
-> Fast fallback actions:
   -> Repeat recent/frequent
   -> Manual add/search
   -> Scan barcode
   -> Custom food/meal
   -> Copy yesterday
-> Food/water logs
-> Secondary sections:
   -> Week review
   -> Targets
   -> Advanced tools
```

The first screen should answer:

```txt
What is my nutrition status today?
How do I import what I ate from ChatGPT?
What can I correct before saving?
What can I log manually if needed?
```

---

## 6. Missing comments / microcopy

Add or improve copy for:

- “Use ChatGPT to estimate a meal from a photo or text, then review it here before saving.”
- “Plaivra stores the reviewed log, not the chat itself.” if accurate to implementation.
- “Manual add is available when you want to correct or enter something yourself.”
- “Water is logged directly because it does not need AI.”
- “Copy previous day copies meals into the selected date.”
- Failure copy: “The imported estimate was not saved. Your log is unchanged.”

Avoid making the user manually read long instructions before daily logging.

---

## 7. Score breakdown

| Category | Score | Max | Notes |
|---|---:|---:|---|
| Route purpose and action hierarchy | 6 | 15 | Current hierarchy is manual-tracker-first instead of ChatGPT/import-first. |
| Button size, placement, and hierarchy | 8 | 15 | Many actions exist, but the main AI import action is missing/weak; several controls are below 48px. |
| Spacing consistency and visual rhythm | 7 | 10 | Mostly on-scale, but cards/tabs create dense tracker feel. |
| Feedback, optimistic UI, loading, and errors | 7 | 15 | Loading exists; import review/apply states are missing; water/recent/delete need pending/rollback. |
| Motion and interaction quality | 6 | 15 | Animated numbers/food rows exist, but import/review/apply choreography is missing. |
| Mobile-first behavior and tap comfort | 6 | 10 | Mobile layout exists, but tab select and quick repeated actions are too small/hidden. |
| AI safety, privacy, and destructive-action control | 7 | 10 | No major destructive risk, but AI import permissions/review/apply are not surfaced clearly. |
| Premium/subscription readiness | 7 | 10 | Strong tracking base, but differentiation is missing from the main flow. |
| **Total** | **54** | **100** | Functional manual tracker, but not aligned with Plaivra's AI-first product model yet. |

---

## 8. Button/action inventory

| Action | Current placement | Problem | Decision | Priority |
|---|---|---|---|---|
| Import from ChatGPT / photo meal estimate | Missing or not surfaced | Core product entry path is absent from `/calories`. | Add as primary Today action and review/apply flow. | P0 |
| Weekly Summary | Desktop page heading | Report action appears before AI meal import / daily logging intent. | Move to secondary tab/More area. | P2 |
| Food Builder | Desktop heading and mobile More tools | Useful manual builder but should be fallback/edit path. | Keep secondary to ChatGPT import. | P1 |
| Copy previous day | Multiple places | Useful repeat path but scattered. | Put in fast fallback actions. | P1 |
| Mobile tab select | Top of tabs | `h-11`, below 48px and makes daily flow mode-heavy. | Resize and demote tabs behind Today-first structure. | P1 |
| Recent/Frequent toggle | RecentFoodStrip | `size=sm`; starts collapsed. | Keep as fast fallback with 48px targets. | P1 |
| Recent food Log | FoodChip | `h-8`, far below 48px. | Resize to 48px and add pending/duplicate protection. | P1 |
| Favorite heart | FoodChip | Tiny raw icon button. | Increase hit area to 48px. | P1 |
| Food delete | Food log row | `h-9 w-9`, below 48px and no pending/rollback. | Resize and add pending/rollback or safe unchanged behavior. | P1 |
| Water quick add | WaterMiniSummary/WaterCard | Direct logging is correct, but not optimistic. | Add optimistic water logging + rollback. | P1 |
| Barcode Scan/Lookup | Tools tab | Useful fallback/manual path hidden in Tools. | Surface as fallback quick action, not primary over ChatGPT. | P1 |

---

## 9. Motion/interaction inventory

| Interaction | Current behavior | Problem | Required standard | Decision | Priority |
|---|---|---|---|---|---|
| ChatGPT meal import | Missing/weak in route | No import/review/apply choreography. | Add prepare/copy/open/import/review/apply status flow. | P0 |
| Review imported estimate | Missing/weak in route | No correction moment before save. | Add editable review card/sheet before applying. | P0 |
| Food row entrance | Small fade/slide | Good. | Keep. | P2 |
| Recent food log | Waits for server, then toast/update | Too slow for repeated fallback. | Add pending/duplicate protection. | P1 |
| Water add | Waits for server before UI update | Feels non-instant. | Optimistic water total/log with rollback. | P1 |
| Tab switching | Instant content swap | Basic but not critical. | Add subtle transition only after flow correction. | P2 |
| Barcode scanner | Scanner message updates | Good fallback tool status. | Keep secondary. | P2 |

---

## 10. Constitution violations

| Rule violated | Evidence | Fix |
|---|---|---|
| AI-first tracker model | Route prioritizes manual tracker tabs/tools; no primary ChatGPT meal import. | Add ChatGPT/photo/text meal import as primary food-entry path. |
| Review/apply safety | No clear imported estimate review/correction step. | Add review/apply/correct stage before saving AI-estimated food logs. |
| Manual entry should be fallback | Manual builder/barcode/recent paths dominate. | Keep manual tools but demote to fallback/quick correction. |
| 48px tap target baseline | Recent food Log `h-8`, favorite tiny, food delete `h-9`, tab select `h-11`, water buttons `size=sm`. | Resize repeated controls to 48px effective targets. |
| Safe repeated actions should be optimistic | Water add and recent food log wait for server feedback. | Add pending/optimistic behavior and rollback. |
| Error state consistency | Uses custom red load error box instead of shared ErrorState. | Use shared ErrorState with retry/fallback. |

---

## 11. Required fixes

| Priority | Fix | Owner | Status |
|---|---|---|---|
| P0 | Add/surface primary ChatGPT meal import path on `/calories` Today view. | Codex/Kimi/Human | Open |
| P0 | Add review/apply/correct stage for imported ChatGPT meal estimates before saving. | Codex/Kimi/Human | Open |
| P1 | Reorder Today view into AI-first overview: status -> import/review -> fast fallback actions -> logs/water. | Codex/Kimi/Human | Open |
| P1 | Keep manual add/search/custom/barcode/recent as fallback/quick correction, not primary flow. | Codex/Kimi/Human | Open |
| P1 | Resize mobile tab selector/date nav/recent food/log/favorite/delete/water controls to 48px effective targets. | Codex/Kimi/Human | Open |
| P1 | Add optimistic water add with pending duplicate protection and rollback. | Codex/Kimi/Human | Open |
| P1 | Add pending/feedback for Recent food Log; avoid duplicate rapid taps. | Codex/Kimi/Human | Open |
| P1 | Add pending/rollback or safe unchanged behavior for food/water delete. | Codex/Kimi/Human | Open |
| P1 | Replace custom load error UI with shared ErrorState and retry. | Codex/Kimi/Human | Open |
| P2 | Add reduced-motion-safe import/review/apply transitions after the flow exists. | Codex/Kimi/Human | Open |

---

## 12. Retest checklist

- [ ] First screen makes ChatGPT meal import/review clearly primary.
- [ ] User can understand how to send a meal photo/text to ChatGPT and import/review the result in Plaivra.
- [ ] Imported estimates are reviewable and correctable before saving.
- [ ] Manual add/search/custom/barcode/recent remain available but secondary.
- [ ] Water remains fast direct logging and updates immediately with rollback on failure.
- [ ] Recent food Log buttons are 48px effective targets and block duplicate rapid taps.
- [ ] Favorite and delete actions have 48px effective hit areas.
- [ ] Food/water delete actions show pending/rollback or safe unchanged behavior.
- [ ] Loading error uses shared ErrorState and retry.
- [ ] Weekly and target editing remain available but do not dominate daily logging.
- [ ] Mobile 390x844 feels like an AI-first tracker overview, not a dense manual tracker dashboard.

---

## 13. Implementation note

Do not rewrite nutrition calculations or existing manual logging tools.

The high-value correction is product alignment:

```txt
ChatGPT meal import/review -> Plaivra overview/tracking -> manual fallback/correction
```

Manual food logging stays, but it is not the primary product promise.
