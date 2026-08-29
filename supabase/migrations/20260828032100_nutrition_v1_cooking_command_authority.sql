begin;

-- Nutrition V1 Cooking command-authority hardening.
-- Forward/additive only: keep owner reads and the direct terminal session update path,
-- while removing browser write capabilities now owned by transactional RPCs.

revoke insert, delete on public.nutrition_cooking_sessions from authenticated;
revoke insert, update, delete on public.nutrition_cooking_action_states from authenticated;
revoke insert, update, delete on public.nutrition_cooking_timers from authenticated;

-- RLS policies do not grant privileges, but remove obsolete write policies as well so
-- the schema documents the intended command surface rather than retaining dead bypasses.
drop policy if exists "nutrition_cooking_sessions_insert_own" on public.nutrition_cooking_sessions;
drop policy if exists "nutrition_cooking_sessions_delete_own" on public.nutrition_cooking_sessions;
drop policy if exists "nutrition_cooking_action_states_insert_own" on public.nutrition_cooking_action_states;
drop policy if exists "nutrition_cooking_action_states_update_own" on public.nutrition_cooking_action_states;
drop policy if exists "nutrition_cooking_action_states_delete_own" on public.nutrition_cooking_action_states;
drop policy if exists "nutrition_cooking_timers_insert_own" on public.nutrition_cooking_timers;
drop policy if exists "nutrition_cooking_timers_update_own" on public.nutrition_cooking_timers;
drop policy if exists "nutrition_cooking_timers_delete_own" on public.nutrition_cooking_timers;

-- Explicitly preserve only the browser capabilities still used by the read/resume and
-- terminal completion/end paths. SECURITY DEFINER start/sync/restart commands retain
-- their own owner-derived authority; service_role remains unchanged.
grant select, update on public.nutrition_cooking_sessions to authenticated;
grant select on public.nutrition_cooking_action_states to authenticated;
grant select on public.nutrition_cooking_timers to authenticated;

notify pgrst, 'reload schema';
commit;
