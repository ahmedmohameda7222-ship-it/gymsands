"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Dumbbell,
  ExternalLink,
  FastForward,
  MoreHorizontal,
  RefreshCcw,
  RotateCcw,
  Save,
  Sparkles,
  Target,
  TimerReset,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { MobileStickyActions, MobileStickyActionsSpacer } from "@/components/layout/mobile-sticky-actions";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { InlineFeedback, MotionCard } from "@/components/motion";
import { useSuccessFeedback } from "@/components/feedback/success-feedback";
import { clearStoredValue, readStoredTimestamp, storeTimestamp, workoutStorageKey } from "@/lib/workout-persistence";
import { clearActiveWorkoutState, writeActiveWorkoutState } from "@/lib/active-workout";
import { userSafeError } from "@/lib/error-formatting";
import {
  completeWorkoutSession,
  getOrStartWorkoutDaySession,
  getWorkoutHistoryDetailed,
  getWorkoutSessionLogs,
  replaceWorkoutSessionExercise,
  saveWorkoutSetLogs,
  updateWorkoutSessionDuration
} from "@/services/database/workout-sessions";
import { createExerciseAlternative, getExerciseAlternatives, getProgressionTargets } from "@/services/database/execution-layer";
import type { ExerciseLog, UserWorkoutPlanExercise, Workout, WorkoutPlanDaySession, WorkoutSession, WorkoutSessionSummary } from "@/types";
import type { ExerciseAlternativeReason, UserExerciseAlternative, UserProgressionTarget } from "@/types";
import { AiActionRequestDialog } from "@/components/ai/ai-action-request-dialog";
import { WorkoutAiActionPanel } from "@/components/ai/workout-ai-action-panel";
import { OpenAiBlossom } from "@/components/brand/openai-blossom";
import { isolateBidiText, useActiveWorkoutTranslation, type ActiveWorkoutFormatters, type ActiveWorkoutTranslator } from "@/lib/i18n/active-workout";
import { translateTrain } from "@/lib/i18n/train";
import { ExercisePickerDialog } from "@/components/workouts/exercise-picker-dialog";
import { SessionMuscleLoadPanel } from "@/components/workouts/session-muscle-load-panel";

type SetType = "normal" | "warmup" | "working" | "failure" | "drop";

type SetState = {
  setNumber: number;
  reps: string;
  weightKg: string;
  notes: string;
  rpe: string;
  rir: string;
  setType: SetType;
  completedAt: string | null;
};

type ExerciseState = {
  exercise: UserWorkoutPlanExercise;
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

function firstNumber(value: string | null | undefined) {
  const match = value?.match(/\d+/);
  return match?.[0] ?? "10";
}

const weekdayIndex: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
};

function localizedWeekday(value: string, formatters: ActiveWorkoutFormatters) {
  const index = weekdayIndex[value.trim().toLowerCase()];
  if (index === undefined) return value;
  return formatters.weekday(new Date(Date.UTC(2024, 0, 7 + index)));
}

function restPresetLabel(seconds: number, tr: ActiveWorkoutTranslator) {
  if (seconds === 30) return tr("rest.presetThirtySeconds");
  if (seconds === 60) return tr("rest.presetSixtySeconds");
  if (seconds === 90) return tr("rest.presetNinetySeconds");
  return tr("rest.presetThreeMinutes");
}

function restDeadline(seconds: number) {
  return Date.now() + seconds * 1000;
}

function plannedSetCount(exercise: UserWorkoutPlanExercise) {
  return Math.max(1, exercise.sets ?? 3);
}

function makeExerciseState(exercise: UserWorkoutPlanExercise): ExerciseState {
  const count = plannedSetCount(exercise);
  return {
    exercise,
    sets: Array.from({ length: count }, (_, index) => ({
      setNumber: index + 1,
      reps: firstNumber(exercise.reps),
      weightKg: "",
      notes: "",
      rpe: "",
      rir: "",
      setType: index === 0 && count > 2 ? "warmup" : "working",
      completedAt: null
    }))
  };
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
  if (clean === "failure") return "failure";
  if (clean === "normal") return "normal";
  return "working";
}

function parseSetNote(raw: string | null | undefined): Pick<SetState, "notes" | "rpe" | "rir" | "setType"> {
  const segments = (raw ?? "").split("|").map((item) => item.trim()).filter(Boolean);
  let rpe = "";
  let rir = "";
  let setType: SetType = "working";
  const notes: string[] = [];

  segments.forEach((segment) => {
    const lower = segment.toLowerCase();
    if (lower.startsWith("rpe:")) rpe = segment.slice(4).trim();
    else if (lower.startsWith("rir:")) rir = segment.slice(4).trim();
    else if (lower.startsWith("type:")) setType = normalizeSetType(segment.slice(5));
    else notes.push(segment);
  });

  return { notes: notes.join(" | "), rpe, rir, setType };
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
      const parsed = parseSetNote(log.notes);
      return {
        ...set,
        reps: log.reps === null || log.reps === undefined ? set.reps : String(log.reps),
        weightKg: log.weight_kg === null || log.weight_kg === undefined ? "" : String(log.weight_kg),
        notes: parsed.notes,
        rpe: parsed.rpe,
        rir: parsed.rir,
        setType: parsed.setType,
        completedAt: log.completed_at ?? log.created_at ?? new Date().toISOString()
      };
    })
  }));
}

function supersetLabel(exercise: UserWorkoutPlanExercise) {
  const nameMatch = exercise.exercise_name.match(/^\s*([A-Z]\d)\s*[:.)-]\s*/);
  if (nameMatch?.[1]) return nameMatch[1].toUpperCase();
  const notesMatch = exercise.notes?.match(/(?:superset|group)\s*[:=]\s*([A-Z]\d)|\[([A-Z]\d)\]/i);
  return (notesMatch?.[1] ?? notesMatch?.[2] ?? "").toUpperCase() || null;
}

