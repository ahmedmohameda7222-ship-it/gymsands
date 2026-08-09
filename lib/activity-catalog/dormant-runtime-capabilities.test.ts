import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  DORMANT_LONGEST_DISTANCE_FORMULA,
  DORMANT_LONGEST_DURATION_FORMULA,
  DURATION_EXPOSURE_MODEL,
  calculateMuscleExposureDuration,
  compareDormantHigherBetterRecord,
  evaluateLongestDistance,
  evaluateLongestDuration
} from "./dormant-runtime-capabilities";

describe("P10 Batch 2 dormant multi-sport runtime capabilities", () => {
  it("calculates deterministic time-weighted anatomical exposure and preserves mapping semantics", () => {
    const input = [
      { muscleId: "quad", role: "primary" as const, sideScope: "bilateral" as const, mappingContribution: 0.6 },
      { muscleId: "calf", role: "stabilizer" as const, sideScope: "left" as const, mappingContribution: 0.25 }
    ];
    expect(calculateMuscleExposureDuration(120, input)).toEqual([
      { muscleId: "quad", role: "primary", sideScope: "bilateral", mappingContribution: 0.6, exposureSeconds: 72 },
      { muscleId: "calf", role: "stabilizer", sideScope: "left", mappingContribution: 0.25, exposureSeconds: 30 }
    ]);
    expect(calculateMuscleExposureDuration(0, input).map((row) => row.exposureSeconds)).toEqual([0, 0]);
  });

  it("rejects non-finite/negative duration and invalid mapping contributions", () => {
    expect(() => calculateMuscleExposureDuration(-1, [])).toThrow(/duration_seconds/);
    expect(() => calculateMuscleExposureDuration(Number.NaN, [])).toThrow(/duration_seconds/);
    expect(() => calculateMuscleExposureDuration(1, [{ muscleId: "x", role: "primary", sideScope: "bilateral", mappingContribution: 1.1 }])).toThrow(/mapping contribution/);
  });

  it("exposes only the authorized duration/distance scalar evaluators", () => {
    expect(DURATION_EXPOSURE_MODEL).toEqual({
      modelKey: "duration_exposure",
      modelVersion: "v1",
      mainRuntimeConstant: "duration_exposure_v1",
      engineVersion: "muscle_exposure_duration_v1"
    });
    expect(DORMANT_LONGEST_DURATION_FORMULA.sourceMetricKey).toBe("duration_seconds");
    expect(DORMANT_LONGEST_DISTANCE_FORMULA.sourceMetricKey).toBe("distance_meters");
    expect(evaluateLongestDuration(15)).toBe(15);
    expect(evaluateLongestDuration(0)).toBeNull();
    expect(evaluateLongestDuration(Number.POSITIVE_INFINITY)).toBeNull();
    expect(evaluateLongestDistance(5000)).toBe(5000);
    expect(evaluateLongestDistance(-1)).toBeNull();
  });

  it("keeps record comparison inside immutable activity identity and context", () => {
    const current = { immutableActivityIdentity: "run", comparisonContextKey: "outdoor", value: 1000 };
    expect(compareDormantHigherBetterRecord(current, { ...current, value: 1200 }).value).toBe(1200);
    expect(compareDormantHigherBetterRecord(current, { ...current, value: 900 }).value).toBe(1000);
    expect(() => compareDormantHigherBetterRecord(current, { immutableActivityIdentity: "cycle", comparisonContextKey: "outdoor", value: 1500 })).toThrow(/immutable activity identity/);
    expect(() => compareDormantHigherBetterRecord(current, { immutableActivityIdentity: "run", comparisonContextKey: "treadmill", value: 1500 })).toThrow(/comparison context/);
  });

  it("is not imported by current legacy provider, Heat Map, or derived-PR runtime files", () => {
    const roots = ["services/activity-catalog", "lib/train/muscle-intelligence", "lib/workouts/derived-metrics"];
    const forbiddenNeedle = "dormant-runtime-capabilities";
    const walk = (directory: string): string[] => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
    });
    const imports = roots.flatMap((root) => walk(root)).filter((file) => file !== __filename && fs.readFileSync(file, "utf8").includes(forbiddenNeedle));
    expect(imports).toEqual([]);
  });
});
