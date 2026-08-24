# Nutrition Meal Plan V1 Design

**Date:** 2026-08-24  
**Status:** Planner-approved design, pending written-spec review  
**Branch:** `design/nutrition-meal-plan-v1`  
**Base Nutrition design head:** `3b095fe063d99e898c4e6876d573075bae529079`

## 1. Authority and scope

This design is subordinate to:

1. `docs/product/PLAIVRA_PRODUCT_CONSTITUTION.md`
2. `docs/control/PLAIVRA_DECISIONS.md`
3. `docs/control/PLAIVRA_MASTER_PLAN.md`
4. `docs/control/PLAIVRA_CURRENT_STATE.md`
5. `docs/control/PLAIVRA_ARCHITECTURE_AUTHORITIES.md`
6. `docs/control/PLAIVRA_DELIVERY_RULES.md`
7. Existing canonical source, migrations, and Production evidence where technical facts are disputed.

Visual presentation is additionally governed by:

- `docs/superpowers/specs/2026-08-23-nutrition-native-visual-contract-design.md`

The Diary sibling contract remains authoritative for actual-intake execution semantics:

- `docs/superpowers/specs/2026-08-23-nutrition-diary-design.md`

This document defines **Nutrition → Meal Plan V1** product behavior, information architecture, domain semantics, user flows, state transitions, planning/execution boundaries, Shopping List behavior, ChatGPT change-approval behavior, offline/sync requirements, native-first layout, accessibility, and acceptance criteria.

It does not define the complete Food Library, My Recipes, Nutrition Summary, Today, billing, future Pantry inventory, recurring meal templates, or an embedded generic AI chatbot.

No implementation plan is authorized by this document. Nutrition implementation planning remains intentionally deferred until all five canonical Nutrition destinations have completed page design and Nutrition-wide reconciliation.

## 2. Product classification

This is an **Architectural** redesign.

Meal Plan changes the planning mental model from a Day-first page with peer Day/Week/Shopping tabs into a week-authoritative planning workspace with nested Shopping, revisioned plan state, explicit plan-to-actual execution, source snapshots, offline mutation semantics, and a future-native interaction model.

## 3. Product intent

Meal Plan is Plaivra's **weekly nutrition intention workspace**.

Its job is not to record what happened. Diary owns actual truth.

The core separation is:

> **Meal Plan = intention. Diary = reality.**

The Meal Plan should let a user quickly answer four questions:

1. What am I planning to eat this week?
2. Does the selected day roughly fit my nutrition targets?
3. What needs to be bought for this plan?
4. When reality happens, how do I bridge the plan into Diary without corrupting either truth?

The page should optimize repeat planning, direct editing, source trust, and plan-to-reality convergence rather than maximizing visible features.

## 4. Global design principles

### 4.1 Week-first, not Day-first

The primary planning object is a week.

The selected day is the working area inside that week, not the top-level mental model.

The user must retain week awareness while editing one day without being forced into a dense seven-column calendar.

### 4.2 Native-first semantics

The current web implementation is a temporary renderer, not long-term UI authority.

Future platform direction:

- iOS: SwiftUI;
- Android: Kotlin + Jetpack Compose.

Web, iOS, and Android must share domain semantics, commands, revision rules, synchronization, audit meaning, localization, accessibility state, and analytics definitions while using platform-appropriate navigation and control geometry.

Core behavior must not depend on hover, right-click, drag-only interaction, browser-only storage, or desktop-only calendar layouts.

### 4.3 Powerful underneath, simple on the surface

Capabilities are layered as:

- **Core visible:** week navigation, selected-day plan, meal-slot add/edit, targets, high-frequency execution bridge.
- **Contextual accelerators:** copy/repeat, Mark eaten, Shopping reconciliation after Skip, reminders when a meal has time.
- **Advanced on demand:** move, source details, conflict resolution, ChatGPT change review, source contribution breakdown.

Frequent actions must not be hidden merely to make the interface visually sparse.

### 4.4 No silent truth mutation

The system must never silently:

- turn planned food into actual intake;
- mutate existing planned occurrences because a source changed;
- rewrite Diary because a past plan was edited;
- overwrite user-protected Shopping List state;
- apply a stale ChatGPT proposal;
- resolve sync conflict with last-write-wins across the whole week;
- treat missing nutrition as zero.

## 5. Nutrition information architecture

`Nutrition` is a section, not a duplicated tab page.

Canonical hierarchy:

```text
Nutrition
├── Diary
├── Meal Plan
│   └── Shopping List
├── Food Library
├── My Recipes
└── Summary
```

Rules:

- Meal Plan opens the **Weekly Planner** by default.
- Shopping List is a nested Meal Plan destination tied to the active week.
- Shopping List is not a sixth Nutrition peer.
- Meal Plan must not recreate `Day | Week | Shopping` as peer tabs.
- The Meal Plan page title is `Meal Plan`.
- Returning from Shopping List restores the active week and selected day.
- Mobile uses native route hierarchy rather than forcing desktop sidebar behavior.

## 6. Existing implementation reality and redesign boundary

The existing web implementation already contains useful capabilities including date/week navigation, Day/Week/Shopping modes, direct meal add/edit/delete, Done/Skip, grocery operations, nutrition targets, and AI adjustment entry points.

