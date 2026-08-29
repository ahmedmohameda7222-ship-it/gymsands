import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");
const migrationPath = "supabase/migrations/20260828032400_nutrition_v1_working_draft_command.sql";

describe("Nutrition V1 published Recipe Working Draft command", () => {
  it("routes the runtime-reachable draft transition through one database command", () => {
    const workspace = source("services/nutrition-v1/server/recipe-workspace.ts");
    expect(workspace).toContain('rpc("create_nutrition_recipe_working_draft"');
    expect(workspace).not.toContain('supabase.from("nutrition_recipe_drafts").insert({');
    expect(workspace).not.toContain('supabase.from("nutrition_recipe_drafts").delete().eq("id", draft.id)');
  });

  it("ships a forward-only owner-scoped transactional RPC for the transition", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;
    const migration = source(migrationPath).toLowerCase();
    expect(migration).toContain("create or replace function public.create_nutrition_recipe_working_draft");
    expect(migration).toContain("for update");
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain("nutrition_recipe_drafts");
    expect(migration).toContain("nutrition_recipe_ingredients");
    expect(migration).toContain("nutrition_recipe_actions");
    expect(migration).toContain("nutrition_recipe_equipment");
    expect(migration).toContain("grant execute on function public.create_nutrition_recipe_working_draft");
  });
});
