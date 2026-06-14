"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, ExternalLink, Plus, TimerReset } from "lucide-react";
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
import { completeWorkoutSession, saveWorkoutSetLogs, startWorkoutSession } from "@/services/database/workout-sessions";
import type { Workout, WorkoutSession } from "@/types";

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
  const router = useRouter();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [duration, setDuration] = useState(45);
  const [notes, setNotes] = useState("");
  const [sets, setSets] = useState<SetLog[]>([{ reps: 10, weight: 0, notes: "" }]);
  const [isSaving, setIsSaving] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [startedAtMs, setStartedAtMs] = useState(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerKey = useMemo(() => workoutStorageKey(["single-workout-session", user?.id ?? "anonymous", workout.id]), [user?.id, workout.id]);
  const guideUrl = workout.exercise_url || (isLink(workout.notes) ? workout.notes : null);
  const customVideoUrl = workout.custom_video_url || null;

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
      toast({ title: "Workout completed", description: `${workout.name} was saved to your FitLife Hub history.` });
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

  function resetWorkoutTimer() {
    const nextStartedAt = Date.now();
    setStartedAtMs(nextStartedAt);
    setElapsedSeconds(0);
    setDuration(1);
    storeTimestamp(timerKey, nextStartedAt);
  }

  return (
    <div className="space-y-4 pb-24 lg:pb-0">
      <Card>
        <CardHeader>
          <CardTitle>Log workout results</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md bg-slate-50 p-3 text-sm leading-6 text-slate-700">
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
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-slate-50 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
              <Clock className="h-4 w-4 text-primary" />
              Time spent: {formatTime(elapsedSeconds)}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={resetWorkoutTimer}>
              <TimerReset className="h-4 w-4" />
              Reset workout timer
            </Button>
          </div>
          {sets.map((set, index) => (
            <div key={index} className="rounded-xl border bg-card p-4">
              <p className="mb-3 text-base font-semibold">Set {index + 1}</p>
              <div className="grid gap-3 sm:grid-cols-3">
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
                <div className="space-y-2">
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
          <Button className="hidden w-full lg:inline-flex" onClick={complete} disabled={isSaving || Boolean(sessionError) || !session}>
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
          <Button className="min-h-12 flex-1" onClick={complete} disabled={isSaving || Boolean(sessionError) || !session}>
            <CheckCircle2 className="h-4 w-4" />
            {isSaving ? "Saving..." : "Finish"}
          </Button>
        </div>
      </MobileStickyActions>
      <MobileStickyActionsSpacer />
    </div>
  );
}