However, the current large client coordinator and peer-tab mental model are not canonical architecture for V1.

The redesign should preserve valid existing data and useful server contracts where they satisfy the new authority, while replacing UI/state ownership that conflicts with this spec.

Targeted decomposition is expected during later implementation planning where the current coordinator mixes unrelated responsibilities. Unrelated refactoring is out of scope.

## 7. Canonical domain model

### 7.1 `MealPlanWeek`

A week is a real domain container:

```text
MealPlanWeek
├── id
├── week_start_date
├── revision
├── week-level overrides
├── days[7]
│   └── MealSlot[]
├── Shopping List linkage
└── audit / sync metadata
```

Required semantics:

- stable week identity;
- explicit `week_start_date` as the canonical calendar anchor;
- monotonically advancing revision for meaningful mutations;
- week-scoped overrides and Shopping derivation;
- lazy creation on first meaningful write.

Opening or navigating to an empty week must not create a database row.

A week is created by meaningful actions such as:

- adding a planned item;
- creating a custom slot;
- creating a week override;
- adding a manual Shopping item;
- applying an approved ChatGPT change request;
- copying a week into the destination.

If a previously used week becomes visually empty but has audit, execution, or historical linkage, its identity/history remains preserved.

### 7.2 Week-start authority

Week start uses:

- locale default;
- optional user override.

Existing historical weeks retain their explicit `week_start_date` even if the user's preference later changes.

ISO week number is not the primary identity.

### 7.3 Planning horizon

V1 has unrestricted week navigation.

There is no artificial future planning horizon limit.

Transactional authority remains one week at a time. ChatGPT pending requests target one week only in V1.

Multi-week AI apply, recurring rules, and long-running template schedules are out of scope.

## 8. Meal slots

### 8.1 Core slots

Four core slots always exist semantically:

1. Breakfast
2. Lunch
3. Dinner
4. Snacks

Empty core slots remain visible in compact form:

```text
Breakfast                                      + Add
```

They must not render as giant empty cards.

### 8.2 Custom slots

Users may create optional custom slots such as:

- Pre-workout;
- Post-workout;
- Late snack;
- Meal 2.

A custom slot is an explicit day planning occurrence in V1. It appears only where the user has defined it. Copy/repeat may create independent custom-slot occurrences on selected destination days.

V1 does not create hidden global recurring custom-slot templates.

Custom slots support:

- optional planned time;
- ordering;
- copy/repeat;
- Shopping derivation from their items;
- target totals;
- Diary execution linkage.

### 8.3 Meal time

Meal time is optional.

It is stored as local wall-clock planning semantics attached to the planned date. It is not a UTC event that can migrate to another date after timezone travel.

Time may support sorting, reminders, and future Today integration.

No automatic time optimization or rescheduling exists in V1.

## 9. Planned occurrences and item types

A meal slot contains one or more `PlannedOccurrence` objects.

Supported semantic types:

1. Food
2. Recipe
3. Saved Meal
4. Placeholder

### 9.1 Food

A planned Food represents one individual food identity and serving/quantity snapshot.

### 9.2 Recipe

A Recipe is one serving-based planned item.

It retains:

- recipe source reference;
- frozen serving count;
- frozen nutrition snapshot;
- frozen ingredient quantities needed for Shopping derivation.

The Meal Plan does not visually explode a recipe into ingredient rows.

Ingredients remain lineage for cooking/shopping detail.

### 9.3 Saved Meal

A Saved Meal is a composite bundle with individually addressable child items.

Example:

```text
Saved Meal: Chicken Lunch
├── Chicken breast
├── Rice
├── Salad
└── Yogurt
```

The bundle supports whole-bundle Move, Copy, Repeat, and Mark eaten while child items remain available for nutrition calculation, Shopping derivation, and `Log with changes`.

The plan stores frozen bundle and child snapshots.

### 9.4 Placeholder

Placeholder is a lightweight planning intention for situations such as:

- restaurant meal;
- travel meal;
- unknown future meal.

Required:

- name.

Optional:

- estimated calories/macros;
- note;
- planned time.

A Placeholder must be visibly distinguished from verified Food/Recipe data.

It does not contribute trusted nutrition where data is absent, and it does not derive Shopping items unless explicitly resolved to real food/recipe data.

`Mark eaten` on a Placeholder requires quick confirmation or replacement before actual Diary logging. Plaivra must not invent a trusted food identity.

## 10. Source reference and frozen planned snapshot

Every planned Food, Recipe, and Saved Meal occurrence stores:

- source reference where available;
- frozen planned serving/quantity;
- frozen nutrition snapshot;
- relevant frozen ingredient snapshot where Shopping requires it.

Changing the source later must not silently mutate existing planned occurrences.

Editing a planned occurrence changes that occurrence only by default.

Editing Food Library, My Recipes, or Saved Meal source data is a separate explicit action.

An explicit `Update to latest` capability may exist later where source is still available; it must never be implicit.

### 10.1 Deleted source resilience

Deleting a source does not delete or convert existing planned occurrences.

For My Recipes, the cross-page invariant is:

```text
Delete Recipe
→ Recently Deleted
→ retained 30 days
→ Restore revives the same recipe identity
→ automatic permanent deletion after retention period
```

A deleted recipe is absent from normal My Recipes/Add-to-Plan search while deleted.

Permanent source deletion never removes existing frozen Meal Plan snapshots or history.

## 11. Nutrition target authority

Meal Plan uses the same **effective-dated Nutrition Target authority** as Diary and future Summary.

Historical weeks compare against the target effective for that historical date, unless an explicit week override applies.

Changing a target later must not mutate planned meals.

A week-specific override can supersede the effective global target for that week only.

Targets guide planning but never hard-block it.

No silent auto-rebalancing occurs.

## 12. Planned nutrition summary

The selected day shows one restrained planned-nutrition summary.

Typical complete state:

```text
Planned
1,920 / 2,200 kcal
280 kcal remaining

Protein  138 / 150 g
Carbs    205 / 240 g
Fat       58 / 70 g
```

Calories are numerical-first. Protein/carbohydrate/fat are compact supporting indicators using the shared Nutrition visual semantics.

No giant rings, gauge clusters, or card-per-macro dashboard are permitted.

### 12.1 No target

If no target exists:

```text
1,920 kcal planned
Set nutrition target
```

Planning remains fully usable.

### 12.2 Over target

Over target is factual, not automatically an application error:

```text
2,340 / 2,200 kcal
140 kcal over target
```

Do not flood the surface with error red.

### 12.3 Partial and estimated nutrition

Unknown nutrition is never treated as zero.

Example:

```text
740 kcal known
+ 1 item without nutrition
```

Estimated values use explicit estimation semantics:

```text
~750 kcal estimated
```

Target comparison must be marked incomplete when relevant.

### 12.4 Week overview density

Week overview is lighter than selected-day detail.

A day row may show information such as:

```text
Mon 24
3 meals · 1,920 kcal
```

or:

```text
Wed 26
2 meals · incomplete nutrition
```

Do not show full macro charts for all seven days simultaneously.

## 13. Unified Add to Plan workspace

`+ Add` from a meal slot opens one unified planning workspace.

It must not start with a method picker.

The workspace already knows:

- active week;
- selected date;
- target meal slot.

### 13.1 Search-first

Search is the dominant input.

Search may return Food, Recipe, and Saved Meal results in one coherent ranked result set with clear type labels.

Search ranking should consider strong personal relevance such as exact personal matches, favorites, recent/frequent usage, locale-appropriate verified results, and broader catalog results.

### 13.2 Explicit Recent and Favorites access

Recent and Favorites must have explicit low-friction access inside the same workspace.

Ranking alone is not an affordance.

Preferred compact relationship:

```text
Search foods, recipes, meals…

Recent    Favorites    More
```

These controls remain visually subordinate to Search and use native geometry rather than decorative tile/pill systems.

Recipes and Saved Meals remain directly reachable within the same workspace through compact scope/browse controls or `More` according to available width; they must not require leaving the session or entering a method-picker screen.

Barcode is a secondary utility shortcut.

Placeholder is available through an appropriate secondary/contextual path and zero-result flow.

### 13.3 Multi-item planning session

The user may add multiple items before final commit.

Selecting an item must not close the workspace.

The user can continue search/browse, adjust serving/quantity, and review selected items before commit.

The commit operation is atomic for the composed selection.

On iPhone, this is a large/full working presentation with keyboard-safe layout. It is not a cramped small sheet.

The commit surface uses standard/native functional material. Meal Plan does not create a second custom Liquid Glass exception.

### 13.4 Zero result

A true zero-result state offers useful next actions such as:

- Barcode;
- Add Placeholder;
- source-creation path where the broader Food Library design later permits it.

The zero-result state must not invent data.

## 14. Manual planning and ChatGPT planning

Manual planning is first-class.

Users can plan through:

- Search/Add;
- Foods;
- Recipes;
- Saved Meals;
- Placeholder;
- copy/repeat;
- direct edits.

`Plan with ChatGPT` is an accelerator, not a replacement for manual planning.

An empty week presents both entry paths clearly without a blocking onboarding wizard.

## 15. Copy, repeat, move, and reorder

### 15.1 Copy intent only

Copy operations include:

- Copy meal;
- Copy day;
- Copy week;
- Repeat meal to selected days.

Copied data includes planning intent such as:

- planned items;
- quantities/servings;
- frozen snapshots;
- planned meal times;
- relevant destination-compatible week overrides/custom-slot intent when copying a week.

Copied data excludes:

- Completed/Skipped execution state;
- Diary linkage;
- audit history/revisions;
- pending ChatGPT requests;
- sync/conflict state;
- Shopping Purchased/Don't need state.

All copied entities receive fresh identities.

Shopping derived state regenerates from the destination plan.

### 15.2 Repeat is not recurrence

`Repeat to selected days` creates independent planned occurrences.

Editing one repeated occurrence later does not mutate the others.

V1 has no hidden recurring rule such as `every Tuesday forever`.

### 15.3 Move and reorder

Explicit Move/Edit paths are guaranteed.

Users may:

- move an item across meal slots;
- move an item across days within a week;
- reorder within a slot;
- move custom slots where supported by the current planning context.

