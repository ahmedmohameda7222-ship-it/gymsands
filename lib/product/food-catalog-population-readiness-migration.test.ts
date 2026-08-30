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

const expectGuardContains = (functionName: string, fragments: string[]) => {
  const marker = `create or replace function public.${functionName}()`;
  const start = migration.indexOf(marker);
  expect(start, `${functionName} must exist`).toBeGreaterThanOrEqual(0);
  const nextFunction = migration.indexOf("create or replace function public.", start + marker.length);
  const definition = migration.slice(start, nextFunction === -1 ? migration.length : nextFunction);
  for (const fragment of fragments) {
    expect(definition, `${functionName} must protect ${fragment}`).toContain(fragment);
  }
};

describe("Food Catalog Batch 0 population-readiness migration contract", () => {
  it("discovers exactly one forward migration by suffix without pinning its timestamp", () => {
    expect(changedMigrationFiles).toHaveLength(1);
    expect(migrationPath).toMatch(/^supabase\/migrations\/\d{14}_food_catalog_population_readiness\.sql$/);
  });

  it("makes canonical core nutrition nullable and defaults market-global relevance fail closed", () => {
    for (const column of ["calories", "protein_g", "carbs_g", "fat_g"]) {
      expect(migration).toMatch(new RegExp(`alter\\s+column\\s+${column}\\s+drop\\s+not\\s+null`));
    }
    expect(migration).toMatch(/add\s+column\s+(?:if\s+not\s+exists\s+)?brand_name\s+text/);
    expect(migration).toMatch(/add\s+column\s+(?:if\s+not\s+exists\s+)?is_market_global\s+boolean\s+not\s+null\s+default\s+false/);
    expect(migration).not.toMatch(/is_market_global\s+boolean\s+not\s+null\s+default\s+true/);
    expect(migration).toMatch(/brand_name\s+is\s+null|brand_name\)\s*>\s*0/);
  });

  it("freezes the complete reviewed batch semantic authority and preserves approval history", () => {
    for (const table of ["food_ingestion_batches", "food_ingestion_runs", "food_ingestion_batch_records"]) {
      expectTable(table);
    }
    expect(migration).toMatch(/unique\s*\(\s*provider\s*,\s*dataset_name\s*,\s*source_version\s*,\s*source_checksum_sha256\s*,\s*importer_version\s*,\s*config_checksum_sha256\s*\)/);
    expect(migration).toMatch(/unique\s*\(\s*batch_id\s*,\s*execution_mode\s*,\s*attempt_number\s*\)/);
    expect(migration).toMatch(/unique\s*\(\s*batch_id\s*,\s*source_record_id\s*\)/);
    expectGuardContains("food_ingestion_batch_identity_immutable_guard", [
      "new.provider is distinct from old.provider",
      "new.dataset_name is distinct from old.dataset_name",
      "new.source_version is distinct from old.source_version",
      "new.source_release_date is distinct from old.source_release_date",
      "new.license_name is distinct from old.license_name",
      "new.license_reference is distinct from old.license_reference",
      "new.source_reference is distinct from old.source_reference",
      "new.source_checksum_sha256 is distinct from old.source_checksum_sha256",
      "new.importer_version is distinct from old.importer_version",
      "new.config_checksum_sha256 is distinct from old.config_checksum_sha256",
      "new.manifest_content_checksum_sha256 is distinct from old.manifest_content_checksum_sha256",
      "new.input_count is distinct from old.input_count",
      "new.accepted_count is distinct from old.accepted_count",
      "new.rejected_count is distinct from old.rejected_count",
      "new.matched_count is distinct from old.matched_count",
      "new.created_count is distinct from old.created_count",
      "new.possible_duplicate_count is distinct from old.possible_duplicate_count",
      "new.reviewed_at is distinct from old.reviewed_at",
      "new.approved_at is distinct from old.approved_at",
      "new.approval_reference is distinct from old.approval_reference",
      "old.review_state <> 'prepared' and new.review_state = 'prepared'",
      "'prepared'",
      "'reviewed'",
      "'approved'",
      "'rejected'",
      "'superseded'"
    ]);
    expect(migration).toMatch(/review_state\s+in\s*\(\s*'approved'\s*,\s*'superseded'\s*\)[\s\S]{0,160}approved_at\s+is\s+not\s+null/);
  });

  it("freezes participating source snapshots without freezing canonical food association", () => {
    for (const column of ["source_dataset", "source_version", "source_release_date", "source_record_checksum_sha256"]) {
      expect(migration).toContain(column);
    }
    expectGuardContains("food_source_record_snapshot_immutable_guard", [
      "food_ingestion_batch_records",
      "new.provider is distinct from old.provider",
      "new.source_record_id is distinct from old.source_record_id",
      "new.source_dataset is distinct from old.source_dataset",
      "new.source_version is distinct from old.source_version",
      "new.source_release_date is distinct from old.source_release_date",
      "new.source_record_checksum_sha256 is distinct from old.source_record_checksum_sha256",
      "new.source_reference is distinct from old.source_reference",
      "new.source_nutrition is distinct from old.source_nutrition",
      "new.source_serving is distinct from old.source_serving",
      "new.license_name is distinct from old.license_name",
      "new.license_reference is distinct from old.license_reference",
      "new.retrieved_at is distinct from old.retrieved_at"
    ]);
    const snapshotGuardStart = migration.indexOf("create or replace function public.food_source_record_snapshot_immutable_guard()");
    const snapshotGuardEnd = migration.indexOf("create or replace function public.", snapshotGuardStart + 1);
    const snapshotGuard = migration.slice(snapshotGuardStart, snapshotGuardEnd === -1 ? migration.length : snapshotGuardEnd);
    expect(snapshotGuard).not.toContain("new.food_id is distinct from old.food_id");
  });

  it("freezes batch membership after review", () => {
    expectGuardContains("food_ingestion_batch_membership_guard", [
      "food_ingestion_batches",
      "review_state <> 'prepared'",
      "tg_op = 'insert'",
      "tg_op = 'update'",
      "tg_op = 'delete'"
    ]);
    expect(migration).toMatch(/create\s+trigger\s+food_ingestion_batch_membership_immutable[\s\S]{0,120}before\s+insert\s+or\s+update\s+or\s+delete\s+on\s+public\.food_ingestion_batch_records/);
  });

  it("makes ingestion-run audit identity durable and terminal runs immutable", () => {
    expectGuardContains("food_ingestion_run_audit_immutable_guard", [
      "new.batch_id is distinct from old.batch_id",
      "new.execution_mode is distinct from old.execution_mode",
      "new.attempt_number is distinct from old.attempt_number",
      "new.manifest_content_checksum_sha256 is distinct from old.manifest_content_checksum_sha256",
      "old.status in ('completed', 'failed', 'cancelled')",
      "old.status = 'prepared'",
      "new.status = 'running'",
      "old.status = 'running'",
      "new.status in ('completed', 'failed', 'cancelled')"
    ]);
    expect(migration).toMatch(/create\s+trigger\s+food_ingestion_run_audit_immutable[\s\S]{0,120}before\s+update\s+on\s+public\.food_ingestion_runs/);
    expect(migration).toContain("food_ingestion_run_production_manifest_guard");
    expect(migration).toContain("review_state <> 'approved'");
    expect(migration).toContain("approved_at is null");
  });

  it("version-enables source provenance and replaces only the legacy global uniqueness", () => {
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
