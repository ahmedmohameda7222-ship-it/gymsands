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


// Transaction-scoped Nutrition Diary SQL on a disposable Postgres stack.
// Uses current log_nutrition_group runtime contract, not removed app-wide QA.
const {spawnSync:spawnDiarySql}=await import("node:child_process");
const ownerDiary="ed300000-0000-4000-8000-000000000001";
const otherDiary="ed300000-0000-4000-8000-000000000002";
const diaryOp="ed300000-0000-4000-8000-000000000050";
function localDiaryDatabase(){
  const url=new URL(process.env.NUTRITION_DISPOSABLE_DB_URL??"");
  if(!["postgresql:","postgres:"].includes(url.protocol) ||
      !["127.0.0.1","localhost","[::1]"].includes(url.hostname) ||
      url.port!=="54322" || url.pathname!=="/postgres")
    throw Error("Refusing external Nutrition Diary database");
  return process.env.NUTRITION_DISPOSABLE_DB_URL;
}
function diarySql(sql){
  const result=spawnDiarySql("psql",["-X","-q","-A","-t","-v","ON_ERROR_STOP=1",
    "-d",localDiaryDatabase(),"-c",sql],{encoding:"utf8",
    timeout:15000,maxBuffer:1024*1024,
    env:{...process.env,PGCONNECT_TIMEOUT:"5"}});
  assert.equal(result.error,undefined);
  assert.equal(result.status,0,String(result.stderr));
  return String(result.stdout).trim().split(/\r?\n/).at(-1);
}
function diarySetup(){
  const identity=(id,name)=>
    "('"+id+"','authenticated','authenticated','"+
    name+"@nutrition-qa.invalid','',"+
    "'{\"provider\":\"email\",\"providers\":[\"email\"]}'::jsonb,"+
    "'{}'::jsonb,now(),now())";
  return "BEGIN; INSERT INTO auth.users "+
    "(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) "+
    "VALUES "+identity(ownerDiary,"diary-owner")+","+
    identity(otherDiary,"diary-foreign")+"; "+
    "SET LOCAL ROLE authenticated; "+
    "SELECT set_config('request.jwt.claim.role','authenticated',true); "+
    "SELECT set_config('request.jwt.claim.sub','"+ownerDiary+"',true); ";
}
function diaryCall(){
  const metadata="'{\"name\":\"Synthetic unknown nutrition bowl\"}'::jsonb";
  const facts="'[{\"foodName\":\"Synthetic unknown nutrition bowl\","+
    "\"servingLabel\":\"1 bowl\",\"quantity\":1,\"nutrition\":{"+
    "\"caloriesKcal\":null,\"proteinG\":null,\"carbsG\":null,\"fatG\":null}}]'::jsonb";
  return "SELECT public.log_nutrition_group('"+diaryOp+"',"+
    "date '2026-11-20','Lunch','quick_add',null,null,"+
    metadata+","+facts+",null); ";
}
test("disposable Diary replay preserves exactly one grouped log and unknown macros",()=>{
  const result=diarySql(diarySetup()+diaryCall()+diaryCall()+
    "SELECT "+
    "(SELECT count(*) FROM public.nutrition_log_groups "+
      "WHERE operation_id='"+diaryOp+"' AND user_id='"+ownerDiary+"'),"+
    "(SELECT count(*) FROM public.food_logs "+
      "WHERE user_id='"+ownerDiary+"' AND food_name='Synthetic unknown nutrition bowl' "+
      "AND calories IS NULL AND protein_g IS NULL "+
      "AND carbs_g IS NULL AND fat_g IS NULL); "+
    "ROLLBACK;");
  assert.equal(result,"1|1");
});
test("separate authenticated owner cannot read another member's grouped Diary",()=>{
  const result=diarySql(diarySetup()+diaryCall()+
    "SELECT set_config('request.jwt.claim.sub','"+otherDiary+"',true); "+
    "SELECT count(*) FROM public.nutrition_log_groups "+
      "WHERE operation_id='"+diaryOp+"'; "+
    "ROLLBACK;");
  assert.equal(result,"0");
});


