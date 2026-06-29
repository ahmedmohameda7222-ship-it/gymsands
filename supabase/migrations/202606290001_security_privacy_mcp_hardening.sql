-- Plaivra Germany/EU application-specific privacy and security hardening.
-- This migration intentionally preserves MCP/ChatGPT account control while
-- requiring explicit, saved user permissions. It is safe to re-run where noted.

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Role grants: private app data has no anonymous database access.
-- ---------------------------------------------------------------------------

revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
revoke usage on schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

grant usage on schema public to authenticated, service_role;
revoke truncate, trigger, references on all tables in schema public from authenticated;

-- ---------------------------------------------------------------------------
-- Food kitchen policies: authenticated system reads + owner custom CRUD.
-- ---------------------------------------------------------------------------

alter table public.food_kitchens enable row level security;
alter table public.food_subcategories enable row level security;
grant select, insert, update, delete on public.food_kitchens to authenticated;
grant select, insert, update, delete on public.food_subcategories to authenticated;

drop policy if exists "food_kitchens_read_system_or_own" on public.food_kitchens;
drop policy if exists "food_kitchens_own_insert" on public.food_kitchens;
drop policy if exists "food_kitchens_insert_own" on public.food_kitchens;
drop policy if exists "food_kitchens_own_update_delete" on public.food_kitchens;
drop policy if exists "food_kitchens_update_delete_own" on public.food_kitchens;
drop policy if exists "food_kitchens_update_own" on public.food_kitchens;
drop policy if exists "food_kitchens_delete_own" on public.food_kitchens;

create policy "food_kitchens_read_system_or_own"
on public.food_kitchens for select to authenticated
using (is_system = true or user_id = (select auth.uid()) or (select public.is_admin()));

create policy "food_kitchens_insert_own"
on public.food_kitchens for insert to authenticated
with check (
  (user_id = (select auth.uid()) and is_system = false)
  or (select public.is_admin())
);

create policy "food_kitchens_update_own"
on public.food_kitchens for update to authenticated
using (
  (user_id = (select auth.uid()) and is_system = false)
  or (select public.is_admin())
)
with check (
  (user_id = (select auth.uid()) and is_system = false)
  or (select public.is_admin())
);

create policy "food_kitchens_delete_own"
on public.food_kitchens for delete to authenticated
using (
  (user_id = (select auth.uid()) and is_system = false)
  or (select public.is_admin())
);

drop policy if exists "food_subcategories_read_system_or_own" on public.food_subcategories;
drop policy if exists "food_subcategories_own_all" on public.food_subcategories;
drop policy if exists "food_subcategories_insert_own" on public.food_subcategories;
drop policy if exists "food_subcategories_update_own" on public.food_subcategories;
drop policy if exists "food_subcategories_delete_own" on public.food_subcategories;

create policy "food_subcategories_read_system_or_own"
on public.food_subcategories for select to authenticated
using (
  exists (
    select 1
    from public.food_kitchens kitchen
    where kitchen.id = food_subcategories.kitchen_id
      and (
        kitchen.is_system = true
        or kitchen.user_id = (select auth.uid())
        or (select public.is_admin())
      )
  )
);

create policy "food_subcategories_insert_own"
on public.food_subcategories for insert to authenticated
with check (
  exists (
    select 1
    from public.food_kitchens kitchen
    where kitchen.id = food_subcategories.kitchen_id
      and (
        (kitchen.user_id = (select auth.uid()) and kitchen.is_system = false)
        or (select public.is_admin())
      )
  )
);

create policy "food_subcategories_update_own"
on public.food_subcategories for update to authenticated
using (
  exists (
    select 1 from public.food_kitchens kitchen
    where kitchen.id = food_subcategories.kitchen_id
      and ((kitchen.user_id = (select auth.uid()) and kitchen.is_system = false) or (select public.is_admin()))
  )
)
with check (
  exists (
    select 1 from public.food_kitchens kitchen
    where kitchen.id = food_subcategories.kitchen_id
      and ((kitchen.user_id = (select auth.uid()) and kitchen.is_system = false) or (select public.is_admin()))
  )
);

