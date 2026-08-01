import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260801180000_workout_history_repeat_session.sql",
  "utf8",
);
const service = readFileSync("services/workouts/history/repeat.ts", "utf8");

describe("WH-8 repeat integration contract", () => {
  it("preserves source order while allowing explicit omit and replacement choices", () => {
    expect(migration).toContain(
      "if v_choice->>'action'='omit' then continue; end if",
    );
    expect(migration).toContain("order by (value->>'sourceOrder')::integer");
    expect(migration).toContain(
      "Repeat use choice does not match the frozen identity.",
    );
    expect(migration).toContain(
      "private.resolve_workout_history_repeat_identity",
    );
  });

  it("rejects deleted, wrong-owner, empty-cancelled, and active-session starts", () => {
    expect(migration).toContain(
      "id=p_source_session_id and user_id=p_user_id for update",
    );
    expect(migration).toContain("v_source.deleted_at is not null");
    expect(migration).toContain(
      "Cancelled workout has no meaningful performed work.",
    );
    expect(migration).toContain("Another workout session is active.");
  });

  it("keeps new starts server-confirmed and candidate-identical", () => {
    expect(service).toContain(
      'supabase.rpc("start_repeated_workout_session_atomic"',
    );
    expect(migration).toContain("p_candidate_session_id,p_user_id");
    expect(migration).toContain("'candidateSessionId',p_candidate_session_id");
    expect(service).not.toMatch(/indexedDB|write queue|offline session/i);
  });
});
