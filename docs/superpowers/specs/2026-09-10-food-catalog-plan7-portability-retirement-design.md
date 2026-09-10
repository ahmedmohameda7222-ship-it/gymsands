# Plaivra Food Catalog Plan 7 — Portability, Restore Verification, and Legacy Retirement Design

Status: **Architecture re-review after independent Planner findings; implementation not authorized**
Date: **2026-09-10**
Architecture class: **Architectural / long-term target design**
Parent architecture: `docs/superpowers/specs/2026-09-01-food-catalog-intelligence-architecture-design.md`
Program roadmap: `docs/superpowers/plans/2026-09-01-food-catalog-intelligence-program-roadmap.md`
Discovery inventory: `docs/superpowers/plans/2026-09-10-food-catalog-plan7-discovery-inventory.md`
Implementation plan: `docs/superpowers/plans/2026-09-10-food-catalog-plan7-portability-retirement.md`
Implementation authority: **Not granted by this document**
Production mutation authority: **Not granted by this document**
Deployment authority: **Not granted by this document**

## 1. Purpose and phase boundary

Plan 7 remains one roadmap plan with two sequential workstreams:

1. **Portability / backup / export / restore verification** — establish a provider-neutral logical Food Catalog export and prove that Git schema authority plus an approved export can reconstruct the catalog on an isolated compatible PostgreSQL target while preserving Plaivra identities, current-generation authority, required history, ownership, and security semantics.
2. **Consumer cutover / legacy retirement** — migrate Product and database consumers through an expand/deploy/contract sequence, prove the exact deployed artifact no longer requires retirement candidates, and only then retire an explicitly approved destructive set through forward migrations.

Plan 7 is not a Food population plan, provider-ingestion plan, compatibility-promotion plan, Activity Catalog plan, or Plan 8. Physical Supabase/database backups remain useful platform DR artifacts but are not the provider-neutral Food Catalog export required by Plan 7.

The Plan 7 exit condition is:

> Plaivra can restore or move the Food Catalog onto a compatible PostgreSQL 17.x target from Git schema authority plus an approved `FULL_DR` artifact while preserving exact canonical Food IDs, all authority/history required to interpret them, protected owner/security state and identity prerequisites, current-generation semantics, and valid consumer references; derived search can be rebuilt and verified; and obsolete transitional authority is retired only after the exact deployed application has cut over and live read-only evidence plus Planner authorization prove the destructive set safe.

## 2. Evidence labels

- **VERIFIED CURRENT FACT** — confirmed against current repository authority and/or read-only Production evidence on 2026-09-10.
- **ARCHITECTURE REQUIREMENT** — binding Food Catalog architecture or frozen Planner policy for Plan 7.
- **PROPOSED PLAN 7 DESIGN** — implementation design proposed for later authorization; no implementation authority is implied.
- **KEEP / UNKNOWN PENDING EVIDENCE** — no retirement is authorized until exact meaning/replacement and live dependencies are proven.

The previous Plan 7 open-policy items listed in this document are resolved by the frozen Planner policy block below. Per-object retirement approval remains a later explicit Planner decision.

## 3. Verified starting state

**VERIFIED CURRENT FACT** — repository `main` remains at Plan 6 closure commit `7f2882d6ad3c67489622ff4be68a4506a2722319` at this documentation review point.

**VERIFIED CURRENT FACT** — read-only Plaivra Production inspection established:

- PostgreSQL server version: **17.6**;
- physical migration records: **123**;
- latest physical migration: `20260910071241_food_catalog_governance_gtin_lock_exactness`;
- migration ledger pending/schema-untracked/unresolved counts: **0 / 0 / 0**;
- `food_items = 0`, `food_source_records = 0`, ingestion/generation/search populations from the Plan 7 baseline = `0`;
- `current_generation_id = NULL`, `pointer_revision = 0`;
- schema compatibility version `2`; released compatibility marker `20260724232734`;
- `food_personal_corrections = 0`, `food_favorites = 0`, while `user_food_items` and `user_food_favorites` contain owner data;
- `food_items.food_name` is currently **NOT NULL**;
- migration-created reference/singleton state exists despite zero global Foods: `food_taxonomy_namespaces = 6`, `food_taxonomy_nodes = 14`, `market_scopes = 9`, `market_scope_memberships = 3`, `food_catalog_governance_policy_versions = 1`, one governance policy-pointer row, one current-generation singleton row, and one release-schema-compatibility singleton row;
- required PostgreSQL capabilities include `pgcrypto`, `pg_trgm`, and `uuid-ossp`;
- Activity Catalog remains a separate authority and is outside Plan 7 mutation scope.

An empty global catalog is therefore neither an empty database nor authorization to delete owner/reference/compatibility state.

## 4. Binding invariants

Plan 7 preserves all of the following:

1. Stable Plaivra `food_items.id` UUIDs survive export/restore exactly.
2. Catalog Generation remains the sole current-effective global Food authority.
3. Every authoritative export is captured from **one PostgreSQL MVCC snapshot**.
4. Migration/current-pointer observations recorded in an artifact come from that same snapshot as every exported authoritative segment.
5. Independent REST/API pagination without a common PostgreSQL snapshot is not authoritative export evidence.
6. No Product write lock or stop-the-world catalog lock is introduced for export.
7. Nutrition revisions remain immutable/versioned; `NULL` and zero remain distinct.
8. Serving/name facts preserve stable lineage and no serving/unit conversion is fabricated.
9. Merge history is immutable; generation redirects remain flattened/cycle-free.
10. Source/release provenance, verification/activation evidence, governance/correction/audit history, and policy interpretation are preserved.
11. My Foods remain separate owner authority.
12. Personal overrides remain owner-scoped; historical Diary/Recipe/Saved Meal/Meal Plan snapshots are never rewritten.
13. Search is derived/rebuildable and never canonical truth.
14. A relation is classified `DERIVED / REBUILD` only if an exact deterministic rebuild/migration source exists.
15. Classification and restore **load mode** are independent concepts.
16. Migration-seeded rows are validated, not blindly inserted/upserted.
17. Authoritative scalar transport is lossless before JavaScript canonicalization; the canonicalizer cannot repair precision already lost by a parser.
18. Protected encryption is randomized; deterministic semantic hashing is a separate plaintext operation.
19. Artifact validity is independent from RPO/freshness eligibility.
20. `CORE_PORTABLE` cannot emit final Plan 7 DR-ready status; only `FULL_DR` can.
21. Repository cutover alone is insufficient for destructive Production retirement; live deployed-consumer cutover is mandatory.
22. Applied migrations are immutable. Any later change is forward-only and receives an identity allocated from then-current migration authority at the exact task that creates it.
23. Deployment, Production DB mutation, Food population, provider ingestion, generation promotion, compatibility promotion, Activity Catalog mutation, and Plan 8 each require separate authority where applicable.

## 5. Export profiles and readiness

Plan 7 V1 defines two explicit profiles.

### 5.1 `CORE_PORTABLE`

Includes global canonical Food authority plus required non-personal audit/history/policy state. It may prove:

- canonical identity portability;
- generation portability;
- deterministic search rebuild portability.

It **may not** emit final Plan 7 disaster-recovery readiness.

### 5.2 `FULL_DR`

Includes `CORE_PORTABLE` plus:

- protected governance/security history;
- protected owner Food Catalog state;
- exact external user-identity mapping prerequisites.

Only `FULL_DR` may satisfy final Plan 7 DR readiness.

CI uses deterministic protected fixtures and ephemeral test keys. Real Production PII/security plaintext must never be uploaded to GitHub Actions artifacts. If a real protected Production export is separately authorized, CI/repository evidence stores only approved non-sensitive attestations/hashes.

## 6. Physical backup versus provider-neutral logical export

A physical/platform backup solves instance-level recovery and may include platform schemas, implementation-specific catalogs, operational leases, and storage details. It does not prove deterministic provider-neutral Food Catalog portability.

