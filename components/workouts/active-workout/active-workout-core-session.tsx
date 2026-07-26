"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Dumbbell,
  RefreshCcw,
  Save,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { InlineFeedback, MotionCard } from "@/components/motion";
import { useSuccessFeedback } from "@/components/feedback/success-feedback";
import { clearStoredValue, readStoredTimestamp, storeTimestamp, workoutStorageKey } from "@/lib/workout-persistence";
import { isMockAuthUserId } from "@/lib/fixtures/mock-auth";
import {
  activeWorkoutCacheFromExecution,
  clearActiveWorkoutState,
  isValidActiveWorkoutRoute,
  readActiveWorkoutState,
  writeActiveWorkoutState
} from "@/lib/active-workout";
import { userSafeError } from "@/lib/error-formatting";
import {
  getOrStartWorkoutDaySession,
  getWorkoutHistoryDetailed,
} from "@/services/database/workout-sessions";
import { getOrStartWorkoutSession } from "@/services/database/direct-workout-sessions";
import { createExerciseAlternative, getExerciseAlternatives, getProgressionTargets } from "@/services/database/execution-layer";
import type { ExerciseLog, FrozenWorkoutPrescriptionSet, UserWorkoutPlanExercise, Workout, WorkoutPerformanceMetricSource, WorkoutPlanDaySession, WorkoutSession, WorkoutSessionExecutionState, WorkoutSessionPrescriptionItem, WorkoutSessionSummary, WorkoutSetSideMode, WorkoutSetTempoAdherence, WorkoutSetType } from "@/types";
import type { ExerciseAlternativeReason, UserExerciseAlternative, UserProgressionTarget } from "@/types";
import { AiActionRequestDialog } from "@/components/ai/ai-action-request-dialog";
import { WorkoutAiActionPanel } from "@/components/ai/workout-ai-action-panel";
import { isolateBidiText, useActiveWorkoutTranslation, type ActiveWorkoutFormatters, type ActiveWorkoutTranslator } from "@/lib/i18n/active-workout";
import { translateTrain } from "@/lib/i18n/train";
import { ExercisePickerDialog } from "@/components/workouts/exercise-picker-dialog";
import { ActiveWorkoutExecutionShell } from "@/components/workouts/active-workout/active-workout-execution-shell";
import {
  buildActiveWorkoutSetPath,
  clampWorkoutProgress,
  nextIncompleteSetCursor,
  validateActiveWorkoutSetDraft
} from "@/components/workouts/active-workout/active-workout-ui-model";
import { getActiveWorkoutDeviceId } from "@/lib/workouts/active-workout-device";
import {
  executionCursorToIndexes,
  executionElapsedSeconds,
  executionRestSecondsLeft,
  executionStartedAtMs
} from "@/lib/workouts/workout-session-execution";
import type { WorkoutSessionExecutionCursorRow } from "@/services/database/workout-session-execution";
import { activeSessionPersistenceAdapter } from "@/services/database/active-session-persistence-adapter";
import {
  getActiveSessionStore,
  type ActiveSessionStore
} from "@/lib/workouts/active-session-store/store";
import { activeSessionClock } from "@/lib/workouts/active-session-store/clock";
import { createSessionCommandId } from "@/lib/workouts/session-engine/commands";
import { planSessionAfterSetCompletion } from "@/lib/workouts/session-engine/reducer";
import { frozenLogCompatibility, frozenRepetitionsEntryDefault, frozenRepetitionsProjection } from "@/services/database/workout-session-prescriptions";
import {
  canUpdateWorkoutSetNote,
  editableWorkoutSetProvenance,
  parseWorkoutSetEffortInput,
  validateWorkoutSetEffortInput,
  workoutSetEffortInputForContext,
  WORKOUT_SET_NOTE_MAX_CODE_POINTS,
  workoutSetNoteCodePointLength
} from "@/services/database/workout-set-details";
import {
  mountWorkoutSetAutosaveCoordinator,
  type WorkoutSetAutosaveAdapter,
  type WorkoutSetAutosaveCoordinator
} from "@/services/database/workout-set-autosave";

type SetType = WorkoutSetType;

