import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile, execFileSync, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";

const execFileAsync = promisify(execFile);
const databaseUrl = process.env.DATABASE_URL;
const databaseDescribe = databaseUrl ? describe.sequential : describe.skip;
const migration = resolve(process.cwd(), "supabase/migrations/20260713153000_meal_plan_atomic_execution.sql");
const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";

function sql(query: string) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for database integration tests.");
  return execFileSync("psql", [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t", "-c", query], { encoding: "utf8" }).trim();
}

function applyMigration() {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for database integration tests.");
  execFileSync("psql", [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-f", migration], { encoding: "utf8", stdio: "pipe" });
}

function authQuery(userId: string, query: string) {
  return sql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', '${userId}', true); ${query}; commit;`);
}

function expectSqlFailure(query: string) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for database integration tests.");
  const result = spawnSync("psql", [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", query], { encoding: "utf8" });
  expect(result.status).not.toBe(0);
  return `${result.stdout}\n${result.stderr}`;
}

async function authQueryConcurrent(userId: string, query: string) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for database integration tests.");
  return execFileAsync("psql", [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", `begin; set local role authenticated; select set_config('request.jwt.claim.sub', '${userId}', true); ${query}; commit;`], { encoding: "utf8" });
}

function insertMeal(id: string, userId: string, name: string, status = "planned", completedAt: string | null = null) {
  sql(`insert into public.user_meal_plan_items (id,user_id,plan_date,meal_type,food_name,serving_size,quantity,calories,protein_g,carbs_g,fat_g,status,completed_at,notes) values ('${id}','${userId}','2026-07-13','Lunch','${name}','1 serving',1,500,40,50,15,'${status}',${completedAt ? `'${completedAt}'` : "null"},'fixture')`);
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
    grant usage on schema public, auth to anon, authenticated;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant execute on function auth.uid() to public;

    create table public.food_logs (
      id uuid primary key default gen_random_uuid(), user_id uuid not null,
      food_item_id uuid, user_food_item_id uuid, log_date date not null,
      meal_type text not null, food_name text not null, serving_size text not null,
      quantity numeric not null check (quantity > 0), calories numeric not null check (calories >= 0),
      protein_g numeric not null check (protein_g >= 0), carbs_g numeric not null check (carbs_g >= 0),
      fat_g numeric not null check (fat_g >= 0), notes text,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );
    create table public.user_meal_plan_items (
      id uuid primary key default gen_random_uuid(), user_id uuid not null, plan_date date not null,
      meal_type text not null check (meal_type in ('Breakfast','Lunch','Dinner','Snack')),
      food_item_id uuid, user_food_item_id uuid, food_name text not null, serving_size text not null,
      quantity numeric not null check (quantity > 0), calories numeric not null check (calories >= 0),
      protein_g numeric not null check (protein_g >= 0), carbs_g numeric not null check (carbs_g >= 0),
      fat_g numeric not null check (fat_g >= 0), status text not null default 'planned' check (status in ('planned','done','skipped')),
      food_log_id uuid references public.food_logs(id) on delete set null, completed_at timestamptz, notes text,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      constraint user_meal_plan_items_skipped_state_check check (status <> 'skipped' or (completed_at is null and food_log_id is null))
    );
    create table public.user_grocery_items (
      id uuid primary key default gen_random_uuid(), user_id uuid not null, week_start date not null,
      source_meal_plan_item_id uuid references public.user_meal_plan_items(id) on delete set null,
      item_name text not null, quantity numeric, unit text, store_section text not null default 'Other',
      checked boolean not null default false, already_have boolean not null default false, notes text,
      created_by text not null default 'manual', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );
    create function public.enforce_user_meal_plan_item_status_transition() returns trigger language plpgsql set search_path='' as $$
    begin
      if old.status in ('done','skipped') and new.status <> old.status then raise exception 'terminal' using errcode='23514'; end if;
      if new.status='skipped' and (new.completed_at is not null or new.food_log_id is not null) then raise exception 'skipped metadata' using errcode='23514'; end if;
      return new;
    end $$;
    create trigger enforce_user_meal_plan_item_status_transition before update of status, completed_at, food_log_id on public.user_meal_plan_items for each row execute function public.enforce_user_meal_plan_item_status_transition();
    insert into public.user_meal_plan_items (id,user_id,plan_date,meal_type,food_name,serving_size,quantity,calories,protein_g,carbs_g,fat_g,status,completed_at,notes)
    values ('00000000-0000-4000-8000-000000000001','${userA}','2026-07-12','Dinner','Legacy meal','1 serving',1,650,45,70,20,'done','2026-07-12T18:30:00Z','legacy');
  `);
  applyMigration();
  sql(`
    create function public.test_fail_meal_write() returns trigger language plpgsql as $$
    begin
      if new.food_name in ('Rollback completion','FAIL_CORRECTION') then raise exception 'controlled test failure'; end if;
      return new;
    end $$;
    create trigger zz_test_fail_meal_write before update on public.user_meal_plan_items for each row execute function public.test_fail_meal_write();
  `);
});

afterAll(() => {
  if (databaseUrl) sql("drop schema public cascade; create schema public; grant all on schema public to postgres; grant usage on schema public to public; drop schema if exists auth cascade;");
});

databaseDescribe("meal-plan atomic RPC migration", () => {
  it("repairs the production-shaped legacy done row once and preserves its completion time", () => {
    const beforeReplay = sql("select status, food_log_id is not null, completed_at='2026-07-12T18:30:00Z'::timestamptz, (select count(*) from food_logs where food_name='Legacy meal') from user_meal_plan_items where id='00000000-0000-4000-8000-000000000001'");
    expect(beforeReplay).toBe("done\tt\tt\t1");
    applyMigration();
    expect(sql("select count(*) from food_logs where food_name='Legacy meal'")).toBe("1");
  });

  it("atomically completes an owned meal with exactly one matching linked log", () => {
    const itemId = "00000000-0000-4000-8000-000000000010";
    insertMeal(itemId, userA, "Atomic meal");
    authQuery(userA, `select public.complete_meal_plan_item('${itemId}')`);
    expect(sql(`select m.status, m.food_log_id is not null, m.completed_at is not null, l.food_name=m.food_name, l.calories=m.calories from user_meal_plan_items m join food_logs l on l.id=m.food_log_id where m.id='${itemId}'`)).toBe("done\tt\tt\tt\tt");
    expect(sql(`select count(*) from food_logs l join user_meal_plan_items m on m.food_log_id=l.id where m.id='${itemId}'`)).toBe("1");
  });

  it("is idempotent when completion is retried", () => {
    const itemId = "00000000-0000-4000-8000-000000000011";
    insertMeal(itemId, userA, "Retry meal");
    authQuery(userA, `select public.complete_meal_plan_item('${itemId}')`);
    authQuery(userA, `select public.complete_meal_plan_item('${itemId}')`);
    expect(sql(`select count(*) from food_logs l join user_meal_plan_items m on m.food_log_id=l.id where m.id='${itemId}'`)).toBe("1");
  });

  it("serializes concurrent completion into one food log", async () => {
    const itemId = "00000000-0000-4000-8000-000000000012";
    insertMeal(itemId, userA, "Concurrent meal");
    await Promise.all([
      authQueryConcurrent(userA, `select public.complete_meal_plan_item('${itemId}')`),
      authQueryConcurrent(userA, `select public.complete_meal_plan_item('${itemId}')`)
    ]);
    expect(sql(`select count(*) from food_logs l join user_meal_plan_items m on m.food_log_id=l.id where m.id='${itemId}'`)).toBe("1");
  });

  it("rolls back log insertion when completion fails after insertion", () => {
    const itemId = "00000000-0000-4000-8000-000000000013";
    insertMeal(itemId, userA, "Rollback completion");
    expectSqlFailure(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${userA}',true); select public.complete_meal_plan_item('${itemId}'); commit;`);
    expect(sql(`select status, food_log_id is null, completed_at is null from user_meal_plan_items where id='${itemId}'`)).toBe("planned\tt\tt");
    expect(sql("select count(*) from food_logs where food_name='Rollback completion'")).toBe("0");
  });

  it("enforces ownership and blocks anonymous or unauthenticated execution", () => {
    const itemId = "00000000-0000-4000-8000-000000000014";
    insertMeal(itemId, userB, "Private meal");
    expectSqlFailure(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${userA}',true); select public.complete_meal_plan_item('${itemId}'); commit;`);
    expectSqlFailure(`begin; set local role anon; select public.complete_meal_plan_item('${itemId}'); commit;`);
    expectSqlFailure(`begin; set local role authenticated; select public.complete_meal_plan_item('${itemId}'); commit;`);
    expect(sql(`select status from user_meal_plan_items where id='${itemId}'`)).toBe("planned");
  });

  it("atomically completes adjusted Eat values and remains idempotent", () => {
    const itemId = "00000000-0000-4000-8000-000000000015";
    insertMeal(itemId, userA, "Saved meal");
    const call = `select public.complete_meal_plan_item_with_values('${itemId}','Dinner','Adjusted meal','2 bowls',2,720,60,70,18,'adjusted',true)`;
    authQuery(userA, call);
    authQuery(userA, call);
    expect(sql(`select m.food_name,m.meal_type,m.calories,l.food_name,l.meal_type,l.calories,(select count(*) from food_logs where id=m.food_log_id) from user_meal_plan_items m join food_logs l on l.id=m.food_log_id where m.id='${itemId}'`)).toBe("Adjusted meal\tDinner\t720\tAdjusted meal\tDinner\t720\t1");
  });

  it("corrects a completed meal and linked log together and rolls both back on failure", () => {
    const itemId = "00000000-0000-4000-8000-000000000016";
    insertMeal(itemId, userA, "Correction meal");
    authQuery(userA, `select public.complete_meal_plan_item('${itemId}')`);
    authQuery(userA, `select public.correct_completed_meal_plan_item('${itemId}','2026-07-14','Dinner','Corrected meal','2 servings',2,800,70,75,20,'corrected')`);
    expect(sql(`select m.plan_date,m.meal_type,m.food_name,m.calories,l.log_date,l.meal_type,l.food_name,l.calories from user_meal_plan_items m join food_logs l on l.id=m.food_log_id where m.id='${itemId}'`)).toBe("2026-07-14\tDinner\tCorrected meal\t800\t2026-07-14\tDinner\tCorrected meal\t800");
    expectSqlFailure(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${userA}',true); select public.correct_completed_meal_plan_item('${itemId}','2026-07-15','Lunch','FAIL_CORRECTION','1 serving',1,100,10,10,2,null); commit;`);
    expect(sql(`select m.plan_date,m.food_name,l.log_date,l.food_name from user_meal_plan_items m join food_logs l on l.id=m.food_log_id where m.id='${itemId}'`)).toBe("2026-07-14\tCorrected meal\t2026-07-14\tCorrected meal");
  });

  it("prevents cross-user correction and linked-log mutation", () => {
    const itemId = "00000000-0000-4000-8000-000000000017";
    insertMeal(itemId, userB, "User B meal");
    authQuery(userB, `select public.complete_meal_plan_item('${itemId}')`);
    expectSqlFailure(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${userA}',true); select public.correct_completed_meal_plan_item('${itemId}','2026-07-14','Dinner','Stolen','1 serving',1,100,10,10,2,null); commit;`);
    expect(sql(`select m.food_name,l.food_name from user_meal_plan_items m join food_logs l on l.id=m.food_log_id where m.id='${itemId}'`)).toBe("User B meal\tUser B meal");
  });

  it("rejects invalid terminal transitions and completion metadata", () => {
    const skipped = "00000000-0000-4000-8000-000000000018";
    const planned = "00000000-0000-4000-8000-000000000019";
    insertMeal(skipped, userA, "Skipped meal", "skipped");
    insertMeal(planned, userA, "Planned metadata");
    expectSqlFailure(`update user_meal_plan_items set status='planned' where id='${skipped}'`);
    expectSqlFailure(`update user_meal_plan_items set completed_at=now() where id='${planned}'`);
    expectSqlFailure(`update user_meal_plan_items set status='done' where id='${planned}'`);
  });

  it("prevents duplicate and concurrent grocery inserts for the same source", async () => {
    const itemId = "00000000-0000-4000-8000-000000000020";
    insertMeal(itemId, userA, "Grocery meal");
    const insert = `insert into user_grocery_items(user_id,week_start,source_meal_plan_item_id,item_name) values('${userA}','2026-07-13','${itemId}','Rice')`;
    sql(insert);
    expectSqlFailure(insert);

    const concurrentItem = "00000000-0000-4000-8000-000000000021";
    insertMeal(concurrentItem, userA, "Concurrent grocery meal");
    const concurrentInsert = `insert into user_grocery_items(user_id,week_start,source_meal_plan_item_id,item_name) values('${userA}','2026-07-13','${concurrentItem}','Beans')`;
    const results = await Promise.allSettled([execFileAsync("psql", [databaseUrl!, "-X", "-v", "ON_ERROR_STOP=1", "-c", concurrentInsert]), execFileAsync("psql", [databaseUrl!, "-X", "-v", "ON_ERROR_STOP=1", "-c", concurrentInsert])]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(sql(`select count(*) from user_grocery_items where source_meal_plan_item_id='${concurrentItem}'`)).toBe("1");
  });

  it("preserves consumed history when a completed meal-plan row is removed", () => {
    const itemId = "00000000-0000-4000-8000-000000000022";
    insertMeal(itemId, userA, "History meal");
    authQuery(userA, `select public.complete_meal_plan_item('${itemId}')`);
    const logId = sql(`select food_log_id from user_meal_plan_items where id='${itemId}'`);
    sql(`delete from user_meal_plan_items where id='${itemId}'`);
    expect(sql(`select count(*) from food_logs where id='${logId}'`)).toBe("1");
  });
});
