-- Disposable local verification for Nutrition V1 target, plan, and grouped Diary authority.
\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.nv1p_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception '%', p_message;
  end if;
end
$function$;

create or replace function pg_temp.nv1p_rejected(p_sql text, p_message text)
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

grant execute on function pg_temp.nv1p_assert(boolean, text) to public;
grant execute on function pg_temp.nv1p_rejected(text, text) to public;

do $catalog$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.nutrition_target_periods'::regclass and contype = 'x'
  ) then
    raise exception 'Nutrition V1 target period overlap protection missing.';
  end if;

  if not exists (
    select 1 from pg_class
    where oid = 'public.nutrition_meal_plan_weeks'::regclass and relrowsecurity
  ) then
    raise exception 'Nutrition V1 Meal Plan week RLS missing.';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.nutrition_log_groups'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) like '%user_id, operation_id%'
  ) then
    raise exception 'Nutrition V1 grouped log idempotency missing.';
  end if;

  if exists (
    select 1 from (values
      ('food_logs'),
      ('user_meal_plan_items'),
      ('user_nutrition_target_profiles'),
      ('user_nutrition_target_date_overrides'),
      ('saved_recipes'),
      ('custom_meals')
    ) required(table_name)
    left join pg_class relation
      on relation.relname = required.table_name
     and relation.relnamespace = 'public'::regnamespace
     and relation.relkind = 'r'
    where relation.oid is null
  ) then
    raise exception 'Legacy Nutrition compatibility table missing.';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.nutrition_planned_occurrences'::regclass
      and pg_get_constraintdef(oid) ilike '%source_type = ''recipe''%source_version_id is not null%'
  ) then
    raise exception 'Nutrition V1 Recipe occurrence version lineage missing.';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.nutrition_planned_occurrences'::regclass
      and tgname = 'enforce_nutrition_planned_occurrence_week_date'
      and not tgisinternal
  ) then
    raise exception 'Nutrition V1 Meal Plan occurrence week-date guard missing.';
  end if;
end
$catalog$;

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'a2200000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'nutrition-v1-plan-owner@example.invalid', '',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'a2200000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'nutrition-v1-plan-intruder@example.invalid', '',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2200000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.nutrition_target_periods (
  id, user_id, effective_from, effective_to, calories, protein_g, source
) values (
  'a2200000-0000-4000-8000-000000000010',
  'a2200000-0000-4000-8000-000000000001',
  date '2026-08-25', null, 2200, null, 'verification'
);

select pg_temp.nv1p_rejected(
  $$insert into public.nutrition_target_periods (
      user_id, effective_from, effective_to, calories, source
    ) values (
      'a2200000-0000-4000-8000-000000000001',
      date '2026-08-26', null, 2300, 'overlap'
    )$$,
  'Overlapping Nutrition target periods were accepted.'
);

select pg_temp.nv1p_assert(
  (select protein_g is null from public.nutrition_target_periods where id = 'a2200000-0000-4000-8000-000000000010'),
  'Unknown target protein was converted to zero.'
);

insert into public.nutrition_meal_plan_weeks (
  id, user_id, week_start_date
) values (
  'a2200000-0000-4000-8000-000000000020',
  'a2200000-0000-4000-8000-000000000001',
  date '2026-08-24'
);

insert into public.nutrition_planned_occurrences (
  id, week_id, user_id, plan_date, meal_slot_key, position,
  source_type, source_id, source_version_id, resolved_quantity,
  resolved_serving_label, frozen_name, frozen_snapshot
) values (
  'a2200000-0000-4000-8000-000000000021',
  'a2200000-0000-4000-8000-000000000020',
  'a2200000-0000-4000-8000-000000000001',
  date '2026-08-25', 'Breakfast', 0,
  'recipe',
  'a2200000-0000-4000-8000-000000000030',
  'a2200000-0000-4000-8000-000000000031',
  1, '1 serving', 'Versioned breakfast',
  '{"foodName":"Versioned breakfast","servingLabel":"1 serving","quantity":1,"nutrition":{"caloriesKcal":null,"proteinG":null,"carbsG":null,"fatG":null}}'::jsonb
);