Drag-and-drop may accelerate these actions on capable devices but is never the only interaction.

## 16. Auto-save and transaction boundaries

Normal committed planning actions auto-save immediately.

Examples:

- quantity change;
- meal-time change;
- move;
- reorder;
- delete.

There is no global `Save Week` button.

Composed/bulk actions commit atomically, including:

- multi-item Add to Plan;
- Copy Day;
- Copy Week;
- approved ChatGPT apply.

The UI may show transient persistence state such as `Saving`, `Saved on device`, or `Waiting to sync` without confusing persistence with execution state.

## 17. Plan-to-Diary execution boundary

Meal Plan never becomes the actual-intake ledger.

Meal-level execution states are:

```text
Planned
Completed as planned
Completed with changes
Skipped
```

Day and week completion are derived summaries, not separately stored booleans.

There is no manual `Complete Day` or `Complete Week` action in V1.

### 17.1 Mark eaten

For an eligible unresolved Today/past meal, `Mark eaten` is a visible low-weight contextual fast action.

It must not be buried exclusively in overflow.

The action remains visually secondary to planning content; it is not a large filled CTA repeated as the visual center of every meal.

Future meals do not show `Mark eaten`.

Completed meals replace the action with execution state.

`Mark eaten` is atomic:

1. create canonical actual Diary log(s);
2. create execution linkage;
3. classify the planned meal as `Completed as planned` where actual matches the frozen plan;
4. preserve the exact historical plan revision/snapshot used at execution.

No half-complete state is permitted.

### 17.2 Execution granularity by type

- Planned Food → one actual Food log.
- Planned Recipe → one actual Recipe-serving log; do not explode recipe ingredients into Diary.
- Planned Saved Meal → one atomic group of child actual logs plus group linkage.
- Planned Placeholder → confirmation/replacement before actual logging.

### 17.3 Log with changes

`Log with changes` seeds an execution/logging flow from the plan but allows the user to record actual reality before commit.

The resulting meal becomes `Completed with changes`.

### 17.4 Skip

`Skip` creates no actual Diary logs.

Skip is an execution outcome, not a plan deletion.

### 17.5 Later Diary edits

If linked actual Diary logs are later edited:

- `Completed as planned` changes to `Completed with changes` when reality differs;
- the Meal Plan intent itself remains unchanged;
- audit and exact historical execution reference remain preserved.

If all linked actual logs are removed, current execution state returns to `Planned` while audit history records the prior execution.

If only part of a multi-item Saved Meal execution is removed, state remains `Completed with changes`.

### 17.6 Past plan edits

Past Meal Plan remains editable.

Users may correct forgotten planning information without warnings on every edit.

Past plan edits never rewrite actual Diary history and never silently break existing execution linkage.

Analytics may distinguish the plan snapshot at execution from a later after-the-fact plan correction.

## 18. Delete semantics and Undo

User-visible delete removes the current planning occurrence immediately and offers contextual Undo.

If audit, execution, or historical linkage exists, backend evidence must be preserved rather than hard-deleted.

Deleting a past planned occurrence does not delete actual Diary logs.

Unreferenced internal data may later be hard-deleted as an implementation detail if canonical retention rules permit it.

## 19. Shopping List ownership

Shopping List is week-scoped and linked to the active `MealPlanWeek`.

It is:

> **derived from the plan + manually editable + source-aware**

It is not a global accumulating list and not a full Pantry system.

### 19.1 Derived contributions

Planned Foods and Recipe/Saved Meal ingredient snapshots may contribute Shopping needs.

Aggregation occurs only when:

- canonical ingredient/food identity matches;
- units are safely convertible;
- semantic qualifiers do not materially differ.

Do not merge distinct meanings merely because display names look similar.

Source contributions remain internally attributable after aggregation.

Example:

```text
Monday Chicken     300 g
Wednesday Chicken  250 g
Friday Chicken     200 g
------------------------
Shopping Chicken   750 g
```

If Friday's contribution is legitimately removed, 550 g remains.

### 19.2 Manual grocery items

Users may add manual week-scoped grocery items unrelated to the plan.

Manual items remain independent unless the user explicitly merges them.

### 19.3 Shopping states

V1 uses exactly three user-facing states:

```text
Needed
Purchased
Don't need
```

`Purchased` means actually bought.

`Don't need` means already have it or intentionally do not need to buy it.

Neither state modifies the Meal Plan or Recipe source.

V1 has no dedicated partial-purchase state. If partly purchased, the user keeps the item Needed or adjusts the remaining quantity manually.

### 19.4 Protect user state from destructive recomputation

Plan changes may recompute source-derived quantities, but Plaivra must protect user-owned Shopping state such as:

- manual quantity edits;
- Purchased;
- Don't need;
- notes;
- explicit manual items.

Protected state is reviewed rather than silently overwritten.

### 19.5 Carry-forward

Derived Shopping items do not automatically carry into future weeks.

Manual unchecked/Needed items may offer explicit `Carry unchecked items to next week` behavior.

There is no silent carry-forward.

### 19.6 No Pantry in V1

V1 does not track:

- stock quantities;
- expiry;
- replenishment;
- pantry inventory state.

`Don't need` is sufficient for `already have it / not buying it` within the week.

