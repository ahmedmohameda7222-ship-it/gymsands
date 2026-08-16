import fs from "node:fs";

const target = "components/workouts/active-workout/active-workout-core-session-implementation.tsx";
const fragmentRoot = "scripts/.active-workout-patches";
let source = fs.readFileSync(target, "utf8");

function fragment(name) {
  return fs.readFileSync(`${fragmentRoot}/${name}`, "utf8");
}

function replaceOnce(before, after, marker = after) {
  if (source.includes(marker)) return;
  if (!source.includes(before)) throw new Error(`Core patch anchor not found: ${before.slice(0, 140)}`);
  source = source.replace(before, after);
}

function replaceSection(startMarker, endMarker, after, marker) {
  if (source.includes(marker)) return;
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Core section start not found: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`Core section end not found: ${endMarker}`);
  source = source.slice(0, start) + after + source.slice(end);
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
  'import {\n  createActiveWorkoutTabLeadership,\n  type ActiveWorkoutSetConflict,\n  type ActiveWorkoutSyncState,\n  type ActiveWorkoutTabLeadership\n} from "@/lib/workouts/active-session-sync";\n',
  'import {\n  createActiveWorkoutTabLeadership,\n  type ActiveWorkoutSetConflict,\n  type ActiveWorkoutSyncState,\n  type ActiveWorkoutTabLeadership\n} from "@/lib/workouts/active-session-sync";\nimport {\n  clearActiveWorkoutSessionDrafts,\n  clearActiveWorkoutSetDraft,\n  mergeActiveWorkoutSetDrafts,\n  readActiveWorkoutSetDrafts,\n  writeActiveWorkoutSetDrafts\n} from "@/lib/workouts/active-session-sync/set-drafts";\n',
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
  '  const [setFeedback, setSetFeedback] = useState("");\n  const [setFeedbackVariant, setSetFeedbackVariant] = useState<"info" | "error">("info");\n',
  '  const [setFeedback, setSetFeedback] = useState("");\n  const [setFeedbackVariant, setSetFeedbackVariant] = useState<"info" | "error">("info");\n  const [validationAttemptKey, setValidationAttemptKey] = useState<string | null>(null);\n  const [exerciseNavigatorOpen, setExerciseNavigatorOpen] = useState(false);\n  const [optimisticCompletion, setOptimisticCompletion] = useState<{\n    commandId: string;\n    setKey: string;\n    projectedExecutionState: WorkoutSessionExecutionState;\n  } | null>(null);\n',
  'const [optimisticCompletion, setOptimisticCompletion]'
);
replaceOnce(
  '  const autosaveAdapterRef = useRef<WorkoutSetAutosaveAdapter<ActiveWorkoutExerciseState[]> | null>(null);\n  const autosaveCoordinatorRef = useRef<WorkoutSetAutosaveCoordinator | null>(null);\n',
  '  const autosaveAdapterRef = useRef<WorkoutSetAutosaveAdapter<ActiveWorkoutExerciseState[]> | null>(null);\n  const autosaveCoordinatorRef = useRef<WorkoutSetAutosaveCoordinator | null>(null);\n  const pendingSetCommandKeyRef = useRef<string | null>(null);\n  const pendingSetCompletionPromiseRef = useRef<Promise<void> | null>(null);\n  const effectiveExecutionState = optimisticCompletion?.projectedExecutionState ?? executionState;\n',
  'pendingSetCompletionPromiseRef'
);

