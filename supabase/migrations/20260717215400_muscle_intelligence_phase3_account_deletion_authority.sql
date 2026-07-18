begin;

do $preflight$
declare
  v_marker text;
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.account_access_states') is null
     or to_regclass('public.account_deletion_jobs') is null
     or to_regclass('public.privacy_deletion_legal_holds') is null
     or to_regclass('public.user_workout_plans') is null
     or to_regclass('public.user_workout_plan_days') is null
     or to_regclass('public.user_workout_plan_exercises') is null
     or to_regclass('public.user_workout_plan_blocks') is null
     or to_regclass('public.user_workout_plan_block_items') is null
     or to_regclass('public.user_workout_plan_week_templates') is null
     or to_regclass('public.user_workout_plan_weeks') is null
     or to_regclass('public.user_workout_plan_sessions') is null
     or to_regclass('public.user_workout_plan_phases') is null
     or to_regclass('public.user_workout_plan_activities') is null
     or to_regclass('public.user_workout_sessions') is null
     or to_regclass('public.workout_sessions') is null
     or to_regclass('public.workout_session_muscle_snapshots') is null
     or to_regclass('public.workout_session_muscle_snapshot_items') is null then
    raise exception 'Account-deletion authority requires the canonical privacy lifecycle and complete Train graph.';
  end if;

  if to_regprocedure('public.prevent_workout_history_identity_delete()') is null then
    raise exception 'Train history-preservation guard is missing.';
  end if;

  if to_regprocedure('public.purge_account_application_data_atomic(uuid)') is not null then
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
  (select count(*) from public.user_workout_plan_days) as plan_day_count,
  (select count(*) from public.user_workout_plan_exercises) as plan_exercise_count,
  (select count(*) from public.user_workout_plan_blocks) as plan_block_count,
  (select count(*) from public.user_workout_plan_block_items) as plan_block_item_count,
  (select count(*) from public.user_workout_plan_week_templates) as week_template_count,
  (select count(*) from public.user_workout_plan_weeks) as plan_week_count,
  (select count(*) from public.user_workout_plan_sessions) as plan_session_count,
  (select count(*) from public.user_workout_plan_phases) as plan_phase_count,
  (select count(*) from public.user_workout_plan_activities) as plan_activity_count,
  (select count(*) from public.workout_sessions) as performed_session_count,
  (select count(*) from public.user_workout_sessions) as scheduled_session_count,
  (select count(*) from public.workout_session_muscle_snapshots) as snapshot_count,
  (select count(*) from public.workout_session_muscle_snapshot_items) as snapshot_item_count;

