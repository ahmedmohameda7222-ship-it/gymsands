# Plaivra Food Catalog Plan 7 — Portability, Restore Verification, and Legacy Retirement Design

Status: **Discovery/design for Planner review; implementation not authorized**  
Date: **2026-09-10**  
Architecture class: **Architectural / long-term target design**  
Parent architecture: `docs/superpowers/specs/2026-09-01-food-catalog-intelligence-architecture-design.md`  
Program roadmap: `docs/superpowers/plans/2026-09-01-food-catalog-intelligence-program-roadmap.md`  
Discovery inventory: `docs/superpowers/plans/2026-09-10-food-catalog-plan7-discovery-inventory.md`  
Implementation plan: `docs/superpowers/plans/2026-09-10-food-catalog-plan7-portability-retirement.md`  
Implementation authority: **Not granted by this document**  
Production mutation authority: **Not granted by this document**

## 1. Purpose and phase boundary

Plan 7 is one roadmap plan with two sequential internal workstreams:

1. **Portability / backup / export / restore verification** — establish a provider-neutral logical Food Catalog export and prove that Git schema authority plus an approved export can reconstruct the catalog on an isolated compatible PostgreSQL target while preserving Plaivra identities and current-generation authority.
2. **Legacy retirement** — remove obsolete transitional compatibility authority only after every Product/database consumer is migrated and live preconditions prove removal safe.

Plan 7 is not a Food population plan, provider-adapter plan, deployment plan, or compatibility-marker promotion plan. It must not begin Plan 8. Physical Supabase backups remain useful disaster-recovery artifacts but are not the provider-neutral domain export required by Plan 7.

The Plan 7 exit condition is:

> Plaivra can restore or move the Food Catalog onto a compatible clean PostgreSQL target from Git schema authority plus approved portable artifacts while preserving exact canonical Food IDs, all authority/history required to interpret them, current-generation semantics, user ownership, and valid consumer references; derived search can be rebuilt and verified; and obsolete transitional authorities are removed only after zero unsupported consumers and live destructive-retirement preconditions are proven.

## 2. Evidence labels

This document uses four labels deliberately:

- **VERIFIED CURRENT FACT** — confirmed against current repository authority and/or read-only Production evidence on 2026-09-10.
- **ARCHITECTURE REQUIREMENT** — inherited from binding Food Catalog architecture/roadmap or explicit Plan 7 scope.
- **PROPOSED PLAN 7 DESIGN** — implementation design proposed for Planner approval; not yet Product policy or Production authority.
- **OPEN POLICY DECISION** — a choice the existing architecture does not settle and the Planner must decide before implementation that depends on it.

No implementation should convert a proposed design or open decision into Production behavior without the required Planner review/authorization.

## 3. Verified starting state

**VERIFIED CURRENT FACT** — repository `main` is at Plan 6 closure commit `7f2882d6ad3c67489622ff4be68a4506a2722319`.

**VERIFIED CURRENT FACT** — read-only Plaivra Production inspection on 2026-09-10 established:

- physical migration records: **123**;
- latest physical migration: `20260910071241_food_catalog_governance_gtin_lock_exactness`;
- `food_items = 0`;
- `food_source_records = 0`;
- `food_ingestion_batches = 0`;
- `food_ingestion_runs = 0`;
- `food_catalog_generations = 0`;
- `food_catalog_generation_foods = 0`;
- `food_catalog_search_documents = 0`;
- `food_catalog_search_nutrition_policies = 0`;
- `current_generation_id = NULL`;
- `pointer_revision = 0`;
- schema compatibility version: `2`;
- released compatibility marker: `20260724232734`.

**VERIFIED CURRENT FACT** — `supabase/migration-ledger.json` is reconciled with `pendingCount = 0`, `schemaVerifiedUntrackedCount = 0`, and `unresolvedCount = 0`.

**VERIFIED CURRENT FACT** — Activity Catalog remains a separate project/authority and is outside Plan 7 mutation scope.

**VERIFIED CURRENT FACT** — the current Production catalog is globally unpopulated, but user-owned Food state is not globally empty. Read-only inspection found rows in `user_food_items` and `user_food_favorites`. Zero global Food rows must therefore never be interpreted as permission to delete user-owned compatibility state.

## 4. Binding invariants

