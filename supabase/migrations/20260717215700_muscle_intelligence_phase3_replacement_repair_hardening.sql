begin;

do $preflight$
declare
  v_marker text;
  v_snapshots integer;
  v_items integer;
  v_recent integer;
begin
  if to_regclass('public.workout_session_muscle_snapshots') is null
     or to_regclass('public.workout_session_muscle_snapshot_items') is null then
    raise exception 'Phase 3 snapshot tables are missing.';
  end if;
  select count(*) into v_snapshots from public.workout_session_muscle_snapshots where source = 'legacy_backfill';
  select count(*) into v_items from public.workout_session_muscle_snapshot_items item join public.workout_session_muscle_snapshots snapshot on snapshot.id=item.snapshot_id where snapshot.source='legacy_backfill';
  if v_snapshots <> 9 or v_items <> 29 then
    raise exception 'Phase 3 legacy baseline drifted: % snapshots, % items.', v_snapshots, v_items;
  end if;
  if exists (select 1 from public.workout_session_muscle_snapshots snapshot join public.workout_sessions session on session.id=snapshot.workout_session_id where snapshot.user_id<>session.user_id) then
    raise exception 'Phase 3 snapshot ownership mismatch exists.';
  end if;
  select migration_version into v_marker from public.release_schema_compatibility where singleton;
  if v_marker is distinct from '20260717051011' then
    raise exception 'Compatibility marker drifted before Phase 3 correction: %.', v_marker;
  end if;
  select count(*) into v_recent from public.workout_sessions where created_at >= timestamptz '2026-07-17 19:48:47+00';
  raise notice 'Detected % workout sessions created after the first Phase 3 migration.', v_recent;
end
$preflight$;
do $replacement_preflight$
begin
  if to_regprocedure('public.start_or_resume_direct_workout_session_atomic(uuid,text,text,text,text,text,jsonb,uuid)') is null then
    raise exception 'Direct-session authority must precede replacement/repair hardening.';
  end if;
  if to_regprocedure('public.get_workout_replacement_candidate_eligibility(uuid,jsonb)') is not null then
    raise exception 'Replacement/repair hardening appears partially applied.';
  end if;
end
$replacement_preflight$;

create temporary table phase3_legacy_snapshot_baseline on commit drop as
select id, md5(to_jsonb(snapshot)::text) as row_hash
from public.workout_session_muscle_snapshots snapshot
where source = 'legacy_backfill';

create temporary table phase3_legacy_item_baseline on commit drop as
select item.id, md5(to_jsonb(item)::text) as row_hash
from public.workout_session_muscle_snapshot_items item
join public.workout_session_muscle_snapshots snapshot on snapshot.id = item.snapshot_id
where snapshot.source = 'legacy_backfill';

create or replace function public.get_workout_replacement_candidate_eligibility(
  p_user_id uuid,
  p_candidates jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_candidate jsonb;
  v_results jsonb := '[]'::jsonb;
  v_key text;
  v_type text;
  v_identity text;
  v_provider text;
  v_uuid uuid;
  v_global_id uuid;
  v_custom_id uuid;
  v_eligible boolean;
  v_reason text;
begin
  perform public.assert_workout_actor(p_user_id);
  if jsonb_typeof(p_candidates) <> 'array' or jsonb_array_length(p_candidates) > 100 then
    raise exception 'Replacement candidates must be a bounded JSON array.' using errcode = '22023';
  end if;

  for v_candidate in select value from jsonb_array_elements(p_candidates)
  loop
    v_key := v_candidate->>'key';
    v_type := v_candidate->>'targetType';
    v_identity := v_candidate->>'identity';
    v_provider := v_candidate->>'provider';
    v_uuid := null;
    v_global_id := null;
    v_custom_id := null;
    v_eligible := false;
    v_reason := 'unsupported_identity';

    if v_type in ('global_exercise', 'custom_exercise') then
      begin
        v_uuid := v_identity::uuid;
      exception when invalid_text_representation then
        v_reason := 'invalid_identity';
      end;
    end if;

    if v_type = 'global_exercise' and v_uuid is not null then
      select exercise.id into v_global_id
      from public.exercises exercise
      where exercise.is_global
        and exercise.is_approved
        and (exercise.id = v_uuid or exercise.legacy_workout_id = v_uuid)
      order by (exercise.id = v_uuid) desc, exercise.id
      limit 1;
      v_eligible := v_global_id is not null and exists (
        select 1 from public.exercise_muscle_mapping_sets mapping
        where mapping.exercise_id = v_global_id
          and mapping.status = 'published'
          and mapping.published_at <= clock_timestamp()
          and (mapping.retired_at is null or mapping.retired_at > clock_timestamp())
      );
      v_reason := case
        when v_global_id is null then 'canonical_exercise_unavailable'
        when not v_eligible then 'published_mapping_unavailable'
        else null
      end;
    elsif v_type = 'provider_activity' then
      select exercise.id into v_global_id
      from public.exercise_provider_links link
      join public.exercises exercise
        on exercise.id = link.exercise_id
       and exercise.is_global
       and exercise.is_approved
      where link.provider = v_provider
        and link.provider_activity_id = v_identity
        and link.verification_status = 'verified'
      order by link.verified_at desc nulls last, link.id
      limit 1;
      v_eligible := v_global_id is not null and exists (
        select 1 from public.exercise_muscle_mapping_sets mapping
        where mapping.exercise_id = v_global_id
          and mapping.status = 'published'
          and mapping.published_at <= clock_timestamp()
          and (mapping.retired_at is null or mapping.retired_at > clock_timestamp())
      );
      v_reason := case
        when v_global_id is null then 'provider_bridge_unavailable'
        when not v_eligible then 'published_mapping_unavailable'
        else null
      end;
    elsif v_type = 'custom_exercise' and v_uuid is not null then
      select custom.id into v_custom_id
      from public.user_custom_exercises custom
      where custom.id = v_uuid and custom.user_id = p_user_id;
      v_eligible := v_custom_id is not null and exists (
        select 1 from public.user_custom_exercise_mapping_sets mapping
        where mapping.custom_exercise_id = v_custom_id
          and mapping.user_id = p_user_id
          and mapping.status = 'published'
          and mapping.published_at <= clock_timestamp()
          and (mapping.retired_at is null or mapping.retired_at > clock_timestamp())
      );
      v_reason := case
        when v_custom_id is null then 'custom_exercise_unavailable'
        when not v_eligible then 'published_mapping_unavailable'
        else null
      end;
    end if;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'key', v_key,
      'eligible', v_eligible,
      'reason', v_reason
    ));
  end loop;
  return v_results;
