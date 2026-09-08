#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";

const databaseUrl = process.env.PLAIVRA_PLAN6_FIVE_P1_CONCURRENCY_TEST_DATABASE_URL ?? process.env.PLAIVRA_LOCAL_DATABASE_URL;
const USER_A = "6a000000-0000-4000-8000-000000000001";
const USER_B = "6a000000-0000-4000-8000-000000000002";
const PURGE_FIRST = "6a000000-0000-4000-8000-000000000003";
const WRITE_FIRST = "6a000000-0000-4000-8000-000000000004";
const PRINCIPAL_A = "6a000000-0000-4000-8000-000000000101";
const PRINCIPAL_B = "6a000000-0000-4000-8000-000000000102";
const BARCODE_A = "6a000000-0000-4000-8000-000000000201";
const BARCODE_B = "6a000000-0000-4000-8000-000000000202";
const PLAN4_FOOD = "6a000000-0000-4000-8000-000000000203";
const PLAN6_FOOD = "6a000000-0000-4000-8000-000000000204";
const MERGE_A = "6a000000-0000-4000-8000-000000000205";
const MERGE_B = "6a000000-0000-4000-8000-000000000206";
const PRIVACY_FOOD = "6a000000-0000-4000-8000-000000000207";
const GTIN_P6 = "4006381333931";
const GTIN_CROSS = "5901234123457";
const GTIN_REMOVE = "9501234600014";
const PLAN4_LEASE = "6a000000-0000-4000-8000-000000000701";

function assertLocal(value) {
  const parsed = new URL(String(value ?? ""));
  if (!new Set(["postgresql:", "postgres:"]).has(parsed.protocol)) throw new Error("Plan 6 concurrency verification requires PostgreSQL.");
  if (!new Set(["127.0.0.1", "localhost"]).has(parsed.hostname) || parsed.port !== "54322") {
    throw new Error("Refusing Plan 6 concurrency verification outside disposable local Supabase on port 54322.");
  }
  return parsed.toString();
}
const localUrl = assertLocal(databaseUrl);
const baseArgs = [localUrl, "-X", "-v", "ON_ERROR_STOP=1", "-A", "-t", "-q"];

