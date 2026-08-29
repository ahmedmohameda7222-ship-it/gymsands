begin;

-- Cooking timers are logical instances identified by their UUID. Display names are
-- intentionally non-unique because Nutrition V1 supports multiple concurrent named
-- timers, including separate timers with the same name on the same action state.
alter table public.nutrition_cooking_timers
  drop constraint if exists nutrition_cooking_timers_action_state_id_timer_name_key;

-- Keep same-name lookup efficient without making display metadata an identity key.
create index if not exists nutrition_cooking_timers_action_name_idx
  on public.nutrition_cooking_timers(action_state_id, timer_name, created_at, id);

notify pgrst, 'reload schema';
commit;
