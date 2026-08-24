# Nutrition Food Library V1 Design

**Date:** 2026-08-24  
**Status:** Planner-approved architectural design, pending written-spec review  
**Branch:** `design/nutrition-food-library-v1`  
**Base design branch:** `design/nutrition-meal-plan-v1`

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

This document defines **Nutrition → Food Library V1** product responsibility, catalog architecture, identity rules, serving and nutrition semantics, search and ranking, browse taxonomy, personalization, verification, duplicate handling, custom-food behavior, ingestion/curation boundaries, Food Library page information architecture, Food Card and Food Detail behavior, Add To handoff semantics, filters, nutrition discovery presets/tags, loading/offline/error behavior, localization/RTL, responsive behavior, accessibility, and acceptance criteria.

It does not define the complete My Recipes page, Nutrition Summary, complete Saved Meal authoring UX, Diary logging-session UX, Meal Plan destination UX, Shopping List behavior, billing, future Pantry inventory, a general catalog-management CMS, or implementation sequencing.

No Nutrition implementation plan is authorized by this document. Implementation planning remains intentionally deferred until all five canonical Nutrition destinations have completed design and Nutrition-wide reconciliation.

## 2. Product classification

This is an **Architectural** redesign.

The current food browser mixes global foods, custom foods, saved meals, favorites, logging, Meal Plan actions, kitchen/subcategory browsing, and fallback data in one surface. V1 establishes Food Library as a distinct reusable-Food domain and user destination while preserving explicit handoff contracts to Diary, Meal Plan, Recipes, and Saved Meals.

## 3. Product intent

Food Library is Plaivra's user-facing destination for **discovering, inspecting, favoriting, and managing reusable single Foods**.

Its primary user question is:

> Can I quickly find the right food, understand its basic nutrition immediately, inspect it precisely when needed, and reuse it anywhere in Plaivra without duplicating or corrupting food identity?

Food Library is not a Diary logger, Meal Plan workspace, recipe authoring page, saved-meal collection, or external-provider browser.

The governing product principle is:

> **Fast discovery on the surface. Strong food identity and nutrition authority underneath.**

## 4. Canonical Nutrition information architecture

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

- Food Library is an independent Nutrition destination.
- `My Foods` is a personal view inside Food Library, not a sixth Nutrition destination.
- Barcode scan is an access method, not a separate destination.
- Recipes remain owned by My Recipes.
- Saved Meals remain owned by the Meal/Saved Meal domain.
- Diary owns actual intake.
- Meal Plan owns intended intake.
- Unified add/search experiences in Diary or Meal Plan may federate Food, Recipe, Saved Meal, Recent, and Favorite results without collapsing the underlying domain boundaries.

## 5. Core semantic model: Food, Recipe, Meal

### 5.1 Food

A Food is one reusable consumable identity.

Examples:

- chicken breast;
- rice;
- banana;
- milk;
- a branded yogurt.

Food Library owns this semantic type.

### 5.2 Recipe

A Recipe describes how something is made and may contain:

- ingredient Foods;
- ingredient quantities;
- yield/servings;
- preparation/cooking instructions;
- nutrition per serving.

Recipe creation and management belong to My Recipes.

### 5.3 Saved Meal

A Saved Meal is a reusable combination eaten together and may contain Foods and/or Recipes.

Example:

```text
My Lunch
├── 200 g Rice [Food]
├── Grilled Chicken [Recipe]
├── Greek Yogurt [Food]
└── Salad [Recipe]
```

Food is not Recipe. Recipe is not Saved Meal. Saved Meal is not Food.

### 5.4 Cross-domain creation boundary

A Food selected from Food Library may be handed into Recipe or Saved Meal authoring. Food Library owns only the resolved Food selection and quantity/serving handoff. The destination domain owns the remaining authoring workflow.

No Food Library flow may create a second Recipe or Saved Meal authority.

## 6. Catalog hosting and runtime authority

### 6.1 Main Plaivra database authority

The canonical Food Catalog lives inside the **same Plaivra Main Supabase project** as the application nutrition domain.

Do not create:

- a separate runtime Food Catalog Supabase project;
- a cross-service runtime dependency before useful Food Library content can appear;
- a second nutrition fact store;
- a full international catalog bundled into the client application.

The separate Activity Catalog project remains inactive and non-authoritative unless a future Lead-approved migration decision explicitly changes that authority.

### 6.2 External providers

External food APIs and datasets may support:

- ingestion;
- enrichment;
- barcode fallback;
- research/curation.

They are not the normal runtime authority for canonical text search.

A normal Food Library page load must remain useful if every external food provider is unavailable.

### 6.3 Initial projection

Initial Food Library loading should converge through one bounded page/bootstrap projection rather than browser read fan-out.

Conceptually:

```text
Food Library open
↓
One bounded initial projection
↓
Recent
Favorites
My Foods
bounded default/browse seed data when needed
Browse/filter metadata
```

The projection may carry a small default/browse seed so empty-personal states and browse entry points can become useful immediately, but it does **not** require a separate visible `Recommended Foods` section.

This projection is not a new fact store. It is a read projection over canonical authorities.

## 7. Canonical Food identity architecture

### 7.1 Language-neutral identity

Food identity is language-neutral.

Names, translations, transliterations, aliases, cuisine relevance, and country relevance are metadata around a stable Food identity.

For example, these may represent one Food:

- Chicken Breast;
- Hähnchenbrust;
- صدر دجاج;
- curated Arabizi aliases.

Language difference does not create a new Food.

Country difference alone does not create a new Food.

A distinct Food/Variant exists when composition, preparation, formulation, brand identity, or another material semantic property differs.

### 7.2 Variant-worthy differences

Variant or distinct-identity decisions may depend on:

- raw versus cooked;
- cooking method where composition meaningfully differs;
- skin/bone state;
- fat level;
- physical form;
- formulation;
- brand/product identity;
- barcode/GTIN;
- materially different ingredients;
- materially different nutrition.

### 7.3 Canonical Food plus source records

Plaivra uses **Canonical Food Identity + Source Records**.

A canonical Food owns the user-facing identity and current approved canonical representation. Supporting external records remain attributed source records and do not automatically become additional search-visible Foods.

Logical model:

```text
Canonical Food
├── stable food identity
├── localized names and aliases
├── category/subcategory
├── cuisine/country relevance
├── brand/barcode identity where applicable
├── canonical nutrition
├── serving definitions
├── lifecycle
├── verification state
└── linked source records / provenance
```

External source records retain their original identity and provenance even when attached to one canonical Food.

## 8. International catalog strategy

### 8.1 Priority markets

Primary launch-depth markets:

- USA;
- Germany;
- UK;
- Egypt;
- Saudi Arabia;
- UAE.

Tier B:

- Canada;
- Australia;
- Austria;
- Switzerland;
- Netherlands;
- Kuwait;
- Qatar.

Broad but shallower support may include France, Spain, Italy, Belgium, Nordic markets, Bahrain, Oman, Ireland, and New Zealand.

