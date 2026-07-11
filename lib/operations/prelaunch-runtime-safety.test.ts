import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const file = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("prelaunch runtime safety migrations", () => {
  const migration = file("supabase/migrations/20260711013000_prelaunch_runtime_safety_corrections.sql");
  const idempotencyGuard = file("supabase/migrations/20260711014500_idempotency_uncertain_completion_guard.sql");

  it("owns the release compatibility marker in the database", () => {
    expect(migration).toContain("release_schema_compatibility");
    expect(migration).toContain("values (true, '2', '20260711013000'");
    expect(idempotencyGuard).toContain("migration_version = '20260711014500'");
  });

  it("atomically consumes OAuth codes after all request bindings match", () => {
    expect(migration).toContain("consume_mcp_oauth_authorization_code");
    expect(migration).toContain("codes.code_challenge = p_code_challenge");
    expect(migration).toContain("codes.resource = p_resource");
  });

  it("provides leased recovery for deletion and billing jobs", () => {
    expect(migration).toContain("stale_processing_recovered");
    expect(migration).toContain("claim_billing_events");
  });

  it("does not automatically repeat a mutation after uncertain completion", () => {
    expect(idempotencyGuard).toContain("existing.status in ('completed', 'failed')");
    expect(idempotencyGuard).toContain("return query select 'review_required'::text, existing.id, existing.response");
    expect(idempotencyGuard).not.toContain("attempt_count = keys.attempt_count + 1");
  });
});
