/** Nutrition-only activation/generation domain contracts; offline and read-only. */
import assert from "node:assert/strict";
import { test,after } from "node:test";
import { createServer } from "vite";
const server=await createServer({configFile:false,server:{middlewareMode:true},
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
