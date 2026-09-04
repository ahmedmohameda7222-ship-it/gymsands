import { describe, expect, it } from "vitest";
import type { FoodCatalogCandidateInput } from "./contracts";
import {
  isValidGtinCheckDigit,
  normalizeFoodCatalogCandidate,
  normalizeGtin
} from "./normalize";
import { validateFoodCatalogCandidate } from "./validate";

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

  it("selects the same display alias when duplicate normalized aliases arrive in reverse order", () => {
    const forward = normalizeFoodCatalogCandidate(candidate());
    const reversed = normalizeFoodCatalogCandidate(candidate({ aliases: [...candidate().aliases].reverse() }));

    expect(reversed.aliases).toEqual(forward.aliases);
    expect(reversed.aliases.find((alias) => alias.locale === "en")?.value).toBe("Greek yoghurt");
  });

  it("normalizes ordinary GTIN formatting while preserving malformed evidence for validation", () => {
    expect(normalizeGtin("4006 3813-3393 1")).toBe("4006381333931");
    expect(normalizeGtin("036000291452")).toBe("036000291452");
    expect(normalizeGtin("96385074")).toBe("96385074");
    expect(normalizeGtin("10012345000017")).toBe("10012345000017");
    expect(normalizeGtin("400638133393x")).toBe("400638133393x");
    expect(normalizeGtin("123456789")).toBe("123456789");
  });

  it("keeps malformed GTINs on the normalized candidate so validation rejects them", () => {
    const normalized = normalizeFoodCatalogCandidate(candidate({ gtins: ["4006 3813-339x 1"] }));

    expect(normalized.gtins).toEqual(["4006381339x1"]);
    expect(validateFoodCatalogCandidate(normalized).map((issue) => issue.code)).toContain("invalid_gtin");
  });

  it("does not let an invalid provider locale abort normalization", () => {
    const normalized = normalizeFoodCatalogCandidate(candidate({
      aliases: [{ locale: "en_US", value: " Fixture Alias " }],
      names: [{ locale: "not a locale!", script: null, role: "source", value: " Fixture Name " }]
    }));

    expect(normalized.aliases[0]?.normalizedValue).toBe("fixture alias");
    expect(normalized.names[0]?.normalizedValue).toBe("fixture name");
    expect(validateFoodCatalogCandidate(normalized).map((issue) => issue.code)).toContain("invalid_alias");
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
