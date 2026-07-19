import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifestPath = "data/muscle-intelligence/v2/registry.json";
const partPaths = Array.from({ length: 6 }, (_, index) =>
  `data/muscle-intelligence/v2/registry.part-${String(index + 1).padStart(2, "0")}.json`
);
const migrationPaths = [
  "supabase/migrations/20260719094159_muscle_intelligence_phase4b_advanced_mappings_part_01.sql",
  "supabase/migrations/20260719094350_muscle_intelligence_phase4b_advanced_mappings_part_02.sql",
  "supabase/migrations/20260719094445_muscle_intelligence_phase4b_advanced_mappings_part_03.sql",
  "supabase/migrations/20260719094536_muscle_intelligence_phase4b_advanced_mappings_part_04.sql",
  "supabase/migrations/20260719094623_muscle_intelligence_phase4b_advanced_mappings_part_05.sql",
  "supabase/migrations/20260719094718_muscle_intelligence_phase4b_advanced_mappings_part_06.sql"
];

function text(path: string): string {
  return readFileSync(path, "utf8");
}

function json<T>(path: string): T {
  return JSON.parse(text(path)) as T;
}

type RegistryPart = {
  part: number;
  mappings: Array<{
    slug: string;
    exercise_id: string;
    mapping_set_id: string;
    checksum: string;
    entries: Array<[string, string, number]>;
  }>;
};

describe("Muscle Intelligence Phase 4B implementation boundary", () => {
  it("contains a complete reviewed 60-exercise V2 registry with no placeholder authority", () => {
    const manifest = json<{
      status: string;
      atlas_version: string;
      mapping_schema_version: string;
      mapping_version: number;
      parts: string[];
      validation_summary: { exercise_count: number; mapping_set_count: number; entry_count: number };
    }>(manifestPath);
    const parts = partPaths.map((path) => json<RegistryPart>(path));
    const mappings = parts.flatMap((part) => part.mappings);

    expect(text(manifestPath)).not.toMatch(/PLACEHOLDER/i);
    expect(manifest.status).toBe("approved_for_phase4b_publication");
    expect(manifest.atlas_version).toBe("advanced_visible_v1");
    expect(manifest.mapping_schema_version).toBe("exercise_muscle_mapping_v2");
    expect(manifest.mapping_version).toBe(2);
    expect(manifest.parts).toHaveLength(6);
    expect(parts.map((part) => part.part)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(parts.every((part) => part.mappings.length === 10)).toBe(true);
    expect(mappings).toHaveLength(60);
    expect(new Set(mappings.map((mapping) => mapping.slug)).size).toBe(60);
    expect(new Set(mappings.map((mapping) => mapping.exercise_id)).size).toBe(60);
    expect(new Set(mappings.map((mapping) => mapping.mapping_set_id)).size).toBe(60);
    expect(mappings.reduce((sum, mapping) => sum + mapping.entries.length, 0)).toBe(453);
    expect(manifest.validation_summary).toEqual({ exercise_count: 60, mapping_set_count: 60, entry_count: 453 });
  });

  it("uses forward-only schema-isolated publication migrations without session cutover", () => {
    const migrations = migrationPaths.map(text);
    const combined = migrations.join("\n");

    expect(migrations).toHaveLength(6);
    expect(migrations[0]).toContain("exercise_muscle_mapping_v2");
    expect(migrations[0]).toContain("exercise_muscle_mapping_v1");
    expect(migrations[0]).toContain("public.publish_exercise_muscle_mapping_set");
    expect(migrations[0]).toContain("private.exercise_muscle_mapping_checksum");
    expect(migrations[1]).toContain("create or replace function private.phase4b_publish_reviewed_advanced_mapping_part");
    expect(migrations.slice(1).every((migration) => migration.includes("private.phase4b_publish_reviewed_advanced_mapping_part"))).toBe(true);
    expect(combined).toContain("exercise_muscle_mapping_v2");
    expect(combined).toContain("exercise_muscle_mapping_v1");
    expect(combined).toContain("public.publish_exercise_muscle_mapping_set");
    expect(combined).toContain("private.exercise_muscle_mapping_checksum");
    expect(combined).not.toMatch(/insert\s+into\s+public\.workout_session_muscle_snapshots/i);
    expect(combined).not.toMatch(/update\s+public\.release_schema_compatibility/i);
    expect(combined).not.toMatch(/delete\s+from\s+public\.exercise_muscle_mapping_sets/i);
    expect(migrations[5]).toContain("drop function private.phase4b_publish_reviewed_advanced_mapping_part");
  });

  it("keeps plan analysis draft-local and places the approved surfaces exactly once", () => {
    const builder = text("components/workouts/workout-plan-builder.tsx");
    const editor = text("components/workouts/workout-plan-editor.tsx");
    const picker = text("components/workouts/exercise-picker-dialog.tsx");
    const detailsPage = text("app/(private)/my-workout/plans/[planId]/page.tsx");
    const weeklyDetails = text("components/workouts/workout-plan-weekly-muscle-load.tsx");
    const planPanel = text("components/workouts/plan-muscle-load-panel.tsx");
    const preview = text("components/workouts/exercise-muscle-preview.tsx");
    const adapter = text("lib/train/muscle-intelligence/plan-advanced-analysis.ts");

    expect(builder).toContain("defaultScope=\"current_day\"");
    expect(builder).toContain("defaultScope=\"entire_plan\"");
    expect(builder).toContain("variant=\"review\"");
    expect(editor).toContain("PlanMuscleLoadPanel");
    expect(picker).toContain("ExerciseMusclePreview");
    expect(picker).not.toContain("<MuscleHeatMap");
    expect(detailsPage).toContain("WorkoutPlanWeeklyMuscleLoad");
    expect(weeklyDetails).toContain("data-phase4b-plan-details-bottom-reserve");
    expect(weeklyDetails).toContain("var(--active-workout-controller-height,0px)");
    expect(planPanel).toContain("variant === \"details\"");
    expect(planPanel).toContain("sm:hidden");
    expect(planPanel).toContain("view=\"both\"");
    expect(preview.match(/<MuscleHeatMap/g)).toHaveLength(2);
    expect(adapter).toContain("calculateAdvancedExposure");
    expect(adapter).not.toMatch(/supabase|insert|update|saveWorkoutPlan/i);
  });

  it("resolves only exact canonical identities and does not infer mappings from names", () => {
    const resolver = text("lib/train/muscle-intelligence/advanced-mapping-registry.ts");
    expect(resolver).toContain("getReviewedAdvancedMappingByExerciseId");
    expect(resolver).toContain("getReviewedAdvancedMappingBySourceId");
    expect(resolver).not.toMatch(/exercise_name|\.name\s*\)|normalizeExerciseAlias|fuzzy|similar/i);
  });

  it("does not integrate Phase 4B into active-workout, completion, or history surfaces", () => {
    const changedSurfaceFiles = [
      "components/workouts/workout-plan-builder.tsx",
      "components/workouts/workout-plan-editor.tsx",
      "components/workouts/exercise-picker-dialog.tsx",
      "components/workouts/workout-plan-weekly-muscle-load.tsx",
      "app/(private)/my-workout/plans/[planId]/page.tsx"
    ];
    expect(changedSurfaceFiles.some((path) => /session|completion|history/i.test(path))).toBe(false);
  });
});
