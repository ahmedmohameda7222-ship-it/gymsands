import { describe, expect, it } from "vitest";

import {
  acknowledgeCookingMutations,
  endLocalCookingSession,
  parseCookingLocalSession,
  queueCookingMutation,
  recoverCookingLocalSession,
  serializeCookingLocalSession,
  startOverLocalCookingSession,
  type CookingLocalSession,
} from "@/lib/nutrition-v1/cooking-local-store";

const sessionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const recipeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const versionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const action1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const action2 = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const baseSession: CookingLocalSession = {
  schemaVersion: 1,
  sessionId,
  recipeId,
  recipeVersionId: versionId,
  frozenRecipeSnapshot: {
    schemaVersion: 1,
    recipe: { id: versionId, recipe_id: recipeId, version_number: 4, name: "Chicken bowl", servings: 4 },
    ingredients: [],
    actions: [
      { id: action1, position: 0, instruction: "First confirmed step.", dependency_action_ids: [] },
      { id: action2, position: 1, instruction: "Second confirmed step.", dependency_action_ids: [action1] },
    ],
    equipment: [],
  },
  servingScale: 1,
  status: "active",
  stateRevision: 4,
  currentActionKey: action2,
  actionStates: [
    { id: "12121212-1212-4212-8212-121212121212", actionKey: action1, state: "completed", stateRevision: 2 },
    { id: "34343434-3434-4434-8434-343434343434", actionKey: action2, state: "running_background", stateRevision: 4 },
  ],
  timers: [
    {
      id: "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1",
      actionId: action2,
      actionStateId: "34343434-3434-4434-8434-343434343434",
      name: "Sauce",
      durationSeconds: 300,
      status: "running",
      startedAt: "2026-08-26T07:06:00.000Z",
      targetAt: "2026-08-26T07:11:00.000Z",
      pausedAt: null,
      pausedRemainingSeconds: null,
      completedAt: null,
    },
    {
      id: "b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2",
      actionId: action2,
      actionStateId: "34343434-3434-4434-8434-343434343434",
      name: "Rest",
      durationSeconds: 120,
      status: "paused",
      startedAt: "2026-08-26T07:05:00.000Z",
      targetAt: "2026-08-26T07:07:00.000Z",
      pausedAt: "2026-08-26T07:06:30.000Z",
      pausedRemainingSeconds: 30,
      completedAt: null,
    },
  ],
  pendingMutations: [],
  startedAt: "2026-08-26T07:00:00.000Z",
  lastActiveAt: "2026-08-26T07:10:00.000Z",
  completedAt: null,
  endedAt: null,
};

describe("Nutrition V1 Cooking local-first recovery", () => {
  it("round-trips the full frozen session needed after background, lock, reload, or process termination", () => {
    const raw = serializeCookingLocalSession(baseSession);
    expect(parseCookingLocalSession(raw)).toEqual(baseSession);
  });

  it("reconstructs multiple timers from persisted timestamps rather than elapsed in-memory counters", () => {
    const recovered = recoverCookingLocalSession(
      serializeCookingLocalSession(baseSession),
      "2026-08-26T07:10:30.000Z",
    );

    expect(recovered).not.toBeNull();
    expect(recovered?.session.sessionId).toBe(sessionId);
    expect(recovered?.timers).toHaveLength(2);
    expect(recovered?.timers[0]).toMatchObject({ name: "Sauce", status: "running", remainingSeconds: 30, expired: false });
    expect(recovered?.timers[1]).toMatchObject({ name: "Rest", status: "paused", remainingSeconds: 30, expired: false });

    const afterTermination = recoverCookingLocalSession(
      serializeCookingLocalSession(baseSession),
      "2026-08-26T07:12:00.000Z",
    );
    expect(afterTermination?.timers[0]).toMatchObject({ name: "Sauce", status: "completed", remainingSeconds: 0, expired: true });
    expect(afterTermination?.timers[0].attentionEvent).toMatchObject({ kind: "timer_finished" });
  });

  it("queues offline mutations with stable operation IDs and only removes server-acknowledged operations", () => {
    const one = queueCookingMutation(baseSession, {
      operationId: "op-1",
      type: "action_state",
      payload: { actionKey: action2, state: "deferred" },
      createdAt: "2026-08-26T07:10:10.000Z",
    });
    const duplicate = queueCookingMutation(one, {
      operationId: "op-1",
      type: "action_state",
      payload: { actionKey: action2, state: "deferred" },
      createdAt: "2026-08-26T07:10:10.000Z",
    });
    const two = queueCookingMutation(duplicate, {
      operationId: "op-2",
      type: "timer",
      payload: { timerId: baseSession.timers[0].id, status: "paused" },
      createdAt: "2026-08-26T07:10:20.000Z",
    });

    expect(two.pendingMutations.map((item) => item.operationId)).toEqual(["op-1", "op-2"]);
    const acknowledged = acknowledgeCookingMutations(two, ["op-1"]);
    expect(acknowledged.pendingMutations.map((item) => item.operationId)).toEqual(["op-2"]);
  });

  it("Start Over is explicit and preserves the exact frozen Recipe version while resetting mutable session progress", () => {
    const restarted = startOverLocalCookingSession(
      baseSession,
      "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      "2026-08-26T07:15:00.000Z",
    );

    expect(restarted.sessionId).not.toBe(baseSession.sessionId);
    expect(restarted.recipeVersionId).toBe(versionId);
    expect(restarted.frozenRecipeSnapshot).toEqual(baseSession.frozenRecipeSnapshot);
    expect(restarted.status).toBe("active");
    expect(restarted.stateRevision).toBe(0);
    expect(restarted.currentActionKey).toBeNull();
    expect(restarted.timers).toEqual([]);
    expect(restarted.pendingMutations).toEqual([]);
    expect(restarted.actionStates.every((item) => item.state === "not_available")).toBe(true);
  });

  it("End Cooking is explicit local truth and does not convert cooking completion into consumption", () => {
    const ended = endLocalCookingSession(baseSession, "2026-08-26T07:18:00.000Z", "op-end");

    expect(ended.status).toBe("ended");
    expect(ended.endedAt).toBe("2026-08-26T07:18:00.000Z");
    expect(ended.completedAt).toBeNull();
    expect(ended.pendingMutations).toEqual(expect.arrayContaining([
      expect.objectContaining({ operationId: "op-end", type: "end_session" }),
    ]));
    expect(JSON.stringify(ended)).not.toMatch(/food_logs|nutrition_log_groups|consumed/i);
  });

  it("rejects corrupt or structurally incomplete recovery data instead of fabricating cooking state", () => {
    expect(parseCookingLocalSession("not-json")).toBeNull();
    expect(parseCookingLocalSession(JSON.stringify({ schemaVersion: 1, sessionId }))).toBeNull();
    expect(recoverCookingLocalSession(JSON.stringify({ schemaVersion: 1, sessionId }), "2026-08-26T07:12:00.000Z")).toBeNull();
  });
});
