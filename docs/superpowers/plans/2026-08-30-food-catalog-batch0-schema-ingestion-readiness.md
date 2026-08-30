# Food Catalog Batch 0 — Schema + Ingestion Readiness Implementation Plan V2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. TDD is mandatory.

**Goal:** Make Plaivra's canonical Food Catalog structurally ready for multi-year, replayable, versioned, market-aware ingestion without importing or activating a single Food.

**Architecture:** One forward-only schema-readiness migration adds nullable core nutrition, display brand identity, fail-closed region-safe market relevance, GTIN identity, versioned provenance, immutable reviewed ingestion batches/source snapshots, frozen reviewed membership, and durable execution-run audit history. Generic pure TypeScript contracts/normalization/validation/manifest code provide the stable target for later source adapters. No provider adapter or Production population belongs in Batch 0.

**Tech Stack:** PostgreSQL/Supabase, TypeScript 5.9, Vitest, Node.js 24 `node:crypto`, existing Nutrition V1 Food Catalog services.

**Spec:** `docs/architecture/food-catalog-data-population-launch-readiness-authority.md` contains the approved V2 authority. Planner post-phase-close corrections on PR #158 further require fail-closed market classification and durable reviewed-ingestion audit history; where this plan's original wording differed, the corrected wording below is authoritative.

## Global Constraints

- Start only from verified current `main` after merged PR #157.
- Expected starting main at plan approval: `488203fdee566b82c30a51ca9b6cbc050cfaf61f`. If `main` has moved before implementation starts, STOP and reconcile the new base with Planner rather than silently using an old base.
- One executor, one branch, one PR.
- Batch 0 only; zero Food population.
- No provider dataset download or provider-specific adapter.
- No Production database mutation or migration application.
- No compatibility-marker promotion.
- No rewrite of applied migrations. The Batch 0 readiness migration may be corrected in place only while it remains repository-only/unapplied.
- No external DB/search/cache/queue/worker/paid dependency.
- No market-aware runtime ranking or market inference.
- Global market relevance is explicit and fail-closed: omitted classification must not silently become global.
- No broader MCP completeness or prompt redesign.
- Preserve PR #157 canonical Food search/write behavior.
- Missing nutrition remains `NULL`.
- `sugars_g` is canonical total sugars for new ingestion.
- Internal ingestion/GTIN/market infrastructure is least-privilege and not an arbitrary public/member data surface.
- Stop before merge/deploy/Production migration/Batch 1.

---

## File Structure

### Authority
- Create: `docs/architecture/food-catalog-data-population-launch-readiness-authority.md`
- Create: `docs/superpowers/plans/2026-08-30-food-catalog-batch0-schema-ingestion-readiness.md`

### Database
- Create exactly one new migration whose suffix is `_food_catalog_population_readiness.sql`.
- Create: `supabase/verification/food-catalog-population-readiness.sql`

### Generic ingestion library
- Create: `lib/food-catalog/ingestion/contracts.ts`
- Create: `lib/food-catalog/ingestion/normalize.ts`
- Create: `lib/food-catalog/ingestion/validate.ts`
- Create: `lib/food-catalog/ingestion/manifest.ts`

### Existing privileged catalog service
- Modify: `services/nutrition-v1/server/food-curation.ts`

### Tests/guards
- Create: `lib/product/food-catalog-population-readiness-migration.test.ts`
- Create: `lib/product/food-catalog-ingestion-boundary.test.ts`
- Create: `lib/food-catalog/ingestion/normalize.test.ts`
- Create: `lib/food-catalog/ingestion/validate.test.ts`
- Create: `lib/food-catalog/ingestion/manifest.test.ts`
- Modify/add focused Food curation tests.
- Register the Batch 0 DB verification SQL in the permanent local-only database verification chain.

---

## Task 0 — Exact-base preflight

- [ ] Verify PR #157 is closed+merged.
- [ ] Fetch current `origin/main`.
- [ ] If current main is not the expected approved base `488203fdee566b82c30a51ca9b6cbc050cfaf61f`, STOP and report base drift before implementation.
- [ ] Create one branch: `feat/food-catalog-batch0-readiness`.
- [ ] Prove clean local HEAD == `origin/main`.

