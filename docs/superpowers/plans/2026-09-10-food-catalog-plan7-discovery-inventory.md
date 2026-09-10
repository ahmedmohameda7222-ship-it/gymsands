# Food Catalog Plan 7 Discovery Inventory

Status: **Repository + read-only Production discovery; no implementation authority**  
Date: **2026-09-10**  
Reviewed repository baseline: `main@7f2882d6ad3c67489622ff4be68a4506a2722319`  
Production project inspected read-only: `bkwezjxvapaeasfvlhvv`  
Design: `docs/superpowers/specs/2026-09-10-food-catalog-plan7-portability-retirement-design.md`

## 1. How to read this inventory

Labels:

- **VERIFIED CURRENT FACT** — observed in current repository or read-only Production.
- **ARCHITECTURE REQUIREMENT** — binding parent/Plan 1–6 authority or explicit Plan 7 requirement.
- **PROPOSED PLAN 7 DESIGN** — candidate architecture/implementation shape requiring Planner approval.
- **OPEN POLICY DECISION** — evidence is insufficient or Product/security policy must be chosen by Planner.

Retirement recommendations:

- **KEEP** — current long-term or still-required authority.
- **RETIRE AFTER PRECONDITION** — candidate only after exact consumers/data/dependencies are migrated/proven.
- **RETIRE NOW CANDIDATE** — no known current dependency, but still requires the standard live preflight and a separately authorized forward migration.
- **UNKNOWN / NEEDS EVIDENCE** — current semantics/replacement are not sufficiently defined for a retirement recommendation.

This inventory intentionally does not treat immutable historical migration text as an active runtime consumer.

## 2. Verified repository and Production baseline

**VERIFIED CURRENT FACT**:

- `main = 7f2882d6ad3c67489622ff4be68a4506a2722319`;
- Production physical migration count = `123`;
- latest = `20260910071241_food_catalog_governance_gtin_lock_exactness`;
- migration ledger is reconciled with pending/unresolved/schema-untracked counts all `0`;
- global Food/source/ingestion/generation/search populations requested in the Plan 7 baseline are `0`;
- current generation = `NULL`, pointer revision = `0`;
- schema compatibility = `2`, released compatibility marker = `20260724232734`;
- Activity Catalog is separate and not inspected/mutated as a Plan 7 target.

Read-only discovery also found:

- `food_aliases = 0`;
- `food_market_relevance = 0`;
- `food_barcodes = 0`;
- `food_personal_corrections = 0`;
- `food_favorites = 0`;
- `user_food_favorites` has existing owner data;
- `user_food_items` has existing owner data.

The final two facts are important: an empty global catalog is not evidence that user-owned transitional state may be deleted.

## 3. Current Food Catalog relation classification matrix

Classification is at logical-row level unless a field-level exception is stated.

