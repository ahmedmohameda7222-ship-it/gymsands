import type {
  ExerciseLog,
  FrozenWorkoutPrescriptionSet,
  UserWorkoutPlanExercise,
  Workout,
  WorkoutPerformanceMetricSource,
  WorkoutPlanDaySession,
  WorkoutSessionPrescriptionItem,
  WorkoutSessionSummary,
  WorkoutSetSideMode,
  WorkoutSetTempoAdherence,
  WorkoutSetType
} from "@/types";
import type {
  ActiveWorkoutFormatters,
  ActiveWorkoutTranslator
} from "@/lib/i18n/active-workout";
import { isolateBidiText } from "@/lib/i18n/active-workout";
import {
  frozenLogCompatibility,
  frozenRepetitionsEntryDefault,
  frozenRepetitionsProjection
} from "@/services/database/workout-session-prescriptions";
import {
  editableWorkoutSetProvenance,
  parseWorkoutSetEffortInput,
  validateWorkoutSetEffortInput,
  workoutSetEffortInputForContext
} from "@/services/database/workout-set-details";

export type ActiveWorkoutSource =
  | { kind: "plan-day"; day: WorkoutPlanDaySession }
  | { kind: "direct"; workout: Workout };

export type ActiveWorkoutSetState = {
  setNumber: number;
  reps: string;
  weightKg: string;
  notes: string;
  rpe: string;
  rir: string;
  setType: WorkoutSetType;
  sideMode: WorkoutSetSideMode;
  plannedTempo: string | null;
  performedTempo: string | null;
  tempoAdherence: WorkoutSetTempoAdherence;
  detailSource: WorkoutPerformanceMetricSource;
  detailSourceProvider: string | null;
  detailSourceVersion: string | null;
  hasPersistedLog: boolean;
  hasSetDetails: boolean;
  setDetailsWriteRequired: boolean;
  logWriteRequired: boolean;
  completedAt: string | null;
  frozenPrescriptionSet: FrozenWorkoutPrescriptionSet | null;
  plannedReps: string | null;
  plannedRestSeconds: number | null;
};

export type ActiveWorkoutExerciseState = {
  exercise: UserWorkoutPlanExercise;
  prescriptionItem: WorkoutSessionPrescriptionItem;
  sets: ActiveWorkoutSetState[];
};

export type ActiveWorkoutPreviousPerformance = {
  lastWeightKg: number | null;
  lastReps: number | null;
  lastBestSet: string | null;
  lastPerformedAt: string | null;
};

export type ActiveWorkoutPreviousSet = {
  reps: number | null;
  weightKg: number | null;
  performedAt: string | null;
};

export type ActiveWorkoutSessionSetSummary = {
  exerciseName: string;
  reps: number;
  weightKg: number;
  setType: WorkoutSetType;
  plannedReps: string | null;
  completedAt: string | null;
};

export type ActiveWorkoutSummary = {
  durationMinutes: number;
  totalVolume: number;
  completedSets: number;
  totalPlannedSets: number;
  completedExercises: number;
  totalExercises: number;
  incompleteExercises: string[];
  partialExercises: string[];
  skippedExercises: string[];
  replacedExercises: Array<{ currentName: string; originalName: string }>;
  prs: string[];
  suggestions: string[];
  notes: string;
};

export type ActiveWorkoutReviewSet = {
  setNumber: number;
  completed: boolean;
  reps: string;
  weightKg: string;
  rpe: string;
  rir: string;
  setType: WorkoutSetType;
  notes: string;
  persisted: boolean;
  pending: boolean;
};

export type ActiveWorkoutReviewExercise = {
  exerciseIndex: number;
  currentName: string;
  originalName: string | null;
  status: "completed" | "partial" | "incomplete" | "skipped";
  completedSets: number;
  totalSets: number;
  sets: ActiveWorkoutReviewSet[];
};

export type ActiveWorkoutReviewProjection = {
  exercises: ActiveWorkoutReviewExercise[];
  completedSets: number;
  totalSets: number;
  incompleteSets: number;
  completedExercises: number;
  incompleteExercises: number;
  partialExercises: number;
  skippedExercises: number;
  replacedExercises: number;
};

