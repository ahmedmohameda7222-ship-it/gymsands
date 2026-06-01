"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock, ExternalLink, RotateCcw, Save, TimerReset } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { clearStoredValue, readStoredTimestamp, storeTimestamp, workoutStorageKey } from "@/lib/workout-persistence";
import { completeWorkoutSession, getOrStartWorkoutDaySession, getWorkoutSessionLogs, saveWorkoutSetLogs, updateWorkoutSessionDuration } from "@/services/database/repository";
import type { ExerciseLog, UserWorkoutPlanExercise, WorkoutPlanDaySession, WorkoutSession } from "@/types";

const defaultInstructions = "Use controlled form, keep the target muscle engaged, avoid rushing the eccentric part, and stop if the movement feels painful.";

type SetState = {
  setNumber: number;
  reps: string;
  weightKg: string;
  notes: string;
  completedAt: string | null;
};

type ExerciseState = {
  exercise: UserWorkoutPlanExercise;
  sets: SetState[];
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
      return {
        ...set,
        reps: log.reps === null || log.reps === undefined ? set.reps : String(log.reps),
        weightKg: log.weight_kg === null || log.weight_kg === undefined ? "" : String(log.weight_kg),
        notes: log.notes ?? "",
        completedAt: log.completed_at ?? log.created_at ?? new Date().toISOString()
      };
    })
  }));
}

