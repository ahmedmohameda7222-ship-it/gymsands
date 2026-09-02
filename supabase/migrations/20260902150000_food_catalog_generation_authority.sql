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

create or replace function private.food_catalog_plan3_command_fingerprint_v1(p_command jsonb)
returns text
language sql
immutable
strict
set search_path = ''
as $function$
  select encode(
    extensions.digest(
      pg_catalog.convert_to(
        (p_command - 'operation_id' - 'command_checksum_sha256' - 'event_id')::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$function$;

create or replace function public.food_catalog_create_activation_set_v1(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  p_operation_id uuid := (p_command->>'operation_id')::uuid;
  v_caller_checksum text := p_command->>'command_checksum_sha256';
  v_command_checksum text := private.food_catalog_plan3_command_fingerprint_v1(p_command);
  v_existing_kind text;
  v_existing_checksum text;
  v_existing_result jsonb;
  v_activation_set_id uuid := (p_command->>'activation_set_id')::uuid;
  v_event_id uuid := coalesce(nullif(p_command->>'event_id', '')::uuid, gen_random_uuid());
  v_actor jsonb := p_command->'actor';
  v_member jsonb;
  v_result jsonb;
begin
  if p_operation_id is null or v_caller_checksum !~ '^[0-9a-f]{64}$' then
    raise exception 'CONTROL_PLANE_REJECTED: valid operation_id and command checksum are required.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));
  select operation_kind, command_checksum_sha256, result_json
    into v_existing_kind, v_existing_checksum, v_existing_result
  from public.food_catalog_control_operations
  where operation_id = p_operation_id;
  if found then
    if v_existing_kind = 'create_activation_set' and v_existing_checksum = v_command_checksum then
      return v_existing_result;
    end if;
    raise exception 'OPERATION_ID_CONFLICT: operation_id already belongs to another semantic command.';
  end if;

  if jsonb_typeof(v_actor) <> 'object'
     or nullif(btrim(v_actor->>'principal_id'), '') is null
     or coalesce(v_actor->>'principal_type', '') not in ('human', 'service')
     or nullif(btrim(v_actor->>'authority_reference'), '') is null
     or nullif(btrim(v_actor->>'reason_code'), '') is null
     or nullif(btrim(v_actor->>'policy_version'), '') is null then
    raise exception 'CONTROL_PLANE_REJECTED: complete actor context is required.';
  end if;
  if jsonb_typeof(p_command->'members') <> 'array' or jsonb_array_length(p_command->'members') = 0 then
    raise exception 'CONTROL_PLANE_REJECTED: activation set requires a non-empty members array.';
  end if;

  insert into public.food_catalog_activation_sets (
    id, manifest_schema_version, activation_policy_version, manifest_checksum_sha256,
    principal_id, principal_type, authority_reference, reason_code, policy_version
  ) values (
    v_activation_set_id,
    p_command->>'manifest_schema_version',
    p_command->>'activation_policy_version',
    p_command->>'manifest_checksum_sha256',
    v_actor->>'principal_id',
    v_actor->>'principal_type',
    v_actor->>'authority_reference',
    v_actor->>'reason_code',
    v_actor->>'policy_version'
  );

  for v_member in select value from jsonb_array_elements(p_command->'members') loop
    insert into public.food_catalog_activation_set_members (
      id, activation_set_id, food_id, expected_precondition_lifecycle,
      evidence_reference, evidence_checksum_sha256, source_legal_accepted,
      identity_resolved, nutrition_basis_valid, display_identity_valid,
      blocking_condition_count, eligibility, member_checksum_sha256
    ) values (
      (v_member->>'id')::uuid,
      v_activation_set_id,
      (v_member->>'food_id')::uuid,
      v_member->>'expected_precondition_lifecycle',
      v_member->>'evidence_reference',
      v_member->>'evidence_checksum_sha256',
      (v_member->>'source_legal_accepted')::boolean,
      (v_member->>'identity_resolved')::boolean,
      (v_member->>'nutrition_basis_valid')::boolean,
      (v_member->>'display_identity_valid')::boolean,
      (v_member->>'blocking_condition_count')::integer,
      v_member->>'eligibility',
      v_member->>'member_checksum_sha256'
    );
  end loop;

  v_result := jsonb_build_object(
    'operation_id', p_operation_id,
    'event_id', v_event_id,
    'activation_set_id', v_activation_set_id,
    'generation_id', null,
    'validation_report_id', null,
    'pointer_revision', null
  );
  insert into public.food_catalog_control_operations (
    operation_id, operation_kind, command_checksum_sha256, result_json
  ) values (p_operation_id, 'create_activation_set', v_command_checksum, v_result);
  insert into public.food_catalog_activation_events (
    id, activation_set_id, event_type, target_grant_event_id,
    operation_id, command_checksum_sha256, principal_id, principal_type,
    authority_reference, reason_code, policy_version
  ) values (
    v_event_id, v_activation_set_id, 'created', null,
    p_operation_id, v_command_checksum, v_actor->>'principal_id', v_actor->>'principal_type',
    v_actor->>'authority_reference', v_actor->>'reason_code', v_actor->>'policy_version'
  );
  return v_result;
end
$function$;

create or replace function public.food_catalog_grant_activation_set_v1(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  p_operation_id uuid := (p_command->>'operation_id')::uuid;
  v_caller_checksum text := p_command->>'command_checksum_sha256';
  v_command_checksum text := private.food_catalog_plan3_command_fingerprint_v1(p_command);
  v_existing_kind text;
  v_existing_checksum text;
  v_existing_result jsonb;
  v_activation_set_id uuid := (p_command->>'activation_set_id')::uuid;
  v_event_id uuid := coalesce(nullif(p_command->>'event_id', '')::uuid, gen_random_uuid());
  v_actor jsonb := p_command->'actor';
  v_total integer;
  v_eligible integer;
  v_precondition integer;
  v_result jsonb;
begin
  if p_operation_id is null or v_caller_checksum !~ '^[0-9a-f]{64}$' then
    raise exception 'CONTROL_PLANE_REJECTED: valid operation_id and command checksum are required.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));
  select operation_kind, command_checksum_sha256, result_json
    into v_existing_kind, v_existing_checksum, v_existing_result
  from public.food_catalog_control_operations where operation_id = p_operation_id;
  if found then
    if v_existing_kind = 'grant_activation_set' and v_existing_checksum = v_command_checksum then
      return v_existing_result;
    end if;
    raise exception 'OPERATION_ID_CONFLICT: operation_id already belongs to another semantic command.';
  end if;
  if jsonb_typeof(v_actor) <> 'object'
     or nullif(btrim(v_actor->>'principal_id'), '') is null
     or coalesce(v_actor->>'principal_type', '') not in ('human', 'service')
     or nullif(btrim(v_actor->>'authority_reference'), '') is null
     or nullif(btrim(v_actor->>'reason_code'), '') is null
     or nullif(btrim(v_actor->>'policy_version'), '') is null then
    raise exception 'CONTROL_PLANE_REJECTED: complete actor context is required.';
  end if;
  if not exists (select 1 from public.food_catalog_activation_sets where id = v_activation_set_id) then
    raise exception 'INVALID_ACTIVATION_GRANT: activation set does not exist.';
  end if;

  select count(*)::integer,
         count(*) filter (where m.eligibility = 'eligible')::integer,
         count(*) filter (where f.lifecycle_status::text = m.expected_precondition_lifecycle)::integer
    into v_total, v_eligible, v_precondition
  from public.food_catalog_activation_set_members m
  join public.food_items f on f.id = m.food_id
  where m.activation_set_id = v_activation_set_id;
  if v_total = 0 or v_eligible <> v_total or v_precondition <> v_total then
    raise exception 'INVALID_ACTIVATION_GRANT: every member must be eligible and satisfy its exact precondition.';
  end if;

  v_result := jsonb_build_object(
    'operation_id', p_operation_id,
    'event_id', v_event_id,
    'activation_set_id', v_activation_set_id,
    'generation_id', null,
    'validation_report_id', null,
    'pointer_revision', null
  );
  insert into public.food_catalog_control_operations (
    operation_id, operation_kind, command_checksum_sha256, result_json
  ) values (p_operation_id, 'grant_activation_set', v_command_checksum, v_result);
  insert into public.food_catalog_activation_events (
    id, activation_set_id, event_type, target_grant_event_id,
    operation_id, command_checksum_sha256, principal_id, principal_type,
    authority_reference, reason_code, policy_version
  ) values (
    v_event_id, v_activation_set_id, 'grant', null,
    p_operation_id, v_command_checksum, v_actor->>'principal_id', v_actor->>'principal_type',
    v_actor->>'authority_reference', v_actor->>'reason_code', v_actor->>'policy_version'
  );
  return v_result;
end
$function$;

create or replace function public.food_catalog_invalidate_activation_grant_v1(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  p_operation_id uuid := (p_command->>'operation_id')::uuid;
  v_caller_checksum text := p_command->>'command_checksum_sha256';
  v_command_checksum text := private.food_catalog_plan3_command_fingerprint_v1(p_command);
  v_existing_kind text;
  v_existing_checksum text;
  v_existing_result jsonb;
  v_activation_set_id uuid := (p_command->>'activation_set_id')::uuid;
  v_event_id uuid := coalesce(nullif(p_command->>'event_id', '')::uuid, gen_random_uuid());
  v_target_grant_event_id uuid := (p_command->>'target_grant_event_id')::uuid;
  v_actor jsonb := p_command->'actor';
  v_result jsonb;
begin
  if p_operation_id is null or v_caller_checksum !~ '^[0-9a-f]{64}$' then
    raise exception 'CONTROL_PLANE_REJECTED: valid operation_id and command checksum are required.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));
  select operation_kind, command_checksum_sha256, result_json
    into v_existing_kind, v_existing_checksum, v_existing_result
  from public.food_catalog_control_operations where operation_id = p_operation_id;
  if found then
    if v_existing_kind = 'invalidate_activation_grant' and v_existing_checksum = v_command_checksum then
      return v_existing_result;
    end if;
    raise exception 'OPERATION_ID_CONFLICT: operation_id already belongs to another semantic command.';
  end if;
  if jsonb_typeof(v_actor) <> 'object'
     or nullif(btrim(v_actor->>'principal_id'), '') is null
     or coalesce(v_actor->>'principal_type', '') not in ('human', 'service')
     or nullif(btrim(v_actor->>'authority_reference'), '') is null
     or nullif(btrim(v_actor->>'reason_code'), '') is null
     or nullif(btrim(v_actor->>'policy_version'), '') is null then
    raise exception 'CONTROL_PLANE_REJECTED: complete actor context is required.';
  end if;
  if not exists (
    select 1 from public.food_catalog_activation_events
    where id = v_target_grant_event_id
      and activation_set_id = v_activation_set_id
      and event_type = 'grant'
  ) then
    raise exception 'INVALID_ACTIVATION_GRANT: invalidation must name an exact grant in the same activation set.';
  end if;

  v_result := jsonb_build_object(
    'operation_id', p_operation_id,
    'event_id', v_event_id,
    'activation_set_id', v_activation_set_id,
    'target_grant_event_id', v_target_grant_event_id,
    'generation_id', null,
    'validation_report_id', null,
    'pointer_revision', null
  );
  insert into public.food_catalog_control_operations (
    operation_id, operation_kind, command_checksum_sha256, result_json
  ) values (p_operation_id, 'invalidate_activation_grant', v_command_checksum, v_result);
  insert into public.food_catalog_activation_events (
    id, activation_set_id, event_type, target_grant_event_id,
    operation_id, command_checksum_sha256, principal_id, principal_type,
    authority_reference, reason_code, policy_version
  ) values (
    v_event_id, v_activation_set_id, 'invalidate', v_target_grant_event_id,
    p_operation_id, v_command_checksum, v_actor->>'principal_id', v_actor->>'principal_type',
    v_actor->>'authority_reference', v_actor->>'reason_code', v_actor->>'policy_version'
  );
  return v_result;
end
$function$;

create or replace function public.food_catalog_create_generation_v1(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  p_operation_id uuid := (p_command->>'operation_id')::uuid;
  v_caller_checksum text := p_command->>'command_checksum_sha256';
  v_command_checksum text := private.food_catalog_plan3_command_fingerprint_v1(p_command);
  v_existing_kind text;
  v_existing_checksum text;
  v_existing_result jsonb;
  v_generation_id uuid := (p_command->>'generation_id')::uuid;
  v_base_generation_id uuid := nullif(p_command->>'base_generation_id', '')::uuid;
  v_event_id uuid := coalesce(nullif(p_command->>'event_id', '')::uuid, gen_random_uuid());
  v_actor jsonb := p_command->'actor';
  v_sealed_at timestamptz := clock_timestamp();
  v_item jsonb;
  v_activation_set_id uuid;
  v_activation_set_member_id uuid;
  v_activation_grant_event_id uuid;
  v_grant_created_at timestamptz;
  v_result jsonb;
begin
  if p_operation_id is null or v_caller_checksum !~ '^[0-9a-f]{64}$' then
    raise exception 'CONTROL_PLANE_REJECTED: valid operation_id and command checksum are required.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));
  select operation_kind, command_checksum_sha256, result_json
    into v_existing_kind, v_existing_checksum, v_existing_result
  from public.food_catalog_control_operations where operation_id = p_operation_id;
  if found then
    if v_existing_kind = 'create_generation' and v_existing_checksum = v_command_checksum then
      return v_existing_result;
    end if;
    raise exception 'OPERATION_ID_CONFLICT: operation_id already belongs to another semantic command.';
  end if;
  if jsonb_typeof(v_actor) <> 'object'
     or nullif(btrim(v_actor->>'principal_id'), '') is null
     or coalesce(v_actor->>'principal_type', '') not in ('human', 'service')
     or nullif(btrim(v_actor->>'authority_reference'), '') is null
     or nullif(btrim(v_actor->>'reason_code'), '') is null
     or nullif(btrim(v_actor->>'policy_version'), '') is null then
    raise exception 'CONTROL_PLANE_REJECTED: complete actor context is required.';
  end if;
  if v_base_generation_id is not null and not exists (
    select 1 from public.food_catalog_generations where id = v_base_generation_id and sealed_at is not null
  ) then
    raise exception 'GENERATION_NOT_FOUND: explicit base generation does not exist or is not sealed.';
  end if;
  if jsonb_typeof(coalesce(p_command->'foods', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_command->'servings', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_command->'names', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_command->'taxonomy', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_command->'markets', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_command->'verification', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_command->'redirects', '[]'::jsonb)) <> 'array' then
    raise exception 'CONTROL_PLANE_REJECTED: generation selections must be JSON arrays.';
  end if;

  insert into public.food_catalog_generations (
    id, base_generation_id, generation_ordinal,
    composition_schema_version, generation_policy_version, activation_policy_version,
    trust_policy_version, projection_version, change_manifest_checksum_sha256,
    composition_checksum_sha256, authority_reference, sealed_at
  ) values (
    v_generation_id,
    v_base_generation_id,
    nullif(p_command->>'generation_ordinal', '')::bigint,
    p_command->>'composition_schema_version',
    p_command->>'generation_policy_version',
    p_command->>'activation_policy_version',
    p_command->>'trust_policy_version',
    p_command->>'projection_version',
    p_command->>'change_manifest_checksum_sha256',
    p_command->>'composition_checksum_sha256',
    p_command->>'authority_reference',
    v_sealed_at
  );

  for v_item in select value from jsonb_array_elements(coalesce(p_command->'foods', '[]'::jsonb)) loop
    if v_item->>'lifecycle' = 'active' then
      v_activation_set_id := (v_item->>'activation_set_id')::uuid;
      v_activation_set_member_id := (v_item->>'activation_set_member_id')::uuid;
      v_activation_grant_event_id := (v_item->>'activation_grant_event_id')::uuid;

      select e.created_at
        into v_grant_created_at
      from public.food_catalog_activation_set_members m
      join public.food_catalog_activation_sets s on s.id = m.activation_set_id
      join public.food_catalog_activation_events e
        on e.id = v_activation_grant_event_id
       and e.activation_set_id = m.activation_set_id
       and e.event_type = 'grant'
      join public.food_items f on f.id = m.food_id
      where m.id = v_activation_set_member_id
        and m.activation_set_id = v_activation_set_id
        and m.food_id = (v_item->>'food_id')::uuid
        and m.eligibility = 'eligible'
        and s.activation_policy_version = p_command->>'activation_policy_version'
        and f.lifecycle_status::text = m.expected_precondition_lifecycle;
      if not found or v_grant_created_at > v_sealed_at then
        raise exception 'INVALID_ACTIVATION_GRANT: active generation Food lacks exact eligible grant authority.';
      end if;
      if exists (
        select 1 from public.food_catalog_activation_events invalidation
        where invalidation.event_type = 'invalidate'
          and invalidation.target_grant_event_id = v_activation_grant_event_id
          and invalidation.created_at <= v_sealed_at
      ) then
        raise exception 'INVALID_ACTIVATION_GRANT: grant was invalidated before generation sealing.';
      end if;
    end if;

    insert into public.food_catalog_generation_foods (
      generation_id, food_id, lifecycle, nutrition_revision_id,
      activation_set_id, activation_set_member_id, activation_grant_event_id
    ) values (
      v_generation_id,
      (v_item->>'food_id')::uuid,
      v_item->>'lifecycle',
      nullif(v_item->>'nutrition_revision_id', '')::uuid,
      nullif(v_item->>'activation_set_id', '')::uuid,
      nullif(v_item->>'activation_set_member_id', '')::uuid,
      nullif(v_item->>'activation_grant_event_id', '')::uuid
    );
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_command->'servings', '[]'::jsonb)) loop
    insert into public.food_catalog_generation_servings (generation_id, food_id, serving_option_id)
    values (v_generation_id, (v_item->>'food_id')::uuid, (v_item->>'serving_option_id')::uuid);
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(p_command->'names', '[]'::jsonb)) loop
    insert into public.food_catalog_generation_names (generation_id, food_id, name_fact_id)
    values (v_generation_id, (v_item->>'food_id')::uuid, (v_item->>'name_fact_id')::uuid);
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(p_command->'taxonomy', '[]'::jsonb)) loop
    insert into public.food_catalog_generation_taxonomy (generation_id, food_id, taxonomy_assignment_id)
    values (v_generation_id, (v_item->>'food_id')::uuid, (v_item->>'taxonomy_assignment_id')::uuid);
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(p_command->'markets', '[]'::jsonb)) loop
    insert into public.food_catalog_generation_markets (generation_id, food_id, market_assignment_id)
    values (v_generation_id, (v_item->>'food_id')::uuid, (v_item->>'market_assignment_id')::uuid);
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(p_command->'verification', '[]'::jsonb)) loop
    insert into public.food_catalog_generation_verification (
      generation_id, food_id, assertion_scope, assertion_id
    ) values (
      v_generation_id,
      (v_item->>'food_id')::uuid,
      v_item->>'assertion_scope',
      (v_item->>'assertion_id')::uuid
    );
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(p_command->'redirects', '[]'::jsonb)) loop
    insert into public.food_catalog_generation_redirects (generation_id, source_food_id, target_food_id)
    values (
      v_generation_id,
      (v_item->>'source_food_id')::uuid,
      (v_item->>'target_food_id')::uuid
    );
  end loop;

  if exists (
    select 1
    from public.food_catalog_generation_redirects r
    left join public.food_catalog_generation_foods target
      on target.generation_id = r.generation_id and target.food_id = r.target_food_id
    where r.generation_id = v_generation_id
      and (target.lifecycle is distinct from 'active'
        or exists (
          select 1 from public.food_catalog_generation_redirects target_redirect
          where target_redirect.generation_id = r.generation_id
            and target_redirect.source_food_id = r.target_food_id
        )
        or exists (
          select 1 from public.food_catalog_generation_foods source_food
          where source_food.generation_id = r.generation_id
            and source_food.food_id = r.source_food_id
        ))
  ) then
    raise exception 'INVALID_REDIRECT: generation redirects must be direct, flattened, and target active survivors.';
  end if;

  v_result := jsonb_build_object(
    'operation_id', p_operation_id,
    'event_id', v_event_id,
    'generation_id', v_generation_id,
    'generation_checksum_sha256', p_command->>'composition_checksum_sha256',
    'validation_report_id', null,
    'pointer_revision', null
  );
  insert into public.food_catalog_control_operations (
    operation_id, operation_kind, command_checksum_sha256, result_json
  ) values (p_operation_id, 'create_generation', v_command_checksum, v_result);
  insert into public.food_catalog_generation_events (
    id, event_type, operation_id, command_checksum_sha256,
    from_generation_id, to_generation_id, revoked_generation_id,
    generation_checksum_sha256, validation_report_id,
    principal_id, principal_type, authority_reference, reason_code, policy_version
  ) values (
    v_event_id, 'created', p_operation_id, v_command_checksum,
    v_base_generation_id, v_generation_id, null,
    p_command->>'composition_checksum_sha256', null,
    v_actor->>'principal_id', v_actor->>'principal_type', v_actor->>'authority_reference',
    v_actor->>'reason_code', v_actor->>'policy_version'
  );
  return v_result;
