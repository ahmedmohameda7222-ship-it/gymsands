"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CirclePause, CirclePlay, Dumbbell, Flag, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toaster";
import { activeWorkoutCacheFromExecution, activeWorkoutElapsed, activeWorkoutEvent, clearActiveWorkoutState, isValidActiveWorkoutRoute, readActiveWorkoutState, resolveActiveWorkoutRoute, writeActiveWorkoutState, type ActiveWorkoutState } from "@/lib/active-workout";
import { getOpenWorkoutSessionWithStatus } from "@/services/database/workout-sessions";
import type { WorkoutSession, WorkoutSessionExecutionState } from "@/types";
import { useSuccessFeedback } from "@/components/feedback/success-feedback";
import { userSafeError } from "@/lib/error-formatting";
import { useActiveWorkoutTranslation } from "@/lib/i18n/active-workout";
import { getActiveWorkoutDeviceId } from "@/lib/workouts/active-workout-device";
import { activeSessionPersistenceAdapter } from "@/services/database/active-session-persistence-adapter";
import {
  getActiveSessionStore,
  type ActiveSessionStore
} from "@/lib/workouts/active-session-store/store";
import { activeSessionClock } from "@/lib/workouts/active-session-store/clock";
import { createSessionCommandId } from "@/lib/workouts/session-engine/commands";
import { sessionTimerSelector } from "@/lib/workouts/session-engine/selectors";

// Frozen Train Phase 1 source contract: owner-scoped resume accepts only
// stored?.sessionId === open.id && isValidActiveWorkoutRoute(stored.route)

