-- Nutrition V1 effective targets, week-authoritative planning, and grouped actual logging.
-- Additive convergence only: legacy nutrition tables remain readable compatibility data.

begin;

create extension if not exists "pgcrypto";
create extension if not exists btree_gist;

-- Existing food_logs remain the legacy row-level storage used by canonical grouped
-- logging. Widen only nutrient nullability so unknown nutrition stays unknown.
alter table public.food_logs alter column calories drop not null;
alter table public.food_logs alter column protein_g drop not null;
alter table public.food_logs alter column carbs_g drop not null;
alter table public.food_logs alter column fat_g drop not null;

-- ---------------------------------------------------------------------------
-- One effective-dated target authority. Null nutrients remain unknown.
-- ---------------------------------------------------------------------------

create table if not exists public.nutrition_target_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  effective_from date not null,
  effective_to date,
  calories numeric(10,2) check (calories is null or calories >= 0),
  protein_g numeric(10,2) check (protein_g is null or protein_g >= 0),
  carbs_g numeric(10,2) check (carbs_g is null or carbs_g >= 0),
  fat_g numeric(10,2) check (fat_g is null or fat_g >= 0),
  water_ml integer check (water_ml is null or water_ml >= 0),
  source text not null check (length(trim(source)) between 1 and 80),
  source_evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (effective_to is null or effective_to > effective_from),
  exclude using gist (
    user_id with =,
    daterange(effective_from, effective_to, '[)') with &&
  )
);

create index if not exists nutrition_target_periods_owner_effective_idx
on public.nutrition_target_periods(user_id, effective_from desc, effective_to);

-- ---------------------------------------------------------------------------
-- One canonical row per owner/week. Occurrences retain frozen source lineage.
-- ---------------------------------------------------------------------------

create table if not exists public.nutrition_meal_plan_weeks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start_date date not null,
  revision bigint not null default 0 check (revision >= 0),
  week_override_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start_date),
  unique (id, user_id),
  check (extract(isodow from week_start_date) = 1)
);

create index if not exists nutrition_meal_plan_weeks_owner_week_idx
on public.nutrition_meal_plan_weeks(user_id, week_start_date desc);

create table if not exists public.nutrition_planned_occurrences (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_date date not null,
  meal_slot_key text not null check (length(trim(meal_slot_key)) between 1 and 80),
  position integer not null default 0 check (position >= 0),
  source_type text not null check (source_type in ('food', 'recipe', 'saved_meal', 'placeholder')),
  source_id uuid,
  source_version_id uuid,
  resolved_quantity numeric(14,4) check (resolved_quantity is null or resolved_quantity > 0),
  resolved_serving_label text,
  frozen_name text not null check (length(trim(frozen_name)) > 0),
  frozen_snapshot jsonb not null,
  status text not null default 'planned' check (status in ('planned', 'completed', 'completed_changed', 'skipped')),
  completed_at timestamptz,
  actual_log_group_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (week_id, user_id) references public.nutrition_meal_plan_weeks(id, user_id) on delete cascade,
  check (
    (source_type = 'food' and source_id is not null and source_version_id is null)
    or (source_type = 'recipe' and source_id is not null and source_version_id is not null)
    or (source_type = 'saved_meal' and source_id is not null and source_version_id is null)
    or (source_type = 'placeholder' and source_id is null and source_version_id is null)
  ),
  check (
    (status in ('completed', 'completed_changed') and completed_at is not null and actual_log_group_id is not null)
    or (status in ('planned', 'skipped') and completed_at is null and actual_log_group_id is null)
  )
);

create index if not exists nutrition_planned_occurrences_week_date_idx
on public.nutrition_planned_occurrences(week_id, plan_date, meal_slot_key, position, id);

create index if not exists nutrition_planned_occurrences_owner_status_idx
on public.nutrition_planned_occurrences(user_id, status, plan_date, id);

create index if not exists nutrition_planned_occurrences_recipe_lineage_idx
on public.nutrition_planned_occurrences(user_id, source_id, source_version_id)
where source_type = 'recipe';

