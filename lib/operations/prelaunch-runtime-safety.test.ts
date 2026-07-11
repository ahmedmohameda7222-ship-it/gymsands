import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const file = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("prelaunch runtime safety migration", () => {
  const migration = file("supabase/migrations/20260711013000_prelaunch_runtime_safety_corrections.sql");

  it("owns the release compatibility marker in the database", () => {
    expect(migration).toContain("release_schema_compatibility");
    expect(migration).toContain("values (true, '2', '20260711013000'");
  });

  it("atomically consumes OAuth codes after all request bindings match", () => {
    expect(migration).toContain("consume_mcp_oauth_authorization_code");
    expect(migration).toContain("codes.code_challenge = p_code_challenge");
    expect(migration).toContain("codes.resource = p_resource");
  });

  it("provides leased recovery for idempotency, deletion, and billing jobs", () => {
    expect(migration).toContain("claim_mcp_idempotency_key");
    expect(migration).toContain("stale_processing_recovered");
    expect(migration).toContain("claim_billing_events");
  });
});
