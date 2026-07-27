"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, RefreshCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth/auth-provider";
import { useSuccessFeedback } from "@/components/feedback/success-feedback";
import { InlineFeedback } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { ActiveWorkoutDetailsBridge } from "@/components/workouts/active-workout/active-workout-details-bridge";
import { ActiveWorkoutExecutionShell } from "@/components/workouts/active-workout/active-workout-execution-shell";
import { ActiveWorkoutReviewBridge } from "@/components/workouts/active-workout/active-workout-review-bridge";
import {
  acknowledgeSetWrites,
  buildCanonicalLogRows,
  buildPrs,
  buildSessionSets,
  buildSummary,
  buildWorkoutContextLogRows,
  directWorkoutDay,
  formatPlannedReps,
  hasPendingValidSetWrites,
  hydrateStates,
  makeFrozenExerciseState,
  mergeSetPatch,
  mockPrescriptionItemsFromPlan,
  previousPerformance,
  previousSetForExercise,
  roundWorkoutMetric,
  setHasValidEffortInputs,
  toNumberOrNull,
  type ActiveWorkoutExerciseState,
  type ActiveWorkoutSetState,
  type ActiveWorkoutSource,
  type ActiveWorkoutSummary
} from "@/components/workouts/active-workout/active-workout-runtime-model";
import { activeWorkoutStorageIdentities } from "@/components/workouts/active-workout/active-workout-source-compatibility";
import {
  buildActiveWorkoutSetPath,
  clampWorkoutProgress,
  nextIncompleteSetCursor,
  validateActiveWorkoutSetDraft
} from "@/components/workouts/active-workout/active-workout-ui-model";
import {
  activeWorkoutCacheFromExecution,
  clearActiveWorkoutState,
  isValidActiveWorkoutRoute,
  readActiveWorkoutState,
  writeActiveWorkoutState
} from "@/lib/active-workout";
import { userSafeError } from "@/lib/error-formatting";
import { isMockAuthUserId } from "@/lib/fixtures/mock-auth";
import {
  isolateBidiText,
  useActiveWorkoutTranslation,
  type ActiveWorkoutTranslator
} from "@/lib/i18n/active-workout";
import { translateTrain } from "@/lib/i18n/train";
import { clearStoredValue, readStoredTimestamp, storeTimestamp } from "@/lib/workout-persistence";
import { getActiveWorkoutDeviceId } from "@/lib/workouts/active-workout-device";
import { activeSessionClock } from "@/lib/workouts/active-session-store/clock";
import {
  getActiveSessionStore,
  type ActiveSessionStore
} from "@/lib/workouts/active-session-store/store";
import { createSessionCommandId } from "@/lib/workouts/session-engine/commands";
import { planSessionAfterSetCompletion } from "@/lib/workouts/session-engine/reducer";
import {
  executionCursorToIndexes,
  executionElapsedSeconds,
  executionRestSecondsLeft,
  executionStartedAtMs
} from "@/lib/workouts/workout-session-execution";
import { activeSessionPersistenceAdapter } from "@/services/database/active-session-persistence-adapter";
import { getOrStartWorkoutSession } from "@/services/database/direct-workout-sessions";
import {
  createExerciseAlternative,
  getExerciseAlternatives,
  getProgressionTargets
} from "@/services/database/execution-layer";
import {
  mountWorkoutSetAutosaveCoordinator,
  type WorkoutSetAutosaveAdapter,
  type WorkoutSetAutosaveCoordinator
} from "@/services/database/workout-set-autosave";
import { validateWorkoutSetEffortInput } from "@/services/database/workout-set-details";
import type { WorkoutSessionExecutionCursorRow } from "@/services/database/workout-session-execution";
import {
  getOrStartWorkoutDaySession,
  getWorkoutHistoryDetailed
} from "@/services/database/workout-sessions";
import type {
  ExerciseAlternativeReason,
  UserExerciseAlternative,
  UserProgressionTarget,
  Workout,
  WorkoutSession,
  WorkoutSessionExecutionState,
  WorkoutSessionSummary
} from "@/types";

export type { ActiveWorkoutSource } from "./active-workout-runtime-model";

function restPresetLabel(seconds: number, tr: ActiveWorkoutTranslator) {
  if (seconds === 30) return tr("rest.presetThirtySeconds");
  if (seconds === 60) return tr("rest.presetSixtySeconds");
  if (seconds === 90) return tr("rest.presetNinetySeconds");
  return tr("rest.presetThreeMinutes");
}

function restDeadline(seconds: number) {
  return Date.now() + seconds * 1000;
}

