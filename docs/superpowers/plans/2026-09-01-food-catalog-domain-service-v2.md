# Food Catalog Domain Service V2 + Compatibility Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the server-only Food Catalog V2 read/persistence boundary over the Plan 1 canonical model, move global Food persistence ownership out of Nutrition V1, and prove V2 domain facts can project into the current Nutrition compatibility contract without cutting Production/member runtime over before Catalog Generations exist.

**Architecture:** Create an independent `services/food-catalog/server` domain service with explicit read/write store ports and Supabase adapters. The V2 read service returns raw canonical-domain facts plus flattened canonical identity resolution, but it must not invent “current promoted” nutrition/name/serving/trust selection before Plan 3 introduces Catalog Generations. A pure compatibility projector maps explicitly selected V2 facts plus an externally supplied trust projection into the existing `ResolvedCatalogFood` shape. Existing Nutrition/MCP consumers keep the current runtime behavior through a thin compatibility façade backed by a relocated legacy adapter; no member runtime V2 cutover occurs in this plan.

**Tech Stack:** TypeScript 5.9, Vitest 4, Supabase JS 2.x, Next.js 16 server-only modules, PostgreSQL/Supabase schema introduced by Plan 1.

**Spec:** `docs/superpowers/specs/2026-09-01-food-catalog-intelligence-architecture-design.md`

## Global Constraints

- Existing implementation is migration input, not target-architecture authority.
- Preserve stable Plaivra Food IDs, historical frozen snapshots, My Foods isolation, nullable nutrition semantics, and the Food Catalog logical service boundary.
- `public.food_items.id` remains the compatibility/canonical identity anchor during this plan; its flat name/nutrition/serving/category/cuisine/verification/market fields are not V2 authority.
- Do not rewrite applied migrations. Plan 2 is expected to require **no database migration**. If implementation discovers that a new database invariant/schema change is genuinely required, stop and return to the Planner before adding a migration.
- Do not mutate Production.
- Do not populate Food data, ingest USDA/provider data, activate Foods, promote Catalog Generations, or promote the released compatibility marker.
- Do not start Plan 3 behavior inside Plan 2. In particular, do not choose “current promoted” nutrition/name/serving facts by `MAX(revision_number)`, latest timestamp, insertion order, or any other implicit rule.
- Do not derive the final user-facing `Verified` badge in Plan 2. The compatibility projector accepts a supplied trust/verification projection; Plan 3 owns final assertion/trust/generation semantics.
- Do not migrate Food Library search in this plan. Search projection/backend work remains Plan 5.
- Do not replace capability/admin curation in this plan. Control-plane authority remains Plan 6.
- Do not add a generic service-role client to member-facing Nutrition, routes, UI, or MCP code. Supabase adapters accept an injected internal client; they do not construct or export credentials.
- V2 canonical tables may be referenced directly only from the dedicated Food Catalog Supabase persistence adapters.
- Legacy `food_items` direct reads for current runtime compatibility move under the Food Catalog service boundary. `services/nutrition-v1/server/food-curation.ts` remains a temporary privileged exception until Plan 6.
- Unknown nutrient values remain `null`; explicit zero remains `0`.
- No generic household conversion may be invented. Compatibility scaling may use only the selected source-backed serving fact already accepted by the Plan 1 serving model.
- Current Nutrition/MCP behavior must remain unchanged unless a test explicitly exercises the new V2 compatibility path.
- Implementation branch starts from the current authoritative `main` containing Plan 1. Record exact base SHA before code changes.

---

## File Structure

### New Food Catalog server domain

- `services/food-catalog/server/contracts.ts` — server-facing V2 root/stored-fact/read-bundle types plus the current legacy compatibility contract owned by the Food Catalog domain.
- `services/food-catalog/server/store.ts` — Supabase-independent read/write persistence ports.
- `services/food-catalog/server/supabase-read-store.ts` — the only Plan 2 server module allowed to query Plan 1 V2 canonical read tables directly.
- `services/food-catalog/server/supabase-write-store.ts` — append-only validated writes to Plan 1 V2 immutable fact tables; no root creation, update, or delete authority.
- `services/food-catalog/server/read-service.ts` — canonical root resolution plus raw V2 domain-bundle orchestration; no generation/current-fact selection.
- `services/food-catalog/server/compatibility-projection.ts` — pure projection from explicitly selected V2 facts to the existing `ResolvedCatalogFood` contract, including safe serving scaling.
- `services/food-catalog/server/legacy-compatibility.ts` — relocated current `food_items` runtime implementation used only until later generation/search consumer cutovers.
- `services/food-catalog/server/index.ts` — explicit server-only public exports for the Food Catalog service; must not export raw Supabase adapters.

### Tests

- `services/food-catalog/server/contracts.test.ts`
- `services/food-catalog/server/supabase-read-store.test.ts`
- `services/food-catalog/server/supabase-write-store.test.ts`
- `services/food-catalog/server/read-service.test.ts`
- `services/food-catalog/server/compatibility-projection.test.ts`
- Existing `services/nutrition-v1/server/food-catalog.test.ts` remains the regression authority for current compatibility behavior through the façade.
- `lib/product/food-catalog-v2-service-boundary.test.ts` — static architecture guard for V2 canonical-table ownership and adapter isolation.

