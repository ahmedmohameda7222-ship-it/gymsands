# Plaivra Food Catalog Data Population & Launch Readiness Authority — V2

**Status:** Planner-approved long-term architecture
**Approved:** 2026-08-30
**Supersedes:** the earlier Population & Launch Readiness draft supplied before this review
**Implementation authority:** Separate Batch 0 implementation plan
**Production mutation authority:** Separate explicit Planner/user approval per exact batch

## 1. Goal

Populate Plaivra's canonical Food Catalog with legally reusable, provenance-backed, stable-identity Food data for the Primary launch markets: USA, Germany, UK, Egypt, Saudi Arabia, and UAE.

The architecture optimizes for long-term identity stability, replayable ingestion, source-version history, future market expansion, and the ability to move Food Catalog storage/search out of the Main Supabase later without rewriting consumers.

Raw row count is never a launch criterion by itself.

## 2. Stable boundaries

The following remain binding:

- canonical Food identity is Plaivra-owned and source-independent;
- consumers use the Food Catalog logical service boundary rather than physical tables;
- historical Diary/Recipe/Saved Meal/Meal Plan snapshots are frozen and never rewritten by catalog corrections;
- new writes resolve current canonical identity before freezing a snapshot;
- user-owned My Foods remain separate from the global catalog;
- missing nutrition is `NULL`, never fabricated as zero;
- import, activation, and verification are separate decisions;
- external sources never become runtime authorities for already-canonical Plaivra Foods.

## 3. Source classes

### Tier A — bulk structured sources

Eligible after adapter/source-release QA:

- USDA FoodData Central — Global/USA;
- BLS 4.0 — Germany;
- CoFID 2021 — UK.

### Tier B — conditional national/regional sources

Examples include Egyptian national/regional food-composition sources, Saudi Food Composition Database/Tables, and legally reusable Gulf sources.

Each exact dataset/release must pass reuse/licence review before bulk ingestion.

### Tier C — share-alike/external sources

Open Food Facts remains external barcode fallback under the current architecture. Wholesale OFF ingestion is not authorized unless a separate licensing architecture intentionally satisfies ODbL/share-alike obligations.

### Tier D — identity sources

GS1 may support GTIN/product identity validation. It is not Plaivra's bulk nutrition authority.

## 4. Schema readiness before population

### 4.1 Nullable canonical nutrition

`food_items.calories`, `protein_g`, `carbs_g`, and `fat_g` must allow `NULL` while preserving non-negative checks when values exist.

### 4.2 Brand identity

Add nullable `brand_name` as the stable display-level brand field.

This is intentionally not a full brand registry. A future normalized Brand domain may be added additively without changing canonical Food IDs or removing `brand_name` as a compatibility/display projection.

### 4.3 Barcode / GTIN identity

Create a dedicated `food_barcodes`-equivalent relation:

- normalized GTIN links to canonical Food;
- GTIN is unique across active catalog identity;
- accepted shapes: GTIN-8, GTIN-12, GTIN-13, GTIN-14;
- ingestion validates GS1 Mod-10 check digit;
- provenance may reference a same-Food source record;
- barcode is never the canonical Food primary key;
- Food merge/lifecycle resolution remains authoritative after barcode lookup.

### 4.4 Market relevance — future-region-safe

Market relevance must not be country-only.

Use a Food-to-market-scope relation with:

- `scope_type = country | region`;
- `scope_code`;
- relevance level;
- optional same-Food provenance.

Country codes use uppercase ISO-3166 alpha-2. Region codes are controlled uppercase identifiers such as `EU` or `GCC`.

Global relevance is represented separately by `food_items.is_market_global` and must not overload existing `food_items.is_global`, whose meaning remains shared/global catalog ownership.

This model allows future EU/GCC and other regional ranking without another schema redesign.

### 4.5 Immutable ingestion batch identity vs execution attempts

Do not conflate a reviewed data batch with an execution attempt.

Create two concepts:

#### `food_ingestion_batches`

Represents immutable reviewed input/transformation identity:

- provider;
- dataset;
- source version/release;
- source release date;
- licence identity/reference;
- source reference;
- source SHA-256;
- importer version;
- deterministic config SHA-256;
- deterministic manifest-content SHA-256;
- expected counts;
- review/approval state and review metadata.

The same source+transform identity maps to one batch identity.

#### `food_ingestion_runs`

Represents operational attempts against a batch:

- batch ID;
- execution mode `dry_run | production`;
- attempt number;
- execution status;
- start/completion timestamps;
- observed counts;
- bounded error summary.

Retries create new run attempts, not new batch identities.

Each run records the manifest-content checksum it is attempting to execute. Database-level validation must reject a Production run unless the referenced immutable batch is approved and the run checksum exactly matches the batch's reviewed manifest-content checksum. This invariant must not depend only on future executor code.

## 5. Versioned source lineage

The current legacy uniqueness `(provider, source_record_id)` is not sufficient for long-term release history because the same provider record may change across source releases.

For new bulk provenance, source identity is versioned by:

`provider + source_dataset + source_version + source_record_id`

`food_source_records` must retain source identity independently from processing attempts:

- source dataset;
- source version;
- source release date;
- source-record checksum where available/derivable;
- existing source nutrition/serving/review metadata.

Create a separate many-to-many batch participation relation equivalent to `food_ingestion_batch_records` so the same immutable source snapshot can be reviewed/reprocessed by multiple ingestion batches without duplicating the source record or overwriting its lineage.

Legacy/manual provenance may remain dataset/version-null, but bulk records must carry dataset+version together.

