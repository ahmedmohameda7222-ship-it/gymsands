import { describe, expect, it } from "vitest";
import { knownFoodLogCount, resolveTodayNutritionSources, type TodayNutritionTargetData } from "@/lib/dashboard/today-nutrition";
import type { FoodLog } from "@/types";

const log = { id: "log-1" } as FoodLog;
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

  it("keeps both failed sources unavailable instead of synthesizing zeros", () => {
    const data = resolveTodayNutritionSources(failed(new Error("logs")), failed(new Error("targets")));
    expect(data.logs).toBeNull();
    expect(data.targets).toBeNull();
    expect(knownFoodLogCount(data)).toBeNull();
    expect(data.logsError).toContain("logs");
    expect(data.targetsError).toContain("targets");
  });
});