Catalog coverage may be broader than go-to-market depth.

Initial first-class search/localization languages are:

- English;
- German;
- Arabic.

### 8.2 Coverage contract

V1 catalog quality is governed by **coverage and quality gates**, not an arbitrary total-record target.

International Core should cover daily-use categories including:

- staple carbohydrates;
- meats/poultry/fish;
- eggs;
- dairy and alternatives;
- fruits;
- vegetables;
- legumes;
- oils/fats;
- nuts/seeds;
- drinks;
- common snacks.

Priority-country packs should cover common local and traditional foods. Egypt, for example, should include staples, traditional dishes, bakery, breakfast foods, street foods, desserts, drinks, and common home-cooked foods.

Success means an ordinary priority-market user can log most everyday foods without repeatedly creating Custom Foods.

## 9. Data acquisition and provenance

### 9.1 Generic/traditional foods

Generic and traditional foods may be curated from authoritative or otherwise explicitly approved composition sources.

ChatGPT may act as a research/curation assistant, but never as nutrient authority by itself.

The curation flow is:

```text
Define candidate food
→ research approved source evidence
→ record preparation state and nutrition basis
→ reconcile conflicts
→ define canonical representation
→ verify provenance/license
→ QA
→ import/publish
```

Every curated source record retains, where applicable:

- source/provider;
- source record identifier;
- source reference/version;
- license/provenance;
- retrieved-at time;
- source nutrition and serving evidence;
- confidence/review metadata.

### 9.2 Branded/barcode foods

Barcode/GTIN is an identity signal, not a complete nutrition authority.

Branded nutrition should prefer manufacturer/label evidence where available.

Unknown barcode flow:

```text
Scan
↓
Plaivra Main DB lookup
↓
Found?
├── Yes → canonical local result
└── No → permitted attributed external fallback
```

An external fallback result is not silently promoted into the shared canonical catalog or marked verified.

The user may use the attributed result for the immediate workflow where allowed, and may create a user-owned branded Custom Food if needed.

### 9.3 Licensing boundary

Bulk ingestion is permitted only from sources whose license explicitly supports Plaivra's intended storage and reuse.

Public-domain/CC0-style datasets are preferred for proprietary canonical ingestion.

Provider datasets whose licensing requires attribution/share-alike/database obligations must remain behind an explicitly compliant boundary and may require a separate architecture/legal decision before caching or canonical bulk ingestion.

Commercial release requires license/Terms review for every production source boundary. This design does not claim zero legal risk.

## 10. Serving and measurement model

### 10.1 Canonical nutrition basis

Every reusable Food should have a measurable canonical nutrition basis where its evidence supports one:

- solids: normally per 100 g;
- liquids: normally per 100 ml.

A source-provided per-serving basis may be normalized only when a measurable conversion is known.

Plaivra must not infer 100 ml = 100 g without a food-specific density relationship.

### 10.2 Serving definitions

Human-friendly servings are Food-specific definitions that resolve to a measurable amount when known.

Logical serving definition:

```text
ServingDefinition
├── stable serving identity
├── label
├── measurement type
├── measurable amount when known
├── source/provenance
├── confidence/review state
└── default/relevance metadata
```

Examples:

- `1 slice = 32 g`;
- `1 bar = 50 g`;
- `1 bottle = 330 ml`;
- `1 oz = 28.35 g`.

`piece`, `slice`, `bowl`, `plate`, and `cup` are not universal nutrient units. Their conversions are Food-specific and must not be guessed.

### 10.3 Historical snapshots

Diary logs and Meal Plan planned occurrences store enough frozen resolved serving/nutrition data that later Food Catalog changes do not silently mutate history or previously committed planning snapshots.

The governing rule is:

> **The database calculates from measurable amounts; the user interacts with natural servings.**

## 11. Nutrition data model

### 11.1 Core nutrients

Core canonical nutrition supports:

- energy/kcal;
- protein;
- carbohydrates;
- fat;
- saturated fat;
- fiber;
- sugars;
- sodium.

Most reusable Foods should at minimum have energy, protein, carbohydrates, and fat when reliable evidence exists.

### 11.2 Extensible nutrients

Additional nutrient facts may include:

- potassium;
- calcium;
- iron;
- magnesium;
- zinc;
- vitamin D;
- vitamin B12;
- cholesterol;
- added sugars;
- trans fat;
- other supported nutrients.

### 11.3 Missing is not zero

Missing nutrient data is unknown, not zero.

This rule applies to:

- Food Card calculation;
- Food Detail;
- filters;
- discovery presets/tags;
- summaries;
- custom-food input;
- imported-provider data.

## 12. Source trust and verification

### 12.1 Internal source classes

Plaivra may internally distinguish source/review classes such as:

- Verified/Curated;
- Manufacturer/Label;
- Government/Authoritative Dataset;
- Imported Provider;
- User Created;
- Personal Override;
- Estimated.

These are contextual authority classes, not one universal quality ranking.

Generic foods should generally prefer authoritative composition/curated evidence. Branded foods should generally prefer manufacturer/label evidence.

### 12.2 User-facing verification

Normal Food Cards do **not** show source names, confidence wording, trust levels, or `unverified` badges.

They show only a positive Plaivra verification indicator when the canonical shared Food passes the complete verification gate.

Canonical icon:

- `lucide:shield-check` on the current web renderer;
- platform-equivalent semantic shield-check symbol on native renderers.

The verification indicator is:

- green/positive semantic treatment;
- compact but visible;
- icon-only by default;
- accessibility-labeled;
- absent when verification is not currently valid.

The shield represents Plaivra's verified **shared canonical Food identity/data authority**. It does not transform user-entered personal corrections into verified source data.

### 12.3 Verification gate

Verification requires, as applicable:

- identity clarity;
- duplicate resolution;
- known nutrition basis;
- coherent core nutrition;
- reliable serving conversions where claimed;
- source provenance;
- license acceptability;
- localized identity quality for published locales;
- branded identity/barcode evidence where applicable;
- no unresolved material source contradiction.

Users cannot self-assign the shared verification indicator.

Verification is independent of lifecycle.

## 13. Duplicate and merge architecture

### 13.1 Classification

Duplicate evaluation produces:

```text
MATCHED
POSSIBLE_DUPLICATE
DISTINCT
```

Matching may consider concept, preparation state, cooking method, skin/bone state, fat level, brand, barcode, ingredients, physical form, and nutrition compatibility.

Language or translation similarity alone is never enough to merge identities.

### 13.2 No destructive AI auto-merge

AI/machine similarity may identify candidates, but it may not independently perform destructive merge decisions.

### 13.3 Merge semantics

When shared canonical Foods are proven duplicates:

- one survivor remains canonical;
- the duplicate gets a durable redirect such as `merged_into`;
- future references resolve the survivor;
- favorites survive through canonical resolution;
- provenance from both identities remains preserved;
- historical frozen snapshots remain unchanged;
- merge lineage is auditable;
- reversible remediation remains possible before destructive cleanup.

