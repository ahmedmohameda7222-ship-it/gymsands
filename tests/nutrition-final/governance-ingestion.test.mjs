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
