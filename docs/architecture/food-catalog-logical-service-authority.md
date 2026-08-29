# Food Catalog Logical Service Authority

Status: **Approved product architecture; implementation and Production population are separately governed.**

This document defines the long-term architectural boundary for Plaivra's canonical Food Catalog. It does not populate the catalog, change Production data, create a new database, or authorize implementation by itself.

## 1. Decision

Plaivra will keep the canonical Food Catalog in the **Plaivra Main Supabase database for the current product stage**, while treating Food Catalog as an independent logical domain/service.

Physical storage and logical ownership are separate decisions:

- **Physical storage now:** Plaivra Main Supabase.
- **Logical owner:** Food Catalog domain/service.
- **Consumers:** Nutrition Diary, Meal Plan, Recipes, Saved Meals, Food Library UI, MCP/domain actions, and future barcode flows.
- **Future option:** move Food Catalog storage/search to dedicated infrastructure without changing consumer contracts or canonical Food IDs.

A separate Food Catalog database is explicitly **not** required now.

## 2. Why this architecture

A dedicated physical database today would add operational complexity before Plaivra has measured catalog-scale pressure. Direct table coupling, however, would make a later split expensive and risky.

The chosen architecture is therefore a **modular monolith boundary**:

```text
Plaivra consumers
  ├─ Food Library
  ├─ Diary
  ├─ Recipes
  ├─ Saved Meals
  ├─ Meal Plan
  └─ MCP / direct execution
           │
           ▼
      Food Catalog Contract
           │
           ▼
      Food Catalog Service
           │
           ▼
      Main Supabase today
      ├─ food_items
      ├─ food_aliases
      ├─ food_source_records
      ├─ taxonomy
      ├─ barcode identity
      └─ catalog lifecycle data
```

The boundary must be strong enough that replacing the storage implementation later does not require rewriting Diary, Recipes, Saved Meals, or other consumers.

## 3. Boundary integration

Nutrition V1 consumers integrate with the Food Catalog through domain-owned service boundaries:

- `services/nutrition-v1/server/food-library.ts` owns authoritative Food Library search and calls `search_nutrition_food_library`.
- `app/api/nutrition/v1/foods/route.ts` delegates Food Library search to that service rather than querying `food_items` directly.
- Recipe verification and Food handoff resolve global catalog identity, lifecycle, and verification through the Food Catalog service boundary rather than consumer-owned direct table reads.
- Public/member MCP Food operations use Food Catalog domain services for global catalog access; user-owned Food state remains owner-scoped.

Direct global catalog table access belongs only inside approved Food Catalog persistence/curation internals or database functions/RPCs that implement the Food Catalog service.

## 4. Domain ownership

### 4.1 Global Food Catalog

The Food Catalog domain owns canonical shared food identity and metadata, including:

- canonical Food ID;
- canonical name and localized aliases;
- brand identity where applicable;
- barcode/product identity where licensed and available;
- nutrition facts and nutrition basis;
- serving definitions owned by the catalog;
- category/subcategory/cuisine or market-relevance taxonomy;
- source provenance and source-record lineage;
- verification state;
- lifecycle state;
- duplicate/merge lineage and redirects;
- search-oriented normalized identity fields/indexes.

### 4.2 User Food Layer

User-specific food state remains a separate user-owned layer even while stored in the same database:

- My Foods / custom foods;
- favorites;
- personal nutrition corrections;
- recency/frequency signals;
- user-specific visibility or preferences.

The Food Catalog service may compose global and user-specific state for a user-facing result, but global catalog ownership and user ownership must not be conflated.

## 5. Consumer contract

Consumers must depend on domain operations, not on the physical catalog tables.

The implementation should expose a narrow contract equivalent in responsibility to:

- `search(...)` — authoritative localized catalog/user-food search;
- `getFood(...)` — resolve one canonical Food for read display;
- `resolveFood(...)` — resolve lifecycle/merge redirects to the current canonical identity;
- `resolveForHandoff(...)` — produce the authoritative food representation required before Diary/Saved Meal/Recipe writes;
- `getVerificationState(...)` — resolve verification without consumer table reads;
- `lookupBarcode(...)` — canonical local barcode lookup;
- admin/ingestion-only operations for source import and curation.

Exact function names are implementation details. The boundary and responsibilities are binding.

## 6. Direct-access rule

After the boundary implementation is complete:

- product consumers must not directly read or mutate global Food Catalog tables;
- API routes must call the Food Catalog domain service;
- MCP/public member tools must call domain services and must not receive arbitrary table access;
- ingestion/admin code may use catalog persistence internals only through explicitly privileged, non-public authority;
- database functions/RPCs that implement the Food Catalog service are allowed and remain part of the domain boundary.

Direct table access inside the Food Catalog persistence implementation itself is expected and is not a violation.

## 7. Canonical identity and historical safety

Canonical Food IDs must remain stable across catalog growth and infrastructure changes.

When duplicates are reconciled:

- source lineage remains preserved;
- merged Food identities redirect to the surviving canonical Food;
- historical Diary, Recipe version, Saved Meal, and other frozen consumer snapshots are never rewritten to new nutrition values;
- new writes resolve through current canonical identity before creating their frozen snapshot.

Catalog correction must never retroactively alter previously consumed/logged nutrition history.

