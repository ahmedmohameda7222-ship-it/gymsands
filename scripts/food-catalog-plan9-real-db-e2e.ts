/** Real USDA 1A1 -> 1A2 control-plane integration on disposable local PostgreSQL. */
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {createHash,randomUUID} from "node:crypto";
import JSZip from "jszip";
import {sql,jsonExpr,callRpc,localRpcClient} from "./food-catalog-plan9-disposable-rpc-transport.mjs";
import {createSupabaseFoodCatalogIngestionCommandStore} from "../services/food-catalog/server/supabase-ingestion-command-store";
import {executeFoodCatalogDatabaseDryRun,executeApprovedFoodCatalogDraftMutation} from "../services/food-catalog/server/ingestion-command-service";
import {parseUsdaFoundationJson,createUsdaFoundationAdapter,usdaFoundationSemanticSignature} from "../lib/food-catalog/ingestion/usda-foundation";
import {selectUsdaFoundationCanary} from "../lib/food-catalog/ingestion/usda-foundation/canary";
import {buildFoodCatalogDryRun} from "../lib/food-catalog/ingestion/engine";
import {stableJson} from "../lib/food-catalog/ingestion/manifest";

const store=createSupabaseFoodCatalogIngestionCommandStore(localRpcClient as any);
const owner="92000000-0000-4000-8000-000000001101";
const member="92000000-0000-4000-8000-000000001102";
const principal="92000000-0000-4000-8000-000000001103";
const digest=(value:Buffer)=>createHash("sha256").update(value).digest("hex");
function summary(){return jsonExpr(`jsonb_build_object(
 'foods',(select count(*) from public.food_items),
 'sources',(select count(*) from public.food_source_records),
 'batches',(select count(*) from public.food_ingestion_batches),
 'runs',(select count(*) from public.food_ingestion_runs),
 'manifests',(select count(*) from public.food_ingestion_manifest_records),
 'materialized',(select count(*) from public.food_ingestion_materialized_results),
 'nutrition',(select count(*) from public.food_nutrition_revisions),
 'names',(select count(*) from public.food_names),
 'servings',(select count(*) from public.food_serving_options),
 'generations',(select count(*) from public.food_catalog_generations),
 'search',(select count(*) from public.food_catalog_search_documents),
 'current',(select current_generation_id from public.food_catalog_current_generation limit 1))`);}
