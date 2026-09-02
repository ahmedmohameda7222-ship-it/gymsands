# Food Catalog Plan 3 — Activation, Verification, Trust, and Catalog Generations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement audited activation, scoped verification, full immutable Catalog Generations, structured Trust Profiles, exact current-generation reads, and atomic promotion/rollback authority without changing current member runtime or mutating Production.

**Architecture:** Add one forward Plan 3 schema migration containing normalized immutable activation/generation/validation/audit state plus one nullable singleton current-generation pointer. TypeScript services operate over Supabase-independent ports; current reads hydrate only exact fact IDs selected by the pointed generation. Privileged mutations are service-role-only PostgreSQL RPCs so generation creation, validation recording, promotion, rollback, revocation, expected-current CAS, and operation-id idempotency remain transactional and database-enforced.

**Tech Stack:** TypeScript 5.9, Vitest 4, Node.js 24 `crypto`, Supabase JS 2.84, PostgreSQL/Supabase CLI 2.109.1, Next.js 16 server-only modules.

**Spec:** `docs/superpowers/specs/2026-09-02-food-catalog-plan3-activation-verification-generations-design.md`

## Global Constraints

- Existing implementation is migration input, not target-architecture authority.
- Catalog Generation is the sole long-term authority for current effective Food facts.
- Never select current facts using latest timestamp, maximum revision, maximum ID, insertion order, arbitrary first row, provider preference, or importer preference.
- Full generation composition is immutable and references immutable canonical fact IDs; it does not duplicate nutrition/name/serving values into another truth store.
- Unknown nutrition remains `null`; explicit source zero remains `0`.
- No generic household conversion and no generic `ml ↔ g` conversion may be introduced.
- Verification remains immutable scoped assertion history; mutable `is_verified` is not authority.
- Reuse the existing `FoodVerificationScope` from `lib/food-catalog/domain/verification.ts`; do not create a parallel Plan 3 verification-scope enum.
- Activation eligibility, activation grant, generation construction, validation, promotion, and member visibility are separate authorities.
- Later activation invalidation or later verification assertions never retroactively mutate a sealed/promoted generation.
- Merged source IDs are represented by generation redirects, not duplicate `merged` generation-Food rows.
- Redirects are direct and flattened to an active survivor; chains are invalid.
- Historical Diary/Recipe/Saved Meal/Meal Plan snapshots are never rewritten.
- My Foods and personal overrides are not mutated.
- Current Nutrition/Food Library member runtime remains on the legacy compatibility path. Plan 3 member runtime cutover is **not authorized**.
- Plan 4 ingestion/quarantine/release-diff work is **not started**.
- Plan 6 capability/RBAC/break-glass work is **not started**.
- Do not introduce a paid provider, search engine, cache, queue, or new database.
- Privileged Supabase credentials remain server-only and are never constructed/exported by Food Catalog modules.
- Direct physical Plan 3 table access is restricted to dedicated Food Catalog adapters, SQL migration/verification, and focused tests.
- Privileged mutations use narrow service-role-only RPCs. No member/admin generic CRUD endpoint is introduced.
- Historical applied migrations are byte-immutable. The new Plan 3 migration may change only while it remains unapplied on the implementation branch; its bytes freeze at Planner-approved exact head and permanently after Production apply.
- The migration filename is exactly `supabase/migrations/20260902150000_food_catalog_generation_authority.sql`.
- Adding that repository migration requires classifying it as `pending` in `supabase/migration-ledger.json`. This is repository bookkeeping, **not** Production apply/reconciliation.
- While pending, ledger `historyRepair.state`, `pendingCount`, and `unresolvedCount` must truthfully represent the pending migration. `productionMigrationCount`, latest applied Production identity, and applied migration evidence remain unchanged.
- `config/release-compatibility.json` must not change.
- Production migration apply, Food population, provider ingestion, Production activation execution, Catalog Generation promotion, deployment, Activity Catalog mutation, and Plan 4 are all **NO** unless separately authorized later.
- Implementation uses branch `feat/food-catalog-generation-authority-v3` unless the Planner records a replacement before execution starts.
- At implementation start, record the exact base once:

```bash
export PLAN3_BASE_SHA="$(git rev-parse origin/main)"
test "$(git rev-parse HEAD)" = "$PLAN3_BASE_SHA"
git cat-file -e 2883e077f1fdc159330c29b1dc6124ec905738e2^{commit}
```

- The base must contain Plan 2 squash merge `2883e077f1fdc159330c29b1dc6124ec905738e2`, the approved Plan 3 spec, this plan, and the master continuity file.
- Every task uses RED → GREEN evidence and a focused commit.
- Do not merge until independent Planner QA/QC and exact-head canonical `Quality` pass.
- In Classic ChatGPT environments without worktrees/subagents, execute the same tasks through GitHub + CI. TDD, architecture, and Production gates do not change.

---

## File Map

### Create

