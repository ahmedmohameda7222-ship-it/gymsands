/** Nutrition-only consumer invariants: no HTTP, accounts or Production writes. */
import assert from "node:assert/strict";
import { test,after } from "node:test";
import { createServer } from "vite";
const vite=await createServer({configFile:false,resolve:{alias:{"@":process.cwd()}},server:{middlewareMode:true},
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

const { serializePublishedRecipeCache,parsePublishedRecipeCache,
  qualifiesForObjectiveRecipeFilter,buildFrozenRecipeShareText }=
  await vite.ssrLoadModule("/lib/nutrition-v1/recipe-cache.ts");
const {reconstructCookingTimer}=
  await vite.ssrLoadModule("/lib/nutrition-v1/cooking-timers.ts");
const {deriveCookingTimeline}=
  await vite.ssrLoadModule("/lib/nutrition-v1/cooking-engine.ts");
const {cookingLocalStorageKey}=
  await vite.ssrLoadModule("/lib/nutrition-v1/cooking-local-store.ts");
const {normalizeNutritionTargetPeriod,resolveEffectiveNutritionTarget}=
  await vite.ssrLoadModule("/lib/nutrition-v1/targets.ts");
const {startOfMealPlanWeek,weekContainsDate}=
  await vite.ssrLoadModule("/lib/nutrition-v1/week-start.ts");

const published=()=>{
  return {status:"published",recipeId:"recipe-1",recipeVersionId:"v-1",
    versionNumber:1,name:"Rice",servings:2,totalTimeMinutes:10,cuisine:null,
    favorite:false,coverPhotoUrl:null,
    ingredients:[{ingredientName:"Rice",quantity:100,unit:"g",foodId:"food",
      verified:true}],
    instructions:["Wash rice"],nutritionPerServing:{
      calories:null,protein_g:35,carbs_g:20,fat_g:5},
    cachedAt:"2026-11-20T12:00:00.000Z"};
};
test("offline Recipe cache stores only immutable identified published versions",()=>{
  const s=published();
  assert.deepEqual(parsePublishedRecipeCache(serializePublishedRecipeCache(s)),s);
  assert.equal(parsePublishedRecipeCache(JSON.stringify({...s,status:"draft"})),null);
});
test("objective Recipe filters reject unknown energy and accept known qualified facts",()=>{
  const unknown=published().nutritionPerServing;
  assert.equal(qualifiesForObjectiveRecipeFilter("high-protein",unknown),false);
  const complete={...unknown,calories:250};
  assert.equal(qualifiesForObjectiveRecipeFilter("high-protein",complete),true);
  assert.equal(qualifiesForObjectiveRecipeFilter("low-carb",complete),true);
});
test("Recipe share preserves unknown calories without inventing an energy estimate",()=>{
  const text=buildFrozenRecipeShareText(published());
  assert.ok(text.includes("P 35 g"));
  assert.ok(!text.includes(" kcal"));
});
const timer=()=>{
  return {id:"timer-1",actionId:"step-1",name:"Boil",durationSeconds:60,
    status:"running",startedAt:"2026-11-20T12:00:00Z",
    targetAt:"2026-11-20T12:01:00Z",pausedAt:null,
    pausedRemainingSeconds:null,completedAt:null};
};
test("cooking timer reconstructs elapsed progress and exact finish event",()=>{
  const initial=timer();
  const running=reconstructCookingTimer(initial,"2026-11-20T12:00:30Z");
  assert.equal(running.remainingSeconds,30);
  assert.equal(running.expired,false);
  const finished=reconstructCookingTimer(initial,"2026-11-20T12:01:02Z");
  assert.equal(finished.status,"completed");
  assert.equal(finished.remainingSeconds,0);
  assert.equal(finished.attentionEvent?.kind,"timer_finished");
  assert.equal(initial.status,"running","source fact must remain unchanged");
});
test("paused timer resume does not leak wall-clock elapsed time",()=>{
  const s={...timer(),status:"paused",pausedRemainingSeconds:20,
    pausedAt:"2026-11-20T12:00:40Z"};
  const result=reconstructCookingTimer(s,"2026-11-20T12:30:00Z");
  assert.equal(result.remainingSeconds,20);
  assert.equal(result.expired,false);
});
test("cooking timeline enforces frozen action dependencies",()=>{
  const actions=[
    {id:"prep",position:1,instruction:"Prepare"},
    {id:"cook",position:2,instruction:"Cook",dependencyActionIds:["prep"]}
  ];
  assert.equal(deriveCookingTimeline({actions},{completedActionIds:[]}).now?.id,"prep");
  assert.equal(deriveCookingTimeline({actions},{
    completedActionIds:["prep"]
  }).now?.id,"cook");
});
test("Cooking local storage is partitioned by actual owner and Recipe",()=>{
  assert.notEqual(cookingLocalStorageKey("owner-1","recipe-a"),
    cookingLocalStorageKey("owner-2","recipe-a"));
  assert.notEqual(cookingLocalStorageKey("owner-1","recipe-a"),
    cookingLocalStorageKey("owner-1","recipe-b"));
});
test("periodic Nutrition targets keep unknown values null and respect date bounds",()=>{
  const p=normalizeNutritionTargetPeriod({
    id:"p",effective_from:"2026-11-01",effective_to:"2026-12-01",
    calories:null,protein_g:120,carbs_g:null,fat_g:null,water_ml:1800,
    source:"member",source_evidence:{}
  });
  assert.equal(resolveEffectiveNutritionTarget([p],"2026-10-31").available,false);
  const current=resolveEffectiveNutritionTarget([p],"2026-11-20");
  assert.equal(current.available,true);
  assert.equal(current.values.calories,null);
  assert.equal(resolveEffectiveNutritionTarget([p],"2026-12-01").available,false);
});
test("overlapping target periods never select an arbitrary member target",()=>{
  const p=normalizeNutritionTargetPeriod({
    id:"p",effective_from:"2026-11-01",effective_to:"2026-12-01",
    calories:null,protein_g:120,carbs_g:null,fat_g:null,water_ml:1800,
    source:"member",source_evidence:{}
  });
  assert.throws(()=>resolveEffectiveNutritionTarget([p,{
    ...p,id:"p2",effective_from:"2026-11-15"
  }],"2026-11-20"),/Overlapping Nutrition target periods/);
});
test("Meal Plan week boundaries are deterministic across locale views",()=>{
  const start=startOfMealPlanWeek("2026-11-20",1);
  assert.equal(start,"2026-11-16");
  assert.equal(weekContainsDate(start,"2026-11-22"),true);
  assert.equal(weekContainsDate(start,"2026-11-23"),false);
});


// N105 frozen Recipe graph, owner-partitioned media and retry identity.
const { clonePublishedRecipeGraphForDraft }=
  await vite.ssrLoadModule("/lib/nutrition-v1/recipe-versioning.ts");
const {normalizeOwnedRecipeCoverPath}=
  await vite.ssrLoadModule("/lib/nutrition-v1/recipe-cover-path.ts");
const {claimPersonalCorrectionOperation,clearPersonalCorrectionOperation}=
  await vite.ssrLoadModule("/lib/nutrition-v1/personal-correction-operation.ts");
const {parseCookingVoiceCommand}=
  await vite.ssrLoadModule("/lib/nutrition-v1/cooking-voice.ts");

function frozenGraph(){
  return {
    ingredients:[{id:"ing-1",ingredient_name:"Rice"}],
    equipment:[{id:"equip-1",name:"Pan"}],
    instructions:[
      {id:"action-1",dependency_action_ids:[],ingredient_refs:["ing-1"],
        equipment_refs:["equip-1"]},
      {id:"action-2",dependency_action_ids:["action-1"],
        ingredient_refs:[{ingredientId:"ing-1"}],equipment_refs:[]}
    ]
  };
}
function correction(foodId="food-A",calories=null){
  return {foodId,calories,proteinG:null,carbsG:null,fatG:null,
    saturatedFatG:null,fiberG:null,sugarsG:null,sodiumMg:null,
    servingLabel:null,note:null};
}
test("cloning published Recipe graph allocates fresh IDs and remaps nested references",()=>{
  const graph=frozenGraph();
  let i=0;
  const cloned=clonePublishedRecipeGraphForDraft(graph,()=> "new-"+(++i));
  assert.equal(cloned.ingredients[0].id,"new-1");
  assert.equal(cloned.equipment[0].id,"new-2");
  assert.equal(cloned.instructions[0].id,"new-3");
  assert.equal(cloned.instructions[1].id,"new-4");
  assert.deepEqual(cloned.instructions[1].dependency_action_ids,["new-3"]);
  assert.deepEqual(cloned.instructions[0].ingredient_refs,["new-1"]);
  assert.deepEqual(cloned.instructions[0].equipment_refs,["new-2"]);
  assert.deepEqual(cloned.instructions[1].ingredient_refs,[{ingredientId:"new-1"}]);
  assert.equal(graph.instructions[1].dependency_action_ids[0],"action-1",
    "published source graph must remain frozen");
});
test("cloning a Recipe must reject an unresolved dependency instead of silently dropping it",()=>{
  const graph=frozenGraph();
  graph.instructions[1].dependency_action_ids=["unrecognized-action"];
  let i=0;
  assert.throws(()=>clonePublishedRecipeGraphForDraft(graph,()=> "new-"+(++i)),
    /does not resolve inside the published Recipe graph/);
});
test("cloning a Recipe rejects duplicate published ingredient identities",()=>{
  const graph=frozenGraph();
  graph.ingredients.push({...graph.ingredients[0]});
  let i=0;
  assert.throws(()=>clonePublishedRecipeGraphForDraft(graph,()=> "new-"+(++i)),
    /duplicate child id/);
});
test("Recipe cover path is strictly partitioned by the authenticated owner",()=>{
  const user="owner-a";
  assert.equal(normalizeOwnedRecipeCoverPath(user,"owner-a/cover/photo.png"),
    "owner-a/cover/photo.png");
  assert.throws(()=>normalizeOwnedRecipeCoverPath(user,"owner-b/cover/photo.png"),
    /authenticated owner/);
  assert.throws(()=>normalizeOwnedRecipeCoverPath(user,"owner-a/../owner-b/photo.png"),
    /authenticated owner/);
});
test("pending Food correction retry reuses exact operation identity only for same CAS",()=>{
  const command=correction();
  const cas={expectedRevisionId:null,expectedPointerRevision:0};
  const pending=claimPersonalCorrectionOperation(null,command,cas,()=>"op-one");
  const same=claimPersonalCorrectionOperation(pending,command,cas,()=>"op-two");
  assert.equal(same.operationId,"op-one");
  const changed=claimPersonalCorrectionOperation(pending,command,
    {...cas,expectedPointerRevision:1},()=>"op-two");
  assert.equal(changed.operationId,"op-two");
  assert.equal(clearPersonalCorrectionOperation(changed),null);
});
test("Food correction semantic identity distinguishes unknown from measured zero",()=>{
  const cas={expectedRevisionId:"revision-a",expectedPointerRevision:1};
  const pending=claimPersonalCorrectionOperation(null,correction("food-A",null),cas,
    ()=>"operation-null");
  const changed=claimPersonalCorrectionOperation(pending,correction("food-A",0),cas,
    ()=>"operation-zero");
  assert.equal(changed.operationId,"operation-zero");
  assert.notEqual(pending.semanticKey,changed.semanticKey);
});
test("cooking voice recognition normalizes known commands without inventing unknown actions",()=>{
  assert.deepEqual(parseCookingVoiceCommand("  WHAT’S NEXT!?  "),
    {kind:"command",command:"whats_next"});
  assert.deepEqual(parseCookingVoiceCommand("add salt"),
    {kind:"unknown",raw:"add salt"});
});
