import { describe, expect, it } from "vitest";
import {
  eatEnergyDisplayValue,
  eatEnergyInputToKcal,
  eatHeightDisplayValue,
  eatHeightInputToCm,
  eatLiquidDisplayValue,
  eatLiquidInputToMl,
  eatWeightDisplayValue,
  eatWeightInputToKg,
  formatEatEnergy,
  formatEatHeight,
  formatEatLiquid,
  formatEatWeight
} from "@/lib/eat/eat-units";

describe("Eat display-unit conversions", () => {
  it("keeps kcal canonical and reverses kJ input", () => {
    expect(eatEnergyDisplayValue(2000, "kcal")).toBe(2000);
    expect(eatEnergyDisplayValue(2000, "kJ")).toBe(8368);
    expect(eatEnergyInputToKcal(8368, "kJ")).toBe(2000);
    expect(formatEatEnergy(2000, "kJ", "en-GB")).toBe("8,368 kJ");
  });

  it("keeps ml canonical and reverses fluid-ounce input", () => {
    const ounces = eatLiquidDisplayValue(500, "oz");
    expect(ounces).toBe(16.9);
    expect(eatLiquidInputToMl(ounces, "oz")).toBeCloseTo(500, 0);
    expect(formatEatLiquid(3000, "ml", "en-GB")).toBe("3 L");
    expect(formatEatLiquid(500, "oz", "en-GB")).toBe("16.9 oz");
  });

  it("keeps kg canonical and reverses pound input", () => {
    const pounds = eatWeightDisplayValue(85, "lb");
    expect(pounds).toBe(187.4);
    expect(eatWeightInputToKg(pounds, "lb")).toBeCloseTo(85, 1);
    expect(formatEatWeight(85, "lb", "en-GB")).toBe("187.4 lb");
  });

  it("keeps cm canonical and supports feet/inches", () => {
    expect(eatHeightDisplayValue(175)).toEqual({ cm: 175, feet: 5, inches: 8.9 });
    expect(eatHeightInputToCm({ feet: 5, inches: 8.9, unit: "ft-in" })).toBeCloseTo(175, 1);
    expect(eatHeightInputToCm({ cm: 175, unit: "cm" })).toBe(175);
    expect(formatEatHeight(175, "ft-in", "en-GB")).toBe("5 ft 8.9 in");
  });
});
