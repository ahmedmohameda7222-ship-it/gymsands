# Food Catalog Plan 3 — Activation, Verification, Trust, and Catalog Generations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the audited activation, verification, immutable Catalog Generation, Trust Profile, current-generation read, and atomic promotion/rollback authority that determines exactly which Food Catalog facts are currently effective without changing current member runtime or mutating Production.

**Architecture:** Add one forward Plan 3 schema migration that stores immutable activation grants, full immutable generation compositions, exact validation evidence, append-only transition events, and one nullable singleton current-generation pointer. Build focused TypeScript domain/services over Supabase-independent ports; current reads hydrate only exact IDs selected by the current generation, while privileged state transitions execute through service-role-only PostgreSQL RPCs that enforce transactionality, expected-current CAS, exact checksum/report binding, and operation-id idempotency. Existing Plan 2 raw bundles and legacy member runtime remain intact until a later explicit cutover.

**Tech Stack:** TypeScript 5.9, Vitest 4, Node.js 24 crypto, Supabase JS 2.84, PostgreSQL/Supabase CLI 2.109.1, Next.js 16 server-only modules.

**Spec:** `docs/superpowers/specs/2026-09-02-food-catalog-plan3-activation-verification-generations-design.md`

## Global Constraints

- Existing implementation is migration input, not target-architecture authority.
- Catalog Generation is the sole long-term authority for current effective Food facts.
- Never select current facts using latest timestamp, maximum revision, maximum ID, insertion order, arbitrary first row, provider preference, or importer preference.
- Full generation composition is immutable and references immutable canonical fact IDs; it does not copy nutrition/name/serving values into a second truth store.
- Unknown nutrition remains `null`; explicit source zero remains `0`.
- No generic household conversion and no generic `ml ↔ g` conversion may be introduced.
- Verification remains immutable assertion history; mutable `is_verified` is not authority.
- Activation eligibility, generation construction, validation, promotion, and member visibility are separate authorities.
- Later activation invalidation or verification assertions do not retroactively mutate sealed/promoted generation semantics.
- Merged source IDs are represented in generation redirects, not duplicate `merged` generation-Food rows.
- Redirects are direct and flattened to an active survivor; chains are invalid.
- Historical Diary/Recipe/Saved Meal/Meal Plan snapshots are never rewritten.
- My Foods and personal overrides are not mutated.
- Plan 3 member runtime cutover is **not** authorized; existing Nutrition/Food Library runtime remains on the legacy compatibility path.
- Plan 4 ingestion/quarantine/release-diff behavior is **not** started.
- Plan 6 permanent capability/RBAC/break-glass architecture is **not** started.
- Do not introduce a paid provider, search engine, cache, queue, or new database.
- Privileged Supabase credentials remain server-only and are never constructed/exported by Food Catalog modules.
- Direct physical Plan 3 table access is restricted to dedicated Food Catalog persistence adapters, SQL migration/verification, and focused tests.
- Privileged Plan 3 mutations use narrow service-role-only RPCs; no generic member/admin CRUD endpoint is introduced.
- Historical applied migrations are byte-immutable. The new Plan 3 migration may be edited only while it remains an unapplied pending migration on the implementation branch; its bytes freeze at Planner-approved exact head and permanently after Production apply.
- The planned migration filename is exactly `supabase/migrations/20260902150000_food_catalog_generation_authority.sql`.
- Creating the repository migration requires classifying it as `pending` in `supabase/migration-ledger.json`; that repository classification is **not** Production migration reconciliation or Production apply. `productionMigrationCount` and latest applied Production identity remain unchanged.
- While the Plan 3 migration is pending, `historyRepair.state`, `pendingCount`, and `unresolvedCount` must reflect the pending repository migration so `npm run migration:ledger:check` remains truthful.
- `config/release-compatibility.json` must not be promoted or changed by Plan 3 implementation.
- Production migration apply is **not** authorized by this plan or by implementation-plan approval.
- Production Food population, provider ingestion, activation-set execution, Catalog Generation promotion, application deployment, and Activity Catalog mutation are all **NO** unless separately and exactly authorized later.
- Implementation must start from the then-current authoritative `main`; record the exact base SHA before code changes. That base must contain Plan 2 squash merge `2883e077f1fdc159330c29b1dc6124ec905738e2`, the approved Plan 3 spec, this plan, and the continuity backup.
- Use branch `feat/food-catalog-generation-authority-v3` unless the Planner records a different exact branch before implementation starts.
- Every task uses RED → GREEN TDD evidence and a focused commit. Do not merge until independent Planner QA/QC and exact-head canonical Quality pass.
- In Classic ChatGPT environments without local worktrees/subagents, execute the same task order through GitHub + CI with exact-head evidence; the architecture/TDD/Production gates do not change.

---

## File Structure

### New domain files

- `lib/food-catalog/domain/activation.ts` — activation member/event semantic types and pure validators.
- `lib/food-catalog/domain/activation.test.ts` — activation validation RED/GREEN coverage.
- `lib/food-catalog/domain/generations.ts` — generation selection, lifecycle, redirect, validation-finding, and control-plane context contracts.
- `lib/food-catalog/domain/generations.test.ts` — generation structural invariants.
- `lib/food-catalog/domain/trust.ts` — pure structured `TrustProfile` derivation.
- `lib/food-catalog/domain/trust.test.ts` — exact Verified/completeness/null semantics.

### New Food Catalog server files

- `services/food-catalog/server/canonical-hash.ts` — deterministic canonical JSON + SHA-256 helpers.
- `services/food-catalog/server/canonical-hash.test.ts` — canonical hashing determinism tests.
- `services/food-catalog/server/generation-errors.ts` — stable Plan 3 error-code class.
- `services/food-catalog/server/generation-contracts.ts` — stored Plan 3 rows, read views, and atomic command DTOs.
- `services/food-catalog/server/generation-store.ts` — Supabase-independent Plan 3 read/command ports.
- `services/food-catalog/server/supabase-generation-read-store.ts` — strict exact-ID Plan 3/current-fact hydration adapter.
- `services/food-catalog/server/supabase-generation-read-store.test.ts` — strict persisted-row mapping tests.
- `services/food-catalog/server/supabase-generation-command-store.ts` — service-role RPC wrapper only; no direct table writes.
- `services/food-catalog/server/supabase-generation-command-store.test.ts` — RPC payload/error mapping tests.
- `services/food-catalog/server/activation-service.ts` — activation manifest canonicalization + create/grant/invalidate orchestration.
- `services/food-catalog/server/activation-service.test.ts` — activation service TDD.
- `services/food-catalog/server/generation-builder.ts` — full immutable composition normalization/checksum + create command.
- `services/food-catalog/server/generation-builder.test.ts` — checksum/order/activation structural tests.
- `services/food-catalog/server/generation-validator.ts` — deterministic candidate validation + immutable report draft.
- `services/food-catalog/server/generation-validator.test.ts` — blocker/non-blocker/report checksum tests.
- `services/food-catalog/server/current-generation-service.ts` — current pointer → redirect → exact hydration → Trust Profile.
- `services/food-catalog/server/current-generation-service.test.ts` — no-current, exact-selection, redirect, null/zero tests.
- `services/food-catalog/server/generation-command-service.ts` — promote/rollback/revoke command validation and RPC orchestration.
- `services/food-catalog/server/generation-command-service.test.ts` — exact CAS/report/idempotency input tests.

### New database/repository verification files

- `supabase/migrations/20260902150000_food_catalog_generation_authority.sql` — additive Plan 3 schema, constraints, immutable triggers, singleton pointer, and service-role-only atomic RPCs.
- `supabase/verification/food-catalog-generation-authority.sql` — disposable-local transactional schema/RPC verifier; all fixtures rolled back.
- `scripts/food-catalog-generation-authority-verification-registry.test.mjs` — proves the verifier is registered in canonical database verification.
- `lib/product/food-catalog-generation-authority-migration.test.ts` — static migration/security/no-population/no-marker contract.
- `lib/product/food-catalog-generation-authority-boundary.test.ts` — no implicit-current heuristics and Plan 3 physical-table boundary.

