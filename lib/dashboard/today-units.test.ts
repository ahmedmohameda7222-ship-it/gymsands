import { describe, expect, it } from "vitest";
import { formatEnergy, formatLiquid, formatWeight } from "@/lib/dashboard/today-units";

describe("today units", () => {
  it("formats saved display units", () => {
    expect(formatEnergy(100, "kJ")).toBe("418 kJ");
    expect(formatLiquid(1000, "ml")).toBe("1000 ml");
    expect(formatLiquid(1000, "oz")).toBe("33.8 oz");
    expect(formatWeight(100, "lb")).toBe("220.5 lb");
  });
});
