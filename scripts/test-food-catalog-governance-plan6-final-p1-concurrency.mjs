#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const DATABASE_URL = process.env.PLAIVRA_PLAN6_FINAL_P1_CONCURRENCY_TEST_DATABASE_URL ?? process.env.PLAIVRA_LOCAL_DATABASE_URL;
const SCENARIO = process.env.PLAIVRA_PLAN6_FINAL_P1_SCENARIO ?? "all";

const OWNER_A_UID = "6d000000-0000-4000-8000-000000000001";
const OWNER_B_UID = "6d000000-0000-4000-8000-000000000002";
const MEMBER_UID = "6d000000-0000-4000-8000-000000000003";
const OWNER_A = "6d000000-0000-4000-8000-000000000101";
const OWNER_B = "6d000000-0000-4000-8000-000000000102";
const FOOD_A = "6d000000-0000-4000-8000-000000000201";
const REPORT_FOOD = "6d000000-0000-4000-8000-000000000202";
const OWNER_DELETE_JOB = randomUUID();
const MATCH_GTIN = "4006381333931";

const APP_P6_MATCH = "plan6-final-p1-p6-match";
const APP_P4_MATCH = "plan6-final-p1-p4-match";
const APP_DELETE_OWNER = "plan6-final-p1-owner-delete";
const APP_REVOKE_OWNER = "plan6-final-p1-owner-revoke";
const APP_REPORT = "plan6-final-p1-report";
const APP_REPORT_PURGE = "plan6-final-p1-report-purge";

function assertDisposableLocalDatabaseUrl(value) {
  const parsed = new URL(String(value ?? ""));
  if (!new Set(["postgresql:", "postgres:"]).has(parsed.protocol)) {
    throw new Error("Plan 6 final-P1 concurrency verification requires PostgreSQL.");
  }
  if (!new Set(["127.0.0.1", "localhost"]).has(parsed.hostname) || parsed.port !== "54322") {
    throw new Error("Refusing Plan 6 final-P1 concurrency verification outside disposable local Supabase on port 54322.");
  }
  return parsed.toString();
}

const localUrl = assertDisposableLocalDatabaseUrl(DATABASE_URL);
const psqlArgs = [localUrl, "-X", "-v", "ON_ERROR_STOP=1", "-A", "-t", "-q"];

function runSql(sql) {
  const result = spawnSync("psql", [...psqlArgs, "-c", sql], {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: "postgres" },
  });
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
  const done = new Promise((resolve) => {
    child.on("error", (error) => resolve({ code: null, stdout, stderr, error }));
    child.on("close", (code) => resolve({ code, stdout, stderr, error: null }));
  });
  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  return { child, done };
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
  await waitFor(
    () => runSql(`select coalesce(wait_event,'') from pg_stat_activity where application_name='${app}' and state='active' limit 1;`) === "PgSleep",
    5000,
    `${app} to reach controlled sleep`,
  );
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
  if (successes !== 1) {
    throw new Error(`${label} expected exactly one success, got ${successes}. A=${a.stderr || a.stdout} B=${b.stderr || b.stdout}`);
  }
}
function authSql(uid, body) {
  return `begin; set local role authenticated; select set_config('request.jwt.claim.role','authenticated',true); select set_config('request.jwt.claim.sub','${uid}',true); ${body}; commit;`;
}
function serviceSql(body) {
  return `begin; set local role service_role; select set_config('request.jwt.claim.role','service_role',true); ${body}; commit;`;
}
function q(value) { return `'${String(value).replaceAll("'", "''")}'`; }