const detailWriteKeys: Array<keyof ActiveWorkoutSetState> = [
  "notes",
  "rpe",
  "rir",
  "setType",
  "sideMode",
  "plannedTempo",
  "performedTempo",
  "tempoAdherence",
  "detailSource",
  "detailSourceProvider",
  "detailSourceVersion"
];

const logWriteKeys: Array<keyof ActiveWorkoutSetState> = [
  "reps",
  "weightKg",
  "completedAt",
  ...detailWriteKeys
];

export function directWorkoutDay(workout: Workout): WorkoutPlanDaySession {
  return {
    id: workout.id,
    plan_id: "",
    day_number: 1,
    day_name: workout.name,
    weekday: null,
    notes: workout.notes,
    plan: null,
    exercises: [{
      id: workout.plan_exercise_id ?? workout.id,
      plan_day_id: "",
      workout_id: workout.id,
      source_workout_id: workout.id,
      exercise_name: workout.name,
      category: workout.category,
      target_muscle: workout.target_muscle,
      equipment: workout.equipment,
      sets: workout.sets,
      reps: workout.reps,
      rest_seconds: workout.rest_seconds,
      instructions: workout.instructions,
      exercise_url: workout.exercise_url,
      video_url: workout.video_url,
      custom_video_url: workout.custom_video_url,
      sort_order: 1,
      notes: workout.notes
    }]
  };
}

export function frozenExercise(
  item: WorkoutSessionPrescriptionItem,
  liveExercises: UserWorkoutPlanExercise[]
): UserWorkoutPlanExercise {
  const live = item.sourcePlanExerciseId
    ? liveExercises.find((exercise) => exercise.id === item.sourcePlanExerciseId)
    : liveExercises.length === 1
      ? liveExercises[0]
      : undefined;
  const firstSet = item.prescriptionSets[0] ?? null;
  return live ? {
    ...live,
    exercise_name: item.activityName,
    sets: item.prescriptionSets.length || item.plannedSets,
    reps: frozenRepetitionsProjection(firstSet),
    rest_seconds: firstSet?.restSeconds ?? null
  } : {
    id: item.sourcePlanExerciseId ?? item.id,
    plan_day_id: "",
    workout_id: null,
    source_workout_id: null,
    exercise_name: item.activityName,
    category: null,
    target_muscle: null,
    equipment: null,
    sets: item.prescriptionSets.length || item.plannedSets,
    reps: frozenRepetitionsProjection(firstSet),
    rest_seconds: firstSet?.restSeconds ?? null,
    sort_order: item.itemOrder,
    notes: null
  };
}

export function makeFrozenExerciseState(
  item: WorkoutSessionPrescriptionItem,
  liveExercises: UserWorkoutPlanExercise[]
): ActiveWorkoutExerciseState {
  const exercise = frozenExercise(item, liveExercises);
  const planned = item.prescriptionSets.length ? item.prescriptionSets : [null];
  return {
    exercise,
    prescriptionItem: item,
    sets: planned.map((frozenSet, index) => ({
      setNumber: frozenSet?.setOrder ?? index + 1,
      reps: frozenRepetitionsEntryDefault(frozenSet),
      weightKg: "",
      notes: "",
      rpe: "",
      rir: "",
      setType: frozenSet?.setType ?? "other",
      sideMode: frozenSet?.sideMode ?? "none",
      plannedTempo: frozenSet?.tempoTarget ?? null,
      performedTempo: null,
      tempoAdherence: "not_recorded",
      detailSource: "manual",
      detailSourceProvider: "plaivra",
      detailSourceVersion: "aw3c-v1",
      hasPersistedLog: false,
      hasSetDetails: false,
      setDetailsWriteRequired: true,
      logWriteRequired: false,
      completedAt: null,
      frozenPrescriptionSet: frozenSet,
      plannedReps: frozenRepetitionsProjection(frozenSet),
      plannedRestSeconds: frozenSet?.restSeconds ?? null
    }))
  };
}