User-created Foods are not silently merged into shared catalog Foods.

## 14. Food lifecycle and lightweight revisioning

### 14.1 Lifecycle

```text
DRAFT
↓
ACTIVE
↓
DEPRECATED / WITHDRAWN
or
MERGED → canonical replacement
```

- `DRAFT`: internal, unpublished, not user-searchable.
- `ACTIVE`: usable; may be verified or unverified.
- `DEPRECATED/WITHDRAWN`: excluded from ordinary new discovery while history/references remain recoverable.
- `MERGED`: resolves through the canonical survivor.

### 14.2 Verification state

Verification is separate:

```text
UNVERIFIED
VERIFIED
```

A meaningful source conflict may revoke verification without deleting or deactivating the Food.

### 14.3 Lightweight revision policy

Do not create user-visible `Food v1/v2/v3` records for ordinary source corrections.

Maintain current canonical values, lightweight prior revision/audit information, and source/version/update reason where relevant.

Minor factual correction or source refresh remains the same stable Food identity.

A materially distinct preparation/formulation may require a new Food Variant or branded formulation identity.

Historical Diary/Meal Plan snapshots do not retroactively change.

## 15. Personal correction versus Custom Food

### 15.1 Personal Correction

A Personal Correction changes the user's calculation/view of an existing canonical Food without creating a duplicate shared identity.

Example:

```text
Canonical: 165 kcal / 100 g
User correction: 150 kcal / 100 g
```

A personal correction:

- is user-scoped;
- does not mutate the global canonical Food;
- applies consistently to that user's future Food Library, Diary, Meal Plan, Recipe, and Saved Meal use where the Food is resolved;
- can be reverted;
- persists across later canonical updates until explicitly reviewed/reverted.

### 15.2 Effective nutrition

For user-facing calculation, Plaivra resolves an **effective nutrition view**:

```text
Effective nutrition for user
= active personal correction where supplied
+ canonical values for nutrients/basis not overridden
```

Rules:

- Food Card and Food Detail values use effective nutrition for that user.
- numeric nutrition filters use effective normalized nutrition for that user.
- future Diary/Meal Plan/Recipe/Saved Meal resolution uses effective nutrition at the point the new snapshot/reference is created.
- historical frozen snapshots remain unchanged.
- verification state remains attached to the canonical shared Food and does not certify personal override values.

Food Detail must expose a subtle `Using your values` / Manage correction state when a correction is active. Food Cards must not add a noisy negative/unverified badge merely because a personal correction exists.

### 15.3 Custom Food

A Custom Food is a genuinely distinct or unavailable user-owned Food.

Examples include homemade granola, a local bakery item, or an unknown local branded product.

A Custom Food:

- belongs to the creating user;
- appears in My Foods;
- is searchable/reusable for that user;
- is not automatically shared globally;
- is not automatically verified;
- may later support a separate moderated promotion path without deleting or mutating the personal identity.

## 16. Favorites, recents, and frequency personalization

Plaivra distinguishes three signals:

1. explicit Favorite;
2. Recent Usage;
3. Usage Frequency.

### 16.1 Favorite

Favorite is explicit user intent only.

- no auto-favorite;
- tied to stable canonical identity/resolution;
- survives canonical merges through redirect resolution;
- separate from taxonomy.

### 16.2 Recent

Recent is derived from authoritative actual `food_logs` or the canonical successor of that authority.

Do not create a second truth table merely to represent recency.

### 16.3 Frequency

Usage Frequency is a derived ranking signal over actual user logging, with recency/time decay so old lifetime behavior does not dominate indefinitely.

Light meal-context frequency may boost relevant Foods for contexts such as Breakfast without intrusive recommendation messaging.

### 16.4 Privacy boundary

V1 personalization is user-scoped.

Do not mine private logs into global popularity rankings in V1.

Any performance projection/cache for personalization must be rebuildable derived data, not a new fact authority.

## 17. Search architecture

### 17.1 Main-DB indexed search projection

V1 uses a **Supabase/Postgres-native indexed multilingual search projection inside the Main Plaivra database**.

Do not introduce an external search provider in V1.

The current `ILIKE`-style search and ASCII-only normalization are transitional implementation evidence, not the target search authority.

### 17.2 Searchable identity fields

Search projection may cover:

- canonical names;
- localized translations;
- aliases;
- curated transliterations/Arabizi aliases;
- brands;
- barcodes;
- user-owned Foods where appropriate.

English, German, and Arabic are first-class V1 search locales.

Examples of curated Arabizi aliases may include forms such as `fara5`, `roz`, `3eish`, `laban`, or `gebna` when quality-reviewed.

Do not depend on live AI translation for every search request.

Arabic normalization must be language-aware and cautious rather than deleting all non-Latin characters. German alternate spellings/aliases must remain searchable.

### 17.3 Search ranking

Base ranking hierarchy:

1. query relevance;
2. personal relevance among relevant candidates;
3. catalog quality/locale relevance;
4. contextual brand intent.

Query relevance prefers roughly:

```text
exact canonical/localized name
→ exact alias
→ prefix
→ typo/fuzzy candidate
```

Personal relevance may include My Foods, Favorites, Recent, Frequency, and meal context.

Verification is a mild catalog-quality signal, never strong enough to override exact user intent.

Locale is a boost, not a hard filter.

### 17.4 Branded search behavior

Generic/local foods should dominate broad generic queries.

Explicit brand/product wording boosts branded products.

Barcode-like input routes to exact barcode lookup before any external fallback.

### 17.5 Bounded results

Food Library must not fetch the full catalog into the client.

Search returns a bounded first page, approximately 20 useful deduplicated results, with server-authoritative cursor/page continuation.

Do not use browser-side slicing as fake pagination.

Search misses should not be filled with unrelated fuzzy results merely to avoid an empty state.

## 18. Taxonomy and browse model

V1 replaces Kitchen-first hierarchy with orthogonal faceted metadata.

A Food may have:

- one Primary Category;
- optional Subcategory;
- zero or more Cuisine/Cultural relevance values;
- zero or more Country relevance values;
- Brand/Product Family metadata;
- discovery/search tags;
- separate personal signals.

Suggested Primary Categories include:

- Protein;
- Dairy & Alternatives;
- Grains & Starches;
- Bread & Bakery;
- Fruit;
- Vegetables;
- Legumes;
- Nuts & Seeds;
- Fats & Oils;
- Drinks;
- Snacks;
- Desserts & Sweets;
- Sauces & Condiments;
- Prepared Dishes.

Cuisine is not the same as country relevance.

Example:

```text
Koshari
Primary Category: Prepared Dishes
Cuisine: Egyptian
Country relevance: Egypt
```

Favorites, Recent, My Foods, and Frequency are personal projections, not taxonomy categories.

## 19. Internal owner-only catalog curation

Plaivra V1 has one owner-controlled internal Food Catalog curation console.

