# Food Catalog Plan 7 — Retirement Preflight Evidence

**Status:** Task 17 retirement applied and read back; Task 18 final closure verification in progress
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

- physical migration records: **129**;
- latest physical migration: `20261008123814_food_catalog_plan7_retirement_prerequisite`;
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

Planner ruling: **`user_food_favorites` is retained owner state for Plan 7 closure**. The blocked row remains preserved exactly as-is; it is not a Plan 7 destructive candidate and does not globally block unrelated independently safe candidates. Catalog favorite authority remains `food_favorites`; My Food / retained legacy semantics remain `user_food_favorites`.

## Live database dependency evidence

Fresh function/view inspection established:

### `public.search_nutrition_food_library(...)`

The legacy function still exists, but the Task 16 prerequisite revoked runtime EXECUTE:

- `authenticated`: no;
- `service_role`: no;
- `anon`: no.

The reviewed rollout window from deployed cutover through post-prerequisite preflight shows no live caller after contract disable. Supabase unified logs contain no runtime invocation of this RPC; the only matching post-prerequisite log is the read-only management inspection itself. PostgreSQL statement history still records **21 historical PostgREST calls**, but the call count did not increase across the prerequisite observation window. Current EXECUTE is revoked for all application roles. This supplies live/external clearance for the disabled RPC itself.

### `food_aliases`

Current rows: **0**.

Live function reference:

- `search_nutrition_food_library(text,text,text,integer,text,text,text,jsonb)`.

Live view references: none observed.

Repository non-historical references are limited to the portability registry/dependency contracts that Task 17 will update with the retirement migration. Production has zero rows, no view reference, and only the disabled old Search RPC references it. That RPC is in the same exact destructive set, so the reference is classified as internal to the reviewed retirement set. No live log usage was observed across the reviewed rollout window.

### `food_market_relevance`

Current rows: **0**.

No live function or view reference was found in the current database scan. Repository non-historical references are limited to portability registry/dependency contracts. Supabase unified logs show no use during the reviewed deployed-cutover window, and PostgreSQL statement history contains only schema/verification/count activity rather than an application/reporting reader. With zero rows and no current generation, the required repository + database + deployed/live/reporting precondition is satisfied for this exact retirement review.

### `food_personal_corrections`

Current rows: **0**.

Fresh exact table-reference scanning after the prerequisite apply finds only:

- `search_nutrition_food_library(text,text,text,integer,text,text,text,jsonb)`.

Current Search V2 and the canonical account-purge implementation no longer reference `public.food_personal_corrections`. The remaining database reference is internal to the old Search contract, but the deployed Product still reads this table from `lib/privacy/data-export.ts`. Therefore this table is explicitly **retained** and is not in the Task 17 destructive set.

## Repository consumer observation

Current non-historical repository search after the consumer cutover shows:

- `resolveCatalogFood`, `getCatalogVerificationStates`, `searchCatalogFoodsByName`, and `findCatalogDuplicateByName` survive in the dedicated legacy compatibility module and its tests rather than active Product handoffs;
- active `getGlobalFoods` / `getFoodCategories` APIs remain named compatibility-facing service functions, but their implementation uses current Search V2 authority;
- Food handoff no longer reads `food_personal_corrections`;
- barcode behavior uses `food_catalog_lookup_effective_barcode` before provider suggestion;
- recipe verification uses current generation/trust authority;
- portability/privacy contracts still intentionally mention transitional relations until formal retirement.

This is repository evidence only; it does not substitute for live/external dependency clearance.

## Exact-deployed FULL_DR gate — complete

The exact deployed artifact `a182923399a41faf5ca7b79d947a992e94cdd27a` was certified through a manual `workflow_dispatch` on temporary branch `cert/plan7-a1829233-full-dr`, which points exactly to that commit and contains no additional commit.

GitHub Actions run **37734481966**, job **113170815602**, completed **success**. Certification evidence includes:

- exact workflow head `a182923399a41faf5ca7b79d947a992e94cdd27a`;
- `FULL_DR` profile;
- chronological source and clean-target replay;
- **128** migration records in the certification target;
- PostgreSQL 17 target compatibility;
- protected-segment verification;
- restored Search V2 golden matrix with 20 cases;
- service/security isolation verification;
- `restoreVerified = true`;
- `searchVerified = true`;
- `securityVerified = true`;
- `recoveryEligible = true`;
- `drReady = true`.

The certification did not mutate Production.

Run **37734481966** remains the exact deployed-artifact certification. Fresh current-schema certification was then completed on repository head `bc21b1c49dc13eab5a556ebff7a5e6504949e11a` through Integrated FULL_DR run **37837045883** / run number **413**, plus Portable Export Restore QA run **37837046086** / run number **493**. Both are green against the post-prerequisite migration chain ending at `20261008123814`.

