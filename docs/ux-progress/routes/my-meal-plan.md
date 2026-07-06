# Route Audit: `/my-meal-plan`

**Audit date:** 2026-07-06  
**Auditor:** ChatGPT  
**Status:** Audited  
**Score:** 57 / 100  
**Flow decision:** Needs AI-first reframing

---

## Files inspected

- `app/(private)/my-meal-plan/page.tsx`
- `components/meals/my-meal-plan-builder.tsx`
- `components/meals/meal-ai-actions.tsx`
- `components/meals/grocery-list-panel.tsx`
- `components/meals/meal-plan-calendar.tsx`
- `components/ai/ai-action-request-dialog.tsx`
- `services/database/meal-plan.ts`
- `types/database.ts`

---

## 1. Product role

`/my-meal-plan` should not behave primarily like a manual daily meal board.

Plaivra's intended role for meal planning is:

```txt
ChatGPT meal-plan generation/import
-> Plaivra review/apply/edit
-> planned meals overview
-> shopping list / mark-done / calorie logging support
-> manual editing as fallback/correction
```

The current route has useful planning objects: day view, week view, shopping list, mark-done logging, grocery actions, and ChatGPT request buttons. The core issue is not missing features. The core issue is that the route still opens as a manual day planner first.

The page heading says “Plan breakfast, lunch, snacks, and dinner,” and the first meaningful UI after load is macro summary cards, date controls, meal columns, and an `Add food` path. ChatGPT import exists, but it is conditional or hidden behind the add flow.

---

## 2. AI-first vs manual-entry role

Expected hierarchy:

```txt
1. Import or update a meal plan with ChatGPT
2. Review/apply/correct the structured plan in Plaivra
3. See today's planned meals and weekly context
4. Mark planned meals done so they log to Calories
5. Build/update grocery list from the reviewed plan
6. Manual add/edit as fallback or correction
7. Advanced Food Hub / preferences / exports / CSV/PDF actions
```

Current hierarchy is closer to:

```txt
1. Planned/done macro summary cards
2. Day/date selector
3. Manual meal columns
4. Add food -> Quick add / Food Hub / ChatGPT import
5. Per-item Done/Edit/Grocery/Delete
6. Per-item ChatGPT help
7. Empty-state ChatGPT import only when the selected day has no items
8. Week and Shopping tabs
```

This is a product mismatch. Manual entry is available and useful, but it is visually and structurally too dominant for an AI-first meal-plan route.

---

## 3. User intent and entry points

| User intent | Expected route behavior |
|---|---|
| I want a meal plan for the week | Make ChatGPT import/update the primary path, then let me review/apply. |
| ChatGPT already generated a meal plan | Show a clear pending import/review/apply area. |
| I want to see what to eat today | Show today's planned meals and completion state after the import/review anchor. |
| I ate a planned meal | Mark Done quickly and clearly log it to Calories. |
| I need groceries | Generate/review a grocery list from the planned meals. |
| I need to fix one meal | Edit or ask ChatGPT for a replacement in context. |
| I do not want AI for this change | Manual add/edit remains available as fallback. |
| I need to change preferences | Food preferences should be available, but not look like a fourth tab equal to Day/Week/Shopping. |

---

## 4. Current workflow map

```txt
Enter /my-meal-plan
-> PageHeading
-> MyMealPlanBuilder loads day items, week items, planned dates, calorie targets, onboarding answers
-> Four summary cards: Planned, Done, Planned carbs, Done carbs
-> Validation / notice / retry area
-> Hidden dialogs for Add planned meal and Add source
-> Tabs: Day / Week / Shopping / Food preferences link
-> Day tab:
   -> date card and week chip scroller
   -> selected-date meal heading
   -> Shopping button and Add food button
   -> mobile: meal-type chip selector + one meal column
   -> desktop: four meal columns
   -> meal item actions: Done / Edit / Grocery / Delete
   -> per-item ChatGPT help
   -> if selected day is empty: Import with ChatGPT card
-> Add food dialog:
   -> Quick add
   -> Add from Food Hub
   -> Import from ChatGPT
-> Week tab:
   -> compact calendar
   -> weekly cards
-> Shopping tab:
   -> grocery list
   -> ChatGPT ingredient-list generation
   -> quick add/export/share/cheaper swaps
```

Strong points:

- The route has day, week, and shopping support.
- `markDirectMealPlanItemDone` checks whether the item was already completed before creating a food log, which protects against duplicate calorie logs.
- Per-item ChatGPT actions explain that Plaivra prepares a request and the user reviews ChatGPT's answer before saving changes.
- The generic AI request dialog states that Plaivra will not change anything automatically.
- Grocery list export, share, PDF, quick add, and ingredient-list generation are useful supporting flows.

