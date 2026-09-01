# Food Catalog Domain Service V2 + Compatibility Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the server-only Food Catalog V2 read/persistence boundary over the Plan 1 canonical model, move global Food persistence ownership out of Nutrition V1, and prove explicitly selected V2 facts can project into the current Nutrition compatibility contract without inventing current-generation authority.

**Architecture:** Create an independent `services/food-catalog/server` domain service with Supabase-independent store ports and internal Supabase adapters. The V2 read service returns raw canonical-domain facts plus flattened canonical-root resolution; it does **not** select current nutrition/name/serving/trust facts before Plan 3 introduces Catalog Generations. A pure compatibility projector accepts explicitly selected V2 facts and an externally supplied compatibility trust projection. Existing Nutrition/MCP runtime behavior stays on a relocated legacy adapter behind a thin Nutrition façade, so Plan 2 establishes the boundary without a member runtime V2 cutover.

**Tech Stack:** TypeScript 5.9, Vitest 4, Supabase JS 2.x, Next.js 16 server-only modules, PostgreSQL/Supabase schema introduced by Plan 1.

**Spec:** `docs/superpowers/specs/2026-09-01-food-catalog-intelligence-architecture-design.md`

## Global Constraints

- Existing implementation is migration input, not target-architecture authority.
- Preserve stable Plaivra Food IDs, historical frozen snapshots, My Foods isolation, nullable nutrition semantics, and the Food Catalog logical service boundary.
- `public.food_items.id` remains the compatibility/canonical identity anchor during this plan; flat root name/nutrition/serving/category/cuisine/verification/market fields are not V2 authority.
- Plan 2 requires **no database migration**. If implementation discovers a genuinely necessary schema/invariant change, stop and return to the Planner before adding any migration.
- Do not rewrite applied migrations, mutate Production, populate Food data, ingest a provider dataset, activate Foods, promote Catalog Generations, deploy the app, or promote the released compatibility marker.
- Do not start Plan 3 behavior. In particular, do not select “current promoted” facts via `MAX(revision_number)`, latest timestamp, insertion order, or any other implicit rule.
- Do not derive final user-facing `Verified` in Plan 2. The compatibility projector receives an explicit `{ verified: boolean }`; Plan 3 owns assertion supersession, trust derivation, activation, and generation semantics.
- Do not migrate Food Library search. Search projection/backend work remains Plan 5.
- Do not replace current privileged curation/admin authority. That remains Plan 6.
- Do not construct or export service-role credentials. Supabase adapters accept an injected server-side `SupabaseClient`.
- V2 canonical tables may be queried or mutated directly only inside dedicated Food Catalog Supabase persistence adapters.
- Legacy `food_items` runtime reads move under the Food Catalog service boundary. `services/nutrition-v1/server/food-curation.ts` remains the temporary privileged direct-write exception until Plan 6.
- Unknown nutrient values remain `null`; explicit zero remains `0`.
- No generic household conversion or density assumption may be introduced.
- Current Nutrition/MCP runtime behavior remains unchanged except in tests that directly exercise the new V2 service/projection.
- The implementation branch must start from the authoritative `main` containing Plan 1. Record the exact base SHA before code changes.

---

## File Structure

### New Food Catalog server domain

- `services/food-catalog/server/contracts.ts` — V2 root/stored-fact/read-bundle types plus the existing Nutrition compatibility shape now owned by Food Catalog.
- `services/food-catalog/server/store.ts` — Supabase-independent read/write ports.
- `services/food-catalog/server/supabase-read-store.ts` — direct V2 canonical-table reads and strict row mapping.
- `services/food-catalog/server/supabase-write-store.ts` — validated append-only immutable-fact writes.
- `services/food-catalog/server/read-service.ts` — flattened canonical-root resolution and raw bundle orchestration.
- `services/food-catalog/server/compatibility-projection.ts` — pure explicit-fact compatibility projection and evidence-safe serving scaling.
- `services/food-catalog/server/legacy-compatibility.ts` — relocated current runtime `food_items` implementation; transitional only.
- `services/food-catalog/server/index.ts` — explicit domain-safe exports; raw Supabase adapters are not exported.

### New tests

- `services/food-catalog/server/contracts.test.ts`
- `services/food-catalog/server/supabase-read-store.test.ts`
- `services/food-catalog/server/supabase-write-store.test.ts`
- `services/food-catalog/server/read-service.test.ts`
- `services/food-catalog/server/compatibility-projection.test.ts`
- `lib/product/food-catalog-v2-service-boundary.test.ts`

### Existing files modified

