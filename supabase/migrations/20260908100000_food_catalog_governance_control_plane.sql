begin;

-- Food Catalog Plan 6: governance control plane.
-- This migration creates governance authority only. It does not populate Foods,
-- activate Foods, create/promote Catalog Generations, move the current pointer,
-- or mutate derived SearchDocuments.

create table public.food_catalog_governance_principals (
  id uuid primary key default gen_random_uuid(),
  principal_type text not null check (principal_type in ('human','service')),
  subject_id text not null check (length(btrim(subject_id)) > 0),
  service_identity_sha256 text,
  role_class text not null check (role_class in ('owner','curator','service')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (principal_type, subject_id),
  check ((principal_type='service' and role_class='service') or (principal_type='human' and role_class in ('owner','curator'))),
  check ((principal_type='service' and service_identity_sha256 ~ '^[0-9a-f]{64}$') or (principal_type='human' and service_identity_sha256 is null)),
  check ((active and revoked_at is null) or (not active and revoked_at is not null))
);
create unique index food_catalog_governance_service_identity_uq
  on public.food_catalog_governance_principals(service_identity_sha256) where principal_type='service';

create table public.food_catalog_governance_capability_assignments (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references public.food_catalog_governance_principals(id) on delete restrict,
  capability text not null check (capability in (
    'food.governance.manage_principals',
    'food.correction.report','food.correction.review','food.correction.approve','food.correction.apply',
    'food.evidence.attach','food.nutrition.correct','food.serving.correct','food.name.correct',
    'food.barcode.correct','food.taxonomy.correct','food.market.correct','food.identity.merge',
    'food.lifecycle.withdraw','food.lifecycle.restore','food.break_glass','food.personal_override.write',
    'food.observability.read','food.ingestion.propose'
  )),
  granted_by_principal_id uuid references public.food_catalog_governance_principals(id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_by_principal_id uuid references public.food_catalog_governance_principals(id) on delete restrict,
  revoked_at timestamptz,
  reason text not null check (length(btrim(reason)) > 0),
  check ((revoked_at is null and revoked_by_principal_id is null) or (revoked_at is not null and revoked_by_principal_id is not null))
);
create unique index food_catalog_governance_capability_active_uq
  on public.food_catalog_governance_capability_assignments(principal_id, capability)
  where revoked_at is null;


-- PLAN6_REREVIEW_HARDENED: explicit immutable governance policy authority.
create table public.food_catalog_governance_policy_versions (
  policy_version text primary key check (length(btrim(policy_version)) between 1 and 80),
  evidence_policy jsonb not null check (jsonb_typeof(evidence_policy)='object'),
  evidence_required_categories text[] not null default '{}'::text[],
  created_at timestamptz not null default now()
);
create table public.food_catalog_governance_policy_pointer (
  singleton boolean primary key default true check (singleton),
  current_policy_version text not null references public.food_catalog_governance_policy_versions(policy_version) on delete restrict,
  pointer_revision bigint not null default 0 check (pointer_revision >= 0),
  updated_at timestamptz not null default now()
);
insert into public.food_catalog_governance_policy_versions(policy_version,evidence_policy,evidence_required_categories)
values('plan6-v1',jsonb_build_object(
  'wrong_nutrition',jsonb_build_array('source_record','product_label','manufacturer'),
  'missing_nutrition',jsonb_build_array('source_record','product_label','manufacturer','curator_reason'),
  'wrong_serving',jsonb_build_array('source_record','product_label','manufacturer'),
  'missing_serving',jsonb_build_array('source_record','product_label','manufacturer','curator_reason'),
  'wrong_name',jsonb_build_array('source_record','product_label','manufacturer','canonical'),
  'wrong_translation',jsonb_build_array('source_record','product_label','manufacturer','canonical'),
  'wrong_barcode',jsonb_build_array('source_record','product_label','manufacturer','barcode'),
  'wrong_taxonomy',jsonb_build_array('source_record','canonical','curator_reason'),
  'wrong_market_relevance',jsonb_build_array('source_record','manufacturer','canonical','curator_reason'),
  'duplicate_food',jsonb_build_array('source_record','product_label','manufacturer','barcode','canonical'),
  'wrong_variant',jsonb_build_array('source_record','product_label','manufacturer','barcode'),
  'outdated_product',jsonb_build_array('source_record','manufacturer','canonical'),
  'source_conflict',jsonb_build_array('source_record','product_label','manufacturer','canonical'),
  'other',jsonb_build_array('source_record','product_label','manufacturer','barcode','canonical','curator_reason')
),array['wrong_nutrition','wrong_serving','wrong_name','wrong_translation','wrong_barcode','wrong_taxonomy','wrong_market_relevance','duplicate_food','wrong_variant','outdated_product','source_conflict']);
insert into public.food_catalog_governance_policy_pointer(singleton,current_policy_version,pointer_revision)
values(true,'plan6-v1',0);

-- One-time bootstrap from the pre-Plan-6 admin identity into explicit Owner principals.
-- Runtime authorization after this migration evaluates principal/capability records, not profile.role.
insert into public.food_catalog_governance_principals (principal_type, subject_id, role_class)
select 'human', profile.id::text, 'owner'
from public.profiles profile
where profile.role='admin'
on conflict (principal_type, subject_id) do nothing;

with owner_capability(capability) as (
  values
    ('food.governance.manage_principals'),('food.correction.report'),('food.correction.review'),
    ('food.correction.approve'),('food.correction.apply'),('food.evidence.attach'),
    ('food.nutrition.correct'),('food.serving.correct'),('food.name.correct'),('food.barcode.correct'),
    ('food.taxonomy.correct'),('food.market.correct'),('food.identity.merge'),('food.lifecycle.withdraw'),
    ('food.lifecycle.restore'),('food.break_glass'),('food.personal_override.write'),('food.observability.read')
)
insert into public.food_catalog_governance_capability_assignments(principal_id, capability, reason)
select principal.id, owner_capability.capability, 'plan6-owner-bootstrap'
from public.food_catalog_governance_principals principal
cross join owner_capability
where principal.principal_type='human' and principal.role_class='owner'
on conflict (principal_id, capability) where revoked_at is null do nothing;

create table public.food_catalog_correction_cases (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.food_items(id) on delete restrict,
  category text not null check (category in (
    'wrong_nutrition','missing_nutrition','wrong_serving','missing_serving','wrong_name','wrong_translation',
    'wrong_barcode','wrong_taxonomy','wrong_market_relevance','duplicate_food','wrong_variant','outdated_product',
    'source_conflict','other'
  )),
  claim_key text not null check (length(btrim(claim_key)) between 1 and 240),
  issue_key text not null check (length(btrim(issue_key)) between 1 and 512),
  state text not null default 'reported' check (state in ('reported','under_review','approved','applied','rejected')),
  state_revision bigint not null default 0 check (state_revision >= 0),
  policy_version text not null check (length(btrim(policy_version)) > 0),
  expected_authority_kind text,
  expected_authority_key text,
  expected_authority_revision bigint check (expected_authority_revision is null or expected_authority_revision >= 0),
  expected_authority_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  applied_at timestamptz,
  rejected_at timestamptz
);
create unique index food_catalog_correction_cases_open_issue_uq
  on public.food_catalog_correction_cases(issue_key)
  where state in ('reported','under_review','approved');
create index food_catalog_correction_cases_food_state_idx
  on public.food_catalog_correction_cases(food_id,state,updated_at,id);

create table public.food_catalog_correction_reports (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.food_catalog_correction_cases(id) on delete restrict,
  reporter_user_id uuid not null,
  description text not null check (length(btrim(description)) between 1 and 2000),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence)='object' and pg_column_size(evidence) <= 8192),
  created_at timestamptz not null default now()
);
create index food_catalog_correction_reports_owner_idx
  on public.food_catalog_correction_reports(reporter_user_id,created_at,id);

create table public.food_catalog_correction_evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.food_catalog_correction_cases(id) on delete restrict,
  food_id uuid not null references public.food_items(id) on delete restrict,
  evidence_type text not null check (evidence_type in ('source_record','product_label','manufacturer','barcode','canonical','curator_reason')),
  source_record_id uuid,
  evidence_reference text,
  attached_by_principal_id uuid not null references public.food_catalog_governance_principals(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (source_record_id, food_id) references public.food_source_records(id, food_id) on delete restrict,
  check (source_record_id is not null or (evidence_reference is not null and length(btrim(evidence_reference)) between 1 and 500))
);
create index food_catalog_correction_evidence_case_idx on public.food_catalog_correction_evidence(case_id,created_at,id);

create table public.food_catalog_correction_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.food_catalog_correction_cases(id) on delete restrict,
  from_state text,
  to_state text not null,
  state_revision bigint not null check (state_revision >= 0),
  principal_id uuid references public.food_catalog_governance_principals(id) on delete restrict,
  operation_id uuid,
  policy_version text not null,
  reason text not null check (length(btrim(reason)) > 0),
  created_at timestamptz not null default now()
);

create table public.food_catalog_governance_authority_revisions (
  food_id uuid not null references public.food_items(id) on delete restrict,
  authority_kind text not null check (authority_kind in ('nutrition_revision','serving_option','name_fact','barcode_correction','taxonomy_assignment','market_assignment','identity_merge','lifecycle')),
  authority_key text not null default '' check (length(authority_key) <= 240),
  authority_revision bigint not null default 0 check (authority_revision >= 0),
  current_fact_id uuid,
  updated_at timestamptz not null default now(),
  primary key (food_id, authority_kind, authority_key)
);

create table public.food_catalog_governance_operations (
  operation_id uuid primary key,
  principal_id uuid not null references public.food_catalog_governance_principals(id) on delete restrict,
  principal_type text not null check (principal_type in ('human','service')),
  capability text not null,
  command_name text not null check (command_name ~ '^food_catalog_[a-z0-9_]+$'),
  target_food_id uuid references public.food_items(id) on delete restrict,
  correction_case_id uuid references public.food_catalog_correction_cases(id) on delete restrict,
  policy_version text not null check (length(btrim(policy_version)) > 0),
  reason text not null check (length(btrim(reason)) > 0),
  semantic_checksum_sha256 text not null check (semantic_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  result_json jsonb,
  replay_count bigint not null default 0 check (replay_count >= 0),
  last_replayed_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.food_catalog_service_proposals (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique references public.food_catalog_governance_operations(operation_id) on delete restrict,
  principal_id uuid not null references public.food_catalog_governance_principals(id) on delete restrict,
  food_id uuid not null references public.food_items(id) on delete restrict,
  category text not null check (category in (
    'wrong_nutrition','missing_nutrition','wrong_serving','missing_serving','wrong_name','wrong_translation',
    'wrong_barcode','wrong_taxonomy','wrong_market_relevance','duplicate_food','wrong_variant','outdated_product',
    'source_conflict','other'
  )),
  claim_key text not null check (length(btrim(claim_key)) between 1 and 240),
  description text not null check (length(btrim(description)) between 1 and 2000),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence)='object' and pg_column_size(evidence) <= 8192),
  policy_version text not null check (length(btrim(policy_version)) > 0),
  created_at timestamptz not null default now()
);
create index food_catalog_service_proposals_food_idx on public.food_catalog_service_proposals(food_id,created_at,id);


create table public.food_catalog_governance_audit_events (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique references public.food_catalog_governance_operations(operation_id) on delete restrict,
  principal_id uuid not null references public.food_catalog_governance_principals(id) on delete restrict,
  principal_type text not null,
  capability text not null,
  command_name text not null,
  target_food_id uuid references public.food_items(id) on delete restrict,
  old_authority_id uuid,
  new_authority_id uuid,
  correction_case_id uuid references public.food_catalog_correction_cases(id) on delete restrict,
  evidence_ids uuid[] not null default '{}'::uuid[],
  policy_version text not null,
  reason text not null,
  semantic_checksum_sha256 text not null check (semantic_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  break_glass boolean not null default false,
  break_glass_reason text,
  created_at timestamptz not null default now(),
  check ((break_glass and break_glass_reason is not null and length(btrim(break_glass_reason))>0) or (not break_glass and break_glass_reason is null))
);

create table public.food_catalog_governance_outbox (
  event_id uuid primary key,
  operation_id uuid not null unique references public.food_catalog_governance_operations(operation_id) on delete restrict,
  event_type text not null check (length(btrim(event_type)) > 0),
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  status text not null default 'pending' check (status in ('pending','processing','failed','delivered')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  claim_owner text,
  lease_token uuid,
  lease_epoch bigint not null default 0 check (lease_epoch >= 0),
  lease_acquired_at timestamptz,
  lease_expires_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status='delivered' and delivered_at is not null) or (status<>'delivered' and delivered_at is null)),
  check ((status='processing' and claim_owner is not null and lease_token is not null and lease_acquired_at is not null and lease_expires_at is not null) or (status<>'processing' and claim_owner is null and lease_token is null and lease_acquired_at is null and lease_expires_at is null))
);

create table public.food_catalog_governance_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique references public.food_catalog_governance_operations(operation_id) on delete restrict,
  food_id uuid not null references public.food_items(id) on delete restrict,
  event_type text not null check (event_type in ('withdraw','restore','merge')),
  previous_lifecycle text not null,
  next_lifecycle text not null,
  replacement_food_id uuid references public.food_items(id) on delete restrict,
  reason text not null check (length(btrim(reason)) > 0),
  created_at timestamptz not null default now(),
  check (replacement_food_id is null or replacement_food_id <> food_id)
);

