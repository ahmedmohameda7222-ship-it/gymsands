# Food Catalog Plan 7 Discovery Inventory

Status: **Repository + read-only Production discovery; Planner corrections incorporated; no implementation authority**
Date: **2026-09-10**
Reviewed repository baseline: `main@7f2882d6ad3c67489622ff4be68a4506a2722319`
Production project inspected read-only: `bkwezjxvapaeasfvlhvv`
Design: `docs/superpowers/specs/2026-09-10-food-catalog-plan7-portability-retirement-design.md`

## 1. How to read this inventory

Labels:

- **VERIFIED CURRENT FACT** — observed in current repository or read-only Production.
- **ARCHITECTURE REQUIREMENT** — binding parent architecture or frozen Plan 7 Planner policy.
- **PROPOSED PLAN 7 DESIGN** — implementation shape requiring later authorization.

Retirement recommendations:

- **KEEP** — current long-term or still-required authority.
- **RETIRE AFTER PRECONDITION** — candidate only after exact consumers/data/DB dependencies/deployed artifact are migrated/proven and Planner approves the destructive set.
- **KEEP / UNKNOWN PENDING EVIDENCE** — replacement/meaning is not sufficiently proven for retirement.

There is no current “row count zero therefore retire now” category. Immutable historical migration/spec text is evidence, not an active runtime consumer and not rewritten merely to reduce symbol counts.

Classification and restore `loadMode` are independent. A relation may be long-term portable authority but `VALIDATE_PRESEEDED`; a transitional relation may be non-canonical yet still require exact portable compatibility state until retirement.

## 2. Verified repository and Production baseline

**VERIFIED CURRENT FACT**:

- `main = 7f2882d6ad3c67489622ff4be68a4506a2722319`;
- Production PostgreSQL = **17.6**;
- physical migration count = `123`;
- latest = `20260910071241_food_catalog_governance_gtin_lock_exactness`;
- repository migration ledger pending/unresolved/schema-untracked = `0/0/0`;
- global Food/source/ingestion/generation/search populations requested in the baseline are `0`;
- current generation = `NULL`, pointer revision = `0`;
- schema compatibility = `2`, released compatibility marker = `20260724232734`;
- `food_aliases = 0`, `food_market_relevance = 0`, `food_barcodes = 0`, `food_personal_corrections = 0`, `food_favorites = 0`;
- `user_food_favorites` and `user_food_items` contain owner data;
- `food_items.food_name` is **NOT NULL**;
- required current PostgreSQL capabilities include `pgcrypto`, `pg_trgm`, `uuid-ossp`;
- Activity Catalog is separate and outside Plan 7 mutation scope.

### Migration-created seeded/reference state present with zero global Foods

Read-only Production inspection found:

| Relation | Current rows | Discovery consequence |
|---|---:|---|
| `food_taxonomy_namespaces` | 6 | migration-seeded registry exists before portable load |
| `food_taxonomy_nodes` | 14 | migration-seeded taxonomy rows exist |
| `market_scopes` | 9 | migration-seeded market registry exists |
| `market_scope_memberships` | 3 | migration-seeded hierarchy exists |
| `food_catalog_governance_policy_versions` | 1 | migration-seeded policy authority exists |
| `food_catalog_governance_policy_pointer` | 1 | singleton already exists |
| `food_catalog_current_generation` | 1 | singleton already exists even with NULL current generation |
| `release_schema_compatibility` | 1 | schema-compatibility singleton already exists |

Therefore restore cannot blindly insert/upsert migration-created rows. Seed ownership and portable data ownership must be explicit in the relation/segment registry.

## 3. Snapshot consistency discovery

A stable-key streaming algorithm alone does not guarantee one database state. The authoritative export boundary is one PostgreSQL MVCC snapshot.

Required adapter behavior:

- one read-only `REPEATABLE READ` transaction for all source observations/segments; or
- equivalent `pg_export_snapshot()` semantics for multiple readers, with every reader importing the same snapshot before querying;
- migration count/latest migration, current-generation pointer, compatibility observations, and all authority segments are observed inside that same snapshot;
- each segment descriptor binds to one common snapshot-boundary checksum;
- independent REST/API pagination without common DB snapshot is non-authoritative evidence;
- no write lock/stop-the-world catalog lock is introduced.

