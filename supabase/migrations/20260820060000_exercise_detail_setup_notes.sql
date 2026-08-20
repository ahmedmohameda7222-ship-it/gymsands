begin;

create table public.exercise_setup_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_identity text not null,
  note_body text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint exercise_setup_notes_identity_check check (
    char_length(exercise_identity) between 3 and 240
    and exercise_identity !~ '[[:cntrl:]]'
    and exercise_identity ~ '^(provider:[a-z0-9_]+:[A-Za-z0-9_-]{1,128}|custom:[A-Za-z0-9_-]{1,128}|global:[A-Za-z0-9_-]{1,128})$'
  ),
  constraint exercise_setup_notes_body_check check (char_length(note_body) between 1 and 1000),
  constraint exercise_setup_notes_owner_identity_key unique (user_id, exercise_identity)
);

create index exercise_setup_notes_owner_updated_idx
  on public.exercise_setup_notes(user_id, updated_at desc, exercise_identity);

alter table public.exercise_setup_notes enable row level security;

create policy exercise_setup_notes_owner_select on public.exercise_setup_notes
  for select to authenticated using (user_id = (select auth.uid()));
create policy exercise_setup_notes_owner_insert on public.exercise_setup_notes
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy exercise_setup_notes_owner_update on public.exercise_setup_notes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy exercise_setup_notes_owner_delete on public.exercise_setup_notes
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on table public.exercise_setup_notes from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.exercise_setup_notes to authenticated;
grant select, insert, update, delete on table public.exercise_setup_notes to service_role;

create or replace function private.touch_exercise_setup_note_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end
$$;
revoke all on function private.touch_exercise_setup_note_updated_at() from public, anon, authenticated, service_role;

create trigger exercise_setup_notes_touch_updated_at
before update on public.exercise_setup_notes
for each row execute function private.touch_exercise_setup_note_updated_at();

comment on table public.exercise_setup_notes is
  'Private account-synced per-exercise setup notes. Exported with portable data and deleted through the account application-data purge authority.';
comment on column public.exercise_setup_notes.exercise_identity is
  'Canonical stable exercise identity; display names are never persistence identity.';

-- Extend the existing reviewed deletion authority without replacing its prior proof.
alter function public.purge_account_application_data_atomic(uuid) set schema private;
alter function private.purge_account_application_data_atomic(uuid)
  rename to exercise_detail_v2_core_purge_account_application_data_atomic;

create function public.purge_account_application_data_atomic(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_setup_note_count integer;
  v_result jsonb;
begin
  select count(*) into v_setup_note_count
  from public.exercise_setup_notes where user_id = p_user_id;

  delete from public.exercise_setup_notes where user_id = p_user_id;
  v_result := private.exercise_detail_v2_core_purge_account_application_data_atomic(p_user_id);

  if exists (select 1 from public.exercise_setup_notes where user_id = p_user_id) then
    raise exception 'Account-data purge left exercise setup notes behind.' using errcode = '23514';
  end if;

  return v_result || jsonb_build_object('exercise_setup_notes_deleted', v_setup_note_count);
end
$$;

revoke all on function private.exercise_detail_v2_core_purge_account_application_data_atomic(uuid) from public, anon, authenticated, service_role;
revoke all on function public.purge_account_application_data_atomic(uuid) from public, anon, authenticated;
grant execute on function public.purge_account_application_data_atomic(uuid) to service_role;
comment on function public.purge_account_application_data_atomic(uuid) is
  'Service-role account deletion authority. Deletes exercise setup notes before delegating to the previously reviewed application-data purge implementation.';

notify pgrst, 'reload schema';
commit;
