"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, ExternalLink, Plus, Timer, TimerReset, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MobileStickyActions, MobileStickyActionsSpacer } from "@/components/layout/mobile-sticky-actions";
import { useToast } from "@/components/ui/toaster";
import { useAuth } from "@/components/auth/auth-provider";
import { logRecoverableError, userSafeError } from "@/lib/error-formatting";
import { clearStoredValue, readStoredTimestamp, storeTimestamp, workoutStorageKey } from "@/lib/workout-persistence";
import { completeWorkoutSession, getWorkoutHistoryDetailed, saveWorkoutSetLogs, startWorkoutSession } from "@/services/database/workout-sessions";
import type { Workout, WorkoutSession, WorkoutSessionSummary } from "@/types";
import { useConfirm, ConfirmDialog } from "@/components/ui/confirm-dialog";

type SetLog = {
  reps: number;
  weight: number;
  notes: string;
};

function isLink(value: string | null | undefined) {
  return Boolean(value && /^https?:\/\//i.test(value));
}

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function WorkoutSessionForm({ workout }: { workout: Workout }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { dialog: confirmDialog, ask: confirmAsk } = useConfirm();
  const router = useRouter();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [duration, setDuration] = useState(45);
  const [notes, setNotes] = useState("");
  const [sets, setSets] = useState<SetLog[]>([{ reps: 10, weight: 0, notes: "" }]);
  const [isSaving, setIsSaving] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [startedAtMs, setStartedAtMs] = useState(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timerSeconds, setTimerSeconds] = useState(workout.rest_seconds ?? 60);
  const [timerLeft, setTimerLeft] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timerEndsAtMs, setTimerEndsAtMs] = useState<number | null>(null);
  const [history, setHistory] = useState<WorkoutSessionSummary[]>([]);
  const timerKey = useMemo(() => workoutStorageKey(["single-workout-session", user?.id ?? "anonymous", workout.id]), [user?.id, workout.id]);
  const restTimerKey = useMemo(() => workoutStorageKey(["single-workout-rest", user?.id ?? "anonymous", workout.id]), [user?.id, workout.id]);
  const guideUrl = workout.exercise_url || (isLink(workout.notes) ? workout.notes : null);
  const customVideoUrl = workout.custom_video_url || null;

  const [previousSet, setPreviousSet] = useState<{ reps: number | null; weightKg: number | null; performedAt: string | null } | null>(null);

  useEffect(() => {
    if (!history.length) {
      setPreviousSet(null);
      return;
    }
    const normalizedName = workout.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    for (const session of history) {
      const logs = (session.exercise_logs ?? [])
        .filter((log) => log.exercise_name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === normalizedName)
        .filter((log) => Number(log.reps ?? 0) > 0 || Number(log.weight_kg ?? 0) > 0)
        .sort((a, b) => new Date(b.completed_at || b.created_at).getTime() - new Date(a.completed_at || a.created_at).getTime());
      if (logs.length) {
        const latest = logs[0];
        setPreviousSet({ reps: latest.reps, weightKg: latest.weight_kg, performedAt: session.completed_at || session.started_at });
        return;
      }
    }
    setPreviousSet(null);
  }, [history, workout.name]);

  useEffect(() => {
    if (!user?.id) return;
    getWorkoutHistoryDetailed(user.id, 20)
      .then((items) => setHistory(items))
      .catch(() => setHistory([]));
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    startWorkoutSession(user.id, workout)
      .then((nextSession) => {
        setSession(nextSession);
        setSessionError(null);
        const parsedStartedAt = Date.parse(nextSession.started_at);
        const storedStartedAt = readStoredTimestamp(timerKey);
        const nextStartedAt = storedStartedAt ?? (Number.isFinite(parsedStartedAt) ? parsedStartedAt : Date.now());
        setStartedAtMs(nextStartedAt);
        storeTimestamp(timerKey, nextStartedAt);
      })
      .catch((error) => {
        logRecoverableError("workout-session.start", error);
        const message = userSafeError(error, "This workout could not connect to your account. Please refresh and try again.");
        setSessionError(message);
        toast({
          title: "Workout was not connected",
          description: message
        });
      });
  }, [timerKey, toast, user?.id, workout]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const seconds = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
      setElapsedSeconds(seconds);
      setDuration(Math.max(1, Math.ceil(seconds / 60)));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [startedAtMs]);

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
      }
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [restTimerKey, timerEndsAtMs, toast]);

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

  async function complete() {
    if (isSaving) return;
    if (!user?.id) {
      toast({ title: "Sign in required", description: "Please sign in before saving workouts." });
      return;
    }
    if (!session?.id) {
      toast({ title: "Workout is not ready to save", description: sessionError ?? "Please refresh this workout and try again." });
      return;
    }
    try {
      setIsSaving(true);
      await saveWorkoutSetLogs(
        session.id,
        sets.map((set, index) => ({
          exerciseName: workout.name,
          exerciseCategory: workout.category || workout.target_muscle,
          exerciseOrder: 1,
          plannedSets: workout.sets ?? sets.length,
          plannedReps: workout.reps,
          plannedRestSeconds: workout.rest_seconds,
          setNumber: index + 1,
          reps: Number.isFinite(set.reps) ? set.reps : null,
          weightKg: Number.isFinite(set.weight) ? set.weight : null,
          notes: set.notes || null,
          completedAt: new Date().toISOString()
        }))
      );
      await completeWorkoutSession(session.id, notes, duration);
      clearStoredValue(timerKey);
      clearStoredValue(restTimerKey);
      toast({ title: "Workout completed", description: `${workout.name} was saved to your Plaivra history.` });
      router.push("/workout-history");
    } catch (error) {
      logRecoverableError("workout-session.complete", error);
      toast({
        title: "Could not save workout",
        description: userSafeError(error, "Your set entries are still on screen. Please try saving again.")
      });
    } finally {
      setIsSaving(false);
    }
  }

  function askComplete() {
    confirmAsk({
      title: "Finish workout?",
      description: "This will save your workout to history.",
      confirmLabel: "Finish",
      cancelLabel: "Keep Training",
      onConfirm: () => complete()
    });
  }

  function resetWorkoutTimer() {
    const nextStartedAt = Date.now();
    setStartedAtMs(nextStartedAt);
    setElapsedSeconds(0);
    setDuration(1);
    storeTimestamp(timerKey, nextStartedAt);
  }

  return (
    <div className="space-y-4 pb-24 lg:pb-0">
      {confirmDialog}
      <Card>
        <CardHeader>
          <CardTitle>{workout.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md bg-muted/40 p-3 text-sm leading-6 text-muted-foreground">
            <p>{workout.instructions || "Use controlled form and stop if the movement feels painful."}</p>
            <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
              {guideUrl ? (
                <Button asChild variant="outline" size="sm">
                  <a href={guideUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Open Exercise Guide
                  </a>
                </Button>
              ) : (
                <Button type="button" variant="outline" size="sm" disabled>
                  No guide added
                </Button>
              )}
              {customVideoUrl ? (
                <Button asChild variant="outline" size="sm">
                  <a href={customVideoUrl} target="_blank" rel="noreferrer">
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
          {sessionError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {sessionError}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/40 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Clock className="h-4 w-4 text-primary" />
              Time: {formatTime(elapsedSeconds)}
            </div>
            <div className="flex items-center gap-2">
              {isTimerRunning ? (
                <div className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary">
                  <Timer className="h-4 w-4" />
                  {formatTime(timerLeft)}
                </div>
              ) : null}
              <Button type="button" variant="outline" size="sm" onClick={resetWorkoutTimer}>
                <TimerReset className="h-4 w-4" />
                Reset
              </Button>
            </div>
          </div>

          {previousSet ? (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
              <p className="font-semibold text-foreground">Previous set</p>
              <p className="text-muted-foreground">{previousSet.weightKg ?? 0} kg × {previousSet.reps ?? 0}{previousSet.performedAt ? ` on ${previousSet.performedAt.slice(0, 10)}` : ""}</p>
            </div>
          ) : null}

          <div className="grid grid-cols-4 gap-2">
            <Button variant="outline" size="sm" onClick={() => startRestTimer(30)}>30s</Button>
            <Button variant="outline" size="sm" onClick={() => startRestTimer(60)}>60s</Button>
            <Button variant="outline" size="sm" onClick={() => startRestTimer(90)}>90s</Button>
            <Button variant="outline" size="sm" onClick={() => startRestTimer(180)}>3m</Button>
          </div>

          {sets.map((set, index) => (
            <div key={index} className="rounded-xl border bg-card p-4">
              <p className="mb-3 text-base font-semibold">Set {index + 1}</p>
              <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor={`reps-${index}`}>Reps</Label>
                  <Input
                    id={`reps-${index}`}
                    className="h-14 text-2xl font-semibold"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={set.reps}
                    onChange={(event) =>
                      setSets((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, reps: Number(event.target.value) } : item)))
                    }
                    placeholder="10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`weight-${index}`}>Weight kg</Label>
                  <Input
                    id={`weight-${index}`}
                    className="h-14 text-2xl font-semibold"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.5"
                    value={set.weight}
                    onChange={(event) =>
                      setSets((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, weight: Number(event.target.value) } : item)))
                    }
                    placeholder="40"
                  />
                </div>
                <div className="space-y-2 col-span-2 lg:col-span-1">
                  <Label htmlFor={`set-note-${index}`}>Set note</Label>
                  <Input
                    id={`set-note-${index}`}
                    className="h-12"
                    value={set.notes}
                    onChange={(event) =>
                      setSets((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, notes: event.target.value } : item)))
                    }
                    placeholder="Optional"
                  />
                </div>
              </div>
            </div>
          ))}
          <Button className="w-full sm:w-auto" variant="outline" onClick={() => setSets((current) => [...current, { reps: 10, weight: 0, notes: "" }])}>
            <Plus className="h-4 w-4" />
            Add set
          </Button>
          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
            <div className="space-y-2">
              <Label htmlFor="duration">Duration minutes</Label>
              <Input
                id="duration"
                type="number"
                min="1"
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value))}
                placeholder="Workout duration, e.g. 45"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workout-notes">Workout notes</Label>
              <Input
                id="workout-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Workout note, e.g. felt strong today"
              />
            </div>
          </div>
          <Button className="hidden w-full lg:inline-flex" onClick={askComplete} disabled={isSaving || Boolean(sessionError) || !session}>
            <CheckCircle2 className="h-4 w-4" />
            {isSaving ? "Saving workout..." : "Mark workout completed"}
          </Button>
        </CardContent>
      </Card>

      <MobileStickyActions>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold text-foreground">{formatTime(elapsedSeconds)}</p>
            <p className="truncate text-xs text-muted-foreground">{sets.length} set{sets.length === 1 ? "" : "s"} ready to save</p>
          </div>
          <Button className="min-h-12 flex-1 text-base" onClick={askComplete} disabled={isSaving || Boolean(sessionError) || !session}>
            <CheckCircle2 className="h-5 w-5" />
            {isSaving ? "Saving..." : "Finish"}
          </Button>
        </div>
      </MobileStickyActions>
      <MobileStickyActionsSpacer />
    </div>
  );
}