Commands:

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
git rev-parse HEAD
git rev-parse origin/main
git status --short
git checkout -b feat/food-catalog-batch0-readiness
```

---

## Task 1 — Add approved V2 authority and plan

- [ ] Copy the supplied V2 authority to `docs/architecture/food-catalog-data-population-launch-readiness-authority.md`.
- [ ] Copy this V2 plan to `docs/superpowers/plans/2026-08-30-food-catalog-batch0-schema-ingestion-readiness.md`.
- [ ] Apply any later Planner corrections explicitly to stale implementation-plan wording while preserving the approved scope boundary.
- [ ] Confirm both explicitly prohibit population/Production/provider adapters/ranking changes.
- [ ] Commit docs only when this is the active task stage.

---

## Task 2 — Create RED migration contract without hardcoding a timestamp

**File:** `lib/product/food-catalog-population-readiness-migration.test.ts`

- [ ] Test discovers exactly one new migration in the branch diff ending `_food_catalog_population_readiness.sql`; it must not hardcode a timestamp decided before branch creation.
- [ ] Assert it makes `calories/protein_g/carbs_g/fat_g` nullable.
- [ ] Assert it adds `brand_name`, `is_market_global` and that `is_market_global` defaults `false`.
- [ ] Assert it creates `food_ingestion_batches`, `food_ingestion_runs`, `food_ingestion_batch_records`, `food_barcodes`, `food_market_relevance`.
- [ ] Assert it version-enables `food_source_records` and removes the legacy global uniqueness `UNIQUE(provider, source_record_id)`.
- [ ] Assert it introduces version-aware uniqueness for bulk provenance and preserves a bounded legacy/manual uniqueness path.
- [ ] Assert reviewed-batch semantic authority, source snapshots after participation, reviewed membership, and run audit identity/terminal history are DB-guarded.
- [ ] Assert internal tables enable RLS and do not grant broad anon/authenticated mutation.
- [ ] Assert no Food population/COPY/seed and no compatibility-marker change.
- [ ] Run test and prove RED before implementation.
- [ ] Commit RED test.

---

## Task 3 — Create the one forward migration

### 3.1 Migration filename

Use repository/Supabase convention at execution time:

```bash
supabase migration new food_catalog_population_readiness
```

If CLI generation is unavailable, use the current UTC 14-digit migration timestamp after verifying no collision. Do not reuse an old draft's hardcoded timestamp. Once created, keep this same migration while it remains repository-only/unapplied; do not add a follow-up migration for pre-apply corrections.

### 3.2 Nullable core nutrition

```sql
alter table public.food_items
  alter column calories drop not null,
  alter column protein_g drop not null,
  alter column carbs_g drop not null,
  alter column fat_g drop not null;
```

Preserve existing non-negative checks.

### 3.3 Display brand + fail-closed global market relevance

Add:

```text
food_items.brand_name text null
food_items.is_market_global boolean not null default false
```

Add nonblank check for non-null `brand_name`.

`is_market_global` is fail-closed. A future adapter or ingestion path that omits market classification must receive `false`; global relevance must be supplied explicitly. This does not authorize market-aware runtime ranking or user-market inference in Batch 0.

Do not create a full Brand domain in Batch 0; `brand_name` is a stable compatibility/display field and future normalization must be additive.

### 3.4 Immutable reviewed semantic batch authority

Create `public.food_ingestion_batches` with at minimum:

```text
id uuid primary key default gen_random_uuid()
provider text not null
dataset_name text not null
source_version text not null
source_release_date date null
license_name text not null
license_reference text null
source_reference text null
source_checksum_sha256 text not null
importer_version text not null
config_checksum_sha256 text not null
manifest_content_checksum_sha256 text null
review_state text not null default 'prepared'
reviewed_at timestamptz null
approved_at timestamptz null
approval_reference text null
input_count integer not null default 0
accepted_count integer not null default 0
rejected_count integer not null default 0
matched_count integer not null default 0
created_count integer not null default 0
possible_duplicate_count integer not null default 0
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Checks and lifecycle:
- required text nonblank;
- SHA-256 fields exactly 64 hex chars when non-null;
- review_state in `prepared|reviewed|approved|rejected|superseded`;
- all counts >= 0;
- `reviewed_at` is null while prepared and required for reviewed/approved/rejected/superseded states;
- `approved_at` is required for approved/superseded states and null before approval;
- approval reference may exist only with approval proof;
- conservative forward transitions are `prepared → reviewed → approved → superseded` or `prepared → reviewed → rejected`;
- rejected and superseded are terminal; reviewed batches do not return to prepared.

