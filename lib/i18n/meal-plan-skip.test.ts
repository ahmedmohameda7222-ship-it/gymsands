import { describe, expect, it } from "vitest";
import { translations } from "@/lib/i18n/translations";

describe("Meal Plan skip localization", () => {
  it("provides English, German and Arabic skip labels without fallback", () => {
    expect(translations.en["mealPlan.skip"]).toBe("Skip");
    expect(translations.de["mealPlan.skip"]).toBe("Überspringen");
    expect(translations.ar["mealPlan.skip"]).toBe("تخطي");
    expect(translations.en["mealPlan.statusSkipped"]).toBe("Skipped");
    expect(translations.de["mealPlan.statusSkipped"]).toBe("Übersprungen");
    expect(translations.ar["mealPlan.statusSkipped"]).toBe("تم التخطي");
  });

  it("keeps Arabic skip copy native and suitable for the RTL app direction", () => {
    expect(translations.ar["mealPlan.skipSuccess"]).toBe("تم تخطي الوجبة");
    expect(translations.ar["mealPlan.skipError"]).toBe("تعذر تخطي الوجبة");
    expect(translations.ar["mealPlan.skipSuccessDesc"]).not.toMatch(/[A-Za-z]{4,}/);
  });
});