function runSql(sql) {
  const result = spawnSync("psql", [...baseArgs, "-c", sql], { encoding: "utf8", env: { ...process.env, PGPASSWORD: "postgres" } });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`psql failed (${result.status}): ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}
function startSql(sql, app) {
  const child = spawn("psql", [...baseArgs, "-c", sql], {
    env: { ...process.env, PGPASSWORD: "postgres", PGAPPNAME: app }, stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = ""; let stderr = "";
  child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
  child.stdout.on("data", (x) => { stdout += x; }); child.stderr.on("data", (x) => { stderr += x; });
  const done = new Promise((resolve) => {
    child.on("error", (error) => resolve({ code: null, stdout, stderr, error }));
    child.on("close", (code) => resolve({ code, stdout, stderr, error: null }));
  });
  return { child, done };
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(predicate, label, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}
async function waitForPgSleep(app) {
  await waitFor(() => runSql(`select count(*) from pg_stat_activity where application_name='${app}' and state='active' and wait_event='PgSleep'`) === "1", `${app} PgSleep`);
}
function mustSucceed(label, result) {
  if (result.error || result.code !== 0) throw new Error(`${label} failed: ${result.stderr || result.stdout || result.error}`);
}
function mustFail(label, result) {
  if (!result.error && result.code === 0) throw new Error(`${label} unexpectedly succeeded: ${result.stdout}`);
}
function authSql(userId, body, sleepSeconds = 0) {
  return `begin; set local role authenticated; select set_config('request.jwt.claim.role','authenticated',true); select set_config('request.jwt.claim.sub','${userId}',true); ${body}; ${sleepSeconds ? `select pg_sleep(${sleepSeconds});` : ""} commit;`;
}

function setupCommon() {
  runSql(`
    insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
      ('${USER_A}','authenticated','authenticated','p1-a@example.invalid','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
      ('${USER_B}','authenticated','authenticated','p1-b@example.invalid','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
      ('${PURGE_FIRST}','authenticated','authenticated','p1-purge-first@example.invalid','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
      ('${WRITE_FIRST}','authenticated','authenticated','p1-write-first@example.invalid','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());

    insert into public.food_items(id,food_name,is_global,lifecycle_status) values
      ('${BARCODE_A}','P1 barcode A',true,'active'),('${BARCODE_B}','P1 barcode B',true,'active'),
      ('${PLAN4_FOOD}','P1 Plan4 GTIN target',true,'active'),('${PLAN6_FOOD}','P1 Plan6 GTIN target',true,'active'),
      ('${MERGE_A}','P1 merge A',true,'active'),('${MERGE_B}','P1 merge B',true,'active'),
      ('${PRIVACY_FOOD}','P1 privacy food',true,'active');

    insert into public.food_catalog_governance_principals(id,principal_type,subject_id,role_class) values
      ('${PRINCIPAL_A}','human','${USER_A}','owner'),('${PRINCIPAL_B}','human','${USER_B}','owner');
    insert into public.food_catalog_governance_capability_assignments(principal_id,capability,reason) values
      ('${PRINCIPAL_A}','food.governance.manage_principals','five-p1-concurrency'),
      ('${PRINCIPAL_B}','food.governance.manage_principals','five-p1-concurrency'),
      ('${PRINCIPAL_A}','food.correction.apply','five-p1-concurrency'),
      ('${PRINCIPAL_A}','food.barcode.correct','five-p1-concurrency'),
      ('${PRINCIPAL_A}','food.identity.merge','five-p1-concurrency');

    insert into public.food_catalog_correction_cases(id,food_id,category,claim_key,issue_key,state,state_revision,policy_version,expected_authority_kind,expected_authority_key,expected_authority_revision,expected_authority_id) values
      ('6a000000-0000-4000-8000-000000000301','${BARCODE_A}','wrong_barcode','p6-a','five-p1|p6|a','approved',2,'plan6-v1','barcode_correction','${GTIN_P6}',0,null),
      ('6a000000-0000-4000-8000-000000000302','${BARCODE_B}','wrong_barcode','p6-b','five-p1|p6|b','approved',2,'plan6-v1','barcode_correction','${GTIN_P6}',0,null),
      ('6a000000-0000-4000-8000-000000000303','${PLAN6_FOOD}','wrong_barcode','cross','five-p1|cross','approved',2,'plan6-v1','barcode_correction','${GTIN_CROSS}',0,null),
      ('6a000000-0000-4000-8000-000000000304','${BARCODE_A}','wrong_barcode','remove','five-p1|remove','approved',2,'plan6-v1','barcode_correction','${GTIN_REMOVE}',0,null),
      ('6a000000-0000-4000-8000-000000000305','${BARCODE_B}','wrong_barcode','assign-after-remove','five-p1|assign-after-remove','approved',2,'plan6-v1','barcode_correction','${GTIN_REMOVE}',0,null),
      ('6a000000-0000-4000-8000-000000000306','${MERGE_A}','duplicate_food','merge-a','five-p1|merge-a','approved',2,'plan6-v1',null,null,null,null),
      ('6a000000-0000-4000-8000-000000000307','${MERGE_B}','duplicate_food','merge-b','five-p1|merge-b','approved',2,'plan6-v1',null,null,null,null);
    insert into public.food_barcodes(food_id,gtin) values ('${BARCODE_A}','${GTIN_REMOVE}');
  `);
}

function plan6BarcodeSql({ op, caseId, foodId, gtin, action }) {
  return authSql(USER_A, `select public.food_catalog_apply_barcode_correction('${op}','${caseId}','${foodId}',2,0,null,'${gtin}','${action}',null,'five-P1 concurrency')`);
}

async function verifyPlan6VsPlan6Gtin() {
  const winner = startSql(authSql(USER_A, `select public.food_catalog_apply_barcode_correction('6a000000-0000-4000-8000-000000000401','6a000000-0000-4000-8000-000000000301','${BARCODE_A}',2,0,null,'${GTIN_P6}','assign',null,'P1 Plan6 winner')`, 3), "plan6-gtin-a");
  await waitForPgSleep("plan6-gtin-a");
  const loser = startSql(plan6BarcodeSql({ op: "6a000000-0000-4000-8000-000000000402", caseId: "6a000000-0000-4000-8000-000000000302", foodId: BARCODE_B, gtin: GTIN_P6, action: "assign" }), "plan6-gtin-b");
  const winnerResult = await winner.done; const loserResult = await loser.done;
  mustSucceed("Plan6 GTIN winner", winnerResult); mustFail("Plan6 GTIN loser", loserResult);
  const state = runSql(`select concat_ws('|',(select food_id::text from public.food_barcodes where gtin='${GTIN_P6}'),(select state from public.food_catalog_correction_cases where id='6a000000-0000-4000-8000-000000000302'),(select count(*) from public.food_catalog_governance_audit_events where operation_id='6a000000-0000-4000-8000-000000000402'),(select count(*) from public.food_catalog_governance_outbox where operation_id='6a000000-0000-4000-8000-000000000402'))`);
  if (state !== `${BARCODE_A}|approved|0|0`) throw new Error(`Plan6 same-GTIN race split authority: ${state}`);
}

function setupPlan4CrossFixture() {
  const candidate = JSON.stringify({
    sourceRecordId: "five-p1-plan4-source", sourceReference: "fixture://five-p1-plan4", sourceRecordChecksumSha256: "e".repeat(64),
    canonicalName: "P1 Plan4 match", brandName: null, servingLabel: null, category: null, cuisine: null,
    nutrition: null, aliases: [], names: [], identityEvidence: {}, servings: [], taxonomyEvidence: [], gtins: [GTIN_CROSS], marketScopes: [], globallyRelevant: false,
    sourceNutrition: null, sourceServing: null,
  }).replaceAll("'", "''");
  const decision = JSON.stringify({ kind: "match", foodId: PLAN4_FOOD }).replaceAll("'", "''");
  const disposition = JSON.stringify({ kind: "accept", reasonCodes: [] }).replaceAll("'", "''");
  runSql(`
    select public.food_catalog_ingestion_prepare_execution_v2(jsonb_build_object(
      'operationId','6a000000-0000-4000-8000-000000000501','commandChecksumSha256',repeat('1',64),'executionMode','dry_run','attemptNumber',1,
      'manifestContentChecksumSha256',repeat('a',64),'semanticIdentityChecksumSha256',repeat('b',64),
      'source',jsonb_build_object('provider','five-p1-provider','dataset','five-p1-dataset','sourceVersion','2026.09','sourceReleaseDate','2026-09-08','licenseName','Fixture','licenseReference','fixture','sourceReference','fixture://five-p1','sourceChecksumSha256',repeat('c',64),'importerVersion','five-p1','configChecksumSha256',repeat('d',64)),
      'expectedMutations',jsonb_build_object('input',1,'accepted',1,'rejected',0,'matched',1,'created',0,'possibleDuplicate',0,'quarantined',0)));
    select public.food_catalog_ingestion_persist_candidate_v2(jsonb_build_object(
      'operationId','6a000000-0000-4000-8000-000000000502','commandChecksumSha256',repeat('2',64),
      'runId',(select id from public.food_ingestion_runs where execution_mode='dry_run' and batch_id=(select id from public.food_ingestion_batches where semantic_identity_checksum_sha256=repeat('b',64))),
      'foodId','${PLAN4_FOOD}','decisionKind','match','dispositionKind','accept','decision','${decision}'::jsonb,'disposition','${disposition}'::jsonb,'candidate','${candidate}'::jsonb));
    select public.food_catalog_ingestion_record_reconciliation_v2(jsonb_build_object(
      'operationId','6a000000-0000-4000-8000-000000000503','commandChecksumSha256',repeat('3',64),
      'runId',(select id from public.food_ingestion_runs where execution_mode='dry_run' and batch_id=(select id from public.food_ingestion_batches where semantic_identity_checksum_sha256=repeat('b',64))),
      'manifestContentChecksumSha256',repeat('a',64),'semanticIdentityChecksumSha256',repeat('b',64),'completed',true));
    select public.food_catalog_ingestion_complete_run_v2(jsonb_build_object(
      'operationId','6a000000-0000-4000-8000-000000000504','commandChecksumSha256',repeat('4',64),
      'runId',(select id from public.food_ingestion_runs where execution_mode='dry_run' and batch_id=(select id from public.food_ingestion_batches where semantic_identity_checksum_sha256=repeat('b',64)))));
    update public.food_ingestion_batches set review_state='reviewed',reviewed_at=clock_timestamp() where semantic_identity_checksum_sha256=repeat('b',64);
    update public.food_ingestion_batches set review_state='approved',approved_at=clock_timestamp(),approval_reference='five-p1-concurrency' where semantic_identity_checksum_sha256=repeat('b',64);
    select public.food_catalog_ingestion_prepare_execution_v2(jsonb_build_object(
      'operationId','6a000000-0000-4000-8000-000000000505','commandChecksumSha256',repeat('5',64),'executionMode','production','attemptNumber',1,
      'manifestContentChecksumSha256',repeat('a',64),'semanticIdentityChecksumSha256',repeat('b',64),
      'source',jsonb_build_object('provider','five-p1-provider','dataset','five-p1-dataset','sourceVersion','2026.09','sourceReleaseDate','2026-09-08','licenseName','Fixture','licenseReference','fixture','sourceReference','fixture://five-p1','sourceChecksumSha256',repeat('c',64),'importerVersion','five-p1','configChecksumSha256',repeat('d',64)),
      'expectedMutations',jsonb_build_object('input',1,'accepted',1,'rejected',0,'matched',1,'created',0,'possibleDuplicate',0,'quarantined',0)));
    select public.food_catalog_ingestion_acquire_lease_v2(jsonb_build_object(
      'operationId','6a000000-0000-4000-8000-000000000506','commandChecksumSha256',repeat('6',64),
      'runId',(select id from public.food_ingestion_runs where execution_mode='production' and batch_id=(select id from public.food_ingestion_batches where semantic_identity_checksum_sha256=repeat('b',64))),
      'leaseOwner','five-p1-plan4','leaseToken','${PLAN4_LEASE}','leaseSeconds',120));
  `);
  return { candidate, decision, disposition };
}

async function verifyPlan4VsPlan6Gtin() {
  const { candidate, decision, disposition } = setupPlan4CrossFixture();
  const plan4 = startSql(`begin; set local role service_role; select public.food_catalog_ingestion_persist_candidate_v2(jsonb_build_object(
      'operationId','6a000000-0000-4000-8000-000000000507','commandChecksumSha256',repeat('7',64),
      'runId',(select id from public.food_ingestion_runs where execution_mode='production' and batch_id=(select id from public.food_ingestion_batches where semantic_identity_checksum_sha256=repeat('b',64))),
      'leaseToken','${PLAN4_LEASE}','leaseEpoch',1,'foodId','${PLAN4_FOOD}','decisionKind','match','dispositionKind','accept',
      'decision','${decision}'::jsonb,'disposition','${disposition}'::jsonb,'candidate','${candidate}'::jsonb)); select pg_sleep(3); commit;`, "plan4-gtin");
  await waitForPgSleep("plan4-gtin");
  const plan6 = startSql(plan6BarcodeSql({ op: "6a000000-0000-4000-8000-000000000508", caseId: "6a000000-0000-4000-8000-000000000303", foodId: PLAN6_FOOD, gtin: GTIN_CROSS, action: "assign" }), "plan6-cross-gtin");
  const r4 = await plan4.done; const r6 = await plan6.done;
  mustSucceed("Plan4 GTIN persistence", r4); mustFail("Plan6 conflicting GTIN correction", r6);
  const state = runSql(`select concat_ws('|',(select food_id::text from public.food_barcodes where gtin='${GTIN_CROSS}'),(select state from public.food_catalog_correction_cases where id='6a000000-0000-4000-8000-000000000303'),(select count(*) from public.food_catalog_governance_authority_revisions where food_id='${PLAN6_FOOD}' and authority_kind='barcode_correction' and authority_key='${GTIN_CROSS}'))`);
  if (state !== `${PLAN4_FOOD}|approved|0`) throw new Error(`Plan4/Plan6 GTIN race split authority: ${state}`);
}

async function verifyRemoveAssignSerialization() {
  const remove = startSql(authSql(USER_A, `select public.food_catalog_apply_barcode_correction('6a000000-0000-4000-8000-000000000509','6a000000-0000-4000-8000-000000000304','${BARCODE_A}',2,0,null,'${GTIN_REMOVE}','remove',null,'remove race')`, 3), "plan6-remove-gtin");
  await waitForPgSleep("plan6-remove-gtin");
  const assign = startSql(plan6BarcodeSql({ op: "6a000000-0000-4000-8000-000000000510", caseId: "6a000000-0000-4000-8000-000000000305", foodId: BARCODE_B, gtin: GTIN_REMOVE, action: "assign" }), "plan6-assign-gtin");
  const removeResult = await remove.done; const assignResult = await assign.done;
  mustSucceed("GTIN remove", removeResult);
  const owner = runSql(`select coalesce((select food_id::text from public.food_barcodes where gtin='${GTIN_REMOVE}'),'none')`);
  if (assignResult.code === 0) {
    if (owner !== BARCODE_B) throw new Error(`Successful post-remove assign did not own GTIN: ${owner}`);
  } else if (owner !== "none") {
    throw new Error(`Failed post-remove assign left unexpected owner: ${owner}`);
  }
}

async function verifyRecoverySetRaces() {
  const revokeB = startSql(authSql(USER_A, `select public.food_catalog_revoke_governance_capability('6a000000-0000-4000-8000-000000000601','${PRINCIPAL_B}','food.governance.manage_principals','revoke B recovery')`, 3), "recovery-revoke-b");
  await waitForPgSleep("recovery-revoke-b");
  const revokeA = startSql(authSql(USER_B, `select public.food_catalog_revoke_governance_capability('6a000000-0000-4000-8000-000000000602','${PRINCIPAL_A}','food.governance.manage_principals','revoke A recovery')`), "recovery-revoke-a");
  const rb = await revokeB.done; const ra = await revokeA.done;
  mustSucceed("first recovery revoke", rb); mustFail("second recovery revoke", ra);
  const remaining = Number(runSql(`select count(*) from public.food_catalog_governance_principals p join public.food_catalog_governance_capability_assignments a on a.principal_id=p.id and a.capability='food.governance.manage_principals' and a.revoked_at is null where p.principal_type='human' and p.role_class='owner' and p.active and p.revoked_at is null`));
  if (remaining < 1) throw new Error("Concurrent recovery revokes removed every recovery Owner.");

  runSql(`
    update public.food_catalog_governance_principals set role_class='owner',active=true,revoked_at=null where id in ('${PRINCIPAL_A}','${PRINCIPAL_B}');
    insert into public.food_catalog_governance_capability_assignments(principal_id,capability,reason) values
      ('${PRINCIPAL_A}','food.governance.manage_principals','mixed-race-reset'),('${PRINCIPAL_B}','food.governance.manage_principals','mixed-race-reset')
    on conflict(principal_id,capability) where revoked_at is null do nothing;
  `);
  const demoteB = startSql(authSql(USER_A, `select public.food_catalog_manage_governance_principal('6a000000-0000-4000-8000-000000000603','human','${USER_B}','curator','{}'::text[],'demote B recovery',null)`, 3), "recovery-demote-b");
  await waitForPgSleep("recovery-demote-b");
  const mixedRevokeA = startSql(authSql(USER_B, `select public.food_catalog_revoke_governance_capability('6a000000-0000-4000-8000-000000000604','${PRINCIPAL_A}','food.governance.manage_principals','mixed revoke A')`), "recovery-mixed-revoke-a");
  const db = await demoteB.done; const ma = await mixedRevokeA.done;
  mustSucceed("Owner demotion", db); mustFail("mixed concurrent recovery revoke", ma);
  const mixedRemaining = Number(runSql(`select count(*) from public.food_catalog_governance_principals p join public.food_catalog_governance_capability_assignments a on a.principal_id=p.id and a.capability='food.governance.manage_principals' and a.revoked_at is null where p.principal_type='human' and p.role_class='owner' and p.active and p.revoked_at is null`));
  if (mixedRemaining < 1) throw new Error("Mixed demotion/revoke removed every recovery Owner.");
}

async function verifyMergeCycleRace() {
  const aToB = startSql(authSql(USER_A, `select public.food_catalog_resolve_duplicate('6a000000-0000-4000-8000-000000000611','6a000000-0000-4000-8000-000000000306','${MERGE_A}','${MERGE_B}',2,0,null,'merge A to B')`, 3), "merge-a-b");
  await waitForPgSleep("merge-a-b");
  const bToA = startSql(authSql(USER_A, `select public.food_catalog_resolve_duplicate('6a000000-0000-4000-8000-000000000612','6a000000-0000-4000-8000-000000000307','${MERGE_B}','${MERGE_A}',2,0,null,'merge B to A')`), "merge-b-a");
  const ab = await aToB.done; const ba = await bToA.done;
  mustSucceed("first duplicate merge", ab); mustFail("reverse concurrent duplicate merge", ba);
  const topology = runSql(`select concat_ws('|',(select lifecycle_status||':'||coalesce(merged_into_food_id::text,'root') from public.food_items where id='${MERGE_A}'),(select lifecycle_status||':'||coalesce(merged_into_food_id::text,'root') from public.food_items where id='${MERGE_B}'))`);
  if (topology !== `merged:${MERGE_B}|active:root`) throw new Error(`Duplicate topology is not flat/cycle-safe: ${topology}`);
}

function installPurgePause(userId) {
  runSql(`create or replace function private.plan6_five_p1_pause_profile_delete() returns trigger language plpgsql set search_path='' as $$ begin if old.id='${userId}'::uuid then perform pg_sleep(3); end if; return old; end $$; drop trigger if exists plan6_five_p1_pause_profile_delete on public.profiles; create trigger plan6_five_p1_pause_profile_delete before delete on public.profiles for each row execute function private.plan6_five_p1_pause_profile_delete();`);
}
function removePurgePause() {
  runSql(`drop trigger if exists plan6_five_p1_pause_profile_delete on public.profiles; drop function if exists private.plan6_five_p1_pause_profile_delete();`);
}

async function verifyPurgeStartsFirst() {
  runSql(`update public.account_access_states set state='deletion_processing',reason_code='five-p1',disabled_at=clock_timestamp(),updated_at=clock_timestamp() where user_id='${PURGE_FIRST}'; insert into public.account_deletion_jobs(id,user_id,subject_hash,idempotency_key_hash,state,stage,attempt_count,locked_at) values ('6a000000-0000-4000-8000-000000000801','${PURGE_FIRST}','five-p1-subject-a','five-p1-delete-a','processing','deleting_database',1,clock_timestamp());`);
  installPurgePause(PURGE_FIRST);
  const purge = startSql(`begin; set local role service_role; select public.purge_account_application_data_atomic('${PURGE_FIRST}'); commit;`, "purge-first");
  await waitForPgSleep("purge-first");
  const stale = startSql(authSql(PURGE_FIRST, `select public.food_catalog_set_personal_override('6a000000-0000-4000-8000-000000000802','${PRIVACY_FOOD}',null,0,'{"calories":77}'::jsonb,null,'stale after purge')`), "purge-first-stale-write");
  const purgeResult = await purge.done; const staleResult = await stale.done;
  removePurgePause();
  mustSucceed("purge-first account purge", purgeResult); mustFail("stale Personal Override after purge lock", staleResult);
  const residual = Number(runSql(`select (select count(*) from public.food_personal_override_operations where user_id='${PURGE_FIRST}')+(select count(*) from public.food_personal_override_revisions where user_id='${PURGE_FIRST}')+(select count(*) from public.food_personal_overrides where user_id='${PURGE_FIRST}')`));
  if (residual !== 0) throw new Error(`purge-first left Personal Override rows: ${residual}`);
}

async function verifyWriteStartsFirst() {
  const write = startSql(authSql(WRITE_FIRST, `select public.food_catalog_set_personal_override('6a000000-0000-4000-8000-000000000803','${PRIVACY_FOOD}',null,0,'{"calories":88}'::jsonb,null,'write before purge')`, 3), "write-first-override");
  await waitForPgSleep("write-first-override");
  const purge = startSql(`begin; select pg_advisory_xact_lock(hashtextextended('plaivra-account-data-purge:${WRITE_FIRST}',0)); update public.account_access_states set state='deletion_processing',reason_code='five-p1',disabled_at=clock_timestamp(),updated_at=clock_timestamp() where user_id='${WRITE_FIRST}'; insert into public.account_deletion_jobs(id,user_id,subject_hash,idempotency_key_hash,state,stage,attempt_count,locked_at) values ('6a000000-0000-4000-8000-000000000804','${WRITE_FIRST}','five-p1-subject-b','five-p1-delete-b','processing','deleting_database',1,clock_timestamp()); set local role service_role; select public.purge_account_application_data_atomic('${WRITE_FIRST}'); commit;`, "write-first-purge");
  const writeResult = await write.done; const purgeResult = await purge.done;
  mustSucceed("write-first Personal Override", writeResult); mustSucceed("write-first following purge", purgeResult);
  const residual = Number(runSql(`select (select count(*) from public.food_personal_override_operations where user_id='${WRITE_FIRST}')+(select count(*) from public.food_personal_override_revisions where user_id='${WRITE_FIRST}')+(select count(*) from public.food_personal_overrides where user_id='${WRITE_FIRST}')`));
  if (residual !== 0) throw new Error(`write-first purge left Personal Override rows: ${residual}`);
}

function cleanup() {
  try { removePurgePause(); } catch {}
  runSql(`
    alter table public.food_catalog_governance_audit_events disable trigger user;
    alter table public.food_catalog_governance_lifecycle_events disable trigger user;
    alter table public.food_catalog_barcode_corrections disable trigger user;
    alter table public.food_catalog_correction_events disable trigger user;
    alter table public.food_catalog_correction_evidence disable trigger user;
    alter table public.food_catalog_correction_reports disable trigger user;
    alter table public.food_catalog_service_proposals disable trigger user;
    alter table public.food_merge_events disable trigger user;
    alter table public.food_ingestion_control_operations disable trigger user;
    alter table public.food_ingestion_manifest_records disable trigger user;
    alter table public.food_ingestion_materialized_results disable trigger user;
    alter table public.food_ingestion_operational_events disable trigger user;
    alter table public.food_ingestion_batch_records disable trigger user;

    delete from public.food_catalog_governance_outbox where operation_id::text like '6a%';
    delete from public.food_catalog_governance_audit_events where operation_id::text like '6a%';
    delete from public.food_catalog_governance_lifecycle_events where operation_id::text like '6a%';
    delete from public.food_catalog_barcode_corrections where authority_reference like 'plan6:6a%';
    delete from public.food_catalog_governance_authority_revisions where food_id in ('${BARCODE_A}','${BARCODE_B}','${PLAN6_FOOD}','${MERGE_A}','${MERGE_B}');
    delete from public.food_catalog_correction_events where operation_id::text like '6a%' or case_id::text like '6a%';
    delete from public.food_catalog_correction_evidence where case_id::text like '6a%';
    delete from public.food_catalog_correction_reports where case_id::text like '6a%';
    delete from public.food_catalog_service_proposals where operation_id::text like '6a%';
    delete from public.food_catalog_correction_cases where id::text like '6a%';
    delete from public.food_catalog_governance_operations where operation_id::text like '6a%';
    delete from public.food_catalog_governance_capability_assignments where principal_id in ('${PRINCIPAL_A}','${PRINCIPAL_B}');
    delete from public.food_catalog_governance_principals where id in ('${PRINCIPAL_A}','${PRINCIPAL_B}');

    delete from public.food_personal_overrides where user_id in ('${PURGE_FIRST}','${WRITE_FIRST}');
    delete from public.food_personal_override_revisions where user_id in ('${PURGE_FIRST}','${WRITE_FIRST}');
    delete from public.food_personal_override_operations where user_id in ('${PURGE_FIRST}','${WRITE_FIRST}');

    delete from public.food_ingestion_materialized_results where batch_id in (select id from public.food_ingestion_batches where semantic_identity_checksum_sha256=repeat('b',64));
    delete from public.food_ingestion_manifest_records where batch_id in (select id from public.food_ingestion_batches where semantic_identity_checksum_sha256=repeat('b',64));
    delete from public.food_ingestion_operational_events where batch_id in (select id from public.food_ingestion_batches where semantic_identity_checksum_sha256=repeat('b',64));
    delete from public.food_ingestion_control_operations where operation_id::text like '6a%';
    delete from public.food_ingestion_batch_records where batch_id in (select id from public.food_ingestion_batches where semantic_identity_checksum_sha256=repeat('b',64));
    delete from public.food_ingestion_reconciliations where batch_id in (select id from public.food_ingestion_batches where semantic_identity_checksum_sha256=repeat('b',64));
    delete from public.food_ingestion_runs where batch_id in (select id from public.food_ingestion_batches where semantic_identity_checksum_sha256=repeat('b',64));
    delete from public.food_source_records where provider='five-p1-provider';
    delete from public.food_ingestion_batches where semantic_identity_checksum_sha256=repeat('b',64);

    delete from public.food_merge_events where source_food_id in ('${MERGE_A}','${MERGE_B}') or target_food_id in ('${MERGE_A}','${MERGE_B}');
    delete from public.food_barcodes where food_id in ('${BARCODE_A}','${BARCODE_B}','${PLAN4_FOOD}','${PLAN6_FOOD}');
    delete from public.account_deletion_jobs where id in ('6a000000-0000-4000-8000-000000000801','6a000000-0000-4000-8000-000000000804');
    delete from public.food_items where id in ('${BARCODE_A}','${BARCODE_B}','${PLAN4_FOOD}','${PLAN6_FOOD}','${MERGE_A}','${MERGE_B}','${PRIVACY_FOOD}');
    delete from auth.users where id in ('${USER_A}','${USER_B}','${PURGE_FIRST}','${WRITE_FIRST}');

    alter table public.food_catalog_governance_audit_events enable trigger user;
    alter table public.food_catalog_governance_lifecycle_events enable trigger user;
    alter table public.food_catalog_barcode_corrections enable trigger user;
    alter table public.food_catalog_correction_events enable trigger user;
    alter table public.food_catalog_correction_evidence enable trigger user;
    alter table public.food_catalog_correction_reports enable trigger user;
    alter table public.food_catalog_service_proposals enable trigger user;
    alter table public.food_merge_events enable trigger user;
    alter table public.food_ingestion_control_operations enable trigger user;
    alter table public.food_ingestion_manifest_records enable trigger user;
    alter table public.food_ingestion_materialized_results enable trigger user;
    alter table public.food_ingestion_operational_events enable trigger user;
    alter table public.food_ingestion_batch_records enable trigger user;
  `);
}

try {
  setupCommon();
  await verifyPlan6VsPlan6Gtin();
  await verifyPlan4VsPlan6Gtin();
  await verifyRemoveAssignSerialization();
  await verifyRecoverySetRaces();
  await verifyMergeCycleRace();
  await verifyPurgeStartsFirst();
  await verifyWriteStartsFirst();
  process.stdout.write("PASS Plan 6 five-P1 multi-session concurrency verification\n");
} finally {
  cleanup();
}