Main workflow failures:

- There is no persistent first-screen meal-plan import/update anchor.
- ChatGPT import is hidden after `Add food` and appears below the day content only when the selected day is empty.
- The add-source dialog orders manual `Quick add` and `Food Hub` before ChatGPT import.
- There is no route-level review/apply/correct state for a structured ChatGPT meal plan.
- After copying/opening ChatGPT, the dialog tells the user to refresh, but the route does not show a clear “pending imported plan” or “review result” state.
- Empty meal columns say “No food planned yet. Tap + to add,” which frames manual add as the default recovery path.
- Per-item ChatGPT help is useful, but repeated AI buttons inside every meal card can make the route feel action-heavy once a plan exists.
- `Done carbs` displays done carbs but uses planned fat in its detail, which can mislead the user about completed-day fat totals.

---

## 5. Recommended workflow map

```txt
Enter /my-meal-plan
-> Loading/error gate
-> Meal-plan status hero:
   -> today's plan status and week range
   -> primary: Import/update meal plan with ChatGPT
   -> secondary: Add one meal manually
   -> tertiary/menu: Food preferences / Food Hub
-> If a ChatGPT/import result is pending:
   -> Review imported week/day plan
   -> Edit meals, dates, quantities, macros, allergies/preferences conflicts
   -> Apply plan / Reject / Save draft
-> If plan exists:
   -> Today's planned meals grouped by meal type
   -> Mark Done -> logs to Calories
   -> Edit or replace individual meal
-> Week overview:
   -> compact week/calendar context and macro totals
-> Shopping support:
   -> Build/review grocery list from planned meals
   -> Mark checked / already have / export/share
-> Manual fallback:
   -> Quick add one planned meal
   -> Food Hub
   -> advanced edit only when needed
-> Success moment:
   -> plan applied / meal marked done / grocery list ready
-> Recovery:
   -> import failed: current plan unchanged, retry or manual fallback
```

This route should be reframed around:

```txt
ChatGPT plan import/review -> planned overview -> mark done / shopping -> manual fallback/correction
```

---

## 6. Flow decision label

**Needs AI-first reframing.**

The existing route should not be deleted. Its planning, mark-done, week, grocery, and per-item help objects are valuable. The correction is to reframe the route so ChatGPT meal-plan generation/import/update is the first-class workflow, while manual food entry becomes fallback/correction.

---

## 7. Missing comments / microcopy

Add or improve copy for:

- “Ask ChatGPT to build or update your week. Plaivra lets you review every meal before applying it.”
- “Manual add is for one-off meals, corrections, or offline entry.”
- “Mark Done logs this planned meal to Calories.”
- “Grocery lists are built from reviewed planned meals. You can still quick-add items manually.”
- “Food preferences are used in future ChatGPT meal-plan requests.”
- “Imported plan ready for review: check meals, quantities, macros, dates, allergies, and preferences before applying.”
- “Plan was not applied. Your current meals are unchanged.”

Avoid copy that repeats obvious labels or slows daily mark-done behavior.

---

## 8. UI structure

Recommended structure:

```txt
1. Meal-plan status/import hero
2. Pending import review/apply area, if any
3. Today planned meals and mark-done actions
4. Week context
5. Shopping list
6. Manual fallback / preferences / Food Hub / exports
```

Current structural issues:

| Current object | Issue | Recommended change | Priority |
|---|---|---|---|
| Four summary cards at top | They show useful totals but start the route as a tracker, not an AI-first planning flow. | Move into a compact day/week status strip under the meal-plan hero. | P1 |
| `Import with ChatGPT` empty card | Only appears after day content and only when selected day is empty. | Make import/update persistent and primary. | P0 |
| `Add food` CTA | Opens a source dialog where manual Quick add comes first. | Rename/reframe as secondary manual fallback; put ChatGPT import/update first. | P1 |
| Tabs + Food preferences link | Food preferences behaves like a tab but navigates away. | Move preferences to secondary action/menu or hero helper. | P2 |
| Meal columns | Useful overview/edit surface. | Keep after import/status hero; reduce repeated visible actions where needed. | P1 |
| Per-item ChatGPT help | Helpful but visually repeated under every item. | Keep contextual, but consider a compact “Ask ChatGPT” sheet or overflow once the route-level import is primary. | P2 |
| Shopping list | Strong supporting flow. | Keep, but improve empty/error/tap feedback and make ingredient-list generation review-first. | P1 |

---

## 9. Buttons and action hierarchy