## 20. Skip-to-Shopping reconciliation

Skip by itself does not change Shopping List because Skip is execution truth, not plan deletion.

If a skipped meal still contributes genuinely unpurchased `Needed` Shopping quantity, Plaivra may surface:

```text
You skipped Friday Dinner.
Some ingredients for this meal are still on your Shopping List.
Remove what you no longer need?

Keep    Review & Remove
```

Rules:

- show only when remaining unpurchased contribution actually exists;
- do not show for Purchased, Don't need, nonexistent, or already-reconciled contributions;
- `Review & Remove` removes only the skipped meal's remaining source contribution;
- never remove quantity required by another planned meal;
- user-modified Shopping rows require review rather than silent overwrite.

## 21. Shopping List presentation

Shopping List is a nested route/screen under Meal Plan.

On iPhone it is a normal push destination.

On iPad/desktop it may replace or occupy the active detail area according to the native navigation hierarchy.

The list is organized by semantic state rather than card-per-item presentation:

```text
Needed
○ Chicken breast     750 g
  Derived · 3 meals

○ Coffee filters     1 box
  Manual

Purchased
✓ Oats               500 g

Don't need
− Spinach             200 g
```

State meaning must use text/symbol/grouping, never color alone.

Source contribution detail is progressive disclosure, not permanently expanded on every row.

## 22. ChatGPT planning boundary

Plaivra does not ship a competing generic in-app chatbot for Meal Plan.

No paid Plaivra-side open-ended AI reasoning is required for initial launch.

The product architecture remains compatible with public ChatGPT integration and future server-side model calls where separately approved.

ChatGPT may help create or adjust structured planning intent, but Plaivra owns the authoritative structured week and approval state.

## 23. ChatGPT pending change requests

ChatGPT-generated changes do not write immediately to the live plan.

Canonical flow:

```text
User asks ChatGPT to change Meal Plan
→ ChatGPT prepares structured change request
→ Plaivra stores Pending Approval
→ notification/in-app pending state
→ user reviews
→ Approve all / Cancel
→ server validates current week revision
→ atomic apply
→ Meal Plan refreshes
```

The notification is not source of truth. Pending requests remain discoverable inside Meal Plan if notification delivery is missed.

### 23.1 Revision binding

Every request binds to:

- user;
- `weekId`;
- `baseRevision`;
- structured operations;
- idempotency/application identity.

If the week changed after proposal creation, the request becomes stale and cannot silently apply.

The stale state remains reviewable but its apply action is unavailable.

### 23.2 Apply granularity

V1 supports:

- `Approve all`;
- `Cancel`.

There is no per-operation partial acceptance in V1 because proposed changes may be interdependent and partial acceptance would complicate revision correctness, Shopping recomputation, and Undo.

### 23.3 Patch versus replace

- Empty week: ChatGPT may create a full week.
- Existing week: minimal structured patch/merge is the default.
- Full-week replacement requires explicit user intent.
- Deletions must be explicit in the request.

### 23.4 Visual expression

A pending ChatGPT request is a change-management object, not a conversation surface.

Do not use:

- chat bubbles;
- prompt transcript as the primary UI;
- typing animation;
- conversational avatar panels.

Review presents structured `ADD / CHANGE / REMOVE` semantics and one atomic `Approve all` commit.

## 24. Food preferences and week overrides

Meal planning may use profile-level defaults such as:

- dislikes;
- allergies/intolerances;
- dietary preference;
- cuisine preferences;
- budget preference;
- prep-time preference.

A week may add temporary overrides such as:

- vegetarian this week;
- cheaper meals;
- no fish;
- under 20 minutes.

Week-level overrides never silently mutate global profile preferences.

The detailed global Preferences management surface is not defined by this page.

## 25. Meal reminders

Meal reminders are optional execution aids.

Default: **OFF**.

A planned time does not automatically create a notification.

The user may explicitly enable a reminder for a meal occurrence, such as at meal time or a simple offset before it.

Rules:

- no reminder when no planned time exists;
- changing planned time updates its linked reminder;
- Completed/Skipped cancels any remaining notification for that occurrence;
- delete/remap cancels or updates the reminder appropriately;
- no predictive or smart reminder logic in V1;
- notification permission is requested through a normal user-triggered reminder flow, never automatically on first Meal Plan open.

Meal Plan must not become a calendar/alarm application.

## 26. Offline, sync, revision, and conflict model

Meal Plan is local-first for usability with server revision authority.

### 26.1 Cached use

A previously loaded week remains viewable offline.

Normal edits appear locally and are durably queued so they survive app restart.

### 26.2 Mutation envelope

Mutations carry sufficient authority context, including conceptually:

```text
weekId
baseRevision
operationId
entity target
mutation payload
```

`operationId` provides idempotency.

If server revision matches, apply and advance revision.

### 26.3 Conflict scope

Concurrent edits must not trigger whole-week last-write-wins replacement.

Resolve at the smallest practical entity scope, for example:

- planned item;
- meal slot;
- Shopping item;
- week override.

Example user-facing conflict:

```text
Tuesday Lunch changed elsewhere.
Keep mine    Keep latest    Review
```

Unaffected week content remains usable.

### 26.4 Failure principle

