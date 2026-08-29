import { describe, expect, it } from "vitest";

import {
  buildLegacyCutoverTargetPeriod,
  resolveEffectiveNutritionTarget,
  type NutritionTargetPeriod,
} from "@/lib/nutrition-v1/targets";

function period(
  input: Partial<NutritionTargetPeriod> & Pick<NutritionTargetPeriod, "effective_from">,
): NutritionTargetPeriod {
  return {
    id: input.id ?? `period-${input.effective_from}`,
    effective_from: input.effective_from,
    effective_to: input.effective_to ?? null,
    calories: input.calories ?? null,
    protein_g: input.protein_g ?? null,
    carbs_g: input.carbs_g ?? null,
    fat_g: input.fat_g ?? null,
    water_ml: input.water_ml ?? null,
    source: input.source ?? "test",
    source_evidence: input.source_evidence ?? {},
  };
}

describe("Nutrition V1 effective-dated targets", () => {
  it("keeps a stored January target as January truth after an August target change", () => {
    const periods = [
      period({
        effective_from: "2026-01-01",
        effective_to: "2026-08-01",
        calories: 1800,
        protein_g: 130,
        carbs_g: 190,
        fat_g: 55,
        water_ml: 2400,
      }),
      period({
        effective_from: "2026-08-01",
        calories: 2200,
        protein_g: 160,
        carbs_g: 250,
        fat_g: 70,
        water_ml: 3000,
      }),
    ];

    expect(resolveEffectiveNutritionTarget(periods, "2026-01-15")).toMatchObject({
      available: true,
      effective_from: "2026-01-01",
      values: {
        calories: 1800,
        protein_g: 130,
        carbs_g: 190,
        fat_g: 55,
        water_ml: 2400,
      },
    });

    expect(resolveEffectiveNutritionTarget(periods, "2026-08-15")).toMatchObject({
      available: true,
      effective_from: "2026-08-01",
      values: { calories: 2200 },
    });
  });

  it("returns historical target unavailable when pre-cutover truth cannot be proven", () => {
    const cutover = buildLegacyCutoverTargetPeriod({
      effectiveFrom: "2026-08-25",
      values: {
        calories: 2100,
        protein_g: 150,
        carbs_g: 230,
        fat_g: 65,
        water_ml: 2800,
      },
      evidence: { authority: "legacy-current-state" },
    });

    expect(resolveEffectiveNutritionTarget([cutover], "2026-01-15")).toEqual({
      available: false,
      effective_from: null,
      effective_to: null,
      values: null,
      source: null,
      source_evidence: null,
      reason: "target_unavailable_for_date",
    });
  });

  it("applies a current legacy cutover target only from its effective date forward", () => {
    const cutover = buildLegacyCutoverTargetPeriod({
      effectiveFrom: "2026-08-25",
      values: {
        calories: 2050,
        protein_g: 145,
        carbs_g: null,
        fat_g: 60,
        water_ml: null,
      },
      evidence: { authority: "legacy-current-state" },
    });

    expect(resolveEffectiveNutritionTarget([cutover], "2026-08-24").available).toBe(false);
    expect(resolveEffectiveNutritionTarget([cutover], "2026-08-25")).toMatchObject({
      available: true,
      values: {
        calories: 2050,
        protein_g: 145,
        carbs_g: null,
        fat_g: 60,
        water_ml: null,
      },
    });
    expect(resolveEffectiveNutritionTarget([cutover], "2026-09-01").available).toBe(true);
  });

  it("keeps missing target nutrients unknown instead of coercing them to zero", () => {
    const result = resolveEffectiveNutritionTarget([
      period({
        effective_from: "2026-08-25",
        calories: 2000,
        protein_g: null,
        carbs_g: null,
        fat_g: 60,
        water_ml: null,
      }),
    ], "2026-08-25");

    expect(result.available).toBe(true);
    expect(result.values).toMatchObject({
      calories: 2000,
      protein_g: null,
      carbs_g: null,
      fat_g: 60,
      water_ml: null,
    });
  });
});