| Action | Current placement | Problem | Decision | Priority |
|---|---|---|---|---|
| Import/update meal plan with ChatGPT | Add source dialog and empty-state card | Core path is hidden/conditional. | Make primary route-level CTA. | P0 |
| Review/apply ChatGPT meal plan | Missing route-level state | No clear place for imported structured plan review. | Add review/apply/correct stage before saving. | P0 |
| Add food | Day heading | Useful, but primary visual weight supports manual entry. | Demote to manual fallback/secondary. | P1 |
| Quick add | First option in Add source dialog | Makes manual entry the default add path. | Move below ChatGPT import; label as manual fallback. | P1 |
| Add from Food Hub | Second option in Add source dialog | Useful manual library path but stronger than import. | Keep secondary/fallback. | P1 |
| Date previous/Today/next | Date card | `size=sm` controls likely below 48px effective target. | Resize to 48px effective area. | P1 |
| Week day chips | Date card | Good concept, but compact vertical padding can be under comfortable touch size. | Ensure at least 48px effective height. | P1 |
| Meal-type chips | Mobile day view | Useful mobile segmentation, likely below 48px effective height. | Resize to 48px effective height. | P1 |
| Meal column `+` | Card header | `h-11 w-11`, below 48px baseline. | Resize effective target to 48px. | P1 |
| Done | Meal item row | Correct daily action, but not optimistic and uses small button. | Make 48px, add pending/optimistic-safe feedback. | P1 |
| Edit / Grocery | Meal item row | Useful but dense beside Done. | Keep secondary; consider overflow/sheet on mobile. | P2 |
| Delete planned meal | Meal item row | `h-10 w-10`, below 48px; destructive near normal actions. | Resize and separate/protect destructive action. | P1 |
| Grocery actions menu | Shopping tab header | Menu items use compact raw buttons. | Make menu items 48px and close/recover cleanly. | P1 |
| Grocery checklist toggles | Shopping item cards | Useful repeated action but not optimistic/rollback-clear. | Add optimistic check/already-have with rollback. | P1 |
| Export PDF / Share / CSV | Shopping actions | Useful but low-frequency; appears before list. | Keep lower priority, possibly overflow after core actions. | P2 |

---

## 10. Loading / empty / success / error / pending states

| State | Current behavior | Problem | Required fix | Priority |
|---|---|---|---|---|
| Route loading | Text: “Loading meal plan…” | Too plain for a primary route; layout jumps into content. | Use a meal-plan skeleton/status card. | P2 |
| Load error | NoticeBox with retry for saved plan load | Works, but not as strong as shared route-level ErrorState. | Use shared ErrorState pattern with retry. | P1 |
| Empty selected day | Import card appears, but each meal column says “Tap + to add.” | Mixed message; manual add still feels primary. | Empty state should lead with ChatGPT import/update and manual fallback. | P0 |
| Empty meal type | “No food planned yet. Tap + to add.” | Manual-first recovery. | “No breakfast planned. Import/update your plan or add one manually.” | P1 |
| ChatGPT request prepared | Dialog says request ready and asks user to refresh. | No actual route-level review/apply result state. | Add pending/review/apply/correct state. | P0 |
| Mark Done success | Updates item and shows success notice/celebration. | Good, but not instant enough for repeated daily behavior. | Add optimistic or near-instant pending state with rollback if save/log fails. | P1 |
| Mark Done failure | Error notice. | User may not know whether calorie log changed if partial failure occurs. | Use explicit “meal was not logged; plan unchanged/restored” copy. | P1 |
| Add to grocery | Fetches existing list and inserts. | No per-item pending state; rapid taps can feel uncertain. | Add pending/duplicate protection. | P1 |
| Grocery load error | Custom red box with retry. | Inconsistent with route errors. | Use shared ErrorState. | P2 |
| Grocery check/already-have | Waits for server, then updates. | Repeated checklist action should feel immediate. | Optimistic update with rollback/toast. | P1 |
| Export/share errors | Toasts exist. | Acceptable. | Keep. | P3 |
| Offline/sync | Not clearly shown. | User cannot tell whether plan/grocery changes are durable offline. | Add conservative offline/pending messaging only where relevant. | P2 |

---

## 11. Motion and interaction design

Current motion exists in selected-day content, meal rows, selected grocery actions, and grocery cards. This is a good base, but it is not connected to the most important route workflow.

Required motion behavior:

