-- Forward-only Plan 9 correction. The original Production-applied 20261013040000
-- repository migration must remain immutable and must never be replayed.
-- PostgreSQL three-valued logic otherwise treats a NULL decision as no IF condition
-- and the CASE ELSE rejection arm could mutate a reviewed batch without explicit
-- authorized 'reject' semantics. Missing expected state/source/counts fail closed.
-- The authenticated-human capability, semantic lock, completed DB reconciliation,
-- CAS, governance operation and immutable audit authorities are preserved.
create or replace function public.food_catalog_review_ingestion_batch_v1(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_op uuid := nullif(p_command->>'operationId', '')::uuid;
  v_id uuid := nullif(p_command->>'batchId', '')::uuid;
  v_action text := p_command->>'decision';
  v_expected_state text := p_command->>'expectedReviewState';
  v_manifest text := p_command->>'manifestContentChecksumSha256';
  v_semantic text := p_command->>'semanticIdentityChecksumSha256';
  v_source jsonb := p_command->'source';
  v_counts jsonb := p_command->'expectedMutations';
  v_reason text := btrim(coalesce(p_command->>'reason', ''));
  v_authorization text := btrim(coalesce(p_command->>'authorizationReference', ''));
  v_reconciliation_id uuid := nullif(p_command->>'reconciliationId', '')::uuid;
  v_actor uuid;
  v_policy text;
  v_replay jsonb;
  v_batch public.food_ingestion_batches%rowtype;
  v_result jsonb;
begin
  if v_op is null or v_id is null
    or v_action is null or v_expected_state is null
    or v_source is null or v_counts is null
    or v_manifest !~ '^[0-9a-f]{64}$' or v_semantic !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(v_source) <> 'object'
    or jsonb_typeof(v_counts) <> 'object'
    or length(v_reason) < 8
    or v_action not in ('review', 'approve', 'reject')
    or (v_action = 'review' and v_expected_state is distinct from 'prepared')
    or (v_action in ('approve', 'reject') and v_expected_state is distinct from 'reviewed')
    or (v_action = 'approve' and length(v_authorization) < 8)
    or (v_action in ('review', 'approve') and v_reconciliation_id is null)
  then
    raise exception 'Invalid exact Food ingestion human decision command.' using errcode = '22023';
  end if;
  -- A forged actor value in JSON is never accepted: resolve identity from auth.uid().
  v_actor := private.food_catalog_governance_principal_for_user();
  v_policy := private.food_catalog_governance_current_policy_version();
  perform private.food_catalog_governance_assert_capability(v_actor, 'food.ingestion.review');
  if not exists (
    select 1 from public.food_catalog_governance_principals p
    where p.id = v_actor and p.principal_type = 'human' and p.active and p.revoked_at is null
  ) then
    raise exception 'Only a live human Food governance principal may review ingestion.' using errcode = '42501';
  end if;

  v_replay := private.food_catalog_governance_begin_operation(
    v_op, v_actor, 'food.ingestion.review', 'food_catalog_review_ingestion_batch_v1',
    null, null, v_policy, v_reason,
    jsonb_build_object('batchId', v_id, 'decision', v_action,
      'expectedReviewState', v_expected_state, 'manifest', v_manifest,
      'semantic', v_semantic, 'source', v_source, 'counts', v_counts,
      'reconciliationId', v_reconciliation_id, 'authorizationReference', v_authorization)
  );
  if v_replay is not null then return v_replay; end if;

  select * into v_batch from public.food_ingestion_batches
    where id = v_id for update;
  if not found or v_batch.review_state is distinct from v_expected_state then
    raise exception 'Stale or missing Food ingestion review state.' using errcode = '40001';
  end if;
  if v_batch.provider is distinct from (v_source->>'provider')
    or v_batch.dataset_name is distinct from (v_source->>'dataset')
    or v_batch.source_version is distinct from (v_source->>'sourceVersion')
    or v_batch.source_release_date::text is distinct from (v_source->>'sourceReleaseDate')
    or v_batch.license_name is distinct from (v_source->>'licenseName')
    or v_batch.license_reference is distinct from (v_source->>'licenseReference')
    or v_batch.source_reference is distinct from (v_source->>'sourceReference')
    or v_batch.source_checksum_sha256 is distinct from (v_source->>'sourceChecksumSha256')
    or v_batch.importer_version is distinct from (v_source->>'importerVersion')
    or v_batch.config_checksum_sha256 is distinct from (v_source->>'configChecksumSha256')
    or v_batch.manifest_content_checksum_sha256 is distinct from v_manifest
    or v_batch.semantic_identity_checksum_sha256 is distinct from v_semantic
    or jsonb_build_object(
      'input', v_batch.input_count, 'accepted', v_batch.accepted_count,
      'rejected', v_batch.rejected_count, 'matched', v_batch.matched_count,
      'created', v_batch.created_count, 'possibleDuplicate', v_batch.possible_duplicate_count,
      'quarantined', v_batch.expected_quarantine_count
    ) <> v_counts
  then
    raise exception 'Food ingestion reviewed batch identity or expected mutations have drifted.' using errcode = '23514';
  end if;

  if v_action in ('review', 'approve') then
    if not exists (
      select 1
      from public.food_ingestion_runs run
      join public.food_ingestion_reconciliations rec on rec.run_id = run.id
      where rec.id = v_reconciliation_id
        and run.batch_id = v_id and rec.batch_id = v_id
        and run.execution_mode = 'dry_run' and run.status = 'completed'
        and rec.reconciled and cardinality(rec.mismatch_codes) = 0
        and run.manifest_content_checksum_sha256 = v_manifest
        and rec.manifest_content_checksum_sha256 = v_manifest
        and rec.semantic_identity_checksum_sha256 = v_semantic
        and rec.expected_counts = v_counts and rec.observed_counts = v_counts
    ) then
      raise exception 'Food ingestion human approval requires an exact completed reconciled DB dry run.' using errcode = '23514';
    end if;
  end if;

  update public.food_ingestion_batches
     set review_state = case v_action
           when 'review' then 'reviewed' when 'approve' then 'approved' else 'rejected' end,
         reviewed_at = case when v_action = 'review' then clock_timestamp() else reviewed_at end,
         approved_at = case when v_action = 'approve' then clock_timestamp() else approved_at end,
         approval_reference = case when v_action = 'approve'
           then concat('plan9:', v_authorization, ':', v_reconciliation_id::text, ':', v_semantic)
           else approval_reference end
   where id = v_id and review_state = v_expected_state;
  if not found then
    raise exception 'Food ingestion review CAS conflict.' using errcode = '40001';
  end if;
  v_result := jsonb_build_object(
    'batchId', v_id, 'reviewState',
      case v_action when 'review' then 'reviewed' when 'approve' then 'approved' else 'rejected' end,
    'manifestContentChecksumSha256', v_manifest,
    'semanticIdentityChecksumSha256', v_semantic,
    'reconciliationId', v_reconciliation_id, 'operationId', v_op
  );
  return private.food_catalog_governance_finish_operation(
    v_op, null, v_id, case when v_reconciliation_id is null then '{}'::uuid[] else array[v_reconciliation_id]::uuid[] end, v_result,
    'food.ingestion.batch.review_decision',
    jsonb_build_object('batchId', v_id, 'decision', v_action,
      'manifest', v_manifest, 'semantic', v_semantic)
  );
end
$function$;

revoke execute on function public.food_catalog_review_ingestion_batch_v1(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.food_catalog_review_ingestion_batch_v1(jsonb)
  to authenticated;