Plan 7 defines the logical artifact:

`plaivra-food-catalog-portable-export`

with `formatVersion = 1` and separate `canonicalizationVersion = 1`.

Conceptual structure:

```text
food-catalog-export/
  manifest.json
  segments/
    <logical-segment>.ndjson
  protected/
    <protected-segment>.ndjson.enc
  evidence/
    source-artifact-manifest.json
```

A zero-row catalog is a valid first-class artifact. Required empty segments remain present with `rowCount = 0` and deterministic plaintext semantic hashes.

## 7. One-snapshot export contract

Every authoritative export adapter must use one read-only PostgreSQL `REPEATABLE READ` MVCC snapshot.

Two supported shapes are allowed:

- **single connection/transaction:** `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, keep that transaction open for all source observations and segment reads;
- **parallel/multi-connection:** an exporting transaction establishes the snapshot with equivalent `pg_export_snapshot()` semantics, and every worker imports that exact snapshot before issuing any authoritative query while the exporting transaction remains valid.

The artifact records a snapshot-boundary descriptor containing at minimum:

- source database/environment identity suitable for non-secret evidence;
- PostgreSQL snapshot evidence (`pg_current_snapshot()`/exported-snapshot equivalent);
- transaction/snapshot capture time from PostgreSQL;
- migration count/latest migration observation;
- migration-ledger/repository identity used for interpretation;
- current-generation pointer observation;
- compatibility observation;
- one snapshot-boundary checksum referenced by every authoritative segment descriptor.

No segment may claim authority if it was read outside that snapshot boundary.

### Torn-export negative proof

A mandatory test starts an export, reads one authority segment, commits a concurrent source write that changes another authority relation/current pointer, then continues the export. The trusted artifact must contain **only the pre-write snapshot state** (or, for a later separate export, only the post-write state). It must never combine both states. An adapter that pages independent REST/API calls without a common database snapshot must be rejected for authoritative export.

This design uses MVCC consistency, not a Production write lock.

## 8. Manifest, classification, and restore load modes

`manifest.json` contains at least:

- format/profile/version/canonicalization version;
- source repository commit and schema fingerprint;
- same-snapshot migration/current-pointer/compatibility evidence;
- snapshot-boundary descriptor/checksum;
- required segment inventory;
- per-segment relation/classification;
- explicit `loadMode`;
- stable sort key;
- row count;
- deterministic **plaintext semantic SHA-256**;
- transport/ciphertext SHA-256 where applicable;
- required/optional/protected markers;
- overall semantic root calculated only from deterministic semantic fields/plaintext semantic digests;
- volatile envelope metadata such as `capturedAt`, which is evidence and not semantic equality.

### 8.1 Required load modes

The relation registry uses explicit load modes independent from canonical classification:

- `VALIDATE_PRESEEDED` — Git migrations already created the row/reference. Never blind insert/upsert. Validate the migration-owned identity/content; relation-specific mutable fields may then be restored only through an exact keyed update contract.
- `RESTORE_EXACT` — insert/restore exact stable IDs and authoritative persisted values from the artifact.
- `RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION` — restore durable history/authority exactly while forcing explicitly transient lease/claim fields to safe neutral state.
- `RECONSTRUCT_TRANSITIONAL_COMPATIBILITY` — preserve/reconstruct physical compatibility values required by the currently tested pre-retirement schema/runtime without elevating them to canonical truth.
- `DERIVED_REBUILD` — do not import rows; invoke a defined deterministic rebuild from restored authority.

A physical relation may map to multiple logical segments/load phases where migration-owned seed rows and runtime-created rows have different behavior.

### 8.2 Seeded/reference examples

Current migrations already create/reference state that must not be blindly inserted:

- taxonomy registry: `food_taxonomy_namespaces`, migration-seeded `food_taxonomy_nodes`;
- market registry: `market_scopes`, `market_scope_memberships`;
- governance policy seed and `food_catalog_governance_policy_pointer`;
- `food_catalog_current_generation` singleton;
- `release_schema_compatibility` singleton used for target/schema evidence.

For a relation that later contains additional runtime-created rows, seed-owned keys are `VALIDATE_PRESEEDED` while non-seed portable rows are restored exactly under a separate logical segment/rule.

### 8.3 Current pre-retirement `food_items`

`food_items` is an identity root plus transitional physical compatibility state. Because `food_name` is currently `NOT NULL` and runtime/DB equivalence still depends on flat fields, the export must preserve every physical compatibility value required by the tested schema/runtime until each field is formally retired. An `id`-only insert is not a valid current-schema restore strategy.

The artifact does not promote those compatibility values to long-term canonical authority; it preserves them under `RECONSTRUCT_TRANSITIONAL_COMPATIBILITY` so the pre-retirement schema can be restored exactly enough to satisfy constraints and runtime equivalence.

## 9. Lossless PostgreSQL scalar transport and canonicalization

Authoritative values must cross the PostgreSQL-to-export boundary in a type-aware/lossless representation **before** JavaScript can coerce them.

The adapter must retain PostgreSQL type identity and canonical/raw database text sufficient for exact round-trip. Native JS `number` and JS `Date` are prohibited as the first authoritative representation for precision-bearing values.

Required coverage:

- PostgreSQL microsecond timestamps;
- `bigint` outside JS safe-integer range;
- large/high-precision `numeric` values;
- decimal lexical normalization;
- JSONB with nested large/high-precision numeric values;
- `NULL` versus zero;
- exact typed round-trip back into PostgreSQL.

### 9.1 Numeric rules

Transport retains the exact PostgreSQL numeric text. Semantic hashing parses decimal text without binary floating point, normalizes sign/leading zeros, removes only semantically redundant trailing fractional zeros, and normalizes negative zero to zero. Exponent notation is not emitted in the semantic canonical form. Restore uses the lossless transport text cast to the declared PostgreSQL type.

### 9.2 Timestamp rules

Transport preserves the exact PostgreSQL microsecond instant. Canonical semantic form is UTC with six fractional digits and `Z`. No JS `Date` round-trip is allowed to truncate or reinterpret source precision.

### 9.3 JSONB rules

JSONB is transported as lossless PostgreSQL JSONB text or an equivalent token-preserving representation. Recursive canonicalization sorts object keys but preserves array order unless the relation contract declares an array to be an unordered set. Numeric tokens are canonicalized without JS floating-point conversion.

Post-restore tests compare typed PostgreSQL values (`IS NOT DISTINCT FROM`/type-appropriate equality) and semantic canonical hashes.

## 10. Protected segments: randomized encryption versus deterministic hashes

Plan 7 V1 protected segments use:

- **AES-256-GCM**;
- a fresh cryptographically random nonce for **every encrypted segment on every encryption run**;
- key material supplied by an external key-custody/provider interface;
- ephemeral test keys in CI only;
- no plaintext fallback.

No key material may appear in Git, manifest fields, artifact metadata, logs, or generated QA evidence. A paid cloud KMS is not a mandatory dependency.

Two hashes are distinct:

1. **canonical plaintext semantic SHA-256** — deterministic for the same logical authority and used by the manifest semantic root;
2. **ciphertext/transport SHA-256** — integrity of the encrypted transport bytes and allowed/expected to differ when fresh nonces are used.

The manifest semantic root must never depend on randomized ciphertext bytes, nonce values, or transport hashes.

Negative contracts must reject nonce reuse for the same key and reject any implementation/test expectation that identical plaintext produces deterministic ciphertext. Re-encrypting the same protected segment with fresh nonces should preserve plaintext semantic SHA-256 while changing ciphertext/transport SHA-256.

## 11. Portable boundary and deterministic rebuild rule

### Portable authority

Export exact state needed to reconstruct identity/effective authority: Food IDs, source provenance, immutable nutrition/name/serving/taxonomy/market/barcode/verification facts, Activation Sets, Catalog Generations/composition, policy state, current pointer, Plan 6 lineages, and protected personal/governance authority where the profile requires it.

### Portable audit/history

Preserve activation/generation events, validation reports/findings, Plan 4 manifests/quarantine/reconciliation/release diffs, correction/governance operations/audits/lifecycle evidence, merges, and personal-override operation history where required.

### Derived/rebuildable

`food_catalog_search_documents`, search indexes, generated search vectors, and other objects with a **defined deterministic rebuild source** use `DERIVED_REBUILD`.

A transitional relation is not discardable merely because it is not long-term truth. In the current pre-retirement schema, `food_aliases` and `food_market_relevance` are preserved as transitional portable compatibility state unless/until exact retirement removes them; neither is classified derived merely from architectural preference.

### Transient/do not export

Exclude credentials/secrets, active lease tokens/worker claims, caches/staging, and state that would resume source-environment work incorrectly.

### Outside Food Catalog / reference only

Diary, Recipe, Saved Meal, Meal Plan and My Foods remain separate Product/user authority. Controlled reference extracts/fixtures may prove Food-ID and frozen-snapshot compatibility but do not become global catalog truth.

## 12. Governance/security, owner state, and raw source evidence

Cross-environment restore does **not** automatically reactivate external operational authority.

- Preserve exact governance principal/capability/policy/audit history in protected `FULL_DR` segments.
- Never export service credentials/secrets.
- Service credentials are rotated/rebound separately.
- Human authority requires exact auth/account identity binding validation before runtime enablement.
- Do not enable `food.outbox.deliver` service authority until pending outbox/event replay reconciliation is explicitly complete.
- The restored target remains operationally isolated until external identity/authorization cutover is separately approved.

Owner rows fail closed if target identity mapping is absent, ambiguous, or cross-owner.

Default source evidence portability is database provenance plus checksum-addressed external evidence references. Raw provider/source bytes are included only where a source-specific legal/retention policy explicitly permits portability.

## 13. Restore target capability profile

Plan 7 V1 certification target is:

- PostgreSQL major **17**;
- compatible PostgreSQL **17.x**;
- current Production independently verified as PostgreSQL **17.6**;
- required capabilities: `pgcrypto`, `pg_trgm`, `uuid-ossp`;
- disposable certification may provide a thin compatibility harness for Supabase-style `auth` helpers and `anon`/`authenticated`/`service_role` RLS role contracts.

Plan 7 proves Food Catalog domain/schema/data portability. Full authentication-provider/platform portability is **not** a Plan 7 exit requirement.

Every verifier report states the exact target capability profile tested and must not silently skip RLS/ACL assertions.

## 14. Disposable restore model

Restore verification runs only against an isolated disposable target and is fail-closed.

1. **Artifact structural validity** — supported versions/profile, mandatory segments, stable IDs, hashes, secret scan; no RPO rejection here.
2. **Target preflight** — prove disposable target, PostgreSQL 17.x capability profile, and not Plaivra Production/Activity Catalog.
3. **Git schema construction** — build from exact reviewed migrations/schema authority; exported DDL is not authority.
4. **Schema/security fingerprint** — constraints/RLS/grants/functions/extensions.
5. **Validate preseeded reference/singleton rows** — compare migration-created identities/content rather than insert/upsert.
6. **Restore stable Food roots with current-schema compatibility values** — no `id`-only shortcut.
7. **Restore source/canonical authority** — immutable facts/provenance/lineages.
8. **Restore audit/control plane** — exact history, transient claim/lease neutralization.
9. **Restore generations/composition/validation/events**.
10. **Pre-pointer verification** — exact graph/checksum/policy assertions.
11. **Restore current-generation pointer last** by exact keyed singleton update after its migration-created row has been validated.
12. **Restore protected owner/security state** for `FULL_DR`, keeping target operationally isolated.
13. **Rebuild derived search** from the exact restored generation.
14. **Consumer-reference and frozen-snapshot verification**.
15. **Final FK/RLS/ACL/identity/hash/security verification**.
16. **Recovery eligibility evaluation** under an explicit caller-supplied RPO policy.
17. **Evidence report** — source artifact root, snapshot boundary, target profile, schema fingerprint, comparison results, recovery-eligibility decision.

No step writes to Plaivra Production.

## 15. Current non-deferrable `food_items` / `food_source_records` cycle

Current schema has a non-deferrable cycle:

- `food_source_records.food_id → food_items.id`;
- `(food_items.verified_source_record_id, food_items.id) → food_source_records(id, food_id)`.

While the compatibility FK exists, the loader must preserve all current physical `food_items` values required by schema/runtime but temporarily neutralize only the cyclic `verified_source_record_id` field:

1. load the exact Food row values required by the current schema, with `verified_source_record_id = NULL` only for this controlled phase;
2. restore exact source records and canonical facts;
3. reconstruct the exported `verified_source_record_id` under `RECONSTRUCT_TRANSITIONAL_COMPATIBILITY`;
4. validate the composite FK and exact compatibility value;
5. never treat that root field as canonical verification authority.

The workaround disappears only after a separately approved retirement removes the compatibility field/FK.

## 16. Artifact validity versus recovery eligibility

### Pure artifact validity

Artifact validation checks structure, supported versions/profile, required segments, exact ownership, snapshot binding, hashes, schema/profile declarations, secret/transient exclusions, and semantic integrity. **Age alone does not make an artifact invalid.**

`capturedAt`/snapshot time is evidence.

### Recovery eligibility

A separate operation accepts an explicit policy such as:

```text
evaluateRecoveryEligibility(manifest, { maxArtifactAge, evaluationTime })
```

A DR/cutover caller may reject an otherwise valid artifact when it exceeds that operation's RPO/max-age. There is no universal hard-coded Plan 7 TTL.

## 17. Restore equality and verification matrix

Three comparison classes remain mandatory:

- **byte/hash equality** — transport bytes where required, plaintext semantic segment hashes, manifest semantic root, stored architecture-defined checksums, source-evidence references;
- **exact identity/value equality** — Food UUIDs, fact/revision/event/report/operation IDs, generation composition, pointer IDs/revision, policy strings, ownership IDs, merge redirects, typed timestamps/scalars;
- **semantic equality** — canonical JSON/numeric values, graph integrity, RLS/ACL behavior, rebuilt search behavior, frozen historical snapshot preservation.

Mandatory assertions include canonical Food ID set, stable authority/history ID set, nutrition/name/serving lineage, source provenance, taxonomy/market, GTIN/barcode corrections, merges, verification/activation, generations, current pointer, governance/personal overrides, frozen consumer snapshots, search rebuild/golden queries, security/RLS, migration/schema fingerprint, transient neutralization, and manifest/snapshot consistency.

Any unknown mandatory assertion fails trust.

## 18. Search rebuild and golden verification

Current canonical boundaries remain:

- `public.rebuild_food_catalog_search_projection_v2(uuid,text,text)`;
- `public.search_food_catalog_v2(...)`;
- `food_catalog_search_documents` as derived generation-keyed state.

The public rebuild currently depends on `private.food_catalog_search_projection_v2_legacy_rebuild(...)` and then corrects global serving display to `NULL`; that private helper remains **KEEP** until a forward replacement is independently proven.

Restore sequence:

```text
restore exact authority/current pointer
  → read exact generation + projection version
  → rebuild current projection
  → verify documentCount + projectionChecksumSha256
  → run deterministic golden queries
