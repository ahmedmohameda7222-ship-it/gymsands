\set ON_ERROR_STOP on

begin;
set local transaction read only;

do $aw2a_verify_schema$
declare
  v_expected_columns text[] := array[
    'workout_session_id:uuid:NO',
    'user_id:uuid:NO',
    'state_version:int4:NO',
    'revision:int8:NO',
    'session_state:text:NO',
    'view_state:text:NO',
    'active_snapshot_item_id:uuid:YES',
    'active_item_order:int4:NO',
    'active_set_number:int4:NO',
    'session_elapsed_seconds:int4:NO',
    'session_running_since:timestamptz:YES',
    'rest_started_at:timestamptz:YES',
    'rest_duration_seconds:int4:YES',
    'rest_ends_at:timestamptz:YES',
    'controller_device_id:text:YES',
    'bootstrap_source:text:NO',
    'created_at:timestamptz:NO',
    'updated_at:timestamptz:NO'
  ];
  v_actual_columns text[];
  v_integrity_definition text;
  v_initializer_definition text;
  v_cleanup_definition text;
  v_marker text;
begin
  if to_regclass('public.workout_session_execution_states') is null then
    raise exception 'AW-2A execution-state table is missing.';
  end if;

  select array_agg(column_name || ':' || udt_name || ':' || is_nullable order by ordinal_position)
    into v_actual_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'workout_session_execution_states';

  if v_actual_columns is distinct from v_expected_columns then
    raise exception 'AW-2A execution-state column contract differs: %', v_actual_columns;
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.workout_session_execution_states'::regclass
      and constraint_row.contype = 'p'
      and pg_get_constraintdef(constraint_row.oid) = 'PRIMARY KEY (workout_session_id)'
  ) then
    raise exception 'AW-2A one-row-per-session primary key is missing.';
  end if;

  if not exists (
    select 1 from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.workout_session_execution_states'::regclass
      and constraint_row.contype = 'f'
      and pg_get_constraintdef(constraint_row.oid) = 'FOREIGN KEY (workout_session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE'
  ) or not exists (
    select 1 from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.workout_session_execution_states'::regclass
      and constraint_row.contype = 'f'
      and pg_get_constraintdef(constraint_row.oid) = 'FOREIGN KEY (active_snapshot_item_id) REFERENCES workout_session_muscle_snapshot_items(id) ON DELETE SET NULL'
  ) then
    raise exception 'AW-2A root or snapshot-item foreign key is incorrect.';
  end if;

  if not exists (
    select 1
    from pg_index index_row
    where index_row.indexrelid = 'public.workout_session_execution_states_active_snapshot_item_idx'::regclass
      and index_row.indrelid = 'public.workout_session_execution_states'::regclass
      and index_row.indisvalid
      and index_row.indisready
      and not index_row.indisunique
      and pg_get_indexdef(index_row.indexrelid) ~ '\(active_snapshot_item_id\)'
      and pg_get_expr(index_row.indpred, index_row.indrelid) ~ 'active_snapshot_item_id IS NOT NULL'
  ) then
    raise exception 'AW-2A active snapshot-item FK covering index is missing or incorrect.';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.workout_session_execution_states'::regclass) then
    raise exception 'AW-2A row-level security is not enabled.';
  end if;

  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'workout_session_execution_states') <> 2
     or not exists (
       select 1 from pg_policies
       where schemaname = 'public'
         and tablename = 'workout_session_execution_states'
         and policyname = 'workout_session_execution_states_member_select'
         and cmd = 'SELECT'
         and roles = array['authenticated']::name[]
         and qual ~ 'user_id = \( SELECT auth.uid\(\)'
     )
     or not exists (
       select 1 from pg_policies
       where schemaname = 'public'
         and tablename = 'workout_session_execution_states'
         and policyname = 'workout_session_execution_states_member_update'
         and cmd = 'UPDATE'
         and roles = array['authenticated']::name[]
         and qual ~ 'user_id = \( SELECT auth.uid\(\)'
         and with_check ~ 'user_id = \( SELECT auth.uid\(\)'
     ) then
    raise exception 'AW-2A owner-scoped RLS policies are missing or broadened.';
  end if;

  if has_table_privilege('anon', 'public.workout_session_execution_states', 'SELECT')
     or has_table_privilege('anon', 'public.workout_session_execution_states', 'INSERT')
     or has_table_privilege('anon', 'public.workout_session_execution_states', 'UPDATE')
     or has_table_privilege('anon', 'public.workout_session_execution_states', 'DELETE')
     or has_table_privilege('authenticated', 'public.workout_session_execution_states', 'INSERT')
     or has_table_privilege('authenticated', 'public.workout_session_execution_states', 'DELETE')
     or not has_table_privilege('authenticated', 'public.workout_session_execution_states', 'SELECT')
     or not has_table_privilege('authenticated', 'public.workout_session_execution_states', 'UPDATE')
     or not has_table_privilege('service_role', 'public.workout_session_execution_states', 'SELECT')
     or not has_table_privilege('service_role', 'public.workout_session_execution_states', 'INSERT')
     or not has_table_privilege('service_role', 'public.workout_session_execution_states', 'UPDATE')
     or not has_table_privilege('service_role', 'public.workout_session_execution_states', 'DELETE') then
    raise exception 'AW-2A table grants are not least-privilege.';
  end if;

  if exists (
    select 1
    from pg_class relation
    cross join lateral aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) grant_acl
    where relation.oid = 'public.workout_session_execution_states'::regclass
      and grant_acl.grantee = 0
  ) then
    raise exception 'PUBLIC retains AW-2A execution-state table privileges.';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.workout_session_execution_states'::regclass
      and tgname = 'workout_session_execution_states_integrity_guard'
      and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.workout_session_muscle_snapshots'::regclass
      and tgname = 'workout_session_execution_state_snapshot_initializer'
      and tgdeferrable and tginitdeferred and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.workout_sessions'::regclass
      and tgname = 'workout_session_execution_state_terminal_cleanup'
      and not tgisinternal
  ) then
    raise exception 'AW-2A integrity, initializer, or terminal cleanup trigger is missing.';
  end if;

  select lower(pg_get_functiondef('private.enforce_workout_session_execution_state()'::regprocedure))
    into v_integrity_definition;
  select lower(pg_get_functiondef('private.initialize_workout_session_execution_state(uuid,text,timestamp with time zone)'::regprocedure))
    into v_initializer_definition;
  select lower(pg_get_functiondef('private.cleanup_workout_session_execution_state()'::regprocedure))
    into v_cleanup_definition;

  if v_integrity_definition !~ 'revision is distinct from old.revision'
     or v_integrity_definition !~ 'old.revision \+ 1' then
    raise exception 'Revision guard source contract is missing.';
  end if;

  if v_integrity_definition !~ 'old.bootstrap_source = ''legacy_backfill'''
     or v_integrity_definition !~ 'new.bootstrap_source = ''client_cache_import''' then
    raise exception 'Bootstrap-source transition guard source contract is missing.';
  end if;

  if v_integrity_definition !~ 'active execution cursor must reference the same user and workout session'
     or v_integrity_definition !~ 'rest execution state requires one valid timestamp-based rest tuple' then
    raise exception 'Execution-state integrity source contract is missing.';
  end if;

  if v_initializer_definition ~ 'exercise_name'
     or v_initializer_definition !~ 'source_plan_activity_id'
     or v_initializer_definition !~ 'source_plan_exercise_id'
     or v_initializer_definition !~ 'exercise_order = item.item_order' then
    raise exception 'Snapshot initializer source contract is missing.';
  end if;

  if v_cleanup_definition !~ 'delete from public.workout_session_execution_states'
     or v_cleanup_definition !~ 'workout_session_id = new.id' then
    raise exception 'Terminal cleanup source contract is missing.';
  end if;

  select migration_version into strict v_marker
  from public.release_schema_compatibility
  where singleton;
  if v_marker not in ('20260711014500', '20260717051011')
     or v_marker = '20260720213000' then
    raise exception 'AW-2A changed the release compatibility marker: %', v_marker;
  end if;
