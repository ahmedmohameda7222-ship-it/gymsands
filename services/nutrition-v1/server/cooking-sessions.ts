import type { SupabaseClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;

export type CookingActionStateValue =
  | "not_available"
  | "ready"
  | "active"
  | "waiting_for_condition"
  | "running_background"
  | "completed"
  | "deferred"
  | "skipped";

export type FrozenCookingRecipeSnapshot = {
  schemaVersion: 1;
  recipe: JsonRecord;
  ingredients: JsonRecord[];
  actions: JsonRecord[];
  equipment: JsonRecord[];
};

export type CookingSessionRow = {
  id: string;
  user_id: string;
  recipe_id: string;
  recipe_version_id: string;
  frozen_recipe_snapshot: FrozenCookingRecipeSnapshot;
  serving_scale: number;
  current_action_key: string | null;
  status: "active" | "completed" | "ended";
  started_at: string;
  last_active_at: string;
  completed_at?: string | null;
  ended_at?: string | null;
  state_revision: number;
};

export type CookingActionStateRecord = {
  id: string;
  actionKey: string;
  state: CookingActionStateValue;
  stateRevision: number;
  activatedAt: string | null;
  completedAt: string | null;
  deferredAt: string | null;
  skippedAt: string | null;
};

export type CookingTimerRecord = {
  id: string;
  actionStateId: string;
  timerName: string;
  durationSeconds: number;
  status: "idle" | "running" | "paused" | "completed" | "cancelled";
  startedAt: string | null;
  targetAt: string | null;
  pausedAt: string | null;
  pausedRemainingSeconds: number | null;
  completedAt: string | null;
  cancelledAt: string | null;
};

export type CookingSessionBundle = {
  session: CookingSessionRow;
  actionStates: CookingActionStateRecord[];
  timers: CookingTimerRecord[];
};

export type SyncCookingActionState = {
  id: string;
  actionKey: string;
  state: CookingActionStateValue;
  stateRevision: number;
  activatedAt?: string | null;
  completedAt?: string | null;
  deferredAt?: string | null;
  skippedAt?: string | null;
};

export type SyncCookingTimer = {
  id: string;
  actionStateId: string;
  timerName: string;
  durationSeconds: number;
  status: CookingTimerRecord["status"];
  startedAt?: string | null;
  targetAt?: string | null;
  pausedAt?: string | null;
  pausedRemainingSeconds?: number | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
};

function dbError(error: unknown) {
  if (!error) return;
  const message = error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message)
    : "Cooking Session request failed.";
  throw new Error(message);
}

function requiredData<T>(data: T | null, error: unknown, fallback: string): T {
  dbError(error);
  if (data === null) throw new Error(fallback);
  return data;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asFiniteNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function actionIdsFromSnapshot(snapshot: FrozenCookingRecipeSnapshot) {
  return snapshot.actions
    .map((action) => typeof action.id === "string" ? action.id : null)
    .filter((id): id is string => Boolean(id));
}

function dependencyIds(action: JsonRecord) {
  const value = action.dependency_action_ids ?? action.dependencyActionIds;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function initialActionStateRows(
  snapshot: FrozenCookingRecipeSnapshot,
  sessionId: string,
  userId: string,
) {
  return snapshot.actions.flatMap((action) => {
    if (typeof action.id !== "string") return [];
    return [{
      session_id: sessionId,
      user_id: userId,
      action_key: action.id,
      state: dependencyIds(action).length === 0 ? "ready" : "not_available",
      state_revision: 0,
    }];
  });
}

function normalizeSession(row: Record<string, unknown>): CookingSessionRow {
  const status = row.status;
  if (status !== "active" && status !== "completed" && status !== "ended") {
    throw new Error("Invalid Cooking Session status.");
  }
  const snapshot = asRecord(row.frozen_recipe_snapshot);
  if (snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.actions)) {
    throw new Error("Invalid frozen Cooking Recipe snapshot.");
  }
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    recipe_id: String(row.recipe_id),
    recipe_version_id: String(row.recipe_version_id),
    frozen_recipe_snapshot: snapshot as unknown as FrozenCookingRecipeSnapshot,
    serving_scale: asFiniteNumber(row.serving_scale, 1),
    current_action_key: typeof row.current_action_key === "string" ? row.current_action_key : null,
    status,
    started_at: String(row.started_at ?? ""),
    last_active_at: String(row.last_active_at ?? ""),
    completed_at: typeof row.completed_at === "string" ? row.completed_at : null,
    ended_at: typeof row.ended_at === "string" ? row.ended_at : null,
    state_revision: asFiniteNumber(row.state_revision, 0),
  };
}