### Existing files modified

- `lib/food-catalog/domain/verification.ts` — no semantic redesign; optional helper/type refinement only if required by Plan 3 tests.
- `lib/food-catalog/domain/verification.test.ts` — retained assertions plus Plan 3 chain expectations where TypeScript-level validation applies.
- `services/food-catalog/server/index.ts` — add domain-safe Plan 3 exports only.
- `lib/product/food-catalog-v2-service-boundary.test.ts` — extend approved adapter allowlist/regex to Plan 3 tables/adapters without weakening Plan 2 guards.
- `scripts/run-database-verification.mjs` — register Plan 3 verifier before Production release preflight verifier.
- `supabase/migration-ledger.json` — classify the new repository migration as `pending`; do not claim a Production identity.
- `docs/architecture/migration-ledger-reconciliation.md` — document the one pending repository migration and unchanged latest applied Production identity.
- `docs/superpowers/specs/2026-09-02-food-catalog-plan3-activation-verification-generations-design.md` — status reconciliation only after plan approval; architecture text stays unchanged unless Planner explicitly approves a correction.
- `docs/superpowers/plans/2026-09-01-food-catalog-intelligence-program-roadmap.md` — Plan 3 execution status only.
- `docs/superpowers/plans/food-catalog-intelligence-master-continuity.md` — exact Plan 3 branch/head/gate continuity.

---

### Task 1: Define Plan 3 domain contracts, stable errors, and deterministic hashing

**Files:**
- Create: `lib/food-catalog/domain/activation.ts`
- Create: `lib/food-catalog/domain/activation.test.ts`
- Create: `lib/food-catalog/domain/generations.ts`
- Create: `lib/food-catalog/domain/generations.test.ts`
- Create: `services/food-catalog/server/generation-errors.ts`
- Create: `services/food-catalog/server/generation-contracts.ts`
- Create: `services/food-catalog/server/canonical-hash.ts`
- Create: `services/food-catalog/server/canonical-hash.test.ts`

**Interfaces:**
- Produces `ActivationEligibility`, `ActivationSetMemberDraft`, `ActivationEventType`, `validateActivationSetMemberDraft`.
- Produces `GenerationLifecycle`, `GenerationVerificationScope`, `GenerationFoodSelection`, `GenerationRedirectSelection`, `GenerationValidationFinding`, `ControlPlaneActorContext`, and pure structural validators.
- Produces `FoodCatalogGenerationErrorCode` and `FoodCatalogGenerationError`.
- Produces `canonicalStringify(value)` and `sha256Canonical(value)`.
- Produces persisted/command DTOs in `generation-contracts.ts` used by every later task.

- [ ] **Step 1: Write RED domain/hash tests**

Use exact runtime-invalid enum coverage, blank identifiers, active-member activation requirements, redirect self-target rejection, and canonical hash determinism:

```ts
import { describe, expect, it } from "vitest";
import { validateGenerationFoodSelection, validateGenerationRedirectSelection } from "./generations";

it("requires exact activation authority for active generation Foods", () => {
  expect(() => validateGenerationFoodSelection({
    foodId: "10000000-0000-4000-8000-000000000001",
    lifecycle: "active",
    nutritionRevisionId: null,
    activationSetId: null,
    activationSetMemberId: null,
    activationGrantEventId: null,
  })).toThrow(/activation/i);
});

it("rejects self redirects", () => {
  const id = "10000000-0000-4000-8000-000000000001";
  expect(() => validateGenerationRedirectSelection({
    sourceFoodId: id,
    targetFoodId: id,
  })).toThrow(/self/i);
});
```

Hash tests:

```ts
expect(sha256Canonical({ b: 2, a: 1 })).toBe(
  sha256Canonical({ a: 1, b: 2 }),
);
expect(sha256Canonical({ a: ["x", "y"] })).not.toBe(
  sha256Canonical({ a: ["y", "x"] }),
);
```

- [ ] **Step 2: Run focused tests and prove RED**

```bash
npx vitest run --config vitest.unit.config.mjs \
  lib/food-catalog/domain/activation.test.ts \
  lib/food-catalog/domain/generations.test.ts \
  services/food-catalog/server/canonical-hash.test.ts
```

Expected: FAIL because Plan 3 contracts/hash helpers do not exist.

- [ ] **Step 3: Implement exact domain enums and validation**

Use these binding values:

```ts
export type ActivationEligibility = "eligible" | "rejected";
export type ActivationEventType = "created" | "grant" | "invalidate";
export type GenerationLifecycle = "active" | "deprecated" | "withdrawn";
export type GenerationEventType = "created" | "validated" | "promote" | "rollback" | "revoke";
export type GenerationFindingSeverity = "info" | "warning" | "error";
export type ControlPlanePrincipalType = "human" | "service";

export type ControlPlaneActorContext = {
  principalId: string;
  principalType: ControlPlanePrincipalType;
  authorityReference: string;
  reasonCode: string;
  policyVersion: string;
};
```

`GenerationFoodSelection` is exact:

```ts
export type GenerationFoodSelection = {
  foodId: string;
  lifecycle: GenerationLifecycle;
  nutritionRevisionId: string | null;
  activationSetId: string | null;
  activationSetMemberId: string | null;
  activationGrantEventId: string | null;
};
```

Validator rule: `active` requires all three activation references; `deprecated|withdrawn` require all three activation references to be `null` in Plan 3 current composition. `draft` and `merged` are not valid `GenerationLifecycle` values.

- [ ] **Step 4: Implement stable error codes**

```ts
export type FoodCatalogGenerationErrorCode =
  | "NO_CURRENT_GENERATION"
  | "GENERATION_NOT_FOUND"
  | "GENERATION_CHECKSUM_MISMATCH"
  | "GENERATION_NOT_SEALED"
  | "VALIDATION_REPORT_MISMATCH"
  | "BLOCKING_FINDINGS"
  | "STALE_CURRENT_GENERATION"
  | "INVALID_ACTIVATION_GRANT"
  | "CROSS_FOOD_SELECTION"
  | "INVALID_VERIFICATION_SELECTION"
  | "INVALID_REDIRECT"
  | "OPERATION_ID_CONFLICT"
  | "CONTROL_PLANE_REJECTED";

export class FoodCatalogGenerationError extends Error {
  constructor(
    public readonly code: FoodCatalogGenerationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FoodCatalogGenerationError";
  }
}
```

- [ ] **Step 5: Implement canonical JSON hashing**

`canonicalStringify` recursively sorts object keys, preserves array order, rejects `undefined`, functions, symbols, non-finite numbers, and cyclic values, and emits JSON-compatible `null|boolean|number|string|array|object`. `sha256Canonical` returns lowercase 64-character SHA-256 hex using `node:crypto`.

Do **not** sort arrays generically; semantic services in Tasks 5–7 sort authority arrays before hashing.

- [ ] **Step 6: Run focused tests and prove GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add lib/food-catalog/domain/activation.ts lib/food-catalog/domain/activation.test.ts \
  lib/food-catalog/domain/generations.ts lib/food-catalog/domain/generations.test.ts \
  services/food-catalog/server/generation-errors.ts \
  services/food-catalog/server/generation-contracts.ts \
  services/food-catalog/server/canonical-hash.ts \
  services/food-catalog/server/canonical-hash.test.ts
