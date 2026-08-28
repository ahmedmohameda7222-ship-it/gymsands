-- Nutrition V1 Meal Plan final review correction.
-- Keep lazy week creation and occurrence-date membership inside one database transaction.

begin;

-- Refuse to silently bless any pre-existing row whose date does not belong to
-- its persisted week. Production was checked before this migration and had none.
do $$
begin
  if exists (
    select 1
    from public.nutrition_planned_occurrences occurrence
    join public.nutrition_meal_plan_weeks week
      on week.id = occurrence.week_id
     and week.user_id = occurrence.user_id
    where occurrence.plan_date < week.week_start_date
       or occurrence.plan_date >= week.week_start_date + 7
  ) then
    raise exception 'Existing Meal Plan occurrence date is outside its target week.' using errcode = '23514';
  end if;
end;
$$;

create or replace function public.enforce_nutrition_planned_occurrence_week_date()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_week_start date;
begin
  select week_start_date
  into v_week_start
  from public.nutrition_meal_plan_weeks
  where id = new.week_id
    and user_id = new.user_id;

  if not found then
    raise exception 'Meal Plan week not found.' using errcode = '23503';
  end if;

  if new.plan_date < v_week_start or new.plan_date >= v_week_start + 7 then
    raise exception 'Meal Plan occurrence date must remain within the target week.' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_nutrition_planned_occurrence_week_date() from public, anon, authenticated;

drop trigger if exists enforce_nutrition_planned_occurrence_week_date on public.nutrition_planned_occurrences;
create trigger enforce_nutrition_planned_occurrence_week_date
before insert or update of week_id, user_id, plan_date
on public.nutrition_planned_occurrences
for each row execute function public.enforce_nutrition_planned_occurrence_week_date();

