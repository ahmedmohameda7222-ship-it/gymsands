begin;

alter table public.user_meal_plan_items
  drop constraint if exists user_meal_plan_items_status_check;

alter table public.user_meal_plan_items
  add constraint user_meal_plan_items_status_check
  check (status in ('planned', 'done', 'skipped'));

alter table public.user_meal_plan_items
  drop constraint if exists user_meal_plan_items_skipped_state_check;

alter table public.user_meal_plan_items
  add constraint user_meal_plan_items_skipped_state_check
  check (
    status <> 'skipped'
    or (completed_at is null and food_log_id is null)
  );

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

  if new.status = 'skipped' and (new.completed_at is not null or new.food_log_id is not null) then
    raise exception 'Skipped meal-plan items cannot contain completion or food-log references.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_user_meal_plan_item_status_transition
  on public.user_meal_plan_items;

create trigger enforce_user_meal_plan_item_status_transition
before update of status, completed_at, food_log_id
on public.user_meal_plan_items
for each row
execute function public.enforce_user_meal_plan_item_status_transition();

comment on column public.user_meal_plan_items.status is
  'Persistent meal-plan execution state. Done and skipped states are terminal. Skipped items are not food logs and do not count as eaten.';

commit;
