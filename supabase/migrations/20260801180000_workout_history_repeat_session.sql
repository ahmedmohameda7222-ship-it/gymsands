begin;

do $preflight$
begin
  if to_regclass('public.workout_sessions') is null
     or to_regclass('public.workout_session_muscle_snapshots') is null
     or to_regclass('public.workout_session_muscle_snapshot_items') is null
     or to_regprocedure('public.assert_workout_actor(uuid)') is null
     or to_regprocedure('private.resolve_muscle_mapping(uuid,text,timestamptz)') is null
     or to_regprocedure('private.resolve_custom_muscle_mapping(uuid,uuid,text,timestamptz)') is null
     or to_regprocedure('private.phase3_refresh_snapshot_completeness(uuid,text)') is null
     or to_regprocedure('private.assert_workout_session_muscle_snapshot_supported(uuid)') is null
     or to_regprocedure('private.append_workout_session_timeline_event(uuid,uuid,text,timestamptz,text,text,jsonb,uuid,uuid,uuid,smallint)') is null
     or to_regprocedure('private.workout_history_request_hash(jsonb)') is null then
    raise exception 'WH-8 preflight failed: required workout authorities are missing.';
  end if;
  if exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='workout_sessions'
      and column_name='repeated_from_session_id'
  ) then
    raise exception 'WH-8 preflight failed: repeated_from_session_id already exists.';
  end if;
end
$preflight$;

alter table public.workout_sessions
  add column repeated_from_session_id uuid null references public.workout_sessions(id) on delete set null,
  add constraint workout_sessions_repeat_not_self_check
    check (repeated_from_session_id is null or repeated_from_session_id<>id);

create table public.workout_history_repeat_receipts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  idempotency_key text not null,
  candidate_session_id uuid not null,
  source_session_id uuid null references public.workout_sessions(id) on delete set null,
  created_session_id uuid not null references public.workout_sessions(id) on delete cascade,
  request_hash text not null check (request_hash~'^[a-f0-9]{64}$'),
  result jsonb not null check (jsonb_typeof(result)='object'),
  created_at timestamptz not null default clock_timestamp(),
  primary key (user_id,idempotency_key),
  unique (user_id,candidate_session_id),
  unique (created_session_id),
  check (char_length(idempotency_key) between 16 and 200 and idempotency_key~'^[A-Za-z0-9][A-Za-z0-9:._-]{15,199}$')
);
alter table public.workout_history_repeat_receipts enable row level security;
revoke all on table public.workout_history_repeat_receipts from public,anon,authenticated;
grant all on table public.workout_history_repeat_receipts to service_role;

create or replace function private.resolve_workout_history_repeat_identity(
  p_user_id uuid,p_target_type text,p_identity text,p_provider text default null
) returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_global public.exercises%rowtype;
  v_custom public.user_custom_exercises%rowtype;
  v_global_mapping public.exercise_muscle_mapping_sets%rowtype;
  v_custom_mapping public.user_custom_exercise_mapping_sets%rowtype;
  v_uuid uuid;
begin
  if p_target_type not in ('global_exercise','custom_exercise','provider_activity')
     or nullif(btrim(coalesce(p_identity,'')),'') is null then
    raise exception 'Repeat exercise identity is invalid.' using errcode='22023';
  end if;
  if p_target_type in ('global_exercise','custom_exercise') then
    begin v_uuid:=p_identity::uuid;
    exception when invalid_text_representation then raise exception 'Repeat exercise identity must be a UUID.' using errcode='22023'; end;
  end if;
  if p_target_type='global_exercise' then
    select * into v_global from public.exercises where id=v_uuid and is_global and is_approved;
    if not found then raise exception 'Repeat global exercise is unavailable.' using errcode='P0002'; end if;
  elsif p_target_type='custom_exercise' then
    select * into v_custom from public.user_custom_exercises where id=v_uuid and user_id=p_user_id;
    if not found then raise exception 'Repeat custom exercise is unavailable.' using errcode='P0002'; end if;
  else
    if nullif(btrim(coalesce(p_provider,'')),'') is null then raise exception 'Repeat provider is required.' using errcode='22023'; end if;
    select exercise.* into v_global from public.exercise_provider_links link
    join public.exercises exercise on exercise.id=link.exercise_id and exercise.is_global and exercise.is_approved
    where link.provider=p_provider and link.provider_activity_id=p_identity and link.verification_status='verified'
    order by link.verified_at desc nulls last,link.id limit 1;
    if not found then raise exception 'Repeat provider activity is unavailable.' using errcode='P0002'; end if;
  end if;
  if v_global.id is not null then
    select * into v_global_mapping from private.resolve_muscle_mapping(v_global.id,'exercise_muscle_mapping_v2',clock_timestamp());
    if v_global_mapping.id is null then raise exception 'Repeat global mapping is unavailable.' using errcode='P0002'; end if;
  else
    select * into v_custom_mapping from private.resolve_custom_muscle_mapping(p_user_id,v_custom.id,'exercise_muscle_mapping_v2',clock_timestamp());
    if v_custom_mapping.id is null then raise exception 'Repeat custom mapping is unavailable.' using errcode='P0002'; end if;
  end if;
  return jsonb_build_object(
    'name',coalesce(v_global.name,v_custom.name),
    'globalExerciseId',v_global.id,'customExerciseId',v_custom.id,'legacyWorkoutId',v_global.legacy_workout_id,
    'provider',case when p_target_type='provider_activity' then p_provider end,
    'providerActivityId',case when p_target_type='provider_activity' then p_identity end,
    'mappingSetId',v_global_mapping.id,'customMappingSetId',v_custom_mapping.id,
    'mappingVersion',coalesce(v_global_mapping.mapping_version,v_custom_mapping.mapping_version),
    'mappingSchemaVersion',coalesce(v_global_mapping.schema_version,v_custom_mapping.schema_version),
    'mappingChecksum',coalesce(v_global_mapping.checksum,v_custom_mapping.checksum),
    'customIdentity',case when v_custom.id is not null then jsonb_build_object(
      'id',v_custom.id,'name',v_custom.name,'equipment',v_custom.equipment,'targetMuscle',v_custom.target_muscle) end,
    'customMappingEntries',case when v_custom_mapping.id is not null then private.phase3_custom_mapping_entries(v_custom_mapping.id) end
  );
