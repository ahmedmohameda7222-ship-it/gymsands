import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260712173000_persistent_meal_plan_skip_status.sql", "utf8");
const mealService = readFileSync("services/database/meal-plan.ts", "utf8");
const legacyNutritionService = readFileSync("services/database/nutrition.ts", "utf8");

describe("persistent meal skip migration contract", () => {
  it("keeps planned and done valid, accepts skipped and does not change the planned default", () => {
    expect(migration).toContain("status in ('planned', 'done', 'skipped')");
    expect(migration).not.toMatch(/set default/i);
    expect(migration).toContain("Skipped items are not food logs");
  });

  it("requires skipped rows to remain non-consumed", () => {
    expect(migration).toContain("user_meal_plan_items_skipped_state_check");
    expect(migration).toContain("completed_at is null and food_log_id is null");
    expect(mealService).toContain('update({ status: "skipped", completed_at: null, food_log_id: null })');
  });

  it("makes completed and skipped states terminal at both database and service layers", () => {
    expect(migration).toContain("old.status in ('done', 'skipped') and new.status <> old.status");
    expect(migration).toContain("enforce_user_meal_plan_item_status_transition");
    expect(mealService).toContain('A skipped meal cannot be marked done.');
    expect(mealService).toContain('.eq("status", "planned")');
    expect(legacyNutritionService).toContain('A skipped meal cannot be marked done.');
    expect(legacyNutritionService).toContain('.eq("status", "planned")');
  });

  it("keeps batch skip ownership-scoped", () => {
    expect(mealService).toContain('.eq("user_id", userId)');
    expect(mealService).toContain('.in("id", ids)');
    expect(mealService).toContain('.eq("status", "planned")');
  });
});
