"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, RefreshCcw } from "lucide-react";
import Link from "next/link";

import { useAuth } from "@/components/auth/auth-provider";
import { useSuccessFeedback } from "@/components/feedback/success-feedback";
import { InlineFeedback } from "@/components/motion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toaster";
import {
  buildActiveWorkoutQuickActions,
  projectActiveWorkoutQuickActions,
  type ActiveWorkoutDetailsSection,
  type ActiveWorkoutQuickAction
} from "@/components/workouts/active-workout/active-workout-actions";
import { ActiveWorkoutDetailsBridge } from "@/components/workouts/active-workout/active-workout-details-bridge";
import { ActiveWorkoutConflict } from "@/components/workouts/active-workout/active-workout-conflict";
import {
  dispatchActiveWorkoutExecutionAwaited,
  dispatchActiveWorkoutExecutionBackground,
  type ActiveWorkoutExecutionDispatchOptions
} from "@/components/workouts/active-workout/active-workout-command-dispatch";
import { resolveActiveWorkoutExecutionCapability } from "@/components/workouts/active-workout/active-workout-execution-capability";
import { ActiveWorkoutExecutionShell } from "@/components/workouts/active-workout/active-workout-execution-shell";
import { ActiveWorkoutExerciseNavigator, buildActiveWorkoutExerciseNavigatorRows } from "@/components/workouts/active-workout/active-workout-exercise-navigator";
import { ActiveWorkoutMiniHeatMap } from "@/components/workouts/active-workout/active-workout-mini-heat-map";
import { useActiveWorkoutMuscleLoad } from "@/components/workouts/active-workout/active-workout-muscle-load-controller";
import { ActiveWorkoutReviewBridge } from "@/components/workouts/active-workout/active-workout-review-bridge";
import { useRegisterActiveWorkoutMinimize } from "@/components/workouts/active-workout/active-workout-session-navigation";
import {
  acknowledgeSetWrites,
  buildActiveWorkoutReview,
  buildCanonicalLogRows,
  buildSessionSets,
  buildSummary,
  buildWorkoutContextLogRows,
  directWorkoutDay,
  formatPlannedReps,
  hasPendingValidSetWrites,
  hydrateStates,
  isPendingSetWrite,
  makeFrozenExerciseState,
  mergeSetPatch,
  mockPrescriptionItemsFromPlan,
  roundWorkoutMetric,
  setHasValidEffortInputs,
  toNumberOrNull,
  type ActiveWorkoutExerciseState,
  type ActiveWorkoutPreviousPerformance,
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
  readPreviousActiveWorkoutRoute,
  resolveActiveWorkoutRoute,
  writeActiveWorkoutState
} from "@/lib/active-workout";
import { userSafeError } from "@/lib/error-formatting";
import { transientFeedbackDuration } from "@/lib/feedback/transient-feedback";
import { isMockAuthUserId } from "@/lib/fixtures/mock-auth";
import {
  isolateBidiText,
  useActiveWorkoutTranslation,
  type ActiveWorkoutTranslator
} from "@/lib/i18n/active-workout";
import { translateTrain } from "@/lib/i18n/train";
import { clearStoredValue, readStoredTimestamp, storeTimestamp } from "@/lib/workout-persistence";
import { getActiveWorkoutDeviceId } from "@/lib/workouts/active-workout-device";
import { activeWorkoutExerciseDetailHref, resolveActiveWorkoutExerciseDetailId } from "@/lib/workouts/active-workout-detail-navigation";
import { activeSessionClock } from "@/lib/workouts/active-session-store/clock";
import {
  getActiveSessionStore,
  type ActiveSessionStore
} from "@/lib/workouts/active-session-store/store";
import {
  createActiveWorkoutTabLeadership,
  type ActiveWorkoutSetConflict,
  type ActiveWorkoutSyncState,
  type ActiveWorkoutTabLeadership
} from "@/lib/workouts/active-session-sync";
import {
  clearActiveWorkoutSessionDrafts,
  clearActiveWorkoutSetDraft,
  mergeActiveWorkoutSetDrafts,
  readActiveWorkoutSetDrafts,
  writeActiveWorkoutSetDrafts
} from "@/lib/workouts/active-session-sync/set-drafts";
import { createSessionCommandId } from "@/lib/workouts/session-engine/commands";
import { planSessionAfterSetCompletion } from "@/lib/workouts/session-engine/reducer";
import { projectOptimisticSetCompletion } from "@/lib/workouts/optimistic-set-completion";
import {
  executionCursorToIndexes,
  executionElapsedSeconds,
  executionRestSecondsLeft,
  executionStartedAtMs
} from "@/lib/workouts/workout-session-execution";
import { activeSessionPersistenceAdapter } from "@/services/database/active-session-persistence-adapter";
import { subscribeToActiveSessionInvalidation } from "@/services/database/active-session-realtime";
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
  getOpenWorkoutSessionWithStatus
} from "@/services/database/workout-sessions";
import { readActiveWorkoutPreviousPerformanceClient } from "@/services/workouts/active-workout/previous-performance-client";
import type {
  ExerciseAlternativeReason,
  UserExerciseAlternative,
  UserProgressionTarget,
  Workout,
  WorkoutSession,
  WorkoutSessionExecutionState
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

function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

function stablePreviousPerformanceIdentity(item: ActiveWorkoutExerciseState | undefined) {
  if (!item) return null;
  if (item.prescriptionItem.sourcePlanActivityId) {
    return { kind: "plan_activity" as const, value: item.prescriptionItem.sourcePlanActivityId };
  }
  if (item.exercise.source_workout_id) {
    return { kind: "source_workout" as const, value: item.exercise.source_workout_id };
  }
  if (item.prescriptionItem.sourcePlanExerciseId) {
    return { kind: "plan_exercise" as const, value: item.prescriptionItem.sourcePlanExerciseId };
  }
  return null;
}

function executionTargetLabel(locale: string) {
  if (locale === "de") return "Ziel";
  if (locale === "ar") return "الهدف";
  return "Target";
}

function unsupportedExecutionCopy(locale: string) {
  if (locale === "de") return {
    title: "Diese Aktivität wird im aktiven Training noch nicht unterstützt.",
    description: "Für diese Aktivität zeigt Plaivra keine Krafttrainingsfelder an. Kehre zu deinen Workouts zurück und wähle eine unterstützte Krafteinheit."
  };
  if (locale === "ar") return {
    title: "هذا النشاط غير مدعوم بعد في التمرين النشط.",
    description: "لن يعرض Plaivra حقول تمارين القوة لهذا النشاط. ارجع إلى التمارين واختر جلسة قوة مدعومة."
  };
  return {
    title: "This activity is not supported in Active Workout yet.",
    description: "Plaivra will not show Strength fields for this activity. Return to workouts and choose a supported Strength session."
  };
}

export function ActiveWorkoutCoreSession({ source }: { source: ActiveWorkoutSource }) {
  const sourceKind = source.kind;
  const sourceId = source.kind === "plan-day" ? source.day.id : source.workout.id;
  const day = source.kind === "plan-day" ? source.day : directWorkoutDay(source.workout);
  const directWorkout = source.kind === "direct" ? source.workout : null;
  const dayRef = useLatest(day);
  const directWorkoutRef = useLatest(directWorkout);

  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { toast } = useToast();
  const toastRef = useLatest(toast);
  const { t: tr, locale: language, direction: dir, formatters } = useActiveWorkoutTranslation();
  const trRef = useLatest(tr);
  const legacyReopenSetLabel = translateTrain(language, "reopenSet");
  const legacySetReopened = translateTrain(language, "setReopened");
  const legacySetReopenFailed = translateTrain(language, "setReopenFailed");
  const { celebrate, setCompleted, error: feedbackError } = useSuccessFeedback();

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
  const [completedSummary, setCompletedSummary] = useState<ActiveWorkoutSummary | null>(null);
  const [progressionTargets, setProgressionTargets] = useState<UserProgressionTarget[]>([]);
  const [alternatives, setAlternatives] = useState<UserExerciseAlternative[]>([]);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [cancelConfirmationOpen, setCancelConfirmationOpen] = useState(false);
  const [completionRecovery, setCompletionRecovery] = useState<"none" | "retry" | "reconnect">("none");
  const [conflictingSession, setConflictingSession] = useState<WorkoutSession | null>(null);
  const [launchRevision, setLaunchRevision] = useState(0);
  const [replacementReason, setReplacementReason] = useState<ExerciseAlternativeReason>("machine_taken");
  const [replacementPickerOpen, setReplacementPickerOpen] = useState(false);
  const [isSavingAlternative, setIsSavingAlternative] = useState(false);
  const [setFeedback, setSetFeedback] = useState("");
  const [setFeedbackVariant, setSetFeedbackVariant] = useState<"info" | "error">("info");
  const [validationAttemptKey, setValidationAttemptKey] = useState<string | null>(null);
  const [exerciseNavigatorOpen, setExerciseNavigatorOpen] = useState(false);
  const [optimisticCompletion, setOptimisticCompletion] = useState<{
    commandId: string;
    setKey: string;
    projectedExecutionState: WorkoutSessionExecutionState;
  } | null>(null);
  const [executionState, setExecutionState] = useState<WorkoutSessionExecutionState | null>(null);
  const [controllerConflictDeviceId, setControllerConflictDeviceId] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<ActiveWorkoutSyncState>("online_synced");
  const [pendingOperationCount, setPendingOperationCount] = useState(0);
  const [dataConflict, setDataConflict] = useState<ActiveWorkoutSetConflict | null>(null);
  const [tabLeader, setTabLeader] = useState(false);
  const [takeoverConfirmationOpen, setTakeoverConfirmationOpen] = useState(false);
  const [executionCursorItems, setExecutionCursorItems] = useState<WorkoutSessionExecutionCursorRow[]>([]);
  const [muscleLoadRefreshRevision, setMuscleLoadRefreshRevision] = useState(0);
  const [previousPerformanceRead, setPreviousPerformanceRead] = useState<Awaited<ReturnType<typeof readActiveWorkoutPreviousPerformanceClient>>>(null);
  const [previousPerformanceLoading, setPreviousPerformanceLoading] = useState(false);
  const [previousPerformanceUnavailable, setPreviousPerformanceUnavailable] = useState(false);
  const [detailsRequest, setDetailsRequest] = useState<{
    section: ActiveWorkoutDetailsSection;
    focusTarget: "guide-video" | null;
  }>({ section: "overview", focusTarget: null });

  useEffect(() => {
    if (!userId || !sessionId) return;
    return subscribeToActiveSessionInvalidation({
      userId,
      workoutSessionId: sessionId,
      onInvalidate: () => {
        if (typeof navigator !== "undefined" && !navigator.onLine) return;
        void activeSessionStoreRef.current?.hydrate({ force: true }).catch(() => undefined);
      }
    });
  }, [sessionId, userId]);

  const executionHydratedRef = useRef(false);
  const activeSessionStoreRef = useRef<ActiveSessionStore | null>(null);
  const restExpiryCommandRef = useRef<string | null>(null);
  const controllerDeviceIdRef = useRef<string | null>(null);
  const setDetailsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const minimizePendingRef = useRef(false);
  const tabLeadershipRef = useRef<ActiveWorkoutTabLeadership | null>(null);
  const exerciseStatesRef = useRef(exerciseStates);
  const autosaveAdapterRef = useRef<WorkoutSetAutosaveAdapter<ActiveWorkoutExerciseState[]> | null>(null);
  const autosaveCoordinatorRef = useRef<WorkoutSetAutosaveCoordinator | null>(null);
  const pendingSetCommandKeyRef = useRef<string | null>(null);
  const pendingSetCompletionPromiseRef = useRef<Promise<void> | null>(null);
  const effectiveExecutionState = optimisticCompletion?.projectedExecutionState ?? executionState;

  useEffect(() => {
    if (!userId || !sessionId) return;
    const leadership = createActiveWorkoutTabLeadership({ userId, workoutSessionId: sessionId });
    tabLeadershipRef.current = leadership;
    void leadership.acquire().then(setTabLeader);
    const unsubscribe = leadership.subscribe(setTabLeader);
    const renew = () => { if (leadership.isLeader()) leadership.renew(); };
    const acquireOnFocus = () => { void leadership.acquire().then(setTabLeader); };
    window.addEventListener("pointerdown", renew, { passive: true });
    window.addEventListener("keydown", renew);
    window.addEventListener("focus", acquireOnFocus);
    window.addEventListener("pagehide", leadership.release);
    return () => {
      unsubscribe();
      window.removeEventListener("pointerdown", renew);
      window.removeEventListener("keydown", renew);
      window.removeEventListener("focus", acquireOnFocus);
      window.removeEventListener("pagehide", leadership.release);
      leadership.dispose();
      if (tabLeadershipRef.current === leadership) tabLeadershipRef.current = null;
    };
  }, [sessionId, userId]);

  const muscleLoadController = useActiveWorkoutMuscleLoad({
    sessionId,
    refreshRevision: muscleLoadRefreshRevision,
    mode: completedSummary ? "completed" : "active"
  });
  const bumpMuscleLoadRefreshRevision = useCallback(() => {
    setMuscleLoadRefreshRevision((current) => current + 1);
  }, []);

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
  }, [dayRef, restTimerKey, sessionRoute, userId, workoutTimerKey]);

  const executionDispatchContext = useCallback(() => ({
    store: activeSessionStoreRef.current,
    userId,
    sessionId,
    createCommandId: createSessionCommandId,
    mirrorState: mirrorExecutionState,
    reportFailure: (error: unknown) => {
      const currentTr = trRef.current;
      setSetFeedbackVariant("error");
      setSetFeedback(currentTr("offline.setSaveCombined"));
      toastRef.current({
        title: currentTr("completion.saveFailedTitle"),
        description: userSafeError(error, currentTr("offline.keepOpenRetry"))
      });
    }
  }), [mirrorExecutionState, sessionId, toastRef, trRef, userId]);

  const dispatchExecutionAwaited = useCallback((
    commandType: Parameters<ActiveSessionStore["dispatch"]>[0]["commandType"],
    payload: Parameters<ActiveSessionStore["dispatch"]>[0]["payload"],
    options: ActiveWorkoutExecutionDispatchOptions = {}
  ) => dispatchActiveWorkoutExecutionAwaited(executionDispatchContext(), commandType, payload, options), [executionDispatchContext]);

  const dispatchExecutionBackground = useCallback((
    commandType: Parameters<ActiveSessionStore["dispatch"]>[0]["commandType"],
    payload: Parameters<ActiveSessionStore["dispatch"]>[0]["payload"],
    options: ActiveWorkoutExecutionDispatchOptions = {}
  ) => dispatchActiveWorkoutExecutionBackground(executionDispatchContext(), commandType, payload, options), [executionDispatchContext]);

  useEffect(() => {
    let active = true;
    let unsubscribeStore: (() => void) | null = null;
    executionHydratedRef.current = false;
    activeSessionStoreRef.current = null;
    setIsStarting(true);
    setSession(null);
    setLoadFailed(false);
    setCompletedSummary(null);
    setCompletionRecovery("none");
    setConflictingSession(null);
    setPreviousPerformanceRead(null);
    setPreviousPerformanceUnavailable(false);

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
    const sessionStart = (async () => {
      const openResult = await getOpenWorkoutSessionWithStatus(userId, null, candidateSessionId);
      if (openResult.error) throw new Error(openResult.error);
      const open = openResult.session;
      const storedRouteMatches = Boolean(
        open && storedActiveWorkout?.sessionId === open.id && storedActiveWorkout.route === sessionRoute
      );
      const requestedSourceMatches = Boolean(
        open && (sourceKind === "plan-day" ? open.plan_day_id === sourceId : open.workout_id === sourceId)
      );
      if (open && !storedRouteMatches && !requestedSourceMatches) {
        if (active) setConflictingSession(open);
        return null;
      }
      return sourceKind === "plan-day"
        ? getOrStartWorkoutDaySession(userId, currentDay)
        : getOrStartWorkoutSession(userId, currentDirectWorkout!, candidateSessionId);
    })();

    sessionStart
      .then(async (nextSession) => {
        if (!active || !nextSession) return;
        controllerDeviceIdRef.current = getActiveWorkoutDeviceId();
        const storedStartedAt = readStoredTimestamp(workoutTimerKey);
        const storedRestEndsAt = readStoredTimestamp(restTimerKey);
        const store = getActiveSessionStore({
          userId,
          workoutSessionId: nextSession.id,
          adapter: activeSessionPersistenceAdapter,
          controllerDeviceId: controllerDeviceIdRef.current,
          clearCompatibilityCache: () => clearActiveWorkoutState(userId)
        });
        activeSessionStoreRef.current = store;
        unsubscribeStore = store.subscribe(() => {
          const latest = store.getSnapshot();
          setSyncState(latest.syncState);
          setPendingOperationCount(latest.pendingOperationCount);
          setDataConflict(latest.dataConflict);
          if (latest.executionState && latest.executionState.controller_device_id !== controllerDeviceIdRef.current) {
            setControllerConflictDeviceId(latest.executionState.controller_device_id);
          }
        });
        await store.hydrate({
          legacyCache: {
            userId,
            sessionId: nextSession.id,
            startedAtMs: storedStartedAt,
            restEndsAtMs: storedRestEndsAt,
            restDurationSeconds: 75,
            controllerDeviceId: controllerDeviceIdRef.current
          }
        });
        const hydrated = store.getSnapshot();
        let authoritativeState = hydrated.executionState;
        const cursorItems = [...hydrated.prescription];
        const existingLogs = [...hydrated.performedLogs];
        if (!authoritativeState && hydrated.finalProjection) {
          await clearActiveWorkoutSessionDrafts(userId, nextSession.id).catch(() => undefined);
          const terminalStates = hydrateStates(
            cursorItems.map((item) => makeFrozenExerciseState(item, currentDay.exercises)),
            existingLogs
          );
          setExerciseStates(terminalStates);
          exerciseStatesRef.current = terminalStates;
          setExecutionCursorItems(cursorItems);
          setSession(nextSession);
          setSessionNotes(nextSession.notes ?? "");
          executionHydratedRef.current = true;
          const summary = buildSummary(
            terminalStates,
            [],
            Math.max(1, nextSession.duration_minutes ?? 1),
            nextSession.notes ?? "",
            trRef.current,
            formatters,
            hydrated.finalProjection.performedLogs
          );
          finalizeVerifiedCompletion(summary);
          return;
        }
        if (!authoritativeState) throw new Error("The active workout has no execution state.");

        if (controllerDeviceIdRef.current && authoritativeState.controller_device_id === null) {
          const response = await store.dispatch({
            userId,
            workoutSessionId: nextSession.id,
            commandId: createSessionCommandId(),
            commandType: "claim_control",
            payload: {
              controller_device_id: controllerDeviceIdRef.current,
              expected_controller_device_id: null,
              takeover: false
            }
          });
          authoritativeState = response.state;
        }
        const controllerConflict = authoritativeState.controller_device_id !== controllerDeviceIdRef.current;
        setControllerConflictDeviceId(controllerConflict ? authoritativeState.controller_device_id : null);

        if (!controllerConflict && authoritativeState.view_state === "rest" && executionRestSecondsLeft(authoritativeState) <= 0) {
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
        const cachedSecondaryProjection = hydrated.lastValidSecondaryProjection;
        const cachedStates = Array.isArray(cachedSecondaryProjection)
          && cachedSecondaryProjection.every((item) =>
            typeof item === "object" && item !== null && "exercise" in item && "prescriptionItem" in item && "sets" in item && Array.isArray(item.sets)
          ) ? cachedSecondaryProjection as ActiveWorkoutExerciseState[] : null;
        const canonicalHydratedStates = hydrateStates(
          cachedStates ?? authoritativeItems.map((item) => makeFrozenExerciseState(item, currentDay.exercises)),
          existingLogs
        );
        const restoredDrafts = await readActiveWorkoutSetDrafts(userId, nextSession.id).catch(() => []);
        const hydratedStates = mergeActiveWorkoutSetDrafts(canonicalHydratedStates, restoredDrafts);
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
                exercise.sets.map((set, setIndex) => ({ exerciseIndex, setIndex, completed: Boolean(set.completedAt) }))
              ),
              authoritativeCursor
            )
          : authoritativeCursor;
        const exerciseIndex = Math.min(Math.max(0, cursor.exerciseIndex), Math.max(0, hydratedStates.length - 1));
        const setCount = hydratedStates[exerciseIndex]?.sets.length ?? 1;
        const setIndex = Math.min(Math.max(0, cursor.setIndex), Math.max(0, setCount - 1));
        setActiveExerciseIndex(exerciseIndex);
        setActiveSetIndex(setIndex);
        setTimerSeconds(hydratedStates[exerciseIndex]?.sets[setIndex]?.plannedRestSeconds ?? 75);
        mirrorExecutionState(authoritativeState);
        setSession(nextSession);
        setSessionNotes(nextSession.notes ?? "");
        executionHydratedRef.current = true;
        bumpMuscleLoadRefreshRevision();
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
      .finally(() => { if (active) setIsStarting(false); });

    return () => {
      active = false;
      unsubscribeStore?.();
    };
  }, [
    bumpMuscleLoadRefreshRevision,
    mirrorExecutionState,
    dayRef,
    directWorkoutRef,
    launchRevision,
    restTimerKey,
    sessionRoute,
    sourceId,
    sourceKind,
    toastRef,
    trRef,
    userId,
    workoutTimerKey
  ]);

  useEffect(() => {
    if (!userId || !sessionId || sourceKind !== "plan-day" || !executionHydratedRef.current) {
      setProgressionTargets([]);
      setAlternatives([]);
      return;
    }
    let active = true;
    const exerciseIds = day.exercises.map((exercise) => exercise.id);
    void getProgressionTargets(userId, exerciseIds)
      .then((items) => { if (active) setProgressionTargets(items); })
      .catch(() => { if (active) setProgressionTargets([]); });
    void getExerciseAlternatives(userId)
      .then((items) => {
        if (active) setAlternatives(items.filter((item) => exerciseIds.includes(item.plan_exercise_id)));
      })
      .catch(() => { if (active) setAlternatives([]); });
    return () => { active = false; };
  }, [day.exercises, sessionId, sourceKind, userId]);

  useEffect(() => {
    const tick = () => {
      const now = activeSessionClock.getSnapshot();
      setElapsedSeconds(effectiveExecutionState
        ? executionElapsedSeconds(effectiveExecutionState, now)
        : Math.max(0, Math.floor((now - startedAtMs) / 1000)));
      const nextLeft = effectiveExecutionState ? executionRestSecondsLeft(effectiveExecutionState, now) : 0;
      setTimerLeft(nextLeft);
      setIsTimerRunning(Boolean(effectiveExecutionState?.view_state === "rest" && nextLeft > 0));
      if (!optimisticCompletion && effectiveExecutionState?.view_state === "rest" && nextLeft <= 0) {
        const expiryKey = `${effectiveExecutionState.revision}:${effectiveExecutionState.rest_ends_at}`;
        if (restExpiryCommandRef.current === expiryKey) return;
        restExpiryCommandRef.current = expiryKey;
        setTimerEndsAtMs(null);
        setIsTimerRunning(false);
        clearStoredValue(restTimerKey);
        if (userId && sessionId && executionHydratedRef.current) {
          void dispatchExecutionBackground("clear_rest", {
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
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          new Notification(currentTr("notifications.restFinished"), { body: currentTr("notifications.nextSetReady") });
        }
      }
    };
    return activeSessionClock.subscribe(tick);
  }, [dispatchExecutionBackground, effectiveExecutionState, optimisticCompletion, restTimerKey, sessionId, startedAtMs, toastRef, trRef, userId]);

  useEffect(() => {
    if (!executionHydratedRef.current || !userId || !sessionId || !executionState || optimisticCompletion) return;
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
    void dispatchExecutionBackground(
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
          const previousCursor = executionCursorToIndexes(currentServerState, executionCursorItems);
          setActiveExerciseIndex(previousCursor.exerciseIndex);
          setActiveSetIndex(previousCursor.setIndex);
        }
      }
    );
  }, [activeExerciseIndex, activeSetIndex, dispatchExecutionBackground, executionCursorItems, executionState, optimisticCompletion, sessionId, userId]);

  const activeExercise = exerciseStates[activeExerciseIndex];
  const activeSet = activeExercise?.sets[activeSetIndex];
  const executionCapability = useMemo(
    () => resolveActiveWorkoutExecutionCapability(executionCursorItems),
    [executionCursorItems]
  );

  useEffect(() => {
    const identity = stablePreviousPerformanceIdentity(activeExercise);
    if (!identity || !activeSet || !sessionId || !executionHydratedRef.current || !executionCapability.supported) {
      setPreviousPerformanceRead(null);
      setPreviousPerformanceLoading(false);
      setPreviousPerformanceUnavailable(false);
      return;
    }
    const controller = new AbortController();
    setPreviousPerformanceLoading(true);
    setPreviousPerformanceUnavailable(false);
    void readActiveWorkoutPreviousPerformanceClient({
      identity,
      excludeSessionId: sessionId,
      setNumber: activeSet.setNumber,
      signal: controller.signal
    }).then((value) => {
      setPreviousPerformanceRead(value);
      setPreviousPerformanceUnavailable(false);
    }).catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setPreviousPerformanceRead(null);
      setPreviousPerformanceUnavailable(true);
    }).finally(() => {
      if (!controller.signal.aborted) setPreviousPerformanceLoading(false);
    });
    return () => controller.abort();
  }, [activeExercise, activeSet, executionCapability.supported, sessionId]);

  const totalSets = exerciseStates.reduce((sum, item) => sum + item.sets.length, 0);
  const completedSets = exerciseStates.reduce(
    (sum, item) => sum + item.sets.filter((set) => set.completedAt).length,
    0
  );
  const reviewProjection = buildActiveWorkoutReview(exerciseStates, day.exercises);
  const isFinished = reviewProjection.incompleteSets === 0 && reviewProjection.totalSets > 0;
  const durationMinutes = Math.max(1, Math.ceil(elapsedSeconds / 60));
  const activePreviousPerformance: ActiveWorkoutPreviousPerformance | null = previousPerformanceRead ? {
    lastWeightKg: previousPerformanceRead.weightKg,
    lastReps: previousPerformanceRead.reps,
    lastBestSet: [
      previousPerformanceRead.weightKg === null ? null : formatters.measurement(previousPerformanceRead.weightKg, "kg"),
      previousPerformanceRead.reps === null ? null : `${formatters.integer(previousPerformanceRead.reps)} ${tr("units.reps")}`
    ].filter((value): value is string => Boolean(value)).join(" × ") || null,
    lastPerformedAt: previousPerformanceRead.performedAt
  } : null;
  const activeProgressionTarget = progressionTargets.find(
    (target) => target.plan_exercise_id === activeExercise?.exercise.id
  ) ?? null;
  const activeAlternatives = alternatives.filter(
    (alternative) => alternative.plan_exercise_id === activeExercise?.exercise.id
  );
  const currentGuideUrl = activeExercise?.exercise.exercise_url
    || (activeExercise?.exercise.notes?.startsWith("http") ? activeExercise.exercise.notes : null);
  const currentCustomVideoUrl = activeExercise?.exercise.custom_video_url || null;
  const currentInstructions = activeExercise?.exercise.instructions || "";
  const sessionSets = buildSessionSets(exerciseStates);
  const totalVolume = roundWorkoutMetric(
    sessionSets.reduce((sum, set) => sum + set.weightKg * set.reps, 0)
  );
  const nextExercise = exerciseStates[activeExerciseIndex + 1];
  const activeExerciseCompleted = activeExercise?.sets.every((set) => set.completedAt) ?? false;
  const nextSetLabel = activeExercise && !activeExerciseCompleted && activeSet
    ? `${tr("set.label", { count: formatters.integer(activeSet.setNumber) })} / ${formatters.integer(activeExercise.sets.length)}`
    : nextExercise
      ? tr("exercise.nextExercise", { name: isolateBidiText(nextExercise.exercise.exercise_name) })
      : tr("navigation.allDone");
  const workoutContext: Record<string, unknown> = {
    plan: day.plan,
    workout_day: { id: day.id, name: day.day_name, weekday: day.weekday, notes: day.notes },
    planned_exercises: executionCursorItems.map((item) => ({
      id: item.sourcePlanExerciseId ?? item.sourcePlanActivityId ?? item.id,
      name: item.activityName,
      item_order: item.itemOrder,
      normalization_status: item.normalizationStatus,
      prescription_sets: item.prescriptionSets
    })),
    active_exercise: activeExercise?.exercise ?? null,
    logged_sets: buildWorkoutContextLogRows(exerciseStates),
    session: session ? { id: session.id, duration_minutes: durationMinutes, notes: sessionNotes } : null,
    previous_performance: previousPerformanceRead,
    skipped_exercises: exerciseStates
      .filter((item) => !item.sets.some((set) => set.completedAt))
      .map((item) => item.exercise.exercise_name),
    saved_progression_target: activeProgressionTarget
  };

  function updateSet(exerciseIndex: number, setIndex: number, patch: Partial<ActiveWorkoutSetState>) {
    setExerciseStates((current) => {
      const next = current.map((item, itemIndex) => itemIndex === exerciseIndex
        ? { ...item, sets: item.sets.map((set, currentSetIndex) => currentSetIndex === setIndex ? mergeSetPatch(set, patch) : set) }
        : item);
      exerciseStatesRef.current = next;
      return next;
    });
  }

  function statesWithSetPatch(exerciseIndex: number, setIndex: number, patch: Partial<ActiveWorkoutSetState>) {
    return exerciseStates.map((item, itemIndex) => itemIndex === exerciseIndex
      ? { ...item, sets: item.sets.map((set, currentSetIndex) => currentSetIndex === setIndex ? mergeSetPatch(set, patch) : set) }
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
        const rows = buildCanonicalLogRows(states, { pendingOnly: true, validOnly: true });
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

  const flushPendingSetWrites = useCallback(
    () => autosaveCoordinatorRef.current?.requestFlush() ?? Promise.resolve(),
    []
  );

  const persistSetDrafts = useCallback(async (states = exerciseStatesRef.current) => {
    if (!userId || !sessionId || !states.length) return;
    await writeActiveWorkoutSetDrafts({
      userId,
      workoutSessionId: sessionId,
      drafts: states.flatMap((exercise) => exercise.sets
        .filter((set) => !set.completedAt)
        .map((set) => ({
          snapshotItemId: exercise.prescriptionItem.id,
          setNumber: set.setNumber,
          draft: { reps: set.reps, weightKg: set.weightKg, rpe: set.rpe, rir: set.rir, setType: set.setType, notes: set.notes }
        })))
    });
  }, [sessionId, userId]);

  const preserveWorkoutForNavigation = useCallback(async () => {
    if (minimizePendingRef.current) return false;
    minimizePendingRef.current = true;
    setActionsOpen(false);
    setReplacementPickerOpen(false);
    setExerciseNavigatorOpen(false);
    try {
      const pendingSet = pendingSetCompletionPromiseRef.current;
      if (pendingSet) await pendingSet.catch(() => undefined);
      await persistSetDrafts();
      await flushPendingSetWrites();
      const authoritativeState = activeSessionStoreRef.current?.getSnapshot().executionState;
      if (authoritativeState) mirrorExecutionState(authoritativeState);
      return true;
    } catch (error) {
      toastRef.current({
        title: trRef.current("navigation.minimizeFailedTitle"),
        description: userSafeError(error, trRef.current("navigation.minimizeFailedDescription"))
      });
      return false;
    } finally {
      minimizePendingRef.current = false;
    }
  }, [flushPendingSetWrites, mirrorExecutionState, persistSetDrafts, toastRef, trRef]);

  const minimizeWorkout = preserveWorkoutForNavigation;

  useRegisterActiveWorkoutMinimize(minimizeWorkout);

  function handleSetDetailsOpenChange(open: boolean) {
    setActionsOpen(open);
    if (!open) void flushPendingSetWrites();
  }

  useEffect(() => {
    exerciseStatesRef.current = exerciseStates;
    if (exerciseStates.length > 0) activeSessionStoreRef.current?.setSecondaryProjection(exerciseStates);
  }, [exerciseStates]);

  useEffect(() => {
    if (!sessionId || !userId || isStarting || !exerciseStates.length) return;
    const timeout = window.setTimeout(() => { void persistSetDrafts(exerciseStates).catch(() => undefined); }, 250);
    return () => window.clearTimeout(timeout);
  }, [exerciseStates, isStarting, persistSetDrafts, sessionId, userId]);

  useEffect(() => {
    if (!setFeedback) return;
    const timeout = window.setTimeout(
      () => setSetFeedback(""),
      transientFeedbackDuration(setFeedbackVariant === "error" ? "error" : "info")
    );
    return () => window.clearTimeout(timeout);
  }, [setFeedback, setFeedbackVariant]);

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
      void dispatchExecutionBackground(
        "start_rest",
        { duration_seconds: safeSeconds, controller_device_id: controllerDeviceIdRef.current },
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
      void dispatchExecutionBackground(
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

  async function reconcileSavedSetAfterExecutionFailure(savedStates: ActiveWorkoutExerciseState[]) {
    if (!userId || !sessionId) return;
    const store = activeSessionStoreRef.current;
    if (!store) throw new Error("The workout execution store is unavailable.");
    await store.hydrate({ force: true });
    const authoritativeState = store.getSnapshot().executionState;
    const authoritativeLogs = [...store.getSnapshot().performedLogs];
    if (!authoritativeState) throw new Error("The workout execution state is unavailable.");
    const reconciledStates = hydrateStates(savedStates, authoritativeLogs);
    const cursor = executionCursorToIndexes(authoritativeState, executionCursorItems, day.exercises);
    const exerciseIndex = Math.min(Math.max(0, cursor.exerciseIndex), Math.max(0, reconciledStates.length - 1));
    const setCount = reconciledStates[exerciseIndex]?.sets.length ?? 1;
    setExerciseStates(reconciledStates);
    exerciseStatesRef.current = reconciledStates;
    setActiveExerciseIndex(exerciseIndex);
    setActiveSetIndex(Math.min(Math.max(0, cursor.setIndex), Math.max(0, setCount - 1)));
    mirrorExecutionState(authoritativeState);
  }

  async function finishSet(exerciseIndex: number, setIndex: number) {
    const targetSet = exerciseStates[exerciseIndex]?.sets[setIndex];
    const store = activeSessionStoreRef.current;
    const storeSnapshot = store?.getSnapshot();
    const snapshotItemId = executionCursorItems[exerciseIndex]?.id ?? null;
    const setKey = `${sessionId ?? "no-session"}:${snapshotItemId ?? exerciseIndex}:${setIndex + 1}`;
    if (
      !targetSet || targetSet.completedAt || pendingSetCommandKeyRef.current === setKey || isStarting || !sessionId || !userId
      || !executionHydratedRef.current || effectiveExecutionState?.session_state === "paused"
      || storeSnapshot?.root?.status !== "started" || !executionCapability.supported || !store
    ) return;

    const setDraftValidation = validateActiveWorkoutSetDraft(targetSet.reps, targetSet.weightKg);
    setValidationAttemptKey(setKey);
    if (!setDraftValidation.complete) return;
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
    const nextStates = statesWithSetPatch(exerciseIndex, setIndex, { completedAt: completedAt.toISOString() });
    const canonical = store.getSnapshot();
    const canonicalState = canonical.executionState;
    if (!canonicalState) return;

    let transition;
    try {
      const currentPrescriptionItem = canonical.prescription.find(
        (item) => item.id === executionCursorItems[exerciseIndex]?.id
      ) ?? canonical.prescription.find((item) => item.itemOrder === exerciseIndex + 1);
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
    } catch {
      setSetFeedbackVariant("error");
      setSetFeedback(tr("set.saveFailedValuesKept"));
      return;
    }

    const commandId = createSessionCommandId();
    const projectedExecutionState = projectOptimisticSetCompletion({
      current: canonicalState,
      transition,
      context: {
        userId,
        workoutSessionId: sessionId,
        rootStatus: "started",
        prescription: canonical.prescription,
        performedLogs: canonical.performedLogs
      },
      commandId,
      nowMs: Date.now()
    });

    pendingSetCommandKeyRef.current = setKey;
    setIsSaving(true);
    setValidationAttemptKey(null);
    setExerciseStates(nextStates);
    exerciseStatesRef.current = nextStates;
    setActiveExerciseIndex(transition.nextExerciseIndex);
    setActiveSetIndex(transition.nextSetIndex);
    setOptimisticCompletion({ commandId, setKey, projectedExecutionState });
    if (projectedExecutionState.view_state === "rest" && projectedExecutionState.rest_ends_at) {
      const optimisticRestEnd = Date.parse(projectedExecutionState.rest_ends_at);
      const optimisticRestLeft = executionRestSecondsLeft(projectedExecutionState, Date.now());
      setTimerSeconds(projectedExecutionState.rest_duration_seconds ?? targetSet.plannedRestSeconds ?? timerSeconds);
      setTimerLeft(optimisticRestLeft);
      setTimerEndsAtMs(Number.isFinite(optimisticRestEnd) ? optimisticRestEnd : null);
      setIsTimerRunning(optimisticRestLeft > 0);
    } else {
      setTimerLeft(0);
      setTimerEndsAtMs(null);
      setIsTimerRunning(false);
    }
    setCompleted();

    const operation = (async () => {
      try {
        const response = await store.completeCanonicalSet({
          logs: buildCanonicalLogRows(nextStates, { pendingOnly: true }),
          executionIntent: {
            userId,
            workoutSessionId: sessionId,
            commandId,
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
        const acknowledgedStates = acknowledgeSetWrites(nextStates, nextStates);
        setExerciseStates(acknowledgedStates);
        exerciseStatesRef.current = acknowledgedStates;
        mirrorExecutionState(response.state);
        const acknowledgedCursor = executionCursorToIndexes(
          response.state,
          executionCursorItems,
          acknowledgedStates.map((item) => item.exercise)
        );
        setActiveExerciseIndex(acknowledgedCursor.exerciseIndex);
        setActiveSetIndex(acknowledgedCursor.setIndex);
        setOptimisticCompletion(null);
        await clearActiveWorkoutSetDraft(
          userId,
          sessionId,
          exerciseStates[exerciseIndex]?.prescriptionItem.id ?? snapshotItemId ?? "",
          targetSet.setNumber
        ).catch(() => undefined);
        bumpMuscleLoadRefreshRevision();
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "canonical_set_saved_execution_sync_failed") {
          const acknowledgedStates = acknowledgeSetWrites(nextStates, nextStates);
          setExerciseStates(acknowledgedStates);
          exerciseStatesRef.current = acknowledgedStates;
          setOptimisticCompletion(null);
          await clearActiveWorkoutSetDraft(
            userId,
            sessionId,
            exerciseStates[exerciseIndex]?.prescriptionItem.id ?? snapshotItemId ?? "",
            targetSet.setNumber
          ).catch(() => undefined);
          bumpMuscleLoadRefreshRevision();
          setSetFeedbackVariant("error");
          setSetFeedback(tr("set.savedResyncing"));
          try {
            await reconcileSavedSetAfterExecutionFailure(nextStates);
          } catch (reconcileError) {
            console.warn("Plaivra saved the completed set but could not reconcile the workout position.", reconcileError);
          }
        } else {
          setExerciseStates(previousStates);
          exerciseStatesRef.current = previousStates;
          setActiveExerciseIndex(previousActiveExerciseIndex);
          setActiveSetIndex(previousActiveSetIndex);
          restoreRestTimer(previousTimer);
          setOptimisticCompletion(null);
          setSetFeedbackVariant("error");
          setSetFeedback(tr("set.saveFailedValuesKept"));
          feedbackError();
        }
      } finally {
        if (pendingSetCommandKeyRef.current === setKey) pendingSetCommandKeyRef.current = null;
        setIsSaving(false);
      }
    })();
    pendingSetCompletionPromiseRef.current = operation;
    try {
      await operation;
    } finally {
      if (pendingSetCompletionPromiseRef.current === operation) pendingSetCompletionPromiseRef.current = null;
    }
  }

  async function restartSet(exerciseIndex: number, setIndex: number) {
    if (isSaving) return false;
    const previousStates = exerciseStates;
    setIsSaving(true);
    const nextStates = statesWithSetPatch(exerciseIndex, setIndex, { completedAt: null });
    setExerciseStates(nextStates);
    exerciseStatesRef.current = nextStates;
    try {
      await persistProgress(nextStates);
      bumpMuscleLoadRefreshRevision();
      setSetFeedbackVariant("info");
      setSetFeedback(legacySetReopened);
      return true;
    } catch (error) {
      setExerciseStates(previousStates);
      exerciseStatesRef.current = previousStates;
      setSetFeedbackVariant("error");
      setSetFeedback(legacySetReopenFailed);
      toastRef.current({ title: tr("completion.saveFailedTitle"), description: userSafeError(error, tr("header.loadFailedDescription")) });
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  function executionCursorFor(exerciseIndex: number, setIndex: number) {
    const item = executionCursorItems[exerciseIndex]
      ?? executionCursorItems.find((candidate) => candidate.itemOrder === exerciseIndex + 1)
      ?? null;
    return { snapshotItemId: item?.id ?? null, itemOrder: item?.itemOrder ?? exerciseIndex + 1, setNumber: setIndex + 1 };
  }

  async function navigateToSessionSet(exerciseIndex: number, setIndex: number) {
    if (
      isSaving || isStarting || !sessionId || !userId || !executionHydratedRef.current
      || effectiveExecutionState?.session_state === "paused" || !tabLeader || controllerConflictDeviceId
    ) return;
    const cursor = executionCursorFor(exerciseIndex, setIndex);
    setIsSaving(true);
    try {
      await flushPendingSetWrites();
      await dispatchExecutionAwaited("move_cursor", {
        active_snapshot_item_id: cursor.snapshotItemId,
        active_item_order: cursor.itemOrder,
        active_set_number: cursor.setNumber,
        ...(effectiveExecutionState?.view_state === "rest" ? { view_state: "set_entry" as const } : {}),
        controller_device_id: controllerDeviceIdRef.current
      });
      setActiveExerciseIndex(exerciseIndex);
      setActiveSetIndex(setIndex);
      if (effectiveExecutionState?.view_state === "rest") {
        setTimerLeft(0);
        setTimerEndsAtMs(null);
        setIsTimerRunning(false);
        clearStoredValue(restTimerKey);
      }
      setExerciseNavigatorOpen(false);
    } catch {
      // The serialized dispatcher owns reconciliation and localized failure reporting.
    } finally {
      setIsSaving(false);
    }
  }

  async function openSessionReview() {
    if (isStarting || isSaving || !sessionId || !userId || !executionHydratedRef.current || !executionCapability.supported) return;
    const invalidLocation = exerciseStates.flatMap((item, exerciseIndex) =>
      item.sets.map((set, setIndex) => ({ set, exerciseIndex, setIndex }))
    ).find(({ set }) => {
      if (!isPendingSetWrite(set)) return false;
      return !setHasValidEffortInputs(set) || !validateActiveWorkoutSetDraft(set.reps, set.weightKg).complete;
    });
    if (invalidLocation) {
      setActiveExerciseIndex(invalidLocation.exerciseIndex);
      setActiveSetIndex(invalidLocation.setIndex);
      setActionsOpen(true);
      return;
    }
    setActionsOpen(false);
    setReplacementPickerOpen(false);
    setIsSaving(true);
    const cursor = executionCursorFor(activeExerciseIndex, activeSetIndex);
    try {
      await flushPendingSetWrites();
      await dispatchExecutionAwaited("move_cursor", {
        active_snapshot_item_id: cursor.snapshotItemId,
        active_item_order: cursor.itemOrder,
        active_set_number: cursor.setNumber,
        view_state: "session_review",
        controller_device_id: controllerDeviceIdRef.current
      });
      setCompletionRecovery("none");
      setFinishOpen(true);
    } catch (error) {
      toastRef.current({ title: tr("review.openFailedTitle"), description: userSafeError(error, tr("review.openFailedDescription")) });
    } finally {
      setIsSaving(false);
    }
  }

  async function leaveReviewAtSet(exerciseIndex: number, setIndex: number, reopen: boolean) {
    if (isSaving || !userId || !sessionId || !executionHydratedRef.current) return;
    if (reopen) {
      const reopened = await restartSet(exerciseIndex, setIndex);
      if (!reopened) return;
    }
    const cursor = executionCursorFor(exerciseIndex, setIndex);
    setIsSaving(true);
    try {
      await dispatchExecutionAwaited("move_cursor", {
        active_snapshot_item_id: cursor.snapshotItemId,
        active_item_order: cursor.itemOrder,
        active_set_number: cursor.setNumber,
        view_state: "set_entry",
        controller_device_id: controllerDeviceIdRef.current
      });
      setActiveExerciseIndex(exerciseIndex);
      setActiveSetIndex(setIndex);
      setFinishOpen(false);
      setCompletionRecovery("none");
      window.requestAnimationFrame(() => { document.getElementById("active-set-reps")?.focus(); });
    } catch {
      // The serialized dispatcher already surfaced a localized recoverable error.
    } finally {
      setIsSaving(false);
    }
  }

  function continueWorkoutFromReview() {
    const target = exerciseStates.flatMap((item, exerciseIndex) =>
      item.prescriptionItem.executionState === "skipped" ? [] : item.sets.map((set, setIndex) => ({ exerciseIndex, setIndex, completed: Boolean(set.completedAt) }))
    ).find((item) => !item.completed);
    if (!target) return;
    void leaveReviewAtSet(target.exerciseIndex, target.setIndex, false);
  }

  function finalizeVerifiedCompletion(summary: ActiveWorkoutSummary) {
    if (userId) clearActiveWorkoutState(userId);
    if (userId && sessionId) void clearActiveWorkoutSessionDrafts(userId, sessionId).catch(() => undefined);
    clearStoredValue(workoutTimerKey);
    clearStoredValue(restTimerKey);
    setFinishOpen(false);
    setCompletionRecovery("none");
    setCompletedSummary(summary);
    bumpMuscleLoadRefreshRevision();
    toastRef.current({
      title: tr("completion.title"),
      description: tr("completion.savedNamedWorkout", { name: isolateBidiText(day.day_name) })
    });
    celebrate(tr("completion.title"));
  }

  async function restoreReviewAfterCompletionFailure() {
    const store = activeSessionStoreRef.current;
    if (!store) throw new Error("The workout execution store is unavailable.");
    await store.hydrate({ force: true });
    const recovered = store.getSnapshot();
    if (recovered.root && recovered.root.status !== "started" && !recovered.executionState) return "terminal" as const;
    if (recovered.root?.status === "started" && recovered.executionState) {
      mirrorExecutionState(recovered.executionState);
      if (recovered.executionState.session_state !== "review" || recovered.executionState.view_state !== "session_review") {
        const cursor = executionCursorFor(activeExerciseIndex, activeSetIndex);
        await dispatchExecutionAwaited("move_cursor", {
          active_snapshot_item_id: cursor.snapshotItemId,
          active_item_order: cursor.itemOrder,
          active_set_number: cursor.setNumber,
          view_state: "session_review",
          controller_device_id: controllerDeviceIdRef.current
        });
      }
      setFinishOpen(true);
      return "active" as const;
    }
    throw new Error("The workout completion state could not be verified.");
  }

  async function completeSession() {
    if (!sessionId || isSaving || isStarting || !executionHydratedRef.current || !executionCapability.supported) return;
    const invalidLocation = exerciseStates.flatMap((item, exerciseIndex) =>
      item.sets.map((set, setIndex) => ({ set, exerciseIndex, setIndex }))
    ).find(({ set }) => Boolean(set.completedAt || set.hasPersistedLog) && !setHasValidEffortInputs(set));
    if (invalidLocation) {
      await leaveReviewAtSet(invalidLocation.exerciseIndex, invalidLocation.setIndex, Boolean(invalidLocation.set.completedAt));
      setActionsOpen(true);
      return;
    }
    const store = activeSessionStoreRef.current;
    if (!store) return;
    setIsSaving(true);
    setCompletionRecovery("none");
    try {
      await flushPendingSetWrites();
      await store.completeSession({
        notes: sessionNotes,
        durationMinutes,
        finalLogs: sourceKind === "direct"
          ? buildCanonicalLogRows(exerciseStates, { pendingOnly: true, validOnly: true })
          : buildCanonicalLogRows(exerciseStates)
      });
      const terminal = store.getSnapshot();
      if (terminal.syncState === "terminal_pending") {
        setSyncState("terminal_pending");
        setPendingOperationCount(terminal.pendingOperationCount);
        setFinishOpen(true);
        toastRef.current({ title: tr("sync.terminalPending"), description: tr("sync.terminalPendingDescription") });
        return;
      }
      if (!terminal.root || terminal.root.status === "started" || terminal.executionState) {
        throw new Error("The completed workout session could not be confirmed.");
      }
      const summary = buildSummary(
        exerciseStates,
        [],
        durationMinutes,
        sessionNotes,
        tr,
        formatters,
        terminal.finalProjection?.performedLogs
      );
      finalizeVerifiedCompletion(summary);
    } catch (error) {
      try {
        const recovered = await restoreReviewAfterCompletionFailure();
        if (recovered === "terminal") {
          const recoveredTerminal = store.getSnapshot();
          const summary = buildSummary(
            exerciseStates,
            [],
            durationMinutes,
            sessionNotes,
            tr,
            formatters,
            recoveredTerminal.finalProjection?.performedLogs
          );
          finalizeVerifiedCompletion(summary);
        } else {
          setCompletionRecovery("retry");
          toastRef.current({ title: tr("completion.recoveryTitle"), description: tr("completion.retryDescription") });
        }
      } catch {
        setFinishOpen(true);
        setCompletionRecovery("reconnect");
        toastRef.current({ title: tr("completion.recoveryTitle"), description: userSafeError(error, tr("completion.reconnectDescription")) });
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function cancelCurrentSession() {
    const store = activeSessionStoreRef.current;
    if (!userId || !sessionId || !store || isSaving || isStarting) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toastRef.current({ title: tr("minimized.cancelFailedTitle"), description: tr("minimized.cancelFailedDescription") });
      return;
    }
    setIsSaving(true);
    try {
      await store.cancelSession();
      await clearActiveWorkoutSessionDrafts(userId, sessionId).catch(() => undefined);
      clearActiveWorkoutState(userId);
      clearStoredValue(workoutTimerKey);
      clearStoredValue(restTimerKey);
      setCancelConfirmationOpen(false);
      toastRef.current({ title: tr("minimized.cancelledTitle"), description: tr("minimized.cancelledDescription") });
      const backHref = readPreviousActiveWorkoutRoute(userId)
        ?? (sourceKind === "plan-day" ? "/my-workout/plans" : "/workouts");
      window.location.assign(backHref);
    } catch (error) {
      toastRef.current({
        title: tr("minimized.cancelFailedTitle"),
        description: userSafeError(error, tr("minimized.cancelFailedDescription"))
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function takeOverWorkout() {
    const store = activeSessionStoreRef.current;
    const localDeviceId = controllerDeviceIdRef.current;
    const latest = store?.getSnapshot().executionState;
    if (!userId || !store || !localDeviceId || !latest || !navigator.onLine) return;
    setIsSaving(true);
    try {
      const response = await store.dispatch({
        userId,
        workoutSessionId: latest.workout_session_id,
        commandId: createSessionCommandId(),
        commandType: "claim_control",
        payload: {
          controller_device_id: localDeviceId,
          expected_controller_device_id: latest.controller_device_id,
          takeover: true
        }
      });
      setExecutionState(response.state);
      setControllerConflictDeviceId(null);
      await store.hydrate({ force: true });
    } catch (error) {
      await store.hydrate({ force: true }).catch(() => undefined);
      setControllerConflictDeviceId(store.getSnapshot().executionState?.controller_device_id ?? null);
      toastRef.current({ title: tr("multiDevice.changedElsewhere"), description: userSafeError(error, tr("multiDevice.unsavedPreserved")) });
    } finally {
      setIsSaving(false);
    }
  }

  async function cancelConflictingSession() {
    if (!userId || !conflictingSession || isSaving) return;
    setIsSaving(true);
    try {
      const store = getActiveSessionStore({
        userId,
        workoutSessionId: conflictingSession.id,
        adapter: activeSessionPersistenceAdapter,
        clearCompatibilityCache: () => clearActiveWorkoutState(userId)
      });
      await store.hydrate({ force: true });
      await store.cancelSession();
      setConflictingSession(null);
      setLaunchRevision((current) => current + 1);
    } catch (error) {
      toastRef.current({ title: tr("conflict.cancelFailedTitle"), description: userSafeError(error, tr("conflict.cancelFailedDescription")) });
    } finally {
      setIsSaving(false);
    }
  }

  async function togglePause() {
    if (!executionState || isSaving || isStarting) return;
    setIsSaving(true);
    try {
      await dispatchExecutionAwaited(
        executionState.session_state === "paused" ? "resume" : "pause",
        { controller_device_id: controllerDeviceIdRef.current }
      );
    } catch {
      // dispatchExecutionAwaited presents the localized recoverable failure.
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
      void dispatchExecutionBackground(
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
        ? executionCursorToIndexes(state, items, nextStates.map((item) => item.exercise))
        : { exerciseIndex: Math.min(activeExerciseIndex + 1, Math.max(0, nextStates.length - 1)), setIndex: 0 };
      const nextExerciseIndex = Math.min(Math.max(0, cursor.exerciseIndex), Math.max(0, nextStates.length - 1));
      const nextSetCount = nextStates[nextExerciseIndex]?.sets.length ?? 1;
      setExecutionCursorItems(items);
      setExerciseStates(nextStates);
      exerciseStatesRef.current = nextStates;
      setActiveExerciseIndex(nextExerciseIndex);
      setActiveSetIndex(Math.min(Math.max(0, cursor.setIndex), Math.max(0, nextSetCount - 1)));
      if (state) mirrorExecutionState(state);
      setActionsOpen(false);
      bumpMuscleLoadRefreshRevision();
    } catch (error) {
      toastRef.current({ title: tr("completion.saveFailedTitle"), description: userSafeError(error, tr("offline.keepOpenRetry")) });
    } finally {
      setIsSaving(false);
    }
  }

  async function applyStableReplacement(replacement: Workout): Promise<boolean> {
    if (sourceKind !== "plan-day" || !userId || !sessionId || !activeExercise) return false;
    const store = activeSessionStoreRef.current;
    if (!store) return false;
    const originalName = activeExercise.exercise.exercise_name;
    setIsSavingAlternative(true);
    try {
      await store.replaceExercise({ sourcePlanExerciseId: activeExercise.exercise.id, replacement });
      setExerciseStates((current) => {
        const next = current.map((item, index) => index === activeExerciseIndex
          ? {
              ...item,
              exercise: {
                ...item.exercise,
                exercise_name: replacement.name,
                source_workout_id: replacement.id,
                workout_id: replacement.id
              }
            }
          : item);
        exerciseStatesRef.current = next;
        return next;
      });
      setReplacementPickerOpen(false);
      bumpMuscleLoadRefreshRevision();
      toastRef.current({
        title: tr("exercise.replacementReady"),
        description: tr("exercise.replacementReadyDescription", { name: isolateBidiText(replacement.name) })
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
        console.warn("Plaivra recorded the workout replacement but could not save the optional alternative shortcut.", error);
      });
      return true;
    } catch (error) {
      setSetFeedbackVariant("error");
      setSetFeedback(tr("replacement.unavailable"));
      toastRef.current({ title: tr("exercise.replacementFailed"), description: userSafeError(error) });
      return false;
    } finally {
      setIsSavingAlternative(false);
    }
  }

  function applyPreviousSet(exerciseIndex: number, setIndex: number) {
    const item = exerciseStates[exerciseIndex];
    const targetSet = item?.sets[setIndex];
    if (!item || !targetSet || exerciseIndex !== activeExerciseIndex || setIndex !== activeSetIndex || !previousPerformanceRead) {
      toastRef.current({
        title: tr("exercise.noPreviousPerformance"),
        description: tr("exercise.noPreviousSetDescription")
      });
      return;
    }
    updateSet(exerciseIndex, setIndex, {
      reps: previousPerformanceRead.reps === null ? targetSet.reps : String(previousPerformanceRead.reps),
      weightKg: previousPerformanceRead.weightKg === null ? targetSet.weightKg : String(previousPerformanceRead.weightKg)
    });
  }

  if (isStarting) {
    return (
      <div data-active-workout-controller className="mx-auto flex min-h-[18rem] w-full max-w-3xl items-center justify-center" dir={dir}>
        <div className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground" role="status">
          <RefreshCcw className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
          {tr("header.loadingSession")}
        </div>
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div data-active-workout-controller className="mx-auto w-full max-w-2xl rounded-[var(--radius-lg)] border bg-card p-5" dir={dir}>
        <h1 className="font-semibold">{tr("header.loadFailedTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{tr("header.loadFailedDescription")}</p>
        <Button type="button" variant="outline" className="mt-4 min-h-12" onClick={() => window.location.reload()}>
          <RefreshCcw className="h-4 w-4" aria-hidden="true" />
          {tr("common.retry")}
        </Button>
      </div>
    );
  }

  if (conflictingSession) {
    const stored = userId ? readActiveWorkoutState(userId) : null;
    const resumeHref = resolveActiveWorkoutRoute(conflictingSession, stored);
    const backHref = userId
      ? readPreviousActiveWorkoutRoute(userId) ?? (sourceKind === "plan-day" ? "/my-workout/plans" : "/workouts")
      : sourceKind === "plan-day" ? "/my-workout/plans" : "/workouts";
    return (
      <div data-active-workout-controller dir={dir}>
        <ActiveWorkoutConflict
          resumeHref={resumeHref}
          backHref={backHref}
          busy={isSaving}
          onCancelAndStart={() => { void cancelConflictingSession(); }}
          tr={tr}
        />
      </div>
    );
  }

  if (!exerciseStates.length) {
    return (
      <div data-active-workout-controller className="mx-auto w-full max-w-2xl rounded-[var(--radius-lg)] border bg-card p-5" dir={dir}>
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

  if (!executionCapability.supported) {
    const copy = unsupportedExecutionCopy(language);
    const backHref = userId
      ? readPreviousActiveWorkoutRoute(userId) ?? (sourceKind === "plan-day" ? "/my-workout/plans" : "/workouts")
      : sourceKind === "plan-day" ? "/my-workout/plans" : "/workouts";
    return (
      <div data-active-workout-controller data-aw10-unsupported-execution className="mx-auto w-full max-w-2xl border-s-2 border-warning bg-card p-5" dir={dir}>
        <h1 className="text-lg font-semibold">{copy.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy.description}</p>
        <Button asChild variant="outline" className="mt-5 min-h-12">
          <Link href={backHref} prefetch={false}>
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            {tr("multiDevice.goBack")}
          </Link>
        </Button>
      </div>
    );
  }

  const activeRpeValidation = validateWorkoutSetEffortInput(activeSet.rpe, "rpe");
  const activeRirValidation = validateWorkoutSetEffortInput(activeSet.rir, "rir");
  const activeSetValidation = validateActiveWorkoutSetDraft(activeSet.reps, activeSet.weightKg);
  const isPaused = effectiveExecutionState?.session_state === "paused";
  const restActive = effectiveExecutionState?.view_state === "rest" && timerLeft > 0;
  const reviewOpen = Boolean(
    finishOpen || effectiveExecutionState?.session_state === "review" || effectiveExecutionState?.view_state === "session_review"
  );
  const primaryActionKind = isPaused ? "resume" : restActive ? "skip-rest" : isFinished ? "finish" : "complete-set";
  const primaryActionLabel = isPaused
    ? tr("common.resume")
    : restActive
      ? tr("rest.skip")
      : isFinished
        ? tr("common.finish")
        : tr("set.finishNumbered", { count: formatters.integer(activeSet.setNumber) });
  const primaryActionDisabled = Boolean(
    completedSummary || isSaving || isStarting || !tabLeader || controllerConflictDeviceId !== null || !sessionId
    || (!isPaused && !restActive && !isFinished && Boolean(activeSet.completedAt))
  );
  const activeSetPath = buildActiveWorkoutSetPath(
    activeExercise.sets.map((set) => ({ setNumber: set.setNumber, completed: Boolean(set.completedAt) })),
    activeSet.setNumber
  );
  const handlePrimaryAction = () => {
    if (isPaused) void togglePause();
    else if (restActive) stopRestTimer();
    else if (isFinished) void openSessionReview();
    else void finishSet(activeExerciseIndex, activeSetIndex);
  };
  const busy = isSaving || isStarting || controllerConflictDeviceId !== null || !tabLeader;
  const syncNotice = syncState === "online_synced" || controllerConflictDeviceId ? null : (
    <section data-aw9-sync-state={syncState} role="status" className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] mx-auto max-w-xl rounded-[16px] border border-border/70 bg-background/95 px-4 py-3 shadow-lg backdrop-blur lg:bottom-4">
      <p className="text-sm font-semibold">{tr(`sync.${syncState}`)}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{tr("sync.pendingCount", { count: pendingOperationCount })}</p>
      {syncState === "data_conflict" ? (
        <>
          {dataConflict ? (
            <div className="mt-2 rounded-xl bg-muted/55 p-3 text-sm">
              <p className="font-semibold">{tr("sync.setConflict", { set: formatters.integer(dataConflict.local.setNumber), exercise: isolateBidiText(dataConflict.local.exerciseName) })}</p>
              <p className="mt-1 text-muted-foreground">{tr("sync.thisDevice")}: {tr("sync.setValues", { weight: formatters.decimal(dataConflict.local.weightKg ?? 0), reps: formatters.integer(dataConflict.local.reps ?? 0) })}</p>
              <p className="text-muted-foreground">{tr("sync.server")}: {dataConflict.server ? tr("sync.setValues", { weight: formatters.decimal(dataConflict.server.weight_kg ?? 0), reps: formatters.integer(dataConflict.server.reps ?? 0) }) : tr("completion.metricUnavailable")}</p>
            </div>
          ) : null}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="min-h-10" onClick={() => { void activeSessionStoreRef.current?.resolveDataConflict("server").catch(() => undefined); }}>{tr("sync.keepServer")}</Button>
            <Button type="button" className="min-h-10" onClick={() => { void activeSessionStoreRef.current?.resolveDataConflict("local").catch(() => undefined); }}>{tr("sync.useLocal")}</Button>
          </div>
        </>
      ) : null}
      {syncState === "retry_needed" || syncState === "device_conflict" ? (
        <Button type="button" variant="outline" className="mt-2 min-h-10 w-full" onClick={() => { void activeSessionStoreRef.current?.retryPendingTransport().catch(() => undefined); }}>{tr("common.retry")}</Button>
      ) : null}
    </section>
  );

  const allQuickActions = buildActiveWorkoutQuickActions({
    sourceKind,
    hasGuideOrVideo: Boolean(currentGuideUrl || currentCustomVideoUrl),
    busy,
    paused: Boolean(isPaused),
    activeSetCompleted: Boolean(activeSet.completedAt),
    terminal: Boolean(completedSummary),
    // Visibility is limited to an authenticated ChatGPT entry point; the
    // QuickChatGPT provider remains the authoritative per-section read/write
    // permission gate when the action opens.
    aiPermitted: Boolean(userId),
    labels: {
      "previous-set": tr("exercise.previousSet"),
      "set-details": tr("actions.setDetails"),
      "guide-video": tr("actions.guideVideo"),
      "replace-today": tr("actions.replaceToday"),
      "skip-today": tr("actions.skipToday"),
      "ask-plaivra": tr("chatGPT.ask")
    }
  });
  const mobileQuickActions = projectActiveWorkoutQuickActions(allQuickActions, "mobile");
  const desktopQuickActions = projectActiveWorkoutQuickActions(allQuickActions, "desktop");
  const openDetails = (
    section: ActiveWorkoutDetailsSection,
    trigger: HTMLButtonElement,
    focusTarget: "guide-video" | null = null
  ) => {
    setDetailsTriggerRef.current = trigger;
    setDetailsRequest({ section, focusTarget });
    setActionsOpen(true);
  };
  const deviceConflictBackHref = userId
    ? readPreviousActiveWorkoutRoute(userId) ?? (sourceKind === "plan-day" ? "/my-workout/plans" : "/workouts")
    : "/workouts";
  const handleQuickAction = (action: ActiveWorkoutQuickAction, trigger: HTMLButtonElement) => {
    if (action.disabled) return;
    if (action.intent === "apply-previous-set") {
      applyPreviousSet(activeExerciseIndex, activeSetIndex);
      return;
    }
    openDetails(action.destination ?? "overview", trigger, action.id === "guide-video" ? "guide-video" : null);
  };
  const miniHeatMap = (
    <ActiveWorkoutMiniHeatMap controller={muscleLoadController} onOpen={(trigger) => openDetails("muscle-load", trigger)} />
  );
  const desktopMiniHeatMap = miniHeatMap;
  const previousPerformanceValue = activePreviousPerformance?.lastBestSet
    ?? (previousPerformanceUnavailable ? tr("completion.metricUnavailable") : null);
  const previousPerformanceDate = activePreviousPerformance?.lastPerformedAt
    ? formatters.date(activePreviousPerformance.lastPerformedAt)
    : null;
  const activeSetKey = `${sessionId ?? "no-session"}:${activeExercise.prescriptionItem.id}:${activeSet.setNumber}`;
  const showCurrentValidation = validationAttemptKey === activeSetKey;
  const progressionTargetValue = activeProgressionTarget
    ? [
        activeProgressionTarget.next_target_weight_kg === null ? null : formatters.measurement(activeProgressionTarget.next_target_weight_kg, "kg"),
        activeProgressionTarget.next_target_reps === null ? null : `${formatters.integer(Number(activeProgressionTarget.next_target_reps))} ${tr("units.reps")}`
      ].filter((value): value is string => Boolean(value)).join(" × ") || null
    : null;
  const navigatorRows = buildActiveWorkoutExerciseNavigatorRows({
    exercises: exerciseStates,
    activeExerciseIndex,
    originalNamesByPlanExerciseId: new Map(day.exercises.map((exercise) => [exercise.id, exercise.exercise_name]))
  });
  const nextExecutionExercise = exerciseStates[activeExerciseIndex] ?? null;
  const nextExecutionSet = nextExecutionExercise?.sets[activeSetIndex] ?? null;
  const nextExecutionSetLabel = nextExecutionExercise && nextExecutionSet
    ? tr("header.setProgress", { current: formatters.integer(nextExecutionSet.setNumber), total: formatters.integer(nextExecutionExercise.sets.length) })
    : tr("navigation.allDone");
  const nextExecutionTarget = nextExecutionSet?.plannedReps ? `${nextExecutionSet.plannedReps} ${tr("units.reps")}` : null;
  const exerciseDetailId = resolveActiveWorkoutExerciseDetailId({
    sourceWorkoutId: activeExercise.exercise.source_workout_id,
    workoutId: activeExercise.exercise.workout_id,
    sourcePlanActivityId: activeExercise.prescriptionItem.sourcePlanActivityId
  });

  async function openCanonicalExerciseDetail() {
    if (!exerciseDetailId) {
      setSetFeedbackVariant("error");
      setSetFeedback(tr("exercise.detailsUnavailable"));
      return;
    }
    const preserved = await preserveWorkoutForNavigation();
    if (!preserved) return;
    window.location.assign(activeWorkoutExerciseDetailHref(exerciseDetailId, sessionRoute));
  }

  if (completedSummary || reviewOpen) {
    return (
      <div data-active-workout-controller className="contents">
        {syncNotice}
        {!tabLeader ? (
          <section data-aw9-tab-conflict role="status" className="fixed inset-x-3 top-3 z-[64] mx-auto max-w-xl rounded-[18px] border border-border/70 bg-background/95 p-4 shadow-lg backdrop-blur">
            <h2 className="font-semibold">{tr("multiDevice.sameDeviceTab")}</h2>
            <Button type="button" variant="outline" className="mt-3 min-h-11 w-full" onClick={() => { const leadership = tabLeadershipRef.current; if (!leadership) return; void leadership.acquire(true).then(setTabLeader); }}>{tr("multiDevice.continueThisTab")}</Button>
          </section>
        ) : null}
        <ActiveWorkoutReviewBridge
          open={reviewOpen}
          busy={busy}
          sessionAvailable={Boolean(sessionId)}
          sessionId={sessionId}
          durationMinutes={durationMinutes}
          totalVolume={totalVolume}
          sessionNotes={sessionNotes}
          onSessionNotesChange={setSessionNotes}
          onComplete={() => { void completeSession(); }}
          onContinue={continueWorkoutFromReview}
          onJumpToSet={(exerciseIndex, setIndex) => { void leaveReviewAtSet(exerciseIndex, setIndex, false); }}
          onReopenSet={(exerciseIndex, setIndex) => { void leaveReviewAtSet(exerciseIndex, setIndex, true); }}
          onRetryCompletion={() => { void completeSession(); }}
          completionRecovery={completionRecovery}
          completedSummary={completedSummary}
          review={reviewProjection}
          dayName={day.day_name}
          muscleLoadController={muscleLoadController}
          tr={tr}
          formatters={formatters}
        />
      </div>
    );
  }

  return (
    <div data-active-workout-controller className="contents">
      {syncNotice}
      {!tabLeader ? (
        <section data-aw9-tab-conflict role="status" className="fixed inset-x-3 top-3 z-[64] mx-auto max-w-xl rounded-[18px] border border-border/70 bg-background/95 p-4 shadow-lg backdrop-blur">
          <h2 className="font-semibold">{tr("multiDevice.sameDeviceTab")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{tr("multiDevice.viewOnly")}</p>
          <Button type="button" variant="outline" className="mt-3 min-h-11 w-full" onClick={() => { const leadership = tabLeadershipRef.current; if (!leadership) return; void leadership.acquire(true).then(setTabLeader); }}>{tr("multiDevice.continueThisTab")}</Button>
        </section>
      ) : null}
      {controllerConflictDeviceId ? (
        <section data-aw9-device-conflict role="status" className="fixed inset-x-3 top-3 z-[65] mx-auto max-w-xl rounded-[18px] border border-warning/40 bg-background/95 p-4 shadow-lg backdrop-blur">
          <h2 className="font-semibold">{tr("multiDevice.activeElsewhere")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{tr("multiDevice.viewOnly")}</p>
          <div className="mt-3 grid gap-2">
            <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => { document.querySelector("[data-aw5-execution-shell]")?.scrollIntoView({ block: "start" }); }}>{tr("multiDevice.viewCurrent")}</Button>
            <Button type="button" className="min-h-11 w-full" onClick={() => setTakeoverConfirmationOpen(true)} disabled={isSaving || (typeof navigator !== "undefined" && !navigator.onLine)}>{tr("multiDevice.takeOver")}</Button>
            <Button asChild variant="ghost" className="min-h-11 w-full"><Link href={deviceConflictBackHref} prefetch={false}>{tr("multiDevice.goBack")}</Link></Button>
          </div>
        </section>
      ) : null}

      <Dialog open={takeoverConfirmationOpen} onOpenChange={setTakeoverConfirmationOpen}>
        <DialogContent data-aw9-takeover-confirmation className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tr("multiDevice.takeoverConfirmTitle")}</DialogTitle>
            <DialogDescription>{tr("multiDevice.takeoverConfirmDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="min-h-12" onClick={() => setTakeoverConfirmationOpen(false)} disabled={isSaving}>{tr("common.back")}</Button>
            <Button type="button" className="min-h-12" onClick={() => { setTakeoverConfirmationOpen(false); void takeOverWorkout(); }} disabled={isSaving}>{tr("multiDevice.confirmTakeover")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelConfirmationOpen} onOpenChange={setCancelConfirmationOpen}>
        <DialogContent data-aw10-cancel-confirmation className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tr("minimized.cancelQuestion")}</DialogTitle>
            <DialogDescription>{tr("minimized.cancelDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="min-h-12" onClick={() => setCancelConfirmationOpen(false)} disabled={isSaving}>{tr("common.back")}</Button>
            <Button type="button" variant="destructive" className="min-h-12" onClick={() => { void cancelCurrentSession(); }} disabled={isSaving || (typeof navigator !== "undefined" && !navigator.onLine)}>{isSaving ? tr("minimized.cancelling") : tr("minimized.cancelWorkout")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <ActiveWorkoutExecutionShell
        direction={dir}
        sessionLabel={sourceKind === "direct" ? tr("header.workoutSession") : day.day_name}
        exerciseName={activeExercise.exercise.exercise_name}
        exercisePositionLabel={tr("header.exerciseProgress", { current: formatters.integer(activeExerciseIndex + 1), total: formatters.integer(exerciseStates.length) })}
        setPositionLabel={tr("header.setProgress", { current: formatters.integer(activeSetIndex + 1), total: formatters.integer(activeExercise.sets.length) })}
        targetLabel={executionTargetLabel(language)}
        targetValue={activeSet.plannedReps ? `${activeSet.plannedReps} ${tr("units.reps")}` : null}
        progressionTargetLabel={tr("exercise.nextTarget")}
        progressionTargetValue={progressionTargetValue}
        completedSetsLabel={tr("header.completedSetsProgress", { completed: formatters.integer(completedSets), total: formatters.integer(totalSets) })}
        elapsedLabel={formatters.timer(elapsedSeconds)}
        progress={clampWorkoutProgress(completedSets, totalSets)}
        miniHeatMap={miniHeatMap}
        desktopMiniHeatMap={desktopMiniHeatMap}
        muscleLoadStatusLabel={tr("heatMap.currentSessionMuscleLoad")}
        mobileQuickActions={mobileQuickActions}
        desktopQuickActions={desktopQuickActions}
        paused={Boolean(isPaused)}
        busy={busy}
        restActive={restActive}
        restLabel={formatters.timer(timerLeft)}
        nextContextLabel={nextSetLabel}
        nextLabel={tr("rest.next")}
        nextExerciseName={nextExecutionExercise?.exercise.exercise_name ?? null}
        nextSetLabel={nextExecutionSetLabel}
        nextTargetValue={nextExecutionTarget}
        currentSetLabel={tr("set.label", { count: formatters.integer(activeSet.setNumber) })}
        repsLabel={tr("set.reps")}
        weightLabel={tr("set.weightKg")}
        repsDraft={activeSet.reps}
        weightDraft={activeSet.weightKg}
        repsError={(showCurrentValidation || activeSet.reps.trim()) && activeSetValidation.repsError ? activeSetValidation.repsError === "invalid" ? tr("validation.wholeReps") : tr("validation.repsRequired") : null}
        weightError={(showCurrentValidation || activeSet.weightKg.trim()) && activeSetValidation.weightError ? activeSetValidation.weightError === "required" ? tr("validation.weightRequired") : tr("validation.nonNegative") : null}
        inputHint={null}
        setPathLabel={tr("set.path")}
        setPath={activeSetPath}
        setPathStateLabels={{ completed: tr("navigation.completed"), active: tr("common.active"), available: tr("navigation.notStarted") }}
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
        finishLabel={tr("minimized.finishWorkout")}
        cancelLabel={tr("minimized.cancelWorkout")}
        askChatGptLabel={tr("chatGPT.ask")}
        previousPerformanceLabel={tr("exercise.previousPerformance")}
        previousPerformanceValue={previousPerformanceValue}
        previousPerformanceDate={previousPerformanceDate}
        previousPerformanceLoading={previousPerformanceLoading}
        usePreviousLabel={tr("exercise.useValues")}
        addThirtySecondsLabel={tr("rest.addThirtySeconds")}
        restPresetSectionLabel={tr("actions.timerControls")}
        restPresetLabels={[30, 60, 90, 180].map((seconds) => ({ seconds, label: restPresetLabel(seconds, tr) }))}
        feedback={(
          <InlineFeedback message={setFeedback} variant={setFeedbackVariant} onClose={() => setSetFeedback("")} />
        )}
        onRepsChange={(value) => updateSet(activeExerciseIndex, activeSetIndex, { reps: value })}
        onWeightChange={(value) => updateSet(activeExerciseIndex, activeSetIndex, { weightKg: value })}
        onSelectSet={(setNumber) => {
          const setIndex = activeExercise.sets.findIndex((set) => set.setNumber === setNumber);
          if (setIndex < 0) return;
          void navigateToSessionSet(activeExerciseIndex, setIndex);
        }}
        onPrimaryAction={handlePrimaryAction}
        onPauseResume={() => { void togglePause(); }}
        onFinish={() => { void openSessionReview(); }}
        onCancel={() => setCancelConfirmationOpen(true)}
        onOpenDetails={() => { void openCanonicalExerciseDetail(); }}
        onOpenExerciseNavigator={() => {
          setActionsOpen(false);
          setReplacementPickerOpen(false);
          setExerciseNavigatorOpen(true);
        }}
        onQuickAction={handleQuickAction}
        onUsePrevious={previousPerformanceRead ? () => applyPreviousSet(activeExerciseIndex, activeSetIndex) : undefined}
        onAddThirtySeconds={() => startRestTimer(timerLeft + 30)}
        onStartRest={startRestTimer}
        exerciseNavigatorContent={(
          <ActiveWorkoutExerciseNavigator
            open={exerciseNavigatorOpen}
            onOpenChange={setExerciseNavigatorOpen}
            rows={navigatorRows}
            readOnly={!tabLeader || controllerConflictDeviceId !== null}
            paused={Boolean(isPaused)}
            busy={isSaving}
            onSelect={(exerciseIndex, setIndex) => { void navigateToSessionSet(exerciseIndex, setIndex); }}
            tr={tr}
            formatInteger={formatters.integer}
          />
        )}
        detailsContent={(
          <ActiveWorkoutDetailsBridge
            open={actionsOpen}
            onOpenChange={handleSetDetailsOpenChange}
            returnFocusRef={setDetailsTriggerRef}
            requestedSection={detailsRequest.section}
            requestedFocusTarget={detailsRequest.focusTarget}
            sourceKind={sourceKind}
            userId={userId}
            locale={language}
            sessionExerciseIds={new Set(exerciseStates.map((item) => item.exercise.source_workout_id ?? item.exercise.workout_id).filter((value): value is string => Boolean(value)))}
            activeExercise={activeExercise}
            activeSet={activeSet}
            previousPerformance={activePreviousPerformance}
            currentInstructions={currentInstructions}
            currentGuideUrl={currentGuideUrl}
            currentCustomVideoUrl={currentCustomVideoUrl}
            busy={busy}
            tr={tr}
            formatters={formatters}
            legacyReopenSetLabel={legacyReopenSetLabel}
            onApplyPreviousSet={() => applyPreviousSet(activeExerciseIndex, activeSetIndex)}
            onRestartSet={() => { void restartSet(activeExerciseIndex, activeSetIndex); }}
            onUpdateSet={(patch) => updateSet(activeExerciseIndex, activeSetIndex, patch)}
            muscleLoadController={muscleLoadController}
            activeAlternatives={activeAlternatives}
            replacementReason={replacementReason}
            onReplacementReasonChange={setReplacementReason}
            onUseReplacement={() => { setActionsOpen(false); window.setTimeout(() => setReplacementPickerOpen(true), 0); }}
            onSkipExercise={() => { void skipCurrentExercise(); }}
            isSavingAlternative={isSavingAlternative}
            workoutContext={workoutContext}
            onResetTimer={resetWorkoutTimer}
            sessionSourceId={sessionId ?? day.id}
            replacementPickerOpen={replacementPickerOpen}
            onReplacementPickerOpenChange={setReplacementPickerOpen}
            dayName={day.day_name}
            onAddReplacement={applyStableReplacement}
          />
        )}
      />
    </div>
  );
}