select pg_temp.nv1p_assert(
  (
    select source_type = 'recipe' and source_version_id = 'a2200000-0000-4000-8000-000000000031'
    from public.nutrition_planned_occurrences
    where id = 'a2200000-0000-4000-8000-000000000021'
  ),
  'Nutrition V1 Recipe occurrence version lineage missing.'
);

select public.mutate_nutrition_meal_plan_week(
  'a2200000-0000-4000-8000-000000000020',
  0,
  '{"operationId":"a2200000-0000-4000-8000-000000000060","weekOverride":{"note":"verified"}}'::jsonb
);
select pg_temp.nv1p_assert(
  (
    select revision = 1 and week_override_json->>'note' = 'verified'
    from public.nutrition_meal_plan_weeks
    where id = 'a2200000-0000-4000-8000-000000000020'
  ),
  'Meal Plan week mutation did not advance exactly one revision.'
);

-- Lazy creation and the first meaningful mutation must be one transaction.
do $atomic_lazy_create$
declare
  v_result jsonb;
  v_week_id uuid;
begin
  v_result := public.mutate_nutrition_meal_plan_week(
    null,
    0,
    '{"operationId":"a2200000-0000-4000-8000-000000000061","weekStartDate":"2026-09-07","upsertOccurrences":[{"planDate":"2026-09-07","mealSlotKey":"Lunch","position":0,"sourceType":"placeholder","sourceId":null,"sourceVersionId":null,"resolvedQuantity":null,"resolvedServingLabel":null,"frozenName":"Atomic lunch","frozenSnapshot":{"name":"Atomic lunch"},"status":"planned"}]}'::jsonb
  );
  v_week_id := (v_result->>'weekId')::uuid;
  perform pg_temp.nv1p_assert(
    v_week_id is not null
    and (select count(*) = 1 from public.nutrition_meal_plan_weeks where id = v_week_id and user_id = 'a2200000-0000-4000-8000-000000000001' and week_start_date = date '2026-09-07' and revision = 1)
    and (select count(*) = 1 from public.nutrition_planned_occurrences where week_id = v_week_id and user_id = 'a2200000-0000-4000-8000-000000000001' and plan_date = date '2026-09-07'),
    'Meal Plan lazy creation did not commit one complete first-write transaction.'
  );
end
$atomic_lazy_create$;

-- A failed first mutation must not strand the lazily created week.
select pg_temp.nv1p_rejected(
  $$select public.mutate_nutrition_meal_plan_week(
    null,
    0,
    '{"operationId":"a2200000-0000-4000-8000-000000000062","weekStartDate":"2026-09-14","upsertOccurrences":[{"planDate":"2026-09-21","mealSlotKey":"Lunch","position":0,"sourceType":"placeholder","sourceId":null,"sourceVersionId":null,"resolvedQuantity":null,"resolvedServingLabel":null,"frozenName":"Out of week","frozenSnapshot":{"name":"Out of week"},"status":"planned"}]}'::jsonb
  )$$,
  'Meal Plan accepted an occurrence outside the target week.'
);
select pg_temp.nv1p_assert(
  not exists (
    select 1
    from public.nutrition_meal_plan_weeks
    where user_id = 'a2200000-0000-4000-8000-000000000001'
      and week_start_date = date '2026-09-14'
  ),
  'Failed first Meal Plan mutation stranded an empty week.'
);

-- The table-level trigger must also block bypasses around the RPC.
select pg_temp.nv1p_rejected(
  $$update public.nutrition_planned_occurrences
    set plan_date = date '2026-08-31'
    where id = 'a2200000-0000-4000-8000-000000000021'$$,
  'Direct cross-week Meal Plan occurrence update was accepted.'
);
select pg_temp.nv1p_assert(
  (select plan_date = date '2026-08-25' from public.nutrition_planned_occurrences where id = 'a2200000-0000-4000-8000-000000000021'),
  'Rejected cross-week update changed the persisted occurrence date.'
);

