"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, CheckCircle2, Clock, ExternalLink, RefreshCcw, RotateCcw, Save, Sparkles, TimerReset, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Disclosure } from "@/components/ui/disclosure";
import { useConfirm, ConfirmDialog } from "@/components/ui/confirm-dialog";
import { MobileStickyActions, MobileStickyActionsSpacer } from "@/components/layout/mobile-sticky-actions";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { clearStoredValue, readStoredTimestamp, storeTimestamp, workoutStorageKey } from "@/lib/workout-persistence";
import { clearActiveWorkoutState, writeActiveWorkoutState } from "@/lib/active-workout";
import { userSafeError } from "@/lib/error-formatting";
import Link from "next/link";
import { completeWorkoutSession, getOrStartWorkoutDaySession, getWorkoutHistoryDetailed, getWorkoutSessionLogs, saveWorkoutSetLogs, updateWorkoutSessionDuration } from "@/services/database/workout-sessions";
import type { ExerciseLog, UserWorkoutPlanExercise, WorkoutPlanDaySession, WorkoutSession, WorkoutSessionSummary } from "@/types";
import type { ExerciseAlternativeReason, UserExerciseAlternative, UserProgressionTarget } from "@/types";
import { AiActionRequestDialog } from "@/components/ai/ai-action-request-dialog";
import { WorkoutAiActionPanel } from "@/components/ai/workout-ai-action-panel";
import { createExerciseAlternative, getDailyCheckins, getExerciseAlternatives, getProgressionTargets } from "@/services/database/execution-layer";
import { calculateReadiness, getSleepRecoveryHistory, type EnhancedSleepRecoveryLog } from "@/services/wellness/wellness-data";
import { useSuccessFeedback } from "@/components/feedback/success-feedback";
import { InlineFeedback } from "@/components/motion";

const defaultInstructions = "Use controlled form, keep the target muscle engaged, avoid rushing the eccentric part, and stop if the movement feels painful.";

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

