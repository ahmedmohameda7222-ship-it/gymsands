/** Nutrition-only activation/generation domain contracts; offline and read-only. */
import assert from "node:assert/strict";
import { test,after } from "node:test";
import { createServer } from "vite";
const server=await createServer({configFile:false,resolve:{alias:{"@":process.cwd()}},server:{middlewareMode:true},
  appType:"custom",logLevel:"error"});
after(async()=>server.close());
const { validateGenerationFoodSelection, validateGenerationRedirectSelection,
  validateControlPlaneActorContext }=await server.ssrLoadModule("/lib/food-catalog/domain/generations.ts");
const {validateActivationSetMemberDraft}=await server.ssrLoadModule("/lib/food-catalog/domain/activation.ts");
const {validateFoodNutritionRevision}=await server.ssrLoadModule("/lib/food-catalog/domain/nutrition.ts");
const {validateFoodMarketAssignment}=await server.ssrLoadModule("/lib/food-catalog/domain/markets.ts");
const sha="a".repeat(64);
const active={foodId:"f",lifecycle:"active",nutritionRevisionId:null,
  activationSetId:"set",activationSetMemberId:"member",activationGrantEventId:"grant"};
const draft={foodId:"f",expectedPreconditionLifecycle:"draft",evidenceReference:"source",
  evidenceChecksumSha256:sha,sourceLegalAccepted:true,identityResolved:true,
  nutritionBasisValid:true,displayIdentityValid:true,blockingConditionCount:0,
  eligibility:"eligible",memberChecksumSha256:sha};
const nutrition={foodId:"f",revisionNumber:1,calories:null,protein_g:0,
  carbs_g:null,fat_g:null,saturated_fat_g:null,fiber_g:null,
  sugars_g:null,sodium_mg:null,basisAmount:100,basisUnit:"g",
  nutrientMappingVersion:"v1",sourceRecordId:"source-1"};
test("active generation Food must have exact activation grant references",()=>{
  assert.equal(validateGenerationFoodSelection(active),active);
  assert.throws(()=>validateGenerationFoodSelection({...active,activationGrantEventId:null}),/exact activation/);
});
test("draft or merged Food cannot masquerade as active generation member",()=>{
  assert.throws(()=>validateGenerationFoodSelection({...active,lifecycle:"draft"}),/lifecycle/);
  assert.throws(()=>validateGenerationFoodSelection({...active,lifecycle:"withdrawn"}),/must not carry/);
});
test("redirect cannot loop directly onto its own canonical Food ID",()=>{
  assert.throws(()=>validateGenerationRedirectSelection({sourceFoodId:"a",targetFoodId:"a"}),/self redirect/);
});
test("activation evidence checksum must be a precise SHA-256",()=>{
  assert.equal(validateActivationSetMemberDraft(draft),draft);
  assert.throws(()=>validateActivationSetMemberDraft({...draft,evidenceChecksumSha256:"wrong"}),/checksum/);
});
test("activation blocking-condition count must be nonnegative integer",()=>{
  assert.throws(()=>validateActivationSetMemberDraft({...draft,blockingConditionCount:-1}),/blocking condition/);
});
test("Nutrition revision preserves NULL and distinct numeric zero",()=>{
  assert.equal(validateFoodNutritionRevision(nutrition),nutrition);
  assert.equal(nutrition.calories,null);
  assert.equal(nutrition.protein_g,0);
  assert.throws(()=>validateFoodNutritionRevision({...nutrition,carbs_g:-2}),/non-negative/);
});
test("Food Market assignment requires bounded identity and policy",()=>{
  const a={foodId:"f",scopeCode:"DE",relevance:"primary",
    sourceRecordId:null,action:"assign",policyVersion:"v1"};
  assert.equal(validateFoodMarketAssignment(a),a);
  assert.throws(()=>validateFoodMarketAssignment({...a,policyVersion:" "}),/policy version/);
});
test("control-plane authority requires nonblank authenticated principal reference",()=>{
  const a={principalId:"person",principalType:"human",authorityReference:"ticket",
    reasonCode:"approved",policyVersion:"v1"};
  assert.equal(validateControlPlaneActorContext(a),a);
  assert.throws(()=>validateControlPlaneActorContext({...a,principalId:" "}),/principal ID/);
});

const { computeGenerationCompositionChecksum } =
  await server.ssrLoadModule("/lib/food-catalog/generation-composition.ts");
const { validateGenerationSemanticSnapshot } =
  await server.ssrLoadModule("/lib/food-catalog/generation-validation-core.ts");
const selectedEmpty = () => ({servingOptionIds:[], nameFactIds:["preferred-name"],
  taxonomyAssignmentIds:[],marketAssignmentIds:[],verification:[]});
