import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260904100000_food_catalog_ingestion_v2_authority.sql",
  "utf8",
).toLowerCase();

describe("Food Catalog Plan 4 independent-review hardening", () => {
  it("requires an exact completed reconciled dry run before reviewed -> approved", () => {
    expect(sql).toMatch(
      /old\.review_state\s*=\s*'reviewed'[\s\S]{0,160}new\.review_state\s*=\s*'approved'[\s\S]{0,1800}execution_mode\s*=\s*'dry_run'[\s\S]{0,900}status\s*=\s*'completed'[\s\S]{0,900}reconciled/i,
    );
    expect(sql).toContain("approval requires completed reconciled dry run");
  });

  it("reuses identical dry-run batch membership and manifest authority across attempts", () => {
    expect(sql).toMatch(
      /insert\s+into\s+public\.food_ingestion_batch_records[\s\S]{0,500}on\s+conflict\s*\(\s*batch_id\s*,\s*source_record_id\s*\)\s+do\s+nothing/i,
    );
    expect(sql).toMatch(
      /insert\s+into\s+public\.food_ingestion_manifest_records[\s\S]{0,900}on\s+conflict\s*\(\s*batch_id\s*,\s*source_record_key\s*\)\s+do\s+nothing/i,
    );
    expect(sql).toContain("dry-run staged membership conflicts with reviewed authority");
    expect(sql).toContain("dry-run staged manifest conflicts with reviewed authority");
  });

  it("binds quarantine outcome, reasons, candidates and evidence to the reviewed manifest record", () => {
    expect(sql).toMatch(
      /food_catalog_ingestion_record_quarantine_v2[\s\S]*from\s+public\.food_ingestion_manifest_records[\s\S]*decision_json[\s\S]*disposition_json[\s\S]*issues_json/i,
    );
    expect(sql).toContain("quarantine command conflicts with reviewed manifest authority");
  });

  it("recomputes release-diff checksum from exact batch identities and canonical records before insertion", () => {
    expect(sql).toMatch(
      /food_catalog_ingestion_record_release_diff_v2[\s\S]*semantic_identity_checksum_sha256[\s\S]*extensions\.digest[\s\S]*sha256/i,
    );
    expect(sql).toContain("release diff checksum does not match canonical batch identities and records");
  });
});
