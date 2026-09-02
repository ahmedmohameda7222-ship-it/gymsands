begin;

-- Food Catalog Intelligence Plan 3: additive generation authority only.
-- Repository migration only until separately authorized for Production apply.
-- No Food population, activation execution, generation promotion, runtime cutover,
-- release-compatibility update, or Activity Catalog mutation is performed here.

alter table public.food_nutrition_revisions
  add constraint food_nutrition_revisions_id_food_key unique (id, food_id);
alter table public.food_serving_options
  add constraint food_serving_options_id_food_key unique (id, food_id);
alter table public.food_names
  add constraint food_names_id_food_key unique (id, food_id);
alter table public.food_taxonomy_assignments
  add constraint food_taxonomy_assignments_id_food_key unique (id, food_id);
alter table public.food_market_assignments
  add constraint food_market_assignments_id_food_key unique (id, food_id);
alter table public.food_verification_assertions
  add constraint food_verification_assertions_id_food_scope_key
  unique (id, food_id, assertion_scope);
alter table public.food_verification_assertions
  add constraint food_verification_assertions_supersedes_once_key
  unique (supersedes_assertion_id);

create table public.food_catalog_control_operations (
  operation_id uuid primary key,
  operation_kind text not null check (operation_kind in (
    'create_activation_set', 'grant_activation_set', 'invalidate_activation_grant',
    'create_generation', 'record_generation_validation', 'promote_generation',
    'rollback_generation', 'revoke_generation'
  )),
  command_checksum_sha256 text not null check (command_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  result_json jsonb not null,
  created_at timestamptz not null default now()
);

create table public.food_catalog_activation_sets (
  id uuid primary key,
  manifest_schema_version text not null check (length(btrim(manifest_schema_version)) > 0),
  activation_policy_version text not null check (length(btrim(activation_policy_version)) > 0),
  manifest_checksum_sha256 text not null check (manifest_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  principal_id text not null check (length(btrim(principal_id)) > 0),
  principal_type text not null check (principal_type in ('human', 'service')),
  authority_reference text not null check (length(btrim(authority_reference)) > 0),
  reason_code text not null check (length(btrim(reason_code)) > 0),
  policy_version text not null check (length(btrim(policy_version)) > 0),
  created_at timestamptz not null default now()
);

create table public.food_catalog_activation_set_members (
  id uuid primary key,
  activation_set_id uuid not null references public.food_catalog_activation_sets(id) on delete restrict,
  food_id uuid not null references public.food_items(id) on delete restrict,
  expected_precondition_lifecycle text not null check (
    expected_precondition_lifecycle in ('draft', 'active', 'deprecated', 'withdrawn')
  ),
  evidence_reference text not null check (length(btrim(evidence_reference)) > 0),
  evidence_checksum_sha256 text not null check (evidence_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  source_legal_accepted boolean not null,
  identity_resolved boolean not null,
  nutrition_basis_valid boolean not null,
  display_identity_valid boolean not null,
  blocking_condition_count integer not null check (blocking_condition_count >= 0),
  eligibility text not null check (eligibility in ('eligible', 'rejected')),
  member_checksum_sha256 text not null check (member_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (activation_set_id, food_id),
  unique (id, activation_set_id, food_id)
);

create table public.food_catalog_activation_events (
  id uuid primary key,
  activation_set_id uuid not null references public.food_catalog_activation_sets(id) on delete restrict,
  event_type text not null check (event_type in ('created', 'grant', 'invalidate')),
  target_grant_event_id uuid,
  operation_id uuid not null references public.food_catalog_control_operations(operation_id) on delete restrict,
  command_checksum_sha256 text not null check (command_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  principal_id text not null check (length(btrim(principal_id)) > 0),
  principal_type text not null check (principal_type in ('human', 'service')),
  authority_reference text not null check (length(btrim(authority_reference)) > 0),
  reason_code text not null check (length(btrim(reason_code)) > 0),
  policy_version text not null check (length(btrim(policy_version)) > 0),
  created_at timestamptz not null default now(),
  unique (id, activation_set_id),
  check (
    (event_type = 'invalidate' and target_grant_event_id is not null)
    or (event_type <> 'invalidate' and target_grant_event_id is null)
  ),
  foreign key (target_grant_event_id, activation_set_id)
    references public.food_catalog_activation_events(id, activation_set_id) on delete restrict
);

create unique index food_catalog_activation_events_one_invalidation_per_grant
  on public.food_catalog_activation_events(target_grant_event_id)
  where event_type = 'invalidate';

create or replace function private.guard_food_catalog_activation_event()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  target_type text;
  target_created_at timestamptz;
begin
  if new.event_type <> 'invalidate' then
    return new;
  end if;

  select event_type, created_at
    into target_type, target_created_at
  from public.food_catalog_activation_events
  where id = new.target_grant_event_id
    and activation_set_id = new.activation_set_id;

  if not found or target_type <> 'grant' then
    raise exception 'Food Catalog activation invalidation must target an exact prior grant.' using errcode = '23514';
  end if;
  if target_created_at > new.created_at then
    raise exception 'Food Catalog activation invalidation cannot precede its grant.' using errcode = '23514';
  end if;

  return new;
end
$function$;

create trigger food_catalog_activation_events_target_guard
before insert on public.food_catalog_activation_events
for each row execute function private.guard_food_catalog_activation_event();

create table public.food_catalog_generations (
  id uuid primary key,
  base_generation_id uuid references public.food_catalog_generations(id) on delete restrict,
  generation_ordinal bigint check (generation_ordinal is null or generation_ordinal > 0),
  composition_schema_version text not null check (length(btrim(composition_schema_version)) > 0),
  generation_policy_version text not null check (length(btrim(generation_policy_version)) > 0),
  activation_policy_version text not null check (length(btrim(activation_policy_version)) > 0),
  trust_policy_version text not null check (length(btrim(trust_policy_version)) > 0),
  projection_version text not null check (length(btrim(projection_version)) > 0),
  change_manifest_checksum_sha256 text not null check (change_manifest_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  composition_checksum_sha256 text not null check (composition_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  authority_reference text not null check (length(btrim(authority_reference)) > 0),
  created_at timestamptz not null default now(),
  sealed_at timestamptz not null default now(),
  check (base_generation_id is null or base_generation_id <> id)
);

create table public.food_catalog_generation_foods (
  generation_id uuid not null references public.food_catalog_generations(id) on delete restrict,
  food_id uuid not null references public.food_items(id) on delete restrict,
  lifecycle text not null check (lifecycle in ('active', 'deprecated', 'withdrawn')),
  nutrition_revision_id uuid,
  activation_set_id uuid,
  activation_set_member_id uuid,
  activation_grant_event_id uuid,
  primary key (generation_id, food_id),
  foreign key (nutrition_revision_id, food_id)
    references public.food_nutrition_revisions(id, food_id) on delete restrict,
  constraint food_catalog_generation_foods_activation_member_same_food_fkey
    foreign key (activation_set_member_id, activation_set_id, food_id)
    references public.food_catalog_activation_set_members(id, activation_set_id, food_id) on delete restrict,
  constraint food_catalog_generation_foods_activation_grant_same_set_fkey
    foreign key (activation_grant_event_id, activation_set_id)
    references public.food_catalog_activation_events(id, activation_set_id) on delete restrict,
  check (
    (lifecycle = 'active'
      and activation_set_id is not null
      and activation_set_member_id is not null
      and activation_grant_event_id is not null)
    or
    (lifecycle in ('deprecated', 'withdrawn')
      and activation_set_id is null
      and activation_set_member_id is null
      and activation_grant_event_id is null)
  )
);

create table public.food_catalog_generation_servings (
  generation_id uuid not null,
  food_id uuid not null,
  serving_option_id uuid not null,
  primary key (generation_id, food_id, serving_option_id),
  foreign key (generation_id, food_id)
    references public.food_catalog_generation_foods(generation_id, food_id) on delete restrict,
  constraint food_catalog_generation_servings_same_food_fkey
    foreign key (serving_option_id, food_id)
    references public.food_serving_options(id, food_id) on delete restrict
);

create table public.food_catalog_generation_names (
  generation_id uuid not null,
  food_id uuid not null,
  name_fact_id uuid not null,
  primary key (generation_id, food_id, name_fact_id),
  foreign key (generation_id, food_id)
    references public.food_catalog_generation_foods(generation_id, food_id) on delete restrict,
  constraint food_catalog_generation_names_same_food_fkey
    foreign key (name_fact_id, food_id)
    references public.food_names(id, food_id) on delete restrict
);

create table public.food_catalog_generation_taxonomy (
  generation_id uuid not null,
  food_id uuid not null,
  taxonomy_assignment_id uuid not null,
  primary key (generation_id, food_id, taxonomy_assignment_id),
  foreign key (generation_id, food_id)
    references public.food_catalog_generation_foods(generation_id, food_id) on delete restrict,
  constraint food_catalog_generation_taxonomy_same_food_fkey
    foreign key (taxonomy_assignment_id, food_id)
    references public.food_taxonomy_assignments(id, food_id) on delete restrict
);

create table public.food_catalog_generation_markets (
  generation_id uuid not null,
  food_id uuid not null,
  market_assignment_id uuid not null,
  primary key (generation_id, food_id, market_assignment_id),
  foreign key (generation_id, food_id)
    references public.food_catalog_generation_foods(generation_id, food_id) on delete restrict,
  constraint food_catalog_generation_markets_same_food_fkey
    foreign key (market_assignment_id, food_id)
    references public.food_market_assignments(id, food_id) on delete restrict
);

create table public.food_catalog_generation_verification (
  generation_id uuid not null,
  food_id uuid not null,
  assertion_scope text not null check (
    assertion_scope in ('identity', 'nutrition', 'serving', 'barcode', 'localization')
  ),
  assertion_id uuid not null,
  primary key (generation_id, food_id, assertion_scope),
  foreign key (generation_id, food_id)
    references public.food_catalog_generation_foods(generation_id, food_id) on delete restrict,
  constraint food_catalog_generation_verification_same_food_fkey
    foreign key (assertion_id, food_id, assertion_scope)
    references public.food_verification_assertions(id, food_id, assertion_scope) on delete restrict
);

create or replace function private.guard_food_catalog_generation_taxonomy_assignment()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if not exists (
    select 1
    from public.food_taxonomy_assignments assignment
    where assignment.id = new.taxonomy_assignment_id
      and assignment.food_id = new.food_id
      and assignment.assignment_action = 'assign'
  ) then
    raise exception 'Generation taxonomy selection must reference an assign fact for the same Food.' using errcode = '23514';
  end if;
  return new;
end
$function$;

create trigger food_catalog_generation_taxonomy_action_guard
before insert on public.food_catalog_generation_taxonomy
for each row execute function private.guard_food_catalog_generation_taxonomy_assignment();

create or replace function private.guard_food_catalog_generation_market_assignment()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if not exists (
    select 1
    from public.food_market_assignments assignment
    where assignment.id = new.market_assignment_id
      and assignment.food_id = new.food_id
      and assignment.assignment_action = 'assign'
  ) then
    raise exception 'Generation market selection must reference an assign fact for the same Food.' using errcode = '23514';
  end if;
  return new;
end
$function$;

create trigger food_catalog_generation_markets_action_guard
before insert on public.food_catalog_generation_markets
for each row execute function private.guard_food_catalog_generation_market_assignment();

create table public.food_catalog_generation_redirects (
  generation_id uuid not null references public.food_catalog_generations(id) on delete restrict,
  source_food_id uuid not null references public.food_items(id) on delete restrict,
  target_food_id uuid not null,
  primary key (generation_id, source_food_id),
  foreign key (generation_id, target_food_id)
    references public.food_catalog_generation_foods(generation_id, food_id) on delete restrict,
  check (source_food_id <> target_food_id)
);

create or replace function private.guard_food_catalog_generation_redirect_set()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  target_lifecycle text;
begin
  select lifecycle
    into target_lifecycle
  from public.food_catalog_generation_foods
  where generation_id = new.generation_id
    and food_id = new.target_food_id;

  if not found or target_lifecycle <> 'active' then
    raise exception 'Generation redirect target must be an active generation survivor.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.food_catalog_generation_redirects redirect
    where redirect.generation_id = new.generation_id
      and redirect.source_food_id = new.target_food_id
  ) then
    raise exception 'Generation redirects must be flattened directly to the active survivor.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.food_catalog_generation_foods food
    where food.generation_id = new.generation_id
      and food.food_id = new.source_food_id
  ) then
    raise exception 'Generation redirect source cannot also be a generation Food row.' using errcode = '23514';
  end if;

  return new;
end
$function$;

create constraint trigger food_catalog_generation_redirects_set_integrity
after insert on public.food_catalog_generation_redirects
deferrable initially deferred
for each row execute function private.guard_food_catalog_generation_redirect_set();

create table public.food_catalog_generation_validation_reports (
  id uuid primary key,
  generation_id uuid not null references public.food_catalog_generations(id) on delete restrict,
  generation_checksum_sha256 text not null check (generation_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  validator_set_version text not null check (length(btrim(validator_set_version)) > 0),
  policy_version text not null check (length(btrim(policy_version)) > 0),
  report_checksum_sha256 text not null check (report_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  blocker_count integer not null check (blocker_count >= 0),
  error_count integer not null check (error_count >= 0),
  warning_count integer not null check (warning_count >= 0),
  info_count integer not null check (info_count >= 0),
  created_at timestamptz not null default now(),
  unique (id, generation_id),
  unique (id, generation_id, generation_checksum_sha256)
);

create table public.food_catalog_generation_validation_findings (
  id uuid primary key,
  report_id uuid not null references public.food_catalog_generation_validation_reports(id) on delete restrict,
  finding_ordinal integer not null check (finding_ordinal > 0),
  reason_code text not null check (length(btrim(reason_code)) > 0),
  food_id uuid references public.food_items(id) on delete restrict,
  severity text not null check (severity in ('info', 'warning', 'error')),
  blocking boolean not null,
  evidence_reference text,
  validator_policy_version text not null check (length(btrim(validator_policy_version)) > 0),
  details jsonb not null,
  created_at timestamptz not null default now(),
  unique (report_id, finding_ordinal)
);

create table public.food_catalog_generation_events (
  id uuid primary key,
  event_type text not null check (event_type in ('created', 'validated', 'promote', 'rollback', 'revoke')),
  operation_id uuid not null references public.food_catalog_control_operations(operation_id) on delete restrict,
  command_checksum_sha256 text not null check (command_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  from_generation_id uuid references public.food_catalog_generations(id) on delete restrict,
  to_generation_id uuid references public.food_catalog_generations(id) on delete restrict,
  revoked_generation_id uuid references public.food_catalog_generations(id) on delete restrict,
  generation_checksum_sha256 text check (
    generation_checksum_sha256 is null or generation_checksum_sha256 ~ '^[0-9a-f]{64}$'
  ),
  validation_report_id uuid references public.food_catalog_generation_validation_reports(id) on delete restrict,
  principal_id text not null check (length(btrim(principal_id)) > 0),
  principal_type text not null check (principal_type in ('human', 'service')),
  authority_reference text not null check (length(btrim(authority_reference)) > 0),
  reason_code text not null check (length(btrim(reason_code)) > 0),
  policy_version text not null check (length(btrim(policy_version)) > 0),
  created_at timestamptz not null default now(),
  check (from_generation_id is null or from_generation_id <> to_generation_id)
);

create table public.food_catalog_current_generation (
  singleton_key boolean primary key default true check (singleton_key),
  current_generation_id uuid references public.food_catalog_generations(id) on delete restrict,
  current_event_id uuid references public.food_catalog_generation_events(id) on delete restrict,
  current_validation_report_id uuid references public.food_catalog_generation_validation_reports(id) on delete restrict,
  pointer_revision bigint not null default 0 check (pointer_revision >= 0),
  updated_at timestamptz not null default now(),
  check (
    (current_generation_id is null and current_event_id is null and current_validation_report_id is null)
    or
    (current_generation_id is not null and current_event_id is not null and current_validation_report_id is not null)
  )
);

insert into public.food_catalog_current_generation (
  singleton_key, current_generation_id, current_event_id, current_validation_report_id, pointer_revision
) values (true, null, null, null, 0);

create trigger food_catalog_control_operations_immutable
before update or delete on public.food_catalog_control_operations
for each row execute function private.reject_food_catalog_immutable_fact_mutation();
create trigger food_catalog_activation_sets_immutable
before update or delete on public.food_catalog_activation_sets
for each row execute function private.reject_food_catalog_immutable_fact_mutation();
create trigger food_catalog_activation_set_members_immutable
before update or delete on public.food_catalog_activation_set_members
for each row execute function private.reject_food_catalog_immutable_fact_mutation();
create trigger food_catalog_activation_events_immutable
before update or delete on public.food_catalog_activation_events
for each row execute function private.reject_food_catalog_immutable_fact_mutation();
create trigger food_catalog_generations_immutable
before update or delete on public.food_catalog_generations
for each row execute function private.reject_food_catalog_immutable_fact_mutation();
create trigger food_catalog_generation_foods_immutable
before update or delete on public.food_catalog_generation_foods
for each row execute function private.reject_food_catalog_immutable_fact_mutation();
create trigger food_catalog_generation_servings_immutable
before update or delete on public.food_catalog_generation_servings
for each row execute function private.reject_food_catalog_immutable_fact_mutation();
create trigger food_catalog_generation_names_immutable
before update or delete on public.food_catalog_generation_names
for each row execute function private.reject_food_catalog_immutable_fact_mutation();
create trigger food_catalog_generation_taxonomy_immutable
before update or delete on public.food_catalog_generation_taxonomy
for each row execute function private.reject_food_catalog_immutable_fact_mutation();
create trigger food_catalog_generation_markets_immutable
before update or delete on public.food_catalog_generation_markets
for each row execute function private.reject_food_catalog_immutable_fact_mutation();
create trigger food_catalog_generation_verification_immutable
before update or delete on public.food_catalog_generation_verification
for each row execute function private.reject_food_catalog_immutable_fact_mutation();
create trigger food_catalog_generation_redirects_immutable
before update or delete on public.food_catalog_generation_redirects
for each row execute function private.reject_food_catalog_immutable_fact_mutation();
create trigger food_catalog_generation_validation_reports_immutable
before update or delete on public.food_catalog_generation_validation_reports
for each row execute function private.reject_food_catalog_immutable_fact_mutation();
create trigger food_catalog_generation_validation_findings_immutable
before update or delete on public.food_catalog_generation_validation_findings
for each row execute function private.reject_food_catalog_immutable_fact_mutation();
create trigger food_catalog_generation_events_immutable
before update or delete on public.food_catalog_generation_events
for each row execute function private.reject_food_catalog_immutable_fact_mutation();

alter table public.food_catalog_control_operations enable row level security;
alter table public.food_catalog_activation_sets enable row level security;
alter table public.food_catalog_activation_set_members enable row level security;
alter table public.food_catalog_activation_events enable row level security;
alter table public.food_catalog_generations enable row level security;
alter table public.food_catalog_generation_foods enable row level security;
alter table public.food_catalog_generation_servings enable row level security;
alter table public.food_catalog_generation_names enable row level security;
alter table public.food_catalog_generation_taxonomy enable row level security;
alter table public.food_catalog_generation_markets enable row level security;
alter table public.food_catalog_generation_verification enable row level security;
alter table public.food_catalog_generation_redirects enable row level security;
alter table public.food_catalog_generation_validation_reports enable row level security;
alter table public.food_catalog_generation_validation_findings enable row level security;
alter table public.food_catalog_generation_events enable row level security;
alter table public.food_catalog_current_generation enable row level security;

revoke all on public.food_catalog_control_operations from anon, authenticated;
revoke all on public.food_catalog_activation_sets from anon, authenticated;
revoke all on public.food_catalog_activation_set_members from anon, authenticated;
revoke all on public.food_catalog_activation_events from anon, authenticated;
revoke all on public.food_catalog_generations from anon, authenticated;
revoke all on public.food_catalog_generation_foods from anon, authenticated;
revoke all on public.food_catalog_generation_servings from anon, authenticated;
revoke all on public.food_catalog_generation_names from anon, authenticated;
revoke all on public.food_catalog_generation_taxonomy from anon, authenticated;
revoke all on public.food_catalog_generation_markets from anon, authenticated;
revoke all on public.food_catalog_generation_verification from anon, authenticated;
revoke all on public.food_catalog_generation_redirects from anon, authenticated;
revoke all on public.food_catalog_generation_validation_reports from anon, authenticated;
revoke all on public.food_catalog_generation_validation_findings from anon, authenticated;
revoke all on public.food_catalog_generation_events from anon, authenticated;
revoke all on public.food_catalog_current_generation from anon, authenticated;

grant select on public.food_catalog_control_operations to service_role;
grant select on public.food_catalog_activation_sets to service_role;
grant select on public.food_catalog_activation_set_members to service_role;
grant select on public.food_catalog_activation_events to service_role;
grant select on public.food_catalog_generations to service_role;
grant select on public.food_catalog_generation_foods to service_role;
grant select on public.food_catalog_generation_servings to service_role;
grant select on public.food_catalog_generation_names to service_role;
grant select on public.food_catalog_generation_taxonomy to service_role;
grant select on public.food_catalog_generation_markets to service_role;
grant select on public.food_catalog_generation_verification to service_role;
grant select on public.food_catalog_generation_redirects to service_role;
grant select on public.food_catalog_generation_validation_reports to service_role;
grant select on public.food_catalog_generation_validation_findings to service_role;
grant select on public.food_catalog_generation_events to service_role;
grant select on public.food_catalog_current_generation to service_role;

commit;
