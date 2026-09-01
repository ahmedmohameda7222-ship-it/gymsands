begin;

-- Food Catalog Intelligence Plan 1: additive canonical core only.
-- No Food rows are populated, activated, or promoted by this migration.

create or replace function private.reject_food_catalog_immutable_fact_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'Food Catalog immutable fact rows cannot be updated or deleted.' using errcode = '23514';
end
$function$;

create table public.food_nutrition_revisions (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.food_items(id) on delete restrict,
  revision_number integer not null check (revision_number > 0),
  calories numeric check (calories is null or calories >= 0),
  protein_g numeric check (protein_g is null or protein_g >= 0),
  carbs_g numeric check (carbs_g is null or carbs_g >= 0),
  fat_g numeric check (fat_g is null or fat_g >= 0),
  saturated_fat_g numeric check (saturated_fat_g is null or saturated_fat_g >= 0),
  fiber_g numeric check (fiber_g is null or fiber_g >= 0),
  sugars_g numeric check (sugars_g is null or sugars_g >= 0),
  sodium_mg numeric check (sodium_mg is null or sodium_mg >= 0),
  basis_amount numeric not null check (basis_amount > 0),
  basis_unit text not null check (basis_unit in ('g', 'ml')),
  source_record_id uuid,
  nutrient_mapping_version text not null check (length(btrim(nutrient_mapping_version)) > 0),
  authority_reference text,
  created_at timestamptz not null default now(),
  unique (food_id, revision_number),
  foreign key (source_record_id, food_id)
    references public.food_source_records(id, food_id) on delete restrict
);

create table public.food_serving_options (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.food_items(id) on delete restrict,
  label text not null check (length(btrim(label)) > 0),
  amount numeric not null check (amount > 0),
  unit_code text not null check (length(btrim(unit_code)) > 0),
  gram_weight numeric check (gram_weight is null or gram_weight > 0),
  source_record_id uuid,
  source_portion_code text,
  evidence_class text not null check (evidence_class in ('exact_source', 'source_estimated')),
  source_primary boolean not null default false,
  authority_reference text,
  created_at timestamptz not null default now(),
  foreign key (source_record_id, food_id)
    references public.food_source_records(id, food_id) on delete restrict,
  check (gram_weight is not null or unit_code in ('g', 'ml'))
);

create table public.food_names (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.food_items(id) on delete restrict,
  language_tag text not null check (length(btrim(language_tag)) > 0),
  name_role text not null check (name_role in ('preferred_display', 'source_name', 'synonym', 'search_alias', 'transliteration')),
  name_text text not null check (length(btrim(name_text)) > 0),
  normalized_text text not null check (length(btrim(normalized_text)) > 0),
  script_code text,
  origin text not null check (origin in ('source', 'curated', 'migration')),
  source_record_id uuid,
  policy_version text not null check (length(btrim(policy_version)) > 0),
  created_at timestamptz not null default now(),
  foreign key (source_record_id, food_id)
    references public.food_source_records(id, food_id) on delete restrict
);

create trigger food_nutrition_revisions_immutable
before update or delete on public.food_nutrition_revisions
for each row execute function private.reject_food_catalog_immutable_fact_mutation();
create trigger food_serving_options_immutable
before update or delete on public.food_serving_options
for each row execute function private.reject_food_catalog_immutable_fact_mutation();
create trigger food_names_immutable
before update or delete on public.food_names
for each row execute function private.reject_food_catalog_immutable_fact_mutation();

create index food_nutrition_revisions_food_idx
  on public.food_nutrition_revisions(food_id, revision_number desc);
create index food_serving_options_food_idx
  on public.food_serving_options(food_id, created_at, id);
create index food_names_food_language_idx
  on public.food_names(food_id, language_tag, name_role, id);
create index food_names_normalized_idx
  on public.food_names(language_tag, normalized_text, food_id);

create table public.food_taxonomy_namespaces (
  namespace_code text primary key check (namespace_code ~ '^[a-z0-9_]+$'),
  lifecycle_status text not null default 'active' check (lifecycle_status in ('active', 'deprecated')),
  created_at timestamptz not null default now()
);

create table public.food_taxonomy_nodes (
  node_code text primary key check (node_code ~ '^[a-z0-9_]+$'),
  namespace_code text not null references public.food_taxonomy_namespaces(namespace_code) on delete restrict,
  parent_node_code text references public.food_taxonomy_nodes(node_code) on delete restrict,
  lifecycle_status text not null default 'active' check (lifecycle_status in ('active', 'deprecated')),
  replacement_node_code text references public.food_taxonomy_nodes(node_code) on delete restrict,
  created_at timestamptz not null default now(),
  check (parent_node_code is null or parent_node_code <> node_code),
  check (replacement_node_code is null or replacement_node_code <> node_code)
);

