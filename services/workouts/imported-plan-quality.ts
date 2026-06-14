import type { UserWorkoutPlan } from "@/types";

export type ImportedPlanQualityStatus = "ready" | "needs_review" | "blocked";

export type ImportedPlanQuality = {
  score: number;
  status: ImportedPlanQualityStatus;
  blockers: string[];
  warnings: string[];
  repairTips: string[];
  duplicateExercises: string[];
  dayCount: number;
  exerciseCount: number;
  daysWithWeekdays: number;
  daysMissingExercises: number;
  exercisesMissingPrescription: number;
  exercisesMissingMuscle: number;
  exercisesMissingRest: number;
};

function normalize(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

function duplicateNames(names: string[]) {
  const counts = new Map<string, { label: string; count: number }>();
  names.forEach((name) => {
    const key = normalize(name);
    if (!key) return;
    const current = counts.get(key);
    counts.set(key, { label: current?.label ?? name, count: (current?.count ?? 0) + 1 });
  });
  return Array.from(counts.values()).filter((item) => item.count > 1).map((item) => item.label);
}

export function analyzeImportedWorkoutPlan(plan: UserWorkoutPlan): ImportedPlanQuality {
  const dayCount = plan.days.length;
  const exercises = plan.days.flatMap((day) => day.exercises);
  const exerciseCount = exercises.length;
  const daysWithWeekdays = plan.days.filter((day) => Boolean(day.weekday)).length;
  const daysMissingExercises = plan.days.filter((day) => day.exercises.length === 0).length;
  const exercisesMissingPrescription = exercises.filter((exercise) => !exercise.sets || !exercise.reps).length;
  const exercisesMissingMuscle = exercises.filter((exercise) => !exercise.target_muscle && !exercise.category).length;
  const exercisesMissingRest = exercises.filter((exercise) => !exercise.rest_seconds).length;
  const duplicateExercises = duplicateNames(exercises.map((exercise) => exercise.exercise_name));
  const weekdayKeys = plan.days.map((day) => normalize(day.weekday)).filter(Boolean);
  const duplicateWeekdays = weekdayKeys.length !== new Set(weekdayKeys).size;
  const blockers: string[] = [];
  const warnings: string[] = [];
  const repairTips: string[] = [];

  if (!dayCount) blockers.push("No training days were imported.");
  if (!exerciseCount) blockers.push("No exercises were imported.");
  if (daysMissingExercises) warnings.push(`${daysMissingExercises} day${daysMissingExercises === 1 ? "" : "s"} have no exercises.`);
  if (daysWithWeekdays < dayCount) warnings.push("Some days are missing weekdays.");
  if (duplicateWeekdays) warnings.push("Some weekdays are assigned more than once.");
  if (!plan.days_per_week) warnings.push("Days per week is missing.");
  if (!plan.program_duration_weeks) warnings.push("Program duration is missing.");
  if (!plan.session_duration_minutes) warnings.push("Session duration is missing.");
  if (exercisesMissingPrescription) warnings.push(`${exercisesMissingPrescription} exercise${exercisesMissingPrescription === 1 ? "" : "s"} are missing sets or reps.`);
  if (exercisesMissingMuscle) warnings.push(`${exercisesMissingMuscle} exercise${exercisesMissingMuscle === 1 ? "" : "s"} are missing muscle/category labels.`);
  if (exercisesMissingRest) warnings.push(`${exercisesMissingRest} exercise${exercisesMissingRest === 1 ? "" : "s"} are missing rest timers.`);
  if (duplicateExercises.length) warnings.push(`${duplicateExercises.length} duplicate exercise name${duplicateExercises.length === 1 ? "" : "s"} found.`);

  if (blockers.length) repairTips.push("Re-import the plan with days and exercises before activating it.");
  if (daysWithWeekdays < dayCount || duplicateWeekdays) repairTips.push("Assign one clear weekday or day slot to each workout day.");
  if (exercisesMissingPrescription) repairTips.push("Add sets and reps to every strength exercise so tracking works without guessing.");
  if (exercisesMissingRest) repairTips.push("Add rest seconds to make the in-session timer useful.");
  if (!plan.program_duration_weeks || !plan.days_per_week) repairTips.push("Save duration and days/week so scheduling and weekly summaries are accurate.");

  const penalty =
    blockers.length * 45 +
    daysMissingExercises * 12 +
    (dayCount - daysWithWeekdays) * 4 +
    (duplicateWeekdays ? 8 : 0) +
    Math.min(24, exercisesMissingPrescription * 3) +
    Math.min(12, exercisesMissingMuscle * 2) +
    Math.min(12, exercisesMissingRest * 2) +
    (!plan.days_per_week ? 6 : 0) +
    (!plan.program_duration_weeks ? 6 : 0) +
    (!plan.session_duration_minutes ? 4 : 0) +
    Math.min(10, duplicateExercises.length * 3);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const status: ImportedPlanQualityStatus = blockers.length ? "blocked" : score >= 85 && warnings.length === 0 ? "ready" : "needs_review";

  return {
    score,
    status,
    blockers,
    warnings,
    repairTips,
    duplicateExercises,
    dayCount,
    exerciseCount,
    daysWithWeekdays,
    daysMissingExercises,
    exercisesMissingPrescription,
    exercisesMissingMuscle,
    exercisesMissingRest
  };
}
