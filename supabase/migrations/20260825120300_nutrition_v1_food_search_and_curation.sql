-- Nutrition V1 Food search, provenance, personalization, and curation foundation.
-- Additive only: canonical Food identity remains public.food_items in Plaivra Main Supabase.

create extension if not exists "pg_trgm";

alter table public.food_items
  add column if not exists saturated_fat_g numeric check (saturated_fat_g is null or saturated_fat_g >= 0),
  add column if not exists fiber_g numeric check (fiber_g is null or fiber_g >= 0),
  add column if not exists sugars_g numeric check (sugars_g is null or sugars_g >= 0),
  add column if not exists sodium_mg numeric check (sodium_mg is null or sodium_mg >= 0),
  add column if not exists nutrition_basis_amount numeric check (nutrition_basis_amount is null or nutrition_basis_amount > 0),
  add column if not exists nutrition_basis_unit text check (nutrition_basis_unit is null or nutrition_basis_unit in ('g', 'ml')),
  add column if not exists is_verified boolean not null default false,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_source_record_id uuid,
  add column if not exists merged_into_food_id uuid,
  add column if not exists lifecycle_status text not null default 'active';

alter table public.food_items
  add constraint food_items_verification_state_check
  check (
    (is_verified = false and verified_at is null and verified_source_record_id is null)
    or (is_verified = true and verified_at is not null and verified_source_record_id is not null)
  );

alter table public.food_items
  add constraint food_items_lifecycle_status_check
  check (lifecycle_status in ('draft', 'active', 'deprecated', 'withdrawn', 'merged'));

alter table public.food_items
  add constraint food_items_no_self_merge
  check (merged_into_food_id is null or merged_into_food_id <> id);

alter table public.food_items
  add constraint food_items_merge_state_check
  check (
    (lifecycle_status = 'merged' and merged_into_food_id is not null)
    or (lifecycle_status <> 'merged' and merged_into_food_id is null)
  );

alter table public.food_items
  add constraint food_items_merged_into_fk
  foreign key (merged_into_food_id) references public.food_items(id) on delete restrict;

create table if not exists public.food_aliases (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.food_items(id) on delete cascade,
  locale text not null check (locale in ('en', 'de', 'ar')),
  alias text not null check (length(btrim(alias)) > 0),
  normalized_alias text not null check (length(btrim(normalized_alias)) > 0),
  alias_type text not null default 'alias' check (alias_type in ('localized_name', 'alias', 'transliteration')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (food_id, locale, normalized_alias)
);

create table if not exists public.food_source_records (
  id uuid primary key default gen_random_uuid(),
  food_id uuid references public.food_items(id) on delete set null,
  provider text not null check (length(btrim(provider)) > 0),
  source_record_id text not null check (length(btrim(source_record_id)) > 0),
  source_reference text,
  license_name text not null check (length(btrim(license_name)) > 0),
  license_reference text,
  retrieved_at timestamptz not null default now(),
  source_nutrition jsonb,
  source_serving jsonb,
  review_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, source_record_id),
  unique (id, food_id)
);

-- A positive verification assertion must point at provenance already linked to the same Food.
-- Importing a provider row alone never flips canonical verification state.
alter table public.food_items
  add constraint food_items_verified_source_record_fk
  foreign key (verified_source_record_id, id)
  references public.food_source_records(id, food_id) on delete restrict;

create table if not exists public.food_personal_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  food_id uuid not null references public.food_items(id) on delete cascade,
  calories numeric check (calories is null or calories >= 0),
  protein_g numeric check (protein_g is null or protein_g >= 0),
  carbs_g numeric check (carbs_g is null or carbs_g >= 0),
  fat_g numeric check (fat_g is null or fat_g >= 0),
  saturated_fat_g numeric check (saturated_fat_g is null or saturated_fat_g >= 0),
  fiber_g numeric check (fiber_g is null or fiber_g >= 0),
  sugars_g numeric check (sugars_g is null or sugars_g >= 0),
  sodium_mg numeric check (sodium_mg is null or sodium_mg >= 0),
  basis_amount numeric check (basis_amount is null or basis_amount > 0),
  basis_unit text check (basis_unit is null or basis_unit in ('g', 'ml')),
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, food_id),
  check (
    calories is not null or protein_g is not null or carbs_g is not null or fat_g is not null
    or saturated_fat_g is not null or fiber_g is not null or sugars_g is not null or sodium_mg is not null
    or basis_amount is not null or basis_unit is not null
  )
);