- `lib/food-catalog/domain/activation.ts`
- `lib/food-catalog/domain/activation.test.ts`
- `lib/food-catalog/domain/generations.ts`
- `lib/food-catalog/domain/generations.test.ts`
- `lib/food-catalog/domain/trust.ts`
- `lib/food-catalog/domain/trust.test.ts`
- `services/food-catalog/server/canonical-hash.ts`
- `services/food-catalog/server/canonical-hash.test.ts`
- `services/food-catalog/server/generation-errors.ts`
- `services/food-catalog/server/generation-contracts.ts`
- `services/food-catalog/server/generation-store.ts`
- `services/food-catalog/server/supabase-generation-read-store.ts`
- `services/food-catalog/server/supabase-generation-read-store.test.ts`
- `services/food-catalog/server/supabase-generation-command-store.ts`
- `services/food-catalog/server/supabase-generation-command-store.test.ts`
- `services/food-catalog/server/activation-service.ts`
- `services/food-catalog/server/activation-service.test.ts`
- `services/food-catalog/server/generation-builder.ts`
- `services/food-catalog/server/generation-builder.test.ts`
- `services/food-catalog/server/generation-validator.ts`
- `services/food-catalog/server/generation-validator.test.ts`
- `services/food-catalog/server/current-generation-service.ts`
- `services/food-catalog/server/current-generation-service.test.ts`
- `services/food-catalog/server/generation-command-service.ts`
- `services/food-catalog/server/generation-command-service.test.ts`
- `supabase/migrations/20260902150000_food_catalog_generation_authority.sql`
- `supabase/verification/food-catalog-generation-authority.sql`
- `scripts/food-catalog-generation-authority-verification-registry.test.mjs`
- `lib/product/food-catalog-generation-authority-migration.test.ts`
- `lib/product/food-catalog-generation-authority-boundary.test.ts`

### Modify

- `services/food-catalog/server/index.ts`
- `lib/product/food-catalog-v2-service-boundary.test.ts`
- `scripts/run-database-verification.mjs`
- `supabase/migration-ledger.json`
- `docs/architecture/migration-ledger-reconciliation.md`
- `docs/superpowers/specs/2026-09-02-food-catalog-plan3-activation-verification-generations-design.md` — status only after implementation evidence.
- `docs/superpowers/plans/2026-09-01-food-catalog-intelligence-program-roadmap.md` — execution status only.
- `docs/superpowers/plans/food-catalog-intelligence-master-continuity.md` — exact branch/head/gate continuity.

---

### Task 1: Domain contracts, stable errors, and deterministic canonical hashing

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
- `ActivationEligibility`, `ActivationEventType`, `ActivationSetMemberDraft`, `validateActivationSetMemberDraft`.
- `GenerationLifecycle`, `GenerationEventType`, `GenerationFoodSelection`, `GenerationRedirectSelection`, `GenerationValidationFinding`, `ControlPlaneActorContext`, structural validators.
- Existing `FoodVerificationScope` is imported where verification scope is needed.
- `FoodCatalogGenerationErrorCode`, `FoodCatalogGenerationError`.
- `canonicalStringify(value)`, `sha256Canonical(value)`.
- Stored row and command DTOs in `generation-contracts.ts`.

- [ ] **Step 1: Write failing runtime contract/hash tests**

```ts
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
  expect(() => validateGenerationRedirectSelection({ sourceFoodId: id, targetFoodId: id }))
    .toThrow(/self/i);
});

expect(sha256Canonical({ b: 2, a: 1 })).toBe(sha256Canonical({ a: 1, b: 2 }));
expect(sha256Canonical({ a: ["x", "y"] })).not.toBe(
  sha256Canonical({ a: ["y", "x"] }),
);
```

Also reject invalid runtime enum strings, blank IDs/policy fields, non-64-hex checksums, non-finite numbers, `undefined`, functions, symbols, and cyclic canonical-hash inputs.

- [ ] **Step 2: Prove RED**

```bash
npx vitest run --config vitest.unit.config.mjs \
  lib/food-catalog/domain/activation.test.ts \
  lib/food-catalog/domain/generations.test.ts \
  services/food-catalog/server/canonical-hash.test.ts
```

Expected: FAIL because Plan 3 contracts do not exist.

- [ ] **Step 3: Implement exact domain values**

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

export type GenerationFoodSelection = {
  foodId: string;
  lifecycle: GenerationLifecycle;
  nutritionRevisionId: string | null;
  activationSetId: string | null;
  activationSetMemberId: string | null;
  activationGrantEventId: string | null;
};
```

`active` requires all activation references. `deprecated|withdrawn` require all activation references to be null. `draft|merged` are runtime-invalid for generation Food rows.

- [ ] **Step 4: Implement stable errors**

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
  constructor(public readonly code: FoodCatalogGenerationErrorCode, message: string) {
    super(message);
    this.name = "FoodCatalogGenerationError";
  }
}
```

- [ ] **Step 5: Implement canonical JSON + SHA-256**

`canonicalStringify` recursively sorts object keys and preserves array order. `sha256Canonical` uses `createHash("sha256")` and returns lowercase 64-hex. Arrays are **not** generically sorted; Tasks 5–7 sort semantic collections before hashing.

- [ ] **Step 6: Prove GREEN and commit**

Run Step 2, then:

```bash
git add lib/food-catalog/domain/activation.ts lib/food-catalog/domain/activation.test.ts \
  lib/food-catalog/domain/generations.ts lib/food-catalog/domain/generations.test.ts \
  services/food-catalog/server/generation-errors.ts \
  services/food-catalog/server/generation-contracts.ts \
  services/food-catalog/server/canonical-hash.ts services/food-catalog/server/canonical-hash.test.ts
git commit -m "feat(food-catalog): define Plan 3 generation contracts"
```

---

### Task 2: Add normalized Plan 3 schema, immutability, same-Food integrity, and pending-ledger truth

**Files:**
- Create: `supabase/migrations/20260902150000_food_catalog_generation_authority.sql`
- Create: `lib/product/food-catalog-generation-authority-migration.test.ts`
- Modify: `supabase/migration-ledger.json`
- Modify: `docs/architecture/migration-ledger-reconciliation.md`

**Interfaces:**
- All normalized Plan 3 relations used by Task 3 RPCs and Task 4 reads.
- Forward composite uniqueness for Plan 1 immutable facts.
- No-fork verification supersession.
- One nullable singleton pointer, including exact validation evidence for the currently pointed state.

