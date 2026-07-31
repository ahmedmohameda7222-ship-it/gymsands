import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260731090000_active_workout_aw9_offline_multi_device.sql";
const migration = readFileSync(migrationPath, "utf8");

describe("AW-9 additive database authority", () => {
  it("adds claim_control without modifying an applied migration", () => {
    expect(migration).toContain("'claim_control'");
    expect(migration).toContain("'controller_conflict'");
    expect(migration).toContain(
      "private.assert_active_workout_controller",
    );
    expect(migration).toContain("for update");
    expect(migration).not.toContain(
      "update public.release_schema_compatibility",
    );
  });

  it("guards every Active Workout write surface with additive overloads", () => {
    for (const signature of [
      "public.upsert_workout_set_logs_atomic",
      "public.complete_workout_session_atomic",
      "public.replace_workout_session_snapshot_item_atomic",
      "public.skip_workout_session_snapshot_item_atomic",
      "public.cancel_workout_session_atomic",
    ])
      expect(migration).toContain(signature);
    expect(
      migration.match(/perform private\.assert_active_workout_controller/g),
    ).toHaveLength(6);
  });

  it("keeps claim_control as the only controller-changing command", () => {
    expect(migration).toContain(
      "set controller_device_id = v_controller::text",
    );
    expect(migration).toContain(
      "if p_command_type <> 'claim_control' then",
    );
    expect(migration).toContain(
      "return public.aw9_pre_apply_workout_session_execution_command_atomic",
    );
  });
});
