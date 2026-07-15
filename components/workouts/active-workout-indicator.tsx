"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CirclePause, CirclePlay, Dumbbell, Flag, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toaster";
import { activeWorkoutElapsed, activeWorkoutEvent, clearActiveWorkoutState, isValidActiveWorkoutRoute, readActiveWorkoutState, resolveActiveWorkoutRoute, writeActiveWorkoutState, type ActiveWorkoutState } from "@/lib/active-workout";
import { cancelWorkoutSession, completeWorkoutSession, getOpenWorkoutSessionWithStatus, updateWorkoutSessionDuration } from "@/services/database/workout-sessions";
import type { WorkoutSession } from "@/types";
import { useSuccessFeedback } from "@/components/feedback/success-feedback";
import { userSafeError } from "@/lib/error-formatting";
import { useTrainTranslation } from "@/lib/i18n/train";

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
  const { tr } = useTrainTranslation();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [state, setState] = useState<ActiveWorkoutState | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [actionPending, setActionPending] = useState<"pause" | "finish" | "cancel" | null>(null);
  const [actionError, setActionError] = useState("");
  const [loadError, setLoadError] = useState("");
  const controllerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const stored = readActiveWorkoutState(userId);
    const candidateSessionId = stored && isValidActiveWorkoutRoute(stored.route) ? stored.sessionId : null;
    const { session: open, error } = await getOpenWorkoutSessionWithStatus(userId, null, candidateSessionId);
    setLoadError(error ? tr("activeWorkoutLoadFailed") : "");
    if (error) return;
    setSession(open);
    if (!open) {
      clearActiveWorkoutState(userId);
      setState(null);
      return;
    }
    const route = resolveActiveWorkoutRoute(open, stored);
    const next = stored?.sessionId === open.id && isValidActiveWorkoutRoute(stored.route) ? stored : {
      sessionId: open.id,
      route,
      label: open.workout_name,
      startedAtMs: Date.parse(open.started_at) || Date.now(),
      elapsedSeconds: Math.max(0, Number(open.duration_minutes ?? 0) * 60),
      paused: false
    };
    writeActiveWorkoutState(userId, next);
    setState(next);
  }, [tr, userId]);

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

  const controllerVisible = Boolean(loadError || (session && state)) && !pathname.startsWith("/workouts/session");

  useLayoutEffect(() => {
    const shell = document.querySelector<HTMLElement>("[data-app-shell]");
    if (!shell) return;

    const updateHeight = () => {
      const height = controllerVisible && controllerRef.current
        ? Math.ceil(controllerRef.current.getBoundingClientRect().height)
        : 0;
      shell.style.setProperty("--active-workout-controller-height", `${height}px`);
      shell.dataset.activeWorkoutControllerState = height > 0 ? "present" : "absent";
    };

    updateHeight();
    const observer = typeof ResizeObserver === "undefined" || !controllerRef.current
      ? null
      : new ResizeObserver(updateHeight);
    if (observer && controllerRef.current) observer.observe(controllerRef.current);
    window.addEventListener("resize", updateHeight);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateHeight);
      shell.style.removeProperty("--active-workout-controller-height");
      shell.dataset.activeWorkoutControllerState = "absent";
    };
  }, [actionError, controllerVisible, loadError, pathname, state?.label, state?.paused]);

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
      setActionError(userSafeError(error, tr("pauseStateRestoreMessage")));
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
      await completeWorkoutSession(session.id, tr("finishedFromIndicator"), Math.max(1, Math.ceil(seconds / 60)));
      clearActiveWorkoutState(userId);
      setSession(null);
      setState(null);
      toast({ title: tr("workoutFinished"), description: tr("workoutFinishedDescription") });
      celebrate(tr("workoutComplete"));
    } catch (error) {
      const message = userSafeError(error, tr("workoutFinishFailedMessage"));
      setActionError(message);
      toast({ title: tr("workoutNotFinished"), description: message });
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
      toast({ title: tr("workoutCancelled"), description: tr("workoutCancelledDescription") });
    } catch (error) {
      const message = userSafeError(error, tr("workoutCancelFailedMessage"));
      setActionError(message);
      toast({ title: tr("workoutNotCancelled"), description: message });
    } finally {
      setActionPending(null);
    }
  }

  if (!controllerVisible) return dialog;

  return (
    <>
      {dialog}
      <div ref={controllerRef} data-active-workout-controller className="fixed inset-x-3 bottom-[var(--active-workout-controller-bottom)] z-[70] mx-auto max-w-2xl rounded-[18px] border border-primary/25 bg-card/95 p-3 shadow-xl backdrop-blur lg:inset-x-auto lg:bottom-[var(--desktop-active-workout-controller-bottom)] lg:right-5 lg:w-[34rem]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><Dumbbell className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{state?.label ?? tr("activeWorkoutInProgress")}</p>
              <p className="text-xs text-muted-foreground">{loadError || `${state?.paused ? tr("paused") : tr("active")} · ${formatTime(elapsed)}`}</p>
              {actionError ? <p className="mt-1 text-xs leading-5 text-destructive">{actionError}</p> : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {state ? <Button asChild className="min-h-12"><Link href={state.route}>{state.paused ? <CirclePlay className="h-4 w-4" /> : null}{tr("returnToWorkout")}</Link></Button> : null}
            {state ? <Button type="button" variant="outline" className="min-h-12" onClick={() => { void togglePause(); }} disabled={Boolean(actionPending)}>{state.paused ? <CirclePlay className="h-4 w-4" /> : <CirclePause className="h-4 w-4" />}{actionPending === "pause" ? tr("saving") : state.paused ? tr("resume") : tr("pause")}</Button> : null}
            {state ? <Button type="button" variant="outline" className="min-h-12" disabled={Boolean(actionPending)} onClick={() => ask({ title: tr("finishActiveWorkoutQuestion"), description: tr("finishActiveWorkoutDescription"), confirmLabel: tr("finishWorkout"), onConfirm: () => { void finish(); } })}><Flag className="h-4 w-4" />{actionPending === "finish" ? tr("finishing") : tr("finish")}</Button> : null}
            {state ? <Button type="button" variant="ghost" className="min-h-12 text-destructive hover:text-destructive" disabled={Boolean(actionPending)} onClick={() => ask({ title: tr("cancelActiveWorkoutQuestion"), description: tr("cancelActiveWorkoutDescription"), confirmLabel: tr("cancelWorkout"), variant: "destructive", onConfirm: () => { void cancel(); } })}><X className="h-4 w-4" />{actionPending === "cancel" ? tr("cancelling") : tr("cancel")}</Button> : null}
          </div>
        </div>
      </div>
    </>
  );
}
