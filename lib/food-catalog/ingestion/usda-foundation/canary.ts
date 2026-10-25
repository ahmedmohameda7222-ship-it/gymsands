import { createHash } from "node:crypto";
import { buildFoodCatalogDryRun } from "../engine";
import { stableJson } from "../manifest";
import type { FoodCatalogMatchIndex } from "../matching";
import { createUsdaFoundationAdapter, type UsdaFoundationArtifact, type UsdaFoundationLock } from "./index";

const digest = (value: unknown) => createHash("sha256").update(stableJson(value)).digest("hex");
const optionals = ["fiber_g", "saturated_fat_g", "sugars_g", "sodium_mg"] as const;

export function selectUsdaFoundationCanary(lock: UsdaFoundationLock, artifact: UsdaFoundationArtifact, index: FoodCatalogMatchIndex) {
  const adapter = createUsdaFoundationAdapter(lock);
  const full = buildFoodCatalogDryRun(adapter, artifact, index);
  const byId = new Map(artifact.foods.map(food => [String(food.fdcId), food]));
  const accepted = full.manifestContent.candidates.filter(x => x.disposition.kind === "accept").map(row => {
    const food = byId.get(row.candidate.sourceRecordId);
    if (!food) throw new Error("Missing original Foundation source record.");
    const missing: string[] = optionals.filter(k => row.candidate.nutrition[k] === null);
    if (!row.candidate.servings.length) missing.push("no-supported-source-serving");
    return { food, row, category: food.foodCategory?.description ?? "(unclassified)", missing };
  });
  type Entry = typeof accepted[number];
  function take(items: Entry[], n: number): Entry[] {
    const groups = new Map<string, Entry[]>();
    for (const item of items) groups.set(item.category, [...(groups.get(item.category) ?? []), item]);
    for (const group of groups.values()) group.sort((a, b) => a.food.fdcId - b.food.fdcId);
    const keys = [...groups.keys()].sort();
    const result: Entry[] = [];
    while (result.length < n) {
      let progressed = false;
      for (const key of keys) {
        if (result.length === n) break;
        const next = groups.get(key)!.shift();
        if (next) { result.push(next); progressed = true; }
      }
      if (!progressed) break;
    }
    return result;
  }
  const strong = take(accepted.filter(x => {
    const n = x.row.candidate.nutrition;
    return n.calories !== null && n.protein_g !== null && n.fat_g !== null
      && n.carbs_g !== null && n.basis_amount === 100 && n.basis_unit === "g"
      && x.row.candidate.identityEvidence.semanticSignature !== null;
  }), 60);
  const used = new Set(strong.map(x => x.food.fdcId));
  const missingEnergy = take(accepted.filter(x => !used.has(x.food.fdcId) && x.row.candidate.nutrition.calories === null), 10);
  for (const x of missingEnergy) used.add(x.food.fdcId);
  const evidenceEdge = take(accepted.filter(x => !used.has(x.food.fdcId) && x.row.candidate.nutrition.calories !== null && x.missing.length > 0), 10);
  if (strong.length !== 60 || missingEnergy.length !== 10 || evidenceEdge.length !== 10) {
    throw new Error("Plan 9 canary cohort shortage: " + [strong.length, missingEnergy.length, evidenceEdge.length].join("/"));
  }
  const groups = { strong, missingEnergy, evidenceEdge };
  const rows = Object.entries(groups).flatMap(([cohort, entries]) => entries.map(x => ({
    cohort, fdcId: x.food.fdcId, ndbNumber: x.food.ndbNumber ?? null,
    description: x.food.description, category: x.category,
    calories: x.row.candidate.nutrition.calories, limitations: x.missing
  }))).sort((a,b) => a.fdcId - b.fdcId);
  const selectedFoods = rows.map(row => byId.get(String(row.fdcId))!);
  const canary = buildFoodCatalogDryRun(adapter, { ...artifact, foods: selectedFoods }, index);
  if (canary.manifestContent.expectedMutations.accepted !== 80 || canary.manifestContent.expectedMutations.input !== 80)
    throw new Error("Canary re-evaluation did not accept exactly 80 original source Foods.");
  const selection = { policy: "plan9-1a1-stratified-v1", cohortCounts: { strong: 60, missingEnergy: 10, evidenceEdge: 10 }, sourceChecksumSha256: lock.sourceChecksumSha256, configChecksumSha256: lock.configChecksumSha256, rows };
  return { selection, selectionChecksumSha256: digest(selection), matchIndexChecksumSha256: digest(index), canary };
}
