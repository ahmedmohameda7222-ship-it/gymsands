import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

const pagePath = "components/nutrition/food-library/food-library-page.tsx";
const detailPath = "components/nutrition/food-library/food-detail.tsx";
const customPath = "components/nutrition/food-library/custom-food-workspace.tsx";
const barcodePath = "components/nutrition/food-library/barcode-lookup.tsx";

describe("Nutrition V1 Food Library completion contract", () => {
  it("exposes page-level Create Food and Scan actions without turning them into peer destinations", () => {
    const page = source(pagePath);
    expect(existsSync(customPath)).toBe(true);
    expect(existsSync(barcodePath)).toBe(true);
    expect(page).toContain("CustomFoodWorkspace");
    expect(page).toContain("BarcodeLookup");
    expect(page).toContain('nt("createFood")');
    expect(page).toContain('nt("scanBarcode")');
  });

  it("implements Fast Core custom Food authoring with an explicit basis and nullable P/C/F", () => {
    const custom = source(customPath);
    expect(custom).toContain('nt("createFood")');
    expect(custom).toContain('nt("nutritionIsFor")');
    expect(custom).toContain('nt("calories")');
    expect(custom).toContain('nt("macroProtein")');
    expect(custom).toContain('nt("macroCarbs")');
    expect(custom).toContain('nt("macroFat")');
    expect(custom).toContain("basisAmount");
    expect(custom).toContain("basisUnit");
    expect(custom).toContain("nullableNumber");
    expect(custom).not.toMatch(/protein[^\n]{0,160}\?\?\s*0/i);
    expect(custom).not.toMatch(/carbs[^\n]{0,160}\?\?\s*0/i);
    expect(custom).not.toMatch(/fat[^\n]{0,160}\?\?\s*0/i);
  });

  it("makes duplicate review and user-owned Edit/Delete explicit instead of silently merging or hard-deleting", () => {
    const custom = source(customPath);
    expect(custom).toContain('nt("possibleDuplicate")');
    expect(custom).toContain('nt("useExisting")');
    expect(custom).toContain('nt("correctForMe")');
    expect(custom).toContain('nt("createSeparately")');
    expect(custom).toContain('nt("deleteFood")');
    expect(custom).toContain('nt("deleteFoodConfirmation")');
  });

  it("keeps Food Detail serving and quantity state live and exposes canonical correction versus personal management", () => {
    const detail = source(detailPath);
    expect(detail).toMatch(/useState\([^)]*1[^)]*\)/);
    expect(detail).toContain("setQuantity");
    expect(detail).toContain("scaledNutrition");
    expect(detail).toContain('nt("correctForMe")');
    expect(detail).toContain('nt("editFood")');
    expect(detail).toContain('nt("deleteFood")');
  });

  it("keeps barcode failure bounded so the normal Food Library remains usable", () => {
    const barcode = source(barcodePath);
    expect(barcode).toContain("/api/food/open-food-facts");
    expect(barcode).toContain('nt("barcodeLookupFailed")');
    expect(barcode).toContain('nt("searchStillAvailable")');
  });

  it("routes owner-derived custom Food and personal-correction mutations through the authenticated V1 Food endpoint", () => {
    const route = source("app/api/nutrition/v1/foods/route.ts");
    const server = source("services/nutrition-v1/server/user-foods.ts");
    expect(route).toContain("requireNutritionUser(request)");
    for (const operation of ["custom_food_create", "custom_food_update", "custom_food_delete", "personal_correction"]) {
      expect(route).toContain(operation);
    }
    for (const command of ["createUserFood", "updateUserFood", "deleteUserFood", "setFoodPersonalCorrection"]) {
      expect(server).toContain(`export async function ${command}`);
    }
  });
});