git commit -m "feat(food-catalog): define Plan 3 generation contracts"
```

---

### Task 2: Add the normalized Plan 3 schema, immutability, same-Food constraints, and pending-ledger classification

**Files:**
- Create: `supabase/migrations/20260902150000_food_catalog_generation_authority.sql`
- Create: `lib/product/food-catalog-generation-authority-migration.test.ts`
- Modify: `supabase/migration-ledger.json`
- Modify: `docs/architecture/migration-ledger-reconciliation.md`

**Interfaces:**
- Produces all normalized Plan 3 relations and DB invariants used by Task 3 RPCs and Task 4 adapters.
- Adds composite uniqueness to Plan 1 immutable fact tables so generation selections can use same-Food composite FKs.
- Adds no-fork verification supersession enforcement without editing Plan 1 migrations.
- Creates a nullable singleton pointer row; creates zero Catalog Generations and zero Food rows.
- Repository ledger becomes truthful `pending`; Production identity remains unchanged.

- [ ] **Step 1: Write RED migration contract tests**

`lib/product/food-catalog-generation-authority-migration.test.ts` must read exactly one suffix match `_food_catalog_generation_authority.sql` and assert creation of:

```ts
const tables = [
  "food_catalog_control_operations",
  "food_catalog_activation_sets",
  "food_catalog_activation_set_members",
  "food_catalog_activation_events",
  "food_catalog_generations",
  "food_catalog_generation_foods",
  "food_catalog_generation_servings",
  "food_catalog_generation_names",
  "food_catalog_generation_taxonomy",
  "food_catalog_generation_markets",
  "food_catalog_generation_verification",
  "food_catalog_generation_redirects",
  "food_catalog_generation_validation_reports",
  "food_catalog_generation_validation_findings",
  "food_catalog_generation_events",
  "food_catalog_current_generation",
] as const;
```

Also assert:

```ts
expect(sql).not.toMatch(/insert\s+into\s+public\.food_items/i);
expect(sql).not.toMatch(/update\s+public\.release_schema_compatibility/i);
expect(sql).not.toMatch(/insert\s+into\s+public\.food_catalog_generations/i);
expect(sql).toMatch(/insert\s+into\s+public\.food_catalog_current_generation[\s\S]*null/i);
expect(sql).toContain("unique (supersedes_assertion_id)");
```

For every new table assert RLS enabled, `revoke all ... from anon, authenticated`, and service-role access is explicit. Assert immutable-trigger coverage for every new authority table except `food_catalog_current_generation`.

- [ ] **Step 2: Run static migration test and prove RED**

```bash
npx vitest run --config vitest.unit.config.mjs \
  lib/product/food-catalog-generation-authority-migration.test.ts
```

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Create the additive schema**

The migration starts with `begin;` and ends with `commit;`.

Create the tables listed in Step 1 with these binding relational rules:

1. `food_catalog_control_operations.operation_id uuid primary key`, `operation_kind`, `command_checksum_sha256`, immutable `result_reference jsonb`, `created_at`.
2. Activation set/member/event tables use immutable rows. Activation member has `unique (activation_set_id, food_id)` and composite `unique (id, activation_set_id, food_id)`.
3. Activation event types are `created|grant|invalidate`; invalidation references an exact prior grant through `target_event_id`; a partial unique index prevents more than one invalidation event targeting the same grant.
4. `food_catalog_generations` has opaque UUID PK, nullable `base_generation_id`, nullable diagnostic ordinal, version fields, `change_manifest_checksum_sha256`, `composition_checksum_sha256`, `authority_reference`, `created_at`, and non-null `sealed_at`.
5. `food_catalog_generation_foods` permits only `active|deprecated|withdrawn`; `active` requires `activation_set_id`, `activation_set_member_id`, and `activation_grant_event_id`, while non-active rows require those fields null.
6. Generation child-selection tables are normalized, keyed by `(generation_id, food_id, selected_fact_id)` or `(generation_id, food_id, scope)`.
7. Add forward composite unique constraints on Plan 1 immutable fact tables, including `(id, food_id)` for nutrition/serving/name/taxonomy/market and `(id, food_id, assertion_scope)` for verification.
8. Use composite FKs from generation selection rows to the exact same Food fact.
9. Generation taxonomy/market selections represent effective assignments; DB triggers reject selected rows whose Plan 1 action is `remove`.
10. Generation redirects have PK/unique `(generation_id, source_food_id)`, reject self redirect, and target `(generation_id, target_food_id)` must exist in `food_catalog_generation_foods`.
11. A deferred constraint trigger rejects redirect targets that are themselves redirect sources and rejects redirect sources duplicated as generation Food rows.
12. Generation verification selection is unique `(generation_id, food_id, assertion_scope)` and composite-FK-backed to the exact same Food/scope assertion.
13. Add `unique (supersedes_assertion_id)` to `food_verification_assertions`; because assertions point only to already-existing immutable rows, this plus the Plan 1 same-Food/scope trigger prevents forks/non-head supersession and cannot introduce cycles.
14. Validation reports bind exact `generation_id + generation_checksum_sha256`; findings are normalized rows with stable reason code, nullable Food ID, severity, blocking flag, evidence reference, validator version, details JSON, and immutable identity.
15. Generation events are append-only. Event types are `created|validated|promote|rollback|revoke` and include exact from/to/revoked IDs as applicable, validation report ID when applicable, operation ID, command checksum, actor context, reason/reference, policy version, timestamp.
16. `food_catalog_current_generation` contains exactly one seeded singleton row with `current_generation_id NULL`, `current_event_id NULL`, `pointer_revision = 0`, and update timestamp. This is the only mutable Plan 3 authority row.
17. No trigger/function automatically creates a generation, activates a Food, or changes the current pointer outside Task 3 RPCs.

Use lowercase 64-hex checks for every stored SHA-256 checksum.

- [ ] **Step 4: Add immutability and RLS**

Reuse or create a private immutable-row rejection trigger function. Apply it to activation manifests/members/events, operations, generations/composition, validation reports/findings, and generation events. Do not apply it to `food_catalog_current_generation`.

Enable RLS on every new public Plan 3 table. Revoke all direct privileges from `anon` and `authenticated`. Grant only the minimum service-role read/write needed by the later adapters/RPCs; no authenticated mutation grant is allowed.

- [ ] **Step 5: Classify the repository migration as pending**

Add exactly one sorted ledger entry:

```json
{
  "localFile": "20260902150000_food_catalog_generation_authority.sql",
  "state": "pending",
  "note": "Food Catalog Plan 3 additive generation-authority migration. Repository-only pending; Production apply requires separate exact Planner/user approval."
}
```

Do not add `productionVersion` or `productionName`.

Update top-level `pendingCount` and `unresolvedCount` from `0` to `1`; update matching `historyRepair` counts to `1`; set `historyRepair.state` to `pending`; preserve `productionMigrationCount`, `schemaVerifiedUntrackedCount`, current `auditedRepositoryCommit`, and current Production capture timestamp. Update the history-repair note so it still contains `Do not replay` and explicitly names the pending Plan 3 migration.

Update `docs/architecture/migration-ledger-reconciliation.md` to state:
- latest applied Production identity remains `20260901183021_food_catalog_plan1_semantic_corrections`;
- one repository migration is pending;
- it has not been applied to Production;
- compatibility marker remains `20260724232734`;
- no Food population/activation/generation promotion occurred.

- [ ] **Step 6: Run migration/ledger static checks and prove GREEN**

```bash
npx vitest run --config vitest.unit.config.mjs \
  lib/product/food-catalog-generation-authority-migration.test.ts \
  lib/product/food-catalog-intelligence-core-migration.test.ts \
  lib/product/food-catalog-plan1-semantic-corrections-migration.test.ts
npm run migration:ledger:check
```

Expected: PASS. Ledger output may report `pending=1` / `release_ready=false`; that is truthful and expected before separate Production apply.

- [ ] **Step 7: Commit Task 2**

```bash
git add supabase/migrations/20260902150000_food_catalog_generation_authority.sql \
  lib/product/food-catalog-generation-authority-migration.test.ts \
  supabase/migration-ledger.json docs/architecture/migration-ledger-reconciliation.md
