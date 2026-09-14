#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SERVICE_PRINCIPAL_ID = "71000000-0000-4000-8000-000000000d10";
const SERVICE_CAPABILITY_ID = "71000000-0000-4000-8000-000000000d11";
const OUTBOX_EVENT_ID = "71000000-0000-4000-8000-000000000d13";
const AUTHENTICATED_OWNER_ID = "71000000-0000-4000-8000-000000000001";
const TARGET_REBIND_OPERATION_ID = "71000000-0000-4000-8000-000000000d20";
const RECONCILIATION_OPERATION_ID = "71000000-0000-4000-8000-000000000d21";
const RANDOM_UNBOUND_IDENTITY = "plan7-restored-random-unbound-service";
const TARGET_SERVICE_IDENTITY = "plan7-restored-target-service-identity";

function psql(databaseUrl, sql) {
  const result = spawnSync("psql", [databaseUrl, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Restored Service authority evidence query failed: ${(result.stderr ?? "").trim()}`);
  return (result.stdout ?? "").trim().split(/\r?\n/u).filter(Boolean).at(-1) ?? "";
}

function booleanEvidence(databaseUrl, sql, label) {
  const value = psql(databaseUrl, sql);
  if (value !== "t") throw new Error(`Restored Service authority proof failed: ${label}.`);
  return true;
}

function rejectedClaimSql({ role, claims, flag }) {
  const escapedClaims = JSON.stringify(claims).replaceAll("'", "''");
  return `begin;
set local role ${role};
select set_config('request.jwt.claims','${escapedClaims}',true);
do $plan7_service_binding$
begin
  begin
    perform public.food_catalog_claim_governance_outbox('${OUTBOX_EVENT_ID}'::uuid,30);
    raise exception 'Plan7 restored Service authority unexpectedly claimed the pending event';
  exception when insufficient_privilege then
    perform set_config('${flag}','true',true);
  end;
end
$plan7_service_binding$;
select current_setting('${flag}',true)='true';
rollback;`;
}

function ownerClaimsSql(sql) {
  const claims = JSON.stringify({ role: "authenticated", sub: AUTHENTICATED_OWNER_ID }).replaceAll("'", "''");
  return `begin;
set local role authenticated;
select set_config('request.jwt.claims','${claims}',true);
${sql}
commit;`;
}

function serviceClaimsSql(sql) {
  const claims = JSON.stringify({ role: "service_role", plaivra_food_service_identity: TARGET_SERVICE_IDENTITY }).replaceAll("'", "''");
  return `begin;
set local role service_role;
select set_config('request.jwt.claims','${claims}',true);
${sql}
rollback;`;
}

export function captureRestoredServiceAuthority(databaseUrl, sourceIdentity) {
  if (typeof sourceIdentity !== "string" || sourceIdentity.length === 0) throw new Error("A non-empty source Service identity is required for restored-authority proof.");
  const escapedSourceIdentity = sourceIdentity.replaceAll("'", "''");

  const principalHistoryPreserved = booleanEvidence(databaseUrl, `select exists(
  select 1
  from public.food_catalog_governance_principals
  where id='${SERVICE_PRINCIPAL_ID}'::uuid
    and principal_type='service'
    and subject_id='plan7-portability-service'
    and human_user_id is null
    and role_class='service'
    and active is true
    and revoked_at is null
    and created_at='2026-09-10T18:26:00Z'::timestamptz
    and service_identity_sha256 ~ '^[0-9a-f]{64}$'
    and service_identity_sha256 <> encode(extensions.digest(convert_to('${escapedSourceIdentity}','UTF8'),'sha256'),'hex')
);`, "principalHistoryPreserved");

  const capabilityHistoryPreserved = booleanEvidence(databaseUrl, `select exists(
  select 1
  from public.food_catalog_governance_capability_assignments
  where id='${SERVICE_CAPABILITY_ID}'::uuid
    and principal_id='${SERVICE_PRINCIPAL_ID}'::uuid
    and capability='food.outbox.deliver'
    and granted_at='2026-09-10T18:26:10Z'::timestamptz
    and reason='plan7 fixture delivery history'
    and revoked_at is null
);`, "capabilityHistoryPreserved");

  const sourceServiceIdentityRejected = booleanEvidence(databaseUrl, rejectedClaimSql({
    role: "service_role",
    claims: { role: "service_role", plaivra_food_service_identity: sourceIdentity },
    flag: "plan7.source_service_identity_rejected",
  }), "sourceServiceIdentityRejected");

  const randomServiceIdentityRejected = booleanEvidence(databaseUrl, rejectedClaimSql({
    role: "service_role",
    claims: { role: "service_role", plaivra_food_service_identity: RANDOM_UNBOUND_IDENTITY },
    flag: "plan7.random_service_identity_rejected",
  }), "randomServiceIdentityRejected");

  const authenticatedClaimRejected = booleanEvidence(databaseUrl, rejectedClaimSql({
    role: "authenticated",
    claims: { role: "authenticated", sub: AUTHENTICATED_OWNER_ID },
    flag: "plan7.authenticated_service_claim_rejected",
  }), "authenticatedClaimRejected");

  const outboxPendingUnclaimed = booleanEvidence(databaseUrl, `select exists(
  select 1
  from public.food_catalog_governance_outbox
  where event_id='${OUTBOX_EVENT_ID}'::uuid
    and status='pending'
    and attempt_count=4
    and lease_epoch=9
    and claim_owner is null
    and claim_principal_id is null
    and lease_token is null
    and lease_acquired_at is null
    and lease_expires_at is null
    and delivered_at is null
    and last_error is null
);`, "outboxPendingUnclaimed");

  psql(databaseUrl, ownerClaimsSql(`select public.food_catalog_manage_governance_principal(
  '${TARGET_REBIND_OPERATION_ID}'::uuid,
  'service',
  'plan7-portability-service',
  'service',
  array['food.outbox.deliver']::text[],
  'Plan 7 deterministic target Service rebind',
  '${TARGET_SERVICE_IDENTITY}'
);`));

  const targetServiceRebound = booleanEvidence(databaseUrl, `select exists(
  select 1
  from public.food_catalog_governance_principals
  where id='${SERVICE_PRINCIPAL_ID}'::uuid
    and service_identity_sha256=encode(extensions.digest(convert_to('${TARGET_SERVICE_IDENTITY}','UTF8'),'sha256'),'hex')
    and active is true
    and revoked_at is null
);`, "targetServiceRebound");

  const reboundServiceRejectedBeforeReconciliation = booleanEvidence(databaseUrl, rejectedClaimSql({
    role: "service_role",
    claims: { role: "service_role", plaivra_food_service_identity: TARGET_SERVICE_IDENTITY },
    flag: "plan7.rebound_service_rejected_before_reconciliation",
  }), "reboundServiceRejectedBeforeReconciliation");

  const pendingBeforeReconciliation = booleanEvidence(databaseUrl, `select exists(
  select 1
  from public.food_catalog_governance_outbox
  where event_id='${OUTBOX_EVENT_ID}'::uuid
    and status='pending'
    and attempt_count=4
    and lease_epoch=9
    and claim_principal_id is null
    and lease_token is null
    and delivered_at is null
    and last_error is null
);`, "pendingBeforeReconciliation");

  psql(databaseUrl, ownerClaimsSql(`select public.food_catalog_complete_governance_outbox_reconciliation(
  '${RECONCILIATION_OPERATION_ID}'::uuid,
  '${SERVICE_PRINCIPAL_ID}'::uuid,
  'Plan 7 deterministic restored outbox replay reconciliation complete'
);`));

  const reconciliationReplayIdempotent = booleanEvidence(databaseUrl, ownerClaimsSql(`select (
  public.food_catalog_complete_governance_outbox_reconciliation(
    '${RECONCILIATION_OPERATION_ID}'::uuid,
    '${SERVICE_PRINCIPAL_ID}'::uuid,
    'Plan 7 deterministic restored outbox replay reconciliation complete'
  )->>'targetPrincipalId'='${SERVICE_PRINCIPAL_ID}'
);`), "reconciliationReplayIdempotent");

  const leaseAndFencingSemanticsIntact = booleanEvidence(databaseUrl, serviceClaimsSql(`do $plan7_post_reconciliation$
declare
  v_claim jsonb;
  v_finish jsonb;
  v_stale_rejected boolean:=false;
begin
  v_claim:=public.food_catalog_claim_governance_outbox('${OUTBOX_EVENT_ID}'::uuid,300);
  if (v_claim->>'claimPrincipalId') is distinct from '${SERVICE_PRINCIPAL_ID}'
     or (v_claim->>'attemptCount')::integer<>5
     or (v_claim->>'leaseEpoch')::bigint<>10
     or nullif(v_claim->>'leaseToken','') is null then
    raise exception 'Plan7 post-reconciliation claim did not preserve Plan 6 lease semantics';
  end if;
  begin
    perform public.food_catalog_finish_governance_outbox(
      '${OUTBOX_EVENT_ID}'::uuid,
      gen_random_uuid(),
      true,
      null,
      0
    );
  exception when serialization_failure then
    v_stale_rejected:=true;
  end;
  if not v_stale_rejected then
    raise exception 'Plan7 stale lease token unexpectedly bypassed fencing';
  end if;
  v_finish:=public.food_catalog_finish_governance_outbox(
    '${OUTBOX_EVENT_ID}'::uuid,
    (v_claim->>'leaseToken')::uuid,
    true,
    null,
    0
  );
  if (v_finish->>'status') is distinct from 'delivered' then
    raise exception 'Plan7 correct lease could not finish after reconciliation';
  end if;
  perform set_config('plan7.lease_and_fencing_semantics_intact','true',true);
end
$plan7_post_reconciliation$;
select current_setting('plan7.lease_and_fencing_semantics_intact',true)='true';`), "leaseAndFencingSemanticsIntact");

  const historyIntactAfterReconciliation = booleanEvidence(databaseUrl, `select
  exists(
    select 1 from public.food_catalog_governance_capability_assignments
    where id='${SERVICE_CAPABILITY_ID}'::uuid
      and principal_id='${SERVICE_PRINCIPAL_ID}'::uuid
      and capability='food.outbox.deliver'
      and granted_at='2026-09-10T18:26:10Z'::timestamptz
      and reason='plan7 fixture delivery history'
      and revoked_at is null
  )
  and exists(
    select 1 from public.food_catalog_governance_outbox
    where event_id='${OUTBOX_EVENT_ID}'::uuid
      and status='pending'
      and attempt_count=4
      and lease_epoch=9
      and claim_owner is null
      and claim_principal_id is null
      and lease_token is null
      and delivered_at is null
      and last_error is null
  )
  and exists(
    select 1 from public.food_catalog_governance_operations
    where operation_id='${RECONCILIATION_OPERATION_ID}'::uuid
      and command_name='food_catalog_complete_governance_outbox_reconciliation'
      and completed_at is not null
      and replay_count=1
      and result_json->>'targetPrincipalId'='${SERVICE_PRINCIPAL_ID}'
      and result_json->>'serviceBindingOperationId'='${TARGET_REBIND_OPERATION_ID}'
      and result_json->>'serviceBindingGeneration'='1'
  );`, "historyIntactAfterReconciliation");

  return Object.freeze({
    format: "plaivra-food-catalog-restored-service-authority-evidence",
    version: 2,
    sourceServiceIdentityRejected,
    authenticatedClaimRejected,
    randomServiceIdentityRejected,
    principalHistoryPreserved,
    capabilityHistoryPreserved,
    outboxPendingUnclaimed,
    targetServiceRebound,
    reboundServiceRejectedBeforeReconciliation,
    pendingBeforeReconciliation,
    reconciliationReplayIdempotent,
    leaseAndFencingSemanticsIntact,
    historyIntactAfterReconciliation,
    serviceExecutionBindingUnavailableImmediatelyAfterRestore: true,
    automaticDeliveryObservedBeforeReconciliation: false,
    deliveryAvailableAfterReconciliation: true,
  });
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = () => {
      const result = argv[++index];
      if (!result) throw new Error(`${value} requires a value.`);
      return result;
    };
    if (value === "--database-url") options.databaseUrl = next();
    else if (value === "--source-identity") options.sourceIdentity = next();
    else if (value === "--output") options.output = next();
    else throw new Error(`Unknown restored Service authority option ${value}.`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const databaseUrl = options.databaseUrl ?? process.env.PLAN7_RESTORE_DATABASE_URL;
  if (!databaseUrl) throw new Error("--database-url or PLAN7_RESTORE_DATABASE_URL is required.");
  if (!options.sourceIdentity) throw new Error("--source-identity is required.");
  const evidence = captureRestoredServiceAuthority(databaseUrl, options.sourceIdentity);
  if (options.output) await writeFile(resolve(options.output), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
