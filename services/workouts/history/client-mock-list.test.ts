import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { productionQaBuild: true },
}));

import { mockHistoryListForRenderedQa } from "@/services/workouts/history/client-mock-list";

const ownerId = "00000000-0000-4000-8000-000000000001";

describe("Workout History rendered QA list", () => {
  it("keeps fixture rows inside the requested period authority", async () => {
    const response = await mockHistoryListForRenderedQa(ownerId, {
      from: "2026-06-01T00:00:00.000Z",
      to: "2026-07-01T00:00:00.000Z",
      timezone: "UTC",
      statuses: ["completed", "partial"],
      sort: "newest",
    });

    expect(response.period).toEqual({
      from: "2026-06-01T00:00:00.000Z",
      to: "2026-07-01T00:00:00.000Z",
      timezone: "UTC",
    });
    expect(response.items).toEqual([]);
    expect(response.summary?.eligibleWorkoutCount).toBe(0);
  });

  it("keeps long rendered-QA pages inside their requested period", async () => {
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: () => "long-history",
        },
      },
    });
    try {
      const response = await mockHistoryListForRenderedQa(ownerId, {
        from: "2026-08-01T00:00:00.000Z",
        to: "2026-09-01T00:00:00.000Z",
        timezone: "UTC",
        statuses: ["completed", "partial"],
        sort: "newest",
      });
      expect(response.items).toHaveLength(20);
      expect(response.items.every((item) =>
        Date.parse(item.effectiveAt) >= Date.parse(response.period.from)
        && Date.parse(item.effectiveAt) < Date.parse(response.period.to))).toBe(true);
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  });
});