### Existing files modified

- `lib/food-catalog/domain/taxonomy.ts` — add assignment write contract + validator.
- `lib/food-catalog/domain/taxonomy.test.ts` — validator tests.
- `lib/food-catalog/domain/markets.ts` — add market-assignment write contract + validator.
- `lib/food-catalog/domain/markets.test.ts` — validator tests.
- `lib/food-catalog/domain/verification.ts` — add assertion validator used by persistence.
- `lib/food-catalog/domain/verification.test.ts` — validator tests.
- `services/nutrition-v1/server/food-catalog.ts` — becomes a thin compatibility façade/re-export; contains no direct table access.
- `lib/product/nutrition-v1-food-catalog-boundary.test.ts` — transfer legacy direct-access allowlist ownership to `services/food-catalog/server/legacy-compatibility.ts` and include the new Food Catalog service root in scans.
- `docs/superpowers/plans/2026-09-01-food-catalog-intelligence-program-roadmap.md` — record Plan 1 complete and Plan 2 as the next implementation unit after the Plan 2 review gate.

---

### Task 1: Own the server contract in the Food Catalog domain and complete append-fact domain validators

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
- Produces `FoodCatalogLifecycle`, `FoodCatalogRootRecord`, stored-fact record types, `FoodCatalogDomainBundle`, `CatalogFoodNutrition`, and `ResolvedCatalogFood`.
- Produces validated `FoodTaxonomyAssignment`, `FoodMarketAssignment`, and `validateFoodVerificationAssertion` contracts consumed by Task 3.
- Does not select current/promoted facts.

- [ ] **Step 1: Write failing contract tests**

Add tests that require the Food Catalog domain to own the compatibility types and require validated taxonomy/market/verification append contracts.

```ts
import { describe, expect, it } from "vitest";

import type {
  CatalogFoodNutrition,
  FoodCatalogDomainBundle,
  FoodCatalogRootRecord,
  ResolvedCatalogFood,
} from "@/services/food-catalog/server/contracts";

describe("Food Catalog V2 server contracts", () => {
  it("represents a root independently from flat nutrition/name authority", () => {
    const root: FoodCatalogRootRecord = {
      id: "22222222-2222-4222-8222-222222222222",
      lifecycleStatus: "active",
      mergedIntoFoodId: null,
    };
    expect(root).toEqual(expect.objectContaining({ lifecycleStatus: "active" }));
    expect(root).not.toHaveProperty("food_name");
    expect(root).not.toHaveProperty("calories");
  });

  it("keeps the legacy compatibility shape nullable", () => {
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
    expect(value.nutrition.protein_g).toBeNull();
    expect(value.nutrition.calories).toBe(0);
  });

  it("keeps raw V2 facts separate from selected compatibility facts", () => {
    const bundle = {} as FoodCatalogDomainBundle;
    expect("selectedNutrition" in bundle).toBe(false);
    expect("verified" in bundle).toBe(false);
  });
});
```

Extend existing domain tests with exact validator behavior:

```ts
expect(() => validateFoodTaxonomyAssignment({
  foodId: " ",
  nodeCode: "dairy",
  sourceRecordId: null,
  action: "assign",
  policyVersion: "taxonomy-v1",
})).toThrow(/food id/i);

expect(() => validateFoodMarketAssignment({
  foodId: "food-1",
  scopeCode: "DE",
  relevance: "primary",
  sourceRecordId: null,
  action: "assign",
  policyVersion: " ",
})).toThrow(/policy/i);

expect(() => validateFoodVerificationAssertion({
  foodId: "food-1",
  scope: "nutrition",
  state: "verified",
  policyVersion: "verify-v1",
  sourceRecordId: null,
  supersedesAssertionId: null,
  reasonCode: " ",
  authorityReference: "planner:test",
})).toThrow(/reason/i);
```

- [ ] **Step 2: Run the focused tests and prove RED**

Run:

```bash
npx vitest run --config vitest.unit.config.mjs \
  services/food-catalog/server/contracts.test.ts \
  lib/food-catalog/domain/taxonomy.test.ts \
  lib/food-catalog/domain/markets.test.ts \
  lib/food-catalog/domain/verification.test.ts
```

Expected: FAIL because the new server contract file/types and append validators do not exist yet.

- [ ] **Step 3: Add the exact server contract types**

Create `services/food-catalog/server/contracts.ts` with `import "server-only";` and definitions equivalent to:

```ts
import "server-only";

import type { FoodMergeEvent } from "@/lib/food-catalog/domain/identity";
import type { FoodMarketAssignment } from "@/lib/food-catalog/domain/markets";
import type { FoodNameFact } from "@/lib/food-catalog/domain/names";
import type { FoodNutritionRevision } from "@/lib/food-catalog/domain/nutrition";
import type { FoodServingOption } from "@/lib/food-catalog/domain/servings";
import type { FoodTaxonomyAssignment } from "@/lib/food-catalog/domain/taxonomy";
import type { FoodVerificationAssertion } from "@/lib/food-catalog/domain/verification";

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

The V2 bundle intentionally contains arrays/raw facts and no `selected*`, `current*`, or `verified` projection fields.

- [ ] **Step 4: Add validated append-fact contracts**

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
export function validateFoodVerificationAssertion(value: FoodVerificationAssertion) {
  if (!value.foodId.trim()) throw new Error("Food verification food ID must be nonblank.");
  if (!value.policyVersion.trim()) throw new Error("Food verification policy version must be nonblank.");
  if (!value.reasonCode.trim()) throw new Error("Food verification reason code must be nonblank.");
  if (!value.authorityReference.trim()) throw new Error("Food verification authority reference must be nonblank.");
  return value;
}
```

Do not add final Trust/Verified derivation here.

- [ ] **Step 5: Run focused tests and prove GREEN**

Run the same command from Step 2. Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add \
  services/food-catalog/server/contracts.ts \
  services/food-catalog/server/contracts.test.ts \
  lib/food-catalog/domain/taxonomy.ts \
  lib/food-catalog/domain/taxonomy.test.ts \
  lib/food-catalog/domain/markets.ts \
  lib/food-catalog/domain/markets.test.ts \
  lib/food-catalog/domain/verification.ts \
  lib/food-catalog/domain/verification.test.ts
git commit -m "feat(food-catalog): define V2 service contracts"
```

---

### Task 2: Create the Supabase-independent store ports and strict V2 read adapter

**Files:**
- Create: `services/food-catalog/server/store.ts`
- Create: `services/food-catalog/server/supabase-read-store.ts`
- Create: `services/food-catalog/server/supabase-read-store.test.ts`

**Interfaces:**
- Produces `FoodCatalogReadStore` and `createSupabaseFoodCatalogReadStore(supabase)`.
- Reads the compatibility root only for `id`, `lifecycle_status`, and `merged_into_food_id`.
- Reads V2 facts from Plan 1 tables without consulting flat `food_items` nutrition/name/serving/verification fields.
- Returns all facts; does not choose current/promoted facts.

- [ ] **Step 1: Write failing read-store tests**

Create a query-double helper and assert exact table ownership/mapping. Required cases:

```ts
it("reads only root identity/lifecycle compatibility fields from food_items", async () => {
  const { client, queries } = fakeSupabase({
    food_items: [{ data: { id: FOOD_ID, lifecycle_status: "active", merged_into_food_id: null }, error: null }],
  });
  const store = createSupabaseFoodCatalogReadStore(client);
  expect(await store.readRoot(FOOD_ID)).toEqual({
    id: FOOD_ID,
    lifecycleStatus: "active",
    mergedIntoFoodId: null,
  });
  expect(queries.food_items[0].select).toHaveBeenCalledWith("id,lifecycle_status,merged_into_food_id");
});

it("preserves explicit zero and null nutrition from V2 revisions", async () => {
  // Return calories=0, protein_g=null and assert those exact values survive mapping.
});

it("returns all name/serving/taxonomy/market/verification/merge facts without selecting a current row", async () => {
  // Assert array lengths/order and no selected/current property is created.
});

it("fails closed on malformed canonical DB values instead of converting them to null", async () => {
  // e.g. protein_g = -1 or invalid lifecycle must throw.
});
```

- [ ] **Step 2: Run test and prove RED**

```bash
npx vitest run --config vitest.unit.config.mjs services/food-catalog/server/supabase-read-store.test.ts
```

Expected: FAIL because store/read adapter does not exist.

- [ ] **Step 3: Define the store ports**

Create `store.ts`:

```ts
import "server-only";

import type { FoodMergeEvent } from "@/lib/food-catalog/domain/identity";
import type { FoodMarketAssignment } from "@/lib/food-catalog/domain/markets";
import type { FoodNameFact } from "@/lib/food-catalog/domain/names";
import type { FoodNutritionRevision } from "@/lib/food-catalog/domain/nutrition";
import type { FoodServingOption } from "@/lib/food-catalog/domain/servings";
import type { FoodTaxonomyAssignment } from "@/lib/food-catalog/domain/taxonomy";
import type { FoodVerificationAssertion } from "@/lib/food-catalog/domain/verification";
import type {
  FoodCatalogRootRecord,
  StoredFoodMarketAssignment,
  StoredFoodMergeEvent,
  StoredFoodNameFact,
  StoredFoodNutritionRevision,
  StoredFoodServingOption,
  StoredFoodTaxonomyAssignment,
  StoredFoodVerificationAssertion,
} from "./contracts";

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

No method may create/update/delete the root Food in Plan 2.

- [ ] **Step 4: Implement the strict Supabase read adapter**

Create `supabase-read-store.ts` with `import "server-only";`. Export only:

```ts
export function createSupabaseFoodCatalogReadStore(
  supabase: SupabaseClient,
): FoodCatalogReadStore
```

Use exact Plan 1 tables:

```text
food_items                        root identity/lifecycle projection only
food_nutrition_revisions          immutable nutrition revisions
food_serving_options              immutable serving facts
food_names                        immutable naming facts
food_taxonomy_assignments         immutable taxonomy assignment events
food_market_assignments           immutable market assignment events
food_verification_assertions      immutable verification assertions
food_merge_events                 immutable merge evidence
```

Map snake_case rows into Task 1 contracts and call the existing domain validators where available. Invalid persisted values must throw an explicit `Food Catalog V2 read:` error rather than silently coerce invalid values to `null`.

For deterministic raw-array output, query with stable ordering:

```ts
nutrition: revision_number ascending
other immutable facts: created_at ascending, then id ascending
```

The ordering is only deterministic transport order; it is **not current-fact authority**.

- [ ] **Step 5: Run read-store tests and prove GREEN**

```bash
npx vitest run --config vitest.unit.config.mjs services/food-catalog/server/supabase-read-store.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add \
  services/food-catalog/server/store.ts \
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
- Implements `FoodCatalogWriteStore` from Task 2.
- Writes only immutable Plan 1 fact tables.
- Does not create canonical roots, activate Foods, update facts, delete facts, promote generations, or perform curation decisions.

- [ ] **Step 1: Write failing append-only tests**

Required tests:

```ts
it("validates a nutrition revision before any database call", async () => {
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
    nutrientMappingVersion: "usda-test-v1",
    sourceRecordId: null,
  })).rejects.toThrow(/non-negative/i);
  expect(from).not.toHaveBeenCalled();
});

it("rejects a source-less household serving before insert", async () => {
  // unitCode="cup", gramWeight=240, sourceRecordId=null must fail before DB access.
});

it("maps append operations to INSERT only", async () => {
  // Assert expected table, snake_case payload, and that the query double never receives update/delete/upsert.
});
```

Cover all seven append methods at least once across the suite.

- [ ] **Step 2: Run test and prove RED**

```bash
npx vitest run --config vitest.unit.config.mjs services/food-catalog/server/supabase-write-store.test.ts
```

Expected: FAIL because the write adapter does not exist.

- [ ] **Step 3: Implement the append-only adapter**

Create `supabase-write-store.ts` with `import "server-only";` and:

```ts
export function createSupabaseFoodCatalogWriteStore(
  supabase: SupabaseClient,
): FoodCatalogWriteStore
```

Each method must:

1. run the matching domain validator;
2. map to the exact Plan 1 snake_case payload;
3. call `.insert(...)` on exactly one target table;
4. throw on database error;
5. never use `.update`, `.delete`, or `.upsert`.

Example nutrition mapping:

```ts
await insert("food_nutrition_revisions", {
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
});
```

Do not add root `food_items` writes. Root creation belongs to the later ingestion/control-plane implementation when compatibility requirements are explicitly planned.

- [ ] **Step 4: Run write-store tests and prove GREEN**

```bash
npx vitest run --config vitest.unit.config.mjs services/food-catalog/server/supabase-write-store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add services/food-catalog/server/supabase-write-store.ts services/food-catalog/server/supabase-write-store.test.ts
git commit -m "feat(food-catalog): add append-only V2 persistence"
```

---

### Task 4: Implement flattened canonical-root resolution and raw V2 domain bundle reads

**Files:**
- Create: `services/food-catalog/server/read-service.ts`
- Create: `services/food-catalog/server/read-service.test.ts`

**Interfaces:**
- Consumes `FoodCatalogReadStore`.
- Produces `resolveCanonicalRootForNewUse(store, foodId)` and `getFoodCatalogDomainBundle(store, foodId)`.
- Resolves at most one compatibility redirect and rejects a chain; it does not walk arbitrary merge depth.
- Does not select current nutrition/name/serving/trust facts.

- [ ] **Step 1: Write failing canonical resolution tests**

Required cases:

```ts
it("returns an active canonical root", async () => {
  const store = fakeReadStore({
    roots: new Map([[ACTIVE_ID, { id: ACTIVE_ID, lifecycleStatus: "active", mergedIntoFoodId: null }]]),
  });
  await expect(resolveCanonicalRootForNewUse(store, ACTIVE_ID)).resolves.toEqual({
    id: ACTIVE_ID,
    lifecycleStatus: "active",
    mergedIntoFoodId: null,
  });
});

it("resolves one flattened merged redirect to an active survivor", async () => {
  // MERGED_ID -> ACTIVE_ID.
});

it("fails closed if the redirect target is itself merged", async () => {
  // A -> B and B -> C must throw /flattened/i; Plan 2 must not chain-walk.
});

