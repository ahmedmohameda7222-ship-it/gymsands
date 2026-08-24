# Nutrition Food Library V1 Design

**Date:** 2026-08-25  
**Status:** Final reconciled Planner design, pending user written-spec review  
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

This document defines **Nutrition → Food Library V1** product responsibility, catalog architecture, food identity, serving and nutrition semantics, search/ranking, taxonomy, personalization, verification, duplicate handling, user-owned food behavior, ingestion/curation boundaries, page information architecture, Food Row and Food Detail behavior, Add To handoff, live filters, nutrition discovery labels, loading/offline/error behavior, localization/RTL, responsive behavior, accessibility, performance/security boundaries, and acceptance criteria.

It does not define the complete My Recipes page, Nutrition Summary, complete Saved Meal authoring UX, Diary logging-session UX, Meal Plan destination UX, Shopping List behavior, billing, future Pantry inventory, or a general multi-admin CMS.

No Nutrition implementation plan is authorized by this document. Implementation planning remains deferred until all five canonical Nutrition destinations complete design and Nutrition-wide reconciliation.

## 2. Product classification and intent

Food Library V1 is an **Architectural** redesign.

The current browser mixes global foods, custom foods, saved meals, favorites, logging, Meal Plan actions, kitchen/subcategory browsing, fallback data, and direct destination mutations. V1 establishes Food Library as the reusable **Food** domain and user destination, with explicit handoff boundaries to Diary, Meal Plan, Recipes, and Saved Meals.

The primary user question is:

> Can I quickly find the right food, understand its basic nutrition immediately, inspect it precisely when needed, and reuse it anywhere in Plaivra without duplicating or corrupting food identity?

Governing product principle:

> **Fast discovery on the surface. Strong food identity and nutrition authority underneath.**

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

- Food Library is an independent Nutrition destination.
- `My Foods` is a personal view inside Food Library, not a sixth Nutrition destination.
- Barcode Scan is an action/access method, not a destination.
- My Recipes owns Recipes.
- Meal/Saved Meal domain owns Saved Meals.
- Diary owns actual intake.
- Meal Plan owns intended intake.
- Unified add/search surfaces may federate Food, Recipe, Saved Meal, Recent, and Favorite results without collapsing domain ownership.

## 4. Core semantic model

### 4.1 Food

A Food is one reusable consumable identity, for example chicken breast, rice, banana, milk, or a branded yogurt. Food Library owns this semantic type.

### 4.2 Recipe

A Recipe describes how something is made and may contain ingredient Foods, quantities, yield/servings, preparation steps, and nutrition per serving. Recipe creation and management belong to My Recipes.

### 4.3 Saved Meal

A Saved Meal is a reusable combination eaten together and may contain Foods and/or Recipes.

```text
My Lunch
├── 200 g Rice [Food]
├── Grilled Chicken [Recipe]
├── Greek Yogurt [Food]
└── Salad [Recipe]
```

Food is not Recipe. Recipe is not Saved Meal. Saved Meal is not Food.

### 4.4 Inline Recipe creation boundary

Where a Meal authoring flow permits `Create Recipe inline`, saving that Recipe creates a normal independent My Recipes object immediately. The Meal draft references it. Cancelling the Meal does not delete the saved Recipe.

Food Library itself does not own inline Recipe authoring.

## 5. Catalog hosting and runtime authority

The canonical Food Catalog lives in the **same Plaivra Main Supabase project** as the Nutrition domain.

Do not create:

- a separate runtime Food Catalog Supabase project;
- a cross-service runtime dependency before useful Food Library content appears;
- a second nutrition fact store;
- a full international catalog bundled into the client.

The separate Activity Catalog remains inactive and non-authoritative unless a future Lead-approved authority change explicitly says otherwise.

External food APIs/datasets may support ingestion, enrichment, barcode fallback, or research/curation. They are not the normal runtime authority for canonical text search.

A normal Food Library page load must remain useful if all external food providers are unavailable.

### 5.1 Initial projection

Initial page loading should converge through one bounded page/bootstrap projection rather than browser read fan-out:

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

This is a read projection over canonical authorities, not a new fact store.

## 6. Canonical Food identity

Food identity is language-neutral. Names, translations, transliterations, aliases, cuisine relevance, and country relevance are metadata around a stable Food identity.

One identity may have:

- Chicken Breast;
- Hähnchenbrust;
- صدر دجاج;
- quality-reviewed Arabizi aliases.

Language or country difference alone does not create a new Food.

A distinct Food/Variant may be required when composition, preparation, cooking method, skin/bone state, fat level, physical form, formulation, brand/product identity, barcode/GTIN, ingredients, or nutrition is materially different.

Plaivra uses **Canonical Food Identity + Source Records**. External records retain original source identity and provenance and do not automatically become additional search-visible Foods.

## 7. International catalog strategy

### 7.1 Priority markets

