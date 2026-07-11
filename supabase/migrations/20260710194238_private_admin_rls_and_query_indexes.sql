-- Move the authorization helper outside the exposed API schema, normalize RLS
-- auth calls to initplans, and add only indexes justified by launch query/FK paths.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated, service_role;

-- Recreate affected public-table policies with the private helper and cached
-- auth calls. Policy names, commands, roles, and predicates are preserved.
do $policy_rewrite$
declare
  policy record;
  role_list text;
  rewritten_using text;
  rewritten_check text;
  statement text;
begin
  for policy in
    select *
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') ~ '(auth\.(uid|role|jwt)\(\)|is_admin\(\))'
        or coalesce(with_check, '') ~ '(auth\.(uid|role|jwt)\(\)|is_admin\(\))'
      )
  loop
    select string_agg(quote_ident(role_name), ', ')
      into role_list
    from unnest(policy.roles) role_name;

    rewritten_using := policy.qual;
    rewritten_check := policy.with_check;

    if rewritten_using is not null then
      rewritten_using := replace(rewritten_using, 'public.is_admin()', 'private.is_admin()');
      rewritten_using := regexp_replace(rewritten_using, '(^|[^a-zA-Z0-9_.])is_admin\(\)', '\1private.is_admin()', 'g');
      rewritten_using := replace(rewritten_using, 'auth.uid()', '(select auth.uid())');
      rewritten_using := replace(rewritten_using, 'auth.role()', '(select auth.role())');
      rewritten_using := replace(rewritten_using, 'auth.jwt()', '(select auth.jwt())');
    end if;

    if rewritten_check is not null then
      rewritten_check := replace(rewritten_check, 'public.is_admin()', 'private.is_admin()');
      rewritten_check := regexp_replace(rewritten_check, '(^|[^a-zA-Z0-9_.])is_admin\(\)', '\1private.is_admin()', 'g');
      rewritten_check := replace(rewritten_check, 'auth.uid()', '(select auth.uid())');
      rewritten_check := replace(rewritten_check, 'auth.role()', '(select auth.role())');
      rewritten_check := replace(rewritten_check, 'auth.jwt()', '(select auth.jwt())');
    end if;

    execute format('drop policy %I on %I.%I', policy.policyname, policy.schemaname, policy.tablename);
    statement := format(
      'create policy %I on %I.%I as %s for %s to %s',
      policy.policyname,
      policy.schemaname,
      policy.tablename,
      policy.permissive,
      policy.cmd,
      role_list
    );
    if rewritten_using is not null then
      statement := statement || format(' using (%s)', rewritten_using);
    end if;
    if rewritten_check is not null then
      statement := statement || format(' with check (%s)', rewritten_check);
    end if;
    execute statement;
  end loop;
end
$policy_rewrite$;

create or replace function public.protect_user_consent_history()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if (select auth.uid()) = old.user_id and not (select private.is_admin()) then
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

revoke all on function public.is_admin() from public, anon, authenticated, service_role;
drop function public.is_admin();

-- Consolidate exact redundant owner policies while preserving admin access.
drop policy if exists body_measurements_owner_delete on public.body_measurements;
drop policy if exists body_measurements_owner_insert on public.body_measurements;
drop policy if exists body_measurements_owner_select on public.body_measurements;
drop policy if exists body_measurements_owner_update on public.body_measurements;

drop policy if exists progress_photos_owner_delete on public.progress_photos;
drop policy if exists progress_photos_owner_insert on public.progress_photos;
drop policy if exists progress_photos_owner_select on public.progress_photos;

drop policy if exists admin_settings_admin_select on public.admin_settings;

-- Merge own/admin SELECT policies where their OR semantics are explicit.
drop policy if exists privacy_requests_admin_select on public.privacy_requests;
drop policy if exists privacy_requests_select_own on public.privacy_requests;
create policy privacy_requests_select_own_or_admin on public.privacy_requests
for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists user_ai_permission_settings_admin_select on public.user_ai_permission_settings;
drop policy if exists user_ai_permission_settings_select_own on public.user_ai_permission_settings;
create policy user_ai_permission_settings_select_own_or_admin on public.user_ai_permission_settings
for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists user_app_settings_admin_select on public.user_app_settings;
drop policy if exists user_app_settings_select_own on public.user_app_settings;
create policy user_app_settings_select_own_or_admin on public.user_app_settings
for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists user_consents_admin_select on public.user_consents;
drop policy if exists user_consents_select_own on public.user_consents;
create policy user_consents_select_own_or_admin on public.user_consents
for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_admin()));

-- Service-only tables intentionally have RLS with no member policy.
revoke all on table public.mcp_oauth_access_tokens from public, anon, authenticated;
revoke all on table public.mcp_oauth_authorization_codes from public, anon, authenticated;
revoke all on table public.mcp_rate_limits from public, anon, authenticated;
revoke all on table public.oauth_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.mcp_oauth_access_tokens to service_role;
grant select, insert, update, delete on table public.mcp_oauth_authorization_codes to service_role;
grant select, insert, update, delete on table public.mcp_rate_limits to service_role;
grant select, insert, update, delete on table public.oauth_rate_limits to service_role;

-- Cover measured launch joins, cascades, revocation, and cleanup paths.
create index if not exists idx_mcp_oauth_tokens_connection
  on public.mcp_oauth_access_tokens(connection_id);
create index if not exists idx_mcp_oauth_tokens_user
  on public.mcp_oauth_access_tokens(user_id);
create index if not exists idx_mcp_oauth_codes_connection
  on public.mcp_oauth_authorization_codes(connection_id);
create index if not exists idx_mcp_oauth_codes_user
  on public.mcp_oauth_authorization_codes(user_id);
create index if not exists idx_food_logs_food_item
  on public.food_logs(food_item_id) where food_item_id is not null;
create index if not exists idx_food_logs_user_food_item
  on public.food_logs(user_food_item_id) where user_food_item_id is not null;
create index if not exists idx_user_meal_plan_food_item
  on public.user_meal_plan_items(food_item_id) where food_item_id is not null;
create index if not exists idx_user_meal_plan_user_food_item
  on public.user_meal_plan_items(user_food_item_id) where user_food_item_id is not null;
create index if not exists idx_user_meal_plan_food_log
  on public.user_meal_plan_items(food_log_id) where food_log_id is not null;
create index if not exists idx_progress_photos_progress_entry
  on public.progress_photos(progress_entry_id) where progress_entry_id is not null;
create index if not exists idx_user_exercise_logs_plan_exercise
  on public.user_exercise_logs(plan_exercise_id) where plan_exercise_id is not null;
create index if not exists idx_workout_sessions_plan
  on public.workout_sessions(plan_id) where plan_id is not null;
create index if not exists idx_workout_sessions_workout
  on public.workout_sessions(workout_id) where workout_id is not null;
create index if not exists idx_user_workout_sessions_plan_day
  on public.user_workout_sessions(plan_day_id) where plan_day_id is not null;
create index if not exists idx_saved_recipe_ingredients_user
  on public.saved_recipe_ingredients(user_id);

comment on schema private is
  'Non-API helper schema. Do not add it to Supabase exposed schemas.';