| Relation | Plan/current purpose | Classification | Restore rule / explanation |
|---|---|---|---|
| `food_items` | stable global Food identity root plus transitional flat fields | **PORTABLE AUTHORITY** for `id`/required identity anchors; compatibility fields mixed | Preserve exact Food UUIDs. Do not promote flat name/nutrition/verification/etc. to canonical authority. |
| `food_source_records` | immutable/versioned source provenance | **PORTABLE AUTHORITY** | Preserve exact IDs, Food links, provider/source identities, payload/checksum provenance allowed by retention policy. |
| `food_nutrition_revisions` | immutable canonical nutrition revisions | **PORTABLE AUTHORITY** | Exact revision IDs, values, `NULL`, basis, provenance/supersession semantics. |
| `food_serving_options` | canonical serving facts | **PORTABLE AUTHORITY** | Preserve exact serving IDs and authoritative quantities; never fabricate conversion. |
| `food_names` | canonical localized name facts | **PORTABLE AUTHORITY** | Preserve exact name IDs/locale/script/role/normalized identity. |
| `food_aliases` | fixed-locale transitional alias projection | **DERIVED / REBUILD** after consumer migration | Parent architecture marks fixed-locale alias compatibility transitional. Until retirement it may be needed by old search RPC. |
| `food_barcodes` | effective GTIN/barcode mapping | **PORTABLE AUTHORITY** | KEEP; Plan 6 correction history resolves effective mapping through this relation. |
| `food_market_relevance` | Batch-0-era market relevance compatibility model | **DERIVED / REBUILD** candidate | No current Product/runtime repository reader found; live DB scan found no current routine reader. Retirement still needs standard preflight. |
| `food_taxonomy_namespaces` | canonical taxonomy registry | **PORTABLE AUTHORITY** | Exact namespace codes/policies. |
| `food_taxonomy_nodes` | canonical taxonomy nodes | **PORTABLE AUTHORITY** | Exact node identities/hierarchy. |
| `food_taxonomy_assignments` | Food taxonomy fact assignments | **PORTABLE AUTHORITY** | Exact assignment IDs/Food links/source authority. |
| `market_scopes` | canonical market scope registry | **PORTABLE AUTHORITY** | Search semantics depend on active scope registry. |
| `market_scope_memberships` | market hierarchy | **PORTABLE AUTHORITY** | Preserve exact hierarchy; search recursively evaluates parents. |
| `food_market_assignments` | canonical Food market assignments | **PORTABLE AUTHORITY** | Exact assignment IDs/Food links. |
| `food_verification_assertions` | immutable scoped verification chain | **PORTABLE AUTHORITY** | Preserve exact assertion IDs, predecessor graph, state/policy/evidence. |
| `food_merge_events` | immutable global merge history | **PORTABLE AUDIT/HISTORY** with identity semantics | Required to explain merges; current-effective redirect comes from generation composition. |
| `food_kitchens` | legacy/system + user UI kitchen grouping | **OUTSIDE FOOD CATALOG / REFERENCE ONLY** pending replacement evidence | Root compatibility fields still reference it; user rows possible. Do not absorb into canonical taxonomy or delete. |
| `food_subcategories` | legacy kitchen subcategory grouping | **OUTSIDE FOOD CATALOG / REFERENCE ONLY** pending replacement evidence | Same as `food_kitchens`; not equivalent to canonical taxonomy by assumption. |
| `food_catalog_activation_sets` | immutable activation manifest | **PORTABLE AUTHORITY** | Generation active members reference activation authority. |
| `food_catalog_activation_set_members` | exact activation membership/evidence outcome | **PORTABLE AUTHORITY** | Preserve exact member IDs/Food links/checksum/evidence. |
| `food_catalog_activation_events` | grant/invalidation execution history | **PORTABLE AUDIT/HISTORY** | Exact event/grant identity may be referenced by generation composition. Where referenced, identity is mandatory. |
| `food_catalog_generations` | immutable Catalog Generation root | **PORTABLE AUTHORITY** | Exact generation UUID, policy/projection versions and composition checksums. |
| `food_catalog_generation_foods` | generation Food/lifecycle/nutrition/activation composition | **PORTABLE AUTHORITY** | Sole current-effective composition when pointer selects generation. |
| `food_catalog_generation_names` | generation-selected name IDs | **PORTABLE AUTHORITY** | Exact selected IDs. |
| `food_catalog_generation_servings` | generation-selected serving IDs | **PORTABLE AUTHORITY** | Exact selected IDs; no implicit preferred-serving inference. |
| `food_catalog_generation_taxonomy` | generation-selected taxonomy assignments | **PORTABLE AUTHORITY** | Exact selected IDs. |
| `food_catalog_generation_markets` | generation-selected market assignments | **PORTABLE AUTHORITY** | Exact selected IDs. |
| `food_catalog_generation_verification` | generation-selected verification assertions | **PORTABLE AUTHORITY** | Exact scope/assertion selection. |
| `food_catalog_generation_redirects` | flattened current-generation redirects | **PORTABLE AUTHORITY** | Exact pairs; verifier proves target active, no self/cycle/chain. |
| `food_catalog_generation_validation_reports` | immutable validation evidence/checksum | **PORTABLE AUDIT/HISTORY** required for promotion interpretation | Preserve exact report IDs/checksums/policy counts. |
| `food_catalog_generation_validation_findings` | immutable validation findings | **PORTABLE AUDIT/HISTORY** | Preserve exact findings and Food/evidence references. |
| `food_catalog_generation_events` | promotion/rollback/revocation history | **PORTABLE AUDIT/HISTORY** | Preserve exact IDs/from/to/checksum/report/principal context. |
| `food_catalog_control_operations` | generation/control idempotency/evidence | **PORTABLE AUDIT/HISTORY** | Preserve operation IDs/checksums/results required to explain commands. |
| `food_catalog_current_generation` | singleton current pointer | **PORTABLE AUTHORITY** | Restore **last** after complete validation; exact IDs and `pointer_revision`. |
| `food_ingestion_batches` | semantic batch root/manifest identity | **PORTABLE AUDIT/HISTORY** with reproducibility semantics | Preserve semantic batch identity/checksum/history. |
| `food_ingestion_runs` | run/result + lease state | **PORTABLE AUDIT/HISTORY**, field-level transient exclusion | Preserve durable run/result identity; do not restore active worker/lease ownership as resumable state. |
| `food_ingestion_batch_records` | Batch-0/ingestion membership | **PORTABLE AUDIT/HISTORY** | Preserve reproducibility/source linkage while schema retains it. |
| `food_ingestion_control_operations` | ingestion idempotency/control evidence | **PORTABLE AUDIT/HISTORY** | Preserve operation/checksum/result history. |
| `food_ingestion_manifest_records` | deterministic manifest content | **PORTABLE AUDIT/HISTORY** | Plan 4 deterministic manifest content is reproducibility authority. |
| `food_ingestion_materialized_results` | deterministic persist outcome | **PORTABLE AUDIT/HISTORY** | Preserves candidate→Food/materialization audit. |
| `food_ingestion_operational_events` | append-only ingestion lifecycle evidence | **PORTABLE AUDIT/HISTORY** | Preserve durable events, not external worker credentials. |
| `food_ingestion_quarantines` | immutable/controlled quarantine cases | **PORTABLE AUDIT/HISTORY** | Required to explain blocked candidates. |
| `food_ingestion_quarantine_resolutions` | resolution history | **PORTABLE AUDIT/HISTORY** | Exact resolution/food references. |
| `food_ingestion_reconciliations` | deterministic reconciliation result/checksum | **PORTABLE AUDIT/HISTORY** | Reproducibility evidence. |
| `food_ingestion_release_diffs` | immutable release-diff root | **PORTABLE AUDIT/HISTORY** | Preserve release-diff identity/checksum. |
| `food_ingestion_release_diff_records` | release-diff members | **PORTABLE AUDIT/HISTORY** | Preserve deterministic diff detail. |
| `food_catalog_search_nutrition_policies` | deterministic search-label policy input | **PORTABLE AUTHORITY** | Required if current generation/search uses a policy version; do not derive thresholds ad hoc. |
| `food_catalog_search_documents` | generation-keyed search projection | **DERIVED / REBUILD** | Do not use dump as canonical restore input. Rebuild from restored generation authority. |
| `food_catalog_governance_principals` | governance subject/role-class authority | **PORTABLE AUTHORITY** in protected security segment | Preserve IDs/history; active reauthorization semantics are Planner policy. |
| `food_catalog_governance_capability_assignments` | grant/revoke authority | **PORTABLE AUTHORITY** in protected security segment | Exact grant IDs/history; active-state reactivation gated by policy. |
| `food_catalog_governance_policy_versions` | immutable governance evidence policy | **PORTABLE AUTHORITY** | Exact policy versions/content. |
| `food_catalog_governance_policy_pointer` | current governance policy pointer | **PORTABLE AUTHORITY** | Restore after policy versions; exact revision. |
| `food_catalog_correction_cases` | correction workflow state/history | **PORTABLE AUDIT/HISTORY** | Needed to explain approved/applied global corrections. |
| `food_catalog_correction_reports` | durable report metadata | **PORTABLE AUDIT/HISTORY** | Preserve report IDs/case links. |
| `food_catalog_correction_report_member_payloads` | owner-authored report payload | **PORTABLE AUDIT/HISTORY** in protected user segment | Owner data; exact owner mapping/privacy protection required. |
| `food_catalog_correction_evidence` | correction evidence | **PORTABLE AUDIT/HISTORY** | Preserve exact evidence IDs/source links. |
| `food_catalog_correction_events` | state transition history | **PORTABLE AUDIT/HISTORY** | Preserve exact revisions/principal/operation/policy. |
| `food_catalog_governance_authority_revisions` | CAS/current mutation revision authority | **PORTABLE AUTHORITY** | Exact Food/kind/key revision and current fact ID where present. |
| `food_catalog_governance_operations` | command/idempotency history | **PORTABLE AUDIT/HISTORY** | Exact operation IDs/semantic checksums/results. |
| `food_catalog_governance_audit_events` | immutable governance audit | **PORTABLE AUDIT/HISTORY** | Preserve exact audit chain/context/checksums. |
| `food_catalog_governance_lifecycle_events` | immutable lifecycle history | **PORTABLE AUDIT/HISTORY** | Preserve replacement/withdraw/restore history. |
| `food_catalog_governance_outbox` | event delivery + active claim/lease fields | **PORTABLE AUDIT/HISTORY**, field-level transient exclusion | Preserve event/payload/final delivery history as approved; **never restore active claim owner, lease token, or live lease as resumable authority**. |
| `food_catalog_service_proposals` | service-origin correction proposals | **PORTABLE AUDIT/HISTORY** | Preserve proposal/operation/Food/policy identity. |
| `food_catalog_barcode_corrections` | immutable GTIN correction history | **PORTABLE AUDIT/HISTORY** tied to barcode authority | Required to explain effective mapping. |
| `food_catalog_serving_fact_lineages` | stable serving correction lineage | **PORTABLE AUTHORITY** | Exact lineage identity/current semantics. |
| `food_catalog_serving_fact_revisions` | immutable serving lineage revisions | **PORTABLE AUTHORITY** | Exact revisions/supersession/fact references. |
| `food_catalog_name_fact_lineages` | stable name correction lineage | **PORTABLE AUTHORITY** | Exact lineage identity/current semantics. |
| `food_catalog_name_fact_revisions` | immutable name lineage revisions | **PORTABLE AUTHORITY** | Exact revisions/supersession/fact references. |
| `food_personal_overrides` | owner-scoped current override pointer | **PORTABLE AUTHORITY** in protected owner segment | Exact `(user_id,food_id)` ownership/current revision/pointer revision. |
| `food_personal_override_revisions` | immutable owner override history | **PORTABLE AUTHORITY** in protected owner segment | Exact revision IDs/supersession/tombstones; owner must map exactly. |
| `food_personal_override_operations` | owner override idempotency/history | **PORTABLE AUDIT/HISTORY** in protected owner segment | Exact operation IDs/checksums/results; never cross-owner. |
| `food_personal_corrections` | pre-Plan-6 owner correction overlay still read by current search/handoff | **OUTSIDE GLOBAL AUTHORITY / TRANSITIONAL OWNER STATE** | Must migrate owner-visible semantics/data before retirement; not canonical global truth. |
| `food_favorites` | current Nutrition V1 catalog favorite overlay | **OUTSIDE FOOD CATALOG / REFERENCE ONLY** | Owner data used by current Plan 5 search; include in user portability/golden fixtures, not global export truth. |
| `user_food_items` | My Foods | **OUTSIDE FOOD CATALOG / REFERENCE ONLY** | Separate owner authority by invariant; may participate in protected user export and search fixture only. |
| `user_food_favorites` | older food-key favorite model | **OUTSIDE FOOD CATALOG / TRANSITIONAL OWNER STATE** | Existing owner data prevents blind deletion; requires reconciliation/cutover. |
| `food_logs` | Diary historical/current logs and ranking usage | **OUTSIDE FOOD CATALOG / REFERENCE ONLY** | Frozen consumer facts/history not rewritten; controlled fixture may use usage rows for golden search ranking. |
| `nutrition_recipes` + recipe/version/draft/action/equipment/ingredient family | canonical Nutrition user authority | **OUTSIDE FOOD CATALOG / REFERENCE ONLY** | Verify Food references/frozen nutrition remain valid; do not absorb into global export. |
| `nutrition_saved_meals` + items | canonical Saved Meal user authority | **OUTSIDE FOOD CATALOG / REFERENCE ONLY** | Frozen item snapshots remain unchanged. |
| `nutrition_meal_plan_weeks` + planned occurrences/change requests | canonical Meal Plan user authority | **OUTSIDE FOOD CATALOG / REFERENCE ONLY** | Frozen occurrence snapshots remain unchanged. |
| legacy `custom_meal_items`, `meal_food_items`, `user_meal_plan_items` | historical/legacy consumer refs to Food IDs | **OUTSIDE FOOD CATALOG / REFERENCE ONLY** | Existing FKs use `ON DELETE SET NULL`; Plan 7 must preserve Food IDs, not rewrite snapshots. |