end
$function$;

-- Repair only rows whose direct terminal insert is provable. Legacy snapshots are
-- excluded and protected by byte-for-byte baseline hashes above.
create temporary table phase3_terminal_insert_repairs on commit drop as
select snapshot.id as snapshot_id, session.id as session_id
from public.workout_session_muscle_snapshots snapshot
join public.workout_sessions session on session.id = snapshot.workout_session_id
where snapshot.source = 'session_start'
  and session.created_at >= timestamptz '2026-07-17 19:48:47+00'
  and session.status in ('completed', 'skipped')
  and (
    exists (
      select 1
      from public.workout_session_muscle_snapshot_items item
      where item.snapshot_id = snapshot.id and item.state = 'planned'
    )
    or (
      not exists (
        select 1 from public.workout_session_muscle_snapshot_items item
        where item.snapshot_id = snapshot.id
      )
      and not exists (
        select 1 from public.exercise_logs log
        where log.workout_session_id = session.id and log.completed_at is not null
      )
      and session.completed_at is not null
      and abs(extract(epoch from (session.completed_at - session.started_at))) < 1
    )
  );

do $repair$
declare
  target record;
begin
  for target in select * from phase3_terminal_insert_repairs order by session_id
  loop
    perform set_config('plaivra.session_snapshot_mutation_id', target.snapshot_id::text, true);
    update public.workout_session_muscle_snapshots
    set source = 'terminal_insert'
    where id = target.snapshot_id;
    perform private.phase3_reconcile_terminal_session(target.session_id);
  end loop;
  raise notice 'Phase 3 lifecycle correction repaired % provable terminal inserts.',
    (select count(*) from phase3_terminal_insert_repairs);
end
$repair$;

revoke all on function public.get_workout_replacement_candidate_eligibility(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.get_workout_replacement_candidate_eligibility(uuid,jsonb) to authenticated, service_role;

do $postconditions$
declare v_marker text; v_routine oid;
begin
  if exists (
    select 1 from phase3_legacy_snapshot_baseline baseline
    full join (select id, md5(to_jsonb(snapshot)::text) row_hash from public.workout_session_muscle_snapshots snapshot where source='legacy_backfill') current using (id,row_hash)
    where baseline.id is null or current.id is null
  ) then raise exception 'Legacy Phase 3 snapshots changed.'; end if;
  if exists (
    select 1 from phase3_legacy_item_baseline baseline
    full join (select item.id, md5(to_jsonb(item)::text) row_hash from public.workout_session_muscle_snapshot_items item join public.workout_session_muscle_snapshots snapshot on snapshot.id=item.snapshot_id where snapshot.source='legacy_backfill') current using (id,row_hash)
    where baseline.id is null or current.id is null
  ) then raise exception 'Legacy Phase 3 snapshot items changed.'; end if;
  if exists (select 1 from public.workout_sessions session left join public.workout_session_muscle_snapshots snapshot on snapshot.workout_session_id=session.id where snapshot.id is null) then
    raise exception 'A workout session committed without a Phase 3 snapshot.';
  end if;
  if exists (select 1 from public.workout_session_muscle_snapshots snapshot join public.workout_sessions session on session.id=snapshot.workout_session_id where snapshot.user_id<>session.user_id) then
    raise exception 'Snapshot owner mismatch exists after repair.';
  end if;
  if exists (select 1 from public.workout_session_muscle_snapshot_items item join public.workout_session_muscle_snapshots snapshot on snapshot.id=item.snapshot_id join public.workout_sessions session on session.id=snapshot.workout_session_id where snapshot.source='terminal_insert' and session.status in ('completed','skipped') and item.state='planned') then
    raise exception 'A terminally inserted snapshot item remained planned.';
  end if;
  v_routine := to_regprocedure('public.get_workout_replacement_candidate_eligibility(uuid,jsonb)');
  if v_routine is null or not (select prosecdef from pg_proc where oid=v_routine)
     or coalesce((select array_to_string(proconfig, ',') from pg_proc where oid=v_routine),'') not like '%search_path=%' then
    raise exception 'Replacement eligibility RPC is missing or not hardened.';
  end if;
  if has_function_privilege('anon',v_routine,'EXECUTE') or not has_function_privilege('authenticated',v_routine,'EXECUTE') then raise exception 'Replacement eligibility grants are incorrect.'; end if;
  select migration_version into v_marker from public.release_schema_compatibility where singleton;
  if v_marker is distinct from '20260717051011' then raise exception 'Compatibility marker changed.'; end if;
end
$postconditions$;

commit;
