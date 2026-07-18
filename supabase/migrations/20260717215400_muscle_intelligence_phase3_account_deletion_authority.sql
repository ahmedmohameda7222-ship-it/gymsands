begin;

do $preflight$
declare
  v_marker text;
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.user_workout_plans') is null
     or to_regclass('public.user_workout_plan_days') is null
     or to_regclass('public.user_workout_plan_exercises') is null
     or to_regclass('public.account_access_states') is null
     or to_regclass('public.account_deletion_jobs') is null
     or to_regclass('public.privacy_deletion_legal_holds') is null then
    raise exception 'Account-deletion authority requires the canonical privacy lifecycle and Train tables.';
  end if;
  if to_regprocedure('public.prevent_workout_history_identity_delete()') is null then
    raise exception 'Train history-preservation guard is missing.';
  end if;
  if to_regclass('private.account_deletion_workout_identity_context') is not null
     or to_regprocedure('private.account_deletion_allows_workout_identity(text,uuid)') is not null
     or to_regprocedure('public.purge_account_application_data_atomic(uuid)') is not null then
    raise exception 'Account-deletion authority appears partially applied.';
  end if;
  select migration_version into v_marker
  from public.release_schema_compatibility
  where singleton;
  if v_marker not in ('20260711014500', '20260717051011') then
    raise exception 'Compatibility marker drifted before account-deletion authority: %.', v_marker;
  end if;
end
$preflight$;

create temporary table phase3_account_deletion_authority_baseline on commit drop as
select
  (select count(*) from auth.users) as auth_user_count,
  (select count(*) from public.profiles) as profile_count,
  (select count(*) from public.account_access_states) as access_state_count,
  (select count(*) from public.account_deletion_jobs) as deletion_job_count,
  (select count(*) from public.privacy_deletion_legal_holds) as legal_hold_count,
  (select count(*) from public.user_workout_plans) as plan_count,
  (select count(*) from public.workout_sessions) as performed_session_count,
  (select count(*) from public.user_workout_sessions) as scheduled_session_count,
  (select count(*) from public.workout_session_muscle_snapshots) as snapshot_count,
  (select count(*) from public.workout_session_muscle_snapshot_items) as snapshot_item_count;

create table private.account_deletion_workout_identity_context (
  backend_pid integer not null,
  transaction_id bigint not null,
  user_id uuid not null,
  identity_type text not null,
  identity_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint account_deletion_workout_identity_context_pk
    primary key (backend_pid, transaction_id, identity_type, identity_id),
  constraint account_deletion_workout_identity_context_type_check
    check (identity_type in ('account', 'workout_plan', 'workout_day', 'workout_exercise'))
);

revoke all on table private.account_deletion_workout_identity_context
from public, anon, authenticated, service_role;

comment on table private.account_deletion_workout_identity_context is
  'Transaction-scoped exact workout identities captured by the authoritative account-data purge. Never populated by clients.';

create or replace function private.account_deletion_allows_workout_identity(
  p_table_name text,
  p_identity_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from private.account_deletion_workout_identity_context context
    where context.backend_pid = pg_backend_pid()
      and context.transaction_id = txid_current()
      and context.identity_type = case p_table_name
        when 'user_workout_plans' then 'workout_plan'
        when 'user_workout_plan_days' then 'workout_day'
        when 'user_workout_plan_exercises' then 'workout_exercise'
      end
      and context.identity_id = p_identity_id
      and exists (
        select 1
        from private.account_deletion_workout_identity_context account_context
        where account_context.backend_pid = context.backend_pid
          and account_context.transaction_id = context.transaction_id
          and account_context.user_id = context.user_id
          and account_context.identity_type = 'account'
          and account_context.identity_id = context.user_id
      )
  );
$function$;

revoke all on function private.account_deletion_allows_workout_identity(text,uuid)
from public, anon, authenticated, service_role;