function prepare(batch:any,ns:string){return {
 manifestContent:batch.manifestContent,
 manifestContentChecksumSha256:batch.manifestContentChecksumSha256,
 semanticIdentityChecksumSha256:batch.semanticBatchIdentityChecksumSha256,
 attemptNumber:1,leaseOwner:"disposable-"+ns,leaseSeconds:900,operationNamespace:ns
};}
function seedHuman(){
 // Clearly isolated test fixtures. This script cannot connect to Production.
 sql(`insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values ('${owner}','authenticated','authenticated','disposable-plan9-owner@example.test','',
 '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
 ('${member}','authenticated','authenticated','disposable-plan9-member@example.test','',
 '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());
 insert into public.food_catalog_governance_principals(id,principal_type,subject_id,human_user_id,role_class,active)
 values ('${principal}','human','${owner}','${owner}','owner',true);
 insert into public.food_catalog_governance_capability_assignments
 (principal_id,capability,granted_by_principal_id,reason)
 values ('${principal}','food.ingestion.review','${principal}','Plan 9 disposable integration'),
 ('${principal}','food.governance.manage_principals','${principal}','Plan 9 disposable integration');`);
}
function deny(message:string,action:()=>unknown){
 let failed=false;try{action();}catch{failed=true;}assert.ok(failed,message);
}
function command(batch:any,dry:any,decision:string,expectedReviewState:string){
 return {operationId:randomUUID(),batchId:dry.batchId,decision,expectedReviewState,
 manifestContentChecksumSha256:batch.manifestContentChecksumSha256,
 semanticIdentityChecksumSha256:batch.semanticBatchIdentityChecksumSha256,
 source:batch.manifestContent.source,expectedMutations:batch.manifestContent.expectedMutations,
 reconciliationId:dry.reconciliationId,
 reason:"Plan 9 real USDA disposable-only authorized-review fixture",
 authorizationReference:"DISPOSABLE-INTEGRATION-NOT-PRODUCTION"};
}
function approve(batch:any,dry:any){
 const review=command(batch,dry,"review","prepared");
 deny("anon reviewer",()=>callRpc("food_catalog_review_ingestion_batch_v1",review,"anon"));
 deny("service-role reviewer",()=>callRpc("food_catalog_review_ingestion_batch_v1",review,"service_role"));
 deny("ordinary member cannot impersonate actor",()=>callRpc("food_catalog_review_ingestion_batch_v1",
   {...review,actorPrincipalId:principal},"authenticated",member));
 deny("anonymous authenticated context cannot review",()=>callRpc("food_catalog_review_ingestion_batch_v1",
   review,"authenticated"));
 deny("changed checksum must fail",()=>callRpc("food_catalog_review_ingestion_batch_v1",
   {...review,operationId:randomUUID(),manifestContentChecksumSha256:"f".repeat(64)},"authenticated",owner));
 const reviewed=callRpc("food_catalog_review_ingestion_batch_v1",review,"authenticated",owner);
 assert.equal(reviewed.reviewState,"reviewed");
 assert.deepEqual(callRpc("food_catalog_review_ingestion_batch_v1",review,"authenticated",owner),reviewed);
 deny("changed operation semantic replay",()=>callRpc("food_catalog_review_ingestion_batch_v1",
   {...review,reason:"mutated review reason"},"authenticated",owner));
 const approved=callRpc("food_catalog_review_ingestion_batch_v1",
   command(batch,dry,"approve","reviewed"),"authenticated",owner);
 assert.equal(approved.reviewState,"approved");
}
function manifestSourceSnapshot(){
 return jsonExpr(`(select coalesce(jsonb_agg(jsonb_build_object(
 'sourceRecordId',s.source_record_id,'foodId',s.food_id,'sourceId',s.id)
 order by s.source_record_id), '[]'::jsonb)
 from public.food_source_records s where s.food_id is not null)`);
}
function factsForCanary(){
 return jsonExpr(`jsonb_build_object(
 'nutrition',(select count(*) from public.food_nutrition_revisions n where n.source_record_id in
  (select mr.source_record_id from public.food_ingestion_manifest_records mr
   join public.food_ingestion_batches b on b.id=mr.batch_id where b.input_count=80)),
 'names',(select count(*) from public.food_names n where n.source_record_id in
  (select mr.source_record_id from public.food_ingestion_manifest_records mr
   join public.food_ingestion_batches b on b.id=mr.batch_id where b.input_count=80)),
 'servings',(select count(*) from public.food_serving_options n where n.source_record_id in
  (select mr.source_record_id from public.food_ingestion_manifest_records mr
   join public.food_ingestion_batches b on b.id=mr.batch_id where b.input_count=80)))`);
}
function realMatchIndex(){
 const rows=jsonExpr(`(select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
  select s.provider,s.source_dataset as "dataset",s.source_version as "sourceVersion",
    s.source_record_id as "sourceRecordId",s.food_id as "foodId",
    s.source_nutrition->>'normalizedNdbNumber' as "ndb"
  from public.food_source_records s join public.food_items f on f.id=s.food_id
  where f.merged_into_food_id is null order by s.source_record_id) x)`);
 const names=jsonExpr(`(select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
 select n.normalized_text as "normalizedName", n.food_id as "foodId"
 from public.food_names n order by normalized_text,food_id) x)`);
 return {
  sourceIdentities:rows.map(({provider,dataset,sourceVersion,sourceRecordId,foodId}:any)=>
   ({provider,dataset,sourceVersion,sourceRecordId,foodId})),
  gtinOwners:[],redirects:[],
  semanticIdentities:rows.filter((x:any)=>x.ndb).map((x:any)=>({
   semanticSignature:usdaFoundationSemanticSignature(x.ndb),foodId:x.foodId
  })),qualifiedAliases:[],possibleDuplicateNames:names
 };
}
async function ingest(batch:any,ns:string){
 const input=prepare(batch,ns);
 const dry=await executeFoodCatalogDatabaseDryRun(store,input);
 assert.equal(dry.status,"completed");
 approve(batch,dry);
 const draft=await executeApprovedFoodCatalogDraftMutation(store,input);
 assert.equal(draft.status,"completed");
 assert.notEqual(dry.runId,draft.runId);
 return {dry,draft};
}
export async function run(){
 const before=summary();
 assert.equal(before.foods,0);assert.equal(before.batches,0);assert.equal(before.sources,0);
 const zipPath=process.env.PLAIVRA_PLAN9_SOURCE_ZIP;
 assert.ok(zipPath);
 const raw=await readFile(zipPath);
 const lock=JSON.parse(await readFile("data/food-catalog/source-locks/usda-foundation-2026-04.json","utf8"));
 assert.equal(raw.length,lock.sourceBytes);assert.equal(digest(raw),lock.sourceChecksumSha256);
 const zip=await JSZip.loadAsync(raw);
 const source=zip.files[lock.sourceJsonFilename];
 assert.ok(source&&!source.dir);
 const parsed=parseUsdaFoundationJson(await source.async("string"));
 assert.equal(parsed.foods.length,363);
 const artifact={foods:parsed.foods,sourceZipSha256:digest(raw),sourceZipBytes:raw.length};
 const empty={sourceIdentities:[],gtinOwners:[],redirects:[],semanticIdentities:[],qualifiedAliases:[],possibleDuplicateNames:[]};
 const selected=selectUsdaFoundationCanary(lock,artifact,empty);
 assert.equal(selected.selectionChecksumSha256,"b3b4719102d936d1ddf9ffe9aacdb3a351514a0e54f95ea012431980647cf4bf");
 assert.equal(selected.canary.manifestContentChecksumSha256,"10db18aaeae621b4618e868a4f47de9c02ab3ea876b407b7064f54cf31674a33");
 assert.equal(selected.canary.semanticBatchIdentityChecksumSha256,"6e57f559c0d31785df00f5ce61c1f2920e8854ecb372d76468e8dc0a852a8f06");
 seedHuman();
 const phase1=await ingest(selected.canary,"foundation-1a1");
 const after1=summary();
 assert.equal(after1.foods,80);assert.equal(after1.sources,80);assert.equal(after1.materialized,80);
 assert.equal(after1.generations,0);assert.equal(after1.search,0);assert.equal(after1.current,null);
 assert.equal(jsonExpr("(select count(*) from public.food_items where lifecycle_status <> 'draft')"),0);
 assert.equal(jsonExpr("(select count(*) from public.food_nutrition_revisions where calories is null)"),10);
 const ids=manifestSourceSnapshot(),facts1=factsForCanary();
 assert.equal((await executeApprovedFoodCatalogDraftMutation(store,prepare(selected.canary,"foundation-1a1"))).runId,phase1.draft.runId);
 assert.deepEqual(summary(),after1,"same 1A1 operation replay");
 const index=realMatchIndex();
 assert.equal(index.sourceIdentities.length,80);assert.equal(index.semanticIdentities.length,80);
 const full=buildFoodCatalogDryRun(createUsdaFoundationAdapter(lock),artifact,index);
 const expected=full.manifestContent.expectedMutations;
 assert.equal(expected.input,363);assert.equal(expected.rejected,10);
 assert.equal(full.manifestContent.candidates.filter((x:any)=>x.decision.kind==="match" &&
  ids.some((r:any)=>r.sourceRecordId===x.candidate.sourceRecordId && r.foodId===x.decision.foodId)).length,80);
 const phase2=await ingest(full,"foundation-1a2");
 assert.notEqual(phase1.dry.batchId,phase2.dry.batchId);
 assert.deepEqual(manifestSourceSnapshot().filter((x:any)=>ids.some((r:any)=>r.sourceRecordId===x.sourceRecordId)),ids,
  "all 1A1 canonical Food IDs and source UUIDs stable");
 assert.deepEqual(factsForCanary(),facts1,
  "cross-batch MATCH must not duplicate nutrition, names, or portions from the same original source");
 const after2=summary();
 assert.equal(after2.foods,80+expected.created);
 assert.equal(after2.sources,363);
 assert.equal(after2.materialized,80+expected.accepted);
 assert.equal(after2.generations,0);assert.equal(after2.search,0);assert.equal(after2.current,null);
 assert.equal(jsonExpr("(select count(*) from public.food_items where lifecycle_status <> 'draft')"),0);
 assert.equal((await executeApprovedFoodCatalogDraftMutation(store,prepare(full,"foundation-1a2"))).runId,phase2.draft.runId);
 assert.deepEqual(summary(),after2,"same 1A2 operation replay");
 const evidence={disposition:"DISPOSABLE_ONLY",sourceChecksumSha256:lock.sourceChecksumSha256,
  selectionChecksumSha256:selected.selectionChecksumSha256,
  canaryManifestChecksumSha256:selected.canary.manifestContentChecksumSha256,
  fullManifestChecksumSha256:full.manifestContentChecksumSha256,
  fullSemanticChecksumSha256:full.semanticBatchIdentityChecksumSha256,
  fullExpected:expected,phase1,phase2,after1,after2,facts1};
 if(process.env.PLAIVRA_PLAN9_E2E_EVIDENCE)await writeFile(process.env.PLAIVRA_PLAN9_E2E_EVIDENCE,stableJson(evidence)+"\n");
 console.log(stableJson(evidence));
}