Required negative fixture: change canonical authority/current pointer concurrently after one segment is read and prove one trusted export cannot combine pre-write and post-write state.

## 4. Restore load modes

The Plan 7 registry must support at least:

| `loadMode` | Meaning |
|---|---|
| `VALIDATE_PRESEEDED` | Git migration already created a seed/reference/singleton row. Verify exact seed identity/content; never blind insert/upsert. Restore relation-specific mutable fields only through an exact keyed update contract. |
| `RESTORE_EXACT` | Restore exact stable IDs and persisted values. |
| `RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION` | Restore durable history/authority while forcing explicitly transient claim/lease state neutral. |
| `RECONSTRUCT_TRANSITIONAL_COMPATIBILITY` | Preserve/reconstruct current physical compatibility values required for pre-retirement schema/runtime equivalence without calling them canonical truth. |
| `DERIVED_REBUILD` | Do not import rows; use an exact deterministic rebuild source after canonical restore. |

One physical relation may have multiple logical segments when migration-seeded keys and runtime-created rows differ.

### Exact examples

- migration-seeded taxonomy/market registry keys → `VALIDATE_PRESEEDED`; any future non-seed portable extension row → `RESTORE_EXACT` under a distinct rule;
- governance policy seed rows → `VALIDATE_PRESEEDED` for migration-owned keys; additional exact policy history → `RESTORE_EXACT`;
- governance policy pointer singleton → validate singleton identity then restore exact mutable pointer fields through a keyed update;
- current-generation singleton → validate migration-created row, restore exact pointer fields **last**;
- release-schema-compatibility singleton → validate against target Git schema authority; do not treat source artifact as compatibility-promotion authority;
- `food_catalog_governance_outbox` / lease-bearing Plan 4 run rows → `RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION`;
- `food_catalog_search_documents` → `DERIVED_REBUILD`;
- current pre-retirement `food_items` → `RECONSTRUCT_TRANSITIONAL_COMPATIBILITY` because `food_name` is NOT NULL and current runtime/DB functions still depend on physical compatibility values.

## 5. Relation classification and load matrix

Classification is logical authority; load mode controls target behavior.