> Never destroy trusted local intent because a network/server operation failed.

If a queued local mutation cannot sync because of validation or conflict, it remains visible with `Needs attention` or `Conflict` rather than disappearing.

Large atomic operations either fully apply or fully fail.

## 27. Audit trail and Undo

Every meaningful mutation records audit context sufficient to answer:

- who;
- what;
- when;
- source of change.

Change sources may include:

- manual;
- copy;
- repeat;
- ChatGPT approved apply;
- offline replay;
- execution bridge.

Contextual Undo is available for safe reversible operations, including bulk operations where practical.

V1 does not expose a Google-Docs-style full version-history browser.

## 28. Date, timezone, and navigation state

### 28.1 Planned dates

Planning uses calendar-date semantics:

```text
planned_date = YYYY-MM-DD
```

Optional meal time is local wall-clock.

Travel/timezone changes do not move planned meals to another calendar day.

Audit timestamps such as `created_at` and `updated_at` remain UTC.

Diary execution stores actual execution time separately.

### 28.2 Selected day

Selected day is addressable/restorable navigation state, not domain state.

Refresh, Back, deep link, and notification navigation should preserve the relevant week/day where possible.

Fallback:

- Today if Today lies inside the active week;
- otherwise the first day of the active week.

## 29. iPhone page composition

Canonical hierarchy:

```text
native navigation/title
→ week range navigation
→ compact seven-day strip
→ selected day
→ one planned nutrition summary
→ meal-slot workspace
→ contextual planning/execution actions
```

The week navigator is a control region, not a decorative calendar card.

The seven-day strip gives week awareness and day selection without becoming a full calendar grid.

Today and selected day require distinguishable semantics when they differ.

Meal slots are mostly flat sections/rows. Populated slots may use limited containment where grouping materially helps comprehension, but the page must not become a stack of floating cards.

### 29.1 Visible Mark eaten

For eligible unresolved Today/past meals, `Mark eaten` is visible as a low-weight native text/action affordance with a comfortable hit target.

Secondary actions such as:

- Log with changes;
- Skip;
- Edit;
- Move;
- Copy;

belong in contextual/overflow controls where appropriate.

### 29.2 Toolbar

Toolbar contains only high-value page actions, including the established Plaivra ChatGPT affordance and Shopping List access.

Copy Week and other lower-frequency actions belong in overflow/contextual UI.

Use system toolbar behavior and system-provided material rather than custom toolbar chrome.

## 30. iPad and regular-width composition

Regular width uses a true planning hierarchy, not a stretched phone layout and not a seven-column spreadsheet.

Preferred structure where the overall app shell supports it:

```text
Primary           Supplementary       Detail
Plaivra/Nutrition Week overview       Selected day workspace
navigation
```

The week overview is a light selection rail with compact day summaries.

The selected-day workspace owns detailed meal editing.

Responsive page-level guidance, not shared tokens:

- week overview rail roughly 260–300 pt where space allows;
- selected-day useful content roughly 560–720 pt where appropriate;
- avoid unbounded row stretching on very wide windows.

As width narrows, the structure adapts through native split behavior until a compact horizontal week context becomes more appropriate.

## 31. Visual contract

Meal Plan uses the locked **Direction A: native system-led restraint**.

Required visual rules include:

- no card wall;
- no nested decorative cards;
- no dashboard metric grid;
- no giant-radius content surfaces as default;
- no decorative gradients/glows;
- no content-layer Liquid Glass;
- no custom toolbar glass behind native toolbar material;
- one restrained selected-day nutrition surface;
- flat/list-based meal and Shopping rows by default;
- system typography and Dynamic Type;
- shared Nutrition data-color semantics;
- native control geometry owns native metrics.

Meal Plan introduces **no new shared visual token** and **no new custom Liquid Glass exception**.

The Diary Plate dock remains the existing specific custom floating-glass exception under its locked adaptive rules.

## 32. Accessibility and RTL

The design must remain fully usable with:

- Dynamic Type;
- VoiceOver;
- Switch Control;
- keyboard navigation where relevant;
- Reduce Motion;
- Increase Contrast;
- Reduce Transparency.

Controls must not rely on color alone.

Drag-and-drop always has an explicit alternative.

On Apple touch interfaces, effective interactive targets remain at least 44 × 44 pt; Android follows native approximately 48 dp conventions.

### 32.1 Dynamic Type recomposition

At accessibility sizes:

- horizontal rows may stack;
- the seven-day strip may become horizontally scrollable while preserving explicit week navigation;
- long labels wrap rather than shrink;
- meal title, nutrition, and actions may become multi-line compositions;
- meaning wins over compactness.

### 32.2 RTL

RTL uses true semantic leading/trailing behavior.

System navigation arrows and chevrons follow platform semantics.

The locale/user week start appears at logical leading.

Arabic typography uses the platform Arabic system font and supports expansion.

Numbers and units use locale-aware formatting rather than hardcoded Latin concatenation.

## 33. Shared state vocabulary

Execution state:

```text
Planned
Completed as planned
Completed with changes
Skipped
```

Persistence state:

```text
Saving
Saved
Waiting to sync
Needs attention
Conflict
```

Nutrition-quality state:

```text
Complete
Partial
Estimated
```

