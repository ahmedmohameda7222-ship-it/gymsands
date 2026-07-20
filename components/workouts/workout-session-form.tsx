"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Clock, ExternalLink, Plus, Timer, TimerReset } from "lucide-react";
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
import { activeWorkoutCacheFromExecution, clearActiveWorkoutState, isValidActiveWorkoutRoute, readActiveWorkoutState, writeActiveWorkoutState } from "@/lib/active-workout";
import { getOrStartWorkoutSession } from "@/services/database/direct-workout-sessions";
import { completeWorkoutSession, getWorkoutHistoryDetailed } from "@/services/database/workout-sessions";
import type { Workout, WorkoutSession, WorkoutSessionExecutionState, WorkoutSessionSummary } from "@/types";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useSuccessFeedback } from "@/components/feedback/success-feedback";
import { useTrainTranslation } from "@/lib/i18n/train";
import { findPreviousWorkoutSet } from "@/lib/workouts/workout-session-history";
import { getActiveWorkoutDeviceId } from "@/lib/workouts/active-workout-device";
import { executionElapsedSeconds, executionRestSecondsLeft, executionStartedAtMs } from "@/lib/workouts/workout-session-execution";
import {
  clearWorkoutSessionRestTimer,
  getWorkoutSessionExecutionCursorItems,
  importLegacyWorkoutExecutionCache,
  persistWorkoutSessionCursor,
  persistWorkoutSessionRestTimer,
  persistWorkoutSessionTimerReset,
  requireWorkoutSessionExecutionState
} from "@/services/database/workout-session-execution";

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
  const { celebrate } = useSuccessFeedback();
  const { dialog: confirmDialog, ask: confirmAsk } = useConfirm();
  const router = useRouter();
  const { dir, tr } = useTrainTranslation();
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
  const [executionState, setExecutionState] = useState<WorkoutSessionExecutionState | null>(null);
  const executionWriteRef = useRef<Promise<unknown>>(Promise.resolve());
  const executionHydratedRef = useRef(false);
  const controllerDeviceIdRef = useRef<string | null>(null);
  const timerKey = useMemo(() => workoutStorageKey(["single-workout-session", user?.id ?? "anonymous", workout.id]), [user?.id, workout.id]);
  const restTimerKey = useMemo(() => workoutStorageKey(["single-workout-rest", user?.id ?? "anonymous", workout.id]), [user?.id, workout.id]);
  const guideUrl = workout.exercise_url || (isLink(workout.notes) ? workout.notes : null);
  const customVideoUrl = workout.custom_video_url || null;

  const [previousSet, setPreviousSet] = useState<{ reps: number | null; weightKg: number | null; performedAt: string | null } | null>(null);

  const mirrorExecutionState = useCallback((next: WorkoutSessionExecutionState) => {
    setExecutionState(next);
    const now = Date.now();
    const derivedStartedAt = executionStartedAtMs(next, now);
    setStartedAtMs(derivedStartedAt);
    setElapsedSeconds(executionElapsedSeconds(next, now));
    setDuration(Math.max(1, Math.ceil(executionElapsedSeconds(next, now) / 60)));
    storeTimestamp(timerKey, derivedStartedAt);
    const restLeft = executionRestSecondsLeft(next, now);
    const restEndsAt = next.rest_ends_at ? Date.parse(next.rest_ends_at) : Number.NaN;
    if (next.view_state === "rest" && restLeft > 0 && Number.isFinite(restEndsAt)) {
      setTimerSeconds(next.rest_duration_seconds ?? restLeft);
      setTimerLeft(restLeft);
      setTimerEndsAtMs(restEndsAt);
      setIsTimerRunning(true);
      storeTimestamp(restTimerKey, restEndsAt);
    } else {
      setTimerLeft(0);
      setTimerEndsAtMs(null);
      setIsTimerRunning(false);
      clearStoredValue(restTimerKey);
    }
    if (user?.id) {
      writeActiveWorkoutState(user.id, activeWorkoutCacheFromExecution(next, {
        route: `/workouts/session/${workout.id}`,
        label: workout.name,
        controllerDeviceId: controllerDeviceIdRef.current
      }, now));
    }
  }, [restTimerKey, timerKey, user, workout.id, workout.name]);

  const queueExecutionWrite = useCallback((write: () => Promise<WorkoutSessionExecutionState>, rollback?: () => void) => {
    const operation = executionWriteRef.current.then(write);
    executionWriteRef.current = operation.then(
      (next) => { mirrorExecutionState(next); },
      (error) => {
        rollback?.();
        const message = userSafeError(error, tr("setEntriesPreserved"));
        setSessionError(message);
        toast({ title: tr("couldNotSaveWorkout"), description: message });
      }
    );
    return operation;
  }, [mirrorExecutionState, toast, tr]);

  useEffect(() => {
    setPreviousSet(findPreviousWorkoutSet(history, workout));
  }, [history, workout]);

  useEffect(() => {
    if (!user?.id) return;
    getWorkoutHistoryDetailed(user.id, 20)
      .then((items) => setHistory(items))
      .catch(() => setHistory([]));
  }, [user?.id]);

  useEffect(() => {
    let active = true;
    executionHydratedRef.current = false;
    if (!user?.id) return () => { active = false; };
    const sessionRoute = `/workouts/session/${workout.id}`;
    const storedActiveWorkout = readActiveWorkoutState(user.id);
    const candidateSessionId = storedActiveWorkout
      && storedActiveWorkout.route === sessionRoute
      && isValidActiveWorkoutRoute(storedActiveWorkout.route)
      ? storedActiveWorkout.sessionId
      : null;

    getOrStartWorkoutSession(user.id, workout, candidateSessionId)
      .then(async (nextSession) => {
        if (!active) return;
        setSession(nextSession);
        setSessionError(null);
        controllerDeviceIdRef.current = getActiveWorkoutDeviceId();
        const storedStartedAt = readStoredTimestamp(timerKey);
        const storedRestEndsAt = readStoredTimestamp(restTimerKey);
        const [persistedState, cursorItems] = await Promise.all([
          requireWorkoutSessionExecutionState(user.id, nextSession.id),
          getWorkoutSessionExecutionCursorItems(user.id, nextSession.id)
        ]);
        let authoritativeState = persistedState;
        if (persistedState.bootstrap_source === "legacy_backfill" && persistedState.revision === 0) {
          try {
            const imported = await importLegacyWorkoutExecutionCache(
              user.id,
              nextSession.id,
              persistedState,
              storedStartedAt,
              controllerDeviceIdRef.current,
              new Date(),
              { endsAtMs: storedRestEndsAt, durationSeconds: workout.rest_seconds ?? 60 }
            );
            authoritativeState = imported.state;
          } catch (error) {
            console.warn("Plaivra could not import the optional legacy direct-workout timer cache.", error);
          }
        }
        if (controllerDeviceIdRef.current && authoritativeState.controller_device_id !== controllerDeviceIdRef.current) {
          authoritativeState = await persistWorkoutSessionCursor(user.id, nextSession.id, {
            snapshotItemId: authoritativeState.active_snapshot_item_id,
            itemOrder: authoritativeState.active_item_order,
            setNumber: authoritativeState.active_set_number,
            controllerDeviceId: controllerDeviceIdRef.current
          });
        }
        if (authoritativeState.view_state === "rest" && executionRestSecondsLeft(authoritativeState) <= 0) {
          authoritativeState = await clearWorkoutSessionRestTimer(
            user.id,
            nextSession.id,
            "set_entry",
            controllerDeviceIdRef.current
          );
        }
        const cursorItem = cursorItems.find((item) => item.id === authoritativeState.active_snapshot_item_id)
          ?? cursorItems.find((item) => item.itemOrder === authoritativeState.active_item_order)
          ?? cursorItems[0]
          ?? null;
        if (authoritativeState.controller_device_id !== controllerDeviceIdRef.current
            || authoritativeState.active_snapshot_item_id !== (cursorItem?.id ?? null)) {
          authoritativeState = await persistWorkoutSessionCursor(user.id, nextSession.id, {
            snapshotItemId: cursorItem?.id ?? null,
            itemOrder: cursorItem?.itemOrder ?? 1,
            setNumber: Math.max(1, authoritativeState.active_set_number),
            controllerDeviceId: controllerDeviceIdRef.current
          });
        }
        if (!active) return;
        mirrorExecutionState(authoritativeState);
        executionHydratedRef.current = true;
      })
      .catch((error) => {
        logRecoverableError("workout-session.start", error);
        const message = userSafeError(error, tr("sessionConnectFailed"));
        setSessionError(message);
        toast({ title: tr("sessionConnectFailed"), description: message });
      });

    return () => { active = false; };
  }, [mirrorExecutionState, restTimerKey, timerKey, toast, tr, user?.id, workout]);

  useEffect(() => {
    const tick = () => {
      const seconds = executionState
        ? executionElapsedSeconds(executionState)
        : Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
      setElapsedSeconds(seconds);
      setDuration(Math.max(1, Math.ceil(seconds / 60)));
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [executionState, startedAtMs]);

  useEffect(() => {
    if (!timerEndsAtMs) return;
    const tick = () => {
      const nextLeft = Math.max(0, Math.ceil((timerEndsAtMs - Date.now()) / 1000));
      setTimerLeft(nextLeft);
      if (nextLeft <= 0) {
        setTimerEndsAtMs(null);
        setIsTimerRunning(false);
        clearStoredValue(restTimerKey);
        if (user?.id && session?.id && executionHydratedRef.current) {
          void queueExecutionWrite(() => clearWorkoutSessionRestTimer(
            user.id,
            session.id,
            "set_entry",
            controllerDeviceIdRef.current
          ));
        }
        toast({ title: tr("restFinished"), description: tr("nextSetReady") });
      }
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [queueExecutionWrite, restTimerKey, session?.id, timerEndsAtMs, toast, tr, user?.id]);

  function startRestTimer(seconds: number) {
    const safeSeconds = Math.max(0, seconds);
    if (!safeSeconds) return;
    const previous = { timerSeconds, timerLeft, timerEndsAtMs, isTimerRunning };
    const deadline = Date.now() + safeSeconds * 1000;
    setTimerSeconds(safeSeconds);
    setTimerLeft(safeSeconds);
    setTimerEndsAtMs(deadline);
    setIsTimerRunning(true);
    storeTimestamp(restTimerKey, deadline);
    if (user?.id && session?.id && executionHydratedRef.current) {
      void queueExecutionWrite(
        () => persistWorkoutSessionRestTimer(user.id, session.id, safeSeconds, controllerDeviceIdRef.current),
        () => {
          setTimerSeconds(previous.timerSeconds);
          setTimerLeft(previous.timerLeft);
          setTimerEndsAtMs(previous.timerEndsAtMs);
          setIsTimerRunning(previous.isTimerRunning);
          if (previous.timerEndsAtMs) storeTimestamp(restTimerKey, previous.timerEndsAtMs);
          else clearStoredValue(restTimerKey);
        }
      );
    }
  }

  async function complete() {
    if (isSaving) return;
    if (!user?.id) {
      toast({ title: tr("signInRequired"), description: tr("signInBeforeSaving") });
      return;
    }
    if (!session?.id) {
      toast({ title: tr("workoutNotReady"), description: sessionError ?? tr("refreshTryAgain") });
      return;
    }
    try {
      setIsSaving(true);
      await completeWorkoutSession(
        session.id,
        notes,
        duration,
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
      clearActiveWorkoutState(user.id);
      clearStoredValue(timerKey);
      clearStoredValue(restTimerKey);
      toast({ title: tr("workoutCompleted"), description: tr("workoutSavedHistory", { name: workout.name }) });
      celebrate("Workout complete");
      router.push("/workout-history");
    } catch (error) {
      logRecoverableError("workout-session.complete", error);
      toast({
        title: tr("couldNotSaveWorkout"),
        description: userSafeError(error, tr("setEntriesPreserved"))
      });
    } finally {
      setIsSaving(false);
    }
  }

  function askComplete() {
    confirmAsk({
      title: tr("finishWorkoutQuestion"),
      description: tr("finishWorkoutDescription"),
      confirmLabel: tr("finish"),
      cancelLabel: tr("keepTraining"),
      onConfirm: () => complete()
    });
  }

  function resetWorkoutTimer() {
    const previousStartedAt = startedAtMs;
    const previousElapsed = elapsedSeconds;
    const previousDuration = duration;
    const nextStartedAt = Date.now();
    setStartedAtMs(nextStartedAt);
    setElapsedSeconds(0);
    setDuration(1);
    storeTimestamp(timerKey, nextStartedAt);
    if (user?.id && session?.id && executionHydratedRef.current) {
      void queueExecutionWrite(
        () => persistWorkoutSessionTimerReset(user.id, session.id, controllerDeviceIdRef.current),
        () => {
          setStartedAtMs(previousStartedAt);
          setElapsedSeconds(previousElapsed);
          setDuration(previousDuration);
          storeTimestamp(timerKey, previousStartedAt);
        }
      );
    }
  }

  return (
    <div className="space-y-4 pb-24 lg:pb-0" dir={dir}>
      {confirmDialog}
      <Card>
        <CardHeader>
          <CardTitle>{workout.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md bg-muted/40 p-3 text-sm leading-6 text-muted-foreground">
            <p>{workout.instructions || tr("controlledForm")}</p>
            <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
              {guideUrl ? (
                <Button asChild variant="outline" size="sm">
                  <a href={guideUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    {tr("openExerciseGuide")}
                  </a>
                </Button>
              ) : (
                <Button type="button" variant="outline" size="sm" disabled>
                  {tr("noGuide")}
                </Button>
              )}
              {customVideoUrl ? (
                <Button asChild variant="outline" size="sm">
                  <a href={customVideoUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    {tr("openCustomVideo")}
                  </a>
                </Button>
              ) : (
                <Button type="button" variant="outline" size="sm" disabled>
                  {tr("noCustomVideo")}
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
              {tr("time")}: {formatTime(elapsedSeconds)}
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
                {tr("reset")}
              </Button>
            </div>
          </div>

          {previousSet ? (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
              <p className="font-semibold text-foreground">{tr("previousSet")}</p>
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
              <p className="mb-3 text-base font-semibold">{tr("setNumber", { count: index + 1 })}</p>
              <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor={`reps-${index}`}>{tr("reps")}</Label>
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
                  <Label htmlFor={`weight-${index}`}>{tr("weightKg")}</Label>
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
                  <Label htmlFor={`set-note-${index}`}>{tr("setNote")}</Label>
                  <Input
                    id={`set-note-${index}`}
                    className="h-12"
                    value={set.notes}
                    onChange={(event) =>
                      setSets((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, notes: event.target.value } : item)))
                    }
                    placeholder={tr("optional")}
                  />
                </div>
              </div>
            </div>
          ))}
          <Button className="w-full sm:w-auto" variant="outline" onClick={() => setSets((current) => [...current, { reps: 10, weight: 0, notes: "" }])}>
            <Plus className="h-4 w-4" />
            {tr("addSet")}
          </Button>
          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
            <div className="space-y-2">
              <Label htmlFor="duration">{tr("durationMinutes")}</Label>
              <Input
                id="duration"
                type="number"
                min="1"
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value))}
                placeholder={tr("durationPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workout-notes">{tr("workoutNotes")}</Label>
              <Input
                id="workout-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={tr("workoutNotesPlaceholder")}
              />
            </div>
          </div>
          <Button className="hidden w-full lg:inline-flex" onClick={askComplete} disabled={isSaving || Boolean(sessionError) || !session}>
            <CheckCircle2 className="h-4 w-4" />
            {isSaving ? tr("saving") : tr("markWorkoutCompleted")}
          </Button>
        </CardContent>
      </Card>

      <MobileStickyActions allowOnSession>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold text-foreground">{formatTime(elapsedSeconds)}</p>
            <p className="truncate text-xs text-muted-foreground">{tr("setsReady", { count: sets.length })}</p>
          </div>
          <Button className="min-h-[52px] flex-1 text-base" onClick={askComplete} disabled={isSaving || Boolean(sessionError) || !session}>
            <CheckCircle2 className="h-5 w-5" />
            {isSaving ? tr("saving") : tr("finish")}
          </Button>
        </div>
      </MobileStickyActions>
      <MobileStickyActionsSpacer allowOnSession />
    </div>
  );
}
