import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const file = "supabase/migrations/20261013040000_food_catalog_plan9_batch_review_authority.sql";
function sql() {
  return readFileSync(file, "utf8").toLowerCase();
}

describe("Plan 9 human ingestion batch review migration", () => {
  it("adds a dedicated human review capability without granting it to the service role", () => {
    const migration = sql();
    expect(migration).toContain("food.ingestion.review");
    expect(migration).toContain("private.food_catalog_governance_principal_for_user()");
    expect(migration).toContain("private.food_catalog_governance_begin_operation(");
    expect(migration).toContain("private.food_catalog_governance_finish_operation(");
    expect(migration).toMatch(/revoke execute on function public\.food_catalog_review_ingestion_batch_v1\(jsonb\) from public, anon, authenticated, service_role/);
    expect(migration).toMatch(/grant execute on function public\.food_catalog_review_ingestion_batch_v1\(jsonb\) to authenticated/);
    expect(migration).not.toMatch(/grant execute[^;]*to service_role/i);
  });

  it("requires an exact completed DB dry-run and bound manifest, source, config and semantic identity", () => {
    const migration = sql();
    for (const evidence of [
      "manifest_content_checksum_sha256", "semantic_identity_checksum_sha256",
      "source_checksum_sha256", "config_checksum_sha256", "importer_version",
      "execution_mode = 'dry_run'", "status = 'completed'", "reconciled",
      "expected_counts", "observed_counts", "mismatch_codes",
      "for update", "review_state", "approval_reference", "reviewed_at", "approved_at"
    ]) expect(migration).toContain(evidence);
  });

  it("uses exact state transitions, immutable governance audit, CAS and nonempty reasons", () => {
    const migration = sql();
    for (const evidence of [
      "'prepared'", "'reviewed'", "'approved'", "'rejected'",
      "expectedreviewstate", "expectedmutations", "operationid",
      "reason", "authorizationreference", "reconciliationid",
      "food_catalog_governance_assert_capability"
    ]) expect(migration).toContain(evidence);
    expect(migration).not.toMatch(/disable trigger|set role postgres|drop table|truncate table/);
  });
});
