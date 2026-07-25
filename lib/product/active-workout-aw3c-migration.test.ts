import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260725013000_active_workout_aw3c_immutable_prescription_snapshots.sql",
  "utf8"
);
const auditCorrection = readFileSync(
  "supabase/migrations/20260725163000_active_workout_aw3c_audit_corrections.sql",
  "utf8"
);

describe("AW-3C immutable prescription migration", () => {
  it("creates the exact normalized child graph and composite ownership path", () => {
    expect(migration).toContain("create table public.workout_session_prescription_sets");
    expect(migration).toContain("create table public.workout_session_prescription_metric_targets");
    expect(migration).toContain("foreign key (snapshot_id, workout_session_id, user_id)");
    expect(migration).toContain("foreign key (snapshot_item_id, snapshot_id, user_id)");
    expect(migration).toContain("foreign key (prescription_set_id, snapshot_item_id, workout_session_id, user_id)");
    expect(migration).toContain("references public.workout_performance_metric_definitions(metric_key, metric_version)");
  });

  it("materializes every item path with one private authority and immutable guards", () => {
    expect(migration).toContain("private.materialize_workout_session_prescription_item");
    expect(migration).toContain("workout_session_snapshot_item_prescription_materializer");
    expect(migration).toContain("plaivra.session_snapshot_mutation_id");
    expect(migration).toContain("Workout-session prescription sets are immutable");
    expect(migration).toContain("Workout-session prescription targets are immutable");
    expect(migration).toContain("rest_seconds', resolved.rest_seconds");
    expect(migration).toContain("restSeconds remains an explicit read-compatibility alias");
  });

  it("bounds input, rejects contradictions and preserves protected history", () => {
    expect(migration).toContain("65536");
    expect(migration).toContain("set_targets exceeds 100 entries");
    expect(migration).toContain("at most 16 entries");
    expect(migration).toContain("Duplicate explicit set_order");
    expect(migration).toContain("Duplicate prescription target identity");
    expect(migration).toContain("v_scalar_targets jsonb := '[]'::jsonb");
    expect(migration).toContain("snapshot_json_hash");
    expect(migration).toContain("AW-3C changed protected workout history");
    expect(migration).toContain("20260724232734");
  });

  it("keeps RLS read-only for owners and private functions non-executable", () => {
    expect(migration).toContain("user_id = (select auth.uid())");
    expect(migration).toContain("grant select on table public.workout_session_prescription_sets to authenticated, service_role");
    expect(migration).toContain("revoke all on function private.materialize_workout_session_prescription_item(uuid)");
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)[^;]*workout_session_prescription_/i);
  });

  it("makes multi-target retries canonical without editing the immutable base migration", () => {
    expect(auditCorrection).toContain("private.canonicalize_workout_session_prescription_graph");
    expect(auditCorrection).toContain("canonicalize_workout_session_prescription_graph(v_existing)");
    expect(auditCorrection).toContain("canonicalize_workout_session_prescription_graph(v_expected)");
    expect(auditCorrection).toContain("set_order must be contiguous");
    expect(auditCorrection).toContain("AW-3C audit correction changed immutable prescription data");
    expect(auditCorrection).toContain("revoke all on function private.canonicalize_workout_session_prescription_graph(jsonb)");
    expect(auditCorrection).not.toMatch(/update\s+public\.workout_session_prescription_(sets|metric_targets)/i);
    expect(auditCorrection).not.toMatch(/delete\s+from\s+public\.workout_session_prescription_(sets|metric_targets)/i);
  });
});
