import { describe, expect, it } from "vitest";
import type { FoodCatalogCandidateInput } from "./contracts";
import {
  isValidGtinCheckDigit,
  normalizeFoodCatalogCandidate,
  normalizeGtin
} from "./normalize";

const candidate = (overrides: Partial<FoodCatalogCandidateInput> = {}): FoodCatalogCandidateInput => ({
  sourceRecordId: " source-1 ",
  sourceReference: null,
  sourceRecordChecksumSha256: null,
  canonicalName: "  Greek   Yogurt  ",
  brandName: "  Plaivra   Foods ",
  servingLabel: " 100   g ",
  category: "  Dairy ",
  cuisine: null,
  nutrition: {
    calories: null,
    protein_g: 0,
    carbs_g: -1,
    fat_g: 2,
    saturated_fat_g: null,
    fiber_g: null,
    sugars_g: null,
    sodium_mg: null,
    basis_amount: 100,
    basis_unit: "g"
  },
  aliases: [
    { locale: "de", value: " Joghurt  Griechisch " },
    { locale: "en", value: " Greek   yoghurt " },
    { locale: "en", value: "  greek yoghurt  " }
  ],
  gtins: ["4006 3813-3393 1", "036000291452", "4006381333931"],
  marketScopes: [
    { type: "region", code: "gcc", relevanceLevel: "secondary" },
    { type: "country", code: "de", relevanceLevel: "primary" },
    { type: "country", code: "DE", relevanceLevel: "primary" }
  ],
  globallyRelevant: false,
  sourceNutrition: { energy: "unknown" },
  sourceServing: null,
  ...overrides
});

describe("Food Catalog ingestion normalization", () => {
  it("trims and collapses stable display fields without inventing nutrition values", () => {
    const normalized = normalizeFoodCatalogCandidate(candidate());

    expect(normalized.sourceRecordId).toBe("source-1");
    expect(normalized.canonicalName).toBe("Greek Yogurt");
    expect(normalized.brandName).toBe("Plaivra Foods");
    expect(normalized.servingLabel).toBe("100 g");
    expect(normalized.category).toBe("Dairy");
    expect(normalized.nutrition.calories).toBeNull();
    expect(normalized.nutrition.protein_g).toBe(0);
    expect(normalized.nutrition.carbs_g).toBe(-1);
  });

  it("normalizes aliases deterministically while retaining a display value", () => {
    const normalized = normalizeFoodCatalogCandidate(candidate());

    expect(normalized.aliases).toEqual([
      { locale: "de", value: "Joghurt Griechisch", normalizedValue: "joghurt griechisch" },
      { locale: "en", value: "Greek yoghurt", normalizedValue: "greek yoghurt" }
    ]);
  });

  it("normalizes ordinary GTIN spaces/hyphens, rejects arbitrary characters, and limits accepted shapes", () => {
    expect(normalizeGtin("4006 3813-3393 1")).toBe("4006381333931");
    expect(normalizeGtin("036000291452")).toBe("036000291452");
    expect(normalizeGtin("96385074")).toBe("96385074");
    expect(normalizeGtin("10012345000017")).toBe("10012345000017");
    expect(normalizeGtin("400638133393x")).toBeNull();
    expect(normalizeGtin("123456789")).toBeNull();
  });

  it("validates GS1 Mod-10 check digits for GTIN-8/12/13/14", () => {
    for (const gtin of ["96385074", "036000291452", "4006381333931", "10012345000017"]) {
      expect(isValidGtinCheckDigit(gtin)).toBe(true);
    }
    expect(isValidGtinCheckDigit("4006381333932")).toBe(false);
  });

  it("sorts and dedupes GTINs and market scopes with uppercase scope codes", () => {
    const normalized = normalizeFoodCatalogCandidate(candidate());

    expect(normalized.gtins).toEqual(["036000291452", "4006381333931"]);
    expect(normalized.marketScopes).toEqual([
      { type: "country", code: "DE", relevanceLevel: "primary" },
      { type: "region", code: "GCC", relevanceLevel: "secondary" }
    ]);
  });
});