function normalizeActionState(row: Record<string, unknown>): CookingActionStateRecord {
  const state = row.state;
  if (
    state !== "not_available"
    && state !== "ready"
    && state !== "active"
    && state !== "waiting_for_condition"
    && state !== "running_background"
    && state !== "completed"
    && state !== "deferred"
    && state !== "skipped"
  ) throw new Error("Invalid Cooking action state.");
  return {
    id: String(row.id),
    actionKey: String(row.action_key),
    state,
    stateRevision: asFiniteNumber(row.state_revision, 0),
    activatedAt: typeof row.activated_at === "string" ? row.activated_at : null,
    completedAt: typeof row.completed_at === "string" ? row.completed_at : null,
    deferredAt: typeof row.deferred_at === "string" ? row.deferred_at : null,
    skippedAt: typeof row.skipped_at === "string" ? row.skipped_at : null,
  };
}

function normalizeTimer(row: Record<string, unknown>): CookingTimerRecord {
  const status = row.status;
  if (status !== "idle" && status !== "running" && status !== "paused" && status !== "completed" && status !== "cancelled") {
    throw new Error("Invalid Cooking timer status.");
  }
  return {
    id: String(row.id),
    actionStateId: String(row.action_state_id),
    timerName: String(row.timer_name),
    durationSeconds: asFiniteNumber(row.duration_seconds),
    status,
    startedAt: typeof row.started_at === "string" ? row.started_at : null,
    targetAt: typeof row.target_at === "string" ? row.target_at : null,
    pausedAt: typeof row.paused_at === "string" ? row.paused_at : null,
    pausedRemainingSeconds: row.paused_remaining_seconds === null || row.paused_remaining_seconds === undefined
      ? null
      : asFiniteNumber(row.paused_remaining_seconds),
    completedAt: typeof row.completed_at === "string" ? row.completed_at : null,
    cancelledAt: typeof row.cancelled_at === "string" ? row.cancelled_at : null,
  };
}

async function readPublishedRecipeGraph(
  supabase: SupabaseClient,
  userId: string,
  recipeId: string,
  recipeVersionId?: string,
): Promise<FrozenCookingRecipeSnapshot> {
  let versionQuery = supabase
    .from("nutrition_recipe_versions")
    .select("*")
    .eq("user_id", userId)
    .eq("recipe_id", recipeId);
  if (recipeVersionId) {
    versionQuery = versionQuery.eq("id", recipeVersionId);
  } else {
    versionQuery = versionQuery.order("version_number", { ascending: false }).limit(1);
  }
  const versionResult = await versionQuery.maybeSingle();
  const version = requiredData(versionResult.data as Record<string, unknown> | null, versionResult.error, "Published Recipe version not found.");
  const resolvedVersionId = String(version.id);

  const [ingredientsResult, actionsResult, equipmentResult] = await Promise.all([
    supabase.from("nutrition_recipe_ingredients").select("*").eq("user_id", userId).eq("recipe_version_id", resolvedVersionId).order("position", { ascending: true }),
    supabase.from("nutrition_recipe_actions").select("*").eq("user_id", userId).eq("recipe_version_id", resolvedVersionId).order("position", { ascending: true }),
    supabase.from("nutrition_recipe_equipment").select("*").eq("user_id", userId).eq("recipe_version_id", resolvedVersionId).order("position", { ascending: true }),
  ]);
  dbError(ingredientsResult.error);
  dbError(actionsResult.error);
  dbError(equipmentResult.error);

  return {
    schemaVersion: 1,
    recipe: version,
    ingredients: (ingredientsResult.data ?? []) as JsonRecord[],
    actions: (actionsResult.data ?? []) as JsonRecord[],
    equipment: (equipmentResult.data ?? []) as JsonRecord[],
  };
}

