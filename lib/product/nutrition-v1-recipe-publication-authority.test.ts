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

const service = readFileSync(
  "services/nutrition-v1/server/recipes.ts",
  "utf8",
).replaceAll("\r\n", "\n").toLowerCase();

describe("Nutrition V1 Recipe publication authority", () => {
  it("publishes through one owner-derived transactional database command", () => {
    expect(migration).toContain(
      "create or replace function public.publish_nutrition_recipe_draft(p_recipe_id uuid)",
    );
    expect(migration).toContain("v_user_id uuid := auth.uid()");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog, public");
    expect(migration).toContain("authentication required");
    expect(migration).toContain("grant execute on function public.publish_nutrition_recipe_draft(uuid) to authenticated");
    expect(migration).toContain("revoke all on function public.publish_nutrition_recipe_draft(uuid) from public, anon");
  });

  it("creates a new immutable version from the Working Draft and removes that Draft in the same command", () => {
    const start = migration.indexOf(
      "create or replace function public.publish_nutrition_recipe_draft(p_recipe_id uuid)",
    );
    expect(start).toBeGreaterThanOrEqual(0);
    const body = migration.slice(start, migration.indexOf("$$;", start) + 3);

    expect(body).toContain("insert into public.nutrition_recipe_versions");
    expect(body).toContain("max(version_number)");
    expect(body).toContain("insert into public.nutrition_recipe_ingredients");
    expect(body).toContain("insert into public.nutrition_recipe_actions");
    expect(body).toContain("insert into public.nutrition_recipe_equipment");
    expect(body).toContain("delete from public.nutrition_recipe_drafts");
    expect(body).toContain("update public.nutrition_recipes");
    expect(body).not.toContain("update public.nutrition_recipe_versions");
  });

  it("rejects incomplete Draft publication inside the database authority", () => {
    const start = migration.indexOf(
      "create or replace function public.publish_nutrition_recipe_draft(p_recipe_id uuid)",
    );
    expect(start).toBeGreaterThanOrEqual(0);
    const body = migration.slice(start, migration.indexOf("$$;", start) + 3);

    expect(body).toMatch(/servings[^\n]*is null|v_servings is null/);
    expect(body).toMatch(/nutrition_recipe_ingredients/);
    expect(body).toMatch(/nutrition_recipe_actions/);
    expect(body).toMatch(/working draft.*not ready|not ready.*working draft/);
  });

  it("routes the server helper through the publication RPC instead of direct published-table writes", () => {
    const start = service.indexOf("export async function publishrecipedraft");
    expect(start).toBeGreaterThanOrEqual(0);
    const end = service.indexOf("export async function discardrecipedraft", start);
    const body = service.slice(start, end);

    expect(body).toContain('supabase.rpc("publish_nutrition_recipe_draft"');
    expect(body).not.toContain('.from("nutrition_recipe_versions")');
    expect(body).not.toContain('.from("nutrition_recipe_ingredients")');
    expect(body).not.toContain('.from("nutrition_recipe_actions")');
    expect(body).not.toContain('.from("nutrition_recipe_equipment")');
  });

  it("executes verification for RPC hardening, owner isolation, immutable v1, and v1-to-v2 publication", () => {
    expect(verification).toContain("recipe publication rpc is not hardened");
    expect(verification).toContain("recipe publication did not create version 1");
    expect(verification).toContain("recipe publication did not create version 2");
    expect(verification).toContain("non-owner recipe publication succeeded");
    expect(verification).toContain("published recipe version was mutable");
  });
});