The Git compare from deployed artifact `a182923399a41faf5ca7b79d947a992e94cdd27a` to schema-certification head `bc21b1c49dc13eab5a556ebff7a5e6504949e11a` changes only migration, verification, test, evidence, ledger, and retirement-preflight files; it changes no deployed Product/application runtime path. The machine preflight therefore treats these two proofs as a composite exact deployed-runtime/current-schema certification rather than falsely claiming the schema-certification commit itself is deployed.

## Exact Task 16 Planner scope ruling

The Task 16 preflight supports one narrow destructive set for Task 17 implementation:

1. `function:public.search_nutrition_food_library`;
2. `table:public.food_aliases`;
3. `table:public.food_market_relevance`.

The set is approved as a unit for forward migration design. The migration must drop the disabled old Search function before `food_aliases`, must require both retired tables to be zero-row at apply time, and must use no `CASCADE`.

Explicitly **not approved for retirement**:

- `table:public.food_personal_corrections` — retained because deployed privacy export remains a live repository/Product consumer;
- `table:public.user_food_favorites` — retained owner state by prior Planner ruling;
- every candidate root `food_items` column — fresh Production discovery shows current function and/or constraint dependencies;
- all KEEP objects in the Plan 7 preflight inventory.

The Task 16 non-destructive prerequisite migration `20261008060000_food_catalog_plan7_retirement_prerequisite.sql` is applied exactly once in Production as `20261008123814_food_catalog_plan7_retirement_prerequisite`. This Planner scope ruling authorizes Task 17 SQL **creation for only the three objects above**. Immediate live preflight is still mandatory before Production apply.

## Machine preflight

`scripts/food-catalog-plan7-retirement-preflight.mjs` provides:

- `--emit-sql` for the read-only Production discovery query contract;
- `--evidence <json>` for fail-closed evaluation of deployment, migration, compatibility, owner, repository/live dependency, keep-object, historical-reference, and fresh `FULL_DR` evidence.

The evaluator can identify a clean subset for Planner review while leaving blocked candidates deferred. It always reports:

- `plannerApprovalRequired: true`;
- `destructiveSqlAuthorized: false`;
- `productionMutationAuthorized: false`.

A green preflight is evidence for Planner review only. It never self-authorizes Task 17.

## Task 17 Production apply and exact post-apply read-back

Standing owner authorization covered migration apply once the approved Task 16 scope, exact-head QA, and immediate live preflight were satisfied.

Applied repository migration:
- local file: `20261008202500_food_catalog_plan7_retirement_contract.sql`;
- reviewed Git blob: `fdf055f3be40ccad83bd7cf4721cee9654da61c4`;
- generated Production identity: `20261008224322_food_catalog_plan7_retirement_contract`;
- Plaivra Production project: `bkwezjxvapaeasfvlhvv`.

The immediate pre-apply read-only gate proved:
- physical head `20261008123814_food_catalog_plan7_retirement_prerequisite`;
- `food_aliases = 0`;
- `food_market_relevance = 0`;
- old Search RPC present but non-executable by anon/authenticated/service_role;
- no unexpected `food_aliases` function/view dependency outside the old Search RPC;
- no `food_market_relevance` function/view dependency.

Post-apply Production read-back proves:
- physical migration records: **130**;
- physical head: `20261008224322_food_catalog_plan7_retirement_contract`;
- old `public.search_nutrition_food_library(...)`: **absent**;
- `public.food_aliases`: **absent**;
- `public.food_market_relevance`: **absent**;
- `public.food_personal_corrections`: retained, **0** rows;
- `public.user_food_favorites`: retained, **1** row;
- `public.food_favorites`: retained, **0** rows;
- `public.food_items = 0`;
- SearchDocuments = **0**;
- generations = **0**;
- current generation = `NULL`, pointer revision = **0**;
- browser Search V2 remains authenticated-only;
- MCP Search V2 remains service_role-only;
- barcode/current-generation/Personal Override authority remains present;
- schema compatibility remains `2`;
- released compatibility marker remains `20260724232734`;
- deployed runtime remains `a182923399a41faf5ca7b79d947a992e94cdd27a`;
- `/api/version` and `/api/health` remain HTTP 200;
- Vercel post-apply runtime error scan found no runtime errors.

No unapproved owner state, root Food column, current Search/rebuild function, barcode authority, Personal Override authority, compatibility marker, Food population, provider ingestion, generation pointer, Activity Catalog state, or Plan 8 scope changed.

## Task 18 portability registry disposition

The final-schema portability registry and restore dependency graph exclude the two formally retired relations `food_aliases` and `food_market_relevance`. Tests explicitly assert they are absent from both `CORE_PORTABLE` and `FULL_DR` segment sets.

Retained owner families remain protected FULL_DR segments: `food_personal_corrections`, `food_favorites`, `user_food_favorites`, and Plan 6 Personal Override state. The old Search RPC is not a restore/search authority.

Final Task 18 exact-head run identifiers are recorded after the post-apply coding/test/correction cycle completes.

