-- Disposable verification for Nutrition V1 Cooking Session persistence.
-- Fixtures and helper functions are rolled back.

\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.nv1_cooking_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception '%', p_message;
  end if;
end
$function$;

create or replace function pg_temp.nv1_cooking_rejected(p_sql text, p_message text)
returns void
language plpgsql
as $function$
begin
  begin
    execute p_sql;
  exception when others then
    return;
  end;
  raise exception '%', p_message;
end
$function$;

grant execute on function pg_temp.nv1_cooking_assert(boolean, text) to public;
grant execute on function pg_temp.nv1_cooking_rejected(text, text) to public;

do $catalog$
declare
  v_action_constraint text;
begin
  if exists (
    select 1
    from (values
      ('nutrition_cooking_sessions'),
      ('nutrition_cooking_action_states'),
      ('nutrition_cooking_timers')
    ) required(table_name)
    left join pg_class relation
      on relation.relname = required.table_name
     and relation.relnamespace = 'public'::regnamespace
     and relation.relkind = 'r'
    where relation.oid is null
  ) then
    raise exception 'Nutrition V1 cooking persistence table missing.';
  end if;

  if exists (
    select 1
    from (values
      ('nutrition_cooking_sessions'),
      ('nutrition_cooking_action_states'),
      ('nutrition_cooking_timers')
    ) required(table_name)
    join pg_class relation
      on relation.relname = required.table_name
     and relation.relnamespace = 'public'::regnamespace
    where relation.relrowsecurity is not true
  ) then
    raise exception 'Nutrition V1 cooking session RLS missing.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'nutrition_cooking_sessions'
      and column_name = 'frozen_recipe_snapshot'
      and data_type = 'jsonb'
  ) or exists (
    select 1
    from pg_constraint
    where conrelid = 'public.nutrition_cooking_sessions'::regclass
      and contype = 'f'
      and pg_get_constraintdef(oid) ~* 'nutrition_recipe'
  ) then
    raise exception 'Nutrition V1 cooking frozen Recipe snapshot missing.';
  end if;

  select pg_get_constraintdef(oid)
    into v_action_constraint
  from pg_constraint
  where conrelid = 'public.nutrition_cooking_action_states'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%not_available%'
  limit 1;

  if v_action_constraint is null
     or v_action_constraint not like '%ready%'
     or v_action_constraint not like '%active%'
     or v_action_constraint not like '%waiting_for_condition%'
     or v_action_constraint not like '%running_background%'
     or v_action_constraint not like '%completed%'
     or v_action_constraint not like '%deferred%'
     or v_action_constraint not like '%skipped%'
  then
    raise exception 'Nutrition V1 cooking action state vocabulary invalid.';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.nutrition_cooking_timers'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ~* 'action_state_id, timer_name'
  ) or exists (
    select 1
    from pg_constraint
    where conrelid = 'public.nutrition_cooking_timers'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ~* '^UNIQUE \(action_state_id\)$'
  ) then
    raise exception 'Nutrition V1 cooking multiple timers contract missing.';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.nutrition_cooking_sessions'::regclass
      and tgname = 'prevent_nutrition_cooking_snapshot_mutation'
      and not tgisinternal
  ) then
    raise exception 'Nutrition V1 cooking frozen Recipe immutability missing.';
  end if;
end
$catalog$;

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'a2120000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'nutrition-cooking-owner@example.invalid', '',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'a2120000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'nutrition-cooking-intruder@example.invalid', '',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2120000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.nutrition_cooking_sessions (
  id, user_id, recipe_id, recipe_version_id, frozen_recipe_snapshot,
  serving_scale, current_action_key, state_revision
) values (
  'a2120000-0000-4000-8000-000000000010',
  'a2120000-0000-4000-8000-000000000001',
  'a2120000-0000-4000-8000-000000000020',
  'a2120000-0000-4000-8000-000000000021',
  '{"name":"Frozen cooking fixture","actions":[{"key":"boil-water"}],"servings":4}'::jsonb,
  1.5,
  'boil-water',
  3
);

insert into public.nutrition_cooking_action_states (
  id, session_id, user_id, action_key, state, state_revision
) values (
  'a2120000-0000-4000-8000-000000000030',
  'a2120000-0000-4000-8000-000000000010',
  'a2120000-0000-4000-8000-000000000001',
  'boil-water',
  'waiting_for_condition',
  2
);

insert into public.nutrition_cooking_timers (
  id, action_state_id, user_id, timer_name, duration_seconds,
  status, started_at, target_at
) values
  (
    'a2120000-0000-4000-8000-000000000040',
    'a2120000-0000-4000-8000-000000000030',
    'a2120000-0000-4000-8000-000000000001',
    'Pasta', 540, 'running', clock_timestamp(), clock_timestamp() + interval '9 minutes'
  ),
  (
    'a2120000-0000-4000-8000-000000000041',
    'a2120000-0000-4000-8000-000000000030',
    'a2120000-0000-4000-8000-000000000001',
    'Chicken rest', 240, 'running', clock_timestamp(), clock_timestamp() + interval '4 minutes'
  );

select pg_temp.nv1_cooking_assert(
  (
    select count(*) = 2
    from public.nutrition_cooking_timers
    where action_state_id = 'a2120000-0000-4000-8000-000000000030'
      and started_at is not null
      and target_at is not null
  ),
  'Nutrition V1 cooking multiple timers contract missing.'
);

select pg_temp.nv1_cooking_assert(
  (
    select current_action_key = 'boil-water'
       and status = 'active'
       and started_at is not null
       and last_active_at is not null
       and state_revision = 3
       and frozen_recipe_snapshot->>'name' = 'Frozen cooking fixture'
    from public.nutrition_cooking_sessions
    where id = 'a2120000-0000-4000-8000-000000000010'
  ),
  'Nutrition V1 cooking resumable state contract missing.'
);

select pg_temp.nv1_cooking_rejected(
  $$update public.nutrition_cooking_sessions
    set frozen_recipe_snapshot = '{"name":"Mutated"}'::jsonb
    where id = 'a2120000-0000-4000-8000-000000000010'$$,
  'Nutrition V1 cooking frozen Recipe snapshot was mutable.'
);

select set_config('request.jwt.claim.sub', 'a2120000-0000-4000-8000-000000000002', true);

select pg_temp.nv1_cooking_assert(
  not exists (
    select 1 from public.nutrition_cooking_sessions
    where id = 'a2120000-0000-4000-8000-000000000010'
  )
  and not exists (
    select 1 from public.nutrition_cooking_action_states
    where id = 'a2120000-0000-4000-8000-000000000030'
  )
  and not exists (
    select 1 from public.nutrition_cooking_timers
    where action_state_id = 'a2120000-0000-4000-8000-000000000030'
  ),
  'Nutrition V1 cooking cross-owner access leaked.'
);

select pg_temp.nv1_cooking_rejected(
  $$insert into public.nutrition_cooking_action_states (
      session_id, user_id, action_key, state
    ) values (
      'a2120000-0000-4000-8000-000000000010',
      'a2120000-0000-4000-8000-000000000001',
      'intruder-action', 'ready'
    )$$,
  'Nutrition V1 cooking cross-owner access leaked.'
);

rollback;
