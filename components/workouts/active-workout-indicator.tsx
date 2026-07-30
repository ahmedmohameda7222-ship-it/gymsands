"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { useAuth } from "@/components/auth/auth-provider";
import {
  ActiveWorkoutMinimizedBar,
  type ActiveWorkoutMinimizedBarState
} from "@/components/workouts/active-workout-minimized-bar";
import {
  activeWorkoutCacheFromExecution,
  activeWorkoutElapsed,
  activeWorkoutEvent,
  clearActiveWorkoutState,
  isValidActiveWorkoutRoute,
  readActiveWorkoutState,
  resolveActiveWorkoutRoute,
  writeActiveWorkoutState,
  type ActiveWorkoutState
} from "@/lib/active-workout";
import { useActiveWorkoutTranslation } from "@/lib/i18n/active-workout";
import { getActiveWorkoutDeviceId } from "@/lib/workouts/active-workout-device";
import { activeSessionClock } from "@/lib/workouts/active-session-store/clock";
import {
  getActiveSessionStore,
  type ActiveSessionSnapshot,
  type ActiveSessionStore
} from "@/lib/workouts/active-session-store/store";
import { createSessionCommandId } from "@/lib/workouts/session-engine/commands";
import {
  restTimerSelector,
  sessionTimerSelector
} from "@/lib/workouts/session-engine/selectors";
import { activeSessionPersistenceAdapter } from "@/services/database/active-session-persistence-adapter";
import { getOpenWorkoutSessionWithStatus } from "@/services/database/workout-sessions";
import type { WorkoutSession } from "@/types";