- [ ] **Step 1: Write RED static migration test**

Assert exactly one `_food_catalog_generation_authority.sql` and these relations:

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
expect(sql).toMatch(/unique\s*\(\s*supersedes_assertion_id\s*\)/i);
expect(sql).toContain("current_validation_report_id");
```

For every new relation assert RLS, `revoke all ... from anon, authenticated`, and no authenticated mutation grants. Assert immutable-trigger coverage for every authority table except `food_catalog_current_generation`.

- [ ] **Step 2: Prove RED**

```bash
npx vitest run --config vitest.unit.config.mjs \
  lib/product/food-catalog-generation-authority-migration.test.ts
```

Expected: FAIL because migration does not exist.

- [ ] **Step 3: Create exact additive schema**

Migration starts `begin;` and ends `commit;`. Create:

1. `food_catalog_control_operations`: `operation_id uuid primary key`, operation kind, command SHA-256, immutable result JSON, created timestamp.
2. Activation set/member/event tables. Member has `unique (activation_set_id, food_id)` and composite `unique (id, activation_set_id, food_id)`. Event types are `created|grant|invalidate`; invalidation targets an exact prior grant. A partial unique index allows one invalidation per grant.
3. `food_catalog_generations`: UUID PK, nullable base generation, nullable diagnostic ordinal, composition/generation/activation/trust/projection versions, change-manifest checksum, composition checksum, authority reference, created/sealed timestamps.
4. `food_catalog_generation_foods`: only `active|deprecated|withdrawn`. Active rows require activation set/member/grant IDs; non-active rows require those null.
5. Normalized generation serving/name/taxonomy/market/verification tables.
6. `food_catalog_generation_redirects`: unique generation/source, no self target.
7. Validation report/findings tables with exact generation checksum and immutable normalized blocker fields.
8. Generation events with `created|validated|promote|rollback|revoke`, operation ID/checksum, from/to/revoked IDs, exact validation-report reference, actor context, reason/policy/timestamp.
9. `food_catalog_current_generation`: one singleton row with `current_generation_id`, `current_event_id`, **`current_validation_report_id`**, `pointer_revision`, `updated_at`. Seed exactly one row with all three current references null and revision `0`. This is not a fake generation.

Add forward composite uniqueness:
- `(id, food_id)` on Plan 1 nutrition/serving/name/taxonomy/market tables;
- `(id, food_id, assertion_scope)` on verification assertions.

Use composite FKs from generation selections to same-Food facts. DB triggers reject selected taxonomy/market rows whose action is `remove`.

Add `unique (supersedes_assertion_id)` to `food_verification_assertions`. Combined with Plan 1 same-Food/scope predecessor validation and immutable predecessors, this rejects forks/non-head supersession without rewriting Plan 1 migrations.

Use a deferred constraint trigger for redirect set integrity: target must be an `active` generation Food, target cannot itself be a redirect source, and redirect source cannot also be a generation Food.

- [ ] **Step 4: Add immutability and privileges**

Apply immutable UPDATE/DELETE rejection to operations, activation state/events, generations/composition, validation reports/findings, and generation events. Do not apply it to the singleton pointer.

Enable RLS on every new public relation. Revoke all direct privileges from `anon` and `authenticated`. Grant `service_role` read access needed by strict read adapters; writes occur through security-definer RPCs from Task 3 rather than generic client CRUD.

- [ ] **Step 5: Classify migration as pending, without inventing Production identity**

Append a sorted ledger entry:

```json
{
  "localFile": "20260902150000_food_catalog_generation_authority.sql",
  "state": "pending",
  "note": "Food Catalog Plan 3 additive generation-authority migration. Repository-only pending; Production apply requires separate exact Planner/user approval."
}
```

No `productionVersion`/`productionName`. Change top-level and `historyRepair` pending/unresolved counts to `1`, set `historyRepair.state` to `pending`, and preserve `productionMigrationCount`, applied identities, evidence commit, and Production capture timestamp. Keep `Do not replay` in the history note.

Update `docs/architecture/migration-ledger-reconciliation.md` with exact pending filename and state that latest applied Production identity remains `20260901183021_food_catalog_plan1_semantic_corrections`, compatibility marker remains `20260724232734`, and no Food population/activation/generation promotion occurred.

- [ ] **Step 6: Prove GREEN and commit**

```bash
npx vitest run --config vitest.unit.config.mjs \
  lib/product/food-catalog-generation-authority-migration.test.ts \
  lib/product/food-catalog-intelligence-core-migration.test.ts \
  lib/product/food-catalog-plan1-semantic-corrections-migration.test.ts
npm run migration:ledger:check
```

Expected: PASS; ledger may truthfully report `pending=1` / `release_ready=false`.

```bash
git add supabase/migrations/20260902150000_food_catalog_generation_authority.sql \
  lib/product/food-catalog-generation-authority-migration.test.ts \
  supabase/migration-ledger.json docs/architecture/migration-ledger-reconciliation.md