it.each(["draft", "deprecated", "withdrawn"] as const)("rejects %s for new use", async (status) => {
  // status root is unavailable for new writes.
});
```

Add a bundle test asserting all fact reads use the **resolved survivor ID** and return raw arrays unchanged.

- [ ] **Step 2: Run test and prove RED**

```bash
npx vitest run --config vitest.unit.config.mjs services/food-catalog/server/read-service.test.ts
```

Expected: FAIL because the read service does not exist.

- [ ] **Step 3: Implement flattened root resolution**

Core behavior:

```ts
export async function resolveCanonicalRootForNewUse(
  store: FoodCatalogReadStore,
  foodId: string,
): Promise<FoodCatalogRootRecord> {
  const root = await store.readRoot(foodId);
  if (!root) throw new Error("Food is unavailable.");

  if (root.lifecycleStatus === "active") return root;

  if (root.lifecycleStatus !== "merged" || !root.mergedIntoFoodId) {
    throw new Error("Food is unavailable for new Nutrition writes.");
  }

  const survivor = await store.readRoot(root.mergedIntoFoodId);
  if (!survivor || survivor.lifecycleStatus !== "active" || survivor.mergedIntoFoodId !== null) {
    throw new Error("Food merge redirect is not flattened to a current active survivor.");
  }
  return survivor;
}
```

Validate input IDs with the existing `isUuid` helper before persistence reads.

- [ ] **Step 4: Implement raw bundle orchestration**

After resolving the root, read all V2 facts for `root.id` in parallel:

```ts
const [
  nutritionRevisions,
  servingOptions,
  names,
  taxonomyAssignments,
  marketAssignments,
  verificationAssertions,
  mergeEvents,
] = await Promise.all([
  store.readNutritionRevisions(root.id),
  store.readServingOptions(root.id),
  store.readNames(root.id),
  store.readTaxonomyAssignments(root.id),
  store.readMarketAssignments(root.id),
  store.readVerificationAssertions(root.id),
  store.readMergeEvents(root.id),
]);
```

Return `requestedFoodId` separately from the resolved `root.id`.

Do not add logic such as `at(-1)`, `MAX(revision_number)`, latest timestamp, default serving selection, locale winner selection, or trust derivation.

- [ ] **Step 5: Run read-service tests and prove GREEN**

```bash
npx vitest run --config vitest.unit.config.mjs services/food-catalog/server/read-service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add services/food-catalog/server/read-service.ts services/food-catalog/server/read-service.test.ts
git commit -m "feat(food-catalog): add V2 canonical read service"
```

---

### Task 5: Build the pure V2-to-Nutrition compatibility projection without inventing current authority

**Files:**
- Create: `services/food-catalog/server/compatibility-projection.ts`
- Create: `services/food-catalog/server/compatibility-projection.test.ts`

**Interfaces:**
- Consumes an explicitly selected root, name fact, nutrition revision, optional serving option, and externally supplied `{ verified: boolean }` compatibility trust projection.
- Produces the existing `ResolvedCatalogFood` contract.
- Performs only mathematically deterministic serving scaling backed by selected V2 facts.
- Never chooses which fact is current.

- [ ] **Step 1: Write failing projection tests**

Required cases:

```ts
it("projects direct 100 g V2 facts while preserving null and explicit zero", () => {
  const projected = projectFoodCatalogCompatibility({
    root: ACTIVE_ROOT,
    selectedName: NAME,
    selectedNutrition: {
      ...NUTRITION,
      calories: 0,
      protein_g: null,
      basisAmount: 100,
      basisUnit: "g",
    },
    selectedServing: null,
    trust: { verified: false },
  });

  expect(projected).toMatchObject({
    id: ACTIVE_ID,
    name: NAME.text,
    servingLabel: "100 g",
    verified: false,
    nutrition: { calories: 0, protein_g: null, basis_amount: 100, basis_unit: "g" },
  });
});

it("scales a source-backed household serving from gram-based canonical nutrition", () => {
  // 100 g protein=10, selected 1 cup gramWeight=240 -> protein=24, servingLabel from selected fact.
});

it("rejects unsupported cross-dimension scaling instead of inventing density", () => {
  // g-based nutrition + direct ml serving with no gramWeight must throw /density|cannot scale/i.
});

