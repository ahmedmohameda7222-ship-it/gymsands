-- AW-3A structured performance metrics.
-- Forward-only migration. Compatibility marker intentionally remains unchanged.

do $aw3a_preflight$
declare
  v_version text;
  v_migration text;
begin
  select version, migration_version
    into v_version, v_migration
  from public.release_schema_compatibility
  where singleton = true;

  if v_version is distinct from '2' then
    raise exception 'AW-3A requires compatibility schema version 2; found version %.',
      v_version using errcode = '55000';
  end if;

  if v_migration = '20260722093115' then
    if not exists (
      select 1 from supabase_migrations.schema_migrations
      where version = '20260722093115' and name = 'active_workout_aw2c_timeline_events'
    ) then
      raise exception 'AW-3A Production marker exists without its reconciled AW-2C migration identity.' using errcode = '55000';
    end if;
  elsif v_migration = '20260721012814' and exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260722070000' and name = 'active_workout_aw2c_timeline_events'
  ) then
    null; -- Clean repository replay uses the immutable repository identity while Production uses its applied alias.
  else
    raise exception 'AW-3A requires Production marker 20260722093115 or the exact reconciled repository-replay identity; found marker %.',
      v_migration using errcode = '55000';
  end if;

  if to_regclass('public.workout_sessions') is null
     or to_regclass('public.exercise_logs') is null
     or to_regclass('public.workout_session_timeline_events') is null
     or to_regclass('public.workout_session_execution_states') is null
     or to_regprocedure('public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)') is null
     or to_regprocedure('public.complete_workout_session_atomic(uuid,uuid,jsonb,integer,text)') is null
     or to_regprocedure('private.aw2c_core_upsert_workout_set_logs_atomic(uuid,uuid,jsonb)') is null
     or to_regprocedure('private.append_workout_session_timeline_event(uuid,uuid,text,timestamptz,text,text,jsonb,uuid,uuid,uuid,smallint)') is null then
    raise exception 'AW-3A required workout roots or atomic authorities are missing.' using errcode = '55000';
  end if;

  if to_regclass('public.workout_performance_metric_definitions') is not null
     or to_regclass('public.exercise_log_metric_values') is not null
     or to_regprocedure('private.validate_workout_performance_metric_value(text,smallint,text,numeric,text,text,text,timestamptz)') is not null then
    raise exception 'AW-3A objects already exist or the migration is partially applied.' using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.workout_sessions s
    left join public.workout_session_execution_states e on e.workout_session_id = s.id
    where s.status::text = 'started' and e.workout_session_id is null
  ) then
    raise exception 'AW-3A preflight failed: an open workout session lacks execution state.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.workout_sessions s
    join public.workout_session_execution_states e on e.workout_session_id = s.id
    where s.status::text <> 'started'
  ) then
    raise exception 'AW-3A preflight failed: a terminal workout session retains execution state.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.workout_session_timeline_events e
    join public.workout_sessions s on s.id = e.workout_session_id
    where e.user_id <> s.user_id
  ) then
    raise exception 'AW-3A preflight failed: timeline owner mismatch.' using errcode = '23514';
  end if;
end
$aw3a_preflight$;

create temporary table aw3a_root_baseline (
  table_name text primary key,
  row_count bigint not null,
  row_hash text not null
) on commit drop;

insert into aw3a_root_baseline(table_name,row_count,row_hash)
select 'workout_sessions', count(*),
       encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(t)::text, '' order by t.id), ''),'UTF8'),'sha256'),'hex')
from public.workout_sessions t
union all
select 'exercise_logs', count(*),
       encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(t)::text, '' order by t.id), ''),'UTF8'),'sha256'),'hex')
from public.exercise_logs t
union all
select 'workout_session_timeline_events', count(*),
       encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(t)::text, '' order by t.sequence_number,t.id), ''),'UTF8'),'sha256'),'hex')
from public.workout_session_timeline_events t
union all
select 'workout_session_execution_states', count(*),
       encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(t)::text, '' order by t.workout_session_id), ''),'UTF8'),'sha256'),'hex')
from public.workout_session_execution_states t
union all
select 'workout_session_execution_commands', count(*),
       encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(t)::text, '' order by t.workout_session_id,t.command_id), ''),'UTF8'),'sha256'),'hex')
from public.workout_session_execution_commands t
union all
select 'workout_session_muscle_snapshots', count(*),
       encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(t)::text, '' order by t.id), ''),'UTF8'),'sha256'),'hex')
from public.workout_session_muscle_snapshots t
union all
select 'workout_session_muscle_snapshot_items', count(*),
       encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(t)::text, '' order by t.id), ''),'UTF8'),'sha256'),'hex')
from public.workout_session_muscle_snapshot_items t
union all
select 'release_schema_compatibility', count(*),
       encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(t)::text, '' order by t.singleton), ''),'UTF8'),'sha256'),'hex')
from public.release_schema_compatibility t;

alter table public.workout_sessions
  add constraint workout_sessions_id_user_id_key unique (id, user_id);

