-- Persist explicit per-date nutrition-target assignments and apply profile plus assignment changes atomically.
-- Additive only. Do not apply to production without the normal isolated migration review.

create table public.user_nutrition_target_date_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_date date not null,
  target_type text not null check (
    target_type in ('default_day', 'training_day', 'rest_day', 'high_activity_day')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, target_date)
);

comment on table public.user_nutrition_target_date_overrides is
  'User-owned explicit nutrition-target assignments for individual dates. Missing rows mean automatic assignment.';
comment on column public.user_nutrition_target_date_overrides.target_type is
  'Reusable target profile assigned to this date. Automatic assignment is represented by no row.';

create index idx_user_nutrition_target_date_overrides_user_date
  on public.user_nutrition_target_date_overrides(user_id, target_date);

alter table public.user_nutrition_target_date_overrides enable row level security;

revoke all on table public.user_nutrition_target_date_overrides from anon;
grant select, insert, update, delete on table public.user_nutrition_target_date_overrides to authenticated;
grant all on table public.user_nutrition_target_date_overrides to service_role;

create policy user_nutrition_target_date_overrides_select_own
  on public.user_nutrition_target_date_overrides
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy user_nutrition_target_date_overrides_insert_own
  on public.user_nutrition_target_date_overrides
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy user_nutrition_target_date_overrides_update_own
  on public.user_nutrition_target_date_overrides
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy user_nutrition_target_date_overrides_delete_own
  on public.user_nutrition_target_date_overrides
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create trigger user_nutrition_target_date_overrides_updated_at
  before update on public.user_nutrition_target_date_overrides
  for each row execute function public.set_updated_at();

create or replace function public.apply_nutrition_target_changes(
  p_target_date date,
  p_assignment text,
  p_editor_target_type text,
  p_calories integer,
  p_protein_g numeric,
  p_carbs_g numeric,
  p_fat_g numeric,
  p_water_ml integer,
  p_notes text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.user_nutrition_target_profiles%rowtype;
  v_override public.user_nutrition_target_date_overrides%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_target_date is null then
    raise exception 'Target date is required.' using errcode = '22023';
  end if;

  if p_assignment not in ('auto', 'default_day', 'training_day', 'rest_day', 'high_activity_day') then
    raise exception 'Invalid nutrition target assignment.' using errcode = '22023';
  end if;

  if p_editor_target_type not in ('default_day', 'training_day', 'rest_day', 'high_activity_day') then
    raise exception 'Invalid nutrition target profile type.' using errcode = '22023';
  end if;

  if p_assignment <> 'auto' and p_assignment <> p_editor_target_type then
    raise exception 'Explicit assignment and edited profile must match.' using errcode = '22023';
  end if;

  if p_calories is not null and (p_calories < 0 or p_calories > 15000) then
    raise exception 'Calories are outside the supported range.' using errcode = '22023';
  end if;
  if p_protein_g is not null and (p_protein_g < 0 or p_protein_g > 1000) then
    raise exception 'Protein is outside the supported range.' using errcode = '22023';
  end if;
  if p_carbs_g is not null and (p_carbs_g < 0 or p_carbs_g > 2000) then
    raise exception 'Carbohydrates are outside the supported range.' using errcode = '22023';
  end if;
  if p_fat_g is not null and (p_fat_g < 0 or p_fat_g > 1000) then
    raise exception 'Fat is outside the supported range.' using errcode = '22023';
  end if;
  if p_water_ml is not null and (p_water_ml < 0 or p_water_ml > 20000) then
    raise exception 'Water is outside the supported range.' using errcode = '22023';
  end if;

  insert into public.user_nutrition_target_profiles (
    user_id,
    target_type,
    calories,
    protein_g,
    carbs_g,
    fat_g,
    water_ml,
    notes
  ) values (
    v_user_id,
    p_editor_target_type,
    p_calories,
    p_protein_g,
    p_carbs_g,
    p_fat_g,
    p_water_ml,
    nullif(btrim(coalesce(p_notes, '')), '')
  )
  on conflict (user_id, target_type) do update set
    calories = excluded.calories,
    protein_g = excluded.protein_g,
    carbs_g = excluded.carbs_g,
    fat_g = excluded.fat_g,
    water_ml = excluded.water_ml,
    notes = excluded.notes
  returning * into v_profile;

  if p_assignment = 'auto' then
    delete from public.user_nutrition_target_date_overrides
      where user_id = v_user_id and target_date = p_target_date;
    v_override := null;
  else
    insert into public.user_nutrition_target_date_overrides (
      user_id,
      target_date,
      target_type
    ) values (
      v_user_id,
      p_target_date,
      p_assignment
    )
    on conflict (user_id, target_date) do update set
      target_type = excluded.target_type
    returning * into v_override;
  end if;

  return jsonb_build_object(
    'assignment', coalesce(v_override.target_type, 'auto'),
    'profile', to_jsonb(v_profile),
    'override', case when v_override.id is null then null else to_jsonb(v_override) end
  );
end;
$$;

comment on function public.apply_nutrition_target_changes(date, text, text, integer, numeric, numeric, numeric, integer, text) is
  'Atomically upserts one user-owned reusable nutrition target profile and upserts or removes the explicit assignment for one date.';

revoke all on function public.apply_nutrition_target_changes(date, text, text, integer, numeric, numeric, numeric, integer, text) from public, anon;
grant execute on function public.apply_nutrition_target_changes(date, text, text, integer, numeric, numeric, numeric, integer, text) to authenticated, service_role;
