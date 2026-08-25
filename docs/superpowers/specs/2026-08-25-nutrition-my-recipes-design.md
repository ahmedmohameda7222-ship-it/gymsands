# Nutrition My Recipes V1 Design

**Date:** 2026-08-25  
**Status:** Final reconciled Planner design, pending user written-spec review  
**Branch:** `design/nutrition-my-recipes-v1`  
**Base design branch:** `design/nutrition-food-library-v1`

## 1. Authority and scope

This design is subordinate to:

1. `docs/product/PLAIVRA_PRODUCT_CONSTITUTION.md`
2. `docs/control/PLAIVRA_DECISIONS.md`
3. `docs/control/PLAIVRA_MASTER_PLAN.md`
4. `docs/control/PLAIVRA_CURRENT_STATE.md`
5. `docs/control/PLAIVRA_ARCHITECTURE_AUTHORITIES.md`
6. `docs/control/PLAIVRA_DELIVERY_RULES.md`
7. Existing canonical source, migrations, Production data, and verified release evidence where technical facts are disputed.

Visual presentation is additionally governed by:

- `docs/superpowers/specs/2026-08-23-nutrition-native-visual-contract-design.md`

Sibling Nutrition contracts remain authoritative for their own domains:

- `docs/superpowers/specs/2026-08-23-nutrition-diary-design.md`
- `docs/superpowers/specs/2026-08-24-nutrition-meal-plan-design.md`
- `docs/superpowers/specs/2026-08-24-nutrition-food-library-design.md`

This document defines **Nutrition → My Recipes V1** product responsibility, Recipe identity and lifecycle, Recipe versions and drafts, ingredient authority, serving/yield and nutrition semantics, Recipe discovery, Recipe Detail, cross-domain reuse, external ChatGPT prompt/MCP integration, Recipe import, Cooking Mode, deterministic orchestration, timers, resumable/offline sessions, privacy/sharing, responsive/RTL/accessibility behavior, loading/error behavior, and visual acceptance criteria.

It does not define Nutrition Summary, complete Saved Meal authoring, complete Diary logging UX, complete Meal Plan destination UX, Shopping List behavior, Pantry/inventory, public Recipe discovery, social/community features, collaborative Recipe editing, or implementation sequencing.

No Nutrition implementation plan is authorized by this document. Implementation planning remains deferred until all five canonical Nutrition destinations complete design and Nutrition-wide reconciliation.

## 2. Product classification and intent

My Recipes V1 is an **Architectural** redesign.

Legacy repository objects named `recipe`, `saved_recipe`, or similar are evidence and migration baggage only. Historical storage convergence that mixed meals, templates, and recipes does not define the new product semantics.

My Recipes establishes Recipe as an independent reusable Nutrition domain.

Primary user questions:

> Can I save or create a Recipe quickly, find it again without organizational work, understand ingredients and nutrition clearly, reuse it anywhere in Plaivra without history changing, and follow it while cooking with minimal mental load?

Governing product principles:

> **Powerful underneath. Simple on the surface.**

> **ChatGPT reasons. Plaivra supplies context, structure, persistence, calculation, and deterministic execution.**

> **Plaivra never invents cooking facts.**

## 3. Canonical Nutrition information architecture

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

- My Recipes is an independent Nutrition destination.
- My Recipes owns Recipes.
- Food Library owns Foods.
- Saved Meal domain owns Saved Meals.
- Diary owns actual intake.
- Meal Plan owns intended intake.
- Shopping List remains nested under Meal Plan.
- Unified add/search surfaces may federate Food, Recipe, Saved Meal, Recent, and Favorite results without collapsing domain ownership.

## 4. Canonical semantic model

### 4.1 Food

A Food is one reusable consumable identity, for example chicken breast, rice, banana, milk, or a branded yogurt.

### 4.2 Recipe

A Recipe describes **how something is made**. A Ready Recipe has:

- a name;
- servings/yield;
- at least one ingredient;
- at least one preparation/cooking instruction.

A Recipe may additionally have:

- total time;
- structured prep;
- equipment;
- optional cover photo;
- cooking actions;
- timers/durations;
- heat/temperature guidance supplied by an approved source/user/ChatGPT flow;
- doneness/result cues supplied by an approved source/user/ChatGPT flow;
- tracks/dependencies/background capability for deterministic orchestration.

### 4.3 Saved Meal

A Saved Meal is a reusable combination eaten together and may contain Foods and/or Recipes.

```text
Post-workout dinner
├── Chicken Alfredo [Recipe]
├── Greek Yogurt [Food]
└── Banana [Food]
```

Food is not Recipe. Recipe is not Saved Meal. Saved Meal is not Food.

### 4.4 Recipe inside Recipe

Nested Recipe-as-ingredient is **out of scope for V1**.

Do not introduce recursive Recipe composition, dependency cycles, or nested Recipe nutrition/version semantics in V1.

### 4.5 Inline Recipe creation from a Meal flow

If Saved Meal authoring offers `Create Recipe inline`:

1. Saving the inline Recipe creates a normal independent My Recipes object immediately.
2. The Meal draft references the new Recipe.
3. Cancelling the Meal draft does not delete the saved Recipe.

## 5. Recipe lifecycle

The user-facing lifecycle is:

```text
DRAFT
↓
READY / ACTIVE
↓
ARCHIVED
```

### 5.1 Draft

A Draft may be incomplete and autosaves continuously.

Examples:

```text
Chicken Alfredo
Draft · Missing cooking steps
```

Draft rules:

- may omit Ready-contract fields while being authored;
- cannot enter Cooking Mode as a finished Recipe;
- cannot be added to Diary, Meal Plan, or Saved Meal as a finished Recipe;
- may be resumed manually;
- may be completed through the external ChatGPT workflow;
- may be deleted when safely unreferenced.