function setupCommon() {
  if (Number(runSql("select count(*) from public.food_items")) !== 0) {
    throw new Error("Plan 6 final-P1 concurrency verifier requires empty disposable Food state.");
  }
  if (Number(runSql("select count(*) from public.food_ingestion_batches")) !== 0) {
    throw new Error("Plan 6 final-P1 concurrency verifier requires empty disposable ingestion state.");
  }

  runSql(`
    insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
      ('${OWNER_A_UID}','authenticated','authenticated','plan6-final-owner-a@example.test','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp()),
      ('${OWNER_B_UID}','authenticated','authenticated','plan6-final-owner-b@example.test','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp()),
      ('${MEMBER_UID}','authenticated','authenticated','plan6-final-report-member@example.test','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp());
    insert into public.food_items(id,food_name,is_global,lifecycle_status) values
      ('${FOOD_A}','Plan6 final P1 existing Food A',true,'active'),
      ('${REPORT_FOOD}','Plan6 final P1 report Food',true,'active');
  `);

  const humanColumn = runSql(`select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='food_catalog_governance_principals' and column_name='human_user_id'
  )`);
  if (humanColumn === "t") {
    runSql(`
      insert into public.food_catalog_governance_principals(id,principal_type,subject_id,human_user_id,role_class) values
        ('${OWNER_A}','human','${OWNER_A_UID}','${OWNER_A_UID}','owner'),
        ('${OWNER_B}','human','${OWNER_B_UID}','${OWNER_B_UID}','owner');
    `);
  } else {
    runSql(`
      insert into public.food_catalog_governance_principals(id,principal_type,subject_id,role_class) values
        ('${OWNER_A}','human','${OWNER_A_UID}','owner'),
        ('${OWNER_B}','human','${OWNER_B_UID}','owner');
    `);
  }
  runSql(`
    insert into public.food_catalog_governance_capability_assignments(principal_id,capability,reason) values
      ('${OWNER_A}','food.governance.manage_principals','final-p1-concurrency'),
      ('${OWNER_B}','food.governance.manage_principals','final-p1-concurrency'),
      ('${OWNER_A}','food.correction.apply','final-p1-concurrency'),
      ('${OWNER_A}','food.barcode.correct','final-p1-concurrency');
  `);
}

function installPlan6BarcodeSleep() {
  runSql(`
    create or replace function private.plan6_final_p1_barcode_sleep() returns trigger
    language plpgsql set search_path='' as $function$
    begin
      if tg_op='INSERT'
         and new.gtin='${MATCH_GTIN}'
         and current_setting('application_name',true)='${APP_P6_MATCH}'
      then
        perform pg_catalog.pg_sleep(15);
      end if;
      return new;
    end
    $function$;
    drop trigger if exists zzz_plan6_final_p1_barcode_sleep on public.food_barcodes;
    create trigger zzz_plan6_final_p1_barcode_sleep
      before insert on public.food_barcodes
      for each row execute function private.plan6_final_p1_barcode_sleep();
  `);
}

function plan4MatchCandidate() {
  return {
    sourceRecordId: "plan6-final-p1-match-record",
    sourceReference: "fixture://plan6/final-p1-match",
    sourceRecordChecksumSha256: "e".repeat(64),
    canonicalName: "Plan6 final P1 match candidate",
    brandName: null,
    servingLabel: null,
    category: null,
    cuisine: null,
    nutrition: null,
    aliases: [],
    names: [],
    identityEvidence: {
      semanticSignature: null,
      preparation: null,
      state: null,
      form: null,
      structuredEvidenceKey: null,
    },
    servings: [],
    taxonomyEvidence: [],
    gtins: [MATCH_GTIN],
    marketScopes: [],
    globallyRelevant: false,
    sourceNutrition: null,
    sourceServing: null,
  };
}

