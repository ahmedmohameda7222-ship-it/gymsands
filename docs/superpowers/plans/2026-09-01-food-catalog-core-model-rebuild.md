# Food Catalog Core Canonical Model Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce the long-term versioned Food Catalog core model and database invariants without changing current member-facing Food Library behavior or populating any global Food.

**Architecture:** Keep `public.food_items.id` as the stable canonical Food root/compatibility anchor during migration, but move all future authority for nutrition, servings, localized names, taxonomy, market relevance, verification, and merge evidence into focused versioned/immutable domain relations. This plan is additive: current consumers continue reading existing projections until later plans migrate them behind V2 domain services.

**Tech Stack:** PostgreSQL/Supabase, TypeScript 5.9, Node.js 24, Vitest 4, existing `scripts/run-database-verification.mjs` local-only verification chain.

**Spec:** `docs/superpowers/specs/2026-09-01-food-catalog-intelligence-architecture-design.md`

## Global Constraints

- Execute only after the approved Food Catalog Intelligence design/spec is merged into `main`.
- Start the implementation branch from then-current `origin/main`; record exact starting SHA in the PR body.
- Existing implementation is migration input, not target-architecture authority.
- Preserve `public.food_items.id` values and all existing foreign-key references during this plan.
- `public.food_items` remains a compatibility root during migration; its flat name/nutrition/serving/category/cuisine/verification/market columns are not new target authority.
- Do not drop or rewrite applied migrations.
- Do not delete or rewrite historical Diary, Recipe, Saved Meal, Meal Plan, or other frozen nutrition snapshots.
- Do not mutate My Foods, favorites, or personal nutrition overrides.
- Missing nutrition remains `NULL`; explicit source zero remains `0`.
- No Food population, USDA adapter, activation, Catalog Generation promotion, new search ranking, or member-facing UI redesign in this plan.
- No Production migration application or Production data mutation in this plan.
- No paid provider, paid search vendor, second database, queue, distributed cache, or new infrastructure dependency.
- All new internal/control-plane relations use RLS and are not broad anon/authenticated mutation surfaces.
- Immutable domain facts are never edited in place; corrections create new facts/assertions/events in later plans.
- Before any future destructive retirement of legacy columns/functions, re-check live Production state and stop on unaccounted global catalog rows/references instead of assuming the catalog is still empty.

---

## Program boundary

This is **Plan 1** from `docs/superpowers/plans/2026-09-01-food-catalog-intelligence-program-roadmap.md`.

It intentionally does **not** implement:

- V2 consumer read service/cutover;
- activation or Catalog Generations;
- ingestion V2/quarantine;
- search projection;
- correction/control-plane commands;
- legacy-column retirement;
- USDA data operations.

Those are separate reviewable plans.

---

## File Structure

### Database

- Create exactly one forward migration ending `_food_catalog_intelligence_core.sql`.
- Create: `supabase/verification/food-catalog-intelligence-core.sql`
- Modify: `scripts/run-database-verification.mjs`
- Create: `scripts/food-catalog-intelligence-core-verification-registry.test.mjs`

### Product/migration contract tests

- Create: `lib/product/food-catalog-intelligence-core-migration.test.ts`

### Pure Food Catalog domain contracts

- Create: `lib/food-catalog/domain/nutrition.ts`
- Create: `lib/food-catalog/domain/nutrition.test.ts`
- Create: `lib/food-catalog/domain/servings.ts`
- Create: `lib/food-catalog/domain/servings.test.ts`
- Create: `lib/food-catalog/domain/names.ts`
- Create: `lib/food-catalog/domain/names.test.ts`
- Create: `lib/food-catalog/domain/taxonomy.ts`
- Create: `lib/food-catalog/domain/taxonomy.test.ts`
- Create: `lib/food-catalog/domain/markets.ts`
- Create: `lib/food-catalog/domain/markets.test.ts`
- Create: `lib/food-catalog/domain/verification.ts`
- Create: `lib/food-catalog/domain/verification.test.ts`
- Create: `lib/food-catalog/domain/identity.ts`
- Create: `lib/food-catalog/domain/identity.test.ts`

No current Food Library/Diary/Recipe route or service is modified by this plan.

---

### Task 0: Exact-base and scope preflight

**Files:**
- Read: `docs/superpowers/specs/2026-09-01-food-catalog-intelligence-architecture-design.md`
- Read: `docs/superpowers/plans/2026-09-01-food-catalog-intelligence-program-roadmap.md`
- Read: `supabase/migrations/20260830011407_food_catalog_population_readiness.sql`
- Read: `services/nutrition-v1/server/food-catalog.ts`
- Read: `services/nutrition-v1/server/food-curation.ts`

**Interfaces:**
- Consumes: approved spec and current Batch 0 schema.
- Produces: a clean implementation branch from the exact current `main` merge containing the approved spec.

