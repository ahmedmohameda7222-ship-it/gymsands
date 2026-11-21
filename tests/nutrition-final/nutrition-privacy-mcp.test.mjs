/** Nutrition-only privacy/permission contract tests; no network or user data. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after,test } from "node:test";
import { createServer } from "vite";
const vite=await createServer({configFile:false,resolve:{alias:{"@":process.cwd()}},server:{middlewareMode:true},
  appType:"custom",logLevel:"error"});
after(async()=>vite.close());
const {
  MCP_SCOPES,MCP_PUBLIC_OAUTH_SCOPES,MCP_DEFAULT_SCOPES,MCP_RECIPE_SCOPES,
  hasScope,expandMcpScopes,migrateLegacyScopes,resolveSavedAiPermissionScopes
}=await vite.ssrLoadModule("/lib/mcp/scopes.ts");
const {ACCOUNT_DELETION_CONFIRMATION,RECENT_REAUTHENTICATION_MS}=
  await vite.ssrLoadModule("/lib/privacy/deletion-contract.ts");
test("anonymous default has zero implicit OAuth scopes",()=>{
  assert.deepEqual([...MCP_DEFAULT_SCOPES],[]);
  assert.equal(hasScope([],MCP_SCOPES.nutritionRead),false);
});
test("public OAuth cannot discover admin or legacy blanket scope",()=>{
  assert.ok(!MCP_PUBLIC_OAUTH_SCOPES.includes(MCP_SCOPES.admin));
  assert.ok(!MCP_PUBLIC_OAUTH_SCOPES.includes(MCP_SCOPES.all));
});
test("Nutrition write implies Nutrition read but never Train/workout read",()=>{
  const scopes=expandMcpScopes([MCP_SCOPES.nutritionWrite]);
  assert.ok(scopes.includes(MCP_SCOPES.nutritionRead));
  assert.ok(!scopes.includes(MCP_SCOPES.workoutsRead));
});
test("Nutrition permission never authorizes Recipe publishing by MCP",()=>{
  assert.equal(MCP_RECIPE_SCOPES.read,MCP_SCOPES.nutritionRead);
  assert.equal(MCP_RECIPE_SCOPES.writeDraft,MCP_SCOPES.nutritionWrite);
  assert.ok(!Object.hasOwn(MCP_RECIPE_SCOPES,"publish"));
});
test("legacy blanket or admin scopes cannot prove saved explicit consent",()=>{
  assert.deepEqual(migrateLegacyScopes(["fitlife.admin","fitlife.all"]),[]);
  assert.deepEqual(resolveSavedAiPermissionScopes("full",[
    MCP_SCOPES.fullAccess,MCP_SCOPES.admin
  ]),[]);
});
test("custom preferences preserve only declared section-specific rights",()=>{
  const scopes=resolveSavedAiPermissionScopes("custom",[
    MCP_SCOPES.nutritionWrite,MCP_SCOPES.admin
  ]);
  assert.ok(scopes.includes(MCP_SCOPES.nutritionRead));
  assert.ok(!scopes.includes(MCP_SCOPES.admin));
  assert.ok(!scopes.includes(MCP_SCOPES.workoutsRead));
});
test("account deletion requires nontrivial exact confirmation and recent auth",()=>{
  assert.equal(ACCOUNT_DELETION_CONFIRMATION,"DELETE MY PLAIVRA ACCOUNT");
  assert.ok(RECENT_REAUTHENTICATION_MS>0);
  assert.ok(RECENT_REAUTHENTICATION_MS<=10*60*1000);
});


// N106: real pure security/idempotency implementations, synthetic-only payloads.
const {deriveMcpMutationOperationId}=
  await vite.ssrLoadModule("/lib/mcp/idempotency.ts");
const {validateMcpToolInput,minimizeMcpOutput,sanitizeMcpToolResult}=
  await vite.ssrLoadModule("/lib/mcp/safety.ts");
const {ACCOUNT_DELETION_IMPACT_VERSION}=await vite.ssrLoadModule(
  "/lib/privacy/deletion-contract.ts");
const {validateAccountDeletionRequest,isRecentReauthentication,deletionSubjectHash}=
  await vite.ssrLoadModule("/lib/privacy/deletion-request.ts");

test("MCP idempotency UUID is stable for exact user/tool/key and isolated by owner",()=>{
  const input={idempotency_key:"read-only-example-123456"};
  const one=deriveMcpMutationOperationId({userId:"owner-a"},"add_water",input);
  const same=deriveMcpMutationOperationId({userId:"owner-a"},"add_water",input);
  const other=deriveMcpMutationOperationId({userId:"owner-b"},"add_water",input);
  const tool=deriveMcpMutationOperationId({userId:"owner-a"},"write_food",input);
  assert.match(one,/^[a-f0-9-]{36}$/);
  assert.equal(one,same);
  assert.notEqual(one,other);
  assert.notEqual(one,tool);
});
test("MCP mutation refuses unstable or short idempotency key",()=>{
  assert.throws(()=>deriveMcpMutationOperationId({userId:"owner"},
    "add_water",{idempotency_key:"short"}),/stable 16-200/);
});
test("deletion request fails closed for incorrect confirmation and missing impact",()=>{
  const key="0123456789ABCDEF";
  assert.equal(validateAccountDeletionRequest({confirmation:"delete",impact_version:ACCOUNT_DELETION_IMPACT_VERSION,idempotency_key:key}).code,
    "confirmation_required");
  assert.equal(validateAccountDeletionRequest({confirmation:ACCOUNT_DELETION_CONFIRMATION,impact_version:"stale",idempotency_key:key}).code,
    "impact_acknowledgement_required");
});
test("valid deletion acknowledgement requires stable idempotency key hash",()=>{
  const requested=validateAccountDeletionRequest({
    confirmation:ACCOUNT_DELETION_CONFIRMATION,
    impact_version:ACCOUNT_DELETION_IMPACT_VERSION,
    idempotency_key:"0123456789ABCDEF"
  });
  assert.equal(requested.ok,true);
  assert.match(requested.idempotencyKeyHash,/^[0-9a-f]{64}$/);
  assert.equal(validateAccountDeletionRequest({
    confirmation:ACCOUNT_DELETION_CONFIRMATION,
    impact_version:ACCOUNT_DELETION_IMPACT_VERSION,
    idempotency_key:"short"
  }).code,"invalid_idempotency_key");
});
test("deletion fresh authentication rejects expired and future sign-ins",()=>{
  const now=Date.parse("2026-11-20T12:00:00.000Z");
  assert.equal(isRecentReauthentication("2026-11-20T11:55:00.000Z",now),true);
  assert.equal(isRecentReauthentication("2026-11-20T11:49:00.000Z",now),false);
  assert.equal(isRecentReauthentication("2026-11-20T12:01:00.000Z",now),false);
});
test("deletion subject digest does not reuse IDs across owners",()=>{
  const first=deletionSubjectHash("owner-A");
  assert.equal(deletionSubjectHash("owner-A"),first);
  assert.notEqual(deletionSubjectHash("owner-B"),first);
  assert.match(first,/^[0-9a-f]{64}$/);
});
test("MCP output minimization strips owner IDs and credentials recursively",()=>{
  const result=minimizeMcpOutput({
    owner_id:"private",updated_at:"2026-11-20T12:00:00Z",
    nested:{connection_id:"private-connection",access_token:"secret",
      notes:"internal note",text:"Bearer abc123"}
  });
  assert.equal(result.owner_id,undefined);
  assert.equal(result.updated_at,"2026-11-20T12:00:00Z");
  assert.equal(result.nested.connection_id,undefined);
  assert.equal(result.nested.access_token,undefined);
  assert.equal(result.nested.notes,undefined);
  assert.equal(result.nested.text,"Bearer [REDACTED]");
});
test("MCP result scrubs both structured payload and echoed text",()=>{
  const data={ok:true,owner_id:"private-owner",token:"private-secret",name:"Rice"};
  const result=sanitizeMcpToolResult({
    structuredContent:data,content:[{type:"text",text:JSON.stringify(data)}]
  });
  assert.deepEqual(result.structuredContent,{ok:true,name:"Rice"});
  assert.equal(result.content[0].text,JSON.stringify({ok:true,name:"Rice"}));
});
test("MCP input validation forbids caller-controlled owner identity",()=>{
  const tool={
    inputSchema:{type:"object",properties:{query:{type:"string"}},
      additionalProperties:false},
    annotations:{destructiveHint:false}
  };
  const result=validateMcpToolInput(tool,{query:"rice",owner_id:"spoofed"});
  assert.equal(result.success,false);
  assert.ok(result.errors.some(error=>error.includes("server-controlled")));
});


// Actual local Next.js HTTP denial contracts: no real account, no bearer token,
// no live database and no Production requests. These do not prove owner isolation.
function isolatedApiOrigin(){
  const url=new URL(process.env.NUTRITION_E2E_BASE_URL??"");
  if(url.protocol!=="http:"||
    !["localhost","127.0.0.1","[::1]"].includes(url.hostname)||
    url.port!=="3000" || url.pathname!=="/" || url.search || url.hash ||
    url.username || url.password)
    throw Error("Nutrition API gate may only target disposable localhost:3000");
  return url.origin;
}
async function unauthenticatedApi(method,path){
  const response=await fetch(isolatedApiOrigin()+path,{
    method,headers:{"accept":"application/json",...(method==="POST"?{"content-type":"application/json"}:{})},
    ...(method==="POST"?{body:JSON.stringify({operation:"synthetic-test-only"})}:{})
  });
  assert.equal(response.status,401,method+" "+path+" must reject unauthenticated access");
  assert.match(response.headers.get("cache-control")??"",/private.*no-store/i);
  assert.match(response.headers.get("vary")??"",/Authorization/i);
  const body=await response.json();
  assert.ok(typeof body.error==="string"&&body.error.length>0);
}
test("Food Library read and write reject missing owner token before service access",async()=>{
  await unauthenticatedApi("GET","/api/nutrition/v1/foods?q=rice");
  await unauthenticatedApi("POST","/api/nutrition/v1/foods");
});
test("Diary and Meal Plan read/write reject missing owner token",async()=>{
  for(const path of ["/api/nutrition/v1/diary?date=2026-11-20",
    "/api/nutrition/v1/meal-plan/week?weekStart=2026-11-16"]){
    await unauthenticatedApi("GET",path);
    await unauthenticatedApi("POST",path);
  }
});
test("Recipe publishing, Saved Meal write and handoff commit reject anonymous HTTP",async()=>{
  await unauthenticatedApi("POST",
    "/api/nutrition/v1/recipes/00000000-0000-4000-8000-000000000001/publish");
  await unauthenticatedApi("POST","/api/nutrition/v1/saved-meals");
  await unauthenticatedApi("POST","/api/nutrition/v1/handoffs/commit");
});

// N097: during an auth-context switch, React passive effects from the same
// render can see new userId but stale prior owner's plate/pendingOperationId.
// The new owner key must never receive the previous owner's draft payload.
const {canPersistDiaryDraftForHydratedOwner}=await vite.ssrLoadModule(
  "/lib/nutrition-v1/diary-draft-owner.ts");
test("Diary draft storage cannot write previous account plate into next account key",()=>{
  const ownerA="plaivra:nutrition-v1:diary-draft:owner-A:2026-11-21:lunch";
  const ownerB="plaivra:nutrition-v1:diary-draft:owner-B:2026-11-21:lunch";
  assert.equal(canPersistDiaryDraftForHydratedOwner(ownerA,ownerA),true);
  assert.equal(canPersistDiaryDraftForHydratedOwner(ownerB,ownerA),false);
  assert.equal(canPersistDiaryDraftForHydratedOwner(ownerA,ownerB),false);
  assert.equal(canPersistDiaryDraftForHydratedOwner(ownerB,null),false);
  assert.equal(canPersistDiaryDraftForHydratedOwner(null,ownerA),false);
  assert.equal(canPersistDiaryDraftForHydratedOwner("",""),false);
});

// N097/N106 source contract: a late completion from account A cannot reset
// the account B plate and an old plate cannot be submitted with account B JWT.
test("Diary submission rejects stale account plate and ignores late responses",()=>{
  const src=readFileSync(resolve("components/nutrition/diary/logging-session.tsx"),"utf8");
  const begin=src.indexOf("async function submitPlate()");
  const end=src.indexOf("\n  const modes:",begin);
  assert.ok(begin>0&&end>begin,"Diary submission handler is required");
  const submit=src.slice(begin,end);
  assert.ok(submit.includes("if (!canPersistDiaryDraftForHydratedOwner(key, hydratedDraftKey)"),
    "Submit must reject stale user/date plates");
  assert.ok(submit.includes("if (activeDraftKeyRef.current !== submitOwnerKey) return;"),
    "A previous owner's late response must not modify the new owner's UI");
  assert.ok(src.includes("localStorage.removeItem(key)"),
    "Deleting the last plate item must remove the old draft from storage");
});

// N095/N106 cross-account async source contract. Both network responses and
// local queued replay can outlive owner/week navigation; guard side effects.
test("Meal Plan async response and offline replay cannot cross owner/week boundary",()=>{
  const src=readFileSync(resolve("components/nutrition/meal-plan/meal-plan-page.tsx"),"utf8");
  assert.ok(src.includes("activeMealPlanContextKeyRef"),"Missing current owner/week reference");
  assert.ok(src.includes("sameMealPlanOwnerWeekContext(activeMealPlanContextKeyRef.current, requestContextKey)"),
    "Async load and sync must verify the exact request context");
  const start=src.indexOf("const flushQueue = useCallback("), end=src.indexOf("const load = useCallback(",start);
  assert.ok(start>0&&end>start);
  const replay=src.slice(start,end);
  assert.ok(replay.indexOf("if (!sameMealPlanOwnerWeekContext(")<replay.indexOf("writeQueue(ownerId, weekStart, remaining)"),
    "Persisted queue and local UI status may only be updated for the same owner/week");
  assert.ok(replay.includes("syncingContextKeyRef.current === requestContextKey"),
    "Replay mutex must be scoped by owner/week instead of globally blocking new users");
});

// N095/N106: a mutation or cross-week copy can outlive a changed JWT owner;
// no cache, queue or screen write belongs under a stale operation's context.
test("Meal Plan editor and bulk copy never queue prior owner's mutations after a switch",()=>{
  const src=readFileSync(resolve("components/nutrition/meal-plan/meal-plan-page.tsx"),"utf8");
  for(const [startMark,endMark] of [
    ["async function mutateWeek(", "async function mutate("],
    ["async function writeCopiesToWeek(", "async function saveBulkCopy("]
  ]){
    const from=src.indexOf(startMark),to=src.indexOf(endMark,from);
    assert.ok(from>0&&to>from,"Missing bounded mutation implementation: "+startMark);
    const handler=src.slice(from,to);
    assert.ok(handler.includes("sameMealPlanOwnerWeekContext(activeMealPlanContextKeyRef.current, requestContextKey)"),
      "Missing exact owner/week context guard: "+startMark);
    assert.ok(handler.includes("catch"),"Network error path must be explicit: "+startMark);
  }
});

// N095/N106: a late mark-eaten or bulk-copy result must not confirm success
// or clear the new user's editor after owner/week navigation.
test("Meal Plan mark-eaten and bulk-copy promises cannot confirm after owner switch",()=>{
  const src=readFileSync(resolve("components/nutrition/meal-plan/meal-plan-page.tsx"),"utf8");
  const slices=[
    ["async function markEaten(", "function logWithChanges("],
    ["async function saveBulkCopy(", "return ("]
  ];
  for(const [startMark,endMark] of slices){
    const start=src.indexOf(startMark),end=src.indexOf(endMark,start);
    assert.ok(start>0&&end>start,"Missing mutation handler "+startMark);
    const body=src.slice(start,end);
    assert.ok(body.includes("sameMealPlanOwnerWeekContext(activeMealPlanContextKeyRef.current, requestContextKey)"),
      "Missing owner/week promise guard in "+startMark);
  }
});

// N097: Cooking restore and pending-sync callbacks can outlive an auth change.
const { sameCookingOwnerRecipeContext }=await vite.ssrLoadModule(
  "/lib/nutrition-v1/cooking-local-store.ts");
test("Cooking recovery and sync reject a previous owner or recipe context",()=>{
  assert.equal(sameCookingOwnerRecipeContext("owner-A:recipe-1","owner-A:recipe-1"),true);
  for(const [current,request] of [
    ["owner-B:recipe-1","owner-A:recipe-1"],
    ["owner-A:recipe-2","owner-A:recipe-1"],
    ["", ""],
    [null,"owner-A:recipe-1"],
    ["owner-A:recipe-1",null],
  ]){
    assert.equal(sameCookingOwnerRecipeContext(current,request),false);
  }
});
test("Cooking async recovery and mutation callbacks validate the active owner/recipe",()=>{
  const src=readFileSync(resolve("components/nutrition/cooking/cooking-mode.tsx"),"utf8");
  assert.ok(src.includes("activeCookingContextKeyRef"),"Cooking context ref must be present");
  for(const marker of ["const initialize = useCallback(", "const flushPending = useCallback(",
    "const persistAndSync = useCallback("]){
    const at=src.indexOf(marker);
    assert.ok(at>0,"Missing Cooking callback "+marker);
    const end=src.indexOf("\n  }, [",at);
    const body=src.slice(at,end>at?end:at+12000);
    assert.ok(body.includes("sameCookingOwnerRecipeContext("),
      "Async Cooking callback must guard old owner/recipe: "+marker);
  }
  assert.ok(src.includes("useLayoutEffect(() => {"),"Auth switching must clear stale Cooking UI before paint");
});

// N097: hidden Cooking continuations (Resume/Start Over/End/Action) must not
// accept old owner's Promise completion after auth context has changed.
test("Cooking resume and completion cannot overwrite a new owner after old async result",()=>{
  const src=readFileSync(resolve("components/nutrition/cooking/cooking-mode.tsx"),"utf8");
  for(const [startMark,endMark] of [
    ["const onResume = useCallback(", "const onStartOver = useCallback("],
    ["const onStartOver = useCallback(", "const updateAction = useCallback("],
    ["const updateAction = useCallback(", "const startTimer = useCallback("],
    ["const onEndCooking = useCallback(", "async function requestMicrophone()"]
  ]){
    const start=src.indexOf(startMark),end=src.indexOf(endMark,start);
    assert.ok(start>0&&end>start,"Missing Cooking callback "+startMark);
    assert.ok(src.slice(start,end).includes("sameCookingOwnerRecipeContext("),
      "Missing owner/recipe context guard in "+startMark);
  }
});

// N097: automatic timer expiration is itself a mutation and must not set old
// owner data after auth context was invalidated by useLayoutEffect.
test("Cooking automatic expired timer cannot reintroduce prior owner state",()=>{
  const src=readFileSync(resolve("components/nutrition/cooking/cooking-mode.tsx"),"utf8");
  const start=src.indexOf("  useEffect(() => {\n    if (!session || session.status !== \"active\") return;");
  assert.ok(start>0,"Expected active Cooking timer reconciliation effect");
  const end=src.indexOf("  const onResume = useCallback(",start);
  assert.ok(end>start);
  const effect=src.slice(start,end);
  assert.ok(effect.includes("sameCookingOwnerRecipeContext(activeCookingContextKeyRef.current, requestContextKey)"),
    "Expired timer must reject prior owner/Recipe state before setSession");
});

// N097: owner-qualified Recipe cache keys alone are insufficient when an old
// fetch Promise can settle after changing owner/Recipe and overwrite UI state.
test("Recipe published cache and late load cannot leak across account switching",()=>{
  const src=readFileSync(resolve("components/nutrition/recipes/recipe-detail.tsx"),"utf8");
  assert.ok(src.includes("activeRecipeContextKeyRef"),"Missing Recipe request context ref");
  assert.ok(src.includes("useLayoutEffect(() => {"),"Owner switch must clear previous Recipe detail before paint");
  const begin=src.indexOf("const load = useCallback(async () => {");
  const end=src.indexOf("useEffect(() => {",begin);
  assert.ok(begin>0&&end>begin);
  const handler=src.slice(begin,end);
  assert.ok(handler.includes("if (activeRecipeContextKeyRef.current !== requestContextKey) return;"),
    "Late Recipe API and offline-cache results must be ignored after owner change");
  assert.ok(handler.includes("ownerCacheKey(ownerId, recipeId)"),"Owner-qualified cache must remain in use");
});
