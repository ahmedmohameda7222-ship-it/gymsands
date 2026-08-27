import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260825120500_nutrition_v1_user_food_authority.sql";
const verificationPath = "supabase/verification/nutrition-v1-user-food-authority.sql";

describe("Nutrition V1 user Food authority correction", () => {
  it("keeps Custom Food calories required while allowing unknown P/C/F and explicit measurable basis", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, "utf8").toLowerCase();
    expect(migration).toContain("alter table public.user_food_items");
    for (const nutrient of ["protein_g", "carbs_g", "fat_g"]) {
      expect(migration).toContain(`alter column ${nutrient} drop not null`);
    }
    expect(migration).not.toContain("alter column calories drop not null");
    expect(migration).toContain("nutrition_basis_amount");
    expect(migration).toContain("nutrition_basis_unit");
    expect(migration).toContain("deleted_at");
  });

  it("ships executable verification and registers it in the canonical database-verification chain", () => {
    expect(existsSync(verificationPath)).toBe(true);
    const verification = readFileSync(verificationPath, "utf8").toLowerCase();
    const runner = readFileSync("scripts/run-database-verification.mjs", "utf8").toLowerCase();
    expect(verification).toContain("nutrition v1 user food nullable macro authority missing");
    expect(verification).toContain("nutrition v1 user food basis authority missing");
    expect(verification).toContain("nutrition v1 user food soft-delete authority missing");
    expect(runner).toContain("nutrition-v1-user-food-authority.sql");
  });
});