export async function startCookingSession(
  supabase: SupabaseClient,
  userId: string,
  input: {
    recipeId: string;
    recipeVersionId?: string;
    servingScale?: number;
    now?: string;
  },
) {
  const servingScale = input.servingScale ?? 1;
  if (!Number.isFinite(servingScale) || servingScale <= 0) throw new Error("Cooking servingScale must be greater than 0.");
  const now = input.now ?? new Date().toISOString();
  const snapshot = await readPublishedRecipeGraph(supabase, userId, input.recipeId, input.recipeVersionId);
  const resolvedVersionId = String(snapshot.recipe.id);
  const currentActionKey = actionIdsFromSnapshot(snapshot)[0] ?? null;

  const sessionResult = await supabase.from("nutrition_cooking_sessions").insert({
    user_id: userId,
    recipe_id: input.recipeId,
    recipe_version_id: resolvedVersionId,
    frozen_recipe_snapshot: snapshot,
    serving_scale: servingScale,
    current_action_key: currentActionKey,
    status: "active",
    started_at: now,
    last_active_at: now,
    completed_at: null,
    ended_at: null,
    state_revision: 0,
  }).select("*").single();
  const session = requiredData(sessionResult.data as Record<string, unknown> | null, sessionResult.error, "Cooking Session could not be started.");
  const sessionId = String(session.id);

  const rows = initialActionStateRows(snapshot, sessionId, userId);
  if (rows.length) {
    const statesResult = await supabase.from("nutrition_cooking_action_states").insert(rows);
    try {
      dbError(statesResult.error);
    } catch (error) {
      await supabase.from("nutrition_cooking_sessions").delete().eq("id", sessionId).eq("user_id", userId);
      throw error;
    }
  }

  return { sessionId, session: normalizeSession(session), snapshot };
}

export async function getActiveCookingSession(
  supabase: SupabaseClient,
  userId: string,
  recipeId?: string,
): Promise<CookingSessionBundle | null> {
  let query = supabase
    .from("nutrition_cooking_sessions")
    .select("*")
    .eq("user_id", userId);
  if (recipeId) query = query.eq("recipe_id", recipeId);
  query = query.eq("status", "active").order("last_active_at", { ascending: false }).limit(1);
  const sessionResult = await query.maybeSingle();
  dbError(sessionResult.error);
  if (!sessionResult.data) return null;
  const session = normalizeSession(sessionResult.data as Record<string, unknown>);

  const statesResult = await supabase
    .from("nutrition_cooking_action_states")
    .select("*")
    .eq("session_id", session.id)
    .eq("user_id", userId)
    .order("action_key", { ascending: true });
  dbError(statesResult.error);
  const rawStates = (statesResult.data ?? []) as Record<string, unknown>[];
  const actionStates = rawStates.map(normalizeActionState);
  const stateIds = actionStates.map((item) => item.id);

  let timers: CookingTimerRecord[] = [];
  if (stateIds.length) {
    const timersResult = await supabase
      .from("nutrition_cooking_timers")
      .select("*")
      .eq("user_id", userId)
      .in("action_state_id", stateIds)
      .order("created_at", { ascending: true });
    dbError(timersResult.error);
    timers = ((timersResult.data ?? []) as Record<string, unknown>[]).map(normalizeTimer);
  }

  return { session, actionStates, timers };
}

