alter table public.user_app_settings
  add column if not exists theme_id text not null default 'olive';

alter table public.user_app_settings
  drop constraint if exists user_app_settings_theme_id_check;

alter table public.user_app_settings
  add constraint user_app_settings_theme_id_check
  check (
    theme_id in (
      'olive',
      'elite-noir',
      'emerald-pulse',
      'arctic-platinum',
      'velocity-ember',
      'obsidian-sapphire',
      'graphite-lime',
      'cocoa-copper',
      'ivory-rosewood',
      'navy-sovereign',
      'bordeaux-royale',
      'emerald-executive',
      'platinum-graphite'
    )
  );

comment on column public.user_app_settings.theme_id is 'Selected global app theme for the signed-in user.';
