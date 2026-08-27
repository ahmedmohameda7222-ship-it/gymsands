import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  completeCookingSession,
  endCookingSession,
  getActiveCookingSession,
  startCookingSession,
  startOverCookingSession,
  syncCookingSessionState,
} from "@/services/nutrition-v1/server/cooking-sessions";

const userId = "11111111-1111-4111-8111-111111111111";
const recipeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const versionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sessionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const restartedSessionId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const action1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const action2 = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const actionState1 = "12121212-1212-4212-8212-121212121212";
const actionState2 = "34343434-3434-4434-8434-343434343434";

type Result = { data: any; error: null | { message: string; code?: string } };

function query(result: Result) {
  const q: Record<string, any> = {};
  for (const method of ["select", "insert", "upsert", "update", "delete", "eq", "in", "is", "order", "limit"]) {
    q[method] = vi.fn(() => q);
  }
  q.single = vi.fn(async () => result);
  q.maybeSingle = vi.fn(async () => result);
  q.then = (resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return q;
}

type Query = ReturnType<typeof query>;

function fakeSupabase(tableQueries: Record<string, Query[]> = {}, rpcResult: Result = { data: null, error: null }) {
  const queues = Object.fromEntries(Object.entries(tableQueries).map(([table, values]) => [table, [...values]])) as Record<string, Query[]>;
  const seen: Record<string, Query[]> = {};
  const from = vi.fn((table: string) => {
    const next = queues[table]?.shift();
    if (!next) throw new Error(`Unexpected table query: ${table}`);
    (seen[table] ??= []).push(next);
    return next;
  });
  const rpc = vi.fn(async () => rpcResult);
  return { client: { from, rpc } as unknown as SupabaseClient, from, rpc, seen };
}

const version = {
  id: versionId,
  recipe_id: recipeId,
  user_id: userId,
  version_number: 4,
  name: "Chicken bowl",
  servings: 4,
  total_cooked_weight_g: 1200,
  total_time_minutes: 35,
  notes: "Confirmed author note",
  metadata: { cuisine: "Mediterranean" },
  published_at: "2026-08-25T12:00:00.000Z",
};

const ingredients = [
  {
    id: "56565656-5656-4656-8656-565656565656",
    position: 0,
    food_id: "78787878-7878-4878-8878-787878787878",
    ingredient_name: "Chicken",
    quantity: 500,
    unit: "g",
    frozen_nutrition: { calories: 600 },
  },
];

const actions = [
  {
    id: action1,
    position: 0,
    instruction: "Prepare the chicken using the confirmed Recipe instruction.",
    ingredient_refs: [ingredients[0].id],
    equipment_refs: [],
    duration_seconds: null,
    heat_or_temperature: null,
    doneness_or_result_cue: null,
    prep_ahead_cue: null,
    track_key: "main",
    dependency_action_ids: [],
    can_run_in_background: false,
    metadata: {},
  },
  {
    id: action2,
    position: 1,
    instruction: "Continue with the confirmed second Recipe instruction.",
    ingredient_refs: [],
    equipment_refs: [],
    duration_seconds: 300,
    heat_or_temperature: null,
    doneness_or_result_cue: null,
    prep_ahead_cue: null,
    track_key: "main",
    dependency_action_ids: [action1],
    can_run_in_background: true,
    metadata: {},
  },
];

const equipment = [{ id: "90909090-9090-4090-8090-909090909090", position: 0, name: "Pan", quantity: 1, note: null }];

const frozenSnapshot = {
  schemaVersion: 1,
  recipe: version,
  ingredients,
  actions,
  equipment,
};

beforeEach(() => vi.clearAllMocks());

describe("Nutrition V1 Cooking Session server authority", () => {
  it("starts only from one published Recipe version and materializes immutable Recipe/action facts into the session", async () => {
    const versionRead = query({ data: version, error: null });
    const ingredientRead = query({ data: ingredients, error: null });
    const actionRead = query({ data: actions, error: null });
    const equipmentRead = query({ data: equipment, error: null });
    const sessionInsert = query({
      data: {
        id: sessionId,
        user_id: userId,
        recipe_id: recipeId,
        recipe_version_id: versionId,
        frozen_recipe_snapshot: frozenSnapshot,
        serving_scale: 1,
        current_action_key: action1,
        status: "active",
        state_revision: 0,
        started_at: "2026-08-26T07:00:00.000Z",
        last_active_at: "2026-08-26T07:00:00.000Z",
      },
      error: null,
    });
    const actionStateInsert = query({ data: null, error: null });
    const db = fakeSupabase({
      nutrition_recipe_versions: [versionRead],
      nutrition_recipe_ingredients: [ingredientRead],
      nutrition_recipe_actions: [actionRead],
      nutrition_recipe_equipment: [equipmentRead],
      nutrition_cooking_sessions: [sessionInsert],
      nutrition_cooking_action_states: [actionStateInsert],
    });

    const started = await startCookingSession(db.client, userId, {
      recipeId,
      recipeVersionId: versionId,
      servingScale: 1,
      now: "2026-08-26T07:00:00.000Z",
    });

    expect(started.sessionId).toBe(sessionId);
    expect(versionRead.eq).toHaveBeenCalledWith("user_id", userId);
    expect(versionRead.eq).toHaveBeenCalledWith("recipe_id", recipeId);
    expect(versionRead.eq).toHaveBeenCalledWith("id", versionId);
    expect(sessionInsert.insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: userId,
      recipe_id: recipeId,
      recipe_version_id: versionId,
      frozen_recipe_snapshot: frozenSnapshot,
      serving_scale: 1,
      status: "active",
      state_revision: 0,
    }));
    expect(actionStateInsert.insert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ session_id: sessionId, user_id: userId, action_key: action1 }),
      expect.objectContaining({ session_id: sessionId, user_id: userId, action_key: action2 }),
    ]));
    expect(db.from).not.toHaveBeenCalledWith("nutrition_recipe_drafts");
  });

  it("resumes an active owner session with action states and multiple persisted timers after interruption", async () => {
    const sessionRead = query({
      data: {
        id: sessionId,
        user_id: userId,
        recipe_id: recipeId,
        recipe_version_id: versionId,
        frozen_recipe_snapshot: frozenSnapshot,
        serving_scale: 1,
        current_action_key: action2,
        status: "active",
        state_revision: 4,
        started_at: "2026-08-26T07:00:00.000Z",
        last_active_at: "2026-08-26T07:10:00.000Z",
      },
      error: null,
    });
    const actionStatesRead = query({
      data: [
        { id: actionState1, session_id: sessionId, user_id: userId, action_key: action1, state: "completed", state_revision: 2 },
        { id: actionState2, session_id: sessionId, user_id: userId, action_key: action2, state: "running_background", state_revision: 4 },
      ],
      error: null,
    });
    const timersRead = query({
      data: [
        { id: "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1", action_state_id: actionState2, timer_name: "Sauce", duration_seconds: 300, status: "running", started_at: "2026-08-26T07:06:00.000Z", target_at: "2026-08-26T07:11:00.000Z", paused_at: null, paused_remaining_seconds: null, completed_at: null },
        { id: "b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2", action_state_id: actionState2, timer_name: "Rest", duration_seconds: 120, status: "paused", started_at: "2026-08-26T07:05:00.000Z", target_at: "2026-08-26T07:07:00.000Z", paused_at: "2026-08-26T07:06:30.000Z", paused_remaining_seconds: 30, completed_at: null },
      ],
      error: null,
    });
    const db = fakeSupabase({
      nutrition_cooking_sessions: [sessionRead],
      nutrition_cooking_action_states: [actionStatesRead],
      nutrition_cooking_timers: [timersRead],
    });

    const resumed = await getActiveCookingSession(db.client, userId, recipeId);

    expect(resumed?.session.id).toBe(sessionId);
    expect(resumed?.actionStates).toHaveLength(2);
    expect(resumed?.timers.map((timer) => timer.timerName)).toEqual(["Sauce", "Rest"]);
    expect(sessionRead.eq).toHaveBeenCalledWith("user_id", userId);
    expect(sessionRead.eq).toHaveBeenCalledWith("recipe_id", recipeId);
    expect(sessionRead.eq).toHaveBeenCalledWith("status", "active");
    expect(timersRead.in).toHaveBeenCalledWith("action_state_id", [actionState1, actionState2]);
  });

  it("syncs local state with optimistic session revision authority through one owner-derived transactional RPC", async () => {
    const db = fakeSupabase({}, { data: { stateRevision: 5 }, error: null });

    const synced = await syncCookingSessionState(db.client, userId, sessionId, {
      expectedRevision: 4,
      currentActionKey: action2,
      lastActiveAt: "2026-08-26T07:12:00.000Z",
      actionStates: [
        { id: actionState1, actionKey: action1, state: "completed", stateRevision: 4, completedAt: "2026-08-26T07:08:00.000Z" },
        { id: actionState2, actionKey: action2, state: "running_background", stateRevision: 5 },
      ],
      timers: [
        { id: "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1", actionStateId: actionState2, timerName: "Sauce", durationSeconds: 300, status: "running", startedAt: "2026-08-26T07:06:00.000Z", targetAt: "2026-08-26T07:11:00.000Z" },
      ],
    });

    expect(synced.stateRevision).toBe(5);
    expect(db.rpc).toHaveBeenCalledWith("sync_nutrition_cooking_session_state", expect.objectContaining({
      p_session_id: sessionId,
      p_expected_revision: 4,
      p_current_action_key: action2,
      p_action_states: expect.arrayContaining([
        expect.objectContaining({ id: actionState1, action_key: action1 }),
        expect.objectContaining({ id: actionState2, action_key: action2 }),
      ]),
      p_timers: expect.arrayContaining([
        expect.objectContaining({ action_state_id: actionState2, timer_name: "Sauce" }),
      ]),
    }));
    expect(db.from).not.toHaveBeenCalled();
  });

  it("rejects a stale sync revision before child state is written", async () => {
    const db = fakeSupabase({}, { data: null, error: { message: "Cooking Session revision conflict: local state is stale.", code: "40001" } });

    await expect(syncCookingSessionState(db.client, userId, sessionId, {
      expectedRevision: 4,
      currentActionKey: action2,
      actionStates: [],
      timers: [],
    })).rejects.toThrow(/revision|conflict|stale/i);

    expect(db.rpc).toHaveBeenCalledWith("sync_nutrition_cooking_session_state", expect.any(Object));
    expect(db.from).not.toHaveBeenCalled();
  });

  it("keeps completion and explicit End Cooking separate from food consumption", async () => {
    const completedUpdate = query({ data: { id: sessionId, status: "completed", state_revision: 6 }, error: null });
    const completedDb = fakeSupabase({ nutrition_cooking_sessions: [completedUpdate] });

    await completeCookingSession(completedDb.client, userId, sessionId, "2026-08-26T07:20:00.000Z");
    expect(completedUpdate.update).toHaveBeenCalledWith(expect.objectContaining({
      status: "completed",
      completed_at: "2026-08-26T07:20:00.000Z",
      ended_at: null,
    }));
    expect(completedDb.from).not.toHaveBeenCalledWith("food_logs");
    expect(completedDb.from).not.toHaveBeenCalledWith("nutrition_log_groups");

    const endedUpdate = query({ data: { id: sessionId, status: "ended", state_revision: 6 }, error: null });
    const endedDb = fakeSupabase({ nutrition_cooking_sessions: [endedUpdate] });
    await endCookingSession(endedDb.client, userId, sessionId, "2026-08-26T07:18:00.000Z");
    expect(endedUpdate.update).toHaveBeenCalledWith(expect.objectContaining({
      status: "ended",
      ended_at: "2026-08-26T07:18:00.000Z",
    }));
    expect(endedDb.from).not.toHaveBeenCalledWith("food_logs");
    expect(endedDb.from).not.toHaveBeenCalledWith("nutrition_log_groups");
  });

  it("Start Over delegates the complete transition to one owner-derived transactional RPC", async () => {
    const db = fakeSupabase({}, { data: { sessionId: restartedSessionId, reused: false }, error: null });

    const restarted = await startOverCookingSession(db.client, userId, sessionId, "2026-08-26T07:15:00.000Z");

    expect(restarted.sessionId).toBe(restartedSessionId);
    expect(db.rpc).toHaveBeenCalledWith("start_over_nutrition_cooking_session", {
      p_session_id: sessionId,
      p_now: "2026-08-26T07:15:00.000Z",
    });
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.from).not.toHaveBeenCalled();
  });
});