- [ ] **Step 1: Verify approved design is on main**

Run:

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
git grep -n "Plaivra Food Catalog Intelligence Architecture Design" -- docs/superpowers/specs/2026-09-01-food-catalog-intelligence-architecture-design.md
```

Expected: the approved spec exists on `main`.

- [ ] **Step 2: Record the exact base and prove clean tree**

Run:

```bash
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Expected: both SHAs match and status is empty.

- [ ] **Step 3: Create one implementation branch**

Run:

```bash
git checkout -b feat/food-catalog-intelligence-core
```

- [ ] **Step 4: Confirm no scope drift**

Run:

```bash
git diff --name-only origin/main...HEAD
```

Expected: empty output before Task 1.

---

### Task 1: Define the RED migration contract

**Files:**
- Create: `lib/product/food-catalog-intelligence-core-migration.test.ts`

**Interfaces:**
- Consumes: existing migration conventions and `public.food_items` stable root.
- Produces: executable contract for one additive V2-core migration.

- [ ] **Step 1: Write the failing migration-discovery test**

Create the test with a branch-diff discovery pattern instead of hard-coding a migration timestamp:

```ts
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const base = execFileSync("git", ["merge-base", "origin/main", "HEAD"], { encoding: "utf8" }).trim();
const suffix = "_food_catalog_intelligence_core.sql";
const files = execFileSync(
  "git",
  ["diff", "--name-only", `${base}...HEAD`, "--", "supabase/migrations"],
  { encoding: "utf8" },
).split(/\r?\n/).map((value) => value.trim()).filter((value) => value.endsWith(suffix));
const migrationPath = files.length === 1 ? files[0] : null;
const sql = migrationPath ? readFileSync(migrationPath, "utf8").toLowerCase() : "";

describe("Food Catalog Intelligence core migration", () => {
  it("creates exactly one forward core migration", () => {
    expect(files).toHaveLength(1);
    expect(migrationPath).toMatch(/^supabase\/migrations\/\d{14}_food_catalog_intelligence_core\.sql$/);
  });
});
```

- [ ] **Step 2: Extend RED expectations for target relations**

Assert creation of exactly these target relations:

```ts
for (const table of [
  "food_nutrition_revisions",
  "food_serving_options",
  "food_names",
  "food_taxonomy_namespaces",
  "food_taxonomy_nodes",
  "food_taxonomy_assignments",
  "market_scopes",
  "market_scope_memberships",
  "food_market_assignments",
  "food_verification_assertions",
  "food_merge_events",
]) {
  expect(sql).toMatch(new RegExp(`create\\s+table\\s+public\\.${table}\\b`));
}
```

Also assert:

```ts
expect(sql).not.toMatch(/drop\s+table\s+public\.food_items/);
expect(sql).not.toMatch(/drop\s+column\s+(food_name|serving_size|calories|protein_g|carbs_g|fat_g|is_verified)/);
expect(sql).not.toMatch(/insert\s+into\s+public\.food_items/);
expect(sql).not.toMatch(/update\s+public\.release_schema_compatibility/);
```

- [ ] **Step 3: Add RED invariants**

The test must assert:

```ts
expect(sql).toContain("food_nutrition_revisions_immutable");
expect(sql).toContain("food_serving_options_immutable");
expect(sql).toContain("food_names_immutable");
expect(sql).toContain("food_taxonomy_assignments_immutable");
expect(sql).toContain("food_market_assignments_immutable");
expect(sql).toContain("food_verification_assertions_immutable");
expect(sql).toContain("food_merge_events_immutable");
expect(sql).toContain("foreign key (source_record_id, food_id)");
expect(sql).toContain("references public.food_source_records(id, food_id)");
```

Assert no fixed three-locale check:

```ts
expect(sql).not.toMatch(/language_tag\s+in\s*\(\s*'en'\s*,\s*'de'\s*,\s*'ar'/);
```

- [ ] **Step 4: Run RED**

Run:

```bash
npx vitest run --config vitest.unit.config.mjs lib/product/food-catalog-intelligence-core-migration.test.ts
```

Expected: FAIL because the core migration does not exist.

- [ ] **Step 5: Commit RED contract**

```bash
git add lib/product/food-catalog-intelligence-core-migration.test.ts
git commit -m "test(food-catalog): define V2 core schema contract"
```

---

### Task 2: Create the additive core migration — nutrition, servings, and names

**Files:**
- Create: `supabase/migrations/<timestamp>_food_catalog_intelligence_core.sql`
- Test: `lib/product/food-catalog-intelligence-core-migration.test.ts`

**Interfaces:**
- Consumes: `public.food_items(id)` and versioned `public.food_source_records(id, food_id)`.
- Produces: immutable nutrition revisions, serving options, and provenance-aware multilingual name facts.

- [ ] **Step 1: Create the migration file**

Run:

```bash
supabase migration new food_catalog_intelligence_core
```

If the CLI is unavailable, create one UTC 14-digit timestamped migration after verifying no collision.

- [ ] **Step 2: Add a shared insert-only mutation guard**

Create one private trigger function:

```sql
create or replace function private.reject_food_catalog_immutable_fact_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'Food Catalog immutable fact rows cannot be updated or deleted.' using errcode = '23514';
end
$function$;
```

Use it only on relations declared immutable in this plan.

- [ ] **Step 3: Create `food_nutrition_revisions`**

Use this shape:

```sql
create table public.food_nutrition_revisions (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.food_items(id) on delete restrict,
  revision_number integer not null check (revision_number > 0),
  calories numeric check (calories is null or calories >= 0),
  protein_g numeric check (protein_g is null or protein_g >= 0),
  carbs_g numeric check (carbs_g is null or carbs_g >= 0),
  fat_g numeric check (fat_g is null or fat_g >= 0),
  saturated_fat_g numeric check (saturated_fat_g is null or saturated_fat_g >= 0),
  fiber_g numeric check (fiber_g is null or fiber_g >= 0),
  sugars_g numeric check (sugars_g is null or sugars_g >= 0),
  sodium_mg numeric check (sodium_mg is null or sodium_mg >= 0),
  basis_amount numeric not null check (basis_amount > 0),
  basis_unit text not null check (basis_unit in ('g', 'ml')),
  source_record_id uuid,
  nutrient_mapping_version text not null check (length(btrim(nutrient_mapping_version)) > 0),
  authority_reference text,
  created_at timestamptz not null default now(),
  unique (food_id, revision_number),
  foreign key (source_record_id, food_id)
    references public.food_source_records(id, food_id) on delete restrict
);
```

Do not add a mutable `is_current` or `is_verified` flag. Current/effective selection belongs to the later Catalog Generation plan.

- [ ] **Step 4: Create `food_serving_options`**

```sql
create table public.food_serving_options (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.food_items(id) on delete restrict,
  label text not null check (length(btrim(label)) > 0),
  amount numeric not null check (amount > 0),
  unit_code text not null check (length(btrim(unit_code)) > 0),
  gram_weight numeric check (gram_weight is null or gram_weight > 0),
  source_record_id uuid,
  source_portion_code text,
  evidence_class text not null check (evidence_class in ('exact_source', 'source_estimated')),
  source_primary boolean not null default false,
  authority_reference text,
  created_at timestamptz not null default now(),
  foreign key (source_record_id, food_id)
    references public.food_source_records(id, food_id) on delete restrict,
  check (gram_weight is not null or unit_code in ('g', 'ml'))
);
```

The final check prevents a household/unit serving from existing without a conversion basis. This table does not authorize generic cup/piece conversions.

- [ ] **Step 5: Create `food_names`**

```sql
create table public.food_names (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.food_items(id) on delete restrict,
  language_tag text not null check (length(btrim(language_tag)) > 0),
  name_role text not null check (name_role in ('preferred_display', 'source_name', 'synonym', 'search_alias', 'transliteration')),
  name_text text not null check (length(btrim(name_text)) > 0),
  normalized_text text not null check (length(btrim(normalized_text)) > 0),
  script_code text,
  origin text not null check (origin in ('source', 'curated', 'migration')),
  source_record_id uuid,
  policy_version text not null check (length(btrim(policy_version)) > 0),
  created_at timestamptz not null default now(),
  foreign key (source_record_id, food_id)
    references public.food_source_records(id, food_id) on delete restrict
);
```

Do not add `CHECK (language_tag IN ('en','de','ar'))`.

- [ ] **Step 6: Attach immutability triggers**

Attach `BEFORE UPDATE OR DELETE` triggers named:

```text
food_nutrition_revisions_immutable
food_serving_options_immutable
food_names_immutable
```

- [ ] **Step 7: Add focused indexes**

At minimum:

```sql
create index food_nutrition_revisions_food_idx
  on public.food_nutrition_revisions(food_id, revision_number desc);
create index food_serving_options_food_idx
  on public.food_serving_options(food_id, created_at, id);
create index food_names_food_language_idx
  on public.food_names(food_id, language_tag, name_role, id);
create index food_names_normalized_idx
  on public.food_names(language_tag, normalized_text, food_id);
```

- [ ] **Step 8: Run focused contract test**

```bash
npx vitest run --config vitest.unit.config.mjs lib/product/food-catalog-intelligence-core-migration.test.ts
```

