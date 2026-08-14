import { describe, expect, it } from "vitest";

import {
  formatWorkoutMetricValue,
  presentWorkoutMetric,
  workoutMetricLabel,
} from "@/lib/workouts/metric-presentation";

describe("Workout History semantic metric presentation", () => {
  it("localizes supported multi-sport results without exposing machine keys", () => {
    const running = [
      presentWorkoutMetric({ metricKey: "duration_seconds", side: "none", value: 1_505, unit: "seconds" }, "en-US"),
      presentWorkoutMetric({ metricKey: "distance_meters", side: "none", value: 5_000, unit: "meters" }, "de-DE"),
      presentWorkoutMetric({ metricKey: "rounds", side: "none", value: 8, unit: "count" }, "ar"),
    ];
    expect(running).toMatchObject([
      { label: "Duration", value: "25 min 5 sec" },
      { label: "Distanz", value: "5 km" },
      { value: expect.not.stringContaining("rounds") },
    ]);
    expect(JSON.stringify(running)).not.toContain("duration_seconds");
    expect(JSON.stringify(running)).not.toContain("distance_meters");
  });

  it("localizes semantic duration minutes for EN, DE, and AR", () => {
    expect(formatWorkoutMetricValue("duration_seconds", 65, "en-US")).toBe("1 min 5 sec");
    expect(formatWorkoutMetricValue("duration_seconds", 65, "de-DE")).toBe("1 Min. 5 Sek.");
    const arabic = formatWorkoutMetricValue("duration_seconds", 65, "ar");
    expect(arabic).toContain("د");
    expect(arabic).toContain("ث");
    expect(arabic).not.toContain("min");
  });

  it("fails closed for unknown metric semantics", () => {
    expect(workoutMetricLabel("machine_metric_v9", "en-US")).toBeNull();
    expect(formatWorkoutMetricValue("machine_metric_v9", 42, "en-US")).toBeNull();
    expect(presentWorkoutMetric({ metricKey: "machine_metric_v9", side: "none", value: 42, unit: "count" }, "en-US")).toBeNull();
  });
});
