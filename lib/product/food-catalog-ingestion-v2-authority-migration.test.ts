import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION_FILE = "20260904100000_food_catalog_ingestion_v2_authority.sql";
const MIGRATION_PATH = `supabase/migrations/${MIGRATION_FILE}`;
const VERIFICATION_PATH = "supabase/verification/food-catalog-ingestion-v2-authority.sql";
const RECONCILIATION_DOC = "docs/architecture/migration-ledger-reconciliation.md";

const readLower = (path: string) => (existsSync(path) ? readFileSync(path, "utf8").toLowerCase() : "");
const sql = readLower(MIGRATION_PATH);
const verificationSql = readLower(VERIFICATION_PATH);
const reconciliationDoc = readLower(RECONCILIATION_DOC);
const migrationFiles = readdirSync("supabase/migrations").filter((name) =>
  name.endsWith("_food_catalog_ingestion_v2_authority.sql"),
);
const ledger = JSON.parse(readFileSync("supabase/migration-ledger.json", "utf8")) as {
  productionMigrationCount: number;
  productionRecordCount: number;
  pendingCount: number;
  unresolvedCount: number;
  historyRepair: {
    state: string;
    pendingCount: number;
    unresolvedCount: number;
    schemaAppliedUntrackedCount: number;
    note: string;
  };
  entries: Array<{
    localFile: string;
    state: string;
    note?: string;
    productionVersion?: string;
    productionName?: string;
  }>;
};
const releaseCompatibility = JSON.parse(readFileSync("config/release-compatibility.json", "utf8")) as {
  databaseMigrationMarkerVersion: string;
};

const authorityTables = [
  "food_ingestion_control_operations",
  "food_ingestion_manifest_records",
  "food_ingestion_materialized_results",
  "food_ingestion_quarantines",
  "food_ingestion_quarantine_resolutions",
  "food_ingestion_reconciliations",
  "food_ingestion_release_diffs",
  "food_ingestion_release_diff_records",
  "food_ingestion_operational_events",
] as const;

const rpcs = [
  "food_catalog_ingestion_prepare_execution_v2",
  "food_catalog_ingestion_acquire_lease_v2",
  "food_catalog_ingestion_heartbeat_lease_v2",
  "food_catalog_ingestion_persist_candidate_v2",
  "food_catalog_ingestion_record_quarantine_v2",
  "food_catalog_ingestion_resolve_quarantine_v2",
  "food_catalog_ingestion_record_reconciliation_v2",
  "food_catalog_ingestion_record_release_diff_v2",
  "food_catalog_ingestion_complete_run_v2",
] as const;

const reconciliationCodes = [
  "manifest_checksum_mismatch",
  "missing_expected_write",
  "unexpected_extra_write",
  "duplicate_semantic_result",
  "idempotency_mismatch",
  "partial_execution",
  "quarantine_divergence",
  "outcome_count_mismatch",
] as const;