type SetState = {
  setNumber: number;
  reps: string;
  weightKg: string;
  notes: string;
  rpe: string;
  rir: string;
  setType: SetType;
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

type ExerciseState = {
  exercise: UserWorkoutPlanExercise;
  prescriptionItem: WorkoutSessionPrescriptionItem;
  sets: SetState[];
};

type PreviousPerformance = {
  lastWeightKg: number | null;
  lastReps: number | null;
  lastBestSet: string | null;
  lastPerformedAt: string | null;
};

type PreviousSet = {
  reps: number | null;
  weightKg: number | null;
  performedAt: string | null;
};

type SessionSetSummary = {
  exerciseName: string;
  reps: number;
  weightKg: number;
  setType: SetType;
  plannedReps: string | null;
  completedAt: string | null;
};

type WorkoutSummary = {
  durationMinutes: number;
  totalVolume: number;
  completedSets: number;
  completedExercises: number;
  skippedExercises: string[];
  prs: string[];
  suggestions: string[];
  notes: string;
};

function restPresetLabel(seconds: number, tr: ActiveWorkoutTranslator) {
  if (seconds === 30) return tr("rest.presetThirtySeconds");
  if (seconds === 60) return tr("rest.presetSixtySeconds");
  if (seconds === 90) return tr("rest.presetNinetySeconds");
  return tr("rest.presetThreeMinutes");
}

function restDeadline(seconds: number) {
  return Date.now() + seconds * 1000;
}

function frozenExercise(item: WorkoutSessionPrescriptionItem, liveExercises: UserWorkoutPlanExercise[]): UserWorkoutPlanExercise {
  const live = liveExercises.find((exercise) => exercise.id === item.sourcePlanExerciseId);
  const firstSet = item.prescriptionSets[0] ?? null;
  return live ? {
    ...live,
    exercise_name: item.activityName,
    sets: item.prescriptionSets.length || item.plannedSets,
    reps: frozenRepetitionsProjection(firstSet),
    rest_seconds: firstSet?.restSeconds ?? null
  } : {
    id: item.sourcePlanExerciseId ?? item.id,
    plan_day_id: "", workout_id: null, source_workout_id: null,
    exercise_name: item.activityName, category: null, target_muscle: null, equipment: null,
    sets: item.prescriptionSets.length || item.plannedSets,
    reps: frozenRepetitionsProjection(firstSet), rest_seconds: firstSet?.restSeconds ?? null,
    sort_order: item.itemOrder, notes: null
  };
}

function makeFrozenExerciseState(item: WorkoutSessionPrescriptionItem, liveExercises: UserWorkoutPlanExercise[]): ExerciseState {
  const exercise = frozenExercise(item, liveExercises);
  const planned = item.prescriptionSets.length ? item.prescriptionSets : [null];
  return {
    exercise,
    prescriptionItem: item,
    sets: planned.map((frozenSet, index) => ({
      setNumber: frozenSet?.setOrder ?? index + 1,
      reps: frozenRepetitionsEntryDefault(frozenSet),
      weightKg: "", notes: "", rpe: "", rir: "",
      setType: frozenSet?.setType ?? "other",
      sideMode: frozenSet?.sideMode ?? "none",
      plannedTempo: frozenSet?.tempoTarget ?? null,
      performedTempo: null, tempoAdherence: "not_recorded",
      detailSource: "manual", detailSourceProvider: "plaivra", detailSourceVersion: "aw3c-v1",
      hasPersistedLog: false, hasSetDetails: false, setDetailsWriteRequired: true, logWriteRequired: false, completedAt: null,
      frozenPrescriptionSet: frozenSet,
      plannedReps: frozenRepetitionsProjection(frozenSet),
      plannedRestSeconds: frozenSet?.restSeconds ?? null
    }))
  };
}

function mockPrescriptionItemsFromPlan(
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

const detailWriteKeys: Array<keyof SetState> = [
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

const logWriteKeys: Array<keyof SetState> = [
  "reps",
  "weightKg",
  "completedAt",
  ...detailWriteKeys
];

function patchChangesAnyKey(
  set: SetState,
  patch: Partial<SetState>,
  keys: Array<keyof SetState>
) {
  return keys.some((key) =>
    Object.prototype.hasOwnProperty.call(patch, key) && patch[key] !== set[key]
  );
}

function mergeSetPatch(set: SetState, patch: Partial<SetState>): SetState {
  const detailsChanged = patchChangesAnyKey(set, patch, detailWriteKeys);
  const provenance = detailsChanged
    ? editableWorkoutSetProvenance(
        set.detailSource,
        set.detailSourceProvider,
        set.detailSourceVersion
      )
    : null;
  const nextPatch = provenance
    ? {
        ...patch,
        detailSource: provenance.source,
        detailSourceProvider: provenance.sourceProvider,
        detailSourceVersion: provenance.sourceVersion
      }
    : patch;
  const logChanged = patchChangesAnyKey(set, nextPatch, logWriteKeys);
  return {
    ...set,
    ...nextPatch,
    setDetailsWriteRequired: set.setDetailsWriteRequired || detailsChanged,
    logWriteRequired: set.logWriteRequired || logChanged
  };
}

function setValuesMatch(
  current: SetState,
  saved: SetState,
  keys: Array<keyof SetState>
) {
  return keys.every((key) => current[key] === saved[key]);
}

function isPendingSetWrite(set: SetState) {
  return set.logWriteRequired && Boolean(set.completedAt || set.hasPersistedLog);
}

function setHasValidEffortInputs(set: SetState) {
  return (
    !validateWorkoutSetEffortInput(set.rpe, "rpe").error
    && !validateWorkoutSetEffortInput(set.rir, "rir").error
  );
}

function hasPendingValidSetWrites(states: ExerciseState[]) {
  return states.some((item) =>
    item.sets.some((set) => isPendingSetWrite(set) && setHasValidEffortInputs(set))
  );
}

function acknowledgeSetWrites(
  currentStates: ExerciseState[],
  savedStates: ExerciseState[] = currentStates
): ExerciseState[] {
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


function toNumberOrNull(value: string) {
  if (value.trim() === "") return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function formatPlannedReps(
  value: string | number | null | undefined,
  formatters: ActiveWorkoutFormatters,
  fallback: string
) {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  return raw.replace(/\d+(?:[.,]\d+)?/g, (token) => {
    const normalized = Number(token.replace(",", "."));
    if (!Number.isFinite(normalized)) return token;
    const decimals = token.includes(".") || token.includes(",") ? token.split(/[.,]/)[1]?.length ?? 0 : 0;
    return decimals > 0 ? formatters.decimal(normalized, decimals) : formatters.integer(normalized);
  });
}

function normalizeExerciseName(value: string) {
  return value.toLowerCase().replace(/^[a-z]\d\s*[:.)-]\s*/i, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function estimateOneRepMax(weightKg: number, reps: number) {
  if (weightKg <= 0 || reps <= 0) return 0;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

function parseRepRangeTop(value: string | null | undefined) {
  const numbers = value?.match(/\d+/g)?.map(Number).filter((item) => Number.isFinite(item) && item > 0) ?? [];
  return numbers.length ? Math.max(...numbers) : null;
}

function normalizeSetType(value: string): SetType {
  const clean = value.trim().toLowerCase().replace(/\s+/g, "");
  if (clean === "warmup" || clean === "warm-up") return "warmup";
  if (clean === "dropset" || clean === "drop") return "drop";
  if (["working", "normal", "failure", "backoff", "amrap", "timed", "other"].includes(clean)) return clean as SetType;
  return "working";
}

function hydrateStates(baseStates: ExerciseState[], logs: ExerciseLog[]) {
  if (!logs.length) return baseStates;
  return baseStates.map((item) => ({
    ...item,
    sets: item.sets.map((set) => {
      const log = logs.find(
        (entry) =>
          entry.set_number === set.setNumber &&
          ((entry.plan_exercise_id && entry.plan_exercise_id === item.exercise.id) || entry.exercise_name === item.exercise.exercise_name)
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
        detailSourceProvider: details
          ? details.source_provider
          : set.detailSourceProvider,
        detailSourceVersion: details
          ? details.source_version
          : set.detailSourceVersion,
        hasPersistedLog: true,
        hasSetDetails: Boolean(details),
        setDetailsWriteRequired: false,
        logWriteRequired: false,
        completedAt: log.completed_at ?? null
      };
    })
  }));
}

function buildSessionSets(states: ExerciseState[]): SessionSetSummary[] {
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

function historicalSets(history: WorkoutSessionSummary[], exerciseName?: string) {
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

function previousPerformance(history: WorkoutSessionSummary[], exerciseName: string, formatters: ActiveWorkoutFormatters): PreviousPerformance | null {
  const normalizedName = normalizeExerciseName(exerciseName);
  const matchingSession = history.find((session) => (session.exercise_logs ?? []).some((log) => normalizeExerciseName(log.exercise_name) === normalizedName));
  if (!matchingSession) return null;
  const matchingLogs = (matchingSession.exercise_logs ?? []).filter((log) => normalizeExerciseName(log.exercise_name) === normalizedName);
  const latestLog = [...matchingLogs].reverse().find((log) => log.reps || log.weight_kg) ?? matchingLogs[0];
  const best = [...matchingLogs].sort((a, b) => (Number(b.weight_kg ?? 0) * Number(b.reps ?? 0)) - (Number(a.weight_kg ?? 0) * Number(a.reps ?? 0)))[0];
  return {
    lastWeightKg: latestLog?.weight_kg ?? null,
    lastReps: latestLog?.reps ?? null,
    lastBestSet: best ? `${formatters.measurement(Number(best.weight_kg ?? 0), "kg")} × ${formatters.integer(Number(best.reps ?? 0))}` : null,
    lastPerformedAt: matchingSession.completed_at || matchingSession.started_at
  };
}

function previousSetForExercise(history: WorkoutSessionSummary[], exerciseName: string, setNumber: number): PreviousSet | null {
  const normalizedName = normalizeExerciseName(exerciseName);
  for (const session of history) {
    const matchingLogs = (session.exercise_logs ?? [])
      .filter((log) => normalizeExerciseName(log.exercise_name) === normalizedName)
      .filter((log) => Number(log.reps ?? 0) > 0 || Number(log.weight_kg ?? 0) > 0);
    if (!matchingLogs.length) continue;
    const exactSet = matchingLogs.find((log) => log.set_number === setNumber);
    const fallbackSet = [...matchingLogs].sort((a, b) => (Number(b.weight_kg ?? 0) * Number(b.reps ?? 0)) - (Number(a.weight_kg ?? 0) * Number(a.reps ?? 0)))[0];
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
  item: ExerciseState,
  tr: ActiveWorkoutTranslator,
  formatters: ActiveWorkoutFormatters
) {
  const topReps = parseRepRangeTop(item.exercise.reps);
  const completed = item.sets.filter((set) => set.completedAt);
  const workingSets = completed.filter((set) => set.setType === "working" || set.setType === "normal" || set.setType === "failure");
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
  if (allTop) return tr("completion.progressionIncrease", { name });
  return tr("completion.progressionRepeat", { name });
}

function buildPrs(states: ExerciseState[], history: WorkoutSessionSummary[], tr: ActiveWorkoutTranslator, formatters: ActiveWorkoutFormatters) {
  const currentByExercise = new Map<string, SessionSetSummary[]>();
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
    const prevMaxVolume = Math.max(0, ...Array.from(previousSessionVolumes.values()));

    const isolatedName = isolateBidiText(exerciseName);
    if (currentMaxWeight > 0 && currentMaxWeight > prevMaxWeight) prs.push(tr("completion.highestWeightPr", { name: isolatedName, weight: formatters.measurement(currentMaxWeight, "kg") }));
    if (currentMaxReps > 0 && currentMaxReps > prevMaxReps) prs.push(tr("completion.maxRepsPr", { name: isolatedName, reps: formatters.integer(currentMaxReps) }));
    if (currentMaxOneRep > 0 && currentMaxOneRep > prevMaxOneRep) prs.push(tr("completion.estimatedOneRepMaxPr", { name: isolatedName, weight: formatters.measurement(round(currentMaxOneRep), "kg") }));
    if (currentVolume > 0 && currentVolume > prevMaxVolume) prs.push(tr("completion.volumePr", { name: isolatedName, volume: formatters.measurement(round(currentVolume), "kg") }));
  });
  return prs;
}

function buildSummary(states: ExerciseState[], history: WorkoutSessionSummary[], durationMinutes: number, notes: string, tr: ActiveWorkoutTranslator, formatters: ActiveWorkoutFormatters): WorkoutSummary {
  const sessionSets = buildSessionSets(states);
  const completedExercises = states.filter((item) => item.sets.some((set) => set.completedAt)).length;
  const skippedExercises = states.filter((item) => !item.sets.some((set) => set.completedAt)).map((item) => item.exercise.exercise_name);
  return {
    durationMinutes,
    totalVolume: round(sessionSets.reduce((sum, set) => sum + set.weightKg * set.reps, 0)),
    completedSets: sessionSets.length,
    completedExercises,
    skippedExercises,
    prs: buildPrs(states, history, tr, formatters),
    suggestions: states.map((item) => buildProgressiveSuggestion(item, tr, formatters)),
    notes
  };
}

export type ActiveWorkoutSource =
  | { kind: "plan-day"; day: WorkoutPlanDaySession }
  | { kind: "direct"; workout: Workout };

function directWorkoutDay(workout: Workout): WorkoutPlanDaySession {
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

export function ActiveWorkoutCoreSession({ source }: { source: ActiveWorkoutSource }) {
  const day = useMemo(
    () => source.kind === "plan-day" ? source.day : directWorkoutDay(source.workout),
    [source]
  );
  const sourceKind = source.kind;
  const directWorkout = source.kind === "direct" ? source.workout : null;
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const { t: tr, locale: language, direction: dir, formatters } = useActiveWorkoutTranslation();
  const legacyReopenSetLabel = translateTrain(language, "reopenSet");
  const legacySetReopened = translateTrain(language, "setReopened");
  const legacySetReopenFailed = translateTrain(language, "setReopenFailed");
  const { celebrate } = useSuccessFeedback();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [startedAtMs, setStartedAtMs] = useState(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [sessionNotes, setSessionNotes] = useState("");
  const [exerciseStates, setExerciseStates] = useState<ExerciseState[]>([]);
  const [activeExerciseIndex, setActiveExerciseIndex] = useState(0);
  const [activeSetIndex, setActiveSetIndex] = useState(0);
  const [timerSeconds, setTimerSeconds] = useState(75);
  const [timerLeft, setTimerLeft] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isStarting, setIsStarting] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [history, setHistory] = useState<WorkoutSessionSummary[]>([]);
  const [completedSummary, setCompletedSummary] = useState<WorkoutSummary | null>(null);
  const [progressionTargets, setProgressionTargets] = useState<UserProgressionTarget[]>([]);
  const [alternatives, setAlternatives] = useState<UserExerciseAlternative[]>([]);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [replacementReason, setReplacementReason] = useState<ExerciseAlternativeReason>("machine_taken");
  const [replacementPickerOpen, setReplacementPickerOpen] = useState(false);
  const [isSavingAlternative, setIsSavingAlternative] = useState(false);
  const [setFeedback, setSetFeedback] = useState("");
  const [setFeedbackVariant, setSetFeedbackVariant] = useState<"info" | "error">("info");
  const [prFeedback, setPrFeedback] = useState("");
  const sessionRoute = sourceKind === "plan-day"
    ? `/workouts/session/day/${day.id}`
    : `/workouts/session/${directWorkout?.id ?? day.id}`;
  const workoutTimerKey = useMemo(() => workoutStorageKey(["workout-day-session", user?.id ?? "anonymous", day.id]), [day.id, user?.id]);
  const restTimerKey = useMemo(() => workoutStorageKey(["workout-day-rest-timer", user?.id ?? "anonymous", day.id]), [day.id, user?.id]);
  const [timerEndsAtMs, setTimerEndsAtMs] = useState<number | null>(null);
  const [executionState, setExecutionState] = useState<WorkoutSessionExecutionState | null>(null);
  const [executionCursorItems, setExecutionCursorItems] = useState<WorkoutSessionExecutionCursorRow[]>([]);
  const executionHydratedRef = useRef(false);
  const activeSessionStoreRef = useRef<ActiveSessionStore | null>(null);
  const restExpiryCommandRef = useRef<string | null>(null);
  const controllerDeviceIdRef = useRef<string | null>(null);
  const setDetailsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const exerciseStatesRef = useRef(exerciseStates);
  const autosaveAdapterRef = useRef<WorkoutSetAutosaveAdapter<ExerciseState[]> | null>(null);
  const autosaveCoordinatorRef = useRef<WorkoutSetAutosaveCoordinator | null>(null);

  const mirrorExecutionState = useCallback((next: WorkoutSessionExecutionState) => {
    setExecutionState(next);
    const now = Date.now();
    const derivedStartedAt = executionStartedAtMs(next, now);
    setStartedAtMs(derivedStartedAt);
    setElapsedSeconds(executionElapsedSeconds(next, now));
    storeTimestamp(workoutTimerKey, derivedStartedAt);

    const restLeft = executionRestSecondsLeft(next, now);
    const parsedRestEndsAt = next.rest_ends_at ? Date.parse(next.rest_ends_at) : Number.NaN;
    if (next.view_state === "rest" && restLeft > 0 && Number.isFinite(parsedRestEndsAt)) {
      setTimerSeconds(next.rest_duration_seconds ?? restLeft);
      setTimerLeft(restLeft);
      setTimerEndsAtMs(parsedRestEndsAt);
      setIsTimerRunning(true);
      storeTimestamp(restTimerKey, parsedRestEndsAt);
    } else {
      setTimerLeft(0);
      setTimerEndsAtMs(null);
      setIsTimerRunning(false);
      clearStoredValue(restTimerKey);
    }

    if (user?.id) {
      writeActiveWorkoutState(user.id, activeWorkoutCacheFromExecution(next, {
        route: sessionRoute,
        label: day.day_name,
        controllerDeviceId: controllerDeviceIdRef.current
      }, now));
    }
  }, [day.day_name, restTimerKey, sessionRoute, user, workoutTimerKey]);

  const dispatchExecution = useCallback((
    commandType: Parameters<ActiveSessionStore["dispatch"]>[0]["commandType"],
    payload: Parameters<ActiveSessionStore["dispatch"]>[0]["payload"],
    options: {
      rollback?: (currentServerState: WorkoutSessionExecutionState | null) => void;
      reportFailure?: boolean;
    } = {}
  ) => {
    const store = activeSessionStoreRef.current;
    const attemptedState = store?.getSnapshot().executionState ?? null;
    if (!store || !user?.id || !session?.id) {
      return Promise.reject(new Error("The workout execution store is unavailable."));
    }
    const operation = store.dispatch({
      userId: user.id,
      workoutSessionId: session.id,
      commandId: createSessionCommandId(),
      commandType,
      payload
    } as Parameters<ActiveSessionStore["dispatch"]>[0]);
    void operation.then(
      (response) => { mirrorExecutionState(response.state); },
      (error) => {
        options.rollback?.(attemptedState);
        if (options.reportFailure === false) return;
        setSetFeedbackVariant("error");
        setSetFeedback(tr("offline.setSaveCombined"));
        toast({ title: tr("completion.saveFailedTitle"), description: userSafeError(error, tr("offline.keepOpenRetry")) });
      }
    );
    return operation.then((response) => response.state);
  }, [mirrorExecutionState, session, toast, tr, user]);

  useEffect(() => {
    let active = true;
    executionHydratedRef.current = false;
    setIsStarting(true);
    setSession(null);
    setLoadFailed(false);
    if (!user?.id) {
      setIsStarting(false);
      toast({ title: tr("header.signInRequired"), description: tr("header.signInBeforeSaving") });
      return () => { active = false; };
    }

    const storedActiveWorkout = readActiveWorkoutState(user.id);
    const candidateSessionId = storedActiveWorkout
      && storedActiveWorkout.route === sessionRoute
      && isValidActiveWorkoutRoute(storedActiveWorkout.route)
      ? storedActiveWorkout.sessionId
      : null;
    const sessionStart = sourceKind === "plan-day"
      ? getOrStartWorkoutDaySession(user.id, day)
      : getOrStartWorkoutSession(user.id, directWorkout!, candidateSessionId);

    sessionStart
      .then(async (nextSession) => {
        if (!active) return;
        controllerDeviceIdRef.current = getActiveWorkoutDeviceId();

        const storedStartedAt = readStoredTimestamp(workoutTimerKey);
        const storedRestEndsAt = readStoredTimestamp(restTimerKey);
        const exerciseIds = day.exercises.map((exercise) => exercise.id);
        const store = getActiveSessionStore({
          userId: user.id,
          workoutSessionId: nextSession.id,
          adapter: activeSessionPersistenceAdapter,
          clearCompatibilityCache: () => clearActiveWorkoutState(user.id)
        });
        activeSessionStoreRef.current = store;
        const hydration = store.hydrate({
          legacyCache: {
            userId: user.id,
            sessionId: nextSession.id,
            startedAtMs: storedStartedAt,
            restEndsAtMs: storedRestEndsAt,
            restDurationSeconds: 75,
            controllerDeviceId: controllerDeviceIdRef.current
          }
        });
        const [, workoutHistory, targets, savedAlternatives] = await Promise.all([
          hydration,
          getWorkoutHistoryDetailed(user.id, 100),
          sourceKind === "plan-day"
            ? getProgressionTargets(user.id, exerciseIds).catch(() => [])
            : Promise.resolve([]),
          sourceKind === "plan-day"
            ? getExerciseAlternatives(user.id).catch(() => [])
            : Promise.resolve([])
        ]);
        const hydrated = store.getSnapshot();
        let authoritativeState = hydrated.executionState;
        const cursorItems = [...hydrated.prescription];
        const existingLogs = [...hydrated.performedLogs];
        if (!authoritativeState) throw new Error("The active workout has no execution state.");

        if (controllerDeviceIdRef.current && authoritativeState.controller_device_id !== controllerDeviceIdRef.current) {
          const response = await store.dispatch({
            userId: user.id,
            workoutSessionId: nextSession.id,
            commandId: createSessionCommandId(),
            commandType: "move_cursor",
            payload: {
              active_snapshot_item_id: authoritativeState.active_snapshot_item_id,
              active_item_order: authoritativeState.active_item_order,
              active_set_number: authoritativeState.active_set_number,
              controller_device_id: controllerDeviceIdRef.current
            }
          });
          authoritativeState = response.state;
        }

        if (authoritativeState.view_state === "rest" && executionRestSecondsLeft(authoritativeState) <= 0) {
          const response = await store.dispatch({
            userId: user.id,
            workoutSessionId: nextSession.id,
            commandId: createSessionCommandId(),
            commandType: "clear_rest",
            payload: {
              view_state: "set_entry",
              completion_reason: "natural_expiration",
              controller_device_id: controllerDeviceIdRef.current
            }
          });
          authoritativeState = response.state;
        }

        if (!active) return;
        const authoritativeItems = cursorItems.length || !isMockAuthUserId(user.id)
          ? cursorItems
          : mockPrescriptionItemsFromPlan(day.exercises, nextSession.id, user.id);
        setExecutionCursorItems(authoritativeItems);
        const hydratedStates = hydrateStates(authoritativeItems.map((item) => makeFrozenExerciseState(item, day.exercises)), existingLogs);
        setExerciseStates(hydratedStates);
        const authoritativeCursor = executionCursorToIndexes(
          authoritativeState,
          authoritativeItems,
          hydratedStates.map((item) => item.exercise)
        );
        const cursor = authoritativeState.view_state === "set_entry"
          ? nextIncompleteSetCursor(
              hydratedStates.flatMap((exercise, exerciseIndex) =>
                exercise.sets.map((set, setIndex) => ({
                  exerciseIndex,
                  setIndex,
                  completed: Boolean(set.completedAt)
                }))
              ),
              authoritativeCursor
            )
          : authoritativeCursor;
        const exerciseIndex = Math.min(Math.max(0, cursor.exerciseIndex), Math.max(0, hydratedStates.length - 1));
        const setCount = hydratedStates[exerciseIndex]?.sets.length ?? 1;
        setActiveExerciseIndex(exerciseIndex);
        setActiveSetIndex(Math.min(Math.max(0, cursor.setIndex), Math.max(0, setCount - 1)));
        setTimerSeconds(hydratedStates[exerciseIndex]?.sets[Math.min(Math.max(0, cursor.setIndex), Math.max(0, setCount - 1))]?.plannedRestSeconds ?? 75);
        mirrorExecutionState(authoritativeState);
        setSession(nextSession);
        setSessionNotes(nextSession.notes ?? "");
        setHistory(workoutHistory.filter((item) => item.id !== nextSession.id));
        setProgressionTargets(targets);
        setAlternatives(savedAlternatives.filter((item) => exerciseIds.includes(item.plan_exercise_id)));
        executionHydratedRef.current = true;
      })
      .catch((error) => {
        if (active) {
          setSession(null);
          setLoadFailed(true);
        }
        toast({ title: tr("header.loadFailedTitle"), description: userSafeError(error, tr("header.loadFailedDescription")) });
      })
      .finally(() => {
        if (active) setIsStarting(false);
      });

    return () => { active = false; };
  }, [day, directWorkout, mirrorExecutionState, restTimerKey, sessionRoute, sourceKind, toast, tr, user?.id, workoutTimerKey]);

  useEffect(() => {
    const tick = () => {
      const now = activeSessionClock.getSnapshot();
      setElapsedSeconds(
        executionState
          ? executionElapsedSeconds(executionState, now)
          : Math.max(0, Math.floor((now - startedAtMs) / 1000))
      );
      const nextLeft = executionState
        ? executionRestSecondsLeft(executionState, now)
        : 0;
      setTimerLeft(nextLeft);
      setIsTimerRunning(Boolean(executionState?.view_state === "rest" && nextLeft > 0));
      if (executionState?.view_state === "rest" && nextLeft <= 0) {
        const expiryKey = `${executionState.revision}:${executionState.rest_ends_at}`;
        if (restExpiryCommandRef.current === expiryKey) return;
        restExpiryCommandRef.current = expiryKey;
        setTimerEndsAtMs(null);
        setIsTimerRunning(false);
        clearStoredValue(restTimerKey);
        if (user?.id && session?.id && executionHydratedRef.current) {
          void dispatchExecution("clear_rest", {
            view_state: "set_entry",
            completion_reason: "natural_expiration",
            controller_device_id: controllerDeviceIdRef.current
          });
        }
        toast({ title: tr("notifications.restFinished"), description: tr("notifications.nextSetReady") });
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          new Notification(tr("notifications.restFinished"), { body: tr("notifications.nextSetReady") });
        }
      }
    };
    return activeSessionClock.subscribe(tick);
  }, [dispatchExecution, executionState, restTimerKey, session?.id, startedAtMs, toast, tr, user?.id]);

  useEffect(() => {
    if (!executionHydratedRef.current || !user?.id || !session?.id || !executionState) return;
    const cursorItem = executionCursorItems[activeExerciseIndex]
      ?? executionCursorItems.find((item) => item.itemOrder === activeExerciseIndex + 1)
      ?? null;
    const itemOrder = cursorItem?.itemOrder ?? activeExerciseIndex + 1;
    const setNumber = activeSetIndex + 1;
    if (
      executionState.active_snapshot_item_id === (cursorItem?.id ?? null)
      && executionState.active_item_order === itemOrder
      && executionState.active_set_number === setNumber
      && executionState.controller_device_id === controllerDeviceIdRef.current
    ) return;

    void dispatchExecution(
      "move_cursor",
      {
        active_snapshot_item_id: cursorItem?.id ?? null,
        active_item_order: itemOrder,
        active_set_number: setNumber,
        controller_device_id: controllerDeviceIdRef.current
      },
      {
        rollback: (currentServerState) => {
          if (!currentServerState) return;
          const previousCursor = executionCursorToIndexes(currentServerState, executionCursorItems);
          setActiveExerciseIndex(previousCursor.exerciseIndex);
          setActiveSetIndex(previousCursor.setIndex);
        }
      }
    );
  }, [activeExerciseIndex, activeSetIndex, dispatchExecution, executionCursorItems, executionState, session?.id, user?.id]);

  const activeExercise = exerciseStates[activeExerciseIndex];
  const activeSet = activeExercise?.sets[activeSetIndex];
  const totalSets = exerciseStates.reduce((sum, item) => sum + item.sets.length, 0);
  const completedSets = exerciseStates.reduce((sum, item) => sum + item.sets.filter((set) => set.completedAt).length, 0);
  const isFinished = completedSets === totalSets && totalSets > 0;
  const durationMinutes = Math.max(1, Math.ceil(elapsedSeconds / 60));
  const activePreviousPerformance = activeExercise ? previousPerformance(history, activeExercise.exercise.exercise_name, formatters) : null;
  const activeProgressionTarget = progressionTargets.find((target) => target.plan_exercise_id === activeExercise?.exercise.id) ?? null;
  const activeAlternatives = alternatives.filter((alternative) => alternative.plan_exercise_id === activeExercise?.exercise.id);
  const currentGuideUrl = activeExercise?.exercise.exercise_url || (activeExercise?.exercise.notes?.startsWith("http") ? activeExercise.exercise.notes : null);
  const currentCustomVideoUrl = activeExercise?.exercise.custom_video_url || null;
  const currentInstructions = activeExercise?.exercise.instructions || tr("exercise.defaultInstructions");
  const previewPrs = buildPrs(exerciseStates, history, tr, formatters);
  const sessionSets = buildSessionSets(exerciseStates);
  const totalVolume = round(sessionSets.reduce((sum, set) => sum + set.weightKg * set.reps, 0));
  const nextExercise = exerciseStates[activeExerciseIndex + 1];
  const activeExerciseCompleted = activeExercise?.sets.every((set) => set.completedAt) ?? false;
  const nextSetLabel = activeExercise && !activeExerciseCompleted && activeSet
    ? `${tr("set.label", { count: formatters.integer(activeSet.setNumber) })} / ${formatters.integer(activeExercise.sets.length)}`
    : nextExercise
      ? tr("exercise.nextExercise", { name: isolateBidiText(nextExercise.exercise.exercise_name) })
      : tr("navigation.allDone");
  const workoutContext = {
    plan: day.plan,
    workout_day: { id: day.id, name: day.day_name, weekday: day.weekday, notes: day.notes },
    planned_exercises: executionCursorItems.map((item) => ({ id: item.sourcePlanExerciseId ?? item.sourcePlanActivityId ?? item.id, name: item.activityName, item_order: item.itemOrder, normalization_status: item.normalizationStatus, prescription_sets: item.prescriptionSets })),
    active_exercise: activeExercise?.exercise ?? null,
    logged_sets: buildWorkoutContextLogRows(exerciseStates),
    session: session ? { id: session.id, duration_minutes: durationMinutes, notes: sessionNotes } : null,
    previous_performance: activePreviousPerformance,
    possible_prs: previewPrs,
    skipped_exercises: exerciseStates.filter((item) => !item.sets.some((set) => set.completedAt)).map((item) => item.exercise.exercise_name),
    saved_progression_target: activeProgressionTarget
  };

  function buildLogRows(
    states = exerciseStates,
    options: {
      pendingOnly?: boolean;
      validOnly?: boolean;
      effortMode?: "strict" | "draft-context";
    } = {}
  ) {
    const parseEffort = options.effortMode === "draft-context"
      ? workoutSetEffortInputForContext
      : parseWorkoutSetEffortInput;
    return states.flatMap((item, exerciseIndex) =>
      item.sets
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
            exerciseCategory: item.exercise.category || item.exercise.target_muscle || item.exercise.equipment || "Workout",
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

  function buildWorkoutContextLogRows(states = exerciseStates) {
    return buildLogRows(states, { effortMode: "draft-context" }).map((row) => {
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

  function updateSet(exerciseIndex: number, setIndex: number, patch: Partial<SetState>) {
    setExerciseStates((current) => {
      const next = current.map((item, itemIndex) =>
        itemIndex === exerciseIndex
          ? { ...item, sets: item.sets.map((set, currentSetIndex) => (currentSetIndex === setIndex ? mergeSetPatch(set, patch) : set)) }
          : item
      );
      exerciseStatesRef.current = next;
      return next;
    });
  }

  function statesWithSetPatch(exerciseIndex: number, setIndex: number, patch: Partial<SetState>) {
    return exerciseStates.map((item, itemIndex) =>
      itemIndex === exerciseIndex
        ? { ...item, sets: item.sets.map((set, currentSetIndex) => (currentSetIndex === setIndex ? mergeSetPatch(set, patch) : set)) }
        : item
    );
  }


  async function persistProgress(states = exerciseStates) {
    if (!session) return;
    const rows = buildLogRows(states, { pendingOnly: true });
    if (rows.length) {
      const store = activeSessionStoreRef.current;
      if (!store) throw new Error("The workout execution store is unavailable.");
      await store.saveCanonicalSets(rows);
    }
    setExerciseStates((current) => {
      const next = acknowledgeSetWrites(current, states);
      exerciseStatesRef.current = next;
      return next;
    });
  }

  useEffect(() => {
    autosaveAdapterRef.current = {
      getSnapshot: () => exerciseStatesRef.current,
      hasPendingWrites: hasPendingValidSetWrites,
      persistSnapshot: async (states) => {
        if (!session) return;
        const rows = buildLogRows(states, { pendingOnly: true, validOnly: true });
        if (!rows.length) return;
        const store = activeSessionStoreRef.current;
        if (!store) throw new Error("The workout execution store is unavailable.");
        await store.saveCanonicalSets(rows);
      },
      acknowledgeSnapshot: (savedStates) => {
        setExerciseStates((current) => {
          const next = acknowledgeSetWrites(current, savedStates);
          exerciseStatesRef.current = next;
          return next;
        });
      },
      onFailure: (error) => {
        console.warn("Plaivra will retry the pending completed-set details.", error);
      }
    };
  });

  useEffect(() => mountWorkoutSetAutosaveCoordinator(
    autosaveCoordinatorRef,
    () => {
      const adapter = autosaveAdapterRef.current;
      if (!adapter) throw new Error("Workout set autosave is unavailable.");
      return adapter;
    }
  ), []);

  function flushPendingSetWrites() {
    return autosaveCoordinatorRef.current?.requestFlush() ?? Promise.resolve();
  }

  function handleSetDetailsOpenChange(open: boolean) {
    setActionsOpen(open);
    if (!open) void flushPendingSetWrites();
  }

  useEffect(() => {
    exerciseStatesRef.current = exerciseStates;
  }, [exerciseStates]);

  useEffect(() => {
    if (!session || isStarting || !hasPendingValidSetWrites(exerciseStates)) return;
    autosaveCoordinatorRef.current?.scheduleFlush(650);
  }, [exerciseStates, isStarting, session]);

  function startRestTimer(seconds: number) {
    const safeSeconds = Math.max(0, seconds);
    if (!safeSeconds) return;
    const previous = { timerSeconds, timerLeft, timerEndsAtMs, isTimerRunning };
    const deadline = restDeadline(safeSeconds);
    setTimerSeconds(safeSeconds);
    setTimerLeft(safeSeconds);
    setTimerEndsAtMs(deadline);
    setIsTimerRunning(true);
    storeTimestamp(restTimerKey, deadline);
    if (user?.id && session?.id && executionHydratedRef.current) {
      void dispatchExecution(
        "start_rest",
        {
          duration_seconds: safeSeconds,
          controller_device_id: controllerDeviceIdRef.current
        },
        { rollback: () => restoreRestTimer(previous) }
      );
    }
  }

  function stopRestTimer() {
    const previous = { timerSeconds, timerLeft, timerEndsAtMs, isTimerRunning };
    setTimerLeft(0);
    setTimerEndsAtMs(null);
    setIsTimerRunning(false);
    clearStoredValue(restTimerKey);
    if (user?.id && session?.id && executionHydratedRef.current) {
      void dispatchExecution(
        "clear_rest",
        {
          view_state: "set_entry",
          completion_reason: "user_skipped",
          controller_device_id: controllerDeviceIdRef.current
        },
        { rollback: () => restoreRestTimer(previous) }
      );
    }
  }

  function restoreRestTimer(snapshot: { timerSeconds: number; timerLeft: number; timerEndsAtMs: number | null; isTimerRunning: boolean }) {
    setTimerSeconds(snapshot.timerSeconds);
    setTimerLeft(snapshot.timerLeft);
    setTimerEndsAtMs(snapshot.timerEndsAtMs);
    setIsTimerRunning(snapshot.isTimerRunning);
    if (snapshot.timerEndsAtMs) storeTimestamp(restTimerKey, snapshot.timerEndsAtMs);
    else clearStoredValue(restTimerKey);
  }

  async function reconcileSavedSetAfterExecutionFailure(savedStates: ExerciseState[]) {
    if (!user?.id || !session?.id) return;
    const store = activeSessionStoreRef.current;
    if (!store) throw new Error("The workout execution store is unavailable.");
    await store.hydrate({ force: true });
    const authoritativeState = store.getSnapshot().executionState;
    const authoritativeLogs = [...store.getSnapshot().performedLogs];
    if (!authoritativeState) throw new Error("The workout execution state is unavailable.");
    const reconciledStates = hydrateStates(savedStates, authoritativeLogs);
    const cursor = executionCursorToIndexes(authoritativeState, executionCursorItems, day.exercises);
    const exerciseIndex = Math.min(Math.max(0, cursor.exerciseIndex), Math.max(0, reconciledStates.length - 1));
    const setCount = reconciledStates[exerciseIndex]?.sets.length ?? 1;
    setExerciseStates(reconciledStates);
    setActiveExerciseIndex(exerciseIndex);
    setActiveSetIndex(Math.min(Math.max(0, cursor.setIndex), Math.max(0, setCount - 1)));
    mirrorExecutionState(authoritativeState);
  }

  async function finishSet(exerciseIndex: number, setIndex: number) {
    const targetSet = exerciseStates[exerciseIndex]?.sets[setIndex];
    const storeSnapshot = activeSessionStoreRef.current?.getSnapshot();
    if (
      !targetSet
      || targetSet.completedAt
      || isSaving
      || isStarting
      || !session?.id
      || !user?.id
      || !executionHydratedRef.current
      || executionState?.session_state === "paused"
      || storeSnapshot?.root?.status !== "started"
    ) return;

    const setDraftValidation = validateActiveWorkoutSetDraft(
      targetSet.reps,
      targetSet.weightKg
    );
    if (!setDraftValidation.complete) {
      setSetFeedbackVariant("error");
      setSetFeedback(tr("validation.requiredValues"));
      return;
    }

    if (!setHasValidEffortInputs(targetSet)) {
      setActiveExerciseIndex(exerciseIndex);
      setActiveSetIndex(setIndex);
      setActionsOpen(true);
      return;
    }

    const previousStates = exerciseStates;
    const previousActiveExerciseIndex = activeExerciseIndex;
    const previousActiveSetIndex = activeSetIndex;
    const previousTimer = { timerSeconds, timerLeft, timerEndsAtMs, isTimerRunning };
    const completedAt = new Date();
    const nextStates = statesWithSetPatch(exerciseIndex, setIndex, { completedAt: completedAt.toISOString() });
    const store = activeSessionStoreRef.current;
    if (!store) {
      toast({
        title: tr("completion.saveFailedTitle"),
        description: tr("offline.keepOpenRetry")
      });
      return;
    }
    let transition;
    try {
      const canonical = store.getSnapshot();
      const currentPrescriptionItem = canonical.prescription.find(
        (item) => item.id === executionCursorItems[exerciseIndex]?.id
      ) ?? canonical.prescription.find(
        (item) => item.itemOrder === exerciseIndex + 1
      );
      transition = planSessionAfterSetCompletion({
        userId: user.id,
        workoutSessionId: session.id,
        currentSnapshotItemId: currentPrescriptionItem?.id ?? "",
        currentSetNumber: setIndex + 1,
        prescription: canonical.prescription,
        performedLogs: canonical.performedLogs,
        restDurationSeconds: targetSet.plannedRestSeconds ?? timerSeconds,
        controllerDeviceId: controllerDeviceIdRef.current
      });
    } catch (error) {
      toast({
        title: tr("completion.saveFailedTitle"),
        description: userSafeError(error, tr("offline.keepOpenRetry"))
      });
      return;
    }

    setIsSaving(true);
    try {
      const response = await store.completeCanonicalSet({
        logs: buildLogRows(nextStates, { pendingOnly: true }),
        executionIntent: {
          userId: user.id,
          workoutSessionId: session.id,
          commandId: createSessionCommandId(),
          commandType: "complete_set_transition",
          payload: {
            active_snapshot_item_id: transition.patch.active_snapshot_item_id,
            active_item_order: transition.patch.active_item_order,
            active_set_number: transition.patch.active_set_number,
            view_state: transition.patch.view_state,
            rest_duration_seconds: transition.patch.rest_duration_seconds,
            controller_device_id: transition.patch.controller_device_id
          }
        }
      });
      mirrorExecutionState(response.state);

      const acknowledgedStates = acknowledgeSetWrites(nextStates, nextStates);
      setExerciseStates(acknowledgedStates);
      exerciseStatesRef.current = acknowledgedStates;
      setActiveExerciseIndex(transition.nextExerciseIndex);
      setActiveSetIndex(transition.nextSetIndex);
      if (!transition.hasNextSet || transition.patch.view_state !== "rest") {
        setTimerLeft(0);
        setTimerEndsAtMs(null);
        setIsTimerRunning(false);
        clearStoredValue(restTimerKey);
      }
      if (transition.nextExerciseIndex !== exerciseIndex && transition.patch.view_state !== "rest") {
        setTimerSeconds(nextStates[transition.nextExerciseIndex]?.sets[transition.nextSetIndex]?.plannedRestSeconds ?? 75);
      }
      setSetFeedbackVariant("info");
      setSetFeedback(tr("set.savedDetails", { set: formatters.integer(targetSet.setNumber), reps: formatPlannedReps(targetSet.reps, formatters, "-"), weight: formatters.measurement(toNumberOrNull(targetSet.weightKg) ?? 0, "kg") }));
      const currentWeight = toNumberOrNull(targetSet.weightKg) ?? 0;
      const currentReps = toNumberOrNull(targetSet.reps) ?? 0;
      const exercise = exerciseStates[exerciseIndex];
      if (exercise && currentWeight > 0 && currentReps > 0) {
        const prevPerf = previousPerformance(history, exercise.exercise.exercise_name, formatters);
        if (prevPerf && (currentWeight > (prevPerf.lastWeightKg ?? 0) || currentReps > (prevPerf.lastReps ?? 0))) {
          setPrFeedback(tr("set.newBest", { name: isolateBidiText(exercise.exercise.exercise_name), weight: formatters.measurement(currentWeight, "kg"), reps: formatters.integer(currentReps) }));
          window.setTimeout(() => setPrFeedback(""), 3500);
        }
      }
    } catch (error) {
      if (
        error instanceof Error
        && "code" in error
        && error.code === "canonical_set_saved_execution_sync_failed"
      ) {
        const acknowledgedStates = acknowledgeSetWrites(nextStates, nextStates);
        setExerciseStates(acknowledgedStates);
        exerciseStatesRef.current = acknowledgedStates;
        setSetFeedbackVariant("error");
        setSetFeedback(`${tr("set.saved")} ${tr("offline.keepOpenRetry")}`);
        toast({ title: tr("set.saved"), description: userSafeError(error, tr("offline.keepOpenRetry")) });
        try {
          await reconcileSavedSetAfterExecutionFailure(nextStates);
        } catch (reconcileError) {
          console.warn("Plaivra saved the completed set but could not reconcile the workout position.", reconcileError);
        }
      } else {
        setExerciseStates(previousStates);
        setActiveExerciseIndex(previousActiveExerciseIndex);
        setActiveSetIndex(previousActiveSetIndex);
        restoreRestTimer(previousTimer);
        setSetFeedbackVariant("error");
        setSetFeedback(tr("offline.setSaveCombined"));
        toast({ title: tr("completion.saveFailedTitle"), description: userSafeError(error, tr("offline.keepOpenRetry")) });
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function restartSet(exerciseIndex: number, setIndex: number) {
    if (isSaving) return;
    const previousStates = exerciseStates;
    setIsSaving(true);
    const nextStates = statesWithSetPatch(exerciseIndex, setIndex, { completedAt: null });
    setExerciseStates(nextStates);
    try {
      await persistProgress(nextStates);
      setSetFeedbackVariant("info");
      setSetFeedback(legacySetReopened);
    } catch (error) {
      setExerciseStates(previousStates);
      setSetFeedbackVariant("error");
      setSetFeedback(legacySetReopenFailed);
      toast({ title: tr("completion.saveFailedTitle"), description: userSafeError(error, tr("header.loadFailedDescription")) });
    } finally {
      setIsSaving(false);
    }
  }

  function executionCursorFor(exerciseIndex: number, setIndex: number) {
    const item = executionCursorItems[exerciseIndex]
      ?? executionCursorItems.find((candidate) => candidate.itemOrder === exerciseIndex + 1)
      ?? null;
    return {
      snapshotItemId: item?.id ?? null,
      itemOrder: item?.itemOrder ?? exerciseIndex + 1,
      setNumber: setIndex + 1
    };
  }

  function openSessionReview() {
    if (isStarting || !session?.id || !executionHydratedRef.current) return;
    setFinishOpen(true);
    if (!user?.id) return;
    const cursor = executionCursorFor(activeExerciseIndex, activeSetIndex);
    void dispatchExecution("move_cursor", {
      active_snapshot_item_id: cursor.snapshotItemId,
      active_item_order: cursor.itemOrder,
      active_set_number: cursor.setNumber,
      view_state: "session_review",
      controller_device_id: controllerDeviceIdRef.current
    });
  }

  function handleSessionReviewOpenChange(open: boolean) {
    if (open) {
      openSessionReview();
      return;
    }
    setFinishOpen(false);
    if (!user?.id || !session?.id || !executionHydratedRef.current) return;
    const cursor = executionCursorFor(activeExerciseIndex, activeSetIndex);
    void dispatchExecution("move_cursor", {
      active_snapshot_item_id: cursor.snapshotItemId,
      active_item_order: cursor.itemOrder,
      active_set_number: cursor.setNumber,
      view_state: isFinished ? "exercise_complete" : "set_entry",
      controller_device_id: controllerDeviceIdRef.current
    });
  }

  async function completeSession() {
    if (!session || isSaving || isStarting || !executionHydratedRef.current) return;
    const invalidLocation = exerciseStates.flatMap((item, exerciseIndex) =>
      item.sets.map((set, setIndex) => ({ set, exerciseIndex, setIndex }))
    ).find(({ set }) => Boolean(set.completedAt || set.hasPersistedLog) && !setHasValidEffortInputs(set));
    if (invalidLocation) {
      setActiveExerciseIndex(invalidLocation.exerciseIndex);
      setActiveSetIndex(invalidLocation.setIndex);
      setActionsOpen(true);
      return;
    }
    try {
      setIsSaving(true);
      const summary = buildSummary(exerciseStates, history, durationMinutes, sessionNotes, tr, formatters);
      const store = activeSessionStoreRef.current;
      if (!store) throw new Error("The workout execution store is unavailable.");
      await store.completeSession({
        notes: sessionNotes,
        durationMinutes,
        finalLogs: sourceKind === "direct"
          ? buildLogRows(exerciseStates, { pendingOnly: true, validOnly: true })
          : buildLogRows(exerciseStates)
      });
      clearStoredValue(workoutTimerKey);
      clearStoredValue(restTimerKey);
      setFinishOpen(false);
      setCompletedSummary(summary);
      toast({ title: tr("completion.title"), description: tr("completion.savedNamedWorkout", { name: isolateBidiText(day.day_name) }) });
      celebrate(tr("completion.title"));
      if (sourceKind === "direct") router.push("/workout-history");
    } catch (error) {
      toast({ title: tr("completion.saveFailedTitle"), description: userSafeError(error) });
    } finally {
      setIsSaving(false);
    }
  }

  async function togglePause() {
    if (!executionState || isSaving || isStarting) return;
    setIsSaving(true);
    try {
      await dispatchExecution(
        executionState.session_state === "paused" ? "resume" : "pause",
        { controller_device_id: controllerDeviceIdRef.current }
      );
    } catch {
      // dispatchExecution already presents the localized recoverable failure.
    } finally {
      setIsSaving(false);
    }
  }

  function resetWorkoutTimer() {
    const previousStartedAt = startedAtMs;
    const previousElapsed = elapsedSeconds;
    const nextStartedAt = Date.now();
    setStartedAtMs(nextStartedAt);
    setElapsedSeconds(0);
    storeTimestamp(workoutTimerKey, nextStartedAt);
    if (user?.id && session?.id && executionHydratedRef.current) {
      void dispatchExecution(
        "reset_timer",
        { controller_device_id: controllerDeviceIdRef.current },
        {
          rollback: () => {
            setStartedAtMs(previousStartedAt);
            setElapsedSeconds(previousElapsed);
            storeTimestamp(workoutTimerKey, previousStartedAt);
          }
        }
      );
    }
  }

  async function skipCurrentExercise() {
    if (sourceKind !== "plan-day" || isSaving || isStarting || !activeExercise) return;
    const store = activeSessionStoreRef.current;
    const snapshotItemId = executionCursorItems[activeExerciseIndex]?.id;
    if (!store || !snapshotItemId) return;

    setIsSaving(true);
    try {
      await store.skipExercise(snapshotItemId, "user_skipped");
      const snapshot = store.getSnapshot();
      const items = [...snapshot.prescription];
      const nextStates = hydrateStates(
        items.map((item) => makeFrozenExerciseState(item, day.exercises)),
        [...snapshot.performedLogs]
      );
      const state = snapshot.executionState;
      const cursor = state
        ? executionCursorToIndexes(state, items, nextStates.map((item) => item.exercise))
        : {
            exerciseIndex: Math.min(activeExerciseIndex + 1, Math.max(0, nextStates.length - 1)),
            setIndex: 0
          };
      const nextExerciseIndex = Math.min(
        Math.max(0, cursor.exerciseIndex),
        Math.max(0, nextStates.length - 1)
      );
      const nextSetCount = nextStates[nextExerciseIndex]?.sets.length ?? 1;

      setExecutionCursorItems(items);
      setExerciseStates(nextStates);
      exerciseStatesRef.current = nextStates;
      setActiveExerciseIndex(nextExerciseIndex);
      setActiveSetIndex(Math.min(Math.max(0, cursor.setIndex), Math.max(0, nextSetCount - 1)));
      if (state) mirrorExecutionState(state);
      setActionsOpen(false);
    } catch (error) {
      toast({
        title: tr("completion.saveFailedTitle"),
        description: userSafeError(error, tr("offline.keepOpenRetry"))
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function applyStableReplacement(replacement: Workout) {
    if (sourceKind !== "plan-day" || !user?.id || !session || !activeExercise) return;
    const store = activeSessionStoreRef.current;
    if (!store) return;
    const originalName = activeExercise.exercise.exercise_name;
    setIsSavingAlternative(true);
    try {
      await store.replaceExercise({
        sourcePlanExerciseId: activeExercise.exercise.id,
        replacement
      });
      setExerciseStates((current) => current.map((item, index) => index === activeExerciseIndex
        ? { ...item, exercise: { ...item.exercise, exercise_name: replacement.name } }
        : item));
      setReplacementPickerOpen(false);
      toast({ title: tr("exercise.replacementReady"), description: tr("exercise.replacementReadyDescription", { name: isolateBidiText(replacement.name) }) });
      void createExerciseAlternative(user.id, {
        plan_exercise_id: activeExercise.exercise.id,
        original_exercise_name: originalName,
        alternative_exercise_name: replacement.name,
        reason: replacementReason,
        target_muscle: replacement.target_muscle || activeExercise.exercise.target_muscle,
        equipment: replacement.equipment || activeExercise.exercise.equipment,
        created_by: "user"
      }).then((saved) => setAlternatives((current) => [saved, ...current])).catch((error) => {
        console.warn("Plaivra recorded the workout replacement but could not save the optional alternative shortcut.", error);
      });
    } catch (error) {
      toast({ title: tr("exercise.replacementFailed"), description: userSafeError(error) });
    } finally {
      setIsSavingAlternative(false);
    }
  }

  function applyPreviousSet(exerciseIndex: number, setIndex: number) {
    const item = exerciseStates[exerciseIndex];
    const targetSet = item?.sets[setIndex];
    if (!item || !targetSet) return;
    const previous = previousSetForExercise(history, item.exercise.exercise_name, targetSet.setNumber);
    if (!previous) {
      toast({ title: tr("exercise.noPreviousPerformance"), description: tr("exercise.noPreviousSetDescription") });
      return;
    }
    updateSet(exerciseIndex, setIndex, {
      reps: previous.reps === null ? targetSet.reps : String(previous.reps),
      weightKg: previous.weightKg === null ? targetSet.weightKg : String(previous.weightKg)
    });
  }

  if (isStarting) {
    return (
      <div className="mx-auto flex min-h-[18rem] w-full max-w-3xl items-center justify-center" dir={dir}>
        <div className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground" role="status">
          <RefreshCcw className="h-4 w-4 motion-safe:animate-spin" />
          {tr("header.loadingSession")}
        </div>
      </div>
    );
  }

  if (loadFailed) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-5">
          <p className="font-semibold">{tr("header.loadFailedTitle")}</p>
          <p className="text-sm text-muted-foreground">{tr("header.loadFailedDescription")}</p>
          <Button type="button" variant="outline" className="min-h-12" onClick={() => window.location.reload()}>
            <RefreshCcw className="h-4 w-4" /> {tr("common.retry")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!exerciseStates.length) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-5">
          <p className="text-sm text-muted-foreground">{tr("header.noExercises")}</p>
          <Button asChild variant="outline" className="min-h-12">
            <Link href="/my-workout/plans"><ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {tr("header.backToTrain")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!activeExercise || !activeSet) return null;

  const activeRpeValidation = validateWorkoutSetEffortInput(activeSet.rpe, "rpe");
  const activeRirValidation = validateWorkoutSetEffortInput(activeSet.rir, "rir");
  const rpeErrorId = activeRpeValidation.error ? "active-set-rpe-error" : undefined;
  const rirErrorId = activeRirValidation.error ? "active-set-rir-error" : undefined;
  const activeSetValidation = validateActiveWorkoutSetDraft(activeSet.reps, activeSet.weightKg);
  const isPaused = executionState?.session_state === "paused";
  const restActive = executionState?.view_state === "rest" && timerLeft > 0;
  const primaryActionKind = isPaused
    ? "resume"
    : restActive
      ? "skip-rest"
      : isFinished
        ? "finish"
        : "complete-set";
  const primaryActionLabel = isPaused
    ? tr("common.resume")
    : restActive
      ? tr("rest.skip")
      : isFinished
        ? tr("common.finish")
        : tr("set.finishNumbered", { count: formatters.integer(activeSet.setNumber) });
  const primaryActionDisabled = Boolean(
    completedSummary
    || isSaving
    || isStarting
    || !session
    || (!isPaused && !restActive && !isFinished && (
      Boolean(activeSet.completedAt)
      || !activeSetValidation.complete
      || Boolean(activeRpeValidation.error)
      || Boolean(activeRirValidation.error)
    ))
  );
  const activeSetPath = buildActiveWorkoutSetPath(
    activeExercise.sets.map((set) => ({
      setNumber: set.setNumber,
      completed: Boolean(set.completedAt)
    })),
    activeSet.setNumber
  );
  const handlePrimaryAction = () => {
    if (isPaused) {
      void togglePause();
    } else if (restActive) {
      stopRestTimer();
    } else if (isFinished) {
      openSessionReview();
    } else {
      void finishSet(activeExerciseIndex, activeSetIndex);
    }
  };

  return (
    <ActiveWorkoutExecutionShell
      direction={dir}
      sessionLabel={day.day_name}
      exerciseName={activeExercise.exercise.exercise_name}
      exercisePositionLabel={tr("header.exerciseProgress", {
        current: formatters.integer(activeExerciseIndex + 1),
        total: formatters.integer(exerciseStates.length)
      })}
      setPositionLabel={tr("header.setProgress", {
        current: formatters.integer(activeSetIndex + 1),
        total: formatters.integer(activeExercise.sets.length)
      })}
      completedSetsLabel={tr("header.completedSetsProgress", {
        completed: formatters.integer(completedSets),
        total: formatters.integer(totalSets)
      })}
      elapsedLabel={formatters.timer(elapsedSeconds)}
      progress={clampWorkoutProgress(completedSets, totalSets)}
      miniHeatMapLabel={tr("heatMap.currentSessionHeat")}
      miniHeatMapDescription={tr("heatMap.currentSessionDescription")}
      paused={Boolean(isPaused)}
      busy={isSaving || isStarting}
      restActive={restActive}
      restLabel={`${tr("rest.resting")} · ${formatters.timer(timerLeft)}`}
      nextContextLabel={nextSetLabel}
      currentSetLabel={tr("set.label", { count: formatters.integer(activeSet.setNumber) })}
      repsLabel={tr("set.reps")}
      weightLabel={tr("set.weightKg")}
      repsDraft={activeSet.reps}
      weightDraft={activeSet.weightKg}
      repsError={activeSet.reps.trim() && activeSetValidation.repsError
        ? activeSetValidation.repsError === "invalid"
          ? tr("validation.wholeReps")
          : tr("validation.requiredValues")
        : null}
      weightError={activeSet.weightKg.trim() && activeSetValidation.weightError
        ? tr("validation.nonNegative")
        : null}
      inputHint={!activeSet.reps.trim() || !activeSet.weightKg.trim()
        ? tr("validation.requiredValues")
        : null}
      setPathLabel={tr("set.path")}
      setPath={activeSetPath}
      setPathStateLabels={{
        completed: tr("navigation.completed"),
        active: tr("common.active"),
        available: tr("navigation.notStarted")
      }}
      formatSetNumber={formatters.integer}
      currentSetNumber={activeSet.setNumber}
      persisted={activeSet.hasPersistedLog}
      completed={Boolean(activeSet.completedAt)}
      hasDetails={activeSet.hasSetDetails}
      primaryActionKind={primaryActionKind}
      primaryActionLabel={primaryActionLabel}
      primaryActionDisabled={primaryActionDisabled}
      moreLabel={tr("common.more")}
      pauseLabel={tr("common.pause")}
      resumeLabel={tr("common.resume")}
      finishLabel={tr("common.finish")}
      addThirtySecondsLabel={tr("rest.addThirtySeconds")}
      restPresetLabels={[30, 60, 90, 180].map((seconds) => ({
        seconds,
        label: restPresetLabel(seconds, tr)
      }))}
      feedback={(
        <>
          <InlineFeedback message={setFeedback} variant={setFeedbackVariant} onClose={() => setSetFeedback("")} />
          <InlineFeedback message={prFeedback} onClose={() => setPrFeedback("")} />
        </>
      )}
      completionContent={completedSummary
        ? <WorkoutSummaryCard summary={completedSummary} dayName={day.day_name} />
        : null}
      onRepsChange={(value) => updateSet(activeExerciseIndex, activeSetIndex, { reps: value })}
      onWeightChange={(value) => updateSet(activeExerciseIndex, activeSetIndex, { weightKg: value })}
      onSelectSet={(setNumber) => {
        const setIndex = activeExercise.sets.findIndex((set) => set.setNumber === setNumber);
        if (setIndex < 0) return;
        void flushPendingSetWrites();
        setActiveSetIndex(setIndex);
      }}
      onPrimaryAction={handlePrimaryAction}
      onPauseResume={() => { void togglePause(); }}
      onFinish={openSessionReview}
      onOpenDetails={(trigger) => {
        setDetailsTriggerRef.current = trigger;
        setActionsOpen(true);
      }}
      onAddThirtySeconds={() => startRestTimer(timerLeft + 30)}
      onStartRest={startRestTimer}
      detailsContent={(
        <>
          <Dialog open={actionsOpen} onOpenChange={handleSetDetailsOpenChange}>
            <DialogContent
              data-active-set-details-dialog
              layout="responsive-drawer"
              closeLabel={tr("common.close")}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                setDetailsTriggerRef.current?.focus();
              }}
              className="max-h-[88dvh] overflow-y-auto p-5 lg:inset-y-6 lg:left-auto lg:right-6 lg:h-auto lg:w-[420px] lg:max-w-[420px] lg:translate-x-0 lg:translate-y-0 lg:rounded-[28px] lg:border"
            >
              <DialogHeader>
                <DialogTitle>{tr("actions.setDetails")}</DialogTitle>
                <DialogDescription><bdi dir="auto">{currentInstructions}</bdi></DialogDescription>
              </DialogHeader>

              <div className="space-y-5">
                <section className="border-b border-border/70 pb-4">
                  <h3 className="text-sm font-semibold">{tr("details.exerciseGuideVideo")}</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {currentGuideUrl ? <Button asChild variant="outline"><a href={currentGuideUrl} target="_blank" rel="noreferrer">{tr("details.openExerciseGuide")}</a></Button> : null}
                    {currentCustomVideoUrl ? <Button asChild variant="outline"><a href={currentCustomVideoUrl} target="_blank" rel="noreferrer">{tr("details.openCustomVideo")}</a></Button> : null}
                    {!currentGuideUrl && !currentCustomVideoUrl ? <p className="text-xs text-muted-foreground">{tr("details.noneSaved")}</p> : null}
                    <Button type="button" variant="outline" onClick={() => applyPreviousSet(activeExerciseIndex, activeSetIndex)} disabled={Boolean(activeSet.completedAt) || isSaving || isStarting}>{tr("exercise.previousSet")}</Button>
                    {activeSet.completedAt ? (
                      <Button type="button" variant="outline" onClick={() => restartSet(activeExerciseIndex, activeSetIndex)} disabled={isSaving || isStarting}>{legacyReopenSetLabel}</Button>
                    ) : null}
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-semibold">{tr("details.advancedDetails")}</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="active-set-rpe">{tr("set.rpe")}</Label>
                      <Input id="active-set-rpe" dir="ltr" type="text" inputMode="decimal" value={activeSet.rpe} onChange={(event) => updateSet(activeExerciseIndex, activeSetIndex, { rpe: event.target.value })} aria-invalid={Boolean(activeRpeValidation.error)} aria-describedby={rpeErrorId} disabled={isSaving || isStarting} />
                      {activeRpeValidation.error ? <p id="active-set-rpe-error" role="alert" className="text-xs text-destructive">{tr("set.rpeInvalid")}</p> : null}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="active-set-rir">{tr("set.rir")}</Label>
                      <Input id="active-set-rir" dir="ltr" type="text" inputMode="decimal" value={activeSet.rir} onChange={(event) => updateSet(activeExerciseIndex, activeSetIndex, { rir: event.target.value })} aria-invalid={Boolean(activeRirValidation.error)} aria-describedby={rirErrorId} disabled={isSaving || isStarting} />
                      {activeRirValidation.error ? <p id="active-set-rir-error" role="alert" className="text-xs text-destructive">{tr("set.rirInvalid")}</p> : null}
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="active-set-type">{tr("set.type")}</Label>
                      <select id="active-set-type" value={activeSet.setType} onChange={(event) => updateSet(activeExerciseIndex, activeSetIndex, { setType: event.target.value as SetState["setType"] })} className="flex h-12 w-full rounded-[14px] border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" disabled={isSaving || isStarting}>
                        <option value="normal">{tr("set.normal")}</option>
                        <option value="warmup">{tr("set.warmup")}</option>
                        <option value="working">{tr("set.working")}</option>
                        <option value="failure">{tr("set.failure")}</option>
                        <option value="drop">{tr("set.drop")}</option>
                        <option value="backoff">{tr("set.backoff")}</option>
                        <option value="amrap">{tr("set.amrap")}</option>
                        <option value="timed">{tr("set.timed")}</option>
                        <option value="other">{tr("set.other")}</option>
                      </select>
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="active-set-note">{tr("set.note")}</Label>
                        <span id="active-set-note-limit" dir="ltr" className="text-[10px] tabular-nums text-muted-foreground">{formatters.ratio(workoutSetNoteCodePointLength(activeSet.notes), WORKOUT_SET_NOTE_MAX_CODE_POINTS)}</span>
                      </div>
                      <textarea id="active-set-note" aria-describedby="active-set-note-limit" dir="auto" className="min-h-24 w-full resize-y rounded-[14px] border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" value={activeSet.notes} disabled={isSaving || isStarting} onChange={(event) => { if (canUpdateWorkoutSetNote(activeSet.notes, event.target.value)) updateSet(activeExerciseIndex, activeSetIndex, { notes: event.target.value }); }} placeholder={tr("common.optional")} />
                    </div>
                  </div>
                </section>

                {sourceKind === "plan-day" ? (
                  <section className="border-t border-border/70 pt-4">
                    <h3 className="text-sm font-semibold">{tr("actions.replaceToday")}</h3>
                    {activeAlternatives.length ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {tr("actions.savedAlternatives", {
                          names: activeAlternatives
                            .map((alternative) => isolateBidiText(alternative.alternative_exercise_name))
                            .join(", ")
                        })}
                      </p>
                    ) : null}
                    <select value={replacementReason} onChange={(event) => setReplacementReason(event.target.value as ExerciseAlternativeReason)} className="mt-3 h-12 w-full rounded-[14px] border border-input bg-card px-3 text-sm">
                      <option value="machine_taken">{tr("actions.machineOccupied")}</option>
                      <option value="no_equipment">{tr("actions.equipmentUnavailable")}</option>
                      <option value="pain_or_discomfort">{tr("actions.painDiscomfort")}</option>
                      <option value="too_hard">{tr("actions.tooHardToday")}</option>
                      <option value="other">{tr("actions.other")}</option>
                    </select>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" onClick={() => { setActionsOpen(false); setReplacementPickerOpen(true); }} disabled={isSavingAlternative}>{tr("actions.useToday")}</Button>
                      <Button type="button" variant="outline" onClick={() => { void skipCurrentExercise(); }} disabled={isSaving || isStarting}>{tr("actions.skipExerciseToday")}</Button>
                      <AiActionRequestDialog actions={[{ type: "replace_exercise", label: tr("chatGPT.ask"), description: tr("chatGPT.replaceDescription") }]} sourceType="plan_exercise" sourceId={activeExercise.exercise.id} context={{ ...workoutContext, replacement_reason: replacementReason, exercise_alternatives: activeAlternatives }} />
                    </div>
                  </section>
                ) : null}

                <section className="border-t border-border/70 pt-4">
                  <h3 className="text-sm font-semibold">{tr("actions.timerControls")}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{tr("actions.timerControlsDescription")}</p>
                  <Button type="button" variant="outline" className="mt-3" onClick={resetWorkoutTimer} disabled={isSaving || isStarting}>
                    {tr("common.reset")}
                  </Button>
                </section>

                <section className="border-t border-border/70 pt-4">
                  <WorkoutAiActionPanel compact sourceType="workout_session" sourceId={session?.id ?? day.id} context={workoutContext} />
                </section>
              </div>
            </DialogContent>
          </Dialog>

          {sourceKind === "plan-day" ? (
            <ExercisePickerDialog
              open={replacementPickerOpen}
              onOpenChange={setReplacementPickerOpen}
              dayName={day.day_name}
              existingKeys={[]}
              maxSelection={1}
              onAdd={(replacements) => {
                const replacement = replacements[0];
                if (replacement) void applyStableReplacement(replacement);
              }}
            />
          ) : null}

          <Dialog open={finishOpen} onOpenChange={handleSessionReviewOpenChange}>
            <DialogContent layout="responsive-drawer" closeLabel={tr("common.close")} className="p-5 lg:max-w-lg lg:rounded-[28px]">
              <DialogHeader>
                <DialogTitle>{tr("review.finishQuestion")}</DialogTitle>
                <DialogDescription>{tr("review.finishDescription")}</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <InfoStat label={tr("review.minutes")} value={formatters.measurement(durationMinutes, "minutes", 0)} />
                <InfoStat label={tr("set.labelPlural")} value={formatters.ratio(completedSets, totalSets)} valueDirection="ltr" />
                <InfoStat label={tr("review.volume")} value={formatters.measurement(totalVolume, "kg")} />
                <InfoStat label={tr("review.personalRecords")} value={formatters.integer(previewPrs.length)} />
              </div>
              <div className="mt-4 space-y-2">
                <Label htmlFor="finish-notes">{tr("details.workoutNotes")}</Label>
                <textarea id="finish-notes" dir="auto" className="min-h-24 w-full resize-y rounded-[16px] border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" value={sessionNotes} onChange={(event) => setSessionNotes(event.target.value)} placeholder={tr("review.optionalNote")} disabled={isSaving || isStarting} />
              </div>
              <Button className="mt-4 min-h-[52px] w-full" onClick={completeSession} disabled={isSaving || isStarting || !session}>
                <Save className="h-4 w-4" /> {tr("review.saveAndFinish")}
              </Button>
              <Button className="mt-2 min-h-[52px] w-full" variant="outline" onClick={() => handleSessionReviewOpenChange(false)} disabled={isSaving || isStarting}>{tr("review.continueWorkout")}</Button>
            </DialogContent>
          </Dialog>
        </>
      )}
    />
  );

}

function InfoStat({ label, value, valueDirection = "auto" }: { label: string; value: string; valueDirection?: "auto" | "ltr" }) {
  return (
    <div className="rounded-[16px] border border-border/60 bg-muted/30 p-3 text-center">
      <p dir={valueDirection} className="text-lg font-bold tracking-[-0.03em] tabular-nums">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function WorkoutSummaryCard({ summary, dayName }: { summary: WorkoutSummary; dayName: string }) {
  const { t: tr, formatters } = useActiveWorkoutTranslation();
  return (
    <MotionCard>
      <Card className="rounded-[28px] border-success/20 bg-success/[0.04]">
        <CardContent className="space-y-5 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15">
              <Dumbbell className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-base font-semibold">{tr("completion.dayComplete", { day: isolateBidiText(dayName) })}</p>
              <p className="text-sm text-muted-foreground">{tr("completion.savedHistory")}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <InfoStat label={tr("review.minutes")} value={formatters.measurement(summary.durationMinutes, "minutes", 0)} />
            <InfoStat label={tr("review.volume")} value={formatters.measurement(summary.totalVolume, "kg")} />
            <InfoStat label={tr("set.labelPlural")} value={formatters.integer(summary.completedSets)} />
            <InfoStat label={tr("navigation.exercises")} value={formatters.integer(summary.completedExercises)} />
          </div>
          {summary.prs.length ? (
            <div className="rounded-[16px] border border-primary/20 bg-primary/[0.04] p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-primary"><Trophy className="h-4 w-4" /> {tr("completion.newPrs", { count: summary.prs.length })}</p>
              <ul className="mt-2 space-y-1">{summary.prs.slice(0, 4).map((pr) => <li key={pr} className="text-sm text-muted-foreground">- {pr}</li>)}</ul>
            </div>
          ) : null}
          <Button asChild className="min-h-12 w-full rounded-[18px]"><Link href="/my-workout/plans">{tr("completion.backToWorkouts")}</Link></Button>
        </CardContent>
      </Card>
    </MotionCard>
  );
}