create table if not exists public.nutrition_meal_plan_change_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_id uuid not null,
  base_revision bigint not null check (base_revision >= 0),
  proposal_json jsonb not null,
  state text not null default 'pending' check (state in ('pending', 'applied', 'cancelled', 'stale')),
  applied_revision bigint check (applied_revision is null or applied_revision >= 0),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (id, user_id),
  foreign key (week_id, user_id) references public.nutrition_meal_plan_weeks(id, user_id) on delete cascade
);

create index if not exists nutrition_meal_plan_change_requests_owner_state_idx
on public.nutrition_meal_plan_change_requests(user_id, state, created_at desc, id);

-- ---------------------------------------------------------------------------
-- Canonical grouped actual-consumption envelope over existing food_logs rows.
-- ---------------------------------------------------------------------------

create table if not exists public.nutrition_log_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  log_date date not null,
  meal_type text not null check (length(trim(meal_type)) between 1 and 80),
  operation_id uuid not null,
  source_type text not null check (source_type in ('food', 'recipe', 'saved_meal', 'planned_occurrence', 'quick_add')),
  source_id uuid,
  source_version_id uuid,
  planned_occurrence_id uuid,
  frozen_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, operation_id),
  check (source_type <> 'recipe' or (source_id is not null and source_version_id is not null))
);

create index if not exists nutrition_log_groups_owner_date_idx
on public.nutrition_log_groups(user_id, log_date desc, meal_type, created_at desc, id);

create index if not exists nutrition_log_groups_recipe_lineage_idx
on public.nutrition_log_groups(user_id, source_id, source_version_id)
where source_type = 'recipe';

create table if not exists public.nutrition_log_group_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  food_log_id uuid references public.food_logs(id) on delete set null,
  position integer not null check (position >= 0),
  frozen_item_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (group_id, position),
  foreign key (group_id, user_id) references public.nutrition_log_groups(id, user_id) on delete cascade
);

create index if not exists nutrition_log_group_items_group_idx
on public.nutrition_log_group_items(group_id, position, id);

alter table public.nutrition_planned_occurrences
  add constraint nutrition_planned_occurrences_actual_group_fk
  foreign key (actual_log_group_id, user_id)
  references public.nutrition_log_groups(id, user_id)
  on delete restrict;

-- ---------------------------------------------------------------------------
-- Updated-at triggers.
-- ---------------------------------------------------------------------------

drop trigger if exists nutrition_target_periods_updated_at on public.nutrition_target_periods;
create trigger nutrition_target_periods_updated_at
before update on public.nutrition_target_periods
for each row execute function public.set_updated_at();

drop trigger if exists nutrition_meal_plan_weeks_updated_at on public.nutrition_meal_plan_weeks;
create trigger nutrition_meal_plan_weeks_updated_at
before update on public.nutrition_meal_plan_weeks
for each row execute function public.set_updated_at();

drop trigger if exists nutrition_planned_occurrences_updated_at on public.nutrition_planned_occurrences;
create trigger nutrition_planned_occurrences_updated_at
before update on public.nutrition_planned_occurrences
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: every row remains owner-scoped. RPCs derive owner from auth.uid().
-- ---------------------------------------------------------------------------

alter table public.nutrition_target_periods enable row level security;
alter table public.nutrition_meal_plan_weeks enable row level security;
alter table public.nutrition_planned_occurrences enable row level security;
alter table public.nutrition_meal_plan_change_requests enable row level security;
alter table public.nutrition_log_groups enable row level security;
alter table public.nutrition_log_group_items enable row level security;

revoke all on public.nutrition_target_periods from anon, authenticated;
revoke all on public.nutrition_meal_plan_weeks from anon, authenticated;
revoke all on public.nutrition_planned_occurrences from anon, authenticated;
revoke all on public.nutrition_meal_plan_change_requests from anon, authenticated;
revoke all on public.nutrition_log_groups from anon, authenticated;
revoke all on public.nutrition_log_group_items from anon, authenticated;

grant select, insert, update, delete on public.nutrition_target_periods to authenticated;
grant select, insert, update, delete on public.nutrition_meal_plan_weeks to authenticated;
grant select, insert, update, delete on public.nutrition_planned_occurrences to authenticated;
grant select, insert, update, delete on public.nutrition_meal_plan_change_requests to authenticated;
grant select on public.nutrition_log_groups to authenticated;
grant select on public.nutrition_log_group_items to authenticated;