git commit -m "feat(food-catalog): add Plan 3 generation schema"
```

---

### Task 3: Atomic service-role RPCs and disposable-database verification

**Files:**
- Modify: `supabase/migrations/20260902150000_food_catalog_generation_authority.sql`
- Create: `supabase/verification/food-catalog-generation-authority.sql`
- Create: `scripts/food-catalog-generation-authority-verification-registry.test.mjs`
- Modify: `scripts/run-database-verification.mjs`
- Modify: `lib/product/food-catalog-generation-authority-migration.test.ts`

**Interfaces:**

Exact service-role-only RPCs:

```text
public.food_catalog_create_activation_set_v1(jsonb)
public.food_catalog_grant_activation_set_v1(jsonb)
public.food_catalog_invalidate_activation_grant_v1(jsonb)
public.food_catalog_create_generation_v1(jsonb)
public.food_catalog_record_generation_validation_v1(jsonb)
public.food_catalog_promote_generation_v1(jsonb)
public.food_catalog_rollback_generation_v1(jsonb)
public.food_catalog_revoke_generation_v1(jsonb)
```

- [ ] **Step 1: Write RED disposable SQL verifier**

`supabase/verification/food-catalog-generation-authority.sql` uses `\set ON_ERROR_STOP on`, `begin;`, deterministic UUID fixtures, temporary assert/reject helpers, and final `rollback;`.

It must prove:
- zero generation rows after migration and nullable singleton pointer;
- immutable rows reject update/delete;
- verification fork is rejected;
- cross-Food generation fact refs are rejected;
- taxonomy/market remove facts cannot be selected;
- activation set creation/grant/invalidation semantics;
- invalidated-before-seal grant cannot authorize active generation Food;
- valid active member requires exact set/member/grant;
- redirect self/chain/non-active target/source-duplicate failures;
- report binds exact generation checksum;
- blockers prevent promotion;
- wrong report/checksum prevents promotion;
- bootstrap promote requires expected current null;
- stale expected-current transition fails;
- successful promotion writes event + pointer + current validation report atomically;
- rollback names explicit target and exact prior target validation evidence;
- revoked generation cannot be promoted/rollback target;
- identical operation retry returns/reconciles original result;
- same operation ID with different command checksum fails;
- final SQL transaction rollback removes fixtures.

- [ ] **Step 2: Prove RED against local replay**

```bash
node scripts/replay-local-migration-chain.mjs --prove-future-order
PLAIVRA_LOCAL_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -X -v ON_ERROR_STOP=1 -f supabase/verification/food-catalog-generation-authority.sql
```

Expected: FAIL until RPCs are implemented.

- [ ] **Step 3: Implement race-safe global operation idempotency**

Every RPC begins by serializing the operation ID with a transaction advisory lock:

```sql
perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));
```

Then read `food_catalog_control_operations` by exact operation ID. If found with same operation kind + command checksum, return stored result. If found with different semantic identity, raise an operation conflict. If absent, execute the command and insert the immutable operation result before returning. This avoids check-then-insert races while keeping the operation row immutable.

- [ ] **Step 4: Implement activation RPCs**

- `create_activation_set`: atomically inserts immutable set, exact members, `created` activation event, operation result.
- `grant_activation_set`: requires every member eligible, appends exact `grant` event, returns grant event ID.
- `invalidate_activation_grant`: explicitly targets a grant event in the same set, appends `invalidate`; never mutates grant.

- [ ] **Step 5: Implement generation creation/report RPCs**

`create_generation` validates base if supplied, exact active grant relation, no invalidation existing **at or before sealing**, same-Food selections, unique keys, effective assignment actions, and complete flattened redirects, then atomically writes one sealed full snapshot plus `created` event.

A later grant invalidation does not invalidate the already sealed composition retroactively.

`record_generation_validation` requires exact generation ID + composition checksum, inserts immutable report/findings, verifies submitted counts, appends `validated` event, and returns exact report ID/checksum.

- [ ] **Step 6: Implement promote/rollback/revoke RPCs**

Promotion input must contain candidate ID/checksum, explicit `expected_current_generation_id` including null bootstrap, exact validation report ID/checksum, operation ID/checksum, actor, reason and policy. Within one transaction: lock singleton `FOR UPDATE`; compare expected current; verify exact report/candidate/checksum and zero blockers; reject revoked candidate; validate active grants/redirects; append promote event; set `current_generation_id`, `current_event_id`, **`current_validation_report_id`**, increment pointer revision.

Rollback input must contain explicit expected current, target generation ID/checksum, **target prior promotion event ID**, **target validation report ID/checksum**, operation ID/checksum and actor context. DB proves the supplied promotion event previously promoted that exact target with that exact report, target is not revoked, then atomically appends rollback event and sets all three current pointer references to the target state. It never chooses target/evidence by time or ordinal.

Revoke appends immutable `revoke` for a non-current generation. Revoke-current is rejected; rollback must occur first. Promotion/rollback reject revoked targets.

- [ ] **Step 7: Lock RPC privileges**

Every function:

```sql
revoke all on function public.<name>(jsonb) from public, anon, authenticated;
grant execute on function public.<name>(jsonb) to service_role;
```

Use fixed `search_path = pg_catalog, public, private, extensions` for security-definer functions.

- [ ] **Step 8: Register verifier**

Add `supabase/verification/food-catalog-generation-authority.sql` to `DATABASE_VERIFICATION_FILES` immediately after Plan 1 Food Catalog verifiers and before `production-release-migration-preflight.sql`.

Registry test:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { DATABASE_VERIFICATION_FILES } from "./run-database-verification.mjs";

test("registers Plan 3 verifier before release preflight", () => {
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

- [ ] **Step 9: Prove GREEN and commit**

```bash
npm run test:scripts
node scripts/replay-local-migration-chain.mjs --prove-future-order
PLAIVRA_LOCAL_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  node scripts/run-database-verification.mjs
supabase db lint --local --schema public --level error --fail-on error
```

```bash
git add supabase/migrations/20260902150000_food_catalog_generation_authority.sql \
  supabase/verification/food-catalog-generation-authority.sql \
  scripts/run-database-verification.mjs \
  scripts/food-catalog-generation-authority-verification-registry.test.mjs \
  lib/product/food-catalog-generation-authority-migration.test.ts
