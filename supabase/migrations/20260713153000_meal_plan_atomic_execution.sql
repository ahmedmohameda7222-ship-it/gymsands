begin;

create unique index if not exists user_grocery_items_unique_meal_source
  on public.user_grocery_items (user_id, week_start, source_meal_plan_item_id)
  where source_meal_plan_item_id is not null;

create unique index if not exists user_meal_plan_items_unique_food_log
  on public.user_meal_plan_items (food_log_id)
  where food_log_id is not null;

create or replace function public.enforce_user_meal_plan_item_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('done', 'skipped') and new.status <> old.status then
    raise exception 'Completed and skipped meal-plan states are terminal.'
      using errcode = '23514';
  end if;

  if new.status = 'planned' and (new.completed_at is not null or new.food_log_id is not null) then
    raise exception 'Planned meal-plan items cannot contain completion or food-log references.'
      using errcode = '23514';
  end if;

  if new.status = 'skipped' and (new.completed_at is not null or new.food_log_id is not null) then
    raise exception 'Skipped meal-plan items cannot contain completion or food-log references.'
      using errcode = '23514';
  end if;

  if new.status = 'done' and (new.completed_at is null or new.food_log_id is null) then
    raise exception 'Completed meal-plan items require a completion time and linked food log.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_user_meal_plan_item_status_transition() from public, anon, authenticated;

create or replace function public.complete_meal_plan_item(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.user_meal_plan_items%rowtype;
  v_log public.food_logs%rowtype;
  v_completed_at timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into v_item
  from public.user_meal_plan_items
  where id = p_item_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Meal-plan item not found.' using errcode = 'P0002';
  end if;

  if v_item.status = 'skipped' then
    raise exception 'A skipped meal cannot be completed.' using errcode = '23514';
  end if;

  if v_item.food_log_id is not null then
    select * into v_log
    from public.food_logs
    where id = v_item.food_log_id and user_id = v_user_id;

    if not found then
      raise exception 'The linked food log is missing or not owned by this user.' using errcode = '23514';
    end if;

    if v_item.status <> 'done' or v_item.completed_at is null then
      update public.user_meal_plan_items
      set status = 'done', completed_at = coalesce(completed_at, v_completed_at), updated_at = v_completed_at
      where id = v_item.id
      returning * into v_item;
    end if;

    return jsonb_build_object('item', to_jsonb(v_item), 'log', to_jsonb(v_log), 'already_done', true);
  end if;

  insert into public.food_logs (
    user_id, food_item_id, user_food_item_id, log_date, meal_type, food_name,
    serving_size, quantity, calories, protein_g, carbs_g, fat_g, notes
  ) values (
    v_item.user_id, v_item.food_item_id, v_item.user_food_item_id, v_item.plan_date,
    v_item.meal_type, v_item.food_name, v_item.serving_size, v_item.quantity,
    v_item.calories, v_item.protein_g, v_item.carbs_g, v_item.fat_g, v_item.notes
  ) returning * into v_log;

  update public.user_meal_plan_items
  set status = 'done', food_log_id = v_log.id, completed_at = v_completed_at, updated_at = v_completed_at
  where id = v_item.id
  returning * into v_item;

  return jsonb_build_object('item', to_jsonb(v_item), 'log', to_jsonb(v_log), 'already_done', false);
end;
$$;

create or replace function public.correct_completed_meal_plan_item(
  p_item_id uuid,
  p_plan_date date,
  p_meal_type text,
  p_food_name text,
  p_serving_size text,
  p_quantity numeric,
  p_calories numeric,
  p_protein_g numeric,
  p_carbs_g numeric,
  p_fat_g numeric,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.user_meal_plan_items%rowtype;
  v_log public.food_logs%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_food_name is null or btrim(p_food_name) = '' then
    raise exception 'Food name is required.' using errcode = '23514';
  end if;
  if p_serving_size is null or btrim(p_serving_size) = '' then
    raise exception 'Serving is required.' using errcode = '23514';
  end if;
  if p_meal_type not in ('Breakfast', 'Lunch', 'Dinner', 'Snack') then
    raise exception 'Invalid meal type.' using errcode = '23514';
  end if;
  if p_quantity <= 0 or p_calories < 0 or p_protein_g < 0 or p_carbs_g < 0 or p_fat_g < 0 then
    raise exception 'Quantity and nutrition values are invalid.' using errcode = '23514';
  end if;

  select * into v_item
  from public.user_meal_plan_items
  where id = p_item_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Meal-plan item not found.' using errcode = 'P0002';
  end if;
  if v_item.status <> 'done' or v_item.food_log_id is null then
    raise exception 'Only a completed meal with a linked food log can be corrected.' using errcode = '23514';
  end if;

  select * into v_log
  from public.food_logs
  where id = v_item.food_log_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'The linked food log is missing or not owned by this user.' using errcode = '23514';
  end if;

  update public.food_logs
  set log_date = p_plan_date, meal_type = p_meal_type, food_name = btrim(p_food_name),
      serving_size = btrim(p_serving_size), quantity = p_quantity, calories = p_calories,
      protein_g = p_protein_g, carbs_g = p_carbs_g, fat_g = p_fat_g,
      notes = nullif(btrim(coalesce(p_notes, '')), ''), updated_at = v_now
  where id = v_log.id
  returning * into v_log;

  update public.user_meal_plan_items
  set plan_date = p_plan_date, meal_type = p_meal_type, food_name = btrim(p_food_name),
      serving_size = btrim(p_serving_size), quantity = p_quantity, calories = p_calories,
      protein_g = p_protein_g, carbs_g = p_carbs_g, fat_g = p_fat_g,
      notes = nullif(btrim(coalesce(p_notes, '')), ''), updated_at = v_now
  where id = v_item.id
  returning * into v_item;

  return jsonb_build_object('item', to_jsonb(v_item), 'log', to_jsonb(v_log));
end;
$$;

revoke all on function public.complete_meal_plan_item(uuid) from public, anon;
revoke all on function public.correct_completed_meal_plan_item(uuid, date, text, text, text, numeric, numeric, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.complete_meal_plan_item(uuid) to authenticated;
grant execute on function public.correct_completed_meal_plan_item(uuid, date, text, text, text, numeric, numeric, numeric, numeric, numeric, text) to authenticated;

comment on function public.complete_meal_plan_item(uuid) is
  'Atomically completes an owned planned meal and creates exactly one linked food log. Repairs legacy done rows that lack a food-log link.';
comment on function public.correct_completed_meal_plan_item(uuid, date, text, text, text, numeric, numeric, numeric, numeric, numeric, text) is
  'Atomically corrects an owned completed meal-plan item and its linked food log.';

commit;
