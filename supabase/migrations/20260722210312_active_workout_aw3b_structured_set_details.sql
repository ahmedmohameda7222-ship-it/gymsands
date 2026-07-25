-- AW-3B normalized set details and multi-stage set segments.
-- Forward-only migration. The release compatibility marker intentionally remains unchanged.

do $aw3b_preflight$
declare
  v_schema_version text;
  v_marker text;
begin
  select version,migration_version into strict v_schema_version,v_marker
  from public.release_schema_compatibility where singleton=true;
  if v_schema_version is distinct from '2' then
    raise exception 'AW-3B requires compatibility schema version 2; found version %.',v_schema_version using errcode='55000';
  end if;
  if v_marker not in ('20260722161542','20260721012814') then
    raise exception 'AW-3B requires the released AW-3A compatibility marker or the exact repository-replay context; found %.',v_marker using errcode='55000';
  end if;
  if not exists (
    select 1 from supabase_migrations.schema_migrations
    where (version='20260722161542' and name='active_workout_aw3a_structured_metrics')
       or (version='20260722113000' and name='active_workout_aw3a_structured_metrics')
  ) then
    raise exception 'AW-3B requires the exact reconciled AW-3A migration identity.' using errcode='55000';
  end if;
  if to_regclass('public.exercise_logs') is null
     or to_regclass('public.exercise_log_metric_values') is null
     or to_regclass('public.workout_performance_metric_definitions') is null
     or to_regprocedure('public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)') is null
     or to_regprocedure('public.complete_workout_session_atomic(uuid,uuid,jsonb,integer,text)') is null
     or to_regprocedure('private.aw2c_core_complete_workout_session_atomic(uuid,uuid,jsonb,integer,text)') is null
     or to_regprocedure('private.aw2c_core_upsert_workout_set_logs_atomic(uuid,uuid,jsonb)') is null
     or to_regprocedure('private.workout_performance_metric_snapshot(uuid)') is null
     or to_regprocedure('private.append_workout_session_timeline_event(uuid,uuid,text,timestamptz,text,text,jsonb,uuid,uuid,uuid,smallint)') is null then
    raise exception 'AW-3B required roots or atomic authorities are missing.' using errcode='55000';
  end if;
  if to_regclass('public.exercise_log_set_details') is not null
     or to_regclass('public.exercise_log_set_segments') is not null
     or to_regclass('public.exercise_log_set_segment_metric_values') is not null
     or to_regprocedure('private.workout_set_detail_snapshot(uuid)') is not null then
    raise exception 'AW-3B objects already exist or the migration is partially applied.' using errcode='55000';
  end if;
  if exists (
    select 1 from public.exercise_log_metric_values v
    left join public.exercise_logs l on l.id=v.exercise_log_id and l.workout_session_id=v.workout_session_id
    left join public.workout_sessions s on s.id=v.workout_session_id and s.user_id=v.user_id
    where l.id is null or s.id is null
  ) then
    raise exception 'AW-3B preflight found an AW-3A ownership-path violation.' using errcode='23514';
  end if;
end
$aw3b_preflight$;

create temporary table aw3b_root_baseline on commit drop as
select
  (select count(*) from public.exercise_logs) as exercise_log_count,
  (select encode(extensions.digest(convert_to(coalesce(string_agg((to_jsonb(l)-array['notes','set_type'])::text,'' order by l.id),''),'UTF8'),'sha256'),'hex') from public.exercise_logs l) as exercise_log_non_note_hash,
  (select count(*) from public.exercise_log_metric_values) as metric_count,
  (select encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(v)::text,'' order by v.id),''),'UTF8'),'sha256'),'hex') from public.exercise_log_metric_values v) as metric_hash,
  (select count(*) from public.workout_session_timeline_events) as timeline_count,
  (select encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(e)::text,'' order by e.sequence_number,e.id),''),'UTF8'),'sha256'),'hex') from public.workout_session_timeline_events e) as timeline_hash,
  (select migration_version from public.release_schema_compatibility where singleton=true) as marker;

alter table public.exercise_logs drop constraint exercise_logs_set_type_check;
alter table public.exercise_logs
  add constraint exercise_logs_set_type_check
  check (set_type in ('warmup','working','normal','failure','drop','backoff','amrap','timed','other')) not valid;
alter table public.exercise_logs validate constraint exercise_logs_set_type_check;