create or replace function private.guard_food_taxonomy_node_cycles()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.parent_node_code is not null and exists (
    with recursive chain(node_code) as (
      select new.parent_node_code
      union
      select node.parent_node_code
      from public.food_taxonomy_nodes node
      join chain on node.node_code = chain.node_code
      where node.parent_node_code is not null
    )
    select 1 from chain where node_code = new.node_code
  ) then
    raise exception 'Food taxonomy parent relation cannot create a cycle.' using errcode = '23514';
  end if;

  if new.replacement_node_code is not null and exists (
    with recursive chain(node_code) as (
      select new.replacement_node_code
      union
      select node.replacement_node_code
      from public.food_taxonomy_nodes node
      join chain on node.node_code = chain.node_code
      where node.replacement_node_code is not null
    )
    select 1 from chain where node_code = new.node_code
  ) then
    raise exception 'Food taxonomy replacement relation cannot create a cycle.' using errcode = '23514';
  end if;

  return new;
end
$function$;

create trigger food_taxonomy_nodes_cycle_guard
before insert or update on public.food_taxonomy_nodes
for each row execute function private.guard_food_taxonomy_node_cycles();

insert into public.food_taxonomy_namespaces (namespace_code)
values
  ('primary_food_group'), ('ingredient_family'), ('preparation'),
  ('physical_state'), ('form_cut'), ('cuisine');

insert into public.food_taxonomy_nodes (node_code, namespace_code)
values
  ('protein_foods', 'primary_food_group'), ('dairy', 'primary_food_group'),
  ('grains', 'primary_food_group'), ('vegetables', 'primary_food_group'),
  ('fruits', 'primary_food_group'), ('legumes', 'primary_food_group'),
  ('nuts_seeds', 'primary_food_group'), ('fats_oils', 'primary_food_group'),
  ('beverages', 'primary_food_group'), ('mixed_dishes', 'primary_food_group'),
  ('snacks', 'primary_food_group'), ('desserts', 'primary_food_group'),
  ('condiments', 'primary_food_group'), ('other', 'primary_food_group');

create table public.food_taxonomy_assignments (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.food_items(id) on delete restrict,
  node_code text not null references public.food_taxonomy_nodes(node_code) on delete restrict,
  source_record_id uuid,
  assignment_action text not null check (assignment_action in ('assign', 'remove')),
  policy_version text not null check (length(btrim(policy_version)) > 0),
  created_at timestamptz not null default now(),
  foreign key (source_record_id, food_id)
    references public.food_source_records(id, food_id) on delete restrict
);

create trigger food_taxonomy_assignments_immutable
before update or delete on public.food_taxonomy_assignments
for each row execute function private.reject_food_catalog_immutable_fact_mutation();

create table public.market_scopes (
  scope_code text primary key check (scope_code ~ '^[A-Z0-9_]+$'),
  scope_kind text not null check (scope_kind in ('global', 'country', 'region', 'group')),
  lifecycle_status text not null default 'active' check (lifecycle_status in ('active', 'deprecated')),
  created_at timestamptz not null default now()
);

create table public.market_scope_memberships (
  child_scope_code text not null references public.market_scopes(scope_code) on delete restrict,
  parent_scope_code text not null references public.market_scopes(scope_code) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (child_scope_code, parent_scope_code),
  check (child_scope_code <> parent_scope_code)
);

create or replace function private.guard_market_scope_membership_cycles()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if exists (
    with recursive chain(scope_code) as (
      select new.parent_scope_code
      union
      select membership.parent_scope_code
      from public.market_scope_memberships membership
      join chain on membership.child_scope_code = chain.scope_code
    )
    select 1 from chain where scope_code = new.child_scope_code
  ) then
    raise exception 'Market scope membership cannot create a cycle.' using errcode = '23514';
  end if;
  return new;
end
$function$;

create trigger market_scope_memberships_cycle_guard
before insert or update on public.market_scope_memberships
for each row execute function private.guard_market_scope_membership_cycles();

insert into public.market_scopes (scope_code, scope_kind)
values
  ('GLOBAL', 'global'), ('US', 'country'), ('DE', 'country'),
  ('EG', 'country'), ('GB', 'country'), ('SA', 'country'),
  ('AE', 'country'), ('EU', 'region'), ('GCC', 'region');

insert into public.market_scope_memberships (child_scope_code, parent_scope_code)
values ('DE', 'EU'), ('SA', 'GCC'), ('AE', 'GCC');

create table public.food_market_assignments (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.food_items(id) on delete restrict,
  scope_code text not null references public.market_scopes(scope_code) on delete restrict,
  relevance_level text not null check (relevance_level in ('primary', 'secondary')),
  source_record_id uuid,
  assignment_action text not null check (assignment_action in ('assign', 'remove')),
  policy_version text not null check (length(btrim(policy_version)) > 0),
  created_at timestamptz not null default now(),
  foreign key (source_record_id, food_id)
    references public.food_source_records(id, food_id) on delete restrict
);

create trigger food_market_assignments_immutable
before update or delete on public.food_market_assignments
for each row execute function private.reject_food_catalog_immutable_fact_mutation();

