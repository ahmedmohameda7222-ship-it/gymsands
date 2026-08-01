import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260801140043_workout_history_verified_records.sql",
  "utf8",
);
const verification = readFileSync(
  "supabase/verification/workout-history-verified-records.sql",
  "utf8",
);
const progress = readFileSync("services/database/progress.ts", "utf8");
const completion = readFileSync("services/database/workout-sessions-legacy-implementation.ts", "utf8");
const exportSource = readFileSync("lib/privacy/data-export-legacy.ts", "utf8");

describe("WH-6 verified record migration authority", () => {
  it("preserves manual rows while making derived provenance complete and cascade-safe", () => {
    expect(migration).toContain("source_kind text not null default 'manual'");
    expect(migration).toContain("foreign key (workout_session_id,user_id)");
    expect(migration).toContain("foreign key (exercise_log_id,workout_session_id)");
    expect(migration.match(/on delete cascade/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration).toContain("personal_records_derived_shape_check");
    expect(migration).toContain("personal_records_workout_record_key_uidx");
  });

  it("allows direct member mutation only for manual records", () => {
    expect(migration).not.toContain('create policy "personal_records_own_all"');
    expect(migration).toContain("source_kind='manual'");
    expect(migration).toContain("personal_records_owner_manual_insert");
    expect(migration).toContain("personal_records_owner_manual_update");
    expect(migration).toContain("personal_records_owner_manual_delete");
    expect(migration).toContain("revoke all on function private.replace_workout_derived_records_atomic");
  });

  it("uses one bounded idempotent trusted replacement authority", () => {
    expect(migration).toContain("jsonb_array_length(p_records)>500");
    expect(migration).toContain("perform public.assert_workout_actor(p_user_id)");
    expect(migration).toContain("for update");
    expect(migration).toContain("on conflict (record_key)");
    expect(migration).toContain("source_kind='workout_derived'");
    expect(migration).toContain("derived_records_evaluated_at=clock_timestamp()");
  });

  it("removes the legacy client writer and keeps export/purge coverage", () => {
    expect(progress).not.toContain("autoDetectPersonalRecordsFromExerciseLogs");
    expect(completion).toContain("refreshVerifiedRecordsAfterWorkoutCompletion");
    expect(completion).toContain("/verified-records");
    expect(exportSource).toContain('"personal_records"');
  });

  it("registers catalog and behavioral SQL verification", () => {
    expect(verification).toContain("personal_records_owner_manual_insert");
    expect(verification).toContain("replace_workout_derived_records_atomic");
    expect(verification).toContain("current_personal_records");
  });
});
