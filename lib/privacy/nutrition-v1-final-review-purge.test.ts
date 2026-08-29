import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = "supabase/migrations/20260829110000_nutrition_v1_final_review_corrections.sql";

describe("Nutrition V1 final-review privacy purge authority", () => {
  it("explicitly purges and verifies the Saved Meal creation replay ledger", () => {
    expect(existsSync(join(root, migration))).toBe(true);
    const sql = readFileSync(join(root, migration), "utf8");
    expect(sql).toContain("delete from private.nutrition_saved_meal_creation_operations");
    expect(sql).toContain("nutrition_saved_meal_creation_operations where user_id = p_user_id");
    expect(sql).toContain("nutrition_saved_meal_creation_operations_deleted");
  });
});