create policy "food_subcategories_delete_own"
on public.food_subcategories for delete to authenticated
using (
  exists (
    select 1 from public.food_kitchens kitchen
    where kitchen.id = food_subcategories.kitchen_id
      and ((kitchen.user_id = (select auth.uid()) and kitchen.is_system = false) or (select public.is_admin()))
  )
);

-- ---------------------------------------------------------------------------
-- Admin-only settings. Non-sensitive defaults used by members move separately.
-- ---------------------------------------------------------------------------

create table if not exists public.public_app_settings (
  key text primary key,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.public_app_settings (key, value)
select key, value
from public.admin_settings
where key = 'welcome_settings'
on conflict (key) do update set value = excluded.value;

alter table public.public_app_settings enable row level security;
grant select on public.public_app_settings to authenticated;
grant insert, update, delete on public.public_app_settings to authenticated;

drop policy if exists "public_app_settings_read_authenticated" on public.public_app_settings;
drop policy if exists "public_app_settings_admin_manage" on public.public_app_settings;
create policy "public_app_settings_read_authenticated"
on public.public_app_settings for select to authenticated using (true);
create policy "public_app_settings_admin_manage"
on public.public_app_settings for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop trigger if exists public_app_settings_updated_at on public.public_app_settings;
create trigger public_app_settings_updated_at
before update on public.public_app_settings
for each row execute function public.set_updated_at();

alter table public.admin_settings enable row level security;
drop policy if exists "admin_settings_read_auth" on public.admin_settings;
drop policy if exists "welcome_settings_read" on public.admin_settings;
drop policy if exists "welcome_settings_admin_insert" on public.admin_settings;
drop policy if exists "welcome_settings_admin_update" on public.admin_settings;
drop policy if exists "welcome_settings_admin_delete" on public.admin_settings;
drop policy if exists "admin_settings_admin_all" on public.admin_settings;
drop policy if exists "admin_settings_admin_select" on public.admin_settings;
drop policy if exists "admin_settings_admin_manage" on public.admin_settings;

create policy "admin_settings_admin_select"
on public.admin_settings for select to authenticated
using ((select public.is_admin()));
create policy "admin_settings_admin_manage"
on public.admin_settings for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Explicit AI permissions and safe legacy-scope migration.
-- ---------------------------------------------------------------------------

create table if not exists public.user_ai_permission_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  access_mode text not null check (access_mode in ('full', 'custom')),
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_ai_permission_settings_user_id_key
on public.user_ai_permission_settings(user_id);

create or replace function pg_temp.plaivra_safe_legacy_scopes(input_scopes text[])
returns text[]
language plpgsql
immutable
as $$
declare
  raw_scope text;
  result_scopes text[] := '{}';
begin
  foreach raw_scope in array coalesce(input_scopes, '{}') loop
    case raw_scope
      when 'fitlife.training.write' then
        result_scopes := result_scopes || array['plaivra.workouts.write', 'plaivra.workouts.read'];
      when 'fitlife.nutrition.write' then
        result_scopes := result_scopes || array[
          'plaivra.nutrition.write', 'plaivra.nutrition.read',
          'plaivra.meal_plans.write', 'plaivra.meal_plans.read',
          'plaivra.hydration.write', 'plaivra.hydration.read'
        ];
      when 'fitlife.progress.write' then
        result_scopes := result_scopes || array['plaivra.progress.write', 'plaivra.progress.read'];
      when 'fitlife.wellness.write' then
        result_scopes := result_scopes || array['plaivra.wellness.write', 'plaivra.wellness.read'];
      when 'fitlife.profile.write' then
        result_scopes := result_scopes || array['plaivra.profile.write', 'plaivra.profile.read'];
      when 'fitlife.profile.read' then
        result_scopes := result_scopes || 'plaivra.profile.read';
      when 'fitlife.summary.read' then
        result_scopes := result_scopes || array['plaivra.profile.read', 'plaivra.settings.read'];
      else
        if raw_scope = any(array[
          'plaivra.workouts.read', 'plaivra.workouts.write',
          'plaivra.nutrition.read', 'plaivra.nutrition.write',
          'plaivra.meal_plans.read', 'plaivra.meal_plans.write',
          'plaivra.hydration.read', 'plaivra.hydration.write',
          'plaivra.progress.read', 'plaivra.progress.write',
          'plaivra.wellness.read', 'plaivra.wellness.write',
          'plaivra.profile.read', 'plaivra.profile.write',
          'plaivra.settings.read', 'plaivra.settings.write'
        ]) then
          result_scopes := result_scopes || raw_scope;
        end if;
    end case;
  end loop;

  return coalesce(
    (select array_agg(distinct scope order by scope) from unnest(result_scopes) as scope),
    '{}'
  );
end;
$$;

-- Keep canonical full access only when an existing row already records the
-- explicit combination access_mode='full' + plaivra.full_access and contains
-- no legacy/admin/all marker. Every other row becomes safe custom access.
update public.user_ai_permission_settings
set
  access_mode = case
    when access_mode = 'full'
      and 'plaivra.full_access' = any(scopes)
      and not (scopes && array['plaivra.admin', 'plaivra.all', 'fitlife.admin', 'fitlife.all', 'fitlife.full_access'])
    then 'full'
    else 'custom'
  end,
  scopes = case
    when access_mode = 'full'
      and 'plaivra.full_access' = any(scopes)
      and not (scopes && array['plaivra.admin', 'plaivra.all', 'fitlife.admin', 'fitlife.all', 'fitlife.full_access'])
    then array[
      'plaivra.full_access',
      'plaivra.workouts.read', 'plaivra.workouts.write',
      'plaivra.nutrition.read', 'plaivra.nutrition.write',
      'plaivra.meal_plans.read', 'plaivra.meal_plans.write',
      'plaivra.hydration.read', 'plaivra.hydration.write',
      'plaivra.progress.read', 'plaivra.progress.write',
      'plaivra.wellness.read', 'plaivra.wellness.write',
      'plaivra.profile.read', 'plaivra.profile.write',
      'plaivra.settings.read', 'plaivra.settings.write'
    ]
    else pg_temp.plaivra_safe_legacy_scopes(scopes)
  end;

with connection_scope_groups as (
  select
    connection.user_id,
    coalesce(array_agg(scope.value) filter (where scope.value is not null), '{}') as scopes
  from public.chatgpt_connections connection
  left join lateral unnest(coalesce(connection.scopes, '{}')) as scope(value) on true
  where connection.is_active = true and connection.revoked_at is null
  group by connection.user_id
)
insert into public.user_ai_permission_settings (user_id, access_mode, scopes)
select user_id, 'custom', pg_temp.plaivra_safe_legacy_scopes(scopes)
from connection_scope_groups
on conflict (user_id) do nothing;

-- Snapshot each active connection to the normalized source-of-truth scopes.
update public.chatgpt_connections connection
set scopes = settings.scopes
from public.user_ai_permission_settings settings
where connection.user_id = settings.user_id
  and connection.is_active = true
  and connection.revoked_at is null;

alter table public.user_ai_permission_settings
  drop constraint if exists user_ai_permission_settings_access_mode_check;
alter table public.user_ai_permission_settings
  drop constraint if exists user_ai_permission_settings_scopes_check;
alter table public.user_ai_permission_settings
  add constraint user_ai_permission_settings_access_mode_check
  check (access_mode in ('full', 'custom'));
alter table public.user_ai_permission_settings
  add constraint user_ai_permission_settings_scopes_check
  check (
    scopes <@ array[
      'plaivra.full_access',
      'plaivra.workouts.read', 'plaivra.workouts.write',
      'plaivra.nutrition.read', 'plaivra.nutrition.write',
      'plaivra.meal_plans.read', 'plaivra.meal_plans.write',
      'plaivra.hydration.read', 'plaivra.hydration.write',
      'plaivra.progress.read', 'plaivra.progress.write',
      'plaivra.wellness.read', 'plaivra.wellness.write',
      'plaivra.profile.read', 'plaivra.profile.write',
      'plaivra.settings.read', 'plaivra.settings.write'
    ]
    and (
      (access_mode = 'full' and 'plaivra.full_access' = any(scopes))
      or (access_mode = 'custom' and not ('plaivra.full_access' = any(scopes)))
    )
  );

alter table public.user_ai_permission_settings enable row level security;
grant select, insert, update on public.user_ai_permission_settings to authenticated;
revoke delete on public.user_ai_permission_settings from authenticated;

drop policy if exists "Users can read own AI permission settings" on public.user_ai_permission_settings;
drop policy if exists "Users can insert own AI permission settings" on public.user_ai_permission_settings;
drop policy if exists "Users can update own AI permission settings" on public.user_ai_permission_settings;
drop policy if exists "user_ai_permission_settings_select_own" on public.user_ai_permission_settings;
drop policy if exists "user_ai_permission_settings_admin_select" on public.user_ai_permission_settings;
drop policy if exists "user_ai_permission_settings_insert_own" on public.user_ai_permission_settings;
drop policy if exists "user_ai_permission_settings_update_own" on public.user_ai_permission_settings;

create policy "user_ai_permission_settings_select_own"
on public.user_ai_permission_settings for select to authenticated
using (user_id = (select auth.uid()));
create policy "user_ai_permission_settings_admin_select"
on public.user_ai_permission_settings for select to authenticated
using ((select public.is_admin()));
create policy "user_ai_permission_settings_insert_own"
on public.user_ai_permission_settings for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "user_ai_permission_settings_update_own"
on public.user_ai_permission_settings for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop trigger if exists user_ai_permission_settings_updated_at on public.user_ai_permission_settings;
create trigger user_ai_permission_settings_updated_at
before update on public.user_ai_permission_settings
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- MCP request-rate persistence. Only trusted backend/service-role access.
-- ---------------------------------------------------------------------------

create table if not exists public.mcp_rate_limits (
  connection_id uuid primary key references public.chatgpt_connections(id) on delete cascade,
  request_count int not null default 0,
  window_start timestamptz not null default now(),
  reset_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mcp_rate_limits_reset on public.mcp_rate_limits(reset_at);
alter table public.mcp_rate_limits enable row level security;
revoke all privileges on public.mcp_rate_limits from anon, authenticated;
grant all privileges on public.mcp_rate_limits to service_role;

-- ---------------------------------------------------------------------------
-- App settings table matching services/database/user-settings.ts exactly.
-- ---------------------------------------------------------------------------

create table if not exists public.user_app_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  theme_id text not null default 'olive',
  theme text not null default 'system' check (theme in ('light','dark','system')),
  accent_color text not null default 'olive' check (accent_color in ('olive','champagne','sage')),
  language text not null default 'en' check (language in ('en','de','ar','system')),
  weight_unit text not null default 'kg' check (weight_unit in ('kg','lb')),
  height_unit text not null default 'cm' check (height_unit in ('cm','ft-in')),
  distance_unit text not null default 'km' check (distance_unit in ('km','miles')),
  liquid_unit text not null default 'ml' check (liquid_unit in ('ml','oz')),
  energy_unit text not null default 'kcal' check (energy_unit in ('kcal','kJ')),
  body_measurement_unit text not null default 'cm' check (body_measurement_unit in ('cm','inches')),
  week_starts_on text not null default 'monday' check (week_starts_on in ('monday','sunday')),
  default_start_page text not null default 'today' check (default_start_page in ('today','dashboard','train','eat','progress')),
  compact_mode boolean not null default false,
  reduce_animations boolean not null default false,
  large_text_mode boolean not null default false,
  days_per_week text,
  workout_duration text,
  preferred_split text,
  daily_calories text,
  protein_target text,
  carbs_target text,
  fat_target text,
  daily_water_goal text,
  track_body_weight boolean not null default false,
  track_body_measurements boolean not null default false,
  track_progress_photos boolean not null default false,
  sleep_target text,
  track_sleep_quality boolean not null default false,
  step_target text,
  track_steps boolean not null default false,
  track_habits boolean not null default false,
  workout_reminders boolean not null default false,
  workout_time text,
  meal_reminders boolean not null default false,
  remind_before_meals boolean not null default false,
  hydration_reminders boolean not null default false,
  hydration_interval text,
  bedtime_reminder boolean not null default false,
  bedtime text,
  supplement_reminders boolean not null default false,
  weigh_in_reminder boolean not null default false,
  weigh_in_day text,
  photo_reminder boolean not null default false,
  photo_frequency text,
  habit_reminders boolean not null default false,
  quiet_hours boolean not null default false,
  quiet_start text,
  quiet_end text,
  hide_body_weight_on_dashboard boolean not null default false,
  hide_calories_on_dashboard boolean not null default false,
  hide_progress_photos boolean not null default false,
  hide_profile_details boolean not null default false,
  private_profile_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_app_settings add column if not exists theme_id text not null default 'olive';
alter table public.user_app_settings alter column theme_id set default 'olive';
create unique index if not exists user_app_settings_user_id_key on public.user_app_settings(user_id);
alter table public.user_app_settings enable row level security;
grant select, insert, update, delete on public.user_app_settings to authenticated;

drop policy if exists "user_app_settings_select_own" on public.user_app_settings;
drop policy if exists "user_app_settings_insert_own" on public.user_app_settings;
drop policy if exists "user_app_settings_update_own" on public.user_app_settings;
drop policy if exists "user_app_settings_delete_own" on public.user_app_settings;
drop policy if exists "user_app_settings_admin_select" on public.user_app_settings;

create policy "user_app_settings_select_own"
on public.user_app_settings for select to authenticated
using (user_id = (select auth.uid()));
create policy "user_app_settings_admin_select"
on public.user_app_settings for select to authenticated
using ((select public.is_admin()));
create policy "user_app_settings_insert_own"
on public.user_app_settings for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "user_app_settings_update_own"
on public.user_app_settings for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
create policy "user_app_settings_delete_own"
on public.user_app_settings for delete to authenticated
using (user_id = (select auth.uid()));

drop trigger if exists user_app_settings_updated_at on public.user_app_settings;
create trigger user_app_settings_updated_at
before update on public.user_app_settings
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Consent, data-subject requests, and administrator access/action logs.
-- ---------------------------------------------------------------------------

create table if not exists public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  consent_type text not null check (consent_type in ('terms','privacy','ai_processing','fitness_data','health_disclaimer','marketing','cookies','age_18')),
  version text not null,
  granted boolean not null default false,
  granted_at timestamptz,
  revoked_at timestamptz,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, consent_type, version)
);