### Field-level transient exclusions

**VERIFIED CURRENT FACT** — `food_catalog_governance_outbox` contains `claim_owner`, `claim_principal_id`, `lease_token`, `lease_epoch`, `lease_acquired_at`, and `lease_expires_at` in addition to durable event/delivery fields.

**PROPOSED PLAN 7 DESIGN** — portable export must not make those current claim/lease fields active on a restored environment. `lease_token` is excluded. Any historical claim-owner/timing values retained for audit must be explicitly non-resumable metadata; the restored operational claim state starts unclaimed.

**VERIFIED CURRENT FACT** — Plan 4 run/lease architecture similarly separates semantic batch/result evidence from volatile lease owner/token/epoch/heartbeat timing. Export preserves reproducibility history while restored workers start from a safe non-leased state unless a separately designed recovery command explicitly decides otherwise.

## 4. Consumer/dependency matrix

| Consumer | Current repository path / boundary | Current authority use | Classification | Required migration proof before retirement |
|---|---|---|---|---|
| Food Library global search | `services/nutrition-v1/server/food-library.ts` → `search_food_catalog_v2` | Plan 5 generation-derived SearchDocuments + `food_favorites` | **V2 for search** | Keep V2 search and prove no fallback to old RPC for global results. |
| Food Library selected Food handoff | `services/nutrition-v1/server/food-handoff.ts` | `resolveCatalogFood()` flat root + `food_personal_corrections` | **MIXED TRANSITIONAL** | Move catalog source to current-generation/domain resolver + approved personal override model. |
| Food Library older browser surfaces | `services/database/nutrition.ts` `getGlobalFoods/getFoodCategories`; `components/meals/food-browser.tsx` | direct `food_items.*`, flat category/name + local Egyptian fallback | **LEGACY PHYSICAL** | Route global catalog browsing to Nutrition V1 Food Library/domain service; local fixture must not act as runtime global truth. |
| Eat/Diary new handoff | `/api/nutrition/v1/handoffs/commit` → `resolveFoodHandoff` → `logDiaryMeal` | legacy catalog resolution, then frozen canonical consumer snapshot | **MIXED TRANSITIONAL** | Change only new resolution source; preserve historical log snapshots exactly. |
| Eat older add-food flow | `components/meals/eat-add-food-surface.tsx` / database Nutrition helpers | direct/legacy global Food model still reachable | **MIXED TRANSITIONAL** | Prove all global selections use domain/V2 boundary. |
| Recipes — ingredient handoff | `/api/nutrition/v1/handoffs/commit`; recipe handoff/server paths | legacy resolver then frozen nutrition/ingredient identity | **MIXED TRANSITIONAL** | Resolve exact current-generation Food/fact IDs before freezing new ingredient snapshots. |
| Recipes — verification | `services/nutrition-v1/server/recipe-published.ts`, `recipe-workspace.ts` → `getCatalogVerificationStates` | root mutable `is_verified` | **LEGACY COMPATIBILITY** | Use generation-selected assertion/trust authority; preserve historical publication snapshots. |
| Saved Meals | handoff commit + `saved-meal-write-authority.ts` | legacy Food resolver then frozen item | **MIXED TRANSITIONAL** | Current-generation/domain resolution for all new writes. |
| Meal Plans | handoff commit | legacy Food resolver then frozen occurrence | **MIXED TRANSITIONAL** | Current-generation/domain resolution for all new writes. |
| Meal Plan AI/prompt context | `services/database/planned-meal-prompt-context.ts` consumed by Eat page | direct flat `food_items` fields such as names/tags/notes | **LEGACY PHYSICAL** | Replace with domain/current-generation prompt context whose unknowns remain unknown. |
| MCP / AI Food search | `lib/mcp/nutrition-v1-food-execution.ts`, `lib/mcp/tool-executor-implementation.ts` | `searchCatalogFoodsByName()` legacy flat search in some flows | **MIXED TRANSITIONAL** | Converge all global Food search on `search_food_catalog_v2`/logical service boundary. |
| MCP / AI Food write handoff | MCP Nutrition/Saved Meal paths | some V2 listing followed by legacy `resolveFoodHandoff` | **MIXED TRANSITIONAL** | Same handoff cutover as Product API. |
| Barcode — database authority | `food_catalog_lookup_effective_barcode(text)` | Plan 6 effective barcode + correction authority | **CURRENT DOMAIN AUTHORITY** | KEEP. |
| Barcode — current UI flows | Food Library/Diary/Meal Plan barcode components call `/api/food/open-food-facts` for provider-assisted lookup/name seed | provider-assisted UI, not confirmed local canonical-first | **MIXED / POLICY GAP** | Planner decides local canonical-first behavior; no provider may become runtime canonical authority. |
| Admin quality | `app/api/admin/quality/route.ts` | direct `food_items(food_name, calories, protein_g, carbs_g, fat_g)`; duplicate-name calculation | **LEGACY PHYSICAL** | Replace Food portion with domain/quality read model; direct Exercise quality is outside Plan 7. |
| My Food duplicate hint | `services/nutrition-v1/server/user-foods.ts` → `findCatalogDuplicateByName` | name-only active global compatibility match | **LEGACY ADVISORY** | Planner-approved advisory replacement; must never become automatic canonical merge authority. |
| Privacy data export | `lib/privacy/data-export.ts` | exports canonical Nutrition V1 + legacy `food_personal_corrections`/`food_favorites`; currently not Plan 6 override tables | **MIXED / OWNER-DATA GAP** | Add exact owner-scoped Plan 6 override state or explicitly approved equivalent export before retiring old corrections. |
| Account deletion | `lib/privacy/account-deletion-worker.ts` → `food_catalog_purge_account_application_data_for_deletion_job` | Plan 6 canonical transactional purge/resume checkpoint | **CURRENT DOMAIN AUTHORITY** | KEEP; verify new Plan 7 owner relations are covered if any are introduced. |
| Current-generation service | `services/food-catalog/server/current-generation-service.ts` | generation-authoritative read/resolve/projector | **AVAILABLE TARGET AUTHORITY** | Product call-site adoption is pending; tests alone do not prove consumer migration. |
| Activity Catalog | separate project/service | separate authority | **OUTSIDE PLAN 7** | Never mutate as part of Food Catalog retirement. |

