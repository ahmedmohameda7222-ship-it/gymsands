import { describe, expect, it } from "vitest";
import { resolveActiveNutritionTarget } from "@/services/nutrition/active-target";
import type { UserNutritionTargetProfile } from "@/types";

function profile(target_type: UserNutritionTargetProfile["target_type"], calories: number): UserNutritionTargetProfile {
  return {
    id: target_type,
    user_id: "user",
    target_type,
    calories,
    protein_g: 120,
    carbs_g: 180,
    fat_g: 60,
    water_ml: 2500,
    notes: null,
    created_at: "2026-07-03T00:00:00.000Z",
    updated_at: "2026-07-03T00:00:00.000Z"
  };
}

describe("resolveActiveNutritionTarget", () => {
  it("uses the exact detected day profile", () => {
    const active = resolveActiveNutritionTarget({ profiles: [profile("rest_day", 1800)], baseTarget: null, requestedType: "rest_day" });
    expect(active.values.daily_calories).toBe(1800);
    expect(active.label).toBe("Rest day");
  });

  it("falls back to default and then base without mixing labels", () => {
    const defaultTarget = resolveActiveNutritionTarget({ profiles: [profile("default_day", 2000)], baseTarget: null, requestedType: "training_day" });
    expect(defaultTarget.label).toBe("Default day");
    const baseTarget = resolveActiveNutritionTarget({ profiles: [], baseTarget: { daily_calories: 2200, protein_g: 150, carbs_g: 250, fat_g: 70, water_ml: 2800 }, requestedType: "rest_day" });
    expect(baseTarget.label).toBe("Base fallback");
    expect(baseTarget.values.daily_calories).toBe(2200);
  });
});