export function WorkoutDaySession({ day }: { day: WorkoutPlanDaySession }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
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
  const workoutTimerKey = useMemo(() => workoutStorageKey(["workout-day-session", user?.id ?? "mock-user", day.id]), [day.id, user?.id]);
  const restTimerKey = useMemo(() => workoutStorageKey(["workout-day-rest-timer", user?.id ?? "mock-user", day.id]), [day.id, user?.id]);
  const [timerEndsAtMs, setTimerEndsAtMs] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    getOrStartWorkoutDaySession(user?.id ?? "mock-user", day)
      .then(async (nextSession) => {
        if (!active) return;
        setSession(nextSession);
        const parsedStartedAt = Date.parse(nextSession.started_at);
        const storedStartedAt = readStoredTimestamp(workoutTimerKey);
        const nextStartedAt = storedStartedAt ?? (Number.isFinite(parsedStartedAt) ? parsedStartedAt : Date.now());
        setStartedAtMs(nextStartedAt);
        storeTimestamp(workoutTimerKey, nextStartedAt);
        setSessionNotes(nextSession.notes ?? "");
        const existingLogs = await getWorkoutSessionLogs(nextSession.id);
        if (active) setExerciseStates((current) => hydrateStates(current, existingLogs));
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
  }, [day, toast, user, workoutTimerKey]);

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
          notes: set.notes || null,
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
      toast({ title: "Set saved", description: error instanceof Error ? error.message : "Try finishing the workout again if it does not appear in history." });
    }
  }

  async function finishCurrentSet() {
    await finishSet(activeExerciseIndex, activeSetIndex);
  }

  async function restartSet(exerciseIndex: number, setIndex: number) {
    const targetSet = exerciseStates[exerciseIndex]?.sets[setIndex];
    if (!targetSet) return;
    const nextStates = statesWithSetPatch(exerciseIndex, setIndex, { completedAt: null });
    setExerciseStates(nextStates);
    try {
      await persistProgress(nextStates);
    } catch {
      toast({ title: "Could not update this set", description: "Try again in a moment." });
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
      await saveWorkoutSetLogs(session.id, buildLogRows());
      await completeWorkoutSession(session.id, sessionNotes, durationMinutes);
      clearStoredValue(workoutTimerKey);
      clearStoredValue(restTimerKey);
      toast({ title: "Workout saved", description: `${day.day_name} was added to your workout history.` });
      router.push("/my-workout/plans");
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="outline">
          <Link href="/my-workout/plans"><ArrowLeft className="h-4 w-4" /> Back to plan</Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          <Badge>{day.weekday ?? "Workout day"}</Badge>
          <Badge variant="outline">{completedSets}/{totalSets} sets done</Badge>
          <Badge variant="outline">{formatTime(elapsedSeconds)}</Badge>
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
          <p className="text-sm text-muted-foreground">Log each set as you train. Your progress stays visible as the workout moves forward.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={progress} />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {exerciseStates.map((item, index) => {
              const done = item.sets.filter((set) => set.completedAt).length;
              const active = index === activeExerciseIndex;
              const guideUrl = item.exercise.exercise_url || (item.exercise.notes?.startsWith("http") ? item.exercise.notes : null);
              const customVideoUrl = item.exercise.custom_video_url || null;
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
                  className={`rounded-md border p-3 text-left transition ${active ? "border-primary bg-blue-50" : "bg-white hover:border-primary"}`}
                >
                  <p className="truncate text-sm font-semibold">{index + 1}. {item.exercise.exercise_name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{done}/{item.sets.length} sets</p>
                  <div className="mt-3 grid gap-2">
                    {guideUrl ? (
                      <a
                        href={guideUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border bg-white px-2 text-xs font-semibold text-foreground transition hover:bg-secondary"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open Exercise Guide
                      </a>
                    ) : (
                      <span className="inline-flex min-h-9 items-center justify-center rounded-md border px-2 text-xs font-semibold text-muted-foreground">No guide added</span>
                    )}
                    {customVideoUrl ? (
                      <a
                        href={customVideoUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border bg-white px-2 text-xs font-semibold text-foreground transition hover:bg-secondary"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open Custom Video
                      </a>
                    ) : (
                      <span className="inline-flex min-h-9 items-center justify-center rounded-md border px-2 text-xs font-semibold text-muted-foreground">No custom video</span>
                    )}
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
            <CardTitle>{activeExercise.exercise.exercise_name}</CardTitle>
            <div className="flex flex-wrap gap-2 pt-2">
              <Badge variant="outline">Planned {activeExercise.exercise.sets ?? activeExercise.sets.length} sets</Badge>
              <Badge variant="outline">Reps {activeExercise.exercise.reps ?? "custom"}</Badge>
              <Badge variant="outline">Rest {activeExercise.exercise.rest_seconds ?? timerSeconds}s</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md bg-slate-50 p-3 text-sm leading-6 text-slate-700">
              {currentInstructions}
              <div className="mt-3 flex flex-wrap gap-2">
                {currentGuideUrl ? (
                <Button asChild variant="outline" size="sm">
                  <a href={currentGuideUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Open Exercise Guide
                  </a>
                </Button>
              ) : (
                <Button type="button" variant="outline" size="sm" disabled>
                  No guide added
                </Button>
              )}
                {currentCustomVideoUrl ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={currentCustomVideoUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      Open Custom Video
                    </a>
                  </Button>
                ) : (
                  <Button type="button" variant="outline" size="sm" disabled>
                    No custom video
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {activeExercise.sets.map((set, setIndex) => (
                <div key={set.setNumber} className={`rounded-md border p-3 ${set.completedAt ? "border-emerald-300 bg-emerald-50" : setIndex === activeSetIndex ? "border-primary bg-blue-50" : "bg-white"}`}>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="font-semibold">Set {set.setNumber}</p>
                    {set.completedAt ? <Badge variant="success">Done</Badge> : <Badge variant="outline">Open</Badge>}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label>Actual reps</Label>
                      <Input value={set.reps} onChange={(event) => updateSet(activeExerciseIndex, setIndex, { reps: event.target.value })} inputMode="numeric" />
                    </div>
                    <div className="space-y-1">
                      <Label>Weight kg</Label>
                      <Input value={set.weightKg} onChange={(event) => updateSet(activeExerciseIndex, setIndex, { weightKg: event.target.value })} inputMode="decimal" placeholder="0" />
                    </div>
                    <div className="space-y-1">
                      <Label>Notes</Label>
                      <Input value={set.notes} onChange={(event) => updateSet(activeExerciseIndex, setIndex, { notes: event.target.value })} placeholder="Optional" />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => finishSet(activeExerciseIndex, setIndex)} disabled={Boolean(set.completedAt)}>
                      <CheckCircle2 className="h-4 w-4" />
                      Finish Set
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => restartSet(activeExerciseIndex, setIndex)} disabled={!set.completedAt}>
                      <RotateCcw className="h-4 w-4" />
                      Reopen
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={finishCurrentSet} disabled={!activeSet || Boolean(activeSet.completedAt)}>
                <CheckCircle2 className="h-4 w-4" />
                Finish this set
              </Button>
              <Button variant="outline" onClick={restartCurrentSet} disabled={!activeSet?.completedAt}>
                <RotateCcw className="h-4 w-4" />
                Reopen set
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><TimerReset className="h-5 w-5" /> Rest timer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>Timer seconds</Label>
                <Input type="number" min="0" value={timerSeconds} onChange={(event) => setTimerSeconds(Math.max(0, Number(event.target.value) || 0))} />
              </div>
              <div className="rounded-md bg-navy-950 p-5 text-center text-white">
                <Clock className="mx-auto h-6 w-6" />
                <p className="mt-2 text-4xl font-bold">{formatTime(timerLeft)}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => startRestTimer(timerSeconds)}>Start timer</Button>
                <Button variant="outline" onClick={stopRestTimer}>Stop</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Finish workout</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <textarea
                value={sessionNotes}
                onChange={(event) => setSessionNotes(event.target.value)}
                placeholder="How did this workout feel?"
                className="min-h-24 w-full rounded-md border border-input bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button className="w-full" onClick={completeSession} disabled={isSaving || !session}>
                <Save className="h-4 w-4" />
                {isSaving ? "Saving..." : isFinished ? "Finish workout" : "Finish and save partial workout"}
              </Button>
              <p className="text-xs text-muted-foreground">Time spent: {formatTime(elapsedSeconds)}. Completed sets are already saved while the session is open.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
