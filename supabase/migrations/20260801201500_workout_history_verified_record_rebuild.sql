begin;

-- A record correction, deletion, restore, or out-of-order completion can change
-- every later achievement for the same stable exercise identity. This authority
-- replaces the complete affected identity projection in one transaction.
create or replace function public.replace_workout_derived_records_for_identities_atomic(
  p_user_id uuid,
  p_exercise_identities text[],
  p_evaluated_session_ids uuid[],
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
  v_identities text[]:=coalesce(p_exercise_identities,array[]::text[]);
  v_sessions uuid[]:=coalesce(p_evaluated_session_ids,array[]::uuid[]);
  v_payload jsonb:=coalesce(p_records,'[]'::jsonb);
  v_item jsonb;
  v_log public.exercise_logs%rowtype;
  v_session public.workout_sessions%rowtype;
  v_record_key text;
  v_record_keys text[]:=array[]::text[];
  v_identity_kind text;
  v_identity text;
  v_record_type text;
  v_record_value numeric;
  v_record_unit text;
  v_context text;
  v_set_type text;
  v_achieved_at timestamptz;
  v_identity_valid boolean;
  v_count integer:=0;
begin
  perform public.assert_workout_actor(p_user_id);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text||':workout-derived-record-rebuild',0)
  );

  if p_schema_version<>1
     or p_formula_version<>'wh6-v1'
     or nullif(btrim(coalesce(p_formula_version,'')),'') is null
     or char_length(p_formula_version)>80
     or p_formula_version~'[[:cntrl:]]' then
    raise exception 'Derived record rebuild version is invalid.' using errcode='22023';
  end if;
  if coalesce(array_length(v_identities,1),0)>100
     or exists(
       select 1 from unnest(v_identities) identity
       where nullif(btrim(identity),'') is null
          or char_length(identity)>240
          or identity~'[[:cntrl:]]'
     ) then
    raise exception 'Derived record rebuild identity scope is invalid.' using errcode='22023';
  end if;
  if coalesce(array_length(v_sessions,1),0)>5000 then
    raise exception 'Derived record rebuild session scope is too large.' using errcode='22023';
  end if;
  if jsonb_typeof(v_payload)<>'array' or jsonb_array_length(v_payload)>5000
     or octet_length(v_payload::text)>2097152 then
    raise exception 'Derived record rebuild payload is invalid.' using errcode='22023';
  end if;
  if coalesce(array_length(v_identities,1),0)=0 and jsonb_array_length(v_payload)>0 then
    raise exception 'Derived records require an identity scope.' using errcode='22023';
  end if;
  if exists(
    select 1
    from unnest(v_sessions) evaluated_id
    left join public.workout_sessions session
      on session.id=evaluated_id and session.user_id=p_user_id
    where session.id is null
       or session.deleted_at is not null
       or session.status::text not in ('completed','cancelled')
  ) then
    raise exception 'Derived record rebuild session scope is invalid.' using errcode='23514';
  end if;

  if coalesce(array_length(v_identities,1),0)>0 then
    perform 1
    from public.personal_records record
    where record.user_id=p_user_id
      and record.source_kind='workout_derived'
      and record.exercise_identity=any(v_identities)
    for update;

    delete from public.personal_records record
    where record.user_id=p_user_id
      and record.source_kind='workout_derived'
      and record.exercise_identity=any(v_identities);
  end if;

  for v_item in select value from jsonb_array_elements(v_payload)
  loop
    if jsonb_typeof(v_item)<>'object' then
      raise exception 'Derived record rebuild item is invalid.' using errcode='22023';
    end if;

    begin
      select * into v_log
      from public.exercise_logs log
      where log.id=nullif(v_item->>'exercise_log_id','')::uuid
      for share;
    exception when invalid_text_representation then
      raise exception 'Derived record source log is invalid.' using errcode='22023';
    end;
    if v_log.id is null then
      raise exception 'Derived record source log is invalid.' using errcode='23514';
    end if;

    select * into v_session
    from public.workout_sessions session
    where session.id=v_log.workout_session_id
      and session.user_id=p_user_id
      and session.deleted_at is null
      and session.status::text in ('completed','cancelled')
    for share;
    if v_session.id is null then
      raise exception 'Derived record source session is invalid.' using errcode='23514';
    end if;

    v_identity_kind:=nullif(v_item->>'exercise_identity_kind','');
    v_identity:=nullif(v_item->>'exercise_identity','');
    v_record_type:=nullif(v_item->>'record_type','');
    begin
      v_record_value:=nullif(v_item->>'record_value','')::numeric;
      v_achieved_at:=nullif(v_item->>'achieved_at','')::timestamptz;
    exception when invalid_text_representation then
      raise exception 'Derived record values are invalid.' using errcode='22023';
    end;
    v_record_unit:=nullif(v_item->>'record_unit','');
    v_context:=nullif(v_item->>'comparison_context_key','');
    v_set_type:=nullif(v_item->>'set_type','');

    if not (v_identity=any(v_identities))
       or v_identity_kind not in ('global','custom','provider','plan_activity','plan_exercise','source_workout')
       or v_record_type not in ('highest_load','same_load_max_repetitions','estimated_one_rep_max','exercise_session_volume')
       or v_record_unit not in ('kg','repetitions','kg_repetitions')
       or v_set_type not in ('working','normal','failure','drop','backoff','amrap','other')
       or v_record_value is null or v_record_value<0
       or v_record_value in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)
       or v_achieved_at is null or v_achieved_at<>v_log.completed_at
       or nullif(btrim(coalesce(v_context,'')),'') is null
       or char_length(v_context)>300 or v_context~'[[:cntrl:]]'
       or nullif(btrim(coalesce(v_identity,'')),'') is null
       or char_length(v_identity)>240 or v_identity~'[[:cntrl:]]' then
      raise exception 'Derived record rebuild values are invalid.' using errcode='23514';
    end if;

    v_identity_valid:=false;
    if v_identity_kind in ('global','custom','provider') then
      select exists(
        select 1
        from public.workout_session_muscle_snapshots snapshot
        join public.workout_session_muscle_snapshot_items item
          on item.snapshot_id=snapshot.id
        where snapshot.workout_session_id=v_session.id
          and snapshot.user_id=p_user_id
          and (
            (v_log.plan_activity_id is not null and item.source_plan_activity_id=v_log.plan_activity_id)
            or (v_log.plan_exercise_id is not null and item.source_plan_exercise_id=v_log.plan_exercise_id)
            or (item.item_order=v_log.exercise_order)
          )
          and v_identity=(case
            when item.actual_provider is not null and item.actual_provider_activity_id is not null
              then 'provider:'||item.actual_provider||':'||item.actual_provider_activity_id
            when item.actual_global_exercise_id is not null
              then 'global:'||item.actual_global_exercise_id::text
            when item.actual_custom_exercise_id is not null
              then 'custom:'||item.actual_custom_exercise_id::text
            when item.planned_provider is not null and item.planned_provider_activity_id is not null
              then 'provider:'||item.planned_provider||':'||item.planned_provider_activity_id
            when item.planned_global_exercise_id is not null
              then 'global:'||item.planned_global_exercise_id::text
            when item.planned_custom_exercise_id is not null
              then 'custom:'||item.planned_custom_exercise_id::text
            else null end)
      ) into v_identity_valid;
    elsif v_identity_kind='plan_activity' then
      v_identity_valid:=v_log.plan_activity_id is not null
        and v_identity='plan_activity:'||v_log.plan_activity_id::text;
    elsif v_identity_kind='plan_exercise' then
      v_identity_valid:=v_log.plan_exercise_id is not null
        and v_identity='plan_exercise:'||v_log.plan_exercise_id::text;
    elsif v_identity_kind='source_workout' then
      v_identity_valid:=v_session.workout_id is not null
        and v_identity='source_workout:'||v_session.workout_id::text;
    end if;
    if not coalesce(v_identity_valid,false) then
      raise exception 'Derived exercise identity is not canonical for its source log.' using errcode='23514';
    end if;

    v_record_key:=encode(extensions.digest(
      concat_ws('|','workout-record-v1',p_user_id::text,v_session.id::text,v_log.id::text,
        v_identity_kind,v_identity,v_record_type,v_context,p_schema_version::text,p_formula_version),
      'sha256'
    ),'hex');
    if v_record_key=any(v_record_keys) then
      raise exception 'Derived record rebuild contains duplicate stable records.' using errcode='23505';
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
      v_session.id,v_log.id,v_record_type,v_record_value,v_record_unit,
      v_context,v_set_type,p_schema_version,p_formula_version,v_achieved_at
    );
    v_count:=v_count+1;
  end loop;

  if coalesce(array_length(v_sessions,1),0)>0 then
    update public.workout_sessions session set
      derived_record_schema_version=p_schema_version,
      derived_record_formula_version=p_formula_version,
      derived_records_evaluated_at=clock_timestamp()
    where session.user_id=p_user_id
      and session.id=any(v_sessions)
      and session.deleted_at is null
      and session.status::text in ('completed','cancelled');
  end if;

  return jsonb_build_object(
    'record_count',v_count,
    'identity_count',coalesce(array_length(v_identities,1),0),
    'evaluated_session_count',coalesce(array_length(v_sessions,1),0),
    'schema_version',p_schema_version,
    'formula_version',p_formula_version,
    'status','current'
  );
end;
$function$;

revoke all on function public.replace_workout_derived_records_for_identities_atomic(
  uuid,text[],uuid[],smallint,text,jsonb
) from public,anon,authenticated;
grant execute on function public.replace_workout_derived_records_for_identities_atomic(
  uuid,text[],uuid[],smallint,text,jsonb
) to service_role;

do $verified_record_rebuild_postflight$
begin
  if to_regprocedure(
    'public.replace_workout_derived_records_for_identities_atomic(uuid,text[],uuid[],smallint,text,jsonb)'
  ) is null then
    raise exception 'Verified record rebuild authority is missing.';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.replace_workout_derived_records_for_identities_atomic(uuid,text[],uuid[],smallint,text,jsonb)',
    'execute'
  ) then
    raise exception 'Verified record rebuild authority is browser executable.';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.replace_workout_derived_records_for_identities_atomic(uuid,text[],uuid[],smallint,text,jsonb)',
    'execute'
  ) then
    raise exception 'Verified record rebuild service grant is missing.';
  end if;
end
$verified_record_rebuild_postflight$;

notify pgrst, 'reload schema';

commit;
