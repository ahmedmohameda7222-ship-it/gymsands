-- Nutrition V1 Cooking Session persistence.
-- Additive, owner-scoped, and intentionally independent from purgeable Recipe source FKs.

create table if not exists public.nutrition_cooking_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  recipe_id uuid not null,
  recipe_version_id uuid not null,
  frozen_recipe_snapshot jsonb not null,
  serving_scale numeric(12,4) not null default 1 check (serving_scale > 0),
  current_action_key text,
  status text not null default 'active' check (status in ('active', 'completed', 'ended')),
  started_at timestamptz not null default clock_timestamp(),
  last_active_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  ended_at timestamptz,
  state_revision bigint not null default 0 check (state_revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (
    (status = 'active' and completed_at is null and ended_at is null)
    or (status = 'completed' and completed_at is not null and ended_at is null)
    or (status = 'ended' and ended_at is not null)
  )
);

create index if not exists nutrition_cooking_sessions_owner_active_idx
  on public.nutrition_cooking_sessions(user_id, last_active_at desc, id)
  where status = 'active';

create index if not exists nutrition_cooking_sessions_owner_recipe_idx
  on public.nutrition_cooking_sessions(user_id, recipe_id, recipe_version_id, started_at desc);

create table if not exists public.nutrition_cooking_action_states (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  action_key text not null check (length(btrim(action_key)) > 0),
  state text not null default 'not_available' check (state in ('not_available', 'ready', 'active', 'waiting_for_condition', 'running_background', 'completed', 'deferred', 'skipped')),
  state_revision bigint not null default 0 check (state_revision >= 0),
  activated_at timestamptz,
  completed_at timestamptz,
  deferred_at timestamptz,
  skipped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (session_id, action_key),
  foreign key (session_id, user_id) references public.nutrition_cooking_sessions(id, user_id) on delete cascade
);

create index if not exists nutrition_cooking_action_states_session_state_idx
  on public.nutrition_cooking_action_states(session_id, state, action_key);

create table if not exists public.nutrition_cooking_timers (
  id uuid primary key default gen_random_uuid(),
  action_state_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  timer_name text not null check (length(btrim(timer_name)) > 0),
  duration_seconds integer not null check (duration_seconds > 0),
  status text not null default 'idle' check (status in ('idle', 'running', 'paused', 'completed', 'cancelled')),
  started_at timestamptz,
  target_at timestamptz,
  paused_at timestamptz,
  paused_remaining_seconds integer check (paused_remaining_seconds is null or paused_remaining_seconds >= 0),
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (action_state_id, timer_name),
  foreign key (action_state_id, user_id) references public.nutrition_cooking_action_states(id, user_id) on delete cascade,
  check (
    (status = 'idle' and started_at is null and target_at is null and paused_at is null)
    or (status = 'running' and started_at is not null and target_at is not null and paused_at is null)
    or (status = 'paused' and started_at is not null and paused_at is not null and paused_remaining_seconds is not null)
    or (status = 'completed' and completed_at is not null)
    or (status = 'cancelled' and cancelled_at is not null)
  )
);

create index if not exists nutrition_cooking_timers_owner_target_idx
  on public.nutrition_cooking_timers(user_id, target_at, id)
  where status = 'running';

create index if not exists nutrition_cooking_timers_action_idx
  on public.nutrition_cooking_timers(action_state_id, created_at, id);

-- A Cooking Session is bound to exactly the frozen Recipe facts present when it starts.
-- Source rows may later change or be permanently deleted without rewriting that session.
create or replace function private.prevent_nutrition_cooking_snapshot_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.recipe_id is distinct from old.recipe_id
     or new.recipe_version_id is distinct from old.recipe_version_id
     or new.frozen_recipe_snapshot is distinct from old.frozen_recipe_snapshot
     or new.serving_scale is distinct from old.serving_scale
  then
    raise exception 'Cooking Session frozen Recipe facts are immutable.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_nutrition_cooking_snapshot_mutation() from public, anon, authenticated;

drop trigger if exists prevent_nutrition_cooking_snapshot_mutation on public.nutrition_cooking_sessions;
create trigger prevent_nutrition_cooking_snapshot_mutation
before update on public.nutrition_cooking_sessions
for each row execute function private.prevent_nutrition_cooking_snapshot_mutation();