**ARCHITECTURE REQUIREMENT** — Plan 7 preserves all of the following:

1. Stable Plaivra `food_items.id` UUIDs are identity anchors and must survive export/restore exactly.
2. Catalog Generation remains the sole authority for current-effective global Food state.
3. Nutrition revisions are immutable and versioned; unknown nutrition remains `NULL`, not `0`.
4. Serving and name facts preserve stable lineage/revision identity.
5. Merge history is immutable; current generation redirects are flattened and cycle-free.
6. Source/release provenance, verification/activation evidence, governance/correction/audit history, and policy interpretation are preserved.
7. My Foods remain separate user-owned authority.
8. Personal overrides remain owner-scoped and must never be reassigned across users during restore.
9. Historical Diary, Recipe, Saved Meal, and Meal Plan snapshots are not rewritten to match restored current Food truth.
10. No fabricated servings, `ml ↔ g` conversions, provider-priority inference, or latest-row inference is introduced.
11. Search is derived/rebuildable and never becomes canonical Food truth.
12. Product consumers must converge on Food Catalog domain/current-generation boundaries before compatibility-only storage is retired.
13. Applied migrations are immutable. Any later schema change is forward-only.
14. No Production population or mutation is implied by a successful portable restore on a disposable target.

## 5. Recovery model: physical backup versus logical export

### 5.1 Full physical Supabase/database backup

**ARCHITECTURE REQUIREMENT** — a physical/platform backup solves instance-level disaster recovery. It may preserve implementation-specific catalogs, extension state, operational lease rows, platform schemas, and storage details. It can be appropriate when restoring the same platform quickly.

A physical backup is **not** sufficient evidence that the Food Catalog is provider-neutral, deterministic, or movable to a clean compatible PostgreSQL target.

### 5.2 Provider-neutral logical Food Catalog export

**PROPOSED PLAN 7 DESIGN** — define a domain artifact named:

`plaivra-food-catalog-portable-export`

with initial `formatVersion = 1` and a separate `canonicalizationVersion = 1`.

The artifact is a logical bundle, not `pg_dump`. Its minimum structure is:

```text
food-catalog-export/
  manifest.json
  segments/
    <logical-segment>.ndjson
  protected/
    <owner/security-segment>.ndjson.enc   # only when approved and non-empty
  evidence/
    source-artifact-manifest.json         # references/checksums; bytes only if policy allows
```

The artifact must be valid for a zero-row catalog. Every required segment still appears in the manifest with `rowCount = 0` and deterministic empty-content checksums.

### 5.3 Manifest contract

**PROPOSED PLAN 7 DESIGN** — `manifest.json` contains at least:

- artifact `format` and `formatVersion`;
- `canonicalizationVersion`;
- export schema fingerprint/version;
- source repository commit;
- source migration-ledger state and latest reconciled Production migration identity;
- source compatibility version/marker as evidence, not as authority to promote a target;
- export scope (`global`, `global+protected-owner-state`, or another Planner-approved explicit scope);
- required segment inventory;
- per-segment classification;
- per-segment primary/canonical sort key;
- per-segment row count;
- per-segment byte SHA-256;
- per-segment semantic SHA-256;
- required/optional marker;
- an overall manifest semantic checksum over the semantic fields and segment digests;
- a volatile envelope timestamp that is explicitly excluded from semantic equality.

No secret, access token, provider credential, service-role key, database password, active lease token, or transient worker ownership may appear in a portable artifact.

### 5.4 Deterministic canonicalization

**PROPOSED PLAN 7 DESIGN** — deterministic serialization rules:

- relations are ordered by explicit stable primary/composite identity, never database physical order;
- UUIDs use lowercase canonical text;
- timestamps use exact UTC instants in one canonical representation;
- JSON object keys are recursively sorted;
- arrays are sorted only where the owning architecture defines them as unordered sets; semantically ordered arrays retain order;
- `NULL` remains distinct from numeric/string zero or empty text;
- numerics use a canonical decimal representation that preserves value without float coercion;
- text is preserved exactly unless a specific stored value is defined as normalized authority;
- each NDJSON object uses deterministic key order;
- semantic checksums exclude volatile storage metadata only where the relation contract explicitly declares it non-semantic.

A restore verifier must reject unknown canonicalization versions rather than guess.

