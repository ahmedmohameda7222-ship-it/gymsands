import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SERVER_ROOT = join(ROOT, "services/food-catalog/server");
const INDEX_PATH = join(SERVER_ROOT, "index.ts");
const PLAN3_MIGRATION_PATH = join(
  ROOT,
  "supabase/migrations/20260902150000_food_catalog_generation_authority.sql",
);

const PLAN3_PHYSICAL_TABLE = /\.from\(\s*["'](?:food_catalog_control_operations|food_catalog_activation_sets|food_catalog_activation_set_members|food_catalog_activation_events|food_catalog_generations|food_catalog_generation_foods|food_catalog_generation_servings|food_catalog_generation_names|food_catalog_generation_taxonomy|food_catalog_generation_markets|food_catalog_generation_verification|food_catalog_generation_redirects|food_catalog_generation_validation_reports|food_catalog_generation_validation_findings|food_catalog_generation_events|food_catalog_current_generation)["']\s*\)/;
const PLAN3_RPC = /food_catalog_(?:create_activation_set|grant_activation_set|invalidate_activation_grant|create_generation|record_generation_validation|promote_generation|rollback_generation|revoke_generation)_v1/;
const RAW_GENERATION_ADAPTER = /supabase-generation-(?:read|validation-read|command)-store/;
const APPROVED_PLAN3_TABLE_READERS = new Set([
  "services/food-catalog/server/supabase-generation-read-store.ts",
  "services/food-catalog/server/supabase-generation-validation-read-store.ts",
]);
const FORBIDDEN_CURRENT_SELECTION = [
  /\.order\(\s*["'](?:created_at|sealed_at|revision_number|generation_ordinal)["'][\s\S]{0,120}ascending\s*:\s*false/,
  /latest(?:Generation|Nutrition|Name|Serving|Assertion)/,
  /(?:Math\.max|\bmax)\s*\([^)]*(?:revision|ordinal|created|sealed)/i,
  /(?:revision|ordinal|created|sealed)[\s\S]{0,100}(?:Math\.max|\bmax)\s*\(/i,
];
const CURRENT_SELECTION_AUTHORITY_FILES = new Set([
  "services/food-catalog/server/current-generation-service.ts",
  "services/food-catalog/server/generation-command-service.ts",
  "services/food-catalog/server/supabase-generation-read-store.ts",
  "services/food-catalog/server/supabase-generation-command-store.ts",
]);
const MEMBER_SURFACE_ROOTS = [
  join(ROOT, "app"),
  join(ROOT, "components"),
  join(ROOT, "lib/mcp"),
];

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

function sources(paths: readonly string[]) {
  return paths.map((path) => ({
    path: normalizedRelative(path),
    source: readFileSync(path, "utf8"),
  }));
}

describe("Food Catalog Plan 3 generation authority boundary", () => {
  const serverFiles = sources(productionTypescriptFiles(SERVER_ROOT));

  it("keeps direct Plan 3 physical-table access in approved exact-generation read adapters only", () => {
    const violations = serverFiles
      .filter(({ path, source }) => (
        !APPROVED_PLAN3_TABLE_READERS.has(path)
        && PLAN3_PHYSICAL_TABLE.test(source)
      ))
      .map(({ path }) => path)
      .sort();

    expect(violations).toEqual([]);
  });

  it("keeps raw generation adapters internal to the Food Catalog server implementation", () => {
    const outsideServer = sources([
      join(ROOT, "app"),
      join(ROOT, "components"),
      join(ROOT, "lib"),
    ].flatMap(productionTypescriptFiles));

    const violations = outsideServer
      .filter(({ source }) => RAW_GENERATION_ADAPTER.test(source))
      .map(({ path }) => path)
      .sort();

    expect(violations).toEqual([]);
  });

  it("forbids implicit latest/max current-authority selection in modules that can resolve or transition current generation", () => {
    const violations = serverFiles
      .filter(({ path }) => CURRENT_SELECTION_AUTHORITY_FILES.has(path))
      .flatMap(({ path, source }) => FORBIDDEN_CURRENT_SELECTION
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${path}: ${pattern.source}`))
      .sort();

    expect(violations).toEqual([]);
  });

  it("forbids descending latest-row inference in Plan 3 promotion/rollback migration authority", () => {
    const migration = readFileSync(PLAN3_MIGRATION_PATH, "utf8");
    const forbidden = /order\s+by[\s\S]{0,220}\bdesc\b[\s\S]{0,100}\blimit\s+1\b/i;
    expect(migration).not.toMatch(forbidden);
  });

  it("exports safe transition orchestration without exporting raw adapters, clients, credentials, or RPC constants", () => {
    const index = readFileSync(INDEX_PATH, "utf8");

    expect(index).toMatch(/promoteCatalogGeneration/);
    expect(index).toMatch(/rollbackCatalogGeneration/);
    expect(index).toMatch(/revokeCatalogGeneration/);
    expect(index).not.toMatch(RAW_GENERATION_ADAPTER);
    expect(index).not.toMatch(/SupabaseClient/);
    expect(index).not.toMatch(/service[_-]?role/i);
    expect(index).not.toMatch(PLAN3_RPC);
  });

  it("keeps every privileged Plan 3 RPC name out of browser, app API, and member MCP production surfaces", () => {
    const violations = sources(MEMBER_SURFACE_ROOTS.flatMap(productionTypescriptFiles))
      .filter(({ source }) => PLAN3_RPC.test(source))
      .map(({ path }) => path)
      .sort();

    expect(violations).toEqual([]);
  });
});
