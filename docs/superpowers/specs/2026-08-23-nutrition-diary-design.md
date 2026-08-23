# Nutrition Diary V1 Design

**Date:** 2026-08-23  
**Status:** Planner-approved design, pending written-spec review  
**Branch:** `design/nutrition-diary-v1`  
**Base main SHA:** `b00b8205ed87aa53b7e76731f99156d58e989d0f`

## 1. Authority and scope

This design is subordinate to:

1. `docs/product/PLAIVRA_PRODUCT_CONSTITUTION.md`
2. `docs/control/PLAIVRA_DECISIONS.md`
3. `docs/control/PLAIVRA_MASTER_PLAN.md`
4. `docs/control/PLAIVRA_CURRENT_STATE.md`
5. `docs/control/PLAIVRA_ARCHITECTURE_AUTHORITIES.md`
6. `docs/control/PLAIVRA_DELIVERY_RULES.md`
7. Existing canonical source, migrations, and Production evidence where technical facts are disputed.

Existing nutrition, food-log, meal-plan, hydration, and saved-meal authorities remain canonical. This redesign must not create a parallel nutrition fact store.

This document defines **Nutrition → Diary V1** product behavior, UX semantics, architecture boundaries, native portability, and acceptance criteria. It does not define the complete Meal Plan, Food Library, My Recipes, Nutrition Summary, Today, billing, dynamic bottom-navigation, or future embedded-AI implementation.

## 2. Product classification

This is an **Architectural** redesign because it changes nutrition information architecture, logging flow, state ownership, server/client boundaries, and future native-platform semantics.

## 3. Product intent

Diary is not a dashboard and not a generic calorie-tracker page. It is Plaivra's **fast, trustworthy nutrition execution ledger**.

Its priorities are:

1. **Log fast.**
2. **Trust the data.**
3. **Connect intention to reality.**

The primary product question is:

> How quickly and confidently can the user record what actually happened, understand today's remaining position, and reconcile that reality with an existing plan when needed?

The Diary should not maximize the number of visible features. It should make common actions obvious while retaining advanced capability on demand.

## 4. Global design principles

### 4.1 Native-first semantics

The current web implementation is the present renderer, not the long-term UI architecture authority. Product semantics and interaction contracts must be suitable for later native applications.

Future platform direction:

- iOS: SwiftUI;
- Android: Kotlin + Jetpack Compose.

Web, iOS, and Android must share product rules, domain semantics, commands, state transitions, permissions, analytics definitions, and design tokens while using platform-appropriate presentation.

The design must not depend on hover, right-click, browser-only navigation, browser-only storage, or gestures without accessible alternatives.

### 4.2 Powerful underneath, simple on the surface

Plaivra should feel advanced, not basic, without overwhelming users.

Capabilities are presented in three layers:

- **Core visible:** common daily actions that should be immediately obvious.
- **Contextual accelerators:** surfaced only when current state makes them useful.
- **Advanced on demand:** deeper capability reachable through detail, overflow, or secondary screens.

A capability may remain because it adds real power even if it is not used daily. It should not occupy primary UI space unless frequent use justifies that cost.

### 4.3 Feature-value gate

Every visible element must do at least one of the following:

- reduce time or steps;
- prevent a meaningful error or confusion;
- expose information required for a decision;
- provide a genuinely useful advanced capability without disrupting the common path.

Decorative complexity, redundant controls, forced gamification, repeated coaching cards, and advanced-looking features without meaningful user value are rejected.

## 5. Nutrition information architecture

`Nutrition` is an organizational section, not a page containing duplicated top tabs.

Canonical destinations:

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

- `Diary`, `Meal Plan`, `Food Library`, `My Recipes`, and `Summary` are independent pages/destinations.
- Desktop/tablet persistent navigation shows the Nutrition section and its child destinations where that navigation pattern is available.
- Diary's page title is `Diary`, not `Nutrition`.
- The five Nutrition destinations must not also be duplicated as a second tab bar at the top of Diary.
- Shopping List is a Meal Plan utility/destination, not a sixth peer Nutrition subsection.
- Personalized bottom navigation is a separate product story and must not alter the canonical Nutrition hierarchy.