alter table public.exercise_logs
  add constraint exercise_logs_id_workout_session_id_key unique (id, workout_session_id);

create table public.workout_performance_metric_definitions (
  metric_key text not null,
  metric_version smallint not null,
  value_kind text not null,
  canonical_unit text not null,
  minimum_value numeric not null,
  maximum_value numeric not null,
  supports_side boolean not null,
  sort_order smallint not null,
  is_current boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  constraint workout_performance_metric_definitions_pkey primary key (metric_key, metric_version),
  constraint workout_performance_metric_definitions_metric_key_check
    check (char_length(metric_key) between 1 and 64 and metric_key ~ '^[a-z][a-z0-9_]*$'),
  constraint workout_performance_metric_definitions_metric_version_check check (metric_version > 0),
  constraint workout_performance_metric_definitions_value_kind_check check (value_kind in ('integer','decimal')),
  constraint workout_performance_metric_definitions_canonical_unit_check
    check (canonical_unit in ('count','kg','seconds','meters')),
  constraint workout_performance_metric_definitions_minimum_check check (minimum_value >= 0),
  constraint workout_performance_metric_definitions_range_check check (maximum_value >= minimum_value),
  constraint workout_performance_metric_definitions_sort_order_check check (sort_order > 0)
);

create unique index workout_performance_metric_definitions_one_current_key
  on public.workout_performance_metric_definitions(metric_key)
  where is_current;

insert into public.workout_performance_metric_definitions
(metric_key,metric_version,value_kind,canonical_unit,minimum_value,maximum_value,supports_side,sort_order,is_current)
values
('repetitions',1,'integer','count',0,100000,true,10,true),
('external_load_kg',1,'decimal','kg',0,10000,true,20,true),
('bodyweight_kg',1,'decimal','kg',0,1000,false,30,true),
('assistance_load_kg',1,'decimal','kg',0,1000,true,40,true),
('duration_seconds',1,'decimal','seconds',0,604800,true,50,true),
('distance_meters',1,'decimal','meters',0,10000000,true,60,true),
('rounds',1,'integer','count',0,100000,false,70,true);

create table public.exercise_log_metric_values (
  id uuid primary key default gen_random_uuid(),
  exercise_log_id uuid not null,
  workout_session_id uuid not null,
  user_id uuid not null,
  metric_key text not null,
  metric_version smallint not null default 1,
  side text not null default 'none',
  value numeric(20,6) not null,
  source text not null,
  source_provider text null,
  source_version text null,
  captured_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint exercise_log_metric_values_log_session_fkey
    foreign key (exercise_log_id,workout_session_id)
    references public.exercise_logs(id,workout_session_id) on delete cascade,
  constraint exercise_log_metric_values_session_user_fkey
    foreign key (workout_session_id,user_id)
    references public.workout_sessions(id,user_id) on delete cascade,
  constraint exercise_log_metric_values_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete cascade,
  constraint exercise_log_metric_values_definition_fkey
    foreign key (metric_key,metric_version)
    references public.workout_performance_metric_definitions(metric_key,metric_version) on delete restrict,
  constraint exercise_log_metric_values_identity_key unique (exercise_log_id,metric_key,side),
  constraint exercise_log_metric_values_side_check check (side in ('none','bilateral','left','right')),
  constraint exercise_log_metric_values_source_check check (source in ('manual','chatgpt','device','import','backfill')),
  constraint exercise_log_metric_values_source_provider_check check (
    source_provider is null or (
      char_length(source_provider) between 1 and 64
      and source_provider ~ '^[a-z0-9][a-z0-9._-]{0,63}$'
    )
  ),
  constraint exercise_log_metric_values_source_version_check check (
    source_version is null or (
      char_length(source_version) between 1 and 64
      and source_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
    )
  )
);

create index exercise_log_metric_values_session_log_metric_side_idx
  on public.exercise_log_metric_values(workout_session_id,exercise_log_id,metric_key,side);
create index exercise_log_metric_values_user_captured_idx
  on public.exercise_log_metric_values(user_id,captured_at desc,id desc);
create index exercise_log_metric_values_user_metric_captured_idx
  on public.exercise_log_metric_values(user_id,metric_key,captured_at desc,id desc);

