# Production migration ledger reconciliation

**Project:** `bkwezjxvapaeasfvlhvv`
**Current reconciliation date:** 2026-09-08
**Machine authority:** `supabase/migration-ledger.json`
**Status:** Production remains reconciled through the applied Food Catalog Plan 5 serving-semantics correction; repository Plan 6 governance migration is pending/unapplied

This document is the human-readable current migration authority. Exhaustive immutable repository-to-Production identity mappings live in `supabase/migration-ledger.json`; immutable SQL lives under `supabase/migrations/`; executable verification lives under `supabase/verification/`.

Historical PR descriptions, completed implementation reports, and old audit snapshots are evidence only. They do not override the current state below.

## Current state

The latest verified Plaivra Production inspection after the authorized 2026-09-07 Plan 5 serving-semantics correction established:

- Physical Production migration records: **121**
- Exact repository-name applications tracked as `state = applied`: **63**
- Latest physical Production record: `20260907215257_food_catalog_search_serving_semantics_correction`
- Corresponding immutable repository migration: `20260907165500_food_catalog_search_serving_semantics_correction.sql`
- Frozen correction migration Git blob: `fd51c88a1326cc83d4532ac60a6e89650847f894`
- Original applied Plan 5 migration: `20260906183000_food_catalog_search_projection_v2.sql` → `20260906200129_food_catalog_search_projection_v2`
- Frozen original Plan 5 migration Git blob: `7be00af5e347ca8d58abcac74cf4c816761a0745`
- Released compatibility marker: `20260724232734`
- Activity Catalog Production remains isolated from the Main Plaivra migration ledger

The current repository/machine-ledger state records:

- Pending repository migrations: **1** — `20260908100000_food_catalog_governance_control_plane.sql`
- `pendingCount = 1`
- `schemaVerifiedUntrackedCount = 0`
- `unresolvedCount = 1`
- `historyRepair.state = pending`
- migration-ledger `release_ready = false`

The machine-ledger `productionMigrationCount` counts exact `state = applied` entries; it is not the total number of physical Supabase migration-history records. Generated Production identities remain represented as `applied_version_alias`; physical Production history is now 121 records. Applied migrations must not be replayed.

## Food Catalog Plan 6 governance control plane — repository pending / Production unapplied 2026-09-08

Repository migration `20260908100000_food_catalog_governance_control_plane.sql` is a forward-only Plan 6 implementation artifact. It is intentionally classified as `state = pending` with no Production version/name because PR #173 is still an implementation Draft and Plan 6 migration authority does not permit application before merge.

The latest verified Production physical migration head remains `20260907215257_food_catalog_search_serving_semantics_correction`. The released compatibility marker remains `20260724232734`. The pending Plan 6 entry therefore makes the repository ledger deliberately non-release-ready: `historyRepair.state = pending`, `pendingCount = 1`, `unresolvedCount = 1`, and `release_ready = false`. Release preflight must fail closed until the Plan 6 repository migration is independently approved, merged, applied exactly once under standing migration authority, verified, and reconciled.

Plan 6 implementation/verification work must not populate Foods, execute provider ingestion, activate or verify Foods, create/promote Catalog Generations, move `food_catalog_current_generation`, mutate derived SearchDocuments outside their existing authority, promote the compatibility marker, deploy runtime cutover, or mutate the isolated Activity Catalog. Do not apply or replay `20260908100000_food_catalog_governance_control_plane.sql` from this Draft implementation branch.

## Food Catalog Plan 5 serving-semantics correction — Production application 2026-09-07

Planner final QA/QC on PR #171 found a serving-authority correctness defect in the already-applied Plan 5 SearchDocument rebuild. The approved forward-only correction is:

`20260907165500_food_catalog_search_serving_semantics_correction.sql`

Frozen Git blob:

`fd51c88a1326cc83d4532ac60a6e89650847f894`

After PR #171 was merged at `main@94553f79dbafb41a059f6ac07bcc2a48e9418414`, read-only preflight confirmed that Production still ended at `20260906200129_food_catalog_search_projection_v2`, the correction had not been applied, SearchDocuments were empty, Food/source/ingestion/generation data were unpopulated, and the current-generation pointer remained `NULL/0`. Under standing migration authority, the exact frozen correction was then applied once through the tracked Supabase migration mechanism. Supabase generated physical identity:

`20260907215257_food_catalog_search_serving_semantics_correction`

Immediate read-back proved:

- global SearchDocument `serving_label` is nullable;
- `public.rebuild_food_catalog_search_projection_v2(uuid,text,text)` remains the public rebuild boundary and is executable by `service_role` but not `authenticated` or `anon`;
- the internal legacy rebuild exists only under `private` and is not executable by `service_role`, `authenticated`, or `anon`;
- `food_catalog_search_documents = 0`;
- `food_items = 0`;
- `food_source_records = 0`;
- `food_ingestion_batches = 0`;
- `food_ingestion_runs = 0`;
- `food_catalog_generations = 0`;
- `food_catalog_generation_foods = 0`;
- `current_generation_id = NULL` and `pointer_revision = 0`;
- the released compatibility marker remains `20260724232734`.

The correction preserves nullable nutrition, keeps nutrition normalization basis separate from serving-display authority, does not choose an arbitrary serving option, and leaves Plan 3 generation authority and Plan 5 derived-search authority intact. No Food population, provider ingestion, activation, generation creation/promotion, current-pointer movement, deployment, compatibility-marker promotion, or Activity Catalog mutation occurred. Do not replay either Plan 5 migration.

## Food Catalog Plan 5 Search Projection V2 — Production application 2026-09-06

The forward-only repository migration:

`20260906183000_food_catalog_search_projection_v2.sql`

was frozen at Git blob:

`7be00af5e347ca8d58abcac74cf4c816761a0745`

Before Production application, exact-head PR Quality run `34056018392` passed on implementation/reconciliation precursor head `49e164103f9aa339107c63daabc71f74840ea03e`, including core, build, database replay/lint/verification/integration, CI contracts, rendered UI/i18n, integrity, and required-summary. Both exact-head Exercise runtime QA workflows also passed.

Read-only Production preflight then proved:

- the target was Plaivra Production `bkwezjxvapaeasfvlhvv`;
- the physical migration head remained `20260906131808_food_catalog_ingestion_v2_authority`;
- no Plan 5 migration identity existed;
- `food_catalog_search_documents` and `food_catalog_search_nutrition_policies` did not exist;
- the Plan 5 rebuild/search RPCs did not exist;
- `food_items = 0`;
- `food_source_records = 0`;
- `food_ingestion_batches = 0`;
- `food_ingestion_runs = 0`;
- `food_catalog_generations = 0`;
- `food_catalog_generation_foods = 0`;
- `current_generation_id = NULL` and `pointer_revision = 0`;
- the released compatibility marker remained `20260724232734`.

The exact frozen migration was applied once through the connected tracked Supabase migration mechanism. Supabase generated physical identity:

`20260906200129_food_catalog_search_projection_v2`

Immediate structural/security read-back proved:

- both Plan 5 tables exist with RLS enabled;
- `service_role` has `SELECT` but no direct `INSERT`, `UPDATE`, `DELETE`, or `TRUNCATE` authority on the two Plan 5 tables;
- `anon` and `authenticated` have no direct table authority on the Plan 5 tables;
- `public.rebuild_food_catalog_search_projection_v2(uuid,text,text)` exists as `SECURITY DEFINER` and is executable only by `service_role` among the application roles;
- `public.search_food_catalog_v2(text,text,text,text,text,integer,text,text,text,jsonb)` exists as `SECURITY DEFINER`, `STABLE`, is executable by `authenticated` and `service_role`, and is denied to `anon`;
- the expected generation/context, trigram, FTS, protein, carbs, and fat indexes exist;
- `food_catalog_search_nutrition_policies = 0`;
- `food_catalog_search_documents = 0`;
- canonical Food/source/ingestion/generation data remained unpopulated;
- `current_generation_id = NULL` and `pointer_revision = 0`;
- the released compatibility marker remained `20260724232734`.

The registered Plan 5 Production verifier was then executed with all synthetic fixture mutations inside one transaction ending in `ROLLBACK`. It proved:

- Plan 5 schema/RLS/RPC privilege boundaries;
- null-safe strict numeric `gt`, `lt`, and `eq` filtering;
- deterministic SearchDocument rebuild equality;
- no convenience nutrition labels without explicit versioned policy authority;
- exact-policy High Protein / Low Carb label derivation using a rollback-only test policy;
- generation-bound search visibility;
- explicit language/script and market ranking behavior;
- numeric nutrient filters compose with AND semantics;
- High Protein + Low Carb presets compose with AND semantics;
- keyset cursors are bound to the exact search context and reject context reuse;
- deterministic repeated search results with bounded page size.