function snapshot() {
  return {
    generation: {
      id:"gen-1",compositionSchemaVersion:"schema-1",
      generationPolicyVersion:"policy-1",activationPolicyVersion:"activation-1",
      trustPolicyVersion:"trust-1",projectionVersion:"projection-1",
      compositionChecksumSha256:"",sealedAt:"2026-11-20T11:00:00.000Z"
    },
    foods:[{...active,generationId:"gen-1"}],redirects:[],
    selectionsByFoodId:{"f":selectedEmpty()},
    nutritionRevisions:[],servingOptions:[],
    names:[{id:"preferred-name",foodId:"f",role:"preferred_display"}],
    taxonomyAssignments:[],marketAssignments:[],verificationAssertions:[],
    activationAuthorities:[{
      activationSetId:"set",activationSetMemberId:"member",foodId:"f",
      activationPolicyVersion:"activation-1",eligibility:"eligible",
      sourceLegalAccepted:true,grantEventId:"grant",
      grantCreatedAt:"2026-11-20T10:00:00.000Z",invalidatedAt:null
    }]
  };
}
function seal(value){
  const {generation,foods,redirects,selectionsByFoodId}=value;
  const checksum=computeGenerationCompositionChecksum({
    compositionSchemaVersion:generation.compositionSchemaVersion,
    generationPolicyVersion:generation.generationPolicyVersion,
    activationPolicyVersion:generation.activationPolicyVersion,
    trustPolicyVersion:generation.trustPolicyVersion,
    projectionVersion:generation.projectionVersion,
    foods:foods.map(({generationId,...food})=>food),
    servings:foods.flatMap(food=>selectionsByFoodId[food.foodId].servingOptionIds.map(
      servingOptionId=>({foodId:food.foodId,servingOptionId}))),
    names:foods.flatMap(food=>selectionsByFoodId[food.foodId].nameFactIds.map(
      nameFactId=>({foodId:food.foodId,nameFactId}))),
    taxonomy:foods.flatMap(food=>selectionsByFoodId[food.foodId].taxonomyAssignmentIds.map(
      assignmentId=>({foodId:food.foodId,assignmentId}))),
    markets:foods.flatMap(food=>selectionsByFoodId[food.foodId].marketAssignmentIds.map(
      assignmentId=>({foodId:food.foodId,assignmentId}))),
    verification:foods.flatMap(food=>selectionsByFoodId[food.foodId].verification),
    redirects:redirects.map(({generationId,...redirect})=>redirect)
  });
  value.generation.compositionChecksumSha256=checksum;
  return {value,checksum};
}
function findingCodes(value,checksum) {
  return validateGenerationSemanticSnapshot(value,checksum).findings.map(x=>x.reasonCode);
}
test("valid sealed active generation needs legal grant and preferred display facts",()=>{
  const {value,checksum}=seal(snapshot());
  const verdict=validateGenerationSemanticSnapshot(value,checksum);
  assert.equal(verdict.blockerCount,0);
  assert.equal(verdict.recomputedChecksum,checksum);
});
test("active Food without a selected preferred display name is blocked",()=>{
  const s=snapshot();s.selectionsByFoodId.f.nameFactIds=[];
  const {value,checksum}=seal(s);
  assert.ok(findingCodes(value,checksum).includes("ACTIVE_FOOD_MISSING_DISPLAY_NAME"));
});
test("revoked activation grant before generation seal is not publishable",()=>{
  const s=snapshot();
  s.activationAuthorities[0].invalidatedAt="2026-11-20T10:30:00.000Z";
  const {value,checksum}=seal(s);
  assert.ok(findingCodes(value,checksum).includes("ACTIVE_FOOD_MISSING_ACTIVATION_GRANT"));
});
test("a cross-Food nutrition revision reference fails generation validation",()=>{
  const s=snapshot();s.foods[0].nutritionRevisionId="rev-other";
  s.nutritionRevisions=[{id:"rev-other",foodId:"other"}];
  const {value,checksum}=seal(s);
  assert.ok(findingCodes(value,checksum).includes("SELECTED_FACT_CROSS_FOOD"));
});
test("redirect to absent or not-active target is a blocking finding",()=>{
  const s=snapshot();
  s.redirects=[{generationId:"gen-1",sourceFoodId:"previous",targetFoodId:"missing"}];
  const {value,checksum}=seal(s);
  assert.ok(findingCodes(value,checksum).includes("REDIRECT_TARGET_NOT_ACTIVE"));
});
test("generation redirect chains are rejected even when final target is active",()=>{
  const s=snapshot();
  s.redirects=[
    {generationId:"gen-1",sourceFoodId:"old",targetFoodId:"middle"},
    {generationId:"gen-1",sourceFoodId:"middle",targetFoodId:"f"}
  ];
  const {value,checksum}=seal(s);
  assert.ok(findingCodes(value,checksum).includes("REDIRECT_CHAIN"));
});
test("reviewed checksum mismatch is a blocking integrity finding",()=>{
  const {value}=seal(snapshot());
  assert.ok(findingCodes(value,"c".repeat(64)).includes("GENERATION_CHECKSUM_MISMATCH"));
});
