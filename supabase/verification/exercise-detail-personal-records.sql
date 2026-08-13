\set ON_ERROR_STOP on

begin;

do $security$
declare
  v_add_definer boolean;
  v_add_config text[];
begin
  select prosecdef, proconfig into v_add_definer, v_add_config
  from pg_proc
  where oid='public.add_catalog_activity_to_plan_day_atomic(uuid,jsonb,jsonb)'::regprocedure;
  if not coalesce(v_add_definer,false) then raise exception 'Add-to-plan RPC is not guarded SECURITY DEFINER.'; end if;
  if not ('search_path='=any(v_add_config) or 'search_path=""'=any(v_add_config)) then raise exception 'Add-to-plan RPC search_path is unsafe.'; end if;
  if has_function_privilege('anon','public.add_catalog_activity_to_plan_day_atomic(uuid,jsonb,jsonb)','execute') then raise exception 'Anon can add to a member plan.'; end if;
  if has_function_privilege('anon','public.upsert_manual_personal_record_atomic(uuid,jsonb,jsonb,numeric,jsonb,timestamp with time zone,text)','execute')
     or has_function_privilege('anon','public.delete_manual_personal_record_atomic(uuid)','execute') then
    raise exception 'Anon can mutate Manual Personal Records.';
  end if;
  if not exists(select 1 from pg_tables where schemaname='public' and tablename='personal_record_subjects' and rowsecurity) then
    raise exception 'Personal Record subjects are not protected by RLS.';
  end if;
end;
$security$;

create or replace function pg_temp.edpr_assert(p_condition boolean, p_message text)
returns void language plpgsql as $function$
begin
  if not coalesce(p_condition, false) then raise exception '%', p_message; end if;
end
$function$;

create or replace function pg_temp.edpr_rejected(p_sql text, p_message text)
returns void language plpgsql as $function$
begin
  begin execute p_sql;
  exception when others then return;
  end;
  raise exception '%', p_message;
end
$function$;

grant execute on function pg_temp.edpr_assert(boolean,text) to public;
grant execute on function pg_temp.edpr_rejected(text,text) to public;

