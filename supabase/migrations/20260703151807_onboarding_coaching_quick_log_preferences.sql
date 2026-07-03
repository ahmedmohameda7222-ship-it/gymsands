alter table public.onboarding_answers
  add column if not exists age integer,
  add column if not exists goal_weight_kg numeric(6,2),
  add column if not exists injuries_limitations text,
  add column if not exists training_preferences text,
  add column if not exists food_preferences text,
  add column if not exists lifestyle_notes text,
  add column if not exists workout_constraints text,
  add column if not exists coaching_notes text;

alter table public.onboarding_answers
  drop constraint if exists onboarding_answers_age_check,
  drop constraint if exists onboarding_answers_goal_weight_kg_check;

alter table public.onboarding_answers
  add constraint onboarding_answers_age_check check (age is null or age between 13 and 100),
  add constraint onboarding_answers_goal_weight_kg_check check (goal_weight_kg is null or goal_weight_kg > 0);

alter table public.user_app_settings
  add column if not exists quick_log_sections text[] not null
  default array['water','meal','weight','workout','progress','sleep','supplements','wellness']::text[];

comment on column public.onboarding_answers.coaching_notes is
  'User-authored planning context that may be included only in user-approved ChatGPT requests.';

comment on column public.user_app_settings.quick_log_sections is
  'User-selected Quick Log entries shown in the mobile app shell.';