| Interaction | Current behavior | Problem | Required motion | Priority |
|---|---|---|---|---|
| AI plan import request | Dialog status only | Missing route choreography. | Prepare -> copied/opened -> pending review -> apply -> saved. | P0 |
| Apply imported plan | Missing | No success/end moment. | Calm plan-applied success card; reduced-motion-safe. | P0 |
| Day/date change | Small opacity/y transition | Acceptable. | Keep; avoid heavier transitions. | P3 |
| Meal item add/remove | AnimatePresence rows | Good baseline. | Keep, but respect reduced motion. | P2 |
| Mark Done | Success feedback exists after server result | Too delayed for repeated daily action. | Immediate check/pending state, rollback on failure. | P1 |
| Grocery checked/already-have | Static until save returns | Checklist should feel tactile. | Optimistic checkmark/fade with rollback. | P1 |
| Dialogs/sheets | Dialogs exist but source choice is generic. | Add-source flow should feel like a focused choice, not a generic modal. | Use calm sheet/dialog pattern; no decorative animation. | P2 |

Motion must support state clarity, not decoration. Do not add large meal-card animations or celebration for every small edit.

---

## 12. Implementation risk

| Risk | Why it matters | Recommendation |
|---|---|---|
| Real ChatGPT import/apply may not have a structured backend yet | The existing `AiActionRequestDialog` prepares/copies requests but does not itself apply structured meal-plan results. | Codex must inspect existing AI request/import patterns before adding apply UI. Do not invent unsafe silent writes. |
| Meal plan writes touch user nutrition data | Applying a week of meals can overwrite or duplicate user data. | Require explicit review/apply, conflict handling, and “current plan unchanged on failure” behavior. |
| Mark Done creates calorie logs | Partial failure can create trust issues if plan status and food log diverge. | Preserve existing duplicate guard and add clearer pending/failure behavior. |
| Grocery generation can create duplicate items | Current add-to-grocery checks existing records but can still feel uncertain during rapid taps. | Add per-item pending/duplicate protection. |
| Mobile density | Meal item rows already contain Done/Edit/Grocery/Delete plus ChatGPT help. | Do not add more visible buttons without grouping secondary actions. |
| Native readiness | Web-only tabs/dialog behavior may not translate cleanly to iOS/Android. | Keep state machines and service calls platform-neutral; avoid hover-only or URL-only assumptions. |

---

## 13. Score breakdown

| Category | Score | Max | Notes |
|---|---:|---:|---|
| Route purpose and action hierarchy | 6 | 15 | Useful planning tools exist, but the route opens as a manual day builder rather than ChatGPT/import-first. |
| Button size, placement, and hierarchy | 8 | 15 | Many actions are useful; primary import is hidden/conditional and several controls are below 48px. |
| Spacing consistency and visual rhythm | 7 | 10 | Mostly coherent, but dense meal rows and repeated AI actions reduce calmness. |
| Feedback, optimistic UI, loading, and errors | 8 | 15 | Basic notices and loading exist; import review/apply, optimistic mark-done, grocery rollback, and shared errors are missing. |
| Motion and interaction quality | 7 | 15 | Some row/date/list motion exists; AI import/apply and daily completion choreography are missing. |
| Mobile-first behavior and tap comfort | 6 | 10 | Mobile layout exists, but meal chips, date controls, item actions, and destructive controls need better tap comfort. |
| AI safety, privacy, and destructive-action control | 8 | 10 | Existing AI dialog is explicit and non-silent; missing route-level review/apply still blocks trust. |
| Premium/subscription readiness | 7 | 10 | Strong feature set, but hierarchy and import/apply state do not yet feel like a paid AI-first planning product. |
| **Total** | **57** | **100** | Functional and valuable, but not yet aligned with Plaivra's AI-first meal-plan model. |

---

## 14. Constitution violations

| Rule violated | Evidence | Fix |
|---|---|---|
| AI-first data-entry hierarchy | ChatGPT import is hidden in Add source and empty-state card, not route-level primary. | Make ChatGPT meal-plan import/update the primary action. |
| Review/apply safety | The route prepares ChatGPT requests but has no structured review/apply/correct route state. | Add explicit review/apply/correct stage before saving imported plans. |
| Manual entry should be fallback | Empty meal columns and Add food flow lead with manual add. | Reframe manual add as correction/fallback. |
| One primary action per section | Day heading has Shopping and Add food; every meal row has Done/Edit/Grocery/Delete plus ChatGPT help. | Group by intent and demote secondary actions. |
| 48px tap target baseline | Date buttons, chips, plus buttons, delete buttons, select controls, and menu items use 40-44px patterns. | Increase effective touch targets to at least 48px. |
| Feedback loop completeness | ChatGPT request ends with copy/open/refresh but not clear apply/result state. | Show import status and saved/unchanged result. |
| Error consistency | Route and grocery use custom error/notice patterns. | Use shared ErrorState where appropriate. |
| Data confidence | Done carbs detail uses planned fat, not done fat. | Correct the displayed detail. |

