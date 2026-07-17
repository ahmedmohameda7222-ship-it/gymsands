begin;

-- Phase 1 keeps the canonical muscle taxonomy in TypeScript. PostgreSQL stores
-- only checked canonical IDs and immutable, versioned mappings.

do $constraint$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.user_custom_exercises'::regclass
      and contype = 'u'
      and conkey = array[
        (select attnum from pg_attribute where attrelid = 'public.user_custom_exercises'::regclass and attname = 'id'),
        (select attnum from pg_attribute where attrelid = 'public.user_custom_exercises'::regclass and attname = 'user_id')
      ]::smallint[]
  ) then
    alter table public.user_custom_exercises
      add constraint user_custom_exercises_id_user_id_key unique (id, user_id);
  end if;
end
$constraint$;

create table public.exercise_provider_links (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  provider text not null,
  provider_activity_id text not null,
  provider_slug text,
  provider_version text,
  verification_status text not null default 'uncertain',
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_provider_links_provider_check check (btrim(provider) <> ''),
  constraint exercise_provider_links_activity_id_check check (btrim(provider_activity_id) <> ''),
  constraint exercise_provider_links_verification_status_check
    check (verification_status in ('verified', 'uncertain', 'rejected')),
  constraint exercise_provider_links_verified_at_check
    check (verification_status <> 'verified' or verified_at is not null),
  constraint exercise_provider_links_provider_identity_key unique (provider, provider_activity_id)
);

create table public.exercise_muscle_mapping_sets (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  mapping_version integer not null,
  status text not null default 'draft',
  source text not null,
  schema_version text not null,
  checksum text not null,
  published_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_muscle_mapping_sets_version_check check (mapping_version > 0),
  constraint exercise_muscle_mapping_sets_status_check check (status in ('draft', 'published', 'retired')),
  constraint exercise_muscle_mapping_sets_source_check check (btrim(source) <> ''),
  constraint exercise_muscle_mapping_sets_schema_check check (schema_version = 'exercise_muscle_mapping_v1'),
  constraint exercise_muscle_mapping_sets_checksum_check check (checksum ~ '^[0-9a-f]{64}$'),
  constraint exercise_muscle_mapping_sets_published_at_check check (status <> 'published' or published_at is not null),
  constraint exercise_muscle_mapping_sets_retired_at_check check (status <> 'retired' or retired_at is not null),
  constraint exercise_muscle_mapping_sets_version_key unique (exercise_id, mapping_version)
);

create table public.exercise_muscle_mapping_entries (
  id uuid primary key default gen_random_uuid(),
  mapping_set_id uuid not null references public.exercise_muscle_mapping_sets(id) on delete cascade,
  muscle_id text not null,
  role text not null,
  contribution numeric(3,2) not null,
  side_scope text not null default 'bilateral',
  sort_order integer not null,
  created_at timestamptz not null default now(),
  constraint exercise_muscle_mapping_entries_muscle_check check (muscle_id in (
    'pectoralis_major', 'anterior_deltoid', 'lateral_deltoid', 'posterior_deltoid',
    'trapezius', 'latissimus_dorsi', 'upper_back', 'biceps_brachii', 'triceps_brachii',
    'forearms', 'rotator_cuff', 'serratus_anterior', 'rectus_abdominis', 'obliques',
    'erector_spinae', 'gluteus_maximus', 'gluteus_medius', 'quadriceps', 'hamstrings',
    'adductors', 'hip_flexors', 'gastrocnemius', 'soleus', 'tibialis_anterior'
  )),
  constraint exercise_muscle_mapping_entries_role_contribution_check check (
    (role = 'primary' and contribution in (1.00, 0.75))
    or (role = 'secondary' and contribution in (0.50, 0.25))
    or (role = 'stabilizer' and contribution = 0.00)
  ),
  constraint exercise_muscle_mapping_entries_side_check check (side_scope in ('bilateral', 'left', 'right')),
  constraint exercise_muscle_mapping_entries_sort_check check (sort_order > 0),
  constraint exercise_muscle_mapping_entries_muscle_key unique (mapping_set_id, muscle_id),
  constraint exercise_muscle_mapping_entries_sort_key unique (mapping_set_id, sort_order)
);

