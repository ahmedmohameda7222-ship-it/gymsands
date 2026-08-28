-- Disposable local verification for durable Meal Plan mutation operation replay.
\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.nv1mpi_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception '%', p_message;
  end if;
end
$function$;

create or replace function pg_temp.nv1mpi_rejected(p_sql text, p_message text)
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

grant execute on function pg_temp.nv1mpi_assert(boolean, text) to public;
grant execute on function pg_temp.nv1mpi_rejected(text, text) to public;

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'a2290000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'nutrition-v1-meal-plan-idempotency-owner@example.invalid', '',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'a2290000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'nutrition-v1-meal-plan-idempotency-second-owner@example.invalid', '',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2290000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.nutrition_meal_plan_weeks (
  id, user_id, week_start_date
) values (
  'a2290000-0000-4000-8000-000000000010',
  'a2290000-0000-4000-8000-000000000001',
  date '2026-10-05'
);

do $exact_replay$
declare
  v_first jsonb;
  v_retry jsonb;
  v_mutation jsonb := '{"operationId":"a2290000-0000-4000-8000-000000000020","weekStartDate":"2026-10-05","weekOverride":{"note":"one logical command"}}'::jsonb;
begin
  v_first := public.mutate_nutrition_meal_plan_week(
    'a2290000-0000-4000-8000-000000000010',
    0,
    v_mutation
  );

  -- This is the ambiguous-commit retry: the client still has the original
  -- base revision and must converge on the first committed result.
  v_retry := public.mutate_nutrition_meal_plan_week(
    'a2290000-0000-4000-8000-000000000010',
    0,
    v_mutation
  );

  perform pg_temp.nv1mpi_assert(
    v_retry = v_first,
    'Meal Plan retry did not return the original committed result.'
  );
  perform pg_temp.nv1mpi_assert(
    (select revision = 1 and week_override_json->>'note' = 'one logical command'
     from public.nutrition_meal_plan_weeks
     where id = 'a2290000-0000-4000-8000-000000000010'),
    'Meal Plan retry applied the logical command more than once.'
  );
end
$exact_replay$;

select pg_temp.nv1mpi_assert(
  to_regclass('public.nutrition_meal_plan_mutation_operations') is not null,
  'Meal Plan mutation operation authority is missing.'
);
select pg_temp.nv1mpi_assert(
  (
    select count(*) = 1
    from public.nutrition_meal_plan_mutation_operations
    where user_id = 'a2290000-0000-4000-8000-000000000001'
      and operation_id = 'a2290000-0000-4000-8000-000000000020'
  ),
  'Meal Plan logical command did not persist exactly one operation record.'
);

select pg_temp.nv1mpi_rejected(
  $$select public.mutate_nutrition_meal_plan_week(
    'a2290000-0000-4000-8000-000000000010',
    0,
    '{"operationId":"a2290000-0000-4000-8000-000000000020","weekStartDate":"2026-10-05","weekOverride":{"note":"different command"}}'::jsonb
  )$$,
  'Meal Plan accepted reuse of one operation ID for a different command.'
);
select pg_temp.nv1mpi_assert(
  (select revision = 1 from public.nutrition_meal_plan_weeks where id = 'a2290000-0000-4000-8000-000000000010'),
  'Rejected operation-ID reuse changed Meal Plan revision.'
);

-- A command that fails after entering the transactional authority must leave no
-- idempotency residue and no partial occurrence state.
select pg_temp.nv1mpi_rejected(
  $$select public.mutate_nutrition_meal_plan_week(
    'a2290000-0000-4000-8000-000000000010',
    1,
    '{"operationId":"a2290000-0000-4000-8000-000000000021","weekStartDate":"2026-10-05","upsertOccurrences":[{"id":"a2290000-0000-4000-8000-000000000022","planDate":"2026-10-12","mealSlotKey":"Lunch","position":0,"sourceType":"placeholder","sourceId":null,"sourceVersionId":null,"resolvedQuantity":null,"resolvedServingLabel":null,"frozenName":"Out of week","frozenSnapshot":{"name":"Out of week"},"status":"planned"}]}'::jsonb
  )$$,
  'Meal Plan accepted an invalid command used for rollback proof.'
);
select pg_temp.nv1mpi_assert(
  not exists (
    select 1 from public.nutrition_meal_plan_mutation_operations
    where user_id = 'a2290000-0000-4000-8000-000000000001'
      and operation_id = 'a2290000-0000-4000-8000-000000000021'
  )
  and not exists (
    select 1 from public.nutrition_planned_occurrences
    where id = 'a2290000-0000-4000-8000-000000000022'
  )
  and (select revision = 1 from public.nutrition_meal_plan_weeks where id = 'a2290000-0000-4000-8000-000000000010'),
  'Failed Meal Plan command left operation, occurrence, or revision residue.'
);

-- Operation identity is owner-scoped: another owner may use the same opaque
-- operation UUID for a different owned week without seeing/replaying owner A.
select set_config('request.jwt.claim.sub', 'a2290000-0000-4000-8000-000000000002', true);
insert into public.nutrition_meal_plan_weeks (
  id, user_id, week_start_date
) values (
  'a2290000-0000-4000-8000-000000000011',
  'a2290000-0000-4000-8000-000000000002',
  date '2026-10-05'
);

select public.mutate_nutrition_meal_plan_week(
  'a2290000-0000-4000-8000-000000000011',
  0,
  '{"operationId":"a2290000-0000-4000-8000-000000000020","weekStartDate":"2026-10-05","weekOverride":{"note":"owner B command"}}'::jsonb
);
select pg_temp.nv1mpi_assert(
  (
    select count(*) = 2
    from public.nutrition_meal_plan_mutation_operations
    where operation_id = 'a2290000-0000-4000-8000-000000000020'
  )
  and (select revision = 1 from public.nutrition_meal_plan_weeks where id = 'a2290000-0000-4000-8000-000000000011'),
  'Meal Plan operation identity is not safely owner-scoped.'
);

rollback;
