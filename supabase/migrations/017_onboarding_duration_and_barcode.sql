-- Adds the onboarding field used by profile setup.
-- Safe to run multiple times in Supabase SQL Editor.

alter table public.onboarding_answers
  add column if not exists desired_duration_weeks int;

alter table public.onboarding_answers
  drop constraint if exists onboarding_answers_desired_duration_weeks_check;

alter table public.onboarding_answers
  add constraint onboarding_answers_desired_duration_weeks_check
  check (desired_duration_weeks is null or desired_duration_weeks between 1 and 52);

notify pgrst, 'reload schema';
