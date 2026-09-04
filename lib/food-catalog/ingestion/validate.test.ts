import { describe, expect, it } from "vitest";
import type { FoodCatalogNormalizedCandidate } from "./contracts";
import { validateFoodCatalogCandidate } from "./validate";

const candidate = (overrides: Partial<FoodCatalogNormalizedCandidate> = {}): FoodCatalogNormalizedCandidate => ({
  sourceRecordId: "record-1",
  sourceReference: null,
  sourceRecordChecksumSha256: "a".repeat(64),
  canonicalName: "Greek Yogurt",
  brandName: null,
  servingLabel: null,
  category: null,
  cuisine: null,
  nutrition: {
    calories: 120,
    protein_g: 10,
    carbs_g: 12,
    fat_g: 3,
    saturated_fat_g: 2,
    fiber_g: 0,
    sugars_g: 8,
    sodium_mg: 60,
    basis_amount: 100,
    basis_unit: "g"
  },
  aliases: [{ locale: "en", value: "Greek yoghurt", normalizedValue: "greek yoghurt" }],
  names: [],
  identityEvidence: {
    semanticSignature: null,
    preparation: null,
    state: null,
    form: null,
    structuredEvidenceKey: null
  },
  servings: [],
  taxonomyEvidence: [],
  gtins: ["4006381333931"],
  marketScopes: [{ type: "country", code: "DE", relevanceLevel: "primary" }],
  globallyRelevant: false,
  sourceNutrition: null,
  sourceServing: null,
  ...overrides
});

const codes = (value: FoodCatalogNormalizedCandidate) =>
  validateFoodCatalogCandidate(value).map((issue) => issue.code);

describe("Food Catalog structural validation/quarantine", () => {
  it("reports blank canonical names", () => {
    expect(codes(candidate({ canonicalName: "   " }))).toContain("missing_name");
  });

  it("reports missing source record identity", () => {
    expect(codes(candidate({ sourceRecordId: "" }))).toContain("missing_source_id");
  });

  it("reports malformed optional source-record checksums", () => {
    expect(codes(candidate({ sourceRecordChecksumSha256: "not-a-sha" }))).toContain("invalid_source_checksum");
  });

  it("reports negative nutrients without coercing them", () => {
    const value = candidate({ nutrition: { ...candidate().nutrition, carbs_g: -0.5 } });
    expect(codes(value)).toContain("invalid_nutrition");
    expect(value.nutrition.carbs_g).toBe(-0.5);
  });

  it("reports incomplete nutrition basis when nutrition is present", () => {
    expect(codes(candidate({ nutrition: { ...candidate().nutrition, basis_unit: null } }))).toContain("invalid_basis");
    expect(codes(candidate({ nutrition: { ...candidate().nutrition, basis_amount: null } }))).toContain("invalid_basis");
  });

  it("reports structurally invalid aliases and locale tags", () => {
    expect(codes(candidate({ aliases: [{ locale: "", value: "Alias", normalizedValue: "alias" }] }))).toContain("invalid_alias");
    expect(codes(candidate({ aliases: [{ locale: "en", value: "", normalizedValue: "" }] }))).toContain("invalid_alias");
    expect(codes(candidate({ aliases: [{ locale: "not a locale!", value: "Alias", normalizedValue: "alias" }] }))).toContain("invalid_alias");
  });

  it("reports structurally invalid name evidence and locale tags", () => {
    expect(codes(candidate({ names: [{
      locale: "not a locale!",
      script: null,
      role: "source",
      value: "Source name",
      normalizedValue: "source name"
    }] }))).toContain("invalid_alias");
  });

  it("reports invalid country scope codes", () => {
    expect(codes(candidate({ marketScopes: [{ type: "country", code: "DEU", relevanceLevel: "primary" }] }))).toContain("invalid_market_scope");
    expect(codes(candidate({ marketScopes: [{ type: "country", code: "de", relevanceLevel: "primary" }] }))).toContain("invalid_market_scope");
  });

  it("reports invalid region scope codes", () => {
    expect(codes(candidate({ marketScopes: [{ type: "region", code: "1EU", relevanceLevel: "primary" }] }))).toContain("invalid_market_scope");
    expect(codes(candidate({ marketScopes: [{ type: "region", code: "EUROPEAN-REGION-TOO-LONG", relevanceLevel: "primary" }] }))).toContain("invalid_market_scope");
  });

  it("reports malformed GTIN values", () => {
    expect(codes(candidate({ gtins: ["40063813339x1"] }))).toContain("invalid_gtin");
    expect(codes(candidate({ gtins: ["123456789"] }))).toContain("invalid_gtin");
  });

  it("reports bad GTIN check digits", () => {
    expect(codes(candidate({ gtins: ["4006381333932"] }))).toContain("invalid_gtin_check_digit");
  });

  it("reports duplicate GTINs when the normalization contract is bypassed", () => {
    expect(codes(candidate({ gtins: ["4006381333931", "4006381333931"] }))).toContain("duplicate_gtin_in_candidate");
  });

  it("accepts null nutrient values without fabricating zero", () => {
    const value = candidate({ nutrition: { ...candidate().nutrition, sugars_g: null, fiber_g: null } });
    expect(codes(value)).not.toContain("invalid_nutrition");
    expect(value.nutrition.sugars_g).toBeNull();
    expect(value.nutrition.fiber_g).toBeNull();
  });

  it("accepts real zero nutrient values", () => {
    const value = candidate({ nutrition: { ...candidate().nutrition, fat_g: 0, fiber_g: 0 } });
    expect(codes(value)).not.toContain("invalid_nutrition");
    expect(value.nutrition.fat_g).toBe(0);
  });

  it("accepts all-null nutrition with no basis", () => {
    const value = candidate({
      nutrition: {
        calories: null,
        protein_g: null,
        carbs_g: null,
        fat_g: null,
        saturated_fat_g: null,
        fiber_g: null,
        sugars_g: null,
        sodium_mg: null,
        basis_amount: null,
        basis_unit: null
      }
    });
    expect(validateFoodCatalogCandidate(value)).toEqual([]);
  });

  it("warns on a large calorie/macro discrepancy without changing listed calories", () => {
    const value = candidate({
      nutrition: {
        ...candidate().nutrition,
        calories: 500,
        protein_g: 10,
        carbs_g: 10,
        fat_g: 2
      }
    });
    const issues = validateFoodCatalogCandidate(value);
    expect(issues).toContainEqual(
      expect.objectContaining({ code: "suspicious_calorie_macro_delta", severity: "warning" })
    );
    expect(value.nutrition.calories).toBe(500);
  });
});
