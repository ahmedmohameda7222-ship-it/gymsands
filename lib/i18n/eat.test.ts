import { describe, expect, it } from "vitest";
import { eatDictionaries } from "@/lib/i18n/eat";

const stateKeys = [
  "loading", "searchFailed", "savedMealsFailed", "weekFailed", "previousWeek", "nextWeek",
  "productLoadFailed", "barcodeLookupFailed", "openingCamera", "cameraReady", "criticalConsistencyError",
  "adherenceUnavailableTargets", "adherenceNotConfigured", "foodBuilderTitle", "discardBuilderTitle"
] as const;

describe("Eat localization dictionaries", () => {
  it("contains complete English, German, and Arabic dictionaries", () => {
    const englishKeys = Object.keys(eatDictionaries.en).sort();
    expect(Object.keys(eatDictionaries.de).sort()).toEqual(englishKeys);
    expect(Object.keys(eatDictionaries.ar).sort()).toEqual(englishKeys);
  });

  it("does not fall back to English for German state labels", () => {
    stateKeys.forEach((key) => expect(eatDictionaries.de[key]).not.toBe(eatDictionaries.en[key]));
    expect(eatDictionaries.de.loading).toContain("geladen");
    expect(eatDictionaries.de.previousWeek).toContain("Woche");
  });

  it("does not fall back to English for Arabic state labels", () => {
    stateKeys.forEach((key) => expect(eatDictionaries.ar[key]).not.toBe(eatDictionaries.en[key]));
    expect(eatDictionaries.ar.loading).toMatch(/[\u0600-\u06FF]/);
    expect(eatDictionaries.ar.previousWeek).toMatch(/[\u0600-\u06FF]/);
  });

  it("localizes estimator enum labels instead of exposing raw values", () => {
    expect(eatDictionaries.de.veryActive).not.toBe("very_active");
    expect(eatDictionaries.ar.fatLoss).not.toBe("fat_loss");
    expect(eatDictionaries.en.muscleGain).toBe("Muscle gain");
  });
});
