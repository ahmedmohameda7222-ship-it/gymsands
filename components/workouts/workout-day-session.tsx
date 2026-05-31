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
    if (!isTimerRunning) return;
    if (timerLeft <= 0) {
      setIsTimerRunning(false);
      return;
    }
    const timer = window.setTimeout(() => setTimerLeft((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [isTimerRunning, timerLeft]);

  const activeExercise = exerciseStates[activeExerciseIndex];
  const activeSet = activeExercise?.sets[activeSetIndex];
  const totalSets = exerciseStates.reduce((sum, item) => sum + item.sets.length, 0);
  const completedSets = exerciseStates.reduce((sum, item) => sum + item.sets.filter((set) => set.completedAt).length, 0);
  const progress = totalSets ? Math.round((completedSets / totalSets) * 100) : 0;
  const isFinished = completedSets === totalSets && totalSets > 0;
  const currentVideoUrl = activeExercise?.exercise.video_url || (activeExercise?.exercise.notes?.startsWith("http") ? activeExercise.exercise.notes : null);
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

  function moveToNextSet(states = exerciseStates) {
    const currentExercise = states[activeExerciseIndex];
    if (!currentExercise) return;
    if (activeSetIndex + 1 < currentExercise.sets.length) {
      setActiveSetIndex(activeSetIndex + 1);
      return;
    }
    if (activeExerciseIndex + 1 < states.length) {
      const nextExercise = states[activeExerciseIndex + 1];
      setActiveExerciseIndex(activeExerciseIndex + 1);
      setActiveSetIndex(0);
      setTimerSeconds(nextExercise.exercise.rest_seconds ?? 75);
    }
  }

  async function persistProgress(states = exerciseStates) {
    if (!session) return;
    await saveWorkoutSetLogs(session.id, buildLogRows(states));
    await updateWorkoutSessionDuration(session.id, Math.max(1, Math.ceil((Date.now() - startedAtMs) / 60000)));
  }

  async function finishCurrentSet() {
    if (!activeSet || activeSet.completedAt) return;
    const nextStates = statesWithSetPatch(activeExerciseIndex, activeSetIndex, { completedAt: new Date().toISOString() });
    setExerciseStates(nextStates);
    const hasNextSet = completedSets + 1 < totalSets;
    if (hasNextSet) {
      setTimerLeft(timerSeconds);
      setIsTimerRunning(timerSeconds > 0);
      moveToNextSet(nextStates);
    }
    try {
      await persistProgress(nextStates);
    } catch (error) {
      toast({ title: "Set saved", description: error instanceof Error ? error.message : "Try finishing the workout again if it does not appear in history." });
    }
  }

  async function restartCurrentSet() {
    if (!activeSet) return;
    const nextStates = statesWithSetPatch(activeExerciseIndex, activeSetIndex, { completedAt: null });
    setExerciseStates(nextStates);
    try {
      await persistProgress(nextStates);
    } catch {
      toast({ title: "Could not update this set", description: "Try again in a moment." });
    }
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
      toast({ title: "Workout saved", description: `${day.day_name} was added to your workout history.` });
      router.push("/my-workout");
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
            <Link href="/my-workout"><ArrowLeft className="h-4 w-4" /> Back to plan</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="outline">
          <Link href="/my-workout"><ArrowLeft className="h-4 w-4" /> Back to plan</Link>
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
                  className={`rounded-md border p-3 text-left transition ${active ? "border-primary bg-blue-50" : "bg-white hover:border-primary"}`}
                >
                  <p className="truncate text-sm font-semibold">{index + 1}. {item.exercise.exercise_name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{done}/{item.sets.length} sets</p>
                </button>
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
              {activeExercise.exercise.instructions || defaultInstructions}
              {currentVideoUrl ? (
                <a href={currentVideoUrl} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-2 font-semibold text-primary">
                  Instruction video link <ExternalLink className="h-4 w-4" />
                </a>
              ) : null}
            </div>

            <div className="space-y-3">
              {activeExercise.sets.map((set, setIndex) => (
                <div key={set.setNumber} className={`rounded-md border p-3 ${setIndex === activeSetIndex ? "border-primary bg-blue-50" : "bg-white"}`}>
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
                <Button variant="outline" onClick={() => { setTimerLeft(timerSeconds); setIsTimerRunning(timerSeconds > 0); }}>Start timer</Button>
                <Button variant="outline" onClick={() => { setTimerLeft(0); setIsTimerRunning(false); }}>Stop</Button>
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
