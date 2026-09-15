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
const WRONG_RECONCILIATION_OPERATION_ID = "71000000-0000-4000-8000-000000000d22";
const TARGET_ROTATION_OPERATION_ID = "71000000-0000-4000-8000-000000000d23";
const ROTATED_RECONCILIATION_OPERATION_ID = "71000000-0000-4000-8000-000000000d24";
const WRONG_PRINCIPAL_ID = "71000000-0000-4000-8000-000000000d99";
const RANDOM_UNBOUND_IDENTITY = "plan7-restored-random-unbound-service";
const TARGET_SERVICE_IDENTITY = "plan7-restored-target-service-identity";
const ROTATED_SERVICE_IDENTITY = "plan7-restored-rotated-service-identity";

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

function reconciliationLifecycleSql() {
  const ownerClaims = JSON.stringify({ role: "authenticated", sub: AUTHENTICATED_OWNER_ID }).replaceAll("'", "''");
  const serviceClaims = JSON.stringify({ role: "service_role", plaivra_food_service_identity: TARGET_SERVICE_IDENTITY }).replaceAll("'", "''");
  const rotatedServiceClaims = JSON.stringify({ role: "service_role", plaivra_food_service_identity: ROTATED_SERVICE_IDENTITY }).replaceAll("'", "''");
  return `begin;

set local role authenticated;
select set_config('request.jwt.claims','${ownerClaims}',true);
select public.food_catalog_manage_governance_principal(
  '${TARGET_REBIND_OPERATION_ID}'::uuid,
  'service',
  'plan7-portability-service',
  'service',
  array['food.outbox.deliver']::text[],
  'Plan 7 deterministic target Service rebind',
  '${TARGET_SERVICE_IDENTITY}'
);

reset role;
do $plan7_rebind_proof$
begin
  if not exists(
    select 1
    from public.food_catalog_governance_principals
    where id='${SERVICE_PRINCIPAL_ID}'::uuid
      and service_identity_sha256=encode(extensions.digest(convert_to('${TARGET_SERVICE_IDENTITY}','UTF8'),'sha256'),'hex')
      and active is true
      and revoked_at is null
  ) then
    raise exception 'Plan7 target Service rebind did not update the execution binding';
  end if;
  if not exists(
    select 1
    from public.food_catalog_governance_operations
    where operation_id='${TARGET_REBIND_OPERATION_ID}'::uuid
      and completed_at is not null
      and result_json->>'principalId'='${SERVICE_PRINCIPAL_ID}'
      and result_json->>'serviceBindingChanged'='true'
      and result_json->>'serviceBindingOperationId'='${TARGET_REBIND_OPERATION_ID}'
      and result_json->>'serviceBindingGeneration'='1'
  ) then
    raise exception 'Plan7 target Service rebind did not establish binding generation 1';
  end if;
  perform set_config('plan7.target_service_rebound','true',true);
end
$plan7_rebind_proof$;

set local role service_role;
select set_config('request.jwt.claims','${serviceClaims}',true);
do $plan7_pre_reconciliation_claim$
begin
  begin
    perform public.food_catalog_claim_governance_outbox('${OUTBOX_EVENT_ID}'::uuid,30);
    raise exception 'Plan7 rebound Service unexpectedly claimed before reconciliation';
  exception when insufficient_privilege then
    perform set_config('plan7.rebound_service_rejected_before_reconciliation','true',true);
  end;
end
$plan7_pre_reconciliation_claim$;

reset role;
do $plan7_pending_before_reconciliation$
begin
  if not exists(
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
  ) then
    raise exception 'Plan7 pending outbox state changed before reconciliation';
  end if;
  perform set_config('plan7.pending_before_reconciliation','true',true);
end
$plan7_pending_before_reconciliation$;

set local role authenticated;
select set_config('request.jwt.claims','${ownerClaims}',true);
do $plan7_wrong_principal_reconciliation$
begin
  begin
    perform public.food_catalog_complete_governance_outbox_reconciliation(
      '${WRONG_RECONCILIATION_OPERATION_ID}'::uuid,
      '${WRONG_PRINCIPAL_ID}'::uuid,
      'Plan 7 wrong-principal reconciliation must fail'
    );
    raise exception 'Plan7 wrong principal reconciliation unexpectedly succeeded';
  exception when foreign_key_violation then
    perform set_config('plan7.wrong_principal_reconciliation_rejected','true',true);
  end;
end
$plan7_wrong_principal_reconciliation$;

select public.food_catalog_complete_governance_outbox_reconciliation(
  '${RECONCILIATION_OPERATION_ID}'::uuid,
  '${SERVICE_PRINCIPAL_ID}'::uuid,
  'Plan 7 deterministic restored outbox replay reconciliation complete'
);
select public.food_catalog_complete_governance_outbox_reconciliation(
  '${RECONCILIATION_OPERATION_ID}'::uuid,
  '${SERVICE_PRINCIPAL_ID}'::uuid,
  'Plan 7 deterministic restored outbox replay reconciliation complete'
);

reset role;
do $plan7_reconciliation_replay$
begin
  if not exists(
    select 1
    from public.food_catalog_governance_operations
    where operation_id='${RECONCILIATION_OPERATION_ID}'::uuid
      and command_name='food_catalog_complete_governance_outbox_reconciliation'
      and completed_at is not null
      and replay_count=1
      and result_json->>'targetPrincipalId'='${SERVICE_PRINCIPAL_ID}'
      and result_json->>'serviceBindingOperationId'='${TARGET_REBIND_OPERATION_ID}'
      and result_json->>'serviceBindingGeneration'='1'
  ) then
    raise exception 'Plan7 reconciliation replay was not idempotent for the current binding';
  end if;
  perform set_config('plan7.reconciliation_replay_idempotent','true',true);
end
$plan7_reconciliation_replay$;

set local role service_role;
select set_config('request.jwt.claims','${serviceClaims}',true);
do $plan7_post_reconciliation$
declare
  v_claim jsonb;
  v_finish jsonb;
  v_attempt_incremented boolean:=false;
  v_epoch_incremented boolean:=false;
  v_stale_rejected boolean:=false;
begin
  begin
    v_claim:=public.food_catalog_claim_governance_outbox('${OUTBOX_EVENT_ID}'::uuid,300);
    v_attempt_incremented:=(v_claim->>'attemptCount')::integer=5;
    v_epoch_incremented:=(v_claim->>'leaseEpoch')::bigint=10;
    if (v_claim->>'claimPrincipalId') is distinct from '${SERVICE_PRINCIPAL_ID}'
       or not v_attempt_incremented
       or not v_epoch_incremented
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

    -- Deliberately abort only the claim/finish subtransaction. This proves the
    -- real Plan 6 lease/fencing path without writing fake durable delivery.
    raise exception 'rollback successful Plan7 lease proof' using errcode='PZ701';
  exception when sqlstate 'PZ701' then
    if not v_attempt_incremented or not v_epoch_incremented or not v_stale_rejected then
      raise exception 'Plan7 lease proof flags were not preserved across the rollback-only subtransaction';
    end if;
    perform set_config('plan7.current_binding_reconciliation_claim_succeeded','true',true);
    perform set_config('plan7.attempt_count_incremented','true',true);
    perform set_config('plan7.lease_epoch_incremented','true',true);
    perform set_config('plan7.stale_lease_finish_rejected','true',true);
    perform set_config('plan7.lease_and_fencing_semantics_intact','true',true);
    perform set_config('plan7.delivery_available_after_reconciliation','true',true);
  end;
end
$plan7_post_reconciliation$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims','${ownerClaims}',true);
select public.food_catalog_manage_governance_principal(
  '${TARGET_ROTATION_OPERATION_ID}'::uuid,
  'service',
  'plan7-portability-service',
  'service',
  array['food.outbox.deliver']::text[],
  'Plan 7 deterministic target Service credential rotation',
  '${ROTATED_SERVICE_IDENTITY}'
);

reset role;
do $plan7_rotation_proof$
begin
  if not exists(
    select 1
    from public.food_catalog_governance_principals
    where id='${SERVICE_PRINCIPAL_ID}'::uuid
      and service_identity_sha256=encode(extensions.digest(convert_to('${ROTATED_SERVICE_IDENTITY}','UTF8'),'sha256'),'hex')
      and active is true
      and revoked_at is null
  ) then
    raise exception 'Plan7 Service credential rotation did not update the execution binding';
  end if;
  if not exists(
    select 1
    from public.food_catalog_governance_operations
    where operation_id='${TARGET_ROTATION_OPERATION_ID}'::uuid
      and completed_at is not null
      and result_json->>'principalId'='${SERVICE_PRINCIPAL_ID}'
      and result_json->>'serviceBindingChanged'='true'
      and result_json->>'serviceBindingOperationId'='${TARGET_ROTATION_OPERATION_ID}'
      and result_json->>'serviceBindingGeneration'='2'
  ) then
    raise exception 'Plan7 Service credential rotation did not establish binding generation 2';
  end if;
  perform set_config('plan7.rotated_service_rebound','true',true);
end
$plan7_rotation_proof$;

set local role service_role;
select set_config('request.jwt.claims','${serviceClaims}',true);
do $plan7_previous_identity_after_rotation$
begin
  begin
    perform public.food_catalog_claim_governance_outbox('${OUTBOX_EVENT_ID}'::uuid,30);
    raise exception 'Plan7 previous Service identity unexpectedly authorized after rotation';
  exception when insufficient_privilege then
    perform set_config('plan7.previous_service_identity_rejected_after_rotation','true',true);
  end;
end
$plan7_previous_identity_after_rotation$;

reset role;
set local role service_role;
select set_config('request.jwt.claims','${rotatedServiceClaims}',true);
do $plan7_rotated_pre_reconciliation$
begin
  if not exists(
    select 1
    from public.food_catalog_governance_operations
    where operation_id='${RECONCILIATION_OPERATION_ID}'::uuid
      and completed_at is not null
      and result_json->>'serviceBindingOperationId'='${TARGET_REBIND_OPERATION_ID}'
      and result_json->>'serviceBindingGeneration'='1'
  ) then
    raise exception 'Plan7 generation 1 reconciliation history disappeared before rotation proof';
  end if;
  begin
    perform public.food_catalog_claim_governance_outbox('${OUTBOX_EVENT_ID}'::uuid,30);
    raise exception 'Plan7 rotated Service unexpectedly claimed before generation 2 reconciliation';
  exception when insufficient_privilege then
    perform set_config('plan7.previous_binding_reconciliation_ineffective','true',true);
    perform set_config('plan7.rotated_service_rejected_before_reconciliation','true',true);
    perform set_config('plan7.rotation_invalidated_prior_reconciliation','true',true);
  end;
end
$plan7_rotated_pre_reconciliation$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims','${ownerClaims}',true);
select public.food_catalog_complete_governance_outbox_reconciliation(
  '${ROTATED_RECONCILIATION_OPERATION_ID}'::uuid,
  '${SERVICE_PRINCIPAL_ID}'::uuid,
  'Plan 7 generation 2 restored outbox replay reconciliation complete'
);
select public.food_catalog_complete_governance_outbox_reconciliation(
  '${ROTATED_RECONCILIATION_OPERATION_ID}'::uuid,
  '${SERVICE_PRINCIPAL_ID}'::uuid,
  'Plan 7 generation 2 restored outbox replay reconciliation complete'
);

reset role;
do $plan7_rotated_reconciliation_replay$
begin
  if not exists(
    select 1
    from public.food_catalog_governance_operations
    where operation_id='${ROTATED_RECONCILIATION_OPERATION_ID}'::uuid
      and command_name='food_catalog_complete_governance_outbox_reconciliation'
      and completed_at is not null
      and replay_count=1
      and result_json->>'targetPrincipalId'='${SERVICE_PRINCIPAL_ID}'
      and result_json->>'serviceBindingOperationId'='${TARGET_ROTATION_OPERATION_ID}'
      and result_json->>'serviceBindingGeneration'='2'
  ) then
    raise exception 'Plan7 generation 2 reconciliation replay was not idempotent';
  end if;
  perform set_config('plan7.rotated_reconciliation_replay_idempotent','true',true);
end
$plan7_rotated_reconciliation_replay$;

set local role service_role;
select set_config('request.jwt.claims','${rotatedServiceClaims}',true);
do $plan7_rotated_post_reconciliation$
declare
  v_claim jsonb;
  v_finish jsonb;
  v_stale_rejected boolean:=false;
begin
  begin
    v_claim:=public.food_catalog_claim_governance_outbox('${OUTBOX_EVENT_ID}'::uuid,300);
    if (v_claim->>'claimPrincipalId') is distinct from '${SERVICE_PRINCIPAL_ID}'
       or (v_claim->>'attemptCount')::integer<>5
       or (v_claim->>'leaseEpoch')::bigint<>10
       or nullif(v_claim->>'leaseToken','') is null then
      raise exception 'Plan7 rotated post-reconciliation claim did not preserve Plan 6 lease semantics';
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
      raise exception 'Plan7 rotated stale lease token unexpectedly bypassed fencing';
    end if;

    v_finish:=public.food_catalog_finish_governance_outbox(
      '${OUTBOX_EVENT_ID}'::uuid,
      (v_claim->>'leaseToken')::uuid,
      true,
      null,
      0
    );
    if (v_finish->>'status') is distinct from 'delivered' then
      raise exception 'Plan7 rotated correct lease could not finish after reconciliation';
    end if;

    raise exception 'rollback successful Plan7 rotated lease proof' using errcode='PZ702';
  exception when sqlstate 'PZ702' then
    if not v_stale_rejected then
      raise exception 'Plan7 rotated stale-lease rejection flag was not preserved';
    end if;
    perform set_config('plan7.rotated_binding_reconciliation_claim_succeeded','true',true);
    perform set_config('plan7.delivery_available_after_rotated_reconciliation','true',true);
  end;
end
$plan7_rotated_post_reconciliation$;

reset role;
select json_build_object(
  'targetServiceRebound',current_setting('plan7.target_service_rebound',true)='true',
  'reboundServiceRejectedBeforeReconciliation',current_setting('plan7.rebound_service_rejected_before_reconciliation',true)='true',
  'pendingBeforeReconciliation',current_setting('plan7.pending_before_reconciliation',true)='true',
  'wrongPrincipalReconciliationRejected',current_setting('plan7.wrong_principal_reconciliation_rejected',true)='true',
  'reconciliationReplayIdempotent',current_setting('plan7.reconciliation_replay_idempotent',true)='true',
  'currentBindingReconciliationClaimSucceeded',current_setting('plan7.current_binding_reconciliation_claim_succeeded',true)='true',
  'attemptCountIncremented',current_setting('plan7.attempt_count_incremented',true)='true',
  'leaseEpochIncremented',current_setting('plan7.lease_epoch_incremented',true)='true',
  'staleLeaseFinishRejected',current_setting('plan7.stale_lease_finish_rejected',true)='true',
  'leaseAndFencingSemanticsIntact',current_setting('plan7.lease_and_fencing_semantics_intact',true)='true',
  'deliveryAvailableAfterReconciliation',current_setting('plan7.delivery_available_after_reconciliation',true)='true',
  'rotatedServiceRebound',current_setting('plan7.rotated_service_rebound',true)='true',
  'previousServiceIdentityRejectedAfterRotation',current_setting('plan7.previous_service_identity_rejected_after_rotation',true)='true',
  'previousBindingReconciliationIneffective',current_setting('plan7.previous_binding_reconciliation_ineffective',true)='true',
  'rotatedServiceRejectedBeforeReconciliation',current_setting('plan7.rotated_service_rejected_before_reconciliation',true)='true',
  'rotationInvalidatedPriorReconciliation',current_setting('plan7.rotation_invalidated_prior_reconciliation',true)='true',
  'rotatedReconciliationReplayIdempotent',current_setting('plan7.rotated_reconciliation_replay_idempotent',true)='true',
  'rotatedBindingReconciliationClaimSucceeded',current_setting('plan7.rotated_binding_reconciliation_claim_succeeded',true)='true',
  'deliveryAvailableAfterRotatedReconciliation',current_setting('plan7.delivery_available_after_rotated_reconciliation',true)='true',
  'historyIntactAfterReconciliation',
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
        and lease_acquired_at is null
        and lease_expires_at is null
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
    )
    and exists(
      select 1 from public.food_catalog_governance_operations
      where operation_id='${ROTATED_RECONCILIATION_OPERATION_ID}'::uuid
        and command_name='food_catalog_complete_governance_outbox_reconciliation'
        and completed_at is not null
        and replay_count=1
        and result_json->>'targetPrincipalId'='${SERVICE_PRINCIPAL_ID}'
        and result_json->>'serviceBindingOperationId'='${TARGET_ROTATION_OPERATION_ID}'
        and result_json->>'serviceBindingGeneration'='2'
    )
)::text;

-- Rebind/reconciliation are deliberately simulated in one transaction so the
-- subsequent FULL_DR readback still compares the restored source authority
-- exactly. Production calls remain durable because the functions themselves
-- write the canonical governance operation/audit/outbox ledger normally.
rollback;`;
}