## 6. Portable boundary

The exhaustive relation classification is maintained in the discovery inventory. The architectural rule is:

### 6.1 Portable authority

**ARCHITECTURE REQUIREMENT** — export state needed to reconstruct the exact canonical identity/effective-authority graph, including:

- stable global Food identity anchors;
- immutable source records/provenance;
- immutable nutrition, serving, name, taxonomy, market, barcode, verification, merge, and lineage authority;
- Activation Sets/member authority;
- Catalog Generations and exact composition relations;
- current-generation pointer;
- policy/configuration rows required to interpret/rebuild current authority;
- Plan 6 governance security/policy authority subject to the protected-identity rules below;
- owner-scoped personal override pointer/revisions when the export scope includes user-owned Food Catalog state.

### 6.2 Portable audit/history

**ARCHITECTURE REQUIREMENT** — preserve immutable evidence required to explain how authority was produced or changed: activation/generation events, validation reports/findings, ingestion manifests/quarantines/reconciliation/release diffs, correction cases/evidence/events, governance operations/audit/lifecycle history, and personal-override operation history.

Operational rows that combine durable history with live lease state are exported field-selectively. Durable result/event identity stays; active worker/lease state does not become resumable authority on the target.

### 6.3 Derived/rebuildable

**ARCHITECTURE REQUIREMENT** — `food_catalog_search_documents`, search indexes, generated search vectors, and other caches/projections are rebuilt from restored canonical authority. A SearchDocument table dump is not canonical restore input.

### 6.4 Transient/do not export

**ARCHITECTURE REQUIREMENT** — exclude active lease ownership/tokens/heartbeats, worker claims, caches, staging state, credentials, secrets, and any implementation state that would incorrectly resume work on a different environment.

### 6.5 Outside Food Catalog / reference only

**ARCHITECTURE REQUIREMENT** — Diary/Recipe/Saved Meal/Meal Plan historical rows and My Foods are separate Product/user authorities. The global Food Catalog export does not absorb them into global truth. The restore verifier may inspect or seed controlled references to prove that exact Food IDs remain valid and frozen snapshots remain unchanged.

## 7. Sensitive identity and user-owned state

**PROPOSED PLAN 7 DESIGN** — portable Food Catalog artifacts use explicit protection boundaries:

- global canonical authority is exportable independently;
- user-owned personal overrides are a separate protected segment keyed by exact user UUID;
- governance principal/capability history is an admin-only protected segment because it can contain human identity references and service-identity hashes;
- restoring historical principal IDs does not automatically reactivate external service credentials;
- active worker/outbox lease tokens are excluded;
- owner-scoped rows must fail restore if their user identity cannot be mapped exactly to the intended target user.

**OPEN POLICY DECISION** — Planner must approve whether a disaster-recovery restore to a new Plaivra environment may reactivate governance human/service principals automatically after exact identity match, or whether all principals are restored as historical records and require an explicit reauthorization ceremony before active use.

**OPEN POLICY DECISION** — source-evidence object bytes may have provider/legal retention limits. Database provenance/checksum records are portable authority/history; including raw source artifacts in the bundle requires an explicit retention/right policy. The design supports checksum-addressed external evidence references when bytes cannot legally travel.

## 8. Disposable logical restore model

**PROPOSED PLAN 7 DESIGN** — restore verification runs only against an isolated disposable target and is fail-closed.

The verifier executes these phases:

1. **Artifact preflight** — parse only supported format/canonicalization versions; require every mandatory segment; reject duplicate segment names, duplicate stable IDs, unexpected secret-shaped fields, checksum mismatches, and stale/wrong source identity according to policy.
2. **Target preflight** — prove the target is the approved disposable environment and not Plaivra Production or Activity Catalog.
3. **Schema construction** — create the target from Git migration/schema authority through the exact reviewed repository commit. Do not use exported DDL as authority.
4. **Schema/security fingerprint** — verify expected relations, constraints, RLS, grants, functions, and required extensions before data load.
5. **Reference/identity load** — restore registries and stable root Food UUID anchors deterministically.
6. **Canonical fact/provenance load** — restore sources, immutable nutrition/name/serving/taxonomy/market/barcode/verification/merge facts and lineage.
7. **Audit/control-plane load** — restore activation, ingestion reproducibility history, correction/governance history, and approved security-policy authority while neutralizing transient leases/claims.
8. **Generation load** — restore generations, composition, validation, events, and their exact stable IDs/checksums.
9. **Pre-pointer verification** — prove all referenced generation facts, redirects, grants, assertions, and policy versions are internally valid.
10. **Current pointer restore last** — only after all prior checks pass, restore exact `current_generation_id`, `current_event_id`, `current_validation_report_id`, and `pointer_revision`.
11. **Protected owner-state restore** — when included, map exact user IDs first, then restore personal override revisions/pointers/operation history; reject cross-user ownership mismatch.
12. **Derived search rebuild** — rebuild search for the restored current generation through the current Plan 5 public rebuild boundary, then validate its deterministic evidence and behavior.
13. **Consumer-reference verification** — use read-only/fixture consumer references to prove restored Food UUIDs remain valid without rewriting historical snapshots.
14. **Final security/integrity verification** — run FK/constraint, RLS/ACL, checksum, merge topology, generation, owner-isolation, and transient-state assertions.
15. **Evidence output** — write a deterministic restore-verification report identifying source artifact root, repository commit, target schema fingerprint, comparison results, and any failure. A failed assertion makes the restore untrusted.

No step writes to Plaivra Production.

## 9. Current non-deferrable restore-order hazard

**VERIFIED CURRENT FACT** — current schema contains a non-deferrable FK cycle:

- `food_source_records_food_id_fkey`: `food_source_records.food_id → food_items.id`;
- `food_items_verified_source_record_fk`: `(food_items.verified_source_record_id, food_items.id) → food_source_records(id, food_id)`.

Both are currently non-deferrable.

**PROPOSED PLAN 7 DESIGN** — while the transitional root `verified_source_record_id` still exists, logical restore must not rely on disabling constraints or arbitrary row order. The trusted disposable-restore loader should:

1. insert the exact `food_items.id` identity/root row with compatibility `verified_source_record_id = NULL`;
2. restore `food_source_records` with exact source IDs and Food links;
3. restore immutable canonical facts/verification assertions;
4. only if the transitional compatibility column still exists for that schema version, reconstruct its compatibility value from exported evidence through an explicitly verified transitional restore step;
5. validate the composite FK and semantic equivalence.

After approved Plan 7 retirement removes that compatibility field/FK, future export versions omit this transitional reconstruction step.

The portable artifact must not make root `verified_source_record_id` canonical verification authority.

## 10. Search rebuild and verification model

### 10.1 Existing current boundary

**VERIFIED CURRENT FACT** — current Plan 5 exposes:

- `public.rebuild_food_catalog_search_projection_v2(uuid, text, text)` — `SECURITY DEFINER`, executable by `service_role`, not anon/authenticated;
- `public.search_food_catalog_v2(text, text, text, text, text, integer, text, text, text, jsonb)` — current authenticated/service-role search boundary;
- `food_catalog_search_documents` — generation-keyed derived state.

**VERIFIED CURRENT FACT** — serving-semantics correction moved the original rebuild implementation to `private.food_catalog_search_projection_v2_legacy_rebuild(uuid,text,text)`. The public rebuild currently calls this private helper, then forces global `serving_label = NULL`, because the current generation model has no deterministic preferred-serving selector, and recomputes the projection checksum. The private helper is therefore an implementation dependency and cannot be retired merely because Product code does not call it directly.

### 10.2 Restore search sequence

**PROPOSED PLAN 7 DESIGN**:

```text
restore canonical authority
  → restore exact generation/current pointer
  → read exact current generation + projection version
  → choose exact approved search nutrition-policy version when applicable
  → call public.rebuild_food_catalog_search_projection_v2
  → verify returned documentCount + projectionChecksumSha256
  → run deterministic golden queries through public.search_food_catalog_v2
```

For a valid zero-row/uninitialized catalog where `current_generation_id = NULL`, the verifier expects zero SearchDocuments and does **not** call the rebuild RPC with a null generation.

### 10.3 Search equivalence

**ARCHITECTURE REQUIREMENT** — verification covers:

