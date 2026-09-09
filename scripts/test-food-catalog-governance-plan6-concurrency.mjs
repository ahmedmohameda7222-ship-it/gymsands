#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const DATABASE_URL = process.env.PLAIVRA_PLAN6_CONCURRENCY_TEST_DATABASE_URL ?? process.env.PLAIVRA_LOCAL_DATABASE_URL;
const OWNER_UID = "6a000000-0000-4000-8000-000000000001";
const GOV_PRINCIPAL = "6a000000-0000-4000-8000-000000000101";
const REC_A_UID = "6a000000-0000-4000-8000-000000000002";
const REC_B_UID = "6a000000-0000-4000-8000-000000000003";
const REC_A = "6a000000-0000-4000-8000-000000000102";
const REC_B = "6a000000-0000-4000-8000-000000000103";
const MIX_A_UID = "6a000000-0000-4000-8000-000000000004";
const MIX_B_UID = "6a000000-0000-4000-8000-000000000005";
const MIX_A = "6a000000-0000-4000-8000-000000000104";
const MIX_B = "6a000000-0000-4000-8000-000000000105";
const PURGE_UID = "6a000000-0000-4000-8000-000000000006";
const DPROC_UID = "6a000000-0000-4000-8000-000000000007";

const FOOD_A = "6a000000-0000-4000-8000-000000000201";
const FOOD_B = "6a000000-0000-4000-8000-000000000202";
const FOOD_C = "6a000000-0000-4000-8000-000000000203";
const PLAN4_FOOD = "6a000000-0000-4000-8000-000000000204";
const PURGE_FOOD = "6a000000-0000-4000-8000-000000000205";
const GTIN_PP = "4006381333931";
const GTIN_P4 = "5901234123457";
const GTIN_RA = "12345678901231";

const APP_P6_A = "plan6-gtin-a";
const APP_P6_B = "plan6-gtin-b";
const APP_P6_P4 = "plan6-vs-plan4-p6";
const APP_P4 = "plan6-vs-plan4-p4";
const APP_REMOVE = "plan6-remove-race";
const APP_ASSIGN = "plan6-assign-race";
const APP_REC_A = "plan6-recovery-a";
const APP_REC_B = "plan6-recovery-b";
const APP_MIX_A = "plan6-recovery-mixed-a";
const APP_MIX_B = "plan6-recovery-mixed-b";
const APP_MERGE_A = "plan6-merge-a";
const APP_MERGE_B = "plan6-merge-b";
const APP_OVERRIDE = "plan6-override-before-purge";
const APP_PURGE = "plan6-purge-after-override";

function assertDisposableLocalDatabaseUrl(value) {
  const parsed = new URL(String(value ?? ""));
  if (!new Set(["postgresql:", "postgres:"]).has(parsed.protocol)) throw new Error("Plan 6 concurrency verification requires PostgreSQL.");
  if (!new Set(["127.0.0.1", "localhost"]).has(parsed.hostname) || parsed.port !== "54322") {
    throw new Error("Refusing Plan 6 concurrency verification outside disposable local Supabase on port 54322.");
  }
  return parsed.toString();
}

const localUrl = assertDisposableLocalDatabaseUrl(DATABASE_URL);
const psqlArgs = [localUrl, "-X", "-v", "ON_ERROR_STOP=1", "-A", "-t", "-q"];