it("rejects selected facts belonging to a different Food", () => {
  // name/nutrition/serving foodId must equal root.id.
});
```

- [ ] **Step 2: Run test and prove RED**

```bash
npx vitest run --config vitest.unit.config.mjs services/food-catalog/server/compatibility-projection.test.ts
```

Expected: FAIL because the projector does not exist.

- [ ] **Step 3: Define the explicit selection input**

```ts
export type FoodCatalogCompatibilitySelection = {
  root: FoodCatalogRootRecord;
  selectedName: StoredFoodNameFact;
  selectedNutrition: StoredFoodNutritionRevision;
  selectedServing: StoredFoodServingOption | null;
  trust: { verified: boolean };
};
```

The type must not expose a function that receives a full bundle and silently selects `latest` facts.

- [ ] **Step 4: Implement safe scaling**

Use a pure helper equivalent to:

```ts
function servingFactor(
  nutrition: StoredFoodNutritionRevision,
  serving: StoredFoodServingOption | null,
) {
  if (!serving) return { factor: 1, label: `${nutrition.basisAmount} ${nutrition.basisUnit}`, basisAmount: nutrition.basisAmount, basisUnit: nutrition.basisUnit as "g" | "ml" };

  if (nutrition.basisUnit === "g") {
    const grams = serving.unitCode === "g" ? serving.amount : serving.gramWeight;
    if (grams === null) throw new Error("Selected serving cannot be scaled from gram nutrition without Food-specific mass evidence.");
    return {
      factor: grams / nutrition.basisAmount,
      label: serving.label,
      basisAmount: serving.unitCode === "g" ? serving.amount : 1,
      basisUnit: serving.unitCode === "g" ? "g" as const : "serving" as const,
    };
  }

  if (serving.unitCode !== "ml") {
    throw new Error("Selected serving cannot be scaled from ml nutrition without approved density evidence.");
  }

  return {
    factor: serving.amount / nutrition.basisAmount,
    label: serving.label,
    basisAmount: serving.amount,
    basisUnit: "ml" as const,
  };
}
```

Scale each known nutrient; leave `null` as `null` and exact zero as zero. Use the repository's existing mill precision convention (`Math.round(value * factor * 1000) / 1000`) for compatibility output.

Do not call AI, density tables, universal unit maps, or household assumptions.

- [ ] **Step 5: Implement the compatibility object**

Return exactly the current contract:

```ts
return {
  id: input.root.id,
  name: input.selectedName.text,
  servingLabel: selected.label,
  verified: input.trust.verified,
  nutrition: {
    calories: scaled(input.selectedNutrition.calories),
    protein_g: scaled(input.selectedNutrition.protein_g),
    carbs_g: scaled(input.selectedNutrition.carbs_g),
    fat_g: scaled(input.selectedNutrition.fat_g),
    saturated_fat_g: scaled(input.selectedNutrition.saturated_fat_g),
    fiber_g: scaled(input.selectedNutrition.fiber_g),
    sugars_g: scaled(input.selectedNutrition.sugars_g),
    sodium_mg: scaled(input.selectedNutrition.sodium_mg),
    basis_amount: selected.basisAmount,
    basis_unit: selected.basisUnit,
  },
};
```

- [ ] **Step 6: Run projection tests and prove GREEN**

```bash
npx vitest run --config vitest.unit.config.mjs services/food-catalog/server/compatibility-projection.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

```bash
git add services/food-catalog/server/compatibility-projection.ts services/food-catalog/server/compatibility-projection.test.ts
git commit -m "feat(food-catalog): add V2 compatibility projection"
```

---

### Task 6: Move current runtime physical reads under the Food Catalog domain and make Nutrition V1 a façade

**Files:**
- Create: `services/food-catalog/server/legacy-compatibility.ts`
- Create: `services/food-catalog/server/index.ts`
- Modify: `services/nutrition-v1/server/food-catalog.ts`
- Test: `services/nutrition-v1/server/food-catalog.test.ts`

**Interfaces:**
- Existing exports remain available unchanged to current consumers:
  - `resolveCatalogFood`
  - `getCatalogVerificationStates`
  - `searchCatalogFoodsByName`
  - `findCatalogDuplicateByName`
  - `CatalogFoodNutrition`
  - `ResolvedCatalogFood`
- Runtime implementation is relocated, not semantically redesigned.
- The legacy name-only duplicate helper remains a compatibility/UI hint only and must not be imported into V2 identity reconciliation code.

- [ ] **Step 1: Add a failing façade ownership assertion**

Extend `services/nutrition-v1/server/food-catalog.test.ts` or add a focused source-contract assertion proving the Nutrition file is a thin façade and contains no direct query call:

```ts
const source = readFileSync(new URL("./food-catalog.ts", import.meta.url), "utf8");
expect(source).toContain("@/services/food-catalog/server/legacy-compatibility");
expect(source).not.toMatch(/\.from\(\s*["']food_items["']\s*\)/);
```

Keep all existing runtime tests intact.

- [ ] **Step 2: Run the existing Food Catalog compatibility suite and prove RED for the new ownership assertion**

```bash
npx vitest run --config vitest.unit.config.mjs services/nutrition-v1/server/food-catalog.test.ts
```

Expected: FAIL only on the new façade/ownership requirement while existing behavior tests still describe the expected runtime contract.

- [ ] **Step 3: Move the current implementation verbatim into the Food Catalog domain**

Copy the current implementation body from `services/nutrition-v1/server/food-catalog.ts` to `services/food-catalog/server/legacy-compatibility.ts` with these bounded changes only:

- import `CatalogFoodNutrition` and `ResolvedCatalogFood` from `./contracts` instead of defining them locally;
- add a module comment that this is transitional runtime compatibility, not V2 canonical authority;
- preserve existing search/verification/merge-chain behavior in this task to avoid an unrelated member runtime cutover;
- do not import this module from new V2 read/write/identity logic.

Do not “improve” search ranking, verification semantics, or merge resolution here; those changes belong to later plans with their own gates.

- [ ] **Step 4: Replace the Nutrition implementation with a re-export façade**

`services/nutrition-v1/server/food-catalog.ts` should reduce to server-only exports equivalent to:

```ts
import "server-only";

export type { CatalogFoodNutrition, ResolvedCatalogFood } from "@/services/food-catalog/server/contracts";
export {
  findCatalogDuplicateByName,
  getCatalogVerificationStates,
  resolveCatalogFood,
  searchCatalogFoodsByName,
} from "@/services/food-catalog/server/legacy-compatibility";
```

- [ ] **Step 5: Add the V2 public server index**

`services/food-catalog/server/index.ts` may export domain-safe server interfaces/services:

```ts
export type * from "./contracts";
export type { FoodCatalogReadStore, FoodCatalogWriteStore } from "./store";
export { getFoodCatalogDomainBundle, resolveCanonicalRootForNewUse } from "./read-service";
export { projectFoodCatalogCompatibility } from "./compatibility-projection";
```

It must **not** export `createSupabaseFoodCatalogReadStore` or `createSupabaseFoodCatalogWriteStore`; those remain internal persistence adapter imports.

- [ ] **Step 6: Run current compatibility tests and prove GREEN**

```bash
npx vitest run --config vitest.unit.config.mjs services/nutrition-v1/server/food-catalog.test.ts
```

Expected: all existing runtime behavior tests PASS through the façade.

- [ ] **Step 7: Commit Task 6**

```bash
git add \
  services/food-catalog/server/legacy-compatibility.ts \
  services/food-catalog/server/index.ts \
  services/nutrition-v1/server/food-catalog.ts \
  services/nutrition-v1/server/food-catalog.test.ts
git commit -m "refactor(food-catalog): move legacy reads behind domain service"
```

---

### Task 7: Harden static service boundaries so V2 tables cannot leak back into consumers

**Files:**
- Create: `lib/product/food-catalog-v2-service-boundary.test.ts`
- Modify: `lib/product/nutrition-v1-food-catalog-boundary.test.ts`

**Interfaces:**
- Enforces physical-table ownership at repository level.
- Keeps current `food-curation.ts` as the only Nutrition-side direct global-write exception until Plan 6.

- [ ] **Step 1: Write failing V2 boundary tests**

Create a static scan with V2 table regex covering:

```ts
const V2_CANONICAL_TABLE = /\.from\(\s*["'](?:food_nutrition_revisions|food_serving_options|food_names|food_taxonomy_assignments|food_market_assignments|food_verification_assertions|food_merge_events)["']\s*\)/;
```

Allowed production files are exactly:

```ts
const ALLOWED_V2_TABLE_ACCESS = new Set([
  "services/food-catalog/server/supabase-read-store.ts",
  "services/food-catalog/server/supabase-write-store.ts",
]);
```

Scan at minimum:

```text
services/
app/api/
lib/mcp/
```

excluding tests/spec files.

Also reject imports of the raw Supabase adapters from member/product surfaces outside `services/food-catalog/server`:

```ts
const RAW_ADAPTER_IMPORT = /@\/services\/food-catalog\/server\/supabase-(?:read|write)-store/;
```

- [ ] **Step 2: Update the existing legacy boundary expectation**

Change `ALLOWED_DIRECT_ACCESS` in `nutrition-v1-food-catalog-boundary.test.ts` from:

```ts
services/nutrition-v1/server/food-catalog.ts
services/nutrition-v1/server/food-curation.ts
```

to:

```ts
services/food-catalog/server/legacy-compatibility.ts
services/nutrition-v1/server/food-curation.ts
```

Add `services/food-catalog/server` to the scanned roots.

Add an explicit assertion that `services/nutrition-v1/server/food-catalog.ts` contains no `.from("food_items")`.

- [ ] **Step 3: Run boundary tests and prove RED before allowlist/code alignment is complete**

```bash
npx vitest run --config vitest.unit.config.mjs \
  lib/product/nutrition-v1-food-catalog-boundary.test.ts \
  lib/product/food-catalog-v2-service-boundary.test.ts
```

Expected: FAIL until Task 6 ownership and the exact Plan 2 adapter allowlist are present.

- [ ] **Step 4: Make only the minimal boundary alignment required**

Do not add convenience exceptions. If another production file is querying a V2 canonical table, route that access through the Food Catalog service instead of expanding the allowlist.

The existing historical direct accesses outside the current Nutrition/MCP scan (`app/api/admin/quality`, older database helpers) are not silently rewritten in Plan 2 unless the new V2 regex actually detects a Plan 2 canonical-table leak. Their retirement remains scheduled by the approved reconciliation/Plan 6–7 scopes.

- [ ] **Step 5: Run boundary tests and prove GREEN**

Run the Step 3 command. Expected: PASS.

- [ ] **Step 6: Commit Task 7**

```bash
git add \
  lib/product/food-catalog-v2-service-boundary.test.ts \
  lib/product/nutrition-v1-food-catalog-boundary.test.ts
git commit -m "test(food-catalog): enforce V2 service persistence boundary"
```

---

### Task 8: Prove Plan 2 compatibility, update roadmap status, and run the final review gate

**Files:**
- Modify: `docs/superpowers/plans/2026-09-01-food-catalog-intelligence-program-roadmap.md`
- No runtime feature files beyond Tasks 1–7 unless a failing regression requires a scoped correction.