The verifier transaction rolled back successfully. Final zero-residue read-back proved:

- `food_items = 0`;
- `food_source_records = 0`;
- `food_ingestion_batches = 0`;
- `food_ingestion_runs = 0`;
- `food_catalog_search_nutrition_policies = 0`;
- `food_catalog_search_documents = 0`;
- `food_catalog_activation_sets = 0`;
- `food_catalog_generations = 0`;
- `food_catalog_generation_foods = 0`;
- `food_catalog_generation_events = 0`;
- `current_generation_id = NULL`;
- `pointer_revision = 0`;
- released compatibility marker `20260724232734` unchanged.

Plan 5 deliberately creates versioned nutrition-policy authority without inventing Product threshold values. No numeric High Protein or Low Carb threshold has been approved; the policy table remains empty. The rollback-only verifier policy is test evidence only and is not Product authority.

Migration application and verification performed no Food population, provider ingestion, persistent ingestion dry-run, activation, verification approval, Catalog Generation creation/promotion, current-pointer movement, deployment, compatibility-marker promotion, or Activity Catalog mutation. The machine ledger records this migration as `state = applied_version_alias` with Production version `20260906200129` and Production name `food_catalog_search_projection_v2`. Do not replay this migration.

## Food Catalog Plan 4 ingestion V2 — Production application 2026-09-06

The forward-only repository migration:

`20260904100000_food_catalog_ingestion_v2_authority.sql`

was independently squash-merged in PR #168, with merged `main` fixed at `19cdeecd2590381d9f74cba79f6ae6bfd482c551`. The merged file resolved to frozen Git blob:

`eb2cdc2ee16462d7712080a3e3532757ec093742`

Read-only Production preflight proved the target was Plaivra Production `bkwezjxvapaeasfvlhvv` in `eu-central-1`, the physical migration head remained `20260903210503_food_catalog_generation_authority`, no Plan 4 migration record existed, Plan 4 tables/columns/guards were absent rather than partially applied, canonical Food/source/ingestion/generation data remained empty, `current_generation_id = NULL`, and `pointer_revision = 0`. The frozen migration contains no Activity Catalog target.

The exact migration was applied once through the connected Supabase tracked migration mechanism. Supabase generated physical identity:

`20260906131808_food_catalog_ingestion_v2_authority`

Immediate structural/security read-back proved:

- exactly one migration-history record exists for `food_catalog_ingestion_v2_authority`;
- all nine Plan 4 authority tables exist and have RLS enabled;
- `service_role` has `SELECT` but no direct `INSERT`, `UPDATE`, `DELETE`, or `TRUNCATE` authority on those Plan 4 authority tables;
- `anon` and `authenticated` have no table mutation authority on the Plan 4 authority tables;
- all ten approved Plan 4 command RPCs exist as `SECURITY DEFINER`, are executable by `service_role`, and are not executable by `anon` or `authenticated`;
- the semantic-batch checksum constraint and partial unique semantic-identity index exist;
- the run lease-shape constraint and expected Plan 4 indexes exist;
- immutable-row triggers exist for command replay, manifest, materialized result, quarantine, quarantine resolution, reconciliation, release-diff, release-diff-record, and operational-event authority;
- the inherited Batch 0 `service_role` direct-mutation guard is installed on ingestion batches, runs, and batch membership;
- successful exact dry-run reconciliation freezes semantic batch identity, future dry-run attempts, manifest expansion, and batch membership;
- persisted-candidate and reconciliation code preserve deterministic batch-then-run lock order;
- Production mutation requires the exact live lease token/epoch and stale cross-attempt leases are terminalized before takeover;
- Production candidate persistence is bound to the exact approved per-record immutable manifest;
- quarantine writes are bound to reviewed manifest disposition/reason/evidence authority;
- reconciliation computes immutable mismatch authority including missing/extra/duplicate/idempotency/partial/quarantine/outcome-count divergence;
- release-diff classification and checksum are recomputed from immutable manifest authority;
- zero-record dry-run reconciliation has an explicit prepared-to-running start boundary;
- `food_items.serving_size` is nullable as required for structured serving evidence.

Rollback-only synthetic Production verification then proved the executable boundaries without leaving Product data behind:

- zero-record dry-run reconciliation starts and completes successfully;
- successful reconciliation freezes the semantic batch and rejects a fresh mutable dry-run attempt;
- inherited Batch 0 `service_role` direct DML is rejected for Plan 4 semantic authority;
- a live cross-attempt Production lease cannot be stolen;
- an expired prior attempt is terminalized as `cancelled` before takeover;
- `lease_lost` and `lease_takeover` lifecycle events are recorded correctly.

The verification transaction was rolled back. Final read-back proved:

- `food_items = 0`;
- `food_source_records = 0`;
- `food_ingestion_batches = 0`;
- `food_ingestion_runs = 0`;
- Plan 4 manifest/materialized/quarantine/reconciliation/release-diff/event rows = 0;
- `food_catalog_generations = 0`;
- generation Food/event rows = 0;
- `current_generation_id = NULL`;
- `pointer_revision = 0`.

Migration application and verification performed no Food population, USDA/FDC/FNDDS/provider ingestion, persistent dry-run batch execution, Production candidate materialization, activation, verification approval, Catalog Generation creation, generation promotion, current-pointer movement, runtime/member cutover, deployment, or Activity Catalog mutation. The released compatibility marker remains `20260724232734`. The machine ledger records this migration as `state = applied_version_alias` with Production version `20260906131808` and Production name `food_catalog_ingestion_v2_authority`. Do not replay this migration.

## Food Catalog Plan 3 generation authority — Production application 2026-09-03

The exact repository migration:

`20260902150000_food_catalog_generation_authority.sql`

was independently verified on integrated `main` at immutable Git blob:

`65cd33d5a6e8bc7af08ba8079fff8e9da6a68122`

Read-only Production preflight proved the target was Plaivra Production `bkwezjxvapaeasfvlhvv` in `eu-central-1`, both prior Plan 1 Food Catalog migrations were present, Plan 3 was not already applied, no newer unexpected migration existed, the Plan 3 relations/functions and new named constraints/index were absent, verification-chain duplicate-root/supersession counts were zero, and canonical Food data remained unpopulated.

The frozen migration was applied once through the Supabase migration mechanism. Supabase generated physical identity:

`20260903210503_food_catalog_generation_authority`

Immediate read-back proved:

- exactly one migration-history record exists for `food_catalog_generation_authority`;
- all 16 Plan 3 authority tables exist with RLS enabled;
- `anon` and `authenticated` have neither direct read nor direct mutation authority on those Plan 3 authority tables;
- `service_role` retains explicit `SELECT` authority but has no direct `INSERT`, `UPDATE`, `DELETE`, or `TRUNCATE` authority on those tables;
- all eight approved Plan 3 command RPCs exist as `SECURITY DEFINER`, are executable by `service_role`, and are not executable by `anon` or `authenticated`;
- the single verification-chain root index and supersession uniqueness authority exist;
- the activation eligibility predicate includes source/legal, identity, nutrition-basis, display-identity, eligibility, and zero-blocker requirements;
- validation report checksums are recomputed from normalized trusted database authority at the persistence boundary;
- promotion deterministically locks activation grants and re-checks invalidation; invalidation locks its exact grant row;
- canonical Food rows remain zero and Plan 3 operational rows remain zero;
- the current-generation singleton remains the null bootstrap row with `pointer_revision = 0`.

Migration application performed no Food population, USDA/provider ingestion, activation-set execution, activation grant execution, real generation creation, generation promotion, rollback, visibility/runtime cutover, deployment, or Activity Catalog mutation. The released compatibility marker remains `20260724232734`. The machine ledger records this migration as `state = applied_version_alias` with Production version `20260903210503` and Production name `food_catalog_generation_authority`. Do not replay this migration.

## Food Catalog Intelligence Plan 1 semantic correction — Production application 2026-09-01

Planner independent QA/QC on PR #162 identified two semantic gaps after the original Plan 1 core migration had already been applied to Production. The forward-only corrective repository migration is:

`20260901174500_food_catalog_plan1_semantic_corrections.sql`

It adds only two database invariants:

- household/non-direct Food serving conversions require source-backed `source_record_id` provenance in addition to their positive gram weight;
- Food names with `origin = 'source'` or `name_role = 'source_name'` require `source_record_id` provenance.

The existing composite `(source_record_id, food_id)` foreign keys continue to enforce same-Food provenance. Direct `g`/`ml` serving bases remain valid without a source record, and curated aliases/transliterations remain eligible for `source_record_id IS NULL` when they do not claim source semantics.