function estimateOneRepMax(weightKg: number, reps: number) {
  if (weightKg <= 0 || reps <= 0) return 0;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function currentTimestamp() {
  return Date.now();
}

function parseRepRangeTop(value: string | null | undefined) {
  const numbers = value?.match(/\d+/g)?.map(Number).filter((item) => Number.isFinite(item) && item > 0) ?? [];
  return numbers.length ? Math.max(...numbers) : null;
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

function normalizeSetType(value: string): SetType {
  const clean = value.trim().toLowerCase().replace(/\s+/g, "");
  if (clean === "warmup" || clean === "warm-up") return "warmup";
  if (clean === "dropset" || clean === "drop") return "drop";
  if (clean === "failure") return "failure";
  if (clean === "normal") return "normal";
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

function setNote(set: SetState) {
  const metadata = [
    set.setType !== "working" ? `type:${set.setType}` : null,
    set.rpe ? `RPE:${set.rpe}` : null,
    set.rir ? `RIR:${set.rir}` : null
  ].filter(Boolean);
  return [set.notes, ...metadata].filter(Boolean).join(" | ") || null;
}

export function WorkoutDaySession({ day }: { day: WorkoutPlanDaySession }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { celebrate } = useSuccessFeedback();
  const { dialog: confirmDialog, ask: confirmAsk } = useConfirm();
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
  const [recoveryLogs, setRecoveryLogs] = useState<EnhancedSleepRecoveryLog[]>([]);
  const [morningReadiness, setMorningReadiness] = useState<string | null>(null);
  const [readinessDismissed, setReadinessDismissed] = useState(false);
  const [replacementReason, setReplacementReason] = useState<ExerciseAlternativeReason>("machine_taken");
  const [manualReplacementName, setManualReplacementName] = useState("");
  const [isSavingAlternative, setIsSavingAlternative] = useState(false);
  const [showReplacement, setShowReplacement] = useState(false);
  const [setFeedback, setSetFeedback] = useState("");
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
        const today = new Date().toLocaleDateString("en-CA");
        const exerciseIds = day.exercises.map((exercise) => exercise.id);
        const [existingLogs, workoutHistory, targets, savedAlternatives, recovery, checkins] = await Promise.all([
          getWorkoutSessionLogs(nextSession.id),
          getWorkoutHistoryDetailed(user.id, 100),
          getProgressionTargets(user.id, exerciseIds).catch(() => []),
          getExerciseAlternatives(user.id).catch(() => []),
          getSleepRecoveryHistory(user.id, 7),
          getDailyCheckins(user.id, today).catch(() => [])
        ]);
        if (active) {
          setExerciseStates((current) => hydrateStates(current, existingLogs));
          setHistory(workoutHistory.filter((item) => item.id !== nextSession.id));
          setProgressionTargets(targets);
          setAlternatives(savedAlternatives.filter((item) => exerciseIds.includes(item.plan_exercise_id)));
          setRecoveryLogs(recovery);
          setMorningReadiness(checkins.find((item) => item.checkin_type === "morning")?.workout_readiness ?? null);
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
  const currentGuideUrl = activeExercise?.exercise.exercise_url || (activeExercise?.exercise.notes?.startsWith("http") ? activeExercise.exercise.notes : null);
  const currentCustomVideoUrl = activeExercise?.exercise.custom_video_url || null;
  const currentInstructions = activeExercise?.exercise.instructions || defaultInstructions;
  const durationMinutes = Math.max(1, Math.ceil(elapsedSeconds / 60));
  const activePreviousPerformance = activeExercise ? previousPerformance(history, activeExercise.exercise.exercise_name) : null;
  const liveSuggestions = exerciseStates.map(buildProgressiveSuggestion);
  const previewPrs = buildPrs(exerciseStates, history);
  const activeProgressionTarget = progressionTargets.find((target) => target.plan_exercise_id === activeExercise?.exercise.id) ?? null;
  const activeAlternatives = alternatives.filter((alternative) => alternative.plan_exercise_id === activeExercise?.exercise.id);
  const readiness = calculateReadiness(recoveryLogs);
  const lowReadiness = (readiness.value !== null && readiness.value < 50) || morningReadiness === "low";
  const latestRecovery = recoveryLogs[0] ?? null;
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
    readiness: { estimate: readiness, morning_checkin: morningReadiness, latest_recovery: latestRecovery },
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
    toast({ title: "Previous set applied", description: previous.performedAt ? `Copied from ${previous.performedAt.slice(0, 10)}.` : "Copied from your saved workout history." });
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
      const nextExercise = states[fromExerciseIndex + 1];
      setActiveExerciseIndex(fromExerciseIndex + 1);
      setActiveSetIndex(0);
      setTimerSeconds(nextExercise.exercise.rest_seconds ?? 75);
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
    const deadline = currentTimestamp() + safeSeconds * 1000;
    setTimerSeconds(safeSeconds);
    setTimerLeft(safeSeconds);
    setTimerEndsAtMs(deadline);
    setIsTimerRunning(true);
    storeTimestamp(restTimerKey, deadline);
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => undefined);
    }
  }

  function stopRestTimer() {
    setTimerLeft(0);
    setTimerEndsAtMs(null);
    setIsTimerRunning(false);
    clearStoredValue(restTimerKey);
  }

  async function finishSet(exerciseIndex: number, setIndex: number) {
    const targetSet = exerciseStates[exerciseIndex]?.sets[setIndex];
    if (!targetSet || targetSet.completedAt) return;
    if (isSaving) return;
    
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
      setSetFeedback(`Set ${targetSet.setNumber} saved: ${targetSet.reps || "-"} reps at ${targetSet.weightKg || "0"} kg.`);
      const currentWeight = toNumberOrNull(targetSet.weightKg) ?? 0;
      const currentReps = toNumberOrNull(targetSet.reps) ?? 0;
      const exercise = exerciseStates[exerciseIndex];
      if (exercise && currentWeight > 0 && currentReps > 0) {
        const prevPerf = previousPerformance(history, exercise.exercise.exercise_name);
        if (prevPerf && (currentWeight > (prevPerf.lastWeightKg ?? 0) || currentReps > (prevPerf.lastReps ?? 0))) {
          setPrFeedback(`${exercise.exercise.exercise_name}: new best ${currentWeight} kg x ${currentReps} reps`);
          window.setTimeout(() => setPrFeedback(""), 2500);
        }
      }
    } catch (error) {
      toast({ title: "Could not save set", description: userSafeError(error, "Try finishing the workout again if it does not appear in history.") });
    } finally {
      setIsSaving(false);
    }
  }

  async function finishCurrentSet() {
    await finishSet(activeExerciseIndex, activeSetIndex);
  }

  async function restartSet(exerciseIndex: number, setIndex: number) {
    const targetSet = exerciseStates[exerciseIndex]?.sets[setIndex];
    if (!targetSet) return;
    if (isSaving) return;
    
    setIsSaving(true);
    const nextStates = statesWithSetPatch(exerciseIndex, setIndex, { completedAt: null });
    setExerciseStates(nextStates);
    
    try {
      await persistProgress(nextStates);
    } catch {
      toast({ title: "Could not update this set", description: "Try again in a moment." });
    } finally {
      setIsSaving(false);
    }
  }

  async function restartCurrentSet() {
    await restartSet(activeExerciseIndex, activeSetIndex);
  }

  async function completeSession() {
    if (!session) {
      toast({ title: "Session is still starting", description: "Try again in a moment." });
      return;
    }
    if (isSaving) return;
    try {
      setIsSaving(true);
      const summary = buildSummary(exerciseStates, history, durationMinutes, sessionNotes);
      await saveWorkoutSetLogs(session.id, buildLogRows());
      await completeWorkoutSession(session.id, sessionNotes, durationMinutes);
      if (user?.id) clearActiveWorkoutState(user.id);
      clearStoredValue(workoutTimerKey);
      clearStoredValue(restTimerKey);
      setCompletedSummary(summary);
      setSetFeedback("Workout saved to history. You can review the summary here.");
      toast({ title: "Workout saved", description: `${day.day_name} was added to your workout history.` });
      celebrate("Workout complete");
    } catch (error) {
      toast({ title: "Could not save workout", description: userSafeError(error) });
    } finally {
      setIsSaving(false);
    }
  }

  function askFinishWorkout() {
    const remaining = totalSets - completedSets;
    confirmAsk({
      title: "Finish workout?",
      description: remaining > 0 ? `You have ${remaining} set${remaining === 1 ? "" : "s"} remaining. This will save your workout to history.` : "All sets completed. Save this workout to your history?",
      confirmLabel: "Finish Workout",
      cancelLabel: "Keep Training",
      variant: remaining > 0 ? "destructive" : "default",
      onConfirm: () => completeSession()
    });
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
      setShowReplacement(false);
      toast({ title: "Replacement ready for today", description: `${saved.alternative_exercise_name} is now shown in this workout. Your plan was not changed.` });
    } catch (error) {
      toast({ title: "Could not save replacement", description: userSafeError(error) });
    } finally {
      setIsSavingAlternative(false);
    }
  }

  if (!exerciseStates.length) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-5">
          <p className="text-sm text-muted-foreground">This workout day has no exercises yet.</p>
          <Button asChild variant="outline">
            <Link href="/my-workout/plans"><ArrowLeft className="h-4 w-4" /> Back to plan</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 pb-28 lg:pb-4">
      {confirmDialog}
      {completedSummary ? <WorkoutSummaryCard summary={completedSummary} /> : null}

      {lowReadiness && !readinessDismissed ? (
        <Card className="border-warning/30 bg-warning/10">
          <CardContent className="space-y-3 p-4 sm:p-5">
            <div>
              <p className="font-semibold">Readiness is low today</p>
              <p className="text-sm text-muted-foreground">Ask ChatGPT for a lighter version using your saved sleep, soreness, fatigue, stress, workout, and safety context. This is general fitness guidance, not medical advice.</p>
            </div>
            <WorkoutAiActionPanel
              compact
              sourceType="workout_session"
              sourceId={session?.id ?? day.id}
              context={workoutContext}
              actions={[
                { type: "reduce_workout_volume", label: "Reduce volume", description: "Ask ChatGPT which sets or exercises to reduce today." },
                { type: "reduce_workout_intensity", label: "Reduce intensity", description: "Ask ChatGPT for a lower-intensity version of today’s planned work." },
                { type: "recovery_workout", label: "Recovery version", description: "Ask ChatGPT for a recovery-focused version without automatically changing the plan." }
              ]}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setReadinessDismissed(true)}>
                Continue normally
              </Button>
              <Button asChild type="button" variant="outline" size="sm">
                <Link href={`/settings/coaching-profile?returnTo=${encodeURIComponent(`/workouts/session/day/${day.id}`)}`}>Log pain or discomfort</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="outline">
          <Link href="/my-workout/plans"><ArrowLeft className="h-4 w-4" /> Back to plan</Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          <Badge>{day.weekday ?? "Workout day"}</Badge>
          <Badge variant="outline">{completedSets}/{totalSets} sets done</Badge>
          <Badge variant="outline">{formatTime(elapsedSeconds)}</Badge>
          {isTimerRunning ? <Badge variant="success">Rest {formatTime(timerLeft)}</Badge> : null}
          {isStarting ? <Badge variant="outline">Saving session...</Badge> : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{day.day_name}</CardTitle>
          <p className="text-sm text-muted-foreground">Log each set as you train. Previous performance and PR checks use real saved workout history only.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={progress} />
          <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
            {exerciseStates.map((item, index) => {
              const done = item.sets.filter((set) => set.completedAt).length;
              const active = index === activeExerciseIndex;
              const allDone = done === item.sets.length;
              const group = supersetLabel(item.exercise);
              const previous = previousPerformance(history, item.exercise.exercise_name);
              return (
                <div
                  key={item.exercise.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setActiveExerciseIndex(index);
                    const firstOpen = item.sets.findIndex((set) => !set.completedAt);
                    setActiveSetIndex(firstOpen >= 0 ? firstOpen : item.sets.length - 1);
                    setTimerSeconds(item.exercise.rest_seconds ?? 75);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    setActiveExerciseIndex(index);
                    const firstOpen = item.sets.findIndex((set) => !set.completedAt);
                    setActiveSetIndex(firstOpen >= 0 ? firstOpen : item.sets.length - 1);
                    setTimerSeconds(item.exercise.rest_seconds ?? 75);
                  }}
                  className={`rounded-md border p-3 text-left transition-colors ${active ? "border-primary bg-primary/10" : allDone ? "border-success/30 bg-success/5" : "bg-card hover:border-primary/45"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{index + 1}. {item.exercise.exercise_name}{allDone ? <span className="ml-1 text-success">✓</span> : null}</p>
                    {group ? <Badge>{group}</Badge> : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{done}/{item.sets.length} sets{allDone ? " · complete" : ""}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{previous ? `Last: ${previous.lastWeightKg ?? 0} kg x ${previous.lastReps ?? 0}` : "No previous data"}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <CardTitle className="flex flex-wrap items-center gap-2">
                {activeExercise.exercise.exercise_name}
                {supersetLabel(activeExercise.exercise) ? <Badge>Superset {supersetLabel(activeExercise.exercise)}</Badge> : null}
              </CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowReplacement((current) => !current)} aria-expanded={showReplacement}><RefreshCcw className="h-4 w-4" /> Replace exercise</Button>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Badge variant="outline">Planned {activeExercise.exercise.sets ?? activeExercise.sets.length} sets</Badge>
              <Badge variant="outline">Reps {activeExercise.exercise.reps ?? "custom"}</Badge>
              <Badge variant="outline">Rest {activeExercise.exercise.rest_seconds ?? timerSeconds}s</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeExercise.sets.every((s) => s.completedAt) ? (
              <div className="rounded-[12px] border border-success/25 bg-success/5 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-success">
                  <CheckCircle2 className="h-4 w-4" /> All sets completed
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {activeExercise.sets.filter((s) => s.completedAt).length}/{activeExercise.sets.length} sets done. Move to the next exercise or finish the workout.
                </p>
              </div>
            ) : null}
            {isTimerRunning ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-primary/25 bg-primary/5 p-4">
                <div><p className="text-sm font-semibold text-foreground">Rest</p><p className="text-2xl font-bold text-primary">{formatTime(timerLeft)}</p></div>
                <div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => startRestTimer(timerLeft + 30)}>+30 sec</Button><Button type="button" variant="ghost" size="sm" onClick={stopRestTimer}>Skip</Button></div>
              </div>
            ) : null}

            {showReplacement ? (
              <div className="rounded-[16px] border-2 border-primary/30 bg-primary/5 p-4">
                <p className="font-semibold text-foreground">Replace for today</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">Use a known alternative now, or prepare a ChatGPT request. Your saved workout plan stays unchanged.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2"><Label htmlFor="manual-replacement-visible">Replacement exercise</Label><Input id="manual-replacement-visible" value={manualReplacementName} onChange={(event) => setManualReplacementName(event.target.value)} placeholder="For example: Dumbbell bench press" /></div>
                  <div className="space-y-2"><Label htmlFor="replacement-reason-visible">Reason</Label><select id="replacement-reason-visible" value={replacementReason} onChange={(event) => setReplacementReason(event.target.value as ExerciseAlternativeReason)} className="h-11 w-full rounded-[14px] border bg-card px-3 text-sm"><option value="machine_taken">Machine taken</option><option value="no_equipment">No equipment</option><option value="pain_or_discomfort">Pain or discomfort</option><option value="too_hard">Too hard today</option><option value="home_alternative">Home alternative</option><option value="same_muscle">Same muscle, different movement</option><option value="lower_back_friendly">Lower-back friendly</option><option value="knee_friendly">Knee friendly</option><option value="shoulder_friendly">Shoulder friendly</option><option value="other">Other</option></select></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" onClick={useManualReplacement} disabled={!manualReplacementName.trim() || isSavingAlternative}><RefreshCcw className="h-4 w-4" /> {isSavingAlternative ? "Saving..." : "Use for today"}</Button>
                  <AiActionRequestDialog actions={[{ type: "replace_exercise", label: "Ask ChatGPT", description: "Ask ChatGPT to recommend a suitable replacement using the selected reason and current workout." }]} sourceType="plan_exercise" sourceId={activeExercise.exercise.id} context={{ ...workoutContext, replacement_reason: replacementReason, exercise_alternatives: activeAlternatives }} />
                </div>
              </div>
            ) : null}

            <Disclosure title="Workout details" description="Progression, replacement, guide, alternatives, and timer settings">
              <div className="space-y-4">
            <div className="rounded-md bg-muted/40 p-3 text-sm leading-6 text-muted-foreground">
              {currentInstructions}
              <div className="mt-3 flex flex-wrap gap-2">
                {currentGuideUrl ? (
                  <Button asChild variant="outline" size="sm"><a href={currentGuideUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Open Exercise Guide</a></Button>
                ) : null}
                {currentCustomVideoUrl ? (
                  <Button asChild variant="outline" size="sm"><a href={currentCustomVideoUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Open Custom Video</a></Button>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <InfoBox title="Previous performance" lines={activePreviousPerformance ? [
                `Last used: ${activePreviousPerformance.lastWeightKg ?? 0} kg x ${activePreviousPerformance.lastReps ?? 0}`,
                `Last best set: ${activePreviousPerformance.lastBestSet ?? "No previous data"}`,
                `Last performed: ${activePreviousPerformance.lastPerformedAt ? activePreviousPerformance.lastPerformedAt.slice(0, 10) : "No previous data"}`
              ] : ["No previous data"]} />
              <InfoBox title="Overload guidance" lines={[buildProgressiveSuggestion(activeExercise)]} />
              <InfoBox title="Saved ChatGPT next target" lines={activeProgressionTarget ? [
                `Target: ${activeProgressionTarget.next_target_weight_kg ?? "custom"} kg x ${activeProgressionTarget.next_target_reps ?? "custom reps"}${activeProgressionTarget.next_target_sets ? ` for ${activeProgressionTarget.next_target_sets} sets` : ""}`,
                activeProgressionTarget.ai_recommendation || activeProgressionTarget.progression_note || "No note saved."
              ] : ["No saved next-session target yet."]} />
            </div>

            {activeAlternatives.length ? (
              <div className="rounded-[14px] border border-primary/20 bg-primary/5 p-3 text-sm">
                <p className="flex items-center gap-2 font-semibold"><RefreshCcw className="h-4 w-4" /> Saved alternatives</p>
                {activeAlternatives.slice(0, 3).map((alternative) => <p key={alternative.id} className="mt-1 text-muted-foreground">{alternative.alternative_exercise_name} · {alternative.reason.replaceAll("_", " ")}</p>)}
              </div>
            ) : null}

                <Button type="button" variant="ghost" size="sm" onClick={resetWorkoutTimer}><TimerReset className="h-4 w-4" /> Reset workout timer</Button>
              </div>
            </Disclosure>

            <div className="space-y-3">
              {activeExercise.sets.map((set, setIndex) => {
                const previousSet = previousSetForExercise(history, activeExercise.exercise.exercise_name, set.setNumber);
                return (
                  <div key={set.setNumber} className={`rounded-md border p-3 transition-all duration-200 ${set.completedAt ? "border-success/40 bg-success/10 relative before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:rounded-l-md before:bg-success/60" : setIndex === activeSetIndex ? "border-primary bg-primary/10 ring-1 ring-primary/20 shadow-sm" : "bg-card hover:border-border/80"}`}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="font-semibold">Set {set.setNumber}</p>
                      {set.completedAt ? <Badge variant="success" className="gap-1"><Check className="h-3 w-3" /> Done</Badge> : <Badge variant="outline">Open</Badge>}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1"><Label>Actual reps</Label><Input className="h-14 text-xl lg:h-12 lg:text-lg" value={set.reps} onChange={(event) => updateSet(activeExerciseIndex, setIndex, { reps: event.target.value })} inputMode="numeric" /></div>
                      <div className="space-y-1"><Label>Weight kg</Label><Input className="h-14 text-xl lg:h-12 lg:text-lg" value={set.weightKg} onChange={(event) => updateSet(activeExerciseIndex, setIndex, { weightKg: event.target.value })} inputMode="decimal" placeholder="0" /></div>
                    </div>
                    <Disclosure title="Set details" description="RPE, RIR, set type, and notes" className="mt-3">
                      <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1"><Label>RPE</Label><Input className="h-14 lg:h-12" value={set.rpe} onChange={(event) => updateSet(activeExerciseIndex, setIndex, { rpe: event.target.value })} inputMode="decimal" placeholder="8" /></div>
                      <div className="space-y-1"><Label>RIR</Label><Input className="h-14 lg:h-12" value={set.rir} onChange={(event) => updateSet(activeExerciseIndex, setIndex, { rir: event.target.value })} inputMode="numeric" placeholder="2" /></div>
                      <div className="space-y-1">
                        <Label>Set type</Label>
                        <select value={set.setType} onChange={(event) => updateSet(activeExerciseIndex, setIndex, { setType: event.target.value as SetState["setType"] })} className="flex h-14 lg:h-12 w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <option value="normal">Normal</option>
                          <option value="warmup">Warm-up</option>
                          <option value="working">Working</option>
                          <option value="failure">Failure</option>
                          <option value="drop">Drop set</option>
                        </select>
                      </div>
                        <div className="space-y-1 sm:col-span-3"><Label>Notes</Label><textarea className="min-h-24 w-full resize-y rounded-[14px] border border-input bg-card px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring" value={set.notes} onChange={(event) => updateSet(activeExerciseIndex, setIndex, { notes: event.target.value })} placeholder="Optional notes about this set" /></div>
                      </div>
                    </Disclosure>
                    {previousSet ? <p className="mt-2 text-xs text-muted-foreground">Previous set: {previousSet.weightKg ?? 0} kg x {previousSet.reps ?? 0}{previousSet.performedAt ? ` on ${previousSet.performedAt.slice(0, 10)}` : ""}</p> : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => applyPreviousSet(activeExerciseIndex, setIndex)} disabled={Boolean(set.completedAt) || !previousSet}><Sparkles className="h-4 w-4" /> Use previous</Button>
                      <Button className="w-full sm:w-auto" onClick={() => finishSet(activeExerciseIndex, setIndex)} disabled={Boolean(set.completedAt)}><CheckCircle2 className="h-4 w-4" /> Finish set</Button>
                      <Button size="sm" variant="outline" onClick={() => restartSet(activeExerciseIndex, setIndex)} disabled={!set.completedAt}><RotateCcw className="h-4 w-4" /> Reopen</Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="lg:sticky lg:bottom-3 z-20 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
              <InlineFeedback message={setFeedback} onClose={() => setSetFeedback("")} />
              <InlineFeedback message={prFeedback} onClose={() => setPrFeedback("")} />
              <div className="grid gap-2 sm:grid-cols-2">
                <Button className="min-h-12" onClick={finishCurrentSet} disabled={!activeSet || Boolean(activeSet.completedAt)}><CheckCircle2 className="h-4 w-4" /> Finish current set</Button>
                <Button className="min-h-12" variant="outline" onClick={restartCurrentSet} disabled={!activeSet?.completedAt}><RotateCcw className="h-4 w-4" /> Reopen set</Button>
              </div>
              {isTimerRunning ? <p className="mt-2 text-center text-sm font-semibold text-primary">Rest timer: {formatTime(timerLeft)}</p> : null}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><TimerReset className="h-5 w-5" /> Rest timer</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2"><Label>Timer seconds</Label><Input type="number" min="0" inputMode="numeric" enterKeyHint="done" value={timerSeconds} onChange={(event) => setTimerSeconds(Math.max(0, Number(event.target.value) || 0))} /></div>
              <div className="grid grid-cols-4 gap-2">
                <Button variant="outline" size="sm" onClick={() => startRestTimer(30)}>30s</Button>
                <Button variant="outline" size="sm" onClick={() => startRestTimer(60)}>60s</Button>
                <Button variant="outline" size="sm" onClick={() => startRestTimer(90)}>90s</Button>
                <Button variant="outline" size="sm" onClick={() => startRestTimer(180)}>3m</Button>
              </div>
              <div className="rounded-md bg-foreground p-5 text-center text-background"><Clock className="mx-auto h-6 w-6" /><p className="mt-2 text-4xl font-bold">{formatTime(timerLeft)}</p></div>
              <div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => startRestTimer(timerSeconds)}>Start timer</Button><Button variant="outline" onClick={stopRestTimer}>Stop</Button></div>
            </CardContent>
          </Card>

          <Disclosure title="Workout summary" description="Volume, completed exercises, and possible records">
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>Total volume: {round(buildSessionSets(exerciseStates).reduce((sum, set) => sum + set.weightKg * set.reps, 0))} kg</p>
              <p>Exercises completed: {exerciseStates.filter((item) => item.sets.some((set) => set.completedAt)).length}/{exerciseStates.length}</p>
              {previewPrs.length ? <p className="font-semibold text-primary"><Trophy className="mr-1 inline h-4 w-4" /> {previewPrs.length} possible PR{previewPrs.length === 1 ? "" : "s"}</p> : <p>No PRs detected yet.</p>}
              <ul className="space-y-1">{liveSuggestions.slice(0, 4).map((suggestion) => <li key={suggestion}>• {suggestion}</li>)}</ul>
            </div>
          </Disclosure>

          <Card>
            <CardHeader><CardTitle>Finish workout</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {isFinished && !completedSummary ? <div className="rounded-[14px] border border-primary/30 bg-primary/5 p-3"><p className="font-semibold text-foreground">All planned sets are complete.</p><p className="mt-1 text-sm text-muted-foreground">Review your note, then save the workout to history.</p></div> : null}
              {completedSummary ? <div id="workout-finish-status" className="rounded-[14px] border border-primary/30 bg-primary/5 p-3" role="status"><p className="font-semibold text-foreground">Workout saved successfully.</p><p className="mt-1 text-sm text-muted-foreground">Your sets, duration, and notes are now in workout history.</p></div> : null}
              <textarea value={sessionNotes} onChange={(event) => setSessionNotes(event.target.value)} placeholder="How did this workout feel?" className="min-h-24 w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              <Button className="w-full hidden lg:inline-flex" onClick={askFinishWorkout} disabled={isSaving || !session}><Save className="h-4 w-4" /> {isSaving ? "Saving..." : isFinished ? "Finish workout" : "Finish and save partial workout"}</Button>
              <p className="text-xs text-muted-foreground">Time spent: {formatTime(elapsedSeconds)}. Completed sets are already saved while the session is open.</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Disclosure title="ChatGPT help" description="Review this workout, make today lighter, or plan the next step">
        <WorkoutAiActionPanel compact sourceType="workout_session" sourceId={session?.id ?? day.id} context={workoutContext} />
      </Disclosure>

      <MobileStickyActions>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold text-foreground">{completedSets}/{totalSets} sets</p>
            <p className="truncate text-xs text-muted-foreground">{formatTime(elapsedSeconds)} elapsed</p>
          </div>
          <Button className="min-h-12 flex-1 text-base" onClick={askFinishWorkout} disabled={isSaving || !session}>
            <Save className="h-5 w-5" />
            {isSaving ? "Saving..." : "Finish Workout"}
          </Button>
        </div>
      </MobileStickyActions>
      <MobileStickyActionsSpacer />
    </div>
  );
}

function InfoBox({ title, lines }: { title: string; lines: string[] }) {
  return <div className="rounded-md border p-3"><p className="font-semibold">{title}</p><div className="mt-2 space-y-1 text-sm text-muted-foreground">{lines.map((line) => <p key={line}>{line}</p>)}</div></div>;
}

function WorkoutSummaryCard({ summary }: { summary: WorkoutSummary }) {
  return (
    <Card className="border-primary bg-primary/10">
      <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> Workout summary saved</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <InfoBox title="Duration" lines={[`${summary.durationMinutes} min`]} />
          <InfoBox title="Volume" lines={[`${summary.totalVolume} kg`]} />
          <InfoBox title="Sets" lines={[`${summary.completedSets} completed`]} />
          <InfoBox title="Exercises" lines={[`${summary.completedExercises} completed`, summary.skippedExercises.length ? `${summary.skippedExercises.length} skipped` : "None skipped"]} />
        </div>
        <InfoBox title="PRs achieved" lines={summary.prs.length ? summary.prs : ["No new PRs detected from this workout."]} />
        <InfoBox title="Progressive overload guidance" lines={summary.suggestions} />
        {summary.skippedExercises.length ? <InfoBox title="Skipped or incomplete exercises" lines={summary.skippedExercises} /> : null}
        {summary.notes ? <InfoBox title="Session notes" lines={[summary.notes]} /> : null}
        <Button asChild><Link href="/my-workout/plans">Back to Workout Plans</Link></Button>
      </CardContent>
    </Card>
  );
}