Primary launch-depth markets:

- USA
- Germany
- UK
- Egypt
- Saudi Arabia
- UAE

Tier B:

- Canada
- Australia
- Austria
- Switzerland
- Netherlands
- Kuwait
- Qatar

Broad but shallower support may include France, Spain, Italy, Belgium, Sweden, Norway, Denmark, Finland, Bahrain, Oman, Ireland, and New Zealand.

Initial first-class search/localization languages:

- English
- German
- Arabic

GCC priority is Saudi Arabia → UAE → Kuwait → Qatar → Bahrain → Oman.

### 7.2 Coverage contract

V1 catalog success is governed by **coverage and quality gates**, not an arbitrary total-record count.

International Core should cover staple carbs, meats/poultry/fish, eggs, dairy/alternatives, fruits, vegetables, legumes, oils/fats, nuts/seeds, drinks, common snacks, and everyday prepared foods.

Priority-country packs should cover common local foods and daily-use traditional items. Success means an ordinary priority-market user can log most everyday foods without repeatedly creating Custom Foods.

## 8. Data acquisition, provenance, and licensing

### 8.1 Generic/traditional foods

Generic/traditional foods may be curated from authoritative or explicitly approved composition sources. ChatGPT may assist research/curation but is never nutrient authority by itself.

Every curated source record retains, where applicable:

- provider/source;
- source record ID;
- source reference/version;
- license/provenance;
- retrieved-at time;
- source nutrition/serving evidence;
- confidence/review metadata.

### 8.2 Branded/barcode foods

Barcode/GTIN is an identity signal, not complete nutrition authority. Branded nutrition should prefer manufacturer/label evidence where available.

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

External fallback does not silently promote into the shared canonical catalog or become Verified.

### 8.3 Preferred source boundaries

- USDA FoodData Central is preferred where its public-domain/CC0-style terms fit the intended use.
- Open Food Facts may serve attributed fallback/enrichment only behind a license-compliant boundary; it is not blindly merged into the proprietary canonical catalog.
- GS1 may support product identity/verification but is not nutrition authority.
- National food databases require license compatibility review before production use.

Commercial release requires source-specific legal/Terms review. This design does not claim zero legal risk.

## 9. Serving and measurement model

### 9.1 Canonical basis

Every reusable Food should have a measurable canonical nutrition basis where evidence supports one:

- solids: normally per 100 g;
- liquids: normally per 100 ml.

Do not infer `100 ml = 100 g` without food-specific density evidence.

### 9.2 Serving definitions

Human servings are Food-specific definitions that resolve to a measurable amount when known.

Examples:

- `1 slice = 32 g`
- `1 bar = 50 g`
- `1 bottle = 330 ml`
- `1 oz = 28.35 g`

`piece`, `slice`, `bowl`, `plate`, and `cup` are not universal nutrient units. Their conversions must not be guessed.

### 9.3 Historical snapshots

Diary logs and committed Meal Plan occurrences store frozen resolved serving/nutrition data so later catalog changes do not silently mutate history.

> **The database calculates from measurable amounts; the user interacts with natural servings.**

## 10. Nutrition data model

Core canonical nutrition supports:

- energy/kcal;
- protein;
- carbohydrates;
- fat;
- saturated fat;
- fiber;
- sugars;
- sodium.

Extensible facts may include potassium, calcium, iron, magnesium, zinc, vitamin D, vitamin B12, cholesterol, added sugar, trans fat, and other supported nutrients.

Most reusable Foods should at minimum have energy + P/C/F when reliable evidence exists.

**Missing is not zero.** This rule applies to Food Rows, Food Detail, filters, discovery presets/tags, summaries, custom-food input, and imported provider data.

## 11. Source trust and verification

Internal classes may include Verified/Curated, Manufacturer/Label, Government/Authoritative Dataset, Imported Provider, User Created, Personal Override, and Estimated.

Normal Food Rows do not show source names, confidence wording, trust levels, or negative `Unverified` badges.

The user-facing verification indicator is positive-only:

- Web: Lucide `shield-check`;
- iOS/iPadOS: platform-native shield/check equivalent;
- Android: platform-native shield/check equivalent;
- accessible label: `Plaivra Verified`.

Absence of the shield is neutral.

Verification requires, as applicable, identity clarity, duplicate resolution, known nutrition basis, coherent core nutrition, reliable claimed servings, provenance/license, localized identity quality, branded/barcode evidence, and no unresolved material source contradiction.

Users cannot self-verify. Verification is independent of lifecycle and can be revoked.

## 12. Duplicate and merge architecture

Duplicate evaluation produces:

```text
MATCHED
POSSIBLE_DUPLICATE
DISTINCT
```

Matching considers preparation, form, brand/barcode, nutrition compatibility, and other semantic evidence. Language similarity alone is never enough.

No destructive AI auto-merge is permitted.