create table public.user_custom_exercise_mapping_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  custom_exercise_id uuid not null,
  mapping_version integer not null,
  status text not null default 'draft',
  schema_version text not null,
  checksum text not null,
  published_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_custom_exercise_mapping_sets_owner_fk
    foreign key (custom_exercise_id, user_id)
    references public.user_custom_exercises(id, user_id)
    on delete cascade,
  constraint user_custom_exercise_mapping_sets_version_check check (mapping_version > 0),
  constraint user_custom_exercise_mapping_sets_status_check check (status in ('draft', 'published', 'retired')),
  constraint user_custom_exercise_mapping_sets_schema_check check (schema_version = 'exercise_muscle_mapping_v1'),
  constraint user_custom_exercise_mapping_sets_checksum_check check (checksum ~ '^[0-9a-f]{64}$'),
  constraint user_custom_exercise_mapping_sets_published_at_check check (status <> 'published' or published_at is not null),
  constraint user_custom_exercise_mapping_sets_retired_at_check check (status <> 'retired' or retired_at is not null),
  constraint user_custom_exercise_mapping_sets_version_key unique (custom_exercise_id, mapping_version)
);

create table public.user_custom_exercise_mapping_entries (
  id uuid primary key default gen_random_uuid(),
  mapping_set_id uuid not null references public.user_custom_exercise_mapping_sets(id) on delete cascade,
  muscle_id text not null,
  role text not null,
  contribution numeric(3,2) not null,
  side_scope text not null default 'bilateral',
  sort_order integer not null,
  created_at timestamptz not null default now(),
  constraint user_custom_exercise_mapping_entries_muscle_check check (muscle_id in (
    'pectoralis_major', 'anterior_deltoid', 'lateral_deltoid', 'posterior_deltoid',
    'trapezius', 'latissimus_dorsi', 'upper_back', 'biceps_brachii', 'triceps_brachii',
    'forearms', 'rotator_cuff', 'serratus_anterior', 'rectus_abdominis', 'obliques',
    'erector_spinae', 'gluteus_maximus', 'gluteus_medius', 'quadriceps', 'hamstrings',
    'adductors', 'hip_flexors', 'gastrocnemius', 'soleus', 'tibialis_anterior'
  )),
  constraint user_custom_exercise_mapping_entries_role_contribution_check check (
    (role = 'primary' and contribution in (1.00, 0.75))
    or (role = 'secondary' and contribution in (0.50, 0.25))
    or (role = 'stabilizer' and contribution = 0.00)
  ),
  constraint user_custom_exercise_mapping_entries_side_check check (side_scope in ('bilateral', 'left', 'right')),
  constraint user_custom_exercise_mapping_entries_sort_check check (sort_order > 0),
  constraint user_custom_exercise_mapping_entries_muscle_key unique (mapping_set_id, muscle_id),
  constraint user_custom_exercise_mapping_entries_sort_key unique (mapping_set_id, sort_order)
);

create unique index exercise_muscle_mapping_sets_current_uidx
  on public.exercise_muscle_mapping_sets(exercise_id)
  where status = 'published';
create index exercise_muscle_mapping_sets_lookup_idx
  on public.exercise_muscle_mapping_sets(exercise_id, status);
create index exercise_muscle_mapping_entries_set_idx
  on public.exercise_muscle_mapping_entries(mapping_set_id);
create index exercise_provider_links_exercise_idx
  on public.exercise_provider_links(exercise_id);

create unique index user_custom_exercise_mapping_sets_current_uidx
  on public.user_custom_exercise_mapping_sets(custom_exercise_id)
  where status = 'published';
create index user_custom_exercise_mapping_sets_owner_lookup_idx
  on public.user_custom_exercise_mapping_sets(user_id, custom_exercise_id, status);
create index user_custom_exercise_mapping_entries_set_idx
  on public.user_custom_exercise_mapping_entries(mapping_set_id);

