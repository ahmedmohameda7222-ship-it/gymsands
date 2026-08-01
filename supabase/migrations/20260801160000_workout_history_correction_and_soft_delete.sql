begin;

alter table public.workout_sessions
  add column if not exists deleted_at timestamptz,
  add column if not exists purge_after timestamptz,
  add column if not exists history_revision bigint not null default 0;

alter table public.workout_sessions
  add constraint workout_sessions_history_revision_check check (history_revision>=0),
  add constraint workout_sessions_history_deletion_window_check check (
    (deleted_at is null and purge_after is null)
    or (deleted_at is not null and purge_after is not null and purge_after>=deleted_at)
  );

create index workout_sessions_recently_deleted_idx
  on public.workout_sessions(user_id,purge_after,id)
  where deleted_at is not null;

alter table public.workout_session_timeline_events
  drop constraint workout_session_timeline_events_type_check,
  add constraint workout_session_timeline_events_type_check check (event_type in (
    'session_started','session_paused','session_resumed','rest_started','rest_ended',
    'set_completed','set_edited','exercise_skipped','exercise_replaced',
    'session_completed','session_skipped','session_cancelled',
    'session_corrected','session_soft_deleted','session_restored','session_repeat_started'
  ));

do $extend_append_allowlist$
declare v_definition text;
begin
  select pg_get_functiondef(
    'private.append_workout_session_timeline_event(uuid,uuid,text,timestamptz,text,text,jsonb,uuid,uuid,uuid,smallint)'::regprocedure
  ) into v_definition;
  v_definition:=replace(
    v_definition,
    '''session_completed'',''session_skipped'',''session_cancelled''',
    '''session_completed'',''session_skipped'',''session_cancelled'',
    ''session_corrected'',''session_soft_deleted'',''session_restored'',''session_repeat_started'''
  );
  if v_definition not like '%session_soft_deleted%' then
    raise exception 'Workout timeline append allowlist could not be extended safely.';
  end if;
  execute v_definition;
end
$extend_append_allowlist$;

create table public.workout_history_mutation_receipts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  workout_session_id uuid not null,
  operation_kind text not null check (operation_kind in ('correct','soft_delete','restore','purge')),
  idempotency_key text not null,
  request_hash text not null check (request_hash~'^[a-f0-9]{64}$'),
  result jsonb not null check (jsonb_typeof(result)='object'),
  created_at timestamptz not null default clock_timestamp(),
  primary key (user_id,operation_kind,idempotency_key),
  foreign key (workout_session_id,user_id) references public.workout_sessions(id,user_id) on delete cascade,
  check (char_length(idempotency_key) between 16 and 200 and idempotency_key~'^[A-Za-z0-9][A-Za-z0-9:._-]{15,199}$')
);
alter table public.workout_history_mutation_receipts enable row level security;
revoke all on table public.workout_history_mutation_receipts from public,anon,authenticated;
grant all on table public.workout_history_mutation_receipts to service_role;

create table private.workout_history_correction_authority (
  singleton boolean primary key default true check (singleton),
  signing_secret text not null check (signing_secret~'^[a-f0-9]{64}$')
);
insert into private.workout_history_correction_authority(singleton,signing_secret)
values (true,encode(extensions.gen_random_bytes(32),'hex'));
revoke all on table private.workout_history_correction_authority from public,anon,authenticated,service_role;

create or replace function private.workout_history_scope_signature(p_session_id uuid,p_operation_id text)
returns text language sql stable security definer set search_path=''
as $function$
  select encode(extensions.digest(
    pg_catalog.convert_to(signing_secret||':'||p_session_id::text||':'||p_operation_id,'UTF8'),
    'sha256'
  ),'hex')
  from private.workout_history_correction_authority where singleton
$function$;
revoke all on function private.workout_history_scope_signature(uuid,text)
from public,anon,authenticated,service_role;