export async function syncCookingSessionState(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  input: {
    expectedRevision: number;
    currentActionKey: string | null;
    lastActiveAt?: string;
    actionStates: readonly SyncCookingActionState[];
    timers: readonly SyncCookingTimer[];
  },
) {
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) throw new Error("Invalid Cooking Session revision.");
  const nextRevision = input.expectedRevision + 1;
  const lastActiveAt = input.lastActiveAt ?? new Date().toISOString();
  const sessionResult = await supabase
    .from("nutrition_cooking_sessions")
    .update({
      current_action_key: input.currentActionKey,
      state_revision: nextRevision,
      last_active_at: lastActiveAt,
    })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("state_revision", input.expectedRevision)
    .select("id,state_revision")
    .maybeSingle();
  dbError(sessionResult.error);
  if (!sessionResult.data) throw new Error("Cooking Session revision conflict: local state is stale.");

  if (input.actionStates.length) {
    const rows = input.actionStates.map((item) => ({
      id: item.id,
      session_id: sessionId,
      user_id: userId,
      action_key: item.actionKey,
      state: item.state,
      state_revision: item.stateRevision,
      activated_at: item.activatedAt ?? null,
      completed_at: item.completedAt ?? null,
      deferred_at: item.deferredAt ?? null,
      skipped_at: item.skippedAt ?? null,
    }));
    const result = await supabase.from("nutrition_cooking_action_states").upsert(rows, { onConflict: "id,user_id" });
    dbError(result.error);
  }

  if (input.timers.length) {
    const rows = input.timers.map((item) => ({
      id: item.id,
      action_state_id: item.actionStateId,
      user_id: userId,
      timer_name: item.timerName,
      duration_seconds: Math.max(1, Math.ceil(item.durationSeconds)),
      status: item.status,
      started_at: item.startedAt ?? null,
      target_at: item.targetAt ?? null,
      paused_at: item.pausedAt ?? null,
      paused_remaining_seconds: item.pausedRemainingSeconds ?? null,
      completed_at: item.completedAt ?? null,
      cancelled_at: item.cancelledAt ?? null,
    }));
    const result = await supabase.from("nutrition_cooking_timers").upsert(rows, { onConflict: "id,user_id" });
    dbError(result.error);
  }

  return { stateRevision: asFiniteNumber((sessionResult.data as Record<string, unknown>).state_revision, nextRevision) };
}

async function updateTerminalStatus(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  status: "completed" | "ended",
  now: string,
) {
  const update = status === "completed"
    ? { status, completed_at: now, ended_at: null, last_active_at: now }
    : { status, ended_at: now, last_active_at: now };
  const result = await supabase
    .from("nutrition_cooking_sessions")
    .update(update)
    .eq("id", sessionId)
    .eq("user_id", userId)
    .eq("status", "active")
    .select("id,status,state_revision")
    .single();
  return requiredData(result.data as Record<string, unknown> | null, result.error, `Cooking Session could not be marked ${status}.`);
}

export async function completeCookingSession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  now = new Date().toISOString(),
) {
  return updateTerminalStatus(supabase, userId, sessionId, "completed", now);
}

export async function endCookingSession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  now = new Date().toISOString(),
) {
  return updateTerminalStatus(supabase, userId, sessionId, "ended", now);
}

export async function startOverCookingSession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  now = new Date().toISOString(),
) {
  const sourceResult = await supabase
    .from("nutrition_cooking_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  const source = requiredData(sourceResult.data as Record<string, unknown> | null, sourceResult.error, "Active Cooking Session not found.");
  const normalized = normalizeSession(source);

  const endResult = await supabase
    .from("nutrition_cooking_sessions")
    .update({ status: "ended", ended_at: now, last_active_at: now })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .eq("status", "active")
    .select("id,status")
    .single();
  requiredData(endResult.data as Record<string, unknown> | null, endResult.error, "Existing Cooking Session could not be ended.");

  const snapshot = normalized.frozen_recipe_snapshot;
  const newResult = await supabase.from("nutrition_cooking_sessions").insert({
    user_id: userId,
    recipe_id: normalized.recipe_id,
    recipe_version_id: normalized.recipe_version_id,
    frozen_recipe_snapshot: snapshot,
    serving_scale: normalized.serving_scale,
    current_action_key: actionIdsFromSnapshot(snapshot)[0] ?? null,
    status: "active",
    started_at: now,
    last_active_at: now,
    completed_at: null,
    ended_at: null,
    state_revision: 0,
  }).select("*").single();
  const created = requiredData(newResult.data as Record<string, unknown> | null, newResult.error, "Restarted Cooking Session could not be created.");
  const newSessionId = String(created.id);

  const rows = initialActionStateRows(snapshot, newSessionId, userId);
  if (rows.length) {
    const statesResult = await supabase.from("nutrition_cooking_action_states").insert(rows);
    dbError(statesResult.error);
  }

  return { sessionId: newSessionId };
}