grant all privileges on public.nutrition_target_periods to service_role;
grant all privileges on public.nutrition_meal_plan_weeks to service_role;
grant all privileges on public.nutrition_planned_occurrences to service_role;
grant all privileges on public.nutrition_meal_plan_change_requests to service_role;
grant all privileges on public.nutrition_log_groups to service_role;
grant all privileges on public.nutrition_log_group_items to service_role;

-- Reusable owner-policy generator is intentionally expanded explicitly for auditability.
drop policy if exists "nutrition_target_periods_select_own" on public.nutrition_target_periods;
drop policy if exists "nutrition_target_periods_insert_own" on public.nutrition_target_periods;
drop policy if exists "nutrition_target_periods_update_own" on public.nutrition_target_periods;
drop policy if exists "nutrition_target_periods_delete_own" on public.nutrition_target_periods;
create policy "nutrition_target_periods_select_own" on public.nutrition_target_periods
for select to authenticated using (user_id = (select auth.uid()));
create policy "nutrition_target_periods_insert_own" on public.nutrition_target_periods
for insert to authenticated with check (user_id = (select auth.uid()));
create policy "nutrition_target_periods_update_own" on public.nutrition_target_periods
for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "nutrition_target_periods_delete_own" on public.nutrition_target_periods
for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "nutrition_meal_plan_weeks_select_own" on public.nutrition_meal_plan_weeks;
drop policy if exists "nutrition_meal_plan_weeks_insert_own" on public.nutrition_meal_plan_weeks;
drop policy if exists "nutrition_meal_plan_weeks_update_own" on public.nutrition_meal_plan_weeks;
drop policy if exists "nutrition_meal_plan_weeks_delete_own" on public.nutrition_meal_plan_weeks;
create policy "nutrition_meal_plan_weeks_select_own" on public.nutrition_meal_plan_weeks
for select to authenticated using (user_id = (select auth.uid()));
create policy "nutrition_meal_plan_weeks_insert_own" on public.nutrition_meal_plan_weeks
for insert to authenticated with check (user_id = (select auth.uid()));
create policy "nutrition_meal_plan_weeks_update_own" on public.nutrition_meal_plan_weeks
for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "nutrition_meal_plan_weeks_delete_own" on public.nutrition_meal_plan_weeks
for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "nutrition_planned_occurrences_select_own" on public.nutrition_planned_occurrences;
drop policy if exists "nutrition_planned_occurrences_insert_own" on public.nutrition_planned_occurrences;
drop policy if exists "nutrition_planned_occurrences_update_own" on public.nutrition_planned_occurrences;
drop policy if exists "nutrition_planned_occurrences_delete_own" on public.nutrition_planned_occurrences;
create policy "nutrition_planned_occurrences_select_own" on public.nutrition_planned_occurrences
for select to authenticated using (user_id = (select auth.uid()));
create policy "nutrition_planned_occurrences_insert_own" on public.nutrition_planned_occurrences
for insert to authenticated with check (user_id = (select auth.uid()));
create policy "nutrition_planned_occurrences_update_own" on public.nutrition_planned_occurrences
for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "nutrition_planned_occurrences_delete_own" on public.nutrition_planned_occurrences
for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "nutrition_meal_plan_change_requests_select_own" on public.nutrition_meal_plan_change_requests;
drop policy if exists "nutrition_meal_plan_change_requests_insert_own" on public.nutrition_meal_plan_change_requests;
drop policy if exists "nutrition_meal_plan_change_requests_update_own" on public.nutrition_meal_plan_change_requests;
drop policy if exists "nutrition_meal_plan_change_requests_delete_own" on public.nutrition_meal_plan_change_requests;
create policy "nutrition_meal_plan_change_requests_select_own" on public.nutrition_meal_plan_change_requests
for select to authenticated using (user_id = (select auth.uid()));
create policy "nutrition_meal_plan_change_requests_insert_own" on public.nutrition_meal_plan_change_requests
for insert to authenticated with check (user_id = (select auth.uid()));
create policy "nutrition_meal_plan_change_requests_update_own" on public.nutrition_meal_plan_change_requests
for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "nutrition_meal_plan_change_requests_delete_own" on public.nutrition_meal_plan_change_requests
for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "nutrition_log_groups_select_own" on public.nutrition_log_groups;
create policy "nutrition_log_groups_select_own" on public.nutrition_log_groups
for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "nutrition_log_group_items_select_own" on public.nutrition_log_group_items;
create policy "nutrition_log_group_items_select_own" on public.nutrition_log_group_items
for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Week mutation authority. JSON payload is a bounded transport envelope:
-- weekOverride, deleteOccurrenceIds[], and upsertOccurrences[].
-- ---------------------------------------------------------------------------

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
  v_item jsonb;
  v_occurrence_id uuid;
  v_existing_owner uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_mutation is null or jsonb_typeof(p_mutation) <> 'object' then
    raise exception 'Mutation payload must be an object.' using errcode = '22023';
  end if;

  select * into v_week
  from public.nutrition_meal_plan_weeks
  where id = p_week_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Meal Plan week not found.' using errcode = 'P0002';
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
    where id = p_week_id and user_id = v_user_id;
  end if;

  if p_mutation ? 'deleteOccurrenceIds' then
    if jsonb_typeof(p_mutation->'deleteOccurrenceIds') <> 'array' then
      raise exception 'deleteOccurrenceIds must be an array.' using errcode = '22023';
    end if;
    delete from public.nutrition_planned_occurrences
    where week_id = p_week_id
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
        p_week_id,
        v_user_id,
        (v_item->>'planDate')::date,
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
        and nutrition_planned_occurrences.week_id = p_week_id
        and nutrition_planned_occurrences.status in ('planned', 'skipped');
    end loop;
  end if;

  update public.nutrition_meal_plan_weeks
  set revision = revision + 1
  where id = p_week_id and user_id = v_user_id
  returning * into v_week;

  return jsonb_build_object('weekId', v_week.id, 'revision', v_week.revision);