---

## 15. Required fixes

| Priority | Fix | Owner | Status |
|---|---|---|---|
| P0 | Add persistent route-level primary CTA: Import/update meal plan with ChatGPT. | Codex/Kimi/Human | Open |
| P0 | Add a review/apply/correct stage for structured ChatGPT meal-plan results before saving. | Codex/Kimi/Human | Open |
| P0 | Reframe empty day/empty meal-type states so ChatGPT import/update is primary and manual add is fallback. | Codex/Kimi/Human | Open |
| P1 | Reorder first screen: meal-plan status/import hero -> pending review -> today meals -> week/shopping/manual tools. | Codex/Kimi/Human | Open |
| P1 | Change Add source order: ChatGPT import/update first, Quick add and Food Hub secondary. | Codex/Kimi/Human | Open |
| P1 | Fix `Done carbs` detail so it uses done fat, not planned fat. | Codex/Kimi/Human | Open |
| P1 | Resize date controls, week chips, meal-type chips, meal plus, item actions, delete, form selects, and grocery menu items to 48px effective targets. | Codex/Kimi/Human | Open |
| P1 | Add clearer pending/success/failure states for Mark Done, including calorie-log result and rollback/unchanged messaging. | Codex/Kimi/Human | Open |
| P1 | Add pending/duplicate protection for Add to grocery. | Codex/Kimi/Human | Open |
| P1 | Add optimistic grocery checked/already-have interactions with rollback on failure. | Codex/Kimi/Human | Open |
| P1 | Replace custom route/grocery load errors with shared ErrorState where practical. | Codex/Kimi/Human | Open |
| P2 | Move Food preferences out of the tab row into a secondary action/menu/helper area. | Codex/Kimi/Human | Open |
| P2 | Reduce repeated per-item ChatGPT visual density after route-level import becomes primary. | Codex/Kimi/Human | Open |
| P2 | Add reduced-motion-safe import/review/apply and meal done feedback. | Codex/Kimi/Human | Open |
| P3 | Keep PDF/CSV/share as lower-priority shopping utilities; do not let them compete with checklist actions. | Codex/Kimi/Human | Open |

---

## 16. Retest checklist

- [ ] `/my-meal-plan` first screen clearly presents ChatGPT meal-plan import/update as the primary planning path.
- [ ] Existing planned meals do not hide the import/update path.
- [ ] ChatGPT-generated meal plans are reviewable and correctable before saving.
- [ ] Manual Add food remains available but is visually secondary.
- [ ] Empty day and empty meal-type states do not say only “Tap + to add.”
- [ ] Mark Done clearly logs the meal to Calories and prevents duplicate logs.
- [ ] Failed Mark Done clearly tells the user whether the plan item/log changed or remained unchanged.
- [ ] Add to grocery blocks duplicate rapid taps and reports success/failure clearly.
- [ ] Grocery checked/already-have actions feel immediate and rollback on failure.
- [ ] Date navigation, week chips, meal-type chips, item actions, delete, and menu items meet 48px effective tap target.
- [ ] `Done carbs` shows done fat detail correctly.
- [ ] Food preferences is still accessible but no longer behaves like an equal tab.
- [ ] Loading, empty, error, success, pending, retry, and offline/degraded states are clear.
- [ ] Motion supports import/apply, mark-done, checklist, and error recovery without decorative noise.
- [ ] Mobile 390x844 feels like an AI-first meal planning route, not a dense manual planner.

---

## 17. Codex prompt section

Use this route with the AI import/review/apply safety skill set because it touches user meal-plan data, calorie logging, grocery data, and ChatGPT import/apply behavior.

```txt
/caveman lite

$memory-management $security-audit $agent-reviewer $agent-coder $agent-tester

Mode: high plus advisor
Advisor: strict senior mobile product engineer + AI import/review/apply safety reviewer
```

Implementation should not rewrite nutrition calculations, database schema, auth, global theme, or unrelated meal/calorie routes. The correction is route hierarchy, AI-first import/review/apply framing, touch comfort, and state feedback.

---

## 18. Implementation note

Do not redesign the route from scratch. Preserve the useful objects:

```txt
Day meals
Week overview
Shopping list
Mark Done -> Calories
Per-item edit/replacement help
Food preferences
Manual fallback
```

The high-value correction is product alignment:

```txt
ChatGPT meal-plan import/review -> Plaivra planned overview -> shopping / mark done -> manual fallback/correction
```

Manual planning stays, but it must stop being the dominant first-screen promise.