Expected: still RED until Tasks 3–4 complete, but failures for these three relations/invariants are gone.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/*_food_catalog_intelligence_core.sql lib/product/food-catalog-intelligence-core-migration.test.ts
git commit -m "feat(food-catalog): add versioned nutrition servings and names"
```

---

### Task 3: Add taxonomy and market registries

**Files:**
- Modify: `supabase/migrations/<timestamp>_food_catalog_intelligence_core.sql`
- Test: `lib/product/food-catalog-intelligence-core-migration.test.ts`

**Interfaces:**
- Consumes: stable Food IDs and same-Food provenance.
- Produces: controlled taxonomy and market registries independent of Food identity and language.

- [ ] **Step 1: Extend RED test for controlled registry shapes**

Add assertions that the migration contains stable text-code primary keys and no `is_german`, `is_egyptian`, `is_saudi`, or `is_gcc` Food columns.

```ts
expect(sql).toMatch(/namespace_code\s+text\s+primary\s+key/);
expect(sql).toMatch(/scope_code\s+text\s+primary\s+key/);
expect(sql).not.toMatch(/add\s+column\s+is_(german|egyptian|saudi|gcc)/);
```

- [ ] **Step 2: Create taxonomy namespaces/nodes**

```sql
create table public.food_taxonomy_namespaces (
  namespace_code text primary key check (namespace_code ~ '^[a-z0-9_]+$'),
  lifecycle_status text not null default 'active' check (lifecycle_status in ('active', 'deprecated')),
  created_at timestamptz not null default now()
);

create table public.food_taxonomy_nodes (
  node_code text primary key check (node_code ~ '^[a-z0-9_]+$'),
  namespace_code text not null references public.food_taxonomy_namespaces(namespace_code) on delete restrict,
  parent_node_code text references public.food_taxonomy_nodes(node_code) on delete restrict,
  lifecycle_status text not null default 'active' check (lifecycle_status in ('active', 'deprecated')),
  replacement_node_code text references public.food_taxonomy_nodes(node_code) on delete restrict,
  created_at timestamptz not null default now(),
  check (parent_node_code is null or parent_node_code <> node_code),
  check (replacement_node_code is null or replacement_node_code <> node_code)
);
```

- [ ] **Step 3: Seed only approved stable registry codes**

Insert namespaces:

```text
primary_food_group
ingredient_family
preparation
physical_state
form_cut
cuisine
```

Insert initial `primary_food_group` nodes:

```text
protein_foods
dairy
grains
vegetables
fruits
legumes
nuts_seeds
fats_oils
beverages
mixed_dishes
snacks
desserts
condiments
other
```

These are controlled reference rows, not Food population.

- [ ] **Step 4: Create immutable taxonomy assignment facts**

```sql
create table public.food_taxonomy_assignments (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.food_items(id) on delete restrict,
  node_code text not null references public.food_taxonomy_nodes(node_code) on delete restrict,
  source_record_id uuid,
  assignment_action text not null check (assignment_action in ('assign', 'remove')),
  policy_version text not null check (length(btrim(policy_version)) > 0),
  created_at timestamptz not null default now(),
  foreign key (source_record_id, food_id)
    references public.food_source_records(id, food_id) on delete restrict
);
```

Attach `food_taxonomy_assignments_immutable` before update/delete.

- [ ] **Step 5: Create market registry**

```sql
create table public.market_scopes (
  scope_code text primary key check (scope_code ~ '^[A-Z0-9_]+$'),
  scope_kind text not null check (scope_kind in ('global', 'country', 'region', 'group')),
  lifecycle_status text not null default 'active' check (lifecycle_status in ('active', 'deprecated')),
  created_at timestamptz not null default now()
);

create table public.market_scope_memberships (
  child_scope_code text not null references public.market_scopes(scope_code) on delete restrict,
  parent_scope_code text not null references public.market_scopes(scope_code) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (child_scope_code, parent_scope_code),
  check (child_scope_code <> parent_scope_code)
);
```

Seed:

```text
GLOBAL(global), US(country), DE(country), EG(country), GB(country), SA(country), AE(country), EU(region), GCC(region)
```

Seed memberships:

```text
DE → EU
SA → GCC
AE → GCC
```

- [ ] **Step 6: Create immutable Food-market assignment facts**

```sql
create table public.food_market_assignments (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.food_items(id) on delete restrict,
  scope_code text not null references public.market_scopes(scope_code) on delete restrict,
  relevance_level text not null check (relevance_level in ('primary', 'secondary')),
  source_record_id uuid,
  assignment_action text not null check (assignment_action in ('assign', 'remove')),
  policy_version text not null check (length(btrim(policy_version)) > 0),
  created_at timestamptz not null default now(),
  foreign key (source_record_id, food_id)
    references public.food_source_records(id, food_id) on delete restrict
);
```

Attach `food_market_assignments_immutable` before update/delete.

- [ ] **Step 7: Run the focused migration test**

```bash
npx vitest run --config vitest.unit.config.mjs lib/product/food-catalog-intelligence-core-migration.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/*_food_catalog_intelligence_core.sql lib/product/food-catalog-intelligence-core-migration.test.ts
git commit -m "feat(food-catalog): add taxonomy and market registries"
```

---

### Task 4: Add verification assertions and immutable merge evidence

**Files:**
- Modify: `supabase/migrations/<timestamp>_food_catalog_intelligence_core.sql`
- Test: `lib/product/food-catalog-intelligence-core-migration.test.ts`

**Interfaces:**
- Consumes: stable Food IDs and source provenance.
- Produces: assertion-based verification facts and immutable canonical-merge evidence without making them current authority yet.

- [ ] **Step 1: Add RED assertion-based verification checks**

```ts
expect(sql).toMatch(/assertion_scope\s+text[\s\S]*identity[\s\S]*nutrition[\s\S]*serving[\s\S]*barcode/);
expect(sql).toMatch(/assertion_state\s+text[\s\S]*verified[\s\S]*revoked/);
expect(sql).not.toMatch(/add\s+column\s+is_verified\s+boolean/);
```

- [ ] **Step 2: Create `food_verification_assertions`**

```sql
create table public.food_verification_assertions (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.food_items(id) on delete restrict,
  assertion_scope text not null check (assertion_scope in ('identity', 'nutrition', 'serving', 'barcode', 'localization')),
  assertion_state text not null check (assertion_state in ('verified', 'revoked')),
  policy_version text not null check (length(btrim(policy_version)) > 0),
  source_record_id uuid,
  supersedes_assertion_id uuid references public.food_verification_assertions(id) on delete restrict,
  reason_code text not null check (length(btrim(reason_code)) > 0),
  authority_reference text not null check (length(btrim(authority_reference)) > 0),
  created_at timestamptz not null default now(),
  foreign key (source_record_id, food_id)
    references public.food_source_records(id, food_id) on delete restrict,
  check (supersedes_assertion_id is null or supersedes_assertion_id <> id)
);
```

Add an insert guard function that rejects a `supersedes_assertion_id` pointing to a different Food or assertion scope.

Attach `food_verification_assertions_immutable` before update/delete.

- [ ] **Step 3: Create `food_merge_events`**

```sql
create table public.food_merge_events (
  id uuid primary key default gen_random_uuid(),
  source_food_id uuid not null references public.food_items(id) on delete restrict,
  target_food_id uuid not null references public.food_items(id) on delete restrict,
  policy_version text not null check (length(btrim(policy_version)) > 0),
  reason_code text not null check (length(btrim(reason_code)) > 0),
  evidence_reference text,
  authority_reference text not null check (length(btrim(authority_reference)) > 0),
  created_at timestamptz not null default now(),
  check (source_food_id <> target_food_id)
);
```

Create an insert guard that rejects a target whose current compatibility projection is already `lifecycle_status = 'merged'` or has a non-null `merged_into_food_id`. This prevents a new event from intentionally creating a redirect chain while the legacy projection still exists.

Attach `food_merge_events_immutable` before update/delete.

- [ ] **Step 4: Add indexes**

```sql
create index food_verification_assertions_food_scope_idx
  on public.food_verification_assertions(food_id, assertion_scope, created_at desc, id);
create index food_merge_events_source_idx
  on public.food_merge_events(source_food_id, created_at desc, id);
create index food_merge_events_target_idx
  on public.food_merge_events(target_food_id, created_at desc, id);
```

- [ ] **Step 5: Run migration contract test**

```bash
npx vitest run --config vitest.unit.config.mjs lib/product/food-catalog-intelligence-core-migration.test.ts
```

Expected: PASS for all schema-contract assertions after Task 5 security wiring is added.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/*_food_catalog_intelligence_core.sql lib/product/food-catalog-intelligence-core-migration.test.ts
git commit -m "feat(food-catalog): add verification and merge evidence"
```

---

### Task 5: Lock down RLS and privileges for the new core relations

**Files:**
- Modify: `supabase/migrations/<timestamp>_food_catalog_intelligence_core.sql`
- Test: `lib/product/food-catalog-intelligence-core-migration.test.ts`

**Interfaces:**
- Consumes: all new core relations.
- Produces: service-role/internal-only mutation boundary; no new member direct-table write surface.

- [ ] **Step 1: Add RED privilege assertions**

For every new relation, assert `ENABLE ROW LEVEL SECURITY`, revoke from `anon, authenticated`, and no broad authenticated mutation grant.

- [ ] **Step 2: Apply RLS to all new relations**

Add:

```sql
alter table public.food_nutrition_revisions enable row level security;
alter table public.food_serving_options enable row level security;
alter table public.food_names enable row level security;
alter table public.food_taxonomy_namespaces enable row level security;
alter table public.food_taxonomy_nodes enable row level security;
alter table public.food_taxonomy_assignments enable row level security;
alter table public.market_scopes enable row level security;
alter table public.market_scope_memberships enable row level security;
alter table public.food_market_assignments enable row level security;
alter table public.food_verification_assertions enable row level security;
alter table public.food_merge_events enable row level security;
```

- [ ] **Step 3: Revoke broad member access and retain internal authority**

Use the existing Batch 0 pattern:

```sql
revoke all on public.<table> from anon, authenticated;
grant all privileges on public.<table> to service_role;
```

Do not create member policies in this plan. Later member reads go through the Food Catalog domain service/projection.

- [ ] **Step 4: Run migration contract test**

```bash
npx vitest run --config vitest.unit.config.mjs lib/product/food-catalog-intelligence-core-migration.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/*_food_catalog_intelligence_core.sql lib/product/food-catalog-intelligence-core-migration.test.ts
git commit -m "fix(food-catalog): enforce V2 core least privilege"
```

---

### Task 6: Add transactional local database verification

**Files:**
- Create: `supabase/verification/food-catalog-intelligence-core.sql`
- Modify: `scripts/run-database-verification.mjs`
- Create: `scripts/food-catalog-intelligence-core-verification-registry.test.mjs`

**Interfaces:**
- Consumes: the new migration and existing disposable-local verification runner.
- Produces: executable DB evidence for FK, immutability, same-Food provenance, locale flexibility, market registry, and merge/assertion guards.

- [ ] **Step 1: Write registry test first**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { DATABASE_VERIFICATION_FILES } from "./run-database-verification.mjs";

const CORE = "supabase/verification/food-catalog-intelligence-core.sql";
const PREFLIGHT = "supabase/verification/production-release-migration-preflight.sql";

test("Food Catalog Intelligence core verification runs before release preflight", () => {
  const core = DATABASE_VERIFICATION_FILES.indexOf(CORE);
  const preflight = DATABASE_VERIFICATION_FILES.indexOf(PREFLIGHT);
  assert.ok(core >= 0);
  assert.ok(preflight > core);
});
```

- [ ] **Step 2: Run registry test RED**

```bash
node --test scripts/food-catalog-intelligence-core-verification-registry.test.mjs
```

Expected: FAIL because the verification file is not registered.

- [ ] **Step 3: Register verification file**

Insert:

```text
supabase/verification/food-catalog-intelligence-core.sql
```

in `DATABASE_VERIFICATION_FILES` after existing Food Catalog Batch 0/concurrency verification and before `production-release-migration-preflight.sql`.

- [ ] **Step 4: Write transactional SQL verification**

The SQL starts with:

```sql
begin;
```

Create bounded fixture Foods/source records, then prove at minimum:

1. nutrition revision accepts `NULL` and explicit `0` distinctly;
2. negative nutrient insert fails;
3. cross-Food `source_record_id` FK fails for nutrition/serving/name/taxonomy/market facts;
4. a non-`en|de|ar` BCP-47-compatible tag such as `fr-CA` is structurally accepted;
5. household serving without `gram_weight` fails;
6. update/delete of immutable facts fails;
7. verification supersession across different Food/scope fails;
8. merge self-target fails;
9. merge event targeting an already-merged compatibility target fails;
10. `GLOBAL`, `EU`, `GCC`, and country scopes plus `DE→EU`, `SA→GCC`, `AE→GCC` exist;
11. no test row survives.

End with:

```sql
rollback;
```

- [ ] **Step 5: Run registry test GREEN**

```bash
node --test scripts/food-catalog-intelligence-core-verification-registry.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Run disposable local DB verification**

With local Supabase on port `54322`:

```bash
PLAIVRA_LOCAL_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' node scripts/run-database-verification.mjs
```

Expected: all verification SQL passes and the runner refuses any non-local database URL.

- [ ] **Step 7: Commit**

```bash
git add supabase/verification/food-catalog-intelligence-core.sql scripts/run-database-verification.mjs scripts/food-catalog-intelligence-core-verification-registry.test.mjs
git commit -m "test(food-catalog): verify V2 core database invariants"
```

---

### Task 7: Add pure TypeScript domain contracts for nutrition and servings

**Files:**
- Create: `lib/food-catalog/domain/nutrition.ts`
- Create: `lib/food-catalog/domain/nutrition.test.ts`
- Create: `lib/food-catalog/domain/servings.ts`
- Create: `lib/food-catalog/domain/servings.test.ts`

**Interfaces:**
- Consumes: approved nullable nutrition and source-backed serving rules.
- Produces: `FoodNutritionRevision`, `FoodServingOption`, `validateFoodNutritionRevision()`, `validateFoodServingOption()`.

- [ ] **Step 1: Write RED nutrition tests**

```ts
import { describe, expect, it } from "vitest";
import { validateFoodNutritionRevision } from "./nutrition";

describe("validateFoodNutritionRevision", () => {
  it("preserves unknown separately from explicit zero", () => {
    const value = validateFoodNutritionRevision({
      foodId: "food-1",
      revisionNumber: 1,
      calories: 0,
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
    });
    expect(value.calories).toBe(0);
    expect(value.protein_g).toBeNull();
  });
});
```

Add a test that a negative nutrient throws.

- [ ] **Step 2: Implement minimal nutrition contract**

```ts
export type FoodNutritionRevision = {
  foodId: string;
  revisionNumber: number;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  saturated_fat_g: number | null;
  fiber_g: number | null;
  sugars_g: number | null;
  sodium_mg: number | null;
  basisAmount: number;
  basisUnit: "g" | "ml";
  nutrientMappingVersion: string;
  sourceRecordId: string | null;
};
```

`validateFoodNutritionRevision()` checks finite/non-negative known nutrients, positive basis amount, positive integer revision number, and nonblank mapping version without filling nulls.

- [ ] **Step 3: Write RED serving tests**

Assert:

- `unitCode: "g"` may omit `gramWeight`;
- `unitCode: "cup"` without `gramWeight` throws;
- `gramWeight <= 0` throws;
- evidence class is only `exact_source | source_estimated`.

- [ ] **Step 4: Implement serving contract**

```ts
export type FoodServingOption = {
  foodId: string;
  label: string;
  amount: number;
  unitCode: string;
  gramWeight: number | null;
  sourceRecordId: string | null;
  sourcePortionCode: string | null;
  evidenceClass: "exact_source" | "source_estimated";
  sourcePrimary: boolean;
};
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run --config vitest.unit.config.mjs lib/food-catalog/domain/nutrition.test.ts lib/food-catalog/domain/servings.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/food-catalog/domain/nutrition.ts lib/food-catalog/domain/nutrition.test.ts lib/food-catalog/domain/servings.ts lib/food-catalog/domain/servings.test.ts
git commit -m "feat(food-catalog): define nutrition and serving contracts"
```

---

### Task 8: Add pure contracts for names, taxonomy, markets, verification, and identity

**Files:**
- Create: `lib/food-catalog/domain/names.ts`
- Create: `lib/food-catalog/domain/names.test.ts`
- Create: `lib/food-catalog/domain/taxonomy.ts`
- Create: `lib/food-catalog/domain/taxonomy.test.ts`
- Create: `lib/food-catalog/domain/markets.ts`
- Create: `lib/food-catalog/domain/markets.test.ts`
- Create: `lib/food-catalog/domain/verification.ts`
- Create: `lib/food-catalog/domain/verification.test.ts`
- Create: `lib/food-catalog/domain/identity.ts`
- Create: `lib/food-catalog/domain/identity.test.ts`

**Interfaces:**
- Consumes: target core schema semantics.
- Produces: stable value objects for later service/ingestion/generation plans.

- [ ] **Step 1: Define and test name facts**

Use:

```ts
export type FoodNameRole = "preferred_display" | "source_name" | "synonym" | "search_alias" | "transliteration";
export type FoodNameOrigin = "source" | "curated" | "migration";
export type FoodNameFact = {
  foodId: string;
  languageTag: string;
  role: FoodNameRole;
  text: string;
  normalizedText: string;
  scriptCode: string | null;
  origin: FoodNameOrigin;
  sourceRecordId: string | null;
  policyVersion: string;
};
```

Tests must prove `fr-CA` is accepted as a nonblank language tag and that Arabizi is represented as `languageTag: "ar"`, `scriptCode: "Latn"`, `role: "transliteration"`, not as a new `arabizi` locale.

- [ ] **Step 2: Define and test taxonomy contracts**

```ts
export type FoodTaxonomyNamespaceCode =
  | "primary_food_group"
  | "ingredient_family"
  | "preparation"
  | "physical_state"
  | "form_cut"
  | "cuisine";

export type FoodTaxonomyAssignmentAction = "assign" | "remove";
```

Expose `PRIMARY_FOOD_GROUP_CODES` containing exactly the approved initial codes from the spec.

- [ ] **Step 3: Define and test market contracts**

```ts
export type MarketScopeKind = "global" | "country" | "region" | "group";
export type FoodMarketRelevance = "primary" | "secondary";
export type FoodMarketAssignmentAction = "assign" | "remove";
```

Expose initial scope definitions for `GLOBAL, US, DE, EG, GB, SA, AE, EU, GCC` and memberships `DE→EU`, `SA→GCC`, `AE→GCC`.

- [ ] **Step 4: Define and test verification assertion contracts**

```ts
export type FoodVerificationScope = "identity" | "nutrition" | "serving" | "barcode" | "localization";
export type FoodVerificationState = "verified" | "revoked";
```

Test that verification is represented by assertions, not a boolean Food field.

- [ ] **Step 5: Define and test identity/merge contracts**

```ts
export type CanonicalDecision =
  | { kind: "match"; foodId: string }
  | { kind: "create" }
  | { kind: "possible_duplicate"; candidateFoodIds: string[] }
  | { kind: "reject"; reasonCodes: string[] };

export type FoodMergeEvent = {
  sourceFoodId: string;
  targetFoodId: string;
  policyVersion: string;
  reasonCode: string;
  evidenceReference: string | null;
  authorityReference: string;
};
```

Add `validateFoodMergeEvent()` that rejects self-merge and blank policy/reason/authority strings. It must not implement name-only or nutrition-only auto-merge logic.

- [ ] **Step 6: Run focused domain tests**

```bash
npx vitest run --config vitest.unit.config.mjs \
  lib/food-catalog/domain/names.test.ts \
  lib/food-catalog/domain/taxonomy.test.ts \
  lib/food-catalog/domain/markets.test.ts \
  lib/food-catalog/domain/verification.test.ts \
  lib/food-catalog/domain/identity.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/food-catalog/domain
git commit -m "feat(food-catalog): define core identity classification and trust contracts"
```

---

### Task 9: Full Plan-1 verification and scope guard

**Files:**
- Verify all files changed in Tasks 1–8.
- Do not modify runtime consumer files to make tests pass.

**Interfaces:**
- Consumes: complete Plan-1 implementation.
- Produces: review-ready additive V2 core foundation.

- [ ] **Step 1: Run all focused Food Catalog core unit tests**

```bash
npx vitest run --config vitest.unit.config.mjs \
  lib/product/food-catalog-intelligence-core-migration.test.ts \
  lib/food-catalog/domain/nutrition.test.ts \
  lib/food-catalog/domain/servings.test.ts \
  lib/food-catalog/domain/names.test.ts \
  lib/food-catalog/domain/taxonomy.test.ts \
  lib/food-catalog/domain/markets.test.ts \
  lib/food-catalog/domain/verification.test.ts \
  lib/food-catalog/domain/identity.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run script/registry tests**

```bash
node --test scripts/food-catalog-intelligence-core-verification-registry.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run repository type/lint checks**

```bash
npm run typecheck
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Run the disposable database verification chain**

```bash
PLAIVRA_LOCAL_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' node scripts/run-database-verification.mjs
```

Expected: PASS. Do not point this runner at Production; it must refuse non-local targets.

- [ ] **Step 5: Prove no prohibited scope changes**

Run:

```bash
git diff --name-only origin/main...HEAD
```

Expected changed paths are limited to:

```text
supabase/migrations/*_food_catalog_intelligence_core.sql
supabase/verification/food-catalog-intelligence-core.sql
scripts/run-database-verification.mjs
scripts/food-catalog-intelligence-core-verification-registry.test.mjs
lib/product/food-catalog-intelligence-core-migration.test.ts
lib/food-catalog/domain/**
```

No Food population file, source dataset, UI component, Diary/Recipe/Saved Meal/Meal Plan runtime file, current Food Library search implementation, or Production compatibility marker is changed.

- [ ] **Step 6: Review migration for data-destructive SQL**

Run:

```bash
git diff origin/main...HEAD -- supabase/migrations
```

Manually verify there is no:

```text
DROP TABLE public.food_items
DROP COLUMN legacy Food fields
DELETE/TRUNCATE Food/user data
INSERT INTO public.food_items
Production dataset seed
release_schema_compatibility mutation
```

- [ ] **Step 7: Final commit if verification-only corrections were required**

```bash
git add -A
git commit -m "test(food-catalog): close V2 core foundation"
```

Skip this commit if the working tree is already clean.

- [ ] **Step 8: Stop at review gate**

Open one PR for Plan 1 and stop. The PR must state explicitly:

```text
- additive V2 core schema only
- no consumer cutover
- no Food population
- no Production migration application
- no activation/generation promotion
- next implementation authority is Plan 2 only after Plan 1 review/merge
```

Do not merge, deploy, or apply the migration to Production without the separate release authority required by the project workflow.

---

## Plan 1 Acceptance Criteria

Plan 1 is complete only when:

1. one additive forward migration introduces every core target relation listed in Task 1;
2. existing `food_items.id` remains stable and no current consumer is forced to change;
3. nutrition revisions preserve `NULL` vs explicit zero and are immutable;
4. household serving conversions require source-backed weight evidence;
5. names support open BCP-47-style language tags and provenance; Arabizi is an Arabic-context transliteration, not a locale;
6. taxonomy uses controlled stable registry codes and immutable assignment facts;
7. market uses a registry/membership model rather than country-specific Food columns;
8. verification is assertion-based and merge decisions have immutable event evidence;
9. same-Food provenance is DB-enforced for source-backed facts;
10. new core relations are least-privilege and not member direct-write surfaces;
11. transactional local DB verification proves immutability and referential guards;
12. current Food Library/search/Diary/Recipe/Meal Plan/MCP behavior is unchanged by this plan;
13. no global Food is populated or activated;
14. no Production mutation occurs.