| Relation/family | Classification | Default load mode | Restore rule / discovery |
|---|---|---|---|
| `food_items` | **PORTABLE AUTHORITY** for stable `id` + **TRANSITIONAL PORTABLE COMPATIBILITY** for current physical mirrors | `RECONSTRUCT_TRANSITIONAL_COMPATIBILITY` | Preserve exact UUID and all physical compatibility values required by current schema/runtime. `id`-only insert is invalid because `food_name` is NOT NULL. Temporarily neutralize only cyclic `verified_source_record_id`, then reconstruct it exactly. |
| `food_source_records` | **PORTABLE AUTHORITY** | `RESTORE_EXACT` | Exact source IDs/Food links/provider identities/provenance/checksums; raw bytes only if legal policy allows. |
| `food_nutrition_revisions` | **PORTABLE AUTHORITY** | `RESTORE_EXACT` | Exact revisions, values, NULLs, basis, provenance/supersession. |
| `food_serving_options` | **PORTABLE AUTHORITY** | `RESTORE_EXACT` | Exact serving IDs/quantities; no fabricated conversion. |
| `food_names` | **PORTABLE AUTHORITY** | `RESTORE_EXACT` | Exact localized names/roles/locale/script/normalized identity. |
| `food_aliases` | **TRANSITIONAL PORTABLE COMPATIBILITY** | `RESTORE_EXACT` until retirement | Old search RPC still depends on stored rows and no independent deterministic rebuild source is defined. Do not classify derived merely because long-term architecture supersedes it. |
| `food_barcodes` | **PORTABLE AUTHORITY** | `RESTORE_EXACT` | KEEP; effective GTIN mapping. |
| `food_market_relevance` | **TRANSITIONAL PORTABLE COMPATIBILITY** | `RESTORE_EXACT` until retirement | Current rows are zero, but there is no authorization/rebuild basis to discard future stored rows before retirement. |
| `food_taxonomy_namespaces`, migration-seeded `food_taxonomy_nodes` | **PORTABLE AUTHORITY** | `VALIDATE_PRESEEDED` for seed keys; exact restore for approved non-seed keys | Migration seeds exist on a clean target. |
| `food_taxonomy_assignments` | **PORTABLE AUTHORITY** | `RESTORE_EXACT` | Exact assignment IDs/Food links. |
| `market_scopes`, `market_scope_memberships` | **PORTABLE AUTHORITY** | `VALIDATE_PRESEEDED` for seed keys; exact restore for non-seed keys | Search semantics depend on registry/hierarchy. |
| `food_market_assignments` | **PORTABLE AUTHORITY** | `RESTORE_EXACT` | Exact assignment IDs/Food links. |
| `food_verification_assertions` | **PORTABLE AUTHORITY** | `RESTORE_EXACT` | Exact assertion IDs/predecessor graph/state/policy/evidence. |
| `food_merge_events` | **PORTABLE AUDIT/HISTORY** | `RESTORE_EXACT` | Immutable merge explanation; generation redirects hold current-effective mapping. |
| `food_kitchens`, `food_subcategories` | **OUTSIDE GLOBAL AUTHORITY / KEEP PENDING EVIDENCE** | profile-specific exact/reference preservation | Old/system/user grouping; do not invent taxonomy replacement or delete. |
| `food_catalog_activation_sets`, `food_catalog_activation_set_members` | **PORTABLE AUTHORITY** | `RESTORE_EXACT` | Exact activation manifest/member/evidence identities. |
| `food_catalog_activation_events` | **PORTABLE AUDIT/HISTORY** | `RESTORE_EXACT` | Referenced grant/event identities preserved. |
| `food_catalog_generations` | **PORTABLE AUTHORITY** | `RESTORE_EXACT` | Exact UUID/policy/projection/checksums. |
| `food_catalog_generation_foods`, `_names`, `_servings`, `_taxonomy`, `_markets`, `_verification`, `_redirects` | **PORTABLE AUTHORITY** | `RESTORE_EXACT` | Exact complete composition; redirects flattened/cycle-free. |
| `food_catalog_generation_validation_reports`, `_findings`, `food_catalog_generation_events`, `food_catalog_control_operations` | **PORTABLE AUDIT/HISTORY** | `RESTORE_EXACT` | Exact validation/promotion/control evidence. |
| `food_catalog_current_generation` | **PORTABLE AUTHORITY** | `VALIDATE_PRESEEDED` + exact keyed pointer restore last | Singleton exists from migrations. Never blind insert/upsert. |
| `food_ingestion_batches`, `_batch_records`, `_control_operations`, `_manifest_records`, `_materialized_results`, `_operational_events`, `_quarantines`, `_quarantine_resolutions`, `_reconciliations`, `_release_diffs`, `_release_diff_records` | **PORTABLE AUDIT/HISTORY** | `RESTORE_EXACT` except explicit transient fields | Preserve reproducibility/history, not live worker credentials. |
| `food_ingestion_runs` | **PORTABLE AUDIT/HISTORY** with transient lease fields | `RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION` | Preserve durable result/history; restored worker state starts safe/unleased. |
| `food_catalog_search_nutrition_policies` | **PORTABLE AUTHORITY** when referenced | `RESTORE_EXACT` unless exact migration seed rule applies later | Search labels require exact policy version. |
| `food_catalog_search_documents` | **DERIVED / REBUILD** | `DERIVED_REBUILD` | Defined rebuild: `public.rebuild_food_catalog_search_projection_v2`. |
| `food_catalog_governance_principals`, capability assignments | **PROTECTED PORTABLE AUTHORITY/HISTORY** | `RESTORE_EXACT` while target remains operationally isolated | Preserve identities/history; external credentials/auth binding are not reactivated by restore. |
| `food_catalog_governance_policy_versions` | **PORTABLE AUTHORITY** | `VALIDATE_PRESEEDED` for seed key(s), `RESTORE_EXACT` for additional history | One seed exists today. |
| `food_catalog_governance_policy_pointer` | **PORTABLE AUTHORITY** | `VALIDATE_PRESEEDED` + exact keyed mutable-field restore | Singleton already exists. |
| correction cases/reports/member payloads/evidence/events | **PORTABLE AUDIT/HISTORY**; member payloads protected | `RESTORE_EXACT` | Exact workflow/evidence identity; owner payload protected. |
| governance authority revisions | **PORTABLE AUTHORITY** | `RESTORE_EXACT` | Exact CAS/current fact revision state. |
| governance operations/audit/lifecycle/service proposals/barcode corrections | **PORTABLE AUDIT/HISTORY** | `RESTORE_EXACT` | Exact operation/event/checksum history. |
| `food_catalog_governance_outbox` | **PORTABLE AUDIT/HISTORY** + transient claims | `RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION` | Preserve event/payload/delivery history; do not restore live claim owner/token/lease. |
| serving/name fact lineages + revisions | **PORTABLE AUTHORITY** | `RESTORE_EXACT` | Exact lineage/revision identity. |
| `food_personal_overrides`, revisions | **PROTECTED PORTABLE OWNER AUTHORITY** | `RESTORE_EXACT` | Exact owner/Food/revision/tombstone/pointer semantics. |
| `food_personal_override_operations` | **PROTECTED PORTABLE AUDIT/HISTORY** | `RESTORE_EXACT` | Exact owner operation/idempotency history. |
| `food_personal_corrections` | **TRANSITIONAL OWNER STATE** | protected exact preservation until cutover; later no-op or explicit migration | Current count zero is not future discard authority. |
| `food_favorites` | **OWNER OVERLAY / REFERENCE STATE** | protected/user portability as required | Current Plan 5 favorite authority for global Food IDs; not global canonical truth. |
| `user_food_items` | **MY FOODS / OUTSIDE GLOBAL AUTHORITY** | separate owner export/reference | Never convert into global canonical Foods. |
| `user_food_favorites` | **TRANSITIONAL OWNER STATE** | protected exact preservation until row-classified reconciliation | Heterogeneous key model; no blanket conversion. |
| `food_logs`, canonical Nutrition Recipe/Saved Meal/Meal Plan families, legacy Food consumer FK rows | **OUTSIDE FOOD CATALOG / REFERENCE ONLY** | controlled extracts/fixtures only for Plan 7 global proof | Frozen snapshots are not rewritten. |
| `release_schema_compatibility` | **TARGET/SCHEMA REFERENCE** rather than Food Catalog data authority | `VALIDATE_PRESEEDED` | Source compatibility values are evidence, not authorization to promote target compatibility. |

