import { describe, expect, it } from "vitest";
import { validateFoodNameFact, type FoodNameFact } from "./names";

const base: FoodNameFact = {
  foodId: "food-1",
  languageTag: "en",
  role: "synonym",
  text: "Test food",
  normalizedText: "test food",
  scriptCode: "Latn",
  origin: "curated",
  sourceRecordId: null,
  policyVersion: "test-v1",
};

describe("validateFoodNameFact", () => {
  it("accepts an open non-three-locale language tag when source provenance is present", () => {
    const value = validateFoodNameFact({
      ...base,
      languageTag: "fr-CA",
      role: "source_name",
      text: "Aliment test",
      normalizedText: "aliment test",
      origin: "source",
      sourceRecordId: "source-1",
    });
    expect(value.languageTag).toBe("fr-CA");
  });

  it("rejects source-origin names without source provenance", () => {
    expect(() => validateFoodNameFact({
      ...base,
      origin: "source",
      sourceRecordId: null,
    })).toThrow(/source|provenance/i);
  });

  it("rejects source-name facts without source provenance even when origin is curated", () => {
    expect(() => validateFoodNameFact({
      ...base,
      role: "source_name",
      origin: "curated",
      sourceRecordId: null,
    })).toThrow(/source|provenance/i);
  });

  it("accepts source-backed source-name facts", () => {
    const value = validateFoodNameFact({
      ...base,
      role: "source_name",
      origin: "source",
      sourceRecordId: "source-1",
    });
    expect(value.sourceRecordId).toBe("source-1");
  });

  it("represents Arabizi as Arabic-context Latin-script curated transliteration without source provenance", () => {
    const value = validateFoodNameFact({
      ...base,
      languageTag: "ar",
      role: "transliteration",
      text: "foul medames",
      normalizedText: "foul medames",
      scriptCode: "Latn",
      origin: "curated",
      sourceRecordId: null,
    });
    expect(value).toMatchObject({
      languageTag: "ar",
      scriptCode: "Latn",
      role: "transliteration",
      sourceRecordId: null,
    });
    expect(value.languageTag).not.toBe("arabizi");
  });

  it("rejects blank required presentation facts", () => {
    expect(() => validateFoodNameFact({
      ...base,
      languageTag: " ",
    })).toThrow(/language/i);
  });
});