// Saved Meal first-try/replay identity under real disposable PostgreSQL authority.
const savedMealOperationId="ed300000-0000-4000-8000-000000000060";
const syntheticFrozenFoodId="ed300000-0000-4000-8000-000000000070";
function savedMealCommand(name="QA Synthetic Meal"){
  const item=JSON.stringify([{
    kind:"food",food_id:syntheticFrozenFoodId,resolved_quantity:1,
    resolved_serving_label:"100 g",frozen_name:"Synthetic Rice",
    nutrition:{calories:null,protein_g:null,carbs_g:null,fat_g:null}
  }]).replaceAll("'","''");
  return "SELECT public.create_nutrition_saved_meal_idempotent('"+
    savedMealOperationId+"','"+name+"',null,false,'"+item+"'::jsonb); ";
}
test("disposable Saved Meal retry converges to one frozen root and one child",()=>{
  const result=diarySql(diarySetup()+
    savedMealCommand()+savedMealCommand()+
    "SELECT "+
    "(SELECT count(*) FROM public.nutrition_saved_meals "+
      "WHERE user_id='"+ownerDiary+"' AND name='QA Synthetic Meal'),"+
    "(SELECT count(*) FROM public.nutrition_saved_meal_items "+
      "WHERE user_id='"+ownerDiary+"'),"+
    "(SELECT count(*) FROM private.nutrition_saved_meal_creation_operations "+
      "WHERE user_id='"+ownerDiary+"' AND operation_id='"+savedMealOperationId+"'); "+
    "ROLLBACK;");
  assert.equal(result,"1|1|1");
});
test("same Saved Meal idempotency key with different frozen content is rejected",()=>{
  const query=diarySetup()+savedMealCommand()+
    savedMealCommand("Changed meal semantics");
  const result=spawnDiarySql("psql",["-X","-q","-A","-t","-v","ON_ERROR_STOP=1",
    "-d",localDiaryDatabase(),"-c",query],{
    encoding:"utf8",timeout:15000,maxBuffer:1024*1024,
    env:{...process.env,PGCONNECT_TIMEOUT:"5"}
  });
  assert.equal(result.error,undefined);
  assert.notEqual(result.status,0,"Wrong-semantic retry cannot succeed");
  assert.match(String(result.stderr),/already used with different input/);
});


// Regression N095/N105: typed JSON input may be null/boolean/blank despite
// TypeScript declarations. Never coerce unknown custom Food calories to zero.
const { requireNonNegativeFoodNumber }=
  await vite.ssrLoadModule("/lib/nutrition-v1/user-food-write-numbers.ts");
test("Custom Food required numeric values never coerce unknown calories into zero",()=>{
  for(const input of [null,undefined,"", "0",false,true,{},[]]){
    assert.throws(()=>requireNonNegativeFoodNumber(input,"Calories"),
      /Calories must be a non-negative number/,
      "A non-number must not become a fabricated calorie value");
  }
  assert.equal(requireNonNegativeFoodNumber(0,"Calories"),0,
    "Measured, explicit numeric zero remains valid");
  assert.equal(requireNonNegativeFoodNumber(125.5,"Calories"),125.5);
  for(const input of [-1,NaN,Infinity,-Infinity]){
    assert.throws(()=>requireNonNegativeFoodNumber(input,"Calories"),
      /Calories must be a non-negative number/);
  }
});


const { optionalPositiveFoodNumber }=
  await vite.ssrLoadModule("/lib/nutrition-v1/user-food-write-numbers.ts");