describe("Food Catalog Plan 4 ingestion V2 authority migration", () => {
  it("defines exactly one forward Plan 4 migration without activation, promotion, or compatibility-marker mutation", () => {
    expect(migrationFiles).toEqual([MIGRATION_FILE]);
    expect(existsSync(MIGRATION_PATH)).toBe(true);
    expect(sql.trimStart().startsWith("begin;")).toBe(true);
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
    expect(sql).not.toMatch(/update\s+public\.food_catalog_current_generation/i);
    expect(sql).not.toMatch(/insert\s+into\s+public\.food_catalog_generations/i);
    expect(sql).not.toMatch(/food_catalog_promote_generation/i);
    expect(sql).not.toMatch(/update\s+public\.release_schema_compatibility/i);

    const draftInsert = sql.match(
      /insert\s+into\s+public\.food_items\s*\(([\s\S]*?)\)\s*values\s*\(([\s\S]*?)\);/i,
    );
    expect(draftInsert).not.toBeNull();
    expect(draftInsert?.[1]).toMatch(/\blifecycle_status\b/i);
    expect(draftInsert?.[2]).toMatch(/'catalog_ingestion_v2'[\s\S]*false\s*,\s*false\s*,\s*false\s*,\s*'draft'\s*$/i);
    expect(sql).not.toMatch(/update\s+public\.food_items[\s\S]{0,160}\blifecycle_status\s*=/i);
    expect(sql).not.toMatch(/\bis_verified\s*=\s*true\b/i);
  });

  it("strengthens semantic batch identity and durable Production lease authority additively", () => {
    expect(sql).toMatch(/alter\s+table\s+public\.food_ingestion_batches[\s\S]*semantic_identity_checksum_sha256/i);
    expect(sql).toMatch(/semantic_identity_checksum_sha256[\s\S]{0,400}\^\[0-9a-fa-f\]\{64\}\$/i);
    expect(sql).toMatch(/expected_quarantine_count\s+integer\s+not\s+null\s+default\s+0/i);
    expect(sql).toMatch(/alter\s+table\s+public\.food_ingestion_runs[\s\S]*lease_owner/i);
    expect(sql).toMatch(/lease_token\s+uuid/i);
    expect(sql).toMatch(/lease_epoch\s+bigint\s+not\s+null\s+default\s+0/i);
    expect(sql).toMatch(/lease_acquired_at\s+timestamptz/i);
    expect(sql).toMatch(/lease_heartbeat_at\s+timestamptz/i);
    expect(sql).toMatch(/lease_expires_at\s+timestamptz/i);
    expect(sql).toMatch(/observed_quarantine_count\s+integer/i);
    expect(sql).toMatch(/for\s+update/i);
    expect(sql).toMatch(/lease_expires_at\s*(?:<=|>)\s*(?:clock_timestamp\(\)|now\(\))/i);
    expect(sql).toMatch(/lease_epoch\s*=\s*[^;]*lease_epoch\s*\+\s*1/i);
  });

  it("creates immutable quarantine, reconciliation, release-diff, event and command-replay authority", () => {
    for (const table of authorityTables) {
      expect(sql).toMatch(new RegExp(`create\\s+table\\s+public\\.${table}\\b`, "i"));
      expect(sql).toMatch(new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i"));
      expect(sql).toMatch(
        new RegExp(
          `revoke\\s+all\\s+on\\s+(?:table\\s+)?public\\.${table}\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated\\s*,\\s*service_role`,
          "i",
        ),
      );
      expect(sql).toMatch(new RegExp(`grant\\s+select\\s+on\\s+(?:table\\s+)?public\\.${table}\\s+to\\s+service_role`, "i"));
      expect(sql).toMatch(new RegExp(`create\\s+trigger\\s+${table}_immutable[\\s\\S]*?on\\s+public\\.${table}`, "i"));
    }

    expect(sql).toContain("possible_duplicate");
    expect(sql).toContain("barcode_conflict");
    expect(sql).toContain("suspicious_material_change");
    for (const code of reconciliationCodes) expect(sql).toContain(`'${code}'`);
    expect(sql).not.toContain("'missing_result'");
    expect(sql).not.toContain("'extra_result'");
    expect(sql).not.toContain("'duplicate_result'");
    expect(sql).not.toContain("'count_mismatch'");
    expect(sql).toContain("source_record_added");
    expect(sql).toContain("quarantine_resolved");
    expect(sql).toMatch(/command_checksum_sha256/i);
    expect(sql).toMatch(/result_json/i);
  });

  it("binds Production writes to reviewed per-record manifest authority and persists Plan 1 structured facts", () => {
    expect(sql).toMatch(/create\s+table\s+public\.food_ingestion_manifest_records/i);
    expect(sql).toMatch(/candidate_json\s+jsonb\s+not\s+null/i);
    expect(sql).toMatch(/decision_json\s+jsonb\s+not\s+null/i);
    expect(sql).toMatch(/disposition_json\s+jsonb\s+not\s+null/i);
    expect(sql).toMatch(/planned_food_id\s+uuid/i);
    expect(sql).toMatch(/manifest_content_checksum_sha256\s+text\s+not\s+null/i);
    expect(sql).toMatch(/production candidate[\s\S]{0,500}approved[\s\S]{0,500}manifest/i);

    for (const relation of [
      "food_nutrition_revisions",
      "food_names",
      "food_serving_options",
      "food_barcodes",
      "food_taxonomy_assignments",
      "food_market_assignments",
    ]) {
      expect(sql).toMatch(new RegExp(`insert\\s+into\\s+public\\.${relation}\\b`, "i"));
    }

    expect(sql).toMatch(/execution_mode\s*=\s*'dry_run'[\s\S]{0,300}status\s+not\s+in\s*\(\s*'prepared'\s*,\s*'running'\s*\)/i);
  });

  it("serializes cross-attempt leases, resumes materialized writes, and preserves explicit serving evidence", () => {
    expect(sql).toMatch(/alter\s+table\s+public\.food_items\s+alter\s+column\s+serving_size\s+drop\s+not\s+null/i);
    expect(sql).toMatch(/create\s+table\s+public\.food_ingestion_materialized_results/i);
    expect(sql).toMatch(/unique\s*\(\s*batch_id\s*,\s*source_record_key\s*\)/i);
    expect(sql).toMatch(/food_catalog_ingestion_acquire_lease_v2[\s\S]*food_ingestion_batches[\s\S]*for\s+update/i);
    expect(sql).toMatch(/execution_mode\s*=\s*'production'[\s\S]{0,400}lease_expires_at\s*>\s*clock_timestamp\(\)/i);
    expect(sql).toContain("'lease_takeover'");
    expect(sql).toContain("'lease_lost'");
    expect(sql).toMatch(/food_catalog_ingestion_acquire_lease_v2[\s\S]*insert\s+into\s+public\.food_ingestion_operational_events/i);
    expect(sql).toMatch(/food_catalog_ingestion_heartbeat_lease_v2[\s\S]*insert\s+into\s+public\.food_ingestion_operational_events/i);
    expect(sql).toMatch(/millilitervolume[\s\S]{0,800}'ml'/i);

    for (const evidence of [
      "cross-attempt live lease",
      "cross-attempt materialized resume",
      "lease lifecycle events",
      "nullable serving label",
      "explicit milliliter serving evidence",
    ]) {
      expect(verificationSql).toContain(evidence);
    }
  });

  it("revalidates the target Production run after the batch/run locks are acquired", () => {
    expect(sql).toMatch(
      /select\s+\*\s+into\s+v_run\s+from\s+public\.food_ingestion_runs\s+where\s+id\s*=\s*v_run_id\s+for\s+update;[\s\S]{0,320}if\s+not\s+found\s+or\s+v_run\.execution_mode\s*<>\s*'production'\s+or\s+v_run\.status\s+not\s+in\s*\(\s*'prepared'\s*,\s*'running'\s*\)/i,
    );
  });

  it("exposes only narrow service-role command RPCs with pinned security-definer boundaries", () => {
    for (const rpc of rpcs) {
      expect(sql).toMatch(
        new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${rpc}\\s*\\(\\s*(?:p_command\\s+)?jsonb\\s*\\)`, "i"),
      );
      expect(sql).toMatch(
        new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${rpc}\\s*\\(\\s*jsonb\\s*\\)\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`, "i"),
      );
      expect(sql).toMatch(
        new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${rpc}\\s*\\(\\s*jsonb\\s*\\)\\s+to\\s+service_role`, "i"),
      );
    }
    expect(sql.match(/security\s+definer/g)?.length ?? 0).toBeGreaterThanOrEqual(rpcs.length);
    expect(
      sql.match(/set\s+search_path\s*=\s*pg_catalog\s*,\s*public\s*,\s*private\s*,\s*extensions/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(rpcs.length);
    expect(sql).toMatch(/pg_advisory_xact_lock\s*\(\s*hashtextextended\s*\(/i);
    expect(sql).toContain("food_catalog_ingestion_assert_active_lease_v2");
  });

  it("registers executable lease, immutability, semantic reconciliation and privilege verification", () => {
    expect(existsSync(VERIFICATION_PATH)).toBe(true);
    expect(verificationSql).toContain("live lease");
    expect(verificationSql).toContain("stale takeover");
    expect(verificationSql).toContain("immutable");
    expect(verificationSql).toContain("quarantine");
    expect(verificationSql).toContain("duplicate_semantic_result");
    expect(verificationSql).toContain("partial_execution");
    expect(verificationSql).toContain("manifest tamper");
    expect(verificationSql).toContain("structured plan 1 facts");
    expect(verificationSql).toContain("completed dry-run rejects candidate");
    expect(verificationSql).toContain("service_role");
    expect(verificationSql).toContain("rollback");
  });

  it("records the verified Production application under the generated immutable alias", () => {
    expect(ledger.productionMigrationCount).toBe(63);
    expect(ledger.productionRecordCount).toBe(119);
    expect(ledger.pendingCount).toBe(0);
    expect(ledger.unresolvedCount).toBe(0);
    expect(ledger.historyRepair.state).toBe("reconciled");
    expect(ledger.historyRepair.pendingCount).toBe(0);
    expect(ledger.historyRepair.unresolvedCount).toBe(0);
    expect(ledger.historyRepair.schemaAppliedUntrackedCount).toBe(0);
    expect(releaseCompatibility.databaseMigrationMarkerVersion).toBe("20260724232734");

    const pendingEntries = ledger.entries.filter((entry) => entry.state === "pending");
    expect(pendingEntries).toHaveLength(0);

    const plan4 = ledger.entries.find((entry) => entry.localFile === MIGRATION_FILE);
    expect(plan4).toEqual({
      localFile: MIGRATION_FILE,
      state: "applied_version_alias",
      note: "differs; repository migration applied exactly once to Plaivra Production on 2026-09-06 as generated identity 20260906131808_food_catalog_ingestion_v2_authority from frozen Git blob eb2cdc2ee16462d7712080a3e3532757ec093742 after exact merged-main/blob/history/schema-drift preflight. Read-back proved all nine Plan 4 authority tables with RLS, service_role SELECT without direct mutation, service-role-only SECURITY DEFINER command RPCs, semantic batch identity/freeze, deterministic batch-run locking, lease lifecycle and stale-attempt terminalization, immutable manifest/quarantine/reconciliation/release-diff authority, zero-record dry-run support, and the inherited Batch 0 service_role direct-mutation guard. Food/source/ingestion/generation data remained unpopulated, current_generation_id remained NULL with pointer_revision 0, and no activation, verification approval, provider ingestion, generation creation/promotion, runtime cutover, deployment, or Activity Catalog mutation occurred. Do not replay.",
      productionVersion: "20260906131808",
      productionName: "food_catalog_ingestion_v2_authority",
    });

    const plan3 = ledger.entries.find((entry) => entry.localFile === "20260902150000_food_catalog_generation_authority.sql");
    expect(plan3?.productionVersion).toBe("20260903210503");
    expect(plan3?.productionName).toBe("food_catalog_generation_authority");
    expect(reconciliationDoc).toContain(MIGRATION_FILE);
    expect(reconciliationDoc).toContain("20260906131808_food_catalog_ingestion_v2_authority");
    expect(reconciliationDoc).toContain("physical production migration records: **119**");
    expect(reconciliationDoc).toContain("pending repository migrations: **0**");
    expect(reconciliationDoc).toContain("`unresolvedcount = 0`");
  });
});