create table if not exists public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_type text not null check (request_type in ('access','export','deletion','portability','correction','restriction')),
  status text not null default 'pending' check (status in ('pending','in_progress','completed','rejected')),
  message text,
  admin_notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_data_access_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid references public.profiles(id) on delete set null,
  target_table text not null,
  target_record_id text,
  action text not null,
  access_reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_table text,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_consents_user_created on public.user_consents(user_id, created_at desc);
create index if not exists idx_privacy_requests_user_created on public.privacy_requests(user_id, created_at desc);
create index if not exists idx_privacy_requests_status_created on public.privacy_requests(status, created_at);
create index if not exists idx_admin_data_access_logs_created on public.admin_data_access_logs(created_at desc);
create index if not exists idx_admin_audit_logs_created on public.admin_audit_logs(created_at desc);

alter table public.user_consents enable row level security;
alter table public.privacy_requests enable row level security;
alter table public.admin_data_access_logs enable row level security;
alter table public.admin_audit_logs enable row level security;

grant select, insert, update on public.user_consents to authenticated;
revoke delete on public.user_consents from authenticated;
grant select, insert, update on public.privacy_requests to authenticated;
grant select on public.admin_data_access_logs to authenticated;
grant select on public.admin_audit_logs to authenticated;
revoke insert, update, delete on public.admin_data_access_logs from authenticated;
revoke insert, update, delete on public.admin_audit_logs from authenticated;
grant all privileges on public.admin_data_access_logs to service_role;
grant all privileges on public.admin_audit_logs to service_role;

