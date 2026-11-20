/** Nutrition-only consumer invariants: no HTTP, accounts or Production writes. */
import assert from "node:assert/strict";
import { test,after } from "node:test";
import { createServer } from "vite";
const vite=await createServer({configFile:false,server:{middlewareMode:true},
  appType:"custom",logLevel:"error"});
after(async()=>vite.close());
const { sumNutritionFacts, scaleNutritionFacts, hasCompleteNutrition }=
  await vite.ssrLoadModule("/lib/nutrition-v1/nutrition-value.ts");
const { resolveWaterLogIntent }=await vite.ssrLoadModule("/lib/nutrition-v1/water-log-retry.ts");
const { replayMealPlanMutationExactFirst, enqueueMealPlanMutation, reconcileMealPlanQueue,
  serializeMealPlanQueue, deserializeMealPlanQueue }=
  await vite.ssrLoadModule("/lib/nutrition-v1/meal-plan-offline.ts");
const { parseAddToHandoff }=await vite.ssrLoadModule("/lib/nutrition-v1/add-to-handoff.ts");
const { evaluateRecipeDraftReadiness, nextRecipeVersionNumber }=
  await vite.ssrLoadModule("/lib/nutrition-v1/recipe-versioning.ts");
const full={calories:100,protein_g:5,carbs_g:20,fat_g:1,fiber_g:3};
const queueEntry={operationId:"op-1",weekId:"local:week",baseRevision:2,
  target:{kind:"meal_slot",id:"slot-1",field:"serving"},payload:{
    weekStartDate:"2026-11-16",mutation:{type:"set",value:2}},status:"queued"};
test("sum preserves unknown facts rather than converting them to zero",()=>{
  const values=[full,{...full,calories:null,protein_g:null}];
  const result=sumNutritionFacts(values);
  assert.equal(result.calories,null);assert.equal(result.protein_g,null);
  assert.equal(result.carbs_g,40);
});
test("scale preserves NULL and rejects negative quantities",()=>{
  assert.equal(scaleNutritionFacts({...full,calories:null},2).calories,null);
  assert.equal(scaleNutritionFacts(full,2).calories,200);
  assert.throws(()=>scaleNutritionFacts(full,-1),/scale/);
});
test("completeness is based on known macros, not an inferred calorie",()=>{
  assert.equal(hasCompleteNutrition(full),true);
  assert.equal(hasCompleteNutrition({...full,calories:null}),false);
});
test("water intent idempotency belongs to owner/date/amount triple",()=>{
  const a=resolveWaterLogIntent(null,{ownerId:"owner-a",date:"2026-11-20",amountMl:250},()=>"id-1");
  assert.equal(resolveWaterLogIntent(a,{ownerId:"owner-a",date:"2026-11-20",amountMl:250},()=>"id-2").operationId,"id-1");
  assert.equal(resolveWaterLogIntent(a,{ownerId:"owner-b",date:"2026-11-20",amountMl:250},()=>"id-2").operationId,"id-2");
});
test("one operation ID is enqueued once and serialized without loss",()=>{
  const first=enqueueMealPlanMutation([],queueEntry);
  assert.equal(enqueueMealPlanMutation(first,queueEntry).length,1);
  assert.deepEqual(deserializeMealPlanQueue(serializeMealPlanQueue(first)),first);
});
test("offline replay reuses exact operation ID and null local unsaved week ID",async()=>{
  const out=await replayMealPlanMutationExactFirst(queueEntry,async c=>c);
  assert.equal(out.state,"applied");assert.equal(out.result.weekId,null);
  assert.equal(out.result.operationId,"op-1");
  assert.equal(out.result.baseRevision,2);
});
test("stale revision is reported as conflict, never silently overwritten",async()=>{
  const result=await replayMealPlanMutationExactFirst(queueEntry,async()=>{
    throw new Error("Meal Plan base revision is stale.");
  });
  assert.deepEqual(result,{state:"stale"});
});
test("only conflicting changed target is marked for human attention",()=>{
  const output=reconcileMealPlanQueue([queueEntry],{
    serverRevision:5,changedTargets:[{kind:"meal_slot",id:"slot-1",field:"serving"}]
  });
  assert.equal(output[0].status,"conflict");
  const other=reconcileMealPlanQueue([queueEntry],{
    serverRevision:5,changedTargets:[{kind:"meal_slot",id:"other"}]
  });
  assert.equal(other[0].baseRevision,5);
});
test("Food-to-destination handoff rejects wrong destination and invalid quantities",()=>{
  const query=new URLSearchParams({destination:"diary",addFoodId:"food-1",
    source:"catalog",quantity:"1",serving:"100 g",displayName:"Rice"});
  assert.equal(parseAddToHandoff(query,"diary").id,"food-1");
  assert.equal(parseAddToHandoff(query,"meal_plan"),null);
  query.set("quantity","-1");
  assert.equal(parseAddToHandoff(query,"diary"),null);
});
test("Recipe readiness and frozen version advancement use explicit facts",()=>{
  assert.deepEqual(evaluateRecipeDraftReadiness({
    name:"",servings:0,ingredients:[],instructions:[]
  }).missing,["name","servings","ingredient","instruction"]);
  assert.equal(nextRecipeVersionNumber([{version_number:2},{version_number:4}]),5);
});
