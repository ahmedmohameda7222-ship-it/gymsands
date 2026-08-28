import { describe, expect, it, vi } from "vitest";

import {
  deserializeMealPlanQueue,
  enqueueMealPlanMutation,
  isMealPlanBaseRevisionStaleError,
  markMealPlanMutationFailed,
  reconcileMealPlanQueue,
  replayMealPlanMutationExactFirst,
  serializeMealPlanQueue,
  type MealPlanOfflineMutation,
} from "@/lib/nutrition-v1/meal-plan-offline";

const base: MealPlanOfflineMutation = {
  operationId: "11111111-1111-4111-8111-111111111111",
  weekId: "22222222-2222-4222-8222-222222222222",
  baseRevision: 4,
  target: { kind: "occurrence", id: "33333333-3333-4333-8333-333333333333", field: "resolvedQuantity" },
  payload: {
    weekStartDate: "2026-08-24",
    mutation: { weekOverride: { note: "persisted command" } },
    baseSnapshot: { note: "before" },
  },
  status: "queued",
};

describe("Nutrition V1 Meal Plan offline queue", () => {
  it("keeps operation identity and base revision durable across restart serialization", () => {
    const queue = enqueueMealPlanMutation([], base);
    const restored = deserializeMealPlanQueue(serializeMealPlanQueue(queue));

    expect(restored).toEqual([base]);
  });

  it("deduplicates retry envelopes by operationId", () => {
    const queue = enqueueMealPlanMutation(enqueueMealPlanMutation([], base), base);
    expect(queue).toHaveLength(1);
  });

  it("replays the exact persisted Meal Plan command before any reconciliation", async () => {
    const send = vi.fn(async () => ({ weekId: base.weekId, revision: 5 }));

    const result = await replayMealPlanMutationExactFirst(base, send);

    expect(result).toEqual({ state: "applied", result: { weekId: base.weekId, revision: 5 } });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      weekId: base.weekId,
      weekStartDate: "2026-08-24",
      baseRevision: 4,
      operationId: base.operationId,
      mutation: { weekOverride: { note: "persisted command" } },
    });
  });

  it("preserves the original null week identity for a queued first-write replay", async () => {
    const local = { ...base, weekId: "local:2026-08-24" };
    const send = vi.fn(async () => ({ weekId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", revision: 1 }));

    await replayMealPlanMutationExactFirst(local, send);

    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      weekId: null,
      baseRevision: base.baseRevision,
      operationId: base.operationId,
    }));
  });

  it("returns stale only for the canonical CAS stale error so the caller may refetch and reconcile", async () => {
    const stale = await replayMealPlanMutationExactFirst(base, async () => {
      throw new Error("Meal Plan base revision is stale.");
    });
    expect(stale).toEqual({ state: "stale" });
    expect(isMealPlanBaseRevisionStaleError(new Error("Meal Plan base revision is stale."))).toBe(true);
    expect(isMealPlanBaseRevisionStaleError(new Error("Network request failed"))).toBe(false);

    await expect(replayMealPlanMutationExactFirst(base, async () => {
      throw new Error("Network request failed");
    })).rejects.toThrow("Network request failed");
  });

  it("conflicts only the changed occurrence field instead of replacing the whole week", () => {
    const other: MealPlanOfflineMutation = {
      ...base,
      operationId: "44444444-4444-4444-8444-444444444444",
      target: { kind: "occurrence", id: "55555555-5555-4555-8555-555555555555", field: "mealSlotKey" },
      payload: { resolvedQuantity: 2 },
    };

    const reconciled = reconcileMealPlanQueue([base, other], {
      serverRevision: 6,
      changedTargets: [{ kind: "occurrence", id: base.target.id, field: "resolvedQuantity" }],
    });

    expect(reconciled[0]).toMatchObject({ status: "conflict", baseRevision: 4 });
    expect(reconciled[1]).toMatchObject({ status: "queued", baseRevision: 6 });
    expect(reconciled[1]?.payload).toEqual({ resolvedQuantity: 2 });
  });

  it("treats a whole-occurrence server change as conflict for any local field on that occurrence", () => {
    const [result] = reconcileMealPlanQueue([base], {
      serverRevision: 5,
      changedTargets: [{ kind: "occurrence", id: base.target.id }],
    });
    expect(result?.status).toBe("conflict");
  });

  it("keeps transient synchronization failures queued for automatic retry", () => {
    for (const message of ["Network request failed", "Request timed out", "Service temporarily unavailable"]) {
      const failed = markMealPlanMutationFailed(base, message);
      expect(failed).toMatchObject({ status: "queued", lastError: message });
      expect(failed.operationId).toBe(base.operationId);
      expect(failed.payload).toEqual(base.payload);
    }
  });

  it("keeps failed trusted local intent visible for attention when the payload is no longer valid", () => {
    const failed = markMealPlanMutationFailed(base, "Serving is no longer valid");
    expect(failed).toMatchObject({ status: "needs_attention", lastError: "Serving is no longer valid" });
    expect(failed.payload).toEqual(base.payload);
    expect(failed.operationId).toBe(base.operationId);
  });
});