The schema must preserve multiple releases of the same provider record instead of overwriting or blocking later versions.

## 6. No direct bulk writes

Required flow:

```text
Source release
  → adapter
  → raw source identity
  → normalize
  → structural validation
  → quarantine/anomaly review
  → canonical matching decision
  → deterministic dry-run manifest CONTENT
  → Planner review/approval
  → privileged production run
  → draft canonical records
  → post-ingestion QA
  → explicit activation
  → separate verification decision
```

`CSV → INSERT food_items` is prohibited.

## 7. Deterministic manifest authority

The review checksum must represent deterministic content, not execution time.

Split the artifact conceptually into:

### Manifest content — hashed

Contains only deterministic semantics:

- source descriptor/checksum;
- importer version;
- config checksum;
- normalized candidate outcomes;
- validation issues;
- canonical decisions;
- planned aliases/barcodes/market scopes;
- expected mutation counts.

Before hashing:

- candidates sort by source record identity;
- aliases sort deterministically;
- GTINs sort/dedupe deterministically;
- market scopes sort/dedupe deterministically;
- duplicate candidate ID lists sort deterministically;
- object keys serialize canonically.

### Manifest envelope — not part of content checksum

May contain volatile metadata such as:

- generated timestamp;
- local run ID;
- diagnostics location.

Two identical source/config/importer runs must produce the same manifest-content checksum even if executed at different times.

## 8. Idempotency

Replaying the same approved batch must not duplicate:

- Foods;
- aliases;
- source provenance;
- GTINs;
- market relevance;
- canonical IDs.

Failed/retried execution attempts are modeled as additional `food_ingestion_runs`, not new semantic batches.

## 9. Canonical matching order

1. exact versioned provider/source identity;
2. exact GTIN where applicable;
3. approved merge redirect;
4. strong normalized canonical identity;
5. high-confidence alias/state/preparation match;
6. `POSSIBLE_DUPLICATE`;
7. `DISTINCT` new Food.

Possible duplicates are never automatically merged because of name similarity alone.

## 10. Variant rules

Separate canonical Foods only for material differences such as formulation, raw/cooked state, preparation, physical form, brand/product identity, or nutrition meaning.

Translation, spelling, transliteration, market relevance, and provider differences do not create duplicate Foods.

## 11. Nutrition and serving

Canonical ingestion fields include calories, protein, carbs, fat, saturated fat, fiber, total sugars (`sugars_g`), sodium, and explicit nutrition basis.

- preserve source nutrition in provenance;
- never impute missing nutrients;
- never infer ml↔g without density evidence;
- never invent piece/cup/slice/bowl conversions;
- if a serving label is used, canonical nutrition and basis must describe the same amount.

Legacy `sugar_g` is not the new ingestion authority.

## 12. Validation and quarantine

Reject/quarantine structural errors including negative nutrition, invalid basis, malformed source identity, invalid locale, invalid market scope, malformed GTIN, invalid GTIN check digit, conflicting exact barcode ownership, and impossible canonical/merge identity.

Warnings include large calorie/macro discrepancies and suspicious release-to-release changes. Warnings do not silently rewrite source values.

## 13. Verification

Imported source record ≠ active Food ≠ verified Food.

Verification requires same-Food provenance, approved source eligibility, validation, resolved canonical identity, and explicit verification policy.

## 14. Egyptian candidate dataset

The existing ~300-food Egyptian dataset is candidate enrichment input, not a direct Production seed. Preserve candidate IDs, EN/AR names, state/preparation, serving, confidence, source basis/reference, and anomaly metadata. Exact authoritative source resolution is required wherever possible before verification.

## 15. Rollout

- Batch 0 — schema + generic ingestion readiness only, zero Food population.
- Batch 1 — Global/USA/Germany/UK via approved USDA/BLS/CoFID adapters.
- Batch 2 — Egypt candidate dataset after provenance enrichment/QA.
- Batch 3 — Saudi + UAE/Gulf approved sources.
- Batch 4 — selected branded/package depth.

## 16. Market-aware search

Batch 0 creates market-scope data authority only. It does not change ranking.

No implementation may infer user market from language, locale, IP, timezone, or geolocation without a separately approved user-market authority.

Later ranking may compose country, region, global relevance, personalization, and catalog quality without changing the population schema.

## 17. Launch readiness

Market readiness is benchmark-based, not row-count-based. Required qualities include active canonical identity only, useful top results, duplicate control, correct basis, provenance, valid verification state, and successful Diary/Recipe/Saved Meal/Meal Plan/MCP handoffs.

## 18. Production gates

Each exact Production batch requires a separately approved immutable batch identity and manifest-content checksum.

Before Production: source/release/checksum/licence review, dry-run, anomaly/duplicate review, expected mutations, representative search benchmark, and explicit Planner/user approval.

After Production: verify exact counts, provenance, aliases, GTINs, market scopes, search benchmark, all Nutrition handoffs, and prove no user-owned Food or historical snapshot changed.

## 19. Non-goals

No Food Library redesign, Nutrition navigation redesign, historical rewrite, My Foods merge, wholesale OFF ingestion, new search vendor, new Supabase project, paid-provider dependency, Activity Catalog population, broader MCP-completeness work, or ChatGPT prompt redesign.

## 20. Physical portability

All ingestion/domain contracts use stable Plaivra IDs and source/batch identities rather than relying on Supabase-specific row ordering or database-generated sequence semantics. A future dedicated Food Catalog database/search system may reuse the same contracts and manifests without changing consumer Food IDs.