## 6. Field-level transient exclusions

`food_catalog_governance_outbox` currently includes claim owner/principal, lease token/epoch/acquired/expires fields in addition to durable event/delivery state. `lease_token` and current resumable claim state are never portable operational authority. Any audit retention of claim timing/owner must be explicitly non-resumable.

Plan 4 run/lease state follows the same rule: deterministic manifest/reconciliation/result evidence is portable; live worker lease ownership is transient.

## 7. Lossless scalar transport inventory requirement

A canonicalizer must not receive already-rounded JS values.

The export adapter must keep PostgreSQL type identity and lossless text/token representation for:

- microsecond `timestamp`/`timestamptz`;
- `bigint` beyond JS safe integers;
- arbitrary/high-precision `numeric`;
- JSONB nested numeric tokens;
- exact NULL/zero distinction.

Transport numeric text is preserved for restore. Semantic decimal hashing normalizes decimal value without binary float. JSONB canonicalization uses lossless numeric tokens, sorted object keys, and preserved array order unless the registry explicitly declares set semantics. Exact restore proof compares typed PostgreSQL values after round-trip.

## 8. Consumer/dependency matrix

| Consumer | Current boundary/use | Classification | Required proof before retirement |
|---|---|---|---|
| Food Library global search | `food-library.ts → search_food_catalog_v2` | **V2 search** | Keep V2; no old-RPC fallback for global results. |
| selected Food handoff | `food-handoff.ts → resolveCatalogFood` + `food_personal_corrections` | **MIXED TRANSITIONAL** | Current-generation resolver + Plan 6 owner override cutover. |
| older Food browser/category | `services/database/nutrition.ts`, `food-browser.tsx` → direct `food_items.*` + Egyptian local fallback | **LEGACY PHYSICAL** | Global catalog uses V2/domain. Egyptian data becomes explicitly non-canonical/manual suggestion only. |
| Diary/Eat new handoff | handoff route → legacy catalog resolution then frozen snapshot | **MIXED TRANSITIONAL** | Change only new resolution authority; historical snapshot stays frozen. |
| older Eat add-food | legacy database Nutrition helpers | **MIXED TRANSITIONAL** | Prove all global selections use domain/V2. |
| Recipe ingredient handoff | legacy resolver then frozen ingredient/nutrition | **MIXED TRANSITIONAL** | Resolve generation-authoritative Food before freezing. |
| Recipe verification | `getCatalogVerificationStates` → root `is_verified` | **LEGACY COMPATIBILITY** | Use generation-selected trust/assertions. |
| Saved Meals / Meal Plans | legacy Food resolver before frozen item/occurrence | **MIXED TRANSITIONAL** | Current-generation/domain resolution for new writes. |
| planned-meal prompt context | direct flat `food_items` fields | **LEGACY PHYSICAL** | Approved generation/domain prompt projection. |
| MCP / AI Food search | legacy `searchCatalogFoodsByName` in some flows | **MIXED TRANSITIONAL** | `search_food_catalog_v2`/logical service. |
| MCP write handoff | V2 listing may still resolve through legacy handoff | **MIXED TRANSITIONAL** | Same handoff cutover. |
| barcode DB authority | `food_catalog_lookup_effective_barcode` | **CURRENT DOMAIN AUTHORITY** | KEEP. |
| barcode Product/UI | provider-assisted route currently reachable | **POLICY CUTOVER REQUIRED** | Local canonical lookup first; provider only on canonical miss, suggestion/evidence only. |
| admin quality | direct flat Food scan | **LEGACY PHYSICAL** | Generation/canonical quality read model. |
| My Food duplicate hint | `findCatalogDuplicateByName` | **LEGACY ADVISORY** | V2/current-generation exact/strong normalized advisory suggestion; never merge/block automatically. |
| privacy export | canonical Nutrition plus old corrections/favorites; Plan 6 override family missing | **OWNER-DATA GAP** | Export Plan 6 owner authority before old correction retirement. |
| account deletion | Plan 6 canonical purge RPC | **CURRENT DOMAIN AUTHORITY** | KEEP; verify coverage of any future Plan 7 owner relation. |
| current-generation service | generation-authoritative resolver already available | **TARGET AUTHORITY AVAILABLE** | Product call-site adoption still required. |
| deployed Production artifact | may remain pre-cutover even after repository merge | **MANDATORY LIVE GATE** | Exact deployed SHA + live behavior + read-only dependency evidence must prove cutover before DROP. |
| Activity Catalog | separate service | **OUTSIDE PLAN 7** | Never mutate. |