### 5.2 Ready / Active

A Recipe becomes Ready only when the minimum Recipe contract passes:

- Name present;
- Servings/Yield present;
- at least one Ingredient;
- at least one Step/Instruction.

Advanced cooking metadata is never required for Ready status.

### 5.3 Archived

Published Recipes are archived instead of destructively deleted.

Archive:

- removes the Recipe from normal default discovery;
- prevents normal new selection/use;
- preserves every historical and frozen reference;
- supports Restore.

Hard deletion of published Recipes is not a normal user action. It is permitted only for safely unreferenced disposable/unpublished data where integrity is guaranteed.

## 6. Published Recipe versions and working drafts

Ready Recipes use **immutable published versions + one autosaved Working Draft**.

Example:

```text
Chicken Alfredo v3
        ↓ Edit
Working Draft
        ↓ Save Recipe
Chicken Alfredo v4
```

Rules:

- Editing never mutates the published version in place.
- One autosaved Working Draft is based on the latest published version.
- Draft edits never leak into active Recipe usage.
- `Save Recipe` validates the Working Draft and, on success, creates the next published version.
- `Discard draft` explicitly removes the Working Draft and leaves the published version unchanged.
- Leaving the editor does not require repetitive Save/Discard modals because autosave preserves the Draft.
- Version machinery remains mostly hidden from normal UI.

User-facing status is limited to concepts such as:

- `Saving…`
- `Saved`
- `Not saved yet · Retrying…`
- `Continue editing`
- `Save Recipe`
- `Discard draft`

Do not display `Saved` before persistence is confirmed.

## 7. Frozen usage snapshots

Cross-domain reuse uses **Recipe version references + frozen resolved serving/nutrition snapshots**.

### 7.1 Diary

When a Recipe is logged, store enough immutable data to preserve what the user logged at that time, including:

- Recipe identity;
- Recipe version identity;
- resolved serving quantity;
- frozen nutrition snapshot.

Later Recipe edits never mutate historical Diary entries.

### 7.2 Meal Plan

A planned Recipe entry freezes the Recipe version and resolved serving snapshot at add time.

A later Recipe version does not silently update existing planned entries.

A future explicit `Update to latest recipe` may be offered where appropriate.

### 7.3 Saved Meal

Saved Meals may contain frozen Recipe-version references alongside Foods.

A later Recipe edit never silently mutates the existing Saved Meal composition.

### 7.4 New uses

New additions use the latest current published Recipe version unless the user is explicitly viewing/using an older frozen version.

## 8. Duplicate and variation semantics

Editing preserves Recipe identity and creates a new version.

Duplicating or intentionally creating a variation creates a **new Recipe identity** from a frozen source version.

Example:

```text
Chicken Alfredo
        ↓ Duplicate
Chicken Alfredo Copy
Draft
```

A derived Recipe may internally retain lineage metadata such as source Recipe/version, but UI does not expose fork/parent/child terminology.

ChatGPT may support actions such as `Create a variation with ChatGPT`. The original Recipe remains unchanged unless the user explicitly edits it.

## 9. Recipe serving and yield semantics

A Recipe serving is one portion/share of the whole Recipe, not a globally fixed gram amount.

Required:

- `Servings / Yield`

Users may log or add fractional/multiple servings, for example:

- 0.5 serving;
- 1 serving;
- 1.5 servings;
- 2 servings.

Recipe nutrition per serving is calculated from total known Recipe nutrition divided by servings.

Optional total cooked weight/yield may be stored when measured or supplied reliably.

Example:

```text
Total Recipe cooked weight = 1200 g
Servings = 4
Approx. measured serving basis = 300 g
```

Plaivra never guesses serving gram weight when total measured yield is unknown.

Serving changes on Recipe Detail are non-destructive previews unless explicitly saved through Recipe editing/versioning.

## 10. Ingredient model

My Recipes uses a **hybrid ingredient model**.

### 10.1 Linked canonical ingredient

Prefer a canonical Food or user Food when a reliable identity exists.

```text
Ingredient
├── display_name: Olive oil
├── quantity: 1
├── unit: tbsp
├── food_id: [canonical Food]
└── nutrition contribution: calculated when measurable
```

### 10.2 Manual/unlinked ingredient

If Food Library has no suitable identity, users may add an ingredient immediately without first creating a Custom Food.

```text
Ingredient
├── name: Homemade spice blend
├── quantity: 2
├── unit: tsp
├── food_id: null
└── nutrition: unknown unless otherwise resolved
```

Rules:

- Food-Library-first, never Food-Library-blocked.
- Missing nutrition means unknown, never zero.
- Do not guess conversions.
- Creating a reusable Custom Food remains optional.
- Manual ingredient use must not block Recipe creation.

### 10.3 Ingredient search flow

```text
+ Add ingredient
↓
Search ingredient...
↓
Select canonical Food when available
↓
Resolve quantity + unit
↓
Add Ingredient
```

If not found:

```text
Can't find it?
Add as ingredient
```

### 10.4 Duplicate ingredient handling

Do not silently auto-merge repeated ingredient rows.

A non-blocking suggestion may ask whether the user intended another entry because separate rows can be legitimate, for example one quantity for filling and another for topping.

### 10.5 Plaivra Verified indicator

If a selected Food is Plaivra Verified, My Recipes reuses the exact Food Library semantic:

- web icon: `shield-check`;
- positive-only;
- small;
- accessibility label: `Plaivra Verified`.

Do not reuse a plain checkmark for verification.

## 11. Nutrition calculation and authority

Plaivra remains nutrition authority for Recipe calculations.

ChatGPT may propose ingredients and quantities, but ChatGPT is never the nutrition fact authority.

