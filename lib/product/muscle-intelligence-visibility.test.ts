import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function text(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Muscle Intelligence visibility correction", () => {
  it("surfaces a dedicated Muscle Load destination from Train overview", () => {
    const plansPage = text("app/(private)/my-workout/plans/page.tsx");
    const entry = text("components/workouts/train-muscle-load-entry.tsx");
    const route = text("app/(private)/my-workout/muscle-load/page.tsx");

    expect(plansPage).toContain("TrainMuscleLoadEntry");
    expect(entry).toContain('href="/my-workout/muscle-load"');
    expect(entry).toContain("data-muscle-load-overview-entry");
    expect(route).toContain("TrainMuscleLoadOverview");
  });

  it("opens the existing approved full front and back map for the active plan", () => {
    const overview = text("components/workouts/train-muscle-load-overview.tsx");
    const panel = text("components/workouts/plan-muscle-load-panel.tsx");

    expect(overview).toContain("getAllUserWorkoutPlans");
    expect(overview).toContain("plan.is_active");
    expect(overview).toContain("plan.is_default");
    expect(overview).toContain('defaultScope="entire_plan"');
    expect(overview).toContain('variant="review"');
    expect(overview).toContain("showScopeControl={false}");
    expect(overview).toContain("requestGenerationRef");
    expect(overview).toContain("generation !== requestGenerationRef.current");
    expect(overview).toContain("PlanMuscleLoadPanel");
    expect(panel).toContain('view="both"');
    expect(panel).toContain(
      'mode={variant === "details" ? "compact" : "interactive"}',
    );
    expect(panel).toContain("titleOverride");
    expect(panel).toContain("descriptionOverride");
  });

  it("adds one focused authoritative preview to Exercise Detail without blocking the page", () => {
    const layout = text("app/(private)/workouts/[id]/layout.tsx");
    const detail = text("app/(private)/workouts/[id]/page.tsx");
    const preview = text("components/exercise-detail/exercise-anatomy.tsx");
    const authority = text("lib/exercise-detail/anatomy.ts");

    expect(layout).not.toMatch(
      /ExerciseDetailMusclePreview|getWorkout|useParams/,
    );
    expect(detail).toContain(
      "<ExerciseAnatomyVisualization exercise={resolved.core} compact />",
    );
    expect(detail).not.toContain("exerciseAnatomyAnalysis(");
    expect(preview).toContain("projectAuthoritativeExercisePreview(exercise)");
    expect(preview).toContain('exercise.identity.source !== "catalog_legacy"');
    expect(preview).toContain("MuscleHeatMap");
    expect(preview).toContain("if (!analysis) return null");
    expect(authority).toContain("atlasTargetId");
    expect(authority).toContain("KNOWN_V2_ATLAS_TARGETS");
    expect(preview).not.toMatch(
      /insert|update|publish|snapshot|compatibility/i,
    );
  });

  it("keeps the correction presentation-only", () => {
    const files = [
      "app/(private)/my-workout/plans/page.tsx",
      "app/(private)/my-workout/muscle-load/page.tsx",
      "app/(private)/workouts/[id]/layout.tsx",
      "components/workouts/train-muscle-load-entry.tsx",
      "components/workouts/train-muscle-load-overview.tsx",
      "components/workouts/exercise-detail-muscle-preview.tsx",
      "components/workouts/plan-muscle-load-panel.tsx",
      "lib/train/muscle-intelligence/muscle-load-visibility-copy.ts",
    ]
      .map(text)
      .join("\n");

    expect(files).not.toMatch(
      /supabase\/migrations|release_schema_compatibility|publish_exercise_muscle_mapping|workout_session_muscle_snapshots/i,
    );
  });
});
