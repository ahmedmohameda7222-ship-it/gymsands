import { describe, expect, it } from "vitest";
import { resolveProgressMetricState } from "@/lib/dashboard/progress-metric-state";

describe("dashboard progress metric state", () => {
  it("marks values above target explicitly and caps only the visual progress", () => {
    expect(resolveProgressMetricState({ consumed: 2342, target: 2000, consumedState: "loaded", targetState: "loaded" })).toEqual({
      status: "over",
      consumed: 2342,
      target: 2000,
      remaining: 0,
      overBy: 342,
      progress: 100
    });
  });

  it("does not treat exactly-at-target as over", () => {
    const state = resolveProgressMetricState({ consumed: 160, target: 160, consumedState: "loaded", targetState: "loaded" });
    expect(state.status).toBe("at");
    expect(state.overBy).toBe(0);
    expect(state.progress).toBe(100);
  });

  it("preserves a known consumed value when the target fails", () => {
    expect(resolveProgressMetricState({ consumed: 120, target: null, consumedState: "loaded", targetState: "failed" })).toMatchObject({
      status: "target-unavailable",
      consumed: 120,
      target: null
    });
  });

  it("never reports failed logs as zero", () => {
    expect(resolveProgressMetricState({ consumed: 0, target: 2000, consumedState: "failed", targetState: "loaded" })).toMatchObject({
      status: "unavailable",
      consumed: null,
      progress: undefined
    });
  });

  it("distinguishes a missing target from a failed target", () => {
    expect(resolveProgressMetricState({ consumed: 50, target: null, consumedState: "loaded", targetState: "loaded" }).status).toBe("no-target");
    expect(resolveProgressMetricState({ consumed: 50, target: null, consumedState: "loaded", targetState: "failed" }).status).toBe("target-unavailable");
  });
});
