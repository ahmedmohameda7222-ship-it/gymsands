begin;

alter table public.user_meal_plan_items
  drop constraint if exists user_meal_plan_items_status_check;

alter table public.user_meal_plan_items
  add constraint user_meal_plan_items_status_check
  check (status in ('planned', 'done', 'skipped'));

comment on column public.user_meal_plan_items.status is
  'Persistent meal-plan execution state. Skipped items are not food logs and do not count as eaten.';

commit;