**Interfaces:**
- Exit state proves V2 domain facts and compatibility projection exist without runtime V2 selection/cutover.
- Plan 3 remains the only next implementation authority after separate review/approval.

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

- [ ] **Step 2: Run current Nutrition handoff regressions**

Run the existing Food handoff/consumer-focused suites that import the compatibility façade:

```bash
npx vitest run --config vitest.unit.config.mjs \
  services/nutrition-v1/server/food-handoff.test.ts \
  services/nutrition-v1/server/recipe-published.test.ts \
  services/nutrition-v1/server/user-foods.test.ts \
  lib/mcp/nutrition-v1-food-execution.test.ts
```

If any listed path has been renamed on the execution base, use the current exact equivalent discovered from `git ls-files`; do not replace the coverage category with an unrelated test.

Expected: PASS with existing member behavior unchanged.

- [ ] **Step 3: Run repository static/type quality**

```bash
npm run typecheck
npm run lint
npm run test:scripts
npm run migration:ledger:check
```

Expected: PASS. The migration ledger must remain reconciled and unchanged because Plan 2 has no Production migration.

- [ ] **Step 4: Run the full unit suite and production build**

```bash
npm run test:unit
npm run build
```

Expected: PASS.

- [ ] **Step 5: Prove no migration or Production authority drift**

Before final handoff:

```bash
git diff --name-only <PLAN2_BASE_SHA>...HEAD -- supabase/migrations supabase/migration-ledger.json config/release-compatibility.json
```

Expected: no migration file, migration-ledger, or compatibility-marker change from Plan 2 implementation. If any appears, STOP and return to Planner review; do not rationalize it as incidental.

- [ ] **Step 6: Update the roadmap state**

Update only status/current-next-move wording so it truthfully states:

```text
Plan 1 — Core Canonical Model: integrated on main and Production schema applied/reconciled; zero Food population.
Plan 2 — Domain Service V2: current implementation unit.
Plan 3 — Activation / Verification / Generations: not started; requires separate post-Plan-2 planning/review gate.
```

Do not mark Plan 2 complete until all final verification is green.

- [ ] **Step 7: Commit Task 8 documentation state**

```bash
git add docs/superpowers/plans/2026-09-01-food-catalog-intelligence-program-roadmap.md
git commit -m "docs(food-catalog): record Plan 2 execution state"
```

- [ ] **Step 8: Run `verification-before-completion` on the exact final head**

Record:

```text
branch
exact base SHA
exact final head SHA
changed files grouped by responsibility
focused Plan 2 tests
Nutrition consumer regressions
lint
typecheck
full unit suite
build
script contracts
migration ledger state
confirmation: database migration added = NO
confirmation: Production mutation = NO
confirmation: Food population = NO
confirmation: runtime V2 cutover = NO
confirmation: Plan 3 started = NO
```

Open one Plan 2 implementation PR and STOP for independent Planner QA/QC. Do not merge it and do not start Plan 3.

---

## Plan 2 Exit Criteria

Plan 2 is complete only when all are true:

1. The Food Catalog owns its server contracts independently from Nutrition V1.
2. V2 canonical reads are behind a Supabase-independent `FoodCatalogReadStore`.
3. V2 fact writes are append-only, validated, and behind `FoodCatalogWriteStore`.
4. No V2 service method silently selects a current/promoted revision/name/serving/trust fact before Plan 3.
5. Canonical new-use identity resolution rejects non-flattened merge redirects instead of chain-walking.
6. A pure compatibility projector can map explicitly selected V2 name/nutrition/serving facts into the current `ResolvedCatalogFood` contract while preserving null/zero semantics.
7. Household serving compatibility scaling uses only source-backed exact-Food mass evidence and rejects unsupported density conversion.
8. Current runtime physical `food_items` reads live under `services/food-catalog/server/legacy-compatibility.ts`; `services/nutrition-v1/server/food-catalog.ts` is a thin façade.
9. Current Nutrition/MCP behavior remains unchanged in runtime regression tests.
10. Static architecture guards prevent new V2 canonical table access outside the dedicated Food Catalog Supabase adapters.
11. Raw Supabase V2 adapters are not exported through the public Food Catalog server index and are not imported by member/product surfaces.
12. No database migration, Production mutation, Food population, activation, Catalog Generation promotion, compatibility-marker promotion, search cutover, or Plan 3 implementation occurred.
13. Full exact-head quality evidence passes and the PR stops at Planner review.

## Explicitly Deferred to Plan 3+

The following must not be pulled forward into Plan 2:

- Catalog Generation tables/composition/current pointer;
- current promoted nutrition/name/serving selection;
- final user-facing Trust Profile / `Verified` derivation;
- verification assertion supersession business commands;
- activation sets and promotion/revocation;
- generation-aware redirects;
- Food Library V2 search projection/ranking;
- market/language search ranking;
- capability-based curation/control-plane implementation;
- correction cases;
- USDA adapters/ingestion/population.
