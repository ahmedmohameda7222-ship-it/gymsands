import { describe, expect, it } from "vitest";
import { validateFoodNameFact } from "./names";

describe("validateFoodNameFact", () => {
  it("accepts an open non-three-locale language tag", () => {
    const value = validateFoodNameFact({
      foodId: "food-1",
      languageTag: "fr-CA",
      role: "source_name",
      text: "Aliment test",
      normalizedText: "aliment test",
      scriptCode: "Latn",
      origin: "source",
      sourceRecordId: "source-1",
      policyVersion: "test-v1",
    });
    expect(value.languageTag).toBe("fr-CA");
  });

  it("represents Arabizi as Arabic-context Latin-script transliteration", () => {
    const value = validateFoodNameFact({
      foodId: "food-1",
      languageTag: "ar",
      role: "transliteration",
      text: "foul medames",
      normalizedText: "foul medames",
      scriptCode: "Latn",
      origin: "curated",
      sourceRecordId: null,
      policyVersion: "test-v1",
    });
    expect(value).toMatchObject({ languageTag: "ar", scriptCode: "Latn", role: "transliteration" });
    expect(value.languageTag).not.toBe("arabizi");
  });

  it("rejects blank required presentation facts", () => {
    expect(() => validateFoodNameFact({
      foodId: "food-1",
      languageTag: " ",
      role: "synonym",
      text: "name",
      normalizedText: "name",
      scriptCode: null,
      origin: "curated",
      sourceRecordId: null,
      policyVersion: "test-v1",
    })).toThrow(/language/i);
  });
});