function setupPlan4MatchProduction() {
  const candidate = JSON.stringify(plan4MatchCandidate());
  const source = JSON.stringify({
    provider: "synthetic-reference",
    dataset: "plan6-final-p1-match",
    sourceVersion: "2026.09",
    sourceReleaseDate: "2026-09-08",
    licenseName: "Fixture License",
    licenseReference: "fixture-license",
    sourceReference: "fixture://plan6/final-p1-match-source",
    sourceChecksumSha256: "c".repeat(64),
    importerVersion: "plan6-final-p1-concurrency",
    configChecksumSha256: "d".repeat(64),
  });
  const decision = JSON.stringify({ kind: "match", foodId: FOOD_A });
  const disposition = JSON.stringify({ kind: "accept", reasonCodes: [] });
  const expected = JSON.stringify({
    input: 1,
    accepted: 1,
    rejected: 0,
    matched: 1,
    created: 0,
    possibleDuplicate: 0,
    quarantined: 0,
  });

  runSql(serviceSql(`select public.food_catalog_ingestion_prepare_execution_v2(jsonb_build_object(
    'operationId','6d000000-0000-4000-8000-000000000301',
    'commandChecksumSha256',repeat('1',64),'executionMode','dry_run','attemptNumber',1,
    'manifestContentChecksumSha256',repeat('a',64),'semanticIdentityChecksumSha256',repeat('b',64),
    'source',${q(source)}::jsonb,'expectedMutations',${q(expected)}::jsonb))`));
  const ids = runSql(`select batch.id::text||'|'||run.id::text
    from public.food_ingestion_batches batch
    join public.food_ingestion_runs run on run.batch_id=batch.id
    where batch.semantic_identity_checksum_sha256=repeat('b',64) and run.execution_mode='dry_run'`).split("|");
  const [batchId, dryRunId] = ids;

  runSql(serviceSql(`select public.food_catalog_ingestion_persist_candidate_v2(jsonb_build_object(
    'operationId','6d000000-0000-4000-8000-000000000302','commandChecksumSha256',repeat('2',64),
    'runId','${dryRunId}','foodId','${FOOD_A}','decisionKind','match','dispositionKind','accept',
    'decision',${q(decision)}::jsonb,'disposition',${q(disposition)}::jsonb,'candidate',${q(candidate)}::jsonb))`));
  runSql(serviceSql(`
    select public.food_catalog_ingestion_record_reconciliation_v2(jsonb_build_object(
      'operationId','6d000000-0000-4000-8000-000000000303','commandChecksumSha256',repeat('3',64),
      'runId','${dryRunId}','manifestContentChecksumSha256',repeat('a',64),
      'semanticIdentityChecksumSha256',repeat('b',64),'completed',true));
    select public.food_catalog_ingestion_complete_run_v2(jsonb_build_object(
      'operationId','6d000000-0000-4000-8000-000000000304','commandChecksumSha256',repeat('4',64),'runId','${dryRunId}'));
  `));
  runSql(`
    update public.food_ingestion_batches
      set review_state='reviewed',reviewed_at=clock_timestamp() where id='${batchId}';
    update public.food_ingestion_batches
      set review_state='approved',approved_at=clock_timestamp(),approval_reference='plan6-final-p1'
      where id='${batchId}';
  `);
  runSql(serviceSql(`select public.food_catalog_ingestion_prepare_execution_v2(jsonb_build_object(
    'operationId','6d000000-0000-4000-8000-000000000305','commandChecksumSha256',repeat('5',64),
    'executionMode','production','attemptNumber',1,'manifestContentChecksumSha256',repeat('a',64),
    'semanticIdentityChecksumSha256',repeat('b',64),'source',${q(source)}::jsonb,'expectedMutations',${q(expected)}::jsonb))`));
  const productionRunId = runSql(`select id from public.food_ingestion_runs
    where batch_id='${batchId}' and execution_mode='production' and attempt_number=1`);
  runSql(serviceSql(`select public.food_catalog_ingestion_acquire_lease_v2(jsonb_build_object(
    'operationId','6d000000-0000-4000-8000-000000000306','commandChecksumSha256',repeat('6',64),
    'runId','${productionRunId}','leaseOwner','plan6-final-p1-plan4',
    'leaseToken','6d000000-0000-4000-8000-000000000399','leaseSeconds',120))`));
  return { productionRunId, candidate, decision, disposition };
}

async function verifyPlan4MatchVsPlan6SameFoodGtin() {
  installPlan6BarcodeSleep();
  const p4 = setupPlan4MatchProduction();
  runSql(`insert into public.food_catalog_correction_cases(
    id,food_id,category,claim_key,issue_key,state,state_revision,policy_version,
    expected_authority_kind,expected_authority_key,expected_authority_revision,expected_authority_id
  ) values(
    '6d000000-0000-4000-8000-000000000401','${FOOD_A}','wrong_barcode','${MATCH_GTIN}',
    'final-p1|plan4-match|plan6','approved',2,'plan6-v1','barcode_correction','${MATCH_GTIN}',0,null
  );`);

  const p6 = startSql(authSql(OWNER_A_UID, `select public.food_catalog_apply_barcode_correction(
    '6d000000-0000-4000-8000-000000000402','6d000000-0000-4000-8000-000000000401','${FOOD_A}',
    2,0,null,'${MATCH_GTIN}','assign',null,'Plan4 MATCH vs Plan6 same-Food race')`), APP_P6_MATCH);
  await waitForSleep(APP_P6_MATCH);
  const p4Session = startSql(serviceSql(`select public.food_catalog_ingestion_persist_candidate_v2(jsonb_build_object(
    'operationId','6d000000-0000-4000-8000-000000000403','commandChecksumSha256',repeat('7',64),
    'runId','${p4.productionRunId}','foodId','${FOOD_A}','decisionKind','match','dispositionKind','accept',
    'decision',${q(p4.decision)}::jsonb,'disposition',${q(p4.disposition)}::jsonb,'candidate',${q(p4.candidate)}::jsonb,
    'leaseToken','6d000000-0000-4000-8000-000000000399','leaseEpoch',1))`), APP_P4_MATCH);

  const [r6, r4] = await Promise.all([p6.done, p4Session.done]);
  const deadlockText = `${r6.stderr || ""}\n${r4.stderr || ""}`;
  if (/deadlock detected/i.test(deadlockText)) {
    throw new Error(`Plan4 MATCH / Plan6 same-Food same-GTIN lock-order deadlock reproduced:\n${deadlockText}`);
  }
  requireSuccess("Plan6 same-Food GTIN correction", r6);
  requireSuccess("Plan4 MATCH same-Food GTIN persistence", r4);

  const state = runSql(`select concat_ws('|',
    (select count(*) from public.food_barcodes where gtin='${MATCH_GTIN}'),
    (select count(*) from public.food_barcodes where gtin='${MATCH_GTIN}' and food_id='${FOOD_A}'),
    (select count(*) from public.food_catalog_correction_cases where id='6d000000-0000-4000-8000-000000000401' and state='applied'),
    (select count(*) from public.food_catalog_governance_audit_events where operation_id='6d000000-0000-4000-8000-000000000402'),
    (select count(*) from public.food_catalog_governance_outbox where operation_id='6d000000-0000-4000-8000-000000000402')
  )`);
  if (state !== "1|1|1|1|1") {
    throw new Error(`Plan4 MATCH / Plan6 race left split effective/governance authority: ${state}`);
  }
}