create table if not exists public.food_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  food_id uuid not null references public.food_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, food_id)
);

create index if not exists food_aliases_normalized_trgm_idx
  on public.food_aliases using gin (normalized_alias gin_trgm_ops);

create index if not exists food_aliases_locale_lookup_idx
  on public.food_aliases(locale, normalized_alias, food_id);

create index if not exists food_items_name_trgm_idx
  on public.food_items using gin (lower(food_name) gin_trgm_ops);

create index if not exists food_items_lifecycle_search_idx
  on public.food_items(lifecycle_status, is_verified, id)
  where merged_into_food_id is null;

create index if not exists food_source_records_food_idx
  on public.food_source_records(food_id, provider, retrieved_at desc, id)
  where food_id is not null;

create index if not exists food_personal_corrections_owner_active_idx
  on public.food_personal_corrections(user_id, food_id)
  where is_active = true;

create index if not exists food_favorites_owner_created_idx
  on public.food_favorites(user_id, created_at desc, food_id);

drop trigger if exists food_aliases_updated_at on public.food_aliases;
create trigger food_aliases_updated_at
before update on public.food_aliases
for each row execute function public.set_updated_at();

drop trigger if exists food_source_records_updated_at on public.food_source_records;
create trigger food_source_records_updated_at
before update on public.food_source_records
for each row execute function public.set_updated_at();

drop trigger if exists food_personal_corrections_updated_at on public.food_personal_corrections;
create trigger food_personal_corrections_updated_at
before update on public.food_personal_corrections
for each row execute function public.set_updated_at();

alter table public.food_aliases enable row level security;
alter table public.food_source_records enable row level security;
alter table public.food_personal_corrections enable row level security;
alter table public.food_favorites enable row level security;

revoke all on public.food_aliases from anon, authenticated;
revoke all on public.food_source_records from anon, authenticated;
revoke all on public.food_personal_corrections from anon, authenticated;
revoke all on public.food_favorites from anon, authenticated;

grant select on public.food_aliases to authenticated;
grant select, insert, update, delete on public.food_personal_corrections to authenticated;
grant select, insert, delete on public.food_favorites to authenticated;

grant all privileges on public.food_aliases to service_role;
grant all privileges on public.food_source_records to service_role;
grant all privileges on public.food_personal_corrections to service_role;
grant all privileges on public.food_favorites to service_role;

drop policy if exists "food_aliases_read_authenticated" on public.food_aliases;
create policy "food_aliases_read_authenticated"
on public.food_aliases for select to authenticated
using (true);

-- Provenance records are internal curation evidence. No authenticated browser policy is granted.

drop policy if exists "food_personal_corrections_select_own" on public.food_personal_corrections;
drop policy if exists "food_personal_corrections_insert_own" on public.food_personal_corrections;
drop policy if exists "food_personal_corrections_update_own" on public.food_personal_corrections;
drop policy if exists "food_personal_corrections_delete_own" on public.food_personal_corrections;
create policy "food_personal_corrections_select_own"
on public.food_personal_corrections for select to authenticated
using (user_id = (select auth.uid()));
create policy "food_personal_corrections_insert_own"
on public.food_personal_corrections for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "food_personal_corrections_update_own"
on public.food_personal_corrections for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
create policy "food_personal_corrections_delete_own"
on public.food_personal_corrections for delete to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "food_favorites_select_own" on public.food_favorites;
drop policy if exists "food_favorites_insert_own" on public.food_favorites;
drop policy if exists "food_favorites_delete_own" on public.food_favorites;
create policy "food_favorites_select_own"
on public.food_favorites for select to authenticated
using (user_id = (select auth.uid()));
create policy "food_favorites_insert_own"
on public.food_favorites for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "food_favorites_delete_own"
on public.food_favorites for delete to authenticated
using (user_id = (select auth.uid()));
