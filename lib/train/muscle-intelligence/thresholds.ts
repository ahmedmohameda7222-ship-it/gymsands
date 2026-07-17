import type { MuscleLoadLevel } from "./contracts";

export const SESSION_MUSCLE_LOAD_THRESHOLDS = Object.freeze({ lowMax: 2, mediumMax: 5, highMax: 8 });
export const WEEKLY_MUSCLE_LOAD_THRESHOLDS = Object.freeze({ lowMax: 4, mediumMax: 8, highMax: 14 });

export function getSessionMuscleLoadLevel(score: number): MuscleLoadLevel {
  return getMuscleLoadLevel(score, SESSION_MUSCLE_LOAD_THRESHOLDS);
}

export function getWeeklyMuscleLoadLevel(score: number): MuscleLoadLevel {
  return getMuscleLoadLevel(score, WEEKLY_MUSCLE_LOAD_THRESHOLDS);
}

function getMuscleLoadLevel(
  score: number,
  thresholds: { lowMax: number; mediumMax: number; highMax: number }
): MuscleLoadLevel {
  if (!Number.isFinite(score) || score < 0) throw new RangeError("Muscle load score must be finite and non-negative.");
  if (score === 0) return "inactive";
  if (score <= thresholds.lowMax) return "low";
  if (score <= thresholds.mediumMax) return "medium";
  if (score <= thresholds.highMax) return "high";
  return "very_high";
}