insert into auth.users(
  id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('ed000000-0000-4000-8000-000000000001','authenticated','authenticated','edpr-owner@example.test','',
   '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
  ('ed000000-0000-4000-8000-000000000002','authenticated','authenticated','edpr-other@example.test','',
   '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());

set local role authenticated;
select set_config('request.jwt.claim.sub','ed000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select (public.upsert_manual_personal_record_atomic(
  null,
  '{"identityKind":"custom_subject","identity":"custom:tempo-run","name":"Tempo run","sportDomain":"running","sportName":"Running","authoritySnapshot":{}}'::jsonb,
  '{"id":"fastest_time:v1","key":"fastest_time","version":"1","label":"Fastest time","comparisonDirection":"lower_better","canonicalUnit":"seconds"}'::jsonb,
  360,
  '{"distanceMeters":5000}'::jsonb,
  '2026-08-01T10:00:00Z',
  'First timed effort'
)).id as manual_event_id
\gset

select pg_temp.edpr_assert(
  (select source_kind='manual'
      and event_semantics_version='manual-event-time-v1'
      and canonical_value=360
      and comparison_context='{"distanceMeters":5000}'::jsonb
   from public.personal_records where id=:'manual_event_id'::uuid),
  'Manual Personal Record was not stored with its event-time semantics.'
);

select pg_temp.edpr_rejected(
  $$select public.upsert_manual_personal_record_atomic(
    null,
    '{"identityKind":"custom_subject","identity":"custom:tempo-run","name":"Tempo run","sportDomain":"running","sportName":"Running","authoritySnapshot":{}}'::jsonb,
    '{"id":"fastest_time:v1","key":"fastest_time","version":"1","label":"Fastest time","comparisonDirection":"lower_better","canonicalUnit":"seconds"}'::jsonb,
    370,
    '{"distanceMeters":5000}'::jsonb,
    '2026-08-02T10:00:00Z', null
  )$$,
  'A later worse Manual result was accepted as a Personal Record.'
);

select (public.upsert_manual_personal_record_atomic(
  :'manual_event_id'::uuid,
  '{"identityKind":"custom_subject","identity":"custom:tempo-run","name":"Tempo run","sportDomain":"running","sportName":"Running","authoritySnapshot":{}}'::jsonb,
  '{"id":"fastest_time:v1","key":"fastest_time","version":"1","label":"Fastest time","comparisonDirection":"lower_better","canonicalUnit":"seconds"}'::jsonb,
  355,
  '{"distanceMeters":5000}'::jsonb,
  '2026-08-01T10:00:00Z',
  'Corrected time'
)).id;

select pg_temp.edpr_assert(
  (select canonical_value=355 and notes='Corrected time'
   from public.personal_records where id=:'manual_event_id'::uuid),
  'Manual Personal Record edit did not preserve lineage and update the event.'
);

select set_config('request.jwt.claim.sub','ed000000-0000-4000-8000-000000000002',true);
select pg_temp.edpr_rejected(
  format('select public.delete_manual_personal_record_atomic(%L::uuid)', :'manual_event_id'),
  'Another member deleted the owner Manual Personal Record.'
);

select set_config('request.jwt.claim.sub','ed000000-0000-4000-8000-000000000001',true);
select public.delete_manual_personal_record_atomic(:'manual_event_id'::uuid);
select pg_temp.edpr_assert(
  not exists(select 1 from public.personal_records where id=:'manual_event_id'::uuid),
  'Manual Personal Record delete did not remove the event.'
);

select (public.create_workout_plan_atomic(
  'ed000000-0000-4000-8000-000000000001',
  '{"name":"EDPR plan","source":"manual","program_duration_weeks":1,"days":[{"day_name":"Strength day","weekday":"Monday","exercises":[{"exercise_name":"Seed squat","sets":3,"reps":"8","rest_seconds":90}]}]}'::jsonb,
  false,
  date '2026-08-13'
))->>'id' as plan_id
\gset

reset role;
select id as plan_day_id
from public.user_workout_plan_days
where plan_id=:'plan_id'::uuid
order by day_number,id
limit 1
\gset

set local role authenticated;
select set_config('request.jwt.claim.sub','ed000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

insert into public.user_workout_plan_week_templates(plan_id,name,sort_order,source)
values (:'plan_id'::uuid,'EDPR week',1,'manual')
returning id as week_template_id
\gset

insert into public.user_workout_plan_sessions(
  week_template_id,source_legacy_plan_day_id,source,title,day_offset,
  sport_slug,sport_name_snapshot,sort_order
) values (
  :'week_template_id'::uuid,:'plan_day_id'::uuid,'legacy_backfill','Strength day',0,
  null,'Legacy training',1
) returning id as plan_session_id
\gset

insert into public.user_workout_plan_phases(plan_session_id,phase_slug,phase_name_snapshot,sort_order)
values (:'plan_session_id'::uuid,'main_work','Main work',1);

select (public.add_catalog_activity_to_plan_day_atomic(
  :'plan_day_id'::uuid,
  '{"id":"custom:tempo-run","name":"Tempo run","catalogSource":"custom","instructions":[{"order":1,"text":"Hold a controlled pace."}],"prescriptionSchema":null,"catalogAuthoritySnapshot":null}'::jsonb,
  '{"sets":3,"reps":"8","rest_seconds":90}'::jsonb
))->>'status' as first_add_status
\gset

select (public.add_catalog_activity_to_plan_day_atomic(
  :'plan_day_id'::uuid,
  '{"id":"custom:tempo-run","name":"Tempo run","catalogSource":"custom","instructions":[{"order":1,"text":"Hold a controlled pace."}],"prescriptionSchema":null,"catalogAuthoritySnapshot":null}'::jsonb,
  '{"sets":3,"reps":"8","rest_seconds":90}'::jsonb
))->>'status' as duplicate_add_status
\gset

reset role;
select pg_temp.edpr_assert(
  :'first_add_status'='added'
  and :'duplicate_add_status'='duplicate'
  and (select count(*)=1 from public.user_workout_plan_exercises
       where plan_day_id=:'plan_day_id'::uuid and source_workout_id='custom:tempo-run')
  and (select count(*)=1
       from public.user_workout_plan_activities activity
       join public.user_workout_plan_phases phase on phase.id=activity.plan_phase_id
       join public.user_workout_plan_sessions session on session.id=phase.plan_session_id
       where session.source_legacy_plan_day_id=:'plan_day_id'::uuid
         and activity.catalog_activity_id='custom:tempo-run'),
  'Atomic Add to plan did not write both authorities exactly once.'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','ed000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.edpr_rejected(
  format(
    'select public.add_catalog_activity_to_plan_day_atomic(%L::uuid,%L::jsonb,%L::jsonb)',
    :'plan_day_id',
    '{"id":"custom:foreign","name":"Foreign","catalogSource":"custom","catalogAuthoritySnapshot":null}',
    '{}'
  ),
  'Another member added an activity to the owner plan.'
);

rollback;
