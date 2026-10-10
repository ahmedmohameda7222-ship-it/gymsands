/**
 * Plan 8 1A0 offline-only release dry run. No database clients, migrations, or
 * Production runtime entry points are imported by this command.
 *
 * Usage (repository root, Node 24):
 *   node scripts/food-catalog-plan8-1a0-runner.mjs \
 *     --zip /path/to/FoodData_Central_foundation_food_json_2026-04-30.zip \
 *     --index data/food-catalog/source-locks/plan8-1a0-empty-match-index.json \
 *     --output /tmp/plaivra-plan8-run1
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { buildFoodCatalogDryRun } from "../lib/food-catalog/ingestion/engine";
import { stableJson } from "../lib/food-catalog/ingestion/manifest";
import type { FoodCatalogMatchIndex } from "../lib/food-catalog/ingestion/matching";
import {
  createUsdaFoundationAdapter,
  parseUsdaFoundationJson,
  type UsdaFoundationLock
} from "../lib/food-catalog/ingestion/usda-foundation";

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseArgs(): Record<string, string> {
  const result: Record<string, string> = {};
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = process.argv[index];
    const value = process.argv[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error("Expected --zip PATH --index PATH --output DIRECTORY [--lock PATH].");
    }
    result[key.slice(2)] = value;
  }
  for (const required of ["zip", "index", "output"]) {
    if (!result[required]) throw new Error(`Missing required --${required}.`);
  }
  for (const key of Object.keys(result)) {
    if (!["zip", "index", "output", "lock"].includes(key)) throw new Error(`Unknown option --${key}.`);
  }
  return result;
}

function assertOutputDestination(destination: string): void {
  const relative = path.relative(process.cwd(), destination).split(path.sep);
  if (path.resolve(destination) === process.cwd()) throw new Error("Cannot write dry-run evidence at repository root.");
  if (!relative.includes("..") && ["app", "lib", "data", "supabase", ".github", "services"].includes(relative[0]!)) {
    throw new Error("Dry-run output may not target a Production source/schema directory.");
  }
}

function assertMatchIndex(raw: unknown): asserts raw is {
  snapshotId: string;
  captureMethod: string;
  readOnly: true;
  productionMutationsAuthorized: false;
  matchIndex: FoodCatalogMatchIndex;
} {
  if (!raw || typeof raw !== "object") throw new Error("Match-index snapshot must be explicit.");
  const obj = raw as Record<string, unknown>;
  if (typeof obj.snapshotId !== "string" || !obj.snapshotId
    || typeof obj.captureMethod !== "string" || !obj.captureMethod
    || obj.readOnly !== true || obj.productionMutationsAuthorized !== false
    || !obj.matchIndex || typeof obj.matchIndex !== "object") {
    throw new Error("Refusing match index without explicit read-only authority/provenance.");
  }
  const i = obj.matchIndex as Record<string, unknown>;
  for (const key of ["sourceIdentities", "gtinOwners", "redirects", "semanticIdentities", "qualifiedAliases", "possibleDuplicateNames"]) {
    if (!Array.isArray(i[key])) throw new Error(`Missing canonical match-index collection: ${key}.`);
  }
}

function countReasons(
  candidates: ReturnType<typeof buildFoodCatalogDryRun>["manifestContent"]["candidates"],
  type: "issues" | "quarantine"
): Record<string, number> {
  const map = new Map<string, number>();
  for (const entry of candidates) {
    const reasons = type === "issues"
      ? entry.issues.map((issue) => `${issue.severity}:${issue.code}`)
      : entry.disposition.kind === "quarantine" ? entry.disposition.reasonCodes : [];
    for (const reason of reasons) map.set(reason, (map.get(reason) ?? 0) + 1);
  }
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function tally(strings: readonly string[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of strings) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function buildQa(
  lock: UsdaFoundationLock,
  indexSnapshot: { snapshotId: string; captureMethod: string; matchIndex: FoodCatalogMatchIndex },
  indexChecksum: string,
  parsed: ReturnType<typeof parseUsdaFoundationJson>,
  result: ReturnType<typeof buildFoodCatalogDryRun>
) {
  const rows = result.manifestContent.candidates;
  const n = rows.length;
  const counts = result.manifestContent.expectedMutations;
  if (counts.input !== parsed.foods.length
    || counts.accepted + counts.rejected + counts.quarantined !== counts.input
    || counts.matched + counts.created !== counts.accepted) {
    throw new Error("Plan 8 outcome reconciliation failure.");
  }

  const fields = ["calories", "protein_g", "fat_g", "carbs_g", "saturated_fat_g", "fiber_g", "sugars_g", "sodium_mg"] as const;
  const nutritionCoverage = Object.fromEntries(fields.map((key) => {
    const present = rows.filter((r) => r.candidate.nutrition[key] !== null).length;
    return [key, { present, missing: n - present }];
  }));
  const energyIds: string[] = [];
  const categories: string[] = [];
  const ndbStatuses: string[] = [];
  const malformedNdbExamples: Array<{ fdcId: string; rawNdbNumber: unknown }> = [];
  const normalizedNdbOwners = new Map<string, string[]>();
  const selectedSugarIds: string[] = [];
  const sugar2000Ids: string[] = [];
  const sugar1063Ids: string[] = [];
  const sugarBothIds: string[] = [];
  const sugarConflicts: Array<{
    fdcId: string; description: string; nutrient2000: number; nutrient1063: number; selectedId: number | null;
  }> = [];
  const negativeCarbs: Array<{
    fdcId: string; description: string; value: number; decision: string; disposition: string;
    issueCodes: string[];
  }> = [];
  let legacy1008Present = 0;
  let legacy1008PresentButExcluded = 0;
  let noEnergyAuthorityAny = 0;
  let numericLoqSelectedZero = 0;
  let textualLoqSelectedZero = 0;
  let rawNumericLoqWithZero = 0;
  let sourcePortions = 0;
  let unusablePortions = 0;
  let retainedPortions = 0;
  let exactPortionFoods = 0;
  let mappedTaxonomyFoods = 0;
  let belowLimitObservations = 0;
  const transformClasses = { unchanged: n, safeNormalized: 0, rejectedUnsafe: 0 };
  for (const { candidate, decision, disposition, issues } of rows) {
    const nutrientEvidence = candidate.sourceNutrition as {
      selectedNutrientIds: Record<string, number | null>;
      belowLimitNutrientIds: number[];
      numericLoqNutrientIds: number[];
      textualLoqNutrientIds: number[];
      ndbNumber: unknown;
      normalizedNdbNumber: string | null;
      ndbIdentityStatus: "present" | "missing" | "malformed";
      rawNutrients: Array<{ nutrient: { id: number }; amount?: number | null; loq?: number | null }>;
    };
    const amounts = new Map(nutrientEvidence.rawNutrients.map((nutrient) => [
      nutrient.nutrient.id, nutrient.amount
    ]));
    const rawAmount = (id: number): number | null => {
      const value = amounts.get(id);
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    };
    const hasAmount = (id: number): boolean => rawAmount(id) !== null;
    const selectedEnergyId = nutrientEvidence.selectedNutrientIds.calories;
    const raw2000 = rawAmount(2000);
    const raw1063 = rawAmount(1063);
    selectedSugarIds.push(String(nutrientEvidence.selectedNutrientIds.sugars_g ?? "missing"));
    if (raw2000 !== null) sugar2000Ids.push(candidate.sourceRecordId);
    if (raw1063 !== null) sugar1063Ids.push(candidate.sourceRecordId);
    if (raw2000 !== null && raw1063 !== null) {
      sugarBothIds.push(candidate.sourceRecordId);
      if (raw2000 !== raw1063) sugarConflicts.push({
        fdcId: candidate.sourceRecordId,
        description: candidate.canonicalName,
        nutrient2000: raw2000,
        nutrient1063: raw1063,
        selectedId: nutrientEvidence.selectedNutrientIds.sugars_g
      });
    }
    if (hasAmount(1008)) {
      legacy1008Present++;
      if (selectedEnergyId !== 2048 && selectedEnergyId !== 2047) legacy1008PresentButExcluded++;
    }
    if (![2048, 2047, 1008].some(hasAmount)) noEnergyAuthorityAny++;
    const sourceCarbs = rawAmount(1005);
    if (sourceCarbs !== null && sourceCarbs < 0) negativeCarbs.push({
      fdcId: candidate.sourceRecordId,
      description: candidate.canonicalName,
      value: sourceCarbs,
      decision: decision.kind,
      disposition: disposition.kind,
      issueCodes: issues.map((issue) => issue.code)
    });
    ndbStatuses.push(nutrientEvidence.ndbIdentityStatus);
    if (nutrientEvidence.ndbIdentityStatus === "malformed" && malformedNdbExamples.length < 12) {
      malformedNdbExamples.push({
        fdcId: candidate.sourceRecordId, rawNdbNumber: nutrientEvidence.ndbNumber
      });
    }
    if (nutrientEvidence.normalizedNdbNumber !== null) {
      const owners = normalizedNdbOwners.get(nutrientEvidence.normalizedNdbNumber) ?? [];
      owners.push(candidate.sourceRecordId);
      normalizedNdbOwners.set(nutrientEvidence.normalizedNdbNumber, owners);
    }
    numericLoqSelectedZero += nutrientEvidence.numericLoqNutrientIds.length;
    textualLoqSelectedZero += nutrientEvidence.textualLoqNutrientIds.length;
    rawNumericLoqWithZero += nutrientEvidence.rawNutrients.filter((nutrient) =>
      nutrient.amount === 0 && typeof nutrient.loq === "number"
      && Number.isFinite(nutrient.loq) && nutrient.loq > 0
    ).length;
    const servingEvidence = candidate.sourceServing as {
      rawPortions: unknown[];
      unusablePortionIds: number[];
    };
    energyIds.push(String(nutrientEvidence.selectedNutrientIds.calories ?? "missing"));
    belowLimitObservations += nutrientEvidence.belowLimitNutrientIds.length;
    sourcePortions += servingEvidence.rawPortions.length;
    unusablePortions += servingEvidence.unusablePortionIds.length;
    retainedPortions += candidate.servings.length;
    if (candidate.servings.length > 0) exactPortionFoods += 1;
    if (candidate.taxonomyEvidence.some((evidence) => evidence.mappedTaxonomyId !== null)) mappedTaxonomyFoods += 1;
    for (const category of candidate.taxonomyEvidence) categories.push(category.taxonomy);
    if (candidate.canonicalName !== candidate.names.find((name) => name.role === "source")?.value) {
      throw new Error("USDA Foundation naming policy violated: source description mutated.");
    }
  }
  if (sourcePortions !== unusablePortions + retainedPortions) {
    throw new Error("Source portion evidence count reconciliation failure.");
  }
  const categoryDistribution = tally(categories);
  sugarConflicts.sort((a,b) => Number(a.fdcId) - Number(b.fdcId));
  negativeCarbs.sort((a,b) => Number(a.fdcId) - Number(b.fdcId));
  const duplicatedNdbEvidence = [...normalizedNdbOwners.entries()]
    .filter(([, owners]) => owners.length > 1)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 20)
    .map(([ndbNumber, fdcIds]) => ({ ndbNumber, fdcIds: [...fdcIds].sort() }));
  const sourceIdentities = new Set(indexSnapshot.matchIndex.sourceIdentities.map((e) =>
    [e.provider, e.dataset, e.sourceVersion, e.sourceRecordId].join("\u0000")));
  const sourceIdentityMatches = rows.filter((r) => r.decision.kind === "match"
    && sourceIdentities.has([
      lock.provider, lock.dataset, lock.sourceVersion, r.candidate.sourceRecordId
    ].join("\u0000"))).length;
  const decisions = tally(rows.map((entry) => entry.decision.kind));
  const dispositions = tally(rows.map((entry) => entry.disposition.kind));
  const anomalous = rows.filter((entry) => entry.disposition.kind !== "accept" || entry.issues.length > 0)
    .slice(0, 12)
    .map((entry) => ({
      fdcId: entry.candidate.sourceRecordId,
      description: entry.candidate.canonicalName,
      decision: entry.decision.kind,
      disposition: entry.disposition.kind,
      issueCodes: entry.issues.map((issue) => issue.code),
      reasons: entry.disposition.reasonCodes
    }));
  return {
    schemaVersion: "plaivra-food-catalog-usda-foundation-1a0-qa-v2",
    status: "OFFLINE_EVIDENCE_ONLY",
    productionAuthority: false,
    source: {
      provider: lock.provider, dataset: lock.dataset, release: lock.release,
      sourceReleaseDate: lock.sourceReleaseDate, filename: lock.sourceFilename,
      zipBytes: lock.sourceBytes, zipSha256: lock.sourceChecksumSha256,
      importerVersion: lock.importerVersion, adapterVersion: lock.config.adapterVersion,
      configChecksumSha256: lock.configChecksumSha256, licenseName: lock.licenseName,
      licenseReference: lock.licenseReference, officialReference: lock.sourceUrl
    },
    input: {
      jsonArraySlots: n + parsed.nullSlotCount,
      nullNonRecordSlots: parsed.nullSlotCount,
      foundationSourceRecords: n,
      parsedCandidates: n,
      matchIndexSnapshot: indexSnapshot.snapshotId,
      matchIndexCaptureMethod: indexSnapshot.captureMethod,
      matchIndexChecksumSha256: indexChecksum
    },
    population: { ...counts, decisions, dispositions },
    identity: {
      algorithm: "usda-foundation-semantic-identity-v1",
      sourceRecordIdentity: "provider+dataset+sourceVersion+fdcId",
      rawNdbStatusCounts: {
        present: ndbStatuses.filter((v) => v === "present").length,
        missing: ndbStatuses.filter((v) => v === "missing").length,
        malformed: ndbStatuses.filter((v) => v === "malformed").length
      },
      distinctUsableNdbNumbers: normalizedNdbOwners.size,
      duplicatedNdbEvidence,
      malformedNdbExamples
    },
    sourcePolicies: {
      energyAuthorityPrecedence: [2048, 2047],
      legacy1008FallbackEnabled: false,
      totalSugarsAuthorityPrecedence: [2000, 1063],
      negativeCarbohydratePolicy: "reject_not_clamp"
    },
    nutrition: {
      coverage: nutritionCoverage,
      selectedEnergyAuthorities: tally(energyIds),
      atwaterSpecific: energyIds.filter((v) => v === "2048").length,
      atwaterGeneral: energyIds.filter((v) => v === "2047").length,
      legacyFallback: energyIds.filter((v) => v === "1008").length,
      legacy1008Selected: energyIds.filter((v) => v === "1008").length,
      legacy1008Present,
      legacy1008PresentButIntentionallyExcluded: legacy1008PresentButExcluded,
      no2048Or2047Or1008EnergyAuthority: noEnergyAuthorityAny,
      missingEnergy: energyIds.filter((v) => v === "missing").length,
      selectedSugarsAuthorities: tally(selectedSugarIds),
      totalSugarsAuthority: {
        nutrient2000Records: sugar2000Ids.length,
        nutrient1063Records: sugar1063Ids.length,
        bothPresentRecords: sugarBothIds.length,
        bothDifferentRecords: sugarConflicts.length,
        selectedAuthorityCountById: tally(selectedSugarIds),
        differingSourceExamples: sugarConflicts.slice(0, 25)
      },
      negativeSourceCarbohydrate1005: {
        count: negativeCarbs.length,
        affectedExamples: negativeCarbs.slice(0, 25)
      },
      belowLimitSetUnknown: belowLimitObservations,
      numericLoqSelectedZeroAsUnknown: numericLoqSelectedZero,
      textualLoqSelectedZeroAsUnknown: textualLoqSelectedZero,
      rawNumericLoqZeroWithPositiveLimit: rawNumericLoqWithZero,
      calorieMacroWarnings: rows.filter((r) => r.issues.some((i) => i.code === "suspicious_calorie_macro_delta")).length
    },
    portions: {
      foodsWithExactSourcePortions: exactPortionFoods,
      foodsUsing100gOnly: n - exactPortionFoods,
      sourcePortionCount: sourcePortions,
      retainedPortionCount: retainedPortions,
      unusableOrAmbiguousPortionCount: unusablePortions
    },
    naming: { ...transformClasses, transformationExamples: {}, policy: lock.config.namingPolicy },
    taxonomy: {
      sourceCategoryDistribution: categoryDistribution,
      mappedPlaivraFoodCount: mappedTaxonomyFoods,
      unmappedFoodCount: n - mappedTaxonomyFoods,
      unmappedCategories: Object.keys(categoryDistribution).filter((category) =>
        lock.config.taxonomyMappings[category] === undefined)
    },
    market: {
      policy: lock.config.marketPolicy, foodCountWithUsdaUsProvenance: n,
      mappedScopeCount: rows.reduce((sum, r) => sum + r.candidate.marketScopes.length, 0),
      globalRelevanceCount: rows.filter((r) => r.candidate.globallyRelevant).length,
      unmappedOrUncertainCount: rows.filter((r) => r.candidate.marketScopes.length === 0).length
    },
    matching: {
      ...decisions, sourceIdentityMatches,
      possibleDuplicates: counts.possibleDuplicate,
      creates: counts.created, rejects: counts.rejected,
      quarantineReasons: countReasons(rows, "quarantine"),
      validationIssueDistribution: countReasons(rows, "issues")
    },
    representativeAnomalies: anomalous,
    manifestContentChecksumSha256: result.manifestContentChecksumSha256,
    semanticBatchIdentityChecksumSha256: result.semanticBatchIdentityChecksumSha256
  };
}

async function run(): Promise<void> {
  const args = parseArgs();
  const output = path.resolve(args.output!);
  assertOutputDestination(output);
  const lockFile = path.resolve(args.lock ?? "data/food-catalog/source-locks/usda-foundation-2026-04.json");
  const lock = JSON.parse(await readFile(lockFile, "utf8")) as UsdaFoundationLock;
  if (sha256(stableJson(lock.config)) !== lock.configChecksumSha256) {
    throw new Error("Plan 8 USDA adapter/config SHA-256 mismatch.");
  }
  if (lock.productionAuthority !== false || lock.config.legacyEnergyFallback !== false) {
    throw new Error("Refusing an unexpected USDA Foundation config or Production authority.");
  }
  const bytes = await readFile(path.resolve(args.zip!));
  const sourceZipSha256 = sha256(bytes);
  if (sourceZipSha256 !== lock.sourceChecksumSha256 || bytes.length !== lock.sourceBytes) {
    throw new Error(`Official source checksum or size mismatch: got ${sourceZipSha256} / ${bytes.length}.`);
  }
  const archive = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const files = Object.values(archive.files).filter((f) => !f.dir);
  if (files.length !== 1 || files[0]?.name !== lock.sourceJsonFilename) {
    throw new Error("Wrong USDA Foundation JSON archive member or unexpected release.");
  }
  const parsed = parseUsdaFoundationJson(await files[0].async("string"));
  const indexSnapshot = JSON.parse(await readFile(path.resolve(args.index!), "utf8")) as unknown;
  assertMatchIndex(indexSnapshot);
  const adapter = createUsdaFoundationAdapter(lock);
  const result = buildFoodCatalogDryRun(adapter, {
    sourceZipSha256, sourceZipBytes: bytes.length, foods: parsed.foods
  }, indexSnapshot.matchIndex);
  const qa = buildQa(
    lock, indexSnapshot, sha256(stableJson(indexSnapshot)), parsed, result
  );
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "manifest-content.json"), stableJson(result.manifestContent) + "\n");
  await writeFile(path.join(output, "qa.json"), stableJson(qa) + "\n");
  await writeFile(path.join(output, "checksums.json"), stableJson({
    manifestContentSha256: result.manifestContentChecksumSha256,
    semanticBatchIdentitySha256: result.semanticBatchIdentityChecksumSha256,
    sourceZipSha256,
    matchIndexSha256: sha256(stableJson(indexSnapshot))
  }) + "\n");
  const report = [
    "# USDA Foundation 2026-04 Plan 8 1A0 offline review",
    "",
    `- ZIP: ${lock.sourceFilename} (${bytes.length} bytes; SHA-256 ${sourceZipSha256})`,
    `- Foundation Foods: ${parsed.foods.length}; archive null slots: ${parsed.nullSlotCount}`,
    `- Expected decisions: ${JSON.stringify(result.manifestContent.expectedMutations)}`,
    `- Nutrition coverage: ${JSON.stringify(qa.nutrition.coverage)}`,
    `- Energy sources: ${JSON.stringify(qa.nutrition.selectedEnergyAuthorities)}`,
    `- Legacy 1008 present/excluded: ${qa.nutrition.legacy1008PresentButIntentionallyExcluded}; no energy authority: ${qa.nutrition.no2048Or2047Or1008EnergyAuthority}`,
    `- NDB stable identity coverage: ${JSON.stringify(qa.identity.rawNdbStatusCounts)}`,
    `- Sugars source dual-authority coverage: ${JSON.stringify(qa.nutrition.totalSugarsAuthority)}`,
    `- Negative source carbohydrate 1005: ${JSON.stringify(qa.nutrition.negativeSourceCarbohydrate1005)}`,
    `- Numeric/text below-LOQ selected zeros: ${qa.nutrition.numericLoqSelectedZeroAsUnknown}/${qa.nutrition.textualLoqSelectedZeroAsUnknown}`,
    `- Portion evidence: ${JSON.stringify(qa.portions)}`,
    `- Mapped/unmapped taxonomy: ${qa.taxonomy.mappedPlaivraFoodCount}/${qa.taxonomy.unmappedFoodCount}`,
    `- Market: ${lock.config.marketPolicy}; global relevant: ${qa.market.globalRelevanceCount}`,
    `- Quarantine reasons: ${JSON.stringify(qa.matching.quarantineReasons)}`,
    `- ManifestContent SHA-256: ${result.manifestContentChecksumSha256}`,
    `- Semantic batch identity SHA-256: ${result.semanticBatchIdentityChecksumSha256}`,
    `- Match index: ${indexSnapshot.snapshotId} (${qa.input.matchIndexChecksumSha256})`,
    "",
    "No Production writes, batches, activations, generations, SearchDocuments, migrations, or Activity Catalog mutations."
  ].join("\n") + "\n";
  await writeFile(path.join(output, "qa.md"), report);
  console.log(JSON.stringify({
    output,
    input: qa.input,
    expectedMutations: result.manifestContent.expectedMutations,
    manifestContentChecksumSha256: result.manifestContentChecksumSha256,
    semanticBatchIdentityChecksumSha256: result.semanticBatchIdentityChecksumSha256
  }, null, 2));
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