There is no V1 multi-admin role hierarchy, Curator/Reviewer team workflow, or general-purpose CMS.

The sole owner/admin may review and perform sensitive catalog operations such as:

- review incoming source candidates;
- edit/normalize canonical Foods;
- publish;
- verify/unverify;
- merge;
- deprecate;
- restore;
- inspect source/provenance records.

Authorization must be enforced server-side through existing Plaivra identity/security authority. Do not rely on a hidden URL or client-only check as protection.

### 19.1 Publish is not Verify

A Food may be ACTIVE and usable without being VERIFIED.

The user-facing verification indicator appears only after the verification gate passes and the owner explicitly approves verification.

### 19.2 Bulk ingestion

```text
Import Batch
→ normalize
→ identity/duplicate classification
→ nutrition and serving validation
→ license/provenance validation
→ auto-clear safe records
→ manual exception review
→ publish/verify decision
```

Routine valid records should not require repetitive manual row-by-row review.

Manual exceptions may include duplicate conflicts, missing nutrition basis, unsupported serving conversion, license/provenance problems, identity ambiguity, or material nutrient contradiction.

### 19.3 Audit

Sensitive operations are auditable, especially verification changes, canonical nutrition changes, merge, and deprecation/restoration.

Audit captures who, what, when, previous state, new state, and reason where appropriate.

## 20. Food Library page responsibility and top-level IA

Food Library owns Food discovery, Food search, Food inspection, Favorite state, My Foods management, browse entry points, and reusable Food handoff.

It does not own Recipe authoring, Saved Meal authoring, Diary ledger state, or Meal Plan state.

Top-level hierarchy:

```text
Food Library
↓
Search
↓
Personal quick access
├── Recent
├── Favorites
└── My Foods
↓
Browse
├── Categories
└── Cuisines
```

Search is primary. Personal access is second. Discovery browse is third.

## 21. Default page hierarchy and native shell

Semantic default screen:

```text
Food Library                                 +

Search foods, brands…                 [Scan]

Quick Access
[ Recent ] [ Favorites ] [ My Foods ]

<small bounded set of Foods>

Browse by Category
<category entries>

Browse by Cuisine
<cuisine entries>
```

This diagram describes **information hierarchy**, not a requirement to manually draw a custom navigation bar.

Native/platform rules:

- iPhone/iPad use the shared Nutrition native title/toolbar/search authority where appropriate;
- page-level `+` Create Food belongs in the native toolbar/action placement when that platform provides it;
- web/desktop uses the established Plaivra page shell rather than imitating SwiftUI chrome;
- Search may become sticky/collapsing through platform-appropriate behavior, but Food Library must not create a fake stacked custom header that conflicts with native navigation.

Content rules:

- no marketing hero;
- no giant welcome copy;
- no nutrition dashboard inside Food Library;
- no second Nutrition tab strip;
- `Recent` is the default Quick Access view when available;
- Quick Access shows a small useful set plus a route/view-all affordance where needed;
- empty personal sections collapse when they would only consume space;
- when all personal views are empty, Browse moves up naturally.

When active text search begins, the discovery body yields to Search Results. Clearing the query restores the prior default/Quick Access state.

### 21.1 Search within personal Quick Access views

If the user explicitly enters Recent, Favorites, or My Foods and then searches, Search remains scoped to that personal view and exposes the scope clearly, for example:

```text
Search My Foods…
[ My Foods × ]
```

Removing the scope returns to global Food search.

Favorites/Recent remain personal views rather than permanent facets in the main filter panel.

## 22. Global symbol convention

When a conventional symbol is unambiguous, Plaivra prefers the symbol over redundant text while preserving accessible labels.

Stable semantic meanings:

- `×` = close/cancel/dismiss without completing;
- `✓` = confirm/save/finish;
- `+` = add/insert/attach;
- `♡ / ♥` = favorite state;
- pencil = edit;
- trash = delete/destructive intent;
- scan symbol = barcode scan;
- back chevron = navigation back only;
- retry/refresh symbol = retry where context is unambiguous.

This convention does **not** require every action to become icon-only. Text remains appropriate when the symbol alone would be ambiguous, uncommon, destructive, or unsafe.

Icon-only controls require platform-appropriate accessible names and touch/pointer targets.

## 23. Food Card contract

Food Cards are compact, decision-ready representations.

Canonical information hierarchy:

```text
<optional nutrition discovery tag(s)>

Chicken Breast        [shield-check]           ♡   +
165 kcal / 100 g

P 31 g     C 0 g     F 3.6 g
```

Card content includes:

- Food name;
- optional secondary brand line for branded products;
- verification shield when applicable;
- Favorite control;
- Add `+` control;
- calories with explicit serving/basis;
- Protein;
- Carbohydrates;
- Fat.

Basic P/C/F must be visible on the Card. The user must not need to open Food Detail merely to see basic macros.

For a user with an active personal correction, displayed Card nutrition uses that user's effective nutrition as defined in §15.2. The shared verification shield continues to represent the canonical Food authority, not the user-entered correction.

Do not add to ordinary Food Cards:

- source name;
- trust/confidence wording;
- full micronutrient list;
- category/cuisine metadata by default;
- multiple destination buttons;
- large verification text badges.

### 23.1 Tap/click behavior

- Card body → Food Detail.
- Heart → Favorite toggle only.
- `+` → Add To handoff.

Food Card body never immediately logs Food.

### 23.2 Custom Food distinction

A user-owned Food may show a subtle `My Food` identity marker where needed, but it must not compete visually with the verified shield.

### 23.3 Nutrition discovery tags

A Food Card may show up to **two** compact nutrition-discovery tags above the identity row.

These tags are functional decision aids, not decorative badge clusters.

Their visual treatment may be subtly raised/contained to read as compact tags, but must remain consistent with the shared Nutrition visual contract: no badge wall, no routine floating shadow, no skeuomorphic 3D decoration, and no card-wall effect.

## 24. Food Detail contract

Food Detail is the precision surface for one Food.

Information/action order:

```text
Identity + verified/favorite/add
↓
Serving + quantity
↓
Calories + P/C/F
↓
More Nutrition
↓
Other Serving Definitions
↓
Personal correction or user-owned management
```

### 24.1 Identity

Examples:

```text
Chicken Breast        [shield-check]        ♡   +
```

Branded:

```text
Alpro Protein Vanilla [shield-check]        ♡   +
Alpro
```

Custom:

```text
Mama's Granola                              ♡   +
My Food
```

### 24.2 Serving and quantity

Food Detail allows reliable serving selection and quantity adjustment.

Example:

```text
Serving: 100 g
Quantity: 1.5
```

Nutrition recalculates live for the selected resolved amount using the user's effective nutrition view.

This preview does not mutate canonical Food nutrition or the personal correction itself.

### 24.3 Basic nutrition

Calories and all three basic macros remain prominent:

```text
248 kcal
Protein 46.5 g
Carbs 0 g
Fat 5.4 g
```