- same active canonical Food IDs and no stale generation rows;
- deterministic name/alias behavior across language/script contexts;
- explicit market/direct-parent/GLOBAL semantics;
- exact category/cuisine behavior supported by the current projection;
- nullable nutrition: filtered unknown values do not become zero or match invented thresholds;
- serving semantics: global serving label remains `NULL` until deterministic serving-display authority exists; `100 g`/`100 ml` nutrition basis is not a serving;
- favorites/recent/My Foods only in controlled owner-specific fixtures;
- stable cursor continuation and rejection of cursor/context mismatch;
- exact ordered golden-query result IDs/selected fields for deterministic fixtures;
- redirects resolve to the current active canonical survivor without exposing stale source identity as a new canonical result.

Search comparison is semantic/behavioral plus the rebuild RPC checksum. Physical SearchDocument file bytes are not restore authority.

## 11. Restore assertion classes

Plan 7 distinguishes three equality classes.

### 11.1 Byte/hash equality

Use byte/hash equality for:

- artifact segment bytes;
- per-segment byte SHA-256;
- canonical semantic segment hashes;
- overall manifest semantic checksum;
- source-artifact checksum references;
- existing stored checksums whose architecture defines the hash input, including generation composition/change manifest, validation report, ingestion manifest/reconciliation/release-diff, and operation semantic checksums.

### 11.2 Exact identity/value equality

Use exact value equality for:

- every stable UUID that is part of canonical authority/audit identity;
- exact foreign-key identity pairs;
- generation and activation IDs;
- exact current pointer IDs and revision;
- policy/version strings;
- immutable audit timestamps as instants;
- ownership user UUIDs;
- merge redirect pairs;
- source/provider record identities as stored provenance.

### 11.3 Semantic equality

Use semantic equality where storage formatting is not authority:

- typed relation rows after canonical numeric/JSON serialization;
- merge topology (flattened, target active, no self/cycle/chain);
- RLS/ACL privilege semantics;
- constraint/function behavior where object-definition whitespace is irrelevant;
- rebuilt search results and pagination behavior;
- historical-snapshot safety: the consumer rows are byte/value unchanged while their referenced Food IDs still resolve according to the appropriate historical/current contract.

## 12. Mandatory restore verification matrix

**ARCHITECTURE REQUIREMENT** — a successful verifier must prove at least:

| Assertion | Comparison | Fail-closed condition |
|---|---|---|
| Canonical Food IDs | exact set equality | missing/extra/remapped UUID |
| Stable authority/history IDs | exact identity equality | regenerated ID where stable identity is required |
| Nutrition revisions | semantic row + stored checksum/evidence | changed NULL/zero/basis/value/supersession |
| Serving lineage/revisions | exact IDs + semantic graph | broken lineage/current pointer mismatch/fabricated serving |
| Name lineage/revisions | exact IDs + semantic graph | broken lineage/locale/script/name-role mismatch |
| Source provenance | exact IDs/links + checksum refs | missing source lineage or Food mismatch |
| Taxonomy/market | exact registries/assignment IDs + semantic links | unknown/misbound assignment |
| GTIN/barcode | exact effective mapping + correction history | duplicate/changed effective owner or mismatched correction |
| Merge topology | exact event/redirect semantics | cycle, chain, self redirect, wrong survivor |
| Verification/activation | exact assertion/grant IDs + chain semantics | invalid predecessor, revoked/mismatched selection |
| Generations | exact IDs/composition/checksums | composition mismatch |
| Current generation | exact pointer IDs/revision | pointer to absent/unverified generation |
| Governance | exact policy/operation/audit identities + semantic security state | missing history or unauthorized active authority |
| Personal overrides | exact owner/food/revision graph | owner mismatch, pointer mismatch, missing tombstone/history |
| Frozen consumer snapshots | exact stored snapshot values | restore rewrites historical snapshot |
| Search rebuild | RPC checksum + semantic behavior | stale generation, result/cursor/filter mismatch |
| Golden queries | exact ordered expected IDs/selected fields | any deterministic fixture mismatch |
| RLS/ACL/security | semantic privilege/policy assertions | broader access than source/architecture |
| Migration/schema compatibility | exact expected ledger/schema fingerprint | wrong/newer/older authority |
| Manifest | byte + semantic hashes | missing segment or checksum mismatch |
| Transient leases | semantic absence/neutral state | target resumes source worker/lease claim |

