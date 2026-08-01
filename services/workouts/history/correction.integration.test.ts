import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260801160000_workout_history_correction_and_soft_delete.sql",
  "utf8",
);
const service = readFileSync("services/workouts/history/mutations.ts", "utf8");

describe("WH-7 completed-session correction boundaries", () => {
  it("requires owner, terminal state, a row lock, exact revision, and replay receipts", () => {
    expect(migration).toContain(
      "perform public.assert_workout_actor(p_user_id)",
    );
    expect(migration).toMatch(
      /where id=p_session_id and user_id=p_user_id for update/,
    );
    expect(migration).toContain(
      "v_session.history_revision<>p_expected_history_revision",
    );
    expect(migration).toContain("Workout history revision conflict.");
    expect(migration).toContain("workout_history_mutation_receipts");
    expect(migration).toContain("return v_existing.result");
  });

  it("supports bounded add, update, remove, and structured metric correction", () => {
    expect(service).toContain("input.setOperations.length > 100");
    expect(service).toContain("byteLength > 65_536");
    for (const operation of ["='remove'", "='update'", "='add'"]) {
      expect(migration).toContain(`v_operation->>'kind'${operation}`);
    }
    expect(migration).toContain("v_graph ? 'performanceMetrics'");
    expect(migration).toContain(
      "private.validate_workout_performance_metric_value",
    );
    expect(migration).toContain("exercise_log_set_details");
  });

  it("emits one revision and idempotent compact set and session events", () => {
    expect(migration).toContain("set history_revision=history_revision+1");
    expect(migration).toContain(
      "'history:correct:'||p_idempotency_key||':set:'||v_operation_index",
    );
    expect(migration).toContain("'session_corrected'");
    expect(migration).toContain("'changedFields'");
  });

  it("does not rebuild personal records for note-only corrections", () => {
    expect(migration).toContain(
      "v_performance_changed:=v_performance_changed or",
    );
    expect(migration).toContain(
      "case when v_performance_changed then null else derived_record_schema_version end",
    );
    expect(service).toMatch(/result\.data[\s\S]*performance_changed/);
  });
});
