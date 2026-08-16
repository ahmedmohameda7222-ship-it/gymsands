import fs from "node:fs";

const path = "components/workouts/active-workout/active-workout-core-session-implementation.tsx";
let source = fs.readFileSync(path, "utf8");

function replaceOnce(before, after, marker = after) {
  if (source.includes(marker)) return;
  if (!source.includes(before)) throw new Error(`Core patch anchor not found: ${before.slice(0, 150)}`);
  source = source.replace(before, after);
}

function replaceSection(startMarker, endMarker, replacement, completionMarker) {
  if (source.includes(completionMarker)) return;
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Core section start not found: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`Core section end not found: ${endMarker}`);
  source = source.slice(0, start) + replacement + source.slice(end);
}

replaceOnce(
  'import { ActiveWorkoutExecutionShell } from "@/components/workouts/active-workout/active-workout-execution-shell";\n',
  'import { ActiveWorkoutExecutionShell } from "@/components/workouts/active-workout/active-workout-execution-shell";\nimport { ActiveWorkoutExerciseNavigator, buildActiveWorkoutExerciseNavigatorRows } from "@/components/workouts/active-workout/active-workout-exercise-navigator";\n',
  'buildActiveWorkoutExerciseNavigatorRows'
);
replaceOnce(
  'import { userSafeError } from "@/lib/error-formatting";\n',
  'import { userSafeError } from "@/lib/error-formatting";\nimport { transientFeedbackDuration } from "@/lib/feedback/transient-feedback";\n',
  'transientFeedbackDuration'
);
replaceOnce(
  'import { getActiveWorkoutDeviceId } from "@/lib/workouts/active-workout-device";\n',
  'import { getActiveWorkoutDeviceId } from "@/lib/workouts/active-workout-device";\nimport { activeWorkoutExerciseDetailHref, resolveActiveWorkoutExerciseDetailId } from "@/lib/workouts/active-workout-detail-navigation";\n',
  'resolveActiveWorkoutExerciseDetailId'
);
replaceOnce(
`import {
  createActiveWorkoutTabLeadership,
  type ActiveWorkoutSetConflict,
  type ActiveWorkoutSyncState,
  type ActiveWorkoutTabLeadership
} from "@/lib/workouts/active-session-sync";
`,
`import {
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
`,
  'mergeActiveWorkoutSetDrafts'
);
replaceOnce(
  'import { planSessionAfterSetCompletion } from "@/lib/workouts/session-engine/reducer";\n',
  'import { planSessionAfterSetCompletion } from "@/lib/workouts/session-engine/reducer";\nimport { projectOptimisticSetCompletion } from "@/lib/workouts/optimistic-set-completion";\n',
  'projectOptimisticSetCompletion'
);

replaceOnce(
  '  const { celebrate } = useSuccessFeedback();',
  '  const { celebrate, setCompleted, error: feedbackError } = useSuccessFeedback();',
  'error: feedbackError'
);
replaceOnce(
`  const [setFeedback, setSetFeedback] = useState("");
  const [setFeedbackVariant, setSetFeedbackVariant] = useState<"info" | "error">("info");
`,
`  const [setFeedback, setSetFeedback] = useState("");
  const [setFeedbackVariant, setSetFeedbackVariant] = useState<"info" | "error">("info");
  const [validationAttemptKey, setValidationAttemptKey] = useState<string | null>(null);
  const [exerciseNavigatorOpen, setExerciseNavigatorOpen] = useState(false);
  const [optimisticCompletion, setOptimisticCompletion] = useState<{
    commandId: string;
    setKey: string;
    projectedExecutionState: WorkoutSessionExecutionState;
  } | null>(null);
`,
  'const [optimisticCompletion, setOptimisticCompletion]'
);
replaceOnce(
`  const autosaveAdapterRef = useRef<WorkoutSetAutosaveAdapter<ActiveWorkoutExerciseState[]> | null>(null);
  const autosaveCoordinatorRef = useRef<WorkoutSetAutosaveCoordinator | null>(null);
`,
`  const autosaveAdapterRef = useRef<WorkoutSetAutosaveAdapter<ActiveWorkoutExerciseState[]> | null>(null);
  const autosaveCoordinatorRef = useRef<WorkoutSetAutosaveCoordinator | null>(null);
  const pendingSetCommandKeyRef = useRef<string | null>(null);
  const pendingSetCompletionPromiseRef = useRef<Promise<void> | null>(null);
  const effectiveExecutionState = optimisticCompletion?.projectedExecutionState ?? executionState;
`,
  'pendingSetCompletionPromiseRef'
);