### 24.4 More Nutrition

Additional known nutrients are progressively disclosed.

Unknown values are omitted or explicitly shown as unavailable where context requires. They are never rendered as zero by default.

### 24.5 Other servings

Food Detail may expose trusted additional serving definitions such as:

```text
100 g
1 oz = 28.35 g
1 breast = 172 g
```

Only evidence-backed conversions may be shown as numeric conversions.

### 24.6 Correction/management

Canonical Food:

- `Correct for me` / Manage correction;
- when active, a subtle `Using your values` state.

User-owned Custom Food:

- Edit;
- Delete.

## 25. Add To handoff

The generic `Use Food` text CTA is not used.

The canonical reusable action is `+` on Food Cards and Food Detail.

### 25.1 Standalone Food Library context

`+` opens an Add To surface conceptually containing:

- Diary;
- Meal Plan;
- Saved Meal;
- Recipe.

The surface resolves/retains the Food serving and quantity before handing control to the chosen destination.

### 25.2 Context-aware behavior

When Food Library/Food Detail is entered from an already-known destination context, the same `+` respects that context instead of asking the user to choose the destination again.

Examples:

- Diary Add Food context → hand back to Diary logging session;
- Meal Plan Add context → hand back to Meal Plan planning session;
- Recipe ingredient picker → hand back to Recipe authoring.

### 25.3 Domain ownership boundary

Food Library owns only the Food selection, canonical identity resolution, serving/quantity selection, and destination handoff.

The destination domain owns all remaining state and commit semantics.

Therefore:

- Diary decides meal/date and creates actual logs;
- Meal Plan decides week/day/slot and creates planned occurrences;
- My Recipes owns recipe selection/creation and ingredient mutation;
- Saved Meal domain owns saved-meal selection/creation and composition mutation.

This Food Library spec does not authorize implementation of those destination workflows beyond the shared handoff contract.

### 25.4 Not Add To destinations

Do not expose the following in Add To:

- Favorites — heart owns Favorite;
- Shopping List — Shopping is derived/owned by Meal Plan rather than direct Food Library insertion;
- Custom Food — not a destination.

## 26. Create Custom Food

Create Custom Food uses **Fast Core + Optional Details**.

Top control convention:

```text
×                                      ✓
Create Food
```

There is no redundant bottom `Save Food` button when the top commit control is clear and accessible.

### 26.1 Required/primary fields

Fast Core:

- Name — required;
- explicit nutrition basis — required;
- Calories — required for the normal creation path;
- Protein/Carbs/Fat — entered when known and strongly encouraged.

Example:

```text
Name
Mama's Granola

Nutrition is for
100 g

Calories
420

Protein     Carbs     Fat
12          58        16
```

Missing macro fields remain unknown, not zero.

### 26.2 Nutrition basis choices

May include:

- 100 g;
- 100 ml;
- 1 serving;
- 1 piece;
- custom amount.

If a human serving has a measurable conversion, the user may provide it, for example `1 serving = 50 g`.

If the measurable conversion is unknown, Plaivra may retain the user-defined serving without inventing grams/ml.

### 26.3 Progressive optional fields

Optional progressive areas may include:

- more nutrition details;
- additional serving definitions;
- Brand;
- barcode/product identity where relevant;
- additional metadata in later edit/detail surfaces.

Primary Category/Cuisine are not required blockers for fast Custom Food creation.

### 26.4 Create-time duplicate detection

Strong existing match:

```text
Possible match
<existing Food>

Use Existing
Correct for Me
Create Separately
```

Detection must not silently merge or block the user.

Weak/uncertain similarity should not interrupt the flow unnecessarily.

### 26.5 Save result

A created Custom Food:

- appears in My Foods;
- is user-searchable;
- is reusable across Diary, Meal Plan, Recipes, and Saved Meals;
- remains user-owned;
- remains unverified unless a separate future shared-catalog workflow creates a distinct reviewed canonical identity.

## 27. Edit and delete Custom Food

Edit surface uses:

- `×` to exit without commit;
- `✓` to save;
- pencil to enter edit;
- trash to initiate delete.

### 27.1 Post-save duplicate handling

If editing an existing Custom Food creates a strong match to a canonical Food, duplicate handling is advisory only.

Offer conceptually:

- View Existing;
- Keep My Food.

Do not automatically merge, replace, or rewrite existing references.

### 27.2 Material edits and references

If a material edit affects reusable Recipes/Saved Meals that reference the Custom Food, Plaivra must warn before commit that those reusable objects will resolve the updated Food in future use, while historical frozen Diary/Meal Plan snapshots remain unchanged.

Do not silently fork a new Food merely because an edit is large.

### 27.3 Serving-basis edits

Changing a serving definition does not automatically create a new Food identity.

Future calculations use the new definition after commit. Historical frozen snapshots remain unchanged.

### 27.4 Delete

Trash opens an explicit destructive confirmation. Text such as `Delete` is required in the confirmation because the action is destructive and icon-only meaning is insufficient.

Deletion semantics:

- remove from My Foods/new search/new use;
- preserve history and required reference/tombstone identity;
- do not corrupt existing historical snapshots;
- hard delete only where safely unreferenced unpublished/disposable data allows it.

## 28. Search and browse refinement

### 28.1 Explicit V1 facets

Primary explicit facets:

- one Category;
- one Cuisine;
- optional My Foods scope.

Browse by Category or Cuisine enters the **same search-results architecture** with a pre-applied removable filter, not a separate catalog system.

Example:

```text
Browse by Category → Protein
↓
Search Results
[ Protein × ]
```

### 28.2 Selection semantics

V1 uses:

- Category: single selection;
- Cuisine: single selection;
- My Foods: boolean scope.

This avoids ambiguous multi-select AND/OR semantics for taxonomy facets.

### 28.3 Ranking-only metadata

The following remain primarily ranking/search metadata rather than top-level V1 facet controls:

- Brand;
- Country relevance;
- Verification;
- Favorite/Recent/Frequency.

Favorites/Recent are personal views, not taxonomy filters.

### 28.4 Active filters

Active filters appear as removable chips under Search.

Removing the final active filter with no query returns to the default Food Library home state.

No-result state preserves the user's filters and suggests removal; Plaivra does not silently broaden user intent.

## 29. Numeric nutrition filters

V1 supports optional numeric filtering for:

- Calories;
- Protein;
- Carbohydrates;
- Fat.

The Nutrition section is progressive/collapsed by default rather than occupying primary filter space.

### 29.1 Operators

Supported user-friendly operators include:

- `≥`;
- `≤`;
- `Between`.

Exact equality is not a primary V1 operator because source rounding makes strict equality less useful for nutrition discovery.

### 29.2 Basis and effective values

Numeric nutrition filters compare the user's **effective normalized nutrition**:

- solids: per 100 g;
- liquids: per 100 ml.

For a canonical Food without a personal correction, this is canonical nutrition. When an active personal correction overrides relevant values, the user-specific effective values drive user-facing filtering.

