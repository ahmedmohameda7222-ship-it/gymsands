import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Nutrition V1 owner Food Catalog product contract", () => {
  it("creates only the bounded approved admin surface and server authority", () => {
    for (const path of [
      "app/(private)/admin/food-catalog/page.tsx",
      "components/nutrition/food-library/admin/food-catalog-admin.tsx",
      "services/nutrition-v1/server/food-curation.ts",
    ]) expect(existsSync(path)).toBe(true);
  });

  it("re-authorizes mutations on the server and uses service role only after admin validation", () => {
    const page = source("app/(private)/admin/food-catalog/page.tsx");
    expect(page).toContain('"use server"');
    expect(page).toContain("requireAdmin");
    expect(page).toContain("createSupabaseServerClient");
    expect(page).toMatch(/createSupabaseServerClient\(null,\s*true\)/);
    expect(page.indexOf("requireAdmin")).toBeLessThan(page.indexOf("createSupabaseServerClient(null, true)"));
  });

  it("keeps Publish separate from Verify and exposes the approved lifecycle actions", () => {
    const admin = source("components/nutrition/food-library/admin/food-catalog-admin.tsx");
    expect(admin).toContain("Review candidates");
    expect(admin).toContain("Publish");
    expect(admin).toContain("Publish does not verify");
    expect(admin).toContain("Verify");
    expect(admin).toContain("Unverify");
    expect(admin).toContain("Merge");
    expect(admin).toContain("Deprecate");
    expect(admin).toContain("Restore");
    expect(admin).toContain("Provenance");
    expect(admin).toContain("License");
  });

  it("keeps user-created Foods personal unless explicitly reviewed and never creates a normal-search provider dependency", () => {
    const admin = source("components/nutrition/food-library/admin/food-catalog-admin.tsx");
    const curation = source("services/nutrition-v1/server/food-curation.ts");
    const library = source("services/nutrition-v1/server/food-library.ts");
    expect(admin).toContain("User-created Foods stay personal until explicitly reviewed");
    expect(curation).not.toMatch(/from\(["']user_food_items["']\)\.update/);
    expect(library).not.toMatch(/fetch\(|openfoodfacts|wger/i);
  });

  it("preserves history on merge through redirect semantics rather than destructive Food deletion", () => {
    const curation = source("services/nutrition-v1/server/food-curation.ts");
    expect(curation).toContain("merged_into_food_id");
    expect(curation).toContain("food_favorites");
    expect(curation).not.toMatch(/from\(["']food_items["']\)\.delete/);
    expect(curation).not.toMatch(/from\(["']food_logs["']\)[\s\S]*update/);
    expect(curation).toContain("food_source_records");
    expect(curation).toMatch(/license_name|license_reference/);
  });
});