replaceOnce(
`        const hydratedStates = hydrateStates(
          cachedStates ?? authoritativeItems.map((item) => makeFrozenExerciseState(item, currentDay.exercises)),
          existingLogs
        );
`,
`        const canonicalHydratedStates = hydrateStates(
          cachedStates ?? authoritativeItems.map((item) => makeFrozenExerciseState(item, currentDay.exercises)),
          existingLogs
        );
        const restoredDrafts = await readActiveWorkoutSetDrafts(userId, nextSession.id).catch(() => []);
        const hydratedStates = mergeActiveWorkoutSetDrafts(canonicalHydratedStates, restoredDrafts);
`,
  'const restoredDrafts = await readActiveWorkoutSetDrafts'
);
replaceOnce(
`        if (!authoritativeState && hydrated.finalProjection) {
          const terminalStates = hydrateStates(
`,
`        if (!authoritativeState && hydrated.finalProjection) {
          await clearActiveWorkoutSessionDrafts(userId, nextSession.id).catch(() => undefined);
          const terminalStates = hydrateStates(
`,
  'await clearActiveWorkoutSessionDrafts(userId, nextSession.id).catch(() => undefined);'
);

replaceSection(
`  useEffect(() => {
    const tick = () => {
      const now = activeSessionClock.getSnapshot();
`,
`  useEffect(() => {
    if (!executionHydratedRef.current || !userId || !sessionId || !executionState) return;
`,
`  useEffect(() => {
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

`,
  'effectiveExecutionState\n        ? executionElapsedSeconds'
);

replaceOnce(
`  useEffect(() => {
    if (!executionHydratedRef.current || !userId || !sessionId || !executionState) return;
`,
`  useEffect(() => {
    if (!executionHydratedRef.current || !userId || !sessionId || !executionState || optimisticCompletion) return;
`,
  '!executionState || optimisticCompletion) return;'
);
replaceOnce(
`  }, [activeExerciseIndex, activeSetIndex, dispatchExecutionBackground, executionCursorItems, executionState, sessionId, userId]);
`,
`  }, [activeExerciseIndex, activeSetIndex, dispatchExecutionBackground, executionCursorItems, executionState, optimisticCompletion, sessionId, userId]);
`,
  'executionState, optimisticCompletion, sessionId'
);

replaceOnce(
`  useEffect(() => {
    exerciseStatesRef.current = exerciseStates;
    if (exerciseStates.length > 0) activeSessionStoreRef.current?.setSecondaryProjection(exerciseStates);
  }, [exerciseStates]);
`,
`  useEffect(() => {
    exerciseStatesRef.current = exerciseStates;
    if (exerciseStates.length > 0) activeSessionStoreRef.current?.setSecondaryProjection(exerciseStates);
  }, [exerciseStates]);

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
          draft: {
            reps: set.reps,
            weightKg: set.weightKg,
            rpe: set.rpe,
            rir: set.rir,
            setType: set.setType,
            notes: set.notes
          }
        })))
    });
  }, [sessionId, userId]);

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
`,
  'const persistSetDrafts = useCallback'
);

replaceSection(
`  const minimizeWorkout = useCallback(async () => {
`,
`  useRegisterActiveWorkoutMinimize(minimizeWorkout);
`,
`  const preserveWorkoutForNavigation = useCallback(async () => {
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

`,
  'const preserveWorkoutForNavigation = useCallback'
);

