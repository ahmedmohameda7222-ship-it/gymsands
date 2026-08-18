from pathlib import Path

CORE_PATH = Path("components/workouts/active-workout/active-workout-core-session-implementation.tsx")
TEST_PATH = Path("lib/product/active-workout-pr144-correction-authority.test.ts")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one anchor, found {count}")
    return text.replace(old, new, 1)


core = CORE_PATH.read_text()

core = replace_once(
    core,
    "  const effectiveExecutionState = optimisticCompletion?.projectedExecutionState ?? executionState;\n",
    "  const effectiveExecutionState = optimisticCompletion?.projectedExecutionState ?? executionState;\n"
    "  const reliabilityPresentation = resolveActiveWorkoutReliabilityPresentation({\n"
    "    syncState,\n"
    "    tabLeader,\n"
    "    controllerConflictDeviceId\n"
    "  });\n"
    "  const executionBlocked = reliabilityPresentation.blockingState === \"data_conflict\";\n"
    "  const isExecutionMutationBlocked = useCallback(() => {\n"
    "    const latest = activeSessionStoreRef.current?.getSnapshot();\n"
    "    return executionBlocked\n"
    "      || latest?.syncState === \"data_conflict\"\n"
    "      || Boolean(latest?.dataConflict);\n"
    "  }, [executionBlocked]);\n",
    "derive canonical data-conflict execution gate",
)

core = replace_once(
    core,
    "        if (userId && sessionId && executionHydratedRef.current) {\n          void dispatchExecutionBackground(\"clear_rest\", {",
    "        if (userId && sessionId && executionHydratedRef.current && !isExecutionMutationBlocked()) {\n          void dispatchExecutionBackground(\"clear_rest\", {",
    "block natural rest-expiry mutation",
)
core = replace_once(
    core,
    "  }, [dispatchExecutionBackground, effectiveExecutionState, optimisticCompletion, restTimerKey, sessionId, startedAtMs, toastRef, trRef, userId]);",
    "  }, [dispatchExecutionBackground, effectiveExecutionState, isExecutionMutationBlocked, optimisticCompletion, restTimerKey, sessionId, startedAtMs, toastRef, trRef, userId]);",
    "rest expiry dependencies",
)

core = replace_once(
    core,
    "    if (!executionHydratedRef.current || !userId || !sessionId || !executionState || optimisticCompletion) return;",
    "    if (!executionHydratedRef.current || !userId || !sessionId || !executionState || optimisticCompletion || isExecutionMutationBlocked()) return;",
    "block automatic cursor mutation",
)
core = replace_once(
    core,
    "  }, [activeExerciseIndex, activeSetIndex, dispatchExecutionBackground, executionCursorItems, executionState, optimisticCompletion, sessionId, userId]);",
    "  }, [activeExerciseIndex, activeSetIndex, dispatchExecutionBackground, executionCursorItems, executionState, isExecutionMutationBlocked, optimisticCompletion, sessionId, userId]);",
    "cursor effect dependencies",
)

