import type {
  ExerciseAlternativeReason,
  UserExerciseAlternative,
  Workout,
} from "@/types";
import type { ReplacementEligibility } from "@/services/database/workout-replacement-eligibility";

export const ACTIVE_WORKOUT_REPLACEMENT_RANKING_VERSION = "v1" as const;

export type ReplacementReasonCode =
  | "same_primary_muscles"
  | "similar_movement"
  | "different_equipment"
  | "easier_variation"
  | "used_before"
  | "strong_identity";

export type ReplacementExerciseProfile = {
  id: string;
  name: string;
  targetMuscle: string | null;
  equipment: string | null;
  difficulty: string | null;
  mechanics: string | null;
  forceType: string | null;
  movementPattern: string | null;
  secondaryMuscles: string[];
  catalogDegraded?: boolean;
};

export type RankedReplacement = {
  workout: Workout;
  score: number;
  reasons: ReplacementReasonCode[];
  rankingVersion: typeof ACTIVE_WORKOUT_REPLACEMENT_RANKING_VERSION;
};

type RankingSignal = {
  primaryMuscle: number;
  secondaryMuscle: number;
  movement: number;
  mechanics: number;
  forceType: number;
  equipmentAlternative: number;
  easierDifficulty: number;
  usedBefore: number;
  sessionDuplicate: number;
  identityConfidence: number;
};

type SignalWeights = Readonly<Record<keyof RankingSignal, number>>;

const BASE_WEIGHTS: SignalWeights = Object.freeze({
  primaryMuscle: 36,
  secondaryMuscle: 12,
  movement: 18,
  mechanics: 10,
  forceType: 8,
  equipmentAlternative: 8,
  easierDifficulty: 8,
  usedBefore: 12,
  sessionDuplicate: -30,
  identityConfidence: 5,
});

const REASON_WEIGHT_OVERRIDES: Partial<Record<ExerciseAlternativeReason, Partial<SignalWeights>>> = Object.freeze({
  machine_taken: Object.freeze({ primaryMuscle: 42, movement: 22, equipmentAlternative: 22 }),
  no_equipment: Object.freeze({ primaryMuscle: 42, equipmentAlternative: 30, movement: 16 }),
  too_hard: Object.freeze({ primaryMuscle: 42, movement: 20, easierDifficulty: 28 }),
  pain_or_discomfort: Object.freeze({ primaryMuscle: 38, movement: 8, mechanics: 12, equipmentAlternative: 8 }),
  other: Object.freeze({ primaryMuscle: 40, movement: 20, secondaryMuscle: 14 }),
});

const DIFFICULTY_ORDER = new Map([
  ["beginner", 1],
  ["easy", 1],
  ["novice", 1],
  ["intermediate", 2],
  ["medium", 2],
  ["advanced", 3],
  ["hard", 3],
  ["expert", 4],
]);

