import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260710193700_canonical_data_convergence_foundation.sql", "utf8");
const legacyNutritionAdapter = readFileSync("services/nutrition-v1/compatibility/legacy-nutrition.ts", "utf8");
const legacyNutritionReconciliation = readFileSync("supabase/verification/nutrition-v1-legacy-reconciliation.sql", "utf8");
const workoutExecutor = [
  readFileSync("lib/mcp/tool-executor.ts", "utf8"),
  readFileSync("lib/mcp/tool-executor-implementation.ts", "utf8")
].join("\n");
const safeExecutor = readFileSync("lib/mcp/tool-executor-safe.ts", "utf8");

describe("canonical data convergence", () => {
  it("links only one-to-one performed/scheduled workout candidates", () => {
    expect(migration).toContain("performed_candidate_count = 1 and scheduled_candidate_count = 1");
    expect(migration).toContain("partition by performed.id");
    expect(migration).toContain("partition by scheduled.id");
  });

  it("bounds legacy numeric conversion before casting", () => {
    expect(migration).toContain("snapshot.planned_sets ~ '^[0-9]{1,3}$'");
    expect(migration).toContain("snapshot.planned_sets::int between 1 and 100");
  });

  it("writes new MCP execution data only to canonical performed and saved-content models", () => {
    expect(workoutExecutor).toContain('rpc("start_or_resume_workout_session_atomic"');
    expect(workoutExecutor).toContain('rpc("upsert_workout_set_logs_atomic"');
    expect(workoutExecutor).toContain('rpc("complete_workout_session_atomic"');
    expect(safeExecutor).toContain('.from("saved_recipes")');
    expect(safeExecutor).toContain('.from("saved_recipe_ingredients")');
    expect(safeExecutor).not.toContain('.from("custom_meals")');
    expect(safeExecutor).not.toContain('.from("custom_meal_items")');
  });

  it("keeps Nutrition V1 legacy continuity explicit and non-destructive", () => {
    expect(legacyNutritionAdapter).toContain("legacy-nutrition.ts".replace("legacy-nutrition.ts", "unresolved"));
    expect(legacyNutritionAdapter).toContain("user_meal_plan_items");
    expect(legacyNutritionAdapter).toContain("food_logs");
    expect(legacyNutritionReconciliation).toContain("nutrition-v1-legacy-reconciliation.sql".replace("nutrition-v1-legacy-reconciliation.sql", "unresolved"));
    expect(legacyNutritionReconciliation).not.toMatch(/\b(delete|update|insert|drop|truncate|alter)\b/i);
  });
});