create or replace function private.validate_workout_performance_metric_value(
  p_metric_key text,
  p_metric_version smallint,
  p_side text,
  p_value numeric,
  p_source text,
  p_source_provider text,
  p_source_version text,
  p_captured_at timestamptz
) returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_definition public.workout_performance_metric_definitions%rowtype;
begin
  select * into v_definition
  from public.workout_performance_metric_definitions d
  where d.metric_key = p_metric_key and d.metric_version = p_metric_version;

  if not found then
    raise exception 'Unknown workout performance metric definition/version.' using errcode='23503';
  end if;
  if p_value is null or p_value::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Workout performance metric value must be finite.' using errcode='22003';
  end if;
  if p_value < v_definition.minimum_value or p_value > v_definition.maximum_value then
    raise exception 'Workout performance metric value is outside the approved range.' using errcode='22003';
  end if;
  if v_definition.value_kind = 'integer' and trunc(p_value) <> p_value then
    raise exception 'Workout performance metric requires an integer value.' using errcode='22003';
  end if;
  if p_side not in ('none','bilateral','left','right') then
    raise exception 'Workout performance metric side is invalid.' using errcode='22023';
  end if;
  if not v_definition.supports_side and p_side <> 'none' then
    raise exception 'Workout performance metric does not support a side.' using errcode='22023';
  end if;
  if p_source not in ('manual','chatgpt','device','import','backfill') then
    raise exception 'Workout performance metric source is invalid.' using errcode='22023';
  end if;
  if p_source in ('device','import') and p_source_provider is null then
    raise exception 'Device/import workout metrics require a source provider.' using errcode='22023';
  end if;
  if p_source_provider is not null and (
    char_length(p_source_provider) not between 1 and 64
    or p_source_provider !~ '^[a-z0-9][a-z0-9._-]{0,63}$'
  ) then
    raise exception 'Workout performance metric provider is invalid.' using errcode='22023';
  end if;
  if p_source_version is not null and (
    char_length(p_source_version) not between 1 and 64
    or p_source_version !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
  ) then
    raise exception 'Workout performance metric source version is invalid.' using errcode='22023';
  end if;
  if p_captured_at is null or p_captured_at > clock_timestamp() + interval '5 minutes' then
    raise exception 'Workout performance metric capture time is invalid.' using errcode='22007';
  end if;
end
$function$;

revoke all on function private.validate_workout_performance_metric_value(text,smallint,text,numeric,text,text,text,timestamptz)
  from public, anon, authenticated, service_role;

create or replace function private.validate_exercise_log_metric_value_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_log_session uuid;
  v_session_user uuid;
begin
  select l.workout_session_id into v_log_session
  from public.exercise_logs l where l.id = new.exercise_log_id;
  if not found or v_log_session <> new.workout_session_id then
    raise exception 'Workout performance metric log/session identity is invalid.' using errcode='23514';
  end if;

  select s.user_id into v_session_user
  from public.workout_sessions s where s.id = new.workout_session_id;
  if not found or v_session_user <> new.user_id then
    raise exception 'Workout performance metric session/user identity is invalid.' using errcode='23514';
  end if;

  perform private.validate_workout_performance_metric_value(
    new.metric_key,new.metric_version,new.side,new.value,new.source,
    new.source_provider,new.source_version,new.captured_at
  );
  new.updated_at := case when tg_op = 'UPDATE' then clock_timestamp() else coalesce(new.updated_at,clock_timestamp()) end;
  return new;
end
$function$;

revoke all on function private.validate_exercise_log_metric_value_row()
  from public, anon, authenticated, service_role;

create trigger exercise_log_metric_values_validate
before insert or update on public.exercise_log_metric_values
for each row execute function private.validate_exercise_log_metric_value_row();

alter table public.exercise_log_metric_values enable row level security;
create policy exercise_log_metric_values_owner_select
on public.exercise_log_metric_values
for select to authenticated
using (user_id = (select auth.uid()) or private.is_admin());

revoke all on table public.workout_performance_metric_definitions from public, anon, authenticated, service_role;
grant select on table public.workout_performance_metric_definitions to authenticated, service_role;

revoke all on table public.exercise_log_metric_values from public, anon, authenticated, service_role;
grant select on table public.exercise_log_metric_values to authenticated;
grant select,insert,update,delete on table public.exercise_log_metric_values to service_role;

drop policy if exists exercise_logs_own_all on public.exercise_logs;
create policy exercise_logs_owner_or_admin_select
on public.exercise_logs
for select to authenticated
using (
  exists (
    select 1 from public.workout_sessions ws
    where ws.id = exercise_logs.workout_session_id
      and (ws.user_id = (select auth.uid()) or private.is_admin())
  )
);
revoke insert,update,delete on table public.exercise_logs from authenticated;
grant select on table public.exercise_logs to authenticated;

create or replace function private.workout_performance_metric_snapshot(p_exercise_log_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'metricKey',v.metric_key,
      'metricVersion',v.metric_version,
      'canonicalUnit',d.canonical_unit,
      'value',v.value,
      'side',v.side,
      'source',v.source,
      'sourceProvider',v.source_provider,
      'sourceVersion',v.source_version,
      'capturedAt',v.captured_at
    )
    order by d.sort_order,v.metric_key,
      case v.side when 'none' then 0 when 'bilateral' then 1 when 'left' then 2 else 3 end
  ),'[]'::jsonb)
  from public.exercise_log_metric_values v
  join public.workout_performance_metric_definitions d
    on d.metric_key=v.metric_key and d.metric_version=v.metric_version
  where v.exercise_log_id=p_exercise_log_id
$function$;