core = replace_once(
    core,
    "  function updateSet(exerciseIndex: number, setIndex: number, patch: Partial<ActiveWorkoutSetState>) {\n    setExerciseStates((current) => {",
    "  function updateSet(exerciseIndex: number, setIndex: number, patch: Partial<ActiveWorkoutSetState>) {\n    if (isExecutionMutationBlocked()) return;\n    setExerciseStates((current) => {",
    "block set draft mutations",
)
core = replace_once(
    core,
    "  async function persistProgress(states = exerciseStates) {\n    if (!sessionId) return;",
    "  async function persistProgress(states = exerciseStates) {\n    if (!sessionId || isExecutionMutationBlocked()) return;",
    "block explicit set persistence",
)
core = replace_once(
    core,
    "      persistSnapshot: async (states) => {\n        if (!sessionId) return;",
    "      persistSnapshot: async (states) => {\n        if (!sessionId || isExecutionMutationBlocked()) return;",
    "block autosave persistence",
)
core = replace_once(
    core,
    "    };\n  }, [sessionId]);\n\n  useEffect(() => mountWorkoutSetAutosaveCoordinator(",
    "    };\n  }, [isExecutionMutationBlocked, sessionId]);\n\n  useEffect(() => mountWorkoutSetAutosaveCoordinator(",
    "autosave adapter dependencies",
)
core = replace_once(
    core,
    "  const persistSetDrafts = useCallback(async (states = exerciseStatesRef.current) => {\n    if (!userId || !sessionId || !states.length) return;",
    "  const persistSetDrafts = useCallback(async (states = exerciseStatesRef.current) => {\n    if (!userId || !sessionId || !states.length || isExecutionMutationBlocked()) return;",
    "block local set-draft writes",
)
core = replace_once(
    core,
    "  }, [sessionId, userId]);\n\n  const preserveWorkoutForNavigation = useCallback(async () => {",
    "  }, [isExecutionMutationBlocked, sessionId, userId]);\n\n  const preserveWorkoutForNavigation = useCallback(async () => {",
    "set-draft callback dependencies",
)
core = replace_once(
    core,
    "    try {\n      const pendingSet = pendingSetCompletionPromiseRef.current;",
    "    try {\n      if (isExecutionMutationBlocked()) return true;\n      const pendingSet = pendingSetCompletionPromiseRef.current;",
    "keep navigation non-mutating during conflict",
)
core = replace_once(
    core,
    "  }, [flushPendingSetWrites, mirrorExecutionState, persistSetDrafts, toastRef, trRef]);",
    "  }, [flushPendingSetWrites, isExecutionMutationBlocked, mirrorExecutionState, persistSetDrafts, toastRef, trRef]);",
    "navigation preservation dependencies",
)
core = replace_once(
    core,
    "  function handleSetDetailsOpenChange(open: boolean) {\n    setActionsOpen(open);\n    if (!open) void flushPendingSetWrites();\n  }",
    "  function handleSetDetailsOpenChange(open: boolean) {\n    setActionsOpen(open);\n    if (!open && !isExecutionMutationBlocked()) void flushPendingSetWrites();\n  }",
    "block details-close flush",
)
core = replace_once(
    core,
    "  useEffect(() => {\n    if (!sessionId || !userId || isStarting || !exerciseStates.length) return;\n    const timeout = window.setTimeout(() => { void persistSetDrafts(exerciseStates).catch(() => undefined); }, 250);",
    "  useEffect(() => {\n    if (!sessionId || !userId || isStarting || !exerciseStates.length || isExecutionMutationBlocked()) return;\n    const timeout = window.setTimeout(() => { void persistSetDrafts(exerciseStates).catch(() => undefined); }, 250);",
    "block draft persistence effect",
)
core = replace_once(
    core,
    "  }, [exerciseStates, isStarting, persistSetDrafts, sessionId, userId]);",
    "  }, [exerciseStates, isExecutionMutationBlocked, isStarting, persistSetDrafts, sessionId, userId]);",
    "draft persistence dependencies",
)
core = replace_once(
    core,
    "  useEffect(() => {\n    if (!sessionId || isStarting || !hasPendingValidSetWrites(exerciseStates)) return;\n    autosaveCoordinatorRef.current?.scheduleFlush(650);",
    "  useEffect(() => {\n    if (!sessionId || isStarting || isExecutionMutationBlocked() || !hasPendingValidSetWrites(exerciseStates)) return;\n    autosaveCoordinatorRef.current?.scheduleFlush(650);",
    "block autosave scheduling",
)
core = replace_once(
    core,
    "  }, [exerciseStates, isStarting, sessionId]);",
    "  }, [exerciseStates, isExecutionMutationBlocked, isStarting, sessionId]);",
    "autosave schedule dependencies",
)

core = replace_once(
    core,
    "  function startRestTimer(seconds: number) {\n    const safeSeconds = Math.max(0, seconds);",
    "  function startRestTimer(seconds: number) {\n    if (isExecutionMutationBlocked()) return;\n    const safeSeconds = Math.max(0, seconds);",
    "block rest start",
)
core = replace_once(
    core,
    "      queueAfterPendingSetCompletion(() => {\n        void dispatchExecutionBackground(\n          \"start_rest\",",
    "      queueAfterPendingSetCompletion(() => {\n        if (isExecutionMutationBlocked()) return;\n        void dispatchExecutionBackground(\n          \"start_rest\",",
    "recheck queued rest start",
)
core = replace_once(
    core,
    "  function stopRestTimer() {\n    const previous = { timerSeconds, timerLeft, timerEndsAtMs, isTimerRunning };",
    "  function stopRestTimer() {\n    if (isExecutionMutationBlocked()) return;\n    const previous = { timerSeconds, timerLeft, timerEndsAtMs, isTimerRunning };",
    "block rest skip",
)
core = replace_once(
    core,
    "      queueAfterPendingSetCompletion(() => {\n        void dispatchExecutionBackground(\n          \"clear_rest\",",
    "      queueAfterPendingSetCompletion(() => {\n        if (isExecutionMutationBlocked()) return;\n        void dispatchExecutionBackground(\n          \"clear_rest\",",
    "recheck queued rest clear",
)

