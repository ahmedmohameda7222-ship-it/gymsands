alter table public.sleep_recovery_logs
  add column if not exists bedtime time;

alter table public.sleep_recovery_logs
  add column if not exists wake_time time;

alter table public.sleep_recovery_logs
  add column if not exists stress_level text;

create index if not exists idx_sleep_recovery_logs_user_date
on public.sleep_recovery_logs(user_id, log_date desc);

create index if not exists idx_fitness_habits_user_date_name
on public.fitness_habits(user_id, habit_date desc, name);

create index if not exists idx_supplement_logs_user_date_name
on public.supplement_logs(user_id, supplement_date desc, name);
