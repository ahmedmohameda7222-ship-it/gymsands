/** Disposable PostgreSQL-only governance/ingestion checks. NEVER connect to hosted DB. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync,spawnSync } from "node:child_process";

function disposableUrl(){
  const raw=process.env.NUTRITION_DISPOSABLE_DB_URL;
  if(!raw)throw Error("Missing explicit disposable PostgreSQL URL");
  const url=new URL(raw);
  if(!["postgres:","postgresql:"].includes(url.protocol) ||
    !["localhost","127.0.0.1","[::1]"].includes(url.hostname) ||
    url.port!=="54322" || url.pathname!=="/postgres"){
      throw Error("Refusing non-local Supabase disposable DB; expected 127.0.0.1:54322/postgres");
  }
  return raw;
}
function sql(query){
  const target=disposableUrl();
  return execFileSync("psql",["-X","-A","-t","-v","ON_ERROR_STOP=1",
    "-d",target,"-c",query],{encoding:"utf8",timeout:15000,
    env:{...process.env,PGCONNECT_TIMEOUT:"5"}}).trim();
}
const review="public.food_catalog_review_ingestion_batch_v1(jsonb)";
const management="public.food_catalog_manage_governance_principal(uuid,text,text,text,text[],text,text)";

test("required Supabase roles exist in disposable migration replay",()=>{
  assert.equal(sql("SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')"),"3");
});
test("review RPC exists and is SECURITY DEFINER with locked search_path",()=>{
  const values=sql("SELECT p.prosecdef, EXISTS(SELECT 1 FROM unnest(p.proconfig) x WHERE x='search_path=') FROM pg_proc p WHERE p.oid='"+review+"'::regprocedure");
  assert.equal(values,"t|t");
});
test("review RPC excludes anonymous and service role but allows authenticated",()=>{
  const row=sql("SELECT has_function_privilege('authenticated','"+review+"','EXECUTE'),has_function_privilege('anon','"+review+"','EXECUTE'),has_function_privilege('service_role','"+review+"','EXECUTE')");
  assert.equal(row,"t|f|f");
});
test("governance management RPC has the same restricted invocation boundary",()=>{
  const row=sql("SELECT has_function_privilege('authenticated','"+management+"','EXECUTE'),has_function_privilege('anon','"+management+"','EXECUTE'),has_function_privilege('service_role','"+management+"','EXECUTE')");
  assert.equal(row,"t|f|f");
});
test("private first-Owner recovery lock is not public-executable",()=>{
  const f="private.food_catalog_governance_lock_recovery_set()";
  const row=sql("SELECT has_function_privilege('anon','"+f+"','EXECUTE'),has_function_privilege('authenticated','"+f+"','EXECUTE'),has_function_privilege('service_role','"+f+"','EXECUTE')");
  assert.equal(row,"f|f|f");
});
test("anonymous cannot invoke batch review even with arbitrary payload",()=>{
  const target=disposableUrl();
  const result=spawnSync("psql",["-X","-q","-v","ON_ERROR_STOP=1",
    "-d",target,"-c","BEGIN; SET LOCAL ROLE anon; SELECT "+review.replace("(jsonb)","")+
    "('{}'::jsonb); ROLLBACK;"],{encoding:"utf8",timeout:15000,
    env:{...process.env,PGCONNECT_TIMEOUT:"5"}});
  assert.notEqual(result.status,0,"anonymous SQL invocation must fail closed");
  assert.match(String(result.stderr),/permission denied|not allowed|unauthorized|authenticated/i);
});


// These checks use only the disposable local Supabase replay. The nine authority
// tables and immutability triggers are declared in applied migration
// 20260904100000_food_catalog_ingestion_v2_authority.sql.
const authorityTables=[
  "food_ingestion_control_operations",
  "food_ingestion_manifest_records",
  "food_ingestion_materialized_results",
  "food_ingestion_quarantines",
  "food_ingestion_quarantine_resolutions",
  "food_ingestion_reconciliations",
  "food_ingestion_release_diffs",
  "food_ingestion_release_diff_records",
  "food_ingestion_operational_events"
];
function psqlScript(script){
  const url=disposableUrl(); // mandatory host guard, even for negative tests
  return spawnSync("psql",["-X","-q","-A","-t","-v","ON_ERROR_STOP=1",
    "-d",url,"-c",script],{
    encoding:"utf8",timeout:15000,maxBuffer:1024*1024,
    env:{...process.env,PGCONNECT_TIMEOUT:"5"}
  });
}
function namesSql(){
  return "ARRAY["+authorityTables.map(name=>"'"+name+"'").join(",")+"]";
}
function assertFailed(result,reason){
  assert.equal(result.error,undefined,"Disposable psql command must start");
  assert.notEqual(result.status,0,"Expected a database-enforced rejection");
  assert.match(String(result.stderr),reason);
}
const fixtureOperation="787aaa10-2d42-4b8a-89aa-79f027723001";
const fixtureCommand="food_catalog_ingestion_prepare_execution_v2";
const fixtureSha="1".repeat(64);
function replaySetup(){
  return "BEGIN; INSERT INTO public.food_ingestion_control_operations " +
    "(operation_id,command_name,command_checksum_sha256,result_json) VALUES ("+
    "'"+fixtureOperation+"','"+fixtureCommand+"','"+fixtureSha+"',"+
    "'{\"status\":\"prepared\",\"runId\":\"disposable-fixture\"}'::jsonb); ";
}
function replayExpression(checksum=fixtureSha){
  return "private.food_catalog_ingestion_replay_operation_v2("+
    "jsonb_build_object('operationId','"+fixtureOperation+
    "','commandChecksumSha256','"+checksum+"'), '"+fixtureCommand+"')";
}

test("all nine ingestion authority tables have PostgreSQL RLS enabled",()=>{
  const result=sql(
    "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "+
    "WHERE n.nspname='public' AND c.relkind='r' "+
    "AND c.relname=ANY("+namesSql()+") AND c.relrowsecurity"
  );
  assert.equal(result,String(authorityTables.length));
});
test("no direct ingestion-authority INSERT, UPDATE or DELETE grant for API roles",()=>{
  const result=sql(
    "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "+
    "WHERE n.nspname='public' AND c.relkind='r' AND c.relname=ANY("+namesSql()+") "+
    "AND NOT has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE') "+
    "AND NOT has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') "+
    "AND NOT has_table_privilege('service_role',c.oid,'INSERT,UPDATE,DELETE')"
  );
  assert.equal(result,String(authorityTables.length));
});
test("all nine ingestion append-only trigger protections remain enabled",()=>{
  const result=sql(
    "SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid "+
    "JOIN pg_namespace n ON n.oid=c.relnamespace "+
    "WHERE n.nspname='public' AND c.relname=ANY("+namesSql()+") "+
    "AND NOT t.tgisinternal AND t.tgenabled IN ('O','A') "+
    "AND t.tgname=c.relname||'_immutable' "+
    "AND t.tgfoid='private.reject_food_catalog_ingestion_authority_mutation_v2()'::regprocedure "+
    "AND (t.tgtype::integer & 2)=2 AND (t.tgtype::integer & 16)=16 "+
    "AND (t.tgtype::integer & 8)=8"
  );
  assert.equal(result,String(authorityTables.length));
});
test("exact ingestion operation ID and checksum replays the immutable recorded result",()=>{
  const query=replaySetup()+"SELECT "+replayExpression()+"->>'status'; ROLLBACK;";
  const result=psqlScript(query);
  assert.equal(result.error,undefined);
  assert.equal(result.status,0,String(result.stderr));
  assert.equal(result.stdout.trim(),"prepared");
});
test("same ingestion operation ID with a different checksum is an idempotency conflict",()=>{
  const query=replaySetup()+"SELECT "+replayExpression("2".repeat(64))+"; ROLLBACK;";
  const result=psqlScript(query);
  assertFailed(result,/Food Catalog ingestion operation replay conflict/);
});
test("Production ingestion helper rejects an absent execution lease, even as local DB owner",()=>{
  const result=psqlScript(
    "SELECT private.food_catalog_ingestion_assert_active_lease_v2("+
    "'787aaa10-2d42-4b8a-89aa-79f027723002'::uuid,"+
    "'787aaa10-2d42-4b8a-89aa-79f027723003'::uuid,1::bigint)"
  );
  assertFailed(result,/requires the exact live execution lease/);
});
test("authenticated SQL role with no real human identity cannot review a batch",()=>{
  const command={
    operationId:"787aaa10-2d42-4b8a-89aa-79f027723004",
    batchId:"787aaa10-2d42-4b8a-89aa-79f027723005",
    decision:"review",expectedReviewState:"prepared",
    manifestContentChecksumSha256:"a".repeat(64),
    semanticIdentityChecksumSha256:"b".repeat(64),
    source:{provider:"USDA_FDC",dataset:"FoundationFoods"},
    expectedMutations:{input:0,accepted:0,rejected:0},
    reconciliationId:"787aaa10-2d42-4b8a-89aa-79f027723006",
    reason:"isolated QA authorization denial"
  };
  const payload=JSON.stringify(command).replaceAll("'","''");
  const script="BEGIN; SET LOCAL ROLE authenticated; "+
    "SELECT public.food_catalog_review_ingestion_batch_v1('"+payload+"'::jsonb); "+
    "ROLLBACK;";
  const result=psqlScript(script);
  assertFailed(result,/Authenticated Food governance principal is required/);
});