end
$function$;
revoke all on function private.resolve_workout_history_repeat_identity(uuid,text,text,text)
from public,anon,authenticated,service_role;

create or replace function public.start_repeated_workout_session_atomic(
  p_user_id uuid,p_source_session_id uuid,p_candidate_session_id uuid,
  p_idempotency_key text,p_item_choices jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_source public.workout_sessions%rowtype;
  v_source_snapshot public.workout_session_muscle_snapshots%rowtype;
  v_source_item public.workout_session_muscle_snapshot_items%rowtype;
  v_new_session public.workout_sessions%rowtype;
  v_new_snapshot public.workout_session_muscle_snapshots%rowtype;
  v_choice jsonb;
  v_selected jsonb:='[]'::jsonb;
  v_entry jsonb;
  v_identity jsonb;
  v_resolution jsonb;
  v_effective_type text;
  v_effective_identity text;
  v_effective_provider text;
  v_seen uuid[]:=array[]::uuid[];
  v_item_id uuid;
  v_new_order integer:=0;
  v_planned_sets integer;
  v_request jsonb;
  v_hash text;
  v_active_session_id uuid;
  v_receipt public.workout_history_repeat_receipts%rowtype;
  v_result jsonb;
begin
  perform public.assert_workout_actor(p_user_id);
  if p_source_session_id is null or p_candidate_session_id is null or p_source_session_id=p_candidate_session_id
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 200
     or p_idempotency_key!~'^[A-Za-z0-9][A-Za-z0-9:._-]{15,199}$'
     or jsonb_typeof(coalesce(p_item_choices,'[]'::jsonb))<>'array'
     or jsonb_array_length(coalesce(p_item_choices,'[]'::jsonb)) not between 1 and 100 then
    raise exception 'Repeat workout request is invalid.' using errcode='22023';
  end if;
  v_request:=jsonb_build_object('source',p_source_session_id,'candidate',p_candidate_session_id,'items',p_item_choices);
  if octet_length(v_request::text)>65536 then raise exception 'Repeat workout request is too large.' using errcode='22023'; end if;
  v_hash:=private.workout_history_request_hash(v_request);
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':workout-history-repeat',0));
  select * into v_receipt from public.workout_history_repeat_receipts
  where user_id=p_user_id and (idempotency_key=p_idempotency_key or candidate_session_id=p_candidate_session_id);
  if found then
    if v_receipt.request_hash<>v_hash then raise exception 'Repeat workout idempotency conflict.' using errcode='23505'; end if;
    return v_receipt.result;
  end if;

  select * into v_source from public.workout_sessions
  where id=p_source_session_id and user_id=p_user_id for update;
  if not found or v_source.deleted_at is not null or v_source.status::text not in ('completed','cancelled') then
    raise exception 'Repeat source workout is unavailable.' using errcode='P0002';
  end if;
  if v_source.status::text='cancelled' and not exists(
    select 1 from public.exercise_logs where workout_session_id=v_source.id and completed_at is not null
  ) then raise exception 'Cancelled workout has no meaningful performed work.' using errcode='23514'; end if;
  select * into v_source_snapshot from public.workout_session_muscle_snapshots
  where workout_session_id=v_source.id and user_id=p_user_id;
  if not found then raise exception 'Repeat source snapshot is unavailable.' using errcode='P0002'; end if;

  for v_choice in select value from jsonb_array_elements(p_item_choices) loop
    if jsonb_typeof(v_choice)<>'object' or v_choice->>'action' not in ('use','replace','omit') then
      raise exception 'Repeat item choice is invalid.' using errcode='22023';
    end if;
    begin v_item_id:=(v_choice->>'sourceSnapshotItemId')::uuid;
    exception when invalid_text_representation then raise exception 'Repeat source item is invalid.' using errcode='22023'; end;
    if v_item_id=any(v_seen) then raise exception 'Repeat source item is duplicated.' using errcode='23505'; end if;
    v_seen:=array_append(v_seen,v_item_id);
    select * into v_source_item from public.workout_session_muscle_snapshot_items
    where id=v_item_id and snapshot_id=v_source_snapshot.id and user_id=p_user_id;
    if not found then raise exception 'Repeat source item is unavailable.' using errcode='P0002'; end if;
    if v_choice->>'action'='omit' then continue; end if;
    v_identity:=v_choice->'identity';
    if jsonb_typeof(v_identity)<>'object' then raise exception 'Repeat resolution is required.' using errcode='22023'; end if;
    if coalesce(v_source_item.actual_provider,v_source_item.planned_provider) is not null then
      v_effective_type:='provider_activity';
      v_effective_identity:=coalesce(v_source_item.actual_provider_activity_id,v_source_item.planned_provider_activity_id);
      v_effective_provider:=coalesce(v_source_item.actual_provider,v_source_item.planned_provider);
    elsif coalesce(v_source_item.actual_global_exercise_id,v_source_item.planned_global_exercise_id) is not null then
      v_effective_type:='global_exercise';
      v_effective_identity:=coalesce(v_source_item.actual_global_exercise_id,v_source_item.planned_global_exercise_id)::text;
      v_effective_provider:=null;
    elsif coalesce(v_source_item.actual_custom_exercise_id,v_source_item.planned_custom_exercise_id) is not null then
      v_effective_type:='custom_exercise';
      v_effective_identity:=coalesce(v_source_item.actual_custom_exercise_id,v_source_item.planned_custom_exercise_id)::text;
      v_effective_provider:=null;
    else
      raise exception 'Repeat source item has no stable frozen identity.' using errcode='23514';
    end if;
    if v_choice->>'action'='use' and (
      v_identity->>'targetType' is distinct from v_effective_type
      or v_identity->>'identity' is distinct from v_effective_identity
      or coalesce(v_identity->>'provider','') is distinct from coalesce(v_effective_provider,'')
    ) then raise exception 'Repeat use choice does not match the frozen identity.' using errcode='23514'; end if;
    v_resolution:=private.resolve_workout_history_repeat_identity(
      p_user_id,v_identity->>'targetType',v_identity->>'identity',v_identity->>'provider'
    );
    v_selected:=v_selected||jsonb_build_array(jsonb_build_object(
      'sourceItemId',v_source_item.id,'sourceOrder',v_source_item.item_order,
      'prescription',v_source_item.planned_prescription,'resolution',v_resolution
    ));
  end loop;
  if jsonb_array_length(v_selected)=0 then raise exception 'Repeat workout requires at least one available item.' using errcode='23514'; end if;
  select id into v_active_session_id
  from public.workout_sessions
  where user_id=p_user_id and status='started'
  order by started_at desc,id
  limit 1
  for update;
  if v_active_session_id is not null then
    raise exception 'Another workout session is active.' using errcode='40001';
  end if;

  select value into v_entry from jsonb_array_elements(v_selected)
  order by (value->>'sourceOrder')::integer limit 1;
  v_resolution:=v_entry->'resolution';
  perform set_config('plaivra.direct_session_authoritative_start','1',true);
  insert into public.workout_sessions(
    id,user_id,workout_id,workout_name,workout_category,started_at,status,source,repeated_from_session_id
  ) values (
    p_candidate_session_id,p_user_id,nullif(v_resolution->>'legacyWorkoutId','')::uuid,
    v_source.workout_name,coalesce(v_source.workout_category,'Workout'),clock_timestamp(),'started','manual',v_source.id
  ) returning * into v_new_session;
  select * into strict v_new_snapshot from public.workout_session_muscle_snapshots
  where workout_session_id=v_new_session.id and user_id=p_user_id;
  perform set_config('plaivra.session_snapshot_mutation_id',v_new_snapshot.id::text,true);

  for v_entry in select value from jsonb_array_elements(v_selected) order by (value->>'sourceOrder')::integer loop
    v_new_order:=v_new_order+1;
    v_resolution:=v_entry->'resolution';
    begin v_planned_sets:=nullif(v_entry->'prescription'->>'sets','')::integer;
    exception when invalid_text_representation then v_planned_sets:=null; end;
    if v_planned_sets is not null and v_planned_sets<=0 then v_planned_sets:=null; end if;
    insert into public.workout_session_muscle_snapshot_items(
      snapshot_id,user_id,item_order,activity_name_snapshot,
      planned_target_type,planned_global_exercise_id,planned_custom_exercise_id,
      planned_provider,planned_provider_activity_id,
      planned_mapping_set_id,planned_custom_mapping_set_id,
      planned_mapping_version,planned_mapping_schema_version,planned_mapping_checksum,
      planned_custom_identity_snapshot,planned_custom_mapping_entries,
      planned_prescription,planned_sets,state
    ) values (
      v_new_snapshot.id,p_user_id,v_new_order,v_resolution->>'name',
      case when nullif(v_resolution->>'globalExerciseId','') is not null then 'global_exercise' else 'custom_exercise' end,
      nullif(v_resolution->>'globalExerciseId','')::uuid,nullif(v_resolution->>'customExerciseId','')::uuid,
      nullif(v_resolution->>'provider',''),nullif(v_resolution->>'providerActivityId',''),
      nullif(v_resolution->>'mappingSetId','')::uuid,nullif(v_resolution->>'customMappingSetId','')::uuid,
      nullif(v_resolution->>'mappingVersion','')::integer,nullif(v_resolution->>'mappingSchemaVersion',''),
      nullif(v_resolution->>'mappingChecksum',''),
      case when nullif(v_resolution->>'customExerciseId','') is not null then v_resolution->'customIdentity' end,
      case when nullif(v_resolution->>'customExerciseId','') is not null then v_resolution->'customMappingEntries' end,
      coalesce(v_entry->'prescription','{}'::jsonb),v_planned_sets,'planned'
    );
  end loop;
  perform private.phase3_refresh_snapshot_completeness(v_new_snapshot.id,null);
  perform private.assert_workout_session_muscle_snapshot_supported(v_new_snapshot.id);
  perform set_config('plaivra.direct_session_authoritative_start','',true);
  perform private.append_workout_session_timeline_event(
    v_new_session.id,p_user_id,'session_started',v_new_session.started_at,'runtime',
    'runtime:session_started:'||v_new_session.id::text,
    jsonb_build_object('sessionSource','history_repeat','repeatedFromSessionId',v_source.id)
  );
  perform private.append_workout_session_timeline_event(
    v_new_session.id,p_user_id,'session_repeat_started',v_new_session.started_at,'runtime',
    'history:repeat:'||p_idempotency_key,
    jsonb_build_object('sourceSessionId',v_source.id,'itemCount',v_new_order,'candidateSessionId',p_candidate_session_id)
  );
  v_result:=jsonb_build_object(
    'session',to_jsonb(v_new_session),'snapshotId',v_new_snapshot.id,
    'candidateSessionId',p_candidate_session_id,'resumed',false,'repeatedFromSessionId',v_source.id
  );
  insert into public.workout_history_repeat_receipts(
    user_id,idempotency_key,candidate_session_id,source_session_id,created_session_id,request_hash,result
  ) values (p_user_id,p_idempotency_key,p_candidate_session_id,v_source.id,v_new_session.id,v_hash,v_result);
  return v_result;
end
$function$;

revoke all on function public.start_repeated_workout_session_atomic(uuid,uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.start_repeated_workout_session_atomic(uuid,uuid,uuid,text,jsonb) to authenticated,service_role;

do $postflight$
begin
  if not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='workout_sessions'
      and column_name='repeated_from_session_id'
  )
  or to_regclass('public.workout_history_repeat_receipts') is null
  or to_regprocedure('public.start_repeated_workout_session_atomic(uuid,uuid,uuid,text,jsonb)') is null
  or not exists(
    select 1 from pg_catalog.pg_constraint
    where conname='workout_sessions_repeat_not_self_check'
      and conrelid='public.workout_sessions'::regclass
  ) then
    raise exception 'WH-8 postflight failed: repeat authority is incomplete.';
  end if;
  if has_function_privilege('anon','public.start_repeated_workout_session_atomic(uuid,uuid,uuid,text,jsonb)','execute')
     or not has_function_privilege('authenticated','public.start_repeated_workout_session_atomic(uuid,uuid,uuid,text,jsonb)','execute') then
    raise exception 'WH-8 postflight failed: repeat execution grants are unsafe.';
  end if;
end
$postflight$;

commit;