git commit -m "feat(food-catalog): add atomic generation authority commands"
```

---

### Task 4: Supabase-independent Plan 3 ports and strict adapters

**Files:**
- Create: `services/food-catalog/server/generation-store.ts`
- Create: `services/food-catalog/server/supabase-generation-read-store.ts`
- Create: `services/food-catalog/server/supabase-generation-read-store.test.ts`
- Create: `services/food-catalog/server/supabase-generation-command-store.ts`
- Create: `services/food-catalog/server/supabase-generation-command-store.test.ts`

**Interfaces:**

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
  readVerificationAssertions(
    foodId: string,
    selections: ReadonlyArray<{ scope: FoodVerificationScope; assertionId: string }>,
  ): Promise<StoredFoodVerificationAssertion[]>;
  readActivationAuthority(memberId: string, grantEventId: string): Promise<StoredActivationAuthority | null>;
  readGenerationEvent(eventId: string): Promise<StoredGenerationEvent | null>;
  readValidationReport(reportId: string): Promise<StoredGenerationValidationReport | null>;
  readValidationFindings(reportId: string): Promise<StoredGenerationValidationFinding[]>;
}
```

`StoredCurrentGenerationPointer` contains:

```ts
{
  currentGenerationId: string | null;
  currentEventId: string | null;
  currentValidationReportId: string | null;
  pointerRevision: number;
}
```

Command port methods are exactly `createActivationSet`, `grantActivationSet`, `invalidateActivationGrant`, `createGeneration`, `recordValidation`, `promoteGeneration`, `rollbackGeneration`, `revokeGeneration`.

- [ ] **Step 1: Write RED adapter tests**

Assert exact singleton/current predicates, exact `(generation_id,food_id)` reads, exact fact hydration by both Food + selected ID, no current selection by ordering, strict enum/checksum/count row validation, and empty-ID arrays returning `[]` without `.in([], ...)` queries.

Command adapter tests assert only the eight exact RPC names and zero direct insert/update/delete calls.

- [ ] **Step 2: Prove RED**

```bash
npx vitest run --config vitest.unit.config.mjs \
  services/food-catalog/server/supabase-generation-read-store.test.ts \
  services/food-catalog/server/supabase-generation-command-store.test.ts
```

- [ ] **Step 3: Implement strict read adapter**

Use explicit column lists, never `select("*")`. Runtime-validate every persisted enum/checksum/count. Current fact hydration uses only IDs already selected by generation composition.

- [ ] **Step 4: Implement RPC-only command adapter**

```ts
await supabase.rpc("food_catalog_promote_generation_v1", { p_command: payload });
```

Map bounded DB conflicts to `FoodCatalogGenerationError`. Do not expose client or service-role credentials.

- [ ] **Step 5: Prove GREEN and commit**

Run Step 2, then:

```bash
git add services/food-catalog/server/generation-store.ts \
  services/food-catalog/server/supabase-generation-read-store.ts \
  services/food-catalog/server/supabase-generation-read-store.test.ts \
  services/food-catalog/server/supabase-generation-command-store.ts \
  services/food-catalog/server/supabase-generation-command-store.test.ts
git commit -m "feat(food-catalog): add Plan 3 persistence ports"
```

---

### Task 5: Deterministic Activation Set create/grant/invalidate service

**Files:**
- Create: `services/food-catalog/server/activation-service.ts`
- Create: `services/food-catalog/server/activation-service.test.ts`

**Interfaces:**
- `buildActivationManifest(input)`.
- `createActivationSet(commandStore,input)`.
- `grantActivationSet(commandStore,input)`.
- `invalidateActivationGrant(commandStore,input)`.

- [ ] **Step 1: Write RED tests**

Prove member order does not change checksum; one evidence/eligibility change does; duplicate Food IDs reject; rejected members cannot be granted; invalidation requires exact grant event ID.

- [ ] **Step 2: Prove RED**

```bash
npx vitest run --config vitest.unit.config.mjs services/food-catalog/server/activation-service.test.ts
```

- [ ] **Step 3: Implement exact checksum payload**

Sort members by `foodId`. Hash only:

```ts
{
  manifestSchemaVersion,
  activationPolicyVersion,
  members: members.map((m) => ({
    foodId: m.foodId,
    expectedPreconditionLifecycle: m.expectedPreconditionLifecycle,
    evidenceReference: m.evidenceReference,
    evidenceChecksumSha256: m.evidenceChecksumSha256,
    sourceLegalAccepted: m.sourceLegalAccepted,
    identityResolved: m.identityResolved,
    nutritionBasisValid: m.nutritionBasisValid,
    displayIdentityValid: m.displayIdentityValid,
    blockingConditionCount: m.blockingConditionCount,
    eligibility: m.eligibility,
    memberChecksumSha256: m.memberChecksumSha256,
  })),
}
```

Operation ID, actor, set UUID and timestamps are excluded from manifest checksum.

- [ ] **Step 4: Implement orchestration and prove GREEN**

Grant requires all reviewed members `eligible`; invalidation targets exact set + grant event. No latest-grant lookup.

Run Step 2, then:

```bash
git add services/food-catalog/server/activation-service.ts services/food-catalog/server/activation-service.test.ts
git commit -m "feat(food-catalog): add activation grant service"
```

---

### Task 6: Full immutable generation builder and composition checksum

**Files:**
- Create: `services/food-catalog/server/generation-builder.ts`
- Create: `services/food-catalog/server/generation-builder.test.ts`

