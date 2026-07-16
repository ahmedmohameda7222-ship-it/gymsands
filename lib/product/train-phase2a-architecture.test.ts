import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260715190000_train_phase2a_program_architecture.sql";
const verificationPath = "supabase/verification/train-phase2a-program-architecture.sql";
const migration = readFileSync(migrationPath, "utf8").toLowerCase();
const verification = readFileSync(verificationPath, "utf8").toLowerCase();
const adr = readFileSync("docs/architecture/decisions/0004-train-multi-week-multi-sport-program-model.md", "utf8");
const canonical = readFileSync("docs/architecture/canonical-domain-model.md", "utf8");
const workflow = readFileSync(".github/workflows/quality.yml", "utf8");
const migrationLedger = JSON.parse(readFileSync("supabase/migration-ledger.json", "utf8")) as {
  historyRepair: { state: string };
  pendingCount: number;
  unresolvedCount: number;
  entries: Array<{ localFile: string; state: string; productionVersion?: string; productionName?: string }>;
};

const requiredTables = [
  "user_workout_plan_week_templates",
  "user_workout_plan_weeks",
  "user_workout_plan_sessions",
  "user_workout_plan_phases",
  "user_workout_plan_activities"
];

describe("Train Phase 2A architecture contract", () => {
  it("uses one forward-only transaction and creates the approved hierarchy", () => {
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    for (const table of requiredTables) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration).toContain("foreign key (week_template_id, plan_id)");
    expect(migration).toContain("week_number between 1 and 104");
    expect(migration).toContain("day_offset between 0 and 6");
    expect(migration).toContain("source = 'legacy_backfill' or btrim(coalesce(sport_slug, '')) <> ''");
    expect(migration).not.toContain("create type public.training_phase");
  });

  it("adds only nullable compatibility bridges and preserves the existing runtime RPCs", () => {
    expect(migration).toContain("user_workout_sessions\n  add column if not exists plan_week_id uuid");
    expect(migration).toContain("workout_sessions\n  add column if not exists plan_week_id uuid");
    expect(migration).toContain("user_exercise_logs\n  add column if not exists plan_activity_id uuid");
    expect(migration).toContain("exercise_logs\n  add column if not exists plan_activity_id uuid");
    expect(migration).toContain("historical week_index is not sufficient proof");
    expect(migration).not.toContain("drop function public.activate_workout_plan_atomic");
    expect(migration).not.toContain("drop function public.create_workout_plan_atomic");
    expect(migration).not.toContain("drop table public.user_workout_plan_days");
    expect(migration).not.toContain("drop table public.workout_sessions");
  });

  it("backfills locally without inventing catalog or prescription data", () => {
    expect(migration).toContain("deterministic local backfill");
    expect(migration).toContain("plaivra_legacy_strength_prescription_v1");
    expect(migration).toContain("jsonb_strip_nulls(jsonb_build_object(");
    expect(migration).toContain("'legacy training'");
    expect(migration).toContain("catalog_activity_id,\n  catalog_slug,\n  catalog_version");
    expect(migration).toContain("null,\n  null,\n  null,\n  'legacy'");
    expect(migration).not.toContain("http://");
    expect(migration).not.toContain("https://");
  });

  it("implements an owner-scoped atomic and idempotent detach operation", () => {
    expect(migration).toContain("detach_workout_plan_week_atomic(\n  p_user_id uuid,\n  p_plan_week_id uuid");
    expect(migration).toContain("perform public.assert_workout_actor(p_user_id)");
    expect(migration).toContain("for update");
    expect(migration).toContain("derived_from_template_id");
    expect(migration).toContain("'clone_created', false");
    expect(migration).toContain("'clone_created', true");
    expect(migration).toContain("source_legacy_plan_exercise_id,\n        legacy_source_workout_id");
    expect(migration).toContain("cloned_phase_id,\n        null,");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("grant execute on function public.detach_workout_plan_week_atomic(uuid, uuid)\nto authenticated, service_role");
  });

  it("enforces privacy, ownership, JSON shape, and verification in the authoritative quality gate", () => {
    expect(migration).toContain("assert_train_phase2a_session_structure_integrity");
    expect(migration).toContain("assert_train_phase2a_activity_structure_integrity");
    expect(migration).not.toContain("assert_train_phase2a_structure_integrity");
    expect(migration).toContain("assert_train_phase2a_bridge_integrity");
    expect(migration).toContain("(select private.is_admin())");
    expect(migration).toContain("create or replace function private.can_access_workout_plan");
    expect(migration).toContain("private.can_access_workout_plan");
    expect(verification).toContain("private.can_access_workout_plan");
    expect(migration).toContain("(select auth.uid())");
    expect(migration).not.toContain("public.is_admin()");
    expect(migration).toContain("jsonb_typeof(planned_prescription) = 'object'");
    expect(migration).toContain("revoke all on public.user_workout_plan_week_templates from public, anon");
    expect(verification).toContain("rls exposed another member");
    expect(verification).toContain("cross-plan assigned week unexpectedly succeeded");
    expect(verification).toContain("detach rpc is not idempotent");
    expect(verification).toContain("failed detach left a partial cloned template");
    expect(verification).toContain("account deletion did not remove train phase 2a user data");
    expect(workflow).toContain("-f supabase/verification/train-phase2a-program-architecture.sql");
  });

  it("records the verified Phase 2A production identity and reconciles migration history", () => {
    const phase2aEntry = migrationLedger.entries.find(
      (entry) => entry.localFile === "20260715190000_train_phase2a_program_architecture.sql"
    );
    expect(phase2aEntry?.state).toBe("applied");
    expect(phase2aEntry?.productionVersion).toBe("20260715190000");
    expect(phase2aEntry?.productionName).toBe("train_phase2a_program_architecture");
    expect(migrationLedger.historyRepair.state).toBe("reconciled");
    expect(migrationLedger.pendingCount).toBe(0);
    expect(migrationLedger.unresolvedCount).toBe(0);
  });

  it("documents the target model without claiming runtime cutover", () => {
    expect(adr).toContain("Phase 2A is not a runtime cutover");
    expect(adr).toContain("A third performed-session root is prohibited");
    expect(adr).toContain("assigned program week");
    expect(adr).toContain("explicit local schedule start date");
    expect(canonical).toContain("The approved target program architecture is");
    expect(canonical).toContain("the active runtime plan write path remains");
  });
});