drop policy if exists "user_consents_select_own" on public.user_consents;
drop policy if exists "user_consents_insert_own" on public.user_consents;
drop policy if exists "user_consents_update_own" on public.user_consents;
drop policy if exists "user_consents_admin_select" on public.user_consents;
create policy "user_consents_select_own" on public.user_consents for select to authenticated
using (user_id = (select auth.uid()));
create policy "user_consents_admin_select" on public.user_consents for select to authenticated
using ((select public.is_admin()));
create policy "user_consents_insert_own" on public.user_consents for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "user_consents_update_own" on public.user_consents for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "privacy_requests_select_own" on public.privacy_requests;
drop policy if exists "privacy_requests_insert_own" on public.privacy_requests;
drop policy if exists "privacy_requests_admin_select" on public.privacy_requests;
drop policy if exists "privacy_requests_admin_update" on public.privacy_requests;
create policy "privacy_requests_select_own" on public.privacy_requests for select to authenticated
using (user_id = (select auth.uid()));
create policy "privacy_requests_insert_own" on public.privacy_requests for insert to authenticated
with check (user_id = (select auth.uid()) and status = 'pending' and admin_notes is null and completed_at is null);
create policy "privacy_requests_admin_select" on public.privacy_requests for select to authenticated
using ((select public.is_admin()));
create policy "privacy_requests_admin_update" on public.privacy_requests for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "admin_data_access_logs_admin_select" on public.admin_data_access_logs;
create policy "admin_data_access_logs_admin_select" on public.admin_data_access_logs for select to authenticated
using ((select public.is_admin()));
drop policy if exists "admin_audit_logs_admin_select" on public.admin_audit_logs;
create policy "admin_audit_logs_admin_select" on public.admin_audit_logs for select to authenticated
using ((select public.is_admin()));

