import { describe, expect, it } from "vitest";

import { startOfMealPlanWeek, weekContainsDate } from "@/lib/nutrition-v1/week-start";

describe("Nutrition V1 Meal Plan week boundaries", () => {
  it("derives the containing week for Saturday, Sunday, and Monday authorities", () => {
    expect(startOfMealPlanWeek("2026-08-26", 6)).toBe("2026-08-22");
    expect(startOfMealPlanWeek("2026-08-26", 7)).toBe("2026-08-23");
    expect(startOfMealPlanWeek("2026-08-26", 1)).toBe("2026-08-24");
  });

  it("recognizes dates inside a seven-day authoritative week without assuming Monday", () => {
    expect(weekContainsDate("2026-08-22", "2026-08-26")).toBe(true);
    expect(weekContainsDate("2026-08-22", "2026-08-28")).toBe(true);
    expect(weekContainsDate("2026-08-22", "2026-08-29")).toBe(false);
  });
});
