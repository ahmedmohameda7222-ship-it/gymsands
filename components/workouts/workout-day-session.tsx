"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock, ExternalLink, RotateCcw, Save, Sparkles, TimerReset, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { clearStoredValue, readStoredTimestamp, storeTimestamp, workoutStorageKey } from "@/lib/workout-persistence";
import Link from "next/link";
import { completeWorkoutSession, getOrStartWorkoutDaySession, getWorkoutHistoryDetailed, getWorkoutSessionLogs, saveWorkoutSetLogs, updateWorkoutSessionDuration } from "@/services/database/workout-sessions";
import type { ExerciseLog, UserWorkoutPlanExercise, WorkoutPlanDaySession, WorkoutSession, WorkoutSessionSummary } from "@/types";

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
        setSessionNotes(nextSession.notes ?? "");
        const [existingLogs, workoutHistory] = await Promise.all([getWorkoutSessionLogs(nextSession.id), getWorkoutHistoryDetailed(user.id, 100)]);
        if (active) {
          setExerciseStates((current) => hydrateStates(current, existingLogs));
          setHistory(workoutHistory.filter((item) => item.id !== nextSession.id));
        }
      })
      .catch((error) => {
        toast({ title: "Could not start workout session", description: error instanceof Error ? error.message : "Please try again." });
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
    await updateWorkoutSessionDuration(session.id, Math.max(1, Math.ceil((Date.now() - startedAtMs) / 60000)));
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
    } catch (error) {
      toast({ title: "Could not save set", description: error instanceof Error ? error.message : "Try finishing the workout again if it does not appear in history." });
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
      clearStoredValue(workoutTimerKey);
      clearStoredValue(restTimerKey);
      setCompletedSummary(summary);
      toast({ title: "Workout saved", description: `${day.day_name} was added to your workout history.` });
    } catch (error) {
      toast({ title: "Could not save workout", description: error instanceof Error ? error.message : "Please try again." });
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
      {completedSummary ? <WorkoutSummaryCard summary={completedSummary} /> : null}

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
          <Button variant="outline" size="sm" onClick={resetWorkoutTimer}>
            <TimerReset className="h-4 w-4" />
            Reset workout timer
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{day.day_name}</CardTitle>
          <p className="text-sm text-muted-foreground">Log each set as you train. Previous performance and PR checks use real saved workout history only.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={progress} />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {exerciseStates.map((item, index) => {
              const done = item.sets.filter((set) => set.completedAt).length;
              const active = index === activeExerciseIndex;
              const guideUrl = item.exercise.exercise_url || (item.exercise.notes?.startsWith("http") ? item.exercise.notes : null);
              const customVideoUrl = item.exercise.custom_video_url || null;
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
                  className={`rounded-md border p-3 text-left transition-colors ${active ? "border-primary bg-primary/10" : "bg-card hover:border-primary/45"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{index + 1}. {item.exercise.exercise_name}</p>
                    {group ? <Badge variant="navy">{group}</Badge> : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{done}/{item.sets.length} sets</p>
                  <p className="mt-1 text-xs text-muted-foreground">{previous ? `Last: ${previous.lastWeightKg ?? 0} kg x ${previous.lastReps ?? 0}` : "No previous data"}</p>
                  <div className="mt-3 grid gap-2">
                    {guideUrl ? (
                      <a href={guideUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border bg-white px-2 text-xs font-semibold text-foreground transition hover:bg-secondary">
                        <ExternalLink className="h-3.5 w-3.5" /> Open Exercise Guide
                      </a>
                    ) : <span className="inline-flex min-h-9 items-center justify-center rounded-md border px-2 text-xs font-semibold text-muted-foreground">No guide added</span>}
                    {customVideoUrl ? (
                      <a href={customVideoUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border bg-white px-2 text-xs font-semibold text-foreground transition hover:bg-secondary">
                        <ExternalLink className="h-3.5 w-3.5" /> Open Custom Video
                      </a>
                    ) : <span className="inline-flex min-h-9 items-center justify-center rounded-md border px-2 text-xs font-semibold text-muted-foreground">No custom video</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {activeExercise.exercise.exercise_name}
              {supersetLabel(activeExercise.exercise) ? <Badge variant="navy">Superset {supersetLabel(activeExercise.exercise)}</Badge> : null}
            </CardTitle>
            <div className="flex flex-wrap gap-2 pt-2">
              <Badge variant="outline">Planned {activeExercise.exercise.sets ?? activeExercise.sets.length} sets</Badge>
              <Badge variant="outline">Reps {activeExercise.exercise.reps ?? "custom"}</Badge>
              <Badge variant="outline">Rest {activeExercise.exercise.rest_seconds ?? timerSeconds}s</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md bg-muted/40 p-3 text-sm leading-6 text-muted-foreground">
              {currentInstructions}
              <div className="mt-3 flex flex-wrap gap-2">
                {currentGuideUrl ? (
                  <Button asChild variant="outline" size="sm"><a href={currentGuideUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Open Exercise Guide</a></Button>
                ) : <Button type="button" variant="outline" size="sm" disabled>No guide added</Button>}
                {currentCustomVideoUrl ? (
                  <Button asChild variant="outline" size="sm"><a href={currentCustomVideoUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Open Custom Video</a></Button>
                ) : <Button type="button" variant="outline" size="sm" disabled>No custom video</Button>}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <InfoBox title="Previous performance" lines={activePreviousPerformance ? [
                `Last used: ${activePreviousPerformance.lastWeightKg ?? 0} kg x ${activePreviousPerformance.lastReps ?? 0}`,
                `Last best set: ${activePreviousPerformance.lastBestSet ?? "No previous data"}`,
                `Last performed: ${activePreviousPerformance.lastPerformedAt ? activePreviousPerformance.lastPerformedAt.slice(0, 10) : "No previous data"}`
              ] : ["No previous data"]} />
              <InfoBox title="Overload guidance" lines={[buildProgressiveSuggestion(activeExercise)]} />
            </div>

            <div className="space-y-3">
              {activeExercise.sets.map((set, setIndex) => {
                const previousSet = previousSetForExercise(history, activeExercise.exercise.exercise_name, set.setNumber);
                return (
                  <div key={set.setNumber} className={`rounded-md border p-3 ${set.completedAt ? "border-success/40 bg-success/10" : setIndex === activeSetIndex ? "border-primary bg-primary/10" : "bg-card"}`}>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="font-semibold">Set {set.setNumber}</p>
                      {set.completedAt ? <Badge variant="success">Done</Badge> : <Badge variant="outline">Open</Badge>}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      <div className="space-y-1"><Label>Actual reps</Label><Input className="h-12 text-lg" value={set.reps} onChange={(event) => updateSet(activeExerciseIndex, setIndex, { reps: event.target.value })} inputMode="numeric" /></div>
                      <div className="space-y-1"><Label>Weight kg</Label><Input className="h-12 text-lg" value={set.weightKg} onChange={(event) => updateSet(activeExerciseIndex, setIndex, { weightKg: event.target.value })} inputMode="decimal" placeholder="0" /></div>
                      <div className="space-y-1"><Label>RPE</Label><Input className="h-12" value={set.rpe} onChange={(event) => updateSet(activeExerciseIndex, setIndex, { rpe: event.target.value })} inputMode="decimal" placeholder="8" /></div>
                      <div className="space-y-1"><Label>RIR</Label><Input className="h-12" value={set.rir} onChange={(event) => updateSet(activeExerciseIndex, setIndex, { rir: event.target.value })} inputMode="numeric" placeholder="2" /></div>
                      <div className="space-y-1">
                        <Label>Set type</Label>
                        <select value={set.setType} onChange={(event) => updateSet(activeExerciseIndex, setIndex, { setType: event.target.value as SetState["setType"] })} className="flex h-12 w-full rounded-md border border-input bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <option value="normal">Normal</option>
                          <option value="warmup">Warm-up</option>
                          <option value="working">Working</option>
                          <option value="failure">Failure</option>
                          <option value="drop">Drop set</option>
                        </select>
                      </div>
                      <div className="space-y-1 lg:col-span-5"><Label>Notes</Label><Input className="h-12" value={set.notes} onChange={(event) => updateSet(activeExerciseIndex, setIndex, { notes: event.target.value })} placeholder="Optional" /></div>
                    </div>
                    {previousSet ? <p className="mt-2 text-xs text-muted-foreground">Previous set: {previousSet.weightKg ?? 0} kg x {previousSet.reps ?? 0}{previousSet.performedAt ? ` on ${previousSet.performedAt.slice(0, 10)}` : ""}</p> : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => applyPreviousSet(activeExerciseIndex, setIndex)} disabled={Boolean(set.completedAt) || !previousSet}><Sparkles className="h-4 w-4" /> Use previous</Button>
                      <Button size="sm" onClick={() => finishSet(activeExerciseIndex, setIndex)} disabled={Boolean(set.completedAt)}><CheckCircle2 className="h-4 w-4" /> Finish Set</Button>
                      <Button size="sm" variant="outline" onClick={() => restartSet(activeExerciseIndex, setIndex)} disabled={!set.completedAt}><RotateCcw className="h-4 w-4" /> Reopen</Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="sticky bottom-3 z-20 rounded-xl border bg-white/95 p-3 shadow-lg backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
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
              <div className="rounded-md bg-navy-950 p-5 text-center text-white"><Clock className="mx-auto h-6 w-6" /><p className="mt-2 text-4xl font-bold">{formatTime(timerLeft)}</p></div>
              <div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => startRestTimer(timerSeconds)}>Start timer</Button><Button variant="outline" onClick={stopRestTimer}>Stop</Button></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Live workout summary</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Total volume: {round(buildSessionSets(exerciseStates).reduce((sum, set) => sum + set.weightKg * set.reps, 0))} kg</p>
              <p>Exercises completed: {exerciseStates.filter((item) => item.sets.some((set) => set.completedAt)).length}/{exerciseStates.length}</p>
              {previewPrs.length ? <p className="font-semibold text-primary"><Trophy className="mr-1 inline h-4 w-4" /> {previewPrs.length} possible PR{previewPrs.length === 1 ? "" : "s"}</p> : <p>No PRs detected yet.</p>}
              <ul className="space-y-1">{liveSuggestions.slice(0, 4).map((suggestion) => <li key={suggestion}>• {suggestion}</li>)}</ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Finish workout</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <textarea value={sessionNotes} onChange={(event) => setSessionNotes(event.target.value)} placeholder="How did this workout feel?" className="min-h-24 w-full rounded-md border border-input bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              <Button className="w-full" onClick={completeSession} disabled={isSaving || !session}><Save className="h-4 w-4" /> {isSaving ? "Saving..." : isFinished ? "Finish workout" : "Finish and save partial workout"}</Button>
              <p className="text-xs text-muted-foreground">Time spent: {formatTime(elapsedSeconds)}. Completed sets are already saved while the session is open.</p>
            </CardContent>
          </Card>
        </div>
      </div>
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
