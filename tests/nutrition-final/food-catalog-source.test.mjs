/**
 * New Nutrition-only Food Catalog contracts.
 * Offline, self-contained fixtures; never reads Production or other users.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const vite = await createServer({
  configFile: false,
  resolve: { alias: { "@": process.cwd() } },
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error"
});
after(async () => { await vite.close(); });
const { normalizeFoodCatalogCandidate } = await vite.ssrLoadModule("/lib/food-catalog/ingestion/normalize.ts");
const { validateFoodCatalogCandidate } = await vite.ssrLoadModule("/lib/food-catalog/ingestion/validate.ts");
const { decideCanonicalMatch, deriveCanonicalConflictReasons } = await vite.ssrLoadModule("/lib/food-catalog/ingestion/matching.ts");
const { deriveProcessingDisposition } = await vite.ssrLoadModule("/lib/food-catalog/ingestion/quarantine.ts");
const { checksumManifestContent } = await vite.ssrLoadModule("/lib/food-catalog/ingestion/manifest.ts");
const { parseUsdaFoundationJson } = await vite.ssrLoadModule("/lib/food-catalog/ingestion/usda-foundation/index.ts");

const source = Object.freeze({
  provider: "USDA_FDC", dataset: "FoundationFoods", sourceVersion: "2026-04-30",
  sourceReleaseDate: "2026-04-30", licenseName: "CC0", licenseReference: null,
  sourceReference: null, sourceChecksumSha256: "a".repeat(64),
  importerVersion: "plan8-1a0-v2", configChecksumSha256: "b".repeat(64)
});
const emptyIndex = () => ({
  sourceIdentities: [], gtinOwners: [], redirects: [], semanticIdentities: [],
  qualifiedAliases: [], possibleDuplicateNames: []
});
function candidate(overrides = {}) {
  return normalizeFoodCatalogCandidate({
    sourceRecordId: " 123 ", sourceReference: null, sourceRecordChecksumSha256: null,
    canonicalName: " Rice ", brandName: null, servingLabel: null,
    category: null, cuisine: null,
    nutrition: {
      calories: null, protein_g: null, carbs_g: null, fat_g: null,
      saturated_fat_g: null, fiber_g: null, sugars_g: null, sodium_mg: null,
      basis_amount: null, basis_unit: null
    },
    aliases: [], names: [], identityEvidence: {
      semanticSignature: null, preparation: null, state: null, form: null
    },
    servings: [], taxonomyEvidence: [], gtins: [], marketScopes: [],
    globallyRelevant: false, sourceNutrition: {}, sourceServing: {},
    ...overrides
  });
}
const validation = (value) => validateFoodCatalogCandidate(value);
const codes = (value) => validation(value).map(issue => issue.code);
const match = (value, index = emptyIndex()) => decideCanonicalMatch({ source, candidate: value, index });

test("absent nutrition remains NULL, including calories and basis", () => {
  const c = candidate();
  assert.equal(c.nutrition.calories, null);
  assert.equal(c.nutrition.protein_g, null);
  assert.equal(c.nutrition.basis_amount, null);
  assert.deepEqual(codes(c), []);
});
test("negative carbohydrate rejects ingestion, never coerces to zero", () => {
  const c = candidate({nutrition: {
    ...candidate().nutrition, carbs_g: -0.25, basis_amount: 100, basis_unit: "g"
  }});
  assert.ok(codes(c).includes("invalid_nutrition"));
  assert.equal(deriveProcessingDisposition({
    decision: {kind:"create"}, issues:validation(c), conflictReasons:[]
  }).kind,"reject");
});
test("positive nutrient without evidence-backed basis cannot be accepted", () => {
  const c = candidate({nutrition:{...candidate().nutrition,protein_g:5}});
  assert.ok(codes(c).includes("invalid_basis"));
});
test("serving requires positive quantity and actual grams or milliliters", () => {
  const portion = {servingKey:"p",amount:1,unit:"cup",gramWeight:null,
    milliliterVolume:null,label:"1 cup",sourceEvidence:{}};
  assert.ok(codes(candidate({servings:[portion]})).includes("invalid_serving"));
  assert.ok(!codes(candidate({servings:[{...portion,gramWeight:75}]})).includes("invalid_serving"));
});
test("unsupported market scope is rejected rather than inferred", () => {
  assert.ok(codes(candidate({marketScopes:[{
    type:"country",code:"XX",relevanceLevel:"primary"
  }]})).includes("invalid_market_scope"));
});
test("shared name alone yields possible duplicate, never automatic MATCH", () => {
  const index = emptyIndex();
  index.possibleDuplicateNames.push({normalizedName:"rice",foodId:"existing"});
  assert.deepEqual(match(candidate(),index),{
    kind:"possible_duplicate",candidateFoodIds:["existing"]
  });
});
test("exact provider/dataset/release/source identity reuses stable canonical ID", () => {
  const index = emptyIndex();
  index.sourceIdentities.push({
    provider:"USDA_FDC",dataset:"FoundationFoods",
    sourceVersion:"2026-04-30",sourceRecordId:"123",foodId:"stable"
  });
  assert.deepEqual(match(candidate(),index),{kind:"match",foodId:"stable"});
});
test("FNDDS identity does not match Foundation even for the same numeric ID", () => {
  const index = emptyIndex();
  index.sourceIdentities.push({
    provider:"USDA_FDC",dataset:"FNDDS",sourceVersion:"2024-10-31",
    sourceRecordId:"123",foodId:"other"
  });
  assert.deepEqual(match(candidate(),index),{kind:"create"});
});
test("contradicting strong owners quarantine rather than silently merge", () => {
  const index = emptyIndex();
  index.sourceIdentities.push({
    provider:"USDA_FDC",dataset:"FoundationFoods",
    sourceVersion:"2026-04-30",sourceRecordId:"123",foodId:"a"
  });
  index.gtinOwners.push({gtin:"96385074",foodId:"b"});
  const c = candidate({gtins:["96385074"]});
  const reasons = deriveCanonicalConflictReasons({source,candidate:c,index});
  assert.ok(reasons.includes("identity_conflict"));
  assert.equal(deriveProcessingDisposition({
    decision:match(c,index),issues:[],conflictReasons:reasons
  }).kind,"quarantine");
});
test("deterministic manifest digest is independent of property order", () => {
  const entry = {candidate:candidate(),issues:[],decision:{kind:"create"},
    disposition:{kind:"accept",reasonCodes:[]}};
  const expectedMutations = {input:1,accepted:1,rejected:0,matched:0,
    created:1,possibleDuplicate:0,quarantined:0};
  assert.equal(
    checksumManifestContent({source,candidates:[entry],expectedMutations}),
    checksumManifestContent({expectedMutations,candidates:[entry],source})
  );
});
test("Foundation JSON preserves null slots as absent candidates", () => {
  const result=parseUsdaFoundationJson(JSON.stringify({FoundationFoods:[
    null,{fdcId:42,dataType:"Foundation",description:"Rice, raw",foodNutrients:[]}
  ]}));
  assert.equal(result.nullSlotCount,1);
  assert.equal(result.foods.length,1);
  assert.equal(result.foods[0].fdcId,42);
});
test("Foundation JSON rejects duplicate ID, wrong dataset and wrong type", () => {
  const food={fdcId:42,dataType:"Foundation",description:"Rice",foodNutrients:[]};
  assert.throws(()=>parseUsdaFoundationJson(JSON.stringify({FoundationFoods:[food,food]})),/Duplicate Foundation fdcId/);
  assert.throws(()=>parseUsdaFoundationJson(JSON.stringify({FoundationFoods:[{...food,dataType:"Survey"}]})),/Unexpected USDA dataType/);
  assert.throws(()=>parseUsdaFoundationJson(JSON.stringify({Unknown:[food]})),/FoundationFoods-only/);
});