When proven shared duplicates merge:

- one survivor remains canonical;
- the duplicate gets a durable redirect such as `merged_into`;
- future references resolve the survivor;
- Favorites survive redirect resolution;
- provenance and lineage are preserved;
- historical snapshots remain unchanged;
- remediation remains auditable.

User-created Foods are never silently merged into shared catalog Foods.

## 13. Lifecycle and revisioning

Lifecycle:

```text
DRAFT → ACTIVE → DEPRECATED/WITHDRAWN
              ↘ MERGED → canonical replacement
```

Verification state is separate:

```text
UNVERIFIED / VERIFIED
```

Minor factual correction/source refresh remains the same stable Food identity with lightweight audit/revision history. A materially distinct preparation/formulation may require a new Food Variant or branded formulation identity.

History never silently mutates.

## 14. Personal correction versus Custom Food

### 14.1 Personal Correction

A Personal Correction changes one user's calculation/view of an existing canonical Food without changing global identity.

```text
Canonical: 165 kcal / 100 g
User correction: 150 kcal / 100 g
```

It is user-scoped, reversible, applies consistently to that user's future Food Library/Diary/Meal Plan/Recipe/Saved Meal use, and does not certify user-entered values.

### 14.2 Effective nutrition

```text
Effective nutrition for user
= active personal correction where supplied
+ canonical values for nutrients/basis not overridden
```

Food Row, Food Detail, numeric filtering, and future-use snapshot resolution use the same effective nutrition view. Verification remains canonical.

Food Detail exposes a subtle `Using your values` state while a correction is active.

### 14.3 Custom Food

A Custom Food is a genuinely distinct/unavailable user-owned Food. It is private to the user, appears in My Foods, is searchable/reusable for that user, and is not automatically shared or Verified.

Strong create-time duplicate match offers:

- Use Existing
- Correct for Me
- Create Separately

Never silently block or merge.

## 15. Favorites, Recent, and Frequency

- Favorite is explicit user intent only and survives canonical redirects.
- Recent is derived from authoritative actual `food_logs` or successor authority.
- Frequency is derived from actual logs with recency/time decay.
- Meal-context frequency may lightly boost ranking.
- No global popularity mining from private logs in V1.

Derived optimization projections must remain rebuildable and non-authoritative.

## 16. Search architecture

V1 uses a **Supabase/Postgres-native indexed multilingual search projection in Main DB**. No external search provider is introduced in V1.

Searchable identity fields may include canonical names, localized names, aliases, curated transliterations/Arabizi aliases, brands, barcodes, and user-owned Foods where appropriate.

English, German, and Arabic are first-class V1 search locales. Arabic normalization must preserve Arabic meaning; German alternate spellings remain searchable. Do not rely on live AI translation for every query.

Ranking hierarchy:

1. exact canonical/localized name;
2. exact alias;
3. prefix;
4. fuzzy/typo candidate;
5. personal relevance among relevant candidates;
6. quality/locale/catalog relevance;
7. contextual brand intent.

Verification is a mild quality signal, never strong enough to override exact intent. Locale is a boost, not a hard filter.

Generic/local foods dominate broad generic queries. Explicit brand/product wording boosts branded products. Barcode-like input routes to exact local barcode lookup before provider fallback.

Results are bounded, deduplicated, server-authoritative, approximately 20 useful first-page results with cursor/page continuation. Do not fetch the whole catalog or fake pagination by client slicing.

## 17. Taxonomy and browse model

Orthogonal facets:

- one Primary Category;
- optional Subcategory;
- zero or more Cuisine/Cultural relevance values;
- zero or more Country relevance values;
- Brand/Product Family metadata;
- discovery/search tags;
- separate personal signals.

V1 Primary Categories:

- Protein
- Dairy & Alternatives
- Grains & Starches
- Bread & Bakery
- Fruit
- Vegetables
- Legumes
- Nuts & Seeds
- Fats & Oils
- Drinks
- Snacks
- Desserts & Sweets
- Sauces & Condiments
- Prepared Dishes

Cuisine is not the same as country relevance.

Browse top level is Categories + Cuisines. Brands remain primarily search-driven. Countries, providers, kitchens, Favorites, Recent, and Frequency are not top-level taxonomy facets.

Priority-market cuisine examples may include Egyptian, German, Gulf, American, British, and Mediterranean, with locale-aware ordering. `Asian` is not a prominent default V1 shortcut.

## 18. Internal owner-only catalog curation

Plaivra V1 has one owner-controlled internal `/admin/food-catalog` console. No V1 multi-admin hierarchy or general-purpose CMS.

Owner may review incoming candidates, edit/normalize canonical Foods, publish, verify/unverify, merge, deprecate, restore, and inspect provenance.

Publish is not Verify.

Bulk ingestion pipeline:

```text
External source
→ Raw Source Record
→ Normalize
→ Identity/Duplicate check
→ Nutrition/Serving validation
→ License/Provenance validation
→ Verification Gate
→ Canonical Food
→ Publish Search
```

Routine safe records may auto-clear validation. Exceptions are manually reviewed. Sensitive actions are auditable.

## 19. Food Library responsibility and top-level IA

Food Library owns Food discovery, Food search, Food inspection, Favorite state, My Foods management, Category/Cuisine browse entry, and reusable Food handoff.

It does not own Recipe authoring, Saved Meal authoring, Diary ledger state, or Meal Plan state.

```text
Food Library
↓
Search
↓
Quick Access
├── Recent
├── Favorites
└── My Foods
↓
Browse
├── Categories
└── Cuisines
```

Search is first. Personal access is second. Browse is third.

## 20. Default page and native shell

Semantic default:

```text
Food Library                                 +
Search foods, brands, barcode…        [Scan]

Quick Access
[ Recent ] [ Favorites ] [ My Foods ]

<small bounded set of Foods>

Browse by Category
...

Browse by Cuisine
...
```

No marketing hero, giant welcome copy, embedded nutrition dashboard, or second Nutrition tab strip.

Recent is default when useful personal data exists. Empty personal sections collapse. If all Quick Access projections are empty, Browse moves up naturally.

Active text search replaces the discovery body. Clearing the query restores the prior default/Quick Access state.

Search within an explicit Recent/Favorites/My Foods view remains scoped and shows a removable scope token.

Native/platform shell rules:

- iPhone/iPad use shared native Nutrition title/toolbar/search behavior;
- page-level `+` Create Food belongs in native toolbar/action placement where applicable;
- web/desktop uses established Plaivra shell rather than imitating SwiftUI chrome;
- ordinary content does not use Liquid Glass.

## 21. Global symbol convention

Stable semantics:

- `×` = close/dismiss; in transactional editors it means cancel/discard uncommitted edits;
- `✓` = confirm/save/finish where a commit exists;
- `+` = add/insert/attach;
- `♡ / ♥` = Favorite;
- pencil = Edit;
- trash = Delete/destructive intent;
- scan symbol = Barcode Scan;
- back chevron = navigation back only;
- retry/refresh symbol = Retry where context is clear.

A live surface with no uncommitted draft must not label `×` as Cancel. In the live Filter surface, `×` means **Close Filters** and preserves the current already-applied state.

Icon-only controls require platform-appropriate accessible names and effective touch/pointer targets.

## 22. Food Row contract

Food Library uses flat index/list rows with separators, not ecommerce cards.

Canonical hierarchy:

```text
[optional nutrition tag] [optional second tag]

Chicken Breast [shield-check]               ♡   +
165 kcal / 100 g
P 31 g      C 0 g      F 3.6 g
```

A branded row may add a secondary brand line. A user-owned Food may show a subtle `My Food` marker.

Every normal row shows, when known:

- Food name;
- optional Brand;
- positive Verified shield where applicable;
- Favorite heart;
- Add `+`;
- calories + explicit serving/basis;
- Protein, Carbs, Fat with explicit units at every viewport size.

Never collapse production macros to unitless shorthand such as `P31 C0 F3.6`.

Interactions:

- row body → Food Detail;
- heart → Favorite only;
- `+` → Add To only.

No source/trust/confidence/category/cuisine/micronutrient clutter on normal rows.

Nutrition discovery labels are capped at two per row. They are computed functional labels with restrained micro-depth, not a badge wall.

## 23. Food Detail contract

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
Other Servings
↓
Personal correction or user-owned management
```

Food Detail allows reliable serving selection and quantity adjustment. Nutrition recalculates live using the user's effective nutrition view without mutating canonical Food data.

Known deeper nutrients are progressively disclosed. Missing values are omitted or shown as `Not available`, never inferred zero.

Canonical Food offers `Correct for me`; user-owned Food offers Edit/Delete.

Mobile uses full-screen/detail navigation. Wide layouts may use a reusable contextual side/detail panel approximately 420–480 px while retaining route-equivalent content.

## 24. Add To handoff

The canonical reusable Food action is `+`.

### 24.1 Standalone Food Library row

When `+` is invoked from a Food Row in standalone Food Library, the Add To surface resolves serving and quantity **before destination handoff**:

```text
Chicken Breast

Serving
[ 100 g ▾ ]

Quantity
[ − ] 1 [ + ]

Add to
Diary
Meal Plan
Saved Meal
Recipe
```

The chosen destination receives:

```text
resolved Food identity
+ resolved serving
+ resolved quantity
```

On iPhone this is a proper sheet/list presentation, not a `confirmationDialog`/traditional action sheet. Wide contexts may use a compact anchored popover.

### 24.2 Food Detail `+`

Food Detail already owns current serving/quantity state. Pressing `+` reuses those values and does not ask for them again before destination selection.

### 24.3 Known destination context

When Food Library/Food Detail is entered from an already-known destination context, `+` bypasses unnecessary destination selection and hands the resolved Food/serving/quantity back to that destination.

Food Library owns only selection, canonical identity resolution, serving/quantity, and handoff. Destination domains own their own commit semantics.

Not Add To destinations:

- Favorites;
- Shopping List;
- Custom Food.

## 25. Create Custom Food

Create uses **Fast Core + Optional Details**.

```text
×         Create Food         ✓