create or replace function public.prevent_workout_history_identity_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op <> 'DELETE' then
    raise exception 'Workout history identity guard supports delete operations only.' using errcode = '23514';
  end if;

  if private.account_deletion_allows_workout_identity(tg_table_name, old.id) then
    return old;
  end if;

  if tg_table_name = 'user_workout_plan_exercises' then
    if exists (select 1 from public.exercise_logs where plan_exercise_id = old.id)
       or exists (select 1 from public.user_exercise_logs where plan_exercise_id = old.id) then
      raise exception 'This exercise has workout history. Remove it from the current plan instead of deleting its identity.'
        using errcode = '23503';
    end if;
  elsif tg_table_name = 'user_workout_plan_days' then
    if exists (select 1 from public.workout_sessions where plan_day_id = old.id)
       or exists (select 1 from public.user_workout_sessions where plan_day_id = old.id) then
      raise exception 'This workout day has session history. Archive it instead of deleting its identity.'
        using errcode = '23503';
    end if;
  elsif tg_table_name = 'user_workout_plans' then
    if exists (select 1 from public.workout_sessions where plan_id = old.id)
       or exists (select 1 from public.user_workout_sessions where user_workout_plan_id = old.id) then
      raise exception 'This workout plan has session history. Archive it instead of deleting it.'
        using errcode = '23503';
    end if;
  else
    raise exception 'Workout history identity guard is attached to an unsupported table.' using errcode = '23514';
  end if;

  return old;
end;
$function$;

revoke all on function public.prevent_workout_history_identity_delete()
from public, anon, authenticated, service_role;