end
$aw2a_verify_schema$;

do $aw2a_verify_rows$
begin
  if exists (
    select 1
    from public.workout_sessions session
    left join public.workout_session_execution_states state
      on state.workout_session_id = session.id
    where session.status = 'started'
    group by session.id
    having count(state.workout_session_id) <> 1
  ) then
    raise exception 'Open workout session is missing exactly one execution-state row.';
  end if;

  if exists (
    select 1
    from public.workout_session_execution_states state
    join public.workout_sessions session on session.id = state.workout_session_id
    where session.status <> 'started'
  ) then
    raise exception 'Terminal workout session retains execution state.';
  end if;

  if exists (
    select 1
    from public.workout_session_execution_states state
    join public.workout_sessions session on session.id = state.workout_session_id
    where state.user_id <> session.user_id
  ) then
    raise exception 'Execution-state owner differs from root-session owner.';
  end if;

  if exists (
    select 1
    from public.workout_session_execution_states state
    join public.workout_session_muscle_snapshot_items item on item.id = state.active_snapshot_item_id
    join public.workout_session_muscle_snapshots snapshot on snapshot.id = item.snapshot_id
    where item.user_id <> state.user_id
       or snapshot.workout_session_id <> state.workout_session_id
       or item.item_order <> state.active_item_order
  ) then
    raise exception 'An AW-2A active cursor crosses session, owner, or item order.';
  end if;
end
$aw2a_verify_rows$;

rollback;