export function mockPrescriptionItemsFromPlan(
  exercises: UserWorkoutPlanExercise[],
  workoutSessionId: string,
  userId: string
): WorkoutSessionPrescriptionItem[] {
  return exercises.map((exercise, index) => ({
    snapshotId: `mock-snapshot-${workoutSessionId}`,
    id: `mock-item-${exercise.id}`,
    workoutSessionId,
    userId,
    itemOrder: index + 1,
    sourcePlanExerciseId: exercise.id,
    sourcePlanActivityId: null,
    activityName: exercise.exercise_name,
    rawCompatibilityPrescription: {
      ...(exercise.sets ? { sets: exercise.sets } : {}),
      ...(exercise.reps ? { reps: exercise.reps } : {}),
      ...(exercise.rest_seconds !== null ? { rest_seconds: exercise.rest_seconds } : {})
    },
    plannedSets: exercise.sets,
    executionState: "planned",
    normalizationStatus: "partial",
    prescriptionSets: Array.from({ length: Math.max(1, exercise.sets ?? 1) }, (_, setIndex) => ({
      id: `mock-prescription-set-${exercise.id}-${setIndex + 1}`,
      snapshotItemId: `mock-item-${exercise.id}`,
      snapshotId: `mock-snapshot-${workoutSessionId}`,
      workoutSessionId,
      userId,
      setOrder: setIndex + 1,
      performedOrderHint: null,
      setType: "other",
      targetMode: "custom",
      sideMode: "none",
      restSeconds: exercise.rest_seconds,
      tempoTarget: null,
      schemaVersion: 1,
      createdAt: new Date(0).toISOString(),
      targets: []
    }))
  }));
}

function patchChangesAnyKey(
  set: ActiveWorkoutSetState,
  patch: Partial<ActiveWorkoutSetState>,
  keys: Array<keyof ActiveWorkoutSetState>
) {
  return keys.some((key) =>
    Object.prototype.hasOwnProperty.call(patch, key) && patch[key] !== set[key]
  );
}

export function mergeSetPatch(
  set: ActiveWorkoutSetState,
  patch: Partial<ActiveWorkoutSetState>
): ActiveWorkoutSetState {
  const detailsChanged = patchChangesAnyKey(set, patch, detailWriteKeys);
  const provenance = detailsChanged
    ? editableWorkoutSetProvenance(
        set.detailSource,
        set.detailSourceProvider,
        set.detailSourceVersion
      )
    : null;
  const nextPatch = provenance ? {
    ...patch,
    detailSource: provenance.source,
    detailSourceProvider: provenance.sourceProvider,
    detailSourceVersion: provenance.sourceVersion
  } : patch;
  const logChanged = patchChangesAnyKey(set, nextPatch, logWriteKeys);
  return {
    ...set,
    ...nextPatch,
    setDetailsWriteRequired: set.setDetailsWriteRequired || detailsChanged,
    logWriteRequired: set.logWriteRequired || logChanged
  };
}

function setValuesMatch(
  current: ActiveWorkoutSetState,
  saved: ActiveWorkoutSetState,
  keys: Array<keyof ActiveWorkoutSetState>
) {
  return keys.every((key) => current[key] === saved[key]);
}

export function isPendingSetWrite(set: ActiveWorkoutSetState) {
  return set.logWriteRequired && Boolean(set.completedAt || set.hasPersistedLog);
}

export function setHasValidEffortInputs(set: ActiveWorkoutSetState) {
  return (
    !validateWorkoutSetEffortInput(set.rpe, "rpe").error
    && !validateWorkoutSetEffortInput(set.rir, "rir").error
  );
}

export function hasPendingValidSetWrites(states: ActiveWorkoutExerciseState[]) {
  return states.some((item) =>
    item.sets.some((set) => isPendingSetWrite(set) && setHasValidEffortInputs(set))
  );
}

