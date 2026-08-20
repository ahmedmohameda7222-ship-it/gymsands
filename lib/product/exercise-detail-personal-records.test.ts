import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("Exercise Detail + Personal Records bound product contracts", () => {
  const canonical = read("app/(private)/workouts/[id]/page.tsx");
  const layout = read("app/(private)/workouts/[id]/layout.tsx");
  const provider = read("components/exercise-detail/exercise-detail-provider.tsx");
  const alternatives = read("app/(private)/workouts/[id]/alternatives/page.tsx");
  const more = read("components/exercise-detail/exercise-more-dialog.tsx");
  const plan = read("app/(private)/my-workout/exercises/[exerciseId]/page.tsx");
  const migration = read("supabase/migrations/20260813042754_exercise_detail_personal_records_authority.sql");

  it("uses one shared core activity boundary and removes duplicate page/layout fetches", () => {
    expect(layout).toContain("<ExerciseDetailProvider>{children}</ExerciseDetailProvider>");
    expect(provider).toContain("resolveExerciseDetail");
    expect(canonical).toContain("useExerciseDetail");
    expect(layout).not.toMatch(/getWorkout|ExerciseDetailMusclePreview|useParams/);
    expect(canonical).not.toContain("resolveExerciseDetail");
  });

  it("does not restore the pseudo-all-time or fabricated compatibility calculations", () => {
    expect(canonical).not.toMatch(/getWorkoutHistoryDetailed|150|normalizeExerciseName|weight_kg.*reps|Best Set|Mistakes to avoid/);
    expect(canonical).not.toMatch(/sets\s*\?\?\s*3|reps\s*\?\?\s*["']8|rest_seconds\s*\?\?\s*75/);
    expect(plan).not.toMatch(/sets\s*\?\?\s*3|8[–-]12|rest_seconds\s*\?\?\s*75|CardSkeleton/);
  });

  it("keeps alternatives route-scoped and custom-video management secondary", () => {
    expect(alternatives).toContain("loadExerciseAlternatives");
    expect(alternatives).not.toMatch(/localCustomAlternatives|sameText\(/);
    expect(provider).not.toContain("loadExerciseAlternatives");
    expect(canonical).not.toContain("ExerciseMedia");
    expect(more).toContain("getOwnedCustomExerciseVideoDirect");
    expect(more).toContain("getUserExerciseVideo");
    expect(more).toContain("if (!open) return");
  });

  it("atomically writes visible legacy and semantic V2 plan representations with ownership and duplicate guards", () => {
    expect(migration).toContain("add_catalog_activity_to_plan_day_atomic");
    expect(migration).toContain("plan.user_id = v_user_id");
    expect(migration).toContain("insert into public.user_workout_plan_exercises");
    expect(migration).toContain("insert into public.user_workout_plan_activities");
    expect(migration).toContain("return jsonb_build_object('status','duplicate'");
    expect(migration).toContain("private.validate_p10f_catalog_authority_snapshot");
  });

  it("preserves historical verified rows and provides owned Manual CRUD", () => {
    expect(migration).toContain("before insert on public.personal_records");
    expect(migration).toContain("Historical verified Personal Records were rewritten.");
    expect(migration).toContain("upsert_manual_personal_record_atomic");
    expect(migration).toContain("delete_manual_personal_record_atomic");
    expect(migration).toContain("record.user_id = v_user_id");
    expect(migration).toContain("record.source_kind = 'manual'");
  });
});