end;
$$;

revoke all on function public.mutate_nutrition_meal_plan_week(uuid, bigint, jsonb) from public, anon;
grant execute on function public.mutate_nutrition_meal_plan_week(uuid, bigint, jsonb) to authenticated, service_role;

create or replace function public.apply_nutrition_meal_plan_change_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.nutrition_meal_plan_change_requests%rowtype;
  v_week public.nutrition_meal_plan_weeks%rowtype;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into v_request
  from public.nutrition_meal_plan_change_requests
  where id = p_request_id and user_id = v_user_id
  for update;
  if not found then
    raise exception 'Meal Plan change request not found.' using errcode = 'P0002';
  end if;
  if v_request.state <> 'pending' then
    raise exception 'Meal Plan change request is not pending.' using errcode = '23514';
  end if;

  select * into v_week
  from public.nutrition_meal_plan_weeks
  where id = v_request.week_id and user_id = v_user_id
  for update;
  if not found then
    raise exception 'Meal Plan week not found.' using errcode = 'P0002';
  end if;

  if v_week.revision <> v_request.base_revision then
    update public.nutrition_meal_plan_change_requests
    set state = 'stale', resolved_at = clock_timestamp()
    where id = v_request.id;
    return jsonb_build_object('state', 'stale', 'revision', v_week.revision);
  end if;

  v_result := public.mutate_nutrition_meal_plan_week(
    v_request.week_id,
    v_request.base_revision,
    v_request.proposal_json
  );

  update public.nutrition_meal_plan_change_requests
  set state = 'applied',
      applied_revision = (v_result->>'revision')::bigint,
      resolved_at = clock_timestamp()
  where id = v_request.id;

  return jsonb_build_object(
    'state', 'applied',
    'revision', (v_result->>'revision')::bigint
  );
end;
$$;