After independent re-review of exact correction head `51b380019db205dff61505a0fdee54a409ce9657`, the Planner explicitly authorized exact Production application and reconciliation of this migration only. Immediately before apply, read-only Production preflight proved:

- `food_items = 0`;
- `food_source_records = 0`;
- `food_serving_options = 0`;
- `food_names = 0`;
- `20260901165219_food_catalog_intelligence_core` was present in Production migration history;
- no `food_catalog_plan1_semantic_corrections` migration identity was present;
- the repository migration remained at reviewed blob `1e4dff8b5fea6d8d8b60fc78a77033b32e07ff35`.

The exact migration was applied once to Plaivra Production. Supabase generated physical identity:

`20260901183021_food_catalog_plan1_semantic_corrections`

Production read-back then proved:

- exactly one Production migration-history record exists for `food_catalog_plan1_semantic_corrections`;
- `food_serving_options_source_backed_weight_check` exists with effective authority `unit_code IN ('g','ml') OR (gram_weight IS NOT NULL AND source_record_id IS NOT NULL)`;
- `food_names_source_provenance_check` exists with effective authority `(origin <> 'source' AND name_role <> 'source_name') OR source_record_id IS NOT NULL`;
- the composite `(source_record_id, food_id)` foreign keys still reference `food_source_records(id, food_id)` for both `food_serving_options` and `food_names`, preserving same-Food provenance;
- `food_items = 0`;
- `food_source_records = 0`;
- `food_serving_options = 0`;
- `food_names = 0`;
- physical Production migration history was 117 records at that reconciliation point;
- the released compatibility marker remains `20260724232734`.

The machine ledger therefore records this migration as `state = applied_version_alias` with Production version `20260901183021` and Production name `food_catalog_plan1_semantic_corrections`. No Food population, provider ingestion, activation, Catalog Generation promotion, compatibility-marker promotion, application deployment, Activity Catalog mutation, PR merge, or Plan 2 work was authorized or performed by this reconciliation. Do not replay this migration.

Do not edit or replay the already-applied `20260901153000_food_catalog_intelligence_core.sql` migration.

## Food Catalog Intelligence Plan 1 Production application — 2026-09-01

Repository migration `20260901153000_food_catalog_intelligence_core.sql` was applied exactly once to Plaivra Production after the repository owner explicitly authorized this Production application while closing PR #162. Supabase recorded the generated physical identity:

`20260901165219_food_catalog_intelligence_core`

Before application, read-only Production preflight proved:

- `food_items = 0`;
- `food_source_records = 0`;
- the Plan 1 V2 core relations were absent;
- Production history did not already contain `food_catalog_intelligence_core`.

Immediate read-back after application proved:

- `food_items = 0`;
- `food_source_records = 0`;
- `food_nutrition_revisions = 0` rows;
- `food_serving_options = 0` rows;
- `food_names = 0` rows;
- `food_taxonomy_assignments = 0` rows;
- `food_market_assignments = 0` rows;
- `food_verification_assertions = 0` rows;
- `food_merge_events = 0` rows;
- the six approved taxonomy namespaces exist;
- the fourteen approved initial `primary_food_group` nodes exist;
- the nine approved Market Scope Registry rows exist;
- the three approved memberships `DE → EU`, `SA → GCC`, and `AE → GCC` exist;
- all eleven new core relations have RLS enabled;
- `anon` and `authenticated` have no table grants on the new core relations;
- `service_role` retains the intended internal authority.

The controlled taxonomy and market registry rows are reference authority only; this application did **not** populate any canonical Food, source record, nutrition fact, serving fact, localized Food name, taxonomy assignment, market assignment, verification assertion, or merge event.

The owner authorization was limited to applying and reconciling this Plan 1 migration. It did not authorize Food population, provider ingestion, activation, Catalog Generation promotion, consumer cutover, Plan 2, compatibility-marker promotion, application deployment, or any Activity Catalog mutation. The released compatibility marker remains `20260724232734`. Do not replay this migration.

## Food Catalog and nullable Meal Plan Production applications — 2026-08-30

The following repository migrations were applied exactly once to Plaivra Production after explicit user authorization and exact-content verification, in repository chronological order:

1. `20260830011407_food_catalog_population_readiness.sql` → `20260830170226_food_catalog_population_readiness`
2. `20260830155245_nullable_meal_plan_nutrition_snapshots.sql` → `20260830170301_nullable_meal_plan_nutrition_snapshots`

Read-only Production preflight before the first application proved:

- `food_items = 0`;
- `food_source_records = 0`;
- Batch 0 ingestion tables/columns were absent;
- the legacy Food provenance uniqueness authority was present;
- all four `user_meal_plan_items` core nutrition columns were still `NOT NULL`.

Read-back after the Food Catalog Batch 0 migration proved:

- `food_items = 0` and `food_source_records = 0`;
- `food_ingestion_batches = 0`;
- `food_ingestion_runs = 0`;
- `food_ingestion_batch_records = 0`;
- `food_barcodes = 0`;
- `food_market_relevance = 0`;
- `brand_name` exists;
- `is_market_global` retains `DEFAULT false`;
- all four canonical Food core nutrition columns are nullable.

Read-back after the nullable Meal Plan migration proved:

- all four `user_meal_plan_items` nutrition snapshot columns are nullable;
- non-negative CHECK authority remains present for `calories`, `protein_g`, `carbs_g`, and `fat_g`;
- Food Catalog and ingestion tables remain unpopulated.

These applications did **not** populate Food, execute provider/source imports, promote the compatibility marker, deploy application code, start Batch 1, or mutate Activity Catalog Production. The released compatibility marker remains `20260724232734`. Do not replay either migration.

## Nutrition V1 runtime compatibility baseline

At Nutrition V1 feature closure, Production `/api/version` reported:

- Nutrition V1 feature squash / first verified Production commit: `0efddc0d6969487eb4105fccc02f3b629efbab91`
- `schemaCompatibilityVersion = 2`
- `expectedDatabaseMigrationVersion = 20260724232734`
- `databaseMigrationVersion = 20260724232734`
- `migrationLedgerReconciliationState = reconciled`
- `pendingMigrationCount = 0`
- `schemaAppliedUntrackedCount = 0`
- `unresolvedMigrationCount = 0`
- `migrationVersionCompatible = true`
- `migrationLedgerReconciled = true`
- `schemaCompatible = true`
- `releaseReady = true`

This is the verified Nutrition V1 closure baseline, not a claim about permanently current physical Production migration identity. Documentation-only and later product/schema commits can advance Git, deployed commit identity, and physical migration history. Exact current runtime identity must be verified live from GitHub `main`, Vercel, and Production `/api/version`.

Physical schema advancement and compatibility-marker promotion are separate authorities. The 2026-08-30, 2026-09-01, 2026-09-03, and 2026-09-06 schema applications did not change the released compatibility marker because the runtime compatibility contract remains anchored to marker `20260724232734`.

## Immutable migration rules

- Never rewrite an applied Supabase migration.
- Repository migration filenames remain immutable after application.
- Generated Production identities are recorded as aliases in the machine ledger where Supabase applied a repository migration under a different physical timestamp.
- Do not replay an `applied` or `applied_version_alias` migration.
- An ambiguous apply result must be reconciled read-only against Production history before any retry.
- Migration-history repair is metadata-only and allowed only after proving exact duplicate identity/statement conditions; it must never be used to hide schema or application-data divergence.
- Activity Catalog migrations remain separate from the Main Plaivra migration ledger.

## Workout History generated identities

The nine Workout History migrations were applied exactly once to Plaivra Production on 2026-08-02 under generated aliases. Their immutable mappings remain recorded in `supabase/migration-ledger.json` and must not be replayed.

The current generated Production identities are:

1. `20260802113958_workout_history_verified_records`
2. `20260802114200_workout_history_correction_and_soft_delete`
3. `20260802114311_workout_history_repeat_session`
4. `20260802114332_workout_history_verified_record_authority_hardening`
5. `20260802114422_workout_history_verified_record_rebuild`
6. `20260802114455_workout_history_set_detail_patch_semantics`
7. `20260802114534_workout_history_correction_muscle_reconcile`
8. `20260802114654_workout_history_keyset_read_authority`
9. `20260802114733_workout_history_filter_options`

## PCS-2 generated identity

Repository migration `20260803152000_private_app_bootstrap_v1.sql` was applied exactly once as generated Production identity `20260803173755_private_app_bootstrap_v1`.

The compatibility marker remained unchanged and Activity Catalog was not modified.

## P0 onboarding Production repair

Repository migration `20260804174500_fix_profiles_update_policy_recursion.sql` was applied exactly once as generated Production identity `20260804180932_fix_profiles_update_policy_recursion`.

The repository filename and Production version differ, so the machine ledger preserves the immutable mapping as `applied_version_alias`. Do not replay it.