export function acknowledgeSetWrites(
  currentStates: ActiveWorkoutExerciseState[],
  savedStates: ActiveWorkoutExerciseState[] = currentStates
): ActiveWorkoutExerciseState[] {
  return currentStates.map((item, exerciseIndex) => ({
    ...item,
    sets: item.sets.map((set, setIndex) => {
      const saved = savedStates[exerciseIndex]?.sets[setIndex];
      if (!saved || !isPendingSetWrite(saved)) return set;
      const detailsMatch = setValuesMatch(set, saved, detailWriteKeys);
      const logMatch = setValuesMatch(set, saved, logWriteKeys);
      return {
        ...set,
        hasPersistedLog: true,
        hasSetDetails: set.hasSetDetails || saved.setDetailsWriteRequired,
        setDetailsWriteRequired:
          saved.setDetailsWriteRequired && detailsMatch
            ? false
            : set.setDetailsWriteRequired,
        logWriteRequired: logMatch ? false : set.logWriteRequired
      };
    })
  }));
}

export function toNumberOrNull(value: string) {
  if (value.trim() === "") return null;
  const next = Number(value.replace(",", "."));
  return Number.isFinite(next) ? next : null;
}

export function formatPlannedReps(
  value: string | number | null | undefined,
  formatters: ActiveWorkoutFormatters,
  fallback: string
) {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  return raw.replace(/\d+(?:[.,]\d+)?/g, (token) => {
    const normalized = Number(token.replace(",", "."));
    if (!Number.isFinite(normalized)) return token;
    const decimals = token.includes(".") || token.includes(",")
      ? token.split(/[.,]/)[1]?.length ?? 0
      : 0;
    return decimals > 0
      ? formatters.decimal(normalized, decimals)
      : formatters.integer(normalized);
  });
}

export function normalizeExerciseName(value: string) {
  const normalized = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/^[a-z]\p{N}+\s*[:.)-]\s*/u, "");
  const identity = normalized
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return identity || normalized.trim();
}

export function roundWorkoutMetric(value: number) {
  return Math.round(value * 10) / 10;
}