```

With `current_generation_id = NULL`, no rebuild is invoked and zero SearchDocuments is valid.

Golden coverage includes exact/strong names and aliases, prefix/contains ranking, locale/script, market direct/parent/GLOBAL, category/current cuisine behavior, nullable numeric filters and presets, favorites/recent/My Foods fixtures, cursor continuation/context rejection, redirect behavior, stale-generation isolation, and nullable serving display.

## 19. Frozen Product-policy decisions for Workstream 2

### Catalog barcode behavior

1. normalize/validate GTIN;
2. query local canonical `food_catalog_lookup_effective_barcode`;
3. when a canonical active result exists, use local Plaivra authority;
4. provider-assisted lookup may occur only on canonical miss;
5. provider result is suggestion/source evidence only and never overwrites canonical authority.

This introduces no Plan 8/provider ingestion.

### Name-only duplicate hint

Keep it advisory only and use approved V2/current-generation search. Prefer exact/strong normalized matches as “possible existing match” suggestions. The user may ignore it. Name similarity never automatically merges, mutates, or blocks creation.

### Transitional local Egyptian dataset

`@/data/egyptian-foods` must never remain or become global canonical Food authority. Before the first real Catalog Generation, Product UX may retain it only as an explicitly isolated **non-canonical/manual suggestion source**. It must not create fake global Food IDs, bypass current-generation authority, become search authority, or fabricate verified provenance.

The intended migration boundary is:

- no current generation: suggestions may prefill a manual/My Food flow or non-canonical text entry, clearly typed as non-catalog;
- current generation exists: global catalog results come only from approved generation/search authority;
- the suggestion dataset never enters `source='catalog'` handoff semantics unless a real canonical Food ID is resolved independently.

### Unresolved root metadata

These are **KEEP / UNKNOWN PENDING EVIDENCE**, not authorized retirement objects:

`tags`, `notes`, `source_type`, `is_global`, `is_editable_by_user`, `created_by`, `kitchen_id`, `subcategory_id`, `brand_name`.

Workstream 2 must prove exact Product meaning/replacement and obtain later Planner approval for each. Do not invent a new canonical destination merely to enable deletion.

## 20. Legacy owner favorites and personal corrections

### Heterogeneous `user_food_favorites(food_key)`

Legacy favorite keys are heterogeneous and must be classified row-by-row:

- exact UUID resolving to global `food_items.id` → may migrate to `food_favorites` for the same owner;
- exact UUID resolving to that owner's `user_food_items.id` → preserve My Food favorite semantics; **do not** convert to a global favorite;
- text/log-derived `food_name|serving_size` key → preserve as legacy owner state or migrate only to a separately approved owner-favorite model;
- unknown/ambiguous key → explicit blocker/preserved state, never discard.

Legacy favorite retirement requires zero unmapped owner rows plus exact owner-preserving evidence.

### `food_personal_corrections`

Product reads/writes cut over to Plan 6 personal overrides. At live retirement preflight:

- if Production count remains exactly zero, a verified no-op data migration is acceptable;
- if any row exists, **STOP** and require an explicit owner-preserving semantic migration design before retirement.

Rows are never discarded merely because the table is legacy.

## 21. Expand / deploy / contract retirement sequence

Repository migration is necessary but not sufficient for Production DROP.

Required high-level order:

1. implement and verify repository consumer cutover;
2. separately review/apply any backward-compatible **expand/reconciliation** DB authority required by the new code;
3. deploy the consumer-cutover application artifact only under separate Planner deployment authorization;
4. prove exact deployed artifact SHA and live compatibility behavior;
5. observe/read-only verify no live consumer requires retirement candidates;
6. run exact retirement preflight;
7. Planner approves the exact destructive set;
8. only then create/merge/apply the explicit forward retirement migration under the required repository/Production authorizations;
9. perform fresh Production read-back plus full portability/search re-proof.

A Production retirement migration is prohibited while the deployed application artifact is still pre-cutover.

## 22. Live retirement preflight

Immediately before any later destructive action, read-only evidence must prove:

- exact Production target and migration/ledger authority;
- exact deployed application SHA is the reviewed cutover artifact or approved descendant preserving the contract;
- live behavior demonstrates no pre-cutover compatibility consumer remains;
- exact candidate schema signatures, grants, constraints, functions, views, and dependency catalog state;
- repository search at exact candidate head has no unsupported non-historical references;
- candidate data/non-null counts match approved migration semantics;
- every owner row has exact owner-preserving disposition and zero unmapped rows for objects proposed for retirement;
- current generation/pointer/compatibility state is understood;
- historical consumer Food IDs/snapshots remain valid;
- fresh disposable portability proof matches the exact schema/cutover state.

Any mismatch stops retirement. Zero rows plus no known repository reader is not sufficient authorization. `DROP ... CASCADE` is prohibited as dependency discovery.

`food_market_relevance` is therefore **RETIRE AFTER PRECONDITION**, not a “retire now” candidate.

## 23. Migration identity allocation

Plan 7 does not reserve long-lived future timestamps/filenames.

At the exact task that needs a migration:

1. read then-current `main`;
2. inspect latest repository and Production migration authority;
3. allocate the next safe repository migration identity;
4. record that identity and evidence in the task/PR **before** SQL creation.

Never silently rename an already-applied migration.

## 24. Failure/recovery rules

All mandatory verification fails closed. Corruption, unsupported versions, missing segments, duplicate stable IDs, checksum/snapshot mismatch, precision loss, wrong owner mapping, invalid merge/generation graph, security widening, search mismatch, target-profile mismatch, active transient claims, or missing deployed-cutover evidence make the relevant operation untrusted/ineligible.

A valid artifact may still be ineligible for a particular recovery because of caller-supplied RPO; that does not retroactively make its structure/hashes invalid.

No failed/partial disposable restore may be promoted merely because most data loaded.

## 25. Frozen Planner policy block

The following are binding for Plan 7 V1:

- **Snapshot:** one PostgreSQL MVCC snapshot per authoritative export; no independent unsnapshotted REST pagination.
- **Restore target:** PostgreSQL 17.x; current Production 17.6; `pgcrypto`, `pg_trgm`, `uuid-ossp`; optional thin Supabase auth/role compatibility harness for certification.
- **Portability scope:** Food Catalog domain/schema/data portability; full auth-provider/platform portability is not required.
- **Profiles:** `CORE_PORTABLE` for global/core proof; `FULL_DR` for final DR readiness.
- **Protected encryption:** AES-256-GCM, fresh random nonce per encrypted segment/run, external key provider, ephemeral CI keys, no plaintext fallback.
- **Hashes:** deterministic plaintext semantic SHA-256 separate from randomized ciphertext/transport SHA-256; semantic root excludes ciphertext/nonce.
- **Governance reactivation:** preserve history, rotate/rebind service credentials, validate human identity binding, isolate target until authorization cutover, keep `food.outbox.deliver` disabled until replay reconciliation.
- **Source evidence:** DB provenance + checksum-addressed external references by default; raw bytes only when source-specific legal/retention policy permits.
- **RPO:** no global TTL; artifact validity and operation-specific recovery eligibility are separate.
- **Barcode:** local canonical GTIN lookup first; provider only on canonical miss and only as suggestion/evidence.
- **Duplicate hint:** advisory V2/current-generation strong normalized match only; never merge/block automatically.
- **Root metadata:** listed unresolved metadata remains KEEP / UNKNOWN PENDING EVIDENCE.
- **Legacy favorites:** heterogeneous row classification; no blanket `user_food_favorites → food_favorites` migration.
- **Personal corrections:** Product cuts to Plan 6 overrides; zero rows may permit verified no-op, nonzero rows stop for explicit owner-preserving design.
- **Egyptian dataset:** non-canonical/manual suggestion source only; never global authority.
- **Derived classification:** only with an exact deterministic rebuild source.
- **Deployment:** separately authorized deployment is mandatory in the eventual expand/deploy/contract retirement gate.

## 26. Design acceptance and authorization boundary

Architecture re-review should verify that every P1/P2 correction above is frozen consistently in the design, discovery inventory, and implementation plan.

Approval of this design does **not** authorize implementation, migration creation, Production mutation, deployment, Food population, provider ingestion, activation, generation promotion, compatibility promotion, Activity Catalog mutation, destructive retirement, or Plan 8.