Unique semantic identity:

```text
provider,
dataset_name,
source_version,
source_checksum_sha256,
importer_version,
config_checksum_sha256
```

Execution mode MUST NOT be part of this identity.

Once a batch leaves `prepared`, freeze the complete reviewed semantic authority, including at minimum:

```text
provider
dataset_name
source_version
source_release_date
license_name
license_reference
source_reference
source_checksum_sha256
importer_version
config_checksum_sha256
manifest_content_checksum_sha256
input_count
accepted_count
rejected_count
matched_count
created_count
possible_duplicate_count
```

`reviewed_at` must not be silently rewritten after establishment. Once `approved_at` or `approval_reference` is established, it cannot be erased or rewritten. Superseding an approved batch must retain its historical approval proof.

### 3.5 Separate durable execution-attempt table

Create `public.food_ingestion_runs`:

```text
id uuid primary key default gen_random_uuid()
batch_id uuid not null references food_ingestion_batches(id) on delete restrict
execution_mode text not null
attempt_number integer not null
status text not null
started_at timestamptz null
completed_at timestamptz null
manifest_content_checksum_sha256 text not null
observed_input_count integer null
observed_accepted_count integer null
observed_rejected_count integer null
observed_created_count integer null
observed_matched_count integer null
error_summary text null
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
unique(batch_id, execution_mode, attempt_number)
```

Checks:
- manifest checksum exactly 64 hex chars;
- execution_mode in `dry_run|production`;
- attempt_number > 0;
- status in `prepared|running|completed|failed|cancelled`;
- observed counts null or >= 0;
- completed_at required for completed/failed/cancelled and null for prepared/running.

This table allows retries without inventing new semantic batch identities.

Run identity is immutable after creation:

```text
batch_id
execution_mode
attempt_number
manifest_content_checksum_sha256
```

Use a conservative lifecycle. Prepared runs may proceed to running or be cancelled. Running runs may complete, fail, or be cancelled. Once a run is `completed|failed|cancelled`, its audit/business fields are immutable. While prepared/running, operational fields may progress without permitting identity repointing.

Add a database trigger/guard for `production` runs that rejects insert/update unless:
- referenced batch `review_state = 'approved'`;
- batch `approved_at` is non-null;
- batch `manifest_content_checksum_sha256` is non-null;
- run `manifest_content_checksum_sha256` exactly equals the batch checksum.

Do not rely only on a future executor to enforce this invariant.

### 3.6 Versioned source provenance + frozen reviewed participation

Actual current Production constraint is `food_source_records_provider_source_record_id_key = UNIQUE(provider, source_record_id)`.

`food_source_records` represents immutable source snapshots, not processing attempts.

Migration must:

1. add to `food_source_records`:

```text
source_dataset text null
source_version text null
source_release_date date null
source_record_checksum_sha256 text null
```

2. enforce dataset/version pair consistency: both null for legacy/manual OR both non-null for versioned bulk records;
3. validate optional record checksum as 64 hex chars;
4. drop only the exact legacy constraint `food_source_records_provider_source_record_id_key` after verifying it still represents `(provider, source_record_id)`;
5. replace it with partial unique indexes:

```text
UNIQUE(provider, source_record_id)
WHERE source_dataset IS NULL AND source_version IS NULL
```

and

```text
UNIQUE(provider, source_dataset, source_version, source_record_id)
WHERE source_dataset IS NOT NULL AND source_version IS NOT NULL
```

6. create `public.food_ingestion_batch_records` as the many-to-many participation/audit relation:

```text
id uuid primary key default gen_random_uuid()
batch_id uuid not null references food_ingestion_batches(id) on delete restrict
source_record_id uuid not null references food_source_records(id) on delete restrict
outcome text not null
created_at timestamptz not null default now()
unique(batch_id, source_record_id)
```

`outcome` is restricted to `accepted|rejected|matched|created|possible_duplicate`.

