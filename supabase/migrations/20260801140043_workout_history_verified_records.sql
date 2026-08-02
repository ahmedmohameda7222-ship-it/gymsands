begin;

alter table public.personal_records
  add column if not exists source_kind text not null default 'manual',
  add column if not exists record_key text,
  add column if not exists exercise_identity_kind text,
  add column if not exists exercise_identity text,
  add column if not exists workout_session_id uuid,
  add column if not exists exercise_log_id uuid,
  add column if not exists derived_record_type text,
  add column if not exists record_value numeric,
  add column if not exists record_unit text,
  add column if not exists comparison_context_key text,
  add column if not exists set_type text,
  add column if not exists schema_version smallint,
  add column if not exists formula_version text,
  add column if not exists achieved_at timestamptz;

alter table public.workout_sessions
  add column if not exists derived_record_schema_version smallint,
  add column if not exists derived_record_formula_version text,
  add column if not exists derived_records_evaluated_at timestamptz;

alter table public.personal_records
  drop constraint if exists personal_records_source_kind_check,
  add constraint personal_records_source_kind_check
    check (source_kind in ('manual','workout_derived')),
  drop constraint if exists personal_records_identity_kind_check,
  add constraint personal_records_identity_kind_check
    check (exercise_identity_kind is null or exercise_identity_kind in (
      'global','custom','provider','plan_activity','plan_exercise','source_workout','name_degraded'
    )),
  drop constraint if exists personal_records_derived_type_check,
  add constraint personal_records_derived_type_check
    check (derived_record_type is null or derived_record_type in (
      'highest_load','same_load_max_repetitions','estimated_one_rep_max','exercise_session_volume'
    )),
  drop constraint if exists personal_records_record_unit_check,
  add constraint personal_records_record_unit_check
    check (record_unit is null or record_unit in ('kg','repetitions','kg_repetitions')),
  drop constraint if exists personal_records_set_type_check,
  add constraint personal_records_set_type_check
    check (set_type is null or set_type in ('working','normal','failure','drop','backoff','amrap','other')),
  drop constraint if exists personal_records_derived_shape_check,
  add constraint personal_records_derived_shape_check check (
    source_kind = 'manual'
    or (
      record_key is not null
      and exercise_identity_kind is not null
      and exercise_identity is not null
      and workout_session_id is not null
      and exercise_log_id is not null
      and derived_record_type is not null
      and record_value is not null
      and record_unit is not null
      and comparison_context_key is not null
      and set_type is not null
      and schema_version is not null
      and formula_version is not null
      and achieved_at is not null
    )
  ),
  drop constraint if exists personal_records_record_value_check,
  add constraint personal_records_record_value_check check (
    record_value is null
    or (
      record_value >= 0
      and record_value <> 'NaN'::numeric
      and record_value <> 'Infinity'::numeric
      and record_value <> '-Infinity'::numeric
    )
  ),
  drop constraint if exists personal_records_derived_strings_check,
  add constraint personal_records_derived_strings_check check (
    (record_key is null or (char_length(record_key) between 1 and 128 and record_key !~ '[[:cntrl:]]'))
    and (exercise_identity is null or (char_length(exercise_identity) between 1 and 240 and exercise_identity !~ '[[:cntrl:]]'))
    and (comparison_context_key is null or (char_length(comparison_context_key) between 1 and 300 and comparison_context_key !~ '[[:cntrl:]]'))
    and (formula_version is null or (char_length(formula_version) between 1 and 80 and formula_version !~ '[[:cntrl:]]'))
  ),
  drop constraint if exists personal_records_schema_version_check,
  add constraint personal_records_schema_version_check check (schema_version is null or schema_version between 1 and 32767),
  drop constraint if exists personal_records_session_owner_fkey,
  add constraint personal_records_session_owner_fkey
    foreign key (workout_session_id,user_id)
    references public.workout_sessions(id,user_id) on delete cascade,
  drop constraint if exists personal_records_log_session_fkey,
  add constraint personal_records_log_session_fkey
    foreign key (exercise_log_id,workout_session_id)
    references public.exercise_logs(id,workout_session_id) on delete cascade;

create unique index if not exists personal_records_workout_record_key_uidx
  on public.personal_records(record_key)
  where source_kind='workout_derived';
