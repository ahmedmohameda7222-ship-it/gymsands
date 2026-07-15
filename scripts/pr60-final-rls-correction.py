from pathlib import Path

migration_path = Path("supabase/migrations/20260715190000_train_phase2a_program_architecture.sql")
migration = migration_path.read_text(encoding="utf-8")
policy_start = migration.index("alter table public.user_workout_plan_week_templates enable row level security;")
policy_end = migration.index("-- Deterministic local backfill. No external catalog access is performed.", policy_start)

policy_block = """create or replace function private.can_access_workout_plan(p_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  select exists (
    select 1
    from public.user_workout_plans plan
    where plan.id = p_plan_id
      and (
        plan.user_id = (select auth.uid())
        or (select private.is_admin())
      )
  )
$function$;

revoke all on function private.can_access_workout_plan(uuid) from public, anon;
grant execute on function private.can_access_workout_plan(uuid) to authenticated, service_role;

alter table public.user_workout_plan_week_templates enable row level security;
alter table public.user_workout_plan_weeks enable row level security;
alter table public.user_workout_plan_sessions enable row level security;
alter table public.user_workout_plan_phases enable row level security;
alter table public.user_workout_plan_activities enable row level security;

create policy user_workout_plan_week_templates_own_all
on public.user_workout_plan_week_templates
for all to authenticated
using (private.can_access_workout_plan(plan_id))
with check (private.can_access_workout_plan(plan_id));

create policy user_workout_plan_weeks_own_all
on public.user_workout_plan_weeks
for all to authenticated
using (private.can_access_workout_plan(plan_id))
with check (private.can_access_workout_plan(plan_id));

create policy user_workout_plan_sessions_own_all
on public.user_workout_plan_sessions
for all to authenticated
using (
  exists (
    select 1
    from public.user_workout_plan_week_templates template
    where template.id = public.user_workout_plan_sessions.week_template_id
      and private.can_access_workout_plan(template.plan_id)
  )
)
with check (
  exists (
    select 1
    from public.user_workout_plan_week_templates template
    where template.id = public.user_workout_plan_sessions.week_template_id
      and private.can_access_workout_plan(template.plan_id)
  )
);

create policy user_workout_plan_phases_own_all
on public.user_workout_plan_phases
for all to authenticated
using (
  exists (
    select 1
    from public.user_workout_plan_sessions session
    join public.user_workout_plan_week_templates template on template.id = session.week_template_id
    where session.id = public.user_workout_plan_phases.plan_session_id
      and private.can_access_workout_plan(template.plan_id)
  )
)
with check (
  exists (
    select 1
    from public.user_workout_plan_sessions session
    join public.user_workout_plan_week_templates template on template.id = session.week_template_id
    where session.id = public.user_workout_plan_phases.plan_session_id
      and private.can_access_workout_plan(template.plan_id)
  )
);

create policy user_workout_plan_activities_own_all
on public.user_workout_plan_activities
for all to authenticated
using (
  exists (
    select 1
    from public.user_workout_plan_phases phase
    join public.user_workout_plan_sessions session on session.id = phase.plan_session_id
    join public.user_workout_plan_week_templates template on template.id = session.week_template_id
    where phase.id = public.user_workout_plan_activities.plan_phase_id
      and private.can_access_workout_plan(template.plan_id)
  )
)
with check (
  exists (
    select 1
    from public.user_workout_plan_phases phase
    join public.user_workout_plan_sessions session on session.id = phase.plan_session_id
    join public.user_workout_plan_week_templates template on template.id = session.week_template_id
    where phase.id = public.user_workout_plan_activities.plan_phase_id
      and private.can_access_workout_plan(template.plan_id)
  )
);

revoke all on public.user_workout_plan_week_templates from public, anon;
revoke all on public.user_workout_plan_weeks from public, anon;
revoke all on public.user_workout_plan_sessions from public, anon;
revoke all on public.user_workout_plan_phases from public, anon;
revoke all on public.user_workout_plan_activities from public, anon;

grant select, insert, update, delete
on public.user_workout_plan_week_templates,
   public.user_workout_plan_weeks,
   public.user_workout_plan_sessions,
   public.user_workout_plan_phases,
   public.user_workout_plan_activities
to authenticated, service_role;

"""
migration_path.write_text(migration[:policy_start] + policy_block + migration[policy_end:], encoding="utf-8")

