import { describe, expect, it } from "vitest";

import {
  deserializeMealPlanQueue,
  enqueueMealPlanMutation,
  markMealPlanMutationFailed,
  reconcileMealPlanQueue,
  serializeMealPlanQueue,
  type MealPlanOfflineMutation,
} from "@/lib/nutrition-v1/meal-plan-offline";

const base: MealPlanOfflineMutation = {
  operationId: "11111111-1111-4111-8111-111111111111",
  weekId: "22222222-2222-4222-8222-222222222222",
  baseRevision: 4,
  target: { kind: "occurrence", id: "33333333-3333-4333-8333-333333333333", field: "resolvedQuantity" },
  payload: { resolvedQuantity: 2 },
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

  it("conflicts only the changed occurrence field instead of replacing the whole week", () => {
    const other: MealPlanOfflineMutation = {
      ...base,
      operationId: "44444444-4444-4444-8444-444444444444",
      target: { kind: "occurrence", id: "55555555-5555-4555-8555-555555555555", field: "mealSlotKey" },
      payload: { mealSlotKey: "Dinner" },
    };

    const reconciled = reconcileMealPlanQueue([base, other], {
      serverRevision: 6,
      changedTargets: [{ kind: "occurrence", id: base.target.id, field: "resolvedQuantity" }],
    });

    expect(reconciled[0]).toMatchObject({ status: "conflict", baseRevision: 4 });
    expect(reconciled[1]).toMatchObject({ status: "queued", baseRevision: 6 });
    expect(reconciled[1]?.payload).toEqual({ mealSlotKey: "Dinner" });
  });

  it("treats a whole-occurrence server change as conflict for any local field on that occurrence", () => {
    const [result] = reconcileMealPlanQueue([base], {
      serverRevision: 5,
      changedTargets: [{ kind: "occurrence", id: base.target.id }],
    });
    expect(result?.status).toBe("conflict");
  });

  it("keeps failed trusted local intent visible for attention instead of deleting it", () => {
    const failed = markMealPlanMutationFailed(base, "Serving is no longer valid");
    expect(failed).toMatchObject({ status: "needs_attention", lastError: "Serving is no longer valid" });
    expect(failed.payload).toEqual(base.payload);
    expect(failed.operationId).toBe(base.operationId);
  });
});