Name
Nutrition is for [basis]
Calories
Protein   Carbs   Fat
+ More nutrition details
+ Add another serving
```

Normal creation requires Name + explicit nutrition basis + Calories. P/C/F are strongly encouraged but may remain unknown; missing is not zero.

Basis may be 100 g, 100 ml, 1 serving, 1 piece, or a custom amount. Do not invent gram/ml conversions.

Category/Cuisine are not required first-screen blockers.

A saved Custom Food appears in My Foods and is reusable across Plaivra for that user. It does not receive the shared Verified shield.

## 26. Edit/Delete Custom Food

Edit uses `×` to cancel uncommitted edits and `✓` to save. Trash opens an explicit destructive text confirmation.

If a material edit affects reusable Recipes/Saved Meals referencing the Food, warn that future reuse resolves updated values while historical frozen Diary/Meal Plan snapshots remain unchanged.

Delete removes future discovery/new use while preserving history/reference identity as required. Hard delete is reserved for safely unreferenced unpublished/disposable data.

## 27. Search and browse refinement

Primary explicit facets:

- Category: single-select;
- Cuisine: single-select;
- My Foods: boolean scope.

Browse by Category/Cuisine enters the same result architecture with a pre-applied removable chip.

Ranking/search metadata rather than top-level filters:

- Brand;
- Country relevance;
- Verification;
- Favorite/Recent/Frequency.

Active filters appear as removable chips under Search. Removing the final active filter with no query returns to default Food Library. No-result state preserves user intent and never silently broadens it.

## 28. Numeric nutrition filters

V1 supports optional numeric conditions for:

- Calories;
- Protein;
- Carbohydrates;
- Fat.

Operators:

- `≥`
- `≤`
- `Between`

Exact equality is not a primary V1 operator because source rounding makes it less useful.

Numeric filtering compares the user's effective normalized nutrition:

- foods/solids: per 100 g;
- drinks/liquids: per 100 ml.

Protein, Carbohydrates, and Fat values themselves remain measured in grams; Calories remain kcal. The 100 g/100 ml value is the comparison basis, not the nutrient unit.

A Food without the required nutrient or measurable normalized basis does not qualify. Multiple numeric conditions combine with AND semantics.

## 29. Nutrition Discovery Presets and labels

Initial presets include:

- High Protein;
- Low Carb or market-appropriate factual carb-threshold equivalent.

Multiple selected presets combine with **AND** semantics.

Discovery qualification is computed from nutrition + versioned rules, not manually stored as permanent booleans unless a rebuildable projection/cache is used.

Plaivra separates:

1. shared canonical claim qualification;
2. user-specific preset matching using effective nutrition.

A personal correction may cause a Food to match a user's filter but may not independently create a Plaivra-verified/regulatory shared claim. When public claim wording is not approved, use a factual threshold label such as `≤ X g carbs / 100 g` according to market rules.

Maximum visible labels per Food Row: **2**.

When High Protein + Low Carb are both active, qualifying results must prioritize those two active characteristics in the two available label positions. Active filter labels take precedence over unrelated computed labels.

## 30. Live Filter surface

Filters are **live**. There is no Apply, Done, confirmation checkmark, or staged draft state.

Conceptual mobile surface:

```text
×              Filters

Category
[ Any ▾ ]

Cuisine
[ Any ▾ ]

My Foods        [toggle]

Nutrition                              ⓘ
Quick filters
[ High Protein ] [ Low Carb ]

Advanced
Calories   [operator] [value]
Protein    [operator] [value] g
Carbs      [operator] [value] g
Fat        [operator] [value] g