revoke all on function private.workout_performance_metric_snapshot(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.upsert_workout_set_logs_atomic(
  p_user_id uuid,
  p_session_id uuid,
  p_logs jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session public.workout_sessions%rowtype;
  v_item jsonb;
  v_metric jsonb;
  v_core_item jsonb;
  v_core_logs jsonb := '[]'::jsonb;
  v_structured boolean;
  v_metric_count integer;
  v_duplicate_count integer;
  v_compat_count integer;
  v_metric_key text;
  v_metric_version smallint;
  v_metric_side text;
  v_metric_value numeric;
  v_metric_source text;
  v_metric_provider text;
  v_metric_source_version text;
  v_metric_captured_at timestamptz;
  v_scalar_reps integer;
  v_scalar_weight numeric;
  v_input_reps integer;
  v_input_weight numeric;
  v_key text;
  v_before_by_key jsonb := '{}'::jsonb;
  v_before jsonb;
  v_before_metrics jsonb;
  v_after public.exercise_logs%rowtype;
  v_after_metrics jsonb;
  v_before_completed boolean;
  v_after_completed boolean;
  v_changed boolean;
  v_changed_fields text[];
  v_notes_changed boolean;
  v_fingerprint text;
  v_payload jsonb;
  v_result jsonb;
  v_source text;
  v_provider text;
  v_source_version text;
  v_desired jsonb;
  v_existing_captured_at timestamptz;
begin
  perform public.assert_workout_actor(p_user_id);
  select * into v_session
  from public.workout_sessions s
  where s.id=p_session_id and s.user_id=p_user_id
  for update;
  if not found then raise exception 'Workout session not found.' using errcode='P0002'; end if;
  if v_session.status::text <> 'started' then
    raise exception 'Only an active workout session can save sets.' using errcode='23514';
  end if;

  if p_logs is null then p_logs := '[]'::jsonb; end if;
  if jsonb_typeof(p_logs) <> 'array' then raise exception 'Workout set logs must be an array.' using errcode='23514'; end if;
  if jsonb_array_length(p_logs) > 500 then raise exception 'A workout session can contain at most 500 set logs.' using errcode='22023'; end if;

  for v_item in select value from jsonb_array_elements(p_logs)
  loop
    if nullif(v_item->>'plan_exercise_id','') is not null then
      v_key := 'plan:'||(v_item->>'plan_exercise_id')||':set:'||coalesce(v_item->>'set_number','');
      select to_jsonb(l),private.workout_performance_metric_snapshot(l.id)
        into v_before,v_before_metrics
      from public.exercise_logs l
      where l.workout_session_id=p_session_id
        and l.plan_exercise_id=(v_item->>'plan_exercise_id')::uuid
        and l.set_number=(v_item->>'set_number')::integer
      for update;
    else
      v_key := 'order:'||coalesce(v_item->>'exercise_order','')||':set:'||coalesce(v_item->>'set_number','');
      select to_jsonb(l),private.workout_performance_metric_snapshot(l.id)
        into v_before,v_before_metrics
      from public.exercise_logs l
      where l.workout_session_id=p_session_id
        and l.plan_exercise_id is null
        and l.exercise_order=(v_item->>'exercise_order')::integer
        and l.set_number=(v_item->>'set_number')::integer
      for update;
    end if;
    v_before_by_key := jsonb_set(
      v_before_by_key,array[v_key],
      jsonb_build_object('log',coalesce(v_before,'null'::jsonb),'metrics',coalesce(v_before_metrics,'[]'::jsonb)),true
    );
    v_before := null;
    v_before_metrics := null;

    v_structured := v_item ? 'performance_metrics';
    v_core_item := v_item;
    if v_structured then
      if jsonb_typeof(v_item->'performance_metrics') <> 'array' then
        raise exception 'performance_metrics must be an array.' using errcode='22023';
      end if;
      v_metric_count := jsonb_array_length(v_item->'performance_metrics');
      if v_metric_count > 16 then raise exception 'A set can contain at most 16 performance metrics.' using errcode='22023'; end if;

      select count(*) into v_duplicate_count
      from (
        select value->>'metric_key',coalesce(nullif(value->>'side',''),'none')
        from jsonb_array_elements(v_item->'performance_metrics')
        group by 1,2 having count(*)>1
      ) q;
      if v_duplicate_count>0 then raise exception 'Performance metrics contain a duplicate metric/side.' using errcode='23505'; end if;

      select count(*) into v_compat_count
      from (
        select value->>'metric_key'
        from jsonb_array_elements(v_item->'performance_metrics')
        where value->>'metric_key' in ('repetitions','external_load_kg')
          and coalesce(nullif(value->>'side',''),'none') in ('none','bilateral')
        group by 1 having count(*)>1
      ) q;
      if v_compat_count>0 then raise exception 'Performance metrics cannot include both none and bilateral compatibility values.' using errcode='22023'; end if;

      v_scalar_reps := null;
      v_scalar_weight := null;
      for v_metric in select value from jsonb_array_elements(v_item->'performance_metrics')
      loop
        v_metric_key := nullif(v_metric->>'metric_key','');
        v_metric_version := coalesce(nullif(v_metric->>'metric_version','')::smallint,1);
        v_metric_side := coalesce(nullif(v_metric->>'side',''),'none');
        v_metric_value := nullif(v_metric->>'value','')::numeric;
        v_metric_source := coalesce(nullif(v_metric->>'source',''),nullif(v_item->>'metric_source',''),case when coalesce(auth.role(),'')='service_role' then 'chatgpt' else 'manual' end);
        v_metric_provider := coalesce(nullif(v_metric->>'source_provider',''),nullif(v_item->>'metric_source_provider',''),case when v_metric_source='chatgpt' then 'openai' end);
        v_metric_source_version := coalesce(nullif(v_metric->>'source_version',''),nullif(v_item->>'metric_source_version',''));
        v_metric_captured_at := coalesce(
          nullif(v_metric->>'captured_at','')::timestamptz,
          nullif(v_item->>'completed_at','')::timestamptz,
          clock_timestamp()
        );
        perform private.validate_workout_performance_metric_value(
          v_metric_key,v_metric_version,v_metric_side,v_metric_value,
          v_metric_source,v_metric_provider,v_metric_source_version,v_metric_captured_at
        );
        if v_metric_key='repetitions' and v_metric_side in ('none','bilateral') then
          v_scalar_reps := v_metric_value::integer;
        elsif v_metric_key='external_load_kg' and v_metric_side in ('none','bilateral') then
          v_scalar_weight := v_metric_value;
        end if;
      end loop;

      v_input_reps := nullif(v_item->>'reps','')::integer;
      v_input_weight := nullif(v_item->>'weight_kg','')::numeric;
      if v_item ? 'reps' and v_input_reps is distinct from v_scalar_reps then
        raise exception 'Scalar repetitions disagree with structured repetitions.' using errcode='23514';
      end if;
      if v_item ? 'weight_kg' and v_input_weight is distinct from v_scalar_weight then
        raise exception 'Scalar weight disagrees with structured external load.' using errcode='23514';
      end if;
      v_core_item := v_core_item || jsonb_build_object('reps',v_scalar_reps,'weight_kg',v_scalar_weight);
    else
      v_source := coalesce(nullif(v_item->>'metric_source',''),case when coalesce(auth.role(),'')='service_role' then 'chatgpt' else 'manual' end);
      v_provider := coalesce(nullif(v_item->>'metric_source_provider',''),case when v_source='chatgpt' then 'openai' end);
      v_source_version := nullif(v_item->>'metric_source_version','');
      perform private.validate_workout_performance_metric_value(
        'repetitions',1,'none',coalesce(nullif(v_item->>'reps','')::numeric,0),
        v_source,v_provider,v_source_version,
        coalesce(nullif(v_item->>'completed_at','')::timestamptz,clock_timestamp())
      );
      perform private.validate_workout_performance_metric_value(
        'external_load_kg',1,'none',coalesce(nullif(v_item->>'weight_kg','')::numeric,0),
        v_source,v_provider,v_source_version,
        coalesce(nullif(v_item->>'completed_at','')::timestamptz,clock_timestamp())
      );
    end if;
    v_core_logs := v_core_logs || jsonb_build_array(v_core_item);
  end loop;

  v_result := private.aw2c_core_upsert_workout_set_logs_atomic(p_user_id,p_session_id,v_core_logs);

  for v_item in select value from jsonb_array_elements(p_logs)
  loop
    if nullif(v_item->>'plan_exercise_id','') is not null then
      v_key := 'plan:'||(v_item->>'plan_exercise_id')||':set:'||coalesce(v_item->>'set_number','');
      select * into strict v_after from public.exercise_logs l
      where l.workout_session_id=p_session_id
        and l.plan_exercise_id=(v_item->>'plan_exercise_id')::uuid
        and l.set_number=(v_item->>'set_number')::integer;
    else
      v_key := 'order:'||coalesce(v_item->>'exercise_order','')||':set:'||coalesce(v_item->>'set_number','');
      select * into strict v_after from public.exercise_logs l
      where l.workout_session_id=p_session_id
        and l.plan_exercise_id is null
        and l.exercise_order=(v_item->>'exercise_order')::integer
        and l.set_number=(v_item->>'set_number')::integer;
    end if;

    v_structured := v_item ? 'performance_metrics';
    if v_structured then
      v_desired := '[]'::jsonb;
      for v_metric in select value from jsonb_array_elements(v_item->'performance_metrics')
      loop
        v_metric_key := nullif(v_metric->>'metric_key','');
        v_metric_version := coalesce(nullif(v_metric->>'metric_version','')::smallint,1);
        v_metric_side := coalesce(nullif(v_metric->>'side',''),'none');
        v_metric_value := nullif(v_metric->>'value','')::numeric;
        v_metric_source := coalesce(nullif(v_metric->>'source',''),nullif(v_item->>'metric_source',''),case when coalesce(auth.role(),'')='service_role' then 'chatgpt' else 'manual' end);
        v_metric_provider := coalesce(nullif(v_metric->>'source_provider',''),nullif(v_item->>'metric_source_provider',''),case when v_metric_source='chatgpt' then 'openai' end);
        v_metric_source_version := coalesce(nullif(v_metric->>'source_version',''),nullif(v_item->>'metric_source_version',''));
        select captured_at into v_existing_captured_at
        from public.exercise_log_metric_values
        where exercise_log_id=v_after.id and metric_key=v_metric_key and side=v_metric_side;
        v_metric_captured_at := coalesce(
          nullif(v_metric->>'captured_at','')::timestamptz,
          v_existing_captured_at,
          v_after.completed_at,
          clock_timestamp()
        );
        insert into public.exercise_log_metric_values(
          exercise_log_id,workout_session_id,user_id,metric_key,metric_version,side,value,
          source,source_provider,source_version,captured_at
        ) values (
          v_after.id,p_session_id,p_user_id,v_metric_key,v_metric_version,v_metric_side,v_metric_value,
          v_metric_source,v_metric_provider,v_metric_source_version,v_metric_captured_at
        )
        on conflict (exercise_log_id,metric_key,side) do update set
          metric_version=excluded.metric_version,
          value=excluded.value,
          source=excluded.source,
          source_provider=excluded.source_provider,
          source_version=excluded.source_version,
          captured_at=excluded.captured_at,
          updated_at=case when
            public.exercise_log_metric_values.metric_version is distinct from excluded.metric_version
            or public.exercise_log_metric_values.value is distinct from excluded.value
            or public.exercise_log_metric_values.source is distinct from excluded.source
            or public.exercise_log_metric_values.source_provider is distinct from excluded.source_provider
            or public.exercise_log_metric_values.source_version is distinct from excluded.source_version
            or public.exercise_log_metric_values.captured_at is distinct from excluded.captured_at
          then clock_timestamp() else public.exercise_log_metric_values.updated_at end;
        v_desired := v_desired || jsonb_build_array(jsonb_build_object('metric_key',v_metric_key,'side',v_metric_side));
      end loop;

      delete from public.exercise_log_metric_values existing
      where existing.exercise_log_id=v_after.id
        and not exists (
          select 1 from jsonb_array_elements(v_desired) d
          where d->>'metric_key'=existing.metric_key and d->>'side'=existing.side
        );
    else
      v_source := coalesce(nullif(v_item->>'metric_source',''),case when coalesce(auth.role(),'')='service_role' then 'chatgpt' else 'manual' end);
      v_provider := coalesce(nullif(v_item->>'metric_source_provider',''),case when v_source='chatgpt' then 'openai' end);
      v_source_version := nullif(v_item->>'metric_source_version','');

      if v_item ? 'reps' then
        if v_after.reps is null then
          delete from public.exercise_log_metric_values
          where exercise_log_id=v_after.id and metric_key='repetitions' and side in ('none','bilateral');
        else
          select captured_at into v_existing_captured_at from public.exercise_log_metric_values
          where exercise_log_id=v_after.id and metric_key='repetitions' and side='none';
          insert into public.exercise_log_metric_values(
            exercise_log_id,workout_session_id,user_id,metric_key,metric_version,side,value,
            source,source_provider,source_version,captured_at
          ) values (
            v_after.id,p_session_id,p_user_id,'repetitions',1,'none',v_after.reps,
            v_source,v_provider,v_source_version,
            coalesce(v_existing_captured_at,v_after.completed_at,clock_timestamp())
          )
          on conflict (exercise_log_id,metric_key,side) do update set
            metric_version=1,value=excluded.value,source=excluded.source,
            source_provider=excluded.source_provider,source_version=excluded.source_version,
            captured_at=excluded.captured_at,
            updated_at=case when
              public.exercise_log_metric_values.value is distinct from excluded.value
              or public.exercise_log_metric_values.source is distinct from excluded.source
              or public.exercise_log_metric_values.source_provider is distinct from excluded.source_provider
              or public.exercise_log_metric_values.source_version is distinct from excluded.source_version
            then clock_timestamp() else public.exercise_log_metric_values.updated_at end;
          delete from public.exercise_log_metric_values
          where exercise_log_id=v_after.id and metric_key='repetitions' and side='bilateral';
        end if;
      end if;

      if v_item ? 'weight_kg' then
        if v_after.weight_kg is null then
          delete from public.exercise_log_metric_values
          where exercise_log_id=v_after.id and metric_key='external_load_kg' and side in ('none','bilateral');
        else
          select captured_at into v_existing_captured_at from public.exercise_log_metric_values
          where exercise_log_id=v_after.id and metric_key='external_load_kg' and side='none';
          insert into public.exercise_log_metric_values(
            exercise_log_id,workout_session_id,user_id,metric_key,metric_version,side,value,
            source,source_provider,source_version,captured_at
          ) values (
            v_after.id,p_session_id,p_user_id,'external_load_kg',1,'none',v_after.weight_kg,
            v_source,v_provider,v_source_version,
            coalesce(v_existing_captured_at,v_after.completed_at,clock_timestamp())
          )
          on conflict (exercise_log_id,metric_key,side) do update set
            metric_version=1,value=excluded.value,source=excluded.source,
            source_provider=excluded.source_provider,source_version=excluded.source_version,
            captured_at=excluded.captured_at,
            updated_at=case when
              public.exercise_log_metric_values.value is distinct from excluded.value
              or public.exercise_log_metric_values.source is distinct from excluded.source
              or public.exercise_log_metric_values.source_provider is distinct from excluded.source_provider
              or public.exercise_log_metric_values.source_version is distinct from excluded.source_version
            then clock_timestamp() else public.exercise_log_metric_values.updated_at end;
          delete from public.exercise_log_metric_values
          where exercise_log_id=v_after.id and metric_key='external_load_kg' and side='bilateral';
        end if;
      end if;
    end if;

    v_before := v_before_by_key->v_key->'log';
    v_before_metrics := coalesce(v_before_by_key->v_key->'metrics','[]'::jsonb);
    v_after_metrics := private.workout_performance_metric_snapshot(v_after.id);
    v_before_completed := coalesce((v_before->>'completed_at') is not null,false);
    v_after_completed := v_after.completed_at is not null;

    if v_before is null or v_before='null'::jsonb then
      v_changed := true;
    else
      v_changed := (v_before->>'reps')::integer is distinct from v_after.reps
        or (v_before->>'weight_kg')::numeric is distinct from v_after.weight_kg
        or (v_before->>'completed_at')::timestamptz is distinct from v_after.completed_at
        or v_before->>'set_type' is distinct from v_after.set_type
        or v_before->>'notes' is distinct from v_after.notes
        or v_before->>'exercise_name' is distinct from v_after.exercise_name
        or (v_before->>'exercise_order')::integer is distinct from v_after.exercise_order
        or (v_before->>'plan_exercise_id')::uuid is distinct from v_after.plan_exercise_id
        or v_before_metrics is distinct from v_after_metrics;
    end if;

    if (v_before is null or v_before='null'::jsonb or not v_before_completed) and v_after_completed then
      v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
        'exerciseLogId',v_after.id,'exerciseOrder',v_after.exercise_order,'planExerciseId',v_after.plan_exercise_id,
        'exerciseName',v_after.exercise_name,'setNumber',v_after.set_number,'reps',v_after.reps,
        'weightKg',v_after.weight_kg,'completedAt',v_after.completed_at,'setType',v_after.set_type,
        'performanceMetrics',v_after_metrics
      )::text,'UTF8'),'sha256'),'hex');
      perform private.append_workout_session_timeline_event(
        p_session_id,p_user_id,'set_completed',v_after.completed_at,'runtime',
        'runtime:set_completed:'||v_after.id::text||':'||v_fingerprint,
        jsonb_build_object(
          'exerciseOrder',v_after.exercise_order,'planExerciseId',v_after.plan_exercise_id,
          'exerciseNameSnapshot',v_after.exercise_name,'setNumber',v_after.set_number,
          'reps',v_after.reps,'weightKg',v_after.weight_kg,'completedAt',v_after.completed_at,
          'setType',v_after.set_type,'performanceMetrics',v_after_metrics
        ),null,v_after.id,null,1::smallint
      );
    elsif v_before is not null and v_before<>'null'::jsonb and v_before_completed and v_changed then
      v_notes_changed := (v_before->>'notes') is distinct from v_after.notes;
      v_changed_fields := array_remove(array[
        case when (v_before->>'reps')::integer is distinct from v_after.reps then 'reps' end,
        case when (v_before->>'weight_kg')::numeric is distinct from v_after.weight_kg then 'weightKg' end,
        case when (v_before->>'completed_at')::timestamptz is distinct from v_after.completed_at then 'completedAt' end,
        case when v_before->>'set_type' is distinct from v_after.set_type then 'setType' end,
        case when v_notes_changed then 'notes' end,
        case when v_before->>'exercise_name' is distinct from v_after.exercise_name then 'exerciseName' end,
        case when (v_before->>'exercise_order')::integer is distinct from v_after.exercise_order then 'exerciseOrder' end,
        case when (v_before->>'plan_exercise_id')::uuid is distinct from v_after.plan_exercise_id then 'planExerciseId' end,
        case when v_before_metrics is distinct from v_after_metrics then 'performanceMetrics' end
      ],null);
      v_payload := jsonb_build_object(
        'exerciseOrder',v_after.exercise_order,'planExerciseId',v_after.plan_exercise_id,
        'exerciseNameSnapshot',v_after.exercise_name,'setNumber',v_after.set_number,
        'changedFields',to_jsonb(v_changed_fields),
        'before',jsonb_build_object(
          'reps',(v_before->>'reps')::integer,'weightKg',(v_before->>'weight_kg')::numeric,
          'completed',(v_before->>'completed_at') is not null,'setType',v_before->>'set_type'
        ),
        'after',jsonb_build_object(
          'reps',v_after.reps,'weightKg',v_after.weight_kg,
          'completed',v_after.completed_at is not null,'setType',v_after.set_type
        ),
        'performanceMetrics',v_after_metrics,
        'notesChanged',v_notes_changed
      );
      v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
        'beforeLog',v_before-array['id','created_at','updated_at'],
        'beforeMetrics',v_before_metrics,
        'afterLog',to_jsonb(v_after)-array['id','created_at','updated_at'],
        'afterMetrics',v_after_metrics
      )::text,'UTF8'),'sha256'),'hex');
      perform private.append_workout_session_timeline_event(
        p_session_id,p_user_id,'set_edited',clock_timestamp(),'runtime',
        'runtime:set_edited:'||v_after.id::text||':'||v_fingerprint,
        v_payload,null,v_after.id,null,1::smallint
      );
    end if;
  end loop;

  select coalesce(jsonb_agg(to_jsonb(l) order by l.exercise_order nulls last,l.plan_exercise_id,l.set_number),'[]'::jsonb)
  into v_result
  from public.exercise_logs l
  where l.workout_session_id=p_session_id;
  return v_result;