- `lib/food-catalog/domain/taxonomy.ts`
- `lib/food-catalog/domain/taxonomy.test.ts`
- `lib/food-catalog/domain/markets.ts`
- `lib/food-catalog/domain/markets.test.ts`
- `lib/food-catalog/domain/verification.ts`
- `lib/food-catalog/domain/verification.test.ts`
- `services/nutrition-v1/server/food-catalog.ts`
- `services/nutrition-v1/server/food-catalog.test.ts`
- `lib/product/nutrition-v1-food-catalog-boundary.test.ts`
- `docs/superpowers/plans/2026-09-01-food-catalog-intelligence-program-roadmap.md`

---

### Task 1: Own the server contract in Food Catalog and complete append-fact validators

**Files:**
- Create: `services/food-catalog/server/contracts.ts`
- Create: `services/food-catalog/server/contracts.test.ts`
- Modify: `lib/food-catalog/domain/taxonomy.ts`
- Modify: `lib/food-catalog/domain/taxonomy.test.ts`
- Modify: `lib/food-catalog/domain/markets.ts`
- Modify: `lib/food-catalog/domain/markets.test.ts`
- Modify: `lib/food-catalog/domain/verification.ts`
- Modify: `lib/food-catalog/domain/verification.test.ts`

**Interfaces:**
- Produces `FoodCatalogLifecycle`, `FoodCatalogRootRecord`, stored-fact types, `FoodCatalogDomainBundle`, `CatalogFoodNutrition`, and `ResolvedCatalogFood`.
- Produces validated `FoodTaxonomyAssignment`, `FoodMarketAssignment`, and `validateFoodVerificationAssertion` for the write adapter.
- Produces raw facts only; no selected/current fields.

- [ ] **Step 1: Write failing contract and validator tests**

Create `contracts.test.ts` with at least:

```ts
import { describe, expect, it } from "vitest";
import type {
  CatalogFoodNutrition,
  FoodCatalogDomainBundle,
  FoodCatalogRootRecord,
  ResolvedCatalogFood,
} from "@/services/food-catalog/server/contracts";

describe("Food Catalog V2 server contracts", () => {
  it("keeps root identity separate from flat Food authority", () => {
    const root: FoodCatalogRootRecord = {
      id: "22222222-2222-4222-8222-222222222222",
      lifecycleStatus: "active",
      mergedIntoFoodId: null,
    };
    expect(root).not.toHaveProperty("food_name");
    expect(root).not.toHaveProperty("calories");
  });

  it("preserves explicit zero separately from unknown null", () => {
    const nutrition: CatalogFoodNutrition = {
      calories: 0,
      protein_g: null,
      carbs_g: 0,
      fat_g: null,
      saturated_fat_g: null,
      fiber_g: null,
      sugars_g: null,
      sodium_mg: null,
      basis_amount: 100,
      basis_unit: "g",
    };
    const value: ResolvedCatalogFood = {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Test Food",
      servingLabel: "100 g",
      nutrition,
      verified: false,
    };
    expect(value.nutrition.calories).toBe(0);
    expect(value.nutrition.protein_g).toBeNull();
  });

  it("does not put implicit selected/current authority on the raw bundle", () => {
    const bundle = {} as FoodCatalogDomainBundle;
    expect("selectedNutrition" in bundle).toBe(false);
    expect("currentName" in bundle).toBe(false);
    expect("verified" in bundle).toBe(false);
  });
});
```

Extend domain tests so invalid taxonomy/market/verification append values fail. Verification tests must cover runtime enum rejection, not only TypeScript types:

```ts
expect(() => validateFoodVerificationAssertion({
  foodId: "food-1",
  scope: "not-a-scope" as never,
  state: "verified",
  policyVersion: "verify-v1",
  sourceRecordId: null,
  supersedesAssertionId: null,
  reasonCode: "source_review",
  authorityReference: "planner:test",
})).toThrow(/scope/i);

expect(() => validateFoodVerificationAssertion({
  foodId: "food-1",
  scope: "nutrition",
  state: "not-a-state" as never,
  policyVersion: "verify-v1",
  sourceRecordId: null,
  supersedesAssertionId: null,
  reasonCode: "source_review",
  authorityReference: "planner:test",
})).toThrow(/state/i);
```

Also test blank `foodId`, `policyVersion`, `reasonCode`, and `authorityReference`.

- [ ] **Step 2: Run tests and prove RED**

```bash
npx vitest run --config vitest.unit.config.mjs \
  services/food-catalog/server/contracts.test.ts \
  lib/food-catalog/domain/taxonomy.test.ts \
  lib/food-catalog/domain/markets.test.ts \
  lib/food-catalog/domain/verification.test.ts
```

Expected: FAIL because the server contracts and append validators are not implemented.

- [ ] **Step 3: Add exact server types**

Create `contracts.ts` with `import "server-only";` and the following public shapes:

```ts
export type FoodCatalogLifecycle = "draft" | "active" | "deprecated" | "withdrawn" | "merged";

export type FoodCatalogRootRecord = {
  id: string;
  lifecycleStatus: FoodCatalogLifecycle;
  mergedIntoFoodId: string | null;
};

export type StoredFoodNutritionRevision = FoodNutritionRevision & { id: string; createdAt: string };
export type StoredFoodServingOption = FoodServingOption & { id: string; createdAt: string };
export type StoredFoodNameFact = FoodNameFact & { id: string; createdAt: string };
export type StoredFoodTaxonomyAssignment = FoodTaxonomyAssignment & { id: string; createdAt: string };
export type StoredFoodMarketAssignment = FoodMarketAssignment & { id: string; createdAt: string };
export type StoredFoodVerificationAssertion = FoodVerificationAssertion & { id: string; createdAt: string };
export type StoredFoodMergeEvent = FoodMergeEvent & { id: string; createdAt: string };

export type FoodCatalogDomainBundle = {
  requestedFoodId: string;
  root: FoodCatalogRootRecord;
  nutritionRevisions: StoredFoodNutritionRevision[];
  servingOptions: StoredFoodServingOption[];
  names: StoredFoodNameFact[];
  taxonomyAssignments: StoredFoodTaxonomyAssignment[];
  marketAssignments: StoredFoodMarketAssignment[];
  verificationAssertions: StoredFoodVerificationAssertion[];
  mergeEvents: StoredFoodMergeEvent[];
};

export type CatalogFoodNutrition = {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  saturated_fat_g: number | null;
  fiber_g: number | null;
  sugars_g: number | null;
  sodium_mg: number | null;
  basis_amount: number | null;
  basis_unit: "g" | "ml" | "serving" | "piece" | "custom" | null;
};

export type ResolvedCatalogFood = {
  id: string;
  name: string;
  servingLabel: string;
  nutrition: CatalogFoodNutrition;
  verified: boolean;
};
```

Import the Plan 1 fact types with type-only imports.

- [ ] **Step 4: Add exact append contracts and validators**

Extend `taxonomy.ts`:

```ts
export type FoodTaxonomyAssignment = {
  foodId: string;
  nodeCode: string;
  sourceRecordId: string | null;
  action: FoodTaxonomyAssignmentAction;
  policyVersion: string;
};

export function validateFoodTaxonomyAssignment(value: FoodTaxonomyAssignment) {
  if (!value.foodId.trim()) throw new Error("Food taxonomy assignment food ID must be nonblank.");
  if (!value.nodeCode.trim()) throw new Error("Food taxonomy assignment node code must be nonblank.");
  if (value.action !== "assign" && value.action !== "remove") throw new Error("Food taxonomy assignment action is invalid.");
  if (!value.policyVersion.trim()) throw new Error("Food taxonomy assignment policy version must be nonblank.");
  return value;
}
```

Extend `markets.ts`:

```ts
export type FoodMarketAssignment = {
  foodId: string;
  scopeCode: string;
  relevance: FoodMarketRelevance;
  sourceRecordId: string | null;
  action: FoodMarketAssignmentAction;
  policyVersion: string;
};

export function validateFoodMarketAssignment(value: FoodMarketAssignment) {
  if (!value.foodId.trim()) throw new Error("Food market assignment food ID must be nonblank.");
  if (!value.scopeCode.trim()) throw new Error("Food market assignment scope code must be nonblank.");
  if (value.relevance !== "primary" && value.relevance !== "secondary") throw new Error("Food market relevance is invalid.");
  if (value.action !== "assign" && value.action !== "remove") throw new Error("Food market assignment action is invalid.");
  if (!value.policyVersion.trim()) throw new Error("Food market assignment policy version must be nonblank.");
  return value;
}
```

Extend `verification.ts`:

```ts
const VERIFICATION_SCOPES = new Set<FoodVerificationScope>([
  "identity", "nutrition", "serving", "barcode", "localization",
]);
const VERIFICATION_STATES = new Set<FoodVerificationState>(["verified", "revoked"]);

export function validateFoodVerificationAssertion(value: FoodVerificationAssertion) {
  if (!value.foodId.trim()) throw new Error("Food verification food ID must be nonblank.");
  if (!VERIFICATION_SCOPES.has(value.scope)) throw new Error("Food verification scope is invalid.");
  if (!VERIFICATION_STATES.has(value.state)) throw new Error("Food verification state is invalid.");
  if (!value.policyVersion.trim()) throw new Error("Food verification policy version must be nonblank.");
  if (!value.reasonCode.trim()) throw new Error("Food verification reason code must be nonblank.");
  if (!value.authorityReference.trim()) throw new Error("Food verification authority reference must be nonblank.");
  return value;
}
```

Do not derive Trust/Verified here.

- [ ] **Step 5: Run focused tests and prove GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add services/food-catalog/server/contracts.ts services/food-catalog/server/contracts.test.ts \
  lib/food-catalog/domain/taxonomy.ts lib/food-catalog/domain/taxonomy.test.ts \
  lib/food-catalog/domain/markets.ts lib/food-catalog/domain/markets.test.ts \
  lib/food-catalog/domain/verification.ts lib/food-catalog/domain/verification.test.ts
