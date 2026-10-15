import { describe, expect, it } from "vitest";
import { selectUsdaFoundationCanary } from "./canary";
import type { UsdaFoundationFood, UsdaFoundationLock } from "./index";
import type { FoodCatalogMatchIndex } from "../matching";
import sourceLock from "../../../../data/food-catalog/source-locks/usda-foundation-2026-04.json";

const lock = sourceLock as unknown as UsdaFoundationLock;
const index: FoodCatalogMatchIndex = {
  sourceIdentities: [], gtinOwners: [], redirects: [],
  semanticIdentities: [], qualifiedAliases: [], possibleDuplicateNames: []
};
function food(id: number, kind: "strong" | "missing" | "edge" | "reject"): UsdaFoundationFood {
  const nutrient = (num: number, amount: number, unitName: string) =>
    ({ nutrient: { id: num, unitName }, amount });
  const foodNutrients = [
    nutrient(1003, 10, "g"), nutrient(1004, 6, "g"),
    nutrient(1005, kind === "reject" ? -1 : 20, "g"),
    nutrient(1093, 80, "mg"), nutrient(2000, 2, "g"), nutrient(1258, 3, "g")
  ];
  if (kind !== "missing") foodNutrients.push(nutrient(2048, 174, "kcal"));
  if (kind !== "edge") foodNutrients.push(nutrient(1079, 2, "g"));
  return {
    fdcId: id, ndbNumber: String(20000 + id), dataType: "Foundation",
    description: "Source Food " + id + ", raw",
    foodCategory: { description: ["Fruit", "Dairy", "Grains", "Vegetables"][id % 4] },
    foodNutrients,
    foodPortions: kind === "edge" ? [] : [{
      id: id + 9000, amount: 1, gramWeight: 25,
      measureUnit: { id: 10, name: "portion" }
    }]
  };
}
function source() {
  const foods = [
    ...Array.from({ length: 70 }, (_, i) => food(i + 1, "strong")),
    ...Array.from({ length: 14 }, (_, i) => food(100 + i, "missing")),
    ...Array.from({ length: 14 }, (_, i) => food(200 + i, "edge")),
    ...Array.from({ length: 10 }, (_, i) => food(300 + i, "reject"))
  ];
  return { sourceZipSha256: lock.sourceChecksumSha256, sourceZipBytes: lock.sourceBytes, foods };
}
describe("USDA Plan 9 1A1 canary", () => {
  it("selects 60/10/10 accepted, distinct, source-backed Foods and retains rejected records outside canary", () => {
    const result = selectUsdaFoundationCanary(lock, source(), index);
    const rows = result.selection.rows;
    expect(rows).toHaveLength(80);
    expect(new Set(rows.map(r => r.fdcId)).size).toBe(80);
    expect(rows.filter(r => r.cohort === "strong")).toHaveLength(60);
    expect(rows.filter(r => r.cohort === "missingEnergy")).toHaveLength(10);
    expect(rows.filter(r => r.cohort === "evidenceEdge")).toHaveLength(10);
    expect(rows.filter(r => r.cohort === "missingEnergy").every(r => r.calories === null)).toBe(true);
    expect(rows.every(r => Boolean(r.ndbNumber && r.description && r.category))).toBe(true);
    expect(result.canary.manifestContent.expectedMutations).toMatchObject({
      input: 80, accepted: 80, created: 80, rejected: 0, quarantined: 0
    });
  });
  it("is reproducible when the source array order changes", () => {
    const original = source();
    const a = selectUsdaFoundationCanary(lock, original, index);
    const b = selectUsdaFoundationCanary(lock, { ...original, foods: [...original.foods].reverse() }, index);
    expect(b.selectionChecksumSha256).toBe(a.selectionChecksumSha256);
    expect(b.matchIndexChecksumSha256).toBe(a.matchIndexChecksumSha256);
    expect(b.canary.manifestContentChecksumSha256).toBe(a.canary.manifestContentChecksumSha256);
    expect(b.canary.semanticBatchIdentityChecksumSha256).toBe(a.canary.semanticBatchIdentityChecksumSha256);
  });
  it("changes manifest identity for a canonical source match and preserves the canonical owner", () => {
    const a = selectUsdaFoundationCanary(lock, source(), index);
    const id = a.selection.rows[0]!.fdcId;
    const actualIndex: FoodCatalogMatchIndex = { ...index, sourceIdentities: [{
      provider: "USDA_FDC", dataset: "FoundationFoods", sourceVersion: "2026-04-30",
      sourceRecordId: String(id), foodId: "existing-plaivra-food-id"
    }] };
    const b = selectUsdaFoundationCanary(lock, source(), actualIndex);
    expect(b.canary.manifestContent.expectedMutations.matched).toBe(1);
    expect(b.canary.manifestContentChecksumSha256).not.toBe(a.canary.manifestContentChecksumSha256);
    expect(b.matchIndexChecksumSha256).not.toBe(a.matchIndexChecksumSha256);
  });
  it("fails closed for an insufficient accepted cohort or wrong locked source", () => {
    const s = source();
    expect(() => selectUsdaFoundationCanary(lock, { ...s, foods: s.foods.slice(0, 5) }, index))
      .toThrow(/cohort shortage/);
    expect(() => selectUsdaFoundationCanary(lock, { ...s, sourceZipSha256: "f".repeat(64) }, index))
      .toThrow(/checksum/i);
  });
});
