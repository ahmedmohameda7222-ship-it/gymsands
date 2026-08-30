import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const APPROVED_BASE_SHA = "488203fdee566b82c30a51ca9b6cbc050cfaf61f";
const MIGRATION_SUFFIX = "_food_catalog_population_readiness.sql";

const changedMigrationFiles = execFileSync(
  "git",
  ["diff", "--name-only", `${APPROVED_BASE_SHA}...HEAD`, "--", "supabase/migrations"],
  { encoding: "utf8" }
)
  .split(/\r?\n/)
  .map((value) => value.trim())
  .filter((value) => value.endsWith(MIGRATION_SUFFIX));

const migrationPath = changedMigrationFiles.length === 1 ? changedMigrationFiles[0] : null;
const migration = migrationPath
  ? readFileSync(migrationPath, "utf8").replaceAll("\r\n", "\n").toLowerCase()
  : "";

const expectTable = (table: string) => {
  expect(migration).toMatch(new RegExp(`create\\s+table\\s+public\\.${table}\\b`));
};

const expectRls = (table: string) => {
  expect(migration).toMatch(new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`));
};

describe("Food Catalog Batch 0 population-readiness migration contract", () => {
  it("discovers exactly one forward migration by suffix without pinning its timestamp", () => {
    expect(changedMigrationFiles).toHaveLength(1);
    expect(migrationPath).toMatch(/^supabase\/migrations\/\d{14}_food_catalog_population_readiness\.sql$/);
  });

  it("makes only the canonical core nutrition columns nullable and adds display/market readiness", () => {
    for (const column of ["calories", "protein_g", "carbs_g", "fat_g"]) {
      expect(migration).toMatch(new RegExp(`alter\\s+column\\s+${column}\\s+drop\\s+not\\s+null`));
    }
    expect(migration).toMatch(/add\s+column\s+(?:if\s+not\s+exists\s+)?brand_name\s+text/);
    expect(migration).toMatch(/add\s+column\s+(?:if\s+not\s+exists\s+)?is_market_global\s+boolean\s+not\s+null\s+default\s+true/);
    expect(migration).toContain("brand_name");
    expect(migration).toMatch(/brand_name\s+is\s+null|brand_name\)\s*>\s*0/);
  });

  it("creates immutable semantic batches, separate execution runs, and many-to-many participation", () => {
    for (const table of ["food_ingestion_batches", "food_ingestion_runs", "food_ingestion_batch_records"]) {
      expectTable(table);
    }
    expect(migration).toMatch(/unique\s*\(\s*provider\s*,\s*dataset_name\s*,\s*source_version\s*,\s*source_checksum_sha256\s*,\s*importer_version\s*,\s*config_checksum_sha256\s*\)/);
    expect(migration).toMatch(/unique\s*\(\s*batch_id\s*,\s*execution_mode\s*,\s*attempt_number\s*\)/);
    expect(migration).toMatch(/unique\s*\(\s*batch_id\s*,\s*source_record_id\s*\)/);
    expect(migration).toContain("food_ingestion_batch_identity");
    expect(migration).toContain("food_ingestion_run_production");
    expect(migration).toContain("review_state = 'approved'");
    expect(migration).toContain("approved_at is not null");
    expect(migration).toContain("manifest_content_checksum_sha256");
    expect(migration).toMatch(/old\.review_state\s*<>\s*'prepared'\s+and\s+new\.review_state\s*=\s*'prepared'/);
  });

  it("version-enables source provenance and replaces only the legacy global uniqueness", () => {
    for (const column of ["source_dataset", "source_version", "source_release_date", "source_record_checksum_sha256"]) {
      expect(migration).toContain(column);
    }
    expect(migration).toMatch(/drop\s+constraint\s+food_source_records_provider_source_record_id_key/);
    expect(migration).not.toMatch(/unique\s*\(\s*provider\s*,\s*source_record_id\s*\)\s*;/);
    expect(migration).toMatch(/create\s+unique\s+index\s+\S+\s+on\s+public\.food_source_records\s*\(\s*provider\s*,\s*source_record_id\s*\)\s*where\s+source_dataset\s+is\s+null\s+and\s+source_version\s+is\s+null/);
    expect(migration).toMatch(/create\s+unique\s+index\s+\S+\s+on\s+public\.food_source_records\s*\(\s*provider\s*,\s*source_dataset\s*,\s*source_version\s*,\s*source_record_id\s*\)\s*where\s+source_dataset\s+is\s+not\s+null\s+and\s+source_version\s+is\s+not\s+null/);
  });

  it("creates GTIN identity and country/region-safe market relevance without changing canonical Food identity", () => {
    expectTable("food_barcodes");
    expectTable("food_market_relevance");
    expect(migration).toMatch(/gtin\s+text\s+not\s+null\s+unique/);
    expect(migration).toContain("scope_type");
    expect(migration).toContain("'country'");
    expect(migration).toContain("'region'");
    expect(migration).toContain("is_market_global");
    expect(migration).not.toMatch(/alter\s+table\s+public\.food_items[\s\S]{0,160}primary\s+key/);
  });

  it("keeps ingestion, GTIN, and market infrastructure service-role-only", () => {
    const internalTables = [
      "food_ingestion_batches",
      "food_ingestion_runs",
      "food_ingestion_batch_records",
      "food_barcodes",
      "food_market_relevance"
    ];
    for (const table of internalTables) {
      expectRls(table);
      expect(migration).toMatch(new RegExp(`revoke\\s+all[\\s\\S]{0,120}public\\.${table}[\\s\\S]{0,80}anon\\s*,\\s*authenticated`));
      expect(migration).toMatch(new RegExp(`grant\\s+all\\s+privileges[\\s\\S]{0,120}public\\.${table}[\\s\\S]{0,80}service_role`));
      expect(migration).not.toMatch(new RegExp(`grant[\\s\\S]{0,160}public\\.${table}[\\s\\S]{0,80}to\\s+(?:anon|authenticated)\\b`));
    }
  });

  it("contains no catalog population, source data load, or compatibility-marker mutation", () => {
    expect(migration).not.toMatch(/insert\s+into\s+public\.food_items\b/);
    expect(migration).not.toMatch(/copy\s+public\.food_items\b/);
    expect(migration).not.toMatch(/update\s+public\.release_schema_compatibility\b/);
    expect(migration).not.toMatch(/\b(usda|cofid|open\s+food\s+facts|sfda)\b/);
  });
});