end
$function$;

revoke all on function public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb) from public,anon;
grant execute on function public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb) to authenticated,service_role;

insert into public.exercise_log_metric_values(
  exercise_log_id,workout_session_id,user_id,metric_key,metric_version,side,value,
  source,source_provider,source_version,captured_at
)
select l.id,l.workout_session_id,s.user_id,'repetitions',1,'none',l.reps,
       'backfill',null,null,coalesce(l.completed_at,l.created_at)
from public.exercise_logs l
join public.workout_sessions s on s.id=l.workout_session_id
where l.reps is not null
on conflict (exercise_log_id,metric_key,side) do nothing;

insert into public.exercise_log_metric_values(
  exercise_log_id,workout_session_id,user_id,metric_key,metric_version,side,value,
  source,source_provider,source_version,captured_at
)
select l.id,l.workout_session_id,s.user_id,'external_load_kg',1,'none',l.weight_kg,
       'backfill',null,null,coalesce(l.completed_at,l.created_at)
from public.exercise_logs l
join public.workout_sessions s on s.id=l.workout_session_id
where l.weight_kg is not null
on conflict (exercise_log_id,metric_key,side) do nothing;

do $aw3a_postflight$
declare
  v_bad bigint;
  v_before record;
  v_after_count bigint;
  v_after_hash text;
  v_marker text;