git commit -m "feat(food-catalog): add Plan 3 generation schema"
```

---

### Task 3: Add atomic service-role SQL command RPCs and disposable-database verification

**Files:**
- Modify: `supabase/migrations/20260902150000_food_catalog_generation_authority.sql`
- Create: `supabase/verification/food-catalog-generation-authority.sql`
- Create: `scripts/food-catalog-generation-authority-verification-registry.test.mjs`
- Modify: `scripts/run-database-verification.mjs`
- Modify: `lib/product/food-catalog-generation-authority-migration.test.ts`

**Interfaces:**
- Produces restricted RPCs:
  - `public.food_catalog_create_activation_set_v1(jsonb)`
  - `public.food_catalog_grant_activation_set_v1(jsonb)`
  - `public.food_catalog_invalidate_activation_grant_v1(jsonb)`
  - `public.food_catalog_create_generation_v1(jsonb)`
  - `public.food_catalog_record_generation_validation_v1(jsonb)`
  - `public.food_catalog_promote_generation_v1(jsonb)`
  - `public.food_catalog_rollback_generation_v1(jsonb)`
  - `public.food_catalog_revoke_generation_v1(jsonb)`
- Every RPC is revoked from `public, anon, authenticated` and granted only to `service_role`.
- All commands use the global operation ledger for idempotency/conflict detection.

- [ ] **Step 1: Write RED SQL verifier for schema and command behavior**

Create `supabase/verification/food-catalog-generation-authority.sql` with `\set ON_ERROR_STOP on`, `begin;`, temporary assertion/rejection helpers, deterministic UUID fixtures, and final `rollback;`.

The verifier must prove all of these with real local SQL:

1. Migration creates zero Catalog Generations and the singleton pointer is `NULL`.
2. Immutable authority rows reject UPDATE/DELETE.
3. Verification assertion fork is rejected by trying two successors of one predecessor.
4. Cross-Food generation nutrition/serving/name/taxonomy/market/verification references are rejected.
5. Taxonomy/market `remove` facts cannot be selected into a generation.
6. Activation set creation is atomic and idempotent.
7. Same operation ID + same command checksum returns/reconciles the existing result; same operation ID + different checksum is rejected.
8. A grant can be explicitly invalidated; a grant invalidated before generation sealing cannot authorize a new active generation Food.
9. A valid active generation member requires exact activation set/member/grant references.
10. Redirect self-target, redirect chain, redirect-to-non-active target, and source duplicated as a generation Food are rejected.
11. Validation report binds exact generation checksum; findings remain immutable.
12. A report with a blocking finding cannot promote.
13. Wrong report ID/checksum cannot promote.
14. First bootstrap promotion requires expected current `NULL` and succeeds atomically with one event + pointer update.
15. A stale expected-current promotion fails.
16. A second valid generation can be promoted with exact expected current.
17. Rollback requires an explicit previously promoted healthy target, appends audit, and switches pointer atomically.
18. A revoked generation cannot be promoted or used as rollback target.
19. No command mutates Food snapshots, My Foods, compatibility marker, or Plan 1 immutable facts.
20. All fixture rows disappear after the verifier `rollback;`.

- [ ] **Step 2: Run local full migration replay/verifier and prove RED**

```bash
node scripts/replay-local-migration-chain.mjs --prove-future-order
PLAIVRA_LOCAL_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -X -v ON_ERROR_STOP=1 -f supabase/verification/food-catalog-generation-authority.sql
```

Expected: verifier FAILS until RPCs exist.

- [ ] **Step 3: Implement exact operation-id claim semantics**

Inside the migration, create a private helper that receives operation ID, operation kind, command checksum and result reference semantics. It must:

- reject null operation ID/checksum;
- lock/read existing operation by ID;
- if absent, allow the caller to execute and then persist the immutable result;
- if present with different operation kind/checksum, raise `23505`/bounded conflict;
- if present with identical kind/checksum, return existing result without duplicating domain events.

Do not use timestamp-based reconciliation.

- [ ] **Step 4: Implement activation RPCs**

`food_catalog_create_activation_set_v1` atomically inserts the set, exact members, `created` event, and operation result. It validates that the supplied manifest checksum/policy/version are nonblank/hex-valid and each member Food exists.

`food_catalog_grant_activation_set_v1` verifies every member selected for grant is `eligible`, appends one exact immutable `grant` event, and returns its event ID.

`food_catalog_invalidate_activation_grant_v1` explicitly targets one grant event, verifies same activation set, appends one `invalidate` event, and never mutates the prior grant.

- [ ] **Step 5: Implement generation creation/validation-report RPCs**

`food_catalog_create_generation_v1` accepts a fully normalized command payload and atomically inserts the sealed generation plus all composition tables. Before insert it must:

- verify base generation if provided;
- verify all active Food grants are exact `grant` events for the referenced activation set and have no invalidation event existing at creation time;
- verify no selected fact is cross-Food;
- verify no duplicate keys;
- verify redirect target is active in the submitted generation and no redirect target is also a redirect source;
- write `created` generation event and operation result.

`food_catalog_record_generation_validation_v1` requires exact generation ID + stored composition checksum, inserts immutable report/findings, verifies supplied counts equal actual submitted findings, writes a `validated` event, and returns report ID/checksum.

- [ ] **Step 6: Implement promotion/rollback/revoke RPCs**

`food_catalog_promote_generation_v1` must `SELECT ... FOR UPDATE` the singleton pointer and require exact `expected_current_generation_id` (explicit JSON null for bootstrap), candidate ID/checksum, validation report ID/report checksum, operation ID/checksum, actor context, reason, and policy version. It rejects any blocking findings, revoked candidate, invalid activation relation, checksum mismatch, stale pointer, or report mismatch; then appends `promote` event, changes pointer/current event, increments `pointer_revision`, and commits as one function transaction.

`food_catalog_rollback_generation_v1` explicitly names the target generation and target checksum; target must have a prior successful `promote` event and must not be revoked. It locks expected current, appends `rollback`, switches pointer, increments revision, and never infers target from ordinal/time.

`food_catalog_revoke_generation_v1` appends immutable `revoke` for a non-current generation. It must reject revoking the current generation; operator must rollback first, then revoke the former generation. Promotion/rollback reject any generation with a revoke event.

- [ ] **Step 7: Lock RPC privileges**

For every Plan 3 RPC:

```sql
revoke all on function public.<function_name>(jsonb) from public, anon, authenticated;
grant execute on function public.<function_name>(jsonb) to service_role;
```

Use `security definer` only where needed, with a fixed explicit `search_path = pg_catalog, public, private, extensions`; never trust caller-controlled schema resolution.

- [ ] **Step 8: Register database verification and test the registry**

Insert `supabase/verification/food-catalog-generation-authority.sql` into `DATABASE_VERIFICATION_FILES` immediately after Plan 1 Food Catalog verifiers and before `production-release-migration-preflight.sql`.

Registry test:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { DATABASE_VERIFICATION_FILES } from "./run-database-verification.mjs";

test("registers Plan 3 Food Catalog generation verification before release preflight", () => {
  const plan3 = DATABASE_VERIFICATION_FILES.indexOf(
    "supabase/verification/food-catalog-generation-authority.sql",
  );
  const preflight = DATABASE_VERIFICATION_FILES.indexOf(
    "supabase/verification/production-release-migration-preflight.sql",
  );
  assert.ok(plan3 >= 0);
  assert.ok(plan3 < preflight);
});
```

- [ ] **Step 9: Run DB/script checks and prove GREEN**

```bash
npm run test:scripts
node scripts/replay-local-migration-chain.mjs --prove-future-order
PLAIVRA_LOCAL_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  node scripts/run-database-verification.mjs
supabase db lint --local --schema public --level error --fail-on error
```

Expected: PASS.

- [ ] **Step 10: Commit Task 3**

```bash
git add supabase/migrations/20260902150000_food_catalog_generation_authority.sql \
  supabase/verification/food-catalog-generation-authority.sql \
  scripts/run-database-verification.mjs \
  scripts/food-catalog-generation-authority-verification-registry.test.mjs \
  lib/product/food-catalog-generation-authority-migration.test.ts
git commit -m "feat(food-catalog): add atomic generation authority commands"
```

---

### Task 4: Build Supabase-independent Plan 3 ports and strict read/RPC adapters

**Files:**
- Create: `services/food-catalog/server/generation-store.ts`
- Create: `services/food-catalog/server/supabase-generation-read-store.ts`
- Create: `services/food-catalog/server/supabase-generation-read-store.test.ts`
- Create: `services/food-catalog/server/supabase-generation-command-store.ts`
- Create: `services/food-catalog/server/supabase-generation-command-store.test.ts`

**Interfaces:**