Plaivra calculates Recipe nutrition from linked canonical Food/user Food data and measurable ingredient quantities.

Core Recipe nutrition presentation may include:

- kcal;
- protein;
- carbs;
- fat;
- more known nutrients through progressive disclosure.

If unresolved ingredients prevent complete nutrition calculation:

```text
Nutrition may be incomplete
1 ingredient has no nutrition data
```

Missing is not zero.

## 12. No Plaivra safety, allergen, or dietary-suitability claims

Plaivra does **not** author, infer, certify, or display product guarantees such as:

- Gluten Free;
- Nut Free;
- Allergen Free;
- Peanut Free;
- Dairy Free;
- food-safety certification;
- `Safe to eat`;
- comparable allergen/safety guarantees.

Plaivra also does not automatically infer Vegetarian, Vegan, Keto, or similar dietary-suitability classifications in V1.

Users who want such adaptations or advice may use contextual external ChatGPT workflows.

ChatGPT output remains external reasoning/advice until the user explicitly approves structured Recipe changes.

Plaivra does not convert ChatGPT advice into a Plaivra guarantee.

## 13. Plaivra never predicts cooking facts

Plaivra itself does not predict or author:

- cooking advice;
- doneness;
- temperatures;
- durations;
- readiness;
- boiling/browning/thickening state;
- food-safety guidance.

Recipe cooking facts may come from:

1. the user;
2. an imported source;
3. user-approved external ChatGPT output.

Plaivra stores, validates structurally, and deterministically executes those facts.

If a Recipe says `9 min`, Plaivra may run a 9-minute timer.

If no duration exists, Plaivra does not invent one.

If a Recipe says `wait until water boils`, Plaivra waits for explicit user confirmation; it does not infer boiling from elapsed time.

## 14. Recipe timing model

Timing is structured underneath and simple on the surface.

Internal timing may include:

- prep time;
- active cooking time;
- passive/waiting time;
- estimated total elapsed time.

Normal UI usually shows:

```text
~35 min total
```

Where validated action durations, dependencies, and parallel tracks are sufficient, the deterministic scheduler may derive estimated total elapsed time from the execution graph/critical path.

If metadata is insufficient:

- use user/source/approved-ChatGPT provided total time; or
- leave total time unknown.

Never guess.

## 15. Equipment model

Equipment is optional lightweight structured data.

```text
Equipment
├── Name
├── Quantity optional
├── Size / note optional
└── Used by actions optional refs
```

Examples:

- Large pot;
- Frying pan;
- Colander;
- Chef's knife.

Do not create a kitchen-inventory subsystem or deep equipment taxonomy in V1.

## 16. Preparation and Before You Start

Preparation Actions are first-class Recipe data, separate from active Cooking Actions.

Example:

```text
PREP
1. Dice chicken
2. Chop onion
3. Measure cream
```

Before You Start is **derived**, not separately authored.

It may combine:

- preparation actions;
- equipment;
- relevant ingredient prep facts;
- high-level cooking overview.

Example:

```text
Before You Start

Prepare
• Dice 500 g chicken
• Chop 1 onion

You'll need
• Large pot
• Frying pan
• Colander

Cooking overview
Pasta · Chicken · Sauce · Combine

[ I'm Ready ]
```

The overview must not falsely imply strict sequence when tracks may run in parallel.

## 17. Recipe steps and cooking actions

Recipe supports:

```text
Recipe Step
└── Cooking Actions / Parts
```

Cooking Mode displays one actionable chunk at a time.

No long paragraph + continuous recipe-scroll model during active cooking.

### 17.1 Authoring

The editor does not force users to split every sentence manually.

Short instructions may remain one Action.

A long instruction may receive a non-blocking suggestion:

```text
This step may be easier to follow while cooking if you split it into smaller actions.

Split actions
```

User may keep it as-is.

If an unstructured long step reaches Cooking Mode, the UI may create presentation-only Visual Pages. Visual Pages must not mutate stored Recipe data.

### 17.2 Structured Action model

A Cooking Action may contain:

```text
Action
├── Instruction              required
├── Ingredient references
│    └── exact quantity
├── Equipment reference      optional
├── Duration / Timer         optional
├── Heat / Temperature       optional
├── Doneness / Result cue    optional
├── Prep-ahead cue           optional
├── Track                    optional
├── Dependencies             optional
├── Can run in background    optional
└── Attention state          optional
```

Advanced fields are not required for Recipe validity.

## 18. Progressive Recipe Editor

Default editor stays deliberately small:

```text
Create Recipe

Recipe name
Servings

Ingredients
+ Add ingredient

Steps
+ Add step

More details
```

Under a Step:

```text
+ Add cooking details
```

Advanced detail may reveal only when needed:

- timer/duration;
- heat/temperature;
- how to know ready;
- ingredient references;
- equipment;
- dependency;
- background capability;
- track.

Rules:

- no giant form;
- no mandatory tagging;
- no folders;
- no Collections;
- no forced advanced orchestration entry;
- basic Ready Recipe still receives safe linear Cooking Mode.

> **Capability grows with data; user burden does not.**

## 19. Recipe cover photo

V1 supports at most **one optional user-controlled cover photo** per Recipe.

Allowed:

- Take Photo;
- Choose from Library;
- Replace;
- Remove.

Rules:

- photo is not required;
- no step photos;
- no gallery;
- no Recipe video;
- no automatic web imagery;
- no AI-generated Recipe imagery requirement;
- no fake generic food placeholder;
- changing the cover photo is presentation metadata and does not create a Recipe version.

No step-level media architecture is included in V1.

## 20. Recipe metadata and discovery attributes

V1 avoids organizational housekeeping.

Optional author/user metadata is limited and may include:

