-- Food Catalog Plan 9: verified 1A1->1A2 cross-batch source-fact idempotency.
-- RED: disposable real 80/363 USDA integration run 38358309988 observed
-- nutrition 80->160, names 80->160, servings 76->152 on cross-batch MATCH.
-- Preserve historical 20260904100000 and previously applied Plan 9 bytes.
-- This is a forward-only schema correction; no data backfill, Food population,
-- owner provisioning, activation or Catalog Generation publication.
begin;

create or replace function public.food_catalog_ingestion_persist_candidate_v2(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_replay jsonb;
  v_run_id uuid := (p_command->>'runId')::uuid;
  v_batch_id uuid;
  v_candidate jsonb := p_command->'candidate';
  v_issues_json jsonb := coalesce(p_command->'issues', '[]'::jsonb);
  v_decision_json jsonb := p_command->'decision';
  v_disposition_json jsonb := p_command->'disposition';
  v_decision text := p_command->>'decisionKind';
  v_disposition text := p_command->>'dispositionKind';
  v_run public.food_ingestion_runs%rowtype;
  v_batch public.food_ingestion_batches%rowtype;
  v_source_record public.food_source_records%rowtype;
  v_manifest_record public.food_ingestion_manifest_records%rowtype;
  v_materialized public.food_ingestion_materialized_results%rowtype;
  v_food_id uuid := nullif(p_command->>'foodId', '')::uuid;
  v_membership_outcome text;
  v_existing_membership_outcome text;
  v_revision_number integer;
  v_fact jsonb;
  v_gtin text;
  v_resumed boolean := false;
  v_result jsonb;
begin
  v_replay := private.food_catalog_ingestion_replay_operation_v2(p_command, 'food_catalog_ingestion_persist_candidate_v2');
  if v_replay is not null then return v_replay; end if;

  if jsonb_typeof(v_candidate) <> 'object'
     or jsonb_typeof(v_issues_json) <> 'array'
     or jsonb_typeof(v_decision_json) <> 'object'
     or jsonb_typeof(v_disposition_json) <> 'object'
     or v_decision not in ('match', 'create', 'possible_duplicate', 'reject')
     or v_disposition not in ('accept', 'quarantine', 'reject')
     or v_decision <> v_decision_json->>'kind'
     or v_disposition <> v_disposition_json->>'kind'
  then
    raise exception 'Invalid candidate decision/disposition authority.' using errcode = '22023';
  end if;

  if v_disposition = 'accept' and v_decision in ('match', 'create') and v_food_id is null then
    raise exception 'Accepted MATCH/CREATE candidate requires planned canonical foodId.' using errcode = '22023';
  end if;
  if v_decision = 'match' and nullif(v_decision_json->>'foodId', '')::uuid is distinct from v_food_id then
    raise exception 'MATCH decision and planned canonical foodId disagree.' using errcode = '23514';
  end if;

  select run.batch_id into v_batch_id
  from public.food_ingestion_runs run
  where run.id = v_run_id;
  if not found then raise exception 'Unknown Food Catalog ingestion run.' using errcode = '23503'; end if;
  select * into v_batch from public.food_ingestion_batches where id = v_batch_id for update;
  select * into v_run from public.food_ingestion_runs where id = v_run_id for update;
  if not found or v_run.batch_id <> v_batch.id then
    raise exception 'Food Catalog ingestion run authority changed while acquiring batch/run locks.' using errcode = '55000';
  end if;

  if v_run.execution_mode = 'dry_run' and v_run.status not in ('prepared', 'running') then
    raise exception 'Completed dry-run rejects candidate mutation; dry-run run must be prepared or running.' using errcode = '55000';
  end if;

  if v_run.execution_mode = 'production' then
    perform private.food_catalog_ingestion_assert_active_lease_v2(v_run_id, (p_command->>'leaseToken')::uuid, (p_command->>'leaseEpoch')::bigint);

    select manifest.* into v_manifest_record
    from public.food_ingestion_manifest_records manifest
    join public.food_source_records source on source.id = manifest.source_record_id
    where manifest.batch_id = v_batch.id
      and manifest.source_record_key = v_candidate->>'sourceRecordId'
      and source.provider = v_batch.provider
      and source.source_dataset = v_batch.dataset_name
      and source.source_version = v_batch.source_version
    for share of manifest;

    if not found
       or v_batch.review_state <> 'approved'
       or v_batch.approved_at is null
       or lower(v_manifest_record.manifest_content_checksum_sha256) <> lower(v_batch.manifest_content_checksum_sha256)
       or lower(v_manifest_record.manifest_content_checksum_sha256) <> lower(v_run.manifest_content_checksum_sha256)
       or v_manifest_record.candidate_json is distinct from v_candidate
       or v_manifest_record.issues_json is distinct from v_issues_json
       or v_manifest_record.decision_json is distinct from v_decision_json
       or v_manifest_record.disposition_json is distinct from v_disposition_json
       or v_manifest_record.planned_food_id is distinct from v_food_id
    then
      raise exception 'Production candidate does not match the exact approved per-record manifest authority.' using errcode = '23514';
    end if;

    select source.* into v_source_record
    from public.food_source_records source
    where source.id = v_manifest_record.source_record_id
    for update;

    if v_disposition = 'accept' and v_decision in ('match', 'create') then
      select * into v_materialized
      from public.food_ingestion_materialized_results materialized
      where materialized.batch_id = v_batch.id
        and materialized.source_record_key = v_candidate->>'sourceRecordId'
      for share;

      if found then
        if v_materialized.source_record_id <> v_source_record.id
           or v_materialized.food_id <> v_food_id
           or v_materialized.decision_kind <> v_decision
           or v_materialized.disposition_kind <> v_disposition
           or lower(v_materialized.manifest_content_checksum_sha256) <> lower(v_run.manifest_content_checksum_sha256)
        then
          raise exception 'Materialized Food ingestion result conflicts with reviewed semantic authority.' using errcode = '23514';
        end if;
        v_resumed := true;
      else
        if v_decision = 'create' then
          insert into public.food_items(
            id, food_name, serving_size, calories, protein_g, carbs_g, fat_g,
            saturated_fat_g, fiber_g, sugars_g, sodium_mg,
            nutrition_basis_amount, nutrition_basis_unit,
            category, cuisine, brand_name, source_type, is_global, is_market_global,
            is_editable_by_user, lifecycle_status
          ) values (
            v_food_id,
            v_candidate->>'canonicalName',
            nullif(v_candidate->>'servingLabel', ''),
            nullif(v_candidate->'nutrition'->>'calories', '')::numeric,
            nullif(v_candidate->'nutrition'->>'protein_g', '')::numeric,
            nullif(v_candidate->'nutrition'->>'carbs_g', '')::numeric,
            nullif(v_candidate->'nutrition'->>'fat_g', '')::numeric,
            nullif(v_candidate->'nutrition'->>'saturated_fat_g', '')::numeric,
            nullif(v_candidate->'nutrition'->>'fiber_g', '')::numeric,
            nullif(v_candidate->'nutrition'->>'sugars_g', '')::numeric,
            nullif(v_candidate->'nutrition'->>'sodium_mg', '')::numeric,
            nullif(v_candidate->'nutrition'->>'basis_amount', '')::numeric,
            nullif(v_candidate->'nutrition'->>'basis_unit', ''),
            nullif(v_candidate->>'category', ''), nullif(v_candidate->>'cuisine', ''), nullif(v_candidate->>'brandName', ''),
            'catalog_ingestion_v2', false, false, false, 'draft'
          );
        else
          perform 1 from public.food_items where id = v_food_id and merged_into_food_id is null for update;
          if not found then raise exception 'MATCH target must be a current canonical Food root.' using errcode = '23514'; end if;
        end if;

        if v_source_record.food_id is not null and v_source_record.food_id <> v_food_id then
          raise exception 'Source evidence is already associated with a different canonical Food.' using errcode = '23514';
        end if;
        update public.food_source_records set food_id = v_food_id where id = v_source_record.id and food_id is null;
        
        -- Plan 9: source facts belong to the immutable versioned source record,
        -- not to each review batch. A cross-batch MATCH of an already
        -- materialized source MUST NOT append duplicate name/nutrition/portion
        -- facts. This preserves the source history and canonical Food ID while
        -- still recording new batch participation/materialization below.
        if not exists (
          select 1
          from public.food_ingestion_materialized_results prior_materialized
          where prior_materialized.source_record_id = v_source_record.id
            and prior_materialized.food_id = v_food_id
            and prior_materialized.batch_id <> v_batch.id
        ) then

        if v_candidate->'nutrition' is not null
           and coalesce(nullif(v_candidate->'nutrition'->>'basis_amount', '')::numeric, 0) > 0
           and v_candidate->'nutrition'->>'basis_unit' in ('g', 'ml')
           and (
             v_candidate->'nutrition'->>'calories' is not null
             or v_candidate->'nutrition'->>'protein_g' is not null
             or v_candidate->'nutrition'->>'carbs_g' is not null
             or v_candidate->'nutrition'->>'fat_g' is not null
             or v_candidate->'nutrition'->>'saturated_fat_g' is not null
             or v_candidate->'nutrition'->>'fiber_g' is not null
             or v_candidate->'nutrition'->>'sugars_g' is not null
             or v_candidate->'nutrition'->>'sodium_mg' is not null
           )
        then
          select coalesce(max(revision_number), 0) + 1 into v_revision_number
          from public.food_nutrition_revisions
          where food_id = v_food_id;
          insert into public.food_nutrition_revisions(
            food_id, revision_number, calories, protein_g, carbs_g, fat_g,
            saturated_fat_g, fiber_g, sugars_g, sodium_mg, basis_amount, basis_unit,
            source_record_id, nutrient_mapping_version, authority_reference
          ) values (
            v_food_id, v_revision_number,
            nullif(v_candidate->'nutrition'->>'calories', '')::numeric,
            nullif(v_candidate->'nutrition'->>'protein_g', '')::numeric,
            nullif(v_candidate->'nutrition'->>'carbs_g', '')::numeric,
            nullif(v_candidate->'nutrition'->>'fat_g', '')::numeric,
            nullif(v_candidate->'nutrition'->>'saturated_fat_g', '')::numeric,
            nullif(v_candidate->'nutrition'->>'fiber_g', '')::numeric,
            nullif(v_candidate->'nutrition'->>'sugars_g', '')::numeric,
            nullif(v_candidate->'nutrition'->>'sodium_mg', '')::numeric,
            (v_candidate->'nutrition'->>'basis_amount')::numeric,
            v_candidate->'nutrition'->>'basis_unit',
            v_source_record.id, v_batch.importer_version,
            v_batch.id::text || ':' || v_batch.manifest_content_checksum_sha256
          );
        end if;

        for v_fact in select value from jsonb_array_elements(coalesce(v_candidate->'names', '[]'::jsonb)) loop
          insert into public.food_names(
            food_id, language_tag, name_role, name_text, normalized_text, script_code,
            origin, source_record_id, policy_version
          ) values (
            v_food_id,
            v_fact->>'locale',
            case v_fact->>'role'
              when 'source' then 'source_name'
              when 'normalized' then 'preferred_display'
              when 'alias' then 'search_alias'
              when 'transliteration' then 'transliteration'
              else 'source_name'
            end,
            v_fact->>'value', v_fact->>'normalizedValue', nullif(v_fact->>'script', ''),
            'source', v_source_record.id, 'food_catalog_ingestion_v2'
          );
        end loop;
        for v_fact in select value from jsonb_array_elements(coalesce(v_candidate->'aliases', '[]'::jsonb)) loop
          insert into public.food_names(
            food_id, language_tag, name_role, name_text, normalized_text,
            origin, source_record_id, policy_version
          ) values (
            v_food_id, v_fact->>'locale', 'search_alias', v_fact->>'value', v_fact->>'normalizedValue',
            'source', v_source_record.id, 'food_catalog_ingestion_v2'
          );
        end loop;

        for v_fact in select value from jsonb_array_elements(coalesce(v_candidate->'servings', '[]'::jsonb)) loop
          if coalesce(nullif(v_fact->>'amount', '')::numeric, 0) > 0
             and length(btrim(coalesce(v_fact->>'unit', ''))) > 0
             and (
               nullif(v_fact->>'gramWeight', '') is not null
               or v_fact->>'unit' in ('g', 'ml')
               or coalesce(nullif(v_fact->>'milliliterVolume', '')::numeric, 0) > 0
             )
          then
            insert into public.food_serving_options(
              food_id, label, amount, unit_code, gram_weight, source_record_id,
              source_portion_code, evidence_class, source_primary, authority_reference
            ) values (
              v_food_id, coalesce(nullif(v_fact->>'label', ''), v_fact->>'servingKey'),
              case
                when nullif(v_fact->>'gramWeight', '') is null
                  and v_fact->>'unit' not in ('g', 'ml')
                  and coalesce(nullif(v_fact->>'milliliterVolume', '')::numeric, 0) > 0
                then (v_fact->>'milliliterVolume')::numeric
                else (v_fact->>'amount')::numeric
              end,
              case
                when nullif(v_fact->>'gramWeight', '') is null
                  and v_fact->>'unit' not in ('g', 'ml')
                  and coalesce(nullif(v_fact->>'milliliterVolume', '')::numeric, 0) > 0
                then 'ml'
                else v_fact->>'unit'
              end,
              nullif(v_fact->>'gramWeight', '')::numeric,
              v_source_record.id, nullif(v_fact->>'servingKey', ''), 'exact_source', false,
              v_batch.id::text || ':' || v_batch.manifest_content_checksum_sha256
            );

            if nullif(v_fact->>'gramWeight', '') is not null
               and coalesce(nullif(v_fact->>'milliliterVolume', '')::numeric, 0) > 0
               and (
                 v_fact->>'unit' <> 'ml'
                 or (v_fact->>'amount')::numeric <> (v_fact->>'milliliterVolume')::numeric
               )
            then
              insert into public.food_serving_options(
                food_id, label, amount, unit_code, gram_weight, source_record_id,
                source_portion_code, evidence_class, source_primary, authority_reference
              ) values (
                v_food_id, coalesce(nullif(v_fact->>'label', ''), v_fact->>'servingKey'),
                (v_fact->>'milliliterVolume')::numeric, 'ml', null,
                v_source_record.id, nullif(v_fact->>'servingKey', ''), 'exact_source', false,
                v_batch.id::text || ':' || v_batch.manifest_content_checksum_sha256
              );
            end if;
          end if;
        end loop;

        for v_gtin in select jsonb_array_elements_text(coalesce(v_candidate->'gtins', '[]'::jsonb)) loop
          insert into public.food_barcodes(food_id, gtin, source_record_id)
          values (v_food_id, v_gtin, v_source_record.id)
          on conflict (gtin) do nothing;
          if exists (select 1 from public.food_barcodes where gtin = v_gtin and food_id <> v_food_id) then
            raise exception 'GTIN is already owned by a different canonical Food.' using errcode = '23514';
          end if;
        end loop;

        for v_fact in select value from jsonb_array_elements(coalesce(v_candidate->'taxonomyEvidence', '[]'::jsonb)) loop
          if nullif(v_fact->>'mappedTaxonomyId', '') is not null then
            insert into public.food_taxonomy_assignments(
              food_id, node_code, source_record_id, assignment_action, policy_version
            ) values (
              v_food_id, v_fact->>'mappedTaxonomyId', v_source_record.id, 'assign', 'food_catalog_ingestion_v2'
            );
          end if;
        end loop;

        for v_fact in select value from jsonb_array_elements(coalesce(v_candidate->'marketScopes', '[]'::jsonb)) loop
          insert into public.food_market_assignments(
            food_id, scope_code, relevance_level, source_record_id, assignment_action, policy_version
          ) values (
            v_food_id, v_fact->>'code', v_fact->>'relevanceLevel', v_source_record.id, 'assign', 'food_catalog_ingestion_v2'
          );
        end loop;
        if coalesce((v_candidate->>'globallyRelevant')::boolean, false) then
          insert into public.food_market_assignments(
            food_id, scope_code, relevance_level, source_record_id, assignment_action, policy_version
          ) values (
            v_food_id, 'GLOBAL', 'primary', v_source_record.id, 'assign', 'food_catalog_ingestion_v2'
          );
        end if;

        end if; -- previous immutable source facts already materialized

        v_result := jsonb_build_object(
          'batchId', v_batch.id, 'sourceRecordId', v_candidate->>'sourceRecordId', 'foodId', v_food_id,
          'decisionKind', v_decision, 'dispositionKind', v_disposition
        );
        insert into public.food_ingestion_materialized_results(
          batch_id, source_record_key, source_record_id, food_id, decision_kind, disposition_kind,
          manifest_content_checksum_sha256, first_run_id, result_json
        ) values (
          v_batch.id, v_candidate->>'sourceRecordId', v_source_record.id, v_food_id, v_decision, v_disposition,
          v_run.manifest_content_checksum_sha256, v_run.id, v_result
        );
      end if;
    end if;
  else
    if v_batch.review_state <> 'prepared' then raise exception 'Dry-run staging requires a prepared semantic batch.' using errcode = '23514'; end if;
    insert into public.food_source_records(
      food_id, provider, source_record_id, source_reference, license_name, license_reference,
      retrieved_at, source_nutrition, source_serving, source_dataset, source_version,
      source_release_date, source_record_checksum_sha256
    ) values (
      null, v_batch.provider, v_candidate->>'sourceRecordId', nullif(v_candidate->>'sourceReference', ''),
      v_batch.license_name, v_batch.license_reference, clock_timestamp(),
      v_candidate->'sourceNutrition', v_candidate->'sourceServing', v_batch.dataset_name, v_batch.source_version,
      v_batch.source_release_date, nullif(lower(v_candidate->>'sourceRecordChecksumSha256'), '')
    )
    on conflict (provider, source_dataset, source_version, source_record_id)
      where source_dataset is not null and source_version is not null
    do nothing;

    select * into v_source_record
    from public.food_source_records
    where provider = v_batch.provider and source_dataset = v_batch.dataset_name
      and source_version = v_batch.source_version and source_record_id = v_candidate->>'sourceRecordId'
    for update;
    if lower(coalesce(v_source_record.source_record_checksum_sha256, '')) is distinct from lower(coalesce(v_candidate->>'sourceRecordChecksumSha256', ''))
       or v_source_record.source_reference is distinct from nullif(v_candidate->>'sourceReference', '')
       or v_source_record.license_name is distinct from v_batch.license_name
       or v_source_record.license_reference is distinct from v_batch.license_reference
       or v_source_record.source_nutrition is distinct from v_candidate->'sourceNutrition'
       or v_source_record.source_serving is distinct from v_candidate->'sourceServing'
       or v_source_record.source_release_date is distinct from v_batch.source_release_date
    then
      raise exception 'Dry-run source snapshot conflicts with existing immutable source evidence.' using errcode = '23514';
    end if;

    v_membership_outcome := case
      when v_disposition = 'reject' then 'rejected'
      when v_disposition = 'quarantine' and v_decision = 'possible_duplicate' then 'possible_duplicate'
      when v_disposition = 'quarantine' then 'accepted'
      when v_decision = 'match' then 'matched'
      when v_decision = 'create' then 'created'
      else 'accepted'
    end;
    insert into public.food_ingestion_batch_records(batch_id, source_record_id, outcome)
    values (v_batch.id, v_source_record.id, v_membership_outcome)
    on conflict (batch_id, source_record_id) do nothing;

    select membership.outcome into v_existing_membership_outcome
    from public.food_ingestion_batch_records membership
    where membership.batch_id = v_batch.id and membership.source_record_id = v_source_record.id;
    if not found or v_existing_membership_outcome is distinct from v_membership_outcome then
      raise exception 'Dry-run staged membership conflicts with reviewed authority.' using errcode = '23514';
    end if;

    insert into public.food_ingestion_manifest_records(
      batch_id, source_record_key, source_record_id, manifest_content_checksum_sha256,
      candidate_json, issues_json, decision_json, disposition_json, planned_food_id
    ) values (
      v_batch.id, v_candidate->>'sourceRecordId', v_source_record.id, v_run.manifest_content_checksum_sha256,
      v_candidate, v_issues_json, v_decision_json, v_disposition_json, v_food_id
    )
    on conflict (batch_id, source_record_key) do nothing;

    select * into v_manifest_record
    from public.food_ingestion_manifest_records manifest
    where manifest.batch_id = v_batch.id and manifest.source_record_key = v_candidate->>'sourceRecordId'
    for share;
    if not found
       or v_manifest_record.source_record_id <> v_source_record.id
       or lower(v_manifest_record.manifest_content_checksum_sha256) <> lower(v_run.manifest_content_checksum_sha256)
       or v_manifest_record.candidate_json is distinct from v_candidate
       or v_manifest_record.issues_json is distinct from v_issues_json
       or v_manifest_record.decision_json is distinct from v_decision_json
       or v_manifest_record.disposition_json is distinct from v_disposition_json
       or v_manifest_record.planned_food_id is distinct from v_food_id
    then
      raise exception 'Dry-run staged manifest conflicts with reviewed authority.' using errcode = '23514';
    end if;
  end if;

  if v_run.status = 'prepared' and v_run.execution_mode = 'dry_run' then
    update public.food_ingestion_runs
    set status = 'running', started_at = coalesce(started_at, clock_timestamp())
    where id = v_run.id
    returning * into v_run;
  end if;

  update public.food_ingestion_runs
  set observed_input_count = coalesce(observed_input_count, 0) + 1,
      observed_accepted_count = coalesce(observed_accepted_count, 0) + case when v_disposition = 'accept' then 1 else 0 end,
      observed_rejected_count = coalesce(observed_rejected_count, 0) + case when v_disposition = 'reject' then 1 else 0 end,
      observed_matched_count = coalesce(observed_matched_count, 0) + case when v_disposition = 'accept' and v_decision = 'match' then 1 else 0 end,
      observed_created_count = coalesce(observed_created_count, 0) + case when v_disposition = 'accept' and v_decision = 'create' then 1 else 0 end,
      observed_possible_duplicate_count = coalesce(observed_possible_duplicate_count, 0) + case when v_decision = 'possible_duplicate' then 1 else 0 end
  where id = v_run.id;

  insert into public.food_ingestion_operational_events(batch_id, run_id, source_record_key, event_type, payload_json, event_checksum_sha256)
  values (
    v_batch.id, v_run.id, v_candidate->>'sourceRecordId',
    case when v_run.execution_mode = 'production' and v_disposition = 'accept' then 'candidate_persisted' else 'candidate_recorded' end,
    jsonb_build_object('decisionKind', v_decision, 'dispositionKind', v_disposition, 'foodId', v_food_id, 'materializedResume', v_resumed),
    lower(p_command->>'commandChecksumSha256')
  );

  v_result := jsonb_build_object(
    'runId', v_run.id, 'sourceRecordId', v_candidate->>'sourceRecordId', 'foodId', v_food_id,
    'decisionKind', v_decision, 'dispositionKind', v_disposition, 'materializedResume', v_resumed
  );
  return private.food_catalog_ingestion_finish_operation_v2(p_command, 'food_catalog_ingestion_persist_candidate_v2', v_run.id, v_result);
end
$function$;

-- Existing command RPC remains service_role-only. The granted execution
-- authority is not widened by this narrowly scoped function replacement.
revoke all on function public.food_catalog_ingestion_persist_candidate_v2(jsonb)
  from public, anon, authenticated;
grant execute on function public.food_catalog_ingestion_persist_candidate_v2(jsonb)
  to service_role;

commit;
