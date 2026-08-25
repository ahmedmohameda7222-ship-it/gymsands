import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260825120000_nutrition_v1_reusable_domains.sql",
  "utf8",
).replaceAll("\r\n", "\n").toLowerCase();

const verification = readFileSync(
  "supabase/verification/nutrition-v1-reusable-domains.sql",
  "utf8",
).replaceAll("\r\n", "\n").toLowerCase();

const databaseVerification = readFileSync(
  "scripts/run-database-verification.mjs",
  "utf8",
).replaceAll("\r\n", "\n").toLowerCase();

function tableDefinition(table: string) {
  const match = migration.match(
    new RegExp(`create table if not exists public\\.${table} \\([\\s\\S]*?\\n\\);`),
  );
  if (!match) throw new Error(`Missing ${table} table definition.`);
  return match[0];
}

describe("Nutrition V1 reusable-domain migration contract", () => {
  it("creates the eight additive canonical Recipe and Saved Meal tables", () => {
    for (const table of [
      "nutrition_recipes",
      "nutrition_recipe_versions",
      "nutrition_recipe_drafts",
      "nutrition_recipe_ingredients",
      "nutrition_recipe_actions",
      "nutrition_recipe_equipment",
      "nutrition_saved_meals",
      "nutrition_saved_meal_items",
    ]) {
      expect(migration).toContain(`create table if not exists public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }

    expect(migration).not.toMatch(/drop\s+table\s+(if\s+exists\s+)?public\.(saved_recipes|custom_meals|custom_meal_items)/);
  });

  it("keeps published Recipe versions immutable to direct authenticated mutation", () => {
    expect(migration).toContain("create or replace function private.prevent_nutrition_recipe_version_update");
    expect(migration).toContain("before update on public.nutrition_recipe_versions");
    expect(migration).toContain("revoke update, delete on public.nutrition_recipe_versions from authenticated");
    expect(migration).toContain("grant select, insert on public.nutrition_recipe_versions to authenticated");
  });

  it("models Saved Meal children as Food or frozen Recipe-version lineage without recursive meals", () => {
    const items = tableDefinition("nutrition_saved_meal_items");
    expect(items).toContain("item_type text not null check (item_type in ('food', 'recipe'))");
    expect(items).toContain("recipe_id uuid");
    expect(items).toContain("recipe_version_id uuid");
    expect(items).toContain("frozen_snapshot jsonb not null");
    expect(items).not.toMatch(/saved_meal_item_id\s+uuid/);
    expect(items).not.toMatch(/recipe_id\s+uuid[^,;]*references\s+public\.nutrition_recipes/);
    expect(items).not.toMatch(/recipe_version_id\s+uuid[^,;]*references\s+public\.nutrition_recipe_versions/);
  });

  it("implements the approved 30-day Recipe and Saved Meal recovery lifecycle", () => {
    for (const source of ["nutrition_recipes", "nutrition_saved_meals"]) {
      const definition = tableDefinition(source);
      expect(definition).toContain("deleted_at timestamptz");
      expect(definition).toContain("purge_after timestamptz");
    }

    for (const fn of [
      "soft_delete_nutrition_recipe",
      "restore_nutrition_recipe",
      "purge_nutrition_recipe_now",
      "soft_delete_nutrition_saved_meal",
      "restore_nutrition_saved_meal",
      "purge_nutrition_saved_meal_now",
    ]) {
      expect(migration).toContain(`create or replace function public.${fn}`);
    }

    expect(migration).toContain("interval '30 days'");
    expect(migration).toContain("deleted_at is not null");
    expect(migration).toContain("purge_after > clock_timestamp()");
  });

  it("creates a private owner-scoped Recipe cover bucket", () => {
    expect(migration).toContain("'recipe-covers'");
    expect(migration).toContain("public = false");
    expect(migration).toContain("bucket_id = 'recipe-covers'");
    expect(migration).toContain("(storage.foldername(name))[1] = (select auth.uid())::text");
  });

  it("keeps direct table access owner-scoped and lifecycle mutation behind RPCs", () => {
    for (const table of ["nutrition_recipes", "nutrition_recipe_drafts", "nutrition_saved_meals"]) {
      expect(migration).toContain(`user_id = (select auth.uid())`);
      expect(migration).toContain(`on public.${table}`);
    }
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog, public");
  });

  it("ships executable verification for RLS, legacy preservation, frozen lineage, and cover privacy", () => {
    for (const phrase of [
      "nutrition v1 reusable domain table missing",
      "nutrition v1 reusable domain rls missing",
      "legacy nutrition compatibility table missing",
      "saved meal recipe lineage unexpectedly cascades",
      "recipe cover bucket is not private",
    ]) {
      expect(verification).toContain(phrase);
    }

    const nutritionVerification = databaseVerification.indexOf(
      "nutrition-v1-reusable-domains.sql",
    );
    const releasePreflight = databaseVerification.indexOf(
      "production-release-migration-preflight.sql",
    );
    expect(nutritionVerification).toBeGreaterThanOrEqual(0);
    expect(releasePreflight).toBeGreaterThan(nutritionVerification);
  });
});