create or replace function private.enforce_terminal_exercise_log_immutability()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare
  v_old_status text;
  v_new_status text;
  v_old_session uuid:=case when tg_op='INSERT' then null else old.workout_session_id end;
  v_new_session uuid:=case when tg_op='DELETE' then null else new.workout_session_id end;
  v_scope_session text:=current_setting('plaivra.terminal_exercise_log_mutation_session_id',true);
  v_scope_operation text:=current_setting('plaivra.workout_history_correction_operation_id',true);
  v_scope_signature text:=current_setting('plaivra.workout_history_correction_signature',true);
begin
  if v_old_session is not null then select status::text into v_old_status from public.workout_sessions where id=v_old_session; end if;
  if v_new_session is not null then select status::text into v_new_status from public.workout_sessions where id=v_new_session; end if;
  if tg_op='DELETE' and pg_trigger_depth()>1 then return old; end if;
  if ((v_old_session is not null and v_old_status is distinct from 'started')
      or (v_new_session is not null and v_new_status is distinct from 'started'))
     and (
       nullif(v_scope_operation,'') is null
       or v_scope_signature is distinct from private.workout_history_scope_signature(v_scope_session::uuid,v_scope_operation)
       or (v_old_session is not null and v_scope_session is distinct from v_old_session::text)
       or (v_new_session is not null and v_scope_session is distinct from v_new_session::text)
     ) then
    raise exception 'Completed workout set logs are immutable outside an exact correction scope.' using errcode='23514';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end
$function$;

create or replace function private.workout_history_request_hash(p_payload jsonb)
returns text language sql immutable set search_path=''
as $function$ select encode(extensions.digest(coalesce(p_payload,'null'::jsonb)::text,'sha256'),'hex') $function$;