The UI must make the comparison basis clear.

Do not compare arbitrary `per serving`, `per bottle`, `per slice`, and `per bowl` values as though they were directly equivalent.

A Food without the required nutrient or measurable normalized basis does not satisfy that numeric filter. Missing data is not treated as zero.

### 29.3 Multiple conditions

Multiple nutrition constraints combine with **AND** semantics.

Example:

```text
Protein ≥ 20 g / 100 g
AND
Fat ≤ 10 g / 100 g
AND
Calories ≤ 250 kcal / 100 g
```

## 30. Nutrition Discovery Presets and tags

V1 adds computed nutrition discovery presets on top of manual numeric filters.

Initial concepts include:

- High Protein;
- Low Carb / market-appropriate factual carb-threshold equivalent.

### 30.1 Preset combination

Multiple selected nutrition presets combine with **AND** semantics.

Example:

```text
High Protein
AND
Low Carb
```

Only Foods satisfying both applicable rules qualify.

### 30.2 Computed, not manually assigned

Do not store nutrition-discovery tags as manually maintained Food truth such as `is_high_protein = true` unless it is a rebuildable projection/cache derived from nutrition data and rule version.

Conceptually:

```text
Nutrition input
↓
Nutrition Qualification Rules
↓
Computed Discovery Match/Tags
```

Rule changes or nutrition changes recompute the derived classification.

### 30.3 Shared claim qualification versus personal filtering

Plaivra separates:

1. **shared canonical claim qualification** — calculated from canonical reviewed nutrition and applicable market rules;
2. **user-specific preset matching** — may use the user's effective nutrition so filter results remain consistent with the numbers that user sees.

A user-entered personal correction must never independently create a Plaivra-verified or regulated shared nutrition claim.

If a personal correction causes a Food to match a preset but the canonical shared Food does not independently qualify for the named public claim, the Food may still match the user's filter, but the Card should use a factual threshold/personal-values treatment rather than presenting an unsupported shared `High Protein`/other regulated claim.

### 30.4 Market-aware public wording

The underlying discovery rule and the public label are separate concerns.

Some nutrition wording may have regulated or market-specific meanings. Therefore:

- shared claim evaluation is market-aware where required;
- public wording is market-aware;
- release requires applicable nutrition-claim/legal review;
- an unsupported or unapproved public claim may fall back to a factual threshold label such as `≤ X g carbs / 100 g` while retaining useful filtering behavior.

Do not globally hard-code one marketing definition for all markets.

### 30.5 Card tag priority

Normal browsing may show up to two strongest/relevant computed tags.

During filtered search, tags corresponding to active nutrition presets receive presentation priority so the user can immediately understand why the Food matched.

Example where market wording is approved:

```text
[ HIGH PROTEIN ] [ LOW CARB ]
Chicken Breast ...
```

The Card still shows Calories/P/C/F beneath the identity, so labels are not a substitute for actual numbers.

## 31. Filter surface

Filter entry uses a familiar filter/sliders symbol rather than a large permanent `Filters` button when the icon is clear in context.

Active filter count may be shown on/near the control.

Conceptual surface:

```text
×                                  Filters

Category
...

Cuisine
...

My Foods
...

Nutrition
Quick presets
[ High Protein ] [ Low Carb* ]

Advanced
Calories    [≤] [value]
Protein     [≥] [value] g
Carbs       [≤] [value] g
Fat         [≤] [value] g

Reset                                  ✓
```

`*` Public label is market-aware as defined above.

`Reset` may remain text because an icon-only reset would be ambiguous.

Mobile uses a bottom sheet/appropriate native transient surface. Desktop may use a compact popover/panel when complexity fits.

## 32. Loading, empty, offline, and error states

Food Library uses **useful-first progressive loading**, not full-page blocking.

### 32.1 Initial load

Immediately render static/navigation structure and Search.

Use a small number of lightweight structural placeholders only for unresolved content.

Do not show a full-screen spinner merely because one projection is loading.

### 32.2 Search loading

When a new query is in flight, previously valid results may remain visible while a small updating indicator communicates refresh.

Avoid destructive flicker and blanking between keystrokes.

### 32.3 Search empty

When no useful match exists:

```text
No matching foods found.
Scan barcode
+ Create Food
```

Do not return unrelated fuzzy content to avoid an empty state.

### 32.4 Personal empty states

- Default page: empty Quick Access sections collapse when they are not useful.
- Explicit Favorites view: show a concise explanation of the heart action.
- Explicit My Foods view: show a concise empty message plus `+` Create Food affordance.

### 32.5 Offline

Do not download the full international catalog for offline search in V1.

Plaivra may expose safely cached/rebuildable recent personal content such as Recent, Favorites, My Foods, and recently viewed Foods.

When broad catalog search cannot be truthfully satisfied offline, state that search is unavailable rather than returning incomplete results as complete.

When connectivity returns, refresh quietly where safe.

### 32.6 External barcode failure

External barcode/provider failure is isolated from Food Library.

If local DB misses and external fallback fails:

```text
Product not found right now.
Retry
+ Create Food
```

The rest of Food Library remains usable.

### 32.7 Partial failure

Sections fail/retry locally where possible. One failed Browse or personalization projection must not blank the whole page.

### 32.8 Full failure

Full-page failure is reserved for the case where Plaivra canonical data cannot load and no usable cached content can be shown.

Raw Supabase/provider errors are never shown directly to the user.

### 32.9 Mutation failure

Do not claim success before persistence is confirmed.

- Favorite may update optimistically only if it rolls back visibly on failure.
- Create/Edit Food keeps entered data after persistence failure.
- commit control remains retryable;
- duplicate submits are prevented while a commit is unresolved.

## 33. Responsive behavior

Food Library preserves one semantic hierarchy across mobile, tablet, desktop, and native platforms. Density/presentation adapt; meaning does not.

### 33.1 Mobile

Semantic primary structure:

```text
Food Library                         +
Search / Scan
Quick Access
Food rows
Browse by Category
Browse by Cuisine
```

Platform renderers follow the native-shell rule from §21 rather than manually recreating this exact header geometry.

Food Cards/rows remain compact and decision-ready.

Macros remain in one row when legible and may wrap semantically at narrow widths instead of shrinking into unreadable text or causing horizontal overflow.

Search becomes sticky after its original position scrolls away where platform behavior supports this without creating stacked sticky clutter.

### 33.2 Tablet

- same hierarchy;
- increased density;
- Food results may use an adaptive two-column arrangement where readability remains strong;
- Browse grids may use more columns;
- touch-oriented transient actions may remain sheets.

### 33.3 Desktop

- bounded readable content width;
- approximately 2–3 Food columns where the design benefits, rather than e-commerce-style extreme density;
- filter/action popovers/dialogs where appropriate;
- Food Detail may appear as a reusable side panel/drawer in Food Library context while retaining a standalone route for direct navigation.

The same Food Detail content/semantics must be reusable across these presentations rather than implemented as independent product variants.

