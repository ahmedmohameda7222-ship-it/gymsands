import { beforeEach, describe, expect, it, vi } from "vitest";

const userId = "11111111-1111-4111-8111-111111111111";
const firstOccurrenceId = "22222222-2222-4222-8222-222222222222";
const secondOccurrenceId = "33333333-3333-4333-8333-333333333333";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: { getSession: mocks.getSession },
    from: mocks.from,
  },
}));

import {
  markTodayMealSkipped,
  markTodayMealsSkipped,
} from "@/services/dashboard/today-mutations";

function occurrence(id: string, name: string) {
  return {
    id,
    user_id: userId,
    meal_slot_key: "Lunch",
    frozen_name: name,
    frozen_snapshot: {
      frozen_nutrition: {
        calories: 500,
        protein_g: 35,
      },
    },
    status: "skipped",
  };
}

describe("Today Nutrition V1 Meal Plan mutation authority", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getSession.mockReset();
    mocks.from.mockReset();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "today-test-token" } },
      error: null,
    });
    mocks.from.mockImplementation(() => {
      throw new Error("Today must not directly mutate nutrition_planned_occurrences.");
    });
  });

  it("routes one skip through the authenticated canonical Meal Plan command", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      occurrences: [occurrence(firstOccurrenceId, "Lunch bowl")],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    const result = await markTodayMealSkipped(userId, firstOccurrenceId);

    expect(result).toMatchObject({ id: firstOccurrenceId, status: "skipped", name: "Lunch bowl" });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [input, init] = fetchSpy.mock.calls[0]!;
    expect(String(input)).toBe("/api/nutrition/v1/meal-plan/week");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer today-test-token");
    const body = JSON.parse(String(init?.body));
    expect(body.kind).toBe("skip");
    expect(body.occurrenceIds).toEqual([firstOccurrenceId]);
    expect(body.operationId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("routes a same-command multi-skip through one canonical request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      occurrences: [
        occurrence(firstOccurrenceId, "Lunch bowl"),
        occurrence(secondOccurrenceId, "Snack bowl"),
      ],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    const result = await markTodayMealsSkipped(userId, [firstOccurrenceId, secondOccurrenceId, firstOccurrenceId]);

    expect(result.map((item) => item.id)).toEqual([firstOccurrenceId, secondOccurrenceId]);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchSpy.mock.calls[0]![1]?.body));
    expect(body.kind).toBe("skip");
    expect(body.occurrenceIds).toEqual([firstOccurrenceId, secondOccurrenceId]);
  });
});