create or replace function public.correct_completed_workout_session_atomic(
  p_user_id uuid,p_session_id uuid,p_expected_history_revision bigint,
  p_idempotency_key text,p_session_patch jsonb,p_set_operations jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_session public.workout_sessions%rowtype;
  v_existing public.workout_history_mutation_receipts%rowtype;
  v_request jsonb:=jsonb_build_object('revision',p_expected_history_revision,'session_patch',coalesce(p_session_patch,'{}'::jsonb),'set_operations',coalesce(p_set_operations,'[]'::jsonb));
  v_hash text;
  v_operation jsonb;
  v_log public.exercise_logs%rowtype;
  v_item public.workout_session_muscle_snapshot_items%rowtype;
  v_result jsonb;
  v_performance_changed boolean:=false;
  v_operation_index bigint;
  v_graph jsonb;
  v_before jsonb;
  v_after jsonb;
  v_details jsonb;
  v_metric jsonb;
  v_metric_key text;
  v_metric_version smallint;
  v_metric_side text;
  v_metric_value numeric;
  v_metric_captured_at timestamptz;
  v_metric_reps integer;
  v_metric_weight numeric;
begin
  perform public.assert_workout_actor(p_user_id);
  if p_expected_history_revision<0 or p_idempotency_key is null
     or char_length(p_idempotency_key) not between 16 and 200
     or p_idempotency_key!~'^[A-Za-z0-9][A-Za-z0-9:._-]{15,199}$'
     or jsonb_typeof(coalesce(p_session_patch,'{}'::jsonb))<>'object'
     or jsonb_typeof(coalesce(p_set_operations,'[]'::jsonb))<>'array'
     or jsonb_array_length(coalesce(p_set_operations,'[]'::jsonb))>100
     or octet_length(v_request::text)>65536 then raise exception 'Workout correction payload is invalid.' using errcode='22023'; end if;
  v_hash:=private.workout_history_request_hash(v_request);
  select * into v_existing from public.workout_history_mutation_receipts
   where user_id=p_user_id and operation_kind='correct' and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.request_hash<>v_hash then raise exception 'Correction idempotency key conflict.' using errcode='23505'; end if;
    return v_existing.result;
  end if;
  select * into v_session from public.workout_sessions where id=p_session_id and user_id=p_user_id for update;
  if not found then raise exception 'Workout session not found.' using errcode='P0002'; end if;
  if v_session.deleted_at is not null or v_session.status::text not in ('completed','cancelled')
     or (v_session.status::text='cancelled' and not exists(select 1 from public.exercise_logs where workout_session_id=p_session_id)) then
    raise exception 'Workout session is not eligible for correction.' using errcode='23514';
  end if;
  if v_session.history_revision<>p_expected_history_revision then raise exception 'Workout history revision conflict.' using errcode='40001'; end if;
  perform set_config('plaivra.terminal_exercise_log_mutation_session_id',p_session_id::text,true);
  perform set_config('plaivra.workout_history_correction_operation_id',p_idempotency_key,true);
  perform set_config(
    'plaivra.workout_history_correction_signature',
    private.workout_history_scope_signature(p_session_id,p_idempotency_key),
    true
  );
  update public.workout_sessions set
    duration_minutes=case when p_session_patch?'durationMinutes' then nullif(p_session_patch->>'durationMinutes','')::integer else duration_minutes end,
    notes=case when p_session_patch?'notes' then nullif(p_session_patch->>'notes','') else notes end
  where id=p_session_id;
  for v_operation,v_operation_index in
    select value,ordinality from jsonb_array_elements(coalesce(p_set_operations,'[]'::jsonb)) with ordinality
  loop
    v_graph:=null;
    v_before:=null;
    v_after:=null;
    if v_operation->>'kind'='remove' then
      select * into v_log from public.exercise_logs
      where id=(v_operation->>'exerciseLogId')::uuid and workout_session_id=p_session_id for update;
      if not found then raise exception 'Correction source set not found.' using errcode='P0002'; end if;
      v_before:=jsonb_build_object('setNumber',v_log.set_number,'reps',v_log.reps,'weightKg',v_log.weight_kg,'setType',v_log.set_type,'notes',v_log.notes);
      perform private.append_workout_session_timeline_event(
        p_session_id,p_user_id,'set_edited',clock_timestamp(),'runtime',
        'history:correct:'||p_idempotency_key||':set:'||v_operation_index,
        jsonb_build_object('operation','remove','before',v_before,'after',null),
        null::uuid,v_log.id,null::uuid,1::smallint
      );
      delete from public.exercise_logs where id=v_log.id;
      v_performance_changed:=true;
    elsif v_operation->>'kind'='update' then
      select * into v_log from public.exercise_logs where id=(v_operation->>'exerciseLogId')::uuid and workout_session_id=p_session_id for update;
      if not found then raise exception 'Correction source set not found.' using errcode='P0002'; end if;
      v_before:=jsonb_build_object('setNumber',v_log.set_number,'reps',v_log.reps,'weightKg',v_log.weight_kg,'setType',v_log.set_type,'notes',v_log.notes);
      v_graph:=coalesce(v_operation->'patch','{}'::jsonb);
      update public.exercise_logs set
        reps=case when (v_operation->'patch')?'reps' then nullif(v_operation->'patch'->>'reps','')::integer else reps end,
        weight_kg=case when (v_operation->'patch')?'weightKg' then nullif(v_operation->'patch'->>'weightKg','')::numeric else weight_kg end,
        notes=case when (v_operation->'patch')?'notes' then nullif(v_operation->'patch'->>'notes','') else notes end,
        set_type=case when (v_operation->'patch')?'setType' then v_operation->'patch'->>'setType' else set_type end,
        completed_at=case when (v_operation->'patch')?'completedAt' then (v_operation->'patch'->>'completedAt')::timestamptz else completed_at end
      where id=v_log.id returning * into v_log;
      v_performance_changed:=v_performance_changed or (v_operation->'patch') ?| array['reps','weightKg','setType','completedAt'];
    elsif v_operation->>'kind'='add' then
      select item.* into v_item from public.workout_session_muscle_snapshot_items item
      join public.workout_session_muscle_snapshots snapshot on snapshot.id=item.snapshot_id
      where item.id=(v_operation->>'snapshotItemId')::uuid and snapshot.workout_session_id=p_session_id and item.user_id=p_user_id;
      if not found then raise exception 'Correction snapshot item not found.' using errcode='23514'; end if;
      v_graph:=coalesce(v_operation->'values','{}'::jsonb);
      insert into public.exercise_logs(workout_session_id,exercise_name,set_number,reps,weight_kg,notes,plan_exercise_id,plan_activity_id,completed_at,exercise_order,source,set_type)
      values (p_session_id,coalesce(v_item.actual_name_snapshot,v_item.activity_name_snapshot),(v_operation->>'setNumber')::integer,
        nullif(v_operation->'values'->>'reps','')::integer,nullif(v_operation->'values'->>'weightKg','')::numeric,
        nullif(v_operation->'values'->>'notes',''),v_item.source_plan_exercise_id,v_item.source_plan_activity_id,
        coalesce(nullif(v_operation->'values'->>'completedAt','')::timestamptz,v_session.completed_at,v_session.cancelled_at),v_item.item_order,'manual',
        coalesce(nullif(v_operation->'values'->>'setType',''),'normal')) returning * into v_log;
      v_performance_changed:=true;
    else raise exception 'Unsupported correction operation.' using errcode='22023'; end if;

    if v_graph is not null then
      if v_graph ? 'performanceMetrics' then
        if jsonb_typeof(v_graph->'performanceMetrics')<>'array'
           or jsonb_array_length(v_graph->'performanceMetrics')>16 then
          raise exception 'Correction performance metrics are invalid.' using errcode='22023';
        end if;
        v_metric_reps:=null;
        v_metric_weight:=null;
        delete from public.exercise_log_metric_values where exercise_log_id=v_log.id;
        for v_metric in select value from jsonb_array_elements(v_graph->'performanceMetrics') loop
          v_metric_key:=nullif(v_metric->>'metricKey','');
          v_metric_version:=coalesce(nullif(v_metric->>'metricVersion','')::smallint,1);
          v_metric_side:=coalesce(nullif(v_metric->>'side',''),'none');
          v_metric_value:=nullif(v_metric->>'value','')::numeric;
          v_metric_captured_at:=coalesce(
            nullif(v_metric->>'capturedAt','')::timestamptz,
            v_log.completed_at,
            v_session.completed_at,
            clock_timestamp()
          );
          perform private.validate_workout_performance_metric_value(
            v_metric_key,v_metric_version,v_metric_side,v_metric_value,
            'manual',null,null,v_metric_captured_at
          );
          insert into public.exercise_log_metric_values(
            exercise_log_id,workout_session_id,user_id,metric_key,metric_version,side,value,
            source,source_provider,source_version,captured_at
          ) values (
            v_log.id,p_session_id,p_user_id,v_metric_key,v_metric_version,v_metric_side,v_metric_value,
            'manual',null,null,v_metric_captured_at
          );
          if v_metric_key='repetitions' and v_metric_side in ('none','bilateral') then
            v_metric_reps:=v_metric_value::integer;
          elsif v_metric_key='external_load_kg' and v_metric_side in ('none','bilateral') then
            v_metric_weight:=v_metric_value;
          end if;
        end loop;
        update public.exercise_logs set reps=v_metric_reps,weight_kg=v_metric_weight
        where id=v_log.id returning * into v_log;
        v_performance_changed:=true;
      end if;

      if v_graph ? 'setDetails' then
        v_details:=v_graph->'setDetails';
        if jsonb_typeof(v_details)='null' then
          delete from public.exercise_log_set_details where exercise_log_id=v_log.id;
        elsif jsonb_typeof(v_details)='object' then
          update public.exercise_logs set
            set_type=coalesce(nullif(v_details->>'setType',''),set_type),
            notes=case when v_details?'notes' then nullif(v_details->>'notes','') else notes end
          where id=v_log.id returning * into v_log;
          insert into public.exercise_log_set_details(
            exercise_log_id,workout_session_id,user_id,schema_version,set_type,rpe,rir,notes,
            side_mode,planned_tempo,performed_tempo,tempo_adherence,
            source,source_provider,source_version
          ) values (
            v_log.id,p_session_id,p_user_id,1,v_log.set_type,
            nullif(v_details->>'rpe','')::numeric,nullif(v_details->>'rir','')::numeric,v_log.notes,
            coalesce(nullif(v_details->>'sideMode',''),'none'),nullif(v_details->>'plannedTempo',''),
            nullif(v_details->>'performedTempo',''),coalesce(nullif(v_details->>'tempoAdherence',''),'not_recorded'),
            'manual',null,null
          ) on conflict (exercise_log_id) do update set
            set_type=excluded.set_type,rpe=excluded.rpe,rir=excluded.rir,notes=excluded.notes,
            side_mode=excluded.side_mode,planned_tempo=excluded.planned_tempo,
            performed_tempo=excluded.performed_tempo,tempo_adherence=excluded.tempo_adherence,
            source='manual',source_provider=null,source_version=null,
            updated_at=clock_timestamp();
          v_performance_changed:=v_performance_changed or v_details?'setType';
        else
          raise exception 'Correction set details are invalid.' using errcode='22023';
        end if;
      end if;

      v_after:=jsonb_build_object('setNumber',v_log.set_number,'reps',v_log.reps,'weightKg',v_log.weight_kg,'setType',v_log.set_type,'notes',v_log.notes);
      perform private.append_workout_session_timeline_event(
        p_session_id,p_user_id,
        case when v_operation->>'kind'='add' then 'set_completed' else 'set_edited' end,
        clock_timestamp(),'runtime','history:correct:'||p_idempotency_key||':set:'||v_operation_index,
        jsonb_build_object(
          'operation',v_operation->>'kind',
          'changedFields',coalesce((select jsonb_agg(key order by key) from jsonb_object_keys(v_graph) key),'[]'::jsonb),
          'before',v_before,'after',v_after
        ),null::uuid,v_log.id,null::uuid,1::smallint
      );
    end if;
  end loop;
  update public.workout_sessions set history_revision=history_revision+1,
    derived_record_schema_version=case when v_performance_changed then null else derived_record_schema_version end,
    derived_record_formula_version=case when v_performance_changed then null else derived_record_formula_version end,
    derived_records_evaluated_at=case when v_performance_changed then null else derived_records_evaluated_at end
  where id=p_session_id returning history_revision into p_expected_history_revision;
  if v_performance_changed then delete from public.personal_records where workout_session_id=p_session_id and source_kind='workout_derived'; end if;
  perform private.append_workout_session_timeline_event(p_session_id,p_user_id,'session_corrected',clock_timestamp(),'runtime',
    'history:correct:'||p_idempotency_key,jsonb_build_object('revision',p_expected_history_revision,'set_operation_count',jsonb_array_length(coalesce(p_set_operations,'[]'::jsonb)),'performance_changed',v_performance_changed));
  v_result:=jsonb_build_object('session_id',p_session_id,'history_revision',p_expected_history_revision,'performance_changed',v_performance_changed,'invalidation_categories',case when v_performance_changed then jsonb_build_array('personal_records','muscle_summary','session_summary') else jsonb_build_array('session_summary') end);
  insert into public.workout_history_mutation_receipts values(p_user_id,p_session_id,'correct',p_idempotency_key,v_hash,v_result,clock_timestamp());
  return v_result;
end
$function$;

create or replace function public.soft_delete_workout_session_atomic(p_user_id uuid,p_session_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_session public.workout_sessions%rowtype;
begin
  perform public.assert_workout_actor(p_user_id);
  select * into v_session from public.workout_sessions where id=p_session_id and user_id=p_user_id for update;
  if not found then raise exception 'Workout session not found.' using errcode='P0002'; end if;
  if v_session.status::text not in ('completed','cancelled','skipped') then raise exception 'Only terminal sessions can be deleted.' using errcode='23514'; end if;
  if v_session.deleted_at is null then
    update public.workout_sessions set deleted_at=clock_timestamp(),purge_after=clock_timestamp()+interval '30 days',history_revision=history_revision+1,
      derived_record_schema_version=null,derived_record_formula_version=null,derived_records_evaluated_at=null where id=p_session_id returning * into v_session;
    delete from public.personal_records where workout_session_id=p_session_id and source_kind='workout_derived';
    perform private.append_workout_session_timeline_event(p_session_id,p_user_id,'session_soft_deleted',v_session.deleted_at,'runtime','history:delete:'||p_idempotency_key,jsonb_build_object('revision',v_session.history_revision,'restore_days',30));
  end if;
  return jsonb_build_object('session_id',p_session_id,'deleted_at',v_session.deleted_at,'purge_after',v_session.purge_after,'history_revision',v_session.history_revision);
end
$function$;

create or replace function public.restore_workout_session_atomic(p_user_id uuid,p_session_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_session public.workout_sessions%rowtype;
begin
  perform public.assert_workout_actor(p_user_id);
  select * into v_session from public.workout_sessions where id=p_session_id and user_id=p_user_id for update;
  if not found then raise exception 'Workout session not found.' using errcode='P0002'; end if;
  if v_session.deleted_at is null then return jsonb_build_object('session_id',p_session_id,'restored',true,'history_revision',v_session.history_revision); end if;
  if v_session.purge_after<=clock_timestamp() then raise exception 'Workout restore period expired.' using errcode='23514'; end if;
  update public.workout_sessions set deleted_at=null,purge_after=null,history_revision=history_revision+1 where id=p_session_id returning * into v_session;
  perform private.append_workout_session_timeline_event(p_session_id,p_user_id,'session_restored',clock_timestamp(),'runtime','history:restore:'||p_idempotency_key,jsonb_build_object('revision',v_session.history_revision));
  return jsonb_build_object('session_id',p_session_id,'restored',true,'history_revision',v_session.history_revision,'rebuild_required',true);
end
$function$;

create or replace function public.purge_workout_session_atomic(p_user_id uuid,p_session_id uuid,p_confirm_permanent boolean)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_session public.workout_sessions%rowtype;
begin
  perform public.assert_workout_actor(p_user_id);
  select * into v_session from public.workout_sessions where id=p_session_id and user_id=p_user_id for update;
  if not found then return jsonb_build_object('purged',true,'already_absent',true); end if;
  if v_session.deleted_at is null or not coalesce(p_confirm_permanent,false) then raise exception 'Permanent deletion requires a soft-deleted session and explicit confirmation.' using errcode='23514'; end if;
  delete from public.workout_sessions where id=p_session_id;
  return jsonb_build_object('purged',true,'already_absent',false);
end
$function$;

create or replace function public.purge_expired_workout_sessions(p_batch_size integer,p_dry_run boolean default false)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_count integer;
begin
  if p_batch_size not between 1 and 500 then raise exception 'Batch size is invalid.' using errcode='22023'; end if;
  if p_dry_run then select count(*) into v_count from (select 1 from public.workout_sessions where purge_after<=clock_timestamp() limit p_batch_size) candidate;
  else
    with candidate as (select id from public.workout_sessions where purge_after<=clock_timestamp() order by purge_after,id for update skip locked limit p_batch_size),
    deleted as (delete from public.workout_sessions where id in(select id from candidate) returning 1)
    select count(*) into v_count from deleted;
  end if;
  return jsonb_build_object('dry_run',p_dry_run,'candidate_count',v_count,'purged_count',case when p_dry_run then 0 else v_count end);
end
$function$;

revoke all on function public.correct_completed_workout_session_atomic(uuid,uuid,bigint,text,jsonb,jsonb) from public,anon;
revoke all on function public.soft_delete_workout_session_atomic(uuid,uuid,text) from public,anon;
revoke all on function public.restore_workout_session_atomic(uuid,uuid,text) from public,anon;
revoke all on function public.purge_workout_session_atomic(uuid,uuid,boolean) from public,anon;
revoke all on function public.purge_expired_workout_sessions(integer,boolean) from public,anon,authenticated;
grant execute on function public.correct_completed_workout_session_atomic(uuid,uuid,bigint,text,jsonb,jsonb) to authenticated,service_role;
grant execute on function public.soft_delete_workout_session_atomic(uuid,uuid,text) to authenticated,service_role;
grant execute on function public.restore_workout_session_atomic(uuid,uuid,text) to authenticated,service_role;
grant execute on function public.purge_workout_session_atomic(uuid,uuid,boolean) to authenticated,service_role;
grant execute on function public.purge_expired_workout_sessions(integer,boolean) to service_role;

commit;