drop trigger if exists nutrition_cooking_sessions_updated_at on public.nutrition_cooking_sessions;
create trigger nutrition_cooking_sessions_updated_at
before update on public.nutrition_cooking_sessions
for each row execute function public.set_updated_at();

drop trigger if exists nutrition_cooking_action_states_updated_at on public.nutrition_cooking_action_states;
create trigger nutrition_cooking_action_states_updated_at
before update on public.nutrition_cooking_action_states
for each row execute function public.set_updated_at();

drop trigger if exists nutrition_cooking_timers_updated_at on public.nutrition_cooking_timers;
create trigger nutrition_cooking_timers_updated_at
before update on public.nutrition_cooking_timers
for each row execute function public.set_updated_at();

alter table public.nutrition_cooking_sessions enable row level security;
alter table public.nutrition_cooking_action_states enable row level security;
alter table public.nutrition_cooking_timers enable row level security;

revoke all on public.nutrition_cooking_sessions from anon, authenticated;
revoke all on public.nutrition_cooking_action_states from anon, authenticated;
revoke all on public.nutrition_cooking_timers from anon, authenticated;

grant select, insert, update, delete on public.nutrition_cooking_sessions to authenticated;
grant select, insert, update, delete on public.nutrition_cooking_action_states to authenticated;
grant select, insert, update, delete on public.nutrition_cooking_timers to authenticated;

grant all privileges on public.nutrition_cooking_sessions to service_role;
grant all privileges on public.nutrition_cooking_action_states to service_role;
grant all privileges on public.nutrition_cooking_timers to service_role;

drop policy if exists "nutrition_cooking_sessions_select_own" on public.nutrition_cooking_sessions;
drop policy if exists "nutrition_cooking_sessions_insert_own" on public.nutrition_cooking_sessions;
drop policy if exists "nutrition_cooking_sessions_update_own" on public.nutrition_cooking_sessions;
drop policy if exists "nutrition_cooking_sessions_delete_own" on public.nutrition_cooking_sessions;
create policy "nutrition_cooking_sessions_select_own"
on public.nutrition_cooking_sessions for select to authenticated
using (user_id = (select auth.uid()));
create policy "nutrition_cooking_sessions_insert_own"
on public.nutrition_cooking_sessions for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "nutrition_cooking_sessions_update_own"
on public.nutrition_cooking_sessions for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
create policy "nutrition_cooking_sessions_delete_own"
on public.nutrition_cooking_sessions for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "nutrition_cooking_action_states_select_own" on public.nutrition_cooking_action_states;
drop policy if exists "nutrition_cooking_action_states_insert_own" on public.nutrition_cooking_action_states;
drop policy if exists "nutrition_cooking_action_states_update_own" on public.nutrition_cooking_action_states;
drop policy if exists "nutrition_cooking_action_states_delete_own" on public.nutrition_cooking_action_states;
create policy "nutrition_cooking_action_states_select_own"
on public.nutrition_cooking_action_states for select to authenticated
using (user_id = (select auth.uid()));
create policy "nutrition_cooking_action_states_insert_own"
on public.nutrition_cooking_action_states for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "nutrition_cooking_action_states_update_own"
on public.nutrition_cooking_action_states for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
create policy "nutrition_cooking_action_states_delete_own"
on public.nutrition_cooking_action_states for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "nutrition_cooking_timers_select_own" on public.nutrition_cooking_timers;
drop policy if exists "nutrition_cooking_timers_insert_own" on public.nutrition_cooking_timers;
drop policy if exists "nutrition_cooking_timers_update_own" on public.nutrition_cooking_timers;
drop policy if exists "nutrition_cooking_timers_delete_own" on public.nutrition_cooking_timers;
create policy "nutrition_cooking_timers_select_own"
on public.nutrition_cooking_timers for select to authenticated
using (user_id = (select auth.uid()));
create policy "nutrition_cooking_timers_insert_own"
on public.nutrition_cooking_timers for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "nutrition_cooking_timers_update_own"
on public.nutrition_cooking_timers for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
create policy "nutrition_cooking_timers_delete_own"
on public.nutrition_cooking_timers for delete to authenticated
using (user_id = (select auth.uid()));
