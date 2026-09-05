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
    const quarantineRpc = sql.match(
      /create\s+or\s+replace\s+function\s+public\.food_catalog_ingestion_record_quarantine_v2[\s\S]*?\nend\n\$function\$;/i,
    )?.[0] ?? "";
    expect(quarantineRpc).toMatch(/from\s+public\.food_ingestion_manifest_records/i);
    expect(quarantineRpc).toContain("decision_json");
    expect(quarantineRpc).toContain("disposition_json");
    expect(quarantineRpc).toContain("issues_json");
    expect(quarantineRpc).toContain("quarantine command conflicts with reviewed manifest authority");
  });

  it("derives release-diff classifications from immutable manifests and recomputes the checksum before insertion", () => {
    const releaseDiffRpc = sql.match(
      /create\s+or\s+replace\s+function\s+public\.food_catalog_ingestion_record_release_diff_v2[\s\S]*?\nend\n\$function\$;/i,
    )?.[0] ?? "";
    expect(releaseDiffRpc).toMatch(/from\s+public\.food_ingestion_manifest_records/i);
    expect(releaseDiffRpc).toMatch(
      /semantic_identity_checksum_sha256[\s\S]*extensions\.digest[\s\S]*sha256/i,
    );
    expect(releaseDiffRpc).toContain(
      "release diff claimed classifications do not match immutable manifest classification authority",
    );
    expect(releaseDiffRpc).toContain("release diff checksum does not match immutable manifest authority");
  });

  it("requires frozen successfully reconciled dry-run authority before recording an immutable release diff", () => {
    const releaseDiffRpc = sql.match(
      /create\s+or\s+replace\s+function\s+public\.food_catalog_ingestion_record_release_diff_v2[\s\S]*?\nend\n\$function\$;/i,
    )?.[0] ?? "";
    expect(releaseDiffRpc).toMatch(/review_state[\s\S]*prepared/i);
    expect(releaseDiffRpc).toMatch(/from\s+public\.food_ingestion_reconciliations/i);
    expect(releaseDiffRpc).toMatch(
      /execution_mode\s*=\s*'dry_run'[\s\S]*status\s*=\s*'completed'[\s\S]*reconciled/i,
    );
    expect(releaseDiffRpc).toContain(
      "release diff requires frozen successfully reconciled manifest authority",
    );
  });

  it("terminalizes an expired prior Production attempt during cross-attempt lease takeover", () => {
    const acquireLeaseRpc = sql.match(
      /create\s+or\s+replace\s+function\s+public\.food_catalog_ingestion_acquire_lease_v2[\s\S]*?\nend\n\$function\$;/i,
    )?.[0] ?? "";
    expect(acquireLeaseRpc).toMatch(
      /update\s+public\.food_ingestion_runs[\s\S]*status\s*=\s*'cancelled'[\s\S]*completed_at\s*=[\s\S]*lease_owner\s*=\s*null[\s\S]*lease_token\s*=\s*null/i,
    );
    expect(acquireLeaseRpc).toMatch(/id\s*<>\s*v_run_id/i);
    expect(acquireLeaseRpc).toContain("superseded by cross-attempt stale lease takeover");
  });
});
