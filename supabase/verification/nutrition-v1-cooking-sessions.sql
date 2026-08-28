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

  if exists (
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
    raise exception 'Nutrition V1 cooking timer display metadata is still acting as identity.';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'nutrition_cooking_timers'
      and indexname = 'nutrition_cooking_timers_action_name_idx'
      and indexdef not ilike '%unique%'
  ) then
    raise exception 'Nutrition V1 cooking same-name timer lookup index missing.';
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

insert into public.nutrition_recipes (id, user_id, name) values (
  'a2120000-0000-4000-8000-000000000020',
  'a2120000-0000-4000-8000-000000000001',
  'Frozen cooking fixture'
);
insert into public.nutrition_recipe_versions (
  id, recipe_id, user_id, version_number, name, servings, metadata
) values (
  'a2120000-0000-4000-8000-000000000021',
  'a2120000-0000-4000-8000-000000000020',
  'a2120000-0000-4000-8000-000000000001',
  1, 'Frozen cooking fixture', 4, '{"fixture":true}'::jsonb
);
insert into public.nutrition_recipe_actions (
  id, user_id, recipe_version_id, position, instruction, dependency_action_ids
) values (
  'a2120000-0000-4000-8000-000000000022',
  'a2120000-0000-4000-8000-000000000001',
  'a2120000-0000-4000-8000-000000000021',
  0, 'Boil water', '{}'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2120000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $runtime$
declare
  v_started jsonb;
  v_session_id uuid;
  v_action_state_id uuid;
  v_sync jsonb;
begin
  v_started := public.start_nutrition_cooking_session(
    'a2120000-0000-4000-8000-000000000020',
    'a2120000-0000-4000-8000-000000000021',
    1.5,
    '2026-08-28T03:00:00Z'
  );
  v_session_id := (v_started->>'sessionId')::uuid;

  select id into v_action_state_id
  from public.nutrition_cooking_action_states
  where session_id = v_session_id
    and action_key = 'a2120000-0000-4000-8000-000000000022';

  v_sync := public.sync_nutrition_cooking_session_state(
    v_session_id,
    0,
    'a2120000-0000-4000-8000-000000000022',
    '2026-08-28T03:01:00Z',
    jsonb_build_array(jsonb_build_object(
      'id', v_action_state_id,
      'action_key', 'a2120000-0000-4000-8000-000000000022',
      'state', 'waiting_for_condition',
      'state_revision', 1
    )),
    jsonb_build_array(
      jsonb_build_object(
        'id', 'a2120000-0000-4000-8000-000000000040',
        'action_state_id', v_action_state_id,
        'timer_name', 'Pasta',
        'duration_seconds', 540,
        'status', 'running',
        'started_at', '2026-08-28T03:01:00Z',
        'target_at', '2026-08-28T03:10:00Z'
      ),
      jsonb_build_object(
        'id', 'a2120000-0000-4000-8000-000000000041',
        'action_state_id', v_action_state_id,
        'timer_name', 'Pasta',
        'duration_seconds', 240,
        'status', 'running',
        'started_at', '2026-08-28T03:01:00Z',
        'target_at', '2026-08-28T03:05:00Z'
      )
    )
  );

  perform pg_temp.nv1_cooking_assert(
    (v_sync->>'stateRevision')::integer = 1,
    'Nutrition V1 cooking sync revision contract missing.'
  );

  perform pg_temp.nv1_cooking_assert(
    (
      select count(*) = 2
      from public.nutrition_cooking_timers
      where action_state_id = v_action_state_id
        and timer_name = 'Pasta'
        and started_at is not null
        and target_at is not null
    ),
    'Nutrition V1 distinct same-name timer instances could not coexist.'
  );

  v_sync := public.sync_nutrition_cooking_session_state(
    v_session_id,
    1,
    'a2120000-0000-4000-8000-000000000022',
    '2026-08-28T03:02:00Z',
    jsonb_build_array(jsonb_build_object(
      'id', v_action_state_id,
      'action_key', 'a2120000-0000-4000-8000-000000000022',
      'state', 'waiting_for_condition',
      'state_revision', 2
    )),
    jsonb_build_array(jsonb_build_object(
      'id', 'a2120000-0000-4000-8000-000000000040',
      'action_state_id', v_action_state_id,
      'timer_name', 'Pasta',
      'duration_seconds', 540,
      'status', 'paused',
      'started_at', '2026-08-28T03:01:00Z',
      'target_at', '2026-08-28T03:10:00Z',
      'paused_at', '2026-08-28T03:02:00Z',
      'paused_remaining_seconds', 480
    ))
  );

  perform pg_temp.nv1_cooking_assert(
    (v_sync->>'stateRevision')::integer = 2
    and (
      select count(*) = 2
      from public.nutrition_cooking_timers
      where action_state_id = v_action_state_id and timer_name = 'Pasta'
    )
    and (
      select count(*) = 1
      from public.nutrition_cooking_timers
      where id = 'a2120000-0000-4000-8000-000000000040'
        and status = 'paused'
        and paused_remaining_seconds = 480
    ),
    'Nutrition V1 same timer UUID retry was not idempotent.'
  );

  perform pg_temp.nv1_cooking_assert(
    (
      select current_action_key = 'a2120000-0000-4000-8000-000000000022'
         and status = 'active'
         and started_at is not null
         and last_active_at is not null
         and state_revision = 2
         and frozen_recipe_snapshot->'recipe'->>'name' = 'Frozen cooking fixture'
         and jsonb_array_length(frozen_recipe_snapshot->'actions') = 1
      from public.nutrition_cooking_sessions
      where id = v_session_id
    ),
    'Nutrition V1 cooking resumable state contract missing.'
  );
end
$runtime$;

select pg_temp.nv1_cooking_rejected(
  $$update public.nutrition_cooking_sessions
    set frozen_recipe_snapshot = '{"schemaVersion":1,"recipe":{"name":"Mutated"},"ingredients":[],"actions":[],"equipment":[]}'::jsonb
    where recipe_id = 'a2120000-0000-4000-8000-000000000020'$$,
  'Nutrition V1 cooking frozen Recipe snapshot was mutable.'
);

select pg_temp.nv1_cooking_rejected(
  $$insert into public.nutrition_cooking_sessions (
      user_id, recipe_id, recipe_version_id, frozen_recipe_snapshot, serving_scale
    ) values (
      'a2120000-0000-4000-8000-000000000001',
      'a2120000-0000-4000-8000-000000000020',
      'a2120000-0000-4000-8000-000000000021',
      '{"schemaVersion":1,"recipe":{},"ingredients":[],"actions":[],"equipment":[]}'::jsonb,
      1
    )$$,
  'Nutrition V1 cooking initial session creation bypassed the transactional RPC.'
);

select set_config('request.jwt.claim.sub', 'a2120000-0000-4000-8000-000000000002', true);

select pg_temp.nv1_cooking_assert(
  not exists (
    select 1 from public.nutrition_cooking_sessions
    where recipe_id = 'a2120000-0000-4000-8000-000000000020'
  )
  and not exists (
    select 1 from public.nutrition_cooking_action_states
    where action_key = 'a2120000-0000-4000-8000-000000000022'
  )
  and not exists (
    select 1 from public.nutrition_cooking_timers
    where id in (
      'a2120000-0000-4000-8000-000000000040',
      'a2120000-0000-4000-8000-000000000041'
    )
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
  'Nutrition V1 cooking cross-owner/write-authority access leaked.'
);

rollback;
