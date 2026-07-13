import { describe, expect, it } from "vitest";
import {
  dashboardRequestKey,
  dashboardSourceStates,
  dashboardValueForRequest,
  isDashboardRequestCurrent
} from "@/lib/dashboard/today-request";

describe("Today request isolation", () => {
  it("rejects a user A response after the active request switches to user B", () => {
    const requestA = { version: 1, key: dashboardRequestKey("user-a", "2026-07-13") };
    const active = { version: 2, key: dashboardRequestKey("user-b", "2026-07-13") };

    expect(isDashboardRequestCurrent({
      activeVersion: active.version,
      requestVersion: requestA.version,
      activeKey: active.key,
      requestKey: requestA.key
    })).toBe(false);
  });

  it("rejects yesterday's response after the local Today date changes", () => {
    expect(isDashboardRequestCurrent({
      activeVersion: 8,
      requestVersion: 7,
      activeKey: dashboardRequestKey("user-a", "2026-07-14"),
      requestKey: dashboardRequestKey("user-a", "2026-07-13")
    })).toBe(false);
  });

  it("does not expose data associated with another user or date", () => {
    const currentKey = dashboardRequestKey("user-b", "2026-07-14");
    const result = dashboardValueForRequest({
      activeKey: dashboardRequestKey("user-a", "2026-07-13"),
      currentKey,
      value: { title: "User A workout" },
      fallback: { title: null }
    });

    expect(result).toEqual({ title: null });
  });

  it("creates a complete loading state for every independent source", () => {
    expect(dashboardSourceStates("loading")).toEqual({
      workout: "loading",
      meals: "loading",
      nutrition: "loading",
      hydration: "loading",
      shopping: "loading",
      wellness: "loading"
    });
  });
});
