begin;

-- AW-2A forward-only correction: cover the optional active snapshot-item FK
-- without changing the immutable execution-state schema or compatibility marker.
do $aw2a_corrections_preflight$
declare
  v_marker text;
begin
  if to_regclass('public.workout_session_execution_states') is null then
    raise exception 'AW-2A correction requires public.workout_session_execution_states.';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.workout_session_execution_states'::regclass
      and constraint_row.conname = 'workout_session_execution_states_active_snapshot_item_id_fkey'
      and constraint_row.contype = 'f'
      and pg_get_constraintdef(constraint_row.oid) = 'FOREIGN KEY (active_snapshot_item_id) REFERENCES workout_session_muscle_snapshot_items(id) ON DELETE SET NULL'
  ) then
    raise exception 'AW-2A correction requires the reviewed active snapshot-item foreign key.';
  end if;

  if to_regclass('public.workout_session_execution_states_active_snapshot_item_idx') is not null then
    raise exception 'AW-2A correction index already exists; refusing repeated or partial application.';
  end if;

  select migration_version into strict v_marker
  from public.release_schema_compatibility
  where singleton;

  if v_marker <> '20260717051011' then
    raise exception 'Compatibility marker drifted before AW-2A correction: %.', v_marker;
  end if;
end
$aw2a_corrections_preflight$;

create temporary table aw2a_corrections_compatibility_marker on commit drop as
select migration_version as marker
from public.release_schema_compatibility
where singleton;

create index workout_session_execution_states_active_snapshot_item_idx
  on public.workout_session_execution_states(active_snapshot_item_id)
  where active_snapshot_item_id is not null;

comment on index public.workout_session_execution_states_active_snapshot_item_idx is
  'Covering partial index for the optional active snapshot-item foreign key used by AW-2A execution state.';

do $aw2a_corrections_postconditions$
declare
  v_marker_before text;
  v_marker_after text;
  v_index_definition text;
  v_index_predicate text;
begin
  select marker into strict v_marker_before
  from aw2a_corrections_compatibility_marker;

  select migration_version into strict v_marker_after
  from public.release_schema_compatibility
  where singleton;

  if v_marker_after is distinct from v_marker_before then
    raise exception 'AW-2A correction changed the release compatibility marker from % to %.', v_marker_before, v_marker_after;
  end if;

  select pg_get_indexdef(index_row.indexrelid), pg_get_expr(index_row.indpred, index_row.indrelid)
    into v_index_definition, v_index_predicate
  from pg_index index_row
  where index_row.indexrelid = 'public.workout_session_execution_states_active_snapshot_item_idx'::regclass
    and index_row.indrelid = 'public.workout_session_execution_states'::regclass
    and index_row.indisvalid
    and index_row.indisready
    and not index_row.indisunique;

  if v_index_definition is null
     or v_index_definition !~ '\(active_snapshot_item_id\)'
     or v_index_predicate !~ 'active_snapshot_item_id IS NOT NULL' then
    raise exception 'AW-2A active snapshot-item FK covering index is missing or incorrect: %, %.', v_index_definition, v_index_predicate;
  end if;
end
$aw2a_corrections_postconditions$;

commit;
