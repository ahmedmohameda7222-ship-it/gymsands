import {
  reconstructCookingTimer,
  type CookingTimerSnapshot,
  type ReconstructedCookingTimer,
} from "@/lib/nutrition-v1/cooking-timers";

export type CookingLocalActionStateValue =
  | "not_available"
  | "ready"
  | "active"
  | "waiting_for_condition"
  | "running_background"
  | "completed"
  | "deferred"
  | "skipped";

export type CookingLocalActionState = {
  id: string;
  actionKey: string;
  state: CookingLocalActionStateValue;
  stateRevision: number;
  activatedAt?: string | null;
  completedAt?: string | null;
  deferredAt?: string | null;
  skippedAt?: string | null;
};

export type CookingLocalTimer = CookingTimerSnapshot & {
  actionStateId: string;
  cancelledAt?: string | null;
};

export type CookingOfflineMutation = {
  operationId: string;
  type: "action_state" | "timer" | "end_session" | "complete_session" | "start_over";
  payload: Record<string, unknown>;
  createdAt: string;
};

export type CookingLocalSession = {
  schemaVersion: 1;
  sessionId: string;
  recipeId: string;
  recipeVersionId: string;
  frozenRecipeSnapshot: {
    schemaVersion: 1;
    recipe: Record<string, unknown>;
    ingredients: Record<string, unknown>[];
    actions: Record<string, unknown>[];
    equipment: Record<string, unknown>[];
  };
  servingScale: number;
  status: "active" | "completed" | "ended";
  stateRevision: number;
  currentActionKey: string | null;
  actionStates: CookingLocalActionState[];
  timers: CookingLocalTimer[];
  pendingMutations: CookingOfflineMutation[];
  startedAt: string;
  lastActiveAt: string;
  completedAt: string | null;
  endedAt: string | null;
};

export type RecoveredCookingLocalSession = {
  session: CookingLocalSession;
  timers: Array<ReconstructedCookingTimer & { actionStateId: string; cancelledAt?: string | null }>;
};

export function cookingLocalStorageKey(ownerId: string, recipeId: string) {
  return `plaivra:nutrition:cooking:${ownerId}:${recipeId}:active`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isIsoLike(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isActionState(value: unknown): value is CookingLocalActionState {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || typeof value.actionKey !== "string") return false;
  if (!Number.isInteger(value.stateRevision) || Number(value.stateRevision) < 0) return false;
  return value.state === "not_available"
    || value.state === "ready"
    || value.state === "active"
    || value.state === "waiting_for_condition"
    || value.state === "running_background"
    || value.state === "completed"
    || value.state === "deferred"
    || value.state === "skipped";
}

function isTimer(value: unknown): value is CookingLocalTimer {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== "string"
    || typeof value.actionId !== "string"
    || typeof value.actionStateId !== "string"
    || typeof value.name !== "string"
  ) return false;
  if (!Number.isFinite(value.durationSeconds) || Number(value.durationSeconds) <= 0) return false;
  return value.status === "idle"
    || value.status === "running"
    || value.status === "paused"
    || value.status === "completed"
    || value.status === "cancelled";
}

function isMutation(value: unknown): value is CookingOfflineMutation {
  if (!isRecord(value)) return false;
  if (typeof value.operationId !== "string" || !value.operationId) return false;
  if (!isRecord(value.payload) || !isIsoLike(value.createdAt)) return false;
  return value.type === "action_state"
    || value.type === "timer"
    || value.type === "end_session"
    || value.type === "complete_session"
    || value.type === "start_over";
}

function isFrozenSnapshot(value: unknown): value is CookingLocalSession["frozenRecipeSnapshot"] {
  return isRecord(value)
    && value.schemaVersion === 1
    && isRecord(value.recipe)
    && Array.isArray(value.ingredients)
    && value.ingredients.every(isRecord)
    && Array.isArray(value.actions)
    && value.actions.every(isRecord)
    && Array.isArray(value.equipment)
    && value.equipment.every(isRecord);
}

function isLocalSession(value: unknown): value is CookingLocalSession {
  if (!isRecord(value) || value.schemaVersion !== 1) return false;
  if (
    typeof value.sessionId !== "string"
    || typeof value.recipeId !== "string"
    || typeof value.recipeVersionId !== "string"
    || !isFrozenSnapshot(value.frozenRecipeSnapshot)
  ) return false;
  if (!Number.isFinite(value.servingScale) || Number(value.servingScale) <= 0) return false;
  if (value.status !== "active" && value.status !== "completed" && value.status !== "ended") return false;
  if (!Number.isInteger(value.stateRevision) || Number(value.stateRevision) < 0) return false;
  if (value.currentActionKey !== null && typeof value.currentActionKey !== "string") return false;
  if (!Array.isArray(value.actionStates) || !value.actionStates.every(isActionState)) return false;
  if (!Array.isArray(value.timers) || !value.timers.every(isTimer)) return false;
  if (!Array.isArray(value.pendingMutations) || !value.pendingMutations.every(isMutation)) return false;
  if (!isIsoLike(value.startedAt) || !isIsoLike(value.lastActiveAt)) return false;
  if (value.completedAt !== null && !isIsoLike(value.completedAt)) return false;
  if (value.endedAt !== null && !isIsoLike(value.endedAt)) return false;
  return true;
}

