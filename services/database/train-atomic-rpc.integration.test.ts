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
const migration = resolve(process.cwd(), "supabase/migrations/20260713160000_train_section_atomic_integrity.sql");
const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";

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

function expectMigrationFailure(evidence: RegExp) {
  if (!disposableDatabaseUrl) throw new Error("A clearly disposable DATABASE_URL is required.");
  const result = spawnSync(
    "psql",
    [disposableDatabaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-f", migration],
    { encoding: "utf8" }
  );
  expect(result.status).not.toBe(0);
  expect(`${result.stdout}\n${result.stderr}`).toMatch(evidence);
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

function authQuery(userId: string, query: string) {
  return sql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${userId}',true); ${query}; commit;`);
}

async function authQueryConcurrent(userId: string, query: string) {
  if (!disposableDatabaseUrl) throw new Error("A clearly disposable DATABASE_URL is required.");
  return execFileAsync(
    "psql",
    [
      disposableDatabaseUrl,
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
      "-c",
      `begin; set local role authenticated; select set_config('request.jwt.claim.sub','${userId}',true); ${query}; commit;`
    ],
    { encoding: "utf8" }
  );
}

function resetDomainRows() {
  sql(`truncate table public.exercise_logs, public.user_exercise_logs, public.workout_sessions,
    public.user_workout_sessions, public.user_workout_plan_exercises, public.user_workout_plan_days,
    public.user_workout_plans cascade`);
}

function seedPlan(
  planId: string,
  dayId: string,
  exerciseIds: string[],
  options: { active?: boolean; userId?: string; name?: string; exerciseName?: string } = {}
) {
  const owner = options.userId ?? userA;
  sql(`
    insert into public.user_workout_plans (id,user_id,name,is_active,is_default,source)
    values ('${planId}','${owner}','${options.name ?? "Plan"}',${options.active ?? false},${options.active ?? false},'manual');
    insert into public.user_workout_plan_days (id,plan_id,day_number,day_name,weekday)
    values ('${dayId}','${planId}',1,'Strength','Monday');
    ${exerciseIds
      .map(
        (id, index) => `insert into public.user_workout_plan_exercises
          (id,plan_day_id,exercise_name,sets,reps,rest_seconds,sort_order,order_index)
          values ('${id}','${dayId}','${options.exerciseName ?? `Exercise ${index + 1}`}',3,'8',60,${index + 1},${index + 1});`
      )
      .join("\n")}
  `);
}

beforeAll(() => {
  sql(`
    drop schema public cascade;
    create schema public;
    grant all on schema public to postgres;
    grant usage on schema public to public;
    drop schema if exists auth cascade;
    create schema auth;
    create extension if not exists pgcrypto;
    do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
    alter role service_role bypassrls;
    grant usage on schema public, auth to anon, authenticated, service_role;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.role() returns text language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
    grant execute on function auth.uid() to public;
    grant execute on function auth.role() to public;

    create table public.profiles (id uuid primary key);
    insert into public.profiles(id) values ('${userA}'),('${userB}');

    create table public.user_workout_plans (
      id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
      name text not null, is_active boolean not null default false, is_default boolean not null default false,
      source text not null default 'manual', goal text, description text, chatgpt_source boolean not null default false,
      archived_at timestamptz, archived_reason text, program_duration_weeks integer, days_per_week integer,
      session_duration_minutes integer, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );
    create table public.user_workout_plan_days (
      id uuid primary key default gen_random_uuid(), plan_id uuid not null references public.user_workout_plans(id) on delete cascade,
      day_number integer not null, day_name text not null, focus text, weekday text, notes text, session_duration_minutes integer,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(plan_id,day_number)
    );
    create table public.user_workout_plan_exercises (
      id uuid primary key default gen_random_uuid(), plan_day_id uuid not null references public.user_workout_plan_days(id) on delete cascade,
      workout_id uuid, source_workout_id text, exercise_name text not null, category text, target_muscle text, equipment text,
      sets integer, reps text, rest_seconds integer, instructions text, exercise_url text, video_url text, custom_video_url text,
      sort_order integer not null default 1, order_index integer, block_type text, weight text, tempo text, notes text,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );
    create table public.user_workout_sessions (
      id uuid primary key default gen_random_uuid(), user_id uuid not null, user_workout_plan_id uuid references public.user_workout_plans(id),
      plan_day_id uuid references public.user_workout_plan_days(id), week_index integer, day_index integer, session_number integer,
      scheduled_date date, day_title text, status text not null default 'scheduled', started_at timestamptz, completed_at timestamptz,
      skipped_at timestamptz, duration_minutes integer, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );
    create type public.workout_session_status as enum ('started','completed','skipped');
    create table public.workout_sessions (
      id uuid primary key default gen_random_uuid(), user_id uuid not null, workout_id uuid, plan_id uuid references public.user_workout_plans(id),
      plan_day_id uuid references public.user_workout_plan_days(id), scheduled_session_id uuid references public.user_workout_sessions(id),
      workout_day_name text, workout_category text, workout_name text, started_at timestamptz not null default now(),
      completed_at timestamptz, duration_minutes integer, notes text, status public.workout_session_status not null default 'started',
      source text, skipped_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );
    create table public.exercise_logs (
      id uuid primary key default gen_random_uuid(), workout_session_id uuid not null references public.workout_sessions(id) on delete cascade,
      plan_exercise_id uuid references public.user_workout_plan_exercises(id), exercise_order integer, exercise_name text not null,
      exercise_category text, planned_sets integer, planned_reps text, planned_rest_seconds integer, set_number integer not null,
      reps integer, weight_kg numeric, notes text, completed_at timestamptz, source_user_exercise_log_id uuid,
      source text, created_at timestamptz not null default now()
    );
    create table public.user_exercise_logs (
      id uuid primary key default gen_random_uuid(), user_id uuid not null, plan_exercise_id uuid references public.user_workout_plan_exercises(id),
      user_workout_session_id uuid references public.user_workout_sessions(id), created_at timestamptz not null default now()
    );

    grant select,insert,update,delete on all tables in schema public to authenticated, service_role;
    alter table public.user_workout_plans enable row level security;
    alter table public.user_workout_plan_days enable row level security;
    alter table public.user_workout_plan_exercises enable row level security;
    alter table public.user_workout_sessions enable row level security;
    alter table public.workout_sessions enable row level security;
    alter table public.exercise_logs enable row level security;
    create policy plans_owner on public.user_workout_plans for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
    create policy days_owner on public.user_workout_plan_days for all to authenticated
      using (exists(select 1 from public.user_workout_plans p where p.id=plan_id and p.user_id=auth.uid()))
      with check (exists(select 1 from public.user_workout_plans p where p.id=plan_id and p.user_id=auth.uid()));
    create policy exercises_owner on public.user_workout_plan_exercises for all to authenticated
      using (exists(select 1 from public.user_workout_plan_days d join public.user_workout_plans p on p.id=d.plan_id where d.id=plan_day_id and p.user_id=auth.uid()))
      with check (exists(select 1 from public.user_workout_plan_days d join public.user_workout_plans p on p.id=d.plan_id where d.id=plan_day_id and p.user_id=auth.uid()));
    create policy scheduled_owner on public.user_workout_sessions for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
    create policy sessions_owner on public.workout_sessions for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
    create policy logs_owner on public.exercise_logs for all to authenticated
      using (exists(select 1 from public.workout_sessions s where s.id=workout_session_id and s.user_id=auth.uid()))
      with check (exists(select 1 from public.workout_sessions s where s.id=workout_session_id and s.user_id=auth.uid()));
  `);
});

afterAll(() => {
  if (disposableDatabaseUrl) {
    sql("drop schema public cascade; create schema public; grant all on schema public to postgres; grant usage on schema public to public; drop schema if exists auth cascade;");
  }
});

databaseDescribe("Train atomic RPC migration", () => {
  it("fails closed without deleting conflicting active-plan rows, then applies cleanly", () => {
    sql(`insert into public.user_workout_plans(id,user_id,name,is_active,source) values
      ('10000000-0000-4000-8000-000000000001','${userA}','Active A',true,'manual'),
      ('10000000-0000-4000-8000-000000000002','${userA}','Active B',true,'manual')`);
    expectMigrationFailure(/multiple active plans/i);
    expect(sql(`select count(*) from public.user_workout_plans where user_id='${userA}'`)).toBe("2");
    resetDomainRows();
    applyMigration();
  });

  it("creates the four reviewed partial unique indexes and grants only runtime roles", () => {
    expect(sql(`select count(*) from pg_indexes where schemaname='public' and indexname in
      ('user_workout_plans_one_active_uidx','workout_sessions_one_open_plan_day_uidx','exercise_logs_plan_set_uidx','exercise_logs_order_set_uidx')`)).toBe("4");
    expect(sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in
      ('activate_workout_plan_atomic','create_workout_plan_atomic','save_workout_plan_day_atomic','save_workout_plan_atomic',
       'duplicate_workout_plan_atomic','archive_workout_plan_atomic','delete_workout_plan_atomic',
       'start_or_resume_workout_session_atomic','upsert_workout_set_logs_atomic','complete_workout_session_atomic')
      and has_function_privilege('authenticated',p.oid,'execute')
      and has_function_privilege('service_role',p.oid,'execute')
      and not has_function_privilege('anon',p.oid,'execute')`)).toBe("10");
  });

  it("rolls back late create and activation failures, then succeeds atomically", () => {
    resetDomainRows();
    seedPlan("20000000-0000-4000-8000-000000000001", "21000000-0000-4000-8000-000000000001", ["22000000-0000-4000-8000-000000000001"], { active: true, name: "Baseline" });
    sql(`create or replace function public.test_fail_train_write() returns trigger language plpgsql as $$ begin
      if tg_table_name='user_workout_plan_exercises' and new.exercise_name='FAIL_CREATE' then raise exception 'controlled create failure'; end if;
      return new; end $$;
      create trigger zz_test_fail_create before insert on public.user_workout_plan_exercises for each row execute function public.test_fail_train_write();`);
    const payload = `{"name":"Atomic new","source":"manual","days":[{"day_name":"Day A","weekday":"Tuesday","exercises":[{"exercise_name":"Good","sets":3,"reps":"8","rest_seconds":60},{"exercise_name":"FAIL_CREATE","sets":3,"reps":"8","rest_seconds":60}]}]}`;
    expectSqlFailure(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${userA}',true); select public.create_workout_plan_atomic('${userA}',$json$${payload}$json$::jsonb,true); commit;`, /controlled create failure/i);
    expect(sql(`select count(*) from public.user_workout_plans where name='Atomic new'`)).toBe("0");
    expect(sql(`select is_active from public.user_workout_plans where name='Baseline'`)).toBe("t");
    sql("drop trigger zz_test_fail_create on public.user_workout_plan_exercises");
    authQuery(userA, `select public.create_workout_plan_atomic('${userA}',$json$${payload.replace("FAIL_CREATE", "Second")}$json$::jsonb,true)`);
    expect(sql(`select p.is_active,count(distinct d.id),count(e.id) from public.user_workout_plans p join public.user_workout_plan_days d on d.plan_id=p.id join public.user_workout_plan_exercises e on e.plan_day_id=d.id where p.name='Atomic new' group by p.is_active`)).toBe("t\t1\t2");

    const target = sql("select id from public.user_workout_plans where name='Baseline'");
    const current = sql("select id from public.user_workout_plans where name='Atomic new'");
    sql(`create or replace function public.test_fail_activation() returns trigger language plpgsql as $$ begin
      if new.id='${target}' and new.is_active then raise exception 'controlled activation failure'; end if; return new; end $$;
      create trigger zz_test_fail_activation before update on public.user_workout_plans for each row execute function public.test_fail_activation();`);
    expectSqlFailure(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${userA}',true); select public.activate_workout_plan_atomic('${userA}','${target}',null); commit;`, /controlled activation failure/i);
    expect(sql(`select id from public.user_workout_plans where is_active`)).toBe(current);
    sql("drop trigger zz_test_fail_activation on public.user_workout_plans");
    authQuery(userA, `select public.activate_workout_plan_atomic('${userA}','${target}',null)`);
    expect(sql(`select id from public.user_workout_plans where is_active`)).toBe(target);
  });

  it("rolls back a late day save, then updates by stable id and archives omissions", () => {
    resetDomainRows();
    const plan = "30000000-0000-4000-8000-000000000001";
    const day = "31000000-0000-4000-8000-000000000001";
    const first = "32000000-0000-4000-8000-000000000001";
    const second = "32000000-0000-4000-8000-000000000002";
    seedPlan(plan, day, [first, second], { active: true });
    sql(`create or replace function public.test_fail_day_save() returns trigger language plpgsql as $$ begin
      if new.exercise_name='FAIL_DAY' then raise exception 'controlled day failure'; end if; return new; end $$;
      create trigger zz_test_fail_day before insert or update on public.user_workout_plan_exercises for each row execute function public.test_fail_day_save();`);
    const failing = `{"day_name":"Changed","exercises":[{"id":"${first}","exercise_name":"Updated","sets":4,"reps":"6","rest_seconds":90},{"exercise_name":"FAIL_DAY","sets":3,"reps":"8","rest_seconds":60}]}`;
    expectSqlFailure(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${userA}',true); select public.save_workout_plan_day_atomic('${userA}','${day}',$json$${failing}$json$::jsonb,null); commit;`, /controlled day failure/i);
    expect(sql(`select day_name from public.user_workout_plan_days where id='${day}'`)).toBe("Strength");
    expect(sql(`select exercise_name from public.user_workout_plan_exercises where id='${first}'`)).toBe("Exercise 1");
    sql("drop trigger zz_test_fail_day on public.user_workout_plan_exercises");
    const valid = `{"day_name":"Changed","exercises":[{"id":"${first}","exercise_name":"Updated","sets":4,"reps":"6","rest_seconds":90}]}`;
    authQuery(userA, `select public.save_workout_plan_day_atomic('${userA}','${day}',$json$${valid}$json$::jsonb,null)`);
    expect(sql(`select day_name,(select exercise_name from public.user_workout_plan_exercises where id='${first}'),(select archived_at is not null from public.user_workout_plan_exercises where id='${second}') from public.user_workout_plan_days where id='${day}'`)).toBe("Changed\tUpdated\tt");
  });

  it("duplicates the full graph atomically and archives or deletes plans without partial replacement", () => {
    resetDomainRows();
    const source = "40000000-0000-4000-8000-000000000001";
    seedPlan(source, "41000000-0000-4000-8000-000000000001", ["42000000-0000-4000-8000-000000000001"], { active: true, name: "Source", exerciseName: "FAIL_DUP" });
    sql(`create or replace function public.test_fail_duplicate() returns trigger language plpgsql as $$ begin
      if new.exercise_name='FAIL_DUP' then raise exception 'controlled duplicate failure'; end if; return new; end $$;
      create trigger zz_test_fail_duplicate before insert on public.user_workout_plan_exercises for each row execute function public.test_fail_duplicate();`);
    expectSqlFailure(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${userA}',true); select public.duplicate_workout_plan_atomic('${userA}','${source}'); commit;`, /controlled duplicate failure/i);
    expect(sql("select count(*) from public.user_workout_plans")).toBe("1");
    sql("drop trigger zz_test_fail_duplicate on public.user_workout_plan_exercises");
    authQuery(userA, `select public.duplicate_workout_plan_atomic('${userA}','${source}')`);
    expect(sql(`select count(*) from public.user_workout_plans p join public.user_workout_plan_days d on d.plan_id=p.id join public.user_workout_plan_exercises e on e.plan_day_id=d.id where p.name='Source copy' and not p.is_active`)).toBe("1");

    const replacement = sql("select id from public.user_workout_plans where name='Source copy'");
    sql(`create or replace function public.test_fail_replacement() returns trigger language plpgsql as $$ begin
      if new.id='${replacement}' and new.is_active then raise exception 'controlled replacement failure'; end if; return new; end $$;
      create trigger zz_test_fail_replacement before update on public.user_workout_plans for each row execute function public.test_fail_replacement();`);
    expectSqlFailure(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${userA}',true); select public.delete_workout_plan_atomic('${userA}','${source}',true); commit;`, /controlled replacement failure/i);
    expect(sql(`select (select count(*) from public.user_workout_plans where id='${source}'),(select count(*) from public.user_workout_plan_exercises where plan_day_id='41000000-0000-4000-8000-000000000001')`)).toBe("1\t1");
    expectSqlFailure(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${userA}',true); select public.archive_workout_plan_atomic('${userA}','${source}','test'); commit;`, /controlled replacement failure/i);
    expect(sql(`select is_active,archived_at is null from public.user_workout_plans where id='${source}'`)).toBe("t\tt");
    sql("drop trigger zz_test_fail_replacement on public.user_workout_plans");
    authQuery(userA, `select public.archive_workout_plan_atomic('${userA}','${source}','test')`);
    expect(sql(`select archived_at is not null,is_active from public.user_workout_plans where id='${source}'`)).toBe("t\tf");

    expectSqlFailure(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${userA}',true); select public.delete_workout_plan_atomic('${userA}','${replacement}',false); commit;`, /Explicit confirmation/i);
    authQuery(userA, `select public.delete_workout_plan_atomic('${userA}','${replacement}',true)`);
    expect(sql(`select count(*) from public.user_workout_plans where id='${replacement}'`)).toBe("0");
  });

  it("serializes concurrent session start and upserts repeated names by stable exercise identity", async () => {
    resetDomainRows();
    const plan = "50000000-0000-4000-8000-000000000001";
    const day = "51000000-0000-4000-8000-000000000001";
    const first = "52000000-0000-4000-8000-000000000001";
    const second = "52000000-0000-4000-8000-000000000002";
    seedPlan(plan, day, [first, second], { active: true, exerciseName: "Row" });
    await Promise.all([
      authQueryConcurrent(userA, `select public.start_or_resume_workout_session_atomic('${userA}','${day}',null)`),
      authQueryConcurrent(userA, `select public.start_or_resume_workout_session_atomic('${userA}','${day}',null)`)
    ]);
    expect(sql(`select count(*) from public.workout_sessions where user_id='${userA}' and plan_day_id='${day}' and status='started'`)).toBe("1");
    const session = sql(`select id from public.workout_sessions where user_id='${userA}' and plan_day_id='${day}'`);
    const logs = `[{"plan_exercise_id":"${first}","exercise_order":1,"exercise_name":"Row","set_number":1,"reps":8,"weight_kg":60},{"plan_exercise_id":"${second}","exercise_order":2,"exercise_name":"Row","set_number":1,"reps":10,"weight_kg":40}]`;
    authQuery(userA, `select public.upsert_workout_set_logs_atomic('${userA}','${session}',$json$${logs}$json$::jsonb)`);
    authQuery(userA, `select public.upsert_workout_set_logs_atomic('${userA}','${session}',$json$[{"plan_exercise_id":"${first}","exercise_order":1,"exercise_name":"Row","set_number":1,"reps":12,"weight_kg":62}]$json$::jsonb)`);
    expect(sql(`select count(*),sum(reps),count(distinct plan_exercise_id) from public.exercise_logs where workout_session_id='${session}'`)).toBe("2\t22\t2");
  });

  it("completes once, keeps the first completion on retry, and refuses history deletion", () => {
    resetDomainRows();
    const plan = "60000000-0000-4000-8000-000000000001";
    const day = "61000000-0000-4000-8000-000000000001";
    const exercise = "62000000-0000-4000-8000-000000000001";
    seedPlan(plan, day, [exercise], { active: true });
    authQuery(userA, `select public.start_or_resume_workout_session_atomic('${userA}','${day}',null)`);
    const session = sql(`select id from public.workout_sessions where plan_day_id='${day}'`);
    const firstLogs = `[{"plan_exercise_id":"${exercise}","exercise_order":1,"exercise_name":"Exercise 1","set_number":1,"reps":8,"weight_kg":50}]`;
    authQuery(userA, `select public.complete_workout_session_atomic('${userA}','${session}',$json$${firstLogs}$json$::jsonb,42,'first')`);
    authQuery(userA, `select public.complete_workout_session_atomic('${userA}','${session}',$json$[]$json$::jsonb,99,'retry')`);
    expect(sql(`select status,duration_minutes,notes,(select count(*) from public.exercise_logs where workout_session_id='${session}') from public.workout_sessions where id='${session}'`)).toBe("completed\t42\tfirst\t1");
    expectSqlFailure(`delete from public.user_workout_plans where id='${plan}'`, /session history/i);
    expect(sql(`select count(*) from public.user_workout_plans where id='${plan}'`)).toBe("1");
  });

  it("enforces ownership, blocks anon, and rejects authenticated calls without a user claim", () => {
    resetDomainRows();
    const plan = "70000000-0000-4000-8000-000000000001";
    seedPlan(plan, "71000000-0000-4000-8000-000000000001", ["72000000-0000-4000-8000-000000000001"], { userId: userB });
    expectSqlFailure(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${userA}',true); select public.duplicate_workout_plan_atomic('${userB}','${plan}'); commit;`, /another user/i);
    expectSqlFailure(`begin; set local role anon; select public.duplicate_workout_plan_atomic('${userB}','${plan}'); commit;`, /permission denied/i);
    expectSqlFailure(`begin; set local role authenticated; select public.assert_workout_actor('${userA}'); commit;`, /user|claim|authenticated/i);
    expect(sql(`select count(*) from public.user_workout_plans where user_id='${userB}'`)).toBe("1");
  });
});
