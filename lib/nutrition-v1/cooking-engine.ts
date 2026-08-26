export type CookingActionFact = {
  id: string;
  position: number;
  instruction: string;
  trackKey?: string | null;
  dependencyActionIds?: readonly string[];
  canRunInBackground?: boolean;
  conditionCue?: string | null;
};

export type CookingTimerSessionFact = {
  id: string;
  actionId: string;
  name: string;
  status: "idle" | "running" | "paused" | "completed" | "cancelled";
  completedAt?: string | null;
};

export type CookingSessionState = {
  completedActionIds?: readonly string[];
  deferredActionIds?: readonly string[];
  skippedActionIds?: readonly string[];
  runningBackgroundActionIds?: readonly string[];
  waitingForConditionActionIds?: readonly string[];
  timers?: readonly CookingTimerSessionFact[];
};

export type CookingTimerFinishedAttention = {
  kind: "timer_finished";
  timerId: string;
  actionId: string;
  timerName: string;
  completedAt: string | null;
};

export type CookingRunningItem =
  | {
      kind: "action";
      actionId: string;
      instruction: string;
    }
  | {
      kind: "timer";
      timerId: string;
      actionId: string;
      timerName: string;
      status: "running" | "paused";
    };

export type CookingTimeline = {
  attention: CookingTimerFinishedAttention[];
  now: CookingActionFact | null;
  running: CookingRunningItem[];
  upNext: CookingActionFact | null;
};

function orderedActions(actions: readonly CookingActionFact[]) {
  return [...actions].sort((left, right) => {
    const byPosition = left.position - right.position;
    return byPosition !== 0 ? byPosition : left.id.localeCompare(right.id);
  });
}

function hasOrchestrationMetadata(actions: readonly CookingActionFact[]) {
  return actions.some((item) =>
    Boolean(item.trackKey)
    || Boolean(item.canRunInBackground)
    || Boolean(item.dependencyActionIds?.length),
  );
}

function earlierTrackActionBlocks(
  action: CookingActionFact,
  actions: readonly CookingActionFact[],
  terminalIds: ReadonlySet<string>,
) {
  if (!action.trackKey) return false;
  return actions.some((candidate) =>
    candidate.trackKey === action.trackKey
    && candidate.position < action.position
    && !terminalIds.has(candidate.id),
  );
}

export function deriveCookingTimeline(
  recipeFacts: { actions: readonly CookingActionFact[] },
  sessionState: CookingSessionState,
): CookingTimeline {
  const actions = orderedActions(recipeFacts.actions);
  const actionById = new Map(actions.map((item) => [item.id, item]));
  const completedIds = new Set(sessionState.completedActionIds ?? []);
  const skippedIds = new Set(sessionState.skippedActionIds ?? []);
  const terminalIds = new Set([...completedIds, ...skippedIds]);
  const deferredIds = new Set(sessionState.deferredActionIds ?? []);
  const runningBackgroundIds = new Set(sessionState.runningBackgroundActionIds ?? []);

  const attention: CookingTimerFinishedAttention[] = (sessionState.timers ?? [])
    .filter((timer) => timer.status === "completed")
    .map((timer) => ({
      kind: "timer_finished" as const,
      timerId: timer.id,
      actionId: timer.actionId,
      timerName: timer.name,
      completedAt: timer.completedAt ?? null,
    }));

  const running: CookingRunningItem[] = [];
  for (const actionId of runningBackgroundIds) {
    const action = actionById.get(actionId);
    if (!action || terminalIds.has(actionId)) continue;
    running.push({ kind: "action", actionId, instruction: action.instruction });
  }
  for (const timer of sessionState.timers ?? []) {
    if (timer.status !== "running" && timer.status !== "paused") continue;
    running.push({
      kind: "timer",
      timerId: timer.id,
      actionId: timer.actionId,
      timerName: timer.name,
      status: timer.status,
    });
  }

  const orchestrated = hasOrchestrationMetadata(actions);

  const isAvailable = (action: CookingActionFact) => {
    if (terminalIds.has(action.id) || runningBackgroundIds.has(action.id)) return false;
    const dependencies = action.dependencyActionIds ?? [];
    if (dependencies.some((dependencyId) => !terminalIds.has(dependencyId))) return false;
    if (orchestrated && earlierTrackActionBlocks(action, actions, terminalIds)) return false;
    return true;
  };

  const available = actions.filter(isAvailable);
  const ordinaryAvailable = available.filter((item) => !deferredIds.has(item.id));
  const deferredAvailable = available.filter((item) => deferredIds.has(item.id));
  const candidates = ordinaryAvailable.length > 0 ? ordinaryAvailable : deferredAvailable;

  const now = candidates[0] ?? null;
  let upNext: CookingActionFact | null = null;

  if (now) {
    if (orchestrated) {
      upNext = candidates.find((item) => item.id !== now.id) ?? null;
    } else {
      const remaining = actions.filter((item) => item.id !== now.id && isAvailable(item));
      const ordinaryRemaining = remaining.filter((item) => !deferredIds.has(item.id));
      upNext = ordinaryRemaining[0] ?? remaining[0] ?? null;
    }
  }

  return { attention, now, running, upNext };
}