## 34. Barcode interaction availability

Barcode is a lookup method, not a mandatory UI control on every renderer.

- show/enable camera scanning only where the platform/runtime supports an appropriate scanner/camera flow;
- never leave a dead Scan control visible;
- barcode-like text entered into Search still routes to exact local barcode lookup where supported by the search contract;
- local canonical lookup always precedes external provider fallback.

## 35. RTL, localization, and bidirectional behavior

Arabic RTL is first-class.

Mirror directional presentation including:

- navigation flow;
- logical start/end alignment;
- back-chevron direction;
- drawer/panel direction;
- directional spacing/order where semantics require it.

Do not blindly mirror:

- plus/heart/shield meaning;
- nutrient meaning;
- numeric quantities;
- scientific unit semantics.

Nutrition units such as `g`, `mg`, `ml`, and `kcal` may remain familiar scientific abbreviations in Arabic UI.

Macro labels are localized by locale rather than forcing English `P/C/F` globally.

Examples:

- English: `P`, `C`, `F` or approved localized full labels;
- German: localized Protein/KH/Fett treatment;
- Arabic: localized Protein/Carbs/Fat labels.

Mixed Arabic/Latin branded names must use proper bidirectional containers rather than fragile concatenated strings.

Food name, brand, numeric nutrition, and units should be structured as separate semantic layout elements.

## 36. Food name and density behavior

Long Food/product names:

- may wrap to a maximum appropriate number of lines on compact cards;
- must not clip horizontally;
- must not push Favorite/Add actions into overlap;
- may truncate less-important brand metadata when required;
- retain full identity in Food Detail/accessibility text.

No required action may be hover-only.

Desktop hover may enhance feedback but may not reveal the only way to Favorite/Add/Inspect.

## 37. Keyboard and accessibility behavior

Accessibility is binding.

Required principles:

- icon-only actions have accessible names such as `Add food`, `Favorite food`, `Close`, `Save food`, `Edit food`, `Delete food`;
- effective touch targets follow platform conventions (Apple ~44 pt class, Android ~48 dp class; responsive web as appropriate);
- visible keyboard focus on web/desktop;
- logical tab order;
- color is not the only state signal;
- verification shield has an accessible label;
- loading/error changes are announced appropriately;
- Dynamic Type/large text grows rows rather than clipping essential nutrition;
- RTL and bidirectional text work without special-case content corruption;
- reduced motion/transparency/contrast platform settings remain usable.

Desktop Search may support `/` to focus Search when focus is not in an editable control. `Esc` may clear Search or dismiss the current transient surface according to context. Shortcuts must never intercept normal typing.

## 38. Performance and data-flow contract

### 38.1 No full-catalog startup

Normal page load must not fetch tens of thousands of Foods.

Search/browse/filter requests are:

- indexed;
- server-authoritative;
- bounded;
- deduplicated;
- cursor/page based;
- owner-scoped where personal data is involved.

### 38.2 Search request behavior

A bounded search request carries the normalized query and active supported filters.

The server/search authority applies:

- multilingual identity search;
- canonical redirect resolution;
- user-personal ranking;
- taxonomy filters;
- user-effective numeric nutrition filters;
- applicable computed discovery preset rules;
- stable pagination/cursor semantics.

### 38.3 Derived projections

Recent/Frequency/search projection/discovery-tag projections may be optimized for performance only when they remain rebuildable derivatives of canonical authorities.

They may not become parallel truth stores.

### 38.4 External provider isolation

No normal text-search request waits on an external provider.

Barcode fallback is a separately bounded path invoked only after canonical local lookup misses.

## 39. Security and ownership

User-owned data such as:

- Custom Foods;
- personal corrections;
- Favorites;
- personal search/personalization projections;

must remain owner-scoped under existing Plaivra authentication/RLS/security authority.

Shared canonical Food Catalog content is read-only to normal users.

Owner-only catalog curation mutations require server-side owner authorization and auditable mutation authority.

Do not expose service-role credentials to clients.

Do not allow a user-supplied owner ID to become authorization authority.

## 40. Existing implementation reconciliation

Existing implementation is evidence, not product truth.

Current nutrition code includes concepts such as:

- global `food_items`;
- `user_food_items`;
- `food_logs`;
- `user_food_favorites`;
- kitchen/subcategory browsing;
- saved/custom meal records;
- recipes;
- imported-food compatibility;
- local Egyptian fallback data;
- current `ILIKE`/client normalization search;
- browser-side food browsing/logging coupling.

Later implementation planning must map these verified existing authorities into this design without creating a parallel nutrition fact model.

Specific reconciliation requirements:

1. Existing user data must remain usable.
2. Existing Food/Meal/Recipe distinctions must be migrated/reconciled explicitly rather than hidden by one browser component.
3. Current ASCII-only normalization and simple `ILIKE` are insufficient for approved EN/DE/AR multilingual search and must not be treated as final architecture.
4. Current Kitchen-first browsing is transitional and does not override the approved Category/Cuisine faceted taxonomy.
5. Current browser-visible slicing is not acceptable as final large-catalog pagination.
6. The local Egyptian dataset may remain a bounded resilience/compatibility asset where appropriate but must not become the complete international catalog authority.
7. No legacy retirement is authorized without verified data coverage, migration strategy, rollback/forward-fix strategy, and Lead approval.

## 41. Design reconciliation decisions

### 41.1 Add To versus destination ownership

The Food Library `+` action is a reusable selection/handoff contract. It does not grant Food Library authority over Diary logging, Meal Plan planning, Recipe authoring, or Saved Meal authoring.

### 41.2 Symbol-first preference versus shared visual authority

Food Library uses familiar icon-only controls where meaning is conventional and context is clear, but does not turn every meaningful action into an unlabeled icon. Ambiguous, destructive, or uncommon actions retain text. This is a page-specific application of the shared Nutrition visual contract, not a replacement for it.

### 41.3 Raised nutrition tags versus badge-cluster prohibition

Nutrition Discovery Tags may have a compact raised/contained visual treatment, but they remain functional data labels capped at two per Card. They must not become decorative floating badges or a shadow-heavy card wall.

### 41.4 Numeric filters versus market-aware claims

Manual numeric filters use factual normalized effective nutrition thresholds. Discovery preset matching may be user-specific, while shared public claim wording remains canonical/market-aware and cannot be granted by user-entered data alone.

### 41.5 Catalog evolution versus historical truth

Canonical Food nutrition/servings may be corrected over time, but historical Diary and committed Meal Plan snapshots do not silently mutate.

### 41.6 User Custom Food versus canonical duplicate

The system may suggest an existing canonical identity, but user-owned Foods are not silently merged or replaced after creation.

### 41.7 Personal correction consistency

Food Card, Food Detail, numeric filtering, and future-use snapshot resolution all use the same user-effective nutrition view. Verification remains canonical. This prevents the UI from displaying one set of values while filtering or calculating on another.

