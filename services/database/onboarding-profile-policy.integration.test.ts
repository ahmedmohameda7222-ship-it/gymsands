import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";

const sourceDatabaseUrl = process.env.DATABASE_URL;
const databaseDescribe = sourceDatabaseUrl
  ? describe.sequential
  : describe.skip;
const migration = resolve(
  process.cwd(),
  "supabase/migrations/20260804174500_fix_profiles_update_policy_recursion.sql",
);
const verification = resolve(
  process.cwd(),
  "supabase/verification/20260804174500_fix_profiles_update_policy_recursion.sql",
);

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const admin = "33333333-3333-4333-8333-333333333333";
const isolatedDatabaseName =
  `plaivra_onboarding_rls_${process.pid}_${Date.now()}`;
let isolatedDatabaseUrl: string | null = null;
let productionShapedFailure = "";

function databaseUrlFor(databaseName: string) {
  if (!sourceDatabaseUrl) {
    throw new Error("DATABASE_URL is required for database integration tests.");
  }
  const url = new URL(sourceDatabaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function runSql(databaseUrl: string, query: string) {
  return execFileSync(
    "psql",
    [
      databaseUrl,
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
      "-F",
      "\t",
      "-c",
      query,
    ],
    { encoding: "utf8" },
  ).trim();
}

function adminSql(query: string) {
  return runSql(databaseUrlFor("postgres"), query);
}

function sql(query: string) {
  if (!isolatedDatabaseUrl) {
    throw new Error("The isolated onboarding RLS database is unavailable.");
  }
  return runSql(isolatedDatabaseUrl, query);
}

function applySqlFile(path: string) {
  if (!isolatedDatabaseUrl) {
    throw new Error("The isolated onboarding RLS database is unavailable.");
  }
  execFileSync(
    "psql",
    [isolatedDatabaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-f", path],
    { encoding: "utf8", stdio: "pipe" },
  );
}

function authQuery(userId: string, query: string) {
  return sql(
    `begin; set local role authenticated; select set_config('request.jwt.claim.sub','${userId}',true); ${query}; commit;`,
  );
}

function failedSql(query: string) {
  if (!isolatedDatabaseUrl) {
    throw new Error("The isolated onboarding RLS database is unavailable.");
  }
  const result = spawnSync(
    "psql",
    [isolatedDatabaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", query],
    { encoding: "utf8" },
  );
  if (result.status === 0) {
    throw new Error("Expected SQL statement to fail.");
  }
  return `${result.stdout}\n${result.stderr}`;
}

function dropIsolatedDatabase() {
  if (!sourceDatabaseUrl || !isolatedDatabaseUrl) return;
  adminSql(`
    select pg_terminate_backend(pid)
    from pg_stat_activity
    where datname = '${isolatedDatabaseName}'
      and pid <> pg_backend_pid();
  `);
  adminSql(`drop database if exists "${isolatedDatabaseName}";`);
  isolatedDatabaseUrl = null;
}

beforeAll(() => {
  if (!sourceDatabaseUrl) return;
  adminSql(`create database "${isolatedDatabaseName}";`);
  isolatedDatabaseUrl = databaseUrlFor(isolatedDatabaseName);

  try {
    sql(`
      drop schema public cascade;
      create schema public;
      grant all on schema public to postgres;
      grant usage on schema public to public;

      create schema auth;
      create schema private;

      do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
      do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
      do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;

      grant usage on schema public, auth to anon, authenticated, service_role;
      grant usage on schema private to authenticated, service_role;

      create function auth.uid()
      returns uuid
      language sql
      stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant execute on function auth.uid() to public;

      create type public.user_role as enum ('member', 'admin');

      create table public.profiles (
        id uuid primary key,
        role public.user_role not null default 'member',
        target_weight_kg numeric,
        body_goal text,
        updated_at timestamptz not null default now()
      );

      alter table public.profiles enable row level security;
      grant select, insert, update, delete on public.profiles to authenticated;
      grant all on public.profiles to service_role;

      create function private.is_admin()
      returns boolean
      language sql
      stable
      security definer
      set search_path = pg_catalog, public
      as $$
        select exists (
          select 1 from public.profiles
          where id = (select auth.uid()) and role = 'admin'
        )
      $$;
      revoke all on function private.is_admin() from public, anon;
      grant execute on function private.is_admin() to authenticated, service_role;

      create policy profiles_select_own_or_admin
      on public.profiles for select to authenticated
      using (id = (select auth.uid()) or private.is_admin());

      create policy profiles_admin_update_all
      on public.profiles for update to authenticated
      using (private.is_admin())
      with check (private.is_admin());

      create policy profiles_update_own_basic
      on public.profiles for update to authenticated
      using (id = (select auth.uid()))
      with check (
        id = (select auth.uid())
        and role = coalesce(
          (select profile.role from public.profiles profile where profile.id = (select auth.uid())),
          role
        )
      );

      insert into public.profiles (id, role)
      values
        ('${userA}', 'member'),
        ('${userB}', 'member'),
        ('${admin}', 'admin');

      create function public.complete_adaptive_onboarding_v2(
        p_onboarding jsonb,
        p_nutrition jsonb,
        p_constraints jsonb,
        p_permissions jsonb
      )
      returns jsonb
      language plpgsql
      security invoker
      set search_path = public, pg_temp
      as $$
      declare
        actor_id uuid := auth.uid();
        completed_at timestamptz := now();
      begin
        update public.profiles
        set
          target_weight_kg = nullif(p_onboarding ->> 'goal_weight_kg', '')::numeric,
          body_goal = p_onboarding ->> 'goal',
          updated_at = now()
        where id = actor_id;

        if not found then
          raise exception 'Profile update failed.';
        end if;

        return jsonb_build_object('user_id', actor_id, 'completed_at', completed_at);
      end;
      $$;
      grant execute on function public.complete_adaptive_onboarding_v2(jsonb,jsonb,jsonb,jsonb)
        to authenticated, service_role;
    `);

    productionShapedFailure = failedSql(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub','${userA}',true);
      select public.complete_adaptive_onboarding_v2(
        '{"goal_weight_kg":"80","goal":"build muscle"}'::jsonb,
        '{}'::jsonb,
        '{}'::jsonb,
        '{}'::jsonb
      );
      commit;
    `);

    applySqlFile(migration);
  } catch (error) {
    dropIsolatedDatabase();
    throw error;
  }
});

afterAll(() => {
  dropIsolatedDatabase();
});

databaseDescribe("onboarding profile update RLS hotfix", () => {
  it("reproduces the exact production recursion before the repair", () => {
    expect(productionShapedFailure).toMatch(
      /infinite recursion detected in policy for relation "profiles"/i,
    );
  });

  it("allows the authenticated owner onboarding completion profile update", () => {
    const result = authQuery(
      userA,
      `select public.complete_adaptive_onboarding_v2(
        '{"goal_weight_kg":"80","goal":"build muscle"}'::jsonb,
        '{}'::jsonb,
        '{}'::jsonb,
        '{}'::jsonb
      )`,
    );
    expect(result).toContain(userA);
    expect(
      sql(
        `select target_weight_kg, body_goal, role from public.profiles where id='${userA}'`,
      ),
    ).toBe("80\tbuild muscle\tmember");
  });

  it("still blocks direct owner role escalation", () => {
    const error = failedSql(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub','${userA}',true);
      update public.profiles set role='admin' where id='${userA}';
      commit;
    `);
    expect(error).toMatch(/row-level security policy/i);
    expect(sql(`select role from public.profiles where id='${userA}'`)).toBe(
      "member",
    );
  });

  it("does not let an owner update another profile", () => {
    authQuery(
      userA,
      `update public.profiles set body_goal='stolen' where id='${userB}'`,
    );
    expect(
      sql(`select body_goal is null from public.profiles where id='${userB}'`),
    ).toBe("t");
  });

  it("preserves the separate admin update authority", () => {
    authQuery(
      admin,
      `update public.profiles set body_goal='admin-reviewed' where id='${userB}'`,
    );
    expect(sql(`select body_goal from public.profiles where id='${userB}'`)).toBe(
      "admin-reviewed",
    );
  });

  it("keeps the helper unavailable to anonymous callers", () => {
    const error = failedSql(`
      begin;
      set local role anon;
      select private.profile_role_unchanged('member'::public.user_role);
      commit;
    `);
    expect(error).toMatch(/permission denied/i);
  });

  it("passes the immutable SQL verification", () => {
    applySqlFile(verification);
  });
});