git commit -m "feat(food-catalog): define V2 service contracts"
```

---

### Task 2: Create Supabase-independent store ports and the strict V2 read adapter

**Files:**
- Create: `services/food-catalog/server/store.ts`
- Create: `services/food-catalog/server/supabase-read-store.ts`
- Create: `services/food-catalog/server/supabase-read-store.test.ts`

**Interfaces:**
- Produces `FoodCatalogReadStore`, `FoodCatalogWriteStore`, and `createSupabaseFoodCatalogReadStore(supabase)`.
- Root read is limited to compatibility identity/lifecycle fields.
- Returns raw arrays; does not choose current/promoted facts.
- `readMergeEvents(foodId)` returns events where the Food is either source **or** target.

- [ ] **Step 1: Write failing read-store tests**

Required tests must prove:

```ts
expect(queries.food_items[0].select).toHaveBeenCalledWith("id,lifecycle_status,merged_into_food_id");
```

and:

```ts
expect(await store.readNutritionRevisions(FOOD_ID)).toEqual([
  expect.objectContaining({ calories: 0, protein_g: null, basisAmount: 100, basisUnit: "g" }),
]);
```

Also test invalid lifecycle/negative persisted nutrient failure and exact merge-event query semantics:

```ts
expect(queries.food_merge_events[0].or).toHaveBeenCalledWith(
  `source_food_id.eq.${FOOD_ID},target_food_id.eq.${FOOD_ID}`,
);
```

- [ ] **Step 2: Run test and prove RED**

```bash
npx vitest run --config vitest.unit.config.mjs services/food-catalog/server/supabase-read-store.test.ts
```

Expected: FAIL because ports/adapter do not exist.

- [ ] **Step 3: Define the store ports**

Create `store.ts` with `import "server-only";`:

```ts
export interface FoodCatalogReadStore {
  readRoot(foodId: string): Promise<FoodCatalogRootRecord | null>;
  readNutritionRevisions(foodId: string): Promise<StoredFoodNutritionRevision[]>;
  readServingOptions(foodId: string): Promise<StoredFoodServingOption[]>;
  readNames(foodId: string): Promise<StoredFoodNameFact[]>;
  readTaxonomyAssignments(foodId: string): Promise<StoredFoodTaxonomyAssignment[]>;
  readMarketAssignments(foodId: string): Promise<StoredFoodMarketAssignment[]>;
  readVerificationAssertions(foodId: string): Promise<StoredFoodVerificationAssertion[]>;
  readMergeEvents(foodId: string): Promise<StoredFoodMergeEvent[]>;
}

