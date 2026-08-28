import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { mutateMealPlanWeek } from "@/services/nutrition-v1/server/meal-plan";

const userId = "11111111-1111-4111-8111-111111111111";
const weekId = "22222222-2222-4222-8222-222222222222";
const operationId = "88888888-8888-4888-8888-888888888888";

function placeholder(planDate: string) {
  return {
    planDate,
    mealSlotKey: "Lunch",
    sourceType: "placeholder" as const,
    frozenName: "Restaurant meal",
    frozenSnapshot: { name: "Restaurant meal" },
  };
}

describe("Nutrition V1 Meal Plan review corrections", () => {
  it("creates a missing week inside the same mutation RPC instead of committing a separate week insert", async () => {
    const from = vi.fn(() => {
      throw new Error("direct Meal Plan week insert is forbidden");
    });
    const rpc = vi.fn(async () => ({ data: { weekId, revision: 1 }, error: null }));
    const client = { from, rpc } as unknown as SupabaseClient;

    const result = await mutateMealPlanWeek(client, userId, {
      weekId: null,
      weekStartDate: "2026-08-24",
      baseRevision: 0,
      operationId,
      mutation: { upsertOccurrences: [placeholder("2026-08-24")] },
    });

    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("mutate_nutrition_meal_plan_week", {
      p_week_id: null,
      p_base_revision: 0,
      p_mutation: expect.objectContaining({
        operationId,
        weekStartDate: "2026-08-24",
        upsertOccurrences: expect.any(Array),
      }),
    });
    expect(result).toEqual({ weekId, revision: 1 });
  });

  it("rejects a moved occurrence whose plan date is outside the target week", async () => {
    const rpc = vi.fn(async () => ({ data: { weekId, revision: 2 }, error: null }));
    const client = { rpc } as unknown as SupabaseClient;

    await expect(mutateMealPlanWeek(client, userId, {
      weekId,
      weekStartDate: "2026-08-24",
      baseRevision: 1,
      operationId,
      mutation: { upsertOccurrences: [placeholder("2026-08-31")] },
    })).rejects.toThrow(/target week/i);

    expect(rpc).not.toHaveBeenCalled();
  });
});