replaceSection(
`  async function finishSet(exerciseIndex: number, setIndex: number) {
`,
`  async function restartSet(exerciseIndex: number, setIndex: number) {
`,
`  async function finishSet(exerciseIndex: number, setIndex: number) {
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

`,
  'const projectedExecutionState = projectOptimisticSetCompletion'
);

replaceOnce(
`  function executionCursorFor(exerciseIndex: number, setIndex: number) {
    const item = executionCursorItems[exerciseIndex]
      ?? executionCursorItems.find((candidate) => candidate.itemOrder === exerciseIndex + 1)
      ?? null;
    return { snapshotItemId: item?.id ?? null, itemOrder: item?.itemOrder ?? exerciseIndex + 1, setNumber: setIndex + 1 };
  }
`,
`  function executionCursorFor(exerciseIndex: number, setIndex: number) {
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
`,
  'async function navigateToSessionSet'
);

replaceOnce(
`  function finalizeVerifiedCompletion(summary: ActiveWorkoutSummary) {
    if (userId) clearActiveWorkoutState(userId);
`,
`  function finalizeVerifiedCompletion(summary: ActiveWorkoutSummary) {
    if (userId) clearActiveWorkoutState(userId);
    if (userId && sessionId) void clearActiveWorkoutSessionDrafts(userId, sessionId).catch(() => undefined);
`,
  'void clearActiveWorkoutSessionDrafts(userId, sessionId)'
);
replaceOnce(
`      await store.cancelSession();
      clearActiveWorkoutState(userId);
`,
`      await store.cancelSession();
      await clearActiveWorkoutSessionDrafts(userId, sessionId).catch(() => undefined);
      clearActiveWorkoutState(userId);
`,
  'await clearActiveWorkoutSessionDrafts(userId, sessionId).catch(() => undefined);\n      clearActiveWorkoutState(userId);'
);

replaceOnce(
`  const isPaused = executionState?.session_state === "paused";
  const restActive = executionState?.view_state === "rest" && timerLeft > 0;
  const reviewOpen = Boolean(
    finishOpen || executionState?.session_state === "review" || executionState?.view_state === "session_review"
  );
`,
`  const isPaused = effectiveExecutionState?.session_state === "paused";
  const restActive = effectiveExecutionState?.view_state === "rest" && timerLeft > 0;
  const reviewOpen = Boolean(
    finishOpen || effectiveExecutionState?.session_state === "review" || effectiveExecutionState?.view_state === "session_review"
  );
`,
  'const isPaused = effectiveExecutionState?.session_state'
);
replaceOnce(
`    || (!isPaused && !restActive && !isFinished && (
      Boolean(activeSet.completedAt) || !activeSetValidation.complete || Boolean(activeRpeValidation.error) || Boolean(activeRirValidation.error)
    ))
`,
`    || (!isPaused && !restActive && !isFinished && Boolean(activeSet.completedAt))
`,
  '!isFinished && Boolean(activeSet.completedAt)'
);

replaceOnce(
`  const previousPerformanceDate = activePreviousPerformance?.lastPerformedAt
    ? formatters.date(activePreviousPerformance.lastPerformedAt)
    : null;
`,
`  const previousPerformanceDate = activePreviousPerformance?.lastPerformedAt
    ? formatters.date(activePreviousPerformance.lastPerformedAt)
    : null;
  const activeSetKey = `${sessionId ?? "no-session"}:${activeExercise.prescriptionItem.id}:${activeSet.setNumber}`;
  const showCurrentValidation = validationAttemptKey === activeSetKey;
  const progressionTargetValue = activeProgressionTarget
    ? [
        activeProgressionTarget.next_target_weight_kg === null ? null : formatters.measurement(activeProgressionTarget.next_target_weight_kg, "kg"),
        activeProgressionTarget.next_target_reps === null ? null : `${formatters.integer(activeProgressionTarget.next_target_reps)} ${tr("units.reps")}`
      ].filter((value): value is string => Boolean(value)).join(" × ") || null
    : null;
  const navigatorRows = buildActiveWorkoutExerciseNavigatorRows({
    exercises: exerciseStates,
    activeExerciseIndex,
    originalNamesByPlanExerciseId: new Map(day.exercises.map((exercise) => [exercise.id, exercise.exercise_name]))
  });
  const nextExecutionExercise = restActive ? activeExercise : exerciseStates[activeExerciseIndex];
  const nextExecutionSet = restActive ? activeSet : exerciseStates[activeExerciseIndex]?.sets[activeSetIndex];
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
`,
  'async function openCanonicalExerciseDetail()'
);