create index if not exists personal_records_verified_history_idx
  on public.personal_records(user_id,exercise_identity,derived_record_type,comparison_context_key,achieved_at desc)
  where source_kind='workout_derived';
create index if not exists personal_records_session_idx
  on public.personal_records(workout_session_id,achieved_at desc)
  where source_kind='workout_derived';

drop policy if exists "personal_records_own_all" on public.personal_records;
drop policy if exists personal_records_owner_admin_select on public.personal_records;
drop policy if exists personal_records_owner_manual_insert on public.personal_records;
drop policy if exists personal_records_owner_manual_update on public.personal_records;
drop policy if exists personal_records_owner_manual_delete on public.personal_records;

create policy personal_records_owner_admin_select
on public.personal_records for select to authenticated
using (user_id=auth.uid() or (select private.is_admin()));

create policy personal_records_owner_manual_insert
on public.personal_records for insert to authenticated
with check (user_id=auth.uid() and source_kind='manual');

create policy personal_records_owner_manual_update
on public.personal_records for update to authenticated
using (user_id=auth.uid() and source_kind='manual')
with check (user_id=auth.uid() and source_kind='manual');

create policy personal_records_owner_manual_delete
on public.personal_records for delete to authenticated
using (user_id=auth.uid() and source_kind='manual');

revoke all on table public.personal_records from public, anon;
grant select,insert,update,delete on table public.personal_records to authenticated;
grant all on table public.personal_records to service_role;

