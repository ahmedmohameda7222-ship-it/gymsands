\set ON_ERROR_STOP on

-- Deterministic non-empty governance outbox fixture for Plan 7 FULL_DR certification.
-- Disposable CI only; never a migration and never Production authority.
\set service_principal '71000000-0000-4000-8000-000000000d10'
\set service_capability '71000000-0000-4000-8000-000000000d11'
\set outbox_operation '71000000-0000-4000-8000-000000000d12'
\set outbox_event '71000000-0000-4000-8000-000000000d13'
\set outbox_lease_token '71000000-0000-4000-8000-000000000d14'

insert into public.food_catalog_governance_principals(
  id,principal_type,subject_id,service_identity_sha256,role_class,active,created_at
) values(
  :'service_principal','service','plan7-portability-service',repeat('7',64),'service',true,'2026-09-10T18:26:00Z'
);

insert into public.food_catalog_governance_capability_assignments(
  id,principal_id,capability,granted_at,reason
) values(
  :'service_capability',:'service_principal','food.outbox.deliver','2026-09-10T18:26:10Z','plan7 fixture delivery history'
);

insert into public.food_catalog_governance_operations(
  operation_id,principal_id,principal_type,capability,command_name,target_food_id,policy_version,
  reason,semantic_checksum_sha256,result_json,replay_count,last_replayed_at,created_at,completed_at
) values(
  :'outbox_operation',:'service_principal','service','food.outbox.deliver','food_catalog_outbox_deliver',
  '71000000-0000-4000-8000-000000000101'::uuid,'plan7-runtime-v1',
  'plan7 fixture durable outbox history',repeat('8',64),
  '{"queued":true,"eventType":"food.catalog.fixture.changed"}'::jsonb,2,'2026-09-10T18:26:20Z',
  '2026-09-10T18:26:15Z','2026-09-10T18:26:25Z'
);

insert into public.food_catalog_governance_outbox(
  event_id,operation_id,event_type,payload,status,attempt_count,available_at,
  claim_owner,claim_principal_id,lease_token,lease_epoch,lease_acquired_at,lease_expires_at,
  delivered_at,last_error,created_at,updated_at
) values(
  :'outbox_event',:'outbox_operation','food.catalog.fixture.changed',
  '{"foodId":"71000000-0000-4000-8000-000000000101","reason":"plan7-portability-proof","historyVersion":1}'::jsonb,
  'processing',4,'2026-09-10T18:26:30Z',
  'plan7-source-worker',:'service_principal',:'outbox_lease_token',9,
  '2026-09-10T18:26:40Z','2026-09-10T18:31:40Z',
  null,null,'2026-09-10T18:26:30Z','2026-09-10T18:26:40Z'
);

do $plan7_outbox_fixture$
begin
  if not exists(
    select 1
    from public.food_catalog_governance_outbox outbox
    join public.food_catalog_governance_operations operation
      on operation.operation_id=outbox.operation_id
    join public.food_catalog_governance_principals principal
      on principal.id=outbox.claim_principal_id
    join public.food_catalog_governance_capability_assignments capability
      on capability.principal_id=principal.id
     and capability.capability='food.outbox.deliver'
     and capability.revoked_at is null
    where outbox.event_id='71000000-0000-4000-8000-000000000d13'::uuid
      and outbox.status='processing'
      and outbox.claim_owner='plan7-source-worker'
      and outbox.claim_principal_id='71000000-0000-4000-8000-000000000d10'::uuid
      and outbox.lease_token='71000000-0000-4000-8000-000000000d14'::uuid
      and outbox.lease_epoch=9
      and outbox.attempt_count=4
      and outbox.lease_acquired_at='2026-09-10T18:26:40Z'::timestamptz
      and outbox.lease_expires_at='2026-09-10T18:31:40Z'::timestamptz
      and outbox.last_error is null
      and outbox.delivered_at is null
      and operation.capability='food.outbox.deliver'
      and principal.principal_type='service'
  ) then
    raise exception 'Plan7 source governance processing-outbox fixture was not established.';
  end if;
end
$plan7_outbox_fixture$;