`FoodCatalogGenerationReadStore` produces exact reads only:

```ts
export interface FoodCatalogGenerationReadStore {
  readCurrentPointer(): Promise<StoredCurrentGenerationPointer>;
  readGeneration(generationId: string): Promise<StoredCatalogGeneration | null>;
  readGenerationFood(generationId: string, foodId: string): Promise<StoredGenerationFood | null>;
  readGenerationRedirect(generationId: string, sourceFoodId: string): Promise<StoredGenerationRedirect | null>;
  readGenerationSelections(generationId: string, foodId: string): Promise<StoredGenerationSelections>;
  readNutritionRevision(foodId: string, revisionId: string): Promise<StoredFoodNutritionRevision | null>;
  readServingOptions(foodId: string, ids: readonly string[]): Promise<StoredFoodServingOption[]>;
  readNames(foodId: string, ids: readonly string[]): Promise<StoredFoodNameFact[]>;
  readTaxonomyAssignments(foodId: string, ids: readonly string[]): Promise<StoredFoodTaxonomyAssignment[]>;
  readMarketAssignments(foodId: string, ids: readonly string[]): Promise<StoredFoodMarketAssignment[]>;
  readVerificationAssertions(foodId: string, selections: ReadonlyArray<{ scope: FoodVerificationScope; assertionId: string }>): Promise<StoredFoodVerificationAssertion[]>;
  readActivationAuthority(memberId: string, grantEventId: string): Promise<StoredActivationAuthority | null>;
  readGenerationEvent(eventId: string): Promise<StoredGenerationEvent | null>;
  readValidationReport(reportId: string): Promise<StoredGenerationValidationReport | null>;
  readValidationFindings(reportId: string): Promise<StoredGenerationValidationFinding[]>;
}
```

`FoodCatalogGenerationCommandStore` exposes only atomic semantic commands:

```ts
export interface FoodCatalogGenerationCommandStore {
  createActivationSet(input: CreateActivationSetCommand): Promise<ActivationSetCommandResult>;
  grantActivationSet(input: GrantActivationSetCommand): Promise<ActivationGrantCommandResult>;
  invalidateActivationGrant(input: InvalidateActivationGrantCommand): Promise<ActivationInvalidationCommandResult>;
  createGeneration(input: CreateGenerationCommand): Promise<CreateGenerationCommandResult>;
  recordValidation(input: RecordGenerationValidationCommand): Promise<RecordGenerationValidationResult>;
  promoteGeneration(input: PromoteGenerationCommand): Promise<GenerationTransitionResult>;
  rollbackGeneration(input: RollbackGenerationCommand): Promise<GenerationTransitionResult>;
  revokeGeneration(input: RevokeGenerationCommand): Promise<GenerationTransitionResult>;
}
```

- [ ] **Step 1: Write RED adapter tests**

Use a fake Supabase query/RPC recorder. Assert:

- current pointer uses exact singleton predicate;
- generation Food uses exact `(generation_id, food_id)` match;
- exact fact hydration includes both `id` and `food_id` predicates;
- selected arrays never use timestamp/revision ordering to choose authority;
- malformed persisted enum/checksum/count rows throw `Food Catalog Plan 3 read: ...` errors;
- command store calls only the eight exact RPC names and never `.from(...).insert/update/delete`;
- RPC error messages are bounded into `FoodCatalogGenerationError` where code mapping is known.

- [ ] **Step 2: Run focused tests and prove RED**

```bash
npx vitest run --config vitest.unit.config.mjs \
  services/food-catalog/server/supabase-generation-read-store.test.ts \
  services/food-catalog/server/supabase-generation-command-store.test.ts
```

Expected: FAIL because ports/adapters do not exist.

- [ ] **Step 3: Implement strict read adapter**

Use explicit column lists; never `select("*")`. Parse persisted values with runtime validation and exact enum allowlists. `readGenerationSelections` returns the IDs selected by composition tables; it does not hydrate/choose from unselected Plan 1 facts.

When an ID array is empty, return `[]` without querying `.in(..., [])`.

Every hydration method verifies returned rows exactly match the requested Food; a missing selected fact remains an error for current-service validation rather than silently disappearing.

- [ ] **Step 4: Implement RPC-only command adapter**

The adapter maps camelCase command DTOs to the exact JSON payload contract expected by Task 3 RPCs and calls:

```ts
await supabase.rpc("food_catalog_promote_generation_v1", { p_command: payload });
```

Do not expose the injected `SupabaseClient` and do not construct service-role credentials.

- [ ] **Step 5: Run focused tests and prove GREEN**

Run Step 2. Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add services/food-catalog/server/generation-store.ts \
  services/food-catalog/server/supabase-generation-read-store.ts \
  services/food-catalog/server/supabase-generation-read-store.test.ts \
  services/food-catalog/server/supabase-generation-command-store.ts \
  services/food-catalog/server/supabase-generation-command-store.test.ts
git commit -m "feat(food-catalog): add Plan 3 persistence ports"
```

---

### Task 5: Implement deterministic Activation Set creation, grant, and invalidation services

**Files:**
- Create: `services/food-catalog/server/activation-service.ts`
- Create: `services/food-catalog/server/activation-service.test.ts`

**Interfaces:**
- Produces `buildActivationManifest(input)` and service methods `createActivationSet`, `grantActivationSet`, `invalidateActivationGrant`.
- Activation checksum is deterministic and excludes timestamps/storage metadata.
- Grant/invalidation requires explicit actor + operation ID; no “latest grant” discovery.

- [ ] **Step 1: Write RED activation tests**

Cover:

```ts
it("produces the same manifest checksum regardless of input member order", () => { /* exact same members reversed */ });
it("changes the checksum when one eligibility/evidence fact changes", () => { /* sourceLegalAccepted true → false */ });
it("rejects duplicate Food IDs in one activation set", () => { /* duplicate */ });
it("refuses to grant a set containing a rejected member", async () => { /* no command-store call */ });
it("invalidates an explicitly supplied grant event ID", async () => { /* exact ID */ });
```

- [ ] **Step 2: Run focused tests and prove RED**

```bash
npx vitest run --config vitest.unit.config.mjs \
  services/food-catalog/server/activation-service.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement canonical activation manifest**

Sort members by `foodId`. The manifest checksum payload includes only:

```ts
{
  manifestSchemaVersion,
  activationPolicyVersion,
  members: members.map(({ foodId, expectedPreconditionLifecycle, evidenceReference,
    evidenceChecksumSha256, sourceLegalAccepted, identityResolved,
    nutritionBasisValid, displayIdentityValid, blockingConditionCount,
    eligibility }) => ({
      foodId, expectedPreconditionLifecycle, evidenceReference,
      evidenceChecksumSha256, sourceLegalAccepted, identityResolved,
      nutritionBasisValid, displayIdentityValid, blockingConditionCount, eligibility,
  })),
}
```

Do not include operation ID, actor, set UUID, or timestamps in the semantic manifest checksum.

- [ ] **Step 4: Implement service orchestration**

`createActivationSet` validates all inputs, builds checksum, creates a caller-provided opaque set UUID and operation UUID, then calls command store.

`grantActivationSet` requires every member in the supplied reviewed manifest to be `eligible`; it never infers grantability from absence of errors.

`invalidateActivationGrant` requires exact grant event ID and set ID. No timestamp query is allowed.

- [ ] **Step 5: Run focused tests and prove GREEN**

Run Step 2. Expected: PASS.

- [ ] **Step 6: Commit Task 5**

```bash
git add services/food-catalog/server/activation-service.ts \
  services/food-catalog/server/activation-service.test.ts
git commit -m "feat(food-catalog): add activation grant service"
```

---

### Task 6: Build full immutable generation candidates and deterministic composition checksums

**Files:**
- Create: `services/food-catalog/server/generation-builder.ts`
- Create: `services/food-catalog/server/generation-builder.test.ts`

**Interfaces:**
- Produces `normalizeGenerationComposition(input)`, `computeGenerationCompositionChecksum(input)`, and `createGenerationCandidate(commandStore, input)`.
- Input contains the complete composition, not a runtime delta.
- Base generation/change manifest are construction provenance only.

