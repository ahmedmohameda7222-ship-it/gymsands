import { beforeEach, describe, expect, it, vi } from "vitest";

const userId = "11111111-1111-4111-8111-111111111111";

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

import { toggleTodayShoppingItem } from "@/services/dashboard/today-mutations";

describe("Today Shopping V1 mutation authority", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getSession.mockReset();
    mocks.from.mockReset();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "today-shopping-token" } },
      error: null,
    });
    mocks.from.mockImplementation(() => {
      throw new Error("Today Shopping must not directly mutate the retired grocery authority.");
    });
  });

  it("toggles a derived item through the authenticated MealPlanWeek Shopping state command", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      item: {
        id: "derived:44444444-4444-4444-8444-444444444444|g|",
        weekStart: "2026-08-01",
        itemName: "Chicken",
        quantity: 750,
        unit: "g",
        storeSection: "Other",
        checked: true,
        alreadyHave: false,
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    const result = await toggleTodayShoppingItem(userId, {
      id: "derived:44444444-4444-4444-8444-444444444444|g|",
      weekStart: "2026-08-01",
      itemName: "Chicken",
      quantity: 750,
      unit: "g",
      storeSection: "Other",
      checked: false,
      alreadyHave: false,
    });

    expect(result.checked).toBe(true);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [input, init] = fetchSpy.mock.calls[0]!;
    expect(String(input)).toBe("/api/nutrition/v1/meal-plan/week");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer today-shopping-token");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      kind: "shopping_state",
      weekStartDate: "2026-08-01",
      itemId: "derived:44444444-4444-4444-8444-444444444444|g|",
      state: "Purchased",
    });
    expect(body.operationId).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