create table public.food_personal_override_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  food_id uuid not null references public.food_items(id) on delete restrict,
  revision_number bigint not null check (revision_number > 0),
  supersedes_revision_id uuid references public.food_personal_override_revisions(id) on delete restrict,
  nutrition_override jsonb,
  serving_label text,
  note text,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, food_id, revision_number),
  check (nutrition_override is null or jsonb_typeof(nutrition_override)='object')
);

create table public.food_personal_overrides (
  user_id uuid not null,
  food_id uuid not null references public.food_items(id) on delete restrict,
  current_revision_id uuid not null references public.food_personal_override_revisions(id) on delete restrict,
  pointer_revision bigint not null check (pointer_revision > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, food_id)
);


create table public.food_catalog_serving_fact_lineages (
  lineage_id uuid primary key,
  food_id uuid not null references public.food_items(id) on delete restrict,
  created_at timestamptz not null default now()
);
create table public.food_catalog_serving_fact_revisions (
  serving_option_id uuid primary key references public.food_serving_options(id) on delete restrict,
  lineage_id uuid not null references public.food_catalog_serving_fact_lineages(lineage_id) on delete restrict,
  predecessor_serving_option_id uuid references public.food_serving_options(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(lineage_id,serving_option_id),
  foreign key(lineage_id,predecessor_serving_option_id)
    references public.food_catalog_serving_fact_revisions(lineage_id,serving_option_id) on delete restrict,
  check (predecessor_serving_option_id is null or predecessor_serving_option_id<>serving_option_id)
);

create table public.food_personal_override_operations (
  user_id uuid not null,
  operation_id uuid not null,
  food_id uuid not null references public.food_items(id) on delete restrict,
  command_name text not null check (command_name in ('set','delete')),
  semantic_checksum_sha256 text not null check (semantic_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  result_json jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key(user_id,operation_id)
);

create or replace function private.reject_food_catalog_governance_immutable_mutation()
returns trigger language plpgsql set search_path='' as $function$
begin
  raise exception 'Food Catalog governance immutable history cannot be updated or deleted.' using errcode='23514';
end
$function$;

create trigger food_catalog_governance_policy_versions_immutable before update or delete on public.food_catalog_governance_policy_versions for each row execute function private.reject_food_catalog_governance_immutable_mutation();
create trigger food_catalog_serving_fact_lineages_immutable before update or delete on public.food_catalog_serving_fact_lineages for each row execute function private.reject_food_catalog_governance_immutable_mutation();
create trigger food_catalog_serving_fact_revisions_immutable before update or delete on public.food_catalog_serving_fact_revisions for each row execute function private.reject_food_catalog_governance_immutable_mutation();
create trigger food_catalog_correction_reports_immutable before update or delete on public.food_catalog_correction_reports for each row execute function private.reject_food_catalog_governance_immutable_mutation();
create trigger food_catalog_service_proposals_immutable before update or delete on public.food_catalog_service_proposals for each row execute function private.reject_food_catalog_governance_immutable_mutation();
create trigger food_catalog_correction_evidence_immutable before update or delete on public.food_catalog_correction_evidence for each row execute function private.reject_food_catalog_governance_immutable_mutation();
create trigger food_catalog_correction_events_immutable before update or delete on public.food_catalog_correction_events for each row execute function private.reject_food_catalog_governance_immutable_mutation();
create trigger food_catalog_governance_audit_events_immutable before update or delete on public.food_catalog_governance_audit_events for each row execute function private.reject_food_catalog_governance_immutable_mutation();
create trigger food_catalog_governance_lifecycle_events_immutable before update or delete on public.food_catalog_governance_lifecycle_events for each row execute function private.reject_food_catalog_governance_immutable_mutation();
create trigger food_personal_override_revisions_immutable before update on public.food_personal_override_revisions for each row execute function private.reject_food_catalog_governance_immutable_mutation();

create or replace function private.food_catalog_governance_principal_for_user()
returns uuid language plpgsql stable security definer set search_path='' as $function$
declare v_principal uuid;
begin
  if auth.uid() is null then raise exception 'Authenticated Food governance principal is required.' using errcode='42501'; end if;
  select p.id into v_principal
  from public.food_catalog_governance_principals p
  where p.principal_type='human' and p.subject_id=auth.uid()::text and p.active and p.revoked_at is null;
  if v_principal is null then raise exception 'Authenticated member has no Food governance principal.' using errcode='42501'; end if;
  return v_principal;
end
$function$;


create or replace function private.food_catalog_governance_service_principal_for_request()
returns uuid language plpgsql stable security definer set search_path='' as $function$
declare v_identity text; v_hash text; v_principal uuid;
begin
  if auth.role()<>'service_role' then raise exception 'Service Food governance principal requires service_role execution.' using errcode='42501'; end if;
  v_identity:=nullif(btrim(coalesce(auth.jwt()->>'plaivra_food_service_identity','')),'');
  if v_identity is null then raise exception 'Trusted Food service execution identity claim is required.' using errcode='42501'; end if;
  v_hash:=encode(extensions.digest(convert_to(v_identity,'UTF8'),'sha256'),'hex');
  select p.id into v_principal from public.food_catalog_governance_principals p
  where p.principal_type='service' and p.service_identity_sha256=v_hash and p.active and p.revoked_at is null;
  if v_principal is null then raise exception 'Trusted Food service execution identity is not provisioned.' using errcode='42501'; end if;
  return v_principal;
end
$function$;

create or replace function private.food_catalog_governance_current_policy_version()
returns text language sql stable security definer set search_path='' as $function$
  select current_policy_version from public.food_catalog_governance_policy_pointer where singleton=true
$function$;

create or replace function private.food_catalog_governance_evidence_type_allowed(p_policy_version text,p_category text,p_evidence_type text)
returns boolean language sql stable security definer set search_path='' as $function$
  select coalesce((select (evidence_policy->p_category) ? p_evidence_type from public.food_catalog_governance_policy_versions where policy_version=p_policy_version),false)
$function$;

create or replace function private.food_catalog_governance_case_evidence_required(p_policy_version text,p_category text)
returns boolean language sql stable security definer set search_path='' as $function$
  select coalesce((select p_category=any(evidence_required_categories) from public.food_catalog_governance_policy_versions where policy_version=p_policy_version),false)
$function$;

create or replace function private.food_catalog_governance_validate_bounded_evidence(p_value jsonb,p_depth integer default 0)
returns void language plpgsql immutable set search_path='' as $function$
declare v_key text; v_child jsonb;
begin
  if p_depth>4 then raise exception 'Correction evidence exceeds maximum depth.' using errcode='22023'; end if;
  case jsonb_typeof(p_value)
    when 'object' then
      if (select count(*) from jsonb_object_keys(p_value))>24 then raise exception 'Correction evidence object is too large.' using errcode='22023'; end if;
      for v_key,v_child in select key,value from jsonb_each(p_value) loop
        if v_key ~* '(access.?token|authorization|password|secret|cookie|session|api.?key|service.?role)' then raise exception 'Sensitive correction evidence is forbidden.' using errcode='22023'; end if;
        perform private.food_catalog_governance_validate_bounded_evidence(v_child,p_depth+1);
      end loop;
    when 'array' then
      if jsonb_array_length(p_value)>24 then raise exception 'Correction evidence array is too large.' using errcode='22023'; end if;
      for v_child in select value from jsonb_array_elements(p_value) loop
        perform private.food_catalog_governance_validate_bounded_evidence(v_child,p_depth+1);
      end loop;
    when 'string' then
      if length(p_value#>>'{}')>4096 then raise exception 'Correction evidence string is too long.' using errcode='22023'; end if;
    else null;
  end case;
end
$function$;

create or replace function private.food_catalog_governance_assert_recovery_survives(p_target_principal_id uuid)
returns void language plpgsql stable security definer set search_path='' as $function$
begin
  if not exists(
    select 1 from public.food_catalog_governance_principals p
    join public.food_catalog_governance_capability_assignments a on a.principal_id=p.id and a.capability='food.governance.manage_principals' and a.revoked_at is null
    where p.principal_type='human' and p.role_class='owner' and p.active and p.revoked_at is null and p.id<>p_target_principal_id
  ) then raise exception 'Final Owner recovery authority cannot be removed.' using errcode='23514'; end if;
end
$function$;

create or replace function private.food_catalog_gtin_is_valid(p_gtin text)
returns boolean language plpgsql immutable set search_path='' as $function$
declare v_sum integer:=0; v_i integer; v_digit integer; v_len integer:=length(coalesce(p_gtin,'')); v_check integer;
begin
  if p_gtin is null or p_gtin !~ '^[0-9]+$' or v_len not in (8,12,13,14) then return false; end if;
  for v_i in 1..v_len-1 loop
    v_digit:=substring(p_gtin from v_i for 1)::integer;
    v_sum:=v_sum + v_digit * case when ((v_len-v_i) % 2)=1 then 3 else 1 end;
  end loop;
  v_check:=(10-(v_sum%10))%10;
  return v_check=substring(p_gtin from v_len for 1)::integer;
end
$function$;

create or replace function private.food_catalog_validate_personal_nutrition_override(p_value jsonb)
returns void language plpgsql immutable set search_path='' as $function$
declare v_key text; v_child jsonb; v_numeric numeric;
begin
  if p_value is null then return; end if;
  if jsonb_typeof(p_value)<>'object' then raise exception 'Personal nutrition override must be a JSON object.' using errcode='22023'; end if;
  if (select count(*) from jsonb_object_keys(p_value))>8 then raise exception 'Personal nutrition override has too many keys.' using errcode='22023'; end if;
  for v_key,v_child in select key,value from jsonb_each(p_value) loop
    if v_key not in ('calories','protein_g','carbs_g','fat_g','saturated_fat_g','fiber_g','sugars_g','sodium_mg') then raise exception 'Unsupported personal nutrition override key: %',v_key using errcode='22023'; end if;
    if jsonb_typeof(v_child)='null' then continue; end if;
    if jsonb_typeof(v_child)<>'number' then raise exception 'Personal nutrition override values must be number or null.' using errcode='22023'; end if;
    v_numeric:=(v_child#>>'{}')::numeric;
    if v_numeric<0 then raise exception 'Personal nutrition override values must be non-negative.' using errcode='22023'; end if;
  end loop;
end
$function$;

create or replace function private.food_catalog_personal_override_begin_operation(p_user_id uuid,p_operation_id uuid,p_food_id uuid,p_command_name text,p_semantics jsonb)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_checksum text; v_existing public.food_personal_override_operations%rowtype;
begin
  if p_operation_id is null then raise exception 'Personal override operation ID is required.' using errcode='22023'; end if;
  v_checksum:=private.food_catalog_governance_semantic_checksum(p_semantics);
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||'|'||p_operation_id::text,0));
  select * into v_existing from public.food_personal_override_operations where user_id=p_user_id and operation_id=p_operation_id;
  if found then
    if v_existing.food_id<>p_food_id or v_existing.command_name<>p_command_name or v_existing.semantic_checksum_sha256<>v_checksum then
      raise exception 'Personal override operation ID was reused with different semantics.' using errcode='23505';
    end if;
    if v_existing.completed_at is null then raise exception 'Personal override operation is already in progress.' using errcode='40001'; end if;
    return v_existing.result_json;
  end if;
  insert into public.food_personal_override_operations(user_id,operation_id,food_id,command_name,semantic_checksum_sha256)
  values(p_user_id,p_operation_id,p_food_id,p_command_name,v_checksum);
  return null;
end
$function$;

create or replace function private.food_catalog_personal_override_finish_operation(p_user_id uuid,p_operation_id uuid,p_result jsonb)
returns jsonb language plpgsql security definer set search_path='' as $function$
begin
  update public.food_personal_override_operations set result_json=p_result,completed_at=clock_timestamp()
  where user_id=p_user_id and operation_id=p_operation_id and completed_at is null;
  if not found then raise exception 'Personal override operation cannot be completed.' using errcode='40001'; end if;
  return p_result;
end
$function$;

create or replace function private.food_catalog_governance_assert_capability(p_principal_id uuid, p_capability text)
returns void language plpgsql stable security definer set search_path='' as $function$
declare v_type text; v_subject text; v_resolved_service uuid;
begin
  select p.principal_type,p.subject_id into v_type,v_subject
  from public.food_catalog_governance_principals p
  where p.id=p_principal_id and p.active and p.revoked_at is null;
  if v_type is null then raise exception 'Food governance principal is inactive or unknown.' using errcode='42501'; end if;
  if v_type='human' then
    if auth.uid() is null or auth.uid()::text<>v_subject then raise exception 'Human Food governance principal identity mismatch.' using errcode='42501'; end if;
  elsif v_type='service' then
    v_resolved_service:=private.food_catalog_governance_service_principal_for_request();
    if v_resolved_service<>p_principal_id then raise exception 'Service Food governance principal identity mismatch.' using errcode='42501'; end if;
  end if;
  if not exists(select 1 from public.food_catalog_governance_capability_assignments a where a.principal_id=p_principal_id and a.capability=p_capability and a.revoked_at is null) then
    raise exception 'Food governance capability denied: %',p_capability using errcode='42501';
  end if;
end
$function$;

create or replace function private.food_catalog_governance_semantic_checksum(p_semantics jsonb)
returns text language sql immutable set search_path='' as $function$
  select encode(extensions.digest(convert_to(p_semantics::text,'UTF8'),'sha256'),'hex')
$function$;

create or replace function private.food_catalog_governance_begin_operation(
  p_operation_id uuid,
  p_principal_id uuid,
  p_capability text,
  p_command_name text,
  p_target_food_id uuid,
  p_correction_case_id uuid,
  p_policy_version text,
  p_reason text,
  p_semantics jsonb
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_checksum text; v_existing public.food_catalog_governance_operations%rowtype; v_type text;
begin
  if p_operation_id is null then raise exception 'Food governance operation ID is required.' using errcode='22023'; end if;
  if length(btrim(coalesce(p_reason,'')))=0 or length(btrim(coalesce(p_policy_version,'')))=0 then raise exception 'Food governance reason and policy version are required.' using errcode='22023'; end if;
  perform private.food_catalog_governance_assert_capability(p_principal_id,p_capability);
  select principal_type into v_type from public.food_catalog_governance_principals where id=p_principal_id;
  v_checksum:=private.food_catalog_governance_semantic_checksum(jsonb_build_object('capability',p_capability,'commandName',p_command_name,'targetFoodId',p_target_food_id,'correctionCaseId',p_correction_case_id,'policyVersion',btrim(p_policy_version),'reason',btrim(p_reason),'command',p_semantics));
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
  select * into v_existing from public.food_catalog_governance_operations where operation_id=p_operation_id;
  if found then
    if v_existing.principal_id<>p_principal_id or v_existing.capability<>p_capability or v_existing.command_name<>p_command_name or v_existing.semantic_checksum_sha256<>v_checksum then
      raise exception 'Food governance operation ID was reused with different semantics.' using errcode='23505';
    end if;
    if v_existing.completed_at is null then raise exception 'Food governance operation is already in progress.' using errcode='40001'; end if;
    update public.food_catalog_governance_operations
      set replay_count=replay_count+1,last_replayed_at=clock_timestamp()
      where operation_id=p_operation_id;
    return v_existing.result_json;
  end if;
  insert into public.food_catalog_governance_operations(operation_id,principal_id,principal_type,capability,command_name,target_food_id,correction_case_id,policy_version,reason,semantic_checksum_sha256)
  values(p_operation_id,p_principal_id,v_type,p_capability,p_command_name,p_target_food_id,p_correction_case_id,p_policy_version,btrim(p_reason),v_checksum);
  return null;
end
$function$;

create or replace function private.food_catalog_governance_finish_operation(
  p_operation_id uuid,
  p_old_authority_id uuid,
  p_new_authority_id uuid,
  p_evidence_ids uuid[],
  p_result jsonb,
  p_event_type text,
  p_outbox_payload jsonb,
  p_break_glass_reason text default null
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_op public.food_catalog_governance_operations%rowtype;
begin
  select * into v_op from public.food_catalog_governance_operations where operation_id=p_operation_id for update;
  if not found then raise exception 'Food governance operation does not exist.' using errcode='23503'; end if;
  if v_op.completed_at is not null then return v_op.result_json; end if;
  insert into public.food_catalog_governance_audit_events(operation_id,principal_id,principal_type,capability,command_name,target_food_id,old_authority_id,new_authority_id,correction_case_id,evidence_ids,policy_version,reason,semantic_checksum_sha256,break_glass,break_glass_reason)
  values(v_op.operation_id,v_op.principal_id,v_op.principal_type,v_op.capability,v_op.command_name,v_op.target_food_id,p_old_authority_id,p_new_authority_id,v_op.correction_case_id,coalesce(p_evidence_ids,'{}'::uuid[]),v_op.policy_version,v_op.reason,v_op.semantic_checksum_sha256,p_break_glass_reason is not null,nullif(btrim(p_break_glass_reason),''));
  insert into public.food_catalog_governance_outbox(event_id,operation_id,event_type,payload)
  values(p_operation_id,p_operation_id,p_event_type,coalesce(p_outbox_payload,'{}'::jsonb));
  update public.food_catalog_governance_operations set result_json=p_result,completed_at=clock_timestamp() where operation_id=p_operation_id;
  return p_result;
end
$function$;


create or replace function private.food_catalog_governance_require_case(
  p_case_id uuid,p_food_id uuid,p_expected_revision bigint,p_expected_state text,p_allowed_categories text[]
) returns public.food_catalog_correction_cases language plpgsql security definer set search_path='' as $function$
declare v_case public.food_catalog_correction_cases%rowtype;
begin
  select * into v_case from public.food_catalog_correction_cases where id=p_case_id for update;
  if not found then raise exception 'Correction case not found.' using errcode='23503'; end if;
  if v_case.food_id<>p_food_id then raise exception 'Correction case belongs to a different Food.' using errcode='23514'; end if;
  if v_case.state<>p_expected_state then raise exception 'Correction case state mismatch.' using errcode='40001'; end if;
  if v_case.state_revision<>p_expected_revision then raise exception 'Correction case CAS conflict.' using errcode='40001'; end if;
  if not (v_case.category=any(p_allowed_categories)) then raise exception 'Correction category is invalid for this command.' using errcode='23514'; end if;
  return v_case;
end
$function$;


alter table public.food_barcodes
  add constraint food_barcodes_gtin_gs1_mod10_check check (private.food_catalog_gtin_is_valid(gtin));

-- Barcode correction is append-only governance evidence; the legacy GTIN row is not destructively reassigned.
create table public.food_catalog_barcode_corrections (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.food_items(id) on delete restrict,
  gtin text not null check (private.food_catalog_gtin_is_valid(gtin)),
  correction_action text not null check (correction_action in ('assign','remove')),
  source_record_id uuid,
  policy_version text not null,
  authority_reference text not null,
  created_at timestamptz not null default now(),
  foreign key (source_record_id,food_id) references public.food_source_records(id,food_id) on delete restrict
);
create trigger food_catalog_barcode_corrections_immutable before update or delete on public.food_catalog_barcode_corrections for each row execute function private.reject_food_catalog_governance_immutable_mutation();

create or replace function private.food_catalog_governance_lock_authority(
  p_food_id uuid,p_kind text,p_key text,p_expected_revision bigint,p_expected_fact_id uuid
) returns public.food_catalog_governance_authority_revisions language plpgsql security definer set search_path='' as $function$
declare v_head public.food_catalog_governance_authority_revisions%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_food_id::text||'|'||p_kind||'|'||coalesce(p_key,''),0));
  select * into v_head from public.food_catalog_governance_authority_revisions
  where food_id=p_food_id and authority_kind=p_kind and authority_key=coalesce(p_key,'') for update;
  if not found then
    if coalesce(p_expected_revision,0)<>0 then raise exception 'Food governance authority CAS conflict.' using errcode='40001'; end if;
    if p_expected_fact_id is not null then
      if not (case p_kind
        when 'nutrition_revision' then exists(select 1 from public.food_nutrition_revisions f where f.id=p_expected_fact_id and f.food_id=p_food_id)
        when 'serving_option' then exists(select 1 from public.food_serving_options f where f.id=p_expected_fact_id and f.food_id=p_food_id)
        when 'name_fact' then exists(select 1 from public.food_names f where f.id=p_expected_fact_id and f.food_id=p_food_id)
        when 'barcode_correction' then exists(select 1 from public.food_barcodes f where f.id=p_expected_fact_id and f.food_id=p_food_id) or exists(select 1 from public.food_catalog_barcode_corrections f where f.id=p_expected_fact_id and f.food_id=p_food_id)
        when 'taxonomy_assignment' then exists(select 1 from public.food_taxonomy_assignments f where f.id=p_expected_fact_id and f.food_id=p_food_id)
        when 'market_assignment' then exists(select 1 from public.food_market_assignments f where f.id=p_expected_fact_id and f.food_id=p_food_id)
        when 'identity_merge' then exists(select 1 from public.food_merge_events f where f.id=p_expected_fact_id and f.source_food_id=p_food_id)
        when 'lifecycle' then exists(select 1 from public.food_catalog_governance_lifecycle_events f where f.id=p_expected_fact_id and f.food_id=p_food_id)
        else false end) then raise exception 'Expected Food governance authority fact does not belong to target Food/kind.' using errcode='23514'; end if;
    end if;
    v_head.food_id:=p_food_id; v_head.authority_kind:=p_kind; v_head.authority_key:=coalesce(p_key,''); v_head.authority_revision:=0; v_head.current_fact_id:=p_expected_fact_id;
  elsif v_head.authority_revision<>coalesce(p_expected_revision,0) or v_head.current_fact_id is distinct from p_expected_fact_id then
    raise exception 'Food governance authority CAS conflict.' using errcode='40001';
  end if;
  return v_head;
end
$function$;

create or replace function private.food_catalog_governance_advance_authority(p_food_id uuid,p_kind text,p_key text,p_fact_id uuid)
returns bigint language plpgsql security definer set search_path='' as $function$
declare v_revision bigint;
begin
  insert into public.food_catalog_governance_authority_revisions(food_id,authority_kind,authority_key,authority_revision,current_fact_id)
  values(p_food_id,p_kind,coalesce(p_key,''),1,p_fact_id)
  on conflict(food_id,authority_kind,authority_key) do update
    set authority_revision=public.food_catalog_governance_authority_revisions.authority_revision+1,current_fact_id=excluded.current_fact_id,updated_at=clock_timestamp()
  returning authority_revision into v_revision;
  return v_revision;
end
$function$;

-- Owner-only principal provisioning/revocation. This is the bootstrap-safe management surface after migration.
create or replace function public.food_catalog_manage_governance_principal(
  p_operation_id uuid,p_target_principal_type text,p_target_subject_id text,p_role_class text,p_capabilities text[],p_reason text,p_service_identity text default null
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_actor uuid; v_target uuid; v_existing_role text; v_replay jsonb; v_cap text; v_result jsonb; v_service_hash text; v_policy text;
begin
  v_actor:=private.food_catalog_governance_principal_for_user();
  v_policy:=private.food_catalog_governance_current_policy_version();
  v_service_hash:=case when p_target_principal_type='service' then encode(extensions.digest(convert_to(btrim(coalesce(p_service_identity,'')),'UTF8'),'sha256'),'hex') else null end;
  v_replay:=private.food_catalog_governance_begin_operation(p_operation_id,v_actor,'food.governance.manage_principals','food_catalog_manage_governance_principal',null,null,v_policy,p_reason,
    jsonb_build_object('principalType',p_target_principal_type,'subjectId',btrim(p_target_subject_id),'roleClass',p_role_class,'capabilities',to_jsonb(coalesce(p_capabilities,'{}'::text[])),'serviceIdentitySha256',v_service_hash));
  if v_replay is not null then return v_replay; end if;
  if p_target_principal_type not in ('human','service') or length(btrim(coalesce(p_target_subject_id,'')))=0 then raise exception 'Invalid governance principal identity.' using errcode='22023'; end if;
  if (p_target_principal_type='service' and (p_role_class<>'service' or length(btrim(coalesce(p_service_identity,'')))=0)) or (p_target_principal_type='human' and p_role_class not in ('owner','curator')) then raise exception 'Governance principal role/type or service identity is invalid.' using errcode='23514'; end if;
  select id,role_class into v_target,v_existing_role from public.food_catalog_governance_principals where principal_type=p_target_principal_type and subject_id=btrim(p_target_subject_id) for update;
  if v_target is not null and v_existing_role='owner' and p_role_class<>'owner' then perform private.food_catalog_governance_assert_recovery_survives(v_target); end if;
  insert into public.food_catalog_governance_principals(principal_type,subject_id,service_identity_sha256,role_class,active,revoked_at)
  values(p_target_principal_type,btrim(p_target_subject_id),v_service_hash,p_role_class,true,null)
  on conflict(principal_type,subject_id) do update set service_identity_sha256=excluded.service_identity_sha256,role_class=excluded.role_class,active=true,revoked_at=null
  returning id into v_target;
  if p_role_class<>'owner' then
    update public.food_catalog_governance_capability_assignments set revoked_at=clock_timestamp(),revoked_by_principal_id=v_actor
    where principal_id=v_target and capability='food.governance.manage_principals' and revoked_at is null;
  end if;
  foreach v_cap in array coalesce(p_capabilities,'{}'::text[]) loop
    if v_cap='food.governance.manage_principals' and p_role_class<>'owner' then raise exception 'Only Owner principals may receive principal management capability.' using errcode='23514'; end if;
    if p_target_principal_type='service' and v_cap not in ('food.correction.report','food.evidence.attach','food.ingestion.propose') then raise exception 'Service principal governance escalation is forbidden.' using errcode='23514'; end if;
    insert into public.food_catalog_governance_capability_assignments(principal_id,capability,granted_by_principal_id,reason)
    values(v_target,v_cap,v_actor,btrim(p_reason)) on conflict(principal_id,capability) where revoked_at is null do nothing;
  end loop;
  v_result:=jsonb_build_object('principalId',v_target,'principalType',p_target_principal_type,'roleClass',p_role_class);
  return private.food_catalog_governance_finish_operation(p_operation_id,null,v_target,'{}'::uuid[],v_result,'food.governance.principal.managed',jsonb_build_object('principalId',v_target));
end
$function$;

create or replace function public.food_catalog_revoke_governance_capability(
  p_operation_id uuid,p_target_principal_id uuid,p_capability text,p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_actor uuid; v_replay jsonb; v_assignment uuid; v_result jsonb; v_policy text;
begin
  v_actor:=private.food_catalog_governance_principal_for_user();
  v_policy:=private.food_catalog_governance_current_policy_version();
  v_replay:=private.food_catalog_governance_begin_operation(p_operation_id,v_actor,'food.governance.manage_principals','food_catalog_revoke_governance_capability',null,null,v_policy,p_reason,jsonb_build_object('targetPrincipalId',p_target_principal_id,'capability',p_capability));
  if v_replay is not null then return v_replay; end if;
  if p_capability='food.governance.manage_principals' and exists(select 1 from public.food_catalog_governance_principals where id=p_target_principal_id and principal_type='human' and role_class='owner' and active and revoked_at is null) then
    perform private.food_catalog_governance_assert_recovery_survives(p_target_principal_id);
  end if;
  update public.food_catalog_governance_capability_assignments set revoked_at=clock_timestamp(),revoked_by_principal_id=v_actor
  where principal_id=p_target_principal_id and capability=p_capability and revoked_at is null returning id into v_assignment;
  if v_assignment is null then raise exception 'Active capability assignment not found.' using errcode='23503'; end if;
  v_result:=jsonb_build_object('principalId',p_target_principal_id,'capability',p_capability,'revoked',true);
  return private.food_catalog_governance_finish_operation(p_operation_id,v_assignment,null,'{}'::uuid[],v_result,'food.governance.capability.revoked',jsonb_build_object('principalId',p_target_principal_id,'capability',p_capability));
end
$function$;

-- Future provider adapters may propose bounded governance work as constrained Service principals.
-- A proposal is immutable evidence only: it cannot approve/apply a correction or mutate canonical Food truth.
create or replace function public.food_catalog_service_propose_correction(
  p_operation_id uuid,p_principal_id uuid,p_food_id uuid,p_category text,p_claim_key text,p_description text,
  p_evidence jsonb default '{}'::jsonb,p_policy_version text default null,p_reason text default 'service proposal'
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_actor uuid; v_policy text; v_replay jsonb; v_proposal uuid; v_result jsonb;
begin
  v_actor:=private.food_catalog_governance_service_principal_for_request();
  if p_principal_id is distinct from v_actor then raise exception 'Service Food governance principal identity mismatch.' using errcode='42501'; end if;
  v_policy:=private.food_catalog_governance_current_policy_version();
  if p_policy_version is not null and btrim(p_policy_version)<>v_policy then raise exception 'Unsupported governance policy version.' using errcode='22023'; end if;
  if p_category not in ('wrong_nutrition','missing_nutrition','wrong_serving','missing_serving','wrong_name','wrong_translation','wrong_barcode','wrong_taxonomy','wrong_market_relevance','duplicate_food','wrong_variant','outdated_product','source_conflict','other') then raise exception 'Invalid service correction proposal category.' using errcode='22023'; end if;
  if length(btrim(coalesce(p_claim_key,''))) not between 1 and 240 or length(btrim(coalesce(p_description,''))) not between 1 and 2000 then raise exception 'Service correction proposal text is outside allowed bounds.' using errcode='22023'; end if;
  if jsonb_typeof(coalesce(p_evidence,'{}'::jsonb))<>'object' or pg_column_size(coalesce(p_evidence,'{}'::jsonb))>8192 then raise exception 'Service correction proposal evidence must remain bounded.' using errcode='22023'; end if;
  perform private.food_catalog_governance_validate_bounded_evidence(coalesce(p_evidence,'{}'::jsonb),0);
  perform 1 from public.food_items where id=p_food_id and is_global=true; if not found then raise exception 'Global Food not found for service proposal.' using errcode='23503'; end if;
  v_replay:=private.food_catalog_governance_begin_operation(p_operation_id,v_actor,'food.ingestion.propose','food_catalog_service_propose_correction',p_food_id,null,v_policy,p_reason,jsonb_build_object('foodId',p_food_id,'category',p_category,'claimKey',btrim(p_claim_key),'description',btrim(p_description),'evidence',coalesce(p_evidence,'{}'::jsonb)));
  if v_replay is not null then return v_replay; end if;
  insert into public.food_catalog_service_proposals(operation_id,principal_id,food_id,category,claim_key,description,evidence,policy_version)
  values(p_operation_id,v_actor,p_food_id,p_category,btrim(p_claim_key),btrim(p_description),coalesce(p_evidence,'{}'::jsonb),v_policy) returning id into v_proposal;
  v_result:=jsonb_build_object('proposalId',v_proposal,'foodId',p_food_id,'canonicalMutation',false);
  return private.food_catalog_governance_finish_operation(p_operation_id,null,null,'{}'::uuid[],v_result,'food.governance.service.proposed',jsonb_build_object('proposalId',v_proposal,'foodId',p_food_id,'category',p_category));
end
$function$;

-- Member reporting is intentionally not global canonical mutation authority.
create or replace function public.food_catalog_report_correction(
  p_food_id uuid,p_category text,p_claim_key text,p_description text,p_evidence jsonb default '{}'::jsonb,p_policy_version text default null
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_user uuid; v_policy text; v_issue text; v_case uuid; v_report uuid;
begin
  v_user:=auth.uid(); if v_user is null then raise exception 'Authenticated reporter is required.' using errcode='42501'; end if;
  v_policy:=private.food_catalog_governance_current_policy_version();
  if p_policy_version is not null and btrim(p_policy_version)<>v_policy then raise exception 'Unsupported governance policy version.' using errcode='22023'; end if;
  if p_category not in ('wrong_nutrition','missing_nutrition','wrong_serving','missing_serving','wrong_name','wrong_translation','wrong_barcode','wrong_taxonomy','wrong_market_relevance','duplicate_food','wrong_variant','outdated_product','source_conflict','other') then raise exception 'Invalid correction category.' using errcode='22023'; end if;
  if length(btrim(coalesce(p_claim_key,''))) not between 1 and 240 or length(btrim(coalesce(p_description,''))) not between 1 and 2000 then raise exception 'Correction report text is outside allowed bounds.' using errcode='22023'; end if;
  if jsonb_typeof(coalesce(p_evidence,'{}'::jsonb))<>'object' or pg_column_size(coalesce(p_evidence,'{}'::jsonb))>8192 then raise exception 'Correction report evidence must remain bounded.' using errcode='22023'; end if;
  perform private.food_catalog_governance_validate_bounded_evidence(coalesce(p_evidence,'{}'::jsonb),0);
  perform 1 from public.food_items where id=p_food_id and is_global=true; if not found then raise exception 'Global Food not found.' using errcode='23503'; end if;
  v_issue:=lower(p_food_id::text||'|'||p_category||'|'||regexp_replace(btrim(p_claim_key),'\s+',' ','g'));
  perform pg_advisory_xact_lock(hashtextextended(v_issue,0));
  select id into v_case from public.food_catalog_correction_cases where issue_key=v_issue and state in ('reported','under_review','approved') order by created_at,id limit 1;
  if v_case is null then
    insert into public.food_catalog_correction_cases(food_id,category,claim_key,issue_key,policy_version) values(p_food_id,p_category,btrim(p_claim_key),v_issue,v_policy) returning id into v_case;
    insert into public.food_catalog_correction_events(case_id,from_state,to_state,state_revision,policy_version,reason) values(v_case,null,'reported',0,v_policy,'member-report');
  end if;
  insert into public.food_catalog_correction_reports(case_id,reporter_user_id,description,evidence) values(v_case,v_user,btrim(p_description),coalesce(p_evidence,'{}'::jsonb)) returning id into v_report;
  return jsonb_build_object('caseId',v_case,'reportId',v_report,'canonicalMutation',false,'policyVersion',(select policy_version from public.food_catalog_correction_cases where id=v_case));
end
$function$;

create or replace function public.food_catalog_attach_correction_evidence(
  p_operation_id uuid,p_case_id uuid,p_evidence_type text,p_source_record_id uuid,p_evidence_reference text,p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_actor uuid; v_case public.food_catalog_correction_cases%rowtype; v_replay jsonb; v_evidence uuid; v_result jsonb;
begin
  v_actor:=private.food_catalog_governance_principal_for_user();
  select * into v_case from public.food_catalog_correction_cases where id=p_case_id;
  if not found then raise exception 'Correction case not found.' using errcode='23503'; end if;
  v_replay:=private.food_catalog_governance_begin_operation(p_operation_id,v_actor,'food.evidence.attach','food_catalog_attach_correction_evidence',v_case.food_id,p_case_id,v_case.policy_version,p_reason,jsonb_build_object('caseId',p_case_id,'evidenceType',p_evidence_type,'sourceRecordId',p_source_record_id,'reference',nullif(btrim(coalesce(p_evidence_reference,'')),'')));
  if v_replay is not null then return v_replay; end if;
  select * into v_case from public.food_catalog_correction_cases where id=p_case_id for update;
  if v_case.state not in ('reported','under_review') then raise exception 'Evidence is frozen after a governance decision.' using errcode='23514'; end if;
  if not private.food_catalog_governance_evidence_type_allowed(v_case.policy_version,v_case.category,p_evidence_type) then raise exception 'Evidence type is not allowed for this correction category.' using errcode='23514'; end if;
  if p_source_record_id is not null then
    perform 1 from public.food_source_records where id=p_source_record_id and food_id=v_case.food_id;
    if not found then raise exception 'Source correction evidence must belong to the same Food.' using errcode='23514'; end if;
  elsif length(btrim(coalesce(p_evidence_reference,''))) not between 1 and 500 then raise exception 'Inspectable evidence reference is required.' using errcode='22023'; end if;
  insert into public.food_catalog_correction_evidence(case_id,food_id,evidence_type,source_record_id,evidence_reference,attached_by_principal_id)
  values(p_case_id,v_case.food_id,p_evidence_type,p_source_record_id,nullif(btrim(coalesce(p_evidence_reference,'')),''),v_actor) returning id into v_evidence;
  v_result:=jsonb_build_object('evidenceId',v_evidence,'caseId',p_case_id);
  return private.food_catalog_governance_finish_operation(p_operation_id,null,v_evidence,array[v_evidence],v_result,'food.correction.evidence.attached',jsonb_build_object('caseId',p_case_id,'evidenceId',v_evidence));
end
$function$;

create or replace function public.food_catalog_transition_correction_case(
  p_operation_id uuid,p_case_id uuid,p_expected_state text,p_expected_revision bigint,p_to_state text,p_reason text,
  p_expected_authority_kind text default null,p_expected_authority_key text default null,p_expected_authority_revision bigint default null,p_expected_authority_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_actor uuid; v_case public.food_catalog_correction_cases%rowtype; v_cap text; v_replay jsonb; v_next bigint; v_result jsonb;
begin
  v_actor:=private.food_catalog_governance_principal_for_user();
  select * into v_case from public.food_catalog_correction_cases where id=p_case_id;
  if not found then raise exception 'Correction case not found.' using errcode='23503'; end if;
  v_cap:=case when p_to_state='approved' then 'food.correction.approve' else 'food.correction.review' end;
  v_replay:=private.food_catalog_governance_begin_operation(p_operation_id,v_actor,v_cap,'food_catalog_transition_correction_case',v_case.food_id,p_case_id,v_case.policy_version,p_reason,
    jsonb_build_object('caseId',p_case_id,'from',p_expected_state,'to',p_to_state,'expectedRevision',p_expected_revision,'expectedAuthorityKind',p_expected_authority_kind,'expectedAuthorityKey',p_expected_authority_key,'expectedAuthorityRevision',p_expected_authority_revision,'expectedAuthorityId',p_expected_authority_id));
  if v_replay is not null then return v_replay; end if;
  select * into v_case from public.food_catalog_correction_cases where id=p_case_id for update;
  if v_case.state<>p_expected_state or v_case.state_revision<>p_expected_revision then raise exception 'Correction case CAS conflict.' using errcode='40001'; end if;
  if not ((p_expected_state='reported' and p_to_state in ('under_review','rejected')) or (p_expected_state='under_review' and p_to_state in ('approved','rejected'))) then raise exception 'Invalid correction transition.' using errcode='23514'; end if;
  if p_to_state='approved' and private.food_catalog_governance_case_evidence_required(v_case.policy_version,v_case.category)
     and not exists(select 1 from public.food_catalog_correction_evidence e where e.case_id=p_case_id) then
    raise exception 'Correction approval requires category-policy evidence.' using errcode='23514';
  end if;
  v_next:=v_case.state_revision+1;
  update public.food_catalog_correction_cases set state=p_to_state,state_revision=v_next,updated_at=clock_timestamp(),
    approved_at=case when p_to_state='approved' then clock_timestamp() else approved_at end,
    rejected_at=case when p_to_state='rejected' then clock_timestamp() else rejected_at end,
    expected_authority_kind=case when p_to_state='approved' then p_expected_authority_kind else expected_authority_kind end,
    expected_authority_key=case when p_to_state='approved' then coalesce(p_expected_authority_key,'') else expected_authority_key end,
    expected_authority_revision=case when p_to_state='approved' then coalesce(p_expected_authority_revision,0) else expected_authority_revision end,
    expected_authority_id=case when p_to_state='approved' then p_expected_authority_id else expected_authority_id end
  where id=p_case_id;
  insert into public.food_catalog_correction_events(case_id,from_state,to_state,state_revision,principal_id,operation_id,policy_version,reason)
  values(p_case_id,p_expected_state,p_to_state,v_next,v_actor,p_operation_id,v_case.policy_version,btrim(p_reason));
  v_result:=jsonb_build_object('caseId',p_case_id,'state',p_to_state,'stateRevision',v_next);
  return private.food_catalog_governance_finish_operation(p_operation_id,null,null,array(select id from public.food_catalog_correction_evidence where case_id=p_case_id order by id),v_result,'food.correction.transitioned',jsonb_build_object('caseId',p_case_id,'state',p_to_state));
end
$function$;

create or replace function private.food_catalog_governance_prepare_apply(
  p_operation_id uuid,p_principal_id uuid,p_capability text,p_command_name text,p_case_id uuid,p_food_id uuid,p_expected_case_revision bigint,p_expected_authority_revision bigint,p_expected_authority_id uuid,p_authority_kind text,p_authority_key text,p_reason text,p_semantics jsonb
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_case public.food_catalog_correction_cases%rowtype; v_replay jsonb; v_head public.food_catalog_governance_authority_revisions%rowtype;
begin
  perform private.food_catalog_governance_assert_capability(p_principal_id,'food.correction.apply');
  select * into v_case from public.food_catalog_correction_cases where id=p_case_id;
  if not found or v_case.food_id<>p_food_id then raise exception 'Correction case not found for target Food.' using errcode='23503'; end if;
  v_replay:=private.food_catalog_governance_begin_operation(p_operation_id,p_principal_id,p_capability,p_command_name,p_food_id,p_case_id,v_case.policy_version,p_reason,p_semantics);
  if v_replay is not null then return jsonb_build_object('replay',true,'result',v_replay); end if;
  v_case:=private.food_catalog_governance_require_case(p_case_id,p_food_id,p_expected_case_revision,'approved',case p_command_name
    when 'food_catalog_apply_nutrition_correction' then array['wrong_nutrition','missing_nutrition','source_conflict','other']
    when 'food_catalog_apply_serving_correction' then array['wrong_serving','missing_serving','source_conflict','other']
    when 'food_catalog_apply_name_correction' then array['wrong_name','wrong_translation','source_conflict','other']
    when 'food_catalog_apply_barcode_correction' then array['wrong_barcode','wrong_variant','source_conflict','other']
    when 'food_catalog_apply_taxonomy_correction' then array['wrong_taxonomy','source_conflict','other']
    when 'food_catalog_apply_market_correction' then array['wrong_market_relevance','source_conflict','other'] else array[]::text[] end);
  if v_case.expected_authority_kind is distinct from p_authority_kind or coalesce(v_case.expected_authority_key,'')<>coalesce(p_authority_key,'') or coalesce(v_case.expected_authority_revision,0)<>coalesce(p_expected_authority_revision,0) or v_case.expected_authority_id is distinct from p_expected_authority_id then
    raise exception 'Correction approved authority CAS does not match apply command.' using errcode='40001';
  end if;
  v_head:=private.food_catalog_governance_lock_authority(p_food_id,p_authority_kind,p_authority_key,p_expected_authority_revision,p_expected_authority_id);
  return jsonb_build_object('replay',false);
end
$function$;

create or replace function private.food_catalog_governance_mark_case_applied(p_case_id uuid,p_operation_id uuid,p_principal_id uuid,p_reason text)
returns bigint language plpgsql security definer set search_path='' as $function$
declare v_case public.food_catalog_correction_cases%rowtype; v_next bigint;
begin
  select * into v_case from public.food_catalog_correction_cases where id=p_case_id for update;
  if v_case.state<>'approved' then raise exception 'Correction case must be approved before apply.' using errcode='40001'; end if;
  v_next:=v_case.state_revision+1;
  update public.food_catalog_correction_cases set state='applied',state_revision=v_next,applied_at=clock_timestamp(),updated_at=clock_timestamp() where id=p_case_id;
  insert into public.food_catalog_correction_events(case_id,from_state,to_state,state_revision,principal_id,operation_id,policy_version,reason)
  values(p_case_id,'approved','applied',v_next,p_principal_id,p_operation_id,v_case.policy_version,btrim(p_reason));
  return v_next;
end
$function$;

create or replace function public.food_catalog_apply_nutrition_correction(
  p_operation_id uuid,p_case_id uuid,p_food_id uuid,p_expected_case_revision bigint,p_expected_authority_revision bigint,p_expected_authority_id uuid,
  p_calories numeric,p_protein_g numeric,p_carbs_g numeric,p_fat_g numeric,p_saturated_fat_g numeric,p_fiber_g numeric,p_sugars_g numeric,p_sodium_mg numeric,
  p_basis_amount numeric,p_basis_unit text,p_source_record_id uuid,p_nutrient_mapping_version text,p_reason text,p_break_glass_reason text default null
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_actor uuid; v_pre jsonb; v_new uuid:=gen_random_uuid(); v_revision bigint; v_case_revision bigint; v_result jsonb; v_evidence uuid[]; v_fact_revision integer;
begin
  v_actor:=private.food_catalog_governance_principal_for_user();
  if p_break_glass_reason is not null then perform private.food_catalog_governance_assert_capability(v_actor,'food.break_glass'); if length(btrim(p_break_glass_reason))=0 then raise exception 'Break-glass reason is required.' using errcode='22023'; end if; end if;
  v_pre:=private.food_catalog_governance_prepare_apply(p_operation_id,v_actor,'food.nutrition.correct','food_catalog_apply_nutrition_correction',p_case_id,p_food_id,p_expected_case_revision,p_expected_authority_revision,p_expected_authority_id,'nutrition_revision','',p_reason,
    jsonb_build_object('caseId',p_case_id,'foodId',p_food_id,'expectedCaseRevision',p_expected_case_revision,'expectedAuthorityRevision',p_expected_authority_revision,'expectedAuthorityId',p_expected_authority_id,'nutrition',jsonb_build_object('calories',p_calories,'protein_g',p_protein_g,'carbs_g',p_carbs_g,'fat_g',p_fat_g,'saturated_fat_g',p_saturated_fat_g,'fiber_g',p_fiber_g,'sugars_g',p_sugars_g,'sodium_mg',p_sodium_mg),'basisAmount',p_basis_amount,'basisUnit',p_basis_unit,'sourceRecordId',p_source_record_id,'mappingVersion',p_nutrient_mapping_version,'breakGlassReason',p_break_glass_reason));
  if (v_pre->>'replay')::boolean then return v_pre->'result'; end if;
  if p_source_record_id is not null then perform 1 from public.food_source_records where id=p_source_record_id and food_id=p_food_id; if not found then raise exception 'Nutrition source evidence belongs to a different Food.' using errcode='23514'; end if; end if;
  if p_expected_authority_id is null then
    if exists(select 1 from public.food_nutrition_revisions where food_id=p_food_id) then raise exception 'Explicit predecessor nutrition revision is required for correction CAS.' using errcode='40001'; end if;
    v_fact_revision:=1;
  else
    select revision_number+1 into v_fact_revision from public.food_nutrition_revisions where id=p_expected_authority_id and food_id=p_food_id;
    if v_fact_revision is null then raise exception 'Expected predecessor nutrition revision not found.' using errcode='40001'; end if;
  end if;
  insert into public.food_nutrition_revisions(id,food_id,revision_number,calories,protein_g,carbs_g,fat_g,saturated_fat_g,fiber_g,sugars_g,sodium_mg,basis_amount,basis_unit,source_record_id,nutrient_mapping_version,authority_reference)
  values(v_new,p_food_id,v_fact_revision,p_calories,p_protein_g,p_carbs_g,p_fat_g,p_saturated_fat_g,p_fiber_g,p_sugars_g,p_sodium_mg,p_basis_amount,p_basis_unit,p_source_record_id,btrim(p_nutrient_mapping_version),'plan6:'||p_operation_id::text);
  v_revision:=private.food_catalog_governance_advance_authority(p_food_id,'nutrition_revision','',v_new);
  v_case_revision:=private.food_catalog_governance_mark_case_applied(p_case_id,p_operation_id,v_actor,p_reason);
  select coalesce(array_agg(id order by id),'{}'::uuid[]) into v_evidence from public.food_catalog_correction_evidence where case_id=p_case_id;
  v_result:=jsonb_build_object('foodId',p_food_id,'nutritionRevisionId',v_new,'authorityRevision',v_revision,'caseRevision',v_case_revision);
  return private.food_catalog_governance_finish_operation(p_operation_id,p_expected_authority_id,v_new,v_evidence,v_result,'food.correction.applied',jsonb_build_object('foodId',p_food_id,'authorityKind','nutrition_revision','factId',v_new),p_break_glass_reason);
end
$function$;

create or replace function public.food_catalog_apply_serving_correction(
  p_operation_id uuid,p_case_id uuid,p_food_id uuid,p_serving_lineage_id uuid,p_expected_case_revision bigint,p_expected_authority_revision bigint,p_expected_authority_id uuid,
  p_label text,p_amount numeric,p_unit_code text,p_gram_weight numeric,p_source_record_id uuid,p_source_portion_code text,p_evidence_class text,p_source_primary boolean,p_reason text,p_break_glass_reason text default null
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_actor uuid; v_pre jsonb; v_new uuid:=gen_random_uuid(); v_revision bigint; v_case_revision bigint; v_result jsonb; v_evidence uuid[]; v_lineage_food uuid;
begin
  v_actor:=private.food_catalog_governance_principal_for_user();
  if p_serving_lineage_id is null then raise exception 'Serving lineage ID is required.' using errcode='22023'; end if;
  if p_break_glass_reason is not null then perform private.food_catalog_governance_assert_capability(v_actor,'food.break_glass'); if length(btrim(p_break_glass_reason))=0 then raise exception 'Break-glass reason is required.' using errcode='22023'; end if; end if;
  v_pre:=private.food_catalog_governance_prepare_apply(p_operation_id,v_actor,'food.serving.correct','food_catalog_apply_serving_correction',p_case_id,p_food_id,p_expected_case_revision,p_expected_authority_revision,p_expected_authority_id,'serving_option',p_serving_lineage_id::text,p_reason,
    jsonb_build_object('caseId',p_case_id,'foodId',p_food_id,'servingLineageId',p_serving_lineage_id,'expectedCaseRevision',p_expected_case_revision,'expectedAuthorityRevision',p_expected_authority_revision,'expectedAuthorityId',p_expected_authority_id,'label',p_label,'amount',p_amount,'unitCode',p_unit_code,'gramWeight',p_gram_weight,'sourceRecordId',p_source_record_id,'sourcePortionCode',p_source_portion_code,'evidenceClass',p_evidence_class,'sourcePrimary',p_source_primary,'breakGlassReason',p_break_glass_reason));
  if (v_pre->>'replay')::boolean then return v_pre->'result'; end if;
  select food_id into v_lineage_food from public.food_catalog_serving_fact_lineages where lineage_id=p_serving_lineage_id for update;
  if v_lineage_food is null then
    insert into public.food_catalog_serving_fact_lineages(lineage_id,food_id) values(p_serving_lineage_id,p_food_id);
    if p_expected_authority_id is not null then
      perform 1 from public.food_serving_options where id=p_expected_authority_id and food_id=p_food_id;
      if not found then raise exception 'Expected predecessor serving option not found.' using errcode='40001'; end if;
      insert into public.food_catalog_serving_fact_revisions(serving_option_id,lineage_id,predecessor_serving_option_id) values(p_expected_authority_id,p_serving_lineage_id,null) on conflict(serving_option_id) do nothing;
    end if;
  elsif v_lineage_food<>p_food_id then raise exception 'Serving lineage belongs to a different Food.' using errcode='23514'; end if;
  if p_expected_authority_id is not null and not exists(select 1 from public.food_catalog_serving_fact_revisions where serving_option_id=p_expected_authority_id and lineage_id=p_serving_lineage_id) then raise exception 'Expected serving predecessor belongs to a different lineage.' using errcode='40001'; end if;
  insert into public.food_serving_options(id,food_id,label,amount,unit_code,gram_weight,source_record_id,source_portion_code,evidence_class,source_primary,authority_reference)
  values(v_new,p_food_id,btrim(p_label),p_amount,btrim(p_unit_code),p_gram_weight,p_source_record_id,nullif(btrim(coalesce(p_source_portion_code,'')),''),p_evidence_class,coalesce(p_source_primary,false),'plan6:'||p_operation_id::text);
  insert into public.food_catalog_serving_fact_revisions(serving_option_id,lineage_id,predecessor_serving_option_id) values(v_new,p_serving_lineage_id,p_expected_authority_id);
  v_revision:=private.food_catalog_governance_advance_authority(p_food_id,'serving_option',p_serving_lineage_id::text,v_new);
  v_case_revision:=private.food_catalog_governance_mark_case_applied(p_case_id,p_operation_id,v_actor,p_reason);
  select coalesce(array_agg(id order by id),'{}'::uuid[]) into v_evidence from public.food_catalog_correction_evidence where case_id=p_case_id;
  v_result:=jsonb_build_object('foodId',p_food_id,'servingLineageId',p_serving_lineage_id,'servingOptionId',v_new,'authorityRevision',v_revision,'caseRevision',v_case_revision);
  return private.food_catalog_governance_finish_operation(p_operation_id,p_expected_authority_id,v_new,v_evidence,v_result,'food.correction.applied',jsonb_build_object('foodId',p_food_id,'authorityKind','serving_option','authorityKey',p_serving_lineage_id::text,'factId',v_new),p_break_glass_reason);
end
$function$;

create or replace function public.food_catalog_apply_name_correction(
  p_operation_id uuid,p_case_id uuid,p_food_id uuid,p_expected_case_revision bigint,p_expected_authority_revision bigint,p_expected_authority_id uuid,
  p_language_tag text,p_name_role text,p_name_text text,p_normalized_text text,p_script_code text,p_source_record_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_actor uuid; v_key text; v_pre jsonb; v_new uuid:=gen_random_uuid(); v_revision bigint; v_case_revision bigint; v_result jsonb; v_evidence uuid[]; v_policy text;
begin
  v_actor:=private.food_catalog_governance_principal_for_user(); v_key:=lower(btrim(p_language_tag)||':'||btrim(p_name_role));
  v_pre:=private.food_catalog_governance_prepare_apply(p_operation_id,v_actor,'food.name.correct','food_catalog_apply_name_correction',p_case_id,p_food_id,p_expected_case_revision,p_expected_authority_revision,p_expected_authority_id,'name_fact',v_key,p_reason,
    jsonb_build_object('caseId',p_case_id,'foodId',p_food_id,'expectedCaseRevision',p_expected_case_revision,'expectedAuthorityRevision',p_expected_authority_revision,'expectedAuthorityId',p_expected_authority_id,'languageTag',p_language_tag,'nameRole',p_name_role,'nameText',p_name_text,'normalizedText',p_normalized_text,'scriptCode',p_script_code,'sourceRecordId',p_source_record_id));
  if (v_pre->>'replay')::boolean then return v_pre->'result'; end if;
  select policy_version into v_policy from public.food_catalog_correction_cases where id=p_case_id;
  insert into public.food_names(id,food_id,language_tag,name_role,name_text,normalized_text,script_code,origin,source_record_id,policy_version)
  values(v_new,p_food_id,btrim(p_language_tag),p_name_role,btrim(p_name_text),btrim(p_normalized_text),nullif(btrim(coalesce(p_script_code,'')),''),'curated',p_source_record_id,v_policy);
  v_revision:=private.food_catalog_governance_advance_authority(p_food_id,'name_fact',v_key,v_new);
  v_case_revision:=private.food_catalog_governance_mark_case_applied(p_case_id,p_operation_id,v_actor,p_reason);
  select coalesce(array_agg(id order by id),'{}'::uuid[]) into v_evidence from public.food_catalog_correction_evidence where case_id=p_case_id;
  v_result:=jsonb_build_object('foodId',p_food_id,'nameId',v_new,'authorityRevision',v_revision,'caseRevision',v_case_revision);
  return private.food_catalog_governance_finish_operation(p_operation_id,p_expected_authority_id,v_new,v_evidence,v_result,'food.correction.applied',jsonb_build_object('foodId',p_food_id,'authorityKind','name_fact','factId',v_new));
end
$function$;

create or replace function public.food_catalog_apply_barcode_correction(
  p_operation_id uuid,p_case_id uuid,p_food_id uuid,p_expected_case_revision bigint,p_expected_authority_revision bigint,p_expected_authority_id uuid,
  p_gtin text,p_action text,p_source_record_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_actor uuid; v_key text:=btrim(p_gtin); v_pre jsonb; v_new uuid:=gen_random_uuid(); v_revision bigint; v_case_revision bigint; v_result jsonb; v_evidence uuid[]; v_policy text; v_effective uuid;
begin
  v_actor:=private.food_catalog_governance_principal_for_user();
  if not private.food_catalog_gtin_is_valid(v_key) then raise exception 'GTIN fails supported shape or GS1 Mod-10 validation.' using errcode='23514'; end if;
  v_pre:=private.food_catalog_governance_prepare_apply(p_operation_id,v_actor,'food.barcode.correct','food_catalog_apply_barcode_correction',p_case_id,p_food_id,p_expected_case_revision,p_expected_authority_revision,p_expected_authority_id,'barcode_correction',v_key,p_reason,jsonb_build_object('caseId',p_case_id,'foodId',p_food_id,'expectedCaseRevision',p_expected_case_revision,'expectedAuthorityRevision',p_expected_authority_revision,'expectedAuthorityId',p_expected_authority_id,'gtin',v_key,'action',p_action,'sourceRecordId',p_source_record_id));
  if (v_pre->>'replay')::boolean then return v_pre->'result'; end if;
  if p_action not in ('assign','remove') then raise exception 'Invalid barcode correction action.' using errcode='22023'; end if;
  if p_source_record_id is not null and not exists(select 1 from public.food_source_records where id=p_source_record_id and food_id=p_food_id) then raise exception 'Barcode source record belongs to a different Food.' using errcode='23514'; end if;
  if p_action='assign' then
    if exists(select 1 from public.food_barcodes where gtin=v_key and food_id<>p_food_id) then raise exception 'GTIN is owned by a different canonical Food.' using errcode='23514'; end if;
    insert into public.food_barcodes(food_id,gtin,source_record_id) values(p_food_id,v_key,p_source_record_id)
      on conflict(gtin) do update set source_record_id=coalesce(excluded.source_record_id,public.food_barcodes.source_record_id),updated_at=clock_timestamp()
      returning id into v_effective;
  else
    delete from public.food_barcodes where gtin=v_key and food_id=p_food_id returning id into v_effective;
    if v_effective is null then raise exception 'Effective GTIN assignment not found for target Food.' using errcode='23503'; end if;
  end if;
  select policy_version into v_policy from public.food_catalog_correction_cases where id=p_case_id;
  insert into public.food_catalog_barcode_corrections(id,food_id,gtin,correction_action,source_record_id,policy_version,authority_reference)
  values(v_new,p_food_id,v_key,p_action,p_source_record_id,v_policy,'plan6:'||p_operation_id::text);
  v_revision:=private.food_catalog_governance_advance_authority(p_food_id,'barcode_correction',v_key,v_new);
  v_case_revision:=private.food_catalog_governance_mark_case_applied(p_case_id,p_operation_id,v_actor,p_reason);
  select coalesce(array_agg(id order by id),'{}'::uuid[]) into v_evidence from public.food_catalog_correction_evidence where case_id=p_case_id;
  v_result:=jsonb_build_object('foodId',p_food_id,'gtin',v_key,'action',p_action,'effectiveBarcodeId',case when p_action='assign' then v_effective else null end,'barcodeCorrectionId',v_new,'authorityRevision',v_revision,'caseRevision',v_case_revision);
  return private.food_catalog_governance_finish_operation(p_operation_id,p_expected_authority_id,v_new,v_evidence,v_result,'food.correction.applied',jsonb_build_object('foodId',p_food_id,'authorityKind','barcode_correction','authorityKey',v_key,'factId',v_new));
end
$function$;

create or replace function public.food_catalog_lookup_effective_barcode(p_gtin text)
returns table(barcode_id uuid,food_id uuid,gtin text) language plpgsql stable security definer set search_path='' as $function$
begin
  if not private.food_catalog_gtin_is_valid(btrim(coalesce(p_gtin,''))) then raise exception 'GTIN fails supported shape or GS1 Mod-10 validation.' using errcode='22023'; end if;
  return query select b.id,b.food_id,b.gtin from public.food_barcodes b where b.gtin=btrim(p_gtin);
end
$function$;

create or replace function public.food_catalog_apply_taxonomy_correction(
  p_operation_id uuid,p_case_id uuid,p_food_id uuid,p_expected_case_revision bigint,p_expected_authority_revision bigint,p_expected_authority_id uuid,
  p_node_code text,p_action text,p_source_record_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_actor uuid; v_key text:=btrim(p_node_code); v_pre jsonb; v_new uuid:=gen_random_uuid(); v_revision bigint; v_case_revision bigint; v_result jsonb; v_evidence uuid[]; v_policy text;
begin
  v_actor:=private.food_catalog_governance_principal_for_user();
  v_pre:=private.food_catalog_governance_prepare_apply(p_operation_id,v_actor,'food.taxonomy.correct','food_catalog_apply_taxonomy_correction',p_case_id,p_food_id,p_expected_case_revision,p_expected_authority_revision,p_expected_authority_id,'taxonomy_assignment',v_key,p_reason,
    jsonb_build_object('caseId',p_case_id,'foodId',p_food_id,'expectedCaseRevision',p_expected_case_revision,'expectedAuthorityRevision',p_expected_authority_revision,'expectedAuthorityId',p_expected_authority_id,'nodeCode',v_key,'action',p_action,'sourceRecordId',p_source_record_id));
  if (v_pre->>'replay')::boolean then return v_pre->'result'; end if;
  select policy_version into v_policy from public.food_catalog_correction_cases where id=p_case_id;
  insert into public.food_taxonomy_assignments(id,food_id,node_code,source_record_id,assignment_action,policy_version)
  values(v_new,p_food_id,v_key,p_source_record_id,p_action,v_policy);
  v_revision:=private.food_catalog_governance_advance_authority(p_food_id,'taxonomy_assignment',v_key,v_new);
  v_case_revision:=private.food_catalog_governance_mark_case_applied(p_case_id,p_operation_id,v_actor,p_reason);
  select coalesce(array_agg(id order by id),'{}'::uuid[]) into v_evidence from public.food_catalog_correction_evidence where case_id=p_case_id;
  v_result:=jsonb_build_object('foodId',p_food_id,'taxonomyAssignmentId',v_new,'authorityRevision',v_revision,'caseRevision',v_case_revision);
  return private.food_catalog_governance_finish_operation(p_operation_id,p_expected_authority_id,v_new,v_evidence,v_result,'food.correction.applied',jsonb_build_object('foodId',p_food_id,'authorityKind','taxonomy_assignment','factId',v_new));
end
$function$;

create or replace function public.food_catalog_apply_market_correction(
  p_operation_id uuid,p_case_id uuid,p_food_id uuid,p_expected_case_revision bigint,p_expected_authority_revision bigint,p_expected_authority_id uuid,
  p_scope_code text,p_relevance_level text,p_action text,p_source_record_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_actor uuid; v_key text:=btrim(p_scope_code); v_pre jsonb; v_new uuid:=gen_random_uuid(); v_revision bigint; v_case_revision bigint; v_result jsonb; v_evidence uuid[]; v_policy text;
begin
  v_actor:=private.food_catalog_governance_principal_for_user();
  v_pre:=private.food_catalog_governance_prepare_apply(p_operation_id,v_actor,'food.market.correct','food_catalog_apply_market_correction',p_case_id,p_food_id,p_expected_case_revision,p_expected_authority_revision,p_expected_authority_id,'market_assignment',v_key,p_reason,
    jsonb_build_object('caseId',p_case_id,'foodId',p_food_id,'expectedCaseRevision',p_expected_case_revision,'expectedAuthorityRevision',p_expected_authority_revision,'expectedAuthorityId',p_expected_authority_id,'scopeCode',v_key,'relevanceLevel',p_relevance_level,'action',p_action,'sourceRecordId',p_source_record_id));
  if (v_pre->>'replay')::boolean then return v_pre->'result'; end if;
  select policy_version into v_policy from public.food_catalog_correction_cases where id=p_case_id;
  insert into public.food_market_assignments(id,food_id,scope_code,relevance_level,source_record_id,assignment_action,policy_version)
  values(v_new,p_food_id,v_key,p_relevance_level,p_source_record_id,p_action,v_policy);
  v_revision:=private.food_catalog_governance_advance_authority(p_food_id,'market_assignment',v_key,v_new);
  v_case_revision:=private.food_catalog_governance_mark_case_applied(p_case_id,p_operation_id,v_actor,p_reason);
  select coalesce(array_agg(id order by id),'{}'::uuid[]) into v_evidence from public.food_catalog_correction_evidence where case_id=p_case_id;
  v_result:=jsonb_build_object('foodId',p_food_id,'marketAssignmentId',v_new,'authorityRevision',v_revision,'caseRevision',v_case_revision);
  return private.food_catalog_governance_finish_operation(p_operation_id,p_expected_authority_id,v_new,v_evidence,v_result,'food.correction.applied',jsonb_build_object('foodId',p_food_id,'authorityKind','market_assignment','factId',v_new));
end
$function$;

create or replace function public.food_catalog_resolve_duplicate(
  p_operation_id uuid,p_case_id uuid,p_source_food_id uuid,p_target_food_id uuid,p_expected_case_revision bigint,p_expected_authority_revision bigint,p_expected_authority_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_actor uuid; v_case public.food_catalog_correction_cases%rowtype; v_pre jsonb; v_new uuid:=gen_random_uuid(); v_revision bigint; v_case_revision bigint; v_result jsonb; v_evidence uuid[]; v_source_lifecycle text; v_source_redirect uuid;
begin
  v_actor:=private.food_catalog_governance_principal_for_user();
  perform private.food_catalog_governance_assert_capability(v_actor,'food.correction.apply');
  if p_source_food_id=p_target_food_id then raise exception 'Duplicate source and target must be distinct.' using errcode='23514'; end if;
  select * into v_case from public.food_catalog_correction_cases where id=p_case_id;
  if not found or v_case.food_id<>p_source_food_id then raise exception 'Duplicate correction case not found for source Food.' using errcode='23503'; end if;
  v_pre:=private.food_catalog_governance_begin_operation(p_operation_id,v_actor,'food.identity.merge','food_catalog_resolve_duplicate',p_source_food_id,p_case_id,v_case.policy_version,p_reason,
    jsonb_build_object('caseId',p_case_id,'sourceFoodId',p_source_food_id,'targetFoodId',p_target_food_id,'expectedCaseRevision',p_expected_case_revision,'expectedAuthorityRevision',p_expected_authority_revision,'expectedAuthorityId',p_expected_authority_id));
  if v_pre is not null then return v_pre; end if;
  v_case:=private.food_catalog_governance_require_case(p_case_id,p_source_food_id,p_expected_case_revision,'approved',array['duplicate_food','wrong_variant','other']);
  perform private.food_catalog_governance_lock_authority(p_source_food_id,'identity_merge','',p_expected_authority_revision,p_expected_authority_id);
  select lifecycle_status,merged_into_food_id into v_source_lifecycle,v_source_redirect from public.food_items where id=p_source_food_id for update;
  if not found then raise exception 'Duplicate source Food not found.' using errcode='23503'; end if;
  if v_source_lifecycle='merged' or v_source_redirect is not null then raise exception 'Source Food already has merge authority.' using errcode='40001'; end if;
  perform 1 from public.food_items where id=p_target_food_id and lifecycle_status<>'merged' and merged_into_food_id is null;
  if not found then raise exception 'Duplicate target must be a canonical survivor.' using errcode='23514'; end if;
  insert into public.food_merge_events(id,source_food_id,target_food_id,policy_version,reason_code,evidence_reference,authority_reference)
  values(v_new,p_source_food_id,p_target_food_id,v_case.policy_version,'plan6_duplicate_resolution','case:'||p_case_id::text,'plan6:'||p_operation_id::text);
  update public.food_items set lifecycle_status='merged',merged_into_food_id=p_target_food_id where id=p_source_food_id;
  insert into public.food_catalog_governance_lifecycle_events(operation_id,food_id,event_type,previous_lifecycle,next_lifecycle,replacement_food_id,reason)
  values(p_operation_id,p_source_food_id,'merge',v_source_lifecycle,'merged',p_target_food_id,btrim(p_reason));
  v_revision:=private.food_catalog_governance_advance_authority(p_source_food_id,'identity_merge','',v_new);
  v_case_revision:=private.food_catalog_governance_mark_case_applied(p_case_id,p_operation_id,v_actor,p_reason);
  select coalesce(array_agg(id order by id),'{}'::uuid[]) into v_evidence from public.food_catalog_correction_evidence where case_id=p_case_id;
  v_result:=jsonb_build_object('sourceFoodId',p_source_food_id,'targetFoodId',p_target_food_id,'mergeEventId',v_new,'authorityRevision',v_revision,'caseRevision',v_case_revision,'plan3RedirectInput',jsonb_build_object('sourceFoodId',p_source_food_id,'targetFoodId',p_target_food_id));
  return private.food_catalog_governance_finish_operation(p_operation_id,p_expected_authority_id,v_new,v_evidence,v_result,'food.identity.merged',jsonb_build_object('sourceFoodId',p_source_food_id,'targetFoodId',p_target_food_id));
end
$function$;

create or replace function private.food_catalog_change_lifecycle(
  p_operation_id uuid,p_food_id uuid,p_command text,p_expected_lifecycle text,p_expected_authority_revision bigint,p_expected_authority_id uuid,p_replacement_food_id uuid,p_reason text,p_break_glass_reason text
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_actor uuid; v_cap text; v_next text; v_replay jsonb; v_current text; v_event uuid:=gen_random_uuid(); v_revision bigint; v_result jsonb;
begin
  v_actor:=private.food_catalog_governance_principal_for_user();
  v_cap:=case when p_command='withdraw' then 'food.lifecycle.withdraw' when p_command='restore' then 'food.lifecycle.restore' else null end;
  if v_cap is null then raise exception 'Unsupported lifecycle command.' using errcode='22023'; end if;
  if p_break_glass_reason is not null then perform private.food_catalog_governance_assert_capability(v_actor,'food.break_glass'); if length(btrim(p_break_glass_reason))=0 then raise exception 'Break-glass reason is required.' using errcode='22023'; end if; end if;
  v_replay:=private.food_catalog_governance_begin_operation(p_operation_id,v_actor,v_cap,'food_catalog_'||p_command||'_food',p_food_id,null,'plan6-v1',p_reason,
    jsonb_build_object('foodId',p_food_id,'command',p_command,'expectedLifecycle',p_expected_lifecycle,'expectedAuthorityRevision',p_expected_authority_revision,'expectedAuthorityId',p_expected_authority_id,'replacementFoodId',p_replacement_food_id,'breakGlassReason',p_break_glass_reason));
  if v_replay is not null then return v_replay; end if;
  perform private.food_catalog_governance_lock_authority(p_food_id,'lifecycle','',p_expected_authority_revision,p_expected_authority_id);
  select lifecycle_status into v_current from public.food_items where id=p_food_id for update;
  if not found then raise exception 'Food not found.' using errcode='23503'; end if;
  if v_current<>p_expected_lifecycle then raise exception 'Food lifecycle CAS conflict.' using errcode='40001'; end if;
  if p_replacement_food_id=p_food_id then raise exception 'Replacement Food must be distinct.' using errcode='23514'; end if;
  if p_command='withdraw' then if v_current in ('withdrawn','merged') then raise exception 'Food cannot be withdrawn from current lifecycle.' using errcode='23514'; end if; v_next:='withdrawn';
  else if v_current<>'withdrawn' then raise exception 'Only withdrawn Food can be restored.' using errcode='23514'; end if; v_next:='active'; end if;
  update public.food_items set lifecycle_status=v_next,merged_into_food_id=case when p_command='restore' then null else merged_into_food_id end where id=p_food_id;
  insert into public.food_catalog_governance_lifecycle_events(id,operation_id,food_id,event_type,previous_lifecycle,next_lifecycle,replacement_food_id,reason)
  values(v_event,p_operation_id,p_food_id,p_command,v_current,v_next,p_replacement_food_id,btrim(p_reason));
  v_revision:=private.food_catalog_governance_advance_authority(p_food_id,'lifecycle','',v_event);
  v_result:=jsonb_build_object('foodId',p_food_id,'lifecycle',v_next,'lifecycleEventId',v_event,'authorityRevision',v_revision,'replacementFoodId',p_replacement_food_id);
  return private.food_catalog_governance_finish_operation(p_operation_id,p_expected_authority_id,v_event,'{}'::uuid[],v_result,'food.lifecycle.'||p_command,jsonb_build_object('foodId',p_food_id,'lifecycle',v_next),p_break_glass_reason);
end
$function$;

create or replace function public.food_catalog_withdraw_food(p_operation_id uuid,p_food_id uuid,p_expected_lifecycle text,p_expected_authority_revision bigint,p_expected_authority_id uuid,p_replacement_food_id uuid,p_reason text,p_break_glass_reason text default null)
returns jsonb language sql security definer set search_path='' as $function$
  select private.food_catalog_change_lifecycle(p_operation_id,p_food_id,'withdraw',p_expected_lifecycle,p_expected_authority_revision,p_expected_authority_id,p_replacement_food_id,p_reason,p_break_glass_reason)
$function$;

create or replace function public.food_catalog_restore_food(p_operation_id uuid,p_food_id uuid,p_expected_lifecycle text,p_expected_authority_revision bigint,p_expected_authority_id uuid,p_reason text,p_break_glass_reason text default null)
returns jsonb language sql security definer set search_path='' as $function$
  select private.food_catalog_change_lifecycle(p_operation_id,p_food_id,'restore',p_expected_lifecycle,p_expected_authority_revision,p_expected_authority_id,null,p_reason,p_break_glass_reason)
$function$;

create or replace function public.food_catalog_set_personal_override(
  p_operation_id uuid,p_food_id uuid,p_expected_revision_id uuid,p_expected_pointer_revision bigint,p_nutrition_override jsonb,p_serving_label text,p_note text
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_user uuid; v_current public.food_personal_overrides%rowtype; v_new uuid:=gen_random_uuid(); v_next bigint; v_result jsonb; v_replay jsonb;
begin
  v_user:=auth.uid(); if v_user is null then raise exception 'Authenticated override owner is required.' using errcode='42501'; end if;
  perform private.food_catalog_validate_personal_nutrition_override(p_nutrition_override);
  if length(coalesce(p_serving_label,''))>200 then raise exception 'Serving label is too long.' using errcode='22023'; end if;
  if length(coalesce(p_note,''))>1000 then raise exception 'Personal override note is too long.' using errcode='22023'; end if;
  v_replay:=private.food_catalog_personal_override_begin_operation(v_user,p_operation_id,p_food_id,'set',jsonb_build_object('foodId',p_food_id,'expectedRevisionId',p_expected_revision_id,'expectedPointerRevision',coalesce(p_expected_pointer_revision,0),'nutritionOverride',p_nutrition_override,'servingLabel',nullif(btrim(coalesce(p_serving_label,'')),''),'note',nullif(btrim(coalesce(p_note,'')),'')));
  if v_replay is not null then return v_replay; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text||'|'||p_food_id::text,0));
  select * into v_current from public.food_personal_overrides where user_id=v_user and food_id=p_food_id for update;
  if found then
    if v_current.current_revision_id is distinct from p_expected_revision_id or v_current.pointer_revision<>coalesce(p_expected_pointer_revision,0) then raise exception 'Personal override CAS conflict.' using errcode='40001'; end if;
    v_next:=v_current.pointer_revision+1;
  else
    if p_expected_revision_id is not null or coalesce(p_expected_pointer_revision,0)<>0 then raise exception 'Personal override CAS conflict.' using errcode='40001'; end if;
    v_next:=1;
  end if;
  insert into public.food_personal_override_revisions(id,user_id,food_id,revision_number,supersedes_revision_id,nutrition_override,serving_label,note,is_deleted)
  values(v_new,v_user,p_food_id,v_next,p_expected_revision_id,p_nutrition_override,nullif(btrim(coalesce(p_serving_label,'')),''),nullif(btrim(coalesce(p_note,'')),''),false);
  insert into public.food_personal_overrides(user_id,food_id,current_revision_id,pointer_revision) values(v_user,p_food_id,v_new,v_next)
  on conflict(user_id,food_id) do update set current_revision_id=excluded.current_revision_id,pointer_revision=excluded.pointer_revision,updated_at=clock_timestamp();
  v_result:=jsonb_build_object('operationId',p_operation_id,'foodId',p_food_id,'revisionId',v_new,'pointerRevision',v_next,'isDeleted',false);
  return private.food_catalog_personal_override_finish_operation(v_user,p_operation_id,v_result);
end
$function$;

create or replace function public.food_catalog_delete_personal_override(
  p_operation_id uuid,p_food_id uuid,p_expected_revision_id uuid,p_expected_pointer_revision bigint
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_user uuid; v_current public.food_personal_overrides%rowtype; v_new uuid:=gen_random_uuid(); v_next bigint; v_result jsonb; v_replay jsonb;
begin
  v_user:=auth.uid(); if v_user is null then raise exception 'Authenticated override owner is required.' using errcode='42501'; end if;
  v_replay:=private.food_catalog_personal_override_begin_operation(v_user,p_operation_id,p_food_id,'delete',jsonb_build_object('foodId',p_food_id,'expectedRevisionId',p_expected_revision_id,'expectedPointerRevision',p_expected_pointer_revision));
  if v_replay is not null then return v_replay; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text||'|'||p_food_id::text,0));
  select * into v_current from public.food_personal_overrides where user_id=v_user and food_id=p_food_id for update;
  if not found or v_current.current_revision_id is distinct from p_expected_revision_id or v_current.pointer_revision<>p_expected_pointer_revision then raise exception 'Personal override CAS conflict.' using errcode='40001'; end if;
  v_next:=v_current.pointer_revision+1;
  insert into public.food_personal_override_revisions(id,user_id,food_id,revision_number,supersedes_revision_id,is_deleted) values(v_new,v_user,p_food_id,v_next,p_expected_revision_id,true);
  update public.food_personal_overrides set current_revision_id=v_new,pointer_revision=v_next,updated_at=clock_timestamp() where user_id=v_user and food_id=p_food_id;
  v_result:=jsonb_build_object('operationId',p_operation_id,'foodId',p_food_id,'revisionId',v_new,'pointerRevision',v_next,'isDeleted',true);
  return private.food_catalog_personal_override_finish_operation(v_user,p_operation_id,v_result);
end
$function$;

-- Extend the canonical Nutrition account-deletion lifecycle in place so the reviewed
-- public purge authority remains verifier-visible while adding Plan 6 owner data.
create or replace function public.purge_account_application_data_atomic(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
  v_saved_meal_creation_operations integer := 0;
  v_food_personal_override_operations integer := 0;
  v_food_personal_overrides integer := 0;
  v_food_personal_override_revisions integer := 0;
begin
  -- Existing reviewed top-level Nutrition V1 replay cleanup remains explicit.
  delete from private.nutrition_saved_meal_creation_operations where user_id = p_user_id;
  get diagnostics v_saved_meal_creation_operations = row_count;

  delete from public.food_personal_override_operations where user_id = p_user_id;
  get diagnostics v_food_personal_override_operations = row_count;

  -- Delete the current Plan 6 pointer first because it RESTRICT-references revision history.
  delete from public.food_personal_overrides where user_id = p_user_id;
  get diagnostics v_food_personal_overrides = row_count;

  delete from public.food_personal_override_revisions where user_id = p_user_id;
  get diagnostics v_food_personal_override_revisions = row_count;

  -- Preserve the reviewed Nutrition V1 delegated purge graph directly.
  v_result := private.nutrition_v1_final_review_core_purge_account_application_data_atomic(p_user_id);

  if exists (select 1 from private.nutrition_saved_meal_creation_operations where user_id = p_user_id) then
    raise exception 'Nutrition V1 account-data purge left Saved Meal creation replay rows behind.' using errcode='23514';
  end if;
  if exists (
    select 1 from public.food_personal_override_operations where user_id = p_user_id
    union all
    select 1 from public.food_personal_overrides where user_id = p_user_id
    union all
    select 1 from public.food_personal_override_revisions where user_id = p_user_id
  ) then
    raise exception 'Food Catalog Plan 6 personal override purge left owner rows behind.' using errcode='23514';
  end if;

  return v_result || jsonb_build_object(
    'nutrition_saved_meal_creation_operations_deleted', v_saved_meal_creation_operations,
    'food_personal_override_operations_deleted', v_food_personal_override_operations,
    'food_personal_overrides_deleted', v_food_personal_overrides,
    'food_personal_override_revisions_deleted', v_food_personal_override_revisions
  );
end
$function$;

revoke all on function public.purge_account_application_data_atomic(uuid) from public, anon, authenticated, service_role;
grant execute on function public.purge_account_application_data_atomic(uuid) to service_role;

create or replace function public.food_catalog_governance_metrics()
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_actor uuid; v_result jsonb;
begin
  v_actor:=private.food_catalog_governance_principal_for_user(); perform private.food_catalog_governance_assert_capability(v_actor,'food.observability.read');
  select jsonb_build_object(
    'openCases',count(*) filter(where state in ('reported','under_review','approved')),
    'agingCases',count(*) filter(where state in ('reported','under_review','approved') and updated_at < clock_timestamp()-interval '7 days'),
    'appliedCases',count(*) filter(where state='applied'),
    'rejectedCases',count(*) filter(where state='rejected'),
    'idempotentReplays',(select coalesce(sum(replay_count),0) from public.food_catalog_governance_operations),
    'duplicateResolutions',(select count(*) from public.food_catalog_governance_audit_events where command_name='food_catalog_resolve_duplicate'),
    'withdrawals',(select count(*) from public.food_catalog_governance_lifecycle_events where event_type='withdraw'),
    'restores',(select count(*) from public.food_catalog_governance_lifecycle_events where event_type='restore'),
    'outboxBacklog',(select count(*) from public.food_catalog_governance_outbox where status in ('pending','processing')),
    'outboxFailures',(select count(*) from public.food_catalog_governance_outbox where status='failed'),
    'breakGlassExecutions',(select count(*) from public.food_catalog_governance_audit_events where break_glass)
  ) into v_result from public.food_catalog_correction_cases;
  return v_result;
end
$function$;

alter table public.food_catalog_governance_policy_versions enable row level security;
alter table public.food_catalog_governance_policy_pointer enable row level security;
alter table public.food_catalog_serving_fact_lineages enable row level security;
alter table public.food_catalog_serving_fact_revisions enable row level security;
alter table public.food_personal_override_operations enable row level security;

alter table public.food_catalog_correction_cases add constraint food_catalog_correction_cases_policy_fk foreign key(policy_version) references public.food_catalog_governance_policy_versions(policy_version) on delete restrict;
alter table public.food_catalog_service_proposals add constraint food_catalog_service_proposals_policy_fk foreign key(policy_version) references public.food_catalog_governance_policy_versions(policy_version) on delete restrict;
alter table public.food_catalog_correction_events add constraint food_catalog_correction_events_policy_fk foreign key(policy_version) references public.food_catalog_governance_policy_versions(policy_version) on delete restrict;
alter table public.food_catalog_governance_operations add constraint food_catalog_governance_operations_policy_fk foreign key(policy_version) references public.food_catalog_governance_policy_versions(policy_version) on delete restrict;
alter table public.food_catalog_governance_audit_events add constraint food_catalog_governance_audit_policy_fk foreign key(policy_version) references public.food_catalog_governance_policy_versions(policy_version) on delete restrict;

alter table public.food_catalog_governance_principals enable row level security;
alter table public.food_catalog_governance_capability_assignments enable row level security;
alter table public.food_catalog_correction_cases enable row level security;
alter table public.food_catalog_correction_reports enable row level security;
alter table public.food_catalog_service_proposals enable row level security;
alter table public.food_catalog_correction_evidence enable row level security;
alter table public.food_catalog_correction_events enable row level security;
alter table public.food_catalog_governance_authority_revisions enable row level security;
alter table public.food_catalog_governance_operations enable row level security;
alter table public.food_catalog_governance_audit_events enable row level security;
alter table public.food_catalog_governance_outbox enable row level security;
alter table public.food_catalog_governance_lifecycle_events enable row level security;
alter table public.food_personal_override_revisions enable row level security;
alter table public.food_personal_overrides enable row level security;
alter table public.food_catalog_barcode_corrections enable row level security;

revoke all on table public.food_catalog_governance_policy_versions from anon,authenticated,service_role;
revoke all on table public.food_catalog_governance_policy_pointer from anon,authenticated,service_role;
revoke all on table public.food_catalog_serving_fact_lineages from anon,authenticated,service_role;
revoke all on table public.food_catalog_serving_fact_revisions from anon,authenticated,service_role;
revoke all on table public.food_personal_override_operations from anon,authenticated,service_role;
revoke all on table public.food_catalog_governance_principals from anon,authenticated,service_role;
revoke all on table public.food_catalog_governance_capability_assignments from anon,authenticated,service_role;
revoke all on table public.food_catalog_correction_cases from anon,authenticated,service_role;
revoke all on table public.food_catalog_correction_reports from anon,authenticated,service_role;
revoke all on table public.food_catalog_service_proposals from anon,authenticated,service_role;
revoke all on table public.food_catalog_correction_evidence from anon,authenticated,service_role;
revoke all on table public.food_catalog_correction_events from anon,authenticated,service_role;
revoke all on table public.food_catalog_governance_authority_revisions from anon,authenticated,service_role;
revoke all on table public.food_catalog_governance_operations from anon,authenticated,service_role;
revoke all on table public.food_catalog_governance_audit_events from anon,authenticated,service_role;
revoke all on table public.food_catalog_governance_outbox from anon,authenticated,service_role;
revoke all on table public.food_catalog_governance_lifecycle_events from anon,authenticated,service_role;
revoke all on table public.food_personal_override_revisions from anon,authenticated,service_role;
revoke all on table public.food_personal_overrides from anon,authenticated,service_role;
revoke all on table public.food_catalog_barcode_corrections from anon,authenticated,service_role;

drop policy if exists food_items_admin_all on public.food_items;
revoke insert, update, delete, truncate on table public.food_items from anon, authenticated, service_role;
revoke insert, update, delete, truncate on table public.food_nutrition_revisions from anon, authenticated, service_role;
revoke insert, update, delete, truncate on table public.food_serving_options from anon, authenticated, service_role;
revoke insert, update, delete, truncate on table public.food_names from anon, authenticated, service_role;
revoke insert, update, delete, truncate on table public.food_barcodes from anon, authenticated, service_role;
revoke insert, update, delete, truncate on table public.food_taxonomy_assignments from anon, authenticated, service_role;
revoke insert, update, delete, truncate on table public.food_market_assignments from anon, authenticated, service_role;
revoke insert, update, delete, truncate on table public.food_merge_events from anon, authenticated, service_role;

do $private_acl$
declare r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private'
      and (
        p.proname like 'food_catalog_governance_%'
        or p.proname in ('food_catalog_change_lifecycle','reject_food_catalog_governance_immutable_mutation')
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role',r.signature);
  end loop;
end
$private_acl$;

do $do$
declare r record;
begin
  for r in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'food_catalog_%' and p.proname in (
    'food_catalog_manage_governance_principal','food_catalog_revoke_governance_capability','food_catalog_report_correction','food_catalog_attach_correction_evidence','food_catalog_transition_correction_case',
    'food_catalog_apply_nutrition_correction','food_catalog_apply_serving_correction','food_catalog_apply_name_correction','food_catalog_apply_barcode_correction','food_catalog_apply_taxonomy_correction','food_catalog_apply_market_correction',
    'food_catalog_resolve_duplicate','food_catalog_withdraw_food','food_catalog_restore_food','food_catalog_set_personal_override','food_catalog_delete_personal_override','food_catalog_governance_metrics'
  ) loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role',r.signature);
    execute format('grant execute on function %s to authenticated',r.signature);
  end loop;
end
$do$;

revoke all on function public.food_catalog_service_propose_correction(uuid,uuid,uuid,text,text,text,jsonb,text,text) from public,anon,authenticated,service_role;
grant execute on function public.food_catalog_service_propose_correction(uuid,uuid,uuid,text,text,text,jsonb,text,text) to service_role;

create or replace function public.food_catalog_claim_governance_outbox(p_event_id uuid,p_claim_owner text default 'governance-worker',p_lease_seconds integer default 300)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_row public.food_catalog_governance_outbox%rowtype; v_token uuid:=gen_random_uuid();
begin
  if auth.role()<>'service_role' then raise exception 'Governance outbox delivery requires service_role.' using errcode='42501'; end if;
  if length(btrim(coalesce(p_claim_owner,'')))=0 or p_lease_seconds not between 1 and 3600 then raise exception 'Governance outbox claim owner/lease is invalid.' using errcode='22023'; end if;
  update public.food_catalog_governance_outbox set status='processing',attempt_count=attempt_count+1,claim_owner=btrim(p_claim_owner),lease_token=v_token,lease_epoch=lease_epoch+1,lease_acquired_at=clock_timestamp(),lease_expires_at=clock_timestamp()+make_interval(secs=>p_lease_seconds),updated_at=clock_timestamp(),last_error=null
  where event_id=p_event_id and available_at<=clock_timestamp() and (status in ('pending','failed') or (status='processing' and lease_expires_at<=clock_timestamp())) returning * into v_row;
  if not found then raise exception 'Governance outbox event is not claimable.' using errcode='40001'; end if;
  return jsonb_build_object('eventId',v_row.event_id,'eventType',v_row.event_type,'payload',v_row.payload,'attemptCount',v_row.attempt_count,'claimOwner',v_row.claim_owner,'leaseToken',v_row.lease_token,'leaseEpoch',v_row.lease_epoch,'leaseExpiresAt',v_row.lease_expires_at);
end
$function$;
create or replace function public.food_catalog_finish_governance_outbox(p_event_id uuid,p_lease_token uuid,p_delivered boolean,p_error text default null,p_retry_after_seconds integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_row public.food_catalog_governance_outbox%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'Governance outbox delivery requires service_role.' using errcode='42501'; end if;
  if p_lease_token is null or p_retry_after_seconds not between 0 and 86400 then raise exception 'Governance outbox finish lease/retry is invalid.' using errcode='22023'; end if;
  update public.food_catalog_governance_outbox set status=case when p_delivered then 'delivered' else 'failed' end,delivered_at=case when p_delivered then clock_timestamp() else null end,last_error=case when p_delivered then null else nullif(btrim(coalesce(p_error,'')),'') end,available_at=case when p_delivered then available_at else clock_timestamp()+make_interval(secs=>p_retry_after_seconds) end,claim_owner=null,lease_token=null,lease_acquired_at=null,lease_expires_at=null,updated_at=clock_timestamp()
  where event_id=p_event_id and status='processing' and lease_token=p_lease_token and lease_expires_at>clock_timestamp() returning * into v_row;
  if not found then raise exception 'Governance outbox lease is stale, expired, or not processing.' using errcode='40001'; end if;
  return jsonb_build_object('eventId',v_row.event_id,'status',v_row.status,'attemptCount',v_row.attempt_count);
end
$function$;
revoke all on function public.food_catalog_claim_governance_outbox(uuid,text,integer) from public,anon,authenticated;
revoke all on function public.food_catalog_finish_governance_outbox(uuid,uuid,boolean,text,integer) from public,anon,authenticated;
grant execute on function public.food_catalog_claim_governance_outbox(uuid,text,integer) to service_role;
grant execute on function public.food_catalog_finish_governance_outbox(uuid,uuid,boolean,text,integer) to service_role;
revoke all on function public.food_catalog_lookup_effective_barcode(text) from public,anon;
grant execute on function public.food_catalog_lookup_effective_barcode(text) to authenticated,service_role;

commit;