core = replace_once(
    core,
    "      !targetSet || targetSet.completedAt || pendingSetCommandKeyRef.current === setKey || isStarting || !sessionId || !userId\n      || !executionHydratedRef.current || effectiveExecutionState?.session_state === \"paused\"",
    "      !targetSet || targetSet.completedAt || pendingSetCommandKeyRef.current === setKey || isStarting || !sessionId || !userId\n      || isExecutionMutationBlocked() || !executionHydratedRef.current || effectiveExecutionState?.session_state === \"paused\"",
    "block complete-set mutation",
)
core = replace_once(
    core,
    "  async function restartSet(exerciseIndex: number, setIndex: number) {\n    if (isSaving) return false;",
    "  async function restartSet(exerciseIndex: number, setIndex: number) {\n    if (isSaving || isExecutionMutationBlocked()) return false;",
    "block reopen set mutation",
)
core = replace_once(
    core,
    "      isSaving || isStarting || !sessionId || !userId || !executionHydratedRef.current\n      || effectiveExecutionState?.session_state === \"paused\" || !tabLeader || controllerConflictDeviceId",
    "      isSaving || isStarting || !sessionId || !userId || !executionHydratedRef.current\n      || isExecutionMutationBlocked() || effectiveExecutionState?.session_state === \"paused\" || !tabLeader || controllerConflictDeviceId",
    "block navigator cursor mutation",
)
core = replace_once(
    core,
    "  async function openSessionReview() {\n    if (isStarting || isSaving || !sessionId || !userId || !executionHydratedRef.current || !executionCapability.supported) return;",
    "  async function openSessionReview() {\n    if (isStarting || isSaving || isExecutionMutationBlocked() || !sessionId || !userId || !executionHydratedRef.current || !executionCapability.supported) return;",
    "block review cursor mutation",
)
core = replace_once(
    core,
    "  async function leaveReviewAtSet(exerciseIndex: number, setIndex: number, reopen: boolean) {\n    if (isSaving || !userId || !sessionId || !executionHydratedRef.current) return;",
    "  async function leaveReviewAtSet(exerciseIndex: number, setIndex: number, reopen: boolean) {\n    if (isSaving || isExecutionMutationBlocked() || !userId || !sessionId || !executionHydratedRef.current) return;",
    "block review-to-set mutation",
)
core = replace_once(
    core,
    "  async function restoreReviewAfterCompletionFailure() {\n    const store = activeSessionStoreRef.current;",
    "  async function restoreReviewAfterCompletionFailure() {\n    if (isExecutionMutationBlocked()) throw new Error(\"Workout execution is blocked by an unresolved data conflict.\");\n    const store = activeSessionStoreRef.current;",
    "block completion recovery mutation",
)
core = replace_once(
    core,
    "  async function completeSession() {\n    if (!sessionId || isSaving || isStarting || !executionHydratedRef.current || !executionCapability.supported) return;",
    "  async function completeSession() {\n    if (!sessionId || isSaving || isStarting || isExecutionMutationBlocked() || !executionHydratedRef.current || !executionCapability.supported) return;",
    "block terminal completion mutation",
)
core = replace_once(
    core,
    "  async function cancelCurrentSession() {\n    const store = activeSessionStoreRef.current;\n    if (!userId || !sessionId || !store || isSaving || isStarting) return;",
    "  async function cancelCurrentSession() {\n    const store = activeSessionStoreRef.current;\n    if (!userId || !sessionId || !store || isSaving || isStarting || isExecutionMutationBlocked()) return;",
    "block session cancellation",
)
core = replace_once(
    core,
    "  async function takeOverWorkout() {\n    const store = activeSessionStoreRef.current;",
    "  async function takeOverWorkout() {\n    if (isExecutionMutationBlocked()) return;\n    const store = activeSessionStoreRef.current;",
    "block device takeover under higher-priority data conflict",
)
core = replace_once(
    core,
    "  async function togglePause() {\n    if (!executionState || isSaving || isStarting) return;",
    "  async function togglePause() {\n    if (!executionState || isSaving || isStarting || isExecutionMutationBlocked()) return;",
    "block pause/resume mutation",
)
core = replace_once(
    core,
    "  function resetWorkoutTimer() {\n    const previousStartedAt = startedAtMs;",
    "  function resetWorkoutTimer() {\n    if (isExecutionMutationBlocked()) return;\n    const previousStartedAt = startedAtMs;",
    "block timer mutation",
)
core = replace_once(
    core,
    "  async function skipCurrentExercise() {\n    if (sourceKind !== \"plan-day\" || isSaving || isStarting || !activeExercise) return;",
    "  async function skipCurrentExercise() {\n    if (sourceKind !== \"plan-day\" || isSaving || isStarting || isExecutionMutationBlocked() || !activeExercise) return;",
    "block skip-today mutation",
)
core = replace_once(
    core,
    "  async function applyStableReplacement(replacement: Workout): Promise<boolean> {\n    if (sourceKind !== \"plan-day\" || !userId || !sessionId || !activeExercise) return false;",
    "  async function applyStableReplacement(replacement: Workout): Promise<boolean> {\n    if (sourceKind !== \"plan-day\" || !userId || !sessionId || !activeExercise || isExecutionMutationBlocked()) return false;",
    "block replace-today mutation",
)
core = replace_once(
    core,
    "  function applyPreviousSet(exerciseIndex: number, setIndex: number) {\n    const item = exerciseStates[exerciseIndex];",
    "  function applyPreviousSet(exerciseIndex: number, setIndex: number) {\n    if (isExecutionMutationBlocked()) return;\n    const item = exerciseStates[exerciseIndex];",
    "block previous-set mutation",
)