## 6. Diary responsibility boundary

Diary owns **actual intake execution** for a selected day.

Diary may display planned-meal context but must not become the primary meal-planning workspace.

Semantic separation:

- **Actual:** what the user actually consumed.
- **Target:** today's nutrition target authority.
- **Planned:** what the user intended to consume.
- **Hydration:** explicit tracked water intake.

Planned food must never count as actual consumed nutrition until explicitly completed/logged.

Meal Plan may be unavailable while Diary remains fully usable for actual logging.

## 7. Page composition

### 7.1 Page header

Diary has a page-level header with:

- `Diary` title;
- page-level `Ask ChatGPT` action;
- compact selected-date navigation immediately below or within the header region according to platform convention.

`Ask ChatGPT` is a secondary page action, not a dominant card, floating obstruction, or per-meal duplicate control.

### 7.2 Daily snapshot

Primary presentation:

- calories consumed / target;
- calories remaining or over;
- compact protein, carbohydrate, and fat progress;
- fiber as secondary information where space permits;
- data-completeness signal when macro totals are incomplete.

Example:

```text
1,480 / 2,200 kcal
720 remaining

Protein 103 / 150g
Carbs   142 / 240g
Fat      52 / 70g
```

Remaining is calculated from **actual intake only**:

```text
remaining = target - actual
```

Planned meals do not reduce the primary remaining number.

When a Meal Plan exists, an advanced or contextual projection may show:

- actual intake;
- nutrition still planned;
- projected total after planned intake;
- target.

This projection must not displace the primary actual/remaining presentation.

### 7.3 Hydration

Hydration remains in Diary as a compact execution control.

Default example:

```text
Water 1.5 / 2.5 L     +250 ml   +500 ml
```

Advanced detail may support:

- custom amount;
- edit/delete water entries;
- user-configured quick amounts;
- unit preference;
- today's water history.

V1 water tracking means **explicit water intake**. Do not automatically convert coffee, soup, juice, or other beverages into hydration-equivalent water.

Hydration failure must not break food logging.

### 7.4 Meal sections

Default creation/navigation order:

1. Breakfast
2. Lunch
3. Dinner
4. Snacks

Each section may contain:

- actual logged foods;
- planned-meal context when applicable;
- meal calories and optionally a high-value protein summary;
- `+ Add Food`;
- one contextual accelerator when strong evidence supports it.

Actual food rows are expanded by default. Normal food lists must not be hidden behind `and N more` by default.

### 7.5 Existing `Other` meal compatibility

Current nutrition data may contain logs classified as `Other`. The redesign must not hide, drop, or silently reclassify those records.

Rules:

- `Other` is not shown as a permanent empty fifth default meal section for users who do not need it.
- If the selected day contains existing `Other` logs, render a compatible `Other` group after the standard sections or an equivalently clear historical/compatibility presentation.
- Moving an `Other` log into Breakfast/Lunch/Dinner/Snacks requires an explicit user action.
- Any future retirement or migration of `Other` requires separate data verification and migration approval.

## 8. Planned versus actual contract

Plan and actual history are distinct truths and must remain independently recoverable.

Recommended planned-meal lifecycle:

```text
Planned
├── Completed as planned
├── Completed with changes
└── Skipped
```

### 8.1 Mark eaten

`Mark eaten` must be an atomic command that:

1. creates canonical actual food logs;
2. marks the planned meal complete;
3. preserves plan-to-actual linkage.

There must be no state in which the plan is shown complete while required actual logs were not created, or vice versa.

### 8.2 Deviations

If the user consumes something different from the plan, Plaivra must not silently assume replacement or completion.

A contextual action may allow the user to mark actual logs as replacing a planned meal.

If a planned quantity was 150g but actual was later corrected to 200g:

- the original plan remains 150g;
- actual remains 200g;
- execution status becomes `Completed with changes`.

### 8.3 Skip

Skipping a planned meal preserves the historical planned meal with `Skipped` status. Do not delete the plan merely because it was not executed.

### 8.4 Manual logging that resembles the plan

If manually logged foods closely match a planned meal, Plaivra may show a non-blocking suggestion to link them to the plan.

It must never link automatically based on similarity alone.

### 8.5 Linked deletion and correction

Deleting actual data created by a planned-meal completion must preserve consistency.

- If the whole linked completion is effectively being undone, offer an `Undo meal completion` path that atomically restores the plan to `Planned` and removes the linked actual data.
- If one item is removed from a multi-item completed meal, the meal may remain `Completed with changes` rather than reverting the entire meal automatically.

## 9. Unified Add Food Logger

The current method-first concept must evolve into one **Food Logging Session**.

The user should not first be forced to choose among a large menu of tools such as Search, Barcode, Saved Meals, Copy Day, Custom, and Photo.

The default surface is search/personal-history first, with secondary methods available within the same session.

Conceptual session state:

```text
LoggingSession
- date
- meal
- items[]
- source context
- draft state
- submit state
```

If opened from a meal section, date and meal are already known and must not be asked again.

If opened globally, Plaivra may choose a sensible visible default meal based on time/context, but the user must be able to change it immediately.

Primary shortcuts within the same session may include:

- Barcode;
- Quick Add;
- Saved Meals;
- Recipes.

Custom Food is available when relevant, especially from zero-result or unknown-barcode states, without dominating the initial logger surface.

### 9.1 Multi-add continuity

Adding an item must not close the logger or reset useful session context.

On mobile/native surfaces:

- search focus/keyboard should remain stable while adding several foods where platform behavior permits;
- switching Search → Barcode → Search must retain the same Plate;
- adding one result must not require reopening Add Food for the next result.

## 10. Search contract

### 10.1 Ranking

Search ranking priority:

1. exact personal match;
2. favorites;
3. recent foods;
4. frequently logged foods;
5. locale/region-relevant verified foods;
6. broader catalog.

Personal history must outrank irrelevant global-database noise.

### 10.2 Locale awareness

Search must support launch locales and local food conventions, including:

- EN / DE / AR naming and common synonyms;
- locale-appropriate units;
- local brands and supermarket products;
- tolerant matching without aggressive irrelevant fuzzy results;
- correct RTL/bidirectional text handling.

Germany launch quality requires German catalog relevance rather than merely translated UI strings.

### 10.3 Result presentation

Default food result remains compact:

- food name;
- brand/variant when useful;
- visible serving basis;
- calories;
- protein as a high-value fitness signal;
- one-tap `+` add action.

Carbohydrate, fat, micronutrients, source metadata, and advanced serving detail belong in deeper detail rather than every result row.

The `+` action adds the visible/default serving to the current Plate without leaving the logging session.

A repeatedly used serving may become a visible personal default such as `150g · your usual` when evidence is strong and the meaning is clear.

### 10.4 Empty/failure states

Zero results must not be a dead end. Offer appropriate alternatives such as:

- Barcode;
- Quick Add;
- Create Custom Food.

Remote search failure should preserve useful personal/local results and previous valid results rather than blank the entire search surface.

Latest query wins. Stale search responses must not overwrite newer search state.

## 11. Food Detail and food trust

Food Detail is a logging precision surface, not an admin form.

Primary controls:

- serving;
- quantity;
- calories;
- protein;
- carbohydrates;
- fat;
- fiber;
- `Add to Plate`.

Advanced/on-demand information may include:

- sugar;
- saturated fat;
- sodium;
- available vitamins/minerals;
- source/trust metadata;
- barcode;
- additional serving definitions;
- correction controls.

### 11.1 Favorite/unfavorite

Any reusable food identity may expose `Favorite` / `Unfavorite` through Food Detail or an appropriate overflow/context action.

Favorite state is user-owned preference data and contributes materially to search ranking. It must not require opening a separate management screen for routine use.