### Consumer conclusion

**VERIFIED CURRENT FACT** — the repository is **not yet ready for destructive legacy retirement**. Food Library search itself is on Plan 5 V2, but handoff, recipe verification, MCP search, older browser surfaces, prompt context, and admin quality still depend on compatibility/physical structures. Plan 7 Workstream 2 therefore begins with cutover/proof, not `DROP` statements.

## 5. Exact legacy-retirement candidate matrix

### 5.1 Root `food_items` candidates

| Candidate | Current purpose/readers/writers/dependencies | Status | Recommendation | Exact preconditions |
|---|---|---|---|---|
| `food_items.id` | stable anchor; referenced by canonical Plans 1–6 and consumer FKs | authoritative identity | **KEEP** | Never remap IDs. |
| `food_items.food_name` | legacy resolver, old browser, admin quality, prompt context, old search RPC; Plan 4 persist compatibility | compatibility-only for current truth | **RETIRE AFTER PRECONDITION** | all readers use generation-selected names/domain views; ingestion no longer writes flat display compatibility; admin/prompt/MCP cut over; DB functions no longer reference. |
| `food_items.serving_size` | legacy resolver/browser; old search RPC; Plan 4 compatibility persist | compatibility-only | **RETIRE AFTER PRECONDITION** | all new handoffs use generation-selected serving authority or explicit nullable serving; Plan 5 serving semantics preserved; no DB writer dependency. |
| root `calories`, `protein_g`, `carbs_g`, `fat_g`, `saturated_fat_g`, `fiber_g`, `sugar_g`/`sugars_g`, `sodium_mg`, `nutrition_basis_amount`, `nutrition_basis_unit` | legacy resolver/browser/admin quality and compatibility persistence | compatibility-only for canonical nutrition | **RETIRE AFTER PRECONDITION** | current-generation nutrition revision drives every Product read/handoff; legacy personal-correction overlay migrated; ingestion/governance writers no longer mirror canonical nutrition to root. |
| `food_items.category`, `cuisine` | old browser/category UI and old search compatibility | compatibility projection | **RETIRE AFTER PRECONDITION** | all category/market/cuisine Product semantics mapped to approved taxonomy/market model; Planner settles cuisine replacement if still Product-visible. |
| `food_items.is_verified`, `verified_at`, `verified_source_record_id` | legacy recipe verification and old search; root has non-deferrable composite FK back to `food_source_records` | compatibility verification | **RETIRE AFTER PRECONDITION** | recipes/consumers use generation assertion/trust; old search retired; forward migration removes compatibility FK safely; restore verifier no longer needs transitional cycle workaround. |
| `food_items.is_market_global` | ingestion compatibility field; parent architecture marks transitional | compatibility market flag | **RETIRE AFTER PRECONDITION** | market assignments/scopes cover all current Product semantics; ingestion writer migrated; no reader/grant dependency. |
| `food_items.merged_into_food_id` | legacy resolver; Plan 6 merge/lifecycle guards and duplicate resolution still reference it | transitional evidence/write-plane dependency | **RETIRE AFTER PRECONDITION** | generation redirects/current resolver cover Product reads **and** Plan 6 write/governance functions are forward-migrated to an approved non-flat merge authority; historical merge events preserved. |
| `food_items.lifecycle_status` | legacy resolver and current governance lifecycle/write-plane functions | still active write-plane state | **KEEP** for this design | A separate approved lifecycle-write authority replacement is required before this can even become a retirement candidate. Generation lifecycle alone does not automatically replace governance mutation state. |
| `food_items.tags`, `notes` | old Product/prompt/display paths may use them; no canonical replacement settled here | unclear compatibility/product metadata | **UNKNOWN / NEEDS EVIDENCE** | enumerate every reader/writer and Planner defines canonical destination/retention semantics. |
| `food_items.source_type` | compatibility/diagnostic metadata | unclear | **UNKNOWN / NEEDS EVIDENCE** | prove whether source provenance fully supersedes Product/diagnostic meaning. |
| `food_items.is_global`, `is_editable_by_user` | legacy global/editability semantics | unclear | **UNKNOWN / NEEDS EVIDENCE** | prove no authorization/Product behavior depends on flags and define replacement semantics. |
| `food_items.created_by` | historical creator reference | provenance/history candidate | **UNKNOWN / NEEDS EVIDENCE** | determine whether immutable audit/source/governance history supersedes it without losing historical meaning. |
| `food_items.kitchen_id`, `subcategory_id` | old UI categorization FKs | compatibility/reference | **UNKNOWN / NEEDS EVIDENCE** | cut over old browser/UI and decide preservation/migration of system/user kitchen taxonomy. |
| `food_items.brand_name` | Product/source display candidate | semantics not fully specified by current long-term generation composition | **UNKNOWN / NEEDS EVIDENCE** | Planner defines canonical brand fact/source projection before retirement. |