replaceOnce(
  '        const hydratedStates = hydrateStates(\n          cachedStates ?? authoritativeItems.map((item) => makeFrozenExerciseState(item, currentDay.exercises)),\n          existingLogs\n        );\n',
  '        const canonicalHydratedStates = hydrateStates(\n          cachedStates ?? authoritativeItems.map((item) => makeFrozenExerciseState(item, currentDay.exercises)),\n          existingLogs\n        );\n        const restoredDrafts = await readActiveWorkoutSetDrafts(userId, nextSession.id).catch(() => []);\n        const hydratedStates = mergeActiveWorkoutSetDrafts(canonicalHydratedStates, restoredDrafts);\n',
  'const restoredDrafts = await readActiveWorkoutSetDrafts'
);
replaceOnce(
  '        if (!authoritativeState && hydrated.finalProjection) {\n          const terminalStates = hydrateStates(\n',
  '        if (!authoritativeState && hydrated.finalProjection) {\n          await clearActiveWorkoutSessionDrafts(userId, nextSession.id).catch(() => undefined);\n          const terminalStates = hydrateStates(\n',
  'await clearActiveWorkoutSessionDrafts(userId, nextSession.id).catch(() => undefined);'
);

replaceSection(
  '  useEffect(() => {\n    const tick = () => {\n      const now = activeSessionClock.getSnapshot();\n',
  '  useEffect(() => {\n    if (!executionHydratedRef.current || !userId || !sessionId || !executionState) return;\n',
  fragment('core-clock-effect.txt'),
  'effectiveExecutionState\n        ? executionElapsedSeconds'
);
replaceOnce(
  '  useEffect(() => {\n    if (!executionHydratedRef.current || !userId || !sessionId || !executionState) return;\n',
  '  useEffect(() => {\n    if (!executionHydratedRef.current || !userId || !sessionId || !executionState || optimisticCompletion) return;\n',
  '!executionState || optimisticCompletion) return;'
);
replaceOnce(
  '  }, [activeExerciseIndex, activeSetIndex, dispatchExecutionBackground, executionCursorItems, executionState, sessionId, userId]);\n',
  '  }, [activeExerciseIndex, activeSetIndex, dispatchExecutionBackground, executionCursorItems, executionState, optimisticCompletion, sessionId, userId]);\n',
  'executionState, optimisticCompletion, sessionId'
);

replaceOnce(
  '  useEffect(() => {\n    exerciseStatesRef.current = exerciseStates;\n    if (exerciseStates.length > 0) activeSessionStoreRef.current?.setSecondaryProjection(exerciseStates);\n  }, [exerciseStates]);\n',
  '  useEffect(() => {\n    exerciseStatesRef.current = exerciseStates;\n    if (exerciseStates.length > 0) activeSessionStoreRef.current?.setSecondaryProjection(exerciseStates);\n  }, [exerciseStates]);\n\n  const persistSetDrafts = useCallback(async (states = exerciseStatesRef.current) => {\n    if (!userId || !sessionId || !states.length) return;\n    await writeActiveWorkoutSetDrafts({\n      userId,\n      workoutSessionId: sessionId,\n      drafts: states.flatMap((exercise) => exercise.sets\n        .filter((set) => !set.completedAt)\n        .map((set) => ({\n          snapshotItemId: exercise.prescriptionItem.id,\n          setNumber: set.setNumber,\n          draft: { reps: set.reps, weightKg: set.weightKg, rpe: set.rpe, rir: set.rir, setType: set.setType, notes: set.notes }\n        })))\n    });\n  }, [sessionId, userId]);\n\n  useEffect(() => {\n    if (!sessionId || !userId || isStarting || !exerciseStates.length) return;\n    const timeout = window.setTimeout(() => { void persistSetDrafts(exerciseStates).catch(() => undefined); }, 250);\n    return () => window.clearTimeout(timeout);\n  }, [exerciseStates, isStarting, persistSetDrafts, sessionId, userId]);\n\n  useEffect(() => {\n    if (!setFeedback) return;\n    const timeout = window.setTimeout(\n      () => setSetFeedback(""),\n      transientFeedbackDuration(setFeedbackVariant === "error" ? "error" : "info")\n    );\n    return () => window.clearTimeout(timeout);\n  }, [setFeedback, setFeedbackVariant]);\n',
  'const persistSetDrafts = useCallback'
);

