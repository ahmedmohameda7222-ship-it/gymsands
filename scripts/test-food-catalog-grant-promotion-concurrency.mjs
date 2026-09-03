#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";

const PROMOTION_APP = "plan3-promotion-race";
const INVALIDATION_APP = "plan3-invalidation-race";
const FOOD_ID = "d5000000-0000-4000-8000-000000000001";
const ACTIVATION_SET_ID = "d5200000-0000-4000-8000-000000000001";
const MEMBER_ID = "d5300000-0000-4000-8000-000000000001";
const GRANT_EVENT_ID = "d5400000-0000-4000-8000-000000000001";
const INVALIDATION_EVENT_ID = "d5400000-0000-4000-8000-000000000002";
const GENERATION_ID = "d5500000-0000-4000-8000-000000000001";
const PROMOTION_EVENT_ID = "d5600000-0000-4000-8000-000000000001";
const REPORT_ID = "d5700000-0000-4000-8000-000000000001";
const GRANT_OPERATION_ID = "d5100000-0000-4000-8000-000000000001";
const PROMOTION_OPERATION_ID = "d5100000-0000-4000-8000-000000000002";
const INVALIDATION_OPERATION_ID = "d5100000-0000-4000-8000-000000000003";
const PAUSE_FUNCTION = "private.plan3_test_pause_promotion_pointer";
const PAUSE_TRIGGER = "plan3_test_pause_promotion_pointer";

