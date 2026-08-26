import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");

const pagePath = "components/nutrition/food-library/food-library-page.tsx";
const rowPath = "components/nutrition/food-library/food-row.tsx";
const detailPath = "components/nutrition/food-library/food-detail.tsx";
const filtersPath = "components/nutrition/food-library/food-filters.tsx";

describe("Nutrition V1 canonical Food Library product surface", () => {
  it("implements the complete planned reader/route/page/component surface", () => {
    for (const path of [
      "services/nutrition-v1/server/food-library.ts",
      "app/api/nutrition/v1/foods/route.ts",
      "app/(private)/calories/food-hub/page.tsx",
      pagePath,
      rowPath,
      detailPath,
      filtersPath,
    ]) expect(existsSync(join(root, path)), path).toBe(true);
  });

  it("replaces the normal Food Hub path with search-first Food Library, personal Quick Access, then Category/Cuisine browse", () => {
    const routePage = source("app/(private)/calories/food-hub/page.tsx");
    const page = source(pagePath);
    expect(routePage).toContain("FoodLibraryPage");
    expect(page).toContain("Food Library");
    expect(page).toContain("Search foods");
    expect(page).toContain("Quick Access");
    expect(page).toContain("Recent");
    expect(page).toContain("Favorites");
    expect(page).toContain("My Foods");
    expect(page).toContain("Browse by Category");
    expect(page).toContain("Browse by Cuisine");
    expect(page).not.toMatch(/nutrition dashboard|marketing hero|grid-cols-3|grid-cols-4/i);
  });

  it("uses flat decision rows with explicit macro units and positive-only Plaivra verification", () => {
    const row = source(rowPath);
    expect(row).toContain("ShieldCheck");
    expect(row).toContain('aria-label="Plaivra Verified"');
    expect(row).toContain("P ");
    expect(row).toContain("C ");
    expect(row).toContain("F ");
    expect(row).toContain('"g"');
    expect(row).toContain("min-h-[88px]");
    expect(row).not.toMatch(/Unverified|confidence|source name|trust level|Saved Meal/i);
    expect(row).not.toMatch(/<Card|CardHeader|CardContent/);
  });

  it("keeps discovery labels restrained and result layout to at most two columns", () => {
    const row = source(rowPath);
    const page = source(pagePath);
    expect(row).toContain("tags.slice(0, 2)");
    expect(page).toContain("lg:grid-cols-2");
    expect(page).not.toMatch(/grid-cols-3|grid-cols-4/);
  });

  it("uses live filters with close-preserves-state semantics, nutrition Info, presets, and no Apply/Done gate", () => {
    const filters = source(filtersPath);
    expect(filters).toContain("Close Filters");
    expect(filters).toContain("Reset filters");
    expect(filters).toContain("High Protein");
    expect(filters).toContain("Low Carb");
    expect(filters).toContain("Info");
    expect(filters).toContain("About nutrition filter values");
    expect(filters).toContain("≥");
    expect(filters).toContain("≤");
    expect(filters).toContain("Between");
    expect(filters).not.toMatch(/>\s*Apply\s*</i);
    expect(filters).not.toMatch(/>\s*Done\s*</i);
  });

  it("resolves Serving then Quantity then Destination for standalone Add To and excludes Shopping List", () => {
    const detail = source(detailPath);
    expect(detail.indexOf("Serving")).toBeGreaterThanOrEqual(0);
    expect(detail.indexOf("Quantity")).toBeGreaterThan(detail.indexOf("Serving"));
    expect(detail.indexOf("Add to")).toBeGreaterThan(detail.indexOf("Quantity"));
    expect(detail).toContain("Diary");
    expect(detail).toContain("Meal Plan");
    expect(detail).toContain("Saved Meal");
    expect(detail).toContain("Recipe");
    expect(detail).not.toContain("Shopping List");
  });

  it("keeps Food Detail bounded and truthful about missing nutrition", () => {
    const detail = source(detailPath);
    expect(detail).toContain("More Nutrition");
    expect(detail).toContain("Not available");
    expect(detail).toContain("Using your values");
    expect(detail).toMatch(/max-w-\[(420|440|460|480)px\]/);
  });

  it("queries the server route instead of fetching and slicing the whole catalog in the browser", () => {
    const page = source(pagePath);
    expect(page).toContain("/api/nutrition/v1/foods");
    expect(page).not.toMatch(/food_items[\s\S]{0,400}\.slice\(/);
    expect(page).not.toMatch(/getGlobalFoods\(/);
  });
});