replaceSection(
  '  const minimizeWorkout = useCallback(async () => {\n',
  '  useRegisterActiveWorkoutMinimize(minimizeWorkout);\n',
  fragment('core-preserve-navigation.txt'),
  'const preserveWorkoutForNavigation = useCallback'
);
replaceSection(
  '  async function finishSet(exerciseIndex: number, setIndex: number) {\n',
  '  async function restartSet(exerciseIndex: number, setIndex: number) {\n',
  fragment('core-finish-set.txt'),
  'const projectedExecutionState = projectOptimisticSetCompletion'
);
replaceOnce(
  '  function executionCursorFor(exerciseIndex: number, setIndex: number) {\n    const item = executionCursorItems[exerciseIndex]\n      ?? executionCursorItems.find((candidate) => candidate.itemOrder === exerciseIndex + 1)\n      ?? null;\n    return { snapshotItemId: item?.id ?? null, itemOrder: item?.itemOrder ?? exerciseIndex + 1, setNumber: setIndex + 1 };\n  }\n',
  '  function executionCursorFor(exerciseIndex: number, setIndex: number) {\n    const item = executionCursorItems[exerciseIndex]\n      ?? executionCursorItems.find((candidate) => candidate.itemOrder === exerciseIndex + 1)\n      ?? null;\n    return { snapshotItemId: item?.id ?? null, itemOrder: item?.itemOrder ?? exerciseIndex + 1, setNumber: setIndex + 1 };\n  }\n\n' + fragment('core-navigate-session-set.txt'),
  'async function navigateToSessionSet'
);
replaceOnce(
  '  function finalizeVerifiedCompletion(summary: ActiveWorkoutSummary) {\n    if (userId) clearActiveWorkoutState(userId);\n',
  '  function finalizeVerifiedCompletion(summary: ActiveWorkoutSummary) {\n    if (userId) clearActiveWorkoutState(userId);\n    if (userId && sessionId) void clearActiveWorkoutSessionDrafts(userId, sessionId).catch(() => undefined);\n',
  'void clearActiveWorkoutSessionDrafts(userId, sessionId)'
);
replaceOnce(
  '      await store.cancelSession();\n      clearActiveWorkoutState(userId);\n',
  '      await store.cancelSession();\n      await clearActiveWorkoutSessionDrafts(userId, sessionId).catch(() => undefined);\n      clearActiveWorkoutState(userId);\n',
  'await clearActiveWorkoutSessionDrafts(userId, sessionId).catch(() => undefined);\n      clearActiveWorkoutState(userId);'
);

replaceOnce(
  '  const isPaused = executionState?.session_state === "paused";\n  const restActive = executionState?.view_state === "rest" && timerLeft > 0;\n  const reviewOpen = Boolean(\n    finishOpen || executionState?.session_state === "review" || executionState?.view_state === "session_review"\n  );\n',
  '  const isPaused = effectiveExecutionState?.session_state === "paused";\n  const restActive = effectiveExecutionState?.view_state === "rest" && timerLeft > 0;\n  const reviewOpen = Boolean(\n    finishOpen || effectiveExecutionState?.session_state === "review" || effectiveExecutionState?.view_state === "session_review"\n  );\n',
  'const isPaused = effectiveExecutionState?.session_state'
);
replaceOnce(
  '    || (!isPaused && !restActive && !isFinished && (\n      Boolean(activeSet.completedAt) || !activeSetValidation.complete || Boolean(activeRpeValidation.error) || Boolean(activeRirValidation.error)\n    ))\n',
  '    || (!isPaused && !restActive && !isFinished && Boolean(activeSet.completedAt))\n',
  '!isFinished && Boolean(activeSet.completedAt)'
);
replaceOnce(
  '  const previousPerformanceDate = activePreviousPerformance?.lastPerformedAt\n    ? formatters.date(activePreviousPerformance.lastPerformedAt)\n    : null;\n',
  '  const previousPerformanceDate = activePreviousPerformance?.lastPerformedAt\n    ? formatters.date(activePreviousPerformance.lastPerformedAt)\n    : null;\n' + fragment('core-derived-detail.txt'),
  'async function openCanonicalExerciseDetail()'
);

