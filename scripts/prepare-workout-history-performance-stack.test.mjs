import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MINIMAL_API_SERVICE_EXCLUDES,
  assertLocalApiReady,
  localServiceRoleReadParitySql,
  localStackRepairPlan,
  parseSupabaseStatusEnv,
  restoreLocalServiceRoleReadParity,
} from "./prepare-workout-history-performance-stack.mjs";

const source = readFileSync(
  "scripts/prepare-workout-history-performance-stack.mjs",
  "utf8",
).replaceAll("\r\n", "\n");

test("status parser accepts quoted Supabase CLI environment output", () => {
  assert.deepEqual(
    parseSupabaseStatusEnv(
      'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"\nAPI_URL=http://127.0.0.1:54321\nSERVICE_ROLE_KEY=secret\n',
    ),
    {
      DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      API_URL: "http://127.0.0.1:54321",
      SERVICE_ROLE_KEY: "secret",
    },
  );
});

test("database-only stack requires a data-preserving service-plane restart", () => {
  assert.equal(
    localStackRepairPlan({
      DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    }),
    "restart-preserving-data",
  );
  assert.equal(
    localStackRepairPlan({
      DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      API_URL: "http://127.0.0.1:54321",
      SERVICE_ROLE_KEY: "secret",
    }),
    "already-ready",
  );
  assert.equal(localStackRepairPlan({}), "start");
});

test("minimal stack retains the services required by the REST API contract", () => {
  for (const required of ["gotrue", "kong", "postgrest"]) {
    assert.equal(MINIMAL_API_SERVICE_EXCLUDES.includes(required), false);
  }
  assert.match(source, /\["stop", "--project-id", LOCAL_PROJECT_ID\]/u);
  assert.doesNotMatch(
    source,
    /\["stop", "--project-id", LOCAL_PROJECT_ID, "--no-backup"\]/u,
  );
});

test("readiness validation accepts only the disposable local API and database ports", () => {
  assert.doesNotThrow(() => assertLocalApiReady({
    DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    API_URL: "http://127.0.0.1:54321",
    SERVICE_ROLE_KEY: "secret",
  }));
  assert.throws(
    () => assertLocalApiReady({
      DB_URL: "postgresql://postgres:postgres@example.com:54322/postgres",
      API_URL: "https://example.com",
      SERVICE_ROLE_KEY: "secret",
    }),
    /non-disposable endpoint/u,
  );
});

test("local service-role parity repair is read-only and refreshes PostgREST", () => {
  const sql = localServiceRoleReadParitySql();
  assert.match(sql, /grant usage on schema public to service_role;/u);
  assert.match(sql, /grant select on all tables in schema public to service_role;/u);
  assert.match(
    sql,
    /has_table_privilege\('service_role', 'public\.workout_sessions', 'SELECT'\)/u,
  );
  assert.match(sql, /notify pgrst, 'reload schema';/u);
  assert.doesNotMatch(sql, /grant all/u);
  assert.doesNotMatch(sql, /\b(?:insert|update|delete|truncate)\b/iu);
});

test("service-role parity repair cannot target a non-disposable endpoint", () => {
  let called = false;
  assert.throws(
    () => restoreLocalServiceRoleReadParity(
      {
        DB_URL: "postgresql://postgres:secret@db.example.com:5432/postgres",
        API_URL: "https://example.com",
        SERVICE_ROLE_KEY: "secret",
      },
      () => {
        called = true;
      },
    ),
    /non-disposable endpoint/u,
  );
  assert.equal(called, false);
});

test("service-role parity repair uses psql error-stop on the validated local database", () => {
  const calls = [];
  const values = {
    DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    API_URL: "http://127.0.0.1:54321",
    SERVICE_ROLE_KEY: "secret",
  };
  const result = restoreLocalServiceRoleReadParity(
    values,
    (command, args, options) => {
      calls.push({ command, args, options });
      return { status: 0 };
    },
  );
  assert.deepEqual(calls, [{
    command: "psql",
    args: [values.DB_URL, "-X", "-v", "ON_ERROR_STOP=1"],
    options: { input: localServiceRoleReadParitySql() },
  }]);
  assert.deepEqual(result, { status: 0 });
  assert.match(
    source,
    /const after = statusEnvironment\(\);\n  restoreLocalServiceRoleReadParity\(after\);/u,
  );
});