test("Custom Food numeric basis rejects non-measured quantities without inventing grams",()=>{
  for(const input of [null,undefined,""]){
    assert.equal(optionalPositiveFoodNumber(input,"Basis amount"),null);
  }
  for(const input of [false,true,"100",{},[],0,-1,NaN,Infinity]){
    assert.throws(()=>optionalPositiveFoodNumber(input,"Basis amount"),
      /Basis amount must be greater than zero/);
  }
  assert.equal(optionalPositiveFoodNumber(100,"Basis amount"),100);
  assert.equal(optionalPositiveFoodNumber(0.5,"Basis amount"),0.5);
});


// N093: Food→Diary/Meal Plan/Recipe/Saved Meal and Recipe→consumer handoffs
// must use an actual, finite, positive quantity, never JS numeric coercion.
const { parsePositiveHandoffQuantity }=
  await vite.ssrLoadModule("/lib/nutrition-v1/handoff-quantity.ts");
test("Food and Recipe handoff quantities cannot be fabricated from booleans or strings",()=>{
  for(const input of [null,undefined,"","1",true,false,0,-1,NaN,Infinity,{},[]]){
    assert.equal(parsePositiveHandoffQuantity(input),null);
  }
  assert.equal(parsePositiveHandoffQuantity(1),1);
  assert.equal(parsePositiveHandoffQuantity(0.5),0.5);
});


// Invalid payloads must not silently turn into generic 500 server failures.
const { InvalidNutritionFoodInputError }=
  await vite.ssrLoadModule("/lib/nutrition-v1/user-food-write-numbers.ts");
test("Custom Food invalid nutrition numbers carry a client-input HTTP status contract",()=>{
  for(const invalid of [
    ()=>requireNonNegativeFoodNumber(null,"Calories"),
    ()=>requireNonNegativeFoodNumber(false,"Protein"),
    ()=>optionalPositiveFoodNumber(true,"Basis amount")
  ]){
    assert.throws(invalid,(error)=>
      error instanceof InvalidNutritionFoodInputError
      && error.status===400
      && error.code==="nutrition_request_invalid"
    );
  }
});

// N095/N105: a malformed Food name, serving label, or basis unit is a bounded
// 400 client input error, never an unexpected 500 server failure.
const {requireNonBlankFoodText, requireFoodBasisUnit}=await vite.ssrLoadModule(
  "/lib/nutrition-v1/user-food-write-numbers.ts");
test("Custom Food malformed labels and basis units are bounded client input errors",()=>{
  const invalid=(fn)=>assert.throws(fn,(error)=>
    error instanceof InvalidNutritionFoodInputError &&
    error.status===400 && error.code==="nutrition_request_invalid");
  for(const v of [null,undefined,"","  ",false,0,{},[]]){
    invalid(()=>requireNonBlankFoodText(v,"Food name"));
    invalid(()=>requireNonBlankFoodText(v,"Serving basis"));
  }
  assert.equal(requireNonBlankFoodText(" Rice ","Food name"),"Rice");
  assert.equal(requireNonBlankFoodText(" 100 g ","Serving basis"),"100 g");
  for(const v of [undefined,"","kg",false,0,{},[]])invalid(()=>requireFoodBasisUnit(v));
  for(const v of ["g","ml","serving","piece","custom"])assert.equal(requireFoodBasisUnit(v),v);
  assert.equal(requireFoodBasisUnit(null),null);
});

// N093: JSON null is an explicit invalid quantity, not the same as an absent key.
const {parseRecipeHandoffQuantity}=await vite.ssrLoadModule("/lib/nutrition-v1/handoff-quantity.ts");
test("Recipe quantity defaults only when absent, never for explicit null",()=>{
  assert.equal(parseRecipeHandoffQuantity(undefined),1);
  assert.equal(parseRecipeHandoffQuantity(1),1);
  assert.equal(parseRecipeHandoffQuantity(0.75),0.75);
  for(const input of [null,false,true,"", "1",0,-1,NaN,Infinity,{},[]]){
    assert.equal(parseRecipeHandoffQuantity(input),null);
  }
});