create or replace function public.purge_account_application_data_atomic(
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_backend_pid integer := pg_backend_pid();
  v_transaction_id bigint := txid_current();
  v_deletion_job_id uuid;
  v_profile_deleted integer := 0;
  v_plan_count integer := 0;
  v_day_count integer := 0;
  v_exercise_count integer := 0;
  v_performed_session_count integer := 0;
  v_scheduled_session_count integer := 0;
  v_snapshot_count integer := 0;
  v_snapshot_item_count integer := 0;
begin
  if p_user_id is null then
    raise exception 'User id is required for account-data purge.' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('plaivra-account-data-purge:' || p_user_id::text, 0));

  begin
    select job.id into strict v_deletion_job_id
    from public.account_deletion_jobs job
    where job.user_id = p_user_id
      and job.state = 'processing'
      and job.stage = 'deleting_database'
    for update;
  exception
    when no_data_found then
      raise exception 'An active deleting_database account-deletion job is required.' using errcode = '55000';
    when too_many_rows then
      raise exception 'Multiple active account-deletion jobs exist for the same user.' using errcode = '23514';
  end;

  if not exists (
    select 1
    from public.account_access_states access_state
    where access_state.user_id = p_user_id
      and access_state.state = 'deletion_processing'
      and access_state.disabled_at is not null
  ) then
    raise exception 'Account access must be disabled before application data is purged.' using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.privacy_deletion_legal_holds legal_hold
    where legal_hold.user_id = p_user_id
      and legal_hold.released_at is null
  ) then
    raise exception 'Account data cannot be purged while a legal hold is active.' using errcode = '55000';
  end if;

  if exists (
    select 1
    from private.account_deletion_workout_identity_context context
    where context.backend_pid = v_backend_pid
      and context.transaction_id = v_transaction_id
  ) then
    raise exception 'Another account-data purge is already active in this transaction.' using errcode = '40001';
  end if;

  if not exists (select 1 from public.profiles profile where profile.id = p_user_id) then
    if exists (select 1 from public.user_workout_plans plan where plan.user_id = p_user_id)
       or exists (select 1 from public.workout_sessions session where session.user_id = p_user_id)
       or exists (select 1 from public.user_workout_sessions session where session.user_id = p_user_id)
       or exists (select 1 from public.workout_session_muscle_snapshots snapshot where snapshot.user_id = p_user_id)
       or exists (select 1 from public.workout_session_muscle_snapshot_items item where item.user_id = p_user_id) then
      raise exception 'Profile is missing while owner-scoped Train data remains.' using errcode = '23514';
    end if;

    return jsonb_build_object(
      'application_data_purged', true,
      'deletion_job_id', v_deletion_job_id,
      'profile_already_absent', true,
      'profiles_deleted', 0,
      'workout_plans_deleted', 0,
      'workout_days_deleted', 0,
      'workout_exercises_deleted', 0,
      'performed_sessions_deleted', 0,
      'scheduled_sessions_deleted', 0,
      'muscle_snapshots_deleted', 0,
      'muscle_snapshot_items_deleted', 0
    );
  end if;

  select count(*) into v_plan_count
  from public.user_workout_plans plan
  where plan.user_id = p_user_id;

  select count(*) into v_day_count
  from public.user_workout_plan_days day
  join public.user_workout_plans plan on plan.id = day.plan_id
  where plan.user_id = p_user_id;

  select count(*) into v_exercise_count
  from public.user_workout_plan_exercises exercise
  join public.user_workout_plan_days day on day.id = exercise.plan_day_id
  join public.user_workout_plans plan on plan.id = day.plan_id
  where plan.user_id = p_user_id;

  select count(*) into v_performed_session_count
  from public.workout_sessions session
  where session.user_id = p_user_id;

  select count(*) into v_scheduled_session_count
  from public.user_workout_sessions session
  where session.user_id = p_user_id;

  select count(*) into v_snapshot_count
  from public.workout_session_muscle_snapshots snapshot
  where snapshot.user_id = p_user_id;

  select count(*) into v_snapshot_item_count
  from public.workout_session_muscle_snapshot_items item
  where item.user_id = p_user_id;

  insert into private.account_deletion_workout_identity_context(
    backend_pid, transaction_id, user_id, identity_type, identity_id
  ) values (
    v_backend_pid, v_transaction_id, p_user_id, 'account', p_user_id
  );

  insert into private.account_deletion_workout_identity_context(
    backend_pid, transaction_id, user_id, identity_type, identity_id
  )
  select v_backend_pid, v_transaction_id, p_user_id, 'workout_plan', plan.id
  from public.user_workout_plans plan
  where plan.user_id = p_user_id;

  insert into private.account_deletion_workout_identity_context(
    backend_pid, transaction_id, user_id, identity_type, identity_id
  )
  select v_backend_pid, v_transaction_id, p_user_id, 'workout_day', day.id
  from public.user_workout_plan_days day
  join public.user_workout_plans plan on plan.id = day.plan_id
  where plan.user_id = p_user_id;

  insert into private.account_deletion_workout_identity_context(
    backend_pid, transaction_id, user_id, identity_type, identity_id
  )
  select v_backend_pid, v_transaction_id, p_user_id, 'workout_exercise', exercise.id
  from public.user_workout_plan_exercises exercise
  join public.user_workout_plan_days day on day.id = exercise.plan_day_id
  join public.user_workout_plans plan on plan.id = day.plan_id
  where plan.user_id = p_user_id;

  delete from public.profiles profile
  where profile.id = p_user_id;
  get diagnostics v_profile_deleted = row_count;

  if v_profile_deleted <> 1 then
    raise exception 'Profile changed while account data was being purged.' using errcode = '40001';
  end if;

  if exists (select 1 from public.profiles profile where profile.id = p_user_id)
     or exists (select 1 from public.user_workout_plans plan where plan.user_id = p_user_id)
     or exists (select 1 from public.workout_sessions session where session.user_id = p_user_id)
     or exists (select 1 from public.user_workout_sessions session where session.user_id = p_user_id)
     or exists (select 1 from public.workout_session_muscle_snapshots snapshot where snapshot.user_id = p_user_id)
     or exists (select 1 from public.workout_session_muscle_snapshot_items item where item.user_id = p_user_id)
     or exists (
       select 1
       from private.account_deletion_workout_identity_context context
       join public.user_workout_plan_days day on day.id = context.identity_id
       where context.backend_pid = v_backend_pid
         and context.transaction_id = v_transaction_id
         and context.identity_type = 'workout_day'
     )
     or exists (
       select 1
       from private.account_deletion_workout_identity_context context
       join public.user_workout_plan_exercises exercise on exercise.id = context.identity_id
       where context.backend_pid = v_backend_pid
         and context.transaction_id = v_transaction_id
         and context.identity_type = 'workout_exercise'
     ) then
    raise exception 'Account-data purge left owner-scoped application data behind.' using errcode = '23514';
  end if;

  delete from private.account_deletion_workout_identity_context context
  where context.backend_pid = v_backend_pid
    and context.transaction_id = v_transaction_id;

  return jsonb_build_object(
    'application_data_purged', true,
    'deletion_job_id', v_deletion_job_id,
    'profile_already_absent', false,
    'profiles_deleted', v_profile_deleted,
    'workout_plans_deleted', v_plan_count,
    'workout_days_deleted', v_day_count,
    'workout_exercises_deleted', v_exercise_count,
    'performed_sessions_deleted', v_performed_session_count,
    'scheduled_sessions_deleted', v_scheduled_session_count,
    'muscle_snapshots_deleted', v_snapshot_count,
    'muscle_snapshot_items_deleted', v_snapshot_item_count
  );