create table public.food_verification_assertions (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.food_items(id) on delete restrict,
  assertion_scope text not null check (assertion_scope in ('identity', 'nutrition', 'serving', 'barcode', 'localization')),
  assertion_state text not null check (assertion_state in ('verified', 'revoked')),
  policy_version text not null check (length(btrim(policy_version)) > 0),
  source_record_id uuid,
  supersedes_assertion_id uuid references public.food_verification_assertions(id) on delete restrict,
  reason_code text not null check (length(btrim(reason_code)) > 0),
  authority_reference text not null check (length(btrim(authority_reference)) > 0),
  created_at timestamptz not null default now(),
  foreign key (source_record_id, food_id)
    references public.food_source_records(id, food_id) on delete restrict,
  check (supersedes_assertion_id is null or supersedes_assertion_id <> id)
);

create or replace function private.guard_food_verification_assertion_supersession()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  previous_food_id uuid;
  previous_scope text;
begin
  if new.supersedes_assertion_id is null then
    return new;
  end if;

  select assertion.food_id, assertion.assertion_scope
    into previous_food_id, previous_scope
  from public.food_verification_assertions assertion
  where assertion.id = new.supersedes_assertion_id;

  if found and (previous_food_id <> new.food_id or previous_scope <> new.assertion_scope) then
    raise exception 'Food verification assertion may supersede only the same Food and scope.' using errcode = '23514';
  end if;

  return new;
end
$function$;

create trigger food_verification_assertions_supersession_guard
before insert on public.food_verification_assertions
for each row execute function private.guard_food_verification_assertion_supersession();

create trigger food_verification_assertions_immutable
before update or delete on public.food_verification_assertions
for each row execute function private.reject_food_catalog_immutable_fact_mutation();

create table public.food_merge_events (
  id uuid primary key default gen_random_uuid(),
  source_food_id uuid not null references public.food_items(id) on delete restrict,
  target_food_id uuid not null references public.food_items(id) on delete restrict,
  policy_version text not null check (length(btrim(policy_version)) > 0),
  reason_code text not null check (length(btrim(reason_code)) > 0),
  evidence_reference text,
  authority_reference text not null check (length(btrim(authority_reference)) > 0),
  created_at timestamptz not null default now(),
  check (source_food_id <> target_food_id)
);

create or replace function private.guard_food_merge_event_target()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  target_lifecycle text;
  target_redirect uuid;
begin
  select food.lifecycle_status, food.merged_into_food_id
    into target_lifecycle, target_redirect
  from public.food_items food
  where food.id = new.target_food_id;

  if found and (target_lifecycle = 'merged' or target_redirect is not null) then
    raise exception 'Food merge target must be a current canonical survivor.' using errcode = '23514';
  end if;

  return new;
end
$function$;

create trigger food_merge_events_target_guard
before insert on public.food_merge_events
for each row execute function private.guard_food_merge_event_target();

create trigger food_merge_events_immutable
before update or delete on public.food_merge_events
for each row execute function private.reject_food_catalog_immutable_fact_mutation();

create index food_verification_assertions_food_scope_idx
  on public.food_verification_assertions(food_id, assertion_scope, created_at desc, id);
create index food_merge_events_source_idx
  on public.food_merge_events(source_food_id, created_at desc, id);
create index food_merge_events_target_idx
  on public.food_merge_events(target_food_id, created_at desc, id);

alter table public.food_nutrition_revisions enable row level security;
alter table public.food_serving_options enable row level security;
alter table public.food_names enable row level security;
alter table public.food_taxonomy_namespaces enable row level security;
alter table public.food_taxonomy_nodes enable row level security;
alter table public.food_taxonomy_assignments enable row level security;
alter table public.market_scopes enable row level security;
alter table public.market_scope_memberships enable row level security;
alter table public.food_market_assignments enable row level security;
alter table public.food_verification_assertions enable row level security;
alter table public.food_merge_events enable row level security;

revoke all on public.food_nutrition_revisions from anon, authenticated;
revoke all on public.food_serving_options from anon, authenticated;
revoke all on public.food_names from anon, authenticated;
revoke all on public.food_taxonomy_namespaces from anon, authenticated;
revoke all on public.food_taxonomy_nodes from anon, authenticated;
revoke all on public.food_taxonomy_assignments from anon, authenticated;
revoke all on public.market_scopes from anon, authenticated;
revoke all on public.market_scope_memberships from anon, authenticated;
revoke all on public.food_market_assignments from anon, authenticated;
revoke all on public.food_verification_assertions from anon, authenticated;
revoke all on public.food_merge_events from anon, authenticated;

grant all privileges on public.food_nutrition_revisions to service_role;
grant all privileges on public.food_serving_options to service_role;
grant all privileges on public.food_names to service_role;
grant all privileges on public.food_taxonomy_namespaces to service_role;
grant all privileges on public.food_taxonomy_nodes to service_role;
grant all privileges on public.food_taxonomy_assignments to service_role;
grant all privileges on public.market_scopes to service_role;
grant all privileges on public.market_scope_memberships to service_role;
grant all privileges on public.food_market_assignments to service_role;
grant all privileges on public.food_verification_assertions to service_role;
grant all privileges on public.food_merge_events to service_role;

commit;
