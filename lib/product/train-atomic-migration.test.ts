import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260713160000_train_section_atomic_integrity.sql";
const migration = readFileSync(migrationPath, "utf8");

const rpcNames = [
  "activate_workout_plan_atomic",
  "create_workout_plan_atomic",
  "save_workout_plan_day_atomic",
  "save_workout_plan_atomic",
  "duplicate_workout_plan_atomic",
  "archive_workout_plan_atomic",
  "delete_workout_plan_atomic",
  "start_or_resume_workout_session_atomic",
  "upsert_workout_set_logs_atomic",
  "complete_workout_session_atomic"
] as const;

describe("Train atomic-integrity migration contract", () => {
  it("wraps the migration in one transaction and runs fail-closed preflight checks before indexes", () => {
    expect(migration.trimStart().toLowerCase().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().toLowerCase().endsWith("commit;")).toBe(true);

    const preflightEnd = migration.indexOf("create unique index if not exists user_workout_plans_one_active_uidx");
    expect(preflightEnd).toBeGreaterThan(0);
    const failClosedBlock = migration.slice(
      0,
      migration.indexOf("create or replace function public.duplicate_workout_plan_atomic")
    );
    for (const evidence of [
      "multiple active plans",
      "duplicate open sessions",
      "stable plan-set keys are duplicated",
      "legacy order-set keys are duplicated",
      "cross-owner or mismatched plan references",
      "cross-owner or mismatched exercise references"
    ]) {
      expect(failClosedBlock).toContain(evidence);
    }
    expect(failClosedBlock.match(/raise exception 'Train migration blocked:/g)?.length).toBeGreaterThanOrEqual(6);
    expect(failClosedBlock).not.toMatch(/delete\s+from\s+public\./i);
  });

  it("declares every reviewed atomic RPC with a hardened search path", () => {
    for (const name of rpcNames) {
      const declaration = new RegExp(
        `create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\([\\s\\S]*?set\\s+search_path\\s*=\\s*''`,
        "i"
      );
      expect(migration, name).toMatch(declaration);
    }
  });

  it("enforces the reviewed partial uniqueness keys", () => {
    expect(migration).toMatch(
      /create unique index if not exists user_workout_plans_one_active_uidx\s+on public\.user_workout_plans \(user_id\)\s+where is_active = true and archived_at is null;/i
    );
    expect(migration).toMatch(
      /create unique index if not exists workout_sessions_one_open_plan_day_uidx\s+on public\.workout_sessions \(user_id, plan_day_id\)\s+where status = 'started' and plan_day_id is not null;/i
    );
    expect(migration).toMatch(
      /create unique index if not exists exercise_logs_plan_set_uidx\s+on public\.exercise_logs \(workout_session_id, plan_exercise_id, set_number\)\s+where plan_exercise_id is not null;/i
    );
    expect(migration).toMatch(
      /create unique index if not exists exercise_logs_order_set_uidx\s+on public\.exercise_logs \(workout_session_id, exercise_order, set_number\)\s+where plan_exercise_id is null and exercise_order is not null;/i
    );
  });

  it("uses stable identities and database conflict handling instead of exercise names or read-then-insert", () => {
    const upsertStart = migration.indexOf("create or replace function public.upsert_workout_set_logs_atomic");
    const completionStart = migration.indexOf("create or replace function public.complete_workout_session_atomic");
    const upsertBody = migration.slice(upsertStart, completionStart);
    expect(upsertBody).toContain("on conflict (workout_session_id, plan_exercise_id, set_number)");
    expect(upsertBody).toContain("on conflict (workout_session_id, exercise_order, set_number)");
    expect(upsertBody).not.toMatch(/on conflict\s*\([^)]*exercise_name/i);

    const startStart = migration.indexOf("create or replace function public.start_or_resume_workout_session_atomic");
    const startBody = migration.slice(startStart, upsertStart);
    expect(startBody).toContain("on conflict (user_id, plan_day_id)");
    expect(startBody).toContain("do update set started_at = public.workout_sessions.started_at");
  });

  it("keeps destructive plan operations confirmed and history preserving", () => {
    expect(migration).toMatch(/if\s+p_confirmed\s+is\s+distinct\s+from\s+true\s+then/i);
    expect(migration).toContain("Explicit confirmation is required to delete a workout plan.");
    expect(migration).toContain("This plan has workout history or scheduled sessions. Archive it instead.");
    expect(migration).toContain("prevent_workout_history_identity_delete");
    expect(migration).toMatch(/set archived_at = v_now[\s\S]*not \(id = any\(v_keep_ids\)\)/i);
  });

  it("revokes anonymous execution and grants only authenticated runtime roles", () => {
    for (const name of rpcNames) {
      expect(migration, `${name} revoke`).toMatch(
        new RegExp(`revoke all on function public\\.${name}\\([^;]+\\) from public, anon;`, "i")
      );
      expect(migration, `${name} grant`).toMatch(
        new RegExp(`grant execute on function public\\.${name}\\([^;]+\\) to authenticated, service_role;`, "i")
      );
    }
    expect(migration).toContain("perform public.assert_workout_actor(p_user_id);");
    expect(migration).toContain("raise exception 'Authentication required.'");
    expect(migration).toContain("current_user <> 'service_role'");
    expect(migration).toContain("auth.uid() <> p_user_id");
  });

  it("completes logs and session state in one idempotent RPC", () => {
    const completionStart = migration.indexOf("create or replace function public.complete_workout_session_atomic");
    const completionBody = migration.slice(completionStart);
    expect(completionBody).toContain("if v_session.status = 'completed' then");
    expect(completionBody).toContain("'already_completed', true");
    expect(completionBody).toContain("v_logs := public.upsert_workout_set_logs_atomic");
    expect(completionBody).toMatch(/set status = 'completed', completed_at = v_now/);
    expect(completionBody.indexOf("v_logs := public.upsert_workout_set_logs_atomic")).toBeLessThan(
      completionBody.indexOf("set status = 'completed', completed_at = v_now")
    );
  });
});