create or replace function public.mutate_nutrition_meal_plan_week(
  p_week_id uuid,
  p_base_revision bigint,
  p_mutation jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_week public.nutrition_meal_plan_weeks%rowtype;
  v_requested_week_start date;
  v_item jsonb;
  v_occurrence_id uuid;
  v_existing_owner uuid;
  v_plan_date date;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_mutation is null or jsonb_typeof(p_mutation) <> 'object' then
    raise exception 'Mutation payload must be an object.' using errcode = '22023';
  end if;
  if p_base_revision is null or p_base_revision < 0 then
    raise exception 'Meal Plan base revision is invalid.' using errcode = '22023';
  end if;

  if p_mutation ? 'weekStartDate' then
    if jsonb_typeof(p_mutation->'weekStartDate') <> 'string'
      or nullif(btrim(p_mutation->>'weekStartDate'), '') is null then
      raise exception 'weekStartDate must be a date string.' using errcode = '22023';
    end if;
    v_requested_week_start := (p_mutation->>'weekStartDate')::date;
  end if;

  if p_week_id is null then
    if p_base_revision <> 0 then
      raise exception 'A new Meal Plan week must start at revision zero.' using errcode = '22023';
    end if;
    if v_requested_week_start is null then
      raise exception 'weekStartDate is required when creating a Meal Plan week.' using errcode = '22023';
    end if;

    insert into public.nutrition_meal_plan_weeks (user_id, week_start_date)
    values (v_user_id, v_requested_week_start)
    on conflict (user_id, week_start_date) do nothing
    returning * into v_week;

    if not found then
      select * into v_week
      from public.nutrition_meal_plan_weeks
      where user_id = v_user_id
        and week_start_date = v_requested_week_start
      for update;

      if not found then
        raise exception 'Meal Plan week could not be created or resolved.' using errcode = 'P0002';
      end if;
    end if;
  else
    select * into v_week
    from public.nutrition_meal_plan_weeks
    where id = p_week_id and user_id = v_user_id
    for update;

    if not found then
      raise exception 'Meal Plan week not found.' using errcode = 'P0002';
    end if;

    if v_requested_week_start is not null
      and v_requested_week_start <> v_week.week_start_date then
      raise exception 'Meal Plan week start does not match the target week.' using errcode = '23514';
    end if;
  end if;

  if v_week.revision <> p_base_revision then
    raise exception 'Meal Plan base revision is stale.' using errcode = '40001';
  end if;

  if p_mutation ? 'weekOverride' then
    if jsonb_typeof(p_mutation->'weekOverride') <> 'object' then
      raise exception 'weekOverride must be an object.' using errcode = '22023';
    end if;
    update public.nutrition_meal_plan_weeks
    set week_override_json = p_mutation->'weekOverride'
    where id = v_week.id and user_id = v_user_id;
  end if;

  if p_mutation ? 'deleteOccurrenceIds' then
    if jsonb_typeof(p_mutation->'deleteOccurrenceIds') <> 'array' then
      raise exception 'deleteOccurrenceIds must be an array.' using errcode = '22023';
    end if;
    delete from public.nutrition_planned_occurrences
    where week_id = v_week.id
      and user_id = v_user_id
      and status in ('planned', 'skipped')
      and id in (
        select value::text::uuid
        from jsonb_array_elements(p_mutation->'deleteOccurrenceIds')
      );
  end if;

  if p_mutation ? 'upsertOccurrences' then
    if jsonb_typeof(p_mutation->'upsertOccurrences') <> 'array' then
      raise exception 'upsertOccurrences must be an array.' using errcode = '22023';
    end if;

    for v_item in select value from jsonb_array_elements(p_mutation->'upsertOccurrences') loop
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'Occurrence mutation must be an object.' using errcode = '22023';
      end if;

      v_plan_date := nullif(btrim(v_item->>'planDate'), '')::date;
      if v_plan_date is null then
        raise exception 'Occurrence planDate is required.' using errcode = '22023';
      end if;
      if v_plan_date < v_week.week_start_date or v_plan_date >= v_week.week_start_date + 7 then
        raise exception 'Meal Plan occurrence date must remain within the target week.' using errcode = '23514';
      end if;

      v_occurrence_id := coalesce(nullif(v_item->>'id', '')::uuid, gen_random_uuid());

      select user_id into v_existing_owner
      from public.nutrition_planned_occurrences
      where id = v_occurrence_id;
      if found and v_existing_owner <> v_user_id then
        raise exception 'Occurrence identity is not owned by this user.' using errcode = '42501';
      end if;

      insert into public.nutrition_planned_occurrences (
        id, week_id, user_id, plan_date, meal_slot_key, position,
        source_type, source_id, source_version_id, resolved_quantity,
        resolved_serving_label, frozen_name, frozen_snapshot, status
      ) values (
        v_occurrence_id,
        v_week.id,
        v_user_id,
        v_plan_date,
        nullif(btrim(v_item->>'mealSlotKey'), ''),
        coalesce((v_item->>'position')::integer, 0),
        v_item->>'sourceType',
        nullif(v_item->>'sourceId', '')::uuid,
        nullif(v_item->>'sourceVersionId', '')::uuid,
        nullif(v_item->>'resolvedQuantity', '')::numeric,
        nullif(btrim(v_item->>'resolvedServingLabel'), ''),
        nullif(btrim(v_item->>'frozenName'), ''),
        coalesce(v_item->'frozenSnapshot', '{}'::jsonb),
        coalesce(nullif(v_item->>'status', ''), 'planned')
      )
      on conflict (id) do update set
        plan_date = excluded.plan_date,
        meal_slot_key = excluded.meal_slot_key,
        position = excluded.position,
        source_type = excluded.source_type,
        source_id = excluded.source_id,
        source_version_id = excluded.source_version_id,
        resolved_quantity = excluded.resolved_quantity,
        resolved_serving_label = excluded.resolved_serving_label,
        frozen_name = excluded.frozen_name,
        frozen_snapshot = excluded.frozen_snapshot,
        status = excluded.status
      where nutrition_planned_occurrences.user_id = v_user_id
        and nutrition_planned_occurrences.week_id = v_week.id
        and nutrition_planned_occurrences.status in ('planned', 'skipped');
    end loop;
  end if;

  update public.nutrition_meal_plan_weeks
  set revision = revision + 1
  where id = v_week.id and user_id = v_user_id
  returning * into v_week;

  return jsonb_build_object('weekId', v_week.id, 'revision', v_week.revision);
end;
$$;

revoke all on function public.mutate_nutrition_meal_plan_week(uuid, bigint, jsonb) from public, anon;
grant execute on function public.mutate_nutrition_meal_plan_week(uuid, bigint, jsonb) to authenticated, service_role;

commit;