function requireLifecycleBoolean(value, field) {
  if (value?.[field] !== true) throw new Error(`Restored Service reconciliation lifecycle proof failed: ${field}.`);
  return true;
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

  let lifecycle;
  try {
    lifecycle = JSON.parse(psql(databaseUrl, reconciliationLifecycleSql()));
  } catch (error) {
    throw new Error(`Restored Service reconciliation lifecycle evidence failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }

  const targetServiceRebound = requireLifecycleBoolean(lifecycle, "targetServiceRebound");
  const reboundServiceRejectedBeforeReconciliation = requireLifecycleBoolean(lifecycle, "reboundServiceRejectedBeforeReconciliation");
  const pendingBeforeReconciliation = requireLifecycleBoolean(lifecycle, "pendingBeforeReconciliation");
  const wrongPrincipalReconciliationRejected = requireLifecycleBoolean(lifecycle, "wrongPrincipalReconciliationRejected");
  const reconciliationReplayIdempotent = requireLifecycleBoolean(lifecycle, "reconciliationReplayIdempotent");
  const currentBindingReconciliationClaimSucceeded = requireLifecycleBoolean(lifecycle, "currentBindingReconciliationClaimSucceeded");
  const attemptCountIncremented = requireLifecycleBoolean(lifecycle, "attemptCountIncremented");
  const leaseEpochIncremented = requireLifecycleBoolean(lifecycle, "leaseEpochIncremented");
  const staleLeaseFinishRejected = requireLifecycleBoolean(lifecycle, "staleLeaseFinishRejected");
  const leaseAndFencingSemanticsIntact = requireLifecycleBoolean(lifecycle, "leaseAndFencingSemanticsIntact");
  const deliveryAvailableAfterReconciliation = requireLifecycleBoolean(lifecycle, "deliveryAvailableAfterReconciliation");
  const rotatedServiceRebound = requireLifecycleBoolean(lifecycle, "rotatedServiceRebound");
  const previousServiceIdentityRejectedAfterRotation = requireLifecycleBoolean(lifecycle, "previousServiceIdentityRejectedAfterRotation");
  const previousBindingReconciliationIneffective = requireLifecycleBoolean(lifecycle, "previousBindingReconciliationIneffective");
  const rotatedServiceRejectedBeforeReconciliation = requireLifecycleBoolean(lifecycle, "rotatedServiceRejectedBeforeReconciliation");
  const rotationInvalidatedPriorReconciliation = requireLifecycleBoolean(lifecycle, "rotationInvalidatedPriorReconciliation");
  const rotatedReconciliationReplayIdempotent = requireLifecycleBoolean(lifecycle, "rotatedReconciliationReplayIdempotent");
  const rotatedBindingReconciliationClaimSucceeded = requireLifecycleBoolean(lifecycle, "rotatedBindingReconciliationClaimSucceeded");
  const deliveryAvailableAfterRotatedReconciliation = requireLifecycleBoolean(lifecycle, "deliveryAvailableAfterRotatedReconciliation");
  const historyIntactAfterReconciliation = requireLifecycleBoolean(lifecycle, "historyIntactAfterReconciliation");

  const proofTransactionRolledBack = booleanEvidence(databaseUrl, `select
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
        and lease_acquired_at is null
        and lease_expires_at is null
        and delivered_at is null
        and last_error is null
    )
    and not exists(
      select 1 from public.food_catalog_governance_operations
      where operation_id in (
        '${TARGET_REBIND_OPERATION_ID}'::uuid,
        '${RECONCILIATION_OPERATION_ID}'::uuid,
        '${WRONG_RECONCILIATION_OPERATION_ID}'::uuid,
        '${TARGET_ROTATION_OPERATION_ID}'::uuid,
        '${ROTATED_RECONCILIATION_OPERATION_ID}'::uuid
      )
    )
    and exists(
      select 1 from public.food_catalog_governance_principals
      where id='${SERVICE_PRINCIPAL_ID}'::uuid
        and service_identity_sha256<>encode(extensions.digest(convert_to('${TARGET_SERVICE_IDENTITY}','UTF8'),'sha256'),'hex')
        and service_identity_sha256<>encode(extensions.digest(convert_to('${ROTATED_SERVICE_IDENTITY}','UTF8'),'sha256'),'hex')
    );`, "proofTransactionRolledBack");

  return Object.freeze({
    format: "plaivra-food-catalog-restored-service-authority-evidence",
    version: 3,
    sourceServiceIdentityRejected,
    authenticatedClaimRejected,
    randomServiceIdentityRejected,
    principalHistoryPreserved,
    capabilityHistoryPreserved,
    outboxPendingUnclaimed,
    targetServiceRebound,
    reboundServiceRejectedBeforeReconciliation,
    pendingBeforeReconciliation,
    wrongPrincipalReconciliationRejected,
    reconciliationReplayIdempotent,
    currentBindingReconciliationClaimSucceeded,
    attemptCountIncremented,
    leaseEpochIncremented,
    staleLeaseFinishRejected,
    leaseAndFencingSemanticsIntact,
    deliveryAvailableAfterReconciliation,
    rotatedServiceRebound,
    previousServiceIdentityRejectedAfterRotation,
    previousBindingReconciliationIneffective,
    rotatedServiceRejectedBeforeReconciliation,
    rotationInvalidatedPriorReconciliation,
    rotatedReconciliationReplayIdempotent,
    rotatedBindingReconciliationClaimSucceeded,
    deliveryAvailableAfterRotatedReconciliation,
    historyIntactAfterReconciliation,
    proofTransactionRolledBack,
    serviceExecutionBindingUnavailableImmediatelyAfterRestore: true,
    automaticDeliveryObservedBeforeReconciliation: false,
    // Backward-compatible aliases consumed by the existing integrated verifier;
    // the capture itself now blocks unless the full v3 lifecycle above passes.
    serviceExecutionBindingUnavailable: true,
    automaticDeliveryObserved: false,
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