- [ ] **Step 1: Write RED generation-builder tests**

Cover:

1. Reversing Food/serving/name/taxonomy/market/verification/redirect input order yields the same checksum.
2. Changing one selected nutrition ID changes checksum.
3. Changing one lifecycle changes checksum.
4. Changing one policy/projection version changes checksum.
5. Changing only operation ID/actor/timestamp does not change composition checksum.
6. Duplicate generation Food, duplicate selected fact, duplicate verification scope, or duplicate redirect source is rejected before command-store invocation.
7. Active Food without exact activation refs is rejected.
8. `draft`/`merged` lifecycle strings are runtime-rejected.
9. Redirect target/source structural self-conflict is rejected.
10. Candidate output contains the full normalized composition even when `baseGenerationId` is non-null.

- [ ] **Step 2: Run focused tests and prove RED**

```bash
npx vitest run --config vitest.unit.config.mjs \
  services/food-catalog/server/generation-builder.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement canonical sort keys**

Use exact stable sort tuples:

- Foods: `[foodId]`
- Servings: `[foodId, servingOptionId]`
- Names: `[foodId, nameFactId]`
- Taxonomy: `[foodId, assignmentId]`
- Markets: `[foodId, assignmentId]`
- Verification: `[foodId, scope, assertionId]`
- Redirects: `[sourceFoodId, targetFoodId]`

Canonical checksum payload includes composition schema version, generation/activation/trust/projection policy versions, and the normalized arrays. It excludes generation UUID, base generation UUID, diagnostic ordinal, operation ID, actor context, created/sealed timestamps, and DB row IDs unrelated to selected canonical facts.

- [ ] **Step 4: Implement candidate creation**

`createGenerationCandidate` builds exact checksum and calls `commandStore.createGeneration` with the normalized full snapshot and change-manifest checksum. It does not switch current pointer or write member-visible state.

- [ ] **Step 5: Run focused tests and prove GREEN**

Run Step 2. Expected: PASS.

- [ ] **Step 6: Commit Task 6**

```bash
git add services/food-catalog/server/generation-builder.ts \
  services/food-catalog/server/generation-builder.test.ts
git commit -m "feat(food-catalog): build immutable generation candidates"
```

---

### Task 7: Implement deterministic generation validation and immutable report persistence

**Files:**
- Create: `services/food-catalog/server/generation-validator.ts`
- Create: `services/food-catalog/server/generation-validator.test.ts`

**Interfaces:**
- Produces `validateStoredGeneration(readStore, generationId, expectedChecksum)` returning a deterministic `GenerationValidationReportDraft`.
- Produces `persistGenerationValidation(commandStore, report, actor, operationId)`.
- Stable reason codes are part of the Plan 4-compatible boundary.

- [ ] **Step 1: Write RED validator tests**

Use an in-memory `FoodCatalogGenerationReadStore`. Exact blocking reason codes:

```ts
export const GENERATION_BLOCKING_REASONS = [
  "GENERATION_CHECKSUM_MISMATCH",
  "ACTIVE_FOOD_MISSING_ACTIVATION_GRANT",
  "ACTIVE_FOOD_MISSING_DISPLAY_NAME",
  "SELECTED_FACT_MISSING",
  "SELECTED_FACT_CROSS_FOOD",
  "SELECTED_TAXONOMY_REMOVAL",
  "SELECTED_MARKET_REMOVAL",
  "INVALID_VERIFICATION_SELECTION",
  "REDIRECT_TARGET_NOT_ACTIVE",
  "REDIRECT_CHAIN",
] as const;
```

Tests must prove:
- stored composition checksum is recomputed from exact selected IDs and matches expected;
- active Food with no selected `preferred_display` name blocks;
- missing selected fact blocks;
- cross-Food selected fact blocks even if a fake store returns it;
- taxonomy/market `remove` selection blocks;
- revoked verification assertion is **valid composition evidence** but projects scope unverified; it is not itself a structural blocker;
- redirect target must be active and non-redirect;
- finding order is deterministic;
- report checksum is invariant to underlying store return order;
- report checksum changes if a reason/evidence/blocking result changes.

- [ ] **Step 2: Run focused tests and prove RED**

```bash
npx vitest run --config vitest.unit.config.mjs \
  services/food-catalog/server/generation-validator.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement exact validation**

Load the stored generation and complete normalized composition through exact Plan 3 read-store methods. Recompute composition checksum using Task 6 canonicalization. Never query unselected Plan 1 facts to choose alternatives.

Findings sort by `[blocking desc, severity, foodId ?? "", reasonCode, evidenceReference ?? ""]` before report hashing.

`GenerationValidationReportDraft` includes exact generation ID/checksum, validator set version, report checksum, counts, and normalized findings.

- [ ] **Step 4: Persist through exact RPC**

`persistGenerationValidation` sends exact report + findings to `recordValidation`. It does not mark the generation “valid” through a mutable flag; the immutable report is evidence and promotion requires its explicit ID.

- [ ] **Step 5: Run focused tests and prove GREEN**

Run Step 2. Expected: PASS.

- [ ] **Step 6: Commit Task 7**

```bash
git add services/food-catalog/server/generation-validator.ts \
  services/food-catalog/server/generation-validator.test.ts
git commit -m "feat(food-catalog): validate generation candidates"
```

---

### Task 8: Implement the pure structured Trust Profile projector

**Files:**
- Create: `lib/food-catalog/domain/trust.ts`
- Create: `lib/food-catalog/domain/trust.test.ts`

**Interfaces:**
- Produces `FoodTrustProfile`, `FoodTrustProfileInput`, and `deriveFoodTrustProfile(input)`.
- No DB access, timestamp selection, or mutable trust row.

- [ ] **Step 1: Write exact RED Verified tests**

`verified === true` only when all are true:

```ts
const verifiedInput = {
  generationId,
  foodId,
  lifecycle: "active" as const,
  verification: {
    identity: "verified" as const,
    nutrition: "verified" as const,
    serving: "missing" as const,
    barcode: "missing" as const,
    localization: "missing" as const,
  },
  activationAccepted: true,
  blockingConditionCount: 0,
  completeness: {
    nutritionKnownFields: 4,
    nutritionTotalFields: 8,
    hasHouseholdServing: false,
    hasPreferredDisplayName: true,
  },
  trustPolicyVersion: "food-trust-v1",
};
expect(deriveFoodTrustProfile(verifiedInput).verified).toBe(true);
```

Then independently flip lifecycle, identity, nutrition, activation, and blocker count; each must make `verified=false`. Leave serving missing and prove it does **not** make overall Verified false. Prove completeness changes do not rewrite verification state.

- [ ] **Step 2: Run and prove RED**

```bash
npx vitest run --config vitest.unit.config.mjs lib/food-catalog/domain/trust.test.ts
```

- [ ] **Step 3: Implement Trust Profile**

Use verification projection states `verified|revoked|missing`. Return structured component states plus `verified`; never return numeric score. Do not inspect nutrient values except completeness counts supplied by the current service. Unknown nutrient values remain outside trust mutation logic.

- [ ] **Step 4: Run and prove GREEN**

Run Step 2. Expected: PASS.

- [ ] **Step 5: Commit Task 8**

```bash
git add lib/food-catalog/domain/trust.ts lib/food-catalog/domain/trust.test.ts
git commit -m "feat(food-catalog): derive structured trust profiles"
```

---

### Task 9: Implement current-generation exact reads, flattened redirect resolution, and compatibility bridge

**Files:**
- Create: `services/food-catalog/server/current-generation-service.ts`
- Create: `services/food-catalog/server/current-generation-service.test.ts`
- Modify: `services/food-catalog/server/index.ts`

**Interfaces:**
- Produces `getCurrentGenerationFood(readStore, requestedFoodId)`.
- Produces `projectCurrentGenerationCompatibility(view, selection)` for tests/future callers; member runtime is not switched.
- Returns exact current generation ID, requested ID, survivor ID, hydrated selected facts, Trust Profile, and promotion evidence IDs.