### 5.2 Tables/functions/files

| Candidate | Verified current purpose/readers/writers/dependencies | Recommendation | Preconditions |
|---|---|---|---|
| `food_aliases` | fixed-locale alias compatibility; old `search_nutrition_food_library` reads it; no current TypeScript direct reader found | **RETIRE AFTER PRECONDITION** | old RPC retired/no DB deps; current names provide required locale/script aliases; live row/dependency/grant check. |
| `food_market_relevance` | Batch-0 market compatibility table; no current repository runtime reader and no current routine reader found | **RETIRE NOW CANDIDATE** | fresh Production count/dependency/FK/grant check; prove no external/reporting consumer; forward migration only. |
| `public.search_nutrition_food_library(...)` | older authenticated/service-role Food search; still executable in Production | **RETIRE AFTER PRECONDITION** | code/MCP/admin consumers all on V2; no external API contract; revoke/observe then drop via approved sequence; no DB caller. |
| `public.search_food_catalog_v2(...)` | Plan 5 current search; generation-derived global branch plus user overlays | **KEEP** | May need forward update to replace `food_personal_corrections`, but function boundary remains current. |
| `public.rebuild_food_catalog_search_projection_v2(uuid,text,text)` | current service-role search rebuild | **KEEP** | Required by Plan 7 restore verification. |
| `private.food_catalog_search_projection_v2_legacy_rebuild(uuid,text,text)` | old Plan 5 implementation now private; **current public rebuild calls it**, then nulls serving and recomputes checksum | **KEEP** now | Becomes retirement candidate only after a forward replacement implements public rebuild independently and equivalence tests pass. |
| `services/food-catalog/server/legacy-compatibility.ts::resolveCatalogFood` | flat root resolver + `merged_into_food_id` chain walking | **RETIRE AFTER PRECONDITION** | every new-write handoff uses current-generation resolver; redirect behavior verified; nullable facts handled. |
| `...::getCatalogVerificationStates` | root `is_verified` for recipe paths | **RETIRE AFTER PRECONDITION** | recipe workspace/publish uses exact generation/trust assertions. |
| `...::searchCatalogFoodsByName` | legacy flat global search for MCP/tool execution | **RETIRE AFTER PRECONDITION** | MCP uses logical/V2 search with correct locale/market/cursor semantics. |
| `...::findCatalogDuplicateByName` | advisory My Food duplicate hint | **RETIRE AFTER PRECONDITION** | Planner approves replacement advisory semantics; no automated merge inference. |
| `services/database/nutrition.ts::getGlobalFoods` | direct `food_items.*` global browser + local Egyptian fallback | **RETIRE AFTER PRECONDITION** | caller surfaces use server/domain V2; fallback cannot masquerade as canonical runtime data. |
| `services/database/nutrition.ts::getFoodCategories` | direct flat `food_items.category` | **RETIRE AFTER PRECONDITION** | category UI derives from approved taxonomy/search facets. |
| `services/database/planned-meal-prompt-context.ts` direct global Food reads | prompt context from flat root | **RETIRE AFTER PRECONDITION** | domain prompt-context service from current generation; unknown metadata remains unknown. |
| `app/api/admin/quality/route.ts` Food physical reader | flat root missing-macro/duplicate-name metrics | **RETIRE AFTER PRECONDITION** | Food quality portion replaced with canonical/generation-aware quality read model. |
| `food_personal_corrections` | current Plan 5 search and handoff user override overlay; exported by current privacy export | **RETIRE AFTER PRECONDITION** | owner data migrated semantically to Plan 6 personal override revisions; search/handoff/privacy export switched; deletion coverage verified; no rows left/unmapped. |
| `food_personal_overrides` family | Plan 6 revisioned owner authority | **KEEP** | Add to user privacy export/restore protection; do not collapse into global truth. |
| `user_food_favorites` | old `food_key` favorite model; existing Production owner data; old speed helper/legacy export | **RETIRE AFTER PRECONDITION** | owner-preserving reconciliation with current favorite model; old consumer migrated; privacy/export/deletion coverage; zero unmapped rows. |
| `food_favorites` | current Food Library/Plan 5 `food_id` favorite overlay | **KEEP** | Owner data outside global authority. |
| `food_barcodes` | current effective barcode mapping | **KEEP** | Portable canonical authority. |
| `food_catalog_barcode_corrections` | immutable Plan 6 correction history | **KEEP** | Portable audit/history. |
| `food_kitchens` / `food_subcategories` | old/system/user UI grouping | **UNKNOWN / NEEDS EVIDENCE** | resolve owner/system data semantics and all readers before change. |
| direct generic global Food admin writes | existing Plan 6 architecture/tests already retire generic direct curation | **KEEP RETIRED / VERIFY** | prove no current grants/runtime reintroduced; no new migration needed merely to restate history. |

