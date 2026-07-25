\set ON_ERROR_STOP on

begin;

do $$
begin
  if to_regclass('public.workout_session_prescription_sets') is null
     or to_regclass('public.workout_session_prescription_metric_targets') is null then
    raise exception 'AW-3C canonical prescription tables are missing.';
  end if;
  if to_regprocedure('private.materialize_workout_session_prescription_item(uuid)') is null then
    raise exception 'AW-3C authoritative materializer is missing.';
  end if;
  if not exists (
    select 1 from pg_trigger trigger
    where trigger.tgrelid = 'public.workout_session_muscle_snapshot_items'::regclass
      and trigger.tgname = 'workout_session_snapshot_item_prescription_materializer'
      and not trigger.tgisinternal
  ) then raise exception 'AW-3C item materializer trigger is missing.'; end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'workout_session_prescription_sets'
      and policyname = 'workout_session_prescription_sets_owner_select'
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'workout_session_prescription_metric_targets'
      and policyname = 'workout_session_prescription_targets_owner_select'
  ) then raise exception 'AW-3C owner SELECT RLS policies are missing.'; end if;

  if has_table_privilege('authenticated','public.workout_session_prescription_sets','INSERT')
     or has_table_privilege('authenticated','public.workout_session_prescription_sets','UPDATE')
     or has_table_privilege('authenticated','public.workout_session_prescription_sets','DELETE')
     or has_table_privilege('authenticated','public.workout_session_prescription_metric_targets','INSERT')
     or has_table_privilege('authenticated','public.workout_session_prescription_metric_targets','UPDATE')
     or has_table_privilege('authenticated','public.workout_session_prescription_metric_targets','DELETE') then
    raise exception 'Authenticated direct AW-3C mutation privilege exists.';
  end if;

  if has_function_privilege('authenticated','private.materialize_workout_session_prescription_item(uuid)','EXECUTE')
     or has_function_privilege('anon','private.materialize_workout_session_prescription_item(uuid)','EXECUTE') then
    raise exception 'AW-3C private materializer is externally executable.';
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from public.workout_session_prescription_sets prescription_set
    left join public.workout_session_muscle_snapshot_items item
      on item.id = prescription_set.snapshot_item_id
      and item.snapshot_id = prescription_set.snapshot_id
      and item.user_id = prescription_set.user_id
    left join public.workout_session_muscle_snapshots snapshot
      on snapshot.id = prescription_set.snapshot_id
      and snapshot.workout_session_id = prescription_set.workout_session_id
      and snapshot.user_id = prescription_set.user_id
    where item.id is null or snapshot.id is null
  ) then raise exception 'AW-3C set owner/session mismatch or orphan exists.'; end if;

  if exists (
    select 1
    from public.workout_session_prescription_metric_targets target
    left join public.workout_session_prescription_sets prescription_set
      on prescription_set.id = target.prescription_set_id
      and prescription_set.snapshot_item_id = target.snapshot_item_id
      and prescription_set.workout_session_id = target.workout_session_id
      and prescription_set.user_id = target.user_id
    where prescription_set.id is null
  ) then raise exception 'AW-3C target owner/session mismatch or orphan exists.'; end if;

  if exists (
    select snapshot_item_id,set_order from public.workout_session_prescription_sets
    group by snapshot_item_id,set_order having count(*) > 1
  ) or exists (
    select prescription_set_id,metric_key,metric_version,side
    from public.workout_session_prescription_metric_targets
    group by prescription_set_id,metric_key,metric_version,side having count(*) > 1
  ) then raise exception 'AW-3C duplicate immutable identity exists.'; end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_indexes where schemaname='public' and indexname='workout_session_prescription_sets_item_order_key')
     or not exists (select 1 from pg_indexes where schemaname='public' and indexname='workout_session_prescription_metric_targets_identity_key')
     or not exists (select 1 from pg_indexes where schemaname='public' and indexname='workout_session_prescription_sets_session_item_order_idx')
     or not exists (select 1 from pg_indexes where schemaname='public' and indexname='workout_session_prescription_sets_export_idx')
     or not exists (select 1 from pg_indexes where schemaname='public' and indexname='workout_session_prescription_targets_export_idx') then
    raise exception 'AW-3C required read/FK/export indexes are missing.';
  end if;
  if (select migration_version from public.release_schema_compatibility where singleton) <> '20260724232734' then
    raise exception 'AW-3C compatibility marker changed.';
  end if;
end
$$;

rollback;