begin
  if (select count(*) from public.workout_performance_metric_definitions) <> 7 then
    raise exception 'AW-3A definition seed count mismatch.' using errcode='23514';
  end if;
  if exists (
    select 1 from public.exercise_log_metric_values
    where source='backfill' and metric_key not in ('repetitions','external_load_kg')
  ) then
    raise exception 'AW-3A backfill invented an unapproved metric.' using errcode='23514';
  end if;
  if (select count(*) from public.exercise_log_metric_values where source='backfill' and metric_key='repetitions')
     <> (select count(*) from public.exercise_logs where reps is not null) then
    raise exception 'AW-3A repetitions backfill count mismatch.' using errcode='23514';
  end if;
  if (select count(*) from public.exercise_log_metric_values where source='backfill' and metric_key='external_load_kg')
     <> (select count(*) from public.exercise_logs where weight_kg is not null) then
    raise exception 'AW-3A external-load backfill count mismatch.' using errcode='23514';
  end if;

  for v_before in select * from aw3a_root_baseline loop
    execute format(
      'select count(*),encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(t)::text, '''' order by %s), ''''),''UTF8''),''sha256''),''hex'') from public.%I t',
      case v_before.table_name
        when 'workout_sessions' then 't.id'
        when 'exercise_logs' then 't.id'
        when 'workout_session_timeline_events' then 't.sequence_number,t.id'
        when 'workout_session_execution_states' then 't.workout_session_id'
        when 'workout_session_execution_commands' then 't.workout_session_id,t.command_id'
        when 'workout_session_muscle_snapshots' then 't.id'
        when 'workout_session_muscle_snapshot_items' then 't.id'
        when 'release_schema_compatibility' then 't.singleton'
      end,
      v_before.table_name
    ) into v_after_count,v_after_hash;
    if v_after_count <> v_before.row_count or v_after_hash <> v_before.row_hash then
      raise exception 'AW-3A unexpectedly changed root table %.',v_before.table_name using errcode='23514';
    end if;
  end loop;

  select count(*) into v_bad
  from public.exercise_log_metric_values v
  left join public.exercise_logs l on l.id=v.exercise_log_id and l.workout_session_id=v.workout_session_id
  left join public.workout_sessions s on s.id=v.workout_session_id and s.user_id=v.user_id
  where l.id is null or s.id is null;
  if v_bad<>0 then raise exception 'AW-3A created orphan metric rows.' using errcode='23514'; end if;

  select migration_version into strict v_marker
  from public.release_schema_compatibility where singleton=true;
  if v_marker = '20260722093115' then
    null;
  elsif v_marker = '20260721012814' and exists (
    select 1 from supabase_migrations.schema_migrations
    where version='20260722070000' and name='active_workout_aw2c_timeline_events'
  ) then
    null;
  else
    raise exception 'AW-3A unexpectedly changed or entered with an unreconciled compatibility marker %.',v_marker using errcode='23514';
  end if;
end
$aw3a_postflight$;