// N095: optimistic concurrency must never convert null, booleans or strings to revision zero.
const {parseNonNegativeRevision}=await vite.ssrLoadModule("/lib/nutrition-v1/write-revision.ts");
test("Optimistic revisions accept only explicit nonnegative integer numbers",()=>{
  for(const v of [null,undefined,"","0","1",true,false,{},[],-1,0.5,NaN,Infinity,-Infinity,Number.MAX_SAFE_INTEGER+1]){
    assert.equal(parseNonNegativeRevision(v),null);
  }
  for(const v of [0,1,12,Number.MAX_SAFE_INTEGER])assert.equal(parseNonNegativeRevision(v),v);
});

// N093 follow-up: an explicit blank query parameter is not an omitted quantity.
// The GET handoff has a text query contract, unlike the POST JSON number contract.
const {parseRecipeHandoffQueryQuantity}=await vite.ssrLoadModule("/lib/nutrition-v1/handoff-quantity.ts");
test("Recipe handoff GET query defaults only when quantity key is absent",()=>{
  assert.equal(parseRecipeHandoffQueryQuantity(null),1);
  assert.equal(parseRecipeHandoffQueryQuantity("1"),1);
  assert.equal(parseRecipeHandoffQueryQuantity(" 2.5 "),2.5);
  for(const input of ["","  ","0","-1","NaN","Infinity","not-a-number"]){
    assert.equal(parseRecipeHandoffQueryQuantity(input),null);
  }
});

// N094: published Recipe detail and frozen Recipe handoff must agree on
// whether a metadata nutrition fact is truly measured (0) or unknown (NULL).
const {readPublishedRecipeNutritionFact}=await vite.ssrLoadModule("/lib/nutrition-v1/recipe-cache.ts");
test("Published Recipe handoff metadata cannot fabricate known-zero nutrition",()=>{
  for(const raw of [null,undefined,"","  ","0","25",false,true,-1,NaN,Infinity,-Infinity,{},[]]){
    assert.equal(readPublishedRecipeNutritionFact(raw),null);
  }
  assert.equal(readPublishedRecipeNutritionFact(0),0);
  assert.equal(readPublishedRecipeNutritionFact(25.5),25.5);
});