create or replace function public.purge_account_application_data_atomic(
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_deletion_job_id uuid;
  v_profile_deleted integer := 0;

  v_plan_count integer := 0;
  v_plan_day_count integer := 0;
  v_plan_exercise_count integer := 0;
  v_plan_block_count integer := 0;
  v_plan_block_item_count integer := 0;
  v_week_template_count integer := 0;
  v_plan_week_count integer := 0;
  v_plan_session_count integer := 0;
  v_plan_phase_count integer := 0;
  v_plan_activity_count integer := 0;
  v_performed_session_count integer := 0;
  v_scheduled_session_count integer := 0;
  v_snapshot_count integer := 0;
  v_snapshot_item_count integer := 0;

  v_deleted_plan_count integer := 0;
  v_deleted_plan_day_count integer := 0;
  v_deleted_plan_exercise_count integer := 0;
  v_deleted_plan_block_count integer := 0;
  v_deleted_plan_block_item_count integer := 0;
  v_deleted_week_template_count integer := 0;
  v_deleted_plan_week_count integer := 0;
  v_deleted_plan_session_count integer := 0;
  v_deleted_plan_phase_count integer := 0;
  v_deleted_plan_activity_count integer := 0;
  v_deleted_performed_session_count integer := 0;
  v_deleted_scheduled_session_count integer := 0;
begin
  if p_user_id is null then
    raise exception 'User id is required for account-data purge.' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('plaivra-account-data-purge:' || p_user_id::text, 0)
  );

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

  if not exists (
    select 1
    from public.profiles profile
    where profile.id = p_user_id
  ) then
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
      'workout_blocks_deleted', 0,
      'workout_block_items_deleted', 0,
      'workout_week_templates_deleted', 0,
      'workout_weeks_deleted', 0,
      'workout_plan_sessions_deleted', 0,
      'workout_phases_deleted', 0,
      'workout_activities_deleted', 0,
      'performed_sessions_deleted', 0,
      'scheduled_sessions_deleted', 0,
      'muscle_snapshots_deleted', 0,
      'muscle_snapshot_items_deleted', 0
    );
  end if;

  select count(*) into v_plan_count
  from public.user_workout_plans plan
  where plan.user_id = p_user_id;

  select count(*) into v_plan_day_count
  from public.user_workout_plan_days day
  join public.user_workout_plans plan on plan.id = day.plan_id
  where plan.user_id = p_user_id;

  select count(*) into v_plan_exercise_count
  from public.user_workout_plan_exercises exercise
  join public.user_workout_plan_days day on day.id = exercise.plan_day_id
  join public.user_workout_plans plan on plan.id = day.plan_id
  where plan.user_id = p_user_id;

  select count(*) into v_plan_block_count
  from public.user_workout_plan_blocks block
  join public.user_workout_plan_days day on day.id = block.plan_day_id
  join public.user_workout_plans plan on plan.id = day.plan_id
  where plan.user_id = p_user_id;

  select count(*) into v_plan_block_item_count
  from public.user_workout_plan_block_items item
  join public.user_workout_plan_blocks block on block.id = item.block_id
  join public.user_workout_plan_days day on day.id = block.plan_day_id
  join public.user_workout_plans plan on plan.id = day.plan_id
  where plan.user_id = p_user_id;

  select count(*) into v_week_template_count
  from public.user_workout_plan_week_templates template
  join public.user_workout_plans plan on plan.id = template.plan_id
  where plan.user_id = p_user_id;

  select count(*) into v_plan_week_count
  from public.user_workout_plan_weeks week
  join public.user_workout_plans plan on plan.id = week.plan_id
  where plan.user_id = p_user_id;

  select count(*) into v_plan_session_count
  from public.user_workout_plan_sessions plan_session
  join public.user_workout_plan_week_templates template on template.id = plan_session.week_template_id
  join public.user_workout_plans plan on plan.id = template.plan_id
  where plan.user_id = p_user_id;

  select count(*) into v_plan_phase_count
  from public.user_workout_plan_phases phase
  join public.user_workout_plan_sessions plan_session on plan_session.id = phase.plan_session_id
  join public.user_workout_plan_week_templates template on template.id = plan_session.week_template_id
  join public.user_workout_plans plan on plan.id = template.plan_id
  where plan.user_id = p_user_id;

  select count(*) into v_plan_activity_count
  from public.user_workout_plan_activities activity
  join public.user_workout_plan_phases phase on phase.id = activity.plan_phase_id
  join public.user_workout_plan_sessions plan_session on plan_session.id = phase.plan_session_id
  join public.user_workout_plan_week_templates template on template.id = plan_session.week_template_id
  join public.user_workout_plans plan on plan.id = template.plan_id
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

  -- Account deletion is intentionally explicit rather than an implicit profile
  -- cascade. Historical/session children are removed first so immutable snapshot
  -- guards and normal plan-history preservation remain strict for every other
  -- operation. The two plan representations are then deleted child-to-parent to
  -- avoid overlapping CASCADE/SET NULL actions on shared legacy bridge columns.
  delete from public.workout_sessions session
  where session.user_id = p_user_id;
  get diagnostics v_deleted_performed_session_count = row_count;

  delete from public.user_workout_sessions session
  where session.user_id = p_user_id;
  get diagnostics v_deleted_scheduled_session_count = row_count;

  delete from public.user_workout_plan_activities activity
  using public.user_workout_plan_phases phase,
        public.user_workout_plan_sessions plan_session,
        public.user_workout_plan_week_templates template,
        public.user_workout_plans plan
  where activity.plan_phase_id = phase.id
    and phase.plan_session_id = plan_session.id
    and plan_session.week_template_id = template.id
    and template.plan_id = plan.id
    and plan.user_id = p_user_id;
  get diagnostics v_deleted_plan_activity_count = row_count;

  delete from public.user_workout_plan_phases phase
  using public.user_workout_plan_sessions plan_session,
        public.user_workout_plan_week_templates template,
        public.user_workout_plans plan
  where phase.plan_session_id = plan_session.id
    and plan_session.week_template_id = template.id
    and template.plan_id = plan.id
    and plan.user_id = p_user_id;
  get diagnostics v_deleted_plan_phase_count = row_count;

  delete from public.user_workout_plan_sessions plan_session
  using public.user_workout_plan_week_templates template,
        public.user_workout_plans plan
  where plan_session.week_template_id = template.id
    and template.plan_id = plan.id
    and plan.user_id = p_user_id;
  get diagnostics v_deleted_plan_session_count = row_count;

  delete from public.user_workout_plan_weeks week
  using public.user_workout_plans plan
  where week.plan_id = plan.id
    and plan.user_id = p_user_id;
  get diagnostics v_deleted_plan_week_count = row_count;

  delete from public.user_workout_plan_week_templates template
  using public.user_workout_plans plan
  where template.plan_id = plan.id
    and plan.user_id = p_user_id;
  get diagnostics v_deleted_week_template_count = row_count;

  delete from public.user_workout_plan_block_items item
  using public.user_workout_plan_blocks block,
        public.user_workout_plan_days day,
        public.user_workout_plans plan
  where item.block_id = block.id
    and block.plan_day_id = day.id
    and day.plan_id = plan.id
    and plan.user_id = p_user_id;
  get diagnostics v_deleted_plan_block_item_count = row_count;

  delete from public.user_workout_plan_blocks block
  using public.user_workout_plan_days day,
        public.user_workout_plans plan
  where block.plan_day_id = day.id
    and day.plan_id = plan.id
    and plan.user_id = p_user_id;
  get diagnostics v_deleted_plan_block_count = row_count;

  delete from public.user_workout_plan_exercises exercise
  using public.user_workout_plan_days day,
        public.user_workout_plans plan
  where exercise.plan_day_id = day.id
    and day.plan_id = plan.id
    and plan.user_id = p_user_id;
  get diagnostics v_deleted_plan_exercise_count = row_count;

  delete from public.user_workout_plan_days day
  using public.user_workout_plans plan
  where day.plan_id = plan.id
    and plan.user_id = p_user_id;
  get diagnostics v_deleted_plan_day_count = row_count;

  delete from public.user_workout_plans plan
  where plan.user_id = p_user_id;
  get diagnostics v_deleted_plan_count = row_count;

  if v_deleted_performed_session_count <> v_performed_session_count
     or v_deleted_scheduled_session_count <> v_scheduled_session_count
     or v_deleted_plan_activity_count <> v_plan_activity_count
     or v_deleted_plan_phase_count <> v_plan_phase_count
     or v_deleted_plan_session_count <> v_plan_session_count
     or v_deleted_plan_week_count <> v_plan_week_count
     or v_deleted_week_template_count <> v_week_template_count
     or v_deleted_plan_block_item_count <> v_plan_block_item_count
     or v_deleted_plan_block_count <> v_plan_block_count
     or v_deleted_plan_exercise_count <> v_plan_exercise_count
     or v_deleted_plan_day_count <> v_plan_day_count
     or v_deleted_plan_count <> v_plan_count then
    raise exception 'Deterministic Train purge deleted an unexpected number of rows.' using errcode = '40001';
  end if;

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
     or exists (select 1 from public.workout_session_muscle_snapshot_items item where item.user_id = p_user_id) then
    raise exception 'Account-data purge left owner-scoped application data behind.' using errcode = '23514';
  end if;

  return jsonb_build_object(
    'application_data_purged', true,
    'deletion_job_id', v_deletion_job_id,
    'profile_already_absent', false,
    'profiles_deleted', v_profile_deleted,
    'workout_plans_deleted', v_deleted_plan_count,
    'workout_days_deleted', v_deleted_plan_day_count,
    'workout_exercises_deleted', v_deleted_plan_exercise_count,
    'workout_blocks_deleted', v_deleted_plan_block_count,
    'workout_block_items_deleted', v_deleted_plan_block_item_count,
    'workout_week_templates_deleted', v_deleted_week_template_count,
    'workout_weeks_deleted', v_deleted_plan_week_count,
    'workout_plan_sessions_deleted', v_deleted_plan_session_count,
    'workout_phases_deleted', v_deleted_plan_phase_count,
    'workout_activities_deleted', v_deleted_plan_activity_count,
    'performed_sessions_deleted', v_deleted_performed_session_count,
    'scheduled_sessions_deleted', v_deleted_scheduled_session_count,
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
  'Service-role-only, lifecycle-bound, idempotent account-data purge. Requires one active deleting_database job, disabled access, and no legal hold; deletes performed and scheduled history, both Train plan representations in deterministic child-to-parent order, then the profile, while leaving Auth deletion to the provider API.';

do $postconditions$
declare
  v_marker text;
  v_purge oid;
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
       or baseline.plan_day_count <> (select count(*) from public.user_workout_plan_days)
       or baseline.plan_exercise_count <> (select count(*) from public.user_workout_plan_exercises)
       or baseline.plan_block_count <> (select count(*) from public.user_workout_plan_blocks)
       or baseline.plan_block_item_count <> (select count(*) from public.user_workout_plan_block_items)
       or baseline.week_template_count <> (select count(*) from public.user_workout_plan_week_templates)
       or baseline.plan_week_count <> (select count(*) from public.user_workout_plan_weeks)
       or baseline.plan_session_count <> (select count(*) from public.user_workout_plan_sessions)
       or baseline.plan_phase_count <> (select count(*) from public.user_workout_plan_phases)
       or baseline.plan_activity_count <> (select count(*) from public.user_workout_plan_activities)
       or baseline.performed_session_count <> (select count(*) from public.workout_sessions)
       or baseline.scheduled_session_count <> (select count(*) from public.user_workout_sessions)
       or baseline.snapshot_count <> (select count(*) from public.workout_session_muscle_snapshots)
       or baseline.snapshot_item_count <> (select count(*) from public.workout_session_muscle_snapshot_items)
  ) then
    raise exception 'Account-deletion authority migration mutated production data.';
  end if;

  v_purge := to_regprocedure('public.purge_account_application_data_atomic(uuid)');
  v_history_guard := to_regprocedure('public.prevent_workout_history_identity_delete()');

  if v_purge is null or v_history_guard is null then
    raise exception 'Account-deletion authority routines are incomplete.';
  end if;

  if not (select prosecdef from pg_proc where oid = v_purge) then
    raise exception 'Account-deletion purge RPC is not SECURITY DEFINER.';
  end if;

  if coalesce((select array_to_string(proconfig, ',') from pg_proc where oid = v_purge), '') not like '%search_path=%' then
    raise exception 'Account-deletion purge RPC search path is not hardened.';
  end if;

  if has_function_privilege('public', v_purge, 'EXECUTE')
     or has_function_privilege('anon', v_purge, 'EXECUTE')
     or has_function_privilege('authenticated', v_purge, 'EXECUTE')
     or not has_function_privilege('service_role', v_purge, 'EXECUTE') then
    raise exception 'Account-deletion purge RPC grants are incorrect.';
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
