import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const V2_CANONICAL_TABLE = /\.from\(\s*["'](?:food_nutrition_revisions|food_serving_options|food_names|food_taxonomy_assignments|food_market_assignments|food_verification_assertions|food_merge_events)["']\s*\)/;
const RAW_ADAPTER_IMPORT = /@\/services\/food-catalog\/server\/supabase-(?:read|write|generation-(?:read|command))-store/;

const ALLOWED_V2_TABLE_ACCESS = new Set([
  "services/food-catalog/server/supabase-read-store.ts",
  "services/food-catalog/server/supabase-write-store.ts",
  "services/food-catalog/server/supabase-generation-read-store.ts",
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

describe("Food Catalog V2 service persistence boundary", () => {
  const productionFiles = [
    join(ROOT, "services"),
    join(ROOT, "app/api"),
    join(ROOT, "lib/mcp"),
  ]
    .flatMap(productionTypescriptFiles)
    .map((path) => ({ path: normalizedRelative(path), source: readFileSync(path, "utf8") }));

  it("keeps direct V2 canonical-table access inside dedicated Supabase adapters", () => {
    const violations = productionFiles
      .filter(({ path, source }) => !ALLOWED_V2_TABLE_ACCESS.has(path) && V2_CANONICAL_TABLE.test(source))
      .map(({ path }) => path)
      .sort();

    expect(violations).toEqual([]);
  });

  it("keeps raw Supabase adapter imports inside the Food Catalog server implementation", () => {
    const violations = productionFiles
      .filter(({ path, source }) => !path.startsWith("services/food-catalog/server/") && RAW_ADAPTER_IMPORT.test(source))
      .map(({ path }) => path)
      .sort();

    expect(violations).toEqual([]);
  });
});