function runSql(sql) {
  const result = spawnSync("psql", [...psqlArgs, "-c", sql], { encoding: "utf8", env: { ...process.env, PGPASSWORD: "postgres" } });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`psql failed (${result.status}): ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function startSql(sql, applicationName) {
  const child = spawn("psql", [...psqlArgs, "-c", sql], {
    env: { ...process.env, PGPASSWORD: "postgres", PGAPPNAME: applicationName },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let settled = false;
  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  const done = new Promise((resolve) => {
    child.on("error", (error) => { settled = true; resolve({ code: null, stdout, stderr, error }); });
    child.on("close", (code) => { settled = true; resolve({ code, stdout, stderr, error: null }); });
  });
  return { child, done, get settled() { return settled; } };
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function waitFor(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}
async function waitForSleep(app) {
  await waitFor(() => runSql(`select coalesce(wait_event,'') from pg_stat_activity where application_name='${app}' and state='active' limit 1;`) === "PgSleep", 5000, `${app} to reach controlled sleep`);
}
function requireSuccess(label, result) {
  if (result.error) throw result.error;
  if (result.code !== 0) throw new Error(`${label} failed: ${result.stderr || result.stdout}`);
}
function requireFailure(label, result) {
  if (result.error) throw result.error;
  if (result.code === 0) throw new Error(`${label} unexpectedly succeeded: ${result.stdout}`);
}
function requireExactlyOneSuccess(label, a, b) {
  const successes = Number(a.code === 0) + Number(b.code === 0);
  if (successes !== 1) throw new Error(`${label} expected exactly one success, got ${successes}. A=${a.stderr || a.stdout} B=${b.stderr || b.stdout}`);
}
function authSql(uid, body) {
  return `begin; set local role authenticated; select set_config('request.jwt.claim.role','authenticated',true); select set_config('request.jwt.claim.sub','${uid}',true); ${body}; commit;`;
}
function serviceSql(body) {
  return `begin; set local role service_role; select set_config('request.jwt.claim.role','service_role',true); ${body}; commit;`;
}
function q(value) { return `'${String(value).replaceAll("'", "''")}'`; }

function setupCommon() {
  if (Number(runSql("select count(*) from public.food_items")) !== 0) throw new Error("Plan 6 concurrency verifier requires empty disposable Food state.");
  if (Number(runSql("select count(*) from public.food_ingestion_batches")) !== 0) throw new Error("Plan 6 concurrency verifier requires empty disposable ingestion state.");
  runSql(`
    insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
      ('${OWNER_UID}','authenticated','authenticated','plan6-concurrency-owner@example.test','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp()),
      ('${REC_A_UID}','authenticated','authenticated','plan6-recovery-a@example.test','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp()),
      ('${REC_B_UID}','authenticated','authenticated','plan6-recovery-b@example.test','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp()),
      ('${MIX_A_UID}','authenticated','authenticated','plan6-mixed-a@example.test','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp()),
      ('${MIX_B_UID}','authenticated','authenticated','plan6-mixed-b@example.test','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp()),
      ('${PURGE_UID}','authenticated','authenticated','plan6-purge@example.test','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp()),
      ('${DPROC_UID}','authenticated','authenticated','plan6-dproc@example.test','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp());

    insert into public.food_items(id,food_name,is_global,lifecycle_status) values
      ('${FOOD_A}','Plan6 concurrency A',true,'active'),
      ('${FOOD_B}','Plan6 concurrency B',true,'active'),
      ('${FOOD_C}','Plan6 concurrency C',true,'active'),
      ('${PURGE_FOOD}','Plan6 concurrency personal',true,'active');

    insert into public.food_catalog_governance_principals(id,principal_type,subject_id,role_class) values
      ('${GOV_PRINCIPAL}','human','${OWNER_UID}','owner'),
      ('${REC_A}','human','${REC_A_UID}','owner'),('${REC_B}','human','${REC_B_UID}','owner');
    insert into public.food_catalog_governance_capability_assignments(principal_id,capability,reason) values
      ('${GOV_PRINCIPAL}','food.correction.apply','concurrency'),('${GOV_PRINCIPAL}','food.barcode.correct','concurrency'),
      ('${GOV_PRINCIPAL}','food.identity.merge','concurrency'),('${GOV_PRINCIPAL}','food.lifecycle.withdraw','concurrency'),
      ('${REC_A}','food.governance.manage_principals','concurrency'),('${REC_B}','food.governance.manage_principals','concurrency');
  `);
}

function installBarcodeSleepTrigger() {
  runSql(`
    create or replace function private.plan6_test_barcode_sleep() returns trigger language plpgsql set search_path='' as $function$
    begin
      if tg_op='INSERT' and new.gtin='${GTIN_PP}' then perform pg_catalog.pg_sleep(2); end if;
      if tg_op='INSERT' and new.gtin='${GTIN_P4}' then
        if current_setting('application_name',true)='${APP_P6_P4}' then perform pg_catalog.pg_sleep(3); else perform pg_catalog.pg_sleep(1); end if;
      end if;
      if tg_op='DELETE' and old.gtin='${GTIN_RA}' then perform pg_catalog.pg_sleep(2); end if;
      return case when tg_op='DELETE' then old else new end;
    end $function$;
    drop trigger if exists aaa_plan6_test_barcode_sleep on public.food_barcodes;
    create trigger aaa_plan6_test_barcode_sleep before insert or delete on public.food_barcodes for each row execute function private.plan6_test_barcode_sleep();
  `);
}

async function verifyPlan6VsPlan6Gtin() {
  runSql(`
    insert into public.food_catalog_correction_cases(id,food_id,category,claim_key,issue_key,state,state_revision,policy_version,expected_authority_kind,expected_authority_key,expected_authority_revision,expected_authority_id) values
      ('6a000000-0000-4000-8000-000000000301','${FOOD_A}','wrong_barcode','${GTIN_PP}','race|gtin|a','approved',2,'plan6-v1','barcode_correction','${GTIN_PP}',0,null),
      ('6a000000-0000-4000-8000-000000000302','${FOOD_B}','wrong_barcode','${GTIN_PP}','race|gtin|b','approved',2,'plan6-v1','barcode_correction','${GTIN_PP}',0,null);
  `);
  const a = startSql(authSql(OWNER_UID, `select public.food_catalog_apply_barcode_correction('6a000000-0000-4000-8000-000000000311','6a000000-0000-4000-8000-000000000301','${FOOD_A}',2,0,null,'${GTIN_PP}','assign',null,'race A')`), APP_P6_A);
  await waitForSleep(APP_P6_A);
  const b = startSql(authSql(OWNER_UID, `select public.food_catalog_apply_barcode_correction('6a000000-0000-4000-8000-000000000312','6a000000-0000-4000-8000-000000000302','${FOOD_B}',2,0,null,'${GTIN_PP}','assign',null,'race B')`), APP_P6_B);
  const [ra, rb] = await Promise.all([a.done, b.done]);
  requireExactlyOneSuccess("Plan6/Plan6 same-GTIN race", ra, rb);
  const state = runSql(`select concat_ws('|',(select count(*) from public.food_barcodes where gtin='${GTIN_PP}'),(select count(*) from public.food_catalog_correction_cases where id in ('6a000000-0000-4000-8000-000000000301','6a000000-0000-4000-8000-000000000302') and state='applied'),(select count(*) from public.food_catalog_governance_authority_revisions where authority_kind='barcode_correction' and authority_key='${GTIN_PP}'),(select count(*) from public.food_catalog_governance_audit_events where operation_id in ('6a000000-0000-4000-8000-000000000311','6a000000-0000-4000-8000-000000000312')),(select count(*) from public.food_catalog_governance_outbox where operation_id in ('6a000000-0000-4000-8000-000000000311','6a000000-0000-4000-8000-000000000312')));`);
  if (state !== "1|1|1|1|1") throw new Error(`Plan6/Plan6 GTIN race left split authority: ${state}`);
}

function plan4Candidate() {
  return {
    sourceRecordId: "plan6-plan4-race-record",
    sourceReference: "fixture://plan6/plan4-race",
    sourceRecordChecksumSha256: "e".repeat(64),
    canonicalName: "Plan4 Plan6 Race Food",
    brandName: null, servingLabel: null, category: null, cuisine: null,
    nutrition: null, aliases: [], names: [],
    identityEvidence: { semanticSignature: null, preparation: null, state: null, form: null, structuredEvidenceKey: null },
    servings: [], taxonomyEvidence: [], gtins: [GTIN_P4], marketScopes: [], globallyRelevant: false,
    sourceNutrition: null, sourceServing: null,
  };
}
function plan4Source() {
  return { provider: "synthetic-reference", dataset: "plan6-concurrency-v2", sourceVersion: "2026.09", sourceReleaseDate: "2026-09-08", licenseName: "Fixture License", licenseReference: "fixture-license", sourceReference: "fixture://plan6/plan4", sourceChecksumSha256: "c".repeat(64), importerVersion: "plan6-concurrency-test", configChecksumSha256: "d".repeat(64) };
}
function setupPlan4ProductionRace() {
  const candidate = JSON.stringify(plan4Candidate());
  const source = JSON.stringify(plan4Source());
  const decision = JSON.stringify({ kind: "create" });
  const disposition = JSON.stringify({ kind: "accept", reasonCodes: [] });
  const expected = JSON.stringify({ input: 1, accepted: 1, rejected: 0, matched: 0, created: 1, possibleDuplicate: 0, quarantined: 0 });
  runSql(serviceSql(`select public.food_catalog_ingestion_prepare_execution_v2(jsonb_build_object('operationId','6a000000-0000-4000-8000-000000000401','commandChecksumSha256',repeat('1',64),'executionMode','dry_run','attemptNumber',1,'manifestContentChecksumSha256',repeat('a',64),'semanticIdentityChecksumSha256',repeat('b',64),'source',${q(source)}::jsonb,'expectedMutations',${q(expected)}::jsonb))`));
  const ids = runSql("select batch.id::text||'|'||run.id::text from public.food_ingestion_batches batch join public.food_ingestion_runs run on run.batch_id=batch.id where batch.semantic_identity_checksum_sha256=repeat('b',64) and run.execution_mode='dry_run'").split("|");
  const [batchId, dryRunId] = ids;
  runSql(serviceSql(`select public.food_catalog_ingestion_persist_candidate_v2(jsonb_build_object('operationId','6a000000-0000-4000-8000-000000000402','commandChecksumSha256',repeat('2',64),'runId','${dryRunId}','foodId','${PLAN4_FOOD}','decisionKind','create','dispositionKind','accept','decision',${q(decision)}::jsonb,'disposition',${q(disposition)}::jsonb,'candidate',${q(candidate)}::jsonb))`));
  runSql(serviceSql(`select public.food_catalog_ingestion_record_reconciliation_v2(jsonb_build_object('operationId','6a000000-0000-4000-8000-000000000403','commandChecksumSha256',repeat('3',64),'runId','${dryRunId}','manifestContentChecksumSha256',repeat('a',64),'semanticIdentityChecksumSha256',repeat('b',64),'completed',true)); select public.food_catalog_ingestion_complete_run_v2(jsonb_build_object('operationId','6a000000-0000-4000-8000-000000000404','commandChecksumSha256',repeat('4',64),'runId','${dryRunId}'))`));
  runSql(`update public.food_ingestion_batches set review_state='reviewed',reviewed_at=clock_timestamp() where id='${batchId}'; update public.food_ingestion_batches set review_state='approved',approved_at=clock_timestamp(),approval_reference='plan6-concurrency' where id='${batchId}';`);
  runSql(serviceSql(`select public.food_catalog_ingestion_prepare_execution_v2(jsonb_build_object('operationId','6a000000-0000-4000-8000-000000000405','commandChecksumSha256',repeat('5',64),'executionMode','production','attemptNumber',1,'manifestContentChecksumSha256',repeat('a',64),'semanticIdentityChecksumSha256',repeat('b',64),'source',${q(source)}::jsonb,'expectedMutations',${q(expected)}::jsonb))`));
  const productionRunId = runSql(`select id from public.food_ingestion_runs where batch_id='${batchId}' and execution_mode='production' and attempt_number=1`);
  runSql(serviceSql(`select public.food_catalog_ingestion_acquire_lease_v2(jsonb_build_object('operationId','6a000000-0000-4000-8000-000000000406','commandChecksumSha256',repeat('6',64),'runId','${productionRunId}','leaseOwner','plan6-concurrency-plan4','leaseToken','6a000000-0000-4000-8000-000000000499','leaseSeconds',120))`));
  return { productionRunId, candidate, decision, disposition };
}

async function verifyPlan4VsPlan6Gtin() {
  const p4 = setupPlan4ProductionRace();
  runSql(`insert into public.food_catalog_correction_cases(id,food_id,category,claim_key,issue_key,state,state_revision,policy_version,expected_authority_kind,expected_authority_key,expected_authority_revision,expected_authority_id) values ('6a000000-0000-4000-8000-000000000421','${FOOD_B}','wrong_barcode','${GTIN_P4}','race|plan4|plan6','approved',2,'plan6-v1','barcode_correction','${GTIN_P4}',0,null);`);
  const p6 = startSql(authSql(OWNER_UID, `select public.food_catalog_apply_barcode_correction('6a000000-0000-4000-8000-000000000422','6a000000-0000-4000-8000-000000000421','${FOOD_B}',2,0,null,'${GTIN_P4}','assign',null,'Plan4 vs Plan6 race')`), APP_P6_P4);
  await waitForSleep(APP_P6_P4);
  const p4Session = startSql(serviceSql(`select public.food_catalog_ingestion_persist_candidate_v2(jsonb_build_object('operationId','6a000000-0000-4000-8000-000000000423','commandChecksumSha256',repeat('7',64),'runId','${p4.productionRunId}','foodId','${PLAN4_FOOD}','decisionKind','create','dispositionKind','accept','decision',${q(p4.decision)}::jsonb,'disposition',${q(p4.disposition)}::jsonb,'candidate',${q(p4.candidate)}::jsonb,'leaseToken','6a000000-0000-4000-8000-000000000499','leaseEpoch',1))`), APP_P4);
  const [r6, r4] = await Promise.all([p6.done, p4Session.done]);
  requireExactlyOneSuccess("Plan4/Plan6 same-GTIN race", r6, r4);
  const state = runSql(`select concat_ws('|',(select count(*) from public.food_barcodes where gtin='${GTIN_P4}'),(select count(distinct food_id) from public.food_barcodes where gtin='${GTIN_P4}'),(select count(*) from public.food_catalog_correction_cases where id='6a000000-0000-4000-8000-000000000421' and state='applied'),(select count(*) from public.food_catalog_governance_audit_events where operation_id='6a000000-0000-4000-8000-000000000422'));`);
  if (!new Set(["1|1|1|1", "1|1|0|0"]).has(state)) throw new Error(`Plan4/Plan6 GTIN race left canonical/governance split: ${state}`);
}

async function verifyRemoveAssignSerialization() {
  runSql(`
    insert into public.food_barcodes(id,food_id,gtin) values('6a000000-0000-4000-8000-000000000501','${FOOD_A}','${GTIN_RA}');
    insert into public.food_catalog_correction_cases(id,food_id,category,claim_key,issue_key,state,state_revision,policy_version,expected_authority_kind,expected_authority_key,expected_authority_revision,expected_authority_id) values
      ('6a000000-0000-4000-8000-000000000502','${FOOD_A}','wrong_barcode','${GTIN_RA}','race|remove','approved',2,'plan6-v1','barcode_correction','${GTIN_RA}',0,'6a000000-0000-4000-8000-000000000501'),
      ('6a000000-0000-4000-8000-000000000503','${FOOD_B}','wrong_barcode','${GTIN_RA}','race|assign','approved',2,'plan6-v1','barcode_correction','${GTIN_RA}',0,null);
  `);
  const remove = startSql(authSql(OWNER_UID, `select public.food_catalog_apply_barcode_correction('6a000000-0000-4000-8000-000000000504','6a000000-0000-4000-8000-000000000502','${FOOD_A}',2,0,'6a000000-0000-4000-8000-000000000501','${GTIN_RA}','remove',null,'remove race')`), APP_REMOVE);
  await waitForSleep(APP_REMOVE);
  const assign = startSql(authSql(OWNER_UID, `select public.food_catalog_apply_barcode_correction('6a000000-0000-4000-8000-000000000505','6a000000-0000-4000-8000-000000000503','${FOOD_B}',2,0,null,'${GTIN_RA}','assign',null,'assign race')`), APP_ASSIGN);
  const early = await Promise.race([assign.done.then(() => true), delay(500).then(() => false)]);
  if (early) throw new Error("Plan6 assign was not serialized behind an in-flight same-GTIN remove.");
  const [rr, ra] = await Promise.all([remove.done, assign.done]);
  requireSuccess("same-GTIN remove", rr);
  requireSuccess("same-GTIN assign after remove", ra);
  const owner = runSql(`select food_id from public.food_barcodes where gtin='${GTIN_RA}'`);
  if (owner !== FOOD_B) throw new Error(`remove/assign serialization ended with inconsistent owner: ${owner}`);
}

function installRecoverySleeps() {
  runSql(`
    create or replace function private.plan6_test_recovery_cap_sleep() returns trigger language plpgsql set search_path='' as $function$
    begin
      if old.capability='food.governance.manage_principals' and old.revoked_at is null and new.revoked_at is not null and old.principal_id in ('${REC_A}'::uuid,'${REC_B}'::uuid,'${MIX_A}'::uuid) then perform pg_catalog.pg_sleep(2); end if;
      return new;
    end $function$;
    drop trigger if exists aaa_plan6_test_recovery_cap_sleep on public.food_catalog_governance_capability_assignments;
    create trigger aaa_plan6_test_recovery_cap_sleep before update on public.food_catalog_governance_capability_assignments for each row execute function private.plan6_test_recovery_cap_sleep();
    create or replace function private.plan6_test_recovery_role_sleep() returns trigger language plpgsql set search_path='' as $function$
    begin
      if old.id='${MIX_B}'::uuid and old.role_class='owner' and new.role_class<>'owner' then perform pg_catalog.pg_sleep(2); end if;
      return new;
    end $function$;
    drop trigger if exists aaa_plan6_test_recovery_role_sleep on public.food_catalog_governance_principals;
    create trigger aaa_plan6_test_recovery_role_sleep before update on public.food_catalog_governance_principals for each row execute function private.plan6_test_recovery_role_sleep();
  `);
}

async function verifyRecoveryConcurrency() {
  const a = startSql(authSql(REC_A_UID, `select public.food_catalog_revoke_governance_capability('6a000000-0000-4000-8000-000000000601','${REC_B}','food.governance.manage_principals','race revoke B')`), APP_REC_A);
  await waitForSleep(APP_REC_A);
  const b = startSql(authSql(REC_B_UID, `select public.food_catalog_revoke_governance_capability('6a000000-0000-4000-8000-000000000602','${REC_A}','food.governance.manage_principals','race revoke A')`), APP_REC_B);
  const [ra, rb] = await Promise.all([a.done, b.done]);
  requireExactlyOneSuccess("concurrent final-Owner recovery revoke", ra, rb);
  const count = Number(runSql(`select count(*) from public.food_catalog_governance_principals p join public.food_catalog_governance_capability_assignments a on a.principal_id=p.id and a.capability='food.governance.manage_principals' and a.revoked_at is null where p.principal_type='human' and p.role_class='owner' and p.active and p.revoked_at is null and p.id in ('${REC_A}','${REC_B}')`));
  if (count !== 1) throw new Error(`Recovery revoke race left ${count} recoverable Owners.`);
  const completed = Number(runSql("select count(*) from public.food_catalog_governance_operations where operation_id in ('6a000000-0000-4000-8000-000000000601','6a000000-0000-4000-8000-000000000602') and completed_at is not null"));
  if (completed !== 1) throw new Error(`Recovery revoke loser left completed governance operation evidence: ${completed}`);

  runSql(`
    update public.food_catalog_governance_principals set active=false,revoked_at=clock_timestamp() where id in ('${REC_A}','${REC_B}');
    insert into public.food_catalog_governance_principals(id,principal_type,subject_id,role_class) values ('${MIX_A}','human','${MIX_A_UID}','owner'),('${MIX_B}','human','${MIX_B_UID}','owner');
    insert into public.food_catalog_governance_capability_assignments(principal_id,capability,reason) values ('${MIX_A}','food.governance.manage_principals','mixed'),('${MIX_B}','food.governance.manage_principals','mixed');
  `);
  const demote = startSql(authSql(MIX_A_UID, `select public.food_catalog_manage_governance_principal('6a000000-0000-4000-8000-000000000603','human','${MIX_B_UID}','curator',array['food.correction.review'],'mixed demote',null)`), APP_MIX_A);
  await waitForSleep(APP_MIX_A);
  const revoke = startSql(authSql(MIX_B_UID, `select public.food_catalog_revoke_governance_capability('6a000000-0000-4000-8000-000000000604','${MIX_A}','food.governance.manage_principals','mixed revoke')`), APP_MIX_B);
  const [rd, rr] = await Promise.all([demote.done, revoke.done]);
  requireExactlyOneSuccess("mixed demote/revoke recovery race", rd, rr);
  const mixedCount = Number(runSql(`select count(*) from public.food_catalog_governance_principals p join public.food_catalog_governance_capability_assignments a on a.principal_id=p.id and a.capability='food.governance.manage_principals' and a.revoked_at is null where p.principal_type='human' and p.role_class='owner' and p.active and p.revoked_at is null and p.id in ('${MIX_A}','${MIX_B}')`));
  if (mixedCount !== 1) throw new Error(`Mixed recovery race left ${mixedCount} recoverable Owners.`);
}

function installMergeSleep() {
  runSql(`
    create or replace function private.plan6_test_merge_sleep() returns trigger language plpgsql set search_path='' as $function$
    begin
      if new.source_food_id in ('${FOOD_A}'::uuid,'${FOOD_B}'::uuid) and new.target_food_id in ('${FOOD_A}'::uuid,'${FOOD_B}'::uuid) then perform pg_catalog.pg_sleep(2); end if;
      return new;
    end $function$;
    drop trigger if exists aaa_plan6_test_merge_sleep on public.food_merge_events;
    create trigger aaa_plan6_test_merge_sleep before insert on public.food_merge_events for each row execute function private.plan6_test_merge_sleep();
  `);
}

async function verifyMergeCycleConcurrency() {
  runSql(`
    insert into public.food_catalog_correction_cases(id,food_id,category,claim_key,issue_key,state,state_revision,policy_version) values
      ('6a000000-0000-4000-8000-000000000701','${FOOD_A}','duplicate_food','A to B','race|merge|a','approved',2,'plan6-v1'),
      ('6a000000-0000-4000-8000-000000000702','${FOOD_B}','duplicate_food','B to A','race|merge|b','approved',2,'plan6-v1');
  `);
  const a = startSql(authSql(OWNER_UID, `select public.food_catalog_resolve_duplicate('6a000000-0000-4000-8000-000000000703','6a000000-0000-4000-8000-000000000701','${FOOD_A}','${FOOD_B}',2,0,null,'A to B race')`), APP_MERGE_A);
  await waitForSleep(APP_MERGE_A);
  const b = startSql(authSql(OWNER_UID, `select public.food_catalog_resolve_duplicate('6a000000-0000-4000-8000-000000000704','6a000000-0000-4000-8000-000000000702','${FOOD_B}','${FOOD_A}',2,0,null,'B to A race')`), APP_MERGE_B);
  const [ra, rb] = await Promise.all([a.done, b.done]);
  requireExactlyOneSuccess("concurrent A->B/B->A merge", ra, rb);
  const topology = runSql(`select concat_ws('|',(select count(*) from public.food_items where id in ('${FOOD_A}','${FOOD_B}') and merged_into_food_id is not null),(select count(*) from public.food_items x join public.food_items y on y.id=x.merged_into_food_id where x.id in ('${FOOD_A}','${FOOD_B}') and y.merged_into_food_id is not null),(select count(*) from public.food_merge_events where source_food_id in ('${FOOD_A}','${FOOD_B}') and target_food_id in ('${FOOD_A}','${FOOD_B}')));`);
  if (topology !== "1|0|1") throw new Error(`Merge race produced chain/cycle topology: ${topology}`);
  const completed = Number(runSql("select count(*) from public.food_catalog_governance_operations where operation_id in ('6a000000-0000-4000-8000-000000000703','6a000000-0000-4000-8000-000000000704') and completed_at is not null"));
  if (completed !== 1) throw new Error(`Invalid merge loser left completed governance evidence: ${completed}`);
}

function setupDeletionProcessingUser() {
  runSql(authSql(DPROC_UID, `select public.food_catalog_set_personal_override('6a000000-0000-4000-8000-000000000801','${PURGE_FOOD}',null,0,'{"protein_g":11}'::jsonb,null,'dproc seed')`));
  const current = runSql(`select current_revision_id::text from public.food_personal_overrides where user_id='${DPROC_UID}' and food_id='${PURGE_FOOD}'`);
  runSql(`update public.account_access_states set state='deletion_processing',disabled_at=clock_timestamp() where user_id='${DPROC_UID}';`);
  const setResult = spawnSync("psql", [...psqlArgs, "-c", authSql(DPROC_UID, `select public.food_catalog_set_personal_override('6a000000-0000-4000-8000-000000000802','${PURGE_FOOD}','${current}',1,'{"protein_g":12}'::jsonb,null,'blocked set')`)], { encoding: "utf8", env: { ...process.env, PGPASSWORD: "postgres" } });
  if (setResult.status === 0) throw new Error("deletion_processing account unexpectedly set Personal Override.");
  const delResult = spawnSync("psql", [...psqlArgs, "-c", authSql(DPROC_UID, `select public.food_catalog_delete_personal_override('6a000000-0000-4000-8000-000000000803','${PURGE_FOOD}','${current}',1)`)], { encoding: "utf8", env: { ...process.env, PGPASSWORD: "postgres" } });
  if (delResult.status === 0) throw new Error("deletion_processing account unexpectedly deleted Personal Override.");
  const ops = Number(runSql("select count(*) from public.food_personal_override_operations where operation_id in ('6a000000-0000-4000-8000-000000000802','6a000000-0000-4000-8000-000000000803')"));
  if (ops !== 0) throw new Error(`deletion_processing stale writes recreated ${ops} operation-ledger rows.`);
}

async function verifyPurgeRace() {
  const mutation = startSql(authSql(PURGE_UID, `select public.food_catalog_set_personal_override('6a000000-0000-4000-8000-000000000811','${PURGE_FOOD}',null,0,'{"protein_g":33}'::jsonb,'1 serving','before purge'); select pg_catalog.pg_sleep(3)`), APP_OVERRIDE);
  await waitForSleep(APP_OVERRIDE);
  const purge = startSql(`begin; update public.account_access_states set state='deletion_processing',disabled_at=clock_timestamp() where user_id='${PURGE_UID}'; insert into public.account_deletion_jobs(id,user_id,subject_hash,idempotency_key_hash,state,stage,attempt_count,locked_at,created_at,updated_at) values('6a000000-0000-4000-8000-000000000812','${PURGE_UID}','plan6-subject-hash','plan6-idempotency-hash','processing','deleting_database',1,clock_timestamp(),clock_timestamp(),clock_timestamp()); set local role service_role; select set_config('request.jwt.claim.role','service_role',true); select public.purge_account_application_data_atomic('${PURGE_UID}'); commit;`, APP_PURGE);
  const [rm, rp] = await Promise.all([mutation.done, purge.done]);
  requireSuccess("override mutation before purge", rm);
  requireSuccess("purge following override mutation", rp);
  const remaining = runSql(`select concat_ws('|',(select count(*) from public.food_personal_override_operations where user_id='${PURGE_UID}'),(select count(*) from public.food_personal_overrides where user_id='${PURGE_UID}'),(select count(*) from public.food_personal_override_revisions where user_id='${PURGE_UID}'));`);
  if (remaining !== "0|0|0") throw new Error(`Account purge race left Personal Override data: ${remaining}`);
  const stale = startSql(authSql(PURGE_UID, `select public.food_catalog_set_personal_override('6a000000-0000-4000-8000-000000000813','${PURGE_FOOD}',null,0,'{"protein_g":44}'::jsonb,null,'stale after purge')`), "plan6-stale-after-purge");
  requireFailure("stale override request after purge", await stale.done);
  const staleOps = Number(runSql(`select count(*) from public.food_personal_override_operations where user_id='${PURGE_UID}' and operation_id='6a000000-0000-4000-8000-000000000813'`));
  if (staleOps !== 0) throw new Error("Stale post-purge request recreated Personal Override operation ledger.");
}

function cleanup() {
  runSql(`
    drop trigger if exists aaa_plan6_test_merge_sleep on public.food_merge_events;
    drop function if exists private.plan6_test_merge_sleep();
    drop trigger if exists aaa_plan6_test_recovery_role_sleep on public.food_catalog_governance_principals;
    drop function if exists private.plan6_test_recovery_role_sleep();
    drop trigger if exists aaa_plan6_test_recovery_cap_sleep on public.food_catalog_governance_capability_assignments;
    drop function if exists private.plan6_test_recovery_cap_sleep();
    drop trigger if exists aaa_plan6_test_barcode_sleep on public.food_barcodes;
    drop function if exists private.plan6_test_barcode_sleep();
    truncate table public.food_catalog_governance_operations cascade;
    truncate table public.food_ingestion_batches cascade;
    truncate table public.food_items cascade;
    delete from public.account_deletion_jobs where id='6a000000-0000-4000-8000-000000000812';
    delete from public.food_catalog_governance_capability_assignments where principal_id in ('${GOV_PRINCIPAL}','${REC_A}','${REC_B}','${MIX_A}','${MIX_B}');
    delete from public.food_catalog_governance_principals where id in ('${GOV_PRINCIPAL}','${REC_A}','${REC_B}','${MIX_A}','${MIX_B}');
    delete from auth.users where id in ('${OWNER_UID}','${REC_A_UID}','${REC_B_UID}','${MIX_A_UID}','${MIX_B_UID}','${PURGE_UID}','${DPROC_UID}');
  `);
}

export async function verifyPlan6Concurrency() {
  setupCommon();
  installBarcodeSleepTrigger();
  installRecoverySleeps();
  installMergeSleep();
  try {
    await verifyPlan6VsPlan6Gtin();
    await verifyPlan4VsPlan6Gtin();
    await verifyRemoveAssignSerialization();
    await verifyRecoveryConcurrency();
    await verifyMergeCycleConcurrency();
    setupDeletionProcessingUser();
    await verifyPurgeRace();
  } finally {
    cleanup();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await verifyPlan6Concurrency();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