export function serializeCookingLocalSession(session: CookingLocalSession) {
  if (!isLocalSession(session)) throw new Error("Invalid local Cooking Session.");
  return JSON.stringify(session);
}

export function parseCookingLocalSession(raw: string | null | undefined): CookingLocalSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isLocalSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function recoverCookingLocalSession(
  raw: string | null | undefined,
  now: string | Date = new Date(),
): RecoveredCookingLocalSession | null {
  const session = parseCookingLocalSession(raw);
  if (!session) return null;
  try {
    const timers = session.timers.map((timer) => {
      const { actionStateId, cancelledAt, ...snapshot } = timer;
      return { ...reconstructCookingTimer(snapshot, now), actionStateId, cancelledAt };
    });
    return { session, timers };
  } catch {
    return null;
  }
}

export function upsertCookingLocalTimer(
  session: CookingLocalSession,
  timer: CookingLocalTimer,
): CookingLocalSession {
  const index = session.timers.findIndex((item) => item.id === timer.id);
  if (index < 0) return { ...session, timers: [...session.timers, timer] };
  const timers = [...session.timers];
  timers[index] = timer;
  return { ...session, timers };
}

export function queueCookingMutation(
  session: CookingLocalSession,
  mutation: CookingOfflineMutation,
): CookingLocalSession {
  let canonicalSession = session;
  if (mutation.type === "timer" && typeof mutation.payload.timerId === "string") {
    const timer = session.timers.find((item) => item.id === mutation.payload.timerId);
    if (timer) canonicalSession = upsertCookingLocalTimer(session, timer);
  }
  if (canonicalSession.pendingMutations.some((item) => item.operationId === mutation.operationId)) return canonicalSession;
  return { ...canonicalSession, pendingMutations: [...canonicalSession.pendingMutations, mutation] };
}

export function acknowledgeCookingMutations(
  session: CookingLocalSession,
  operationIds: readonly string[],
): CookingLocalSession {
  const acknowledged = new Set(operationIds);
  if (!acknowledged.size) return session;
  return { ...session, pendingMutations: session.pendingMutations.filter((item) => !acknowledged.has(item.operationId)) };
}

function actionIds(snapshot: CookingLocalSession["frozenRecipeSnapshot"]) {
  return snapshot.actions
    .map((action) => typeof action.id === "string" ? action.id : null)
    .filter((id): id is string => Boolean(id));
}

export function startOverLocalCookingSession(
  session: CookingLocalSession,
  newSessionId: string,
  now = new Date().toISOString(),
): CookingLocalSession {
  return {
    ...session,
    sessionId: newSessionId,
    status: "active",
    stateRevision: 0,
    currentActionKey: null,
    actionStates: actionIds(session.frozenRecipeSnapshot).map((actionKey) => ({
      id: crypto.randomUUID(),
      actionKey,
      state: "not_available" as const,
      stateRevision: 0,
    })),
    timers: [],
    pendingMutations: [],
    startedAt: now,
    lastActiveAt: now,
    completedAt: null,
    endedAt: null,
  };
}

export function endLocalCookingSession(
  session: CookingLocalSession,
  now = new Date().toISOString(),
  operationId = crypto.randomUUID(),
): CookingLocalSession {
  const ended: CookingLocalSession = {
    ...session,
    status: "ended",
    lastActiveAt: now,
    completedAt: null,
    endedAt: now,
  };
  return queueCookingMutation(ended, {
    operationId,
    type: "end_session",
    payload: { sessionId: session.sessionId, endedAt: now },
    createdAt: now,
  });
}

export function completeLocalCookingSession(
  session: CookingLocalSession,
  now = new Date().toISOString(),
  operationId = crypto.randomUUID(),
): CookingLocalSession {
  const completed: CookingLocalSession = {
    ...session,
    status: "completed",
    lastActiveAt: now,
    completedAt: now,
    endedAt: null,
  };
  return queueCookingMutation(completed, {
    operationId,
    type: "complete_session",
    payload: { sessionId: session.sessionId, completedAt: now },
    createdAt: now,
  });
}

function camelOrSnake(record: Record<string, unknown>, camel: string, snake: string) {
  return record[camel] ?? record[snake];
}