## 6. Database dependencies that block simplistic retirement

### 6.1 Stable Food ID fan-out

**VERIFIED CURRENT FACT** — `food_items.id` is referenced by canonical and consumer relations, including:

- Plan 1/3/6 facts, generation composition, activation, governance, ingestion materialization, barcodes, verification, taxonomy/market, merges, personal overrides;
- `food_logs.food_item_id`;
- `custom_meal_items.food_item_id`;
- `meal_food_items.food_item_id`;
- `user_meal_plan_items.food_item_id`.

The historical consumer FKs use deletion behavior such as `ON DELETE SET NULL`, but Plan 7's objective is preservation, not deletion/remapping. Restored canonical Food IDs must compare exactly.

### 6.2 Non-deferrable `food_items`/source cycle

**VERIFIED CURRENT FACT**:

- `food_source_records.food_id → food_items.id` is non-deferrable;
- `(food_items.verified_source_record_id, food_items.id) → food_source_records(id, food_id)` is non-deferrable.

This cycle is caused by transitional root verification compatibility. It must be handled in the restore loader while present and disappears only after an independently approved forward retirement of root verification compatibility.

### 6.3 Current routines that still reference legacy root state

Read-only `pg_get_functiondef` scan found current routine references including:

- `private.food_catalog_change_lifecycle(...)` → `food_items`, `merged_into_food_id`;
- `private.food_catalog_lock_food_authority(uuid)` → `food_items`;
- `private.food_catalog_lock_food_pair(uuid,uuid)` → `food_items`;
- `private.guard_food_merge_event_target()` → `food_items`, `merged_into_food_id`;
- `public.create_preseeded_nutrition_recipe_draft(uuid,jsonb)` → `food_items`;
- `public.food_catalog_create_generation_v1(jsonb)` → `food_items`;
- `public.food_catalog_grant_activation_set_v1(jsonb)` → `food_items`;
- `public.food_catalog_ingestion_persist_candidate_v2(jsonb)` → root compatibility fields including name/serving/market/merge state;
- correction/report/duplicate service functions → `food_items` and, for duplicate/lifecycle, `merged_into_food_id`;
- old `public.search_nutrition_food_library(...)` → root name/serving/verification/merge + `food_aliases`;
- current `public.search_food_catalog_v2(...)` contains My Foods flat fields by design and user overlay reads; its global branch is SearchDocument-based.

