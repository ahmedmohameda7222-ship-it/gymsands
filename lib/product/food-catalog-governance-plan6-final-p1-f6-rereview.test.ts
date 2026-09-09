import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const worker = readFileSync("lib/privacy/account-deletion-worker.ts", "utf8");
const route = readFileSync("app/api/user/privacy-requests/route.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260908100000_food_catalog_governance_control_plane.sql", "utf8");

describe("Plan 6 final P1-F6 deletion resumability contract", () => {
  it("keeps post-begin failures claimable instead of terminally abandoning a disabled account", () => {
    expect(worker).toContain('"deleting_auth"');
    expect(worker).toContain('DEFINITELY_POST_TRANSITION_STAGES');
    expect(worker).toContain('transition === "pre_transition"');
    expect(worker).toContain('state: terminalPreTransitionFailure ? "failed" : "retry_scheduled"');
    expect(worker).toContain('retry_attention_required: true');
    expect(worker).toContain('retry_threshold_exceeded_attempt_count: job.attempt_count');
    expect(worker).toContain('deletionRetryDelayMinutes(job.attempt_count)');
  });

  it("atomically checkpoints canonical purge before Auth deletion so retries resume without repurge", () => {
    expect(worker).toContain('food_catalog_purge_account_application_data_for_deletion_job');
    expect(worker).toContain('await deleteAuthUser(admin, job.user_id)');
    expect(migration).toContain('food_catalog_purge_account_application_data_for_deletion_job');
    expect(migration).toContain("set stage='deleting_auth',evidence=v_evidence");
    expect(migration).toContain("'application_data_purge_checkpointed',true");
    expect(migration).toContain("state in ('processing','retry_scheduled')");
    expect(migration).toContain("check (stage in ('queued','revoking_connections','disabling_access','deleting_storage','provider_cleanup','deleting_database','deleting_auth','notification','completed'))");
  });

  it("owner-scopes both HTTP deletion replay reads while preserving the database cross-user guard", () => {
    expect(route).toMatch(/account_deletion_jobs[\s\S]*?\.eq\("user_id", context\.user\.id\)[\s\S]*?\.eq\("idempotency_key_hash", validated\.idempotencyKeyHash\)/);
    expect(route).toMatch(/account_deletion_jobs[\s\S]*?\.eq\("user_id", context\.user\.id\)[\s\S]*?\.eq\("request_id", activeRequest\.data\.id\)/);
    expect(migration).toContain("Deletion idempotency authority belongs to another account.");
  });
});