create table public.exercise_log_set_details (
  exercise_log_id uuid primary key,
  workout_session_id uuid not null,
  user_id uuid not null,
  schema_version smallint not null default 1,
  set_type text not null,
  rpe numeric null,
  rir numeric null,
  notes text null,
  side_mode text not null default 'none',
  planned_tempo text null,
  performed_tempo text null,
  tempo_adherence text not null default 'not_recorded',
  source text not null,
  source_provider text null,
  source_version text null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint exercise_log_set_details_log_session_fkey
    foreign key (exercise_log_id,workout_session_id)
    references public.exercise_logs(id,workout_session_id) on delete cascade,
  constraint exercise_log_set_details_session_user_fkey
    foreign key (workout_session_id,user_id)
    references public.workout_sessions(id,user_id) on delete cascade,
  constraint exercise_log_set_details_user_fkey
    foreign key (user_id) references public.profiles(id) on delete cascade,
  constraint exercise_log_set_details_schema_version_check check (schema_version=1),
  constraint exercise_log_set_details_set_type_check
    check (set_type in ('warmup','working','normal','failure','drop','backoff','amrap','timed','other')),
  constraint exercise_log_set_details_rpe_check
    check (rpe is null or (rpe between 0 and 10 and trunc(rpe*10)=rpe*10)),
  constraint exercise_log_set_details_rir_check
    check (rir is null or (rir between 0 and 20 and trunc(rir*10)=rir*10)),
  constraint exercise_log_set_details_notes_check check (notes is null or char_length(notes)<=4000),
  constraint exercise_log_set_details_side_mode_check
    check (side_mode in ('none','bilateral','left','right','alternating')),
  constraint exercise_log_set_details_planned_tempo_check
    check (planned_tempo is null or (char_length(planned_tempo) between 1 and 64 and planned_tempo !~ '[[:cntrl:]]')),
  constraint exercise_log_set_details_performed_tempo_check
    check (performed_tempo is null or (char_length(performed_tempo) between 1 and 64 and performed_tempo !~ '[[:cntrl:]]')),
  constraint exercise_log_set_details_tempo_adherence_check
    check (tempo_adherence in ('not_recorded','adhered','adjusted','missed')),
  constraint exercise_log_set_details_source_check
    check (source in ('manual','chatgpt','device','import','backfill')),
  constraint exercise_log_set_details_source_provider_check check (
    source_provider is null or (char_length(source_provider) between 1 and 64 and source_provider ~ '^[a-z0-9][a-z0-9._-]{0,63}$')
  ),
  constraint exercise_log_set_details_source_version_check check (
    source_version is null or (char_length(source_version) between 1 and 64 and source_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$')
  ),
  constraint exercise_log_set_details_machine_source_check
    check (source not in ('device','import') or source_provider is not null)
);

create index exercise_log_set_details_user_session_log_idx
  on public.exercise_log_set_details(user_id,workout_session_id,exercise_log_id);

create table public.exercise_log_set_segments (
  id uuid primary key default gen_random_uuid(),
  exercise_log_id uuid not null,
  workout_session_id uuid not null,
  user_id uuid not null,
  segment_order integer not null,
  segment_kind text not null,
  side text not null default 'none',
  completed_at timestamptz null,
  source text not null,
  source_provider text null,
  source_version text null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint exercise_log_set_segments_log_session_fkey
    foreign key (exercise_log_id,workout_session_id)
    references public.exercise_logs(id,workout_session_id) on delete cascade,
  constraint exercise_log_set_segments_session_user_fkey
    foreign key (workout_session_id,user_id)
    references public.workout_sessions(id,user_id) on delete cascade,
  constraint exercise_log_set_segments_user_fkey
    foreign key (user_id) references public.profiles(id) on delete cascade,
  constraint exercise_log_set_segments_identity_key unique (id,exercise_log_id,workout_session_id,user_id),
  constraint exercise_log_set_segments_order_key unique (exercise_log_id,segment_order),
  constraint exercise_log_set_segments_order_check check (segment_order between 1 and 32),
  constraint exercise_log_set_segments_kind_check check (segment_kind in ('primary','drop','rest_pause','other')),
  constraint exercise_log_set_segments_side_check check (side in ('none','bilateral','left','right','alternating')),
  constraint exercise_log_set_segments_completed_at_check
    check (completed_at is null or completed_at<=clock_timestamp()+interval '5 minutes'),
  constraint exercise_log_set_segments_source_check check (source in ('manual','chatgpt','device','import','backfill')),
  constraint exercise_log_set_segments_source_provider_check check (
    source_provider is null or (char_length(source_provider) between 1 and 64 and source_provider ~ '^[a-z0-9][a-z0-9._-]{0,63}$')
  ),
  constraint exercise_log_set_segments_source_version_check check (
    source_version is null or (char_length(source_version) between 1 and 64 and source_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$')
  ),
  constraint exercise_log_set_segments_machine_source_check
    check (source not in ('device','import') or source_provider is not null)
);

create index exercise_log_set_segments_user_session_log_order_idx
  on public.exercise_log_set_segments(user_id,workout_session_id,exercise_log_id,segment_order);

create table public.exercise_log_set_segment_metric_values (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null,
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
  constraint exercise_log_set_segment_metric_values_segment_fkey
    foreign key (segment_id,exercise_log_id,workout_session_id,user_id)
    references public.exercise_log_set_segments(id,exercise_log_id,workout_session_id,user_id) on delete cascade,
  constraint exercise_log_set_segment_metric_values_definition_fkey
    foreign key (metric_key,metric_version)
    references public.workout_performance_metric_definitions(metric_key,metric_version) on delete restrict,
  constraint exercise_log_set_segment_metric_values_identity_key
    unique (segment_id,metric_key,metric_version,side),
  constraint exercise_log_set_segment_metric_values_side_check check (side in ('none','bilateral','left','right')),
  constraint exercise_log_set_segment_metric_values_source_check check (source in ('manual','chatgpt','device','import','backfill')),
  constraint exercise_log_set_segment_metric_values_source_provider_check check (
    source_provider is null or (char_length(source_provider) between 1 and 64 and source_provider ~ '^[a-z0-9][a-z0-9._-]{0,63}$')
  ),
  constraint exercise_log_set_segment_metric_values_source_version_check check (
    source_version is null or (char_length(source_version) between 1 and 64 and source_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$')
  ),
  constraint exercise_log_set_segment_metric_values_machine_source_check
    check (source not in ('device','import') or source_provider is not null)
);

create index exercise_log_set_segment_metric_values_log_segment_metric_idx
  on public.exercise_log_set_segment_metric_values(exercise_log_id,segment_id,metric_key,metric_version,side);
create index exercise_log_set_segment_metric_values_user_captured_idx
  on public.exercise_log_set_segment_metric_values(user_id,captured_at desc,id desc);

create or replace function private.validate_exercise_log_set_detail_row()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_session uuid;
  v_user uuid;
begin
  select workout_session_id into v_session from public.exercise_logs where id=new.exercise_log_id;
  if not found or v_session<>new.workout_session_id then
    raise exception 'Workout set detail log/session identity is invalid.' using errcode='23514';
  end if;
  select user_id into v_user from public.workout_sessions where id=new.workout_session_id;
  if not found or v_user<>new.user_id then
    raise exception 'Workout set detail session/user identity is invalid.' using errcode='23514';
  end if;
  if tg_op='UPDATE' then
    new.updated_at:=case
      when (to_jsonb(new)-array['created_at','updated_at']) is distinct from (to_jsonb(old)-array['created_at','updated_at'])
      then clock_timestamp() else old.updated_at end;
  else
    new.updated_at:=coalesce(new.updated_at,clock_timestamp());
  end if;
  return new;
end
$function$;

create or replace function private.validate_exercise_log_set_segment_row()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_session uuid;
  v_user uuid;
begin
  select workout_session_id into v_session from public.exercise_logs where id=new.exercise_log_id;
  if not found or v_session<>new.workout_session_id then
    raise exception 'Workout set segment log/session identity is invalid.' using errcode='23514';
  end if;
  select user_id into v_user from public.workout_sessions where id=new.workout_session_id;
  if not found or v_user<>new.user_id then
    raise exception 'Workout set segment session/user identity is invalid.' using errcode='23514';
  end if;
  if tg_op='UPDATE' then
    new.updated_at:=case
      when (to_jsonb(new)-array['created_at','updated_at']) is distinct from (to_jsonb(old)-array['created_at','updated_at'])
      then clock_timestamp() else old.updated_at end;
  else
    new.updated_at:=coalesce(new.updated_at,clock_timestamp());
  end if;
  return new;
end
$function$;

create or replace function private.validate_exercise_log_set_segment_metric_row()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_segment public.exercise_log_set_segments%rowtype;
begin
  select * into v_segment from public.exercise_log_set_segments where id=new.segment_id;
  if not found or v_segment.exercise_log_id<>new.exercise_log_id
     or v_segment.workout_session_id<>new.workout_session_id or v_segment.user_id<>new.user_id then
    raise exception 'Workout set segment metric ownership path is invalid.' using errcode='23514';
  end if;
  perform private.validate_workout_performance_metric_value(
    new.metric_key,new.metric_version,new.side,new.value,new.source,
    new.source_provider,new.source_version,new.captured_at
  );
  if tg_op='UPDATE' then
    new.updated_at:=case
      when (to_jsonb(new)-array['created_at','updated_at']) is distinct from (to_jsonb(old)-array['created_at','updated_at'])
      then clock_timestamp() else old.updated_at end;
  else
    new.updated_at:=coalesce(new.updated_at,clock_timestamp());
  end if;
  return new;
end
$function$;

revoke all on function private.validate_exercise_log_set_detail_row() from public,anon,authenticated,service_role;
revoke all on function private.validate_exercise_log_set_segment_row() from public,anon,authenticated,service_role;
revoke all on function private.validate_exercise_log_set_segment_metric_row() from public,anon,authenticated,service_role;

create trigger exercise_log_set_details_validate before insert or update on public.exercise_log_set_details
for each row execute function private.validate_exercise_log_set_detail_row();
create trigger exercise_log_set_segments_validate before insert or update on public.exercise_log_set_segments
for each row execute function private.validate_exercise_log_set_segment_row();
create trigger exercise_log_set_segment_metric_values_validate before insert or update on public.exercise_log_set_segment_metric_values
for each row execute function private.validate_exercise_log_set_segment_metric_row();

alter table public.exercise_log_set_details enable row level security;
alter table public.exercise_log_set_segments enable row level security;
alter table public.exercise_log_set_segment_metric_values enable row level security;

create policy exercise_log_set_details_owner_select on public.exercise_log_set_details
for select to authenticated using (user_id=(select auth.uid()) or private.is_admin());
create policy exercise_log_set_segments_owner_select on public.exercise_log_set_segments
for select to authenticated using (user_id=(select auth.uid()) or private.is_admin());
create policy exercise_log_set_segment_metric_values_owner_select on public.exercise_log_set_segment_metric_values
for select to authenticated using (user_id=(select auth.uid()) or private.is_admin());

revoke all on table public.exercise_log_set_details from public,anon,authenticated,service_role;
revoke all on table public.exercise_log_set_segments from public,anon,authenticated,service_role;
revoke all on table public.exercise_log_set_segment_metric_values from public,anon,authenticated,service_role;
grant select on table public.exercise_log_set_details,public.exercise_log_set_segments,public.exercise_log_set_segment_metric_values to authenticated;
grant select,insert,update,delete on table public.exercise_log_set_details,public.exercise_log_set_segments,public.exercise_log_set_segment_metric_values to service_role;

create or replace function private.workout_set_type(p_notes text,p_explicit text default null)
returns text
language plpgsql
immutable
set search_path=''
as $function$
declare
  v_type text:=lower(nullif(btrim(coalesce(p_explicit,'')),''));
begin
  if v_type is null then return 'normal'; end if;
  if v_type not in ('warmup','working','normal','failure','drop','backoff','amrap','timed','other') then
    raise exception 'Workout set type is invalid.' using errcode='22023';
  end if;
  return v_type;
end
$function$;

-- AW-2 encoded set metadata in notes and its normalization trigger re-derived
-- set_type whenever only the note changed. AW-3B makes the explicit projection
-- authoritative, so the existing trigger must stop reading note text before
-- the conservative backfill removes those exact legacy tokens.
create or replace function private.normalize_exercise_log_set_type()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  new.set_type:=private.workout_set_type(null,new.set_type);
  return new;
end
$function$;

revoke all on function private.normalize_exercise_log_set_type()
from public,anon,authenticated,service_role;

create or replace function private.workout_set_detail_snapshot(p_exercise_log_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
  select jsonb_build_object(
    'details',(
      select to_jsonb(d)-array['exercise_log_id','workout_session_id','user_id','created_at','updated_at']
      from public.exercise_log_set_details d where d.exercise_log_id=p_exercise_log_id
    ),
    'segments',coalesce((
      select jsonb_agg(
        (to_jsonb(s)-array['id','exercise_log_id','workout_session_id','user_id','created_at','updated_at'])
        || jsonb_build_object('metrics',coalesce((
          select jsonb_agg(
            to_jsonb(m)-array['id','segment_id','exercise_log_id','workout_session_id','user_id','created_at','updated_at']
            order by m.metric_key,m.metric_version,m.side
          ) from public.exercise_log_set_segment_metric_values m where m.segment_id=s.id
        ),'[]'::jsonb))
        order by s.segment_order
      ) from public.exercise_log_set_segments s where s.exercise_log_id=p_exercise_log_id
    ),'[]'::jsonb)
  )
$function$;

revoke all on function private.workout_set_detail_snapshot(uuid) from public,anon,authenticated,service_role;

-- Preserve the established low-level set authority while allowing the explicit
-- compatibility projection to be written without reading metadata from notes.
create or replace function private.aw2c_core_upsert_workout_set_logs_atomic(
  p_user_id uuid,
  p_session_id uuid,
  p_logs jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_session public.workout_sessions%rowtype;
  v_log jsonb;
  v_plan_exercise_id uuid;
  v_exercise_order integer;
  v_set_number integer;
  v_duplicate_count integer;
  v_logs jsonb;
begin
  perform public.assert_workout_actor(p_user_id);
  select * into v_session
  from public.workout_sessions
  where id=p_session_id and user_id=p_user_id
  for update;
  if not found then raise exception 'Workout session not found.' using errcode='P0002'; end if;
  if v_session.status::text<>'started' then
    raise exception 'Only an active workout session can save sets.' using errcode='23514';
  end if;
  if p_logs is null then p_logs:='[]'::jsonb; end if;
  if jsonb_typeof(p_logs)<>'array' then raise exception 'Workout set logs must be an array.' using errcode='23514'; end if;
  if jsonb_array_length(p_logs)>500 then raise exception 'A workout session can contain at most 500 set logs.' using errcode='22023'; end if;

  select count(*) into v_duplicate_count from (
    select coalesce(nullif(value->>'plan_exercise_id',''),'order:'||coalesce(value->>'exercise_order','')) as exercise_key,
           value->>'set_number' as set_key
    from jsonb_array_elements(p_logs)
    group by 1,2 having count(*)>1
  ) duplicates;
  if v_duplicate_count>0 then raise exception 'Workout set payload contains duplicate stable keys.' using errcode='23505'; end if;

  for v_log in select value from jsonb_array_elements(p_logs)
  loop
    v_plan_exercise_id:=nullif(v_log->>'plan_exercise_id','')::uuid;
    v_exercise_order:=nullif(v_log->>'exercise_order','')::integer;
    v_set_number:=nullif(v_log->>'set_number','')::integer;
    if nullif(btrim(coalesce(v_log->>'exercise_name','')),'') is null
       or v_set_number is null or v_set_number<=0
       or coalesce(nullif(v_log->>'reps','')::integer,0)<0
       or coalesce(nullif(v_log->>'weight_kg','')::numeric,0)<0 then
      raise exception 'Workout set values are invalid.' using errcode='23514';
    end if;

    if v_plan_exercise_id is not null then
      perform 1 from public.user_workout_plan_exercises e
      where e.id=v_plan_exercise_id and e.plan_day_id=v_session.plan_day_id;
      if not found then raise exception 'Plan exercise does not belong to this session.' using errcode='23514'; end if;

      insert into public.exercise_logs(
        workout_session_id,plan_exercise_id,exercise_order,exercise_name,
        exercise_category,planned_sets,planned_reps,planned_rest_seconds,
        set_number,reps,weight_kg,notes,completed_at,set_type
      ) values (
        p_session_id,v_plan_exercise_id,v_exercise_order,btrim(v_log->>'exercise_name'),
        nullif(v_log->>'exercise_category',''),nullif(v_log->>'planned_sets','')::integer,
        nullif(v_log->>'planned_reps',''),nullif(v_log->>'planned_rest_seconds','')::integer,
        v_set_number,nullif(v_log->>'reps','')::integer,nullif(v_log->>'weight_kg','')::numeric,
        nullif(btrim(coalesce(v_log->>'notes','')),''),nullif(v_log->>'completed_at','')::timestamptz,
        private.workout_set_type(null,v_log->>'set_type')
      )
      on conflict (workout_session_id,plan_exercise_id,set_number) where plan_exercise_id is not null
      do update set
        exercise_order=excluded.exercise_order,
        exercise_name=excluded.exercise_name,
        exercise_category=excluded.exercise_category,
        planned_sets=excluded.planned_sets,
        planned_reps=excluded.planned_reps,
        planned_rest_seconds=excluded.planned_rest_seconds,
        reps=excluded.reps,
        weight_kg=excluded.weight_kg,
        notes=excluded.notes,
        completed_at=excluded.completed_at,
        set_type=case when v_log ? 'set_type' then excluded.set_type else public.exercise_logs.set_type end;
    else
      if v_exercise_order is null or v_exercise_order<=0 then
        raise exception 'A set without a plan exercise requires a stable exercise order.' using errcode='23514';
      end if;
      insert into public.exercise_logs(
        workout_session_id,plan_exercise_id,exercise_order,exercise_name,
        exercise_category,planned_sets,planned_reps,planned_rest_seconds,
        set_number,reps,weight_kg,notes,completed_at,set_type
      ) values (
        p_session_id,null,v_exercise_order,btrim(v_log->>'exercise_name'),
        nullif(v_log->>'exercise_category',''),nullif(v_log->>'planned_sets','')::integer,
        nullif(v_log->>'planned_reps',''),nullif(v_log->>'planned_rest_seconds','')::integer,
        v_set_number,nullif(v_log->>'reps','')::integer,nullif(v_log->>'weight_kg','')::numeric,
        nullif(btrim(coalesce(v_log->>'notes','')),''),nullif(v_log->>'completed_at','')::timestamptz,
        private.workout_set_type(null,v_log->>'set_type')
      )
      on conflict (workout_session_id,exercise_order,set_number)
        where plan_exercise_id is null and exercise_order is not null
      do update set
        exercise_name=excluded.exercise_name,
        exercise_category=excluded.exercise_category,
        planned_sets=excluded.planned_sets,
        planned_reps=excluded.planned_reps,
        planned_rest_seconds=excluded.planned_rest_seconds,
        reps=excluded.reps,
        weight_kg=excluded.weight_kg,
        notes=excluded.notes,
        completed_at=excluded.completed_at,
        set_type=case when v_log ? 'set_type' then excluded.set_type else public.exercise_logs.set_type end;
    end if;
  end loop;

  select coalesce(jsonb_agg(to_jsonb(l) order by l.exercise_order nulls last,l.plan_exercise_id,l.set_number),'[]'::jsonb)
  into v_logs from public.exercise_logs l where l.workout_session_id=p_session_id;
  return v_logs;
end
$function$;

revoke all on function private.aw2c_core_upsert_workout_set_logs_atomic(uuid,uuid,jsonb)
from public,anon,authenticated,service_role;

alter function public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)
  rename to aw3b_core_upsert_workout_set_logs_atomic;
alter function public.aw3b_core_upsert_workout_set_logs_atomic(uuid,uuid,jsonb) set schema private;
revoke all on function private.aw3b_core_upsert_workout_set_logs_atomic(uuid,uuid,jsonb)
from public,anon,authenticated,service_role;

create or replace function public.upsert_workout_set_logs_atomic(
  p_user_id uuid,
  p_session_id uuid,
  p_logs jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_session public.workout_sessions%rowtype;
  v_item jsonb;
  v_core_item jsonb;
  v_core_logs jsonb:='[]'::jsonb;
  v_details jsonb;
  v_segment jsonb;
  v_metric jsonb;
  v_key text;
  v_before_by_key jsonb:='{}'::jsonb;
  v_before_log jsonb;
  v_before_metrics jsonb;
  v_before_structured jsonb;
  v_after public.exercise_logs%rowtype;
  v_after_metrics jsonb;
  v_after_structured jsonb;
  v_core_changed boolean;
  v_structured_changed boolean;
  v_duplicate_count integer;
  v_detail_source text;
  v_detail_provider text;
  v_detail_source_version text;
  v_desired_segments jsonb;
  v_desired_metrics jsonb;
  v_segment_id uuid;
  v_segment_source text;
  v_segment_provider text;
  v_segment_source_version text;
  v_metric_key text;
  v_metric_version smallint;
  v_metric_side text;
  v_metric_value numeric;
  v_metric_source text;
  v_metric_provider text;
  v_metric_source_version text;
  v_metric_captured_at timestamptz;
  v_existing_captured_at timestamptz;
  v_payload jsonb;
  v_fingerprint text;
  v_result jsonb;
begin
  perform public.assert_workout_actor(p_user_id);
  select * into v_session from public.workout_sessions
  where id=p_session_id and user_id=p_user_id for update;
  if not found then raise exception 'Workout session not found.' using errcode='P0002'; end if;
  if v_session.status::text<>'started' then
    raise exception 'Only an active workout session can save sets.' using errcode='23514';
  end if;
  if p_logs is null then p_logs:='[]'::jsonb; end if;
  if jsonb_typeof(p_logs)<>'array' then raise exception 'Workout set logs must be an array.' using errcode='23514'; end if;
  if jsonb_array_length(p_logs)>500 then raise exception 'A workout session can contain at most 500 set logs.' using errcode='22023'; end if;

  for v_item in select value from jsonb_array_elements(p_logs)
  loop
    v_before_log:=null;
    v_before_metrics:=null;
    v_before_structured:=null;
    if nullif(v_item->>'plan_exercise_id','') is not null then
      v_key:='plan:'||(v_item->>'plan_exercise_id')||':set:'||coalesce(v_item->>'set_number','');
      select to_jsonb(l),private.workout_performance_metric_snapshot(l.id),private.workout_set_detail_snapshot(l.id)
      into v_before_log,v_before_metrics,v_before_structured
      from public.exercise_logs l
      where l.workout_session_id=p_session_id
        and l.plan_exercise_id=(v_item->>'plan_exercise_id')::uuid
        and l.set_number=(v_item->>'set_number')::integer
      for update;
    else
      v_key:='order:'||coalesce(v_item->>'exercise_order','')||':set:'||coalesce(v_item->>'set_number','');
      select to_jsonb(l),private.workout_performance_metric_snapshot(l.id),private.workout_set_detail_snapshot(l.id)
      into v_before_log,v_before_metrics,v_before_structured
      from public.exercise_logs l
      where l.workout_session_id=p_session_id and l.plan_exercise_id is null
        and l.exercise_order=(v_item->>'exercise_order')::integer
        and l.set_number=(v_item->>'set_number')::integer
      for update;
    end if;
    v_before_by_key:=jsonb_set(v_before_by_key,array[v_key],jsonb_build_object(
      'log',coalesce(v_before_log,'null'::jsonb),
      'metrics',coalesce(v_before_metrics,'[]'::jsonb),
      'structured',coalesce(v_before_structured,'null'::jsonb)
    ),true);

    v_core_item:=(v_item-'set_details')-'segments';
    if v_item ? 'set_details' then
      if jsonb_typeof(v_item->'set_details')='null' then
        if v_before_log is not null then
          if not (v_item ? 'notes') then v_core_item:=v_core_item||jsonb_build_object('notes',v_before_log->>'notes'); end if;
          if not (v_item ? 'set_type') then v_core_item:=v_core_item||jsonb_build_object('set_type',v_before_log->>'set_type'); end if;
        end if;
      elsif jsonb_typeof(v_item->'set_details')='object' then
        v_details:=v_item->'set_details';
        if nullif(v_details->>'set_type','') is null then
          raise exception 'Structured workout set details require set_type.' using errcode='22023';
        end if;
        if v_item ? 'notes' and (v_item->>'notes') is distinct from (v_details->>'notes') then
          raise exception 'Workout set notes disagree with structured set details.' using errcode='23514';
        end if;
        v_core_item:=v_core_item||jsonb_build_object(
          'notes',v_details->>'notes',
          'set_type',v_details->>'set_type'
        );
      else
        raise exception 'set_details must be an object or null.' using errcode='22023';
      end if;
    end if;
    if v_item ? 'segments' and jsonb_typeof(v_item->'segments')<>'array' then
      raise exception 'segments must be an array.' using errcode='22023';
    end if;
    v_core_logs:=v_core_logs||jsonb_build_array(v_core_item);
  end loop;

  v_result:=private.aw3b_core_upsert_workout_set_logs_atomic(p_user_id,p_session_id,v_core_logs);

  for v_item in select value from jsonb_array_elements(p_logs)
  loop
    if nullif(v_item->>'plan_exercise_id','') is not null then
      v_key:='plan:'||(v_item->>'plan_exercise_id')||':set:'||coalesce(v_item->>'set_number','');
      select * into strict v_after from public.exercise_logs l
      where l.workout_session_id=p_session_id
        and l.plan_exercise_id=(v_item->>'plan_exercise_id')::uuid
        and l.set_number=(v_item->>'set_number')::integer;
    else
      v_key:='order:'||coalesce(v_item->>'exercise_order','')||':set:'||coalesce(v_item->>'set_number','');
      select * into strict v_after from public.exercise_logs l
      where l.workout_session_id=p_session_id and l.plan_exercise_id is null
        and l.exercise_order=(v_item->>'exercise_order')::integer
        and l.set_number=(v_item->>'set_number')::integer;
    end if;

    if v_item ? 'set_details' then
      if jsonb_typeof(v_item->'set_details')='null' then
        delete from public.exercise_log_set_details where exercise_log_id=v_after.id;
      else
        v_details:=v_item->'set_details';
        v_detail_source:=coalesce(nullif(v_details->>'source',''),case when coalesce(auth.role(),'')='service_role' then 'chatgpt' else 'manual' end);
        v_detail_provider:=coalesce(nullif(v_details->>'source_provider',''),case when v_detail_source='chatgpt' then 'openai' end);
        v_detail_source_version:=nullif(v_details->>'source_version','');
        insert into public.exercise_log_set_details(
          exercise_log_id,workout_session_id,user_id,schema_version,set_type,rpe,rir,notes,
          side_mode,planned_tempo,performed_tempo,tempo_adherence,
          source,source_provider,source_version
        ) values (
          v_after.id,p_session_id,p_user_id,coalesce(nullif(v_details->>'schema_version','')::smallint,1),
          nullif(v_details->>'set_type',''),nullif(v_details->>'rpe','')::numeric,
          nullif(v_details->>'rir','')::numeric,v_after.notes,
          coalesce(nullif(v_details->>'side_mode',''),'none'),nullif(v_details->>'planned_tempo',''),
          nullif(v_details->>'performed_tempo',''),coalesce(nullif(v_details->>'tempo_adherence',''),'not_recorded'),
          v_detail_source,v_detail_provider,v_detail_source_version
        )
        on conflict (exercise_log_id) do update set
          workout_session_id=excluded.workout_session_id,
          user_id=excluded.user_id,
          schema_version=excluded.schema_version,
          set_type=excluded.set_type,
          rpe=excluded.rpe,
          rir=excluded.rir,
          notes=excluded.notes,
          side_mode=excluded.side_mode,
          planned_tempo=excluded.planned_tempo,
          performed_tempo=excluded.performed_tempo,
          tempo_adherence=excluded.tempo_adherence,
          source=excluded.source,
          source_provider=excluded.source_provider,
          source_version=excluded.source_version;
      end if;
    end if;

    if v_item ? 'segments' then
      if jsonb_array_length(v_item->'segments')>32 then
        raise exception 'A workout set can contain at most 32 segments.' using errcode='22023';
      end if;
      select count(*) into v_duplicate_count from (
        select value->>'segment_order' from jsonb_array_elements(v_item->'segments')
        group by 1 having count(*)>1
      ) duplicate_orders;
      if v_duplicate_count>0 then raise exception 'Workout set segment order must be unique.' using errcode='23505'; end if;
      v_desired_segments:='[]'::jsonb;
      for v_segment in select value from jsonb_array_elements(v_item->'segments')
      loop
        if jsonb_typeof(v_segment)<>'object' then raise exception 'Workout set segments must be objects.' using errcode='22023'; end if;
        v_segment_source:=coalesce(nullif(v_segment->>'source',''),case when coalesce(auth.role(),'')='service_role' then 'chatgpt' else 'manual' end);
        v_segment_provider:=coalesce(nullif(v_segment->>'source_provider',''),case when v_segment_source='chatgpt' then 'openai' end);
        v_segment_source_version:=nullif(v_segment->>'source_version','');
        insert into public.exercise_log_set_segments(
          exercise_log_id,workout_session_id,user_id,segment_order,segment_kind,side,completed_at,
          source,source_provider,source_version
        ) values (
          v_after.id,p_session_id,p_user_id,nullif(v_segment->>'segment_order','')::integer,
          nullif(v_segment->>'segment_kind',''),coalesce(nullif(v_segment->>'side',''),'none'),
          nullif(v_segment->>'completed_at','')::timestamptz,
          v_segment_source,v_segment_provider,v_segment_source_version
        )
        on conflict (exercise_log_id,segment_order) do update set
          workout_session_id=excluded.workout_session_id,
          user_id=excluded.user_id,
          segment_kind=excluded.segment_kind,
          side=excluded.side,
          completed_at=excluded.completed_at,
          source=excluded.source,
          source_provider=excluded.source_provider,
          source_version=excluded.source_version
        returning id into v_segment_id;
        v_desired_segments:=v_desired_segments||jsonb_build_array(jsonb_build_object('segment_order',v_segment->>'segment_order'));

        if not (v_segment ? 'performance_metrics') then
          v_segment:=v_segment||jsonb_build_object('performance_metrics','[]'::jsonb);
        end if;
        if jsonb_typeof(v_segment->'performance_metrics')<>'array' then
          raise exception 'Segment performance_metrics must be an array.' using errcode='22023';
        end if;
        if jsonb_array_length(v_segment->'performance_metrics')>16 then
          raise exception 'A workout set segment can contain at most 16 performance metrics.' using errcode='22023';
        end if;
        select count(*) into v_duplicate_count from (
          select value->>'metric_key',coalesce(nullif(value->>'metric_version',''),'1'),coalesce(nullif(value->>'side',''),'none')
          from jsonb_array_elements(v_segment->'performance_metrics') group by 1,2,3 having count(*)>1
        ) duplicate_metrics;
        if v_duplicate_count>0 then raise exception 'Workout set segment metrics must be unique.' using errcode='23505'; end if;

        v_desired_metrics:='[]'::jsonb;
        for v_metric in select value from jsonb_array_elements(v_segment->'performance_metrics')
        loop
          v_metric_key:=nullif(v_metric->>'metric_key','');
          v_metric_version:=coalesce(nullif(v_metric->>'metric_version','')::smallint,1);
          v_metric_side:=coalesce(nullif(v_metric->>'side',''),'none');
          v_metric_value:=nullif(v_metric->>'value','')::numeric;
          v_metric_source:=coalesce(nullif(v_metric->>'source',''),v_segment_source);
          v_metric_provider:=coalesce(nullif(v_metric->>'source_provider',''),v_segment_provider,case when v_metric_source='chatgpt' then 'openai' end);
          v_metric_source_version:=coalesce(nullif(v_metric->>'source_version',''),v_segment_source_version);
          select captured_at into v_existing_captured_at
          from public.exercise_log_set_segment_metric_values
          where segment_id=v_segment_id and metric_key=v_metric_key
            and metric_version=v_metric_version and side=v_metric_side;
          v_metric_captured_at:=coalesce(
            nullif(v_metric->>'captured_at','')::timestamptz,
            v_existing_captured_at,
            nullif(v_segment->>'completed_at','')::timestamptz,
            v_after.completed_at,
            clock_timestamp()
          );
          insert into public.exercise_log_set_segment_metric_values(
            segment_id,exercise_log_id,workout_session_id,user_id,metric_key,metric_version,side,value,
            source,source_provider,source_version,captured_at
          ) values (
            v_segment_id,v_after.id,p_session_id,p_user_id,v_metric_key,v_metric_version,v_metric_side,v_metric_value,
            v_metric_source,v_metric_provider,v_metric_source_version,v_metric_captured_at
          )
          on conflict (segment_id,metric_key,metric_version,side) do update set
            exercise_log_id=excluded.exercise_log_id,
            workout_session_id=excluded.workout_session_id,
            user_id=excluded.user_id,
            value=excluded.value,
            source=excluded.source,
            source_provider=excluded.source_provider,
            source_version=excluded.source_version,
            captured_at=excluded.captured_at;
          v_desired_metrics:=v_desired_metrics||jsonb_build_array(jsonb_build_object(
            'metric_key',v_metric_key,'metric_version',v_metric_version,'side',v_metric_side
          ));
        end loop;
        delete from public.exercise_log_set_segment_metric_values existing
        where existing.segment_id=v_segment_id and not exists (
          select 1 from jsonb_array_elements(v_desired_metrics) desired
          where desired->>'metric_key'=existing.metric_key
            and (desired->>'metric_version')::smallint=existing.metric_version
            and desired->>'side'=existing.side
        );
      end loop;
      delete from public.exercise_log_set_segments existing
      where existing.exercise_log_id=v_after.id and not exists (
        select 1 from jsonb_array_elements(v_desired_segments) desired
        where (desired->>'segment_order')::integer=existing.segment_order
      );
    end if;

    v_before_log:=v_before_by_key->v_key->'log';
    v_before_metrics:=coalesce(v_before_by_key->v_key->'metrics','[]'::jsonb);
    v_before_structured:=v_before_by_key->v_key->'structured';
    v_after_metrics:=private.workout_performance_metric_snapshot(v_after.id);
    v_after_structured:=private.workout_set_detail_snapshot(v_after.id);
    v_structured_changed:=v_before_structured is distinct from v_after_structured;
    if v_before_log is null or v_before_log='null'::jsonb then
      v_core_changed:=true;
    else
      v_core_changed:=(v_before_log->>'reps')::integer is distinct from v_after.reps
        or (v_before_log->>'weight_kg')::numeric is distinct from v_after.weight_kg
        or (v_before_log->>'completed_at')::timestamptz is distinct from v_after.completed_at
        or v_before_log->>'set_type' is distinct from v_after.set_type
        or v_before_log->>'notes' is distinct from v_after.notes
        or v_before_log->>'exercise_name' is distinct from v_after.exercise_name
        or (v_before_log->>'exercise_order')::integer is distinct from v_after.exercise_order
        or (v_before_log->>'plan_exercise_id')::uuid is distinct from v_after.plan_exercise_id
        or v_before_metrics is distinct from v_after_metrics;
    end if;

    if v_before_log is not null and v_before_log<>'null'::jsonb
       and (v_before_log->>'completed_at') is not null and v_after.completed_at is not null
       and v_structured_changed and not v_core_changed then
      v_payload:=jsonb_build_object(
        'exerciseOrder',v_after.exercise_order,
        'planExerciseId',v_after.plan_exercise_id,
        'exerciseNameSnapshot',v_after.exercise_name,
        'setNumber',v_after.set_number,
        'changedFields',jsonb_build_array('structuredSetDetails'),
        'setTypeChanged',(v_before_structured->'details'->>'set_type') is distinct from (v_after_structured->'details'->>'set_type'),
        'rpeChanged',(v_before_structured->'details'->>'rpe') is distinct from (v_after_structured->'details'->>'rpe'),
        'rirChanged',(v_before_structured->'details'->>'rir') is distinct from (v_after_structured->'details'->>'rir'),
        'tempoChanged',jsonb_build_array(
          v_before_structured->'details'->>'planned_tempo',
          v_before_structured->'details'->>'performed_tempo',
          v_before_structured->'details'->>'tempo_adherence'
        ) is distinct from jsonb_build_array(
          v_after_structured->'details'->>'planned_tempo',
          v_after_structured->'details'->>'performed_tempo',
          v_after_structured->'details'->>'tempo_adherence'
        ),
        'sideModeChanged',(v_before_structured->'details'->>'side_mode') is distinct from (v_after_structured->'details'->>'side_mode'),
        'notesChanged',(v_before_structured->'details'->>'notes') is distinct from (v_after_structured->'details'->>'notes'),
        'segmentCount',jsonb_array_length(coalesce(v_after_structured->'segments','[]'::jsonb))
      );
      v_fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object(
        'before',v_before_structured,'after',v_after_structured
      )::text,'UTF8'),'sha256'),'hex');
      perform private.append_workout_session_timeline_event(
        p_session_id,p_user_id,'set_edited',clock_timestamp(),'runtime',
        'runtime:set_edited:'||v_after.id::text||':aw3b:'||v_fingerprint,
        v_payload,null,v_after.id,null,1::smallint
      );
    end if;
  end loop;

  select coalesce(jsonb_agg(to_jsonb(l) order by l.exercise_order nulls last,l.plan_exercise_id,l.set_number),'[]'::jsonb)
  into v_result from public.exercise_logs l where l.workout_session_id=p_session_id;
  return v_result;
end
$function$;

revoke all on function public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb) from public,anon;
grant execute on function public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb) to authenticated,service_role;