Once a source snapshot is referenced by `food_ingestion_batch_records`, freeze its source identity/content in place, including at minimum provider, source record ID, dataset/version/release date, source-record checksum, source reference, source nutrition, source serving, license identity/reference, and retrieved source timestamp. Do not freeze canonical `food_id` solely because the snapshot entered review lineage; later canonical association remains an allowed matching operation.

Batch membership may be prepared while the parent batch is `prepared`. Once the parent leaves `prepared`, reject INSERT, UPDATE, and DELETE on its `food_ingestion_batch_records`, so review state always refers to exactly the reviewed source-snapshot set.

This allows the same immutable source snapshot to participate in multiple later prepared batches/configurations without duplicating or overwriting provenance, while making each reviewed batch's membership durable.

### 3.7 GTIN identity

Create `public.food_barcodes`:

```text
id uuid primary key
food_id uuid not null references food_items(id)
gtin text not null unique
source_record_id uuid null
created_at timestamptz not null
updated_at timestamptz not null
```

Checks: digits only, length 8/12/13/14.

Add same-Food composite FK `(source_record_id, food_id) → food_source_records(id, food_id)`.

GS1 Mod-10 check-digit validation stays in ingestion validation code, not only DB shape checks.

### 3.8 Country + region-safe market relevance

Create `public.food_market_relevance`:

```text
id uuid primary key
food_id uuid not null references food_items(id)
scope_type text not null
scope_code text not null
relevance_level text not null default 'primary'
source_record_id uuid null
created_at timestamptz not null
updated_at timestamptz not null
unique(food_id, scope_type, scope_code)
```

Checks:
- scope_type in `country|region`;
- country code = exactly two uppercase ASCII letters;
- region code = controlled uppercase identifier, 2–16 chars, `[A-Z0-9_-]`, beginning with a letter;
- relevance_level in `primary|secondary`.

Add same-Food provenance FK when source_record_id exists.

This must support future `EU`/`GCC` without a schema rewrite. Batch 0 still does not implement market-aware runtime ranking.

### 3.9 Indexes/triggers/security

Add focused indexes for:
- brand lookup consistent with existing PostgreSQL strategy;
- batch provider/dataset/version;
- runs batch/mode/status;
- versioned provenance lookup;
- barcode food_id;
- market `(scope_type, scope_code, relevance_level, food_id)`.

Use `public.set_updated_at()` triggers.

Enable RLS on all five new tables (`food_ingestion_batches`, `food_ingestion_runs`, `food_ingestion_batch_records`, `food_barcodes`, `food_market_relevance`). Revoke anon/authenticated broad access; grant internal service-role authority. Harden trigger functions and do not create broad member policies.

### 3.10 Validate migration

- migration contract test passes;
- migration ledger passes;
- chronological migration replay succeeds;
- repository DB lint succeeds on clean local/ephemeral DB;
- Batch 0 DB behavioral verification succeeds against disposable local Supabase;
- no Production apply.

Commit migration.

---

## Task 4 — Disposable transactional DB verification SQL

Create `supabase/verification/food-catalog-population-readiness.sql` and register it in the permanent local-only database verification chain before release preflight verification.

The verification may create bounded fixture rows only inside a transaction that always rolls back, and the runner must refuse non-local/non-disposable database targets. It must never mutate Production.

Prove structurally and behaviorally:

- four core nutrients nullable;
- `is_market_global` defaults `false`, including a newly inserted fixture that omits the field;
- required columns/tables exist;
- batch/run separation exists;
- exact approved-manifest Production-run DB guard still rejects a mismatched checksum;
- reviewed batch semantic fields cannot mutate;
- reviewed batch cannot return to prepared;
- `reviewed_at` cannot be silently rewritten after establishment;
- approval timestamps/references cannot be erased or rewritten once established;
- approved→superseded preserves approval history;
- rejected/superseded terminal lifecycle cannot move backward;
- source snapshot identity/content cannot mutate after batch participation while canonical `food_id` association remains separately mutable;
- reviewed batch membership rejects INSERT/UPDATE/DELETE;
- ingestion-run identity cannot be repointed;
- prepared/running run lifecycle is bounded and terminal ingestion runs cannot be rewritten;
- batch↔source-record many-to-many participation exists;
- legacy provenance uniqueness is gone;
- partial legacy + versioned bulk uniqueness exists;
- GTIN constraints and same-Food provenance FK exist;
- region-safe market constraints exist;
- RLS/privilege expectations hold;
- all fixture DML is rolled back.

