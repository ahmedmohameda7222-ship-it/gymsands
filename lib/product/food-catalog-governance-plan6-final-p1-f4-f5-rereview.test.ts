import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

function functionSlice(sql: string, signature: string) {
  const start = sql.indexOf(signature);
  expect(start, `missing SQL function ${signature}`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("\n$function$;", start);
  expect(end, `unterminated SQL function ${signature}`).toBeGreaterThan(start);
  return sql.slice(start, end + "\n$function$;".length);
}

describe("Plan 6 final P1 F4/F5 rereview contracts", () => {
  const route = source("app/api/user/privacy-requests/route.ts");
  const worker = source("lib/privacy/account-deletion-worker.ts");
  const migration = source("supabase/migrations/20260908100000_food_catalog_governance_control_plane.sql");
  const privacyVerifier = source("supabase/verification/food-catalog-governance-control-plane-report-privacy-rereview.sql");

  it("queues durable deletion authority before any account/governance disabling work", () => {
    expect(route).toContain('admin.rpc("food_catalog_queue_account_deletion"');
    expect(route).not.toContain('admin.rpc("food_catalog_begin_account_deletion"');
    expect(route).not.toContain("auth.admin.signOut");
    expect(route).not.toContain("revokeDeletionConnections");

    expect(worker).toContain('admin.rpc("food_catalog_begin_account_deletion"');
    expect(worker).toContain("p_deletion_job_id: jobId");

    const queue = functionSlice(migration, "create or replace function public.food_catalog_queue_account_deletion(");
    expect(queue).toContain("account_deletion_jobs");
    expect(queue).toContain("privacy_requests");
    expect(queue).toContain("food_catalog_governance_lock_recovery_set");
    expect(queue).not.toContain("set state='deletion_pending'");
    expect(queue).not.toContain("update public.food_catalog_governance_principals");

    const begin = functionSlice(migration, "create or replace function public.food_catalog_begin_account_deletion(p_user_id uuid,p_deletion_job_id uuid)");
    expect(begin).toContain("account_deletion_jobs");
    expect(begin).toContain("p_deletion_job_id");
    expect(begin).toContain("delete from auth.sessions");
  });

  it("keeps arbitrary member claim text only in purgeable report payload", () => {
    expect(migration).toContain("claim_text text not null");
    const report = functionSlice(migration, "create or replace function public.food_catalog_report_correction(");
    expect(report).toContain("member-report:");
    expect(report).toContain("claim_text");
    expect(report).not.toContain("values(p_food_id,p_category,btrim(p_claim_key),v_issue,v_policy)");
    expect(report).not.toContain("regexp_replace(btrim(p_claim_key)");

    expect(privacyVerifier).toContain("person@example.test private claim");
    expect(privacyVerifier).toContain("claim_text");
    expect(privacyVerifier).toContain("durable global authority retained member-authored claim text");
  });
});