create trigger exercise_provider_links_updated_at
before update on public.exercise_provider_links
for each row execute function public.set_updated_at();
create trigger exercise_muscle_mapping_sets_updated_at
before update on public.exercise_muscle_mapping_sets
for each row execute function public.set_updated_at();
create trigger user_custom_exercise_mapping_sets_updated_at
before update on public.user_custom_exercise_mapping_sets
for each row execute function public.set_updated_at();

create or replace function private.muscle_taxonomy_display_order(p_muscle_id text)
returns integer
language sql
immutable
strict
set search_path = ''
as $function$
  select case p_muscle_id
    when 'pectoralis_major' then 1 when 'anterior_deltoid' then 2
    when 'lateral_deltoid' then 3 when 'posterior_deltoid' then 4
    when 'trapezius' then 5 when 'latissimus_dorsi' then 6
    when 'upper_back' then 7 when 'biceps_brachii' then 8
    when 'triceps_brachii' then 9 when 'forearms' then 10
    when 'rotator_cuff' then 11 when 'serratus_anterior' then 12
    when 'rectus_abdominis' then 13 when 'obliques' then 14
    when 'erector_spinae' then 15 when 'gluteus_maximus' then 16
    when 'gluteus_medius' then 17 when 'quadriceps' then 18
    when 'hamstrings' then 19 when 'adductors' then 20
    when 'hip_flexors' then 21 when 'gastrocnemius' then 22
    when 'soleus' then 23 when 'tibialis_anterior' then 24
  end
$function$;

