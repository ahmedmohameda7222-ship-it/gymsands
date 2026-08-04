import { describe, expect, it } from "vitest";
import {
  dashboardRequestKey,
  dashboardValueForRequest,
  isDashboardRequestCurrent,
} from "@/lib/dashboard/today-request";

describe("Today projection request isolation", () => {
  it("includes owner, date, and timezone while excluding the token", () => {
    const key = dashboardRequestKey(
      "user-a",
      "2026-08-03",
      "Europe/Berlin",
    );
    expect(key).toBe("user-a:2026-08-03:Europe/Berlin");
    expect(key).not.toContain("access-token");
  });

  it("rejects a user A response after the authority switches to user B", () => {
    expect(
      isDashboardRequestCurrent({
        activeGeneration: 2,
        requestGeneration: 1,
        activeKey: dashboardRequestKey(
          "user-b",
          "2026-08-03",
          "Europe/Berlin",
        ),
        requestKey: dashboardRequestKey(
          "user-a",
          "2026-08-03",
          "Europe/Berlin",
        ),
      }),
    ).toBe(false);
  });

  it("rejects an old date or timezone generation", () => {
    expect(
      isDashboardRequestCurrent({
        activeGeneration: 8,
        requestGeneration: 7,
        activeKey: dashboardRequestKey(
          "user-a",
          "2026-08-04",
          "Europe/London",
        ),
        requestKey: dashboardRequestKey(
          "user-a",
          "2026-08-03",
          "Europe/Berlin",
        ),
      }),
    ).toBe(false);
  });

  it("does not expose a projection resolved for another identity", () => {
    const currentKey = dashboardRequestKey(
      "user-b",
      "2026-08-04",
      "Europe/Berlin",
    );
    const result = dashboardValueForRequest({
      resolvedKey: dashboardRequestKey(
        "user-a",
        "2026-08-03",
        "Europe/Berlin",
      ),
      currentKey,
      value: { title: "User A workout" },
    });
    expect(result).toBeNull();
  });
});