export interface FoodCatalogWriteStore {
  appendNutritionRevision(value: FoodNutritionRevision): Promise<void>;
  appendServingOption(value: FoodServingOption): Promise<void>;
  appendName(value: FoodNameFact): Promise<void>;
  appendTaxonomyAssignment(value: FoodTaxonomyAssignment): Promise<void>;
  appendMarketAssignment(value: FoodMarketAssignment): Promise<void>;
  appendVerificationAssertion(value: FoodVerificationAssertion): Promise<void>;
  appendMergeEvent(value: FoodMergeEvent): Promise<void>;
}
```

Use type-only imports from Task 1 and `lib/food-catalog/domain/*`.

- [ ] **Step 4: Implement strict row mapping in `supabase-read-store.ts`**

Export:

```ts
export function createSupabaseFoodCatalogReadStore(
  supabase: SupabaseClient,
): FoodCatalogReadStore
```

Direct tables owned here:

```text
food_items
food_nutrition_revisions
food_serving_options
food_names
food_taxonomy_assignments
food_market_assignments
food_verification_assertions
food_merge_events
```

Root select is exactly:

```text
id,lifecycle_status,merged_into_food_id
```

V2 selects must include all fields needed by Task 1 contracts plus `id,created_at`. Use existing domain validators for nutrition, serving, names, taxonomy, market, verification, and merge facts. A malformed persisted value must throw `Food Catalog V2 read: ...`; do not silently coerce an invalid numeric/enum to `null`.

Ordering is deterministic transport order only:

- nutrition: `revision_number` ascending;
- serving/name/taxonomy/market/verification: `created_at` ascending, then `id` ascending;
- merge events: source-or-target `.or(...)`, `created_at` ascending, then `id` ascending.

Do not interpret the last row as current.

- [ ] **Step 5: Run read-store tests and prove GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add services/food-catalog/server/store.ts \
  services/food-catalog/server/supabase-read-store.ts \
  services/food-catalog/server/supabase-read-store.test.ts
git commit -m "feat(food-catalog): add V2 read persistence adapter"
```

---

### Task 3: Add the append-only validated Supabase write adapter

**Files:**
- Create: `services/food-catalog/server/supabase-write-store.ts`
- Create: `services/food-catalog/server/supabase-write-store.test.ts`

**Interfaces:**
- Implements `FoodCatalogWriteStore`.
- Writes only immutable Plan 1 fact tables.
- Has no root create/update/delete, activation, generation, or curation decision API.

- [ ] **Step 1: Write failing append-only tests**

Prove validation occurs before DB access:

```ts
const from = vi.fn();
const store = createSupabaseFoodCatalogWriteStore({ from } as unknown as SupabaseClient);
await expect(store.appendNutritionRevision({
  foodId: FOOD_ID,
  revisionNumber: 1,
  calories: -1,
  protein_g: null,
  carbs_g: null,
  fat_g: null,
  saturated_fat_g: null,
  fiber_g: null,
  sugars_g: null,
  sodium_mg: null,
  basisAmount: 100,
  basisUnit: "g",
  nutrientMappingVersion: "test-v1",
  sourceRecordId: null,
})).rejects.toThrow(/non-negative/i);
expect(from).not.toHaveBeenCalled();
```

Also test source-less `cup` serving rejection before DB access, and cover all seven append methods. Query doubles must prove `.insert(...)` only; `.update`, `.delete`, and `.upsert` are forbidden.

- [ ] **Step 2: Run test and prove RED**

```bash
npx vitest run --config vitest.unit.config.mjs services/food-catalog/server/supabase-write-store.test.ts
```

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement the append-only adapter**

Create with `import "server-only";` and:

```ts
export function createSupabaseFoodCatalogWriteStore(
  supabase: SupabaseClient,
): FoodCatalogWriteStore
```

Each method must validate, map camelCase to exact Plan 1 snake_case, call `.insert(...)` on one target table, and throw on DB error.

Example nutrition payload:

```ts
{
  food_id: value.foodId,
  revision_number: value.revisionNumber,
  calories: value.calories,
  protein_g: value.protein_g,
  carbs_g: value.carbs_g,
  fat_g: value.fat_g,
  saturated_fat_g: value.saturated_fat_g,
  fiber_g: value.fiber_g,
  sugars_g: value.sugars_g,
  sodium_mg: value.sodium_mg,
  basis_amount: value.basisAmount,
  basis_unit: value.basisUnit,
  nutrient_mapping_version: value.nutrientMappingVersion,
  source_record_id: value.sourceRecordId,
}
```

Use exact corresponding fields for serving/name/taxonomy/market/verification/merge. Do not add writes to `food_items`.

- [ ] **Step 4: Run tests and prove GREEN**

Run Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add services/food-catalog/server/supabase-write-store.ts \
  services/food-catalog/server/supabase-write-store.test.ts
git commit -m "feat(food-catalog): add append-only V2 persistence"
```

---

### Task 4: Implement flattened canonical-root resolution and raw V2 bundle reads

**Files:**
- Create: `services/food-catalog/server/read-service.ts`
- Create: `services/food-catalog/server/read-service.test.ts`

**Interfaces:**
- Consumes `FoodCatalogReadStore`.
- Produces `resolveCanonicalRootForNewUse(store, foodId)` and `getFoodCatalogDomainBundle(store, foodId)`.
- Resolves one flattened compatibility redirect only; arbitrary chain walking is rejected.

- [ ] **Step 1: Write failing resolution tests**

Cover active root, one-hop merged root, a non-flattened `A -> B -> C` chain, missing target, and `draft/deprecated/withdrawn` rejection.

The chain test must expect `/flattened/i`.

Add a bundle test proving every fact reader receives the resolved survivor ID and `requestedFoodId` remains the original ID.

- [ ] **Step 2: Run and prove RED**

```bash
npx vitest run --config vitest.unit.config.mjs services/food-catalog/server/read-service.test.ts
```

- [ ] **Step 3: Implement canonical-root resolution**

Use `isUuid` before persistence reads. Core logic:

```ts
const root = await store.readRoot(foodId);
if (!root) throw new Error("Food is unavailable.");
if (root.lifecycleStatus === "active" && root.mergedIntoFoodId === null) return root;
if (root.lifecycleStatus !== "merged" || !root.mergedIntoFoodId) {
  throw new Error("Food is unavailable for new Nutrition writes.");
}
const survivor = await store.readRoot(root.mergedIntoFoodId);
if (!survivor || survivor.lifecycleStatus !== "active" || survivor.mergedIntoFoodId !== null) {
  throw new Error("Food merge redirect is not flattened to a current active survivor.");
}
return survivor;
```

- [ ] **Step 4: Implement raw bundle orchestration**

After resolving the root, use one `Promise.all` to read all seven fact collections for `root.id`. Return raw arrays unchanged.

Forbidden in this task:

```text
.at(-1)
MAX(revision_number)
latest-created-at winner
preferred-name winner
default-serving winner
verification/trust winner
```

- [ ] **Step 5: Run and prove GREEN**

Run Step 2 command. Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add services/food-catalog/server/read-service.ts services/food-catalog/server/read-service.test.ts
git commit -m "feat(food-catalog): add V2 canonical read service"
```

---

### Task 5: Build the pure explicit-fact compatibility projection

**Files:**
- Create: `services/food-catalog/server/compatibility-projection.ts`
- Create: `services/food-catalog/server/compatibility-projection.test.ts`

**Interfaces:**
- Accepts root + explicit name + explicit nutrition revision + optional explicit serving + explicit trust projection.
- Does not receive a full bundle and does not decide what is current.
- Produces `ResolvedCatalogFood`.

- [ ] **Step 1: Write failing projection tests**

Use this input contract:

```ts
export type FoodCatalogCompatibilitySelection = {
  root: FoodCatalogRootRecord;
  selectedName: StoredFoodNameFact;
  selectedNutrition: StoredFoodNutritionRevision;
  selectedServing: StoredFoodServingOption | null;
  trust: { verified: boolean };
};
```

Required cases:

1. 100 g nutrition preserves `calories=0` and `protein_g=null`.
2. g-based nutrition + source-backed household serving (`1 cup`, `gramWeight=240`) scales 10 g protein/100 g to 24 g.
3. g-based nutrition + `ml` serving rejects density conversion.
4. ml-based nutrition + `ml` serving scales by volume.
5. ml-based nutrition + household/g serving rejects unapproved density/mass conversion.
6. any selected name/nutrition/serving with another `foodId` rejects.

- [ ] **Step 2: Run and prove RED**

```bash
npx vitest run --config vitest.unit.config.mjs services/food-catalog/server/compatibility-projection.test.ts
```

- [ ] **Step 3: Implement identity checks and evidence-safe scaling**

Rules:

```text
no selected serving:
  use nutrition basis amount/unit and factor 1

g nutrition + g serving:
  factor = serving.amount / nutrition.basisAmount

g nutrition + non-g/non-ml household serving:
  require selectedServing.gramWeight and selectedServing.sourceRecordId
  factor = gramWeight / nutrition.basisAmount
  compatibility basis = 1 serving

g nutrition + ml serving:
  reject; no density authority

ml nutrition + ml serving:
  factor = serving.amount / nutrition.basisAmount

ml nutrition + any non-ml serving:
  reject; no density/mass authority
```

Scale a known nutrient with:

```ts
value === null ? null : Math.round(value * factor * 1000) / 1000
```

Exact zero therefore remains zero.

- [ ] **Step 4: Return the exact compatibility shape**

Set `id`, `name`, `servingLabel`, nullable nutrition, and `verified: input.trust.verified`. Do not inspect verification assertions in this projector.

- [ ] **Step 5: Run and prove GREEN**

Run Step 2 command. Expected: PASS.

- [ ] **Step 6: Commit Task 5**

```bash
git add services/food-catalog/server/compatibility-projection.ts \
  services/food-catalog/server/compatibility-projection.test.ts
git commit -m "feat(food-catalog): add V2 compatibility projection"
```

---

### Task 6: Relocate current runtime physical reads and make Nutrition V1 a façade

**Files:**
- Create: `services/food-catalog/server/legacy-compatibility.ts`
- Create: `services/food-catalog/server/index.ts`
- Modify: `services/nutrition-v1/server/food-catalog.ts`
- Modify: `services/nutrition-v1/server/food-catalog.test.ts`

**Interfaces:**
- Existing current-consumer exports stay unchanged: `resolveCatalogFood`, `getCatalogVerificationStates`, `searchCatalogFoodsByName`, `findCatalogDuplicateByName`, `CatalogFoodNutrition`, `ResolvedCatalogFood`.
- This task relocates current runtime behavior; it does not redesign it.

- [ ] **Step 1: Add a failing façade source assertion**

In `food-catalog.test.ts`, read the source file and require:

```ts
expect(source).toContain("@/services/food-catalog/server/legacy-compatibility");
expect(source).not.toMatch(/\.from\(\s*["']food_items["']\s*\)/);
```

Keep every existing runtime behavior test.

- [ ] **Step 2: Run and prove RED**

```bash
npx vitest run --config vitest.unit.config.mjs services/nutrition-v1/server/food-catalog.test.ts
```

Expected: new ownership assertion fails; existing compatibility expectations remain the regression contract.

- [ ] **Step 3: Move current implementation into `legacy-compatibility.ts`**

Copy current behavior from `services/nutrition-v1/server/food-catalog.ts` with only these changes:

- import compatibility types from `./contracts`;
- add `import "server-only";`;
- document it as transitional compatibility, not V2 authority.

Preserve current search, current `is_verified` compatibility read, name-only duplicate hint, and existing merge-chain behavior **inside this legacy module only**. New V2 modules must not import it.

- [ ] **Step 4: Convert Nutrition file to the exact façade**

```ts
import "server-only";

export type {
  CatalogFoodNutrition,
  ResolvedCatalogFood,
} from "@/services/food-catalog/server/contracts";

export {
  findCatalogDuplicateByName,
  getCatalogVerificationStates,
  resolveCatalogFood,
  searchCatalogFoodsByName,
} from "@/services/food-catalog/server/legacy-compatibility";
```

- [ ] **Step 5: Create explicit public server exports**

`services/food-catalog/server/index.ts` must use explicit exports only:

```ts
export type {
  CatalogFoodNutrition,
  FoodCatalogDomainBundle,
  FoodCatalogLifecycle,
  FoodCatalogRootRecord,
  ResolvedCatalogFood,
  StoredFoodMarketAssignment,
  StoredFoodMergeEvent,
  StoredFoodNameFact,
  StoredFoodNutritionRevision,
  StoredFoodServingOption,
  StoredFoodTaxonomyAssignment,
  StoredFoodVerificationAssertion,
} from "./contracts";
export type { FoodCatalogReadStore, FoodCatalogWriteStore } from "./store";
export { getFoodCatalogDomainBundle, resolveCanonicalRootForNewUse } from "./read-service";
export { projectFoodCatalogCompatibility } from "./compatibility-projection";
```

Do **not** export `createSupabaseFoodCatalogReadStore`, `createSupabaseFoodCatalogWriteStore`, or the legacy adapter from this index.

- [ ] **Step 6: Run and prove GREEN**

Run Step 2 command. Expected: all current Food Catalog regression tests PASS through the façade.

- [ ] **Step 7: Commit Task 6**

```bash
git add services/food-catalog/server/legacy-compatibility.ts \
  services/food-catalog/server/index.ts \
  services/nutrition-v1/server/food-catalog.ts \
  services/nutrition-v1/server/food-catalog.test.ts
git commit -m "refactor(food-catalog): move legacy reads behind domain service"
```

---

### Task 7: Enforce physical-table ownership with static architecture guards

**Files:**
- Create: `lib/product/food-catalog-v2-service-boundary.test.ts`
- Modify: `lib/product/nutrition-v1-food-catalog-boundary.test.ts`

**Interfaces:**
- V2 canonical-table access is allowed only in the two internal Supabase adapters.
- Current legacy root access is allowed in `legacy-compatibility.ts` plus `food-curation.ts` until Plan 6.

- [ ] **Step 1: Write the V2 boundary test**

Use:

```ts
const V2_CANONICAL_TABLE = /\.from\(\s*["'](?:food_nutrition_revisions|food_serving_options|food_names|food_taxonomy_assignments|food_market_assignments|food_verification_assertions|food_merge_events)["']\s*\)/;
const RAW_ADAPTER_IMPORT = /@\/services\/food-catalog\/server\/supabase-(?:read|write)-store/;

const ALLOWED_V2_TABLE_ACCESS = new Set([
  "services/food-catalog/server/supabase-read-store.ts",
  "services/food-catalog/server/supabase-write-store.ts",
]);
```

Scan production `.ts/.tsx` under `services`, `app/api`, and `lib/mcp`, excluding tests/specs. Assert no direct V2-table access outside those two files and no raw-adapter imports outside `services/food-catalog/server`.

- [ ] **Step 2: Update legacy root ownership guard**

In `nutrition-v1-food-catalog-boundary.test.ts`, replace the old direct-access allowlist with:

```ts
const ALLOWED_DIRECT_ACCESS = new Set([
  "services/food-catalog/server/legacy-compatibility.ts",
  "services/nutrition-v1/server/food-curation.ts",
]);
```

Add `services/food-catalog/server` to scanned roots and explicitly assert `services/nutrition-v1/server/food-catalog.ts` has no `.from("food_items")`.

- [ ] **Step 3: Run boundary tests**

```bash
npx vitest run --config vitest.unit.config.mjs \
  lib/product/nutrition-v1-food-catalog-boundary.test.ts \
  lib/product/food-catalog-v2-service-boundary.test.ts
```

Expected: PASS once Task 6 ownership is correct. Do not add convenience allowlist exceptions; route any new V2 access through the service.

- [ ] **Step 4: Commit Task 7**

```bash
git add lib/product/nutrition-v1-food-catalog-boundary.test.ts \
  lib/product/food-catalog-v2-service-boundary.test.ts
git commit -m "test(food-catalog): enforce V2 service persistence boundary"
```

---

### Task 8: Final Plan 2 verification and roadmap reconciliation

**Files:**
- Modify: `docs/superpowers/plans/2026-09-01-food-catalog-intelligence-program-roadmap.md`

**Interfaces:**
- Final state proves the V2 boundary/projection exists but runtime current-fact selection and member V2 cutover remain deferred.

- [ ] **Step 1: Run the complete focused Plan 2 suite**

```bash
npx vitest run --config vitest.unit.config.mjs \
  lib/food-catalog/domain \
  services/food-catalog/server \
  services/nutrition-v1/server/food-catalog.test.ts \
  lib/product/nutrition-v1-food-catalog-boundary.test.ts \
  lib/product/food-catalog-v2-service-boundary.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run exact existing consumer regressions**

```bash
npx vitest run --config vitest.unit.config.mjs \
  services/nutrition-v1/server/food-handoff.test.ts \
  services/nutrition-v1/server/user-foods.test.ts \
  lib/mcp/nutrition-v1-food-log-canonicalization.test.ts \
  lib/mcp/nutrition-v1-nullable-totals.test.ts
```

Expected: PASS. These are real repository paths on the approved Plan 2 planning base.

- [ ] **Step 3: Run repository static/type quality**

```bash
npm run typecheck
npm run lint
npm run test:scripts
npm run migration:ledger:check
```

Expected: PASS; migration ledger remains reconciled and unchanged.

- [ ] **Step 4: Run full unit suite and production build**

```bash
npm run test:unit
npm run build
```

Expected: PASS.

- [ ] **Step 5: Prove no migration/Production compatibility drift**

Replace `<PLAN2_BASE_SHA>` with the exact recorded base SHA from preflight and run:

```bash
git diff --name-only <PLAN2_BASE_SHA>...HEAD -- \
  supabase/migrations \
  supabase/migration-ledger.json \
  config/release-compatibility.json
```

Expected output: empty. A non-empty result is a hard stop for Planner review; do not modify migration truth under Plan 2 authority.

- [ ] **Step 6: Update roadmap execution status**

At completion, the roadmap must say:

```text
Plan 1 — Core Canonical Model: integrated on main; Production schema applied/reconciled; zero Food population.
Plan 2 — Domain Service V2: implementation complete on review branch/PR, awaiting Planner QA/QC.
Plan 3 — Activation / Verification / Generations: not started and not authorized.
```

- [ ] **Step 7: Commit roadmap state**

```bash
git add docs/superpowers/plans/2026-09-01-food-catalog-intelligence-program-roadmap.md
git commit -m "docs(food-catalog): record Plan 2 execution state"
```

- [ ] **Step 8: Run `verification-before-completion` on the exact final head**

The implementation handoff must record:

```text
branch
exact base SHA
exact final head SHA
changed files grouped by responsibility
focused Plan 2 tests
consumer regressions
lint
typecheck
full unit suite
build
script contracts
migration ledger state
database migration added: NO
Production mutation: NO
Food population: NO
runtime V2 cutover: NO
Plan 3 started: NO
PR merged: NO
```

Open exactly one Plan 2 implementation PR and STOP for independent Planner QA/QC.

---

## Plan 2 Exit Criteria

Plan 2 is complete only when all are true:

1. Food Catalog owns its server contracts independently from Nutrition V1.
2. V2 canonical reads are behind a Supabase-independent `FoodCatalogReadStore`.
3. V2 fact writes are validated append-only operations behind `FoodCatalogWriteStore`.
4. No V2 service method silently selects current/promoted nutrition/name/serving/trust facts.
5. Canonical new-use identity resolution rejects non-flattened redirect chains.
6. A pure projector maps explicitly selected V2 facts to `ResolvedCatalogFood` while preserving null/zero semantics.
7. Compatibility serving scaling uses only approved exact-Food evidence and rejects unsupported density conversion.
8. Current runtime `food_items` reads live under `services/food-catalog/server/legacy-compatibility.ts`; Nutrition `food-catalog.ts` is a façade.
9. Current Nutrition/MCP behavior remains unchanged in regression tests.
10. Static guards prevent V2 canonical-table leakage outside the two dedicated Supabase adapters.
11. Raw Supabase V2 adapters are not exported through the public Food Catalog server index or imported by member/product surfaces.
12. No database migration, Production mutation, Food population, activation, Catalog Generation promotion, compatibility-marker promotion, search cutover, or Plan 3 implementation occurred.
13. Exact-head quality evidence passes and implementation stops at Planner review.

## Explicitly Deferred to Plan 3+

- Catalog Generation schema/composition/current pointer.
- Current promoted nutrition/name/serving selection.
- Final Trust Profile / `Verified` derivation.
- Verification assertion supersession business commands.
- Activation sets and promotion/revocation.
- Generation-aware redirects.
- Food Library V2 search projection/ranking and market/language search behavior.
- Capability-based curation/control-plane implementation.
- Correction cases.
- USDA adapters, ingestion, population, activation, and promotion.