### Transitional Egyptian dataset boundary

`@/data/egyptian-foods` may remain before first Catalog Generation only as an explicitly typed non-canonical/manual suggestion source. It may prefill My Food/manual text UX, but it must not create fake global Food IDs, enter `source='catalog'` handoffs without independent canonical resolution, become global search authority, or fabricate verified provenance. Once a current generation exists, global catalog results are exclusively generation/search-authoritative.

## 9. Exact legacy-retirement candidate matrix

### 9.1 Root `food_items`

| Candidate | Current state | Recommendation | Exact preconditions |
|---|---|---|---|
| `id` | stable anchor referenced across Plans 1–6 and consumers | **KEEP** | Never remap. |
| `food_name` | NOT NULL; legacy resolver/browser/admin/prompt/old search and ingestion compatibility | **RETIRE AFTER PRECONDITION** | all Product + DB functions cut over; current pre-retirement export preserves exact value until then. |
| `serving_size` | legacy resolver/browser/search/ingestion compatibility | **RETIRE AFTER PRECONDITION** | generation serving semantics/new handoff approved; no DB writer dependency. |
| flat nutrition/basis columns | compatibility mirror read by legacy paths | **RETIRE AFTER PRECONDITION** | current-generation nutrition + Plan 6 personal override cutover; DB writers no longer mirror. |
| `category`, `cuisine` | old browser/search compatibility | **RETIRE AFTER PRECONDITION** | exact Product replacement proven. |
| `is_verified`, `verified_at`, `verified_source_record_id` | legacy verification; composite source FK cycle | **RETIRE AFTER PRECONDITION** | recipe/search consumers cut over; dependent DB functions/FK migrated; restore cycle workaround then removed. |
| `is_market_global` | transitional ingestion market mirror | **RETIRE AFTER PRECONDITION** | canonical market assignments cover behavior; no readers/writers/deps. |
| `merged_into_food_id` | legacy resolver + Plan 6 merge/lifecycle guards | **RETIRE AFTER PRECONDITION** | Product uses generation redirects and DB write/governance functions move to approved non-flat merge authority. |
| `lifecycle_status` | active governance/write-plane state | **KEEP** | separate lifecycle-write replacement required before candidate status. |
| `tags`, `notes`, `source_type`, `is_global`, `is_editable_by_user`, `created_by`, `kitchen_id`, `subcategory_id`, `brand_name` | Product/history meaning not fully replaced | **KEEP / UNKNOWN PENDING EVIDENCE** | prove exact meaning/replacement and obtain later Planner approval per field. Do not invent a destination to enable deletion. |