- [ ] **Step 1: Write RED current-read tests**

Prove:

1. `current_generation_id = null` throws `FoodCatalogGenerationError("NO_CURRENT_GENERATION", ...)`; no legacy fallback call is made.
2. Direct current Food uses exact generation entry.
3. Old merged ID resolves through one exact generation redirect to active target.
4. Redirect chain/non-active target is rejected even if persisted data is malformed.
5. Service hydrates only selected nutrition/name/serving/taxonomy/market/verification IDs.
6. A newer unselected nutrition revision/name/assertion returned by no API cannot influence output.
7. Selected nutrition `0` remains `0`; selected unknown stays `null`.
8. Selected revoked identity/nutrition assertion yields unverified Trust Profile.
9. Serving verification absent does not prevent overall Verified when required trust conditions pass.
10. Exact current pointer `current_event_id` → promotion event → exact validation report is used; no latest report discovery.
11. `projectCurrentGenerationCompatibility` accepts only a name ID and optional serving ID already selected by the current generation; otherwise it rejects.
12. Existing Plan 2 compatibility projector remains pure and unchanged.

- [ ] **Step 2: Run focused tests and prove RED**

```bash
npx vitest run --config vitest.unit.config.mjs \
  services/food-catalog/server/current-generation-service.test.ts \
  services/food-catalog/server/compatibility-projection.test.ts
```

Expected: current service tests FAIL; Plan 2 projector stays GREEN.

- [ ] **Step 3: Implement current read flow exactly**

```text
readCurrentPointer
  → require non-null generation + current event
  → read direct generation Food OR exact redirect
  → require redirect target active and not redirect
  → read exact selection IDs
  → hydrate exact selected facts
  → require every hydrated fact same Food
  → read exact promotion event and exact validation report/findings
  → derive TrustProfile
  → return immutable view
```

Do not call `getFoodCatalogDomainBundle()` to choose current facts; that raw Plan 2 API remains diagnostic/control-plane only.

- [ ] **Step 4: Add safe public exports**

`services/food-catalog/server/index.ts` may export Plan 3 domain-safe contracts/functions and store **interfaces**, but must not export `supabase-generation-read-store.ts`, `supabase-generation-command-store.ts`, raw RPC names, or a privileged Supabase client.

- [ ] **Step 5: Run focused tests and prove GREEN**

Run Step 2. Expected: PASS.

- [ ] **Step 6: Commit Task 9**

```bash
git add services/food-catalog/server/current-generation-service.ts \
  services/food-catalog/server/current-generation-service.test.ts \
  services/food-catalog/server/index.ts
git commit -m "feat(food-catalog): read exact current generation facts"
```

---

### Task 10: Implement typed promote, rollback, and revoke command services over atomic RPCs

**Files:**
- Create: `services/food-catalog/server/generation-command-service.ts`
- Create: `services/food-catalog/server/generation-command-service.test.ts`

**Interfaces:**
- Produces `promoteCatalogGeneration`, `rollbackCatalogGeneration`, `revokeCatalogGeneration`.
- These functions validate semantic command inputs and delegate one atomic call each to `FoodCatalogGenerationCommandStore`.

- [ ] **Step 1: Write RED command-service tests**

Promotion tests reject before store call when any of these are missing/invalid:
- generation UUID;
- expected-current field is omitted rather than explicitly `null|string`;
- candidate checksum is not 64 lowercase hex;
- validation report UUID/checksum invalid;
- operation UUID invalid;
- blank actor principal/authority/reason/policy.

Rollback tests require exact current ID, exact target ID, exact target checksum, operation ID, actor, and never accept `previous=true`, ordinal, or timestamp inputs.

Revoke tests require exact generation ID/checksum; service never silently revokes current because DB remains final authority.

- [ ] **Step 2: Run and prove RED**

```bash
npx vitest run --config vitest.unit.config.mjs \
  services/food-catalog/server/generation-command-service.test.ts
```

- [ ] **Step 3: Implement command checksums and delegation**

For each command, normalize only semantic command fields into a canonical payload and compute `commandChecksumSha256`. The operation ID itself is **not** included in the command checksum; retry with a new semantic payload under the same operation ID must conflict in DB, while retry with identical semantic payload reconciles.

Example promotion semantic payload:

```ts
{
  generationId,
  expectedCurrentGenerationId,
  generationChecksumSha256,
  validationReportId,
  validationReportChecksumSha256,
  actor,
}
```

Call exactly one command-store method; do not perform pointer updates in TypeScript.

- [ ] **Step 4: Run and prove GREEN**

Run Step 2. Expected: PASS.

- [ ] **Step 5: Commit Task 10**

```bash
git add services/food-catalog/server/generation-command-service.ts \
  services/food-catalog/server/generation-command-service.test.ts
git commit -m "feat(food-catalog): add generation transition commands"
```

---

### Task 11: Enforce physical-table, privileged-command, and no-implicit-current architecture boundaries

**Files:**
- Create: `lib/product/food-catalog-generation-authority-boundary.test.ts`
- Modify: `lib/product/food-catalog-v2-service-boundary.test.ts`
- Modify: `services/food-catalog/server/index.ts`

**Interfaces:**
- Produces static CI guards that make Plan 3 authority violations review blockers.

- [ ] **Step 1: Write RED boundary tests**

Extend physical table regex to cover all Plan 3 tables. Allowed production TypeScript direct `.from("food_catalog_...")` access is only:

```ts
new Set([
  "services/food-catalog/server/supabase-generation-read-store.ts",
]);
```

`supabase-generation-command-store.ts` must use RPC only and must not be added to direct-table allowlist.

Raw Plan 3 adapter imports are allowed only from `services/food-catalog/server/**`.

- [ ] **Step 2: Add no-implicit-current static guard**

Scan Plan 3 current-authority modules and reject patterns equivalent to:

```ts
/\.order\(\s*["'](?:created_at|sealed_at|revision_number|generation_ordinal)["'][\s\S]{0,120}ascending\s*:\s*false/
/Math\.max\s*\(/
/MAX\s*\(/i
/latest(?:Generation|Nutrition|Name|Serving|Assertion)/
```

Allow deterministic ascending sorting used only for canonicalization when the code explicitly sorts the already-selected IDs. The guard should target current-selection/query modules, not Plan 2 raw diagnostic ordering.

Also assert the Plan 3 migration promotion/rollback functions do not contain `ORDER BY ... DESC LIMIT 1` for generation/report/target selection.

- [ ] **Step 3: Guard public exports and privileged credentials**

Assert `services/food-catalog/server/index.ts` does not export:
- `createSupabaseFoodCatalogGenerationReadStore`;
- `createSupabaseFoodCatalogGenerationCommandStore`;
- raw RPC name constants;
- `SupabaseClient` instances or service-role key constructors.

Scan browser/client/app API/member MCP production code for Plan 3 RPC names and require zero matches.

- [ ] **Step 4: Run boundary suite and prove GREEN**

```bash
npx vitest run --config vitest.unit.config.mjs \
  lib/product/food-catalog-v2-service-boundary.test.ts \
  lib/product/food-catalog-generation-authority-boundary.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 11**

```bash
git add lib/product/food-catalog-v2-service-boundary.test.ts \
  lib/product/food-catalog-generation-authority-boundary.test.ts \
  services/food-catalog/server/index.ts