-- Parse only exact pipe-delimited tokens emitted by Plaivra's former runtime.
-- Any ambiguous prose, malformed value, duplicate metadata kind, or unrecognized
-- token remains untouched.
create temporary table aw3b_backfill_candidates on commit drop as
with split as (
  select l.id as exercise_log_id,l.workout_session_id,s.user_id,l.set_type,l.notes as original_note,
         token.ordinality,token.segment,
         case
           when token.segment ~ '^type:(warmup|working|normal|failure|drop)$' then 'type'
           when token.segment ~ '^RPE:(10(?:\.0)?|[0-9](?:\.[0-9])?)$' then 'rpe'
           when token.segment ~ '^RIR:(20(?:\.0)?|1[0-9](?:\.[0-9])?|[0-9](?:\.[0-9])?)$' then 'rir'
           else null
         end as token_kind
  from public.exercise_logs l
  join public.workout_sessions s on s.id=l.workout_session_id
  cross join lateral regexp_split_to_table(l.notes,' \| ') with ordinality as token(segment,ordinality)
  where l.notes is not null
), aggregated as (
  select exercise_log_id,workout_session_id,user_id,set_type,original_note,
         count(*) filter (where token_kind='type') as type_count,
         count(*) filter (where token_kind='rpe') as rpe_count,
         count(*) filter (where token_kind='rir') as rir_count,
         max(substring(segment from 6)) filter (where token_kind='type') as parsed_type,
         max(substring(segment from 5)) filter (where token_kind='rpe') as parsed_rpe,
         max(substring(segment from 5)) filter (where token_kind='rir') as parsed_rir,
         string_agg(segment,' | ' order by ordinality) filter (where token_kind is null) as remaining_note
  from split
  group by exercise_log_id,workout_session_id,user_id,set_type,original_note
)
select exercise_log_id,workout_session_id,user_id,original_note,
       remaining_note as expected_note,
       coalesce(parsed_type,set_type) as expected_set_type,
       parsed_rpe::numeric as expected_rpe,
       parsed_rir::numeric as expected_rir,
       type_count=1 as has_type,
       rpe_count=1 as has_rpe,
       rir_count=1 as has_rir,
       type_count+rpe_count+rir_count as expected_token_count