function installOwnerDeletionSleep() {
  runSql(`
    create or replace function private.plan6_final_p1_owner_delete_sleep() returns trigger
    language plpgsql set search_path='' as $function$
    begin
      if old.id='${OWNER_A}'::uuid and old.active and not new.active then
        perform pg_catalog.pg_sleep(2);
      end if;
      return new;
    end
    $function$;
    drop trigger if exists aaa_plan6_final_p1_owner_delete_sleep on public.food_catalog_governance_principals;
    create trigger aaa_plan6_final_p1_owner_delete_sleep
      before update on public.food_catalog_governance_principals
      for each row execute function private.plan6_final_p1_owner_delete_sleep();
  `);
}

async function verifyAccountDeletionVsRecoveryMutation() {
  installOwnerDeletionSleep();
  runSql(`insert into public.account_deletion_jobs(
    id,user_id,subject_hash,idempotency_key_hash,state,stage,attempt_count,created_at,updated_at
  ) values(
    '${OWNER_DELETE_JOB}','${OWNER_A_UID}',
    'final-p1-owner-delete-subject','final-p1-owner-delete-idempotency','processing','disabling_access',1,clock_timestamp(),clock_timestamp()
  );`);
  const deletion = startSql(serviceSql(`select public.food_catalog_begin_account_deletion('${OWNER_A_UID}','${OWNER_DELETE_JOB}')`), APP_DELETE_OWNER);
  await waitForSleep(APP_DELETE_OWNER);
  const revoke = startSql(authSql(OWNER_A_UID, `select public.food_catalog_revoke_governance_capability(
    '6d000000-0000-4000-8000-000000000501','${OWNER_B}',
    'food.governance.manage_principals','delete/revoke race')`), APP_REVOKE_OWNER);
  const [rd, rr] = await Promise.all([deletion.done, revoke.done]);
  requireExactlyOneSuccess("account deletion vs final-Owner recovery mutation", rd, rr);

  const usable = Number(runSql(`select count(*)
    from public.food_catalog_governance_principals p
    join auth.users u on u.id=p.human_user_id
    join public.account_access_states s on s.user_id=u.id and s.state='active' and s.disabled_at is null
    join public.food_catalog_governance_capability_assignments a
      on a.principal_id=p.id and a.capability='food.governance.manage_principals' and a.revoked_at is null
    where p.principal_type='human' and p.role_class='owner' and p.active and p.revoked_at is null`));
  if (usable !== 1) throw new Error(`Deletion/recovery race left ${usable} usable recovery Owners.`);
}

function reportPayloadCount(userId) {
  const hasPayloadTable = runSql("select to_regclass('public.food_catalog_correction_report_member_payloads') is not null") === "t";
  if (hasPayloadTable) {
    return Number(runSql(`select count(*) from public.food_catalog_correction_report_member_payloads where reporter_user_id='${userId}'`));
  }
  return Number(runSql(`select count(*) from public.food_catalog_correction_reports where reporter_user_id='${userId}'`));
}

