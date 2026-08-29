import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260825120300_nutrition_v1_food_search_and_curation.sql",
  "utf8",
)
  .replaceAll("\r\n", "\n")
  .toLowerCase();

const verification = readFileSync(
  "supabase/verification/nutrition-v1-food-search-and-curation.sql",
  "utf8",
)
  .replaceAll("\r\n", "\n")
  .toLowerCase();

const databaseVerification = readFileSync(
  "scripts/run-database-verification.mjs",
  "utf8",
)
  .replaceAll("\r\n", "\n")
  .toLowerCase();

function tableDefinition(table: string) {
  const match = migration.match(
    new RegExp(`create table if not exists public\\.${table} \\([\\s\\S]*?\\n\\);`),
  );
  if (!match) throw new Error(`Missing ${table} table definition.`);
  return match[0];
}

describe("Nutrition V1 Food search and curation migration contract", () => {
  it("adds multilingual aliases for stable canonical Food identities", () => {
    const aliases = tableDefinition("food_aliases");

    expect(aliases).toContain("food_id uuid not null references public.food_items(id)");
    expect(aliases).toContain("locale text not null check (locale in ('en', 'de', 'ar'))");
    expect(aliases).toContain("alias text not null");
    expect(aliases).toContain("normalized_alias text not null");
    expect(aliases).toContain("unique (food_id, locale, normalized_alias)");
  });

  it("stores attributed provenance and keeps imported provider evidence separate from verification", () => {
    const sources = tableDefinition("food_source_records");

    for (const field of [
      "provider text not null",
      "source_record_id text not null",
      "source_reference text",
      "license_name text not null",
      "license_reference text",
      "retrieved_at timestamptz not null",
      "source_nutrition jsonb",
      "source_serving jsonb",
      "review_metadata jsonb",
    ]) {
      expect(sources).toContain(field);
    }
    expect(sources).toContain("food_id uuid references public.food_items(id)");
    expect(sources).toContain("unique (provider, source_record_id)");

    expect(migration).toContain("add column if not exists is_verified boolean not null default false");
    expect(migration).toContain("add column if not exists verified_at timestamptz");
    expect(migration).toContain("add column if not exists verified_source_record_id uuid");
    expect(migration).not.toContain("is_unverified");
    expect(migration).not.toContain("unverified_badge");
    expect(migration).not.toMatch(/trigger[\s\S]{0,160}source[\s\S]{0,160}verified/);
  });

  it("keeps personal corrections owner-scoped, nullable, reversible, and separate from canonical verification", () => {
    const corrections = tableDefinition("food_personal_corrections");

    expect(corrections).toContain("user_id uuid not null references public.profiles(id)");
    expect(corrections).toContain("food_id uuid not null references public.food_items(id)");
    for (const nutrient of [
      "calories numeric",
      "protein_g numeric",
      "carbs_g numeric",
      "fat_g numeric",
      "saturated_fat_g numeric",
      "fiber_g numeric",
      "sugars_g numeric",
      "sodium_mg numeric",
    ]) {
      expect(corrections).toContain(nutrient);
    }
    expect(corrections).toContain("is_active boolean not null default true");
    expect(corrections).toContain("unique (user_id, food_id)");
    expect(migration).toContain("alter table public.food_personal_corrections enable row level security");
    expect(migration).toContain("on public.food_personal_corrections");
    expect(migration).toContain("user_id = (select auth.uid())");
    expect(corrections).not.toContain("is_verified");
  });

  it("stores explicit favorites uniquely per user and canonical Food", () => {
    const favorites = tableDefinition("food_favorites");

    expect(favorites).toContain("user_id uuid not null references public.profiles(id)");
    expect(favorites).toContain("food_id uuid not null references public.food_items(id)");
    expect(favorites).toContain("unique (user_id, food_id)");
    expect(migration).toContain("alter table public.food_favorites enable row level security");
  });

  it("supports safe durable duplicate redirects without destructive AI auto-merge", () => {
    expect(migration).toContain("add column if not exists merged_into_food_id uuid");
    expect(migration).toContain("references public.food_items(id) on delete restrict");
    expect(migration).toContain("food_items_no_self_merge");
    expect(migration).not.toMatch(/delete\s+from\s+public\.food_items[\s\S]{0,200}(duplicate|merge)/);
    expect(migration).not.toMatch(/(ai|chatgpt)[\s\S]{0,120}(auto[_ -]?merge|merge_food)/);
  });

  it("creates indexed Main-DB search support for canonical names and aliases", () => {
    expect(migration).toContain('create extension if not exists "pg_trgm"');
    expect(migration).toContain("food_aliases_normalized_trgm_idx");
    expect(migration).toContain("food_items_name_trgm_idx");
    expect(migration).toContain("using gin");
    expect(migration).toContain("gin_trgm_ops");
  });

  it("ships executable verification and registers it before release preflight", () => {
    for (const phrase of [
      "nutrition v1 food alias locale contract missing",
      "nutrition v1 food provenance contract missing",
      "nutrition v1 food personal correction owner isolation leaked",
      "nutrition v1 food favorite uniqueness missing",
      "nutrition v1 food verification boundary invalid",
      "nutrition v1 food search index missing",
      "nutrition v1 food duplicate redirect invalid",
    ]) {
      expect(verification).toContain(phrase);
    }

    const nutritionVerification = databaseVerification.indexOf(
      "nutrition-v1-food-search-and-curation.sql",
    );
    const releasePreflight = databaseVerification.indexOf(
      "production-release-migration-preflight.sql",
    );
    expect(nutritionVerification).toBeGreaterThanOrEqual(0);
    expect(releasePreflight).toBeGreaterThan(nutritionVerification);
  });
});