export function estimateOneRepMax(weightKg: number, reps: number) {
  if (weightKg <= 0 || reps <= 0) return 0;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

function parseRepRangeTop(value: string | null | undefined) {
  const numbers = value?.match(/\d+/g)
    ?.map(Number)
    .filter((item) => Number.isFinite(item) && item > 0) ?? [];
  return numbers.length ? Math.max(...numbers) : null;
}

function normalizeSetType(value: string): WorkoutSetType {
  const clean = value.trim().toLowerCase().replace(/\s+/g, "");
  if (clean === "warmup" || clean === "warm-up") return "warmup";
  if (clean === "dropset" || clean === "drop") return "drop";
  if (["working", "normal", "failure", "backoff", "amrap", "timed", "other"].includes(clean)) {
    return clean as WorkoutSetType;
  }
  return "working";
}

export function hydrateStates(
  baseStates: ActiveWorkoutExerciseState[],
  logs: ExerciseLog[]
) {
  if (!logs.length) return baseStates;
  return baseStates.map((item) => ({
    ...item,
    sets: item.sets.map((set) => {
      const log = logs.find(
        (entry) => entry.set_number === set.setNumber && (
          (entry.plan_exercise_id && entry.plan_exercise_id === item.exercise.id)
          || entry.exercise_name === item.exercise.exercise_name
        )
      );
      if (!log) return set;
      const details = log.set_details;
      return {
        ...set,
        reps: log.reps === null || log.reps === undefined ? set.reps : String(log.reps),
        weightKg: log.weight_kg === null || log.weight_kg === undefined ? "" : String(log.weight_kg),
        notes: log.notes ?? "",
        rpe: details?.rpe === null || details?.rpe === undefined ? "" : String(details.rpe),
        rir: details?.rir === null || details?.rir === undefined ? "" : String(details.rir),
        setType: normalizeSetType(details?.set_type ?? log.set_type ?? set.setType),
        sideMode: details?.side_mode ?? set.sideMode,
        plannedTempo: details?.planned_tempo ?? set.plannedTempo,
        performedTempo: details?.performed_tempo ?? null,
        tempoAdherence: details?.tempo_adherence ?? set.tempoAdherence,
        detailSource: details?.source ?? set.detailSource,
        detailSourceProvider: details ? details.source_provider : set.detailSourceProvider,
        detailSourceVersion: details ? details.source_version : set.detailSourceVersion,
        hasPersistedLog: true,
        hasSetDetails: Boolean(details),
        setDetailsWriteRequired: false,
        logWriteRequired: false,
        completedAt: log.completed_at ?? null
      };
    })
  }));
}

export function buildSessionSets(
  states: ActiveWorkoutExerciseState[]
): ActiveWorkoutSessionSetSummary[] {
  return states.flatMap((item) => item.sets
    .filter((set) => set.completedAt)
    .map((set) => ({
      exerciseName: item.exercise.exercise_name,
      reps: toNumberOrNull(set.reps) ?? 0,
      weightKg: toNumberOrNull(set.weightKg) ?? 0,
      setType: set.setType,
      plannedReps: set.plannedReps,
      completedAt: set.completedAt
    }))
  );
}

export function historicalSets(
  history: WorkoutSessionSummary[],
  exerciseName?: string
) {
  const normalizedName = exerciseName ? normalizeExerciseName(exerciseName) : null;
  return history.flatMap((session) =>
    (session.exercise_logs ?? [])
      .filter((log) => !normalizedName || normalizeExerciseName(log.exercise_name) === normalizedName)
      .filter((log) => Number(log.reps ?? 0) > 0 || Number(log.weight_kg ?? 0) > 0)
      .map((log) => ({
        exerciseName: log.exercise_name,
        reps: Number(log.reps ?? 0),
        weightKg: Number(log.weight_kg ?? 0),
        sessionDate: session.completed_at || session.started_at,
        volume: Number(log.reps ?? 0) * Number(log.weight_kg ?? 0),
        estimatedOneRepMax: estimateOneRepMax(Number(log.weight_kg ?? 0), Number(log.reps ?? 0))
      }))
  );
}

export function previousPerformance(
  history: WorkoutSessionSummary[],
  exerciseName: string,
  formatters: ActiveWorkoutFormatters
): ActiveWorkoutPreviousPerformance | null {
  const normalizedName = normalizeExerciseName(exerciseName);
  const matchingSession = history.find((session) =>
    (session.exercise_logs ?? []).some((log) => normalizeExerciseName(log.exercise_name) === normalizedName)
  );
  if (!matchingSession) return null;
  const matchingLogs = (matchingSession.exercise_logs ?? [])
    .filter((log) => normalizeExerciseName(log.exercise_name) === normalizedName);
  const latestLog = [...matchingLogs].reverse().find((log) => log.reps || log.weight_kg) ?? matchingLogs[0];
  const best = [...matchingLogs].sort((a, b) =>
    (Number(b.weight_kg ?? 0) * Number(b.reps ?? 0))
    - (Number(a.weight_kg ?? 0) * Number(a.reps ?? 0))
  )[0];
  return {
    lastWeightKg: latestLog?.weight_kg ?? null,
    lastReps: latestLog?.reps ?? null,
    lastBestSet: best
      ? `${formatters.measurement(Number(best.weight_kg ?? 0), "kg")} × ${formatters.integer(Number(best.reps ?? 0))}`
      : null,
    lastPerformedAt: matchingSession.completed_at || matchingSession.started_at
  };
}

export function previousSetForExercise(
  history: WorkoutSessionSummary[],
  exerciseName: string,
  setNumber: number
): ActiveWorkoutPreviousSet | null {
  const normalizedName = normalizeExerciseName(exerciseName);
  for (const session of history) {
    const matchingLogs = (session.exercise_logs ?? [])
      .filter((log) => normalizeExerciseName(log.exercise_name) === normalizedName)
      .filter((log) => Number(log.reps ?? 0) > 0 || Number(log.weight_kg ?? 0) > 0);
    if (!matchingLogs.length) continue;
    const exactSet = matchingLogs.find((log) => log.set_number === setNumber);
    const fallbackSet = [...matchingLogs].sort((a, b) =>
      (Number(b.weight_kg ?? 0) * Number(b.reps ?? 0))
      - (Number(a.weight_kg ?? 0) * Number(a.reps ?? 0))
    )[0];
    const match = exactSet ?? fallbackSet;
    return {
      reps: match.reps ?? null,
      weightKg: match.weight_kg ?? null,
      performedAt: session.completed_at || session.started_at
    };
  }
  return null;
}

function buildProgressiveSuggestion(
  item: ActiveWorkoutExerciseState,
  tr: ActiveWorkoutTranslator,
  formatters: ActiveWorkoutFormatters
) {
  const topReps = parseRepRangeTop(item.exercise.reps);
  const completed = item.sets.filter((set) => set.completedAt);
  const workingSets = completed.filter((set) =>
    set.setType === "working" || set.setType === "normal" || set.setType === "failure"
  );
  const name = isolateBidiText(item.exercise.exercise_name);
  if (!completed.length) return tr("completion.progressionNoCompleted", { name });
  if (!topReps || !workingSets.length) {
    return tr("completion.progressionLogged", {
      name,
      completed: formatters.integer(completed.length),
      total: formatters.integer(item.sets.length)
    });
  }
  const allTop = workingSets.every((set) => (toNumberOrNull(set.reps) ?? 0) >= topReps);
  return allTop
    ? tr("completion.progressionIncrease", { name })
    : tr("completion.progressionRepeat", { name });
}

export function buildPrs(
  states: ActiveWorkoutExerciseState[],
  history: WorkoutSessionSummary[],
  tr: ActiveWorkoutTranslator,
  formatters: ActiveWorkoutFormatters
) {
  const currentByExercise = new Map<string, ActiveWorkoutSessionSetSummary[]>();
  buildSessionSets(states).forEach((set) => {
    const key = normalizeExerciseName(set.exerciseName);
    currentByExercise.set(key, [...(currentByExercise.get(key) ?? []), set]);
  });

  const prs: string[] = [];
  currentByExercise.forEach((sets, key) => {
    const exerciseName = sets[0]?.exerciseName ?? key;
    const previous = historicalSets(history, exerciseName);
    const prevMaxWeight = Math.max(0, ...previous.map((set) => set.weightKg));
    const prevMaxReps = Math.max(0, ...previous.map((set) => set.reps));
    const prevMaxOneRep = Math.max(0, ...previous.map((set) => set.estimatedOneRepMax));
    const currentMaxWeight = Math.max(0, ...sets.map((set) => set.weightKg));
    const currentMaxReps = Math.max(0, ...sets.map((set) => set.reps));
    const currentMaxOneRep = Math.max(0, ...sets.map((set) => estimateOneRepMax(set.weightKg, set.reps)));
    const currentVolume = sets.reduce((sum, set) => sum + set.weightKg * set.reps, 0);
    const previousSessionVolumes = new Map<string, number>();
    history.forEach((session) => {
      const volume = (session.exercise_logs ?? [])
        .filter((log) => normalizeExerciseName(log.exercise_name) === key)
        .reduce((sum, log) => sum + Number(log.weight_kg ?? 0) * Number(log.reps ?? 0), 0);
      if (volume > 0) previousSessionVolumes.set(session.id, volume);
    });
    const prevMaxVolume = Math.max(0, ...previousSessionVolumes.values());
    const isolatedName = isolateBidiText(exerciseName);
    if (currentMaxWeight > 0 && currentMaxWeight > prevMaxWeight) {
      prs.push(tr("completion.highestWeightPr", {
        name: isolatedName,
        weight: formatters.measurement(currentMaxWeight, "kg")
      }));
    }
    if (currentMaxReps > 0 && currentMaxReps > prevMaxReps) {
      prs.push(tr("completion.maxRepsPr", {
        name: isolatedName,
        reps: formatters.integer(currentMaxReps)
      }));
    }
    if (currentMaxOneRep > 0 && currentMaxOneRep > prevMaxOneRep) {
      prs.push(tr("completion.estimatedOneRepMaxPr", {
        name: isolatedName,
        weight: formatters.measurement(roundWorkoutMetric(currentMaxOneRep), "kg")
      }));
    }
    if (currentVolume > 0 && currentVolume > prevMaxVolume) {
      prs.push(tr("completion.volumePr", {
        name: isolatedName,
        volume: formatters.measurement(roundWorkoutMetric(currentVolume), "kg")
      }));
    }
  });
  return prs;
}

export function buildSummary(
  states: ActiveWorkoutExerciseState[],
  history: WorkoutSessionSummary[],
  durationMinutes: number,
  notes: string,
  tr: ActiveWorkoutTranslator,
  formatters: ActiveWorkoutFormatters
): ActiveWorkoutSummary {
  const sessionSets = buildSessionSets(states);
  const review = buildActiveWorkoutReview(states);
  const completedExercises = states.filter((item) =>
    item.sets.length > 0 && item.sets.every((set) => set.completedAt)
  ).length;
  const partialExercises = states
    .filter((item) => {
      const completedCount = item.sets.filter((set) => set.completedAt).length;
      return completedCount > 0 && completedCount < item.sets.length;
    })
    .map((item) => item.exercise.exercise_name);
  const skippedExercises = states
    .filter((item) => item.prescriptionItem.executionState === "skipped")
    .map((item) => item.exercise.exercise_name);
  const incompleteExercises = review.exercises
    .filter((item) => item.status === "incomplete")
    .map((item) => item.currentName);
  const replacedExercises = review.exercises
    .filter((item) => item.originalName)
    .map((item) => ({
      currentName: item.currentName,
      originalName: item.originalName!
    }));
  return {
    durationMinutes,
    totalVolume: roundWorkoutMetric(
      sessionSets.reduce((sum, set) => sum + set.weightKg * set.reps, 0)
    ),
    completedSets: sessionSets.length,
    totalPlannedSets: review.totalSets,
    completedExercises,
    totalExercises: states.length,
    incompleteExercises,
    partialExercises,
    skippedExercises,
    replacedExercises,
    prs: buildPrs(states, history, tr, formatters),
    suggestions: states.map((item) => buildProgressiveSuggestion(item, tr, formatters)),
    notes
  };
}

export function buildActiveWorkoutReview(
  states: ActiveWorkoutExerciseState[],
  originalExercises: UserWorkoutPlanExercise[] = []
): ActiveWorkoutReviewProjection {
  const exercises = states.map<ActiveWorkoutReviewExercise>((item, exerciseIndex) => {
    const completedSets = item.sets.filter((set) => Boolean(set.completedAt)).length;
    const skipped = item.prescriptionItem.executionState === "skipped";
    const status = skipped
      ? "skipped"
      : completedSets === item.sets.length && item.sets.length > 0
        ? "completed"
        : completedSets > 0
          ? "partial"
          : "incomplete";
    const original = originalExercises.find((exercise) =>
      exercise.id === item.prescriptionItem.sourcePlanExerciseId
      || exercise.id === item.exercise.id
    );
    const originalName = original
      && normalizeExerciseName(original.exercise_name)
        !== normalizeExerciseName(item.exercise.exercise_name)
      ? original.exercise_name
      : null;

    return {
      exerciseIndex,
      currentName: item.exercise.exercise_name,
      originalName,
      status,
      completedSets,
      totalSets: item.sets.length,
      sets: item.sets.map((set) => ({
        setNumber: set.setNumber,
        completed: Boolean(set.completedAt),
        reps: set.reps,
        weightKg: set.weightKg,
        rpe: set.rpe,
        rir: set.rir,
        setType: set.setType,
        notes: set.notes,
        persisted: set.hasPersistedLog,
        pending: set.logWriteRequired
      }))
    };
  });
  const activeExercises = exercises.filter((item) => item.status !== "skipped");
  const totalSets = activeExercises.reduce((sum, item) => sum + item.totalSets, 0);
  const completedSets = activeExercises.reduce((sum, item) => sum + item.completedSets, 0);

  return {
    exercises,
    completedSets,
    totalSets,
    incompleteSets: Math.max(0, totalSets - completedSets),
    completedExercises: exercises.filter((item) => item.status === "completed").length,
    incompleteExercises: exercises.filter((item) =>
      item.status === "incomplete" || item.status === "partial"
    ).length,
    partialExercises: exercises.filter((item) => item.status === "partial").length,
    skippedExercises: exercises.filter((item) => item.status === "skipped").length,
    replacedExercises: exercises.filter((item) => item.originalName).length
  };
}

export type CanonicalLogOptions = {
  pendingOnly?: boolean;
  validOnly?: boolean;
  effortMode?: "strict" | "draft-context";
};

export function buildCanonicalLogRows(
  states: ActiveWorkoutExerciseState[],
  options: CanonicalLogOptions = {}
) {
  const parseEffort = options.effortMode === "draft-context"
    ? workoutSetEffortInputForContext
    : parseWorkoutSetEffortInput;
  return states.flatMap((item) => item.sets
    .filter((set) => {
      const selected = options.pendingOnly
        ? isPendingSetWrite(set)
        : Boolean(set.completedAt);
      return selected && (!options.validOnly || setHasValidEffortInputs(set));
    })
    .map((set) => {
      const includeSetDetails = set.setDetailsWriteRequired;
      const detailProvenance = editableWorkoutSetProvenance(
        set.detailSource,
        set.detailSourceProvider,
        set.detailSourceVersion
      );
      return {
        planExerciseId: item.prescriptionItem.sourcePlanExerciseId,
        planActivityId: item.prescriptionItem.sourcePlanActivityId,
        exerciseOrder: item.prescriptionItem.itemOrder,
        exerciseName: item.prescriptionItem.activityName,
        exerciseCategory:
          item.exercise.category
          || item.exercise.target_muscle
          || item.exercise.equipment
          || "Workout",
        ...frozenLogCompatibility(item.prescriptionItem, set.frozenPrescriptionSet),
        setNumber: set.setNumber,
        reps: toNumberOrNull(set.reps),
        weightKg: toNumberOrNull(set.weightKg),
        notes: set.notes || null,
        ...(includeSetDetails ? {
          setDetails: {
            schemaVersion: 1 as const,
            setType: set.setType,
            rpe: parseEffort(set.rpe, "rpe"),
            rir: parseEffort(set.rir, "rir"),
            notes: set.notes || null,
            sideMode: set.sideMode,
            plannedTempo: set.plannedTempo,
            performedTempo: set.performedTempo,
            tempoAdherence: set.tempoAdherence,
            source: detailProvenance.source,
            sourceProvider: detailProvenance.sourceProvider,
            sourceVersion: detailProvenance.sourceVersion
          }
        } : {}),
        completedAt: set.completedAt
      };
    })
  );
}

export function buildWorkoutContextLogRows(states: ActiveWorkoutExerciseState[]) {
  return buildCanonicalLogRows(states, { effortMode: "draft-context" }).map((row) => {
    const item = states.find((candidate) => candidate.exercise.id === row.planExerciseId);
    const set = item?.sets.find((candidate) => candidate.setNumber === row.setNumber);
    if (!set?.hasSetDetails || row.setDetails) return row;
    return {
      ...row,
      setDetails: {
        schemaVersion: 1 as const,
        setType: set.setType,
        rpe: workoutSetEffortInputForContext(set.rpe, "rpe"),
        rir: workoutSetEffortInputForContext(set.rir, "rir"),
        notes: set.notes || null,
        sideMode: set.sideMode,
        plannedTempo: set.plannedTempo,
        performedTempo: set.performedTempo,
        tempoAdherence: set.tempoAdherence,
        source: set.detailSource,
        sourceProvider: set.detailSourceProvider,
        sourceVersion: set.detailSourceVersion
      }
    };
  });
}
