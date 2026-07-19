import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260719223200_muscle_intelligence_phase4c1_set_type_refresh.sql",
  "utf8"
);

describe("Phase 4C.1 structured set-type refresh", () => {
  it("re-derives set type when existing upsert authorities change notes", () => {
    expect(migration).toContain("new.set_type is not distinct from old.set_type");
    expect(migration).toContain("private.workout_set_type(new.notes, null)");
    expect(migration).toContain("private.workout_set_type(new.notes, new.set_type)");
  });
});