end
$function$;

create or replace function public.food_catalog_record_generation_validation_v1(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  p_operation_id uuid := (p_command->>'operation_id')::uuid;
  v_caller_checksum text := p_command->>'command_checksum_sha256';
  v_command_checksum text := private.food_catalog_plan3_command_fingerprint_v1(p_command);
  v_existing_kind text;
  v_existing_checksum text;
  v_existing_result jsonb;
  v_report_id uuid := (p_command->>'report_id')::uuid;
  v_generation_id uuid := (p_command->>'generation_id')::uuid;
  v_event_id uuid := coalesce(nullif(p_command->>'event_id', '')::uuid, gen_random_uuid());
  v_actor jsonb := p_command->'actor';
  v_item jsonb;
  v_blockers integer;
  v_errors integer;
  v_warnings integer;
  v_infos integer;
  v_result jsonb;
begin
  if p_operation_id is null or v_caller_checksum !~ '^[0-9a-f]{64}$' then
    raise exception 'CONTROL_PLANE_REJECTED: valid operation_id and command checksum are required.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));
  select operation_kind, command_checksum_sha256, result_json
    into v_existing_kind, v_existing_checksum, v_existing_result
  from public.food_catalog_control_operations where operation_id = p_operation_id;
  if found then
    if v_existing_kind = 'record_generation_validation' and v_existing_checksum = v_command_checksum then
      return v_existing_result;
    end if;
    raise exception 'OPERATION_ID_CONFLICT: operation_id already belongs to another semantic command.';
  end if;
  if jsonb_typeof(v_actor) <> 'object'
     or nullif(btrim(v_actor->>'principal_id'), '') is null
     or coalesce(v_actor->>'principal_type', '') not in ('human', 'service')
     or nullif(btrim(v_actor->>'authority_reference'), '') is null
     or nullif(btrim(v_actor->>'reason_code'), '') is null
     or nullif(btrim(v_actor->>'policy_version'), '') is null then
    raise exception 'CONTROL_PLANE_REJECTED: complete actor context is required.';
  end if;
  if not exists (
    select 1 from public.food_catalog_generations
    where id = v_generation_id
      and composition_checksum_sha256 = p_command->>'generation_checksum_sha256'
      and sealed_at is not null
  ) then
    raise exception 'GENERATION_CHECKSUM_MISMATCH: validation must bind the exact sealed generation checksum.';
  end if;
  if jsonb_typeof(coalesce(p_command->'findings', '[]'::jsonb)) <> 'array' then
    raise exception 'CONTROL_PLANE_REJECTED: findings must be a JSON array.';
  end if;

  insert into public.food_catalog_generation_validation_reports (
    id, generation_id, generation_checksum_sha256, validator_set_version,
    policy_version, report_checksum_sha256, blocker_count, error_count,
    warning_count, info_count
  ) values (
    v_report_id, v_generation_id, p_command->>'generation_checksum_sha256',
    p_command->>'validator_set_version', p_command->>'policy_version',
    p_command->>'report_checksum_sha256', (p_command->>'blocker_count')::integer,
    (p_command->>'error_count')::integer, (p_command->>'warning_count')::integer,
    (p_command->>'info_count')::integer
  );

  for v_item in select value from jsonb_array_elements(coalesce(p_command->'findings', '[]'::jsonb)) loop
    insert into public.food_catalog_generation_validation_findings (
      id, report_id, finding_ordinal, reason_code, food_id, severity,
      blocking, evidence_reference, validator_policy_version, details
    ) values (
      (v_item->>'id')::uuid, v_report_id, (v_item->>'finding_ordinal')::integer,
      v_item->>'reason_code', nullif(v_item->>'food_id', '')::uuid,
      v_item->>'severity', (v_item->>'blocking')::boolean,
      nullif(v_item->>'evidence_reference', ''), v_item->>'validator_policy_version',
      coalesce(v_item->'details', '{}'::jsonb)
    );
  end loop;

  select count(*) filter (where blocking)::integer,
         count(*) filter (where severity = 'error')::integer,
         count(*) filter (where severity = 'warning')::integer,
         count(*) filter (where severity = 'info')::integer
    into v_blockers, v_errors, v_warnings, v_infos
  from public.food_catalog_generation_validation_findings
  where report_id = v_report_id;
  if v_blockers <> (p_command->>'blocker_count')::integer
     or v_errors <> (p_command->>'error_count')::integer
     or v_warnings <> (p_command->>'warning_count')::integer
     or v_infos <> (p_command->>'info_count')::integer then
    raise exception 'VALIDATION_REPORT_MISMATCH: submitted validation counts do not match exact findings.';
  end if;

  v_result := jsonb_build_object(
    'operation_id', p_operation_id,
    'event_id', v_event_id,
    'generation_id', v_generation_id,
    'validation_report_id', v_report_id,
    'validation_report_checksum_sha256', p_command->>'report_checksum_sha256',
    'pointer_revision', null
  );
  insert into public.food_catalog_control_operations (
    operation_id, operation_kind, command_checksum_sha256, result_json
  ) values (p_operation_id, 'record_generation_validation', v_command_checksum, v_result);
  insert into public.food_catalog_generation_events (
    id, event_type, operation_id, command_checksum_sha256,
    from_generation_id, to_generation_id, revoked_generation_id,
    generation_checksum_sha256, validation_report_id,
    principal_id, principal_type, authority_reference, reason_code, policy_version
  ) values (
    v_event_id, 'validated', p_operation_id, v_command_checksum,
    null, v_generation_id, null,
    p_command->>'generation_checksum_sha256', v_report_id,
    v_actor->>'principal_id', v_actor->>'principal_type', v_actor->>'authority_reference',
    v_actor->>'reason_code', v_actor->>'policy_version'
  );
  return v_result;
end
$function$;

create or replace function public.food_catalog_promote_generation_v1(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  p_operation_id uuid := (p_command->>'operation_id')::uuid;
  v_caller_checksum text := p_command->>'command_checksum_sha256';
  v_command_checksum text := private.food_catalog_plan3_command_fingerprint_v1(p_command);
  v_existing_kind text;
  v_existing_checksum text;
  v_existing_result jsonb;
  v_candidate_generation_id uuid := (p_command->>'candidate_generation_id')::uuid;
  v_expected_current_generation_id uuid := nullif(p_command->>'expected_current_generation_id', '')::uuid;
  v_validation_report_id uuid := (p_command->>'validation_report_id')::uuid;
  v_event_id uuid := coalesce(nullif(p_command->>'event_id', '')::uuid, gen_random_uuid());
  v_actor jsonb := p_command->'actor';
  v_current_generation_id uuid;
  v_pointer_revision bigint;
  v_new_revision bigint;
  v_result jsonb;
begin
  if p_operation_id is null or v_caller_checksum !~ '^[0-9a-f]{64}$' then
    raise exception 'CONTROL_PLANE_REJECTED: valid operation_id and command checksum are required.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));
  select operation_kind, command_checksum_sha256, result_json
    into v_existing_kind, v_existing_checksum, v_existing_result
  from public.food_catalog_control_operations where operation_id = p_operation_id;
  if found then
    if v_existing_kind = 'promote_generation' and v_existing_checksum = v_command_checksum then
      return v_existing_result;
    end if;
    raise exception 'OPERATION_ID_CONFLICT: operation_id already belongs to another semantic command.';
  end if;
  if not (p_command ? 'expected_current_generation_id') then
    raise exception 'STALE_CURRENT_GENERATION: expected_current_generation_id must be explicit, including null bootstrap.';
  end if;
  if jsonb_typeof(v_actor) <> 'object'
     or nullif(btrim(v_actor->>'principal_id'), '') is null
     or coalesce(v_actor->>'principal_type', '') not in ('human', 'service')
     or nullif(btrim(v_actor->>'authority_reference'), '') is null
     or nullif(btrim(v_actor->>'reason_code'), '') is null
     or nullif(btrim(v_actor->>'policy_version'), '') is null then
    raise exception 'CONTROL_PLANE_REJECTED: complete actor context is required.';
  end if;

  select current_generation_id, pointer_revision
    into v_current_generation_id, v_pointer_revision
  from public.food_catalog_current_generation
  where singleton_key
  for update;
  if v_current_generation_id is distinct from v_expected_current_generation_id then
    raise exception 'STALE_CURRENT_GENERATION: singleton current generation does not match expected current.';
  end if;
  if v_current_generation_id is not distinct from v_candidate_generation_id then
    raise exception 'CONTROL_PLANE_REJECTED: promotion target is already current.';
  end if;
  if not exists (
    select 1 from public.food_catalog_generations
    where id = v_candidate_generation_id
      and composition_checksum_sha256 = p_command->>'candidate_checksum_sha256'
      and sealed_at is not null
  ) then
    raise exception 'GENERATION_CHECKSUM_MISMATCH: candidate generation/checksum mismatch.';
  end if;
  if not exists (
    select 1 from public.food_catalog_generation_validation_reports
    where id = v_validation_report_id
      and generation_id = v_candidate_generation_id
      and generation_checksum_sha256 = p_command->>'candidate_checksum_sha256'
      and report_checksum_sha256 = p_command->>'validation_report_checksum_sha256'
      and blocker_count = 0
  ) then
    raise exception 'VALIDATION_REPORT_MISMATCH: exact zero-blocker validation report is required.';
  end if;
  if exists (
    select 1 from public.food_catalog_generation_events
    where event_type = 'revoke' and revoked_generation_id = v_candidate_generation_id
  ) then
    raise exception 'CONTROL_PLANE_REJECTED: revoked generation cannot be promoted.';
  end if;
  if exists (
    select 1
    from public.food_catalog_generation_foods gf
    left join public.food_catalog_activation_set_members m
      on m.id = gf.activation_set_member_id
     and m.activation_set_id = gf.activation_set_id
     and m.food_id = gf.food_id
    left join public.food_catalog_activation_sets s on s.id = gf.activation_set_id
    left join public.food_catalog_activation_events grant_event
      on grant_event.id = gf.activation_grant_event_id
     and grant_event.activation_set_id = gf.activation_set_id
     and grant_event.event_type = 'grant'
    where gf.generation_id = v_candidate_generation_id
      and gf.lifecycle = 'active'
      and (m.id is null or m.eligibility <> 'eligible'
        or s.activation_policy_version is distinct from (
          select activation_policy_version from public.food_catalog_generations where id = v_candidate_generation_id
        )
        or grant_event.id is null
        or exists (
          select 1 from public.food_catalog_activation_events invalidation
          where invalidation.event_type = 'invalidate'
            and invalidation.target_grant_event_id = grant_event.id
        ))
  ) then
    raise exception 'INVALID_ACTIVATION_GRANT: current activation authority no longer permits candidate promotion.';
  end if;
  if exists (
    select 1
    from public.food_catalog_generation_redirects r
    left join public.food_catalog_generation_foods target
      on target.generation_id = r.generation_id and target.food_id = r.target_food_id
    where r.generation_id = v_candidate_generation_id
      and (target.lifecycle is distinct from 'active'
        or exists (
          select 1 from public.food_catalog_generation_redirects r2
          where r2.generation_id = r.generation_id and r2.source_food_id = r.target_food_id
        )
        or exists (
          select 1 from public.food_catalog_generation_foods source_food
          where source_food.generation_id = r.generation_id and source_food.food_id = r.source_food_id
        ))
  ) then
    raise exception 'INVALID_REDIRECT: candidate redirect set is not flattened and valid.';
  end if;

  v_new_revision := v_pointer_revision + 1;
  v_result := jsonb_build_object(
    'operation_id', p_operation_id,
    'event_id', v_event_id,
    'generation_id', v_candidate_generation_id,
    'validation_report_id', v_validation_report_id,
    'previous_generation_id', v_current_generation_id,
    'pointer_revision', v_new_revision
  );
  insert into public.food_catalog_control_operations (
    operation_id, operation_kind, command_checksum_sha256, result_json
  ) values (p_operation_id, 'promote_generation', v_command_checksum, v_result);
  insert into public.food_catalog_generation_events (
    id, event_type, operation_id, command_checksum_sha256,
    from_generation_id, to_generation_id, revoked_generation_id,
    generation_checksum_sha256, validation_report_id,
    principal_id, principal_type, authority_reference, reason_code, policy_version
  ) values (
    v_event_id, 'promote', p_operation_id, v_command_checksum,
    v_current_generation_id, v_candidate_generation_id, null,
    p_command->>'candidate_checksum_sha256', v_validation_report_id,
    v_actor->>'principal_id', v_actor->>'principal_type', v_actor->>'authority_reference',
    v_actor->>'reason_code', v_actor->>'policy_version'
  );
  update public.food_catalog_current_generation
  set current_generation_id = v_candidate_generation_id,
      current_event_id = v_event_id,
      current_validation_report_id = v_validation_report_id,
      pointer_revision = v_new_revision,
      updated_at = clock_timestamp()
  where singleton_key;
  return v_result;
end
$function$;

create or replace function public.food_catalog_rollback_generation_v1(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  p_operation_id uuid := (p_command->>'operation_id')::uuid;
  v_caller_checksum text := p_command->>'command_checksum_sha256';
  v_command_checksum text := private.food_catalog_plan3_command_fingerprint_v1(p_command);
  v_existing_kind text;
  v_existing_checksum text;
  v_existing_result jsonb;
  v_expected_current_generation_id uuid := nullif(p_command->>'expected_current_generation_id', '')::uuid;
  v_target_generation_id uuid := (p_command->>'target_generation_id')::uuid;
  v_target_promotion_event_id uuid := (p_command->>'target_promotion_event_id')::uuid;
  v_target_validation_report_id uuid := (p_command->>'target_validation_report_id')::uuid;
  v_event_id uuid := coalesce(nullif(p_command->>'event_id', '')::uuid, gen_random_uuid());
  v_actor jsonb := p_command->'actor';
  v_current_generation_id uuid;
  v_pointer_revision bigint;
  v_new_revision bigint;
  v_result jsonb;
begin
  if p_operation_id is null or v_caller_checksum !~ '^[0-9a-f]{64}$' then
    raise exception 'CONTROL_PLANE_REJECTED: valid operation_id and command checksum are required.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));
  select operation_kind, command_checksum_sha256, result_json
    into v_existing_kind, v_existing_checksum, v_existing_result
  from public.food_catalog_control_operations where operation_id = p_operation_id;
  if found then
    if v_existing_kind = 'rollback_generation' and v_existing_checksum = v_command_checksum then
      return v_existing_result;
    end if;
    raise exception 'OPERATION_ID_CONFLICT: operation_id already belongs to another semantic command.';
  end if;
  if not (p_command ? 'expected_current_generation_id') or v_expected_current_generation_id is null then
    raise exception 'STALE_CURRENT_GENERATION: rollback requires explicit non-null expected current generation.';
  end if;
  if jsonb_typeof(v_actor) <> 'object'
     or nullif(btrim(v_actor->>'principal_id'), '') is null
     or coalesce(v_actor->>'principal_type', '') not in ('human', 'service')
     or nullif(btrim(v_actor->>'authority_reference'), '') is null
     or nullif(btrim(v_actor->>'reason_code'), '') is null
     or nullif(btrim(v_actor->>'policy_version'), '') is null then
    raise exception 'CONTROL_PLANE_REJECTED: complete actor context is required.';
  end if;

  select current_generation_id, pointer_revision
    into v_current_generation_id, v_pointer_revision
  from public.food_catalog_current_generation
  where singleton_key
  for update;
  if v_current_generation_id is distinct from v_expected_current_generation_id then
    raise exception 'STALE_CURRENT_GENERATION: singleton current generation does not match expected current.';
  end if;
  if v_target_generation_id is not distinct from v_current_generation_id then
    raise exception 'CONTROL_PLANE_REJECTED: rollback target must differ from current generation.';
  end if;
  if not exists (
    select 1 from public.food_catalog_generations
    where id = v_target_generation_id
      and composition_checksum_sha256 = p_command->>'target_checksum_sha256'
      and sealed_at is not null
  ) then
    raise exception 'GENERATION_CHECKSUM_MISMATCH: rollback target generation/checksum mismatch.';
  end if;
  if not exists (
    select 1 from public.food_catalog_generation_validation_reports
    where id = v_target_validation_report_id
      and generation_id = v_target_generation_id
      and generation_checksum_sha256 = p_command->>'target_checksum_sha256'
      and report_checksum_sha256 = p_command->>'target_validation_report_checksum_sha256'
      and blocker_count = 0
  ) then
    raise exception 'VALIDATION_REPORT_MISMATCH: rollback target validation evidence mismatch.';
  end if;
  if not exists (
    select 1 from public.food_catalog_generation_events
    where id = v_target_promotion_event_id
      and event_type = 'promote'
      and to_generation_id = v_target_generation_id
      and generation_checksum_sha256 = p_command->>'target_checksum_sha256'
      and validation_report_id = v_target_validation_report_id
  ) then
    raise exception 'VALIDATION_REPORT_MISMATCH: rollback must name the exact prior promotion event and report.';
  end if;
  if exists (
    select 1 from public.food_catalog_generation_events
    where event_type = 'revoke' and revoked_generation_id = v_target_generation_id
  ) then
    raise exception 'CONTROL_PLANE_REJECTED: revoked generation cannot be a rollback target.';
  end if;

  v_new_revision := v_pointer_revision + 1;
  v_result := jsonb_build_object(
    'operation_id', p_operation_id,
    'event_id', v_event_id,
    'generation_id', v_target_generation_id,
    'validation_report_id', v_target_validation_report_id,
    'target_promotion_event_id', v_target_promotion_event_id,
    'previous_generation_id', v_current_generation_id,
    'pointer_revision', v_new_revision
  );
  insert into public.food_catalog_control_operations (
    operation_id, operation_kind, command_checksum_sha256, result_json
  ) values (p_operation_id, 'rollback_generation', v_command_checksum, v_result);
  insert into public.food_catalog_generation_events (
    id, event_type, operation_id, command_checksum_sha256,
    from_generation_id, to_generation_id, revoked_generation_id,
    generation_checksum_sha256, validation_report_id,
    principal_id, principal_type, authority_reference, reason_code, policy_version
  ) values (
    v_event_id, 'rollback', p_operation_id, v_command_checksum,
    v_current_generation_id, v_target_generation_id, null,
    p_command->>'target_checksum_sha256', v_target_validation_report_id,
    v_actor->>'principal_id', v_actor->>'principal_type', v_actor->>'authority_reference',
    v_actor->>'reason_code', v_actor->>'policy_version'
  );
  update public.food_catalog_current_generation
  set current_generation_id = v_target_generation_id,
      current_event_id = v_event_id,
      current_validation_report_id = v_target_validation_report_id,
      pointer_revision = v_new_revision,
      updated_at = clock_timestamp()
  where singleton_key;
  return v_result;
end
$function$;

create or replace function public.food_catalog_revoke_generation_v1(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  p_operation_id uuid := (p_command->>'operation_id')::uuid;
  v_caller_checksum text := p_command->>'command_checksum_sha256';
  v_command_checksum text := private.food_catalog_plan3_command_fingerprint_v1(p_command);
  v_existing_kind text;
  v_existing_checksum text;
  v_existing_result jsonb;
  v_generation_id uuid := (p_command->>'generation_id')::uuid;
  v_event_id uuid := coalesce(nullif(p_command->>'event_id', '')::uuid, gen_random_uuid());
  v_actor jsonb := p_command->'actor';
  v_current_generation_id uuid;
  v_pointer_revision bigint;
  v_result jsonb;
begin
  if p_operation_id is null or v_caller_checksum !~ '^[0-9a-f]{64}$' then
    raise exception 'CONTROL_PLANE_REJECTED: valid operation_id and command checksum are required.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));
  select operation_kind, command_checksum_sha256, result_json
    into v_existing_kind, v_existing_checksum, v_existing_result
  from public.food_catalog_control_operations where operation_id = p_operation_id;
  if found then
    if v_existing_kind = 'revoke_generation' and v_existing_checksum = v_command_checksum then
      return v_existing_result;
    end if;
    raise exception 'OPERATION_ID_CONFLICT: operation_id already belongs to another semantic command.';
  end if;
  if jsonb_typeof(v_actor) <> 'object'
     or nullif(btrim(v_actor->>'principal_id'), '') is null
     or coalesce(v_actor->>'principal_type', '') not in ('human', 'service')
     or nullif(btrim(v_actor->>'authority_reference'), '') is null
     or nullif(btrim(v_actor->>'reason_code'), '') is null
     or nullif(btrim(v_actor->>'policy_version'), '') is null then
    raise exception 'CONTROL_PLANE_REJECTED: complete actor context is required.';
  end if;

  select current_generation_id, pointer_revision
    into v_current_generation_id, v_pointer_revision
  from public.food_catalog_current_generation
  where singleton_key
  for update;
  if v_current_generation_id is not distinct from v_generation_id then
    raise exception 'CONTROL_PLANE_REJECTED: current generation cannot be revoked; rollback first.';
  end if;
  if not exists (
    select 1 from public.food_catalog_generations
    where id = v_generation_id
      and composition_checksum_sha256 = p_command->>'generation_checksum_sha256'
      and sealed_at is not null
  ) then
    raise exception 'GENERATION_CHECKSUM_MISMATCH: revoke target generation/checksum mismatch.';
  end if;
  if exists (
    select 1 from public.food_catalog_generation_events
    where event_type = 'revoke' and revoked_generation_id = v_generation_id
  ) then
    raise exception 'CONTROL_PLANE_REJECTED: generation is already revoked.';
  end if;

  v_result := jsonb_build_object(
    'operation_id', p_operation_id,
    'event_id', v_event_id,
    'generation_id', v_generation_id,
    'validation_report_id', null,
    'pointer_revision', v_pointer_revision
  );
  insert into public.food_catalog_control_operations (
    operation_id, operation_kind, command_checksum_sha256, result_json
  ) values (p_operation_id, 'revoke_generation', v_command_checksum, v_result);
  insert into public.food_catalog_generation_events (
    id, event_type, operation_id, command_checksum_sha256,
    from_generation_id, to_generation_id, revoked_generation_id,
    generation_checksum_sha256, validation_report_id,
    principal_id, principal_type, authority_reference, reason_code, policy_version
  ) values (
    v_event_id, 'revoke', p_operation_id, v_command_checksum,
    null, null, v_generation_id,
    p_command->>'generation_checksum_sha256', null,
    v_actor->>'principal_id', v_actor->>'principal_type', v_actor->>'authority_reference',
    v_actor->>'reason_code', v_actor->>'policy_version'
  );
  return v_result;
end
$function$;

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

revoke all on function private.food_catalog_plan3_command_fingerprint_v1(jsonb) from public, anon, authenticated, service_role;

revoke all on function public.food_catalog_create_activation_set_v1(jsonb) from public, anon, authenticated;
revoke all on function public.food_catalog_grant_activation_set_v1(jsonb) from public, anon, authenticated;
revoke all on function public.food_catalog_invalidate_activation_grant_v1(jsonb) from public, anon, authenticated;
revoke all on function public.food_catalog_create_generation_v1(jsonb) from public, anon, authenticated;
revoke all on function public.food_catalog_record_generation_validation_v1(jsonb) from public, anon, authenticated;
revoke all on function public.food_catalog_promote_generation_v1(jsonb) from public, anon, authenticated;
revoke all on function public.food_catalog_rollback_generation_v1(jsonb) from public, anon, authenticated;
revoke all on function public.food_catalog_revoke_generation_v1(jsonb) from public, anon, authenticated;

grant execute on function public.food_catalog_create_activation_set_v1(jsonb) to service_role;
grant execute on function public.food_catalog_grant_activation_set_v1(jsonb) to service_role;
grant execute on function public.food_catalog_invalidate_activation_grant_v1(jsonb) to service_role;
grant execute on function public.food_catalog_create_generation_v1(jsonb) to service_role;
grant execute on function public.food_catalog_record_generation_validation_v1(jsonb) to service_role;
grant execute on function public.food_catalog_promote_generation_v1(jsonb) to service_role;
grant execute on function public.food_catalog_rollback_generation_v1(jsonb) to service_role;
grant execute on function public.food_catalog_revoke_generation_v1(jsonb) to service_role;

commit;