drop trigger if exists user_consents_updated_at on public.user_consents;
create trigger user_consents_updated_at before update on public.user_consents
for each row execute function public.set_updated_at();

create or replace function public.protect_user_consent_history()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() = old.user_id and not public.is_admin() then
    if new.user_id is distinct from old.user_id
      or new.consent_type is distinct from old.consent_type
      or new.version is distinct from old.version
      or new.ip_address is distinct from old.ip_address
      or new.user_agent is distinct from old.user_agent
      or new.created_at is distinct from old.created_at
    then
      raise exception 'Consent history identity and capture metadata are immutable.' using errcode = '42501';
    end if;

    if new.granted then
      new.granted_at := coalesce(old.granted_at, now());
      new.revoked_at := null;
    else
      new.granted_at := old.granted_at;
      new.revoked_at := coalesce(new.revoked_at, now());
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_user_consent_history on public.user_consents;
create trigger protect_user_consent_history
before update on public.user_consents
for each row execute function public.protect_user_consent_history();

drop trigger if exists privacy_requests_updated_at on public.privacy_requests;
create trigger privacy_requests_updated_at before update on public.privacy_requests
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Progress photos, related measurements, and storage ownership.
-- ---------------------------------------------------------------------------

alter table public.progress_photos add column if not exists photo_type text not null default 'front';
alter table public.progress_photos add column if not exists taken_on date not null default current_date;
alter table public.progress_photos add column if not exists updated_at timestamptz not null default now();
alter table public.progress_photos drop constraint if exists progress_photos_photo_type_check;
alter table public.progress_photos add constraint progress_photos_photo_type_check
check (photo_type in ('front','side','back'));