end;
$function$;

revoke all on function public.purge_account_application_data_atomic(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.purge_account_application_data_atomic(uuid)
to service_role;

comment on function public.purge_account_application_data_atomic(uuid) is
  'Service-role-only, lifecycle-bound, idempotent application-data purge. Requires one active deleting_database job, disabled access, and no legal hold; captures exact Train identities, preserves normal history guards, deletes the profile cascade atomically, and leaves Auth deletion to the provider API.';

do $postconditions$
declare
  v_marker text;
  v_purge oid;
  v_context_helper oid;
  v_history_guard oid;
begin
  if exists (
    select 1
    from phase3_account_deletion_authority_baseline baseline
    where baseline.auth_user_count <> (select count(*) from auth.users)
       or baseline.profile_count <> (select count(*) from public.profiles)
       or baseline.access_state_count <> (select count(*) from public.account_access_states)
       or baseline.deletion_job_count <> (select count(*) from public.account_deletion_jobs)
       or baseline.legal_hold_count <> (select count(*) from public.privacy_deletion_legal_holds)
       or baseline.plan_count <> (select count(*) from public.user_workout_plans)
       or baseline.performed_session_count <> (select count(*) from public.workout_sessions)
       or baseline.scheduled_session_count <> (select count(*) from public.user_workout_sessions)
       or baseline.snapshot_count <> (select count(*) from public.workout_session_muscle_snapshots)
       or baseline.snapshot_item_count <> (select count(*) from public.workout_session_muscle_snapshot_items)
  ) then
    raise exception 'Account-deletion authority migration mutated production data.';
  end if;

  if exists (select 1 from private.account_deletion_workout_identity_context) then
    raise exception 'Account-deletion context was unexpectedly populated during migration.';
  end if;

  v_purge := to_regprocedure('public.purge_account_application_data_atomic(uuid)');
  v_context_helper := to_regprocedure('private.account_deletion_allows_workout_identity(text,uuid)');
  v_history_guard := to_regprocedure('public.prevent_workout_history_identity_delete()');

  if v_purge is null or v_context_helper is null or v_history_guard is null then
    raise exception 'Account-deletion authority routines are incomplete.';
  end if;

  if not (select prosecdef from pg_proc where oid = v_purge)
     or not (select prosecdef from pg_proc where oid = v_context_helper)
     or not (select prosecdef from pg_proc where oid = v_history_guard) then
    raise exception 'Account-deletion authority routines are not security definer.';
  end if;

  if coalesce((select array_to_string(proconfig, ',') from pg_proc where oid = v_purge), '') not like '%search_path=%'
     or coalesce((select array_to_string(proconfig, ',') from pg_proc where oid = v_context_helper), '') not like '%search_path=%'
     or coalesce((select array_to_string(proconfig, ',') from pg_proc where oid = v_history_guard), '') not like '%search_path=%' then
    raise exception 'Account-deletion authority routine search paths are not hardened.';
  end if;

  if has_function_privilege('public', v_purge, 'EXECUTE')
     or has_function_privilege('anon', v_purge, 'EXECUTE')
     or has_function_privilege('authenticated', v_purge, 'EXECUTE')
     or not has_function_privilege('service_role', v_purge, 'EXECUTE') then
    raise exception 'Account-deletion purge RPC grants are incorrect.';
  end if;

  if has_function_privilege('public', v_context_helper, 'EXECUTE')
     or has_function_privilege('anon', v_context_helper, 'EXECUTE')
     or has_function_privilege('authenticated', v_context_helper, 'EXECUTE')
     or has_function_privilege('service_role', v_context_helper, 'EXECUTE') then
    raise exception 'Private account-deletion context helper is executable by an application role.';
  end if;

  if (
    select count(*)
    from pg_trigger trigger
    where trigger.tgfoid = v_history_guard
      and not trigger.tgisinternal
      and trigger.tgenabled <> 'D'
  ) <> 3 then
    raise exception 'Train history-preservation triggers are missing or disabled.';
  end if;

  select migration_version into v_marker
  from public.release_schema_compatibility
  where singleton;
  if v_marker not in ('20260711014500', '20260717051011') then
    raise exception 'Compatibility marker changed during account-deletion authority migration.';
  end if;
end
$postconditions$;

commit;
