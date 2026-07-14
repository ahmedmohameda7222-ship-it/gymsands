import { describe, expect, it } from "vitest";
import { hasFoodLogsFromCount, knownFoodLogCount, resolveTodayNutritionSources, upsertFoodLogById, type TodayNutritionTargetData } from "@/lib/dashboard/today-nutrition";
import { sumFoodLogs } from "@/services/nutrition/calculations";
import type { FoodLog } from "@/types";

const log = { id: "log-1", calories: 400, protein_g: 30, carbs_g: 45, fat_g: 10, quantity: 1 } as FoodLog;
const zeroNutritionLog = { id: "log-zero", calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, quantity: 1 } as FoodLog;
const targets = { targets: null, activeTarget: null } satisfies TodayNutritionTargetData;
const failed = (reason = new Error("failed")) => ({ status: "rejected", reason } as const);

describe("Today nutrition partial loading", () => {
  it("keeps failed food logs unknown while targets remain available", () => {
    const data = resolveTodayNutritionSources(failed(), { status: "fulfilled", value: targets });
    expect(data.logs).toBeNull();
    expect(data.logsState).toBe("failed");
    expect(data.targetsState).toBe("loaded");
    expect(knownFoodLogCount(data)).toBeNull();
  });

  it("keeps consumed food when targets fail", () => {
    const data = resolveTodayNutritionSources({ status: "fulfilled", value: [log] }, failed());
    expect(data.logs).toEqual([log]);
    expect(data.logsState).toBe("loaded");
    expect(data.targetsState).toBe("failed");
    expect(knownFoodLogCount(data)).toBe(1);
  });

  it("represents both successful sources without losing empty versus unknown", () => {
    const data = resolveTodayNutritionSources({ status: "fulfilled", value: [] }, { status: "fulfilled", value: targets });
    expect(data.logs).toEqual([]);
    expect(knownFoodLogCount(data)).toBe(0);
    expect(data.logsState).toBe("loaded");
    expect(data.targetsState).toBe("loaded");
  });

  it("reports a real zero-nutrition log as present", () => {
    const data = resolveTodayNutritionSources({ status: "fulfilled", value: [zeroNutritionLog] }, { status: "fulfilled", value: targets });
    const count = knownFoodLogCount(data);
    expect(count).toBe(1);
    expect(hasFoodLogsFromCount(count)).toBe(true);
  });

  it("keeps loaded-empty and failed log presence distinct", () => {
    const empty = resolveTodayNutritionSources({ status: "fulfilled", value: [] }, { status: "fulfilled", value: targets });
    const unavailable = resolveTodayNutritionSources(failed(new Error("logs")), { status: "fulfilled", value: targets });
    expect(hasFoodLogsFromCount(knownFoodLogCount(empty))).toBe(false);
    expect(knownFoodLogCount(unavailable)).toBeNull();
    expect(hasFoodLogsFromCount(knownFoodLogCount(unavailable))).toBe(false);
    expect(unavailable.logsState).toBe("failed");
  });

  it("keeps both failed sources unavailable instead of synthesizing zeros", () => {
    const data = resolveTodayNutritionSources(failed(new Error("logs")), failed(new Error("targets")));
    expect(data.logs).toBeNull();
    expect(data.targets).toBeNull();
    expect(knownFoodLogCount(data)).toBeNull();
    expect(data.logsError).toContain("logs");
    expect(data.targetsError).toContain("targets");
  });
});

describe("meal completion food-log deduplication", () => {
  it("adds the first completion log exactly once", () => {
    expect(upsertFoodLogById([], log)).toEqual([log]);
  });

  it("keeps one log after repeated and already-done completion responses", () => {
    const once = upsertFoodLogById([], log);
    const repeated = upsertFoodLogById(once, log);
    expect(repeated).toHaveLength(1);
    expect(repeated[0]).toEqual(log);
  });

  it("replaces an existing log with the same stable ID", () => {
    const corrected = { ...log, calories: 425 };
    expect(upsertFoodLogById([log], corrected)).toEqual([corrected]);
  });

  it("does not increase displayed calories after a repeated completion response", () => {
    const once = upsertFoodLogById([], log);
    const repeated = upsertFoodLogById(once, log);
    expect(sumFoodLogs(repeated).calories).toBe(sumFoodLogs(once).calories);
  });
});