**Interfaces:**
- `normalizeGenerationComposition(input)`.
- `computeGenerationCompositionChecksum(input)`.
- `createGenerationCandidate(commandStore,input)`.

- [ ] **Step 1: Write RED tests**

Prove reversing every semantic array leaves checksum unchanged; changing one selected fact/lifecycle/policy changes it; operation ID/actor/timestamps do not. Reject duplicate Food, duplicate fact, duplicate verification `(foodId,scope)`, duplicate redirect source, active Food without activation refs, `draft|merged` lifecycle, and self redirect.

- [ ] **Step 2: Prove RED**

```bash
npx vitest run --config vitest.unit.config.mjs services/food-catalog/server/generation-builder.test.ts
```

- [ ] **Step 3: Implement exact stable sort tuples**

```text
Foods:        [foodId]
Servings:     [foodId, servingOptionId]
Names:        [foodId, nameFactId]
Taxonomy:     [foodId, assignmentId]
Markets:      [foodId, assignmentId]
Verification: [foodId, scope, assertionId]
Redirects:    [sourceFoodId, targetFoodId]
```

Checksum includes composition schema/generation/activation/trust/projection versions and normalized full selections. Exclude generation UUID, base UUID, ordinal, operation ID, actor and timestamps. Base/change manifest remain construction provenance, not runtime inheritance.

- [ ] **Step 4: Create candidate and prove GREEN**

Call `commandStore.createGeneration` with the full normalized snapshot and checksum. Do not touch pointer.

Run Step 2, then:

```bash
git add services/food-catalog/server/generation-builder.ts services/food-catalog/server/generation-builder.test.ts
git commit -m "feat(food-catalog): build immutable generation candidates"
```

---

### Task 7: Deterministic generation validator and immutable report persistence

**Files:**
- Create: `services/food-catalog/server/generation-validator.ts`
- Create: `services/food-catalog/server/generation-validator.test.ts`

**Interfaces:**
- `validateStoredGeneration(readStore,generationId,expectedChecksum)`.
- `persistGenerationValidation(commandStore,report,actor,operationId)`.

Binding blocker reason codes:

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

- [ ] **Step 1: Write RED tests**

Prove recomputed stored checksum; active missing preferred display blocks; missing/cross-Food selected fact blocks; taxonomy/market remove blocks; revoked assertion is valid evidence but scope unverified; redirect target must be active; report finding order/checksum deterministic.

Activation authority validation compares invalidation time to generation `sealedAt`: invalidation at/before seal blocks; invalidation after seal does not retroactively block that generation.

- [ ] **Step 2: Prove RED**

```bash
npx vitest run --config vitest.unit.config.mjs services/food-catalog/server/generation-validator.test.ts
```

- [ ] **Step 3: Implement exact validation/report hashing**

Load only stored composition and explicitly referenced facts. Never query unselected alternatives. Sort findings by:

```text
[blocking desc, severity, foodId-or-empty, reasonCode, evidenceReference-or-empty]
```

Report includes exact generation ID/checksum, validator-set version, report checksum, counts and normalized findings.

- [ ] **Step 4: Persist exact report and prove GREEN**

Persist through `recordValidation`; no mutable “valid” flag is written.

Run Step 2, then:

```bash
git add services/food-catalog/server/generation-validator.ts services/food-catalog/server/generation-validator.test.ts
git commit -m "feat(food-catalog): validate generation candidates"
```

---

### Task 8: Pure structured Trust Profile

**Files:**
- Create: `lib/food-catalog/domain/trust.ts`
- Create: `lib/food-catalog/domain/trust.test.ts`

**Interfaces:**
- `FoodTrustProfileInput`, `FoodTrustProfile`, `deriveFoodTrustProfile(input)`.
- Verification state is `verified|revoked|missing`; no numeric trust score.

- [ ] **Step 1: Write exact RED Verified formula tests**

```ts
const input = {
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
expect(deriveFoodTrustProfile(input).verified).toBe(true);
```

Independently make lifecycle non-active, identity non-verified, nutrition non-verified, activation false, or blocker count positive; each produces false. Serving missing remains compatible with Verified. Completeness does not mutate verification semantics.

- [ ] **Step 2: Prove RED**

```bash
npx vitest run --config vitest.unit.config.mjs lib/food-catalog/domain/trust.test.ts
```

- [ ] **Step 3: Implement, prove GREEN, commit**

No DB access. Missing nutrients are not rewritten by trust logic.

```bash
git add lib/food-catalog/domain/trust.ts lib/food-catalog/domain/trust.test.ts
git commit -m "feat(food-catalog): derive structured trust profiles"
```

---

### Task 9: Exact current-generation read/hydration and compatibility bridge

**Files:**
- Create: `services/food-catalog/server/current-generation-service.ts`
- Create: `services/food-catalog/server/current-generation-service.test.ts`
- Modify: `services/food-catalog/server/index.ts`

**Interfaces:**
- `getCurrentGenerationFood(readStore,requestedFoodId)` returns current view including lifecycle/trust.
- `resolveCurrentGenerationFoodForNewUse(readStore,requestedFoodId)` requires the resulting survivor lifecycle `active`.
- `projectCurrentGenerationCompatibility(view,{nameFactId,servingOptionId})` accepts only IDs selected in the current generation.

- [ ] **Step 1: Write RED tests**