## 13. Consumer migration gate before retirement

**ARCHITECTURE REQUIREMENT** — destructive retirement is prohibited until repository inventory and live preflight prove zero unsupported consumers.

A consumer counts as migrated only when:

1. global Food search/read/write-handoff behavior uses the approved Food Catalog domain/current-generation boundary;
2. no Product path selects compatibility-only flat Food columns for current truth;
3. no Product path walks `merged_into_food_id` to determine current canonical identity;
4. verification uses exact generation/assertion/trust authority rather than mutable root `is_verified`;
5. owner-specific personal Food values use the approved owner authority and do not depend on a compatibility row scheduled for removal;
6. tests no longer encode the legacy behavior as required Product authority;
7. database functions/triggers/views/grants no longer depend on the retired object, except immutable historical migration text and explicitly preserved audit fixtures;
8. live Production evidence confirms the expected schema/data/dependency state immediately before the later forward retirement migration.

## 14. Legacy retirement principles

**ARCHITECTURE REQUIREMENT** — `legacy-looking` is not equivalent to `removable`.

- `food_items.id` remains a stable anchor and is **KEEP**.
- canonical tables introduced in Plans 1–6 are not retired merely because a compatibility column has a similar name.
- current root `food_items.lifecycle_status` remains used by governance/write-plane logic and is not approved for retirement by this design.
- `food_barcodes` remains effective barcode authority and is **KEEP**.
- the Plan 5 private legacy rebuild helper is currently called by the public canonical rebuild and is **KEEP** until replaced by a forward implementation that no longer depends on it.
- user-owned rows cannot be deleted to simplify global catalog retirement; they require an owner-data migration or an explicit decision to retain their model.
- immutable historical migrations, audit records, and frozen snapshots are not rewritten to erase old concepts.

The candidate-by-candidate matrix and preconditions live in the discovery inventory.

## 15. Live retirement preflight contract

**PROPOSED PLAN 7 DESIGN** — immediately before any later destructive forward migration, a read-only preflight must prove all of the following on the exact Production target:

- target project identity equals Plaivra Production and not Activity Catalog;
- migration history count/latest identity equals the Planner-approved expectation;
- repository ledger is reconciled with no pending/schema-untracked/unresolved entries;
- no newer migration/schema authority invalidates reviewed assumptions;
- candidate table/column/function signatures exactly match the reviewed schema;
- `pg_constraint`, `pg_proc`, `pg_views`, `pg_depend`/catalog evidence shows no unexpected database dependencies;
- repository code search shows no current non-historical consumer references;
- grants/policies do not expose an unexpected active API surface;
- candidate data counts/non-null counts are understood and match the approved migration strategy;
- every user-owned row that would be transformed has an exact owner-preserving migration plan;
- current Food population/generation/pointer state is understood;
- compatibility version/marker is understood and no compatibility promotion is bundled with retirement;
- consumer FK rows referencing `food_items.id` remain valid without rewriting historical snapshots;
- a disposable restore rehearsal of the exact candidate schema/data shape has already passed.

Any mismatch stops retirement. `DROP ... CASCADE` is not an acceptable dependency-discovery mechanism.

## 16. Failure and recovery model

**ARCHITECTURE REQUIREMENT** — all verification fails closed.

| Failure | Required behavior |
|---|---|
| incomplete/corrupt artifact | reject before restore |
| unsupported export/schema/canonicalization version | reject; never infer a converter |
| missing required authority relation/segment | reject |
| duplicate stable ID | reject before mutation of target authority |
| byte/semantic checksum mismatch | reject |
| partial restore | mark target untrusted; never promote pointer/use as authority |
| FK/order problem | stop and report exact relation/identity; never disable integrity as success path |
| missing source lineage | reject affected canonical authority |
| invalid merge topology | reject |
| invalid/missing generation pointer target | reject before pointer restore |
| search rebuild failure/checksum mismatch | restore verification fails |
| golden-query mismatch | restore verification fails |
| stale artifact | reject according to Planner-approved freshness policy |
| cross-environment identity mismatch | reject protected/user/security activation |
| secret/credential/lease token detected | reject artifact |
| wrong user ownership mapping | reject protected segment |
| cancellation | target remains disposable/untrusted; rerun from validated phase boundary or recreate |
| retry | idempotent by artifact root + target verification run identity; no duplicate stable IDs/events |