replaceOnce(
  '        targetValue={activeSet.plannedReps ? `${activeSet.plannedReps} ${tr("units.reps")}` : null}\n',
  '        targetValue={activeSet.plannedReps ? `${activeSet.plannedReps} ${tr("units.reps")}` : null}\n        progressionTargetLabel={tr("exercise.nextTarget")}\n        progressionTargetValue={progressionTargetValue}\n',
  'progressionTargetValue={progressionTargetValue}'
);
replaceOnce(
  '        nextContextLabel={nextSetLabel}\n',
  '        nextContextLabel={nextSetLabel}\n        nextLabel={tr("rest.next")}\n        nextExerciseName={nextExecutionExercise?.exercise.exercise_name ?? null}\n        nextSetLabel={nextExecutionSetLabel}\n        nextTargetValue={nextExecutionTarget}\n',
  'nextExerciseName={nextExecutionExercise?.exercise.exercise_name ?? null}'
);
replaceOnce(
  '        repsError={activeSet.reps.trim() && activeSetValidation.repsError ? activeSetValidation.repsError === "invalid" ? tr("validation.wholeReps") : tr("validation.requiredValues") : null}\n        weightError={activeSet.weightKg.trim() && activeSetValidation.weightError ? tr("validation.nonNegative") : null}\n        inputHint={!activeSet.reps.trim() || !activeSet.weightKg.trim() ? tr("validation.requiredValues") : null}\n',
  '        repsError={(showCurrentValidation || activeSet.reps.trim()) && activeSetValidation.repsError ? activeSetValidation.repsError === "invalid" ? tr("validation.wholeReps") : tr("validation.repsRequired") : null}\n        weightError={(showCurrentValidation || activeSet.weightKg.trim()) && activeSetValidation.weightError ? activeSetValidation.weightError === "required" ? tr("validation.weightRequired") : tr("validation.nonNegative") : null}\n        inputHint={null}\n',
  'tr("validation.repsRequired")'
);
replaceOnce(
  '        onSelectSet={(setNumber) => {\n          const setIndex = activeExercise.sets.findIndex((set) => set.setNumber === setNumber);\n          if (setIndex < 0) return;\n          void flushPendingSetWrites();\n          setActiveSetIndex(setIndex);\n        }}\n',
  '        onSelectSet={(setNumber) => {\n          const setIndex = activeExercise.sets.findIndex((set) => set.setNumber === setNumber);\n          if (setIndex < 0) return;\n          void navigateToSessionSet(activeExerciseIndex, setIndex);\n        }}\n',
  'void navigateToSessionSet(activeExerciseIndex, setIndex);'
);
replaceOnce(
  '        onOpenDetails={(trigger) => openDetails("overview", trigger)}\n',
  '        onOpenDetails={() => { void openCanonicalExerciseDetail(); }}\n        onOpenExerciseNavigator={() => {\n          setActionsOpen(false);\n          setReplacementPickerOpen(false);\n          setExerciseNavigatorOpen(true);\n        }}\n',
  'setExerciseNavigatorOpen(true);'
);
replaceOnce(
  '        detailsContent={(\n',
  '        exerciseNavigatorContent={(\n          <ActiveWorkoutExerciseNavigator\n            open={exerciseNavigatorOpen}\n            onOpenChange={setExerciseNavigatorOpen}\n            rows={navigatorRows}\n            readOnly={!tabLeader || controllerConflictDeviceId !== null}\n            paused={Boolean(isPaused)}\n            busy={isSaving}\n            onSelect={(exerciseIndex, setIndex) => { void navigateToSessionSet(exerciseIndex, setIndex); }}\n            tr={tr}\n            formatInteger={formatters.integer}\n          />\n        )}\n        detailsContent={(\n',
  '<ActiveWorkoutExerciseNavigator'
);

fs.writeFileSync(target, source);
console.log("Active Workout core authority v2 patches applied.");
