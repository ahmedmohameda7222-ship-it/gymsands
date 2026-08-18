do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_app_settings'
      and column_name = 'workout_sounds' and data_type = 'boolean'
      and is_nullable = 'NO' and column_default = 'true'
  ) then
    raise exception 'user_app_settings.workout_sounds is missing or has the wrong contract';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_app_settings'
      and column_name = 'haptics' and data_type = 'boolean'
      and is_nullable = 'NO' and column_default = 'true'
  ) then
    raise exception 'user_app_settings.haptics is missing or has the wrong contract';
  end if;

  if not exists (
    select 1 from pg_class where oid = 'public.user_app_settings'::regclass and relrowsecurity
  ) then
    raise exception 'user_app_settings must remain protected by RLS';
  end if;
end $$;