core = replace_once(
    core,
    "  const primaryActionDisabled = Boolean(\n    completedSummary || (isSaving && !optimisticRestInteraction) || isStarting || !tabLeader || controllerConflictDeviceId !== null || !sessionId",
    "  const primaryActionDisabled = Boolean(\n    executionBlocked || completedSummary || (isSaving && !optimisticRestInteraction) || isStarting || !tabLeader || controllerConflictDeviceId !== null || !sessionId",
    "disable primary action during data conflict",
)
core = replace_once(
    core,
    "  const restControlsDisabled = Boolean(\n    isStarting || !tabLeader || controllerConflictDeviceId !== null || !sessionId || (isSaving && !optimisticCompletion)",
    "  const restControlsDisabled = Boolean(\n    executionBlocked || isStarting || !tabLeader || controllerConflictDeviceId !== null || !sessionId || (isSaving && !optimisticCompletion)",
    "disable rest controls during data conflict",
)
core = replace_once(
    core,
    "  const handlePrimaryAction = () => {\n    if (isPaused) void togglePause();",
    "  const handlePrimaryAction = () => {\n    if (isExecutionMutationBlocked()) return;\n    if (isPaused) void togglePause();",
    "guard primary action handler",
)
core = replace_once(
    core,
    "  const busy = isSaving || isStarting || controllerConflictDeviceId !== null || !tabLeader;\n  const reliabilityPresentation = resolveActiveWorkoutReliabilityPresentation({\n    syncState,\n    tabLeader,\n    controllerConflictDeviceId\n  });",
    "  const busy = executionBlocked || isSaving || isStarting || controllerConflictDeviceId !== null || !tabLeader;",
    "make data conflict part of shared execution busy authority",
)
core = replace_once(
    core,
    "            readOnly={!tabLeader || controllerConflictDeviceId !== null}",
    "            readOnly={executionBlocked || !tabLeader || controllerConflictDeviceId !== null}",
    "make navigator read-only during data conflict",
)

CORE_PATH.write_text(core)

test = TEST_PATH.read_text()
new_test = '''\n\n  it("fails closed for every execution mutation while canonical data conflict is unresolved", () => {\n    expect(core).toContain('const executionBlocked = reliabilityPresentation.blockingState === "data_conflict";');\n    expect(core).toContain('latest?.syncState === "data_conflict"');\n    expect(core).toContain('Boolean(latest?.dataConflict)');\n    expect(core).toContain('const busy = executionBlocked || isSaving || isStarting || controllerConflictDeviceId !== null || !tabLeader;');\n    expect(core).toContain('executionBlocked || completedSummary');\n    expect(core).toContain('executionBlocked || isStarting || !tabLeader');\n    expect(core).toContain('readOnly={executionBlocked || !tabLeader || controllerConflictDeviceId !== null}');\n    expect(core).toContain('function updateSet(exerciseIndex: number, setIndex: number, patch: Partial<ActiveWorkoutSetState>) {\\n    if (isExecutionMutationBlocked()) return;');\n    expect(core).toContain('async function restartSet(exerciseIndex: number, setIndex: number) {\\n    if (isSaving || isExecutionMutationBlocked()) return false;');\n    expect(core).toContain('async function completeSession() {\\n    if (!sessionId || isSaving || isStarting || isExecutionMutationBlocked()');\n    expect(core).toContain('async function skipCurrentExercise() {\\n    if (sourceKind !== "plan-day" || isSaving || isStarting || isExecutionMutationBlocked()');\n    expect(core).toContain('async function applyStableReplacement(replacement: Workout): Promise<boolean> {\\n    if (sourceKind !== "plan-day" || !userId || !sessionId || !activeExercise || isExecutionMutationBlocked()) return false;');\n    expect(core).toContain('resolveDataConflict("server")');\n    expect(core).toContain('resolveDataConflict("local")');\n    expect(shell).toContain('disabled={busy || completed}');\n    expect(shell).toContain('disabled={busy || item.state === "active"}');\n    expect(details).toContain('disabled={busy}');\n  });\n'''
anchor = "\n});\n"
if test.count(anchor) != 1:
    raise SystemExit(f"test insertion anchor: expected 1, found {test.count(anchor)}")
test = test.replace(anchor, new_test + anchor, 1)
TEST_PATH.write_text(test)

print("PR144 data-conflict blocker correction materialized")