- Cuisine.

Plaivra may compute objective attributes when underlying data is sufficient, including:

- kcal/macros;
- High Protein;
- Low Carb;
- total time;
- recent/frequent usage signals.

Do not require users to maintain folders, Collections, tags, difficulty ratings, country, season, occasion, or similar metadata for Plaivra's benefit.

### 20.1 High Protein / Low Carb

These are nutrition discovery attributes, not allergen/safety claims.

They may be shown/used only when the nutrition basis is sufficient and the launch-market wording/threshold is approved.

If data is insufficient, the Recipe does not qualify.

Unknown is not positive qualification.

## 21. My Recipes Home

My Recipes Home is **search-first + adaptive small useful sections**.

Default populated hierarchy:

```text
My Recipes                         +

[ Search recipes... ]

Continue
[ recent useful Draft ]

Recently Used
[ short list ]

Favorites
[ short list ]

All Recipes
View all →
```

Rules:

- Page size does not grow with library size.
- Continue appears only when useful.
- Empty personal sections collapse.
- Recently Used remains derived behavior, not new Recipe truth.
- Favorites are explicit user intent.
- No folders/Collections in V1.
- No stats/hero banners.
- No large recipe-card gallery.

### 21.1 First-use empty state

```text
My Recipes

Save the recipes you cook and use them anywhere in Plaivra.

[ Create Recipe ]

Create manually
Create with ChatGPT
Import with ChatGPT
```

Search may remain hidden until a Recipe exists.

## 22. Recipe list/search row

Recipe rows show only decision-relevant information.

With optional cover:

```text
[img] Chicken Alfredo                 ♡
      35 min · 4 servings
      High Protein · Italian
```

Without cover:

```text
Chicken Alfredo                       ♡
35 min · 4 servings
High Protein · Italian
```

Draft:

```text
Chicken Alfredo
Draft · Missing cooking steps
Continue →
```

Rules:

- first line: name + Favorite;
- second line: max two decision facts, priority total time then servings;
- third line optional: max two relevant descriptors;
- no default kcal/P/C/F;
- no ingredient count;
- no track count;
- no equipment count;
- no technical orchestration badge;
- no fake image placeholder.

## 23. Search and filter contract

Search may match:

- Recipe name;
- Ingredients;
- Cuisine when present.

### 23.1 Ingredient-aware search

Users may search by ingredients contained in the Recipe.

Example:

```text
chicken rice
```

May match Recipes containing both ingredients according to canonical Food/alias matching and actual Recipe ingredients.

Plaivra does not infer Pantry possession and must not claim:

- `You have everything`;
- `You can make this now`;
- missing-ingredient readiness based on assumed inventory.

### 23.2 Quick filters

```text
[ Favorites ] [ Drafts ] [ Filters ]
```

### 23.3 V1 filter dimensions

Allowed:

- Ingredients;
- Total time;
- Cuisine;
- High Protein;
- Low Carb.

Excluded:

- Gluten Free;
- Nut Free;
- allergen filters;
- Vegan/Vegetarian dietary-suitability filters;
- Keto;
- Difficulty;
- Ratings;
- Equipment;
- Number of tracks;
- Country;
- Season;
- Occasion;
- large macro-slider systems.

### 23.4 Live filtering

Filter state is live:

- no Apply;
- no Done;
- `×` closes without reverting;
- Reset applies immediately;
- active filters become removable chips;
- across dimensions = AND;
- multiple ingredients default = AND.

Unknown nutrition/time does not qualify for filters that require known values.

## 24. Search/filter empty states

General no-result state:

```text
No recipes found

Try another search or create a recipe.

[ Create Recipe ]
```

Filter-caused no-result:

```text
No recipes match these filters.

[ Clear filters ]
```

Do not create fake fuzzy results to avoid an empty state.

## 25. Recipe creation entry points

My Recipes exposes:

```text
Create Recipe
├── Create Manually
├── Create with ChatGPT
└── Import with ChatGPT
```

Manual creation remains fully capable.

ChatGPT reduces effort but is never required.

## 26. Global ChatGPT / MCP architecture

Plaivra does **not** host an embedded ChatGPT/AI chat runtime for My Recipes.

Plaivra does not buy or use ChatGPT API merely to create an internal Recipe chatbot.

The model is:

```text
Plaivra
↓ generates strong contextual prompt
External ChatGPT app/web
↓ user reviews proposal
User explicitly approves
↓
Authorized Plaivra MCP write
↓
Plaivra validates + persists structured Recipe data
```

### 26.1 Prompt system is the primary AI value

Plaivra's value is a curated library of high-quality, context-aware prompts.

Prompts supply:

- role;
- objective;
- minimum relevant Plaivra context;
- constraints;
- required structured output;
- explicit confirmation rule.

Priority workflows include:

- Create a recipe for me;
- Turn my idea into a full recipe;
- Finish this recipe;
- Improve cooking instructions;
- Tell me how to know each step is done;
- Add useful timers;
- Organize for easier cooking;
- Organize parallel cooking;
- Make a higher-protein variation;
- Make a lower-calorie variation;
- Make it cheaper;
- Make it faster;
- Adjust servings;
- Substitute this ingredient;
- Explain this step;
- Import this recipe into Plaivra;
- Improve Cooking Mode setup.

### 26.2 No embedded AI UI

Valid UI:

```text
Create with ChatGPT
Import with ChatGPT
Improve cooking instructions
```

Invalid UI:

```text
Ask your AI chef...
[ chat field ]

ChatGPT:
...
```

No chat bubbles, in-app AI conversation surface, or fake AI-chef persona.

### 26.3 Native Open in ChatGPT transport priority

Product intent:

```text
Open in ChatGPT
↓
ChatGPT app opens
↓
prepared Plaivra prompt is ready when an officially supported transport permits it
↓
user taps Send
```

Transport priority at implementation time:

1. official supported native prefill path if one exists;
2. supported share/deep-link route;
3. Copy + Open ChatGPT fallback;
4. browser ChatGPT fallback when app path is unavailable.

Do not depend on undocumented URL schemes or hacks.

Plaivra never auto-sends the prompt.

## 27. ChatGPT context minimization

Plaivra sends only the minimum context needed for the selected prompt.

Inside Cooking Mode, context may include:

- Recipe name;
- current action/step;
- relevant ingredient quantities;
- servings/constraints only when needed;
- relevant cooking session state.

Do not dump the whole Recipe or unrelated Nutrition history by default.

Whole Recipe context is sent only when the requested transformation genuinely requires it.

## 28. MCP Recipe contract

Every field manually authorable in My Recipes must also be writable through authorized Plaivra MCP after explicit user approval.

Structured contract may include:

```text
Recipe
├── identity
├── servings
├── ingredients[]
├── equipment[]
├── prep[]
├── tracks[]
│   └── actions[]
│       ├── instruction
│       ├── ingredient refs
│       ├── duration/timer
│       ├── heat/temp
│       ├── doneness/result cue
│       ├── dependencies
│       └── prep-ahead
└── notes
```

Plaivra validates before persistence.

Invalid dependency cycles, unresolved required identities, invalid quantities, or structurally invalid payloads must be rejected with correction feedback rather than silently coerced.

### 28.1 Finish with ChatGPT

`Finish with ChatGPT` operates on the same Working Draft.

Flow:

```text
Published Recipe
↓
Working Draft
↓
External ChatGPT proposes completion
↓
User approves
↓
MCP updates same Working Draft
↓
Plaivra validates
↓
User Save Recipe
↓
Next published version
```

ChatGPT must preserve existing user-entered data unless the proposed change explicitly requires modification and the user approves it.

## 29. Import with ChatGPT

V1 supports importing existing Recipes through external ChatGPT + Plaivra MCP.

Users may provide external ChatGPT:

- Recipe URL;
- pasted Recipe text;
- screenshot/image;
- copied message or notes.

Flow:

```text
Import with ChatGPT
↓
External ChatGPT extracts structured Recipe proposal
↓
User reviews
↓
User explicitly approves
↓
Authorized MCP creates Recipe Draft
↓
Plaivra resolves canonical Food identities where possible
↓
Plaivra calculates nutrition from its own authorities
↓
Plaivra validates Draft
```

Plaivra does not maintain a native general-purpose Recipe website scraper in V1.

If a URL cannot be accessed by ChatGPT, the user may paste text or attach an image there.

No fake import success.

## 30. Recipe Detail

Recipe Detail is one progressive page.

Required hierarchy:

```text
Chicken Alfredo                         ♡
[optional cover]
~35 min · 4 servings

Servings
[ − ]          4              [ + ]

Ingredients
...

Nutrition per serving
520 kcal
P 42 g · C 48 g · F 19 g
More nutrition →

Instructions
...

Before You Start
Equipment · Prep

[ Start Cooking ]
```

Information order:

1. identity;
2. serving control;
3. ingredients;
4. nutrition;
5. instructions;
6. prep/equipment;
7. Start Cooking.

Advanced internal tracks/dependencies remain hidden unless contextually useful.

### 30.1 Secondary actions

- Favorite;
- Add to…;
- Edit;
- Duplicate;
- Share;
- Archive.

Do not clutter Recipe Detail with separate Diary, Meal Plan, and Saved Meal buttons.

## 31. Add To contract

Standalone Recipe Detail `Add to…` first resolves serving quantity.

```text
Add Chicken Alfredo

Serving
[ − ]        1.0        [ + ]

Add to
Diary
Meal Plan
Saved Meal
```

Rules:

- no Shopping List destination;
- no Recipe destination;
- selected frozen Recipe version and resolved serving/nutrition snapshot are handed off;
- known-context pickers may bypass destination choice when the target is already known.

## 32. Privacy and sharing

Recipes are private user-owned objects by default.

V1 does not include:

- public profiles;
- followers;
- likes/comments;
- public community feed;
- ratings/reviews;
- public Recipe marketplace;
- collaborative Recipe editing.

### 32.1 Share

V1 Share is explicit and lightweight.

Share a frozen published Recipe snapshot through native/system sharing or copy.

The snapshot may include useful Recipe content such as:

- name;
- servings;
- ingredients;
- instructions;
- known nutrition where appropriate.

Do not share:

- internal IDs;
- Cooking Session state;
- personal usage history;
- debug/version metadata.

A future `Save to My Recipes` from a shared Recipe should create a new independent Recipe identity, not a live collaborative object.

## 33. My Recipes V1 has no folders or Collections

V1 retrieval is search-first.

Do not add:

- folders;
- user Collections;
- mandatory organizational tags.

The user should not have to decide where to file a Recipe merely for Plaivra's benefit.

If real usage later demonstrates a meaningful organization problem, optional Collections may be designed as a separate future amendment.

## 34. Cooking Mode product intent

Cooking Mode exists to reduce the mental load of following a Recipe.

North-star:

> **The cook should spend as little attention as possible managing the app itself.**

V1 launch input model:

- Touch: complete, guaranteed path;
- Voice: optional convenience layer.

Camera hand gestures are out of scope until independently proven reliable.

## 35. Cooking Mode visual hierarchy

The hard execution hierarchy is:

```text
ATTENTION
NOW
RUNNING
UP NEXT
```

Priority:

> **Attention > Now > Running > Up Next**

Rules:

- NOW dominates ordinary Cooking Mode.
- ATTENTION temporarily outranks NOW only for legitimate deterministic/session events.
- RUNNING shows background work/timers.
- UP NEXT is a small non-interactive preview of the next useful action.
- Cooking Mode must not become a dashboard or Recipe Detail clone.

## 36. Normal Cooking touch controls

Primary touch CTA:

```text
[ Done ]
```

`Done` means the current Action has been completed.

Core touch path includes:

- Back;
- Repeat;
- Done;
- Later when the Action is deferrable.

Skip remains lower prominence and appears only where allowed.

Do not combine `Done / Next` into one ambiguous CTA.

`Next` may remain a voice/navigation concept where appropriate, but it does not become a second equally dominant completion button.

## 37. Voice commands

Initial deterministic/local voice commands may include:

- Next;
- Back;
- Repeat;
- Start timer;
- Pause timer;
- Resume;
- What's next?

Potential future deterministic command:

- Repeat amount.

Voice does not require ChatGPT API reasoning for navigation.

If Voice permission/capability is unavailable, touch remains fully complete.

Request microphone permission only when the user chooses Voice for the first time, not on Cooking Mode entry.

Voice output should be purposeful, for example:

- repeat instruction;
- timer started/finished;
- important Attention event.

Do not narrate every tap.

## 38. Up Next

Cooking Mode always shows a small `UP NEXT` preview when a next actionable unit exists.

Rules:

- next Action, or next Step's first Action;
- 1–2 conceptual lines where possible;
- may include a prep-ahead cue;
- non-interactive by default;
- visually subordinate to NOW.

Large text may require more rendered lines without changing the semantic amount.

## 39. Parallel Cooking Tracks

Recipes may contain multiple Cooking Tracks such as:

```text
Track A — Pasta
Track B — Chicken
Track C — Sauce
Track D — Final Assembly
```

Cooking Mode does not force track-by-track completion.

It orchestrates available Actions on one dynamic execution timeline.

Example:

```text
NOW
Season the chicken.

RUNNING
Pasta water heating

UP NEXT
Heat the chicken pan.
```

Users do not need to understand track IDs or dependency graph architecture.

## 40. Hybrid deterministic orchestration

Recipe authors/sources/approved ChatGPT provide cooking facts.

Plaivra computes execution order deterministically from those facts.

Example facts:

```text
Boil water
Track: Pasta
Can run in background: yes

Add pasta
Depends on: Water boiling

Cook chicken side A
Track: Chicken
Duration: 4 min
Can run in background: yes
```

Plaivra may schedule available work around dependencies and background tasks.

Plaivra never invents missing cooking facts.

Insufficient orchestration metadata falls back safely to linear execution.

## 41. Reality-aware Cooking Session

Cooking Mode follows actual user/session state, not elapsed estimates alone.

### 41.1 Time-based Actions

Example:

```text
Cook pasta for 9 min.
```

Timer is appropriate.

### 41.2 Condition-based Actions

Examples:

```text
Wait until water boils.
Cook until sauce thickens.
```

Plaivra does not mark the condition complete because estimated time elapsed.

The user explicitly confirms the condition.

### 41.3 Early completion and extra time

Timer completion may offer choices such as:

```text
Timer finished

[ Done now ]
+2 min
Later
```

If the user finishes early, `Done now` may close the timer and unlock dependent Actions.

Extra time modifies only the active Cooking Session.

It does not mutate the Recipe.

### 41.4 Later vs Skip

- `Later` = Action remains required but deferred.
- `Skip` = user chooses not to perform the Action.

They are not synonyms.

## 42. ATTENTION authority boundary

ATTENTION must never imply that Plaivra independently observed the physical world.

Valid deterministic example:

```text
ATTENTION
Pasta timer finished.
Drain the pasta now.
```

Valid user-confirmed example:

```text
User confirms: Water is boiling
↓
ATTENTION
Add 300 g pasta now.
```

Plaivra must not independently claim:

- water is boiling;
- food is browned;
- sauce has thickened;
- food is done;
- food is safe;
- target temperature has physically been reached;

unless that state was explicitly supplied/confirmed by the user/session or is deterministic session state such as a timer event.

## 43. Multiple timers

Timer belongs to a specific Action where possible.

Architecture supports multiple concurrent named timers.

Example:

```text
RUNNING
Pasta           07:18
Chicken rest    03:42
```

Timers use timestamp-based state, not fragile UI countdown state.

Store enough to reconstruct truth, for example:

- started_at;
- duration;
- target_end_at;
- paused state when applicable.

Timers may continue when the user advances to later Actions.

## 44. Cooking Session persistence

Cooking Mode is resumable but not a historical Cooking analytics product in V1.

A Cooking Session may persist:

```text
Cooking Session
├── frozen Recipe version
├── current Action
├── completed Actions
├── deferred/skipped state
├── active timers
├── background processes
├── started_at
└── last_active_at
```

On re-entry:

```text
Resume Cooking

Chicken Alfredo

Current step
...

Running
Pasta 04:12

[ Resume Cooking ]

Start Over
```

Rules:

- Resume is primary.
- Start Over is explicit secondary action.
- Reopening the app does not silently reset timers/session state.
- Start Over creates a fresh Cooking Session from the start of the same frozen Recipe version.
- End Cooking remains explicit and destructive/contextual.

## 45. Offline/session resilience

Once Cooking Mode starts, all execution-critical data must be locally available:

- frozen Recipe version;
- scaled ingredients;
- prep;
- Actions;
- dependencies;
- equipment;
- timers;
- current serving scale.

Core Cooking Mode continues without network:

- Back;
- Repeat;
- Done;
- Later/Skip where applicable;
- timers;
- Up Next;
- deterministic scheduling.

Session state persists across:

- app backgrounding;
- device locking;
- app termination.