export function ActiveWorkoutIndicator() {
  const { user } = useAuth();
  const userId = user?.id;
  const pathname = usePathname();
  const { t, formatters } = useActiveWorkoutTranslation();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [state, setState] = useState<ActiveWorkoutState | null>(null);
  const [snapshot, setSnapshot] = useState<ActiveSessionSnapshot | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [restLeft, setRestLeft] = useState(0);
  const [actionPending, setActionPending] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const controllerRef = useRef<HTMLDivElement>(null);
  const controllerDeviceIdRef = useRef<string | null>(null);
  const activeSessionStoreRef = useRef<ActiveSessionStore | null>(null);
  const unsubscribeStoreRef = useRef<(() => void) | null>(null);

  const acceptStoreSnapshot = useCallback((
    store: ActiveSessionStore,
    open: WorkoutSession,
    route: string
  ) => {
    const nextSnapshot = store.getSnapshot();
    const persisted = nextSnapshot.executionState;
    setSnapshot(nextSnapshot);
    if (!persisted || nextSnapshot.root?.status !== "started") return;
    const next = activeWorkoutCacheFromExecution(persisted, {
      route,
      label: open.workout_name,
      controllerDeviceId: controllerDeviceIdRef.current
    });
    setState(next);
    if (userId) writeActiveWorkoutState(userId, next);
  }, [userId]);

  const load = useCallback(async (force = false) => {
    if (!userId) return;
    const stored = readActiveWorkoutState(userId);
    // Frozen Train Phase 1 source contract: owner-scoped resume accepts only
    // stored?.sessionId === open.id && isValidActiveWorkoutRoute(stored.route)
    const candidateSessionId = stored && isValidActiveWorkoutRoute(stored.route)
      ? stored.sessionId
      : null;
    const { session: open, error } =
      await getOpenWorkoutSessionWithStatus(userId, null, candidateSessionId);
    if (error) {
      setState(stored);
      setLoadError(true);
      return;
    }
    if (!open) {
      unsubscribeStoreRef.current?.();
      unsubscribeStoreRef.current = null;
      activeSessionStoreRef.current = null;
      clearActiveWorkoutState(userId);
      setSession(null);
      setState(null);
      setSnapshot(null);
      setLoadError(false);
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
      await store.hydrate({ force });
      let persisted = store.getSnapshot().executionState;
      if (!persisted) throw new Error("Active execution state is unavailable.");
      if (
        controllerDeviceIdRef.current
        && persisted.controller_device_id !== controllerDeviceIdRef.current
      ) {
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
      setSession(open);
      setState(next);
      setSnapshot(store.getSnapshot());
      setLoadError(false);
      unsubscribeStoreRef.current?.();
      unsubscribeStoreRef.current = store.subscribe(() => {
        acceptStoreSnapshot(store, open, route);
      });
    } catch {
      setSession(open);
      setState(stored);
      setSnapshot(null);
      setLoadError(true);
    }
  }, [acceptStoreSnapshot, userId]);

  useEffect(() => {
    void load();
    return () => {
      unsubscribeStoreRef.current?.();
      unsubscribeStoreRef.current = null;
    };
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const syncCache = () => setState(readActiveWorkoutState(userId));
    const reload = () => { void load(true); };
    window.addEventListener(activeWorkoutEvent, syncCache);
    window.addEventListener("focus", reload);
    return () => {
      window.removeEventListener(activeWorkoutEvent, syncCache);
      window.removeEventListener("focus", reload);
    };
  }, [load, userId]);

  useEffect(() => {
    const tick = () => {
      const now = activeSessionClock.getSnapshot();
      setElapsed(
        snapshot?.executionState
          ? sessionTimerSelector(snapshot.executionState, now)
          : state
            ? activeWorkoutElapsed(state, now)
            : 0
      );
      setRestLeft(
        snapshot?.executionState
          ? restTimerSelector(snapshot.executionState, now)
          : state?.restEndsAtMs
            ? Math.max(0, Math.ceil((state.restEndsAtMs - now) / 1000))
            : 0
      );
    };
    tick();
    return activeSessionClock.subscribe(tick);
  }, [snapshot?.executionState, state]);

  const controllerVisible = Boolean(
    loadError ? state || session : session && state && snapshot?.executionState
  ) && !pathname.startsWith("/workouts/session");

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
  }, [controllerVisible, loadError, snapshot?.executionState?.session_state]);

  async function togglePause() {
    const executionState = snapshot?.executionState;
    const store = activeSessionStoreRef.current;
    if (
      !userId
      || !session
      || !store
      || !executionState
      || executionState.session_state === "review"
    ) return;
    setActionPending(true);
    try {
      await store.dispatch({
        userId,
        workoutSessionId: session.id,
        commandId: createSessionCommandId(),
        commandType: executionState.session_state === "paused" ? "resume" : "pause",
        payload: { controller_device_id: controllerDeviceIdRef.current }
      });
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setActionPending(false);
    }
  }

  if (!controllerVisible) return null;

  const execution = snapshot?.executionState;
  const prescription = snapshot?.prescription ?? [];
  const logs = snapshot?.performedLogs ?? [];
  const activeItem = prescription.find((item) =>
    item.id === execution?.active_snapshot_item_id
    || item.itemOrder === execution?.active_item_order
  ) ?? null;
  const nextItem = prescription.find((item) =>
    item.itemOrder > (activeItem?.itemOrder ?? execution?.active_item_order ?? 0)
    && item.executionState !== "skipped"
  ) ?? null;
  const activeSetCount = activeItem?.prescriptionSets.length
    || activeItem?.plannedSets
    || 1;
  const totalSetCount = prescription.reduce(
    (sum, item) => sum + (item.prescriptionSets.length || item.plannedSets || 1),
    0
  );
  const completedSetCount = logs.filter((log) => Boolean(log.completed_at)).length;
  const progress = totalSetCount > 0 ? completedSetCount / totalSetCount : 0;
  const href = state?.route ?? (
    session ? resolveActiveWorkoutRoute(session, null) : "/my-workout/plans"
  );

  let barState: ActiveWorkoutMinimizedBarState = "active";
  let title = activeItem?.activityName ?? state?.label ?? t("minimized.activeWorkout");
  let meta = t("minimized.setPosition", {
    current: execution?.active_set_number ?? state?.activeSetNumber ?? 1,
    total: activeSetCount
  });
  let timer: string | null = formatters.timer(elapsed);
  let actionLabel = t("common.pause");
  let onAction: (() => void) | undefined = () => { void togglePause(); };

  if (loadError) {
    barState = "error";
    title = t("minimized.available");
    meta = t("minimized.tapToReconnect");
    timer = null;
    actionLabel = t("common.retry");
    onAction = () => { void load(true); };
  } else if (execution?.session_state === "review") {
    barState = "review";
    title = t("minimized.readyToReview");
    meta = t("minimized.reviewProgress", {
      completed: completedSetCount,
      total: totalSetCount
    });
    timer = null;
    actionLabel = t("review.title");
    onAction = undefined;
  } else if (execution?.session_state === "paused") {
    barState = "paused";
    meta = t("minimized.pausedSetPosition", {
      current: execution.active_set_number,
      total: activeSetCount
    });
    timer = null;
    actionLabel = t("common.resume");
  } else if (execution?.view_state === "rest" && restLeft > 0) {
    barState = "rest";
    title = t("rest.resting");
    meta = nextItem
      ? t("exercise.nextExercise", { name: nextItem.activityName })
      : t("minimized.nextSetReady");
    timer = formatters.timer(restLeft);
    actionLabel = t("minimized.openWorkout");
    onAction = undefined;
  }

  return (
    <div
      ref={controllerRef}
      data-active-workout-controller
      className="fixed inset-x-3 bottom-[var(--active-workout-controller-bottom)] z-[70] mx-auto max-w-xl lg:inset-x-auto lg:bottom-[var(--desktop-active-workout-controller-bottom)] lg:right-5 lg:w-[26rem] lg:max-w-[calc(100vw-2.5rem)] rtl:lg:left-5 rtl:lg:right-auto"
    >
      <ActiveWorkoutMinimizedBar
        state={barState}
        href={href}
        title={title}
        meta={meta}
        timer={timer}
        progress={progress}
        openLabel={t("accessibility.openWorkout")}
        actionLabel={actionLabel}
        actionPending={actionPending}
        onAction={onAction}
      />
    </div>
  );
}