These categories must not be conflated.

For example, `Skipped` is not a sync failure and `Waiting to sync` does not alter whether an occurrence is Planned.

## 34. Loading, refreshing, offline, and errors

### 34.1 First load

If no cache exists, use lightweight structure-aware loading matching the page layout.

Do not use a blocking full-page spinner for routine planning navigation.

### 34.2 Cached refresh

Keep previously valid week content visible while refreshing.

Use a subtle refresh signal.

Latest request wins when navigating weeks quickly.

### 34.3 Offline

Cached plan remains usable.

A quiet page-level offline state may exist while affected edits show local persistence state such as `Waiting to sync`.

### 34.4 Mutation failure

Attach errors to the affected object where possible:

```text
Chicken rice bowl
Couldn't save this change.    Retry
```

Do not replace an otherwise useful week with a giant generic error card.

### 34.5 Conflict

Conflict UI is entity-local where possible:

```text
Dinner
This meal changed elsewhere.  Review
```

### 34.6 Atomic operation failure

Operations such as:

- Mark eaten;
- approved ChatGPT apply;
- bulk Add to Plan;

must not leave partial authoritative state.

## 35. Security and permissions

Meal Plan mutations are server-authorized for the current user.

ChatGPT integration follows least-privilege read/write separation.

A structured external AI proposal is not permission to write.

Server apply must validate:

- authenticated user ownership;
- target week identity;
- current revision;
- operation schema;
- allowed fields/actions;
- idempotency.

Stale, unauthorized, malformed, or cross-user operations must not apply.

Notification delivery does not grant authority.

## 36. Cross-feature failure isolation

- Diary remains usable if Meal Plan is unavailable.
- Meal Plan remains readable/editable where possible if Shopping recomputation fails.
- Shopping failure does not corrupt planning intent.
- ChatGPT integration failure does not block manual planning.
- Reminder failure does not block meal planning.
- Source deletion does not invalidate frozen planned occurrences.

Each subsystem communicates through explicit boundaries rather than sharing UI-local hidden state.

## 37. Monetization boundary

This design does not set final Meal Plan pricing/entitlement policy.

However, the base planner must not structurally depend on paid AI reasoning.

Manual planning, core editing, plan-to-Diary execution, and trustworthy saved state are product foundations, not merely a side effect of AI availability.

Any future premium boundary must be decided separately and must not invalidate this architecture.

## 38. Explicit V1 deferrals

The following are intentionally out of scope:

- recurring meal rules such as `every Tuesday forever`;
- multi-week ChatGPT transaction/apply;
- full Pantry inventory;
- partial-purchase Shopping state;
- global accumulating Shopping List;
- predictive/smart reminders;
- automatic meal-time optimization;
- automatic similarity-based plan completion from unrelated Diary logs;
- silent future actual logging;
- per-operation partial acceptance of one ChatGPT request;
- full visible version-history browser;
- embedded generic conversational AI;
- automatic source-to-occurrence mutation;
- method-picker Add to Plan landing screen;
- mobile seven-column calendar spreadsheet.

## 39. Architecture boundaries for later implementation planning

Later implementation planning must preserve clear responsibilities rather than reproducing one large page coordinator.

Expected bounded concerns include conceptually:

- week navigation/query state;
- `MealPlanWeek` repository/commands;
- selected-day derived view model;
- Add-to-Plan session;
- plan-item mutation commands;
- execution bridge to Diary;
- Shopping derivation/reconciliation;
- ChatGPT pending-request approval;
- reminder integration;
- offline queue/conflict handling.

Exact file/module names are not approved here.

The implementation plan must first reconcile Meal Plan with the other four Nutrition destination specs and shared domain authorities.

## 40. Acceptance criteria

Meal Plan V1 design is satisfied only if all of the following are true.

### 40.1 Information architecture

- Meal Plan opens week-first.
- Selected day is working state inside the week.
- Shopping List is nested, not a peer tab.
- No duplicate Nutrition top-tab hierarchy is introduced.

### 40.2 Week and date semantics

- Week has stable identity and explicit `week_start_date`.
- Meaningful edits advance week revision.
- Empty navigation does not create a week row.
- Existing historical weeks do not move when week-start preference changes.
- Planned date uses calendar-date semantics.

### 40.3 Meal structure

- Core four meal slots exist semantically.
- Empty core slots are compact.
- Custom slots appear only when explicitly created.
- Custom slot repeat/copy creates explicit independent occurrences rather than hidden recurrence.

### 40.4 Planned item semantics

- Food, Recipe, Saved Meal, and Placeholder remain distinct semantic types.
- Recipe is one planned serving-based item with ingredient lineage.
- Saved Meal remains a bundle with child addressability.
- Placeholder never impersonates verified food data.
- Existing occurrences survive source edits/deletion through frozen snapshots.

### 40.5 Add to Plan

- Search is the primary input.
- There is no method-picker landing screen.
- Recent and Favorites are explicitly reachable.
- Recipes and Saved Meals remain reachable without leaving the session.
- Barcode remains secondary.
- Multiple items can be selected and reviewed before one atomic commit.
- iPhone keyboard does not obscure results or commit action.

### 40.6 Targets and nutrition