### 9.2 Tables/functions/files

| Candidate | Verified current purpose | Recommendation | Preconditions |
|---|---|---|---|
| `food_aliases` | stored compatibility rows used by old search; no exact independent rebuild | **RETIRE AFTER PRECONDITION** | preserve exact transitional rows until old RPC/deps gone; then retire explicitly. |
| `food_market_relevance` | Batch-0-era market compatibility; current zero rows/no known current reader | **RETIRE AFTER PRECONDITION** | repository + DB + deployed/external/reporting dependency evidence clean immediately before retirement. Zero rows is not authorization. |
| `search_nutrition_food_library(...)` | old authenticated/service-role search still granted | **RETIRE AFTER PRECONDITION** | all Product/MCP/external contracts off; live deployed proof; revoke/observe/drop through approved sequence. |
| `search_food_catalog_v2(...)` | current Plan 5 search | **KEEP** | may be forward-updated for Plan 6 personal overrides while preserving boundary. |
| public search rebuild | current deterministic rebuild | **KEEP** | required for restore verification. |
| private Plan 5 legacy rebuild helper | current public rebuild depends on it | **KEEP** now | only retire after independent replacement + exact search equivalence. |
| legacy `resolveCatalogFood` | root resolver + merge chain | **RETIRE AFTER PRECONDITION** | all new-write handoffs generation-authoritative and deployed. |
| legacy `getCatalogVerificationStates` | root verification | **RETIRE AFTER PRECONDITION** | recipe paths generation/trust-authoritative and deployed. |
| legacy `searchCatalogFoodsByName` | MCP legacy flat search | **RETIRE AFTER PRECONDITION** | MCP V2 and deployed. |
| legacy `findCatalogDuplicateByName` | advisory duplicate hint | **RETIRE AFTER PRECONDITION** | approved V2 advisory replacement deployed. |
| `getGlobalFoods/getFoodCategories` | direct root browser/category + local fallback | **RETIRE AFTER PRECONDITION** | global catalog V2; Egyptian suggestions isolated non-canonical. |
| planned-meal prompt direct Food reader | root metadata | **RETIRE AFTER PRECONDITION** | current-generation prompt projection. |
| admin-quality flat Food reader | flat macro/name metrics | **RETIRE AFTER PRECONDITION** | canonical/generation quality model. |
| `food_personal_corrections` | old owner overlay in search/handoff/privacy | **RETIRE AFTER PRECONDITION** | Product to Plan 6 overrides; live zero allows verified no-op only; any nonzero rows stop for explicit owner-preserving design. |
| Plan 6 personal overrides family | revisioned owner authority | **KEEP** | protected export/restore/privacy coverage. |
| `user_food_favorites` | heterogeneous legacy favorite keys + existing owner rows | **RETIRE AFTER PRECONDITION** | row-classified reconciliation, old consumer/privacy coverage, zero unmapped rows. |
| `food_favorites` | current global-Food owner favorite overlay | **KEEP** | owner state, not global truth. |
| `food_barcodes`, barcode corrections | effective GTIN + immutable correction history | **KEEP** | portable authority/history. |
| `food_kitchens`, `food_subcategories` | old/system/user grouping | **KEEP / UNKNOWN PENDING EVIDENCE** | resolve Product/owner semantics first. |
| generic direct global Food admin writes | already architecturally retired | **KEEP RETIRED / VERIFY** | ensure no grant/runtime reintroduced. |

