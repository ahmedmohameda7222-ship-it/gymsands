-- Backup required before running this cleanup.
-- This script removes legacy imported workout rows and generated plans tied to copied recommendations.
-- Review every table in your Supabase project before running in production.

begin;

do $$
declare
  old_host text := 'muscle' || 'and' || 'strength' || '.com';
  old_source text := 'muscle' || '_' || 'strength';
  legacy_source text := 'template' || '_' || 'recommendation';
  target record;
  predicate text;
begin
  if to_regclass('public.user_workout_plans') is not null then
    delete from public.user_workout_plans
    where source = legacy_source
       or match_explanation ilike '%copied%'
       or exists (
         select 1
         from public.user_workout_plan_days d
         join public.user_workout_plan_exercises e on e.plan_day_id = d.id
         where d.plan_id = user_workout_plans.id
           and (
             coalesce(e.exercise_url, '') ilike '%' || old_host || '%'
             or coalesce(e.video_url, '') ilike '%' || old_host || '%'
             or coalesce(e.notes, '') ilike '%' || old_host || '%'
           )
       );
  end if;

  if to_regclass('public.workout_template_exercises') is not null then
    truncate table public.workout_template_exercises restart identity cascade;
  end if;

  if to_regclass('public.workout_template_days') is not null then
    truncate table public.workout_template_days restart identity cascade;
  end if;

  if to_regclass('public.workout_templates') is not null then
    truncate table public.workout_templates restart identity cascade;
  end if;

  for target in
    select *
    from (values
      ('public.exercise_videos', array['exercise_url','video_url','instructions','source']),
      ('public.workouts', array['exercise_url','notes','instructions','source']),
      ('public.user_workout_plan_exercises', array['exercise_url','video_url','custom_video_url','notes','instructions'])
    ) as t(table_name, columns)
  loop
    if to_regclass(target.table_name) is null then
      continue;
    end if;

    select string_agg(format('coalesce(%I, '''') ilike %L or coalesce(%I, '''') ilike %L', c.column_name, '%' || old_host || '%', c.column_name, '%' || old_source || '%'), ' or ')
      into predicate
    from information_schema.columns c
    where (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name)) = target.table_name
      and c.column_name = any(target.columns);

    if predicate is not null then
      execute format('delete from %s where %s', target.table_name, predicate);
    end if;
  end loop;
end $$;

commit;