---

## Task 5 — Generic ingestion contracts

Create `lib/food-catalog/ingestion/contracts.ts`.

### Source descriptor

```ts
export type FoodCatalogSourceDescriptor = {
  provider: string;
  dataset: string;
  sourceVersion: string;
  sourceReleaseDate: string | null;
  licenseName: string;
  licenseReference: string | null;
  sourceReference: string | null;
  sourceChecksumSha256: string;
  importerVersion: string;
  configChecksumSha256: string;
};
```

### Nutrition

Use nullable canonical nutrients and `basis_unit: "g" | "ml" | null`.

### Market scope

```ts
export type FoodCatalogMarketScope = {
  type: "country" | "region";
  code: string;
  relevanceLevel: "primary" | "secondary";
};
```

### Normalized candidate

Use:

```text
sourceRecordId
sourceReference
sourceRecordChecksumSha256
canonicalName
brandName
servingLabel
category
cuisine
nutrition
aliases[]
gtins[]
marketScopes[]
globallyRelevant
sourceNutrition
sourceServing
```

### Validation issue codes

At minimum:

```text
missing_name
missing_source_id
invalid_source_checksum
invalid_nutrition
invalid_basis
invalid_alias
invalid_gtin
invalid_gtin_check_digit
invalid_market_scope
duplicate_gtin_in_candidate
suspicious_calorie_macro_delta
```

### Canonical decision

`match | create | possible_duplicate | reject` as in V1, with deterministic/sorted candidate IDs.

### Manifest split

Define:

```ts
FoodCatalogDryRunManifestContent
FoodCatalogDryRunManifestEnvelope
```

Only `Content` is checksummed.

---

## Task 6 — Pure normalization

Tests and implementation must prove:

- trim/collapse stable names;
- uppercase scope codes;
- aliases normalized deterministically while preserving display value;
- GTIN ordinary spaces/hyphens handled, arbitrary characters not silently stripped;
- GTIN-8/12/13/14 only;
- GS1 Mod-10 helper correct;
- null stays null, zero stays zero, negative values remain visible for validation;
- aliases sort/dedupe deterministically;
- GTINs sort/dedupe deterministically;
- marketScopes sort/dedupe deterministically by type/code/relevance;
- `possible_duplicate.candidateFoodIds` sorted before manifest hashing.

No DB access.

---

## Task 7 — Structural validation/quarantine

Tests at minimum:

1. blank name error;
2. missing source ID error;
3. invalid optional record checksum error;
4. negative nutrient error;
5. incomplete/invalid basis error;
6. invalid alias error;
7. invalid country scope error;
8. invalid region scope error;
9. malformed GTIN error;
10. bad GTIN check digit error;
11. duplicate GTIN error if normalization contract is violated;
12. null nutrients accepted;
13. zero nutrients accepted;
14. all nutrition null/no basis accepted structurally;
15. large calorie/macro discrepancy warning only.

Calorie warning rule remains:

```text
abs(listed - (protein*4 + carbs*4 + fat*9)) > max(80, listed*0.30)
```

Never overwrite source calories.

---

## Task 8 — Deterministic manifest CONTENT + envelope

Implement stable JSON + SHA-256 with Node standard library only.

### Hashing contract

`manifestContentChecksumSha256 = sha256(stableJson(content))`

`generatedAt`, run IDs, diagnostics locations, and other volatile execution metadata MUST NOT participate in the content checksum.

Tests must prove:

- identical semantic input executed at two different generatedAt timestamps yields the same content checksum;
- object insertion order does not change checksum;
- candidate input order does not change checksum;
- alias/GTIN/market scope ordering does not change checksum;
- source checksum/importer version/config checksum/semantic candidate content changes DO change checksum.

No random/time call inside checksum-building logic.

---

## Task 9 — Privileged curation compatibility

Extend `food-curation.ts` and focused tests only to inspect:

- `brand_name`;
- versioned provenance fields;
- ingestion batch ID where present.

