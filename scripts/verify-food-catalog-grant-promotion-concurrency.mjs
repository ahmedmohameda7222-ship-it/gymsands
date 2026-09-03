#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";

const DATABASE_URL = process.env.PLAIVRA_LOCAL_DATABASE_URL;
const BARRIER_CLASS = 55321;

function assertDisposableLocalDatabaseUrl(value) {
  const parsed = new URL(String(value ?? ""));
  if (!new Set(["postgresql:", "postgres:"]).has(parsed.protocol)) {
    throw new Error("Food Catalog concurrency verification requires PostgreSQL.");
  }
  if (!new Set(["127.0.0.1", "localhost"]).has(parsed.hostname) || parsed.port !== "54322") {
    throw new Error("Refusing Food Catalog concurrency verification outside disposable local Supabase on port 54322.");
  }
  return parsed.toString();
}

const localUrl = assertDisposableLocalDatabaseUrl(DATABASE_URL);
const psqlBaseArgs = [localUrl, "-X", "-v", "ON_ERROR_STOP=1", "-A", "-t", "-q"];

function runSql(sql) {
  const result = spawnSync("psql", [...psqlBaseArgs, "-c", sql], {
    encoding: "utf8",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`psql failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function startSql(sql) {
  const child = spawn("psql", [...psqlBaseArgs, "-c", sql], {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let settled = false;
  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  const promise = new Promise((resolve) => {
    child.on("error", (error) => {
      settled = true;
      resolve({ status: -1, stdout, stderr: `${stderr}${error.stack ?? error.message}` });
    });
    child.on("close", (status, signal) => {
      settled = true;
      resolve({ status: status ?? (signal ? -1 : 0), stdout, stderr, signal });
    });
  });
  return { child, promise, get settled() { return settled; } };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

function holdBarrier(key) {
  return startSql(`select pg_advisory_lock(${BARRIER_CLASS}, ${key}); select pg_sleep(120);`);
}

async function releaseBarrier(session) {
  if (!session.settled) session.child.kill("SIGTERM");
  await session.promise;
}

async function waitUntilBlocked(operationId) {
  const escaped = operationId.replaceAll("'", "''");
  await waitFor(() => {
    const count = Number(runSql(`
      select count(*)
      from pg_stat_activity
      where pid <> pg_backend_pid()
        and state = 'active'
        and wait_event_type = 'Lock'
        and query like '%${escaped}%';
    `));
    return count > 0;
  }, 5000, `operation ${operationId} to block on the test barrier`);
}

async function waitUntilSettled(session, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (session.settled) return true;
    await sleep(25);
  }
  return session.settled;
}

function promotionSql({ operationId, eventId, generationId, checksumChar, reportId, reportChecksumChar }) {
  return `
    begin;
    select public.food_catalog_promote_generation_v1(jsonb_build_object(
      'operation_id','${operationId}',
      'command_checksum_sha256',repeat('f',64),
      'candidate_generation_id','${generationId}',
      'candidate_checksum_sha256',repeat('${checksumChar}',64),
      'expected_current_generation_id',null,
      'validation_report_id','${reportId}',
      'validation_report_checksum_sha256',repeat('${reportChecksumChar}',64),
      'event_id','${eventId}',
      'actor',jsonb_build_object(
        'principal_id','plan3-concurrency-verifier',
        'principal_type','service',
        'authority_reference','plan3-concurrency-verifier',
        'reason_code','CONCURRENCY_PROMOTE',
        'policy_version','control-v1'
      )
    ));
    commit;
  `;
}

function invalidationSql({ operationId, eventId, activationSetId, grantEventId }) {
  return `
    begin;
    select public.food_catalog_invalidate_activation_grant_v1(jsonb_build_object(
      'operation_id','${operationId}',
      'command_checksum_sha256',repeat('e',64),
      'activation_set_id','${activationSetId}',
      'target_grant_event_id','${grantEventId}',
      'event_id','${eventId}',
      'actor',jsonb_build_object(
        'principal_id','plan3-concurrency-verifier',
        'principal_type','service',
        'authority_reference','plan3-concurrency-verifier',
        'reason_code','CONCURRENCY_INVALIDATE',
        'policy_version','control-v1'
      )
    ));
    commit;
  `;
}

function resetCurrentPointer() {
  runSql(`
    update public.food_catalog_current_generation
    set current_generation_id = null,
        current_event_id = null,
        current_validation_report_id = null,
        pointer_revision = 0,
        updated_at = clock_timestamp()
    where singleton_key;
  `);
}

const fixtures = {
  A: { suffix: "001", checksum: "1", reportChecksum: "a" },
  C: { suffix: "003", checksum: "3", reportChecksum: "b" },
  D: { suffix: "004", checksum: "4", reportChecksum: "c" },
  E: { suffix: "005", checksum: "5", reportChecksum: "d" },
  F1: { suffix: "006", checksum: "6", reportChecksum: "e" },
  F2: { suffix: "007", checksum: "6", reportChecksum: "e" },
};

function ids(suffix) {
  return {
    food: `d5a00000-0000-4000-8000-000000000${suffix}`,
    set: `d5a10000-0000-4000-8000-000000000${suffix}`,
    member: `d5a20000-0000-4000-8000-000000000${suffix}`,
    grantOp: `d5a30000-0000-4000-8000-000000000${suffix}`,
    grant: `d5a40000-0000-4000-8000-000000000${suffix}`,
    generation: `d5a50000-0000-4000-8000-000000000${suffix}`,
    report: `d5a60000-0000-4000-8000-000000000${suffix}`,
  };
}

const A = ids(fixtures.A.suffix);
const C = ids(fixtures.C.suffix);
const D = ids(fixtures.D.suffix);
const E = ids(fixtures.E.suffix);
const F1 = ids(fixtures.F1.suffix);
const F2 = ids(fixtures.F2.suffix);
const MULTI_GENERATION = "d5a50000-0000-4000-8000-000000000008";
const MULTI_REPORT = "d5a60000-0000-4000-8000-000000000008";

const fixtureRows = [A, C, D, E, F1, F2];

function setupFixtures() {
  const foodValues = fixtureRows.map((row, index) =>
    `('${row.food}','Plan3 concurrency ${index + 1}','100 g',10,1,1,1,'admin_created',true,'draft')`
  ).join(",\n");
  const opValues = fixtureRows.map((row) =>
    `('${row.grantOp}','grant_activation_set',repeat('a',64),'{}'::jsonb)`
  ).join(",\n");
  const setValues = fixtureRows.map((row) =>
    `('${row.set}','activation-manifest-v1','activation-policy-v1',repeat('b',64),'plan3-concurrency-verifier','service','plan3-concurrency-verifier','CONCURRENCY_FIXTURE','control-v1')`
  ).join(",\n");
  const memberValues = fixtureRows.map((row) =>
    `('${row.member}','${row.set}','${row.food}','draft','fixture:concurrency',repeat('c',64),true,true,true,true,0,'eligible',repeat('d',64))`
  ).join(",\n");
  const grantValues = fixtureRows.map((row) =>
    `('${row.grant}','${row.set}','grant',null,'${row.grantOp}',repeat('a',64),'plan3-concurrency-verifier','service','plan3-concurrency-verifier','CONCURRENCY_FIXTURE','control-v1')`
  ).join(",\n");

  const singleCandidates = [
    [A, fixtures.A],
    [C, fixtures.C],
    [E, fixtures.E],
  ];
  const generationValues = singleCandidates.map(([row, fixture]) =>
    `('${row.generation}',null,null,'generation-v1','generation-policy-v1','activation-policy-v1','trust-v1','projection-v1',repeat('1',64),repeat('${fixture.checksum}',64),'fixture:concurrency')`
  );
  generationValues.push(`('${MULTI_GENERATION}',null,null,'generation-v1','generation-policy-v1','activation-policy-v1','trust-v1','projection-v1',repeat('1',64),repeat('6',64),'fixture:concurrency')`);

  const generationFoodValues = [
    `('${A.generation}','${A.food}','active',null,'${A.set}','${A.member}','${A.grant}')`,
    `('${C.generation}','${C.food}','active',null,'${C.set}','${C.member}','${C.grant}')`,
    `('${E.generation}','${E.food}','active',null,'${E.set}','${E.member}','${E.grant}')`,
    `('${MULTI_GENERATION}','${F1.food}','active',null,'${F1.set}','${F1.member}','${F1.grant}')`,
    `('${MULTI_GENERATION}','${F2.food}','active',null,'${F2.set}','${F2.member}','${F2.grant}')`,
  ].join(",\n");

  const reportValues = [
    `('${A.report}','${A.generation}',repeat('1',64),'validator-v1','validation-policy-v1',repeat('a',64),0,0,0,0)`,
    `('${C.report}','${C.generation}',repeat('3',64),'validator-v1','validation-policy-v1',repeat('b',64),0,0,0,0)`,
    `('${E.report}','${E.generation}',repeat('5',64),'validator-v1','validation-policy-v1',repeat('d',64),0,0,0,0)`,
    `('${MULTI_REPORT}','${MULTI_GENERATION}',repeat('6',64),'validator-v1','validation-policy-v1',repeat('e',64),0,0,0,0)`,
  ].join(",\n");

  runSql(`
    insert into public.food_items (
      id, food_name, serving_size, calories, protein_g, carbs_g, fat_g,
      source_type, is_global, lifecycle_status
    ) values ${foodValues};

    insert into public.food_catalog_control_operations (
      operation_id, operation_kind, command_checksum_sha256, result_json
    ) values ${opValues};

    insert into public.food_catalog_activation_sets (
      id, manifest_schema_version, activation_policy_version, manifest_checksum_sha256,
      principal_id, principal_type, authority_reference, reason_code, policy_version
    ) values ${setValues};

    insert into public.food_catalog_activation_set_members (
      id, activation_set_id, food_id, expected_precondition_lifecycle,
      evidence_reference, evidence_checksum_sha256, source_legal_accepted,
      identity_resolved, nutrition_basis_valid, display_identity_valid,
      blocking_condition_count, eligibility, member_checksum_sha256
    ) values ${memberValues};

    insert into public.food_catalog_activation_events (
      id, activation_set_id, event_type, target_grant_event_id,
      operation_id, command_checksum_sha256, principal_id, principal_type,
      authority_reference, reason_code, policy_version
    ) values ${grantValues};

    insert into public.food_catalog_generations (
      id, base_generation_id, generation_ordinal,
      composition_schema_version, generation_policy_version, activation_policy_version,
      trust_policy_version, projection_version, change_manifest_checksum_sha256,
      composition_checksum_sha256, authority_reference
    ) values ${generationValues.join(",\n")};

    insert into public.food_catalog_generation_foods (
      generation_id, food_id, lifecycle, nutrition_revision_id,
      activation_set_id, activation_set_member_id, activation_grant_event_id
    ) values ${generationFoodValues};

    insert into public.food_catalog_generation_validation_reports (
      id, generation_id, generation_checksum_sha256, validator_set_version,
      policy_version, report_checksum_sha256, blocker_count, error_count,
      warning_count, info_count
    ) values ${reportValues};

    create or replace function private.food_catalog_test_invalidation_barrier()
    returns trigger
    language plpgsql
    set search_path = ''
    as $function$
    begin
      if new.event_type = 'invalidate' then
        if new.target_grant_event_id = '${A.grant}'::uuid then
          perform pg_catalog.pg_advisory_xact_lock(${BARRIER_CLASS}, 1);
        elsif new.target_grant_event_id = '${D.grant}'::uuid then
          perform pg_catalog.pg_advisory_xact_lock(${BARRIER_CLASS}, 3);
        elsif new.target_grant_event_id = '${F2.grant}'::uuid then
          perform pg_catalog.pg_advisory_xact_lock(${BARRIER_CLASS}, 4);
        end if;
      end if;
      return new;
    end
    $function$;

    create trigger aaa_food_catalog_test_invalidation_barrier
    before insert on public.food_catalog_activation_events
    for each row execute function private.food_catalog_test_invalidation_barrier();

    create or replace function private.food_catalog_test_promotion_barrier()
    returns trigger
    language plpgsql
    set search_path = ''
    as $function$
    begin
      if new.current_generation_id = '${C.generation}'::uuid then
        perform pg_catalog.pg_advisory_xact_lock(${BARRIER_CLASS}, 2);
      end if;
      return new;
    end
    $function$;

    create trigger aaa_food_catalog_test_promotion_barrier
    before update on public.food_catalog_current_generation
    for each row execute function private.food_catalog_test_promotion_barrier();
  `);
}

function cleanupFixtures() {
  runSql(`
    drop trigger if exists aaa_food_catalog_test_promotion_barrier on public.food_catalog_current_generation;
    drop function if exists private.food_catalog_test_promotion_barrier();
    drop trigger if exists aaa_food_catalog_test_invalidation_barrier on public.food_catalog_activation_events;
    drop function if exists private.food_catalog_test_invalidation_barrier();

    truncate table
      public.food_catalog_generation_validation_findings,
      public.food_catalog_generation_validation_reports,
      public.food_catalog_generation_redirects,
      public.food_catalog_generation_verification,
      public.food_catalog_generation_markets,
      public.food_catalog_generation_taxonomy,
      public.food_catalog_generation_names,
      public.food_catalog_generation_servings,
      public.food_catalog_generation_foods,
      public.food_catalog_generation_events,
      public.food_catalog_current_generation,
      public.food_catalog_generations,
      public.food_catalog_activation_events,
      public.food_catalog_activation_set_members,
      public.food_catalog_activation_sets,
      public.food_catalog_control_operations
    cascade;

    insert into public.food_catalog_current_generation (
      singleton_key, current_generation_id, current_event_id, current_validation_report_id, pointer_revision
    ) values (true, null, null, null, 0);

    delete from public.food_items
    where id in (${fixtureRows.map((row) => `'${row.food}'`).join(",")});
  `);
}

const failures = [];

async function scenarioInvalidationFirst() {
  resetCurrentPointer();
  const barrier = holdBarrier(1);
  await sleep(300);
  const invalidationOperation = "d5b90000-0000-4000-8000-000000000001";
  const invalidation = startSql(invalidationSql({
    operationId: invalidationOperation,
    eventId: "d5ba0000-0000-4000-8000-000000000001",
    activationSetId: A.set,
    grantEventId: A.grant,
  }));
  await waitUntilBlocked(invalidationOperation);

  const promotion = startSql(promotionSql({
    operationId: "d5b70000-0000-4000-8000-000000000001",
    eventId: "d5b80000-0000-4000-8000-000000000001",
    generationId: A.generation,
    checksumChar: "1",
    reportId: A.report,
    reportChecksumChar: "a",
  }));
  const promotionCompletedBeforeInvalidationCommit = await waitUntilSettled(promotion, 1000);
  await releaseBarrier(barrier);
  const invalidationResult = await invalidation.promise;
  const promotionResult = await promotion.promise;

  if (invalidationResult.status !== 0) failures.push(`invalidation-first invalidation failed: ${invalidationResult.stderr}`);
  if (promotionCompletedBeforeInvalidationCommit || promotionResult.status === 0) {
    failures.push("invalidation-first: promotion using the same grant was allowed to commit ahead of or after the winning invalidation transaction");
  }
  if (promotionResult.status !== 0 && !promotionResult.stderr.includes("INVALID_ACTIVATION_GRANT")) {
    failures.push(`invalidation-first: promotion failed for the wrong reason: ${promotionResult.stderr}`);
  }
}

async function scenarioPromotionFirst() {
  resetCurrentPointer();
  const barrier = holdBarrier(2);
  await sleep(300);
  const promotionOperation = "d5b70000-0000-4000-8000-000000000003";
  const promotion = startSql(promotionSql({
    operationId: promotionOperation,
    eventId: "d5b80000-0000-4000-8000-000000000003",
    generationId: C.generation,
    checksumChar: "3",
    reportId: C.report,
    reportChecksumChar: "b",
  }));
  await waitUntilBlocked(promotionOperation);

  const invalidation = startSql(invalidationSql({
    operationId: "d5b90000-0000-4000-8000-000000000003",
    eventId: "d5ba0000-0000-4000-8000-000000000003",
    activationSetId: C.set,
    grantEventId: C.grant,
  }));
  const invalidationCompletedBeforePromotionCommit = await waitUntilSettled(invalidation, 1000);
  await releaseBarrier(barrier);
  const promotionResult = await promotion.promise;
  const invalidationResult = await invalidation.promise;

  if (promotionResult.status !== 0) failures.push(`promotion-first promotion failed: ${promotionResult.stderr}`);
  if (invalidationResult.status !== 0) failures.push(`promotion-first later invalidation failed: ${invalidationResult.stderr}`);
  if (invalidationCompletedBeforePromotionCommit) {
    failures.push("promotion-first: invalidation committed while the same-grant promotion was paused after its authority check");
  }
  const current = runSql(`select coalesce(current_generation_id::text, 'null') from public.food_catalog_current_generation where singleton_key;`);
  if (current !== C.generation) failures.push(`promotion-first: later invalidation retroactively changed current generation to ${current}`);
}

async function scenarioUnrelatedGrants() {
  resetCurrentPointer();
  const barrier = holdBarrier(3);
  await sleep(300);
  const invalidationOperation = "d5b90000-0000-4000-8000-000000000004";
  const invalidation = startSql(invalidationSql({
    operationId: invalidationOperation,
    eventId: "d5ba0000-0000-4000-8000-000000000004",
    activationSetId: D.set,
    grantEventId: D.grant,
  }));
  await waitUntilBlocked(invalidationOperation);

  const promotion = startSql(promotionSql({
    operationId: "d5b70000-0000-4000-8000-000000000005",
    eventId: "d5b80000-0000-4000-8000-000000000005",
    generationId: E.generation,
    checksumChar: "5",
    reportId: E.report,
    reportChecksumChar: "d",
  }));
  const unrelatedPromotionCompleted = await waitUntilSettled(promotion, 1500);
  const promotionResult = unrelatedPromotionCompleted ? await promotion.promise : null;
  if (!unrelatedPromotionCompleted || promotionResult?.status !== 0) {
    failures.push(`unrelated-grants: promotion on grant E was unnecessarily serialized behind grant D${promotionResult ? `: ${promotionResult.stderr}` : ""}`);
  }
  await releaseBarrier(barrier);
  const invalidationResult = await invalidation.promise;
  if (invalidationResult.status !== 0) failures.push(`unrelated-grants invalidation failed: ${invalidationResult.stderr}`);
}

async function scenarioMultipleGrantLocks() {
  resetCurrentPointer();
  const barrier = holdBarrier(4);
  await sleep(300);
  const invalidationOperationF2 = "d5b90000-0000-4000-8000-000000000007";
  const invalidationF2 = startSql(invalidationSql({
    operationId: invalidationOperationF2,
    eventId: "d5ba0000-0000-4000-8000-000000000007",
    activationSetId: F2.set,
    grantEventId: F2.grant,
  }));
  await waitUntilBlocked(invalidationOperationF2);

  const promotionOperation = "d5b70000-0000-4000-8000-000000000008";
  const promotion = startSql(promotionSql({
    operationId: promotionOperation,
    eventId: "d5b80000-0000-4000-8000-000000000008",
    generationId: MULTI_GENERATION,
    checksumChar: "6",
    reportId: MULTI_REPORT,
    reportChecksumChar: "e",
  }));
  await sleep(500);

  const invalidationF1 = startSql(invalidationSql({
    operationId: "d5b90000-0000-4000-8000-000000000006",
    eventId: "d5ba0000-0000-4000-8000-000000000006",
    activationSetId: F1.set,
    grantEventId: F1.grant,
  }));

  await releaseBarrier(barrier);
  const results = await Promise.race([
    Promise.all([invalidationF2.promise, promotion.promise, invalidationF1.promise]),
    sleep(6000).then(() => null),
  ]);
  if (!results) {
    failures.push("multiple-grant-locks: operations did not converge within 6s (possible deadlock)");
    for (const session of [invalidationF2, promotion, invalidationF1]) {
      if (!session.settled) session.child.kill("SIGTERM");
    }
    await Promise.all([invalidationF2.promise, promotion.promise, invalidationF1.promise]);
    return;
  }
  const [f2Result, promotionResult, f1Result] = results;
  if (f2Result.status !== 0) failures.push(`multiple-grant-locks F2 invalidation failed: ${f2Result.stderr}`);
  if (f1Result.status !== 0) failures.push(`multiple-grant-locks F1 invalidation failed: ${f1Result.stderr}`);
  if (promotionResult.status === 0 || !promotionResult.stderr.includes("INVALID_ACTIVATION_GRANT")) {
    failures.push(`multiple-grant-locks: promotion did not reject after a locked grant was invalidated: ${promotionResult.stderr}`);
  }
}

try {
  setupFixtures();
  await scenarioInvalidationFirst();
  await scenarioPromotionFirst();
  await scenarioUnrelatedGrants();
  await scenarioMultipleGrantLocks();
} finally {
  try {
    cleanupFixtures();
  } catch (cleanupError) {
    failures.push(`cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
  }
}

if (failures.length > 0) {
  throw new Error(`Food Catalog grant/promotion concurrency verification failed:\n- ${failures.join("\n- ")}`);
}

process.stdout.write("PASS Food Catalog grant/promotion concurrency verification\n");