## 8. Nutrition semantics

The service must preserve Nutrition V1 invariants:

- missing nutrition stays `null`; it must not be silently converted to zero;
- nutrition basis must be explicit;
- solid-food normalization normally uses per-100-g values when the source supports them;
- liquid normalization normally uses per-100-ml values when the source supports them;
- serving conversion is used only when a trustworthy conversion exists;
- source nutrition and user personal corrections remain distinguishable;
- frozen handoff snapshots contain the effective values used at write time.

## 9. Search and localization

Search remains a Food Catalog responsibility rather than a UI concern.

The architecture must support:

- English, German, and Arabic search identities;
- aliases and alternative spellings;
- Arabic normalization;
- useful curated Arabizi aliases where approved;
- exact and prefix relevance;
- brand and barcode identity;
- user favorites, recency, and frequency as ranking signals where applicable;
- high-protein, low-carb, and numeric nutrition filtering using normalized nutrition semantics.

A future dedicated search engine may replace or augment PostgreSQL search without changing the consumer-facing Food Catalog contract.

## 10. Barcode boundary

Barcode resolution is part of Food Catalog identity.

The required order is:

1. resolve an exact barcode from Plaivra's canonical local catalog;
2. if no local match exists, an approved external fallback may be queried;
3. external results do not become unrestricted canonical Plaivra data automatically;
4. any persisted external result must pass the approved licensing, provenance, validation, and canonicalization rules.

External barcode providers are not runtime authorities for already-canonical Plaivra Foods.

## 11. Population and ingestion boundary

Large Food datasets must not be hardcoded into application source or implemented as enormous hand-written seed migrations.

The Food Catalog population phase must use a repeatable ingestion pipeline:

```text
approved source
   ↓
source adapter
   ↓
normalization
   ↓
validation / anomaly checks
   ↓
duplicate matching / reconciliation
   ↓
provenance preservation
   ↓
canonical catalog write authority
   ↓
search / barcode index refresh
```

Only legally compatible sources approved for Plaivra may be bulk ingested. Source licensing and attribution requirements are part of ingestion acceptance, not optional metadata.

The already-approved market/source strategy remains separate from this service-boundary decision and is not changed by this document.

## 12. Security and authority

- Member-facing requests remain authenticated and owner-aware where user state is composed.
- Global catalog reads may be shared, but user-specific overlays must remain owner-scoped.
- Catalog curation, import, verification, merge, and source-management writes are privileged admin/ingestion operations and must not be exposed through public member OAuth.
- Service-role/admin authority must not be delegated to client code.
- Existing deletion/privacy guarantees for user-owned Food state remain unchanged.
- Global source/catalog records are not user-owned records and must not be deleted as part of ordinary user account deletion unless they contain separately owned user-originated data by design.

## 13. No migration solely for abstraction

Creating the logical service boundary does not by itself justify a schema migration.

Implementation should reuse the current schema unless a concrete contract gap requires new schema. Any required DDL must be introduced through a new named migration; applied migrations must never be rewritten.

The current Production compatibility marker must not be promoted merely because this service boundary is implemented.

## 14. Future physical split

A dedicated Food Catalog database/search service becomes justified only by measured operational need, such as:

- catalog size or search workload materially affecting primary application database performance;
- independent ingestion/search scaling requirements;
- operational isolation or availability needs;
- storage/search technology requirements that PostgreSQL alone no longer serves efficiently.

If that point is reached, the target may become:

```text
Food Catalog Service
  ├─ dedicated canonical database
  ├─ search index
  ├─ cache
  └─ ingestion workers
```

Consumers must continue using the same logical Food Catalog contract. Canonical Food IDs and historical snapshots must remain valid.

## 15. Implementation acceptance criteria

The boundary implementation is complete only when all of the following are proven:

1. Food Library search continues through the authoritative Food Catalog service/RPC.
2. Diary/Saved Meal/Recipe handoff does not directly resolve global Food Catalog tables outside the service implementation.
3. Recipe verification/display reads do not directly depend on `food_items` outside the service implementation.
4. Targeted repository search demonstrates no unapproved product-consumer direct global catalog access remains.
5. User Food ownership, favorites, corrections, recency, and Food Library ranking behavior remain correct.
6. Food merge/lifecycle resolution still converges to the current canonical Food for new writes.
7. Frozen historical snapshots remain unchanged.
8. Null-nutrition semantics remain unchanged.
9. Auth/RLS/privileged-ingestion boundaries remain intact.
10. Existing Nutrition V1 focused tests and directly affected broader tests pass.
11. No Production data population is performed as part of the boundary-only implementation unless separately authorized.
12. No separate database, new search vendor, or infrastructure service is introduced without a later explicit architecture decision.

## 16. Explicit non-goals of the boundary phase

This architecture phase does not:

- populate `food_items`;
- import USDA, Open Food Facts, or regional datasets;
- select a new paid provider;
- create a dedicated Food Catalog Supabase project;
- introduce Elasticsearch/OpenSearch now;
- redesign Food Library UX;
- alter the approved Nutrition navigation model;
- rewrite historical logs or recipes;
- promote the database compatibility marker.

The immediate follow-up after boundary implementation is the separately controlled **Food Catalog Data Population & Launch Readiness** phase.