Prove:
1. null current pointer throws `NO_CURRENT_GENERATION` and never falls back to legacy/raw facts;
2. pointer must contain non-null current generation, current event and **current validation report** together;
3. direct current Food uses exact generation row;
4. old merged ID resolves one direct generation redirect to active target;
5. malformed chain/non-active target rejects;
6. exact selected facts only are hydrated;
7. newer unselected revisions/assertions cannot influence result;
8. zero remains zero and null remains null;
9. selected revoked assertion yields unverified component;
10. serving verification missing does not alone prevent Verified;
11. Trust uses pointer `currentValidationReportId`, so a rollback state does not incorrectly assume `currentEventId` is a promotion event;
12. compatibility bridge rejects name/serving IDs outside selected sets;
13. direct deprecated/withdrawn row may be represented in diagnostic current view but `resolveCurrentGenerationFoodForNewUse` rejects it.

- [ ] **Step 2: Prove RED**

```bash
npx vitest run --config vitest.unit.config.mjs \
  services/food-catalog/server/current-generation-service.test.ts \
  services/food-catalog/server/compatibility-projection.test.ts
```

Plan 2 projector must remain GREEN while new tests are RED.

- [ ] **Step 3: Implement exact flow**

```text
read singleton pointer
  → require current generation/event/validation report IDs
  → direct generation Food or exact redirect
  → require redirect target active/non-redirect
  → load exact selected IDs
  → hydrate exact facts
  → verify same-Food identity
  → load exact pointer-bound validation report/findings
  → derive TrustProfile
  → optional Plan 2 compatibility projection
```

Do not call `getFoodCatalogDomainBundle()` to choose current facts.

- [ ] **Step 4: Export safe services only, prove GREEN, commit**

Do not export raw Supabase generation adapters or clients.

```bash
git add services/food-catalog/server/current-generation-service.ts \
  services/food-catalog/server/current-generation-service.test.ts \
  services/food-catalog/server/index.ts
git commit -m "feat(food-catalog): read exact current generation facts"
```

---

### Task 10: Typed promotion, rollback, and revocation command services

**Files:**
- Create: `services/food-catalog/server/generation-command-service.ts`
- Create: `services/food-catalog/server/generation-command-service.test.ts`

**Interfaces:**
- `promoteCatalogGeneration`.
- `rollbackCatalogGeneration`.
- `revokeCatalogGeneration`.

- [ ] **Step 1: Write RED semantic-input tests**

Promotion requires exact generation UUID/checksum, explicit expected-current `string|null`, exact validation report ID/checksum, operation UUID and nonblank actor context.

Rollback requires exact current ID, target generation ID/checksum, **target prior promotion event ID**, **target validation report ID/checksum**, operation ID and actor. No `previous=true`, ordinal, or timestamp target is accepted.

Revoke requires exact generation ID/checksum and actor.

- [ ] **Step 2: Prove RED**

```bash
npx vitest run --config vitest.unit.config.mjs services/food-catalog/server/generation-command-service.test.ts
```

- [ ] **Step 3: Implement deterministic command checksums**

Operation ID itself is excluded from semantic command checksum. Promotion checksum payload is:

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

Rollback adds target promotion event/report evidence. Each service calls exactly one atomic command-store method; no pointer mutation occurs in TypeScript.

- [ ] **Step 4: Prove GREEN and commit**

```bash
git add services/food-catalog/server/generation-command-service.ts \
  services/food-catalog/server/generation-command-service.test.ts
git commit -m "feat(food-catalog): add generation transition commands"
```

---

### Task 11: Physical-table, privileged-command, and no-implicit-current boundaries

**Files:**
- Create: `lib/product/food-catalog-generation-authority-boundary.test.ts`
- Modify: `lib/product/food-catalog-v2-service-boundary.test.ts`
- Modify: `services/food-catalog/server/index.ts`

- [ ] **Step 1: Write RED physical-table guard**

Extend the table regex for all Plan 3 tables. The only production TypeScript file allowed direct `.from("food_catalog_...")` reads is:

```ts
new Set([
  "services/food-catalog/server/supabase-generation-read-store.ts",
]);
```

`supabase-generation-command-store.ts` uses RPC only and is not direct-table allowlisted. Raw adapter imports remain inside `services/food-catalog/server/**`.

- [ ] **Step 2: Add no-implicit-current guard**

Scan current-authority modules for forbidden selection patterns:

```ts
/\.order\(\s*["'](?:created_at|sealed_at|revision_number|generation_ordinal)["'][\s\S]{0,120}ascending\s*:\s*false/
/Math\.max\s*\(/
/MAX\s*\(/i
/latest(?:Generation|Nutrition|Name|Serving|Assertion)/
```

Also inspect the Plan 3 migration text and reject `ORDER BY ... DESC LIMIT 1` inside promotion/rollback current/report/target selection logic. Deterministic sorting of already-selected IDs for checksum generation is allowed.

- [ ] **Step 3: Guard public exports and member surfaces**

Assert `services/food-catalog/server/index.ts` does not export Supabase generation adapter constructors, raw RPC constants, `SupabaseClient`, or service-role constructors. Scan browser/app API/member MCP production code for Plan 3 RPC names and require zero matches.

- [ ] **Step 4: Prove GREEN and commit**

```bash
npx vitest run --config vitest.unit.config.mjs \
  lib/product/food-catalog-v2-service-boundary.test.ts \
  lib/product/food-catalog-generation-authority-boundary.test.ts
```

```bash
git add lib/product/food-catalog-v2-service-boundary.test.ts \
  lib/product/food-catalog-generation-authority-boundary.test.ts \
  services/food-catalog/server/index.ts
git commit -m "test(food-catalog): enforce Plan 3 authority boundaries"
```

---

### Task 12: Full regression, exact-head phase close, documentation reconciliation, STOP