## 10. Heterogeneous legacy favorite reconciliation

Current code defines legacy keys as:

- `favoriteKeyForFood(food)` → `food.id` when present, else normalized `food_name|serving_size`;
- `favoriteKeyForLog(log)` → `food_item_id`, else `user_food_item_id`, else normalized `food_name|serving_size`.

Therefore `user_food_favorites(food_key) → food_favorites(food_id)` is **not** a blanket migration.

Each row is classified:

1. exact UUID resolving to global `food_items.id` → may migrate to `food_favorites` for the same owner;
2. exact UUID resolving to the same owner's `user_food_items.id` → preserve My Food favorite semantics, never convert to global favorite;
3. text/log-derived key → preserve legacy owner semantics or move only to a separately approved owner-favorite model;
4. unknown/ambiguous → explicit blocker/preserved state.

Retirement requires zero unmapped owner rows and exact owner-preserving evidence.

## 11. `food_personal_corrections` cutover rule

Product reads/writes move to Plan 6 personal overrides. At exact live retirement preflight:

- count exactly zero → a verified no-op data migration is acceptable;
- any rows → **STOP** for explicit owner-preserving semantic migration design.

The current zero count does not authorize future discard.

## 12. Database dependencies blocking simplistic retirement

`food_items.id` fans out into canonical, governance, ingestion, generation, owner-overlay and consumer FK relations. Exact UUID preservation remains mandatory.

Current non-deferrable cycle:

- `food_source_records.food_id → food_items.id`;
- `(food_items.verified_source_record_id, food_items.id) → food_source_records(id, food_id)`.

Current routines discovered referencing flat/root state include lifecycle/authority locks, merge guard, recipe preseed, generation creation, activation grant, ingestion persistence, correction/duplicate services, and old `search_nutrition_food_library`. Therefore TypeScript cleanup alone is never sufficient for root-column retirement.

## 13. Search rebuild verification inventory

Current boundaries:

- `public.rebuild_food_catalog_search_projection_v2(uuid,text,text)` — service-role executable;
- `public.search_food_catalog_v2(...)` — authenticated + service-role current search;
- old `public.search_nutrition_food_library(...)` — still authenticated + service-role executable;
- private Plan 5 legacy rebuild helper — not directly granted, but current public rebuild calls it.

Golden restore tests retain exact/alias/prefix/contains, locale/script, direct/parent/GLOBAL market, category/current cuisine, nullable numeric filters, policy presets, nullable global serving, owner favorites/recent/My Foods, cursor continuation/context rejection, redirect and stale-generation isolation.

SearchDocument is the valid `DERIVED_REBUILD` example because the deterministic rebuild source exists.

## 14. Privacy/account-lifecycle gap

Current `lib/privacy/data-export.ts` includes canonical Nutrition V1 owner data, `food_personal_corrections`, and `food_favorites`, but not:

- `food_personal_overrides`;
- `food_personal_override_revisions`;
- `food_personal_override_operations`.

Account deletion already uses Plan 6 canonical purge authority. Plan 7 must close privacy/export portability before old correction state can retire.

## 15. Artifact validity, recovery eligibility, and profiles

Pure artifact validity checks format/profile, snapshot binding, required segments, hashes, typed/lossless semantics, schema profile, ownership, secret/transient exclusions. Artifact age alone is not validity failure.

Recovery/cutover eligibility separately accepts caller-supplied `maxArtifactAge`/RPO. There is no universal Plan 7 TTL.

Profiles:

- `CORE_PORTABLE`: global canonical + required non-personal audit/history/policy; can prove identity/generation/search portability; cannot emit final DR-ready.
- `FULL_DR`: CORE plus protected governance/security history, protected owner Food Catalog state, and external identity mapping prerequisites; only this profile may satisfy final DR readiness.

