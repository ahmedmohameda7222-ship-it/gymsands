import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const DIRECT_FOOD_ITEMS_ACCESS = /\.from\(\s*["']food_items["']\s*\)/;
const ALLOWED_DIRECT_ACCESS = new Set([
  "services/food-catalog/server/legacy-compatibility.ts",
  "services/nutrition-v1/server/food-curation.ts",
]);

function normalizedRelative(path: string) {
  return relative(ROOT, path).split(sep).join("/");
}

function productionTypescriptFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionTypescriptFiles(path);
    if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) return [];
    if (/\.(?:test|spec)\.tsx?$/.test(entry.name)) return [];
    return [path];
  });
}

describe("Nutrition V1 Food Catalog persistence boundary", () => {
  it("keeps direct global food_items access inside approved catalog persistence internals", () => {
    const roots = [
      join(ROOT, "services/nutrition-v1/server"),
      join(ROOT, "services/food-catalog/server"),
      join(ROOT, "app/api/nutrition/v1"),
      join(ROOT, "lib/mcp"),
      join(ROOT, "app/api/mcp"),
      join(ROOT, "services/mcp"),
    ];
    const violations = roots
      .flatMap(productionTypescriptFiles)
      .map((path) => ({ path: normalizedRelative(path), source: readFileSync(path, "utf8") }))
      .filter(({ path, source }) => !ALLOWED_DIRECT_ACCESS.has(path) && DIRECT_FOOD_ITEMS_ACCESS.test(source))
      .map(({ path }) => path)
      .sort();

    expect(violations).toEqual([]);
  });

  it("keeps the Nutrition Food Catalog façade free of direct food_items access", () => {
    const source = readFileSync(join(ROOT, "services/nutrition-v1/server/food-catalog.ts"), "utf8");
    expect(source).not.toMatch(DIRECT_FOOD_ITEMS_ACCESS);
  });

  it("keeps the Food Library API delegated to the server domain layer", () => {
    const routePath = join(ROOT, "app/api/nutrition/v1/foods/route.ts");
    const source = readFileSync(routePath, "utf8");

    expect(source).toContain("@/services/nutrition-v1/server/food-library");
    expect(source).toContain("listFoodLibrary");
    expect(source).not.toMatch(DIRECT_FOOD_ITEMS_ACCESS);
  });
});
