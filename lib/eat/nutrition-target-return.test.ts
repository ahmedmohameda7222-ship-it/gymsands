import { describe, expect, it } from "vitest";
import {
  buildNutritionTargetsDateHref,
  parseNutritionTargetsReturnDestination,
  resolveNutritionTargetsReturnHref,
  safeCustomNutritionTargetsReturnHref
} from "@/lib/eat/nutrition-target-return";

describe("Nutrition Targets return destination", () => {
  it("uses the initial selected date in default mode", () => {
    const destination = parseNutritionTargetsReturnDestination(null);
    expect(resolveNutritionTargetsReturnHref(destination, "2026-07-12")).toBe("/calories?date=2026-07-12&view=day");
  });

  it("follows forward, backward, and calendar date changes in default mode", () => {
    const destination = parseNutritionTargetsReturnDestination(undefined);
    expect(resolveNutritionTargetsReturnHref(destination, "2026-07-13")).toContain("date=2026-07-13");
    expect(resolveNutritionTargetsReturnHref(destination, "2026-07-11")).toContain("date=2026-07-11");
    expect(resolveNutritionTargetsReturnHref(destination, "2026-08-02")).toContain("date=2026-08-02");
  });

  it("does not write a generated fallback return into default date navigation", () => {
    expect(buildNutritionTargetsDateHref("2026-07-13", { kind: "default-eat" })).toBe("/settings/nutrition-targets?date=2026-07-13");
  });

  it("preserves an explicit safe custom return after date changes", () => {
    const destination = parseNutritionTargetsReturnDestination("/dashboard?tab=today");
    expect(destination).toEqual({ kind: "custom", href: "/dashboard?tab=today" });
    expect(resolveNutritionTargetsReturnHref(destination, "2026-07-13")).toBe("/dashboard?tab=today");
    expect(buildNutritionTargetsDateHref("2026-07-13", destination)).toBe("/settings/nutrition-targets?date=2026-07-13&return=%2Fdashboard%3Ftab%3Dtoday");
  });

  it.each([
    "https://example.com/steal",
    "//example.com/steal",
    "/\\example.com/steal",
    "\\example.com\\steal",
    "javascript:alert(1)"
  ])("rejects unsafe return %s", (value) => {
    expect(safeCustomNutritionTargetsReturnHref(value)).toBeNull();
    const destination = parseNutritionTargetsReturnDestination(value);
    expect(resolveNutritionTargetsReturnHref(destination, "2026-07-14")).toBe("/calories?date=2026-07-14&view=day");
  });

  it("keeps Return to Eat navigation compatible with the unsaved guard callback model", () => {
    const destination = parseNutritionTargetsReturnDestination(null);
    const intended = resolveNutritionTargetsReturnHref(destination, "2026-07-15");
    let navigated = "";
    const guardedRun = () => { navigated = intended; };
    expect(navigated).toBe("");
    guardedRun();
    expect(navigated).toBe("/calories?date=2026-07-15&view=day");
  });
});