### 11.2 Canonical serving model

Prefer measurable canonical nutrition bases such as per 100g or per 100ml, with human-friendly servings mapped to measurable quantities.

Examples:

- `1 piece = 63g`
- `1 pack = 200g`
- `1 cup = 240ml`
- `1/2 pack = 100g`

Support useful serving labels such as piece, slice, cup, pack, and user-defined servings while preserving canonical conversion where available.

### 11.3 Food-source authority

A food identity should distinguish source class such as:

- verified/authoritative database;
- manufacturer/label;
- user custom;
- imported;
- estimated.

The default row does not need multiple badges. Source detail is available when the user needs to inspect trust.

### 11.4 Personal correction

If catalog data is wrong, `Correct for me` creates a durable user-level override.

That override has higher authority for that user than later remote catalog refreshes unless the user explicitly reverts it.

Editing a logged quantity is not the same operation as correcting the underlying food identity.

## 12. Plate model

A Food Logging Session contains a temporary **Plate** that allows multiple items to be assembled before final logging.

Example:

```text
Lunch · 3 items · 745 kcal
Chicken Breast — 150g
Rice — 200g
Protein Pudding — 200g

Log 3 items to Lunch
```

Rules:

- adding one item does not close the logger;
- Search, Barcode, Quick Add, Saved Meals, and Recipes may contribute to the same Plate;
- nutrition totals update locally and immediately;
- quantity and serving edits are local until submit;
- Saved Meals may be expanded into editable Plate items so users can remove or adjust an individual component before logging;
- Recipes may be logged as canonical recipe servings once the recipe domain is formally designed.

Plate is temporary session state, not a new canonical nutrition fact store.

### 12.1 Draft recovery

If the user dismisses the logger with items in the Plate, a short-lived device-local draft may be recoverable for the same date/meal.

A draft:

- is not actual intake;
- is not a permanent nutrition record;
- clears after successful submit;
- has a bounded expiry;
- must not unexpectedly reappear long after abandonment.

## 13. Final logging transaction

A multi-item meal submit is one logical operation.

Conceptual command:

```text
LogMealCommand
- operationId
- date
- meal
- items[]
```

Authenticated owner identity is derived server-side and is not trusted from a client-supplied owner field.

Requirements:

- server-authoritative validation;
- logical all-or-nothing semantics;
- idempotency by `operationId`;
- retry must not create duplicate logs;
- Plate clears only after durable success confirmation;
- failed submit preserves the Plate exactly for retry.

Where literal database transaction boundaries differ, implementation must still preserve the same user-visible atomic contract.

## 14. Offline and sync contract

Diary should remain useful during poor or absent connectivity.

Cached/local capabilities should include, where available:

- selected/current-day Diary;
- recent days;
- favorites;
- recent foods;
- user custom foods;
- already-loaded planned meals;
- Quick Add;
- hydration.

Offline mutations use a **durable local queue**, not volatile memory only.

State progression:

```text
editing
→ submitting
→ confirmed

editing
→ queuedOffline
→ syncing
→ confirmed

editing
→ submitting
→ failed
→ editing
```

Pending operations must survive application restart on platforms where offline queued logging is supported.

Permanent sync failures become `Needs attention` with review/retry/discard options instead of retrying forever silently.

Whole-day last-write-wins is rejected. Conflicts are scoped to the affected entity/version.

## 15. Barcode

Barcode's default job is:

> scan → verify → add

Primary flow:

```text
Open scanner
→ scan barcode
→ resolve product
→ show name + serving + calories + protein
→ Add to Plate
```

Required fallbacks:

- manual barcode entry;
- edit values when product data is wrong;
- create a new personal food if barcode is unknown;
- Quick Add when remote lookup is unavailable.

Unknown-barcode creation occurs inside the same logging session and returns directly to the current Plate.

Barcode is a core logging capability rather than a premium-only obstacle.

Advanced future capability may include on-device nutrition-label capture/prefill when reliable enough, without making paid AI a launch dependency.