Therefore column retirement requires forward migration of dependent database functions, not just TypeScript call-site cleanup.

## 7. Search rebuild verification inventory

**VERIFIED CURRENT FACT** — current canonical rebuild boundary:

`public.rebuild_food_catalog_search_projection_v2(uuid, text, text)`

Current grants: service-role executable; anon/authenticated not executable.

Current search boundary:

`public.search_food_catalog_v2(text, text, text, text, text, integer, text, text, text, jsonb)`

Current grants: authenticated + service role; anon denied.

Old search boundary:

`public.search_nutrition_food_library(text, text, text, integer, text, text, text, jsonb)`

is still executable by authenticated + service role in current Production. This is a retirement exposure, not proof of an active Product caller.

**VERIFIED CURRENT FACT** — the public rebuild currently depends on the private legacy rebuild helper and then corrects global serving semantics to `NULL`. Plan 7 must verify the current boundary as-is until a later forward replacement is approved.

### Golden query matrix for populated-fixture restore tests

**PROPOSED PLAN 7 DESIGN**:

| Scenario | Required assertion |
|---|---|
| exact preferred name | exact canonical Food first with expected display context |
| synonym/search alias | same Food resolved through selected name facts |
| prefix vs contains | deterministic ranking tiers preserved |
| language/script exact/fallback | same ordered IDs and context choice |
| market direct scope | matching assignment visible/ranked correctly |
| market parent hierarchy | inherited scope semantics preserved |
| `GLOBAL` market | fallback semantics preserved |
| category | exact taxonomy-derived category behavior |
| cuisine | current projection behavior preserved; no invented mapping |
| nutrition `gt/lt/eq/gte/lte/between` | exact result IDs; unknown nutrition does not pass numeric filter |
| high-protein/low-carb preset | exact approved policy version required |
| global serving display | remains `NULL` until serving-display authority exists |
| favorites | controlled `food_favorites` fixture ranks/filters exactly |
| recent/frequency | controlled `food_logs` timestamps/counts produce exact ranking |
| My Foods | `user_food_items` remains owner-separated and never becomes global authority |
| cursor page 1/2 | no duplicate/skip and exact continuation order |
| cursor context mismatch | fails closed |
| redirect | source identity resolves to active generation survivor where the consumer boundary requires resolution |
| generation change | old generation SearchDocuments never leak into current results |

Golden fixtures must fix user ID, Food IDs, event times, locale/script, market scope, favorites, logs, and My Food rows. Otherwise recency/frequency/user overlays make result order nondeterministic across environments.

## 8. Current privacy/account-lifecycle gap

**VERIFIED CURRENT FACT** — `lib/privacy/data-export.ts` exports current canonical Nutrition V1 owner tables and includes `food_personal_corrections` and `food_favorites`. It does **not** currently include:

- `food_personal_overrides`;
- `food_personal_override_revisions`;
- `food_personal_override_operations`.

**VERIFIED CURRENT FACT** — account deletion is ahead of privacy export here: the canonical deletion worker calls `food_catalog_purge_account_application_data_for_deletion_job`, and Plan 6 purge authority covers owner-scoped personal-override data with resumable deletion checkpoint semantics.

**ARCHITECTURE REQUIREMENT** — Plan 7 cannot retire `food_personal_corrections` merely because current Production count is zero. Privacy export and restore must first support the replacement Plan 6 owner state and Product reads must migrate.

## 9. Live read-only retirement preflight queries

These are **templates for later execution**, not destructive SQL. Exact expected values must be frozen by the Planner immediately before the separately authorized retirement pass.

