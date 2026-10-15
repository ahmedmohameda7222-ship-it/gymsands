/**
 * PostgreSQL transport for *disposable* Plan 9 integration only.
 * Calls actual migrated RPCs via psql; does not mock the command store.
 * Deliberately refuses any remote host or port.
 */
import {spawnSync} from "node:child_process";
import assert from "node:assert/strict";
const db=process.env.PLAIVRA_LOCAL_DATABASE_URL ?? "";
const parsed=new URL(db);
assert.ok(["postgresql:","postgres:"].includes(parsed.protocol)
  && ["localhost","127.0.0.1"].includes(parsed.hostname) && parsed.port==="54322"
  && process.env.PLAIVRA_PLAN9_DISPOSABLE_ONLY==="true",
  "Plan 9 test transport refuses non-disposable PostgreSQL");
const allowed=new Set([
"food_catalog_ingestion_prepare_execution_v2","food_catalog_ingestion_acquire_lease_v2",
"food_catalog_ingestion_heartbeat_lease_v2","food_catalog_ingestion_persist_candidate_v2",
"food_catalog_ingestion_record_quarantine_v2","food_catalog_ingestion_record_reconciliation_v2",
"food_catalog_ingestion_complete_run_v2","food_catalog_ingestion_fail_run_v2",
"food_catalog_review_ingestion_batch_v1"
]);
export function sql(s, role, userId) {
  assert.ok(!role || ["authenticated","anon","service_role"].includes(role));
  assert.ok(!userId || /^[0-9a-f-]{36}$/.test(userId));
  const before=role
    ? "begin; set local role "+role+"; select set_config('request.jwt.claim.sub','"+
      (userId??"")+"',true); select set_config('request.jwt.claim.role','"+role+"',true);"
    : "";
  const output=spawnSync("psql",[db,"-X","-q","-A","-t","-v","ON_ERROR_STOP=1"],{
    input:before+"\n"+s+"\n"+(role?"commit;":""),encoding:"utf8",
    env:{...process.env,PGPASSWORD:"postgres"},maxBuffer:33554432});
  if(output.error) throw output.error;
  if(output.status!==0) throw new Error((output.stderr || output.stdout || "Postgres RPC failed").trim());
  return (output.stdout??"").trim().split(/\r?\n/).filter(Boolean).at(-1)??"";
}
export function jsonExpr(expr) { return JSON.parse(sql("select ("+expr+")::text;")); }
export function callRpc(name, command,role,userId){
  assert.ok(allowed.has(name),"Unexpected integration RPC");
  const payload=Buffer.from(JSON.stringify(command)).toString("base64");
  return JSON.parse(sql("select public."+name+"(convert_from(decode('"+payload+
    "','base64'),'UTF8')::jsonb)::text;",role,userId));
}
export const localRpcClient={
  rpc:async (name,args)=>{
    try{return {data:callRpc(name,args.p_command),error:null};}
    catch(e){return {data:null,error:{message:String(e)}};}
  }
};
