begin;

-- Plan 7 Workstream 1: a Service credential rebind is not replay readiness.
-- Reuse the canonical immutable governance operation ledger as the durable gate:
-- each actual Service binding change advances a per-principal generation, and
-- outbox delivery is unavailable until an Owner completes reconciliation for
-- that exact binding operation + generation. No historical capability row is
-- revoked or rewritten, and no environment credential is copied into history.

create or replace function public.food_catalog_manage_governance_principal(
  p_operation_id uuid,p_target_principal_type text,p_target_subject_id text,p_role_class text,p_capabilities text[],p_reason text,p_service_identity text default null
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_actor uuid; v_target uuid; v_existing_role text; v_replay jsonb; v_cap text;
  v_result jsonb; v_service_hash text; v_policy text; v_human_user uuid; v_subject text;
  v_existing_service_hash text; v_service_binding_changed boolean:=false; v_service_binding_generation bigint;
begin
  v_actor:=private.food_catalog_governance_principal_for_user();
  v_policy:=private.food_catalog_governance_current_policy_version();
  if p_target_principal_type not in ('human','service') or length(btrim(coalesce(p_target_subject_id,'')))=0 then
    raise exception 'Invalid governance principal identity.' using errcode='22023';
  end if;
  if (p_target_principal_type='service' and (p_role_class<>'service' or length(btrim(coalesce(p_service_identity,'')))=0))
     or (p_target_principal_type='human' and p_role_class not in ('owner','curator')) then
    raise exception 'Governance principal role/type or service identity is invalid.' using errcode='23514';
  end if;

  if p_target_principal_type='human' then
    begin
      v_human_user:=btrim(p_target_subject_id)::uuid;
    exception when invalid_text_representation then
      raise exception 'Human governance principal subject must be an Auth user UUID.' using errcode='22023';
    end;
    v_subject:=v_human_user::text;
    v_service_hash:=null;
  else
    v_human_user:=null;
    v_subject:=btrim(p_target_subject_id);
    v_service_hash:=encode(extensions.digest(convert_to(btrim(coalesce(p_service_identity,'')),'UTF8'),'sha256'),'hex');
  end if;

  perform private.food_catalog_governance_lock_recovery_set();
  if p_target_principal_type='human' then
    perform 1
    from auth.users auth_user
    join public.account_access_states access_state
      on access_state.user_id=auth_user.id
     and access_state.state='active'
     and access_state.disabled_at is null
    where auth_user.id=v_human_user;
    if not found then
      raise exception 'Human governance principal requires an existing active, non-disabled Auth account.' using errcode='42501';
    end if;
  end if;

  v_replay:=private.food_catalog_governance_begin_operation(
    p_operation_id,v_actor,'food.governance.manage_principals','food_catalog_manage_governance_principal',
    null,null,v_policy,p_reason,
    jsonb_build_object('principalType',p_target_principal_type,'subjectId',v_subject,'roleClass',p_role_class,
      'capabilities',to_jsonb(coalesce(p_capabilities,'{}'::text[])),'serviceIdentitySha256',v_service_hash)
  );
  if v_replay is not null then return v_replay; end if;

  select id,role_class,service_identity_sha256 into v_target,v_existing_role,v_existing_service_hash
  from public.food_catalog_governance_principals
  where principal_type=p_target_principal_type and subject_id=v_subject
  for update;

  v_service_binding_changed:=p_target_principal_type='service'
    and (v_target is null or v_existing_service_hash is distinct from v_service_hash);

  if v_target is not null and v_existing_role='owner' and p_role_class<>'owner' then
    perform private.food_catalog_governance_assert_recovery_survives(v_target);
  end if;

  insert into public.food_catalog_governance_principals(principal_type,subject_id,human_user_id,service_identity_sha256,role_class,active,revoked_at)
  values(p_target_principal_type,v_subject,v_human_user,v_service_hash,p_role_class,true,null)
  on conflict(principal_type,subject_id) do update
    set human_user_id=excluded.human_user_id,service_identity_sha256=excluded.service_identity_sha256,role_class=excluded.role_class,active=true,revoked_at=null
  returning id into v_target;

  if p_role_class<>'owner' then
    update public.food_catalog_governance_capability_assignments
    set revoked_at=clock_timestamp(),revoked_by_principal_id=v_actor
    where principal_id=v_target and capability='food.governance.manage_principals' and revoked_at is null;
  end if;
  foreach v_cap in array coalesce(p_capabilities,'{}'::text[]) loop
    if v_cap='food.governance.manage_principals' and p_role_class<>'owner' then
      raise exception 'Only Owner principals may receive principal management capability.' using errcode='23514';
    end if;
    if p_target_principal_type='service' and v_cap not in ('food.correction.report','food.evidence.attach','food.ingestion.propose','food.outbox.deliver') then
      raise exception 'Service principal governance escalation is forbidden.' using errcode='23514';
    end if;
    if v_cap='food.outbox.deliver' and p_target_principal_type<>'service' then
      raise exception 'Governance outbox delivery capability is Service-principal-only.' using errcode='23514';
    end if;
    insert into public.food_catalog_governance_capability_assignments(principal_id,capability,granted_by_principal_id,reason)
    values(v_target,v_cap,v_actor,btrim(p_reason))
    on conflict(principal_id,capability) where revoked_at is null do nothing;
  end loop;
  perform private.food_catalog_governance_assert_recovery_exists();

  v_result:=jsonb_build_object(
    'principalId',v_target,
    'principalType',p_target_principal_type,
    'roleClass',p_role_class,
    'serviceBindingChanged',v_service_binding_changed
  );

  if v_service_binding_changed then
    select coalesce(max(binding_generation),0)+1
    into v_service_binding_generation
    from (
      select case
        when coalesce(o.result_json->>'serviceBindingGeneration','') ~ '^[1-9][0-9]{0,17}$'
          then (o.result_json->>'serviceBindingGeneration')::bigint
        else null
      end as binding_generation
      from public.food_catalog_governance_operations o
      where o.command_name='food_catalog_manage_governance_principal'
        and o.completed_at is not null
        and o.result_json->>'principalId'=v_target::text
        and o.result_json->>'serviceBindingChanged'='true'
    ) prior_bindings
    where binding_generation is not null;

    v_result:=v_result || jsonb_build_object(
      'serviceBindingOperationId',p_operation_id,
      'serviceBindingGeneration',v_service_binding_generation
    );
  end if;

  return private.food_catalog_governance_finish_operation(
    p_operation_id,null,v_target,'{}'::uuid[],v_result,'food.governance.principal.managed',jsonb_build_object('principalId',v_target)
  );
end
$function$;

create or replace function private.food_catalog_governance_assert_outbox_reconciliation_ready(p_principal_id uuid)
returns void language plpgsql security definer set search_path='' as $function$
declare
  v_locked_principal uuid;
  v_binding_operation_id uuid;
  v_binding_generation bigint;
begin
  select p.id into v_locked_principal
  from public.food_catalog_governance_principals p
  where p.id=p_principal_id
    and p.principal_type='service'
    and p.active
    and p.revoked_at is null
  for share;
  if not found then
    raise exception 'Food governance Service principal is inactive or unknown.' using errcode='42501';
  end if;

  select binding.operation_id,binding.binding_generation
  into v_binding_operation_id,v_binding_generation
  from (
    select o.operation_id,
      case
        when coalesce(o.result_json->>'serviceBindingGeneration','') ~ '^[1-9][0-9]{0,17}$'
          then (o.result_json->>'serviceBindingGeneration')::bigint
        else null
      end as binding_generation
    from public.food_catalog_governance_operations o
    where o.command_name='food_catalog_manage_governance_principal'
      and o.completed_at is not null
      and o.result_json->>'principalId'=p_principal_id::text
      and o.result_json->>'serviceBindingChanged'='true'
  ) binding
  where binding.binding_generation is not null
  order by binding.binding_generation desc,binding.operation_id desc
  limit 1;

  -- Legacy/pre-Plan-7 Service bindings have no generation tag. Their existing
  -- Plan 6 behavior is preserved until the credential is actually changed.
  if v_binding_operation_id is null then return; end if;

  if not exists(
    select 1
    from public.food_catalog_governance_operations reconciliation
    where reconciliation.command_name='food_catalog_complete_governance_outbox_reconciliation'
      and reconciliation.completed_at is not null
      and reconciliation.result_json->>'targetPrincipalId'=p_principal_id::text
      and reconciliation.result_json->>'serviceBindingOperationId'=v_binding_operation_id::text
      and reconciliation.result_json->>'serviceBindingGeneration'=v_binding_generation::text
  ) then
    raise exception 'Food governance outbox delivery is unavailable until replay reconciliation completes for the current Service binding.' using errcode='42501';
  end if;
end
$function$;

create or replace function public.food_catalog_complete_governance_outbox_reconciliation(
  p_operation_id uuid,
  p_target_principal_id uuid,
  p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_actor uuid;
  v_policy text;
  v_target uuid;
  v_binding_operation_id uuid;
  v_binding_generation bigint;
  v_replay jsonb;
  v_result jsonb;
begin
  v_actor:=private.food_catalog_governance_principal_for_user();
  perform private.food_catalog_governance_assert_capability(v_actor,'food.governance.manage_principals');
  v_policy:=private.food_catalog_governance_current_policy_version();

  select p.id into v_target
  from public.food_catalog_governance_principals p
  where p.id=p_target_principal_id
    and p.principal_type='service'
    and p.role_class='service'
    and p.active
    and p.revoked_at is null
  for share;
  if not found then
    raise exception 'Replay reconciliation requires an active Service governance principal.' using errcode='23503';
  end if;

  if not exists(
    select 1
    from public.food_catalog_governance_capability_assignments assignment
    where assignment.principal_id=v_target
      and assignment.capability='food.outbox.deliver'
      and assignment.revoked_at is null
  ) then
    raise exception 'Replay reconciliation requires active food.outbox.deliver historical authority.' using errcode='42501';
  end if;

  select binding.operation_id,binding.binding_generation
  into v_binding_operation_id,v_binding_generation
  from (
    select o.operation_id,
      case
        when coalesce(o.result_json->>'serviceBindingGeneration','') ~ '^[1-9][0-9]{0,17}$'
          then (o.result_json->>'serviceBindingGeneration')::bigint
        else null
      end as binding_generation
    from public.food_catalog_governance_operations o
    where o.command_name='food_catalog_manage_governance_principal'
      and o.completed_at is not null
      and o.result_json->>'principalId'=v_target::text
      and o.result_json->>'serviceBindingChanged'='true'
  ) binding
  where binding.binding_generation is not null
  order by binding.binding_generation desc,binding.operation_id desc
  limit 1;

  if v_binding_operation_id is null then
    raise exception 'Replay reconciliation requires a completed target-local Service credential binding.' using errcode='42501';
  end if;

  v_replay:=private.food_catalog_governance_begin_operation(
    p_operation_id,
    v_actor,
    'food.governance.manage_principals',
    'food_catalog_complete_governance_outbox_reconciliation',
    null,
    null,
    v_policy,
    p_reason,
    jsonb_build_object(
      'targetPrincipalId',v_target,
      'serviceBindingOperationId',v_binding_operation_id,
      'serviceBindingGeneration',v_binding_generation
    )
  );
  if v_replay is not null then return v_replay; end if;

  v_result:=jsonb_build_object(
    'targetPrincipalId',v_target,
    'serviceBindingOperationId',v_binding_operation_id,
    'serviceBindingGeneration',v_binding_generation
  );

  return private.food_catalog_governance_finish_operation(
    p_operation_id,
    null,
    v_target,
    '{}'::uuid[],
    v_result,
    'food.governance.outbox.reconciliation_completed',
    v_result
  );
end
$function$;

create or replace function public.food_catalog_claim_governance_outbox(p_event_id uuid,p_lease_seconds integer default 300)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_row public.food_catalog_governance_outbox%rowtype; v_token uuid:=gen_random_uuid(); v_actor uuid;
begin
  v_actor:=private.food_catalog_governance_service_principal_for_request();
  perform private.food_catalog_governance_assert_capability(v_actor,'food.outbox.deliver');
  perform private.food_catalog_governance_assert_outbox_reconciliation_ready(v_actor);
  if p_lease_seconds not between 1 and 3600 then raise exception 'Governance outbox lease is invalid.' using errcode='22023'; end if;
  update public.food_catalog_governance_outbox set status='processing',attempt_count=attempt_count+1,claim_owner=v_actor::text,claim_principal_id=v_actor,lease_token=v_token,lease_epoch=lease_epoch+1,lease_acquired_at=clock_timestamp(),lease_expires_at=clock_timestamp()+make_interval(secs=>p_lease_seconds),updated_at=clock_timestamp(),last_error=null
  where event_id=p_event_id and available_at<=clock_timestamp() and (status in ('pending','failed') or (status='processing' and lease_expires_at<=clock_timestamp())) returning * into v_row;
  if not found then raise exception 'Governance outbox event is not claimable.' using errcode='40001'; end if;
  return jsonb_build_object('eventId',v_row.event_id,'eventType',v_row.event_type,'payload',v_row.payload,'attemptCount',v_row.attempt_count,'claimOwner',v_row.claim_owner,'claimPrincipalId',v_row.claim_principal_id,'leaseToken',v_row.lease_token,'leaseEpoch',v_row.lease_epoch,'leaseExpiresAt',v_row.lease_expires_at);
end
$function$;

create or replace function public.food_catalog_finish_governance_outbox(p_event_id uuid,p_lease_token uuid,p_delivered boolean,p_error text default null,p_retry_after_seconds integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_row public.food_catalog_governance_outbox%rowtype; v_actor uuid;
begin
  v_actor:=private.food_catalog_governance_service_principal_for_request();
  perform private.food_catalog_governance_assert_capability(v_actor,'food.outbox.deliver');
  perform private.food_catalog_governance_assert_outbox_reconciliation_ready(v_actor);
  if p_lease_token is null or p_retry_after_seconds not between 0 and 86400 then raise exception 'Governance outbox finish lease/retry is invalid.' using errcode='22023'; end if;
  update public.food_catalog_governance_outbox set status=case when p_delivered then 'delivered' else 'failed' end,delivered_at=case when p_delivered then clock_timestamp() else null end,last_error=case when p_delivered then null else nullif(btrim(coalesce(p_error,'')),'') end,available_at=case when p_delivered then available_at else clock_timestamp()+make_interval(secs=>p_retry_after_seconds) end,claim_owner=null,claim_principal_id=null,lease_token=null,lease_acquired_at=null,lease_expires_at=null,updated_at=clock_timestamp()
  where event_id=p_event_id and status='processing' and claim_principal_id=v_actor and lease_token=p_lease_token and lease_expires_at>clock_timestamp() returning * into v_row;
  if not found then raise exception 'Governance outbox lease is stale, expired, owned by another Service principal, or not processing.' using errcode='40001'; end if;
  return jsonb_build_object('eventId',v_row.event_id,'status',v_row.status,'attemptCount',v_row.attempt_count);
end
$function$;

revoke all on function private.food_catalog_governance_assert_outbox_reconciliation_ready(uuid) from public,anon,authenticated,service_role;
revoke all on function public.food_catalog_complete_governance_outbox_reconciliation(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.food_catalog_complete_governance_outbox_reconciliation(uuid,uuid,text) to authenticated;

revoke all on function public.food_catalog_claim_governance_outbox(uuid,integer) from public,anon,authenticated,service_role;
revoke all on function public.food_catalog_finish_governance_outbox(uuid,uuid,boolean,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.food_catalog_claim_governance_outbox(uuid,integer) to service_role;
grant execute on function public.food_catalog_finish_governance_outbox(uuid,uuid,boolean,text,integer) to service_role;

commit;