## 16. Quick Add

Quick Add is for intentionally incomplete or approximate logging.

Core fields:

- calories required;
- protein optional;
- carbohydrates optional;
- fat optional;
- name optional.

Advanced optional fields may include fiber, serving, or note.

Unknown macros remain unknown. Plaivra must not invent or infer missing macro values merely to complete the record.

Quick Add may contribute to the current Plate rather than forcing an immediate separate write.

If a repeated Quick Add pattern becomes useful, Plaivra may contextually offer `Save for reuse`; this must not interrupt first-time logging.

## 17. Custom Food

Custom Food represents a reusable personal food identity, not a one-off approximate log.

Minimal creation should remain simple while advanced capability is available on demand.

Minimum useful creation:

- name;
- serving basis;
- calories.

Optional/advanced fields may include:

- protein;
- carbohydrates;
- fat;
- fiber;
- brand;
- barcode;
- multiple serving definitions;
- full available nutrition/micronutrients;
- label/source metadata;
- favorite state;
- editing/history required by data authority.

Custom Food creation must not become a long admin workflow in the common logging path.

## 18. Saved Meals and Recipes inside the logger

Saved Meals and future Recipes are logging accelerators, not separate logger sessions.

- A Saved Meal may add its component foods to the Plate so the user can remove or adjust a component before final logging.
- A canonical Recipe may later be added as a serving-level recipe object when the My Recipes domain contract is separately approved.
- This Diary design does not authorize the broader My Recipes/Cooking Assistant implementation.

## 19. Repeat, Copy, Edit, Move, Delete

### 19.1 Repeat

Repeat is a speed accelerator for genuinely repeated intake.

A high-confidence contextual shortcut such as `Usually: Eggs + Toast — Repeat` may appear near the relevant meal.

Repeat never happens automatically.

A secondary `Repeat & Edit` path may exist without cluttering the default surface.

### 19.2 Copy

Advanced copy capability should support:

- one food;
- selected foods;
- a meal;
- a whole day;
- another meal on the same day;
- another historical day;
- a chosen future date as a planning action.

Copying to a future day must not create fake future actual intake. It should create planning intent through the appropriate Meal Plan authority.

### 19.3 Edit and move

Editing serving/quantity/meal changes the log, not the food catalog identity.

Moving a log to another meal preserves the same log identity where compatible rather than implementing delete-and-recreate semantics.

### 19.4 Delete

Normal standalone log deletion should prefer immediate removal with `Undo` rather than repetitive confirmation dialogs.

Linked planned-meal deletion must preserve plan/log consistency. Deleting one component of a completed multi-item planned meal may convert the meal to `Completed with changes`; undoing the entire completion should restore the planned state atomically.

### 19.5 Multi-select

Advanced multi-select may support move/copy/delete without occupying default screen space.

## 20. Date and day behavior

Date navigation is obvious and compact, with arrows and date-picker access. Native swipe navigation may be an optional accelerator, never the only method.

Latest selected day wins. Stale responses from previously selected dates must not overwrite the current day.

### 20.1 Future day

Future dates are planning-oriented. Planned meals may be shown, but Plaivra must not present future actual intake as if it had already occurred.

Primary future actions should route to planning semantics, e.g. `Add to Meal Plan`.

### 20.2 Past day

Historical actual intake remains readable and editable according to domain rules. Historical plan-versus-actual context remains available.

## 21. Over-target, missing-target, and incomplete-data behavior

### 21.1 Over target

Display factual neutral wording such as:

```text
2,350 / 2,200 kcal
150 over
```

No punishment language, modal warnings, or failure state.

### 21.2 Missing target

Diary remains usable without a nutrition target.

Show actual totals and a secondary path to configure targets. Do not show broken progress UI.

### 21.3 Incomplete nutrition

If some logged foods contain calories but incomplete macro data, do not display false precision.

Use a subtle completeness signal such as:

> Some foods have incomplete nutrition data.