**Files:**
- Modify: `docs/superpowers/specs/2026-09-02-food-catalog-plan3-activation-verification-generations-design.md`
- Modify: `docs/superpowers/plans/2026-09-01-food-catalog-intelligence-program-roadmap.md`
- Modify: `docs/superpowers/plans/food-catalog-intelligence-master-continuity.md`
- Review only: `config/release-compatibility.json`

- [ ] **Step 1: Focused Plan 3 suite**

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

- [ ] **Step 2: Disposable database suite**

```bash
node scripts/replay-local-migration-chain.mjs --prove-future-order
PLAIVRA_LOCAL_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  node scripts/run-database-verification.mjs
supabase db lint --local --schema public --level error --fail-on error
```

Expected: PASS, verifier fixtures rolled back.

- [ ] **Step 3: Repository quality suite**

```bash
npm run typecheck
npm run lint
npm run test:scripts
npm run migration:ledger:check
npm run test:unit
npm run build
```

Expected: PASS. Ledger remains valid while truthfully `pending=1`; do not falsify release readiness.

- [ ] **Step 4: Diff-scope proof using the recorded base**

```bash
git diff --name-only "$PLAN3_BASE_SHA"...HEAD
git diff "$PLAN3_BASE_SHA"...HEAD -- config/release-compatibility.json
git diff "$PLAN3_BASE_SHA"...HEAD -- supabase/migrations/20260901153000_food_catalog_intelligence_core.sql
git diff "$PLAN3_BASE_SHA"...HEAD -- supabase/migrations/20260901174500_food_catalog_plan1_semantic_corrections.sql
```

Expected: compatibility diff empty; Plan 1 migration diffs empty; exactly one new Plan 3 migration; ledger/docs only classify it pending; no Food seed/population, Plan 4, or Activity Catalog changes.

- [ ] **Step 5: Reconcile docs only after evidence passes**

Spec status: `implementation complete on review branch; Planner QA/QC pending`.

Roadmap + continuity record exact branch, PR, base SHA, final head SHA, migration filename, CI run IDs, pending repository migration, and all side-effect NO gates.

- [ ] **Step 6: Require exact-head PR Quality and canonical phase-close Quality**

Keep Draft during implementation review. Before final Planner approval, transition Ready and require `.github/workflows/quality.yml` on exact final head. It must pass full migration replay, DB lint, registered Plan 3 verifier, migration ledger, lint, typecheck, full unit/integration/script suites, build, release metadata and rendered QA.

If the GitHub connector cannot mark Ready due the known GraphQL defect, report exactly:

`Manual Ready-for-review transition required for Plan 3 phase-close Quality.`

Do not waive the gate.

- [ ] **Step 7: Exact handoff and STOP**

```text
Branch:
PR:
Implementation base SHA:
Exact final head SHA:
Changed files:
New migration: 20260902150000_food_catalog_generation_authority.sql
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

- [ ] **Step 8: Commit documentation handoff**

```bash
git add docs/superpowers/specs/2026-09-02-food-catalog-plan3-activation-verification-generations-design.md \
  docs/superpowers/plans/2026-09-01-food-catalog-intelligence-program-roadmap.md \
  docs/superpowers/plans/food-catalog-intelligence-master-continuity.md
git commit -m "docs(food-catalog): record Plan 3 implementation handoff"
```

Do not merge. Stop for Planner QA/QC.

---

## Plan 3 Exit Criteria

Implementation is complete but not merge-approved only when all are true:

1. One unapplied forward Plan 3 migration defines normalized immutable activation/generation/validation/audit authority plus nullable singleton pointer.
2. Repository migration is truthfully classified `pending`; no Production identity is invented.
3. Plan 1 migration bytes remain unchanged.
4. Verification assertion forks/non-head supersession are DB-rejected.
5. Active generation Foods require exact activation set/member/grant authority.
6. Generation composition and validation reports are immutable/deterministic-checksummed.
7. Current reads use only singleton pointer + exact generation-selected IDs.
8. Current pointer binds exact current generation, transition event, and validation report, including after rollback.
9. No latest/max/timestamp/order heuristic is current authority.
10. Redirects are flattened to active survivor.
11. Trust Profile is structured; Verified rule matches spec; serving verification is not mandatory.
12. Promotion/rollback are atomic with expected-current CAS, exact checksum/report evidence, audit event and race-safe operation-id idempotency.
13. Revoked generation cannot be promote/rollback target; current must rollback before revoke.
14. No member/browser/MCP privileged Plan 3 mutation path exists.
15. `anon`/`authenticated` have no direct CRUD/execute authority for Plan 3 control plane.
16. Empty/bootstrap state has no fake generation.
17. Legacy member runtime is unchanged.
18. Compatibility marker is unchanged.
19. Production apply/population/ingestion/activation/promotion/deployment/Activity Catalog mutation/Plan 4 are all NO.
20. Focused tests, full unit, migration replay/verifier, DB lint, lint, typecheck, scripts, ledger check, build and canonical exact-head Quality pass.
21. Independent Planner QA/QC explicitly approves merge on exact final head.

## Post-Merge / Production Boundary

Squash-merging Plan 3 code does **not** authorize Production apply of `20260902150000_food_catalog_generation_authority.sql`.

After merge, the separate sequence is:

1. verify `main` contains the exact approved tree;
2. read Production migration history and Food state;
3. obtain explicit approval naming the exact Plan 3 migration/head;
4. apply schema exactly once;
5. reconcile ledger to generated Production identity;
6. verify RLS/privileges and `current_generation_id/current_event_id/current_validation_report_id` remain null, with zero Food/generation population;
7. stop again — schema apply still does not authorize activation/promotion;
8. only after Plan 3 schema health is independently verified may Plan 3 close and Plan 4 planning begin.