Do not add source-adapter commands, Production executor, market editing APIs, or barcode editing APIs in Batch 0.

Preserve admin assertion and existing verify/merge/deprecate/restore semantics.

---

## Task 10 — Architecture regression guards

Guard must prove:

- no provider-specific runtime adapter/download in Batch 0;
- no large source datasets committed;
- no Food Catalog data INSERT/COPY/seed in the migration or runtime population paths; disposable verification fixtures are bounded test data and roll back;
- no ordinary client/public MCP/member API direct access to ingestion batch/run/batch-record/barcode/market tables;
- no market inference from locale/language/IP/timezone/geolocation;
- only one new migration for Batch 0;
- no compatibility-marker promotion;
- no applied migration rewrite.

---

## Task 11 — Verification

Focused:

```bash
npx vitest run --config vitest.unit.config.mjs \
  lib/product/food-catalog-population-readiness-migration.test.ts \
  lib/product/food-catalog-ingestion-boundary.test.ts \
  lib/food-catalog/ingestion/normalize.test.ts \
  lib/food-catalog/ingestion/validate.test.ts \
  lib/food-catalog/ingestion/manifest.test.ts
```

Also run affected existing Food Catalog/curation/Nutrition tests, then:

```bash
npm run test:scripts
npm run migration:ledger:check
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run build
```

Use repository-standard chronological migration replay, DB lint, and the registered Batch 0 behavioral verification against local/ephemeral infrastructure. Do not apply Production migration.

Review full diff for prohibited datasets/population and prove Production remains untouched.

---

## Task 12 — One PR and exact-head closure

Open one PR from the one branch.

PR body reports:

- exact base/head;
- migration file selected at execution time;
- nullable nutrition;
- fail-closed `is_market_global` default;
- complete reviewed-batch semantic/lifecycle immutability;
- source-snapshot and reviewed-membership immutability;
- durable run identity/terminal history;
- batch/run schema separation;
- versioned provenance constraint change;
- GTIN identity;
- country+region market scopes;
- RLS/security;
- deterministic manifest-content hashing;
- explicit zero population/zero Production mutation;
- rollback boundary.

Run PR Quality. Correct in scope on same branch/PR.

Once final corrected head is stable, prior canonical evidence is superseded. Trigger a new canonical phase-close Quality on that exact head and retain the new run/job/artifact identities.

STOP before merge, deploy, Production migration, source download, or Batch 1.

---

## Required handoff

Return:

```text
PR + URL
branch
exact base SHA
exact final head SHA
changed files
migration filename
schema changes
fail-closed market default proof
reviewed batch semantic/lifecycle immutability proof
source snapshot immutability proof
reviewed batch membership immutability proof
run identity + terminal audit immutability proof
exact approved-manifest Production guard proof
legacy provenance uniqueness replacement proof
batch vs run separation proof
RLS/privilege proof
zero Food population proof
zero provider adapter/source-data proof
zero Production mutation proof
generic ingestion contracts
GTIN test evidence
market country+region test evidence
manifest determinism evidence including different timestamps = same content checksum
focused test results
migration replay / DB lint / DB verification / ledger evidence
PR Quality evidence
canonical exact-head Quality run/job/artifacts
rollback boundary
remaining Batch 1 work
blockers/risks
confirmation: no merge/deploy/Production migration/Batch 1
```

## Plan self-review

This V2 plus Planner post-phase-close corrections explicitly closes the long-term weaknesses in the earlier plan:

- market-global classification fails closed and requires explicit global relevance;
- source records are release-versionable and independent of processing batches;
- participating source snapshot identity/content becomes immutable without freezing later canonical `food_id` association;
- batch↔source-record participation is many-to-many while reviewed membership is frozen;
- reviewed semantic batches have a conservative forward-only lifecycle and preserve review/approval history;
- retries are separate runs with immutable identity and terminal audit history;
- Production runs remain database-gated to the exact approved manifest checksum;
- manifest review hashes exclude volatile timestamps;
- market relevance supports country + region without later schema replacement;
- migration timestamp is resolved at execution time rather than hardcoded;
- future Brand normalization remains additive rather than requiring Food identity replacement;
- verification fixtures are bounded to disposable local DB transactions and always roll back.