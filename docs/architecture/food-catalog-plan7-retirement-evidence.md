# Food Catalog Plan 7 — Retirement Preflight Evidence

**Status:** Task 16 read-only preflight in progress; **no destructive object is approved**
**Captured:** 2026-10-08
**Plaivra Production project:** `bkwezjxvapaeasfvlhvv`
**Deployed consumer-cutover artifact:** `a182923399a41faf5ca7b79d947a992e94cdd27a`
**Production deployment:** `dpl_A3C7RBuxBrFK2j5gSNwgJxoeze7T`

This document is Task 16 evidence only. It does not authorize SQL creation, destructive migration application, compatibility-marker promotion, Food population, generation promotion, Activity Catalog mutation, or Plan 8.

## Task 15 deployed cutover proof

Vercel reports the Production deployment as `READY`, sourced from branch `feat/food-catalog-plan7-production-closure` at exact commit `a182923399a41faf5ca7b79d947a992e94cdd27a`. The deployment owns the Production aliases `plaivra.com`, `app.plaivra.com`, and `www.plaivra.com`.

Read-only runtime proof after the deployment became READY:

- exact deployment `/api/version`: HTTP 200;
- canonical Production `https://plaivra.com/api/version`: HTTP 200;
- both report `commitSha = a182923399a41faf5ca7b79d947a992e94cdd27a`;
- `environment = production`;
- `artifactIdentityValid = true`;
- `releaseReady = true`;
- `migrationLedgerReconciliationState = reconciled`;
- pending / schema-untracked / unresolved = `0 / 0 / 0`;
- expected and live compatibility migration marker remain `20260724232734`;
- `/api/health`: HTTP 200 with the same exact commit;
- Vercel runtime error scan for the post-deploy window returned no runtime errors.

No compatibility marker was promoted as part of deployment.

## Live database state after cutover

Read-only Production inspection after deployment established:

- physical migration records: **128**;
- latest physical migration: `20261008022805_food_catalog_plan7_owner_reconciliation_expand`;
- `current_generation_id = NULL`;
- `pointer_revision = 0`;
- generation count = **0**;
- SearchDocument count = **0**;
- `food_items = 0`;
- `food_barcodes = 0`;
- `food_personal_corrections = 0`;
- `user_food_favorites = 1`;
- `food_favorites = 0`;
- Plan 6 Personal Override pointers = **0**.

Under the authenticated database boundary, canonical Search V2 returned exactly:

`{"items":[],"nextCursor":null}`

and a canonical barcode lookup for a valid GTIN returned no local mapping. The read-only transaction preserved generation/search counts and was rolled back.

## Owner-state disposition

The Task 13 owner-reconciliation classifier was run read-only against the current Production state.

Aggregate result:

- total legacy favorite rows: **1**;
- catalog mappable: **0**;
- catalog already mapped: **0**;
- My Food preserved: **0**;
- legacy text preserved: **0**;
- blocked: **1**;
- personal corrections: **0**.

Diagnostic mode exposed no owner ID or raw favorite key. The only diagnostic row is represented by stable SHA-256 row id:

`36343ec08f3a8e11773e8db42e513bba740fb6371f6faa9d16f878bd7dfb3b1e`

with disposition `blocked` and reason `malformed_key`.

Therefore **`user_food_favorites` is not retirement-safe**. The required zero-unmapped/approved-disposition condition is not met.

## Live database dependency evidence

Fresh function/view inspection established:

### `public.search_nutrition_food_library(...)`

The legacy function still exists. EXECUTE remains granted to:

- `authenticated`: yes;
- `service_role`: yes;
- `anon`: no.

Repository Product/MCP cutover does not prove that unknown external callers no longer use this still-granted database contract. External/live dependency clearance remains required before it can enter an approved destructive set.

### `food_aliases`

Current rows: **0**.

Live function reference:

- `search_nutrition_food_library(text,text,text,integer,text,text,text,jsonb)`.

Live view references: none observed.

Repository portability registry/dependency contracts still preserve this relation as transitional compatibility state. It is not currently retirement-safe.

### `food_market_relevance`

Current rows: **0**.

No live function or view reference was found in the current database scan. Repository portability registry/dependency contracts still preserve the relation, and the frozen Plan 7 policy requires explicit external/reporting/live dependency clearance. That clearance has not been established. Zero rows is not authorization.

### `food_personal_corrections`

Current rows: **0**.

Live function references remain:

- `private.food_catalog_search_v2_for_owner_v1(uuid,text,text,text,text,text,integer,text,text,text,jsonb)`;
- `private.nutrition_v1_final_review_core_purge_account_application_data_a(uuid)`;
- `search_nutrition_food_library(text,text,text,integer,text,text,text,jsonb)`.

The deployed Product handoff is on Plan 6 Personal Override authority, but the database still carries transitional legacy-correction compatibility and account-deletion dependencies. The table is therefore not retirement-safe yet.

## Repository consumer observation

Current non-historical repository search after the consumer cutover shows:

- `resolveCatalogFood`, `getCatalogVerificationStates`, `searchCatalogFoodsByName`, and `findCatalogDuplicateByName` survive in the dedicated legacy compatibility module and its tests rather than active Product handoffs;
- active `getGlobalFoods` / `getFoodCategories` APIs remain named compatibility-facing service functions, but their implementation uses current Search V2 authority;
- Food handoff no longer reads `food_personal_corrections`;
- barcode behavior uses `food_catalog_lookup_effective_barcode` before provider suggestion;
- recipe verification uses current generation/trust authority;
- portability/privacy contracts still intentionally mention transitional relations until formal retirement.

This is repository evidence only; it does not substitute for live/external dependency clearance.

## Fresh portability gate

Task 16 requires a fresh `FULL_DR` portability/search proof bound to the exact deployed artifact and current schema state.

No exact-head `FULL_DR` certification for deployed commit `a182923399a41faf5ca7b79d947a992e94cdd27a` has been captured in this Task 16 evidence. The available GitHub connector does not expose the manual workflow-dispatch operation required to create that missing run.

This is a global retirement blocker.

## Current retirement disposition

The current read-only evidence does **not** support creating destructive SQL.

Known blockers include:

1. fresh exact-deployed-head `FULL_DR` portability/search certification is missing;
2. the single `user_food_favorites` row is blocked as `malformed_key`;
3. `food_personal_corrections` remains referenced by live database functions;
4. `food_aliases` remains referenced by the old search function;
5. the old search function is still executable by authenticated/service-role callers and lacks external/live caller clearance;
6. `food_market_relevance` lacks the required external/reporting/live dependency clearance;
7. root `food_items` retirement candidates still require exact per-column dependency proof and Planner selection.

Accordingly, the Task 16 proposed destructive set is currently **empty**. No Task 17 migration identity is allocated and no DROP/ALTER contract SQL is created.

## Machine preflight

`scripts/food-catalog-plan7-retirement-preflight.mjs` provides:

- `--emit-sql` for the read-only Production discovery query contract;
- `--evidence <json>` for fail-closed evaluation of deployment, migration, compatibility, owner, repository/live dependency, keep-object, historical-reference, and fresh `FULL_DR` evidence.

The evaluator can identify a clean subset for Planner review while leaving blocked candidates deferred. It always reports:

- `plannerApprovalRequired: true`;
- `destructiveSqlAuthorized: false`;
- `productionMutationAuthorized: false`.

A green preflight is evidence for Planner review only. It never self-authorizes Task 17.