git commit -m "test(food-catalog): enforce Plan 3 authority boundaries"
```

---

### Task 12: Reconcile documentation, run complete Plan 3 regression/Quality gates, and stop for Planner QA/QC

**Files:**
- Modify: `docs/superpowers/specs/2026-09-02-food-catalog-plan3-activation-verification-generations-design.md`
- Modify: `docs/superpowers/plans/2026-09-01-food-catalog-intelligence-program-roadmap.md`
- Modify: `docs/superpowers/plans/food-catalog-intelligence-master-continuity.md`
- Review only: `config/release-compatibility.json`
- Review only: `supabase/migration-ledger.json`

**Interfaces:**
- Produces exact implementation handoff for independent Planner QA/QC.
- Does not merge, apply Production migration, activate Foods, or promote a generation.

- [ ] **Step 1: Run focused Plan 3 unit suite**

```bash
npx vitest run --config vitest.unit.config.mjs \
  lib/food-catalog/domain/activation.test.ts \
  lib/food-catalog/domain/generations.test.ts \
  lib/food-catalog/domain/trust.test.ts \
  services/food-catalog/server/canonical-hash.test.ts \
  services/food-catalog/server/supabase-generation-read-store.test.ts \
  services/food-catalog/server/supabase-generation-command-store.test.ts \
  services/food-catalog/server/activation-service.test.ts \
  services/food-catalog/server/generation-builder.test.ts \
  services/food-catalog/server/generation-validator.test.ts \
  services/food-catalog/server/current-generation-service.test.ts \
  services/food-catalog/server/generation-command-service.test.ts \
  services/food-catalog/server/compatibility-projection.test.ts \
  lib/product/food-catalog-generation-authority-migration.test.ts \
  lib/product/food-catalog-v2-service-boundary.test.ts \
  lib/product/food-catalog-generation-authority-boundary.test.ts \
  lib/product/food-catalog-intelligence-core-migration.test.ts \
  lib/product/food-catalog-plan1-semantic-corrections-migration.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run disposable database verification**

```bash
node scripts/replay-local-migration-chain.mjs --prove-future-order
PLAIVRA_LOCAL_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  node scripts/run-database-verification.mjs
supabase db lint --local --schema public --level error --fail-on error
```

Expected: PASS with all Plan 3 fixtures rolled back.

- [ ] **Step 3: Run repository quality commands**

```bash
npm run typecheck
npm run lint
npm run test:scripts
npm run migration:ledger:check
npm run test:unit
npm run build
```

Expected: PASS. `migration:ledger:check` must remain valid while truthfully reporting the Plan 3 repository migration as pending; do not fake `release_ready=true`.

- [ ] **Step 4: Prove scope/Production boundaries by diff**

From the exact implementation base SHA recorded before Task 1:

```bash
git diff --name-only <EXACT_PLAN3_IMPLEMENTATION_BASE>...HEAD
git diff <EXACT_PLAN3_IMPLEMENTATION_BASE>...HEAD -- config/release-compatibility.json
git diff <EXACT_PLAN3_IMPLEMENTATION_BASE>...HEAD -- supabase/migrations/20260901153000_food_catalog_intelligence_core.sql
git diff <EXACT_PLAN3_IMPLEMENTATION_BASE>...HEAD -- supabase/migrations/20260901174500_food_catalog_plan1_semantic_corrections.sql
```

Expected:
- compatibility marker diff: empty;
- both Plan 1 migration diffs: empty;
- exactly one new Plan 3 migration;
- ledger/docs reflect pending repository migration only;
- no Food data seed/population files;
- no Plan 4 adapter/importer files;
- no Activity Catalog changes.

- [ ] **Step 5: Update spec/roadmap/continuity execution state**

Spec status becomes `implementation complete on review branch; Planner QA/QC pending` only after all focused checks pass.

Roadmap records Plan 3 implementation PR/head and explicitly states:
- migration is repository-pending / not Production-applied;
- current pointer in Production has not been created unless separately authorized later;
- Food population NO;
- activation execution NO;
- generation promotion NO;
- member runtime cutover NO;
- Plan 4 NO.

Continuity file records exact branch, PR, base SHA, exact head SHA, migration filename, CI run IDs, and the current STOP gate.

- [ ] **Step 6: Run fresh exact-head PR Quality**

Push the exact head and wait for PR-scoped checks. Keep the PR Draft during implementation/Planner code review unless the canonical `Quality` workflow requires Ready-for-review for phase close.

Before final Planner approval, transition to Ready and require `.github/workflows/quality.yml` on the exact final head. The canonical run must pass at least:
- full chronological migration chain;
- database lint;
- database preflight + registered Plan 3 verifier;
- migration ledger;
- dependency audit;
- lint;
- typecheck;
- full unit failure parity;
- integration tests;
- script tests including `test:scripts`;
- production build;
- release metadata;
- rendered QA.

If the connected GitHub environment cannot mark Draft → Ready because of the known `fullDatabaseId` connector limitation, report exactly:

`Manual Ready-for-review transition required for Plan 3 phase-close Quality.`

Do not waive the canonical Quality gate.

- [ ] **Step 7: Produce the exact Planner handoff and STOP**

The handoff must contain:

```text
Branch:
PR:
Implementation base SHA:
Exact final head SHA:
Changed files:
New migration filename:
Migration ledger state: pending
Production migration applied: NO
Production Food population: NO
Provider ingestion: NO
Production activation execution: NO
Production generation promotion: NO
Member runtime V2 cutover: NO
Activity Catalog mutation: NO
Plan 4 started: NO
Compatibility marker changed: NO
Focused RED/GREEN evidence:
Disposable DB verifier evidence:
Exact-head PR Quality run IDs:
Canonical phase-close Quality run ID:
Merged: NO
STOP — awaiting independent Planner QA/QC.
```

- [ ] **Step 8: Commit Task 12 documentation reconciliation**

```bash
git add docs/superpowers/specs/2026-09-02-food-catalog-plan3-activation-verification-generations-design.md \
  docs/superpowers/plans/2026-09-01-food-catalog-intelligence-program-roadmap.md \
  docs/superpowers/plans/food-catalog-intelligence-master-continuity.md
git commit -m "docs(food-catalog): record Plan 3 implementation handoff"
```

Do not merge. Stop for Planner QA/QC.

---

## Plan 3 Exit Criteria

Plan 3 is implementation-complete but not merge-approved only when all of the following are true:

1. One unapplied forward Plan 3 migration defines normalized immutable activation/generation/validation/audit authority and the nullable singleton pointer.
2. The new repository migration is truthfully classified `pending`; no Production identity is invented.
3. Plan 1 migration bytes remain unchanged.
4. Verification assertion forks/non-head supersession are DB-rejected.
5. Active generation Foods require exact activation member + grant authority.
6. Full generation composition and validation reports are immutable and deterministic-checksummed.
7. Current effective reads use only the singleton pointer + exact generation-selected IDs.
8. No latest/max/timestamp/order heuristic is current authority.
9. Redirects are flattened and target an active generation survivor.
10. Trust Profile is structured/explainable; Verified rule exactly matches the approved spec and serving verification is not mandatory.
11. Promotion/rollback are atomic DB transactions with expected-current CAS, exact checksum/report binding, audit event, and operation-id idempotency.
12. Revoked generation cannot be promoted/rollback target; current generation must be rolled back before revoke.
13. No member/browser/MCP surface gains privileged Plan 3 mutation access.
14. `anon`/`authenticated` have no direct CRUD on Plan 3 authority tables/RPCs.
15. Empty/bootstrap state remains valid with no fake generation.
16. Legacy member Nutrition/Food Library runtime remains unchanged.
17. `config/release-compatibility.json` is unchanged.
18. Production migration apply, Food population, provider ingestion, activation, promotion, deployment, Activity Catalog mutation, and Plan 4 are all NO.
19. Focused tests, full unit, database replay/verifier, lint, typecheck, scripts, ledger check, build, and canonical exact-head Quality all pass.
20. Independent Planner QA/QC explicitly approves merge on the exact final head.

## Post-Merge / Production Boundary

Even after Plan 3 code is squash-merged, **do not apply** `20260902150000_food_catalog_generation_authority.sql` to Production automatically.

The next authority sequence is:

1. verify squash merge/main exact tree;
2. independently re-check Production migration history and zero/unexpected Food state;
3. obtain separate explicit user/Planner approval for the exact Plan 3 Production schema migration;
4. apply exactly once and reconcile the migration ledger to the generated Production identity;
5. verify RLS/privileges/current pointer is `NULL` and no Food/generation data was populated;
6. stop again — schema apply still does not authorize activation or generation promotion;
7. only after Plan 3 schema health is proven may the Planner close Plan 3 and authorize Plan 4 planning.

No Production activation or Catalog Generation promotion is expected in Plan 3 itself while the canonical catalog remains unpopulated.