create or replace function private.exercise_muscle_mapping_checksum(p_mapping_set_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select encode(extensions.digest(
    '{"schema_version":"exercise_muscle_mapping_v1","entries":['
    || coalesce(string_agg(
      format(
        '{"muscle_id":%s,"role":%s,"contribution":%s,"side_scope":%s,"sort_order":%s}',
        to_json(entry.muscle_id)::text,
        to_json(entry.role)::text,
        to_json(to_char(entry.contribution, 'FM0.00'))::text,
        to_json(entry.side_scope)::text,
        entry.sort_order
      ),
      ',' order by private.muscle_taxonomy_display_order(entry.muscle_id), entry.muscle_id
    ), '')
    || ']}',
    'sha256'
  ), 'hex')
  from public.exercise_muscle_mapping_entries entry
  where entry.mapping_set_id = p_mapping_set_id
$function$;

create or replace function private.user_custom_exercise_mapping_checksum(p_mapping_set_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select encode(extensions.digest(
    '{"schema_version":"exercise_muscle_mapping_v1","entries":['
    || coalesce(string_agg(
      format(
        '{"muscle_id":%s,"role":%s,"contribution":%s,"side_scope":%s,"sort_order":%s}',
        to_json(entry.muscle_id)::text,
        to_json(entry.role)::text,
        to_json(to_char(entry.contribution, 'FM0.00'))::text,
        to_json(entry.side_scope)::text,
        entry.sort_order
      ),
      ',' order by private.muscle_taxonomy_display_order(entry.muscle_id), entry.muscle_id
    ), '')
    || ']}',
    'sha256'
  ), 'hex')
  from public.user_custom_exercise_mapping_entries entry
  where entry.mapping_set_id = p_mapping_set_id
$function$;

create or replace function private.enforce_global_mapping_entry_draft()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  parent_status text;
  target_exercise_id uuid;
  parent_id uuid := coalesce(new.mapping_set_id, old.mapping_set_id);
begin
  select mapping_set.status, mapping_set.exercise_id
    into parent_status, target_exercise_id
  from public.exercise_muscle_mapping_sets mapping_set
  where mapping_set.id = parent_id;

  if parent_status is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if parent_status <> 'draft' then
    if tg_op = 'DELETE' and not exists (
      select 1 from public.exercises exercise where exercise.id = target_exercise_id
    ) then
      return old;
    end if;
    raise exception 'Published or retired global mapping entries are immutable.' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end
$function$;

create or replace function private.enforce_custom_mapping_entry_draft()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  parent_status text;
  target_custom_exercise_id uuid;
  target_user_id uuid;
  parent_id uuid := coalesce(new.mapping_set_id, old.mapping_set_id);
begin
  select mapping_set.status, mapping_set.custom_exercise_id, mapping_set.user_id
    into parent_status, target_custom_exercise_id, target_user_id
  from public.user_custom_exercise_mapping_sets mapping_set
  where mapping_set.id = parent_id;

  if parent_status is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if parent_status <> 'draft' then
    if tg_op = 'DELETE' and not exists (
      select 1
      from public.user_custom_exercises exercise
      where exercise.id = target_custom_exercise_id and exercise.user_id = target_user_id
    ) then
      return old;
    end if;
    raise exception 'Published or retired custom mapping entries are immutable.' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end
$function$;

create or replace function private.enforce_global_mapping_set_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    if old.status = 'draft' or not exists (select 1 from public.exercises where id = old.exercise_id) then
      return old;
    end if;
    raise exception 'Published or retired global mapping sets are immutable.' using errcode = '23514';
  end if;

  if old.status = 'draft' then
    if new.status = 'draft' then return new; end if;
    if new.status = 'published'
       and current_setting('plaivra.muscle_mapping_publication_id', true) = old.id::text
       and new.published_at is not null then
      return new;
    end if;
    raise exception 'Global mappings must be published through the atomic publication function.' using errcode = '23514';
  end if;

  if old.status = 'published'
     and new.status = 'retired'
     and new.retired_at is not null
     and new.id = old.id
     and new.exercise_id = old.exercise_id
     and new.mapping_version = old.mapping_version
     and new.source = old.source
     and new.schema_version = old.schema_version
     and new.checksum = old.checksum
     and new.published_at = old.published_at then
    return new;
  end if;

  raise exception 'Published or retired global mapping sets are immutable.' using errcode = '23514';
end
$function$;

create or replace function private.enforce_custom_mapping_set_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    if old.status = 'draft' or not exists (
      select 1 from public.user_custom_exercises where id = old.custom_exercise_id and user_id = old.user_id
    ) then
      return old;
    end if;
    raise exception 'Published or retired custom mapping sets are immutable.' using errcode = '23514';
  end if;

  if old.status = 'draft' then
    if new.status = 'draft' then return new; end if;
    if new.status = 'published'
       and current_setting('plaivra.muscle_mapping_publication_id', true) = old.id::text
       and new.published_at is not null then
      return new;
    end if;
    raise exception 'Custom mappings must be published through the atomic publication function.' using errcode = '23514';
  end if;

  if old.status = 'published'
     and new.status = 'retired'
     and new.retired_at is not null
     and new.id = old.id
     and new.user_id = old.user_id
     and new.custom_exercise_id = old.custom_exercise_id
     and new.mapping_version = old.mapping_version
     and new.schema_version = old.schema_version
     and new.checksum = old.checksum
     and new.published_at = old.published_at then
    return new;
  end if;

  raise exception 'Published or retired custom mapping sets are immutable.' using errcode = '23514';
end
$function$;

create trigger enforce_global_mapping_entry_draft
before insert or update or delete on public.exercise_muscle_mapping_entries
for each row execute function private.enforce_global_mapping_entry_draft();
create trigger enforce_custom_mapping_entry_draft
before insert or update or delete on public.user_custom_exercise_mapping_entries
for each row execute function private.enforce_custom_mapping_entry_draft();
create trigger enforce_global_mapping_set_lifecycle
before update or delete on public.exercise_muscle_mapping_sets
for each row execute function private.enforce_global_mapping_set_lifecycle();
create trigger enforce_custom_mapping_set_lifecycle
before update or delete on public.user_custom_exercise_mapping_sets
for each row execute function private.enforce_custom_mapping_set_lifecycle();

create or replace function public.publish_exercise_muscle_mapping_set(p_mapping_set_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target public.exercise_muscle_mapping_sets%rowtype;
  expected_checksum text;
begin
  if not (
    coalesce((select private.is_admin()), false)
    or coalesce(current_setting('request.jwt.claim.role', true) = 'service_role', false)
  ) then
    raise exception 'Only a Plaivra administrator may publish global muscle mappings.' using errcode = '42501';
  end if;

  select * into target
  from public.exercise_muscle_mapping_sets
  where id = p_mapping_set_id
  for update;
  if not found then raise exception 'Global mapping set not found.' using errcode = 'P0002'; end if;
  if target.status = 'published' then return target.id; end if;
  if target.status <> 'draft' then raise exception 'Only a draft global mapping can be published.' using errcode = '23514'; end if;

  perform 1 from public.exercises where id = target.exercise_id for update;
  if not found then raise exception 'Canonical exercise not found.' using errcode = '23503'; end if;
  if not exists (select 1 from public.exercise_muscle_mapping_entries where mapping_set_id = target.id) then
    raise exception 'A published global mapping requires at least one entry.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.exercise_muscle_mapping_entries where mapping_set_id = target.id and role = 'primary') then
    raise exception 'A published global mapping requires at least one primary entry.' using errcode = '23514';
  end if;
  expected_checksum := private.exercise_muscle_mapping_checksum(target.id);
  if expected_checksum is distinct from target.checksum then
    raise exception 'Global mapping checksum does not match canonical content.' using errcode = '23514';
  end if;

  update public.exercise_muscle_mapping_sets
  set status = 'retired', retired_at = now(), updated_at = now()
  where exercise_id = target.exercise_id and status = 'published' and id <> target.id;

  perform set_config('plaivra.muscle_mapping_publication_id', target.id::text, true);
  update public.exercise_muscle_mapping_sets
  set status = 'published', published_at = now(), retired_at = null, updated_at = now()
  where id = target.id;
  return target.id;
end
$function$;

create or replace function public.publish_user_custom_exercise_mapping_set(p_mapping_set_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target public.user_custom_exercise_mapping_sets%rowtype;
  expected_checksum text;
  actor_is_admin boolean;
begin
  select * into target
  from public.user_custom_exercise_mapping_sets
  where id = p_mapping_set_id
  for update;
  if not found then raise exception 'Custom mapping set not found.' using errcode = 'P0002'; end if;

  actor_is_admin := coalesce((select private.is_admin()), false)
    or coalesce(current_setting('request.jwt.claim.role', true) = 'service_role', false);
  if not actor_is_admin and (select auth.uid()) is distinct from target.user_id then
    raise exception 'Custom mapping ownership is required.' using errcode = '42501';
  end if;
  if target.status = 'published' then return target.id; end if;
  if target.status <> 'draft' then raise exception 'Only a draft custom mapping can be published.' using errcode = '23514'; end if;

  perform 1
  from public.user_custom_exercises
  where id = target.custom_exercise_id and user_id = target.user_id
  for update;
  if not found then raise exception 'Owned custom exercise not found.' using errcode = '23503'; end if;
  if not exists (select 1 from public.user_custom_exercise_mapping_entries where mapping_set_id = target.id) then
    raise exception 'A published custom mapping requires at least one entry.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.user_custom_exercise_mapping_entries where mapping_set_id = target.id and role = 'primary') then
    raise exception 'A published custom mapping requires at least one primary entry.' using errcode = '23514';
  end if;
  expected_checksum := private.user_custom_exercise_mapping_checksum(target.id);
  if expected_checksum is distinct from target.checksum then
    raise exception 'Custom mapping checksum does not match canonical content.' using errcode = '23514';
  end if;

  update public.user_custom_exercise_mapping_sets
  set status = 'retired', retired_at = now(), updated_at = now()
  where custom_exercise_id = target.custom_exercise_id and status = 'published' and id <> target.id;

  perform set_config('plaivra.muscle_mapping_publication_id', target.id::text, true);
  update public.user_custom_exercise_mapping_sets
  set status = 'published', published_at = now(), retired_at = null, updated_at = now()
  where id = target.id;
  return target.id;
end
$function$;

alter table public.exercise_provider_links enable row level security;
alter table public.exercise_muscle_mapping_sets enable row level security;
alter table public.exercise_muscle_mapping_entries enable row level security;
alter table public.user_custom_exercise_mapping_sets enable row level security;
alter table public.user_custom_exercise_mapping_entries enable row level security;

revoke all on table public.exercise_provider_links from public, anon, authenticated;
revoke all on table public.exercise_muscle_mapping_sets from public, anon, authenticated;
revoke all on table public.exercise_muscle_mapping_entries from public, anon, authenticated;
revoke all on table public.user_custom_exercise_mapping_sets from public, anon, authenticated;
revoke all on table public.user_custom_exercise_mapping_entries from public, anon, authenticated;

grant select, insert, update, delete on table public.exercise_provider_links to authenticated, service_role;
grant select, insert, update, delete on table public.exercise_muscle_mapping_sets to authenticated, service_role;
grant select, insert, update, delete on table public.exercise_muscle_mapping_entries to authenticated, service_role;
grant select, insert, update, delete on table public.user_custom_exercise_mapping_sets to authenticated, service_role;
grant select, insert, update, delete on table public.user_custom_exercise_mapping_entries to authenticated, service_role;

create policy exercise_provider_links_admin_all
on public.exercise_provider_links for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy exercise_muscle_mapping_sets_member_read_published
on public.exercise_muscle_mapping_sets for select to authenticated
using (
  status = 'published'
  and exists (
    select 1 from public.exercises exercise
    where exercise.id = exercise_muscle_mapping_sets.exercise_id
      and exercise.is_global = true
      and exercise.is_approved = true
  )
);
create policy exercise_muscle_mapping_sets_admin_all
on public.exercise_muscle_mapping_sets for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy exercise_muscle_mapping_entries_member_read_published
on public.exercise_muscle_mapping_entries for select to authenticated
using (
  exists (
    select 1
    from public.exercise_muscle_mapping_sets mapping_set
    join public.exercises exercise on exercise.id = mapping_set.exercise_id
    where mapping_set.id = exercise_muscle_mapping_entries.mapping_set_id
      and mapping_set.status = 'published'
      and exercise.is_global = true
      and exercise.is_approved = true
  )
);
create policy exercise_muscle_mapping_entries_admin_all
on public.exercise_muscle_mapping_entries for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy user_custom_exercise_mapping_sets_owner_all
on public.user_custom_exercise_mapping_sets for all to authenticated
using (user_id = (select auth.uid()) or (select private.is_admin()))
with check (user_id = (select auth.uid()) or (select private.is_admin()));

create policy user_custom_exercise_mapping_entries_owner_all
on public.user_custom_exercise_mapping_entries for all to authenticated
using (
  exists (
    select 1 from public.user_custom_exercise_mapping_sets mapping_set
    where mapping_set.id = user_custom_exercise_mapping_entries.mapping_set_id
      and (mapping_set.user_id = (select auth.uid()) or (select private.is_admin()))
  )
)
with check (
  exists (
    select 1 from public.user_custom_exercise_mapping_sets mapping_set
    where mapping_set.id = user_custom_exercise_mapping_entries.mapping_set_id
      and (mapping_set.user_id = (select auth.uid()) or (select private.is_admin()))
  )
);

revoke all on function private.muscle_taxonomy_display_order(text) from public, anon, authenticated;
revoke all on function private.exercise_muscle_mapping_checksum(uuid) from public, anon, authenticated;
revoke all on function private.user_custom_exercise_mapping_checksum(uuid) from public, anon, authenticated;
revoke all on function private.enforce_global_mapping_entry_draft() from public, anon, authenticated;
revoke all on function private.enforce_custom_mapping_entry_draft() from public, anon, authenticated;
revoke all on function private.enforce_global_mapping_set_lifecycle() from public, anon, authenticated;
revoke all on function private.enforce_custom_mapping_set_lifecycle() from public, anon, authenticated;

revoke all on function public.publish_exercise_muscle_mapping_set(uuid) from public, anon, authenticated;
revoke all on function public.publish_user_custom_exercise_mapping_set(uuid) from public, anon, authenticated;
grant execute on function public.publish_exercise_muscle_mapping_set(uuid) to authenticated, service_role;
grant execute on function public.publish_user_custom_exercise_mapping_set(uuid) to authenticated, service_role;

comment on table public.exercise_provider_links is
  'Non-authoritative provider aliases for canonical public.exercises identities; never verified by name alone.';
comment on table public.exercise_muscle_mapping_sets is
  'Immutable published muscle mapping versions for canonical global exercises.';
comment on table public.user_custom_exercise_mapping_sets is
  'Owner-scoped immutable published muscle mapping versions for user custom exercises.';

commit;