### 9.1 Identity/migration/compatibility

```sql
select count(*) as migration_count,
       max(version) as latest_version
from supabase_migrations.schema_migrations;

select version, migration_version
from public.release_schema_compatibility
where singleton is true;

select current_generation_id, current_event_id,
       current_validation_report_id, pointer_revision
from public.food_catalog_current_generation
where singleton_key is true;
```

Stop on unexpected latest migration, pointer, compatibility state, or newer authority.

### 9.2 Candidate schema existence

```sql
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('food_items','food_aliases','food_market_relevance','food_personal_corrections');
```

Compare to the reviewed expected schema fingerprint. Extra/missing/changed columns stop retirement.

### 9.3 Data/non-null usage

```sql
select
  count(*) as food_rows,
  count(*) filter (where food_name is not null) as root_name_rows,
  count(*) filter (where serving_size is not null) as root_serving_rows,
  count(*) filter (where is_verified or verified_at is not null or verified_source_record_id is not null) as root_verification_rows,
  count(*) filter (where merged_into_food_id is not null) as root_merge_rows,
  count(*) filter (where is_market_global) as root_market_global_rows
from public.food_items;

select count(*) from public.food_aliases;
select count(*) from public.food_market_relevance;
select count(*) from public.food_personal_corrections;
select count(*) from public.user_food_favorites;
```

Nonzero is not automatically failure; it requires the exact approved migration/reconciliation strategy. Unknown nonzero shape is a stop condition.

### 9.4 FK/dependency inventory

```sql
select conname,
       conrelid::regclass as dependent_relation,
       confrelid::regclass as referenced_relation,
       pg_get_constraintdef(oid)
from pg_constraint
where contype = 'f'
  and (conrelid = 'public.food_items'::regclass
       or confrelid = 'public.food_items'::regclass)
order by 2, 1;

select schemaname, viewname, definition
from pg_views
where definition ilike '%food_items%'
   or definition ilike '%food_aliases%'
   or definition ilike '%food_market_relevance%';
```

Also inspect `pg_get_functiondef` for every public/private routine and repository code search for candidate symbol names. Do not use `DROP ... CASCADE` to discover hidden dependencies.

### 9.5 Privilege surface

```sql
select
  has_function_privilege('anon', '<function-signature>', 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', '<function-signature>', 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', '<function-signature>', 'EXECUTE') as service_role_execute;
```

In implementation, replace `<function-signature>` with each exact reviewed `regprocedure` identity. Any unexpected execution grant is a stop condition or requires an explicit revoke-before-drop rollout.

### 9.6 Consumer-reference safety

```sql
select
  (select count(*) from public.food_logs where food_item_id is not null) as diary_food_refs,
  (select count(*) from public.custom_meal_items where food_item_id is not null) as custom_meal_food_refs,
  (select count(*) from public.meal_food_items where food_item_id is not null) as saved_meal_food_refs,
  (select count(*) from public.user_meal_plan_items where food_item_id is not null) as legacy_meal_plan_food_refs;
```

These rows do not authorize snapshot rewrites. Their purpose is to prove stable Food IDs remain present and references survive the retirement migration.

## 10. Repository discovery checks required at implementation time

Run equivalent repository-wide searches at the exact candidate head immediately before each retirement task for:

- `.from("food_items")` and SQL `from public.food_items` outside approved domain/governance code;
- every flat candidate column name;
- `food_aliases`, `food_market_relevance`, `food_personal_corrections`, `user_food_favorites`;
- `search_nutrition_food_library`;
- `resolveCatalogFood`, `getCatalogVerificationStates`, `searchCatalogFoodsByName`, `findCatalogDuplicateByName`;
- `merged_into_food_id` chain walking;
- direct Food admin `insert/update/delete`;
- old fallback fixtures that can become runtime truth;
- tests asserting legacy behavior as a Product requirement.

Historical migration/spec text is evidence and is not edited merely to make search counts reach zero.

## 11. Open Planner decisions/blockers

1. Minimum compatible PostgreSQL restore target profile, including extensions/auth-role compatibility.
2. Governance principal/capability active-state reauthorization policy after cross-environment restore.
3. Raw source-evidence byte portability/retention policy.
4. Encryption/key custody for protected owner/security segments.
5. Artifact freshness/RPO acceptance.
6. Whether Plan 7 must make local canonical barcode lookup first in Product flows or may leave provider-assisted lookup UX while preserving local canonical authority.
7. Replacement behavior for the advisory name-only My Food duplicate hint.
8. Canonical destination/retention of root `tags`, `notes`, `source_type`, `is_global`, `is_editable_by_user`, `created_by`, `kitchen_id`, `subcategory_id`, `brand_name`.
9. Owner-data reconciliation rule for existing `user_food_favorites` versus current `food_favorites`.
10. Exact migration semantics from `food_personal_corrections` to Plan 6 revisioned personal overrides, including whether zero current global rows permit a no-op data migration today while still requiring code/privacy compatibility for future populated state.
11. Whether legacy `food_market_relevance` has any external/reporting consumer not represented in repository/database dependency scans. Until answered or live-observed, “RETIRE NOW CANDIDATE” is not Production authorization.

## 12. Discovery conclusion

The portable canonical boundary is sufficiently identifiable to design Workstream 1 now. Destructive Workstream 2 is **not** currently executable: multiple active Product/database consumers remain mixed or compatibility-bound, user-owned legacy state exists, and several root fields still support Plan 4/6 database functions.

No relation/function/column is deleted or deprecated by this inventory. Recommendations are evidence-driven gates for a later separately authorized implementation.