Server synchronization is deferred until connectivity returns and must not block cooking.

External ChatGPT may become unavailable offline without blocking core Cooking Mode.

## 46. Active Cooking device behavior

While Cooking Mode is foregrounded, Plaivra requests screen wakefulness where the platform permits it.

Rules:

- do not modify a permanent device setting;
- restore normal idle behavior when active Cooking display no longer requires wakefulness;
- platform refusal must not break Cooking Mode.

Back navigation does not end the Cooking Session.

Explicit termination uses `End Cooking` with confirmation when appropriate.

No forced device orientation.

## 47. Cooking completion is not consumption

Cooking completion never means food was eaten.

After the Cooking Session completes:

```text
Cooking complete

Chicken Alfredo
4 servings prepared

What next?

Add to Diary
Add to Meal Plan
Save as Meal
Close
```

All next actions are optional.

If Diary is selected, the user chooses consumed quantity and meal slot.

Example:

```text
How much did you eat?

Serving
[ − ]       1.0       [ + ]

Meal
Breakfast
Lunch
Dinner
Snack
```

Never auto-log Recipe calories/consumption because Cooking Mode finished.

## 48. Loading, error, empty, and offline behavior

My Recipes uses progressive section-local loading and failure states.

### 48.1 Home

Show useful shell/navigation immediately.

Sections load independently.

Do not block the page with full-screen loading if usable content exists.

### 48.2 Empty personal sections

If there is no Continue Draft, Recently Used, or Favorites content, the section collapses.

Do not show repeated `Nothing here` noise.

### 48.3 Partial failure

Example:

```text
Recently Used
Couldn't load this section.
[ Retry ]
```

Other sections remain usable.

### 48.4 Offline library

If cached Recipes are available:

```text
Offline
Showing saved recipes.
```

Cached Recipe Detail and locally prepared Cooking Mode remain usable.

A Recipe not cached may show a local availability message rather than pretending full offline support.

### 48.5 Full-page failure

Reserve full-page failure for cases where no usable Recipe experience is available.

## 49. Responsive architecture

My Recipes preserves identical information architecture and semantics across mobile, tablet, desktop, and RTL.

Responsive adaptation changes density and presentation surface only.

### 49.1 Mobile

- single column;
- touch-first;
- compact Recipe rows;
- bottom sheets for contextual tasks;
- large Cooking controls.

### 49.2 Tablet/Desktop

- bounded content;
- one/two columns maximum when useful;
- popovers/side panels for contextual surfaces where appropriate;
- larger viewport means more breathing room, not more information.

Do not create a three/four-column ecommerce Recipe gallery.

### 49.3 Desktop Recipe Detail

An index/detail split may be used when it improves context, while direct Recipe URLs still render equivalent standalone Detail semantics.

### 49.4 Desktop Cooking Mode

Cooking Mode remains a focused center-column execution surface.

Do not add a permanent Recipe outline, timer dashboard, or side inspector merely because width exists.

## 50. RTL

RTL mirrors navigation/layout direction where semantically appropriate.

Do not blindly reverse:

- timer meaning;
- numeric values;
- scientific units;
- plus/minus semantics;
- arithmetic/progress logic.

Arabic instruction alignment follows language direction.

The same Cooking hierarchy remains:

```text
ATTENTION
NOW
RUNNING
UP NEXT
```

## 51. Accessibility

My Recipes must support:

- Dynamic Type / large text;
- screen readers;
- keyboard/focus on supported platforms;
- large touch targets;
- color-independent Attention state;
- long Recipe names;
- long Cooking Actions without aggressive truncation.

### 51.1 Plaivra touch baseline

Plaivra uses **≥44×44 pt effective touch targets as its product baseline**.

Cooking Mode justifies larger page-specific controls, for example:

- primary Done: approximately 56 pt visible height;
- Pause/Resume: at least 48 pt where practical;
- Back: at least 44 pt;
- Repeat: at least 44 pt;
- Later: at least 44 pt;
- +2 min: at least 44 pt.

This is a Plaivra product baseline, not an assertion of an Apple absolute platform minimum.

### 51.2 Dynamic Type Cooking Mode

Instruction clarity wins over compact geometry.

Controls may stack vertically.

NOW instruction is never aggressively line-clamped.

UP NEXT remains semantically small even if larger text requires additional rendered lines.

## 52. Native visual grammar

My Recipes uses the locked Nutrition native visual contract.

Page-specific direction:

- native/system navigation and toolbar layer;
- prominent native search;
- flat Recipe rows;
- one earned Continue Draft surface;
- sectioned editor canvas, not stacked cards;
- one compact grouped Nutrition region;
- optional cover imagery as content, never page identity;
- Cooking Mode as open focused execution canvas;
- ATTENTION as one strong semantic state;
- RUNNING timers as flat rows;
- UP NEXT as small text preview;
- Liquid Glass only for appropriate system navigation/control material, not ordinary content surfaces.

No shared Nutrition token amendment is required by My Recipes V1.

## 53. Privacy and authorization boundaries

- Recipes are scoped to the authenticated owner unless explicit future sharing contracts say otherwise.
- MCP Recipe writes require authorized user context and explicit confirmation.
- Prompt generation must not silently broaden data scope beyond the minimum relevant context.
- No external provider is allowed to become silent canonical nutrition authority.
- External ChatGPT completion must not be reported as a successful Plaivra write until the authorized Plaivra capability confirms persistence.
- Archived/old versions and historical snapshots remain protected by owner authorization.

## 54. Performance boundaries

My Recipes must not depend on client-side loading of an entire large Recipe library before useful content appears.

Use bounded indexed queries/projections for:

- Home sections;
- search;
- filters;
- Draft continuation;
- Recently Used;
- Favorites.

