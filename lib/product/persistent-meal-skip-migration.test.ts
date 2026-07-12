import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260712173000_persistent_meal_plan_skip_status.sql", "utf8");
const mealService = readFileSync("services/database/meal-plan.ts", "utf8");

describe("persistent meal skip migration contract", () => {
  it("keeps planned and done valid, accepts skipped and does not change the planned default", () => {
    expect(migration).toContain("status in ('planned', 'done', 'skipped')");
    expect(migration).not.toMatch(/set default/i);
    expect(migration).toContain("Skipped items are not food logs");
  });

  it("keeps skipped records non-consumed and ownership-scoped", () => {
    expect(mealService).toContain('update({ status: "skipped", completed_at: null, food_log_id: null })');
    expect(mealService).toContain('.eq("user_id", userId)');
    expect(mealService).toContain('.eq("status", "planned")');
    expect(mealService).toContain('A skipped meal cannot be marked done.');
  });
});
