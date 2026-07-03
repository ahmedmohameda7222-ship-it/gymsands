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
import { cancelWorkoutSession, completeWorkoutSession, getOpenWorkoutSession, updateWorkoutSessionDuration } from "@/services/database/workout-sessions";
import type { WorkoutSession } from "@/types";
import { useSuccessFeedback } from "@/components/feedback/success-feedback";

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

  const load = useCallback(async () => {
    if (!userId) return;
    const open = await getOpenWorkoutSession(userId);
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

  function togglePause() {
    if (!userId || !state || !session) return;
    const seconds = activeWorkoutElapsed(state);
    const next = state.paused
      ? { ...state, paused: false, startedAtMs: Date.now() - seconds * 1000 }
      : { ...state, paused: true, elapsedSeconds: seconds };
    writeActiveWorkoutState(userId, next);
    setState(next);
    void updateWorkoutSessionDuration(session.id, Math.max(1, Math.ceil(seconds / 60)));
  }

  async function finish() {
    if (!userId || !session || !state) return;
    const seconds = activeWorkoutElapsed(state);
    await completeWorkoutSession(session.id, "Finished from the active workout indicator.", Math.max(1, Math.ceil(seconds / 60)));
    clearActiveWorkoutState(userId);
    setSession(null);
    setState(null);
    toast({ title: "Workout finished", description: "Saved sets and duration are now in workout history." });
    celebrate("Workout complete");
  }

  async function cancel() {
    if (!userId || !session) return;
    await cancelWorkoutSession(session.id);
    clearActiveWorkoutState(userId);
    setSession(null);
    setState(null);
    toast({ title: "Workout cancelled", description: "The active session was removed." });
  }

  if (!session || !state || pathname.startsWith("/workouts/session")) return dialog;

  return (
    <>
      {dialog}
      <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] z-[70] mx-auto max-w-2xl rounded-[18px] border border-primary/25 bg-card/95 p-3 shadow-xl backdrop-blur lg:inset-x-auto lg:bottom-5 lg:right-5 lg:w-[34rem]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><Dumbbell className="h-5 w-5" /></span><div className="min-w-0"><p className="truncate text-sm font-semibold">{state.label}</p><p className="text-xs text-muted-foreground">{state.paused ? "Paused" : "Active"} · {formatTime(elapsed)}</p></div></div>
          <div className="flex flex-wrap gap-1.5">
            <Button asChild size="sm"><Link href={state.route}>{state.paused ? <CirclePlay className="h-4 w-4" /> : null}Return to workout</Link></Button>
            <Button type="button" variant="outline" size="sm" onClick={togglePause}>{state.paused ? <CirclePlay className="h-4 w-4" /> : <CirclePause className="h-4 w-4" />}{state.paused ? "Resume" : "Pause"}</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => ask({ title: "Finish active workout?", description: "Saved sets and elapsed time will be added to workout history.", confirmLabel: "Finish workout", onConfirm: () => { void finish(); } })}><Flag className="h-4 w-4" />Finish</Button>
            <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => ask({ title: "Cancel active workout?", description: "The open session and its in-progress set logs will be removed.", confirmLabel: "Cancel workout", variant: "destructive", onConfirm: () => { void cancel(); } })}><X className="h-4 w-4" />Cancel</Button>
          </div>
        </div>
      </div>
    </>
  );
}