Search/filtering must be server-bounded/paginated for large libraries.

Cooking Mode execution-critical data is materialized locally at session start so network latency does not sit in the active cooking loop.

Do not introduce an external Recipe search service in V1 without a future approved architecture amendment.

## 55. Explicit V1 exclusions

Do not include:

- Recipe folders;
- Collections;
- public Recipe community;
- ratings/reviews;
- comments;
- followers;
- public profiles;
- collaborative editing;
- Recipe marketplace;
- Pantry/kitchen inventory;
- Recipe-inside-Recipe nesting;
- Cooking history analytics/dashboard;
- camera hand gestures;
- step photos;
- Recipe gallery/video system;
- native general-purpose web scraper;
- embedded ChatGPT chat;
- Plaivra-authored cooking prediction;
- allergen/safety guarantees;
- forced dietary-suitability claims;
- dashboard-style Cooking Mode;
- ecommerce-style Recipe grid.

## 56. Required visual acceptance scenarios

The implementation must be capable of matching the approved corrected visual package across at least these scenarios.

### Mobile

1. My Recipes Home — populated.
2. My Recipes Home — empty.
3. All Recipes / search.
4. Active filters.
5. No results.
6. Recipe Editor.
7. Add Ingredient search.
8. Recipe Detail.
9. Before You Start.
10. Cooking Mode — normal.
11. Cooking Mode — ATTENTION.
12. Cooking Mode — multiple timers/background.
13. Resume Cooking with Resume + Start Over.
14. Cooking complete / post-cook actions.
15. Offline / partial failure.
16. Autosave failure.

### Desktop

17. My Recipes Home.
18. Recipe Detail.
19. Cooking Mode.

### RTL

20. My Recipes Home mobile.
21. Cooking Mode mobile.

### Accessibility stress

22. Large-text / Dynamic Type Cooking Mode.
23. Long Recipe name / long Action handling.

## 57. Product acceptance criteria

My Recipes V1 is acceptable only if all of the following hold.

### Domain integrity

- Food, Recipe, and Saved Meal remain distinct semantics.
- My Recipes owns Recipes only.
- Nested Recipe ingredients are excluded V1.
- Published Recipe history is immutable through versions/snapshots.

### Creation/editing

- Manual Recipe creation is fully capable without ChatGPT.
- Drafts autosave truthfully.
- Ready minimum contract is enforced.
- Advanced orchestration metadata is optional.
- Editing published Recipe creates a Working Draft and next version only on explicit successful Save Recipe.

### Ingredients/nutrition

- Canonical Food linking is preferred but manual ingredient entry never blocks creation.
- Missing nutrition is unknown, never zero.
- Conversions are never guessed.
- ChatGPT is not nutrition authority.

### Discovery

- Home remains small and search-first.
- No folders/Collections V1.
- Ingredient-aware search does not claim Pantry possession.
- Filters are live and intentionally small.
- No allergen/dietary-suitability filters/claims are introduced.

### Cross-domain reuse

- Diary/Meal Plan/Saved Meal receive frozen Recipe version + resolved serving/nutrition snapshot.
- Later Recipe edits never silently mutate existing uses.

### ChatGPT/MCP

- No embedded ChatGPT runtime.
- Strong contextual prompts are first-class product capability.
- External ChatGPT reasoning requires explicit user approval before authorized MCP writes.
- MCP writes structured Recipe data and updates the same Draft when completing an existing Draft.
- Plaivra does not claim write success before its persistence authority confirms it.

### Cooking Mode

- One actionable chunk dominates the screen.
- Hard hierarchy remains Attention > Now > Running > Up Next.
- Primary touch CTA is Done, not Done/Next.
- Repeat exists by touch.
- Later appears only when applicable.
- Voice is optional and touch-complete.
- Plaivra never predicts physical cooking state.
- Deterministic timer/session events may trigger Attention.
- Condition-based progression waits for user confirmation.
- Parallel Tracks are orchestrated deterministically without exposing technical architecture.
- Multiple named timers are supported.
- Session persists across backgrounding/locking/app termination.
- Resume + Start Over are both available.
- Cooking completion never auto-logs consumption.

### Visual/responsive/accessibility

- No dashboardification.
- No ecommerce Recipe gallery.
- No step media.
- No embedded AI chat UI.
- Larger screens increase breathing room rather than feature density.
- RTL preserves semantics.
- Dynamic Type does not hide current instruction.
- Plaivra touch targets respect the approved ≥44×44 pt product baseline.

## 58. Visual rejection criteria

Reject an implementation if it:

- feels like a dashboard;
- feels like ecommerce Recipe browsing;
- uses Recipe photography as required identity;
- adds visual clutter to demonstrate feature richness;
- turns the Recipe Editor into a giant form;
- exposes backend version/track/dependency concepts unnecessarily;
- makes advanced cooking metadata mandatory;
- adds embedded AI chat;
- invents allergen/safety/dietary claims;
- invents cooking state/advice;
- adds step photos/video;
- adds folders/Collections;
- adds social/community surfaces;
- creates false linear track sequencing;
- uses ambiguous verification semantics;
- turns desktop Cooking Mode into a timer/task dashboard;
- hides core Cooking actions behind hover-only UI;
- breaks RTL, Dynamic Type, or touch accessibility.

## 59. Implementation boundary

This document locks **what My Recipes V1 is** and the architecture/interaction/visual contracts implementation must satisfy.

It does not authorize implementation yet.

Before implementation planning begins:

1. User must review and explicitly approve this written spec.
2. Remaining canonical Nutrition destinations must complete design.
3. Nutrition-wide reconciliation must confirm no cross-destination contradictions.
4. Only then may a separate implementation plan be created under the approved Plaivra workflow.