revoke all on function public.apply_nutrition_meal_plan_change_request(uuid) from public, anon;
grant execute on function public.apply_nutrition_meal_plan_change_request(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Grouped actual logging. operation_id is unique per owner for retry safety.
-- No nutrient is coalesced to zero; nullable legacy food_logs now preserve unknown.
-- ---------------------------------------------------------------------------

create or replace function public.log_nutrition_group(
  p_operation_id uuid,
  p_log_date date,
  p_meal_type text,
  p_source_type text,
  p_source_id uuid,
  p_source_version_id uuid,
  p_frozen_snapshot jsonb,
  p_items jsonb,
  p_planned_occurrence_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_group public.nutrition_log_groups%rowtype;
  v_item jsonb;
  v_food_log_id uuid;
  v_position integer := 0;
  v_food_name text;
  v_serving_label text;
  v_quantity numeric;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_operation_id is null then
    raise exception 'operation_id is required.' using errcode = '22023';
  end if;

  select * into v_group
  from public.nutrition_log_groups
  where user_id = v_user_id and operation_id = p_operation_id;
  if found then
    return jsonb_build_object('group', to_jsonb(v_group), 'alreadyLogged', true);
  end if;

  if p_log_date is null or nullif(btrim(p_meal_type), '') is null then
    raise exception 'Log date and meal are required.' using errcode = '22023';
  end if;
  if p_source_type not in ('food', 'recipe', 'saved_meal', 'planned_occurrence', 'quick_add') then
    raise exception 'Unsupported Nutrition log source.' using errcode = '22023';
  end if;
  if p_source_type = 'recipe' and (p_source_id is null or p_source_version_id is null) then
    raise exception 'Recipe logging requires version-specific lineage.' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one resolved log item is required.' using errcode = '22023';
  end if;

  insert into public.nutrition_log_groups (
    user_id, log_date, meal_type, operation_id, source_type,
    source_id, source_version_id, planned_occurrence_id, frozen_snapshot
  ) values (
    v_user_id, p_log_date, btrim(p_meal_type), p_operation_id, p_source_type,
    p_source_id, p_source_version_id, p_planned_occurrence_id,
    coalesce(p_frozen_snapshot, '{}'::jsonb)
  ) returning * into v_group;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_food_name := coalesce(nullif(btrim(v_item->>'foodName'), ''), nullif(btrim(v_item->>'name'), ''));
    v_serving_label := coalesce(nullif(btrim(v_item->>'servingLabel'), ''), nullif(btrim(v_item->>'servingSize'), ''));
    v_quantity := coalesce(
      nullif(v_item->>'quantity', '')::numeric,
      nullif(v_item->>'resolvedQuantity', '')::numeric
    );

    if v_food_name is null or v_serving_label is null or v_quantity is null or v_quantity <= 0 then
      raise exception 'Resolved Nutrition log items require name, serving, and positive quantity.' using errcode = '22023';
    end if;

    insert into public.food_logs (
      user_id, food_item_id, user_food_item_id, log_date, meal_type,
      food_name, serving_size, quantity, calories, protein_g, carbs_g, fat_g, notes
    ) values (
      v_user_id,
      nullif(v_item->>'foodItemId', '')::uuid,
      nullif(v_item->>'userFoodItemId', '')::uuid,
      p_log_date,
      btrim(p_meal_type),
      v_food_name,
      v_serving_label,
      v_quantity,
      nullif(v_item #>> '{nutrition,caloriesKcal}', '')::numeric,
      nullif(v_item #>> '{nutrition,proteinG}', '')::numeric,
      nullif(v_item #>> '{nutrition,carbsG}', '')::numeric,
      nullif(v_item #>> '{nutrition,fatG}', '')::numeric,
      nullif(btrim(v_item->>'notes'), '')
    ) returning id into v_food_log_id;

    insert into public.nutrition_log_group_items (
      group_id, user_id, food_log_id, position, frozen_item_snapshot
    ) values (
      v_group.id, v_user_id, v_food_log_id, v_position, v_item
    );
    v_position := v_position + 1;
  end loop;

  return jsonb_build_object('group', to_jsonb(v_group), 'alreadyLogged', false);
exception
  when unique_violation then
    select * into v_group
    from public.nutrition_log_groups
    where user_id = v_user_id and operation_id = p_operation_id;
    if found then
      return jsonb_build_object('group', to_jsonb(v_group), 'alreadyLogged', true);
    end if;
    raise;
end;
$$;

revoke all on function public.log_nutrition_group(uuid, date, text, text, uuid, uuid, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.log_nutrition_group(uuid, date, text, text, uuid, uuid, jsonb, jsonb, uuid) to authenticated, service_role;

create or replace function public.complete_nutrition_planned_occurrence(
  p_occurrence_id uuid,
  p_operation_id uuid,
  p_execution_snapshot jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_occurrence public.nutrition_planned_occurrences%rowtype;
  v_snapshot jsonb;
  v_items jsonb;
  v_log_result jsonb;
  v_group_id uuid;
  v_completed_status text;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into v_occurrence
  from public.nutrition_planned_occurrences
  where id = p_occurrence_id and user_id = v_user_id
  for update;
  if not found then
    raise exception 'Planned occurrence not found.' using errcode = 'P0002';
  end if;
  if v_occurrence.status = 'skipped' then
    raise exception 'Skipped occurrence cannot be completed.' using errcode = '23514';
  end if;
  if v_occurrence.status in ('completed', 'completed_changed') then
    return jsonb_build_object('occurrence', to_jsonb(v_occurrence), 'alreadyCompleted', true);
  end if;

  v_snapshot := coalesce(p_execution_snapshot, v_occurrence.frozen_snapshot);
  v_items := case
    when jsonb_typeof(v_snapshot->'items') = 'array' then v_snapshot->'items'
    else jsonb_build_array(v_snapshot)
  end;

  v_log_result := public.log_nutrition_group(
    p_operation_id,
    v_occurrence.plan_date,
    v_occurrence.meal_slot_key,
    case when v_occurrence.source_type = 'recipe' then 'recipe'
         when v_occurrence.source_type = 'saved_meal' then 'saved_meal'
         when v_occurrence.source_type = 'food' then 'food'
         else 'planned_occurrence' end,
    v_occurrence.source_id,
    v_occurrence.source_version_id,
    v_snapshot,
    v_items,
    v_occurrence.id
  );

  v_group_id := ((v_log_result->'group')->>'id')::uuid;
  v_completed_status := case
    when p_execution_snapshot is null or p_execution_snapshot = v_occurrence.frozen_snapshot
      then 'completed'
    else 'completed_changed'
  end;

  update public.nutrition_planned_occurrences
  set status = v_completed_status,
      completed_at = clock_timestamp(),
      actual_log_group_id = v_group_id
  where id = v_occurrence.id and user_id = v_user_id
  returning * into v_occurrence;

  return jsonb_build_object('occurrence', to_jsonb(v_occurrence), 'alreadyCompleted', false);
end;
$$;

revoke all on function public.complete_nutrition_planned_occurrence(uuid, uuid, jsonb) from public, anon;
grant execute on function public.complete_nutrition_planned_occurrence(uuid, uuid, jsonb) to authenticated, service_role;

create or replace function public.undo_nutrition_planned_occurrence_completion(p_occurrence_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_occurrence public.nutrition_planned_occurrences%rowtype;
  v_group_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into v_occurrence
  from public.nutrition_planned_occurrences
  where id = p_occurrence_id and user_id = v_user_id
  for update;
  if not found then
    raise exception 'Planned occurrence not found.' using errcode = 'P0002';
  end if;
  if v_occurrence.status not in ('completed', 'completed_changed')
     or v_occurrence.actual_log_group_id is null then
    raise exception 'Only a completed occurrence can be undone.' using errcode = '23514';
  end if;

  v_group_id := v_occurrence.actual_log_group_id;

  -- Break the restrictive occurrence->group link before deleting the grouped actual.
  update public.nutrition_planned_occurrences
  set status = 'planned', completed_at = null, actual_log_group_id = null
  where id = v_occurrence.id and user_id = v_user_id;

  delete from public.food_logs
  where user_id = v_user_id
    and id in (
      select food_log_id
      from public.nutrition_log_group_items
      where group_id = v_group_id and user_id = v_user_id and food_log_id is not null
    );

  delete from public.nutrition_log_groups
  where id = v_group_id and user_id = v_user_id;

  select * into v_occurrence
  from public.nutrition_planned_occurrences
  where id = p_occurrence_id and user_id = v_user_id;

  return jsonb_build_object('occurrence', to_jsonb(v_occurrence), 'undone', true);
end;
$$;

revoke all on function public.undo_nutrition_planned_occurrence_completion(uuid) from public, anon;
grant execute on function public.undo_nutrition_planned_occurrence_completion(uuid) to authenticated, service_role;

commit;
