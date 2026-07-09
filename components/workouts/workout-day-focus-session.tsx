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
  X
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  saveWorkoutSetLogs,
  updateWorkoutSessionDuration
} from "@/services/database/workout-sessions";
import { createExerciseAlternative, getExerciseAlternatives, getProgressionTargets } from "@/services/database/execution-layer";
import type { ExerciseLog, UserWorkoutPlanExercise, WorkoutPlanDaySession, WorkoutSession, WorkoutSessionSummary } from "@/types";
import type { ExerciseAlternativeReason, UserExerciseAlternative, UserProgressionTarget } from "@/types";
import { AiActionRequestDialog } from "@/components/ai/ai-action-request-dialog";
import { WorkoutAiActionPanel } from "@/components/ai/workout-ai-action-panel";

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

const defaultInstructions = "Use controlled form, keep the target muscle engaged, avoid rushing the eccentric part, and stop if the movement feels painful.";

function firstNumber(value: string | null | undefined) {
  const match = value?.match(/\d+/);
  return match?.[0] ?? "10";
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

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function toNumberOrNull(value: string) {
  if (value.trim() === "") return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
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

function previousPerformance(history: WorkoutSessionSummary[], exerciseName: string): PreviousPerformance | null {
  const normalizedName = normalizeExerciseName(exerciseName);
  const matchingSession = history.find((session) => (session.exercise_logs ?? []).some((log) => normalizeExerciseName(log.exercise_name) === normalizedName));
  if (!matchingSession) return null;
  const matchingLogs = (matchingSession.exercise_logs ?? []).filter((log) => normalizeExerciseName(log.exercise_name) === normalizedName);
  const latestLog = [...matchingLogs].reverse().find((log) => log.reps || log.weight_kg) ?? matchingLogs[0];
  const best = [...matchingLogs].sort((a, b) => (Number(b.weight_kg ?? 0) * Number(b.reps ?? 0)) - (Number(a.weight_kg ?? 0) * Number(a.reps ?? 0)))[0];
  return {
    lastWeightKg: latestLog?.weight_kg ?? null,
    lastReps: latestLog?.reps ?? null,
    lastBestSet: best ? `${best.weight_kg ?? 0} kg x ${best.reps ?? 0}` : null,
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

function buildProgressiveSuggestion(item: ExerciseState) {
  const topReps = parseRepRangeTop(item.exercise.reps);
  const completed = item.sets.filter((set) => set.completedAt);
  const workingSets = completed.filter((set) => set.setType === "working" || set.setType === "normal" || set.setType === "failure");
  if (!completed.length) return `${item.exercise.exercise_name}: no completed sets. Treat this as skipped or incomplete.`;
  if (!topReps || !workingSets.length) return `${item.exercise.exercise_name}: logged ${completed.length}/${item.sets.length} sets. Repeat and compare next time.`;
  const allTop = workingSets.every((set) => (toNumberOrNull(set.reps) ?? 0) >= topReps);
  if (allTop) return `${item.exercise.exercise_name}: all working sets reached the top of the rep target. Consider increasing weight next time.`;
  return `${item.exercise.exercise_name}: some working sets missed the top reps. Repeat the same weight next time.`;
}

function buildPrs(states: ExerciseState[], history: WorkoutSessionSummary[]) {
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

    if (currentMaxWeight > 0 && currentMaxWeight > prevMaxWeight) prs.push(`${exerciseName}: highest weight PR ${currentMaxWeight} kg`);
    if (currentMaxReps > 0 && currentMaxReps > prevMaxReps) prs.push(`${exerciseName}: max reps PR ${currentMaxReps} reps`);
    if (currentMaxOneRep > 0 && currentMaxOneRep > prevMaxOneRep) prs.push(`${exerciseName}: estimated 1RM PR ${round(currentMaxOneRep)} kg`);
    if (currentVolume > 0 && currentVolume > prevMaxVolume) prs.push(`${exerciseName}: volume PR ${round(currentVolume)} kg`);
  });
  return prs;
}

function buildSummary(states: ExerciseState[], history: WorkoutSessionSummary[], durationMinutes: number, notes: string): WorkoutSummary {
  const sessionSets = buildSessionSets(states);
  const completedExercises = states.filter((item) => item.sets.some((set) => set.completedAt)).length;
  const skippedExercises = states.filter((item) => !item.sets.some((set) => set.completedAt)).map((item) => item.exercise.exercise_name);
  return {
    durationMinutes,
    totalVolume: round(sessionSets.reduce((sum, set) => sum + set.weightKg * set.reps, 0)),
    completedSets: sessionSets.length,
    completedExercises,
    skippedExercises,
    prs: buildPrs(states, history),
    suggestions: states.map(buildProgressiveSuggestion),
    notes
  };
}

export function WorkoutDayFocusSession({ day }: { day: WorkoutPlanDaySession }) {
  const { user } = useAuth();
  const { toast } = useToast();
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
  const [manualReplacementName, setManualReplacementName] = useState("");
  const [isSavingAlternative, setIsSavingAlternative] = useState(false);
  const [setFeedback, setSetFeedback] = useState("");
  const [setFeedbackVariant, setSetFeedbackVariant] = useState<"info" | "error">("info");
  const [prFeedback, setPrFeedback] = useState("");
  const workoutTimerKey = useMemo(() => workoutStorageKey(["workout-day-session", user?.id ?? "anonymous", day.id]), [day.id, user?.id]);
  const restTimerKey = useMemo(() => workoutStorageKey(["workout-day-rest-timer", user?.id ?? "anonymous", day.id]), [day.id, user?.id]);
  const [timerEndsAtMs, setTimerEndsAtMs] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    if (!user?.id) {
      setIsStarting(false);
      toast({ title: "Sign in required", description: "Please sign in before starting a workout." });
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
        toast({ title: "Could not start workout session", description: userSafeError(error, "Please refresh and try again.") });
      })
      .finally(() => {
        if (active) setIsStarting(false);
      });

    return () => {
      active = false;
    };
  }, [day, toast, user?.id, workoutTimerKey]);

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
        toast({ title: "Rest finished", description: "Next set ready." });
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          new Notification("Rest finished", { body: "Next set ready." });
        }
      }
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [restTimerKey, timerEndsAtMs, toast]);

  const activeExercise = exerciseStates[activeExerciseIndex];
  const activeSet = activeExercise?.sets[activeSetIndex];
  const totalSets = exerciseStates.reduce((sum, item) => sum + item.sets.length, 0);
  const completedSets = exerciseStates.reduce((sum, item) => sum + item.sets.filter((set) => set.completedAt).length, 0);
  const progress = totalSets ? Math.round((completedSets / totalSets) * 100) : 0;
  const isFinished = completedSets === totalSets && totalSets > 0;
  const durationMinutes = Math.max(1, Math.ceil(elapsedSeconds / 60));
  const activePreviousPerformance = activeExercise ? previousPerformance(history, activeExercise.exercise.exercise_name) : null;
  const activeProgressionTarget = progressionTargets.find((target) => target.plan_exercise_id === activeExercise?.exercise.id) ?? null;
  const activeAlternatives = alternatives.filter((alternative) => alternative.plan_exercise_id === activeExercise?.exercise.id);
  const currentGuideUrl = activeExercise?.exercise.exercise_url || (activeExercise?.exercise.notes?.startsWith("http") ? activeExercise.exercise.notes : null);
  const currentCustomVideoUrl = activeExercise?.exercise.custom_video_url || null;
  const currentInstructions = activeExercise?.exercise.instructions || defaultInstructions;
  const previewPrs = buildPrs(exerciseStates, history);
  const sessionSets = buildSessionSets(exerciseStates);
  const totalVolume = round(sessionSets.reduce((sum, set) => sum + set.weightKg * set.reps, 0));
  const nextExercise = exerciseStates[activeExerciseIndex + 1];
  const activeExerciseCompleted = activeExercise?.sets.every((set) => set.completedAt) ?? false;
  const nextSetLabel = activeExercise && !activeExerciseCompleted && activeSet
    ? `Set ${activeSet.setNumber} of ${activeExercise.sets.length}`
    : nextExercise
      ? `Next: ${nextExercise.exercise.exercise_name}`
      : "All done";
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
    const deadline = Date.now() + safeSeconds * 1000;
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
      setSetFeedbackVariant("info");
      setSetFeedback(`Set ${targetSet.setNumber} saved: ${targetSet.reps || "-"} reps at ${targetSet.weightKg || "0"} kg.`);
      const currentWeight = toNumberOrNull(targetSet.weightKg) ?? 0;
      const currentReps = toNumberOrNull(targetSet.reps) ?? 0;
      const exercise = exerciseStates[exerciseIndex];
      if (exercise && currentWeight > 0 && currentReps > 0) {
        const prevPerf = previousPerformance(history, exercise.exercise.exercise_name);
        if (prevPerf && (currentWeight > (prevPerf.lastWeightKg ?? 0) || currentReps > (prevPerf.lastReps ?? 0))) {
          setPrFeedback(`${exercise.exercise.exercise_name}: new best ${currentWeight} kg x ${currentReps} reps`);
          window.setTimeout(() => setPrFeedback(""), 3500);
        }
      }
    } catch (error) {
      setExerciseStates(previousStates);
      setActiveExerciseIndex(previousActiveExerciseIndex);
      setActiveSetIndex(previousActiveSetIndex);
      restoreRestTimer(previousTimer);
      setSetFeedbackVariant("error");
      setSetFeedback("This set was not saved. We restored it so you can try again.");
      toast({ title: "Could not save set", description: userSafeError(error, "This set was not saved. Your log was restored so you can try again.") });
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
      setSetFeedback("Set reopened. Finish it again when you are ready.");
    } catch (error) {
      setExerciseStates(previousStates);
      setSetFeedbackVariant("error");
      setSetFeedback("This set was not reopened. Your saved set stayed complete.");
      toast({ title: "Could not reopen this set", description: userSafeError(error, "Your saved set stayed complete. Try again in a moment.") });
    } finally {
      setIsSaving(false);
    }
  }

  async function completeSession() {
    if (!session || isSaving) return;
    try {
      setIsSaving(true);
      const summary = buildSummary(exerciseStates, history, durationMinutes, sessionNotes);
      await saveWorkoutSetLogs(session.id, buildLogRows());
      await completeWorkoutSession(session.id, sessionNotes, durationMinutes);
      if (user?.id) clearActiveWorkoutState(user.id);
      clearStoredValue(workoutTimerKey);
      clearStoredValue(restTimerKey);
      setFinishOpen(false);
      setCompletedSummary(summary);
      toast({ title: "Workout saved", description: `${day.day_name} was added to your workout history.` });
      celebrate("Workout complete");
    } catch (error) {
      toast({ title: "Could not save workout", description: userSafeError(error) });
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

  async function useManualReplacement() {
    if (!user?.id || !activeExercise || !manualReplacementName.trim()) return;
    const originalName = activeExercise.exercise.exercise_name;
    setIsSavingAlternative(true);
    try {
      const saved = await createExerciseAlternative(user.id, {
        plan_exercise_id: activeExercise.exercise.id,
        original_exercise_name: originalName,
        alternative_exercise_name: manualReplacementName.trim(),
        reason: replacementReason,
        target_muscle: activeExercise.exercise.target_muscle,
        equipment: activeExercise.exercise.equipment,
        created_by: "user"
      });
      setAlternatives((current) => [saved, ...current]);
      setExerciseStates((current) => current.map((item, index) => index === activeExerciseIndex
        ? { ...item, exercise: { ...item.exercise, exercise_name: saved.alternative_exercise_name } }
        : item));
      setManualReplacementName("");
      toast({ title: "Replacement ready for today", description: `${saved.alternative_exercise_name} is now shown in this workout. Your plan was not changed.` });
    } catch (error) {
      toast({ title: "Could not save replacement", description: userSafeError(error) });
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
      toast({ title: "No previous set found", description: "Log this exercise once and it will be available next time." });
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
          <p className="text-sm text-muted-foreground">This workout day has no exercises yet.</p>
          <Button asChild variant="outline" className="min-h-12">
            <Link href="/my-workout/plans"><ArrowLeft className="h-4 w-4" /> Back to plan</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!activeExercise || !activeSet) return null;

  return (
    <div className="space-y-4 pb-28 lg:pb-4">
      {completedSummary ? <WorkoutSummaryCard summary={completedSummary} dayName={day.day_name} /> : null}

      {isStarting ? (
        <div className="rounded-[18px] border border-primary/20 bg-primary/5 p-3 text-sm text-primary" role="status">
          <span className="inline-flex items-center gap-2">
            <RefreshCcw className="h-4 w-4 motion-safe:animate-spin" />
            Loading your session and previous logs...
          </span>
        </div>
      ) : null}

      <div className="sticky top-0 z-30 -mx-4 border-b border-border/60 bg-background/95 px-4 py-3 pr-16 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:static lg:mx-0 lg:rounded-[28px] lg:border lg:bg-card/70 lg:px-5 lg:py-4 lg:pr-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold leading-tight">{day.day_name}</h1>
              <p className="text-xs text-muted-foreground">{day.weekday ?? "Workout day"} - {exerciseStates.length} exercises</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isTimerRunning ? (
              <div className="rounded-full bg-primary/10 px-3 py-1.5 text-sm font-semibold tabular-nums text-primary">
                {formatTime(timerLeft)}
              </div>
            ) : null}
            <div className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-sm">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium tabular-nums">{formatTime(elapsedSeconds)}</span>
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>{completedSets}/{totalSets} sets</span>
          <span>{progress}%</span>
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
                {allDone ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              <span className="max-w-[140px] truncate text-xs font-medium">{item.exercise.exercise_name}</span>
              <span className="text-[10px] text-muted-foreground">{done}/{item.sets.length}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <MotionCard className="overflow-hidden rounded-[28px] border border-primary/15 bg-card/90 shadow-sm">
            <div className="p-5 sm:p-6">
              <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
                <Target className="h-4 w-4" /> Focus set
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-2xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-3xl">{activeExercise.exercise.exercise_name}</h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="outline" className="rounded-full font-normal">{activeExercise.exercise.sets ?? activeExercise.sets.length} sets</Badge>
                    <Badge variant="outline" className="rounded-full font-normal">{activeExercise.exercise.reps ?? "custom"} reps</Badge>
                    <Badge variant="outline" className="rounded-full font-normal">{activeExercise.exercise.rest_seconds ?? timerSeconds}s rest</Badge>
                    {supersetLabel(activeExercise.exercise) ? <Badge className="rounded-full text-[10px]">Superset {supersetLabel(activeExercise.exercise)}</Badge> : null}
                  </div>
                </div>
                <Button type="button" variant="outline" size="icon" className="h-12 w-12 shrink-0 rounded-[16px]" onClick={() => setActionsOpen(true)}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <div className="rounded-[18px] border border-border/60 bg-background/40 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Previous best</p>
                  <p className="mt-1 text-sm font-semibold">{activePreviousPerformance?.lastBestSet ?? "No data"}</p>
                </div>
                <div className="rounded-[18px] border border-border/60 bg-background/40 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Target today</p>
                  <p className="mt-1 text-sm font-semibold">{activeProgressionTarget ? `${activeProgressionTarget.next_target_weight_kg ?? "custom"} kg x ${activeProgressionTarget.next_target_reps ?? "custom"}` : "Match or beat last clean set"}</p>
                </div>
              </div>
            </div>
          </MotionCard>

          {!activeExerciseCompleted ? (
            <MotionCard className="rounded-[28px] border border-border/70 bg-card p-5 shadow-sm sm:p-6">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">Set {activeSet.setNumber}</h3>
                  <p className="text-sm text-muted-foreground">{activeSet.setType !== "working" ? `${activeSet.setType.charAt(0).toUpperCase()}${activeSet.setType.slice(1)} set` : "Working set"}</p>
                </div>
                <Badge variant="outline" className="rounded-full">{Math.max(0, activeExercise.sets.length - activeSetIndex - 1)} left</Badge>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Reps</Label>
                  <Input
                    className="h-16 rounded-[18px] text-center text-2xl font-bold sm:h-20 sm:text-3xl"
                    value={activeSet.reps}
                    onChange={(event) => updateSet(activeExerciseIndex, activeSetIndex, { reps: event.target.value })}
                    inputMode="numeric"
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Weight kg</Label>
                  <Input
                    className="h-16 rounded-[18px] text-center text-2xl font-bold sm:h-20 sm:text-3xl"
                    value={activeSet.weightKg}
                    onChange={(event) => updateSet(activeExerciseIndex, activeSetIndex, { weightKg: event.target.value })}
                    inputMode="decimal"
                    placeholder="0"
                  />
                </div>
              </div>

              <Button className="mt-4 min-h-[56px] w-full rounded-[18px] text-base font-semibold" onClick={() => finishSet(activeExerciseIndex, activeSetIndex)} disabled={Boolean(activeSet.completedAt) || isSaving || isStarting}>
                <CheckCircle2 className="mr-2 h-5 w-5" />
                {isStarting ? "Loading..." : isSaving ? "Saving..." : `Finish Set ${activeSet.setNumber}`}
              </Button>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" className="min-h-12 rounded-[16px]" onClick={() => setActionsOpen(true)}>
                  <MoreHorizontal className="mr-2 h-4 w-4" /> More
                </Button>
                <Button type="button" variant="outline" className="min-h-12 rounded-[16px]" onClick={() => setFinishOpen(true)}>
                  <Save className="mr-2 h-4 w-4" /> Finish
                </Button>
              </div>
            </MotionCard>
          ) : (
            <MotionCard className="rounded-[28px] border border-success/25 bg-success/5 p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15">
                <CheckCircle2 className="h-6 w-6 text-success" />
              </div>
              <p className="mt-3 font-semibold text-success">All sets complete</p>
              <p className="mt-1 text-sm text-muted-foreground">{activeExercise.exercise.exercise_name} - {activeExercise.sets.length} sets logged</p>
              {nextExercise ? (
                <Button className="mt-4 min-h-12 rounded-[18px]" onClick={() => { setActiveExerciseIndex(activeExerciseIndex + 1); setActiveSetIndex(0); setTimerSeconds(nextExercise.exercise.rest_seconds ?? 75); }}>
                  Next: {nextExercise.exercise.exercise_name}
                </Button>
              ) : (
                <Button className="mt-4 min-h-12 rounded-[18px]" onClick={() => setFinishOpen(true)}><Save className="mr-2 h-4 w-4" /> Finish Workout</Button>
              )}
            </MotionCard>
          )}

          <Card className="rounded-[24px] border-border/70 bg-card/80">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{activeExercise.exercise.exercise_name}</p>
                  <p className="text-xs text-muted-foreground">Set path</p>
                </div>
                <p className="text-xs text-muted-foreground">{activeExercise.sets.filter((set) => set.completedAt).length}/{activeExercise.sets.length}</p>
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
                      aria-label={`Set ${set.setNumber}`}
                    >
                      {isCompleted ? <Check className="h-4 w-4" /> : set.setNumber}
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
                  <p className="text-xs text-muted-foreground">Next exercise</p>
                  <p className="text-sm font-semibold">{nextExercise.exercise.exercise_name}</p>
                </div>
                <Badge variant="outline" className="rounded-full">{nextExercise.exercise.sets ?? nextExercise.sets.length} x {nextExercise.exercise.reps ?? "custom"}</Badge>
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
                <p className="flex items-center gap-2 text-sm font-semibold"><TimerReset className="h-4 w-4" /> Rest</p>
                <p className="text-xl font-bold tabular-nums text-primary">{formatTime(timerLeft)}</p>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[30, 60, 90, 180].map((seconds) => <Button key={seconds} variant="outline" className="min-h-12" onClick={() => startRestTimer(seconds)}>{seconds === 180 ? "3m" : `${seconds}s`}</Button>)}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="min-h-12 flex-1" onClick={() => startRestTimer(timerSeconds)}>Start</Button>
                <Button variant="outline" className="min-h-12 flex-1" onClick={stopRestTimer}>Stop</Button>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-[24px] border-border/70 bg-card/80">
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-semibold">Session snapshot</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <InfoStat label="Volume" value={`${totalVolume} kg`} />
                <InfoStat label="Sets" value={`${completedSets}/${totalSets}`} />
                <InfoStat label="Exercises" value={`${exerciseStates.filter((item) => item.sets.some((set) => set.completedAt)).length}/${exerciseStates.length}`} />
                <InfoStat label="PRs" value={String(previewPrs.length)} />
              </div>
              <Button className="min-h-12 w-full rounded-[18px]" onClick={() => setFinishOpen(true)} disabled={!session || isSaving}>
                <Save className="mr-2 h-4 w-4" /> {isFinished ? "Finish Workout" : "Finish partial workout"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {actionsOpen ? (
        <div className="fixed inset-0 z-50 bg-background/75 backdrop-blur-sm" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 h-full w-full cursor-default" aria-label="Close workout actions" onClick={() => setActionsOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-[32px] border-t border-border bg-card p-5 shadow-2xl lg:left-auto lg:right-6 lg:top-6 lg:bottom-6 lg:w-[420px] lg:rounded-[28px] lg:border">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">Workout actions</p>
                <p className="text-sm text-muted-foreground">Extra tools stay here so the set screen stays focused.</p>
              </div>
              <Button variant="ghost" size="icon" className="h-12 w-12 rounded-[14px]" onClick={() => setActionsOpen(false)}><X className="h-4 w-4" /></Button>
            </div>

            <div className="space-y-3">
              <ActionBlock icon={<ExternalLink className="h-4 w-4" />} title="Exercise guide / video" description={currentInstructions}>
                <div className="mt-3 flex flex-wrap gap-2">
                  {currentGuideUrl ? <Button asChild variant="outline" className="min-h-12"><a href={currentGuideUrl} target="_blank" rel="noreferrer">Open guide</a></Button> : null}
                  {currentCustomVideoUrl ? <Button asChild variant="outline" className="min-h-12"><a href={currentCustomVideoUrl} target="_blank" rel="noreferrer">Open video</a></Button> : null}
                  {!currentGuideUrl && !currentCustomVideoUrl ? <p className="text-xs text-muted-foreground">No guide or custom video saved.</p> : null}
                </div>
              </ActionBlock>

              <ActionBlock icon={<Sparkles className="h-4 w-4" />} title="Advanced set details" description="RPE, RIR, set type, notes, and previous set copy.">
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1"><Label className="text-xs">RPE</Label><Input className="h-12" value={activeSet.rpe} onChange={(event) => updateSet(activeExerciseIndex, activeSetIndex, { rpe: event.target.value })} inputMode="decimal" placeholder="8" /></div>
                  <div className="space-y-1"><Label className="text-xs">RIR</Label><Input className="h-12" value={activeSet.rir} onChange={(event) => updateSet(activeExerciseIndex, activeSetIndex, { rir: event.target.value })} inputMode="numeric" placeholder="2" /></div>
                  <div className="space-y-1">
                    <Label className="text-xs">Type</Label>
                    <select value={activeSet.setType} onChange={(event) => updateSet(activeExerciseIndex, activeSetIndex, { setType: event.target.value as SetState["setType"] })} className="flex h-12 w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <option value="normal">Normal</option>
                      <option value="warmup">Warm-up</option>
                      <option value="working">Working</option>
                      <option value="failure">Failure</option>
                      <option value="drop">Drop set</option>
                    </select>
                  </div>
                  <div className="space-y-1 sm:col-span-3"><Label className="text-xs">Notes</Label><textarea className="min-h-20 w-full resize-y rounded-[14px] border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" value={activeSet.notes} onChange={(event) => updateSet(activeExerciseIndex, activeSetIndex, { notes: event.target.value })} placeholder="Optional notes about this set" /></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button className="min-h-12" variant="outline" onClick={() => applyPreviousSet(activeExerciseIndex, activeSetIndex)} disabled={Boolean(activeSet.completedAt)}>Use previous</Button>
                  <Button className="min-h-12" variant="outline" onClick={() => restartSet(activeExerciseIndex, activeSetIndex)} disabled={!activeSet.completedAt || isSaving}>{isSaving ? "Saving..." : "Reopen set"}</Button>
                </div>
              </ActionBlock>

              <ActionBlock icon={<RefreshCcw className="h-4 w-4" />} title="Replace for today" description="Use an alternative now. The saved plan is not changed.">
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Input className="h-12" value={manualReplacementName} onChange={(event) => setManualReplacementName(event.target.value)} placeholder="For example: Dumbbell bench press" />
                  <select value={replacementReason} onChange={(event) => setReplacementReason(event.target.value as ExerciseAlternativeReason)} className="h-12 rounded-md border border-input bg-card px-3 text-sm">
                    <option value="machine_taken">Machine taken</option>
                    <option value="no_equipment">No equipment</option>
                    <option value="pain_or_discomfort">Pain or discomfort</option>
                    <option value="too_hard">Too hard today</option>
                    <option value="home_alternative">Home alternative</option>
                    <option value="same_muscle">Same muscle</option>
                    <option value="lower_back_friendly">Lower-back friendly</option>
                    <option value="knee_friendly">Knee friendly</option>
                    <option value="shoulder_friendly">Shoulder friendly</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                {activeAlternatives.length ? <div className="mt-3 rounded-[14px] bg-muted/40 p-3 text-xs text-muted-foreground">Saved: {activeAlternatives.slice(0, 3).map((alternative) => alternative.alternative_exercise_name).join(", ")}</div> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" className="min-h-12" onClick={useManualReplacement} disabled={!manualReplacementName.trim() || isSavingAlternative}>{isSavingAlternative ? "Saving..." : "Use for today"}</Button>
                  <AiActionRequestDialog actions={[{ type: "replace_exercise", label: "Ask ChatGPT", description: "Ask ChatGPT to recommend a suitable replacement using the selected reason and current workout." }]} sourceType="plan_exercise" sourceId={activeExercise.exercise.id} context={{ ...workoutContext, replacement_reason: replacementReason, exercise_alternatives: activeAlternatives }} />
                </div>
              </ActionBlock>

              <ActionBlock icon={<TimerReset className="h-4 w-4" />} title="Timer controls" description="Adjust rest or reset the workout timer.">
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {[30, 60, 90, 180].map((seconds) => <Button key={seconds} type="button" variant="outline" className="min-h-12" onClick={() => startRestTimer(seconds)}>{seconds === 180 ? "3m" : `${seconds}s`}</Button>)}
                </div>
                <div className="mt-3 flex gap-2">
                  <Button type="button" variant="outline" className="min-h-12" onClick={stopRestTimer}>Stop rest</Button>
                  <Button type="button" variant="outline" className="min-h-12" onClick={resetWorkoutTimer}>Reset workout timer</Button>
                </div>
              </ActionBlock>

              <ActionBlock icon={<Sparkles className="h-4 w-4" />} title="ChatGPT coach" description="Review this workout, make today lighter, or plan the next step.">
                <div className="mt-3">
                  <WorkoutAiActionPanel compact sourceType="workout_session" sourceId={session?.id ?? day.id} context={workoutContext} />
                </div>
              </ActionBlock>
            </div>
          </div>
        </div>
      ) : null}

      {finishOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-background/75 p-0 backdrop-blur-sm lg:place-items-center lg:p-6" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 h-full w-full cursor-default" aria-label="Close finish workout" onClick={() => setFinishOpen(false)} />
          <div className="relative w-full rounded-t-[32px] border border-border bg-card p-5 shadow-2xl lg:max-w-lg lg:rounded-[28px]">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">Finish workout?</p>
                <p className="text-sm text-muted-foreground">Review only the important summary before saving.</p>
              </div>
              <Button variant="ghost" size="icon" className="h-12 w-12 rounded-[14px]" onClick={() => setFinishOpen(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <InfoStat label="Minutes" value={String(durationMinutes)} />
              <InfoStat label="Sets" value={`${completedSets}/${totalSets}`} />
              <InfoStat label="Volume" value={`${totalVolume}`} />
              <InfoStat label="PRs" value={String(previewPrs.length)} />
            </div>
            {previewPrs.length ? <div className="mt-3 rounded-[16px] border border-primary/20 bg-primary/5 p-3 text-sm text-primary"><Trophy className="mr-1 inline h-4 w-4" /> {previewPrs.length} possible PR{previewPrs.length === 1 ? "" : "s"}</div> : null}
            <div className="mt-4 space-y-2">
              <Label htmlFor="finish-notes">Session notes</Label>
              <textarea id="finish-notes" className="min-h-24 w-full resize-y rounded-[16px] border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" value={sessionNotes} onChange={(event) => setSessionNotes(event.target.value)} placeholder="How did this workout feel?" />
            </div>
            <Button className="mt-4 min-h-12 w-full rounded-[18px]" onClick={completeSession} disabled={isSaving || !session}>
              <Save className="mr-2 h-4 w-4" /> {isSaving ? "Saving..." : isFinished ? "Save workout" : "Save partial workout"}
            </Button>
            <Button className="mt-2 min-h-12 w-full rounded-[18px]" variant="outline" onClick={() => setFinishOpen(false)}>Keep training</Button>
          </div>
        </div>
      ) : null}

      <MobileStickyActions allowOnSession className="bottom-[env(safe-area-inset-bottom)] z-[60]">
        <div className="flex items-center gap-3">
          {isTimerRunning ? (
            <>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold text-foreground">Resting - {formatTime(timerLeft)}</p>
                <p className="truncate text-xs text-muted-foreground">{nextSetLabel}</p>
              </div>
              <Button variant="outline" className="min-h-12 px-4" onClick={() => startRestTimer(timerLeft + 30)}>+30s</Button>
              <Button className="min-h-12 flex-1 text-base" variant="secondary" onClick={stopRestTimer}>
                <FastForward className="mr-2 h-5 w-5" /> Skip
              </Button>
            </>
          ) : isFinished && !completedSummary ? (
            <>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold text-foreground">Workout complete</p>
                <p className="truncate text-xs text-muted-foreground">{formatTime(elapsedSeconds)} - {completedSets} sets</p>
              </div>
              <Button className="min-h-12 flex-1 text-base" onClick={() => setFinishOpen(true)} disabled={isSaving || !session}>
                <Save className="mr-2 h-5 w-5" /> Finish
              </Button>
            </>
          ) : (
            <>
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate font-semibold text-foreground">{activeExercise.exercise.exercise_name}</p>
                <p className="truncate text-xs text-muted-foreground">{completedSets}/{totalSets} sets - {formatTime(elapsedSeconds)}</p>
              </div>
              <Button className="min-h-12 flex-1 text-base" onClick={() => finishSet(activeExerciseIndex, activeSetIndex)} disabled={Boolean(activeSet.completedAt) || isSaving || activeExerciseCompleted || isStarting}>
                <CheckCircle2 className="mr-2 h-5 w-5" />
                {isStarting ? "Loading..." : isSaving ? "Saving..." : `Finish Set ${activeSet.setNumber}`}
              </Button>
            </>
          )}
        </div>
      </MobileStickyActions>
      <MobileStickyActionsSpacer allowOnSession className="h-28" />
    </div>
  );
}

function InfoStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-border/60 bg-muted/30 p-3 text-center">
      <p className="text-lg font-bold tracking-[-0.03em]">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function ActionBlock({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children?: React.ReactNode }) {
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
  return (
    <MotionCard>
      <Card className="rounded-[28px] border-success/20 bg-success/[0.04]">
        <CardContent className="space-y-5 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15">
              <Dumbbell className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-base font-semibold">{dayName} complete</p>
              <p className="text-sm text-muted-foreground">Saved to workout history.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <InfoStat label="Minutes" value={String(summary.durationMinutes)} />
            <InfoStat label="Volume kg" value={String(summary.totalVolume)} />
            <InfoStat label="Sets" value={String(summary.completedSets)} />
            <InfoStat label="Exercises" value={String(summary.completedExercises)} />
          </div>
          {summary.prs.length ? (
            <div className="rounded-[16px] border border-primary/20 bg-primary/[0.04] p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-primary"><Trophy className="h-4 w-4" /> {summary.prs.length} new PR{summary.prs.length === 1 ? "" : "s"}</p>
              <ul className="mt-2 space-y-1">{summary.prs.slice(0, 4).map((pr) => <li key={pr} className="text-sm text-muted-foreground">- {pr}</li>)}</ul>
            </div>
          ) : null}
          <Button asChild className="min-h-12 w-full rounded-[18px]"><Link href="/my-workout/plans">Back to Workout Plans</Link></Button>
        </CardContent>
      </Card>
    </MotionCard>
  );
}
