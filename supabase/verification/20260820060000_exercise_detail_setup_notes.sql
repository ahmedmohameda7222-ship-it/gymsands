do $$
declare
  v_rls boolean;
  v_policy_count integer;
  v_unique_count integer;
begin
  select c.relrowsecurity into v_rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'exercise_setup_notes';
  if v_rls is distinct from true then raise exception 'exercise_setup_notes RLS is not enabled'; end if;

  select count(*) into v_policy_count
  from pg_policies
  where schemaname = 'public' and tablename = 'exercise_setup_notes'
    and policyname in ('exercise_setup_notes_owner_select','exercise_setup_notes_owner_insert','exercise_setup_notes_owner_update','exercise_setup_notes_owner_delete');
  if v_policy_count <> 4 then raise exception 'exercise_setup_notes owner policy set is incomplete'; end if;

  select count(*) into v_unique_count
  from pg_constraint
  where conrelid = 'public.exercise_setup_notes'::regclass
    and conname = 'exercise_setup_notes_owner_identity_key'
    and contype = 'u';
  if v_unique_count <> 1 then raise exception 'exercise_setup_notes owner+identity uniqueness is missing'; end if;

  if has_table_privilege('anon', 'public.exercise_setup_notes', 'select') then
    raise exception 'anonymous role can read exercise_setup_notes';
  end if;
  if has_function_privilege('authenticated', 'public.purge_account_application_data_atomic(uuid)', 'execute') then
    raise exception 'authenticated role can execute account purge authority';
  end if;
  if not has_function_privilege('service_role', 'public.purge_account_application_data_atomic(uuid)', 'execute') then
    raise exception 'service_role cannot execute account purge authority';
  end if;
end
$$;

select id, user_id, exercise_identity, note_body, created_at, updated_at
from public.exercise_setup_notes
where false;