export function materializeCookingLocalSession(bundle: {
  session: Record<string, unknown>;
  actionStates: readonly Record<string, unknown>[];
  timers: readonly Record<string, unknown>[];
}): CookingLocalSession {
  const session = bundle.session;
  const snapshot = camelOrSnake(session, "frozenRecipeSnapshot", "frozen_recipe_snapshot");
  if (!isFrozenSnapshot(snapshot)) throw new Error("Cooking Session is missing its frozen Recipe snapshot.");
  const status = session.status;
  if (status !== "active" && status !== "completed" && status !== "ended") throw new Error("Invalid Cooking Session status.");

  const actionStates: CookingLocalActionState[] = bundle.actionStates.map((row) => ({
    id: String(row.id),
    actionKey: String(camelOrSnake(row, "actionKey", "action_key")),
    state: String(row.state) as CookingLocalActionStateValue,
    stateRevision: Number(camelOrSnake(row, "stateRevision", "state_revision") ?? 0),
    activatedAt: typeof camelOrSnake(row, "activatedAt", "activated_at") === "string" ? String(camelOrSnake(row, "activatedAt", "activated_at")) : null,
    completedAt: typeof camelOrSnake(row, "completedAt", "completed_at") === "string" ? String(camelOrSnake(row, "completedAt", "completed_at")) : null,
    deferredAt: typeof camelOrSnake(row, "deferredAt", "deferred_at") === "string" ? String(camelOrSnake(row, "deferredAt", "deferred_at")) : null,
    skippedAt: typeof camelOrSnake(row, "skippedAt", "skipped_at") === "string" ? String(camelOrSnake(row, "skippedAt", "skipped_at")) : null,
  }));

  const timers: CookingLocalTimer[] = bundle.timers.map((row) => ({
    id: String(row.id),
    actionId: String(camelOrSnake(row, "actionId", "action_id") ?? ""),
    actionStateId: String(camelOrSnake(row, "actionStateId", "action_state_id")),
    name: String(camelOrSnake(row, "timerName", "timer_name")),
    durationSeconds: Number(camelOrSnake(row, "durationSeconds", "duration_seconds")),
    status: String(row.status) as CookingLocalTimer["status"],
    startedAt: typeof camelOrSnake(row, "startedAt", "started_at") === "string" ? String(camelOrSnake(row, "startedAt", "started_at")) : null,
    targetAt: typeof camelOrSnake(row, "targetAt", "target_at") === "string" ? String(camelOrSnake(row, "targetAt", "target_at")) : null,
    pausedAt: typeof camelOrSnake(row, "pausedAt", "paused_at") === "string" ? String(camelOrSnake(row, "pausedAt", "paused_at")) : null,
    pausedRemainingSeconds: camelOrSnake(row, "pausedRemainingSeconds", "paused_remaining_seconds") === null || camelOrSnake(row, "pausedRemainingSeconds", "paused_remaining_seconds") === undefined
      ? null
      : Number(camelOrSnake(row, "pausedRemainingSeconds", "paused_remaining_seconds")),
    completedAt: typeof camelOrSnake(row, "completedAt", "completed_at") === "string" ? String(camelOrSnake(row, "completedAt", "completed_at")) : null,
    cancelledAt: typeof camelOrSnake(row, "cancelledAt", "cancelled_at") === "string" ? String(camelOrSnake(row, "cancelledAt", "cancelled_at")) : null,
  }));

  const local: CookingLocalSession = {
    schemaVersion: 1,
    sessionId: String(session.id ?? session.sessionId),
    recipeId: String(camelOrSnake(session, "recipeId", "recipe_id")),
    recipeVersionId: String(camelOrSnake(session, "recipeVersionId", "recipe_version_id")),
    frozenRecipeSnapshot: snapshot,
    servingScale: Number(camelOrSnake(session, "servingScale", "serving_scale") ?? 1),
    status,
    stateRevision: Number(camelOrSnake(session, "stateRevision", "state_revision") ?? 0),
    currentActionKey: typeof camelOrSnake(session, "currentActionKey", "current_action_key") === "string"
      ? String(camelOrSnake(session, "currentActionKey", "current_action_key"))
      : null,
    actionStates,
    timers,
    pendingMutations: [],
    startedAt: String(camelOrSnake(session, "startedAt", "started_at")),
    lastActiveAt: String(camelOrSnake(session, "lastActiveAt", "last_active_at")),
    completedAt: typeof camelOrSnake(session, "completedAt", "completed_at") === "string" ? String(camelOrSnake(session, "completedAt", "completed_at")) : null,
    endedAt: typeof camelOrSnake(session, "endedAt", "ended_at") === "string" ? String(camelOrSnake(session, "endedAt", "ended_at")) : null,
  };
  if (!isLocalSession(local)) throw new Error("Server Cooking Session could not be materialized locally.");
  return local;
}