## 22. Ask ChatGPT in Diary

Every Plaivra page has a page-specific `Ask ChatGPT` experience, while a global ChatGPT affordance remains available at the application level.

In Diary, the value is **real-time course correction when reality diverges from the existing nutrition plan**, not rebuilding a meal plan from scratch.

### 22.1 Page-level access

Diary has `Ask ChatGPT` in the page header as a secondary action.

### 22.2 Contextual recommendations

Prompt recommendations are state-aware, not a permanent list of generic suggestions.

Strong Diary use cases include:

- user ate something different from the planned meal;
- user ate more or less than planned;
- user missed a planned meal;
- user wants to fit an extra food into the rest of the day;
- user needs to rebalance remaining targets using the remaining plan.

If the day is proceeding according to plan, no deviation recommendation needs to occupy Diary content.

### 22.3 Prompt-builder behavior

Diary Ask ChatGPT is a **contextual prompt builder**, not an embedded Plaivra chatbot.

The prompt includes only the minimum task-relevant context, such as:

- today's target;
- actual intake;
- planned-versus-actual differences;
- remaining planned meals;
- remaining calories/macros;
- the user's short optional note.

The generated instruction should ask ChatGPT to preserve the existing plan as much as practical instead of rebuilding the whole day unnecessarily.

The user may preview/edit the generated prompt and use `Copy Prompt`; an `Open ChatGPT` handoff may be available when platform integration supports it cleanly.

The first launch does not require paid Plaivra-side OpenAI API reasoning.

### 22.4 Responsibility split

- Meal Plan + ChatGPT: create or reshape intention.
- Diary + ChatGPT: reconcile actual execution with existing intention.

ChatGPT suggests. Plaivra owns and validates durable data.

## 23. Responsive and native layout

### 23.1 Mobile

Mobile is the primary composition reference.

Use one vertical Diary stream:

1. page header;
2. date;
3. daily nutrition snapshot;
4. hydration;
5. Breakfast;
6. Lunch;
7. Dinner;
8. Snacks;
9. `Other` only when compatibility data requires it.

### 23.2 Tablet

Tablet preserves the same semantic order. Wider space may keep actions inline and improve density, but must not introduce a different information architecture.

### 23.3 Desktop

Desktop navigation uses the canonical persistent sidebar hierarchy.

The Diary itself retains one primary chronological stream rather than splitting meals arbitrarily into a decorative grid. On very wide layouts, a bounded secondary rail may host non-duplicative day context such as daily totals or plan projection if it materially improves usability.

### 23.4 Platform-native rendering

Conceptual semantic units include:

```text
DiaryScreen
DiaryProjection
DailyNutritionSnapshot
HydrationSummary
MealSection
PlannedMealBlock
FoodLogRow
ContextualShortcut
LoggingSession
LoggingSessionItem
FoodSearchResult
FoodIdentity
FoodServing
NutritionFacts
FoodSource
PersonalFoodPreference
FoodCorrection
LoggingDraftStore
NutritionCalculator
SubmitMealCommand
SyncQueue
SyncStatus
DiaryChatGPTContextPack
```

These are product/domain concepts, not requirements for identical class names in each codebase.

## 24. Interaction and accessibility requirements

- iOS interactive targets should respect at least 44pt conventions.
- Android interactive targets should respect at least 48dp conventions.
- Web touch targets remain mobile-friendly.
- Swipe actions may accelerate common tasks but require visible/accessible alternatives.
- `+` controls require meaningful accessibility labels, e.g. `Add Milbona High Protein Pudding`.
- Food rows expose useful semantic labels rather than fragmented numbers/buttons.
- Color is not the only carrier of state.
- RTL is semantic and robust; mixed-direction food brands, barcodes, units, and numeric values remain readable.
- Essential actions remain keyboard/screen-reader/touch accessible.

## 25. Interaction budgets

Frequent tasks should meet the following product targets where the relevant shortcut/context is already available:

| Task | Target interaction budget |
|---|---|
| Repeat a visible recent food/meal | 1 tap |
| Mark a planned meal eaten | 1 tap |
| Add a common water amount | 1 tap |
| Add a known search result after typing | 1 result tap |
| Open Add Food from a meal and add a known item | Add → search → `+` |
| Adjust serving before logging | no more than one additional detail surface |
| Multi-food meal | one logger session |
| Barcode | short scan/verify/add path without redundant meal selection |
| Quick Add | one short data-entry surface, then Add/Log |
| Edit logged food | Food → edit → Save |
| Delete normal standalone log | Delete + Undo path, without mandatory confirmation |
| Copy meal/day | bounded action flow, not several permanent buttons |

Accuracy and durability outrank shaving one extra tap when the two conflict.

## 26. Loading, performance, and failure isolation

Diary should render from valid cached/local state as early as possible rather than waiting for all secondary domains.

Priority order:

1. cached actual logs;
2. target snapshot;
3. hydration;
4. planned meals;
5. secondary metadata.

The page must not require whole-week analytics, global catalog results, hydration, Meal Plan, and all auxiliary data to resolve before showing actual logged food.

Failures are isolated:

- Meal Plan failure does not break actual Diary.
- Hydration failure does not break food logs.
- Remote search failure does not clear the Plate.
- Final log-submit failure does not clear the Plate.
- A failed new query preserves prior useful results where appropriate.
- Stale day/search requests cannot publish over newer state.

The redesign should converge current browser read fan-out toward a bounded Diary read/projection contract without creating a new nutrition fact model.

## 27. Core/free versus advanced/premium direction

Core logging mechanics should not be paywalled merely because competitors do so.

Expected core/free Diary mechanics include:

- Diary;
- food search;
- barcode scanning;
- Quick Add;
- recent/favorites;
- multi-item Plate;
- copy/repeat mechanics;
- edit/delete;
- hydration;
- basic calories/macros;
- personal food correction;
- offline queued logging;
- planned-meal execution for users who have a plan.

Potential premium value belongs primarily in advanced intelligence/depth, subject to a later pricing decision, e.g. advanced trends, adaptive targets, advanced planning, advanced recipes/cooking, premium reporting, and future AI capabilities.

This section is product direction, not final pricing or entitlement implementation authority.

## 28. Explicitly deferred from Diary V1

Deferred unless separately approved:

- paid Plaivra-side AI reasoning;
- AI-first logging that replaces deterministic search/barcode/manual input;
- full conversational in-app chatbot;
- automatic photo-calorie estimation as a core path;
- full Cooking Mode / My Recipes runtime;
- heavy coaching cards inside Diary;
- social/community moderation system;
- full micronutrient dashboard in the main Diary surface;
- predictive recommendations that block logging;
- automatic hydration-equivalent calculations for every beverage;
- dynamic personalized bottom-navigation implementation;
- Today-page redesign.

## 29. Rejected product directions

Rejected for this Diary design:

- Nutrition page with five duplicated top tabs;
- collapsed food diary by default;
- method-picker as the primary Add Food screen;
- giant card dashboard before actual food;
- ads/interstitials inside logging;
- barcode paywall as a core logging restriction;
- forced gamification or celebration overlays;
- remote catalog refresh overwriting personal corrections;
- automatic plan completion based only on similarity;
- network-required current Diary;
- separate Add Food sessions for every item in one meal;
- future actual food logs created by simple copy;
- whole-day last-write-wins sync;
- fake macro precision when nutrition data is incomplete;
- silent deletion/reclassification of legacy `Other` meal data.

## 30. Required important states

The final implementation explicitly supports and tests:

1. completely empty day;
2. logs only;
3. plan only;
4. plan + actual matching;
5. plan + actual different;
6. over target;
7. missing target;
8. incomplete nutrition data;
9. offline / pending sync;
10. failed sync;
11. loading;
12. partial service failure;
13. future date;
14. historical date;
15. meal with many foods;
16. day containing legacy/current `Other` logs;
17. meaningful plan deviation with contextual ChatGPT prompt recommendation.