insert into public.nutrition_meal_plan_change_requests (
  id, user_id, week_id, base_revision, proposal_json
) values (
  'a2200000-0000-4000-8000-000000000040',
  'a2200000-0000-4000-8000-000000000001',
  'a2200000-0000-4000-8000-000000000020',
  0,
  '{"weekOverride":{"note":"stale must not apply"}}'::jsonb
);
select public.apply_nutrition_meal_plan_change_request('a2200000-0000-4000-8000-000000000040');
select pg_temp.nv1p_assert(
  (
    select state = 'stale' and applied_revision is null
    from public.nutrition_meal_plan_change_requests
    where id = 'a2200000-0000-4000-8000-000000000040'
  ),
  'Stale Meal Plan proposal was not rejected.'
);

select public.log_nutrition_group(
  'a2200000-0000-4000-8000-000000000050',
  date '2026-08-25',
  'Lunch',
  'quick_add',
  null, null,
  '{"name":"Unknown nutrition lunch"}'::jsonb,
  '[{"foodName":"Unknown nutrition lunch","servingLabel":"1 bowl","quantity":1,"nutrition":{"caloriesKcal":null,"proteinG":null,"carbsG":null,"fatG":null}}]'::jsonb,
  null
);
select public.log_nutrition_group(
  'a2200000-0000-4000-8000-000000000050',
  date '2026-08-25',
  'Lunch',
  'quick_add',
  null, null,
  '{"name":"Unknown nutrition lunch"}'::jsonb,
  '[{"foodName":"Unknown nutrition lunch","servingLabel":"1 bowl","quantity":1,"nutrition":{"caloriesKcal":null,"proteinG":null,"carbsG":null,"fatG":null}}]'::jsonb,
  null
);

select pg_temp.nv1p_assert(
  (
    select count(*) = 1
    from public.nutrition_log_groups
    where user_id = 'a2200000-0000-4000-8000-000000000001'
      and operation_id = 'a2200000-0000-4000-8000-000000000050'
  ),
  'Nutrition V1 grouped log idempotency missing.'
);
select pg_temp.nv1p_assert(
  (
    select count(*) = 1
    from public.food_logs
    where user_id = 'a2200000-0000-4000-8000-000000000001'
      and food_name = 'Unknown nutrition lunch'
      and calories is null and protein_g is null and carbs_g is null and fat_g is null
  ),
  'Unknown logged nutrition was invented or duplicate logging occurred.'
);

select public.complete_nutrition_planned_occurrence(
  'a2200000-0000-4000-8000-000000000021',
  'a2200000-0000-4000-8000-000000000051',
  null
);
select pg_temp.nv1p_assert(
  (
    select status = 'completed' and actual_log_group_id is not null
    from public.nutrition_planned_occurrences
    where id = 'a2200000-0000-4000-8000-000000000021'
  ),
  'Plan occurrence did not atomically become an actual grouped log.'
);

select public.undo_nutrition_planned_occurrence_completion('a2200000-0000-4000-8000-000000000021');
select pg_temp.nv1p_assert(
  (
    select status = 'planned' and completed_at is null and actual_log_group_id is null
    from public.nutrition_planned_occurrences
    where id = 'a2200000-0000-4000-8000-000000000021'
  ),
  'Plan completion undo did not restore intended-only state.'
);

select set_config('request.jwt.claim.sub', 'a2200000-0000-4000-8000-000000000002', true);
select pg_temp.nv1p_assert(
  not exists (
    select 1 from public.nutrition_meal_plan_weeks
    where id = 'a2200000-0000-4000-8000-000000000020'
  ),
  'Nutrition V1 Meal Plan owner isolation failed.'
);

rollback;
