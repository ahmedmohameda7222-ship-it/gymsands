import {
  calculateAdvancedExposure,
  getAdvancedExercisePreview,
  type AdvancedExposureResult
} from "./advanced-exposure";
import {
  resolveReviewedAdvancedMappingIdentity,
  type ReviewedAdvancedMappingIdentity
} from "./advanced-mapping-registry";

export type PlanMuscleExerciseLike = ReviewedAdvancedMappingIdentity & {
  name?: string | null;
  exercise_name?: string | null;
  sets?: number | null;
};

export type PlanMuscleDayLike = {
  id?: string | null;
  clientKey?: string | null;
  dayName?: string | null;
  day_name?: string | null;
  exercises: readonly PlanMuscleExerciseLike[];
};

function safeSets(value: number | null | undefined): number {
  return Number.isFinite(value) && Number(value) >= 0 ? Number(value) : 0;
}

function itemId(day: PlanMuscleDayLike, dayIndex: number, exercise: PlanMuscleExerciseLike, exerciseIndex: number): string {
  const dayId = day.id || day.clientKey || `day-${dayIndex + 1}`;
  const exerciseId =
    exercise.canonicalExerciseId ||
    exercise.workoutId ||
    exercise.sourceWorkoutId ||
    exercise.id ||
    `exercise-${exerciseIndex + 1}`;
  return `${dayId}:${exerciseId}:${exerciseIndex + 1}`;
}

export function calculatePlanAdvancedMuscleExposure(input: {
  days: readonly PlanMuscleDayLike[];
  scope: "current_day" | "entire_plan";
  activeDayIndex?: number;
}): AdvancedExposureResult {
  const selectedDays = input.scope === "current_day"
    ? input.days.slice(input.activeDayIndex ?? 0, (input.activeDayIndex ?? 0) + 1)
    : input.days;

  const originalIndex = input.scope === "current_day" ? input.activeDayIndex ?? 0 : 0;
  const items = selectedDays.flatMap((day, localDayIndex) =>
    day.exercises.map((exercise, exerciseIndex) => {
      const mapping = resolveReviewedAdvancedMappingIdentity(exercise);
      return {
        itemId: itemId(day, originalIndex + localDayIndex, exercise, exerciseIndex),
        mapping: mapping?.reference ?? null,
        qualifyingSets: safeSets(exercise.sets),
        displayContext: {
          exerciseName: exercise.name || exercise.exercise_name || undefined,
          dayName: day.dayName || day.day_name || undefined
        }
      };
    })
  );

  return calculateAdvancedExposure({
    scope: input.scope === "current_day" ? "single_session" : "plan_cycle",
    items
  });
}

export function calculateExerciseAdvancedMusclePreview(exercise: PlanMuscleExerciseLike): AdvancedExposureResult | null {
  const mapping = resolveReviewedAdvancedMappingIdentity(exercise);
  return mapping ? getAdvancedExercisePreview(mapping.reference) : null;
}