function assertDisposableLocalDatabaseUrl(value) {
  const parsed = new URL(String(value ?? ""));
  if (!new Set(["postgresql:", "postgres:"]).has(parsed.protocol)) {
    throw new Error("Plan 3 concurrency verification requires a PostgreSQL URL.");
  }
  if (!new Set(["127.0.0.1", "localhost"]).has(parsed.hostname) || parsed.port !== "54322") {
    throw new Error("Refusing Plan 3 concurrency verification outside disposable local Supabase on port 54322.");
  }
  return parsed.toString();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function psqlSync(databaseUrl, sql) {
  const result = spawnSync(
    "psql",
    [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-Atc", sql],
    {
      encoding: "utf8",
      env: { ...process.env, PGPASSWORD: "postgres" },
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`psql failed with exit code ${result.status}: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function spawnPsql(databaseUrl, sql, applicationName) {
  const child = spawn(
    "psql",
    [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-Atc", sql],
    {
      env: {
        ...process.env,
        PGPASSWORD: "postgres",
        PGAPPNAME: applicationName,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const done = new Promise((resolve) => {
    child.on("error", (error) => resolve({ code: null, stdout, stderr, error }));
    child.on("close", (code) => resolve({ code, stdout, stderr, error: null }));
  });
  return { child, done };
}

function requireSuccess(label, result) {
  if (result.error) throw result.error;
  if (result.code !== 0) {
    throw new Error(`${label} failed with exit code ${result.code}: ${result.stderr || result.stdout}`);
  }
}

function setupFixture(databaseUrl) {
  psqlSync(databaseUrl, `
    update public.food_catalog_current_generation
    set current_generation_id = null,
        current_event_id = null,
        current_validation_report_id = null,
        pointer_revision = 0,
        updated_at = clock_timestamp()
    where singleton_key;

    insert into public.food_items (
      id, food_name, serving_size, calories, protein_g, carbs_g, fat_g,
      source_type, is_global, lifecycle_status
    ) values (
      '${FOOD_ID}', 'Plan3 concurrency fixture', '100 g', 10, 1, 1, 1,
      'admin_created', true, 'draft'
    );

    insert into public.food_catalog_activation_sets (
      id, manifest_schema_version, activation_policy_version, manifest_checksum_sha256,
      principal_id, principal_type, authority_reference, reason_code, policy_version
    ) values (
      '${ACTIVATION_SET_ID}', 'activation-manifest-v1', 'activation-policy-v1', repeat('1', 64),
      'planner-fixture', 'human', 'fixture-authority', 'concurrency-fixture', 'control-v1'
    );

    insert into public.food_catalog_activation_set_members (
      id, activation_set_id, food_id, expected_precondition_lifecycle,
      evidence_reference, evidence_checksum_sha256, source_legal_accepted,
      identity_resolved, nutrition_basis_valid, display_identity_valid,
      blocking_condition_count, eligibility, member_checksum_sha256
    ) values (
      '${MEMBER_ID}', '${ACTIVATION_SET_ID}', '${FOOD_ID}', 'draft',
      'fixture:concurrency', repeat('2', 64), true, true, true, true,
      0, 'eligible', repeat('3', 64)
    );

    insert into public.food_catalog_control_operations (
      operation_id, operation_kind, command_checksum_sha256, result_json
    ) values (
      '${GRANT_OPERATION_ID}', 'grant_activation_set', repeat('4', 64), '{}'::jsonb
    );

    insert into public.food_catalog_activation_events (
      id, activation_set_id, event_type, target_grant_event_id,
      operation_id, command_checksum_sha256, principal_id, principal_type,
      authority_reference, reason_code, policy_version
    ) values (
      '${GRANT_EVENT_ID}', '${ACTIVATION_SET_ID}', 'grant', null,
      '${GRANT_OPERATION_ID}', repeat('4', 64), 'planner-fixture', 'human',
      'fixture-authority', 'grant', 'control-v1'
    );

    insert into public.food_catalog_generations (
      id, base_generation_id, generation_ordinal,
      composition_schema_version, generation_policy_version, activation_policy_version,
      trust_policy_version, projection_version, change_manifest_checksum_sha256,
      composition_checksum_sha256, authority_reference
    ) values (
      '${GENERATION_ID}', null, null,
      'composition-v1', 'generation-v1', 'activation-policy-v1',
      'trust-v1', 'projection-v1', repeat('5', 64), repeat('6', 64), 'fixture-authority'
    );

    insert into public.food_catalog_generation_foods (
      generation_id, food_id, lifecycle, nutrition_revision_id,
      activation_set_id, activation_set_member_id, activation_grant_event_id
    ) values (
      '${GENERATION_ID}', '${FOOD_ID}', 'active', null,
      '${ACTIVATION_SET_ID}', '${MEMBER_ID}', '${GRANT_EVENT_ID}'
    );

    insert into public.food_catalog_generation_validation_reports (
      id, generation_id, generation_checksum_sha256, validator_set_version,
      policy_version, report_checksum_sha256, blocker_count, error_count,
      warning_count, info_count
    ) values (
      '${REPORT_ID}', '${GENERATION_ID}', repeat('6', 64), 'validator-v1',
      'validation-v1', repeat('7', 64), 0, 0, 0, 0
    );

    create or replace function ${PAUSE_FUNCTION}()
    returns trigger
    language plpgsql
    set search_path = ''
    as $function$
    begin
      if new.current_generation_id = '${GENERATION_ID}'::uuid then
        perform pg_catalog.pg_sleep(5);
      end if;
      return new;
    end
    $function$;

    drop trigger if exists ${PAUSE_TRIGGER} on public.food_catalog_current_generation;
    create trigger ${PAUSE_TRIGGER}
    before update on public.food_catalog_current_generation
    for each row execute function ${PAUSE_FUNCTION}();
  `);
}

function cleanupFixture(databaseUrl) {
  psqlSync(databaseUrl, `
    drop trigger if exists ${PAUSE_TRIGGER} on public.food_catalog_current_generation;
    drop function if exists ${PAUSE_FUNCTION}();

    update public.food_catalog_current_generation
    set current_generation_id = null,
        current_event_id = null,
        current_validation_report_id = null,
        pointer_revision = 0,
        updated_at = clock_timestamp()
    where singleton_key;

    alter table public.food_catalog_generation_events disable trigger user;
    alter table public.food_catalog_generation_validation_reports disable trigger user;
    alter table public.food_catalog_generation_foods disable trigger user;
    alter table public.food_catalog_generations disable trigger user;
    alter table public.food_catalog_activation_events disable trigger user;
    alter table public.food_catalog_activation_set_members disable trigger user;
    alter table public.food_catalog_activation_sets disable trigger user;
    alter table public.food_catalog_control_operations disable trigger user;

    delete from public.food_catalog_generation_events
      where operation_id in ('${PROMOTION_OPERATION_ID}', '${INVALIDATION_OPERATION_ID}');
    delete from public.food_catalog_generation_validation_reports where id = '${REPORT_ID}';
    delete from public.food_catalog_generation_foods where generation_id = '${GENERATION_ID}';
    delete from public.food_catalog_generations where id = '${GENERATION_ID}';
    delete from public.food_catalog_activation_events
      where id in ('${GRANT_EVENT_ID}', '${INVALIDATION_EVENT_ID}');
    delete from public.food_catalog_activation_set_members where id = '${MEMBER_ID}';
    delete from public.food_catalog_activation_sets where id = '${ACTIVATION_SET_ID}';
    delete from public.food_catalog_control_operations
      where operation_id in ('${GRANT_OPERATION_ID}', '${PROMOTION_OPERATION_ID}', '${INVALIDATION_OPERATION_ID}');

    alter table public.food_catalog_generation_events enable trigger user;
    alter table public.food_catalog_generation_validation_reports enable trigger user;
    alter table public.food_catalog_generation_foods enable trigger user;
    alter table public.food_catalog_generations enable trigger user;
    alter table public.food_catalog_activation_events enable trigger user;
    alter table public.food_catalog_activation_set_members enable trigger user;
    alter table public.food_catalog_activation_sets enable trigger user;
    alter table public.food_catalog_control_operations enable trigger user;

    delete from public.food_items where id = '${FOOD_ID}';
  `);
}

function promotionSql() {
  return `select public.food_catalog_promote_generation_v1(jsonb_build_object(
    'operation_id','${PROMOTION_OPERATION_ID}',
    'command_checksum_sha256',repeat('8',64),
    'candidate_generation_id','${GENERATION_ID}',
    'expected_current_generation_id',null,
    'candidate_checksum_sha256',repeat('6',64),
    'validation_report_id','${REPORT_ID}',
    'validation_report_checksum_sha256',repeat('7',64),
    'event_id','${PROMOTION_EVENT_ID}',
    'actor',jsonb_build_object(
      'principal_id','planner-fixture','principal_type','human',
      'authority_reference','fixture-authority','reason_code','promote-race',
      'policy_version','control-v1'
    )
  ));`;
}

function invalidationSql() {
  return `select public.food_catalog_invalidate_activation_grant_v1(jsonb_build_object(
    'operation_id','${INVALIDATION_OPERATION_ID}',
    'command_checksum_sha256',repeat('9',64),
    'activation_set_id','${ACTIVATION_SET_ID}',
    'event_id','${INVALIDATION_EVENT_ID}',
    'target_grant_event_id','${GRANT_EVENT_ID}',
    'actor',jsonb_build_object(
      'principal_id','planner-fixture','principal_type','human',
      'authority_reference','fixture-authority','reason_code','invalidate-race',
      'policy_version','control-v1'
    )
  ));`;
}

async function waitForPromotionPause(databaseUrl) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const waitEvent = psqlSync(
      databaseUrl,
      `select coalesce(wait_event, '') from pg_catalog.pg_stat_activity where application_name = '${PROMOTION_APP}' and state = 'active' limit 1;`,
    );
    if (waitEvent === "PgSleep") return;
    await delay(100);
  }
  throw new Error("Promotion session never reached the post-authority-check pointer pause.");
}

async function invalidationCommittedWhilePromotionPaused(databaseUrl) {
  for (;;) {
    const state = psqlSync(
      databaseUrl,
      `select coalesce(wait_event, '') from pg_catalog.pg_stat_activity where application_name = '${PROMOTION_APP}' and state = 'active' limit 1;`,
    );
    const invalidationVisible = psqlSync(
      databaseUrl,
      `select exists(select 1 from public.food_catalog_activation_events where id = '${INVALIDATION_EVENT_ID}' and event_type = 'invalidate' and target_grant_event_id = '${GRANT_EVENT_ID}');`,
    );
    if (invalidationVisible === "t") return true;
    if (state !== "PgSleep") return false;
    await delay(100);
  }
}

export async function verifyGrantInvalidationPromotionSerialization({
  databaseUrl = process.env.PLAIVRA_GRANT_PROMOTION_CONCURRENCY_TEST_DATABASE_URL,
} = {}) {
  const localUrl = assertDisposableLocalDatabaseUrl(databaseUrl);
  setupFixture(localUrl);
  try {
    const promotion = spawnPsql(localUrl, promotionSql(), PROMOTION_APP);
    await waitForPromotionPause(localUrl);
    const invalidation = spawnPsql(localUrl, invalidationSql(), INVALIDATION_APP);

    const invalidationWonRace = await invalidationCommittedWhilePromotionPaused(localUrl);
    const promotionResult = await promotion.done;
    const invalidationResult = await invalidation.done;
    requireSuccess("promotion session", promotionResult);
    requireSuccess("invalidation session", invalidationResult);

    const finalState = psqlSync(
      localUrl,
      `select concat_ws('|',
        (select current_generation_id::text from public.food_catalog_current_generation where singleton_key),
        (select exists(select 1 from public.food_catalog_activation_events where id = '${INVALIDATION_EVENT_ID}'))::text
      );`,
    );

    if (invalidationWonRace && finalState === `${GENERATION_ID}|true`) {
      throw new Error(
        "Grant invalidation committed before promotion, but the invalidated-grant candidate still became current.",
      );
    }
    if (invalidationWonRace) {
      throw new Error(`Grant invalidation committed during promotion without a serialized outcome: ${finalState}`);
    }
    if (finalState !== `${GENERATION_ID}|true`) {
      throw new Error(`Serialized promotion/invalidation did not preserve the expected final evidence: ${finalState}`);
    }
  } finally {
    cleanupFixture(localUrl);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await verifyGrantInvalidationPromotionSerialization();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
