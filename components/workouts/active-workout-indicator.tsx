"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CirclePause, CirclePlay, Dumbbell, Flag, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toaster";
import { activeWorkoutElapsed, activeWorkoutEvent, clearActiveWorkoutState, readActiveWorkoutState, writeActiveWorkoutState, type ActiveWorkoutState } from "@/lib/active-workout";
import { cancelWorkoutSession, completeWorkoutSession, getOpenWorkoutSessionWithStatus, updateWorkoutSessionDuration } from "@/services/database/workout-sessions";
import type { WorkoutSession } from "@/types";
import { useSuccessFeedback } from "@/components/feedback/success-feedback";
import { userSafeError } from "@/lib/error-formatting";

function formatTime(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function ActiveWorkoutIndicator() {
  const { user } = useAuth();
  const userId = user?.id;
  const pathname = usePathname();
  const { toast } = useToast();
  const { celebrate } = useSuccessFeedback();
  const { dialog, ask } = useConfirm();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [state, setState] = useState<ActiveWorkoutState | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [actionPending, setActionPending] = useState<"pause" | "finish" | "cancel" | null>(null);
  const [actionError, setActionError] = useState("");
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    if (!userId) return;
    const { session: open, error } = await getOpenWorkoutSessionWithStatus(userId);
    setLoadError(error ?? "");
    if (error) return;
    setSession(open);
    const stored = readActiveWorkoutState(userId);
    if (!open) {
      clearActiveWorkoutState(userId);
      setState(null);
      return;
    }
    const route = open.plan_day_id ? `/workouts/session/day/${open.plan_day_id}` : open.workout_id ? `/workouts/session/${open.workout_id}` : "/workout-history";
    const next = stored?.sessionId === open.id ? stored : {
      sessionId: open.id,
      route,
      label: open.workout_name,
      startedAtMs: Date.parse(open.started_at) || Date.now(),
      elapsedSeconds: Math.max(0, Number(open.duration_minutes ?? 0) * 60),
      paused: false
    };
    writeActiveWorkoutState(userId, next);
    setState(next);
  }, [userId]);

  useEffect(() => { void load(); }, [load, pathname]);

  useEffect(() => {
    if (!userId) return;
    const sync = () => setState(readActiveWorkoutState(userId));
    window.addEventListener(activeWorkoutEvent, sync);
    window.addEventListener("focus", sync);
    return () => { window.removeEventListener(activeWorkoutEvent, sync); window.removeEventListener("focus", sync); };
  }, [userId]);

  useEffect(() => {
    if (!state) return;
    const tick = () => setElapsed(activeWorkoutElapsed(state));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [state]);

  async function togglePause() {
    if (!userId || !state || !session) return;
    const seconds = activeWorkoutElapsed(state);
    const previous = state;
    const next = state.paused
      ? { ...state, paused: false, startedAtMs: Date.now() - seconds * 1000 }
      : { ...state, paused: true, elapsedSeconds: seconds };
    try {
      setActionPending("pause");
      setActionError("");
      writeActiveWorkoutState(userId, next);
      setState(next);
      await updateWorkoutSessionDuration(session.id, Math.max(1, Math.ceil(seconds / 60)));
    } catch (error) {
      writeActiveWorkoutState(userId, previous);
      setState(previous);
      setActionError(userSafeError(error, "Pause state could not be saved. Your previous active workout state was restored."));
    } finally {
      setActionPending(null);
    }
  }

  async function finish() {
    if (!userId || !session || !state) return;
    try {
      setActionPending("finish");
      setActionError("");
      const seconds = activeWorkoutElapsed(state);
      await completeWorkoutSession(session.id, "Finished from the active workout indicator.", Math.max(1, Math.ceil(seconds / 60)));
      clearActiveWorkoutState(userId);
      setSession(null);
      setState(null);
      toast({ title: "Workout finished", description: "Saved sets and duration are now in workout history." });
      celebrate("Workout complete");
    } catch (error) {
      const message = userSafeError(error, "Workout could not be finished. Return to the session and retry.");
      setActionError(message);
      toast({ title: "Workout was not finished", description: message });
    } finally {
      setActionPending(null);
    }
  }

  async function cancel() {
    if (!userId || !session) return;
    try {
      setActionPending("cancel");
      setActionError("");
      await cancelWorkoutSession(session.id);
      clearActiveWorkoutState(userId);
      setSession(null);
      setState(null);
      toast({ title: "Workout cancelled", description: "The active session was removed." });
    } catch (error) {
      const message = userSafeError(error, "Workout could not be cancelled. The active session is still available.");
      setActionError(message);
      toast({ title: "Workout was not cancelled", description: message });
    } finally {
      setActionPending(null);
    }
  }

  if (((!session || !state) && !loadError) || pathname.startsWith("/workouts/session")) return dialog;

  return (
    <>
      {dialog}
      <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] z-[70] mx-auto max-w-2xl rounded-[18px] border border-primary/25 bg-card/95 p-3 shadow-xl backdrop-blur lg:inset-x-auto lg:bottom-5 lg:right-5 lg:w-[34rem]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><Dumbbell className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{state?.label ?? "Active workout in progress"}</p>
              <p className="text-xs text-muted-foreground">{loadError || `${state?.paused ? "Paused" : "Active"} - ${formatTime(elapsed)}`}</p>
              {actionError ? <p className="mt-1 text-xs leading-5 text-destructive">{actionError}</p> : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {state ? <Button asChild className="min-h-12"><Link href={state.route}>{state.paused ? <CirclePlay className="h-4 w-4" /> : null}Return to workout</Link></Button> : null}
            {state ? <Button type="button" variant="outline" className="min-h-12" onClick={() => { void togglePause(); }} disabled={Boolean(actionPending)}>{state.paused ? <CirclePlay className="h-4 w-4" /> : <CirclePause className="h-4 w-4" />}{actionPending === "pause" ? "Saving..." : state.paused ? "Resume" : "Pause"}</Button> : null}
            {state ? <Button type="button" variant="outline" className="min-h-12" disabled={Boolean(actionPending)} onClick={() => ask({ title: "Finish active workout?", description: "Saved sets and elapsed time will be added to workout history.", confirmLabel: "Finish workout", onConfirm: () => { void finish(); } })}><Flag className="h-4 w-4" />{actionPending === "finish" ? "Finishing..." : "Finish"}</Button> : null}
            {state ? <Button type="button" variant="ghost" className="min-h-12 text-destructive hover:text-destructive" disabled={Boolean(actionPending)} onClick={() => ask({ title: "Cancel active workout?", description: "The open session and its in-progress set logs will be removed.", confirmLabel: "Cancel workout", variant: "destructive", onConfirm: () => { void cancel(); } })}><X className="h-4 w-4" />{actionPending === "cancel" ? "Cancelling..." : "Cancel"}</Button> : null}
          </div>
        </div>
      </div>
    </>
  );
}
