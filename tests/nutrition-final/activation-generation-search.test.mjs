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


// N104 Food Library search utility contracts. Authoritative generation search
// also requires separate database RPC/CAS acceptance (not simulated here).
const {normalizeFoodSearchText,resolveEffectiveFoodNutrition,qualifiesFoodNutrition,
  rankFoodLibraryCandidates,paginateFoodLibraryResults}=
  await server.ssrLoadModule("/services/nutrition-v1/server/food-library.ts");
const libraryNutrition=()=>({
  calories:null,protein_g:5,carbs_g:25,fat_g:1,saturated_fat_g:null,
  fiber_g:null,sugars_g:null,sodium_mg:null,basis_amount:100,basis_unit:"g"
});
function food(id,overrides={}){
  return {
    id,source:"catalog",name:"Rice",brand:null,category:null,cuisine:null,
    servingLabel:"100 g",verified:false,favorite:false,recentAt:null,
    frequency:0,locale:"en",aliases:[],nutrition:libraryNutrition(),
    ...overrides
  };
}

test("search normalizer removes German accents and whitespace predictably",()=>{
  assert.equal(normalizeFoodSearchText("  Äpfel  "), "apfel");
  assert.equal(normalizeFoodSearchText("  apfel  "), "apfel");
});
test("Arabic search removes tashkeel and tatweel without inventing translation",()=>{
  assert.equal(normalizeFoodSearchText("زَعْتَــر"),"زعتر");
  assert.equal(normalizeFoodSearchText("زعتر"),"زعتر");
  assert.notEqual(normalizeFoodSearchText("زيت"),"زعتر");
});
test("exact personal Food identity ranks ahead of exact catalog name and favorites",()=>{
  const list=[
    food("catalog",{favorite:true}),
    food("mine",{source:"my_food",favorite:false})
  ];
  assert.deepEqual(rankFoodLibraryCandidates(list,{query:"rice"}).map(x=>x.id),
    ["mine","catalog"]);
});
test("locale-specific German alias ranks above equivalent foreign-locale alias",()=>{
  const list=[
    food("english-alias",{name:"Apple",aliases:[{locale:"en",value:"Äpfel"}]}),
    food("german-alias",{name:"Apples",aliases:[{locale:"de",value:"Äpfel"}]})
  ];
  assert.deepEqual(rankFoodLibraryCandidates(list,{query:"äpfel",locale:"de"}).map(x=>x.id),
    ["german-alias","english-alias"]);
});
test("Arabic exact alias can find a canonical English-name Food",()=>{
  const result=rankFoodLibraryCandidates([
    food("zaatar",{name:"Thyme seasoning",aliases:[{locale:"ar",value:"زَعْتَر"}]}),
    food("irrelevant",{name:"Rice"})
  ],{query:"زعتر",locale:"ar"});
  assert.deepEqual(result.map(x=>x.id),["zaatar"]);
});
test("unknown nutrition never qualifies for objective protein filter or inferred policy",()=>{
  const facts=libraryNutrition();
  assert.equal(qualifiesFoodNutrition(facts,{protein:{operator:"gte",value:5}}),true);
  assert.equal(qualifiesFoodNutrition({...facts,protein_g:null},
    {protein:{operator:"gte",value:5}}),false);
  assert.equal(qualifiesFoodNutrition(facts,{presets:["high-protein"]}),false);
});
test("objective nutrition filter requires explicit versioned thresholds and basis",()=>{
  const policy={policyVersion:"fixture-v1",highProteinMinGPer100:20,
    lowCarbMaxGPer100:30};
  assert.equal(qualifiesFoodNutrition({...libraryNutrition(),protein_g:25},
    {presets:["high-protein","low-carb"]},policy),true);
  assert.equal(qualifiesFoodNutrition({...libraryNutrition(),basis_amount:null},
    {presets:["high-protein"]},policy),false);
});
test("personal nutrition overlay updates only known explicitly supplied fields",()=>{
  const canonical=libraryNutrition();
  const corrected=resolveEffectiveFoodNutrition(canonical,{protein_g:10});
  assert.equal(corrected.protein_g,10);
  assert.equal(corrected.calories,null);
  assert.equal(corrected.carbs_g,25);
  assert.equal(canonical.protein_g,5,"canonical Food fact must not be rewritten");
});
test("cursor distinguishes same id across catalog and personal namespaces",()=>{
  const ranked=[food("shared"),food("shared",{source:"my_food"}),food("next")];
  const a=paginateFoodLibraryResults(ranked,{limit:1});
  const b=paginateFoodLibraryResults(ranked,{limit:1,cursor:a.nextCursor});
  const c=paginateFoodLibraryResults(ranked,{limit:1,cursor:b.nextCursor});
  assert.deepEqual([a.items[0].source,b.items[0].source,c.items[0].id],
    ["catalog","my_food","next"]);
  assert.equal(c.nextCursor,null);
});
test("utility cursor constrains page limit and cannot skip all results when invalid",()=>{
  const ranked=Array.from({length:23},(_,i)=>food("id-"+i));
  const first=paginateFoodLibraryResults(ranked,{limit:100});
  assert.equal(first.items.length,20);
  assert.ok(first.nextCursor);
  const next=paginateFoodLibraryResults(ranked,{limit:100,cursor:first.nextCursor});
  assert.equal(next.items.length,3);
  assert.equal(next.nextCursor,null);
  assert.deepEqual(paginateFoodLibraryResults(ranked,{limit:2,cursor:"invalid"}).items,
    ranked.slice(0,2));
});