function setNote(set: SetState) {
  const metadata = [
    set.setType !== "working" ? `type:${set.setType}` : null,
    set.rpe ? `RPE:${set.rpe}` : null,
    set.rir ? `RIR:${set.rir}` : null
  ].filter(Boolean);
  return [set.notes, ...metadata].filter(Boolean).join(" | ") || null;
}

function buildSessionSets(states: ExerciseState[]): SessionSetSummary[] {
  return states.flatMap((item) => item.sets
    .filter((set) => set.completedAt)
    .map((set) => ({
      exerciseName: item.exercise.exercise_name,
      reps: toNumberOrNull(set.reps) ?? 0,
      weightKg: toNumberOrNull(set.weightKg) ?? 0,
      setType: set.setType,
      plannedReps: item.exercise.reps,
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

export function WorkoutDayFocusSession({ day }: { day: WorkoutPlanDaySession }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t: tr, locale: language, direction: dir, formatters } = useActiveWorkoutTranslation();
  const legacyReopenSetLabel = translateTrain(language, "reopenSet");
  const legacySetReopened = translateTrain(language, "setReopened");
  const legacySetReopenFailed = translateTrain(language, "setReopenFailed");
  const { celebrate } = useSuccessFeedback();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [startedAtMs, setStartedAtMs] = useState(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [sessionNotes, setSessionNotes] = useState("");
  const [exerciseStates, setExerciseStates] = useState<ExerciseState[]>(() => day.exercises.map(makeExerciseState));
  const [activeExerciseIndex, setActiveExerciseIndex] = useState(0);
  const [activeSetIndex, setActiveSetIndex] = useState(0);
  const [timerSeconds, setTimerSeconds] = useState(day.exercises[0]?.rest_seconds ?? 75);
  const [timerLeft, setTimerLeft] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isStarting, setIsStarting] = useState(true);
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
  const [muscleLoadRevision, setMuscleLoadRevision] = useState(0);
  const workoutTimerKey = useMemo(() => workoutStorageKey(["workout-day-session", user?.id ?? "anonymous", day.id]), [day.id, user?.id]);
  const restTimerKey = useMemo(() => workoutStorageKey(["workout-day-rest-timer", user?.id ?? "anonymous", day.id]), [day.id, user?.id]);
  const [timerEndsAtMs, setTimerEndsAtMs] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    if (!user?.id) {
      setIsStarting(false);
      toast({ title: tr("header.signInRequired"), description: tr("header.signInBeforeSaving") });
      return () => {
        active = false;
      };
    }

    getOrStartWorkoutDaySession(user.id, day)
      .then(async (nextSession) => {
        if (!active) return;
        setSession(nextSession);
        const parsedStartedAt = Date.parse(nextSession.started_at);
        const storedStartedAt = readStoredTimestamp(workoutTimerKey);
        const nextStartedAt = storedStartedAt ?? (Number.isFinite(parsedStartedAt) ? parsedStartedAt : Date.now());
        setStartedAtMs(nextStartedAt);
        storeTimestamp(workoutTimerKey, nextStartedAt);
        writeActiveWorkoutState(user.id, {
          sessionId: nextSession.id,
          route: `/workouts/session/day/${day.id}`,
          label: day.day_name,
          startedAtMs: nextStartedAt,
          elapsedSeconds: Math.max(0, Number(nextSession.duration_minutes ?? 0) * 60),
          paused: false
        });
        setSessionNotes(nextSession.notes ?? "");
        const exerciseIds = day.exercises.map((exercise) => exercise.id);
        const [existingLogs, workoutHistory, targets, savedAlternatives] = await Promise.all([
          getWorkoutSessionLogs(nextSession.id),
          getWorkoutHistoryDetailed(user.id, 100),
          getProgressionTargets(user.id, exerciseIds).catch(() => []),
          getExerciseAlternatives(user.id).catch(() => [])
        ]);
        if (active) {
          setExerciseStates((current) => hydrateStates(current, existingLogs));
          setHistory(workoutHistory.filter((item) => item.id !== nextSession.id));
          setProgressionTargets(targets);
          setAlternatives(savedAlternatives.filter((item) => exerciseIds.includes(item.plan_exercise_id)));
        }
      })
      .catch((error) => {
      toast({ title: tr("header.loadFailedTitle"), description: userSafeError(error, tr("header.loadFailedDescription")) });
      })
      .finally(() => {
        if (active) setIsStarting(false);
      });

    return () => {
      active = false;
    };
  }, [day, toast, tr, user?.id, workoutTimerKey]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [startedAtMs]);

  useEffect(() => {
    if (!session) return;
    const interval = window.setInterval(() => {
      const durationMinutes = Math.max(1, Math.ceil((Date.now() - startedAtMs) / 60000));
      updateWorkoutSessionDuration(session.id, durationMinutes).catch(() => undefined);
    }, 20000);
    return () => window.clearInterval(interval);
  }, [session, startedAtMs]);

  useEffect(() => {
    const storedRestDeadline = readStoredTimestamp(restTimerKey);
    if (!storedRestDeadline || storedRestDeadline <= Date.now()) return;
    setTimerEndsAtMs(storedRestDeadline);
    setTimerLeft(Math.max(0, Math.ceil((storedRestDeadline - Date.now()) / 1000)));
    setIsTimerRunning(true);
  }, [restTimerKey]);

  useEffect(() => {
    if (!timerEndsAtMs) return;
    const tick = () => {
      const nextLeft = Math.max(0, Math.ceil((timerEndsAtMs - Date.now()) / 1000));
      setTimerLeft(nextLeft);
      if (nextLeft <= 0) {
        setTimerEndsAtMs(null);
        setIsTimerRunning(false);
        clearStoredValue(restTimerKey);
        toast({ title: tr("notifications.restFinished"), description: tr("notifications.nextSetReady") });
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          new Notification(tr("notifications.restFinished"), { body: tr("notifications.nextSetReady") });
        }
      }
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [restTimerKey, timerEndsAtMs, toast, tr]);

  const activeExercise = exerciseStates[activeExerciseIndex];
  const activeSet = activeExercise?.sets[activeSetIndex];
  const totalSets = exerciseStates.reduce((sum, item) => sum + item.sets.length, 0);
  const completedSets = exerciseStates.reduce((sum, item) => sum + item.sets.filter((set) => set.completedAt).length, 0);
  const progress = totalSets ? Math.round((completedSets / totalSets) * 100) : 0;
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
  const setTypeLabels: Record<SetType, string> = {
    normal: tr("set.normal"),
    warmup: tr("set.warmup"),
    working: tr("set.working"),
    failure: tr("set.failure"),
    drop: tr("set.drop")
  };
  const workoutContext = {
    plan: day.plan,
    workout_day: { id: day.id, name: day.day_name, weekday: day.weekday, notes: day.notes },
    planned_exercises: day.exercises,
    active_exercise: activeExercise?.exercise ?? null,
    logged_sets: buildLogRows(),
    session: session ? { id: session.id, duration_minutes: durationMinutes, notes: sessionNotes } : null,
    previous_performance: activePreviousPerformance,
    possible_prs: previewPrs,
    skipped_exercises: exerciseStates.filter((item) => !item.sets.some((set) => set.completedAt)).map((item) => item.exercise.exercise_name),
    saved_progression_target: activeProgressionTarget
  };

  function buildLogRows(states = exerciseStates) {
    return states.flatMap((item, exerciseIndex) =>
      item.sets
        .filter((set) => set.completedAt)
        .map((set) => ({
          planExerciseId: item.exercise.id,
          exerciseOrder: exerciseIndex + 1,
          exerciseName: item.exercise.exercise_name,
          exerciseCategory: item.exercise.category || item.exercise.target_muscle || item.exercise.equipment || "Workout",
          plannedSets: item.exercise.sets ?? item.sets.length,
          plannedReps: item.exercise.reps,
          plannedRestSeconds: item.exercise.rest_seconds,
          setNumber: set.setNumber,
          reps: toNumberOrNull(set.reps),
          weightKg: toNumberOrNull(set.weightKg),
          notes: setNote(set),
          completedAt: set.completedAt
        }))
    );
  }

  function updateSet(exerciseIndex: number, setIndex: number, patch: Partial<SetState>) {
    setExerciseStates((current) =>
      current.map((item, itemIndex) =>
        itemIndex === exerciseIndex
          ? { ...item, sets: item.sets.map((set, currentSetIndex) => (currentSetIndex === setIndex ? { ...set, ...patch } : set)) }
          : item
      )
    );
  }

  function statesWithSetPatch(exerciseIndex: number, setIndex: number, patch: Partial<SetState>) {
    return exerciseStates.map((item, itemIndex) =>
      itemIndex === exerciseIndex
        ? { ...item, sets: item.sets.map((set, currentSetIndex) => (currentSetIndex === setIndex ? { ...set, ...patch } : set)) }
        : item
    );
  }

  function moveToNextSet(states = exerciseStates, fromExerciseIndex = activeExerciseIndex, fromSetIndex = activeSetIndex) {
    const currentExercise = states[fromExerciseIndex];
    if (!currentExercise) return;
    if (fromSetIndex + 1 < currentExercise.sets.length) {
      setActiveExerciseIndex(fromExerciseIndex);
      setActiveSetIndex(fromSetIndex + 1);
      return;
    }
    if (fromExerciseIndex + 1 < states.length) {
      const next = states[fromExerciseIndex + 1];
      setActiveExerciseIndex(fromExerciseIndex + 1);
      setActiveSetIndex(0);
      setTimerSeconds(next.exercise.rest_seconds ?? 75);
    }
  }

  async function persistProgress(states = exerciseStates) {
    if (!session) return;
    await saveWorkoutSetLogs(session.id, buildLogRows(states));
    await updateWorkoutSessionDuration(session.id, Math.max(1, Math.ceil(elapsedSeconds / 60)));
  }

  function startRestTimer(seconds: number) {
    const safeSeconds = Math.max(0, seconds);
    if (!safeSeconds) return;
    const deadline = restDeadline(safeSeconds);
    setTimerSeconds(safeSeconds);
    setTimerLeft(safeSeconds);
    setTimerEndsAtMs(deadline);
    setIsTimerRunning(true);
    storeTimestamp(restTimerKey, deadline);
  }

  function stopRestTimer() {
    setTimerLeft(0);
    setTimerEndsAtMs(null);
    setIsTimerRunning(false);
    clearStoredValue(restTimerKey);
  }

  function restoreRestTimer(snapshot: { timerSeconds: number; timerLeft: number; timerEndsAtMs: number | null; isTimerRunning: boolean }) {
    setTimerSeconds(snapshot.timerSeconds);
    setTimerLeft(snapshot.timerLeft);
    setTimerEndsAtMs(snapshot.timerEndsAtMs);
    setIsTimerRunning(snapshot.isTimerRunning);
    if (snapshot.timerEndsAtMs) storeTimestamp(restTimerKey, snapshot.timerEndsAtMs);
    else clearStoredValue(restTimerKey);
  }

  async function finishSet(exerciseIndex: number, setIndex: number) {
    const targetSet = exerciseStates[exerciseIndex]?.sets[setIndex];
    if (!targetSet || targetSet.completedAt || isSaving) return;

    const previousStates = exerciseStates;
    const previousActiveExerciseIndex = activeExerciseIndex;
    const previousActiveSetIndex = activeSetIndex;
    const previousTimer = { timerSeconds, timerLeft, timerEndsAtMs, isTimerRunning };
    setIsSaving(true);
    const nextStates = statesWithSetPatch(exerciseIndex, setIndex, { completedAt: new Date().toISOString() });
    setExerciseStates(nextStates);
    const hasNextSet = completedSets + 1 < totalSets;
    if (hasNextSet) {
      startRestTimer(exerciseStates[exerciseIndex]?.exercise.rest_seconds ?? timerSeconds);
      moveToNextSet(nextStates, exerciseIndex, setIndex);
    }

    try {
      await persistProgress(nextStates);
      setMuscleLoadRevision((current) => current + 1);
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
      setExerciseStates(previousStates);
      setActiveExerciseIndex(previousActiveExerciseIndex);
      setActiveSetIndex(previousActiveSetIndex);
      restoreRestTimer(previousTimer);
      setSetFeedbackVariant("error");
      setSetFeedback(tr("offline.setSaveCombined"));
      toast({ title: tr("completion.saveFailedTitle"), description: userSafeError(error, tr("offline.keepOpenRetry")) });
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
      setMuscleLoadRevision((current) => current + 1);
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

  async function completeSession() {
    if (!session || isSaving) return;
    try {
      setIsSaving(true);
      const summary = buildSummary(exerciseStates, history, durationMinutes, sessionNotes, tr, formatters);
      await completeWorkoutSession(session.id, sessionNotes, durationMinutes, buildLogRows());
      if (user?.id) clearActiveWorkoutState(user.id);
      clearStoredValue(workoutTimerKey);
      clearStoredValue(restTimerKey);
      setFinishOpen(false);
      setCompletedSummary(summary);
      toast({ title: tr("completion.title"), description: tr("completion.savedNamedWorkout", { name: isolateBidiText(day.day_name) }) });
      celebrate(tr("completion.title"));
    } catch (error) {
      toast({ title: tr("completion.saveFailedTitle"), description: userSafeError(error) });
    } finally {
      setIsSaving(false);
    }
  }

  function resetWorkoutTimer() {
    const nextStartedAt = Date.now();
    setStartedAtMs(nextStartedAt);
    setElapsedSeconds(0);
    storeTimestamp(workoutTimerKey, nextStartedAt);
    if (session) updateWorkoutSessionDuration(session.id, 1).catch(() => undefined);
  }

  async function applyStableReplacement(replacement: Workout) {
    if (!user?.id || !session || !activeExercise) return;
    const originalName = activeExercise.exercise.exercise_name;
    setIsSavingAlternative(true);
    try {
      await replaceWorkoutSessionExercise(user.id, session.id, activeExercise.exercise.id, replacement);
      setMuscleLoadRevision((current) => current + 1);
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

  return (
    <div className="space-y-4 pb-28 lg:pb-4" dir={dir}>
      {completedSummary ? <WorkoutSummaryCard summary={completedSummary} dayName={day.day_name} /> : null}

      {isStarting ? (
        <div className="rounded-[18px] border border-primary/20 bg-primary/5 p-3 text-sm text-primary" role="status">
          <span className="inline-flex items-center gap-2">
            <RefreshCcw className="h-4 w-4 motion-safe:animate-spin" />
            {tr("header.loadingSession")}
          </span>
        </div>
      ) : null}

      <div className="sticky top-0 z-30 -mx-4 border-b border-border/60 bg-background/95 px-4 py-3 pr-16 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:static lg:mx-0 lg:rounded-[28px] lg:border lg:bg-card/70 lg:px-5 lg:py-4 lg:pr-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold leading-tight"><bdi>{day.day_name}</bdi></h1>
              <p className="text-xs text-muted-foreground">{day.weekday ? localizedWeekday(day.weekday, formatters) : tr("header.workoutDay")} · {tr("navigation.exercisesCount", { count: exerciseStates.length })}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isTimerRunning ? (
              <div dir="ltr" className="rounded-full bg-primary/10 px-3 py-1.5 text-sm font-semibold tabular-nums text-primary">
                {formatters.timer(timerLeft)}
              </div>
            ) : null}
            <div className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-sm">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span dir="ltr" className="font-medium tabular-nums">{formatters.timer(elapsedSeconds)}</span>
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span><span dir="ltr" className="tabular-nums">{formatters.ratio(completedSets, totalSets)}</span> {tr("set.labelPlural")}</span>
          <span dir="ltr" className="tabular-nums">{formatters.integer(progress)}%</span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary motion-safe:transition-all motion-safe:duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
        {exerciseStates.map((item, index) => {
          const done = item.sets.filter((set) => set.completedAt).length;
          const allDone = done === item.sets.length;
          const active = index === activeExerciseIndex;
          return (
            <button
              key={item.exercise.id}
              type="button"
              onClick={() => {
                setActiveExerciseIndex(index);
                const firstOpen = item.sets.findIndex((set) => !set.completedAt);
                setActiveSetIndex(firstOpen >= 0 ? firstOpen : item.sets.length - 1);
                setTimerSeconds(item.exercise.rest_seconds ?? 75);
              }}
              className={`flex min-h-12 shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-left transition-colors ${
                active
                  ? "border-primary/50 bg-primary/10 text-foreground"
                  : allDone
                    ? "border-success/30 bg-success/5 text-success"
                    : "border-border bg-card/70 text-muted-foreground hover:border-primary/40"
              }`}
            >
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${allDone ? "bg-success text-success-foreground" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {allDone ? <Check className="h-3 w-3" /> : <span dir="ltr" className="tabular-nums">{formatters.integer(index + 1)}</span>}
              </span>
              <span className="max-w-[140px] truncate text-xs font-medium"><bdi>{item.exercise.exercise_name}</bdi></span>
              <span dir="ltr" className="text-[10px] tabular-nums text-muted-foreground">{formatters.ratio(done, item.sets.length)}</span>
            </button>
          );
        })}
      </div>

      {session ? <SessionMuscleLoadPanel sessionId={session.id} refreshRevision={muscleLoadRevision} /> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <MotionCard className="overflow-hidden rounded-[28px] border border-primary/15 bg-card/90 shadow-sm">
            <div className="p-5 sm:p-6">
              <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
                <Target className="h-4 w-4" /> {tr("exercise.focusSet")}
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-2xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-3xl"><bdi>{activeExercise.exercise.exercise_name}</bdi></h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="outline" className="rounded-full font-normal">{tr("exercise.setsCount", { count: activeExercise.exercise.sets ?? activeExercise.sets.length })}</Badge>
                    <Badge variant="outline" className="rounded-full font-normal">{tr("exercise.repsDisplay", { reps: formatPlannedReps(activeExercise.exercise.reps, formatters, tr("common.customValue")) })}</Badge>
                    <Badge variant="outline" className="rounded-full font-normal">{tr("exercise.restSeconds", { count: formatters.integer(activeExercise.exercise.rest_seconds ?? timerSeconds) })}</Badge>
                    {supersetLabel(activeExercise.exercise) ? <Badge className="rounded-full text-[10px]">{tr("superset.label", { label: supersetLabel(activeExercise.exercise) ?? "" })}</Badge> : null}
                  </div>
                </div>
                <Button type="button" variant="outline" size="icon" className="h-12 w-12 shrink-0 rounded-[16px]" aria-label={tr("accessibility.openSessionMenu")} onClick={() => setActionsOpen(true)}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <div className="rounded-[18px] border border-border/60 bg-background/40 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{tr("exercise.bestSet")}</p>
                  <p className="mt-1 text-sm font-semibold">{activePreviousPerformance?.lastBestSet ?? tr("common.noData")}</p>
                </div>
                <div className="rounded-[18px] border border-border/60 bg-background/40 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{tr("exercise.todayTarget")}</p>
                  <p className="mt-1 text-sm font-semibold">{activeProgressionTarget ? `${activeProgressionTarget.next_target_weight_kg === null ? tr("common.customValue") : formatters.measurement(activeProgressionTarget.next_target_weight_kg, "kg")} × ${activeProgressionTarget.next_target_reps === null ? tr("common.customValue") : formatters.integer(Number(activeProgressionTarget.next_target_reps))}` : tr("exercise.matchOrBeat")}</p>
                </div>
              </div>
            </div>
          </MotionCard>

          {!activeExerciseCompleted ? (
            <MotionCard className="rounded-[28px] border border-border/70 bg-card p-5 shadow-sm sm:p-6">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">{tr("set.label", { count: formatters.integer(activeSet.setNumber) })}</h3>
                  <p className="text-sm text-muted-foreground">{setTypeLabels[activeSet.setType]}</p>
                </div>
                <Badge variant="outline" className="rounded-full">{tr("set.setsLeft", { count: Math.max(0, activeExercise.sets.length - activeSetIndex - 1) })}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">{tr("set.reps")}</Label>
                  <Input
                    className="h-16 rounded-[18px] text-center text-2xl font-bold tabular-nums sm:h-20 sm:text-3xl" dir="ltr"
                    value={activeSet.reps}
                    onChange={(event) => updateSet(activeExerciseIndex, activeSetIndex, { reps: event.target.value })}
                    inputMode="numeric"
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">{tr("set.weightKg")}</Label>
                  <Input
                    className="h-16 rounded-[18px] text-center text-2xl font-bold tabular-nums sm:h-20 sm:text-3xl" dir="ltr"
                    value={activeSet.weightKg}
                    onChange={(event) => updateSet(activeExerciseIndex, activeSetIndex, { weightKg: event.target.value })}
                    inputMode="decimal"
                    placeholder="0"
                  />
                </div>
              </div>

              <Button className="mt-4 min-h-[56px] w-full rounded-[18px] text-base font-semibold" onClick={() => finishSet(activeExerciseIndex, activeSetIndex)} disabled={Boolean(activeSet.completedAt) || isSaving || isStarting}>
                <CheckCircle2 className="mr-2 h-5 w-5" />
                {isStarting ? tr("common.loading") : isSaving ? tr("common.saving") : tr("set.finishNumbered", { count: formatters.integer(activeSet.setNumber) })}
              </Button>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" className="min-h-12 rounded-[16px]" onClick={() => setActionsOpen(true)}>
                  <MoreHorizontal className="mr-2 h-4 w-4" /> {tr("common.more")}
                </Button>
                <Button type="button" variant="outline" className="min-h-12 rounded-[16px]" onClick={() => setFinishOpen(true)}>
                  <Save className="mr-2 h-4 w-4" /> {tr("common.finish")}
                </Button>
              </div>
            </MotionCard>
          ) : (
            <MotionCard className="rounded-[28px] border border-success/25 bg-success/5 p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15">
                <CheckCircle2 className="h-6 w-6 text-success" />
              </div>
              <p className="mt-3 font-semibold text-success">{tr("exercise.complete")}</p>
              <p className="mt-1 text-sm text-muted-foreground"><bdi>{activeExercise.exercise.exercise_name}</bdi> · {tr("set.setsLogged", { count: activeExercise.sets.length })}</p>
              {nextExercise ? (
                <Button className="mt-4 min-h-12 rounded-[18px]" onClick={() => { setActiveExerciseIndex(activeExerciseIndex + 1); setActiveSetIndex(0); setTimerSeconds(nextExercise.exercise.rest_seconds ?? 75); }}>
                  {tr("exercise.nextExercise", { name: isolateBidiText(nextExercise.exercise.exercise_name) })}
                </Button>
              ) : (
                <Button className="mt-4 min-h-[52px] rounded-[18px]" onClick={() => setFinishOpen(true)}><Save className="me-2 h-4 w-4" /> {tr("common.finish")}</Button>
              )}
            </MotionCard>
          )}

          <Card className="rounded-[24px] border-border/70 bg-card/80">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold"><bdi>{activeExercise.exercise.exercise_name}</bdi></p>
                  <p className="text-xs text-muted-foreground">{tr("set.path")}</p>
                </div>
                <p dir="ltr" className="text-xs tabular-nums text-muted-foreground">{formatters.ratio(activeExercise.sets.filter((set) => set.completedAt).length, activeExercise.sets.length)}</p>
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${activeExercise.sets.length}, minmax(0, 1fr))` }}>
                {activeExercise.sets.map((set, setIndex) => {
                  const isActive = setIndex === activeSetIndex;
                  const isCompleted = Boolean(set.completedAt);
                  return (
                    <button
                      key={set.setNumber}
                      type="button"
                      onClick={() => setActiveSetIndex(setIndex)}
                      className={`flex h-12 items-center justify-center rounded-[14px] border text-sm font-bold transition-colors ${isCompleted ? "border-success/30 bg-success/10 text-success" : isActive ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-muted/40 text-muted-foreground"}`}
                      aria-label={isCompleted ? tr("accessibility.completedSet", { number: formatters.integer(set.setNumber) }) : isActive ? tr("accessibility.currentSet", { number: formatters.integer(set.setNumber) }) : tr("accessibility.plannedSet", { number: formatters.integer(set.setNumber) })}
                    >
                      {isCompleted ? <Check className="h-4 w-4" /> : <span dir="ltr" className="tabular-nums">{formatters.integer(set.setNumber)}</span>}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {nextExercise ? (
            <Card className="rounded-[24px] border-border/70 bg-card/70">
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-xs text-muted-foreground">{tr("exercise.nextWorkout")}</p>
                  <p className="text-sm font-semibold"><bdi>{nextExercise.exercise.exercise_name}</bdi></p>
                </div>
                <Badge variant="outline" className="rounded-full"><span dir="ltr" className="tabular-nums">{formatters.integer(nextExercise.exercise.sets ?? nextExercise.sets.length)} × {formatPlannedReps(nextExercise.exercise.reps, formatters, tr("common.customValue"))}</span></Badge>
              </CardContent>
            </Card>
          ) : null}

          <InlineFeedback message={setFeedback} variant={setFeedbackVariant} onClose={() => setSetFeedback("")} />
          <InlineFeedback message={prFeedback} onClose={() => setPrFeedback("")} />
        </div>

        <div className="hidden space-y-4 lg:block">
          <Card className="rounded-[24px] border-border/70 bg-card/80">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-semibold"><TimerReset className="h-4 w-4" /> {tr("rest.resting")}</p>
                <p className="text-xl font-bold tabular-nums text-primary">{formatters.timer(timerLeft)}</p>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[30, 60, 90, 180].map((seconds) => <Button key={seconds} variant="outline" className="min-h-12" onClick={() => startRestTimer(seconds)}>{restPresetLabel(seconds, tr)}</Button>)}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="min-h-12 flex-1" onClick={() => startRestTimer(timerSeconds)}>{tr("rest.start")}</Button>
                <Button variant="outline" className="min-h-12 flex-1" onClick={stopRestTimer}>{tr("common.finish")}</Button>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-[24px] border-border/70 bg-card/80">
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-semibold">{tr("actions.sessionDetails")}</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <InfoStat label={tr("review.volume")} value={formatters.measurement(totalVolume, "kg")} />
                <InfoStat label={tr("set.labelPlural")} value={formatters.ratio(completedSets, totalSets)} valueDirection="ltr" />
                <InfoStat label={tr("navigation.exercisesCount", { count: exerciseStates.filter((item) => item.sets.some((set) => set.completedAt)).length })} value={formatters.ratio(exerciseStates.filter((item) => item.sets.some((set) => set.completedAt)).length, exerciseStates.length)} valueDirection="ltr" />
                <InfoStat label={tr("review.personalRecords")} value={formatters.integer(previewPrs.length)} />
              </div>
              <Button className="min-h-12 w-full rounded-[18px]" onClick={() => setFinishOpen(true)} disabled={!session || isSaving}>
                <Save className="mr-2 h-4 w-4" /> {isFinished ? tr("common.finish") : tr("review.partialFinish")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={actionsOpen} onOpenChange={setActionsOpen}>
          <DialogContent layout="responsive-drawer" className="max-h-[88dvh] overflow-y-auto p-5 lg:inset-y-6 lg:left-auto lg:right-6 lg:h-auto lg:w-[420px] lg:max-w-[420px] lg:translate-x-0 lg:translate-y-0 lg:rounded-[28px] lg:border">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">{tr("chatGPT.actionsTitle")}</p>
                <p className="text-sm text-muted-foreground">{tr("chatGPT.actionsDescription")}</p>
              </div>
            </div>

            <div className="space-y-3">
              <ActionBlock icon={<ExternalLink className="h-4 w-4" />} title={tr("details.exerciseGuideVideo")} description={<bdi dir="auto">{currentInstructions}</bdi>}>
                <div className="mt-3 flex flex-wrap gap-2">
                  {currentGuideUrl ? <Button asChild variant="outline" className="min-h-12"><a href={currentGuideUrl} target="_blank" rel="noreferrer">{tr("details.openExerciseGuide")}</a></Button> : null}
                  {currentCustomVideoUrl ? <Button asChild variant="outline" className="min-h-12"><a href={currentCustomVideoUrl} target="_blank" rel="noreferrer">{tr("details.openCustomVideo")}</a></Button> : null}
                  {!currentGuideUrl && !currentCustomVideoUrl ? <p className="text-xs text-muted-foreground">{tr("details.noneSaved")}</p> : null}
                </div>
              </ActionBlock>

              <ActionBlock icon={<Sparkles className="h-4 w-4" />} title={tr("details.advancedDetails")} description={tr("details.workoutNotes")}>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1"><Label className="text-xs">RPE</Label><Input className="h-12 tabular-nums" dir="ltr" value={activeSet.rpe} onChange={(event) => updateSet(activeExerciseIndex, activeSetIndex, { rpe: event.target.value })} inputMode="decimal" placeholder="8" /></div>
                  <div className="space-y-1"><Label className="text-xs">RIR</Label><Input className="h-12 tabular-nums" dir="ltr" value={activeSet.rir} onChange={(event) => updateSet(activeExerciseIndex, activeSetIndex, { rir: event.target.value })} inputMode="numeric" placeholder="2" /></div>
                  <div className="space-y-1">
                    <Label className="text-xs">{tr("set.type")}</Label>
                    <select value={activeSet.setType} onChange={(event) => updateSet(activeExerciseIndex, activeSetIndex, { setType: event.target.value as SetState["setType"] })} className="flex h-12 w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <option value="normal">{tr("set.normal")}</option>
                      <option value="warmup">{tr("set.warmup")}</option>
                      <option value="working">{tr("set.working")}</option>
                      <option value="failure">{tr("set.failure")}</option>
                      <option value="drop">{tr("set.drop")}</option>
                    </select>
                  </div>
                  <div className="space-y-1 sm:col-span-3"><Label className="text-xs">{tr("set.note")}</Label><textarea dir="auto" className="min-h-20 w-full resize-y rounded-[14px] border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" value={activeSet.notes} onChange={(event) => updateSet(activeExerciseIndex, activeSetIndex, { notes: event.target.value })} placeholder={tr("common.optional")} /></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button className="min-h-12" variant="outline" onClick={() => applyPreviousSet(activeExerciseIndex, activeSetIndex)} disabled={Boolean(activeSet.completedAt)}>{tr("exercise.previousSet")}</Button>
                  <Button className="min-h-12" variant="outline" onClick={() => restartSet(activeExerciseIndex, activeSetIndex)} disabled={!activeSet.completedAt || isSaving}>{isSaving ? tr("common.saving") : legacyReopenSetLabel}</Button>
                </div>
              </ActionBlock>

              <ActionBlock icon={<RefreshCcw className="h-4 w-4" />} title={tr("actions.replaceToday")} description={tr("actions.replaceTodayDescription")}>
                <div className="mt-3 grid gap-3">
                  <select value={replacementReason} onChange={(event) => setReplacementReason(event.target.value as ExerciseAlternativeReason)} className="h-12 rounded-md border border-input bg-card px-3 text-sm">
                    <option value="machine_taken">{tr("actions.machineOccupied")}</option>
                    <option value="no_equipment">{tr("actions.equipmentUnavailable")}</option>
                    <option value="pain_or_discomfort">{tr("actions.painDiscomfort")}</option>
                    <option value="too_hard">{tr("actions.tooHardToday")}</option>
                    <option value="home_alternative">{tr("actions.homeAlternative")}</option>
                    <option value="same_muscle">{tr("actions.sameMuscle")}</option>
                    <option value="lower_back_friendly">{tr("actions.backFriendly")}</option>
                    <option value="knee_friendly">{tr("actions.kneeFriendly")}</option>
                    <option value="shoulder_friendly">{tr("actions.shoulderFriendly")}</option>
                    <option value="other">{tr("actions.other")}</option>
                  </select>
                </div>
                {activeAlternatives.length ? <div className="mt-3 rounded-[14px] bg-muted/40 p-3 text-xs text-muted-foreground">{tr("actions.savedAlternatives", { names: formatters.list(activeAlternatives.slice(0, 3).map((alternative) => isolateBidiText(alternative.alternative_exercise_name))) })}</div> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" className="min-h-12" onClick={() => { setActionsOpen(false); setReplacementPickerOpen(true); }} disabled={isSavingAlternative}>{isSavingAlternative ? tr("common.saving") : tr("actions.useToday")}</Button>
                  <AiActionRequestDialog actions={[{ type: "replace_exercise", label: tr("chatGPT.ask"), description: tr("chatGPT.replaceDescription") }]} sourceType="plan_exercise" sourceId={activeExercise.exercise.id} context={{ ...workoutContext, replacement_reason: replacementReason, exercise_alternatives: activeAlternatives }} />
                </div>
              </ActionBlock>

              <ActionBlock icon={<TimerReset className="h-4 w-4" />} title={tr("actions.timerControls")} description={tr("actions.timerControlsDescription")}>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {[30, 60, 90, 180].map((seconds) => <Button key={seconds} type="button" variant="outline" className="min-h-12" onClick={() => startRestTimer(seconds)}>{restPresetLabel(seconds, tr)}</Button>)}
                </div>
                <div className="mt-3 flex gap-2">
                  <Button type="button" variant="outline" className="min-h-12" onClick={stopRestTimer}>{tr("common.finish")}</Button>
                  <Button type="button" variant="outline" className="min-h-12" onClick={resetWorkoutTimer}>{tr("common.reset")}</Button>
                </div>
              </ActionBlock>

              <ActionBlock icon={<OpenAiBlossom className="h-4 w-4" />} title={tr("chatGPT.coach")} description={tr("chatGPT.coachDescription")}>
                <div className="mt-3">
                  <WorkoutAiActionPanel compact sourceType="workout_session" sourceId={session?.id ?? day.id} context={workoutContext} />
                </div>
              </ActionBlock>
            </div>
          </DialogContent>
      </Dialog>

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

      <Dialog open={finishOpen} onOpenChange={setFinishOpen}>
          <DialogContent layout="responsive-drawer" className="p-5 lg:max-w-lg lg:rounded-[28px]">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">{tr("review.finishQuestion")}</p>
                <p className="text-sm text-muted-foreground">{tr("review.finishDescription")}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <InfoStat label={tr("review.minutes")} value={formatters.measurement(durationMinutes, "minutes", 0)} />
              <InfoStat label={tr("set.labelPlural")} value={formatters.ratio(completedSets, totalSets)} valueDirection="ltr" />
              <InfoStat label={tr("review.volume")} value={formatters.measurement(totalVolume, "kg")} />
              <InfoStat label={tr("review.personalRecords")} value={formatters.integer(previewPrs.length)} />
            </div>
            {previewPrs.length ? <div className="mt-3 rounded-[16px] border border-primary/20 bg-primary/5 p-3 text-sm text-primary"><Trophy className="mr-1 inline h-4 w-4" /> {tr("review.possiblePrs", { count: previewPrs.length })}</div> : null}
            <div className="mt-4 space-y-2">
              <Label htmlFor="finish-notes">{tr("details.workoutNotes")}</Label>
              <textarea id="finish-notes" dir="auto" className="min-h-24 w-full resize-y rounded-[16px] border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" value={sessionNotes} onChange={(event) => setSessionNotes(event.target.value)} placeholder={tr("review.optionalNote")} />
            </div>
            <Button className="mt-4 min-h-[52px] w-full rounded-[18px]" onClick={completeSession} disabled={isSaving || !session}>
              <Save className="me-2 h-4 w-4" /> {isSaving ? tr("common.saving") : isFinished ? tr("common.save") : tr("common.save")}
            </Button>
            <Button className="mt-2 min-h-[52px] w-full rounded-[18px]" variant="outline" onClick={() => setFinishOpen(false)}>{tr("review.continueWorkout")}</Button>
          </DialogContent>
      </Dialog>

      <MobileStickyActions allowOnSession className="bottom-[env(safe-area-inset-bottom)] z-[60]">
        <div className="flex items-center gap-3">
          {isTimerRunning ? (
            <>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold text-foreground">{tr("rest.resting")} · <span dir="ltr" className="tabular-nums">{formatters.timer(timerLeft)}</span></p>
                <p className="truncate text-xs text-muted-foreground">{nextSetLabel}</p>
              </div>
              <Button variant="outline" className="min-h-[52px] px-4" onClick={() => startRestTimer(timerLeft + 30)}>{tr("rest.addThirtySeconds")}</Button>
              <Button className="min-h-[52px] flex-1 text-base" variant="secondary" onClick={stopRestTimer}>
                <FastForward className="mr-2 h-5 w-5" /> {tr("rest.skip")}
              </Button>
            </>
          ) : isFinished && !completedSummary ? (
            <>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold text-foreground">{tr("completion.title")}</p>
                <p className="truncate text-xs text-muted-foreground"><span dir="ltr" className="tabular-nums">{formatters.timer(elapsedSeconds)}</span> · {formatters.integer(completedSets)} {tr("set.labelPlural")}</p>
              </div>
              <Button className="min-h-[52px] flex-1 text-base" onClick={() => setFinishOpen(true)} disabled={isSaving || !session}>
                <Save className="me-2 h-5 w-5" /> {tr("common.finish")}
              </Button>
            </>
          ) : (
            <>
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate font-semibold text-foreground"><bdi>{activeExercise.exercise.exercise_name}</bdi></p>
                <p className="truncate text-xs text-muted-foreground"><span dir="ltr" className="tabular-nums">{formatters.ratio(completedSets, totalSets)}</span> {tr("set.labelPlural")} · <span dir="ltr" className="tabular-nums">{formatters.timer(elapsedSeconds)}</span></p>
              </div>
              <Button className="min-h-[52px] flex-1 text-base" onClick={() => finishSet(activeExerciseIndex, activeSetIndex)} disabled={Boolean(activeSet.completedAt) || isSaving || activeExerciseCompleted || isStarting}>
                <CheckCircle2 className="mr-2 h-5 w-5" />
                {isStarting ? tr("common.loading") : isSaving ? tr("common.saving") : tr("set.finishNumbered", { count: formatters.integer(activeSet.setNumber) })}
              </Button>
            </>
          )}
        </div>
      </MobileStickyActions>
      <MobileStickyActionsSpacer allowOnSession className="h-28" />
    </div>
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

function ActionBlock({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="rounded-[20px] border border-border/70 bg-background/30 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-primary/10 text-primary">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
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
