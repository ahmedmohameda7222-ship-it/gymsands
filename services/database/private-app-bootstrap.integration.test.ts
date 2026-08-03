import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";

const databaseUrl = process.env.DATABASE_URL;

function isClearlyDisposableDatabase(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    const databaseName = url.pathname.replace(/^\//, "");
    return (
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname) &&
      /(^|[_-])test($|[_-])/i.test(databaseName)
    );
  } catch {
    return false;
  }
}

const disposableDatabaseUrl = isClearlyDisposableDatabase(databaseUrl)
  ? databaseUrl
  : undefined;
const databaseDescribe = disposableDatabaseUrl ? describe.sequential : describe.skip;
const migration = resolve(
  process.cwd(),
  "supabase/migrations/20260803152000_private_app_bootstrap_v1.sql",
);
const userA = "41111111-1111-4111-8111-111111111111";
const userB = "42222222-2222-4222-8222-222222222222";
const userC = "43333333-3333-4333-8333-333333333333";

function sql(query: string) {
  if (!disposableDatabaseUrl) {
    throw new Error("A localhost test DATABASE_URL is required.");
  }
  return execFileSync(
    "psql",
    [
      disposableDatabaseUrl,
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

function applyMigration() {
  if (!disposableDatabaseUrl) {
    throw new Error("A localhost test DATABASE_URL is required.");
  }
  execFileSync(
    "psql",
    [
      disposableDatabaseUrl,
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      migration,
    ],
    { encoding: "utf8", stdio: "pipe" },
  );
}

function transactionResult(output: string) {
  const lines = output.trim().split("\n").filter(Boolean);
  return lines.at(-2) ?? lines.at(-1) ?? "";
}

function authQuery(userId: string, query: string) {
  return transactionResult(
    sql(`begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub','${userId}',true);
      select set_config('request.jwt.claim.role','authenticated',true);
      ${query};
      commit;`),
  );
}

function expectSqlFailure(query: string, evidence?: RegExp) {
  if (!disposableDatabaseUrl) {
    throw new Error("A localhost test DATABASE_URL is required.");
  }
  const result = spawnSync(
    "psql",
    [disposableDatabaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", query],
    { encoding: "utf8" },
  );
  expect(result.status).not.toBe(0);
  const output = `${result.stdout}\n${result.stderr}`;
  if (evidence) expect(output).toMatch(evidence);
}

databaseDescribe("get_private_app_bootstrap_v1", () => {
  beforeAll(() => {
    sql(`
      drop schema public cascade;
      create schema public;
      grant all on schema public to postgres;
      grant usage on schema public to public;
      drop schema if exists auth cascade;
      create schema auth;

      do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
      do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
      do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
      grant usage on schema public, auth to anon, authenticated, service_role;

      create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant execute on function auth.uid() to public;

      create table auth.users (id uuid primary key);
      insert into auth.users(id) values ('${userA}'), ('${userB}'), ('${userC}');

      create table public.profiles (
        id uuid primary key,
        email text,
        full_name text,
        role text not null default 'member',
        avatar_url text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create table public.account_access_states (
        user_id uuid primary key,
        state text not null
      );
      create table public.user_consents (
        user_id uuid not null,
        consent_type text not null,
        version text not null,
        granted boolean not null,
        revoked_at timestamptz
      );
      create table public.onboarding_answers (
        user_id uuid primary key,
        age integer,
        completed_at timestamptz
      );
      create table public.user_app_settings (
        id uuid primary key,
        user_id uuid not null unique,
        language text,
        theme_id text
      );

      insert into public.profiles(id,email,full_name,role) values
        ('${userA}','a@example.test','User A','member'),
        ('${userB}','b@example.test','User B','admin');
      insert into public.account_access_states(user_id,state) values
        ('${userA}','active'),
        ('${userB}','legal_hold');
      insert into public.user_consents(user_id,consent_type,version,granted,revoked_at) values
        ('${userA}','terms','v-a',true,null),
        ('${userB}','terms','v-b',true,null),
        ('${userB}','privacy','v-b',true,null);
      insert into public.onboarding_answers(user_id,age,completed_at) values
        ('${userA}',25,'2026-08-03T00:00:00Z'),
        ('${userB}',30,'2026-08-03T00:00:00Z');
      insert into public.user_app_settings(id,user_id,language,theme_id) values
        ('51111111-1111-4111-8111-111111111111','${userA}','en','olive'),
        ('52222222-2222-4222-8222-222222222222','${userB}','de','sage');
    `);
    applyMigration();
  });

  afterAll(() => {
    sql("drop schema public cascade; create schema public; grant all on schema public to postgres; grant usage on schema public to public;");
  });

  it("denies anonymous and unauthenticated execution", () => {
    expectSqlFailure(
      "begin; set local role anon; select public.get_private_app_bootstrap_v1(); commit;",
      /permission denied/i,
    );
    expectSqlFailure(
      "select public.get_private_app_bootstrap_v1();",
      /Authentication required/i,
    );
  });

  it("has no actor argument and grants only authenticated/service execution", () => {
    expect(
      sql(`select pronargs from pg_proc where proname='get_private_app_bootstrap_v1'`),
    ).toBe("0");
    expect(
      sql(`select has_function_privilege('anon','public.get_private_app_bootstrap_v1()','execute')`),
    ).toBe("f");
    expect(
      sql(`select has_function_privilege('authenticated','public.get_private_app_bootstrap_v1()','execute')`),
    ).toBe("t");
  });

  it("returns only the authenticated actor facts", () => {
    const result = JSON.parse(
      authQuery(userA, "select public.get_private_app_bootstrap_v1()"),
    );
    expect(result.contractVersion).toBe(1);
    expect(result.userId).toBe(userA);
    expect(result.profile.id).toBe(userA);
    expect(result.profile.email).toBe("a@example.test");
    expect(result.accountAccessState).toBe("active");
    expect(result.consentRecords).toEqual([
      {
        consent_type: "terms",
        version: "v-a",
        granted: true,
        revoked_at: null,
      },
    ]);
    expect(result.onboarding).toMatchObject({ age: 25 });
    expect(result.settings.user_id).toBe(userA);
    expect(JSON.stringify(result)).not.toContain(userB);
    expect(JSON.stringify(result)).not.toContain("b@example.test");
  });

  it("returns stable optional defaults and performs no writes", () => {
    const before = sql(`select concat(
      (select count(*) from profiles), ':',
      (select count(*) from account_access_states), ':',
      (select count(*) from user_consents), ':',
      (select count(*) from onboarding_answers), ':',
      (select count(*) from user_app_settings)
    )`);
    const result = JSON.parse(
      authQuery(userC, "select public.get_private_app_bootstrap_v1()"),
    );
    const after = sql(`select concat(
      (select count(*) from profiles), ':',
      (select count(*) from account_access_states), ':',
      (select count(*) from user_consents), ':',
      (select count(*) from onboarding_answers), ':',
      (select count(*) from user_app_settings)
    )`);
    expect(result).toMatchObject({
      userId: userC,
      profile: null,
      accountAccessState: "active",
      consentRecords: [],
      onboarding: { age: null, completed_at: null },
      settings: null,
    });
    expect(after).toBe(before);
  });
});