async function verifyReportVsAccountPurge() {
  const report = startSql(authSql(MEMBER_UID, `
    select public.food_catalog_report_correction(
      '${REPORT_FOOD}','other','person@example.test private race claim','member private race payload',
      '{"member_private":"race"}'::jsonb,'plan6-v1');
    select pg_catalog.pg_sleep(3)
  `), APP_REPORT);
  await waitForSleep(APP_REPORT);

  const purge = startSql(`begin;
    update public.account_access_states
      set state='deletion_processing',disabled_at=clock_timestamp(),reason_code='plan6-final-p1-report-race'
      where user_id='${MEMBER_UID}';
    insert into public.account_deletion_jobs(
      id,user_id,subject_hash,idempotency_key_hash,state,stage,attempt_count,locked_at,created_at,updated_at
    ) values(
      '6d000000-0000-4000-8000-000000000601','${MEMBER_UID}',
      'plan6-final-p1-report-subject','plan6-final-p1-report-idempotency',
      'processing','deleting_database',1,clock_timestamp(),clock_timestamp(),clock_timestamp()
    );
    set local role service_role;
    select set_config('request.jwt.claim.role','service_role',true);
    select public.purge_account_application_data_atomic('${MEMBER_UID}');
    commit;`, APP_REPORT_PURGE);

  const [rr, rp] = await Promise.all([report.done, purge.done]);
  requireSuccess("member correction report before purge", rr);
  requireSuccess("account purge following in-flight member report", rp);

  const metadata = Number(runSql(`select count(*)
    from public.food_catalog_correction_reports r
    join public.food_catalog_correction_cases c on c.id=r.case_id
    where c.food_id='${REPORT_FOOD}' and c.category='other'`));
  if (metadata !== 1) throw new Error(`Report/purge race did not preserve exactly one non-personal report metadata row: ${metadata}`);
  const globalClaimLeaks = Number(runSql(`select count(*) from public.food_catalog_correction_cases
    where claim_key ilike '%person@example.test%' or issue_key ilike '%person@example.test%'`));
  if (globalClaimLeaks !== 0) throw new Error(`Report/purge race retained ${globalClaimLeaks} member claim leak(s) in durable Case identity.`);
  const payloads = reportPayloadCount(MEMBER_UID);
  if (payloads !== 0) throw new Error(`Report/purge race resurrected ${payloads} attributable member payload row(s).`);

  const stale = startSql(authSql(MEMBER_UID, `select public.food_catalog_report_correction(
    '${REPORT_FOOD}','other','person@example.test stale private race claim','stale private report','{"member_private":"stale"}'::jsonb,'plan6-v1')`),
    "plan6-final-p1-stale-report");
  requireFailure("stale report after account purge", await stale.done);
  if (reportPayloadCount(MEMBER_UID) !== 0) {
    throw new Error("Stale post-purge report recreated attributable member payload.");
  }
}

function cleanup() {
  runSql(`
    drop trigger if exists aaa_plan6_final_p1_owner_delete_sleep on public.food_catalog_governance_principals;
    drop function if exists private.plan6_final_p1_owner_delete_sleep();
    drop trigger if exists zzz_plan6_final_p1_barcode_sleep on public.food_barcodes;
    drop function if exists private.plan6_final_p1_barcode_sleep();
    truncate table public.food_catalog_governance_operations cascade;
    truncate table public.food_ingestion_batches cascade;
    truncate table public.food_items cascade;
    delete from public.account_deletion_jobs where id='${OWNER_DELETE_JOB}';
    delete from public.account_deletion_jobs where id='6d000000-0000-4000-8000-000000000601';
    delete from public.food_catalog_governance_capability_assignments where principal_id in ('${OWNER_A}','${OWNER_B}');
    delete from public.food_catalog_governance_principals where id in ('${OWNER_A}','${OWNER_B}');
    delete from auth.users where id in ('${OWNER_A_UID}','${OWNER_B_UID}','${MEMBER_UID}');
  `);
}

export async function verifyPlan6FinalP1Concurrency() {
  setupCommon();
  try {
    if (SCENARIO === "all" || SCENARIO === "gtin") await verifyPlan4MatchVsPlan6SameFoodGtin();
    if (SCENARIO === "all" || SCENARIO === "recovery") await verifyAccountDeletionVsRecoveryMutation();
    if (SCENARIO === "all" || SCENARIO === "privacy") await verifyReportVsAccountPurge();
  } finally {
    cleanup();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await verifyPlan6FinalP1Concurrency();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