verification_path = Path("supabase/verification/train-phase2a-program-architecture.sql")
verification = verification_path.read_text(encoding="utf-8")
helper_start = verification.index(
    "  if exists (\n"
    "    select required_table.table_name\n"
    "    from unnest(array[\n"
)
helper_end = verification.index("  for required_column in\n", helper_start)
helper_checks = """  routine_oid := to_regprocedure('private.can_access_workout_plan(uuid)');
  if routine_oid is null then
    raise exception 'Missing private.can_access_workout_plan(uuid).';
  end if;
  if not (select prosecdef from pg_proc where oid = routine_oid) then
    raise exception 'Workout-plan access helper must be SECURITY DEFINER.';
  end if;
  if (select provolatile from pg_proc where oid = routine_oid) <> 's' then
    raise exception 'Workout-plan access helper must be STABLE.';
  end if;
  select proconfig into routine_settings from pg_proc where oid = routine_oid;
  if coalesce(array_to_string(routine_settings, ','), '') not like '%search_path=%' then
    raise exception 'Workout-plan access helper search_path is not hardened.';
  end if;
  if not has_function_privilege('authenticated', routine_oid, 'EXECUTE')
     or not has_function_privilege('service_role', routine_oid, 'EXECUTE')
     or has_function_privilege('anon', routine_oid, 'EXECUTE') then
    raise exception 'Workout-plan access helper grants are incorrect.';
  end if;
  if exists (
    select 1
    from pg_proc routine
    cross join lateral aclexplode(coalesce(routine.proacl, acldefault('f', routine.proowner))) grant_acl
    where routine.oid = routine_oid
      and grant_acl.grantee = 0
      and grant_acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC can execute the workout-plan access helper.';
  end if;

  if exists (
    select required_table.table_name
    from unnest(array[
      'user_workout_plan_week_templates',
      'user_workout_plan_weeks',
      'user_workout_plan_sessions',
      'user_workout_plan_phases',
      'user_workout_plan_activities'
    ]) required_table(table_name)
    where not exists (
      select 1
      from pg_policies policy
      where policy.schemaname = 'public'
        and policy.tablename = required_table.table_name
        and (coalesce(policy.qual, '') || ' ' || coalesce(policy.with_check, ''))
          like '%private.can_access_workout_plan%'
    )
  ) then
    raise exception 'A Train Phase 2A policy does not use private.can_access_workout_plan().';
  end if;

  if exists (
    select 1
    from pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = any(array[
        'user_workout_plan_week_templates',
        'user_workout_plan_weeks',
        'user_workout_plan_sessions',
        'user_workout_plan_phases',
        'user_workout_plan_activities'
      ])
      and (coalesce(policy.qual, '') || ' ' || coalesce(policy.with_check, ''))
        like '%user_workout_plans%'
  ) then
    raise exception 'A Train Phase 2A policy reads user_workout_plans directly instead of using the private helper.';
  end if;

"""
verification_path.write_text(verification[:helper_start] + helper_checks + verification[helper_end:], encoding="utf-8")

integration_path = Path("services/database/train-program-v2-rpc.integration.test.ts")
integration = integration_path.read_text(encoding="utf-8")
grant_anchor = "    grant select, insert, update, delete on all tables in schema public to authenticated, service_role;\n"
if integration.count(grant_anchor) != 1:
    raise SystemExit("Expected one disposable grant anchor.")
integration = integration.replace(
    grant_anchor,
    grant_anchor
    + "    revoke all on public.user_workout_plans, public.user_workout_plan_days, public.user_workout_plan_exercises from authenticated;\n",
)
old_assertion = (
    "expect(sql(\"select to_regprocedure('public.is_admin()') is null, "
    "to_regprocedure('private.is_admin()') is not null\")).toBe(\"t\\\\tt\");"
)
new_assertion = (
    "expect(sql(\"select to_regprocedure('public.is_admin()') is null, "
    "to_regprocedure('private.is_admin()') is not null, "
    "to_regprocedure('private.can_access_workout_plan(uuid)') is not null\")).toBe(\"t\\\\tt\\\\tt\");"
)
if integration.count(old_assertion) != 1:
    raise SystemExit("Expected one helper assertion.")
integration_path.write_text(integration.replace(old_assertion, new_assertion), encoding="utf-8")

test_path = Path("lib/product/train-phase2a-architecture.test.ts")
test = test_path.read_text(encoding="utf-8")
anchor = '    expect(migration).toContain("(select private.is_admin())");\n'
if test.count(anchor) != 1:
    raise SystemExit("Expected one static helper anchor.")
test_path.write_text(
    test.replace(
        anchor,
        anchor
        + '    expect(migration).toContain("create or replace function private.can_access_workout_plan");\n'
        + '    expect(migration).toContain("private.can_access_workout_plan");\n'
        + '    expect(verification).toContain("private.can_access_workout_plan");\n',
    ),
    encoding="utf-8",
)
