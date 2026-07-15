import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile, execFileSync, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";

const execFileAsync = promisify(execFile);
const databaseUrl = process.env.DATABASE_URL;

function isClearlyDisposableDatabase(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    const databaseName = url.pathname.replace(/^\//, "");
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname) && /(^|[_-])test($|[_-])/i.test(databaseName);
  } catch {
    return false;
  }
}

const disposableDatabaseUrl = isClearlyDisposableDatabase(databaseUrl) ? databaseUrl : undefined;
const databaseDescribe = disposableDatabaseUrl ? describe.sequential : describe.skip;
const migration = resolve(process.cwd(), "supabase/migrations/20260715190000_train_phase2a_program_architecture.sql");
const userA = "41111111-1111-4111-8111-111111111111";
const userB = "42222222-2222-4222-8222-222222222222";
const userC = "43333333-3333-4333-8333-333333333333";

function sql(query: string) {
  if (!disposableDatabaseUrl) throw new Error("A localhost DATABASE_URL whose database name contains 'test' is required.");
  return execFileSync(
    "psql",
    [disposableDatabaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t", "-c", query],
    { encoding: "utf8" }
  ).trim();
}

function applyMigration() {
  if (!disposableDatabaseUrl) throw new Error("A clearly disposable DATABASE_URL is required.");
  execFileSync("psql", [disposableDatabaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-f", migration], {
    encoding: "utf8",
    stdio: "pipe"
  });
}

function expectSqlFailure(query: string, evidence?: RegExp) {
  if (!disposableDatabaseUrl) throw new Error("A clearly disposable DATABASE_URL is required.");
  const result = spawnSync(
    "psql",
    [disposableDatabaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", query],
    { encoding: "utf8" }
  );
  expect(result.status).not.toBe(0);
  const output = `${result.stdout}\n${result.stderr}`;
  if (evidence) expect(output).toMatch(evidence);
  return output;
}

function transactionResult(output: string) {
  const lines = output.trim().split("\n").filter(Boolean);
  return lines.at(-2) ?? lines.at(-1) ?? "";
}

function authQuery(userId: string, query: string) {
  return transactionResult(sql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${userId}',true); select set_config('request.jwt.claim.role','authenticated',true); ${query}; commit;`));
}

async function authQueryConcurrent(userId: string, query: string) {
  if (!disposableDatabaseUrl) throw new Error("A clearly disposable DATABASE_URL is required.");
  const result = await execFileAsync(
    "psql",
    [
      disposableDatabaseUrl,
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
      "-c",
      `begin; set local role authenticated; select set_config('request.jwt.claim.sub','${userId}',true); select set_config('request.jwt.claim.role','authenticated',true); ${query}; commit;`
    ],
    { encoding: "utf8" }
  );
  return transactionResult(result.stdout);
}

beforeAll(() => {
  sql(`
    drop schema public cascade;
    create schema public;
    grant all on schema public to postgres;
    grant usage on schema public to public;
    drop schema if exists auth cascade;
    create schema auth;
    drop schema if exists private cascade;
    create schema private;
    create extension if not exists pgcrypto;

    do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
    alter role service_role bypassrls;
    grant usage on schema public, auth to anon, authenticated, service_role;
    revoke all on schema private from public, anon;
    grant usage on schema private to authenticated, service_role;

    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.role() returns text language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
    grant execute on function auth.uid(), auth.role() to public;

    create table auth.users (id uuid primary key);
    insert into auth.users(id) values ('${userA}'), ('${userB}'), ('${userC}');

    create table public.profiles (
      id uuid primary key references auth.users(id) on delete cascade,
      role text not null default 'member'
    );
    insert into public.profiles(id, role) values
      ('${userA}', 'member'),
      ('${userB}', 'member'),
      ('${userC}', 'admin');

    create function public.set_updated_at() returns trigger language plpgsql as $$
    begin new.updated_at = now(); return new; end $$;

    create function private.is_admin()
    returns boolean
    language sql
    stable
    security definer
    set search_path = pg_catalog, public
    as $$
      select exists(
        select 1
        from public.profiles profile
        where profile.id = (select auth.uid())
          and profile.role = 'admin'
      )
    $$;
    revoke all on function private.is_admin() from public, anon;
    grant execute on function private.is_admin() to authenticated, service_role;

    create function public.assert_workout_actor(p_user_id uuid) returns void language plpgsql set search_path='' as $$
    begin
      if p_user_id is null then raise exception 'User id is required.' using errcode='23514'; end if;
      if auth.uid() is null and current_user <> 'service_role' and coalesce(auth.role(),'') <> 'service_role' then
        raise exception 'Authentication required.' using errcode='42501';
      end if;
      if auth.uid() is not null and auth.uid() <> p_user_id then
        raise exception 'Workout data belongs to another user.' using errcode='42501';
      end if;
    end $$;
    grant execute on function public.assert_workout_actor(uuid) to authenticated, service_role;

    create table public.user_workout_plans (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.profiles(id) on delete cascade,
      name text not null,
      description text,
      program_duration_weeks integer,
      session_duration_minutes integer,
      archived_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table public.user_workout_plan_days (
      id uuid primary key default gen_random_uuid(),
      plan_id uuid not null references public.user_workout_plans(id) on delete cascade,
      day_number integer not null,
      day_name text not null,
      weekday text,
      session_duration_minutes integer,
      notes text,
      archived_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(plan_id, day_number)
    );

    create table public.user_workout_plan_exercises (
      id uuid primary key default gen_random_uuid(),
      plan_day_id uuid not null references public.user_workout_plan_days(id) on delete cascade,
      source_workout_id text,
      exercise_name text not null,
      category text,
      target_muscle text,
      equipment text,
      sets integer,
      reps text,
      rest_seconds integer,
      weight text,
      tempo text,
      block_type text,
      instructions text,
      sort_order integer not null default 1,
      notes text,
      archived_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table public.user_workout_sessions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.profiles(id) on delete cascade,
      user_workout_plan_id uuid not null references public.user_workout_plans(id) on delete cascade,
      plan_day_id uuid references public.user_workout_plan_days(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table public.workout_sessions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.profiles(id) on delete cascade,
      plan_id uuid references public.user_workout_plans(id) on delete set null,
      plan_day_id uuid references public.user_workout_plan_days(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table public.user_exercise_logs (
      id uuid primary key default gen_random_uuid(),
      user_workout_session_id uuid not null references public.user_workout_sessions(id) on delete cascade,
      plan_exercise_id uuid references public.user_workout_plan_exercises(id) on delete set null,
      created_at timestamptz not null default now()
    );

    create table public.exercise_logs (
      id uuid primary key default gen_random_uuid(),
      workout_session_id uuid not null references public.workout_sessions(id) on delete cascade,
      plan_exercise_id uuid references public.user_workout_plan_exercises(id) on delete set null,
      created_at timestamptz not null default now()
    );

    grant select, insert, update, delete on all tables in schema public to authenticated, service_role;

    insert into public.user_workout_plans(id,user_id,name,description,program_duration_weeks,session_duration_minutes)
    values
      ('50000000-0000-4000-8000-000000000001','${userA}','Three-week plan','Legacy plan',3,60),
      ('50000000-0000-4000-8000-000000000002','${userB}','Fallback plan','Invalid duration fallback',0,45),
      ('50000000-0000-4000-8000-000000000003','${userC}','Account deletion plan','Cascade proof',1,30);

    insert into public.user_workout_plan_days(id,plan_id,day_number,day_name,weekday,notes,archived_at)
    values
      ('51000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',1,'Monday strength','Monday','Primary day',null),
      ('51000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001',2,'Archived day',null,'Fallback offset','2026-07-01T00:00:00Z'),
      ('51000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000002',1,'Fallback day','Tuesday',null,null),
      ('51000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000003',1,'Delete day','Wednesday',null,null);

    insert into public.user_workout_plan_exercises(
      id,plan_day_id,source_workout_id,exercise_name,category,target_muscle,equipment,
      sets,reps,rest_seconds,weight,tempo,block_type,instructions,sort_order,notes,archived_at
    ) values
      ('52000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','legacy-warmup','Warm-up walk','Mobility',null,'Treadmill',null,'5 min',null,null,null,'warmup','Walk easily.',1,null,null),
      ('52000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000001','legacy-squat','Back squat','Strength','Quadriceps','Barbell',3,'8',90,null,'3-1-1','strength','Brace and squat.',2,'Controlled',null),
      ('52000000-0000-4000-8000-000000000003','51000000-0000-4000-8000-000000000001','legacy-other','Farmer carry','Carry','Grip','Dumbbells',2,'30 sec',60,null,null,'other',null,3,null,null),
      ('52000000-0000-4000-8000-000000000004','51000000-0000-4000-8000-000000000001','legacy-null','Plank','Core','Core','Mat',3,'30 sec',45,null,null,null,null,4,null,null),
      ('52000000-0000-4000-8000-000000000005','51000000-0000-4000-8000-000000000001','legacy-cardio','Bike','Cardio',null,'Bike',null,'10 min',null,null,null,'cardio',null,5,null,null),
      ('52000000-0000-4000-8000-000000000006','51000000-0000-4000-8000-000000000001','legacy-cooldown','Stretch','Mobility',null,'Mat',null,'5 min',null,null,null,'cooldown',null,6,null,null),
      ('52000000-0000-4000-8000-000000000007','51000000-0000-4000-8000-000000000002','legacy-archived','Archived row','Strength',null,'Barbell',1,'1',30,null,null,'strength',null,1,null,'2026-07-01T00:00:00Z'),
      ('52000000-0000-4000-8000-000000000008','51000000-0000-4000-8000-000000000003','legacy-b','Row','Strength','Back','Cable',3,'10',60,null,null,'strength',null,1,null,null),
      ('52000000-0000-4000-8000-000000000009','51000000-0000-4000-8000-000000000004','legacy-c','Press','Strength','Chest','Dumbbells',2,'10',60,null,null,'strength',null,1,null,null);

    insert into public.user_workout_sessions(id,user_id,user_workout_plan_id,plan_day_id)
    values
      ('53000000-0000-4000-8000-000000000001','${userA}','50000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001'),
      ('53000000-0000-4000-8000-000000000002','${userB}','50000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000003');
    insert into public.workout_sessions(id,user_id,plan_id,plan_day_id)
    values ('54000000-0000-4000-8000-000000000001','${userA}','50000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001');
    insert into public.user_exercise_logs(id,user_workout_session_id,plan_exercise_id)
    values ('55000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000002');
    insert into public.exercise_logs(id,workout_session_id,plan_exercise_id)
    values ('56000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000002');
  `);
  applyMigration();
});

afterAll(() => {
  if (disposableDatabaseUrl) {
    sql("drop schema public cascade; create schema public; grant all on schema public to postgres; grant usage on schema public to public; drop schema if exists auth cascade; drop schema if exists private cascade;");
  }
});

databaseDescribe("Train Phase 2A migration and detach RPC", () => {
  it("backfills every legacy plan with reusable weeks, deterministic phases, snapshots, and unambiguous bridges", () => {
    expect(sql("select count(*) from user_workout_plan_week_templates where source='legacy_backfill'")).toBe("3");
    expect(sql("select count(*),count(distinct week_template_id) from user_workout_plan_weeks where plan_id='50000000-0000-4000-8000-000000000001'")).toBe("3\t1");
    expect(sql("select count(*) from user_workout_plan_weeks where plan_id='50000000-0000-4000-8000-000000000002'")).toBe("1");
    expect(sql("select count(*) from user_workout_plan_sessions where source_legacy_plan_day_id is not null")).toBe("4");
    expect(sql("select day_offset,archived_at is not null from user_workout_plan_sessions where source_legacy_plan_day_id='51000000-0000-4000-8000-000000000002'")).toBe("1\tt");
    expect(sql("select count(*) from user_workout_plan_phases phase join user_workout_plan_sessions session on session.id=phase.plan_session_id where session.source_legacy_plan_day_id='51000000-0000-4000-8000-000000000001' and phase.phase_slug='main_work'")).toBe("1");
    expect(sql("select source_legacy_block_type from user_workout_plan_phases phase join user_workout_plan_sessions session on session.id=phase.plan_session_id where session.source_legacy_plan_day_id='51000000-0000-4000-8000-000000000001' and phase.phase_slug='main_work'")).toBe("mixed");
    expect(sql("select planned_prescription::text from user_workout_plan_activities where source_legacy_plan_exercise_id='52000000-0000-4000-8000-000000000002'")).toBe('{"reps": "8", "sets": 3, "tempo": "3-1-1", "rest_seconds": 90}');
    expect(sql("select metric_schema_snapshot->>'slug',catalog_activity_id is null,catalog_slug is null from user_workout_plan_activities where source_legacy_plan_exercise_id='52000000-0000-4000-8000-000000000002'")).toBe("plaivra_legacy_strength_prescription_v1\tt\tt");
    expect(sql("select archived_at is not null from user_workout_plan_activities where source_legacy_plan_exercise_id='52000000-0000-4000-8000-000000000007'")).toBe("t");
    expect(sql("select plan_session_id is not null,plan_week_id is null from user_workout_sessions where id='53000000-0000-4000-8000-000000000001'")).toBe("t\tt");
    expect(sql("select plan_session_id is not null,plan_week_id is null from workout_sessions where id='54000000-0000-4000-8000-000000000001'")).toBe("t\tt");
    expect(sql("select plan_activity_id is not null from user_exercise_logs where id='55000000-0000-4000-8000-000000000001'")).toBe("t");
    expect(sql("select plan_activity_id is not null from exercise_logs where id='56000000-0000-4000-8000-000000000001'")).toBe("t");
  });

  it("enforces canonical admin RLS, table-specific legacy integrity, bridge ownership, and JSON shape", () => {
    const ownerTemplate = sql("select id from user_workout_plan_week_templates where plan_id='50000000-0000-4000-8000-000000000001'");
    const otherTemplate = sql("select id from user_workout_plan_week_templates where plan_id='50000000-0000-4000-8000-000000000002'");

    expect(sql("select to_regprocedure('public.is_admin()') is null, to_regprocedure('private.is_admin()') is not null")).toBe("t\tt");
    expect(authQuery(userA, `select count(*) from public.user_workout_plan_week_templates where id='${ownerTemplate}'`)).toBe("1");
    expect(authQuery(userB, `select count(*) from public.user_workout_plan_week_templates where id='${ownerTemplate}'`)).toBe("0");
    expect(authQuery(userC, `select count(*) from public.user_workout_plan_week_templates where id='${ownerTemplate}'`)).toBe("1");
    expectSqlFailure(`begin; set local role anon; select count(*) from public.user_workout_plan_week_templates; commit;`, /permission denied|row-level security/i);
    expectSqlFailure(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${userB}',true); select set_config('request.jwt.claim.role','authenticated',true); insert into public.user_workout_plan_sessions(week_template_id,source,title,day_offset,sport_slug,sport_name_snapshot,sort_order) values ('${ownerTemplate}','manual','Forbidden session',0,'strength','Strength',99); commit;`, /row-level security|policy/i);

    expectSqlFailure(`begin; insert into user_workout_plan_weeks(plan_id,week_template_id,week_number) values ('50000000-0000-4000-8000-000000000001','${otherTemplate}',50); set constraints user_workout_plan_weeks_template_same_plan_fk immediate; commit;`, /foreign key/i);

    const ownerSession = sql("select id from user_workout_plan_sessions where source_legacy_plan_day_id='51000000-0000-4000-8000-000000000001'");
    expect(sql(`update public.user_workout_plan_sessions set week_template_id=week_template_id where id='${ownerSession}' returning id`)).toBe(ownerSession);
    expectSqlFailure(`update public.user_workout_plan_sessions set week_template_id='${otherTemplate}' where id='${ownerSession}'`, /session legacy source must belong to the same workout plan/i);
    expectSqlFailure(`update user_workout_sessions set plan_session_id='${ownerSession}' where user_id='${userB}'`, /row workout plan|owner/i);

    const ownerPhase = sql(`select phase.id from user_workout_plan_phases phase join user_workout_plan_sessions session on session.id=phase.plan_session_id where session.week_template_id='${ownerTemplate}' limit 1`);
    const otherPhase = sql(`select phase.id from user_workout_plan_phases phase join user_workout_plan_sessions session on session.id=phase.plan_session_id where session.week_template_id='${otherTemplate}' limit 1`);
    const ownerActivity = sql("select id from public.user_workout_plan_activities where source_legacy_plan_exercise_id='52000000-0000-4000-8000-000000000002'");
    expect(sql(`update public.user_workout_plan_activities set plan_phase_id=plan_phase_id where id='${ownerActivity}' returning id`)).toBe(ownerActivity);
    expectSqlFailure(`update public.user_workout_plan_activities set plan_phase_id='${otherPhase}' where id='${ownerActivity}'`, /activity legacy source must belong to the same workout plan/i);
    expectSqlFailure(`insert into user_workout_plan_activities(plan_phase_id,catalog_source,activity_name_snapshot,planned_prescription,sort_order) values ('${ownerPhase}','manual','Bad JSON','[]'::jsonb,99)`, /prescription_shape|check constraint/i);
  });

  it("detaches one shared week atomically and idempotently while preserving immutable snapshots", () => {
    const selectedWeek = sql("select id from user_workout_plan_weeks where plan_id='50000000-0000-4000-8000-000000000001' and week_number=1");
    const originalTemplate = sql(`select week_template_id from user_workout_plan_weeks where id='${selectedWeek}'`);
    const resultText = authQuery(userA, `select public.detach_workout_plan_week_atomic('${userA}','${selectedWeek}')::text`);
    const result = JSON.parse(resultText);

    expect(result.clone_created).toBe(true);
    expect(result.original_template_id).toBe(originalTemplate);
    expect(sql(`select week_template_id,is_detached from user_workout_plan_weeks where id='${selectedWeek}'`)).toBe(`${result.detached_template_id}\tt`);
    expect(sql("select count(distinct week_template_id) from user_workout_plan_weeks where plan_id='50000000-0000-4000-8000-000000000001' and week_number in (2,3)")).toBe("1");
    expect(sql(`select derived_from_template_id from user_workout_plan_week_templates where id='${result.detached_template_id}'`)).toBe(originalTemplate);
    expect(sql(`select count(*) from user_workout_plan_sessions where week_template_id='${result.detached_template_id}'`)).toBe("1");
    expect(sql(`select count(*) from user_workout_plan_activities activity join user_workout_plan_phases phase on phase.id=activity.plan_phase_id join user_workout_plan_sessions session on session.id=phase.plan_session_id where session.week_template_id='${result.detached_template_id}'`)).toBe("6");
    expect(sql(`select count(*) from user_workout_plan_activities activity join user_workout_plan_phases phase on phase.id=activity.plan_phase_id join user_workout_plan_sessions session on session.id=phase.plan_session_id where session.week_template_id='${result.detached_template_id}' and activity.source_legacy_plan_exercise_id is not null`)).toBe("0");

    const secondText = authQuery(userA, `select public.detach_workout_plan_week_atomic('${userA}','${selectedWeek}')::text`);
    const second = JSON.parse(secondText);
    expect(second).toMatchObject({
      clone_created: false,
      original_template_id: originalTemplate,
      detached_template_id: result.detached_template_id
    });

    expectSqlFailure(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${userB}',true); select set_config('request.jwt.claim.role','authenticated',true); select public.detach_workout_plan_week_atomic('${userA}','${selectedWeek}'); commit;`, /another user/i);
  });

  it("serializes concurrent detach calls so exactly one clone is created", async () => {
    const week = sql("select id from user_workout_plan_weeks where plan_id='50000000-0000-4000-8000-000000000001' and week_number=2");
    const results = await Promise.all([
      authQueryConcurrent(userA, `select public.detach_workout_plan_week_atomic('${userA}','${week}')::text`),
      authQueryConcurrent(userA, `select public.detach_workout_plan_week_atomic('${userA}','${week}')::text`)
    ]);
    const parsed = results.map((value) => JSON.parse(value));
    expect(parsed.filter((value) => value.clone_created)).toHaveLength(1);
    expect(parsed.filter((value) => !value.clone_created)).toHaveLength(1);
    expect(new Set(parsed.map((value) => value.detached_template_id)).size).toBe(1);
  });

  it("rolls back the complete detach graph when a descendant clone fails", () => {
    const week = sql("select id from user_workout_plan_weeks where plan_id='50000000-0000-4000-8000-000000000001' and week_number=3");
    const originalTemplate = sql(`select week_template_id from user_workout_plan_weeks where id='${week}'`);
    const derivedBefore = sql(`select count(*) from user_workout_plan_week_templates where derived_from_template_id='${originalTemplate}'`);
    sql(`
      create function public.test_fail_phase2a_activity_clone() returns trigger language plpgsql as $$
      begin
        if new.source_legacy_plan_exercise_id is null and new.activity_name_snapshot='Back squat' then
          raise exception 'controlled Phase 2A clone failure';
        end if;
        return new;
      end $$;
      create trigger zz_test_fail_phase2a_activity_clone before insert on public.user_workout_plan_activities
      for each row execute function public.test_fail_phase2a_activity_clone();
    `);

    expectSqlFailure(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${userA}',true); select set_config('request.jwt.claim.role','authenticated',true); select public.detach_workout_plan_week_atomic('${userA}','${week}'); commit;`, /controlled Phase 2A clone failure/i);
    expect(sql(`select week_template_id,is_detached from user_workout_plan_weeks where id='${week}'`)).toBe(`${originalTemplate}\tf`);
    expect(sql(`select count(*) from user_workout_plan_week_templates where derived_from_template_id='${originalTemplate}'`)).toBe(derivedBefore);

    sql("drop trigger zz_test_fail_phase2a_activity_clone on public.user_workout_plan_activities; drop function public.test_fail_phase2a_activity_clone();");
  });

  it("cascades plan and account deletion through all new structural rows", () => {
    const planBTemplate = sql("select id from user_workout_plan_week_templates where plan_id='50000000-0000-4000-8000-000000000002'");
    sql("delete from user_workout_plans where id='50000000-0000-4000-8000-000000000002'");
    expect(sql(`select count(*) from user_workout_plan_week_templates where id='${planBTemplate}'`)).toBe("0");

    sql(`delete from auth.users where id='${userC}'`);
    expect(sql("select count(*) from user_workout_plans where id='50000000-0000-4000-8000-000000000003'")).toBe("0");
    expect(sql("select count(*) from user_workout_plan_week_templates where plan_id='50000000-0000-4000-8000-000000000003'")).toBe("0");
  });
});