export function ActiveWorkoutIndicator() {
  const { user } = useAuth();
  const userId = user?.id;
  const pathname = usePathname();
  const { toast } = useToast();
  const { celebrate } = useSuccessFeedback();
  const { dialog, ask } = useConfirm();
  const { t, formatters } = useActiveWorkoutTranslation();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [state, setState] = useState<ActiveWorkoutState | null>(null);
  const [executionState, setExecutionState] = useState<WorkoutSessionExecutionState | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [actionPending, setActionPending] = useState<"pause" | "finish" | "cancel" | null>(null);
  const [actionError, setActionError] = useState("");
  const [loadError, setLoadError] = useState("");
  const controllerRef = useRef<HTMLDivElement>(null);
  const controllerDeviceIdRef = useRef<string | null>(null);
  const activeSessionStoreRef = useRef<ActiveSessionStore | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const stored = readActiveWorkoutState(userId);
    const candidateSessionId = stored && isValidActiveWorkoutRoute(stored.route) ? stored.sessionId : null;
    const { session: open, error } = await getOpenWorkoutSessionWithStatus(userId, null, candidateSessionId);
    if (error) {
      setLoadError(t("minimized.loadFailed"));
      return;
    }
    setSession(open);
    if (!open) {
      clearActiveWorkoutState(userId);
      setState(null);
      setExecutionState(null);
      setLoadError("");
      return;
    }
    try {
      controllerDeviceIdRef.current = getActiveWorkoutDeviceId();
      const store = getActiveSessionStore({
        userId,
        workoutSessionId: open.id,
        adapter: activeSessionPersistenceAdapter,
        clearCompatibilityCache: () => clearActiveWorkoutState(userId)
      });
      activeSessionStoreRef.current = store;
      await store.hydrate();
      let persisted = store.getSnapshot().executionState;
      if (!persisted) throw new Error("The active workout has no execution state.");
      if (controllerDeviceIdRef.current && persisted.controller_device_id !== controllerDeviceIdRef.current) {
        const response = await store.dispatch({
          userId,
          workoutSessionId: open.id,
          commandId: createSessionCommandId(),
          commandType: "move_cursor",
          payload: {
            active_snapshot_item_id: persisted.active_snapshot_item_id,
            active_item_order: persisted.active_item_order,
            active_set_number: persisted.active_set_number,
            controller_device_id: controllerDeviceIdRef.current
          }
        });
        persisted = response.state;
      }
      const route = resolveActiveWorkoutRoute(open, stored);
      const next = activeWorkoutCacheFromExecution(persisted, {
        route,
        label: open.workout_name,
        controllerDeviceId: controllerDeviceIdRef.current
      });
      writeActiveWorkoutState(userId, next);
      setExecutionState(persisted);
      setState(next);
      setLoadError("");
    } catch (executionError) {
      setExecutionState(null);
      setState(null);
      setLoadError(userSafeError(executionError, t("minimized.loadFailed")));
    }
  }, [t, userId]);

  useEffect(() => { void load(); }, [load, pathname]);

  useEffect(() => {
    if (!userId) return;
    const syncCache = () => setState(readActiveWorkoutState(userId));
    const reload = () => { void load(); };
    window.addEventListener(activeWorkoutEvent, syncCache);
    window.addEventListener("focus", reload);
    return () => { window.removeEventListener(activeWorkoutEvent, syncCache); window.removeEventListener("focus", reload); };
  }, [load, userId]);

  useEffect(() => {
    const tick = () => setElapsed(
      executionState
        ? sessionTimerSelector(executionState, activeSessionClock.getSnapshot())
        : state
          ? activeWorkoutElapsed(state, activeSessionClock.getSnapshot())
          : 0
    );
    return activeSessionClock.subscribe(tick);
  }, [executionState, state]);

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
    if (!userId || !state || !session || !executionState || executionState.session_state === "review") return;
    const store = activeSessionStoreRef.current;
    if (!store) return;
    try {
      setActionPending("pause");
      setActionError("");
      const response = await store.dispatch({
        userId,
        workoutSessionId: session.id,
        commandId: createSessionCommandId(),
        commandType: executionState.session_state === "paused" ? "resume" : "pause",
        payload: { controller_device_id: controllerDeviceIdRef.current }
      });
      const persisted = response.state;
      const persistedCache = activeWorkoutCacheFromExecution(persisted, {
        route: state.route,
        label: state.label,
        controllerDeviceId: controllerDeviceIdRef.current
      }, activeSessionClock.getSnapshot());
      setExecutionState(persisted);
      setState(persistedCache);
      writeActiveWorkoutState(userId, persistedCache);
    } catch (error) {
      setActionError(userSafeError(error, t("minimized.pauseRestore")));
    } finally {
      setActionPending(null);
    }
  }

  async function finish() {
    if (!userId || !session || !state) return;
    try {
      setActionPending("finish");
      setActionError("");
      const store = activeSessionStoreRef.current;
      if (!store) throw new Error("The workout execution store is unavailable.");
      await store.completeSession({
        notes: t("minimized.finishedFromIndicator"),
        durationMinutes: Math.max(1, Math.ceil(elapsed / 60))
      });
      setSession(null);
      setState(null);
      toast({ title: t("minimized.finishedTitle"), description: t("minimized.finishedDescription") });
      celebrate(t("completion.title"));
    } catch (error) {
      const message = userSafeError(error, t("minimized.finishFailedDescription"));
      setActionError(message);
      toast({ title: t("minimized.finishFailedTitle"), description: message });
    } finally {
      setActionPending(null);
    }
  }

  async function cancel() {
    if (!userId || !session) return;
    try {
      setActionPending("cancel");
      setActionError("");
      const store = activeSessionStoreRef.current;
      if (!store) throw new Error("The workout execution store is unavailable.");
      await store.cancelSession();
      setSession(null);
      setState(null);
      toast({ title: t("minimized.cancelledTitle"), description: t("minimized.cancelledDescription") });
    } catch (error) {
      const message = userSafeError(error, t("minimized.cancelFailedDescription"));
      setActionError(message);
      toast({ title: t("minimized.cancelFailedTitle"), description: message });
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
              <p className="truncate text-sm font-semibold"><bdi>{state?.label ?? t("minimized.activeWorkout")}</bdi></p>
              <p className="text-xs text-muted-foreground">
                {loadError || (
                  <>
                    {state?.paused ? t("common.paused") : t("common.active")} ·{" "}
                    <span dir="ltr" className="tabular-nums">{formatters.timer(elapsed)}</span>
                  </>
                )}
              </p>
              {actionError ? <p className="mt-1 text-xs leading-5 text-destructive">{actionError}</p> : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {state ? <Button asChild className="min-h-12"><Link href={state.route} aria-label={t("accessibility.openWorkout")}>{state.paused ? <CirclePlay className="h-4 w-4" /> : null}{t("minimized.openWorkout")}</Link></Button> : null}
            {state ? <Button type="button" variant="outline" className="min-h-12" aria-label={state.paused ? t("accessibility.resumeWorkout") : t("accessibility.pauseWorkout")} onClick={() => { void togglePause(); }} disabled={Boolean(actionPending) || executionState?.session_state === "review"}>{state.paused ? <CirclePlay className="h-4 w-4" /> : <CirclePause className="h-4 w-4" />}{actionPending === "pause" ? t("common.saving") : state.paused ? t("common.resume") : t("common.pause")}</Button> : null}
            {state ? <Button type="button" variant="outline" className="min-h-12" aria-label={t("accessibility.finishWorkout")} disabled={Boolean(actionPending)} onClick={() => ask({ title: t("minimized.finishQuestion"), description: t("minimized.finishDescription"), confirmLabel: t("minimized.finishWorkout"), onConfirm: () => { void finish(); } })}><Flag className="h-4 w-4" />{actionPending === "finish" ? t("minimized.finishing") : t("common.finish")}</Button> : null}
            {state ? <Button type="button" variant="ghost" className="min-h-12 text-destructive hover:text-destructive" aria-label={t("accessibility.cancelWorkout")} disabled={Boolean(actionPending)} onClick={() => ask({ title: t("minimized.cancelQuestion"), description: t("minimized.cancelDescription"), confirmLabel: t("minimized.cancelWorkout"), variant: "destructive", onConfirm: () => { void cancel(); } })}><X className="h-4 w-4" />{actionPending === "cancel" ? t("minimized.cancelling") : t("common.cancel")}</Button> : null}
          </div>
        </div>
      </div>
    </>
  );
}