alter table public.body_measurements add column if not exists body_fat_percent numeric;
alter table public.body_measurements add column if not exists updated_at timestamptz not null default now();
alter table public.sleep_recovery_logs add column if not exists bedtime time;
alter table public.sleep_recovery_logs add column if not exists wake_time time;
alter table public.sleep_recovery_logs add column if not exists stress_level text;
alter table public.exercise_calorie_reference add column if not exists calories_per_minute numeric;
alter table public.water_logs add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if to_regclass('public.user_onboarding') is not null then
    execute 'alter table public.user_onboarding add column if not exists onboarding_duration int';
    execute 'alter table public.user_onboarding add column if not exists barcode_scan_enabled boolean default false';
  end if;
  if to_regclass('public.onboarding_answers') is not null then
    execute 'alter table public.onboarding_answers add column if not exists onboarding_duration int';
    execute 'alter table public.onboarding_answers add column if not exists barcode_scan_enabled boolean default false';
  end if;
end;
$$;

drop trigger if exists progress_photos_updated_at on public.progress_photos;
create trigger progress_photos_updated_at before update on public.progress_photos
for each row execute function public.set_updated_at();
drop trigger if exists body_measurements_updated_at on public.body_measurements;
create trigger body_measurements_updated_at before update on public.body_measurements
for each row execute function public.set_updated_at();
drop trigger if exists water_logs_updated_at on public.water_logs;
create trigger water_logs_updated_at before update on public.water_logs
for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "progress_photos_storage_select_own" on storage.objects;
drop policy if exists "progress_photos_storage_insert_own" on storage.objects;
drop policy if exists "progress_photos_storage_update_own" on storage.objects;
drop policy if exists "progress_photos_storage_delete_own" on storage.objects;
drop policy if exists "progress_photos_storage_owner_select" on storage.objects;
drop policy if exists "progress_photos_storage_owner_insert" on storage.objects;
drop policy if exists "progress_photos_storage_owner_update" on storage.objects;
drop policy if exists "progress_photos_storage_owner_delete" on storage.objects;

create policy "progress_photos_storage_owner_select"
on storage.objects for select to authenticated
using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "progress_photos_storage_owner_insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "progress_photos_storage_owner_update"
on storage.objects for update to authenticated
using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "progress_photos_storage_owner_delete"
on storage.objects for delete to authenticated
using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Prevent self-service role escalation without blocking admin management of
-- other profiles.
-- ---------------------------------------------------------------------------

create or replace function public.prevent_profile_role_self_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() = old.id and new.role is distinct from old.role then
    raise exception 'Users cannot change their own profile role.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_profile_role_self_change on public.profiles;
create trigger prevent_profile_role_self_change
before update of role on public.profiles
for each row execute function public.prevent_profile_role_self_change();

-- Trigger helpers are not public RPC endpoints. Keep the deliberately small
-- is_admin() authorization helper callable only by trusted application roles.
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.protect_user_consent_history() from public, anon, authenticated;
revoke all on function public.prevent_profile_role_self_change() from public, anon, authenticated;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- Re-apply defensive authenticated privilege removal after all new tables.
revoke truncate, trigger, references on all tables in schema public from authenticated;

notify pgrst, 'reload schema';