export function ActiveWorkoutCoreSession({ source }: { source: ActiveWorkoutSource }) {
  const sourceKind = source.kind;
  const sourceId = source.kind === "plan-day" ? source.day.id : source.workout.id;
  const day = source.kind === "plan-day" ? source.day : directWorkoutDay(source.workout);
  const directWorkout = source.kind === "direct" ? source.workout : null;
  const dayRef = useRef(day);
  const directWorkoutRef = useRef(directWorkout);
  dayRef.current = day;
  directWorkoutRef.current = directWorkout;

  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const router = useRouter();
  const { t: tr, locale: language, direction: dir, formatters } = useActiveWorkoutTranslation();
  const trRef = useRef(tr);
  trRef.current = tr;
  const legacyReopenSetLabel = translateTrain(language, "reopenSet");
  const legacySetReopened = translateTrain(language, "setReopened");
  const legacySetReopenFailed = translateTrain(language, "setReopenFailed");
  const { celebrate } = useSuccessFeedback();

  const sessionRoute = sourceKind === "plan-day"
    ? `/workouts/session/day/${sourceId}`
    : `/workouts/session/${sourceId}`;
  const { workoutTimerKey, restTimerKey } = useMemo(
    () => activeWorkoutStorageIdentities({ sourceKind, sourceId, userId }),
    [sourceId, sourceKind, userId]
  );

  const [session, setSession] = useState<WorkoutSession | null>(null);
  const sessionId = session?.id ?? null;
  const [startedAtMs, setStartedAtMs] = useState(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [sessionNotes, setSessionNotes] = useState("");
  const [exerciseStates, setExerciseStates] = useState<ActiveWorkoutExerciseState[]>([]);
  const [activeExerciseIndex, setActiveExerciseIndex] = useState(0);
  const [activeSetIndex, setActiveSetIndex] = useState(0);
  const [timerSeconds, setTimerSeconds] = useState(75);
  const [timerLeft, setTimerLeft] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timerEndsAtMs, setTimerEndsAtMs] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isStarting, setIsStarting] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [history, setHistory] = useState<WorkoutSessionSummary[]>([]);
  const [completedSummary, setCompletedSummary] = useState<ActiveWorkoutSummary | null>(null);
  const [progressionTargets, setProgressionTargets] = useState<UserProgressionTarget[]>([]);
  const [alternatives, setAlternatives] = useState<UserExerciseAlternative[]>([]);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [replacementReason, setReplacementReason] = useState<ExerciseAlternativeReason>("machine_taken");
  const [replacementPickerOpen, setReplacementPickerOpen] = useState(false);
  const [isSavingAlternative, setIsSavingAlternative] = useState(false);
  const [setFeedback, setSetFeedback] = useState("");
  const [setFeedbackVariant, setSetFeedbackVariant] = useState<"info" | "error">("info");
  const [prFeedback, setPrFeedback] = useState("");
  const [executionState, setExecutionState] = useState<WorkoutSessionExecutionState | null>(null);
  const [executionCursorItems, setExecutionCursorItems] = useState<WorkoutSessionExecutionCursorRow[]>([]);

  const executionHydratedRef = useRef(false);
  const activeSessionStoreRef = useRef<ActiveSessionStore | null>(null);
  const restExpiryCommandRef = useRef<string | null>(null);
  const controllerDeviceIdRef = useRef<string | null>(null);
  const setDetailsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const exerciseStatesRef = useRef(exerciseStates);
  const autosaveAdapterRef = useRef<WorkoutSetAutosaveAdapter<ActiveWorkoutExerciseState[]> | null>(null);
  const autosaveCoordinatorRef = useRef<WorkoutSetAutosaveCoordinator | null>(null);

  const mirrorExecutionState = useCallback((next: WorkoutSessionExecutionState) => {
    setExecutionState(next);
    const now = Date.now();
    const derivedStartedAt = executionStartedAtMs(next, now);
    setStartedAtMs(derivedStartedAt);
    setElapsedSeconds(executionElapsedSeconds(next, now));
    storeTimestamp(workoutTimerKey, derivedStartedAt);

    const restLeft = executionRestSecondsLeft(next, now);
    const parsedRestEndsAt = next.rest_ends_at ? Date.parse(next.rest_ends_at) : Number.NaN;
    if (next.view_state === "rest" && restLeft > 0 && Number.isFinite(parsedRestEndsAt)) {
      setTimerSeconds(next.rest_duration_seconds ?? restLeft);
      setTimerLeft(restLeft);
      setTimerEndsAtMs(parsedRestEndsAt);
      setIsTimerRunning(true);
      storeTimestamp(restTimerKey, parsedRestEndsAt);
    } else {
      setTimerLeft(0);
      setTimerEndsAtMs(null);
      setIsTimerRunning(false);
      clearStoredValue(restTimerKey);
    }

    if (userId) {
      writeActiveWorkoutState(userId, activeWorkoutCacheFromExecution(next, {
        route: sessionRoute,
        label: dayRef.current.day_name,
        controllerDeviceId: controllerDeviceIdRef.current
      }, now));
    }
  }, [restTimerKey, sessionRoute, userId, workoutTimerKey]);

  const dispatchExecution = useCallback((
    commandType: Parameters<ActiveSessionStore["dispatch"]>[0]["commandType"],
    payload: Parameters<ActiveSessionStore["dispatch"]>[0]["payload"],
    options: {
      rollback?: (currentServerState: WorkoutSessionExecutionState | null) => void;
      reportFailure?: boolean;
    } = {}
  ) => {
    const store = activeSessionStoreRef.current;
    const attemptedState = store?.getSnapshot().executionState ?? null;
    if (!store || !userId || !sessionId) {
      return Promise.reject(new Error("The workout execution store is unavailable."));
    }
    const operation = store.dispatch({
      userId,
      workoutSessionId: sessionId,
      commandId: createSessionCommandId(),
      commandType,
      payload
    } as Parameters<ActiveSessionStore["dispatch"]>[0]);
    void operation.then(
      (response) => { mirrorExecutionState(response.state); },
      (error) => {
        options.rollback?.(attemptedState);
        if (options.reportFailure === false) return;
        const currentTr = trRef.current;
        setSetFeedbackVariant("error");
        setSetFeedback(currentTr("offline.setSaveCombined"));
        toastRef.current({
          title: currentTr("completion.saveFailedTitle"),
          description: userSafeError(error, currentTr("offline.keepOpenRetry"))
        });
      }
    );
    return operation.then((response) => response.state);
  }, [mirrorExecutionState, sessionId, userId]);

  useEffect(() => {
    let active = true;
    executionHydratedRef.current = false;
    activeSessionStoreRef.current = null;
    setIsStarting(true);
    setSession(null);
    setLoadFailed(false);
    setCompletedSummary(null);

    const currentTr = trRef.current;
    if (!userId) {
      setIsStarting(false);
      toastRef.current({
        title: currentTr("header.signInRequired"),
        description: currentTr("header.signInBeforeSaving")
      });
      return () => { active = false; };
    }

    const currentDay = dayRef.current;
    const currentDirectWorkout = directWorkoutRef.current;
    const storedActiveWorkout = readActiveWorkoutState(userId);
    const candidateSessionId = storedActiveWorkout
      && storedActiveWorkout.route === sessionRoute
      && isValidActiveWorkoutRoute(storedActiveWorkout.route)
      ? storedActiveWorkout.sessionId
      : null;
    const sessionStart = sourceKind === "plan-day"
      ? getOrStartWorkoutDaySession(userId, currentDay)
      : getOrStartWorkoutSession(userId, currentDirectWorkout!, candidateSessionId);

    sessionStart
      .then(async (nextSession) => {
        if (!active) return;
        controllerDeviceIdRef.current = getActiveWorkoutDeviceId();

        const storedStartedAt = readStoredTimestamp(workoutTimerKey);
        const storedRestEndsAt = readStoredTimestamp(restTimerKey);
        const exerciseIds = currentDay.exercises.map((exercise) => exercise.id);
        const store = getActiveSessionStore({
          userId,
          workoutSessionId: nextSession.id,
          adapter: activeSessionPersistenceAdapter,
          clearCompatibilityCache: () => clearActiveWorkoutState(userId)
        });
        activeSessionStoreRef.current = store;
        const hydration = store.hydrate({
          legacyCache: {
            userId,
            sessionId: nextSession.id,
            startedAtMs: storedStartedAt,
            restEndsAtMs: storedRestEndsAt,
            restDurationSeconds: 75,
            controllerDeviceId: controllerDeviceIdRef.current
          }
        });
        const [, workoutHistory, targets, savedAlternatives] = await Promise.all([
          hydration,
          getWorkoutHistoryDetailed(userId, 100),
          sourceKind === "plan-day"
            ? getProgressionTargets(userId, exerciseIds).catch(() => [])
            : Promise.resolve([]),
          sourceKind === "plan-day"
            ? getExerciseAlternatives(userId).catch(() => [])
            : Promise.resolve([])
        ]);
        const hydrated = store.getSnapshot();
        let authoritativeState = hydrated.executionState;
        const cursorItems = [...hydrated.prescription];
        const existingLogs = [...hydrated.performedLogs];
        if (!authoritativeState) throw new Error("The active workout has no execution state.");

        if (
          controllerDeviceIdRef.current
          && authoritativeState.controller_device_id !== controllerDeviceIdRef.current
        ) {
          const response = await store.dispatch({
            userId,
            workoutSessionId: nextSession.id,
            commandId: createSessionCommandId(),
            commandType: "move_cursor",
            payload: {
              active_snapshot_item_id: authoritativeState.active_snapshot_item_id,
              active_item_order: authoritativeState.active_item_order,
              active_set_number: authoritativeState.active_set_number,
              controller_device_id: controllerDeviceIdRef.current
            }
          });
          authoritativeState = response.state;
        }

        if (
          authoritativeState.view_state === "rest"
          && executionRestSecondsLeft(authoritativeState) <= 0
        ) {
          const response = await store.dispatch({
            userId,
            workoutSessionId: nextSession.id,
            commandId: createSessionCommandId(),
            commandType: "clear_rest",
            payload: {
              view_state: "set_entry",
              completion_reason: "natural_expiration",
              controller_device_id: controllerDeviceIdRef.current
            }
          });
          authoritativeState = response.state;
        }

        if (!active) return;
        const authoritativeItems = cursorItems.length || !isMockAuthUserId(userId)
          ? cursorItems
          : mockPrescriptionItemsFromPlan(currentDay.exercises, nextSession.id, userId);
        setExecutionCursorItems(authoritativeItems);
        const hydratedStates = hydrateStates(
          authoritativeItems.map((item) => makeFrozenExerciseState(item, currentDay.exercises)),
          existingLogs
        );
        setExerciseStates(hydratedStates);
        exerciseStatesRef.current = hydratedStates;
        const authoritativeCursor = executionCursorToIndexes(
          authoritativeState,
          authoritativeItems,
          hydratedStates.map((item) => item.exercise)
        );
        const cursor = authoritativeState.view_state === "set_entry"
          ? nextIncompleteSetCursor(
              hydratedStates.flatMap((exercise, exerciseIndex) =>
                exercise.sets.map((set, setIndex) => ({
                  exerciseIndex,
                  setIndex,
                  completed: Boolean(set.completedAt)
                }))
              ),
              authoritativeCursor
            )
          : authoritativeCursor;
        const exerciseIndex = Math.min(
          Math.max(0, cursor.exerciseIndex),
          Math.max(0, hydratedStates.length - 1)
        );
        const setCount = hydratedStates[exerciseIndex]?.sets.length ?? 1;
        const setIndex = Math.min(
          Math.max(0, cursor.setIndex),
          Math.max(0, setCount - 1)
        );
        setActiveExerciseIndex(exerciseIndex);
        setActiveSetIndex(setIndex);
        setTimerSeconds(
          hydratedStates[exerciseIndex]?.sets[setIndex]?.plannedRestSeconds ?? 75
        );
        mirrorExecutionState(authoritativeState);
        setSession(nextSession);
        setSessionNotes(nextSession.notes ?? "");
        setHistory(workoutHistory.filter((item) => item.id !== nextSession.id));
        setProgressionTargets(targets);
        setAlternatives(savedAlternatives.filter((item) => exerciseIds.includes(item.plan_exercise_id)));
        executionHydratedRef.current = true;
      })
      .catch((error) => {
        if (active) {
          setSession(null);
          setLoadFailed(true);
        }
        const latestTr = trRef.current;
        toastRef.current({
          title: latestTr("header.loadFailedTitle"),
          description: userSafeError(error, latestTr("header.loadFailedDescription"))
        });
      })
      .finally(() => {
        if (active) setIsStarting(false);
      });

    return () => { active = false; };
  }, [
    mirrorExecutionState,
    restTimerKey,
    sessionRoute,
    sourceId,
    sourceKind,
    userId,
    workoutTimerKey
  ]);

  useEffect(() => {
    const tick = () => {
      const now = activeSessionClock.getSnapshot();
      setElapsedSeconds(
        executionState
          ? executionElapsedSeconds(executionState, now)
          : Math.max(0, Math.floor((now - startedAtMs) / 1000))
      );
      const nextLeft = executionState
        ? executionRestSecondsLeft(executionState, now)
        : 0;
      setTimerLeft(nextLeft);
      setIsTimerRunning(Boolean(executionState?.view_state === "rest" && nextLeft > 0));
      if (executionState?.view_state === "rest" && nextLeft <= 0) {
        const expiryKey = `${executionState.revision}:${executionState.rest_ends_at}`;
        if (restExpiryCommandRef.current === expiryKey) return;
        restExpiryCommandRef.current = expiryKey;
        setTimerEndsAtMs(null);
        setIsTimerRunning(false);
        clearStoredValue(restTimerKey);
        if (userId && sessionId && executionHydratedRef.current) {
          void dispatchExecution("clear_rest", {
            view_state: "set_entry",
            completion_reason: "natural_expiration",
            controller_device_id: controllerDeviceIdRef.current
          });
        }
        const currentTr = trRef.current;
        toastRef.current({
          title: currentTr("notifications.restFinished"),
          description: currentTr("notifications.nextSetReady")
        });
        if (
          typeof window !== "undefined"
          && "Notification" in window
          && Notification.permission === "granted"
        ) {
          new Notification(currentTr("notifications.restFinished"), {
            body: currentTr("notifications.nextSetReady")
          });
        }
      }
    };
    return activeSessionClock.subscribe(tick);
  }, [dispatchExecution, executionState, restTimerKey, sessionId, startedAtMs, userId]);

  useEffect(() => {
    if (!executionHydratedRef.current || !userId || !sessionId || !executionState) return;
    const cursorItem = executionCursorItems[activeExerciseIndex]
      ?? executionCursorItems.find((item) => item.itemOrder === activeExerciseIndex + 1)
      ?? null;
    const itemOrder = cursorItem?.itemOrder ?? activeExerciseIndex + 1;
    const setNumber = activeSetIndex + 1;
    if (
      executionState.active_snapshot_item_id === (cursorItem?.id ?? null)
      && executionState.active_item_order === itemOrder
      && executionState.active_set_number === setNumber
      && executionState.controller_device_id === controllerDeviceIdRef.current
    ) return;

    void dispatchExecution(
      "move_cursor",
      {
        active_snapshot_item_id: cursorItem?.id ?? null,
        active_item_order: itemOrder,
        active_set_number: setNumber,
        controller_device_id: controllerDeviceIdRef.current
      },
      {
        rollback: (currentServerState) => {
          if (!currentServerState) return;
          const previousCursor = executionCursorToIndexes(
            currentServerState,
            executionCursorItems
          );
          setActiveExerciseIndex(previousCursor.exerciseIndex);
          setActiveSetIndex(previousCursor.setIndex);
        }
      }
    );
  }, [
    activeExerciseIndex,
    activeSetIndex,
    dispatchExecution,
    executionCursorItems,
    executionState,
    sessionId,
    userId
  ]);

  const activeExercise = exerciseStates[activeExerciseIndex];
  const activeSet = activeExercise?.sets[activeSetIndex];
  const totalSets = exerciseStates.reduce((sum, item) => sum + item.sets.length, 0);
  const completedSets = exerciseStates.reduce(
    (sum, item) => sum + item.sets.filter((set) => set.completedAt).length,
    0
  );
  const isFinished = completedSets === totalSets && totalSets > 0;
  const durationMinutes = Math.max(1, Math.ceil(elapsedSeconds / 60));
  const activePreviousPerformance = activeExercise
    ? previousPerformance(history, activeExercise.exercise.exercise_name, formatters)
    : null;
  const activeProgressionTarget = progressionTargets.find(
    (target) => target.plan_exercise_id === activeExercise?.exercise.id
  ) ?? null;
  const activeAlternatives = alternatives.filter(
    (alternative) => alternative.plan_exercise_id === activeExercise?.exercise.id
  );
  const currentGuideUrl = activeExercise?.exercise.exercise_url
    || (activeExercise?.exercise.notes?.startsWith("http")
      ? activeExercise.exercise.notes
      : null);
  const currentCustomVideoUrl = activeExercise?.exercise.custom_video_url || null;
  const currentInstructions = activeExercise?.exercise.instructions
    || tr("exercise.defaultInstructions");
  const previewPrs = buildPrs(exerciseStates, history, tr, formatters);
  const sessionSets = buildSessionSets(exerciseStates);
  const totalVolume = roundWorkoutMetric(
    sessionSets.reduce((sum, set) => sum + set.weightKg * set.reps, 0)
  );
  const nextExercise = exerciseStates[activeExerciseIndex + 1];
  const activeExerciseCompleted = activeExercise?.sets.every((set) => set.completedAt) ?? false;
  const nextSetLabel = activeExercise && !activeExerciseCompleted && activeSet
    ? `${tr("set.label", { count: formatters.integer(activeSet.setNumber) })} / ${formatters.integer(activeExercise.sets.length)}`
    : nextExercise
      ? tr("exercise.nextExercise", {
          name: isolateBidiText(nextExercise.exercise.exercise_name)
        })
      : tr("navigation.allDone");
  const workoutContext: Record<string, unknown> = {
    plan: day.plan,
    workout_day: {
      id: day.id,
      name: day.day_name,
      weekday: day.weekday,
      notes: day.notes
    },
    planned_exercises: executionCursorItems.map((item) => ({
      id: item.sourcePlanExerciseId ?? item.sourcePlanActivityId ?? item.id,
      name: item.activityName,
      item_order: item.itemOrder,
      normalization_status: item.normalizationStatus,
      prescription_sets: item.prescriptionSets
    })),
    active_exercise: activeExercise?.exercise ?? null,
    logged_sets: buildWorkoutContextLogRows(exerciseStates),
    session: session ? {
      id: session.id,
      duration_minutes: durationMinutes,
      notes: sessionNotes
    } : null,
    previous_performance: activePreviousPerformance,
    possible_prs: previewPrs,
    skipped_exercises: exerciseStates
      .filter((item) => !item.sets.some((set) => set.completedAt))
      .map((item) => item.exercise.exercise_name),
    saved_progression_target: activeProgressionTarget
  };

  function updateSet(
    exerciseIndex: number,
    setIndex: number,
    patch: Partial<ActiveWorkoutSetState>
  ) {
    setExerciseStates((current) => {
      const next = current.map((item, itemIndex) => itemIndex === exerciseIndex
        ? {
            ...item,
            sets: item.sets.map((set, currentSetIndex) =>
              currentSetIndex === setIndex ? mergeSetPatch(set, patch) : set
            )
          }
        : item);
      exerciseStatesRef.current = next;
      return next;
    });
  }

  function statesWithSetPatch(
    exerciseIndex: number,
    setIndex: number,
    patch: Partial<ActiveWorkoutSetState>
  ) {
    return exerciseStates.map((item, itemIndex) => itemIndex === exerciseIndex
      ? {
          ...item,
          sets: item.sets.map((set, currentSetIndex) =>
            currentSetIndex === setIndex ? mergeSetPatch(set, patch) : set
          )
        }
      : item);
  }

  async function persistProgress(states = exerciseStates) {
    if (!sessionId) return;
    const rows = buildCanonicalLogRows(states, { pendingOnly: true });
    if (rows.length) {
      const store = activeSessionStoreRef.current;
      if (!store) throw new Error("The workout execution store is unavailable.");
      await store.saveCanonicalSets(rows);
    }
    setExerciseStates((current) => {
      const next = acknowledgeSetWrites(current, states);
      exerciseStatesRef.current = next;
      return next;
    });
  }

  useEffect(() => {
    autosaveAdapterRef.current = {
      getSnapshot: () => exerciseStatesRef.current,
      hasPendingWrites: hasPendingValidSetWrites,
      persistSnapshot: async (states) => {
        if (!sessionId) return;
        const rows = buildCanonicalLogRows(states, {
          pendingOnly: true,
          validOnly: true
        });
        if (!rows.length) return;
        const store = activeSessionStoreRef.current;
        if (!store) throw new Error("The workout execution store is unavailable.");
        await store.saveCanonicalSets(rows);
      },
      acknowledgeSnapshot: (savedStates) => {
        setExerciseStates((current) => {
          const next = acknowledgeSetWrites(current, savedStates);
          exerciseStatesRef.current = next;
          return next;
        });
      },
      onFailure: (error) => {
        console.warn("Plaivra will retry the pending completed-set details.", error);
      }
    };
  }, [sessionId]);

  useEffect(() => mountWorkoutSetAutosaveCoordinator(
    autosaveCoordinatorRef,
    () => {
      const adapter = autosaveAdapterRef.current;
      if (!adapter) throw new Error("Workout set autosave is unavailable.");
      return adapter;
    }
  ), []);

  function flushPendingSetWrites() {
    return autosaveCoordinatorRef.current?.requestFlush() ?? Promise.resolve();
  }

  function handleSetDetailsOpenChange(open: boolean) {
    setActionsOpen(open);
    if (!open) void flushPendingSetWrites();
  }

  useEffect(() => {
    exerciseStatesRef.current = exerciseStates;
  }, [exerciseStates]);

  useEffect(() => {
    if (!sessionId || isStarting || !hasPendingValidSetWrites(exerciseStates)) return;
    autosaveCoordinatorRef.current?.scheduleFlush(650);
  }, [exerciseStates, isStarting, sessionId]);

  function restoreRestTimer(snapshot: {
    timerSeconds: number;
    timerLeft: number;
    timerEndsAtMs: number | null;
    isTimerRunning: boolean;
  }) {
    setTimerSeconds(snapshot.timerSeconds);
    setTimerLeft(snapshot.timerLeft);
    setTimerEndsAtMs(snapshot.timerEndsAtMs);
    setIsTimerRunning(snapshot.isTimerRunning);
    if (snapshot.timerEndsAtMs) storeTimestamp(restTimerKey, snapshot.timerEndsAtMs);
    else clearStoredValue(restTimerKey);
  }

  function startRestTimer(seconds: number) {
    const safeSeconds = Math.max(0, seconds);
    if (!safeSeconds) return;
    const previous = { timerSeconds, timerLeft, timerEndsAtMs, isTimerRunning };
    const deadline = restDeadline(safeSeconds);
    setTimerSeconds(safeSeconds);
    setTimerLeft(safeSeconds);
    setTimerEndsAtMs(deadline);
    setIsTimerRunning(true);
    storeTimestamp(restTimerKey, deadline);
    if (userId && sessionId && executionHydratedRef.current) {
      void dispatchExecution(
        "start_rest",
        {
          duration_seconds: safeSeconds,
          controller_device_id: controllerDeviceIdRef.current
        },
        { rollback: () => restoreRestTimer(previous) }
      );
    }
  }

  function stopRestTimer() {
    const previous = { timerSeconds, timerLeft, timerEndsAtMs, isTimerRunning };
    setTimerLeft(0);
    setTimerEndsAtMs(null);
    setIsTimerRunning(false);
    clearStoredValue(restTimerKey);
    if (userId && sessionId && executionHydratedRef.current) {
      void dispatchExecution(
        "clear_rest",
        {
          view_state: "set_entry",
          completion_reason: "user_skipped",
          controller_device_id: controllerDeviceIdRef.current
        },
        { rollback: () => restoreRestTimer(previous) }
      );
    }
  }

  async function reconcileSavedSetAfterExecutionFailure(
    savedStates: ActiveWorkoutExerciseState[]
  ) {
    if (!userId || !sessionId) return;
    const store = activeSessionStoreRef.current;
    if (!store) throw new Error("The workout execution store is unavailable.");
    await store.hydrate({ force: true });
    const authoritativeState = store.getSnapshot().executionState;
    const authoritativeLogs = [...store.getSnapshot().performedLogs];
    if (!authoritativeState) throw new Error("The workout execution state is unavailable.");
    const reconciledStates = hydrateStates(savedStates, authoritativeLogs);
    const cursor = executionCursorToIndexes(
      authoritativeState,
      executionCursorItems,
      day.exercises
    );
    const exerciseIndex = Math.min(
      Math.max(0, cursor.exerciseIndex),
      Math.max(0, reconciledStates.length - 1)
    );
    const setCount = reconciledStates[exerciseIndex]?.sets.length ?? 1;
    setExerciseStates(reconciledStates);
    exerciseStatesRef.current = reconciledStates;
    setActiveExerciseIndex(exerciseIndex);
    setActiveSetIndex(Math.min(
      Math.max(0, cursor.setIndex),
      Math.max(0, setCount - 1)
    ));
    mirrorExecutionState(authoritativeState);
  }

  async function finishSet(exerciseIndex: number, setIndex: number) {
    const targetSet = exerciseStates[exerciseIndex]?.sets[setIndex];
    const storeSnapshot = activeSessionStoreRef.current?.getSnapshot();
    if (
      !targetSet
      || targetSet.completedAt
      || isSaving
      || isStarting
      || !sessionId
      || !userId
      || !executionHydratedRef.current
      || executionState?.session_state === "paused"
      || storeSnapshot?.root?.status !== "started"
    ) return;

    const setDraftValidation = validateActiveWorkoutSetDraft(
      targetSet.reps,
      targetSet.weightKg
    );
    if (!setDraftValidation.complete) {
      setSetFeedbackVariant("error");
      setSetFeedback(tr("validation.requiredValues"));
      return;
    }

    if (!setHasValidEffortInputs(targetSet)) {
      setActiveExerciseIndex(exerciseIndex);
      setActiveSetIndex(setIndex);
      setActionsOpen(true);
      return;
    }

    const previousStates = exerciseStates;
    const previousActiveExerciseIndex = activeExerciseIndex;
    const previousActiveSetIndex = activeSetIndex;
    const previousTimer = { timerSeconds, timerLeft, timerEndsAtMs, isTimerRunning };
    const completedAt = new Date();
    const nextStates = statesWithSetPatch(exerciseIndex, setIndex, {
      completedAt: completedAt.toISOString()
    });
    const store = activeSessionStoreRef.current;
    if (!store) {
      toastRef.current({
        title: tr("completion.saveFailedTitle"),
        description: tr("offline.keepOpenRetry")
      });
      return;
    }

    let transition;
    try {
      const canonical = store.getSnapshot();
      const currentPrescriptionItem = canonical.prescription.find(
        (item) => item.id === executionCursorItems[exerciseIndex]?.id
      ) ?? canonical.prescription.find(
        (item) => item.itemOrder === exerciseIndex + 1
      );
      transition = planSessionAfterSetCompletion({
        userId,
        workoutSessionId: sessionId,
        currentSnapshotItemId: currentPrescriptionItem?.id ?? "",
        currentSetNumber: setIndex + 1,
        prescription: canonical.prescription,
        performedLogs: canonical.performedLogs,
        restDurationSeconds: targetSet.plannedRestSeconds ?? timerSeconds,
        controllerDeviceId: controllerDeviceIdRef.current
      });
    } catch (error) {
      toastRef.current({
        title: tr("completion.saveFailedTitle"),
        description: userSafeError(error, tr("offline.keepOpenRetry"))
      });
      return;
    }

    setIsSaving(true);
    try {
      const response = await store.completeCanonicalSet({
        logs: buildCanonicalLogRows(nextStates, { pendingOnly: true }),
        executionIntent: {
          userId,
          workoutSessionId: sessionId,
          commandId: createSessionCommandId(),
          commandType: "complete_set_transition",
          payload: {
            active_snapshot_item_id: transition.patch.active_snapshot_item_id,
            active_item_order: transition.patch.active_item_order,
            active_set_number: transition.patch.active_set_number,
            view_state: transition.patch.view_state,
            rest_duration_seconds: transition.patch.rest_duration_seconds,
            controller_device_id: transition.patch.controller_device_id
          }
        }
      });
      mirrorExecutionState(response.state);

      const acknowledgedStates = acknowledgeSetWrites(nextStates, nextStates);
      setExerciseStates(acknowledgedStates);
      exerciseStatesRef.current = acknowledgedStates;
      setActiveExerciseIndex(transition.nextExerciseIndex);
      setActiveSetIndex(transition.nextSetIndex);
      if (!transition.hasNextSet || transition.patch.view_state !== "rest") {
        setTimerLeft(0);
        setTimerEndsAtMs(null);
        setIsTimerRunning(false);
        clearStoredValue(restTimerKey);
      }
      if (
        transition.nextExerciseIndex !== exerciseIndex
        && transition.patch.view_state !== "rest"
      ) {
        setTimerSeconds(
          nextStates[transition.nextExerciseIndex]
            ?.sets[transition.nextSetIndex]
            ?.plannedRestSeconds ?? 75
        );
      }
      setSetFeedbackVariant("info");
      setSetFeedback(tr("set.savedDetails", {
        set: formatters.integer(targetSet.setNumber),
        reps: formatPlannedReps(targetSet.reps, formatters, "-"),
        weight: formatters.measurement(toNumberOrNull(targetSet.weightKg) ?? 0, "kg")
      }));
      const currentWeight = toNumberOrNull(targetSet.weightKg) ?? 0;
      const currentReps = toNumberOrNull(targetSet.reps) ?? 0;
      const exercise = exerciseStates[exerciseIndex];
      if (exercise && currentWeight > 0 && currentReps > 0) {
        const prevPerf = previousPerformance(
          history,
          exercise.exercise.exercise_name,
          formatters
        );
        if (
          prevPerf
          && (
            currentWeight > (prevPerf.lastWeightKg ?? 0)
            || currentReps > (prevPerf.lastReps ?? 0)
          )
        ) {
          setPrFeedback(tr("set.newBest", {
            name: isolateBidiText(exercise.exercise.exercise_name),
            weight: formatters.measurement(currentWeight, "kg"),
            reps: formatters.integer(currentReps)
          }));
          window.setTimeout(() => setPrFeedback(""), 3500);
        }
      }
    } catch (error) {
      if (
        error instanceof Error
        && "code" in error
        && error.code === "canonical_set_saved_execution_sync_failed"
      ) {
        const acknowledgedStates = acknowledgeSetWrites(nextStates, nextStates);
        setExerciseStates(acknowledgedStates);
        exerciseStatesRef.current = acknowledgedStates;
        setSetFeedbackVariant("error");
        setSetFeedback(`${tr("set.saved")} ${tr("offline.keepOpenRetry")}`);
        toastRef.current({
          title: tr("set.saved"),
          description: userSafeError(error, tr("offline.keepOpenRetry"))
        });
        try {
          await reconcileSavedSetAfterExecutionFailure(nextStates);
        } catch (reconcileError) {
          console.warn(
            "Plaivra saved the completed set but could not reconcile the workout position.",
            reconcileError
          );
        }
      } else {
        setExerciseStates(previousStates);
        exerciseStatesRef.current = previousStates;
        setActiveExerciseIndex(previousActiveExerciseIndex);
        setActiveSetIndex(previousActiveSetIndex);
        restoreRestTimer(previousTimer);
        setSetFeedbackVariant("error");
        setSetFeedback(tr("offline.setSaveCombined"));
        toastRef.current({
          title: tr("completion.saveFailedTitle"),
          description: userSafeError(error, tr("offline.keepOpenRetry"))
        });
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function restartSet(exerciseIndex: number, setIndex: number) {
    if (isSaving) return;
    const previousStates = exerciseStates;
    setIsSaving(true);
    const nextStates = statesWithSetPatch(exerciseIndex, setIndex, { completedAt: null });
    setExerciseStates(nextStates);
    exerciseStatesRef.current = nextStates;
    try {
      await persistProgress(nextStates);
      setSetFeedbackVariant("info");
      setSetFeedback(legacySetReopened);
    } catch (error) {
      setExerciseStates(previousStates);
      exerciseStatesRef.current = previousStates;
      setSetFeedbackVariant("error");
      setSetFeedback(legacySetReopenFailed);
      toastRef.current({
        title: tr("completion.saveFailedTitle"),
        description: userSafeError(error, tr("header.loadFailedDescription"))
      });
    } finally {
      setIsSaving(false);
    }
  }

  function executionCursorFor(exerciseIndex: number, setIndex: number) {
    const item = executionCursorItems[exerciseIndex]
      ?? executionCursorItems.find((candidate) => candidate.itemOrder === exerciseIndex + 1)
      ?? null;
    return {
      snapshotItemId: item?.id ?? null,
      itemOrder: item?.itemOrder ?? exerciseIndex + 1,
      setNumber: setIndex + 1
    };
  }

  function openSessionReview() {
    if (isStarting || !sessionId || !executionHydratedRef.current) return;
    setFinishOpen(true);
    if (!userId) return;
    const cursor = executionCursorFor(activeExerciseIndex, activeSetIndex);
    void dispatchExecution("move_cursor", {
      active_snapshot_item_id: cursor.snapshotItemId,
      active_item_order: cursor.itemOrder,
      active_set_number: cursor.setNumber,
      view_state: "session_review",
      controller_device_id: controllerDeviceIdRef.current
    });
  }

  function handleSessionReviewOpenChange(open: boolean) {
    if (open) {
      openSessionReview();
      return;
    }
    setFinishOpen(false);
    if (!userId || !sessionId || !executionHydratedRef.current) return;
    const cursor = executionCursorFor(activeExerciseIndex, activeSetIndex);
    void dispatchExecution("move_cursor", {
      active_snapshot_item_id: cursor.snapshotItemId,
      active_item_order: cursor.itemOrder,
      active_set_number: cursor.setNumber,
      view_state: isFinished ? "exercise_complete" : "set_entry",
      controller_device_id: controllerDeviceIdRef.current
    });
  }

  async function completeSession() {
    if (!sessionId || isSaving || isStarting || !executionHydratedRef.current) return;
    const invalidLocation = exerciseStates.flatMap((item, exerciseIndex) =>
      item.sets.map((set, setIndex) => ({ set, exerciseIndex, setIndex }))
    ).find(({ set }) =>
      Boolean(set.completedAt || set.hasPersistedLog) && !setHasValidEffortInputs(set)
    );
    if (invalidLocation) {
      setActiveExerciseIndex(invalidLocation.exerciseIndex);
      setActiveSetIndex(invalidLocation.setIndex);
      setActionsOpen(true);
      return;
    }
    try {
      setIsSaving(true);
      const summary = buildSummary(
        exerciseStates,
        history,
        durationMinutes,
        sessionNotes,
        tr,
        formatters
      );
      const store = activeSessionStoreRef.current;
      if (!store) throw new Error("The workout execution store is unavailable.");
      await store.completeSession({
        notes: sessionNotes,
        durationMinutes,
        finalLogs: sourceKind === "direct"
          ? buildCanonicalLogRows(exerciseStates, {
              pendingOnly: true,
              validOnly: true
            })
          : buildCanonicalLogRows(exerciseStates)
      });
      clearStoredValue(workoutTimerKey);
      clearStoredValue(restTimerKey);
      setFinishOpen(false);
      setCompletedSummary(summary);
      toastRef.current({
        title: tr("completion.title"),
        description: tr("completion.savedNamedWorkout", {
          name: isolateBidiText(day.day_name)
        })
      });
      celebrate(tr("completion.title"));
      if (sourceKind === "direct") router.push("/workout-history");
    } catch (error) {
      toastRef.current({
        title: tr("completion.saveFailedTitle"),
        description: userSafeError(error)
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function togglePause() {
    if (!executionState || isSaving || isStarting) return;
    setIsSaving(true);
    try {
      await dispatchExecution(
        executionState.session_state === "paused" ? "resume" : "pause",
        { controller_device_id: controllerDeviceIdRef.current }
      );
    } catch {
      // dispatchExecution presents the localized recoverable failure.
    } finally {
      setIsSaving(false);
    }
  }

  function resetWorkoutTimer() {
    const previousStartedAt = startedAtMs;
    const previousElapsed = elapsedSeconds;
    const nextStartedAt = Date.now();
    setStartedAtMs(nextStartedAt);
    setElapsedSeconds(0);
    storeTimestamp(workoutTimerKey, nextStartedAt);
    if (userId && sessionId && executionHydratedRef.current) {
      void dispatchExecution(
        "reset_timer",
        { controller_device_id: controllerDeviceIdRef.current },
        {
          rollback: () => {
            setStartedAtMs(previousStartedAt);
            setElapsedSeconds(previousElapsed);
            storeTimestamp(workoutTimerKey, previousStartedAt);
          }
        }
      );
    }
  }

  async function skipCurrentExercise() {
    if (sourceKind !== "plan-day" || isSaving || isStarting || !activeExercise) return;
    const store = activeSessionStoreRef.current;
    const snapshotItemId = executionCursorItems[activeExerciseIndex]?.id;
    if (!store || !snapshotItemId) return;

    setIsSaving(true);
    try {
      await store.skipExercise(snapshotItemId, "user_skipped");
      const snapshot = store.getSnapshot();
      const items = [...snapshot.prescription];
      const nextStates = hydrateStates(
        items.map((item) => makeFrozenExerciseState(item, day.exercises)),
        [...snapshot.performedLogs]
      );
      const state = snapshot.executionState;
      const cursor = state
        ? executionCursorToIndexes(
            state,
            items,
            nextStates.map((item) => item.exercise)
          )
        : {
            exerciseIndex: Math.min(
              activeExerciseIndex + 1,
              Math.max(0, nextStates.length - 1)
            ),
            setIndex: 0
          };
      const nextExerciseIndex = Math.min(
        Math.max(0, cursor.exerciseIndex),
        Math.max(0, nextStates.length - 1)
      );
      const nextSetCount = nextStates[nextExerciseIndex]?.sets.length ?? 1;

      setExecutionCursorItems(items);
      setExerciseStates(nextStates);
      exerciseStatesRef.current = nextStates;
      setActiveExerciseIndex(nextExerciseIndex);
      setActiveSetIndex(Math.min(
        Math.max(0, cursor.setIndex),
        Math.max(0, nextSetCount - 1)
      ));
      if (state) mirrorExecutionState(state);
      setActionsOpen(false);
    } catch (error) {
      toastRef.current({
        title: tr("completion.saveFailedTitle"),
        description: userSafeError(error, tr("offline.keepOpenRetry"))
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function applyStableReplacement(replacement: Workout) {
    if (sourceKind !== "plan-day" || !userId || !sessionId || !activeExercise) return;
    const store = activeSessionStoreRef.current;
    if (!store) return;
    const originalName = activeExercise.exercise.exercise_name;
    setIsSavingAlternative(true);
    try {
      await store.replaceExercise({
        sourcePlanExerciseId: activeExercise.exercise.id,
        replacement
      });
      setExerciseStates((current) => {
        const next = current.map((item, index) => index === activeExerciseIndex
          ? {
              ...item,
              exercise: { ...item.exercise, exercise_name: replacement.name }
            }
          : item);
        exerciseStatesRef.current = next;
        return next;
      });
      setReplacementPickerOpen(false);
      toastRef.current({
        title: tr("exercise.replacementReady"),
        description: tr("exercise.replacementReadyDescription", {
          name: isolateBidiText(replacement.name)
        })
      });
      void createExerciseAlternative(userId, {
        plan_exercise_id: activeExercise.exercise.id,
        original_exercise_name: originalName,
        alternative_exercise_name: replacement.name,
        reason: replacementReason,
        target_muscle: replacement.target_muscle || activeExercise.exercise.target_muscle,
        equipment: replacement.equipment || activeExercise.exercise.equipment,
        created_by: "user"
      }).then((saved) => {
        setAlternatives((current) => [saved, ...current]);
      }).catch((error) => {
        console.warn(
          "Plaivra recorded the workout replacement but could not save the optional alternative shortcut.",
          error
        );
      });
    } catch (error) {
      toastRef.current({
        title: tr("exercise.replacementFailed"),
        description: userSafeError(error)
      });
    } finally {
      setIsSavingAlternative(false);
    }
  }

  function applyPreviousSet(exerciseIndex: number, setIndex: number) {
    const item = exerciseStates[exerciseIndex];
    const targetSet = item?.sets[setIndex];
    if (!item || !targetSet) return;
    const previous = previousSetForExercise(
      history,
      item.exercise.exercise_name,
      targetSet.setNumber
    );
    if (!previous) {
      toastRef.current({
        title: tr("exercise.noPreviousPerformance"),
        description: tr("exercise.noPreviousSetDescription")
      });
      return;
    }
    updateSet(exerciseIndex, setIndex, {
      reps: previous.reps === null ? targetSet.reps : String(previous.reps),
      weightKg: previous.weightKg === null
        ? targetSet.weightKg
        : String(previous.weightKg)
    });
  }

  if (isStarting) {
    return (
      <div
        data-active-workout-controller
        className="mx-auto flex min-h-[18rem] w-full max-w-3xl items-center justify-center"
        dir={dir}
      >
        <div className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground" role="status">
          <RefreshCcw className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
          {tr("header.loadingSession")}
        </div>
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div
        data-active-workout-controller
        className="mx-auto w-full max-w-2xl rounded-[var(--radius-lg)] border bg-card p-5"
        dir={dir}
      >
        <h1 className="font-semibold">{tr("header.loadFailedTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {tr("header.loadFailedDescription")}
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-4 min-h-12"
          onClick={() => window.location.reload()}
        >
          <RefreshCcw className="h-4 w-4" aria-hidden="true" />
          {tr("common.retry")}
        </Button>
      </div>
    );
  }

  if (!exerciseStates.length) {
    return (
      <div
        data-active-workout-controller
        className="mx-auto w-full max-w-2xl rounded-[var(--radius-lg)] border bg-card p-5"
        dir={dir}
      >
        <h1 className="font-semibold">{tr("header.noExercises")}</h1>
        <Button asChild variant="outline" className="mt-4 min-h-12">
          <Link href="/my-workout/plans">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            {tr("header.backToTrain")}
          </Link>
        </Button>
      </div>
    );
  }

  if (!activeExercise || !activeSet) return null;

  const activeRpeValidation = validateWorkoutSetEffortInput(activeSet.rpe, "rpe");
  const activeRirValidation = validateWorkoutSetEffortInput(activeSet.rir, "rir");
  const activeSetValidation = validateActiveWorkoutSetDraft(
    activeSet.reps,
    activeSet.weightKg
  );
  const isPaused = executionState?.session_state === "paused";
  const restActive = executionState?.view_state === "rest" && timerLeft > 0;
  const primaryActionKind = isPaused
    ? "resume"
    : restActive
      ? "skip-rest"
      : isFinished
        ? "finish"
        : "complete-set";
  const primaryActionLabel = isPaused
    ? tr("common.resume")
    : restActive
      ? tr("rest.skip")
      : isFinished
        ? tr("common.finish")
        : tr("set.finishNumbered", { count: formatters.integer(activeSet.setNumber) });
  const primaryActionDisabled = Boolean(
    completedSummary
    || isSaving
    || isStarting
    || !sessionId
    || (!isPaused && !restActive && !isFinished && (
      Boolean(activeSet.completedAt)
      || !activeSetValidation.complete
      || Boolean(activeRpeValidation.error)
      || Boolean(activeRirValidation.error)
    ))
  );
  const activeSetPath = buildActiveWorkoutSetPath(
    activeExercise.sets.map((set) => ({
      setNumber: set.setNumber,
      completed: Boolean(set.completedAt)
    })),
    activeSet.setNumber
  );
  const handlePrimaryAction = () => {
    if (isPaused) {
      void togglePause();
    } else if (restActive) {
      stopRestTimer();
    } else if (isFinished) {
      openSessionReview();
    } else {
      void finishSet(activeExerciseIndex, activeSetIndex);
    }
  };
  const busy = isSaving || isStarting;

  return (
    <div data-active-workout-controller className="contents">
      <ActiveWorkoutExecutionShell
        direction={dir}
        sessionLabel={sourceKind === "direct" ? tr("header.workoutSession") : day.day_name}
        exerciseName={activeExercise.exercise.exercise_name}
        exercisePositionLabel={tr("header.exerciseProgress", {
          current: formatters.integer(activeExerciseIndex + 1),
          total: formatters.integer(exerciseStates.length)
        })}
        setPositionLabel={tr("header.setProgress", {
          current: formatters.integer(activeSetIndex + 1),
          total: formatters.integer(activeExercise.sets.length)
        })}
        completedSetsLabel={tr("header.completedSetsProgress", {
          completed: formatters.integer(completedSets),
          total: formatters.integer(totalSets)
        })}
        elapsedLabel={formatters.timer(elapsedSeconds)}
        progress={clampWorkoutProgress(completedSets, totalSets)}
        miniHeatMapLabel={tr("heatMap.currentSessionHeat")}
        miniHeatMapDescription={tr("heatMap.currentSessionDescription")}
        paused={Boolean(isPaused)}
        busy={busy}
        restActive={restActive}
        restLabel={`${tr("rest.resting")} · ${formatters.timer(timerLeft)}`}
        nextContextLabel={nextSetLabel}
        currentSetLabel={tr("set.label", {
          count: formatters.integer(activeSet.setNumber)
        })}
        repsLabel={tr("set.reps")}
        weightLabel={tr("set.weightKg")}
        repsDraft={activeSet.reps}
        weightDraft={activeSet.weightKg}
        repsError={activeSet.reps.trim() && activeSetValidation.repsError
          ? activeSetValidation.repsError === "invalid"
            ? tr("validation.wholeReps")
            : tr("validation.requiredValues")
          : null}
        weightError={activeSet.weightKg.trim() && activeSetValidation.weightError
          ? tr("validation.nonNegative")
          : null}
        inputHint={!activeSet.reps.trim() || !activeSet.weightKg.trim()
          ? tr("validation.requiredValues")
          : null}
        setPathLabel={tr("set.path")}
        setPath={activeSetPath}
        setPathStateLabels={{
          completed: tr("navigation.completed"),
          active: tr("common.active"),
          available: tr("navigation.notStarted")
        }}
        formatSetNumber={formatters.integer}
        currentSetNumber={activeSet.setNumber}
        persisted={activeSet.hasPersistedLog}
        completed={Boolean(activeSet.completedAt)}
        hasDetails={activeSet.hasSetDetails}
        primaryActionKind={primaryActionKind}
        primaryActionLabel={primaryActionLabel}
        primaryActionDisabled={primaryActionDisabled}
        moreLabel={tr("common.more")}
        pauseLabel={tr("common.pause")}
        resumeLabel={tr("common.resume")}
        finishLabel={tr("common.finish")}
        addThirtySecondsLabel={tr("rest.addThirtySeconds")}
        restPresetLabels={[30, 60, 90, 180].map((seconds) => ({
          seconds,
          label: restPresetLabel(seconds, tr)
        }))}
        feedback={(
          <>
            <InlineFeedback
              message={setFeedback}
              variant={setFeedbackVariant}
              onClose={() => setSetFeedback("")}
            />
            <InlineFeedback
              message={prFeedback}
              onClose={() => setPrFeedback("")}
            />
          </>
        )}
        completionContent={(
          <ActiveWorkoutReviewBridge
            open={finishOpen}
            onOpenChange={handleSessionReviewOpenChange}
            busy={busy}
            sessionAvailable={Boolean(sessionId)}
            durationMinutes={durationMinutes}
            completedSets={completedSets}
            totalSets={totalSets}
            totalVolume={totalVolume}
            previewPrs={previewPrs}
            sessionNotes={sessionNotes}
            onSessionNotesChange={setSessionNotes}
            onComplete={() => { void completeSession(); }}
            completedSummary={completedSummary}
            dayName={day.day_name}
            tr={tr}
            formatters={formatters}
          />
        )}
        onRepsChange={(value) => updateSet(
          activeExerciseIndex,
          activeSetIndex,
          { reps: value }
        )}
        onWeightChange={(value) => updateSet(
          activeExerciseIndex,
          activeSetIndex,
          { weightKg: value }
        )}
        onSelectSet={(setNumber) => {
          const setIndex = activeExercise.sets.findIndex(
            (set) => set.setNumber === setNumber
          );
          if (setIndex < 0) return;
          void flushPendingSetWrites();
          setActiveSetIndex(setIndex);
        }}
        onPrimaryAction={handlePrimaryAction}
        onPauseResume={() => { void togglePause(); }}
        onFinish={openSessionReview}
        onOpenDetails={(trigger) => {
          setDetailsTriggerRef.current = trigger;
          setActionsOpen(true);
        }}
        onAddThirtySeconds={() => startRestTimer(timerLeft + 30)}
        onStartRest={startRestTimer}
        detailsContent={(
          <ActiveWorkoutDetailsBridge
            open={actionsOpen}
            onOpenChange={handleSetDetailsOpenChange}
            returnFocusRef={setDetailsTriggerRef}
            sourceKind={sourceKind}
            activeExercise={activeExercise}
            activeSet={activeSet}
            currentInstructions={currentInstructions}
            currentGuideUrl={currentGuideUrl}
            currentCustomVideoUrl={currentCustomVideoUrl}
            busy={busy}
            tr={tr}
            formatters={formatters}
            legacyReopenSetLabel={legacyReopenSetLabel}
            onApplyPreviousSet={() => applyPreviousSet(
              activeExerciseIndex,
              activeSetIndex
            )}
            onRestartSet={() => { void restartSet(activeExerciseIndex, activeSetIndex); }}
            onUpdateSet={(patch) => updateSet(
              activeExerciseIndex,
              activeSetIndex,
              patch
            )}
            activeAlternatives={activeAlternatives}
            replacementReason={replacementReason}
            onReplacementReasonChange={setReplacementReason}
            onUseReplacement={() => {
              setActionsOpen(false);
              setReplacementPickerOpen(true);
            }}
            onSkipExercise={() => { void skipCurrentExercise(); }}
            isSavingAlternative={isSavingAlternative}
            workoutContext={workoutContext}
            onResetTimer={resetWorkoutTimer}
            sessionSourceId={sessionId ?? day.id}
            replacementPickerOpen={replacementPickerOpen}
            onReplacementPickerOpenChange={setReplacementPickerOpen}
            dayName={day.day_name}
            onAddReplacement={(replacement) => { void applyStableReplacement(replacement); }}
          />
        )}
      />
    </div>
  );
}