Reset filters
```

Behavior:

- every Category/Cuisine/My Foods/preset/numeric change updates results immediately;
- closing/dismissing the Filter surface preserves current already-applied filters;
- `×` accessible meaning is `Close Filters`, never Cancel/revert;
- `Reset filters` clears all filters immediately;
- numeric typing may use a short debounce before issuing the refreshed server query;
- active chips under Search update with live state;
- mobile uses a sheet/appropriate transient surface;
- desktop uses a compact popover/panel when suitable.

## 31. Nutrition filter Info control

The normalized comparison explanation is not permanently displayed because it would add recurring vertical noise.

Place a contextual Info control at the trailing side of the **Nutrition / Advanced Nutrition** section header, not in the global Filter header.

Rendering:

- Web: Lucide `info`;
- iOS/iPadOS: platform-native Info equivalent;
- Android: platform-native Info equivalent;
- accessible label: `About nutrition filter values`.

Content:

**Nutrition filter basis**  
`Values normalized per 100 g (foods) or 100 ml (drinks).`

Interaction:

- touch: tap opens a small anchored explanatory help surface;
- mouse hover may expose the same explanation as a tooltip;
- desktop click opens/pins the help surface for comfortable reading;
- keyboard focus + Enter/Space opens it;
- hover is convenience only and is never the sole access path.

This is explanatory metadata, not a warning, error, or primary action.

## 32. Loading, empty, offline, and errors

Food Library uses **useful-first progressive loading**.

- Render navigation/search immediately.
- Use lightweight local skeletons only for unresolved regions.
- Do not blank useful results between search requests; show subtle updating state.
- No-result state keeps active chips visible and offers Scan/Create Food.
- Empty personal projections collapse on default view.
- Explicit Favorites/My Foods views get concise local empty states.
- Offline never pretends cached data is the complete international catalog.
- Cached Recent/Favorites/My Foods/recently viewed Foods may remain available where truthful.
- External barcode failure is isolated and offers Retry/Create Food.
- Partial section failure gets local Retry and does not blank the page.
- Favorite may update optimistically only with visible rollback on persistence failure.
- Create/Edit keeps entered data on failure and prevents duplicate unresolved submits.

## 33. Responsive behavior

Food Library preserves one semantic hierarchy across mobile, tablet, desktop, RTL, and native platforms.

### Mobile

- compact flat rows;
- approximately 16 pt content inset;
- standard row baseline roughly 88–96 pt, tagged row roughly 112–120 pt where content fits;
- bottom sheets for compact transient flows;
- Search may become sticky after scrolling when platform behavior supports it without stacked sticky clutter;
- actions retain roughly platform-standard effective touch targets.

### Tablet

- same hierarchy with more density;
- adaptive one/two-column Food result layout where readable;
- touch-oriented transient actions may remain sheets.

### Desktop/regular width

- bounded useful content width approximately 1040–1180 px;
- **one or two Food result columns only by default**;
- a third result column is rejected by default to avoid ecommerce/catalog drift and squeezed row content;
- wide filters/Add To may use compact popovers;
- Food Detail may use the reusable 420–480 px contextual panel.

Fall back to one column before squeezing actions, names, macro units, or Dynamic Type equivalents.

## 34. Barcode availability

Barcode is a lookup method, not a mandatory control on every renderer.

- show Scan only where platform/runtime camera scanning is supported;
- never leave a dead Scan control;
- barcode-like typed input routes to exact local barcode lookup;
- Main DB lookup always precedes external fallback.

## 35. RTL and localization

Arabic RTL is first-class.

Mirror directional flow, logical start/end alignment, back direction, panel direction, and directional spacing where semantics require it.

Do not blindly mirror plus/heart/shield meaning, nutrient meaning, numeric quantities, or scientific units.

`g`, `mg`, `ml`, and `kcal` may remain familiar scientific abbreviations. Macro labels localize; Arabic is not forced to use English P/C/F.

Mixed Arabic/Latin branded names use proper bidi containers. Name, brand, numeric value, and unit should remain structurally distinct.

Cuisine ordering is locale-aware.

## 36. Long content, Dynamic Type, and accessibility

Long Food names grow rows rather than collide with Favorite/Add. Less-important brand metadata may truncate where necessary; full identity remains available in Food Detail/accessibility text.

At large text sizes, layout recomposes vertically rather than clipping essential nutrition. Macro units remain explicit.

Accessibility requirements:

- icon-only controls have accessible names;
- visible web/desktop focus;
- logical tab order;
- color is not the sole state signal;
- Verification shield has an accessible label;
- loading/error changes are announced appropriately;
- reduced motion/transparency/contrast remain usable;
- no required action or explanation is hover-only.

Desktop `/` may focus Search where safe. `Esc` clears/dismisses according to context and must not intercept normal typing.

## 37. Visual register and motion

Food Library is the flattest, most index-like Nutrition destination.

Use:

- flat rows + separators;
- native search and functional chrome;
- quiet Category/Cuisine text links;
- compact Quick Access segmented/scope-like control;
- restrained micro-raised nutrition labels;
- native press/favorite/sheet/popover transitions.

Do not use:

- ecommerce card wall;
- food-row shadows;
- ordinary-content Liquid Glass;
- decorative gradients/glows;
- nested cards;
- taxonomy icon-tile wall;
- card lift/hover zoom;
- bouncing tags or staggered decorative entrances.

## 38. Performance and data-flow contract

Normal page load must not fetch tens of thousands of Foods.

Search/browse/filter requests are indexed, server-authoritative, bounded, deduplicated, cursor/page-based, and user-scoped where personal data is involved.

A bounded request carries normalized query + active supported filters. Server authority applies multilingual search, canonical redirect resolution, personalization, taxonomy facets, user-effective numeric filters, applicable discovery preset rules, and stable pagination.

Recent/Frequency/search/discovery projections may be optimized only as rebuildable derivatives of canonical truth.

No normal text-search request waits on an external provider. Barcode fallback is a separately bounded path after local miss.

## 39. Security and ownership

User-owned data including Custom Foods, personal corrections, Favorites, and personal projections remains owner-scoped under existing Plaivra authentication/RLS/security authority.

Shared canonical catalog content is read-only to normal users.

Owner-only curation mutations require server-side owner authorization and audit. Do not expose service-role credentials or trust user-supplied owner IDs.

## 40. Existing implementation reconciliation

Existing code is evidence, not product truth.

Later implementation planning must explicitly reconcile current global foods, user foods, logs, favorites, recipes, saved/custom meals, kitchen/subcategory browsing, local Egyptian fallback data, imported-food compatibility, current `ILIKE`/ASCII normalization, and browser-side slicing/logging coupling.

Requirements:

1. Existing user data remains usable.
2. Food/Recipe/Saved Meal distinctions are explicit.
3. ASCII-only normalization/simple `ILIKE` are not final EN/DE/AR search architecture.
4. Kitchen-first browsing does not override Category/Cuisine taxonomy.
5. Browser-side slicing is not final pagination.
6. Local Egyptian fallback may remain bounded resilience/compatibility data, not international catalog authority.
7. No legacy retirement without verified coverage, migration strategy, rollback/forward-fix strategy, and Lead approval.

## 41. Reconciliation decisions

- Add To is a reusable Food selection/handoff contract, not destination-domain authority.
- Familiar icon-only controls are preferred only where semantics remain clear and accessible.
- Nutrition discovery labels may have micro-depth but remain capped at two and never become badge clutter.
- Numeric filters use factual effective normalized values; public claims remain canonical/market-aware.
- Catalog corrections do not mutate historical frozen snapshots.
- User Custom Foods are not silently replaced by canonical matches.
- Food Row, Food Detail, filters, and future-use snapshots share one user-effective nutrition view.
- Semantic diagrams do not override native shell behavior.
- Live Filters have no commit step; Close never reverts already-applied filters.
- Desktop result layout is one/two columns by default; third-column catalog density is rejected.

## 42. Out of scope for Food Library V1

Unless separately approved, V1 does not add:

- external search engine/provider;
- separate runtime Food Catalog database;
- global social/popularity ranking from private logs;
- multi-admin catalog workflow;
- arbitrary micronutrient filters;
- unverified dietary/allergen exclusion filters;
- direct Shopping List insertion from Food Library;
- auto-merge of user Custom Foods;
- destructive cleanup that breaks history;
- live AI translation on every search;
- live external provider dependency for normal text search;
- complete offline international catalog;
- public user-submitted shared-food publishing;
- implementation of complete destination workflows owned by My Recipes/Saved Meals/Diary/Meal Plan.

## 43. Acceptance criteria

### 43.1 Page responsibility

- Food Library contains Foods only as canonical library entities.
- Recipes and Saved Meals do not masquerade as Food results.
- Diary/Meal Plan state is not owned by Food Library.

### 43.2 Default/Search

- Search is immediately available.
- Quick Access supports Recent, Favorites, My Foods.
- Browse supports Category and Cuisine.
- empty personal sections collapse appropriately.
- active Search replaces the default discovery body.
- scoped personal search keeps scope visible/removable.

### 43.3 Food Rows

Every normal row shows, when known: Food name, calories + explicit serving/basis, Protein, Carbs, Fat with explicit units. Verified Food shows the positive shield; absence is neutral. Heart and `+` are independent. Row body opens Food Detail.

### 43.4 Nutrition labels

- maximum two labels;
- computed/derived;
- active preset labels receive priority;
- shared public claim wording follows market-aware rules;
- personal corrections cannot independently create a regulated/shared verified claim;
- numeric macros remain visible.

### 43.5 Food Detail and Add To

- serving/quantity recalculates live;
- P/C/F remain prominent;
- missing nutrients are not zero;
- canonical Food offers correction;
- active correction exposes `Using your values`;
- user Food offers Edit/Delete;
- standalone Food Row `+` resolves Serving + Quantity before destination selection;
- Food Detail `+` reuses the current selected Serving + Quantity;
- known destination context bypasses unnecessary destination selection;
- destination receives resolved Food + serving + quantity.

### 43.6 Custom Food

- creation can complete with Name + basis + Calories;
- P/C/F may remain unknown;
- duplicate suggestion is non-destructive;
- saved Food appears in My Foods/user search;
- edit failure preserves input;
- delete does not corrupt history.

### 43.7 Search architecture

- EN/DE/AR names/aliases are searchable;
- broad generic queries are not flooded with branded products;
- explicit brand intent can prioritize products;
- barcode-like query follows barcode path;
- no full catalog download;
- results are bounded/server-authoritative;
- canonical duplicates do not appear as duplicate visible identities.

### 43.8 Live Filters

- Category/Cuisine are single-select;
- My Foods can scope results;
- active chips are removable;
- all supported filter changes apply live;
- there is no Apply/Done/confirmation control;
- `×` means Close Filters and preserves live state;
- Reset clears immediately;
- numeric typing may debounce briefly;
- Calories/P/C/F compare user-effective normalized per-100 g/per-100 ml values;
- missing required nutrient/basis excludes a Food;
- multiple numeric/preset conditions use AND semantics;
- no-result state preserves user intent.

### 43.9 Nutrition Info

- Info control is contextual to Nutrition/Advanced Nutrition, not global Filters;
- Web uses Lucide `info`; native platforms use semantic native equivalent;
- accessible label is `About nutrition filter values`;
- tap/click/keyboard exposes `Values normalized per 100 g (foods) or 100 ml (drinks).`;
- hover may enhance but is never required.

### 43.10 Resilience

- external provider outage does not break normal Food Library;
- partial failure does not blank the page;
- offline never pretends cached data is the complete catalog;
- mutation success is not shown before persistence authority confirms it.

### 43.11 Responsive/RTL/accessibility

Acceptance covers compact phone, tablet/regular width, desktop/fine pointer, Arabic RTL, mixed Arabic/Latin brand content, long names, Dynamic Type/large text, keyboard operation, icon accessible names, and no hover-only required behavior.

Desktop normal results use one/two columns only by default.

## 44. Screenshot-based visual acceptance scenarios

Later implementation QA must capture at minimum:

1. Mobile default Food Library with Recent content.
2. Mobile new-user state with no personal content.
3. Mobile active Search showing verified/unverified Foods.
4. Mobile Search with High Protein + approved carb label active and both row labels visible.
5. Mobile no-result Search with removable filters.
6. Mobile live Filter sheet with no Apply/Done/✓.
7. Mobile Nutrition Info popover.
8. Mobile Food Detail with serving recalculation.
9. Mobile Food Detail with active personal correction.
10. Mobile standalone Add To showing Serving + Quantity + destinations.
11. Mobile Create Custom Food Fast Core.
12. Mobile duplicate suggestion.
13. Mobile Custom Food Edit/Delete confirmation.
14. Mobile offline/cached state.
15. Mobile barcode fallback failure while library remains usable.
16. Tablet adaptive one/two-column density.
17. Desktop Food Library with bounded one/two-column result layout.
18. Desktop contextual Food Detail panel and route-equivalent detail.
19. Desktop Nutrition Info hover enhancement and click-pinned help.
20. Arabic RTL Food Row with localized macro labels and mixed Latin brand case.
21. Long branded Food name without action overlap.
22. Large-text/accessibility layout without clipped macros.

Screenshots prove presentation only. Domain/data acceptance also requires functional and database/API verification in the future implementation plan.

## 45. Future implementation testing requirements

The future plan must include tests for at least:

- canonical identity/redirect resolution;
- duplicate classification boundaries;
- multilingual normalization/search;
- Arabic/Latin aliases;
- brand-intent ranking;
- serving conversion math;
- missing-is-not-zero;
- personal correction/effective-nutrition resolution;
- verification remaining canonical under personal correction;
- Favorite merge survival;
- Recent/Frequency derivation;
- normalized nutrient filters using effective values;
- live filter state and immediate Reset;
- numeric-input debounce without staged commit;
- AND composition of filters/presets;
- canonical shared-claim versus personal preset matching;
- market-aware label rule versioning;
- Nutrition Info touch/click/keyboard accessibility;
- Add To resolved serving/quantity handoff;
- Custom Food ownership/RLS;
- owner-only curation authorization;
- Food Detail live recalculation;
- historical snapshot immutability;
- external-provider isolation;
- bounded pagination/cursor behavior;
- partial failure envelopes;
- offline/cached truth labeling;
- mutation retry/input preservation;
- responsive one/two-column behavior;
- RTL/accessibility behavior.

## 46. Final product contract

Food Library V1 is a **search-first, identity-safe, internationally extensible Food system** inside Plaivra Main Nutrition authority.

The user-facing model is simple:

```text
Search
→ understand Calories + P/C/F immediately
→ inspect when needed
→ Favorite or + Add
→ reuse everywhere
```

Underneath, Plaivra maintains stable Food identity, measurable serving semantics, multilingual search, provenance, verification, duplicate resolution, user-scoped corrections/custom Foods, bounded live search/filter architecture, historical snapshots, and non-destructive lifecycle behavior.

> **One Food identity, many ways to find it, one consistent effective nutrition view for current user actions, frozen snapshots for history, and no unnecessary friction on the surface.**
