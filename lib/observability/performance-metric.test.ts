import { describe, expect, it } from "vitest";

import { validatePerformanceMetricPayload } from "./performance-metric";

const release = {
  commitSha: "60a204d5fc20fc396be1b1b47e748c42ebba6abf",
  buildTimestamp: "2026-08-02T20:00:00.000Z",
};

function validPayload() {
  return {
    eventId: "123e4567-e89b-42d3-a456-426614174000",
    metricId: "v5-1234567890",
    metric: "LCP",
    value: 1325.4,
    delta: 325.4,
    rating: "good",
    route: "/workout-history/123e4567-e89b-42d3-a456-426614174000?private=1",
    navigationType: "navigate",
    visibilityState: "visible",
    connectionType: "4g",
    commitSha: release.commitSha,
    buildTimestamp: release.buildTimestamp,
    browser: "Chrome/150",
  };
}

describe("performance metric envelope", () => {
  it("accepts bounded metrics and strips dynamic route identifiers", () => {
    const result = validatePerformanceMetricPayload(validPayload());
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        metric: "LCP",
        value: 1325.4,
        route: "/workout-history/id",
        commitSha: release.commitSha,
      }),
    });
  });

  it("accepts the authenticated app boot metric", () => {
    const result = validatePerformanceMetricPayload({
      ...validPayload(),
      metricId: "app-boot-1875",
      metric: "APP_BOOT",
      value: 1875,
      delta: 1875,
      rating: "unrated",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects unsupported fields, metric names, and unbounded numeric values", () => {
    expect(validatePerformanceMetricPayload({ ...validPayload(), userId: "private" })).toEqual({
      ok: false,
      error: "unsupported_fields",
    });
    expect(validatePerformanceMetricPayload({ ...validPayload(), metric: "PRIVATE_TIMING" })).toEqual({
      ok: false,
      error: "invalid_fields",
    });
    expect(validatePerformanceMetricPayload({ ...validPayload(), value: Number.POSITIVE_INFINITY })).toEqual({
      ok: false,
      error: "invalid_fields",
    });
  });

  it("normalizes unknown network and navigation metadata without rejecting the metric", () => {
    const result = validatePerformanceMetricPayload({
      ...validPayload(),
      navigationType: "private-navigation",
      connectionType: "wifi",
      visibilityState: "discarded",
    });
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        navigationType: "unknown",
        connectionType: "unknown",
        visibilityState: "unknown",
      }),
    });
  });
});