create or replace function private.replace_workout_derived_records_atomic(
  p_user_id uuid,
  p_session_id uuid,
  p_schema_version smallint,
  p_formula_version text,
  p_records jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_session public.workout_sessions%rowtype;
  v_item jsonb;
  v_log public.exercise_logs%rowtype;
  v_record_key text;
  v_record_keys text[] := array[]::text[];
  v_identity_kind text;
  v_identity text;
  v_record_type text;
  v_record_value numeric;
  v_record_unit text;
  v_context text;
  v_set_type text;
  v_achieved_at timestamptz;
  v_identity_valid boolean;
  v_count integer := 0;
begin
  perform public.assert_workout_actor(p_user_id);
  if p_schema_version<>1 then
    raise exception 'Derived record schema version is invalid.' using errcode='22023';
  end if;
  if p_formula_version<>'wh6-v1'
     or nullif(btrim(coalesce(p_formula_version,'')),'') is null
     or char_length(p_formula_version)>80
     or p_formula_version ~ '[[:cntrl:]]' then
    raise exception 'Derived record formula version is invalid.' using errcode='22023';
  end if;
  if p_records is null then p_records:='[]'::jsonb; end if;
  if jsonb_typeof(p_records)<>'array' or jsonb_array_length(p_records)>500 then
    raise exception 'Derived record payload is invalid.' using errcode='22023';
  end if;

  select * into v_session
  from public.workout_sessions
  where id=p_session_id and user_id=p_user_id
  for update;
  if not found then raise exception 'Workout session not found.' using errcode='P0002'; end if;
  if coalesce(to_jsonb(v_session)->>'deleted_at','')<>'' then
    raise exception 'Deleted workout sessions cannot produce records.' using errcode='23514';
  end if;
  if v_session.status::text not in ('completed','cancelled') then
    raise exception 'Workout session is not eligible for record evaluation.' using errcode='23514';
  end if;

  perform 1 from public.personal_records
  where user_id=p_user_id and source_kind='workout_derived'
    and workout_session_id=p_session_id
  for update;

  for v_item in select value from jsonb_array_elements(p_records)
  loop
    if jsonb_typeof(v_item)<>'object' then
      raise exception 'Derived record item is invalid.' using errcode='22023';
    end if;
    select * into v_log
    from public.exercise_logs
    where id=nullif(v_item->>'exercise_log_id','')::uuid
      and workout_session_id=p_session_id
    for share;
    if not found then raise exception 'Derived record source log is invalid.' using errcode='23514'; end if;

    v_identity_kind:=nullif(v_item->>'exercise_identity_kind','');
    v_identity:=nullif(v_item->>'exercise_identity','');
    v_record_type:=nullif(v_item->>'record_type','');
    v_record_value:=nullif(v_item->>'record_value','')::numeric;
    v_record_unit:=nullif(v_item->>'record_unit','');
    v_context:=nullif(v_item->>'comparison_context_key','');
    v_set_type:=nullif(v_item->>'set_type','');
    v_achieved_at:=nullif(v_item->>'achieved_at','')::timestamptz;

    if v_identity_kind not in ('global','custom','provider','plan_activity','plan_exercise','source_workout')
       or v_record_type not in ('highest_load','same_load_max_repetitions','estimated_one_rep_max','exercise_session_volume')
       or v_record_unit not in ('kg','repetitions','kg_repetitions')
       or v_set_type not in ('working','normal','failure','drop','backoff','amrap','other')
       or v_record_value is null or v_record_value<0 or v_record_value in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
       or v_achieved_at is null or v_achieved_at<>v_log.completed_at
       or nullif(btrim(coalesce(v_context,'')),'') is null or char_length(v_context)>300 or v_context ~ '[[:cntrl:]]'
       or nullif(btrim(coalesce(v_identity,'')),'') is null or char_length(v_identity)>240 or v_identity ~ '[[:cntrl:]]' then
      raise exception 'Derived record values are invalid.' using errcode='23514';
    end if;

    v_identity_valid:=false;
    if v_identity_kind in ('global','custom','provider') then
      select exists(
        select 1
        from public.workout_session_muscle_snapshots snapshot
        join public.workout_session_muscle_snapshot_items item on item.snapshot_id=snapshot.id
        where snapshot.workout_session_id=p_session_id and snapshot.user_id=p_user_id
          and (
            (v_log.plan_activity_id is not null and item.source_plan_activity_id=v_log.plan_activity_id)
            or (v_log.plan_exercise_id is not null and item.source_plan_exercise_id=v_log.plan_exercise_id)
            or (item.item_order=v_log.exercise_order)
          )
          and v_identity=(case
            when item.actual_provider is not null and item.actual_provider_activity_id is not null
              then 'provider:'||item.actual_provider||':'||item.actual_provider_activity_id
            when item.actual_global_exercise_id is not null then 'global:'||item.actual_global_exercise_id::text
            when item.actual_custom_exercise_id is not null then 'custom:'||item.actual_custom_exercise_id::text
            when item.planned_provider is not null and item.planned_provider_activity_id is not null
              then 'provider:'||item.planned_provider||':'||item.planned_provider_activity_id
            when item.planned_global_exercise_id is not null then 'global:'||item.planned_global_exercise_id::text
            when item.planned_custom_exercise_id is not null then 'custom:'||item.planned_custom_exercise_id::text
            else null end)
      ) into v_identity_valid;
    elsif v_identity_kind='plan_activity' then
      v_identity_valid:=v_log.plan_activity_id is not null and v_identity='plan_activity:'||v_log.plan_activity_id::text;
    elsif v_identity_kind='plan_exercise' then
      v_identity_valid:=v_log.plan_exercise_id is not null and v_identity='plan_exercise:'||v_log.plan_exercise_id::text;
    elsif v_identity_kind='source_workout' then
      v_identity_valid:=v_session.workout_id is not null and v_identity='source_workout:'||v_session.workout_id::text;
    end if;
    if not coalesce(v_identity_valid,false) then
      raise exception 'Derived exercise identity is not canonical for its source log.' using errcode='23514';
    end if;

    v_record_key:=encode(extensions.digest(
      concat_ws('|','workout-record-v1',p_user_id::text,p_session_id::text,v_log.id::text,
        v_identity_kind,v_identity,v_record_type,v_context,p_schema_version::text,p_formula_version),
      'sha256'
    ),'hex');
    if v_record_key=any(v_record_keys) then
      raise exception 'Derived record payload contains duplicate stable records.' using errcode='23505';
    end if;
    v_record_keys:=array_append(v_record_keys,v_record_key);

    insert into public.personal_records(
      user_id,exercise_name,record_type,weight_kg,reps,record_date,notes,
      source_kind,record_key,exercise_identity_kind,exercise_identity,
      workout_session_id,exercise_log_id,derived_record_type,record_value,record_unit,
      comparison_context_key,set_type,schema_version,formula_version,achieved_at
    ) values (
      p_user_id,v_log.exercise_name,
      case v_record_type
        when 'highest_load' then 'Max weight'
        when 'same_load_max_repetitions' then 'Max reps'
        when 'estimated_one_rep_max' then 'Estimated 1RM'
        else 'Best volume' end,
      case when v_record_unit in ('kg','kg_repetitions') then v_record_value else null end,
      case when v_record_type='same_load_max_repetitions' then v_record_value::integer else null end,
      v_achieved_at::date,null,
      'workout_derived',v_record_key,v_identity_kind,v_identity,
      p_session_id,v_log.id,v_record_type,v_record_value,v_record_unit,
      v_context,v_set_type,p_schema_version,p_formula_version,v_achieved_at
    )
    on conflict (record_key) where source_kind='workout_derived' do update set
      exercise_name=excluded.exercise_name,
      record_type=excluded.record_type,
      weight_kg=excluded.weight_kg,
      reps=excluded.reps,
      record_date=excluded.record_date,
      exercise_identity_kind=excluded.exercise_identity_kind,
      exercise_identity=excluded.exercise_identity,
      workout_session_id=excluded.workout_session_id,
      exercise_log_id=excluded.exercise_log_id,
      derived_record_type=excluded.derived_record_type,
      record_value=excluded.record_value,
      record_unit=excluded.record_unit,
      comparison_context_key=excluded.comparison_context_key,
      set_type=excluded.set_type,
      schema_version=excluded.schema_version,
      formula_version=excluded.formula_version,
      achieved_at=excluded.achieved_at
    where (personal_records.exercise_name,personal_records.record_type,personal_records.weight_kg,
      personal_records.reps,personal_records.record_date,personal_records.record_value,
      personal_records.record_unit,personal_records.set_type,personal_records.achieved_at)
      is distinct from
      (excluded.exercise_name,excluded.record_type,excluded.weight_kg,
       excluded.reps,excluded.record_date,excluded.record_value,
       excluded.record_unit,excluded.set_type,excluded.achieved_at);
    v_count:=v_count+1;
  end loop;

  delete from public.personal_records
  where user_id=p_user_id and workout_session_id=p_session_id and source_kind='workout_derived'
    and (coalesce(array_length(v_record_keys,1),0)=0 or not (record_key=any(v_record_keys)));

  update public.workout_sessions set
    derived_record_schema_version=p_schema_version,
    derived_record_formula_version=p_formula_version,
    derived_records_evaluated_at=clock_timestamp()
  where id=p_session_id and user_id=p_user_id;

  return jsonb_build_object(
    'session_id',p_session_id,
    'record_count',v_count,
    'schema_version',p_schema_version,
    'formula_version',p_formula_version,
    'status','current'
  );
end;
$function$;

create or replace function public.replace_workout_derived_records_atomic(
  p_user_id uuid,
  p_session_id uuid,
  p_schema_version smallint,
  p_formula_version text,
  p_records jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform public.assert_workout_actor(p_user_id);
  return private.replace_workout_derived_records_atomic(
    p_user_id,p_session_id,p_schema_version,p_formula_version,p_records
  );
end;
$function$;

revoke all on function private.replace_workout_derived_records_atomic(uuid,uuid,smallint,text,jsonb) from public,anon,authenticated;
revoke all on function public.replace_workout_derived_records_atomic(uuid,uuid,smallint,text,jsonb) from public,anon;
grant execute on function public.replace_workout_derived_records_atomic(uuid,uuid,smallint,text,jsonb) to authenticated,service_role;

create or replace view public.current_personal_records
with (security_invoker=true)
as
select record.*
from public.personal_records record
where record.source_kind='manual'
   or (
     record.source_kind='workout_derived'
     and record.schema_version=1
     and record.formula_version='wh6-v1'
     and exists (
       select 1 from public.workout_sessions session
       where session.id=record.workout_session_id
         and session.user_id=record.user_id
         and session.derived_record_schema_version=record.schema_version
         and session.derived_record_formula_version=record.formula_version
         and session.derived_records_evaluated_at is not null
         and coalesce(to_jsonb(session)->>'deleted_at','')=''
     )
   );

revoke all on table public.current_personal_records from public,anon;
grant select on table public.current_personal_records to authenticated,service_role;

comment on column public.personal_records.source_kind is
  'Manual rows remain member-managed. workout_derived rows are provenance-verified and RPC-managed.';
comment on column public.workout_sessions.derived_records_evaluated_at is
  'Freshness marker only; record count remains derived from current verified personal_records rows.';

commit;