// Current-generation search RPC integration on a fully disposable local DB.
// Two Auth identities and owner-keyed Foods exist only inside ROLLBACK.
const {spawnSync:spawnSql}=await import("node:child_process");
const dbUrl=()=>{
  const raw=process.env.NUTRITION_DISPOSABLE_DB_URL;
  if(!raw)throw Error("Missing local Nutrition database connection");
  const url=new URL(raw);
  if(!["postgres:","postgresql:"].includes(url.protocol) ||
     !["127.0.0.1","localhost","[::1]"].includes(url.hostname) ||
     url.port!=="54322" || url.pathname!=="/postgres")
    throw Error("Refusing non-disposable PostgreSQL target");
  return raw;
};
const userOne="ed200000-0000-4000-8000-000000000001";
const userTwo="ed200000-0000-4000-8000-000000000002";
function ownerSearchFixture(){
  const values=(id,name)=>"('"+id+"','authenticated','authenticated','"+
    name+"@nutrition-qa.invalid','',"+
    "'{\"provider\":\"email\",\"providers\":[\"email\"]}'::jsonb,"+
    "'{}'::jsonb,now(),now())";
  return "BEGIN; INSERT INTO auth.users "+
    "(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) "+
    "VALUES "+values(userOne,"search-owner-a")+","+values(userTwo,"search-owner-b")+"; "+
    "INSERT INTO public.user_food_items "+
    "(user_id,food_name,serving_size,calories,protein_g,carbs_g,fat_g) VALUES "+
    "('"+userOne+"','Owner A Rice','100 g',100,3,22,1),"+
    "('"+userTwo+"','Owner B Rice','100 g',210,6,28,2); "+
    "SET LOCAL ROLE authenticated; "+
    "SELECT set_config('request.jwt.claim.role','authenticated',true); ";
}
function localSearchSql(script){
  const result=spawnSql("psql",["-X","-q","-A","-t","-v","ON_ERROR_STOP=1",
    "-d",dbUrl(),"-c",script],{encoding:"utf8",timeout:15000,
    maxBuffer:1024*1024,env:{...process.env,PGCONNECT_TIMEOUT:"5"}});
  assert.equal(result.error,undefined,"Disposable psql executable missing");
  assert.equal(result.status,0,String(result.stderr));
  return String(result.stdout).trim().split(/\r?\n/).at(-1);
}
function ownerSearch(locale,owner){
  const script=ownerSearchFixture()+
    "SELECT set_config('request.jwt.claim.sub','"+owner+"',true); "+
    "SELECT jsonb_array_length(result->'items'),"+
    "result->'items'->0->>'source',"+
    "result->'items'->0->>'name' "+
    "FROM (SELECT public.search_food_catalog_v2("+
    "p_query=>'owner',p_language_tag=>'"+locale+"',p_scope=>'my_food',p_limit=>20) AS result) q; "+
    "ROLLBACK;";
  return localSearchSql(script);
}
test("disposable English Food search shows only authenticated owner's private Food",()=>{
  assert.equal(ownerSearch("en",userOne),"1|my_food|Owner A Rice");
  assert.equal(ownerSearch("en",userTwo),"1|my_food|Owner B Rice");
});
test("disposable German Food search keeps exact private owner isolation",()=>{
  assert.equal(ownerSearch("de",userOne),"1|my_food|Owner A Rice");
  assert.equal(ownerSearch("de",userTwo),"1|my_food|Owner B Rice");
});
test("disposable Arabic Food search keeps exact private owner isolation",()=>{
  assert.equal(ownerSearch("ar",userOne),"1|my_food|Owner A Rice");
  assert.equal(ownerSearch("ar",userTwo),"1|my_food|Owner B Rice");
});