## 31. Acceptance criteria

Diary V1 is not product-ready until all of the following hold:

- repeat a visible familiar food/meal in one intentional tap where the shortcut is already surfaced;
- mark a planned meal eaten in one intentional action with atomic plan/log consistency;
- add multiple foods during one logging session without reopening Add Food;
- one-tap add from a known search result after the query is entered;
- search/keyboard/session state remains usable while adding several foods;
- Barcode flow reaches verified add with a short deterministic path;
- personal barcode/catalog correction survives reload and later catalog refreshes;
- Favorite/Unfavorite is accessible without a separate management workflow and influences personal ranking;
- Quick Add accepts incomplete nutrition without invented macros;
- multi-item final submit cannot produce user-visible partial success;
- retry cannot create duplicate food logs;
- failed submit preserves the Plate;
- offline queued logging uses durable local state appropriate to the current platform and preserves native-ready semantics;
- stale date/search responses cannot overwrite newer user state;
- planned and actual values remain historically distinct;
- actual logging remains usable if Meal Plan or hydration is unavailable;
- future-day copy/planning never creates fake actual consumption;
- no-target and incomplete-data states remain truthful and usable;
- existing `Other` meal logs remain visible and are never silently reclassified;
- Diary Ask ChatGPT prompts are context-limited and state-aware;
- meaningful plan deviation can generate a ready-to-copy ChatGPT prompt using only required Diary/Meal Plan context;
- normal on-plan days do not receive unnecessary deviation recommendations;
- all essential actions have keyboard/screen-reader/touch-accessible paths;
- EN/DE/AR and RTL behavior remain correct;
- web architecture does not make later SwiftUI/Compose implementation dependent on React-specific state semantics.

## 32. Success metrics direction

Instrument only approved product analytics and privacy-safe semantics.

Useful product-quality metrics include:

- time to log repeat food/meal;
- interactions per successful log;
- logger abandonment;
- search-to-log conversion;
- zero-result search rate;
- correction rate by catalog source;
- barcode lookup failure rate;
- duplicate-sync incident count;
- planned-meal-to-actual completion success;
- offline queued-write failure rate.

Accuracy and data trust outrank shaving one extra tap when the two conflict.

Raw meal contents are not required merely to measure interaction performance.

## 33. Implementation boundary

This spec approves product and architecture direction only.

Implementation must follow a separate Superpowers implementation plan and preserve:

- existing canonical nutrition authorities;
- server/database atomicity for multi-authority writes;
- no new parallel fact stores;
- native-ready domain semantics;
- focused PR scope;
- independent QA/QC before merge;
- no merge, Production migration, Production write, or deploy without required explicit approval.

## 34. Implementation sequencing after written-spec approval

The implementation plan should decompose the work rather than rebuild the whole Nutrition domain in one uncontrolled PR.

Expected dependency order:

1. Nutrition IA / Diary navigation and bounded Diary read-model contract;
2. unified Logging Session + Plate model;
3. personal-first search, Food Detail, servings, favorites, and trust/correction contracts;
4. Barcode + Quick Add + Custom Food integration;
5. atomic final submit + plan/actual completion convergence;
6. Repeat/Copy/Edit/Move/Delete behavior and `Other` compatibility;
7. offline/sync durability appropriate to the current web phase while preserving native-ready contracts;
8. Diary-specific Ask ChatGPT context/prompt builder;
9. responsive/native-ready final UI and state coverage;
10. targeted performance, locale/RTL, and accessibility validation.

Exact branch/PR decomposition belongs to the implementation plan, not this design document.

## 35. Design completion criteria

This design is product/UX complete when:

- the Product Owner accepts this written spec;
- no unresolved product ambiguity remains for Diary V1;
- implementation boundaries preserve existing authorities;
- an implementation plan can be written without implementation engineers making new product decisions.

Implementation may not begin solely because this document exists. It requires the next approved planning step under the Plaivra delivery process.