### 41.8 Semantic page diagram versus native chrome

Food Library diagrams describe information hierarchy only. Native title/search/toolbar behavior from the shared Nutrition visual contract remains authoritative on supported platforms.

## 42. Out of scope for Food Library V1 design

Unless separately approved, this design does not add:

- external search engine/provider;
- separate runtime Food Catalog database;
- global social/popularity ranking from private user logs;
- multi-admin catalog workflow;
- full Food CMS;
- arbitrary micronutrient filters;
- unverified allergen/dietary exclusion filters;
- direct Shopping List insertion from Food Library;
- auto-merge of user Custom Foods;
- destructive catalog cleanup that breaks history;
- live AI translation on every search;
- live external provider dependency for normal text search;
- complete offline international catalog;
- public user-submitted shared-food publishing;
- exact visual styling for future My Recipes/Saved Meal destination workflows.

## 43. Acceptance criteria

### 43.1 Page responsibility

- Food Library contains Foods only as its canonical library entities.
- Recipes and Saved Meals do not appear as masquerading Food results.
- Diary/Meal Plan state is not owned by Food Library.

### 43.2 Default page

- Search is immediately available.
- Quick Access supports Recent, Favorites, My Foods.
- Browse supports Category and Cuisine.
- empty personal sections collapse appropriately.
- active Search replaces rather than stacks on top of the default discovery body.
- native renderers do not manually duplicate native navigation chrome.

### 43.3 Food Cards

Every normal Food Card shows, when data is known:

- Food name;
- calories + explicit basis/serving;
- Protein;
- Carbs;
- Fat.

Verified Food shows shield-check. Unverified Food shows no negative badge.

Heart and `+` are independent controls. Card body opens Food Detail.

An active personal correction changes the displayed effective nutrition without converting that correction into verified source data.

### 43.4 Nutrition tags

- no more than two Card tags;
- tags are computed/derived;
- selected preset tags are prioritized;
- public shared-claim wording follows canonical market-aware rule configuration;
- personal corrections cannot independently create a verified/regulatory shared claim;
- actual numeric macros remain visible.

### 43.5 Food Detail

- serving/quantity changes recalculate effective nutrition live;
- P/C/F remain above deeper nutrition;
- missing nutrients are not rendered as zero;
- canonical Food offers personal correction;
- active correction exposes a subtle `Using your values` state;
- user Food offers Edit/Delete;
- `+` hands off resolved serving/quantity.

### 43.6 Custom Food

- Create path can complete with Name + basis + Calories;
- P/C/F may remain unknown rather than forced to zero;
- duplicate suggestion is non-destructive;
- saved Food appears in My Foods and user search;
- edit failure preserves input;
- deleting Custom Food does not corrupt history.

### 43.7 Search

- EN/DE/AR names/aliases are searchable under the approved multilingual architecture;
- generic queries are not flooded with branded products;
- exact brand wording can prioritize branded results;
- barcode-like query uses barcode path;
- no full catalog download occurs;
- result pages are bounded/server-authoritative;
- canonical duplicates resolve without duplicate search-visible identities;
- searching within an explicit Quick Access view keeps that scope visible/removable.

### 43.8 Filters

- Category and Cuisine are single-select facets;
- My Foods can scope results;
- active filters are removable;
- numeric Calories/P/C/F filters use user-effective normalized per-100 g/per-100 ml values;
- missing required nutrient/basis excludes a Food from that nutrition-filter result;
- multiple numeric/preset constraints use AND semantics;
- no-result state preserves user intent.

### 43.9 Resilience

- external provider outage does not break normal Food Library;
- partial section failure does not blank the page;
- offline state never pretends cached data is the complete catalog;
- mutation success is not shown before persistence authority confirms it.

### 43.10 Responsive/RTL/accessibility

Acceptance must cover:

- compact phone width;
- tablet/regular width;
- desktop/fine pointer;
- Arabic RTL;
- mixed Arabic/Latin branded content;
- long Food names;
- large text/Dynamic Type equivalent;
- keyboard focus and operation;
- icon accessible names;
- no hover-only required actions.

## 44. Screenshot-based visual acceptance scenarios

Later implementation QA must capture and compare at minimum:

1. Mobile Food Library default state with Recent content.
2. Mobile new-user state with no personal content.
3. Mobile active Search results showing verified and unverified Foods.
4. Mobile Search with High Protein + carb-threshold/approved Low Carb preset active and two Card tags.
5. Mobile no-result Search with removable filters.
6. Mobile Food Detail with serving recalculation.
7. Mobile Food Detail with active personal correction and `Using your values` state.
8. Mobile Add To sheet.
9. Mobile Create Custom Food Fast Core.
10. Mobile duplicate suggestion during Create Food.
11. Mobile Custom Food Edit and destructive Delete confirmation.
12. Mobile offline/cached state.
13. Mobile external barcode fallback failure while library remains usable.
14. Tablet Food Library adaptive density.
15. Desktop Food Library with bounded 2–3 column result layout.
16. Desktop Food Detail contextual side panel and direct standalone route equivalence.
17. Arabic RTL Food Card with localized macro labels and mixed Latin brand case.
18. Long branded Food name without action overlap.
19. Large-text/accessibility layout without clipped macros.

Screenshots prove presentation only. Domain/data acceptance also requires functional tests and database/API verification in the later implementation plan.

## 45. Testing requirements for the future implementation plan

The future plan must include tests for at least:

- canonical identity/redirect resolution;
- duplicate classification boundaries;
- multilingual normalization/search;
- Arabic/Latin aliases;
- brand intent ranking;
- serving conversion math;
- missing-is-not-zero behavior;
- personal correction/effective-nutrition resolution;
- verification remaining canonical when personal corrections exist;
- Favorite merge survival;
- Recent/Frequency derivation semantics;
- normalized nutrient filtering using effective values;
- AND composition of filters/presets;
- canonical shared-claim versus personal preset-match behavior;
- market-aware discovery-tag rule versioning;
- Custom Food ownership/RLS;
- owner-only curation authorization;
- Food Detail live recalculation;
- historical snapshot immutability;
- external-provider isolation;
- bounded pagination/cursor behavior;
- partial failure envelopes;
- offline/cached truth labeling;
- mutation retry/input preservation;
- accessibility and RTL behavior.

## 46. Final product contract

Food Library V1 is a **search-first, identity-safe, internationally extensible Food system** built inside the Main Plaivra nutrition authority.

The user sees a simple surface:

```text
Search
→ understand Calories + P/C/F immediately
→ inspect when needed
→ Favorite or + Add
→ reuse everywhere
```

Underneath, Plaivra maintains stable Food identity, measurable serving semantics, multilingual search, provenance, verification, duplicate resolution, user-scoped corrections/custom Foods, bounded search/filter architecture, and non-destructive lifecycle behavior.

The governing summary is:

> **One Food identity, many ways to find it, one consistent effective nutrition view for current user actions, frozen snapshots for history, and no unnecessary friction on the surface.**