replaceOnce(
`        targetValue={activeSet.plannedReps ? `${activeSet.plannedReps} ${tr("units.reps")}` : null}
`,
`        targetValue={activeSet.plannedReps ? `${activeSet.plannedReps} ${tr("units.reps")}` : null}
        progressionTargetLabel={tr("exercise.nextTarget")}
        progressionTargetValue={progressionTargetValue}
`,
  'progressionTargetValue={progressionTargetValue}'
);
replaceOnce(
`        nextContextLabel={nextSetLabel}
`,
`        nextContextLabel={nextSetLabel}
        nextLabel={tr("rest.next")}
        nextExerciseName={nextExecutionExercise?.exercise.exercise_name ?? null}
        nextSetLabel={nextExecutionSetLabel}
        nextTargetValue={nextExecutionTarget}
`,
  'nextExerciseName={nextExecutionExercise?.exercise.exercise_name ?? null}'
);
replaceOnce(
`        repsError={activeSet.reps.trim() && activeSetValidation.repsError ? activeSetValidation.repsError === "invalid" ? tr("validation.wholeReps") : tr("validation.requiredValues") : null}
        weightError={activeSet.weightKg.trim() && activeSetValidation.weightError ? tr("validation.nonNegative") : null}
        inputHint={!activeSet.reps.trim() || !activeSet.weightKg.trim() ? tr("validation.requiredValues") : null}
`,
`        repsError={(showCurrentValidation || activeSet.reps.trim()) && activeSetValidation.repsError ? activeSetValidation.repsError === "invalid" ? tr("validation.wholeReps") : tr("validation.repsRequired") : null}
        weightError={(showCurrentValidation || activeSet.weightKg.trim()) && activeSetValidation.weightError ? activeSetValidation.weightError === "required" ? tr("validation.weightRequired") : tr("validation.nonNegative") : null}
        inputHint={null}
`,
  'tr("validation.repsRequired")'
);
replaceOnce(
`        onSelectSet={(setNumber) => {
          const setIndex = activeExercise.sets.findIndex((set) => set.setNumber === setNumber);
          if (setIndex < 0) return;
          void flushPendingSetWrites();
          setActiveSetIndex(setIndex);
        }}
`,
`        onSelectSet={(setNumber) => {
          const setIndex = activeExercise.sets.findIndex((set) => set.setNumber === setNumber);
          if (setIndex < 0) return;
          void navigateToSessionSet(activeExerciseIndex, setIndex);
        }}
`,
  'void navigateToSessionSet(activeExerciseIndex, setIndex);'
);
replaceOnce(
`        onOpenDetails={(trigger) => openDetails("overview", trigger)}
`,
`        onOpenDetails={() => { void openCanonicalExerciseDetail(); }}
        onOpenExerciseNavigator={() => {
          setActionsOpen(false);
          setReplacementPickerOpen(false);
          setExerciseNavigatorOpen(true);
        }}
`,
  'setExerciseNavigatorOpen(true);'
);
replaceOnce(
`        detailsContent={(
`,
`        exerciseNavigatorContent={(
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
`,
  '<ActiveWorkoutExerciseNavigator'
);

fs.writeFileSync(path, source);
console.log("Active Workout core authority patches applied.");
