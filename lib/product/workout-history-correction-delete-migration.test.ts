import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260801160000_workout_history_correction_and_soft_delete.sql",
  "utf8",
);
const verification = readFileSync(
  "supabase/verification/workout-history-correction-delete.sql",
  "utf8",
);

describe("WH-7 correction and deletion migration authority", () => {
  it("adds only the bounded deletion lifecycle and revision fields", () => {
    expect(migration).toContain("deleted_at timestamptz");
    expect(migration).toContain("purge_after timestamptz");
    expect(migration).toContain("history_revision bigint not null default 0");
    expect(migration).toContain("purge_after>=deleted_at");
    expect(migration).not.toMatch(/archive|deleted_session/i);
  });

  it("forward-extends the immutable timeline with concise history events", () => {
    for (const type of [
      "session_corrected",
      "session_soft_deleted",
      "session_restored",
      "session_repeat_started",
    ])
      expect(migration).toContain(type);
    expect(migration).toContain("octet_length(v_request::text)>65536");
    expect(migration).not.toContain("before_session_graph");
  });

  it("keeps terminal log mutation behind a signed exact transaction scope", () => {
    expect(migration).toContain("private.workout_history_correction_authority");
    expect(migration).toContain("private.workout_history_scope_signature");
    expect(migration).toContain(
      "plaivra.terminal_exercise_log_mutation_session_id",
    );
    expect(migration).toContain(
      "plaivra.workout_history_correction_operation_id",
    );
    expect(migration).toContain("plaivra.workout_history_correction_signature");
    expect(migration).toContain("from public,anon,authenticated,service_role");
  });

  it("bounds cleanup, locks batches, and limits execution to service role", () => {
    expect(migration).toContain("p_batch_size not between 1 and 500");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("purge_after<=clock_timestamp()");
    expect(migration).toContain(
      "grant execute on function public.purge_expired_workout_sessions(integer,boolean) to service_role",
    );
  });

  it("registers behavioral SQL verification", () => {
    expect(verification).toContain("correct_completed_workout_session_atomic");
    expect(verification).toContain("soft_delete_workout_session_atomic");
    expect(verification).toContain("purge_expired_workout_sessions");
  });
});