from aggregated
where type_count+rpe_count+rir_count>0
  and type_count<=1 and rpe_count<=1 and rir_count<=1;

insert into public.exercise_log_set_details(
  exercise_log_id,workout_session_id,user_id,schema_version,set_type,rpe,rir,notes,
  side_mode,planned_tempo,performed_tempo,tempo_adherence,
  source,source_provider,source_version
)
select exercise_log_id,workout_session_id,user_id,1,expected_set_type,expected_rpe,expected_rir,expected_note,
       'none',null,null,'not_recorded','backfill',null,null
from aw3b_backfill_candidates
on conflict (exercise_log_id) do nothing;

update public.exercise_logs l
set notes=c.expected_note,set_type=c.expected_set_type
from aw3b_backfill_candidates c
where l.id=c.exercise_log_id
  and (l.notes is distinct from c.expected_note or l.set_type is distinct from c.expected_set_type);

do $aw3b_postflight$
declare
  v_baseline aw3b_root_baseline%rowtype;
  v_count bigint;
  v_hash text;
  v_expected_rows bigint;
  v_actual_rows bigint;
  v_expected_tokens bigint;
  v_actual_tokens bigint;
  v_marker text;
begin
  select * into strict v_baseline from aw3b_root_baseline;
  select count(*),coalesce(sum(expected_token_count),0) into v_expected_rows,v_expected_tokens
  from aw3b_backfill_candidates;
  select count(*),coalesce(sum(
    (c.has_type)::integer+(c.has_rpe)::integer+(c.has_rir)::integer
  ),0) into v_actual_rows,v_actual_tokens
  from aw3b_backfill_candidates c
  join public.exercise_log_set_details d on d.exercise_log_id=c.exercise_log_id
  where d.source='backfill'
    and d.schema_version=1
    and d.set_type=c.expected_set_type
    and d.rpe is not distinct from c.expected_rpe
    and d.rir is not distinct from c.expected_rir
    and d.notes is not distinct from c.expected_note
    and d.side_mode='none'
    and d.planned_tempo is null and d.performed_tempo is null
    and d.tempo_adherence='not_recorded'
    and d.source_provider is null and d.source_version is null;
  if v_actual_rows<>v_expected_rows or v_actual_tokens<>v_expected_tokens then
    raise exception 'AW-3B backfill mismatch: expected % rows/% tokens, found % rows/% tokens.',
      v_expected_rows,v_expected_tokens,v_actual_rows,v_actual_tokens using errcode='23514';
  end if;
  if exists (
    select 1 from aw3b_backfill_candidates c
    join public.exercise_logs l on l.id=c.exercise_log_id
    where l.notes is distinct from c.expected_note or l.set_type is distinct from c.expected_set_type
  ) then
    raise exception 'AW-3B did not preserve the exact remaining free-note text.' using errcode='23514';
  end if;
  raise notice 'AW-3B conservative backfill expected rows %, actual rows %, expected tokens %, actual tokens %',
    v_expected_rows,v_actual_rows,v_expected_tokens,v_actual_tokens;

  select count(*),encode(extensions.digest(convert_to(coalesce(string_agg((to_jsonb(l)-array['notes','set_type'])::text,'' order by l.id),''),'UTF8'),'sha256'),'hex')
  into v_count,v_hash from public.exercise_logs l;
  if v_count<>v_baseline.exercise_log_count or v_hash<>v_baseline.exercise_log_non_note_hash then
    raise exception 'AW-3B changed exercise-log fields outside the approved note/type projection.' using errcode='23514';
  end if;
  select count(*),encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(v)::text,'' order by v.id),''),'UTF8'),'sha256'),'hex')
  into v_count,v_hash from public.exercise_log_metric_values v;
  if v_count<>v_baseline.metric_count or v_hash<>v_baseline.metric_hash then
    raise exception 'AW-3B unexpectedly changed AW-3A log metrics.' using errcode='23514';
  end if;
  select count(*),encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(e)::text,'' order by e.sequence_number,e.id),''),'UTF8'),'sha256'),'hex')
  into v_count,v_hash from public.workout_session_timeline_events e;
  if v_count<>v_baseline.timeline_count or v_hash<>v_baseline.timeline_hash then
    raise exception 'AW-3B unexpectedly changed existing timeline history.' using errcode='23514';
  end if;

  if exists (
    select 1 from public.exercise_log_set_details d
    left join public.exercise_logs l on l.id=d.exercise_log_id and l.workout_session_id=d.workout_session_id
    left join public.workout_sessions s on s.id=d.workout_session_id and s.user_id=d.user_id
    where l.id is null or s.id is null
  ) or exists (
    select 1 from public.exercise_log_set_segments g
    left join public.exercise_logs l on l.id=g.exercise_log_id and l.workout_session_id=g.workout_session_id
    left join public.workout_sessions s on s.id=g.workout_session_id and s.user_id=g.user_id
    where l.id is null or s.id is null
  ) or exists (
    select 1 from public.exercise_log_set_segment_metric_values m
    left join public.exercise_log_set_segments g
      on g.id=m.segment_id and g.exercise_log_id=m.exercise_log_id
     and g.workout_session_id=m.workout_session_id and g.user_id=m.user_id
    where g.id is null
  ) then
    raise exception 'AW-3B created an invalid ownership path.' using errcode='23514';
  end if;

  if has_table_privilege('authenticated','public.exercise_log_set_details','INSERT')
     or has_table_privilege('authenticated','public.exercise_log_set_segments','INSERT')
     or has_table_privilege('authenticated','public.exercise_log_set_segment_metric_values','INSERT') then
    raise exception 'AW-3B exposed a direct authenticated write grant.' using errcode='42501';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='upsert_workout_set_logs_atomic'
      and p.prosecdef and p.proconfig @> array['search_path=""']::text[]
  ) then
    raise exception 'AW-3B public set authority is not fail-closed.' using errcode='42501';
  end if;
  if pg_get_functiondef('private.aw2c_core_complete_workout_session_atomic(uuid,uuid,jsonb,integer,text)'::regprocedure)
     !~ 'public\.upsert_workout_set_logs_atomic' then
    raise exception 'AW-3B completion no longer converges on the canonical set authority.' using errcode='23514';
  end if;
  select migration_version into strict v_marker from public.release_schema_compatibility where singleton=true;
  if v_marker<>v_baseline.marker then
    raise exception 'AW-3B unexpectedly promoted the compatibility marker.' using errcode='23514';
  end if;
end
$aw3b_postflight$;
