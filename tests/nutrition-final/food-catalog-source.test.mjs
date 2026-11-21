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


// Foundation V1A0 adapter-level contracts using a synthetic Food object.
// Exact archive bytes are NOT included; source archive verification is separate N108.
const {createUsdaFoundationAdapter,normalizeUsdaFoundationNdbNumber,
  usdaFoundationSemanticSignature}=
  await vite.ssrLoadModule("/lib/food-catalog/ingestion/usda-foundation/index.ts");
const {readFileSync}=await import("node:fs");
const lock=JSON.parse(readFileSync(
  "data/food-catalog/source-locks/usda-foundation-2026-04.json","utf8"));
function fdcFood(overrides={}){
  return {fdcId:400101,dataType:"Foundation",description:"Rice, raw",
    foodNutrients:[],foodPortions:[],...overrides};
}
function localArtifact(foods){
  return {sourceZipSha256:lock.sourceChecksumSha256,sourceZipBytes:lock.sourceBytes,foods};
}
function adapt(foods){
  return createUsdaFoundationAdapter(lock).toCandidates(localArtifact(foods));
}
test("USDA NDB normalization retains namespace identity but refuses malformed IDs",()=>{
  assert.deepEqual(normalizeUsdaFoundationNdbNumber("  00123 "),
    {status:"present",normalized:"00123"});
  assert.deepEqual(normalizeUsdaFoundationNdbNumber(900),
    {status:"present",normalized:"00900"});
  assert.equal(normalizeUsdaFoundationNdbNumber("code-900").status,"malformed");
  assert.equal(normalizeUsdaFoundationNdbNumber(0).status,"malformed");
  assert.equal(normalizeUsdaFoundationNdbNumber(null).status,"missing");
});
test("same NDB yields stable semantic Food identity despite different FDC record IDs",()=>{
  const [one,two]=adapt([
    fdcFood({fdcId:400101,ndbNumber:"00123",description:"Rice, raw"}),
    fdcFood({fdcId:400102,ndbNumber:123,description:"Rice, uncooked"})
  ]);
  assert.equal(one.identityEvidence.semanticSignature,two.identityEvidence.semanticSignature);
  assert.equal(one.identityEvidence.semanticSignature,
    usdaFoundationSemanticSignature("00123"));
  assert.notEqual(one.sourceRecordId,two.sourceRecordId);
});
test("NDB missing never invents cross-release semantic matching from the name",()=>{
  const [row]=adapt([fdcFood({ndbNumber:null})]);
  assert.equal(row.identityEvidence.semanticSignature,null);
  assert.equal(row.identityEvidence.structuredEvidenceKey,null);
});
test("zero recorded below numeric LOQ is unknown while measured zero is preserved",()=>{
  const [row]=adapt([fdcFood({foodNutrients:[
    {nutrient:{id:2048,unitName:"kcal"},amount:0,loq:0.05},
    {nutrient:{id:1003,unitName:"g"},amount:0,
      foodNutrientDerivation:{description:"not detected"}},
    {nutrient:{id:1004,unitName:"g"},amount:0}
  ]})]);
  assert.equal(row.nutrition.calories,null);
  assert.equal(row.nutrition.protein_g,null);
  assert.equal(row.nutrition.fat_g,0);
  assert.ok(row.sourceNutrition.numericLoqNutrientIds.includes(2048));
  assert.ok(row.sourceNutrition.textualLoqNutrientIds.includes(1003));
});
test("unsupported USDA source nutrient units are rejected before staging",()=>{
  assert.throws(()=>adapt([fdcFood({foodNutrients:[
    {nutrient:{id:1003,unitName:"mg"},amount:10}
  ]})]),/Unexpected USDA nutrient unit/);
});
test("duplicate nutrient IDs fail closed and cannot silently choose one",()=>{
  assert.throws(()=>adapt([fdcFood({foodNutrients:[
    {nutrient:{id:1003,unitName:"g"},amount:5},
    {nutrient:{id:1003,unitName:"g"},amount:10}
  ]})]),/Ambiguous duplicate nutrient/);
});
test("Foundation servings require a measured gram weight and unique portion ID",()=>{
  const [row]=adapt([fdcFood({foodPortions:[
    {id:3,amount:1,gramWeight:120,measureUnit:{name:"cup"}},
    {id:5,amount:1,gramWeight:null,measureUnit:{name:"cup"}},
    {id:7,amount:0,gramWeight:50,measureUnit:{name:"piece"}}
  ]})]);
  assert.equal(row.servings.length,1);
  assert.equal(row.servings[0].gramWeight,120);
  assert.equal(row.servings[0].unit,"cup");
  assert.deepEqual(row.sourceServing.unusablePortionIds,[5,7]);
});
test("Foundation import supplies USDA provenance, never invents country relevance",()=>{
  const [row]=adapt([fdcFood({foodCategory:{description:"Grains",code:"grain"}})]);
  assert.deepEqual(row.marketScopes,[]);
  assert.equal(row.globallyRelevant,false);
  assert.equal(row.category,null);
  assert.equal(row.taxonomyEvidence[0].taxonomy,"Grains");
  assert.equal(row.taxonomyEvidence[0].mappedTaxonomyId,null);
});
test("the locked Foundation adapter rejects fabricated source ZIP digest or size",()=>{
  const a=createUsdaFoundationAdapter(lock);
  assert.throws(()=>a.describeSource({
    ...localArtifact([]),sourceZipSha256:"f".repeat(64)
  }),/checksum or byte-size mismatch/);
  assert.throws(()=>a.describeSource({
    ...localArtifact([]),sourceZipBytes:lock.sourceBytes+1
  }),/checksum or byte-size mismatch/);
});


