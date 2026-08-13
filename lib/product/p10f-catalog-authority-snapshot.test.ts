import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(process.cwd(), "supabase/migrations/20260811234000_p10f_v2_plan_activity_catalog_authority_snapshot.sql");
const migration = fs.readFileSync(migrationPath, "utf8");

describe("P10F V2 plan Catalog authority snapshot", () => {
  it("adds only the approved nullable JSONB snapshot and never rewrites historical rows", () => {
    expect(migration).toMatch(/add column if not exists catalog_authority_snapshot jsonb/i);
    expect(migration).not.toMatch(/catalog_authority_snapshot\s+jsonb\s+not null/i);
    expect(migration).not.toMatch(/catalog_authority_snapshot\s+jsonb[^;]*default/i);
    expect(migration).not.toMatch(/update\s+public\.user_workout_plan_activities/i);
  });

  it("validates release, activity, revision, schema, mapping, policy, and capability authority server-side", () => {
    for (const token of [
      "libraryRelease",
      "catalogRelease",
      "activityId",
      "revisionId",
      "revisionNumber",
      "prescriptionSchema",
      "performedMetricSchema",
      "recordDefinitions",
      "mappingAuthority",
      "publicationPolicy",
      "capabilityContract"
    ]) expect(migration).toContain(token);
    expect(migration).toContain("private.validate_p10f_catalog_authority_snapshot");
    expect(migration).toContain("Catalog authority snapshot activity identity mismatch.");
  });

  it("makes a materialized snapshot immutable without weakening existing RLS or exposing mutation authority", () => {
    expect(migration).toContain("old.catalog_authority_snapshot is not null");
    expect(migration).toContain("new.catalog_authority_snapshot is distinct from old.catalog_authority_snapshot");
    expect(migration).toContain("Catalog authority snapshot is immutable after materialization.");
    expect(migration).not.toMatch(/disable row level security/i);
    expect(migration).not.toMatch(/create policy/i);
    expect(migration).toContain("revoke all on function private.validate_p10f_catalog_authority_snapshot(jsonb) from public, anon, authenticated, service_role");
    expect(migration).toContain("grant execute on function private.validate_p10f_catalog_authority_snapshot(jsonb) to authenticated, service_role");
    expect(migration).not.toMatch(/grant\s+execute\s+on\s+function\s+private\.validate_p10f_catalog_authority_snapshot\(jsonb\)\s+to\s+anon/i);
    expect(migration).toContain("revoke all on function private.enforce_p10f_catalog_authority_snapshot() from public, anon, authenticated, service_role");
    expect(migration).not.toMatch(/grant\s+execute\s+on\s+function\s+private\.enforce_p10f_catalog_authority_snapshot/i);
  });
});