- Planned totals use the shared effective-dated target authority.
- Targets do not hard-block planning.
- Calories plus compact P/C/F are available when data permits.
- Unknown data is not counted as zero.
- Estimated/partial data is explicitly identified.

### 40.7 Copy and repeat

- Copy meal/day/week and repeat selected days create fresh planning identity.
- Execution state, Diary linkage, Shopping completion state, and audit history are not copied.
- Repeat does not create linked recurring instances.

### 40.8 Execution

- Future meals cannot be Mark eaten.
- Eligible unresolved Today/past meals expose visible low-weight Mark eaten.
- Mark eaten is atomic with Diary creation and execution linkage.
- Recipe execution does not explode ingredients into Diary.
- Saved Meal execution preserves group linkage.
- Placeholder requires confirmation/replacement.
- Diary edits can reclassify completion without rewriting the plan.
- Past plan edits never rewrite Diary history.

### 40.9 Shopping

- Shopping is week-scoped.
- Derived and manual items can coexist.
- Safe aggregation preserves source contributions.
- States are Needed/Purchased/Don't need.
- User-protected Shopping state is not silently overwritten.
- Skip does not automatically mutate Shopping.
- Review & Remove subtracts only the skipped meal's remaining contribution.
- No Pantry or partial-purchase subsystem is introduced.

### 40.10 ChatGPT

- Manual planning remains first-class.
- ChatGPT proposals become pending approval, not immediate writes.
- Pending request is discoverable in-app even without notification.
- Request binds to week revision.
- Stale request cannot apply.
- V1 provides Approve all / Cancel only.
- Existing-week proposals patch minimally by default.
- The review UI is structured change management, not chatbot UI.

### 40.11 Offline and conflict

- Cached plan remains usable offline.
- Local edits queue durably.
- Idempotent operation identity prevents duplicate apply.
- Conflicts are scoped to affected entities where practical.
- Whole-week last-write-wins overwrite is prohibited.
- Failed local intent remains visible with Needs attention/Conflict rather than disappearing.

### 40.12 Native visual behavior

- iPhone uses week context + selected-day workspace, not a mobile calendar grid.
- iPad uses available regular-width hierarchy rather than stretched phone UI.
- One selected-day nutrition surface is used; no metric-card dashboard.
- Meal sections and Shopping rows avoid card-wall presentation.
- No new custom Liquid Glass exception is introduced.
- Recent/Favorites use compact native control treatment.
- Mark eaten stays visually secondary while remaining visible when eligible.

### 40.13 Accessibility and localization

- Dynamic Type recomposes rather than truncates critical content.
- RTL uses semantic directionality.
- Status meaning is not color-only.
- All drag actions have explicit alternatives.
- Touch targets follow platform minimums.
- Locale-aware dates/numbers/units are used.

### 40.14 Failure isolation

- Diary remains independent of Meal Plan failure.
- Manual planning remains independent of ChatGPT failure.
- Shopping/reminder failure does not corrupt the plan.
- Atomic operations do not leave half-applied authoritative state.

## 41. Test and QA design requirements

The later implementation plan must include focused coverage for at least:

- week lazy creation;
- revision increment and stale-write rejection;
- selected-day route restoration;
- locale week-start behavior;
- source snapshot stability after source edits/deletion;
- Recipe/Saved Meal execution granularity;
- Placeholder execution confirmation;
- Copy/Repeat fresh identity semantics;
- no future actual logging;
- Mark eaten atomicity;
- Diary-edit reclassification;
- Shopping source aggregation and subtraction;
- protected Shopping state;
- Skip Review & Remove eligibility;
- ChatGPT stale request rejection and idempotent apply;
- offline queue restart persistence;
- entity-scoped conflict behavior;
- partial/estimated nutrition calculation;
- Recent/Favorites explicit Add-to-Plan access;
- keyboard-safe multi-add presentation;
- iPhone compact-width layout;
- iPad regular-width split adaptation;
- Arabic RTL;
- accessibility Dynamic Type;
- Reduce Transparency/Increase Contrast where system material is involved.

Screenshot/runtime acceptance should include at least:

1. standard iPhone portrait populated week;
2. iPhone Add to Plan with software keyboard and multiple selected items;
3. iPad regular-width week overview + selected-day workspace;
4. Arabic RTL + accessibility Dynamic Type;
5. Shopping List with all three states and source-aware quantities;
6. Skip → Review & Remove;
7. ChatGPT pending request, review, and stale state;
8. offline queued edit, Needs attention, Conflict, Partial, and Estimated states.

## 42. Final design decision

Meal Plan V1 is approved as a **week-first, revisioned planning workspace** with independent selected-day editing, multi-item meal slots, frozen source snapshots, explicit plan-to-Diary execution, week-scoped source-aware Shopping, pending-approval ChatGPT changes, local-first sync, and native system-led visual restraint.

The product must remain powerful underneath and simple on the surface:

> **Week awareness without week clutter. Day editing without becoming Day-first. Fast execution without becoming Diary. AI assistance without silent authority.**

This spec is ready for Planner written-spec review only. Nutrition-wide implementation planning remains deferred until Diary, Meal Plan, Food Library, My Recipes, and Summary are all designed and reconciled as one system.
