import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260801180000_workout_history_repeat_session.sql",
  "utf8",
);
const verification = readFileSync(
  "supabase/verification/workout-history-repeat.sql",
  "utf8",
);

describe("WH-8 repeat-session migration authority", () => {
  it("adds nullable provenance without an unproven relationship index", () => {
    expect(migration).toContain(
      "repeated_from_session_id uuid null references public.workout_sessions(id) on delete set null",
    );
    expect(migration).toContain("workout_sessions_repeat_not_self_check");
    expect(migration).not.toMatch(/create index[^;]+repeated_from_session_id/i);
  });

  it("uses the existing snapshot, prescription, execution, and timeline authorities", () => {
    expect(migration).toContain("plaivra.direct_session_authoritative_start");
    expect(migration).toContain("private.phase3_refresh_snapshot_completeness");
    expect(migration).toContain(
      "private.assert_workout_session_muscle_snapshot_supported",
    );
    expect(migration).toContain("session_repeat_started");
    expect(migration).not.toMatch(/insert into public\.exercise_logs/i);
    expect(migration).not.toMatch(/insert into public\.personal_records/i);
  });

  it("bounds and serializes idempotent multi-device starts", () => {
    expect(migration).toContain(
      "jsonb_array_length(coalesce(p_item_choices,'[]'::jsonb)) not between 1 and 100",
    );
    expect(migration).toContain("octet_length(v_request::text)>65536");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("candidate_session_id=p_candidate_session_id");
  });

  it("registers permanent positive and negative SQL verification", () => {
    expect(verification).toContain("start_repeated_workout_session_atomic");
    expect(verification).toContain("WH-8 allowed a non-owner repeat");
    expect(verification).toContain(
      "WH-8 hard purge did not null repeat provenance",
    );
  });
});