function normalized(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function values(value: string | null | undefined) {
  return new Set(normalized(value).split(/\s*(?:,|\/|\+|\band\b)\s*/u).filter(Boolean));
}

function overlap(left: readonly string[], right: readonly string[]) {
  const leftValues = new Set(left.map(normalized).filter(Boolean));
  const rightValues = new Set(right.map(normalized).filter(Boolean));
  if (!leftValues.size || !rightValues.size) return 0;
  let intersection = 0;
  for (const item of leftValues) if (rightValues.has(item)) intersection += 1;
  return intersection / Math.max(leftValues.size, rightValues.size);
}

function same(left: string | null | undefined, right: string | null | undefined) {
  const a = normalized(left);
  const b = normalized(right);
  return Boolean(a && b && a === b);
}

function equipmentDiffers(left: string | null | undefined, right: string | null | undefined) {
  const a = values(left);
  const b = values(right);
  if (!a.size || !b.size) return 0;
  for (const value of a) if (b.has(value)) return 0;
  return 1;
}

function easierDifficulty(original: string | null | undefined, candidate: string | null | undefined) {
  const originalRank = DIFFICULTY_ORDER.get(normalized(original));
  const candidateRank = DIFFICULTY_ORDER.get(normalized(candidate));
  if (!originalRank || !candidateRank) return 0;
  return candidateRank < originalRank ? 1 : 0;
}

function weightsFor(reason: ExerciseAlternativeReason): SignalWeights {
  return { ...BASE_WEIGHTS, ...(REASON_WEIGHT_OVERRIDES[reason] ?? {}) };
}

export function replacementProfileFromWorkout(workout: Workout): ReplacementExerciseProfile {
  return {
    id: workout.id,
    name: workout.name,
    targetMuscle: workout.target_muscle || null,
    equipment: workout.equipment_required || workout.equipment || null,
    difficulty: workout.experience_level || workout.difficulty || null,
    mechanics: workout.mechanics || null,
    forceType: workout.force_type || null,
    movementPattern: workout.movement_pattern || null,
    secondaryMuscles: workout.secondary_muscles ?? [],
    catalogDegraded: workout.catalog_degraded,
  };
}

function signalFor(input: {
  original: ReplacementExerciseProfile;
  candidate: Workout;
  savedAlternatives: readonly UserExerciseAlternative[];
  sessionExerciseIds: ReadonlySet<string>;
}) {
  const candidate = replacementProfileFromWorkout(input.candidate);
  const savedNames = new Set(
    input.savedAlternatives.map((item) => normalized(item.alternative_exercise_name)).filter(Boolean),
  );
  return {
    primaryMuscle: same(input.original.targetMuscle, candidate.targetMuscle) ? 1 : 0,
    secondaryMuscle: overlap(input.original.secondaryMuscles, candidate.secondaryMuscles),
    movement: same(input.original.movementPattern, candidate.movementPattern) ? 1 : 0,
    mechanics: same(input.original.mechanics, candidate.mechanics) ? 1 : 0,
    forceType: same(input.original.forceType, candidate.forceType) ? 1 : 0,
    equipmentAlternative: equipmentDiffers(input.original.equipment, candidate.equipment),
    easierDifficulty: easierDifficulty(input.original.difficulty, candidate.difficulty),
    usedBefore: savedNames.has(normalized(candidate.name)) ? 1 : 0,
    sessionDuplicate: input.sessionExerciseIds.has(candidate.id) ? 1 : 0,
    identityConfidence: candidate.catalogDegraded ? 0 : 1,
  } satisfies RankingSignal;
}

function reasonCodes(signal: RankingSignal, reason: ExerciseAlternativeReason): ReplacementReasonCode[] {
  const reasons: ReplacementReasonCode[] = [];
  if (signal.primaryMuscle) reasons.push("same_primary_muscles");
  if (signal.movement || signal.mechanics || signal.forceType) reasons.push("similar_movement");
  if ((reason === "machine_taken" || reason === "no_equipment") && signal.equipmentAlternative) {
    reasons.push("different_equipment");
  }
  if (reason === "too_hard" && signal.easierDifficulty) reasons.push("easier_variation");
  if (signal.usedBefore) reasons.push("used_before");
  if (signal.identityConfidence) reasons.push("strong_identity");
  return reasons.slice(0, 3);
}

export function rankActiveWorkoutReplacements(input: {
  original: ReplacementExerciseProfile;
  candidates: readonly Workout[];
  eligibility: ReadonlyMap<string, ReplacementEligibility>;
  savedAlternatives?: readonly UserExerciseAlternative[];
  sessionExerciseIds?: ReadonlySet<string>;
  reason: ExerciseAlternativeReason;
}): RankedReplacement[] {
  const savedAlternatives = input.savedAlternatives ?? [];
  const sessionExerciseIds = input.sessionExerciseIds ?? new Set<string>();
  const weights = weightsFor(input.reason);

  return input.candidates
    .filter((candidate) => candidate.id !== input.original.id)
    .filter((candidate) => input.eligibility.get(candidate.id)?.eligible === true)
    .map((candidate) => {
      const signal = signalFor({ original: input.original, candidate, savedAlternatives, sessionExerciseIds });
      const score = (Object.keys(signal) as Array<keyof RankingSignal>)
        .reduce((sum, key) => sum + signal[key] * weights[key], 0);
      return {
        workout: candidate,
        score,
        reasons: reasonCodes(signal, input.reason),
        rankingVersion: ACTIVE_WORKOUT_REPLACEMENT_RANKING_VERSION,
      } satisfies RankedReplacement;
    })
    .sort((left, right) => right.score - left.score || left.workout.id.localeCompare(right.workout.id));
}
