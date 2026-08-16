-- Active Workout feedback preferences are account-scoped application settings.
-- Additive only; existing RLS on public.user_app_settings remains authoritative.

alter table public.user_app_settings
  add column if not exists workout_sounds boolean not null default true,
  add column if not exists haptics boolean not null default true;

comment on column public.user_app_settings.workout_sounds is
  'Whether semantic workout sound feedback is enabled for this account.';
comment on column public.user_app_settings.haptics is
  'Whether supported clients may request semantic workout haptic feedback for this account.';