// N095: mutate-week accepts JSON member input, unlike DB numeric text readback.
// A false boolean must not become a measured 1 serving; null position is not 0.
const {normalizeOccurrenceForMutation}=await vite.ssrLoadModule("/services/nutrition-v1/server/meal-plan.ts");
test("Meal Plan occurrence write numbers reject JSON coercion and emit 400",()=>{
  const base={planDate:"2026-11-20",mealSlotKey:"lunch",sourceType:"placeholder",
    sourceId:null,sourceVersionId:null,frozenName:"Pending lunch",frozenSnapshot:{},status:"planned"};
  const invalid=(payload)=>assert.throws(()=>normalizeOccurrenceForMutation(payload),(e)=>
    e?.status===400 && e?.code==="nutrition_request_invalid");
  for(const raw of [false,true,"1","",0,-1,Infinity,NaN,{},[]]){
    invalid({...base,resolvedQuantity:raw});
  }
  for(const raw of [null,false,true,"0","2",-1,1.2,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){
    invalid({...base,position:raw});
  }
  assert.equal(normalizeOccurrenceForMutation({...base,resolvedQuantity:null}).resolvedQuantity,null);
  assert.equal(normalizeOccurrenceForMutation({...base,resolvedQuantity:2.5,position:0}).resolvedQuantity,2.5);
  assert.equal(normalizeOccurrenceForMutation(base).position,0);
});

// N095: offline localStorage is untrusted deserialized state, not an integer-safe
// revision source. Reject unsafe numbers before sending any queued replay.
test("Offline Meal Plan revision tokens cannot exceed safe integer range",()=>{
  for(const baseRevision of [Number.MAX_SAFE_INTEGER+1,-1,0.5]){
    const invalid={...queueEntry,baseRevision};
    assert.throws(()=>serializeMealPlanQueue([invalid]),/invalid data/i);
    assert.deepEqual(deserializeMealPlanQueue(JSON.stringify([invalid])),[]);
  }
  assert.throws(()=>reconcileMealPlanQueue([queueEntry],{
    serverRevision:Number.MAX_SAFE_INTEGER+1,changedTargets:[]
  }),/Server Meal Plan revision is invalid/);
  const accepted=reconcileMealPlanQueue([queueEntry],{serverRevision:Number.MAX_SAFE_INTEGER,changedTargets:[]});
  assert.equal(accepted[0].baseRevision,Number.MAX_SAFE_INTEGER);
});

// N095: member Diary logging receives untrusted JSON. Boolean false must remain
// invalid, not a measured zero; true/numeric strings must not become quantities.
const {parseDiaryWriteNutritionFact,parseDiaryWriteQuantity}=await vite.ssrLoadModule(
  "/lib/nutrition-v1/diary-write-numbers.ts");
test("Diary logged nutrition facts and quantities are never coerced from JSON strings or booleans",()=>{
  assert.equal(parseDiaryWriteNutritionFact(null),null);
  assert.equal(parseDiaryWriteNutritionFact(undefined),null);
  assert.equal(parseDiaryWriteNutritionFact(0),0);
  assert.equal(parseDiaryWriteNutritionFact(30.25),30.25);
  for(const raw of [false,true,"","0","25",-1,NaN,Infinity,-Infinity,[],{}]){
    assert.equal(parseDiaryWriteNutritionFact(raw),undefined);
  }
  assert.equal(parseDiaryWriteQuantity(1),1);
  assert.equal(parseDiaryWriteQuantity(0.5),0.5);
  for(const raw of [null,undefined,false,true,"","1",0,-1,NaN,Infinity,[],{}]){
    assert.equal(parseDiaryWriteQuantity(raw),null);
  }
});

// N095: before invoking the idempotent water RPC, positive milliliters must
// remain positive after integer normalization; no unsafe numeric payloads.
const {parseDiaryWaterAmountMl}=await vite.ssrLoadModule("/lib/nutrition-v1/diary-write-numbers.ts");
test("Diary water amount never rounds a positive input down to an unlogged zero",()=>{
  assert.equal(parseDiaryWaterAmountMl(250),250);
  assert.equal(parseDiaryWaterAmountMl(0.5),1);
  assert.equal(parseDiaryWaterAmountMl(2.49),2);
  for(const v of [undefined,null,false,true,"250",0,0.1,0.49,-1,NaN,Infinity,-Infinity,Number.MAX_SAFE_INTEGER+1]){
    assert.equal(parseDiaryWaterAmountMl(v),null);
  }
});

// N095: a single frequently revised Recipe must not crowd other roots out of
// the globally limited versions query and cause published Recipes to look draft.
const {recipeVersionBackfillIds}=await vite.ssrLoadModule("/lib/nutrition-v1/recipe-list-page.ts");
test("Recipe home pagination backfills roots starved by global version result cap",()=>{
  const roots=["recipe-heavy","recipe-a","recipe-b","recipe-unpublished"];
  const capped=Array.from({length:6},()=>({recipe_id:"recipe-heavy"}));
  assert.deepEqual(recipeVersionBackfillIds(roots,capped,6),
    ["recipe-a","recipe-b","recipe-unpublished"]);
  assert.deepEqual(recipeVersionBackfillIds(roots,capped.slice(0,5),6),[],
    "An uncapped response already covers every existing version");
  assert.deepEqual(recipeVersionBackfillIds(roots,[...capped.slice(0,5),{recipe_id:"recipe-a"}],6),
    ["recipe-b","recipe-unpublished"]);
  assert.throws(()=>recipeVersionBackfillIds(roots,capped,0),/cap must be positive/i);
});
