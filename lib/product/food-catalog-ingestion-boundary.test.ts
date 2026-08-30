import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const APPROVED_BASE_SHA = "488203fdee566b82c30a51ca9b6cbc050cfaf61f";
const BATCH0_MIGRATION = "20260830011407_food_catalog_population_readiness.sql";
const BATCH0_MIGRATION_PATH = `supabase/migrations/${BATCH0_MIGRATION}`;
const INTERNAL_TABLES = [
  "food_ingestion_batches",
  "food_ingestion_runs",
  "food_ingestion_batch_records",
  "food_barcodes",
  "food_market_relevance",
];

type LedgerEntry = Record<string, unknown> & { localFile: string; state: string };
type MigrationLedger = {
  pendingCount: number;
  unresolvedCount: number;
  historyRepair: {
    state: string;
    pendingCount: number;
    unresolvedCount: number;
  };
  entries: LedgerEntry[];
};

function gitLines(args: string[]): string[] {
  return execFileSync("git", args, { encoding: "utf8" })
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function changedPaths(): string[] {
  return gitLines(["diff", "--name-only", `${APPROVED_BASE_SHA}...HEAD`]);
}

function readBaseLedger(): MigrationLedger {
  return JSON.parse(
    execFileSync(
      "git",
      ["show", `${APPROVED_BASE_SHA}:supabase/migration-ledger.json`],
      { encoding: "utf8" }
    )
  ) as MigrationLedger;
}

function readCurrentLedger(): MigrationLedger {
  return JSON.parse(readFileSync("supabase/migration-ledger.json", "utf8")) as MigrationLedger;
}

function readableRuntimePaths(paths: string[]): string[] {
  return paths.filter((file) =>
    /\.(?:ts|tsx|js|mjs|cjs)$/.test(file)
    && !/\.test\.[^.]+$/.test(file)
    && !file.startsWith("docs/")
    && !file.startsWith("supabase/")
  );
}

describe("Food Catalog Batch 0 ingestion boundary", () => {
  it("preserves every historical migration-ledger entry and adds only the readiness migration as pending", () => {
    const base = readBaseLedger();
    const current = readCurrentLedger();
    const batch0Entries = current.entries.filter((entry) => entry.localFile === BATCH0_MIGRATION);
    const historicalEntries = current.entries.filter((entry) => entry.localFile !== BATCH0_MIGRATION);

    expect(historicalEntries).toEqual(base.entries);
    expect(batch0Entries).toEqual([
      expect.objectContaining({
        localFile: BATCH0_MIGRATION,
        state: "pending"
      })
    ]);
    expect(current.pendingCount).toBe(1);
    expect(current.unresolvedCount).toBe(1);
    expect(current.historyRepair).toEqual(
      expect.objectContaining({
        state: "pending",
        pendingCount: 1,
        unresolvedCount: 1
      })
    );
  });

  it("adds exactly one new migration and never rewrites an applied migration", () => {
    const migrationChanges = gitLines([
      "diff",
      "--name-status",
      `${APPROVED_BASE_SHA}...HEAD`,
      "--",
      "supabase/migrations",
    ]);

    expect(migrationChanges).toEqual([`A\t${BATCH0_MIGRATION_PATH}`]);
  });

  it("commits no provider adapter, source download, or source dataset artifact", () => {
    const paths = changedPaths();
    const runtimePaths = readableRuntimePaths(paths).filter((file) =>
      file.startsWith("lib/food-catalog/") || file.startsWith("services/nutrition-v1/server/")
    );
    const providerNamedRuntimePaths = runtimePaths.filter((file) =>
      /(?:usda|fooddata|cofid|open[-_]?food[-_]?facts|sfda|bls[-_]?adapter)/i.test(file)
    );
    const sourceDatasetPaths = paths.filter((file) =>
      /\.(?:csv|tsv|parquet|ndjson|jsonl|xlsx|zip)$/i.test(file)
    );
    const ingestionRuntime = runtimePaths
      .filter((file) => file.startsWith("lib/food-catalog/ingestion/"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n")
      .toLowerCase();

    expect(providerNamedRuntimePaths).toEqual([]);
    expect(sourceDatasetPaths).toEqual([]);
    expect(ingestionRuntime).not.toMatch(/\b(?:usda|fooddata\s+central|cofid|open\s+food\s+facts|sfda)\b/);
    expect(ingestionRuntime).not.toMatch(/\bfetch\s*\(|\baxios\b|https?:\/\//);
  });

  it("contains no Food population, compatibility promotion, or public/member internal-table access", () => {
    const migration = readFileSync(BATCH0_MIGRATION_PATH, "utf8").toLowerCase();
    expect(migration).not.toMatch(/insert\s+into\s+public\.food_items\b/);
    expect(migration).not.toMatch(/copy\s+public\.food_items\b/);
    expect(migration).not.toMatch(/update\s+public\.release_schema_compatibility\b/);

    const paths = changedPaths();
    const ordinarySurfacePaths = paths.filter((file) =>
      file.startsWith("app/api/")
      || file.startsWith("lib/mcp/")
      || /\/client\//.test(file)
      || file.startsWith("components/")
    );
    const ordinarySurfaceContent = ordinarySurfacePaths
      .filter((file) => /\.(?:ts|tsx|js|mjs|cjs)$/.test(file))
      .map((file) => readFileSync(file, "utf8").toLowerCase())
      .join("\n");

    for (const table of INTERNAL_TABLES) {
      expect(ordinarySurfaceContent).not.toContain(table);
    }
  });

  it("adds no market inference from language, locale headers, IP, timezone, or geolocation", () => {
    const runtimeContent = readableRuntimePaths(changedPaths())
      .map((file) => readFileSync(file, "utf8"))
      .join("\n")
      .toLowerCase();

    expect(runtimeContent).not.toMatch(/accept-language|navigator\.language|navigator\.languages/);
    expect(runtimeContent).not.toMatch(/x-forwarded-for|cf-ipcountry|request\.ip|geoip|geolocation/);
    expect(runtimeContent).not.toMatch(/resolvedoptions\(\)\.timezone|time_zone|timezone.*market|market.*timezone/);
  });
});
