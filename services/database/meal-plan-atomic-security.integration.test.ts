import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";

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
const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const itemA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const itemB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const migrations = [
  resolve(process.cwd(), "supabase/migrations/20260712173000_persistent_meal_plan_skip_status.sql"),
  resolve(process.cwd(), "supabase/migrations/20260713153000_meal_plan_atomic_execution.sql")
];

function sql(query: string) {
  if (!disposableDatabaseUrl) throw new Error("A disposable localhost test database is required.");
  return execFileSync("psql", [disposableDatabaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t", "-c", query], { encoding: "utf8" }).trim();
}

function applyMigrations() {
  if (!disposableDatabaseUrl) throw new Error("A disposable localhost test database is required.");
  for (const migration of migrations) {
    execFileSync("psql", [disposableDatabaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-f", migration], { encoding: "utf8", stdio: "pipe" });
  }
}

function roleQuery(role: "authenticated" | "anon", userId: string | null, query: string) {
  const subject = userId ? `select set_config('request.jwt.claim.sub','${userId}',true);` : "";
  return sql(`begin; set local role ${role}; ${subject} ${query}; commit;`);
}

function expectRoleFailure(role: "authenticated" | "anon", userId: string | null, query: string, evidence: RegExp) {
  if (!disposableDatabaseUrl) throw new Error("A disposable localhost test database is required.");
  const subject = userId ? `select set_config('request.jwt.claim.sub','${userId}',true);` : "";
  const result = spawnSync("psql", [disposableDatabaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", `begin; set local role ${role}; ${subject} ${query}; commit;`], { encoding: "utf8" });
  expect(result.status).not.toBe(0);
  expect(`${result.stdout}\n${result.stderr}`).toMatch(evidence);
}

beforeAll(() => {
  sql(`
    drop extension if exists pgcrypto cascade;
    drop schema if exists public cascade;
    create schema public;
    grant all on schema public to postgres;
    grant usage on schema public to public;
    drop schema if exists auth cascade;
    create schema auth;
    create extension pgcrypto with schema public;
    do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
    alter role service_role bypassrls;
    grant usage on schema public, auth to anon, authenticated, service_role;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant execute on function auth.uid() to public;

    create table public.food_logs (
      id uuid primary key default gen_random_uuid(), user_id uuid not null, food_item_id uuid, user_food_item_id uuid,
      log_date date not null, meal_type text not null, food_name text not null, serving_size text not null,
      quantity numeric not null, calories numeric not null, protein_g numeric not null, carbs_g numeric not null,
      fat_g numeric not null, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );
    create table public.user_meal_plan_items (
      id uuid primary key default gen_random_uuid(), user_id uuid not null, plan_date date not null,
      meal_type text not null, food_name text not null, food_item_id uuid, user_food_item_id uuid,
      serving_size text not null, quantity numeric not null default 1, calories numeric not null default 0,
      protein_g numeric not null default 0, carbs_g numeric not null default 0, fat_g numeric not null default 0,
      notes text, status text not null default 'planned', completed_at timestamptz,
      food_log_id uuid references public.food_logs(id), created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table public.user_grocery_items (
      id uuid primary key default gen_random_uuid(), user_id uuid not null, week_start date not null,
      source_meal_plan_item_id uuid references public.user_meal_plan_items(id)
    );
    grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  `);
  applyMigrations();
});

afterAll(() => {
  if (disposableDatabaseUrl) {
    sql(`
      drop extension if exists pgcrypto cascade;
      drop schema if exists public cascade;
      create schema public;
      grant all on schema public to postgres;
      grant usage on schema public to public;
      drop schema if exists auth cascade;
    `);
  }
});

databaseDescribe("meal-plan atomic RPC authorization", () => {
  it("uses hardened SECURITY DEFINER functions with only required execution roles", () => {
    expect(sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public'
        and p.proname in ('complete_meal_plan_item','complete_meal_plan_item_with_values','correct_completed_meal_plan_item')
        and p.prosecdef
        and array_to_string(p.proconfig,',') like '%search_path=%'
        and has_function_privilege('authenticated',p.oid,'execute')
        and not has_function_privilege('anon',p.oid,'execute')`)).toBe("3");
  });

  it("allows an authenticated owner to complete one item exactly once", () => {
    sql(`insert into public.user_meal_plan_items(id,user_id,plan_date,meal_type,food_name,serving_size,quantity,calories,protein_g,carbs_g,fat_g)
      values ('${itemA}','${userA}','2026-07-14','Lunch','Synthetic meal','1 serving',1,500,40,50,15)`);
    roleQuery("authenticated", userA, `select public.complete_meal_plan_item('${itemA}')`);
    expect(sql(`select status,completed_at is not null,food_log_id is not null from public.user_meal_plan_items where id='${itemA}'`)).toBe("done\tt\tt");
    expect(sql(`select count(*) from public.food_logs where user_id='${userA}'`)).toBe("1");
    roleQuery("authenticated", userA, `select public.complete_meal_plan_item('${itemA}')`);
    expect(sql(`select count(*) from public.food_logs where user_id='${userA}'`)).toBe("1");
  });

  it("rejects cross-user completion and correction without creating or changing rows", () => {
    sql(`insert into public.user_meal_plan_items(id,user_id,plan_date,meal_type,food_name,serving_size,quantity,calories,protein_g,carbs_g,fat_g)
      values ('${itemB}','${userB}','2026-07-14','Dinner','Other synthetic meal','1 serving',1,600,45,55,20)`);
    expectRoleFailure("authenticated", userA, `select public.complete_meal_plan_item('${itemB}')`, /not found/i);
    expect(sql(`select status from public.user_meal_plan_items where id='${itemB}'`)).toBe("planned");
    expect(sql(`select count(*) from public.food_logs where user_id='${userB}'`)).toBe("0");
    expectRoleFailure(
      "authenticated",
      userA,
      `select public.correct_completed_meal_plan_item('${itemB}','2026-07-14','Dinner','Changed','1 serving',1,600,45,55,20,null)`,
      /not found/i
    );
  });

  it("rejects anonymous execution", () => {
    expectRoleFailure("anon", null, `select public.complete_meal_plan_item('${itemA}')`, /permission denied/i);
    expectRoleFailure(
      "anon",
      null,
      `select public.complete_meal_plan_item_with_values('${itemA}','Lunch','Synthetic','1 serving',1,500,40,50,15,null,false)`,
      /permission denied/i
    );
  });
});