No failed restore target may be promoted into Production merely because most rows loaded successfully.

## 17. Target compatibility boundary

**VERIFIED CURRENT FACT** — current schema uses PostgreSQL extensions including `pg_trgm`, `pgcrypto`, and `uuid-ossp`, and current application/database security contracts include Supabase-style auth/service-role semantics.

**PROPOSED PLAN 7 DESIGN** — distinguish:

- **domain data portability**: logical authority/history is provider-neutral PostgreSQL data;
- **full runtime portability**: target must also satisfy the repository's required extension, auth-helper, RLS, and role contracts or provide an explicitly reviewed compatibility layer.

The restore verifier must publish which target capability profile it tested; it must not silently skip RLS/ACL assertions on a target that lacks the source security primitives.

**OPEN POLICY DECISION** — Planner must approve the minimum supported Plan 7 restore target profile: exact PostgreSQL major/version floor, extension availability/schema placement, and whether `auth.uid()`/Supabase role compatibility is required for the Plan 7 exit test or separately validated through an adapter profile.

## 18. Scale and repeatability

**PROPOSED PLAN 7 DESIGN** — export/restore must work for zero rows and future populated catalogs:

- stream/page by stable key instead of loading the whole catalog into memory;
- deterministic chunks/segments with independent checksums;
- bounded transaction sizes for bulk load, while current pointer stays unrestored until all chunks validate;
- resumability tracks completed immutable segment hashes, not live source DB cursors alone;
- retries are idempotent for the same artifact root;
- cancellation cannot leave an apparently valid pointer/search projection;
- verification reports include row counts and segment hashes so large-catalog failures are localizable.

## 19. Open Planner policy decisions

Implementation must not silently resolve these:

1. **Restore target profile** — exact PostgreSQL/version/extensions/auth-role compatibility required by the formal Plan 7 exit test.
2. **Governance principal reactivation** — restore active principal/capability state automatically after exact identity match, or restore as historical/inactive until explicit reauthorization.
3. **Raw source-evidence portability** — include evidence bytes in encrypted bundle when legally allowed, or standardize checksum-addressed external references only; retention/provider rights must govern.
4. **Artifact encryption/key custody** — approved encryption mechanism and operational key custody for protected user/security segments.
5. **Backup freshness/RPO acceptance** — what age makes an otherwise valid portable artifact stale for disaster-recovery approval.
6. **Barcode Product behavior** — whether Plan 7 consumer migration must make local canonical `food_catalog_lookup_effective_barcode` the first lookup before any provider-assisted fallback, or whether that Product-policy change is deferred without blocking structural retirement.
7. **Name-only duplicate UX** — replacement semantics for the current advisory My Food duplicate hint. It must never become merge authority, but whether the hint remains and which domain search powers it is Product policy.
8. **Legacy root metadata** — definitive destination/retention semantics for `tags`, `notes`, `source_type`, `is_global`, `is_editable_by_user`, `created_by`, `kitchen_id`, `subcategory_id`, and `brand_name` before any column retirement.
9. **Legacy user favorite model** — migration/reconciliation rule between `user_food_favorites(food_key)` and current `food_favorites(food_id)` where existing owner data exists.
10. **Plan 6 personal override cutover** — exact Product semantics for replacing current `food_personal_corrections` reads with Plan 6 revisioned personal overrides while preserving existing owner-visible behavior and data.

## 20. Plan 7 design acceptance criteria

This design is ready for implementation planning review when the Planner agrees that:

- logical export and physical backup are distinct;
- the portable boundary contains canonical/history authority but excludes derived/transient state;
- exact UUID identity preservation is mandatory;
- current pointer restores last;
- SearchDocuments rebuild from restored generation authority through the current public rebuild boundary;
- global serving display remains nullable until explicit serving-display authority exists;
- user/security state is protected and owner-mapped;
- every retirement is gated by consumer migration plus live dependency/data preflight;
- current mixed transitional consumers are acknowledged rather than assumed migrated;
- open policy choices remain explicit rather than embedded in implementation.

Approval of this design does **not** authorize implementation, a forward migration, Production mutation, Food population, generation promotion, compatibility promotion, deployment, Activity Catalog mutation, or Plan 8.