CI uses deterministic protected fixtures and ephemeral keys only; never Production PII/security plaintext.

## 16. Protected encryption/security policy inventory

Protected segments use AES-256-GCM with fresh random nonce per segment/run. Key material is external; CI uses ephemeral test keys; no plaintext fallback; no keys in Git/manifest/logs/evidence.

Track separately:

- deterministic canonical plaintext semantic SHA-256;
- randomized ciphertext/transport SHA-256.

Manifest semantic root depends on plaintext semantic hashes, not ciphertext/nonces.

Cross-environment restore preserves governance identity/capability/policy/audit history but does not automatically reactivate external authority. Service credentials are rotated/rebound separately; human identity binding is validated before enablement; `food.outbox.deliver` remains unavailable until replay reconciliation; target remains operationally isolated pending authorization cutover.

## 17. Frozen Product policy inventory

- **Barcode:** normalized GTIN → local canonical lookup first → provider only on canonical miss → provider result suggestion/evidence only.
- **Duplicate hint:** V2/current-generation exact/strong normalized advisory match; user may ignore; never merge/mutate/block automatically.
- **Raw source evidence:** DB provenance + checksum-addressed references by default; source bytes only when legal/retention policy permits.
- **Root metadata:** `tags`, `notes`, `source_type`, `is_global`, `is_editable_by_user`, `created_by`, `kitchen_id`, `subcategory_id`, `brand_name` remain KEEP / UNKNOWN PENDING EVIDENCE.

## 18. Live read-only retirement preflight contract

Immediately before a destructive set is even approvable, capture exact read-only evidence for:

- target project, migration count/latest identity, reconciled ledger;
- exact deployed application artifact SHA and cutover behavior;
- current generation/pointer/compatibility;
- candidate columns/tables/functions/signatures;
- constraints/FKs/views/functions/dependency catalogs;
- execution grants/policies;
- candidate row/non-null counts;
- owner-row classifications and zero unmapped rows for retirement candidates;
- repository non-historical references at exact candidate head;
- external/reporting/live dependency evidence;
- historical consumer Food references;
- exact fresh disposable portability proof for this schema/deployed-cutover state.

Any mismatch stops. `DROP ... CASCADE` is not dependency discovery.

Representative queries remain read-only, for example:

```sql
select count(*) as migration_count, max(version) as latest_version
from supabase_migrations.schema_migrations;

select current_generation_id, current_event_id,
       current_validation_report_id, pointer_revision
from public.food_catalog_current_generation
where singleton_key is true;

select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public'
  and table_name in ('food_items','food_aliases','food_market_relevance','food_personal_corrections');
```

Nonzero is not automatic failure; unknown/unapproved nonzero disposition is a stop condition.

## 19. Workstream 2 live deployment dependency

The repository is not currently ready for destructive retirement. Later sequence must be:

1. repository consumer cutover verified;
2. backward-compatible DB expand/reconciliation authority separately reviewed/applied if required;
3. consumer-cutover artifact deployed under separate authorization;
4. exact deployed SHA + live compatibility behavior proven;
5. read-only observation proves no live consumer requires candidate objects;
6. exact retirement preflight;
7. Planner approval of exact destructive set;
8. forward retirement migration applied only under separate Production authorization;
9. fresh read-back plus portability/search re-proof.

Production DROP while the deployed application is pre-cutover is prohibited.

## 20. Migration identity rule

No Plan 7 migration timestamp/path is reserved in this long-running plan. At the exact implementation task that needs SQL: read then-current `main`, inspect latest repository/Production migration authority, allocate next safe identity, record it in PR/task evidence, then create SQL. Never silently rename an applied migration.

## 21. Discovery conclusion

Workstream 1 architecture is identifiable, but its implementation remains unauthorized. Workstream 2 is additionally blocked by active compatibility consumers, DB-function dependencies, live deployment sequencing, owner-state reconciliation, and per-object evidence.

The independent Planner findings are now reflected as architecture constraints rather than open implementation choices. Destructive retirement remains unavailable until all expand/deploy/contract gates and exact live preconditions succeed and the Planner explicitly authorizes the destructive set.
