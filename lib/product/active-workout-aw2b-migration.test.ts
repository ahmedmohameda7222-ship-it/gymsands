import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260722013000_active_workout_aw2b_command_authority.sql";
const migration = readFileSync(migrationPath, "utf8").replaceAll("\r\n", "\n");
const verification = readFileSync(
  "supabase/verification/active-workout-aw2b-command-authority.sql",
  "utf8"
).replaceAll("\r\n", "\n").toLowerCase();
const service = readFileSync("services/database/workout-session-execution.ts", "utf8").replaceAll("\r\n", "\n");
const contract = readFileSync("lib/workouts/workout-session-execution.ts", "utf8").replaceAll("\r\n", "\n");
const privacy = readFileSync("docs/privacy/active-workout-command-receipts.md", "utf8").replaceAll("\r\n", "\n");
const ledger = JSON.parse(readFileSync("supabase/migration-ledger.json", "utf8")) as {
  entries: Array<{ localFile: string; state: string; productionVersion?: string }>;
};

function sha256(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("AW-2B command authority migration contract", () => {
  it("keeps both applied AW-2A migrations byte-for-byte immutable", () => {
    expect(sha256("supabase/migrations/20260720213000_active_workout_aw2a_execution_state.sql"))
      .toBe("c8f21655226d51a2157fa1b8c272edc5fac1f84f0a2214376a16e225a1f04f2e");
    expect(sha256("supabase/migrations/20260721012814_active_workout_aw2a_execution_state_corrections.sql"))
      .toBe("b79920d0f9155b0c076d602b10924846409efdac54a485333242a03bbd5e5e18");
  });

  it("defines one finite receipt ledger and no generic patch command", () => {
    for (const command of [
      "move_cursor",
      "complete_set_transition",
      "start_rest",
      "clear_rest",
      "reset_timer",
      "pause",
      "resume",
      "import_legacy_cache"
    ]) expect(migration).toContain(`'${command}'`);
    for (const outcome of ["applied", "no_op", "revision_conflict"]) expect(migration).toContain(`'${outcome}'`);
    expect(migration).not.toMatch(/['"]patch['"]/);
    expect(migration).toContain("primary key (workout_session_id, command_id)");
    expect(migration).toContain("references public.workout_session_execution_states(workout_session_id) on delete cascade");
    expect(migration).toContain("references public.profiles(id) on delete cascade");
  });

  it("hardens RPC, SHA-256 request binding, and compare-and-swap revision semantics", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("perform public.assert_workout_actor(p_user_id)");
    expect(migration).toContain("extensions.digest(");
    expect(migration).toContain("'sha256'");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("state.revision = p_expected_revision");
    expect(migration).not.toMatch(/set\s+revision\s*=/i);
    expect(migration).toContain("revoke all on function public.apply_workout_session_execution_command_atomic");
    expect(migration).toContain("from public, anon");
    expect(migration).toContain("to authenticated, service_role");
  });

  it("revokes authenticated direct state mutation and keeps compatibility marker unchanged", () => {
    expect(migration).toContain("revoke update on table public.workout_session_execution_states from authenticated");
    expect(migration).toContain("drop policy if exists workout_session_execution_states_member_update");
    expect(migration).toContain("20260721012814");
    expect(migration).not.toMatch(/update\s+public\.release_schema_compatibility/i);
  });

  it("keeps permanent AW-2B verification future-safe", () => {
    expect(verification).toContain("select migration_version as aw2b_marker_baseline");
    expect(verification).toContain("migration_version=:'aw2b_marker_baseline'");
    expect(verification).toContain("changed the compatibility marker from its transaction baseline");
    expect(verification).not.toMatch(/migration_version\s+in\s*\(/);
    expect(verification).not.toMatch(
      /(?:insert\s+into|update|delete\s+from)\s+public\.release_schema_compatibility/
    );
    expect(verification).toContain("20260722013000");
    expect(verification).not.toContain("20260722161542");
  });

  it("routes normal client mutations through one typed RPC without direct UPDATE", () => {
    expect(service).toContain('.rpc("apply_workout_session_execution_command_atomic"');
    expect(service).not.toContain('.from("workout_session_execution_states")\n    .update(');
    for (const command of [
      "move_cursor",
      "complete_set_transition",
      "start_rest",
      "clear_rest",
      "reset_timer",
      "pause",
      "resume",
      "import_legacy_cache"
    ]) expect(service).toContain(`"${command}"`);
    expect(contract).toContain("WorkoutSessionExecutionRevisionConflictError");
    expect(contract).toContain("WorkoutSessionExecutionIdempotencyConflictError");
    expect(contract).toContain("incompatible states at the same revision");
  });

  it("documents the short-lived privacy export exclusion and reconciles the migration ledger", () => {
    expect(privacy).toContain("excludes `workout_session_execution_commands` from the user data export");
    expect(privacy).toContain("cascades when its transient");
    expect(ledger.entries).toContainEqual(expect.objectContaining({
      localFile: "20260722013000_active_workout_aw2b_command_authority.sql",
      state: "applied_version_alias",
      productionVersion: "20260721224813"
    }));
  });
});