// Plan9 cross-batch/cross-release identity and adversarial redirect cases.
test("identical source identity resolves retired Food owner to stable redirect root",()=>{
  const index=emptyIndex();
  index.sourceIdentities.push({
    provider:"USDA_FDC",dataset:"FoundationFoods",
    sourceVersion:"2026-04-30",sourceRecordId:"123",foodId:"retired"
  });
  index.redirects.push({sourceFoodId:"retired",targetFoodId:"canonical"});
  assert.deepEqual(match(candidate(),index),{kind:"match",foodId:"canonical"});
});
test("a cross-release Foundation Food only reuses canonical ID via strong semantic evidence",()=>{
  const oldSource={...source,sourceVersion:"2026-10-30"};
  const oldIdentity={provider:"USDA_FDC",dataset:"FoundationFoods",
    sourceVersion:"2026-04-30",sourceRecordId:"123",foodId:"stable"};
  const withoutEvidence=emptyIndex();
  withoutEvidence.sourceIdentities.push(oldIdentity);
  assert.deepEqual(decideCanonicalMatch({
    source:oldSource,candidate:candidate(),index:withoutEvidence
  }),{kind:"create"});
  const semantic=usdaFoundationSemanticSignature("00123");
  const withEvidence=emptyIndex();
  withEvidence.sourceIdentities.push(oldIdentity);
  withEvidence.semanticIdentities.push({semanticSignature:semantic,foodId:"stable"});
  const enriched=candidate({identityEvidence:{
    semanticSignature:semantic,preparation:null,state:null,form:null
  }});
  assert.deepEqual(decideCanonicalMatch({
    source:oldSource,candidate:enriched,index:withEvidence
  }),{kind:"match",foodId:"stable"});
});
test("qualified alias requires exact state/preparation/form, never the name alone",()=>{
  const index=emptyIndex();
  index.qualifiedAliases.push({
    normalizedAlias:"rice",state:"cooked",preparation:"boiled",
    form:"whole",foodId:"existing"
  });
  assert.deepEqual(match(candidate({aliases:[{locale:"en",value:"Rice"}]}),index),
    {kind:"create"});
  const c=candidate({
    aliases:[{locale:"en",value:"Rice"}],
    identityEvidence:{
      semanticSignature:null,preparation:"boiled",state:"cooked",form:"whole"
    }
  });
  assert.deepEqual(match(c,index),{kind:"match",foodId:"existing"});
});
test("cyclic redirect ownership is quarantined instead of inventing a root",()=>{
  const index=emptyIndex();
  index.sourceIdentities.push({
    provider:"USDA_FDC",dataset:"FoundationFoods",
    sourceVersion:"2026-04-30",sourceRecordId:"123",foodId:"a"
  });
  index.redirects.push({sourceFoodId:"a",targetFoodId:"b"},
    {sourceFoodId:"b",targetFoodId:"a"});
  const c=candidate();
  const reasons=deriveCanonicalConflictReasons({source,candidate:c,index});
  assert.ok(reasons.includes("identity_conflict"));
  assert.equal(deriveProcessingDisposition({
    decision:match(c,index),issues:[],conflictReasons:reasons
  }).kind,"quarantine");
});
