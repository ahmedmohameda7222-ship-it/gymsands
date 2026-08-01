import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  REQUIRED_WORKOUT_SESSION_COLUMNS,
  assertDisposableLocalDatabaseUrl,
  buildCommittedFixtureSql,
  cleanupFixtureSql,
  ensureLocalSupabaseServicePlane,
  parseSupabaseStatusEnv,
  waitForWorkoutHistorySchema,
  workoutHistorySchemaProbeUrl,
} from "./measure-workout-history-performance.mjs";

test("permits only the disposable local Supabase database", () => {
  assert.equal(
    assertDisposableLocalDatabaseUrl(
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    ),
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  );
  for (const value of [
    "postgresql://postgres:secret@db.example.com:5432/postgres",
    "postgresql://postgres:postgres@localhost:5432/postgres",
    "https://127.0.0.1:54322/postgres",
  ]) {
    assert.throws(
      () => assertDisposableLocalDatabaseUrl(value),
      /disposable local Supabase database/u,
    );
  }
});

test("parses only explicit local Supabase environment assignments", () => {
  assert.deepEqual(
    parseSupabaseStatusEnv(
      'API_URL="http://127.0.0.1:54321"\nSERVICE_ROLE_KEY="local-secret"\nnoise\n',
    ),
    {
      API_URL: "http://127.0.0.1:54321",
      SERVICE_ROLE_KEY: "local-secret",
    },
  );
});

test("extracts a committed 5,000-session setup from the deterministic fixture", async () => {
  const sql = await readFile(
    new URL("./workout-history-performance-fixture.sql", import.meta.url),
    "utf8",
  );
  const setup = buildCommittedFixtureSql(sql);
  assert.match(setup, /generate_series\(1, 5000\)/u);
  assert.match(setup, /generate_series\(1, 11\)/u);
  assert.match(setup, /exercise_log_metric_values/u);
  assert.match(setup, /workout_session_prescription_metric_targets/u);
  assert.doesNotMatch(setup, /create temp table wh9_timings/u);
  assert.match(setup, /commit;\s*$/u);
});

test("cleanup remains executable SQL scoped to the deterministic fixture owner", () => {
  const cleanup = cleanupFixtureSql();
  assert.match(cleanup, /^begin;\n/u);
  assert.match(cleanup, /b9000000-0000-4000-8000-000000000001/u);
  assert.match(cleanup, /delete from public\.profiles/u);
  assert.match(cleanup, /commit;\s*$/u);
  assert.doesNotMatch(cleanup, /(?:^|\n)\s*set\s+ON_ERROR_STOP\s+on/u);
  assert.doesNotMatch(cleanup, /(?:^|\n)\s*\\set\s+ON_ERROR_STOP\s+on/u);
});

test("benchmark enforces psql errors through the CLI variable contract", async () => {
  const source = await readFile(
    new URL("./measure-workout-history-performance.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /\[databaseUrl, "-X", "-v", "ON_ERROR_STOP=1"\]/u);
  assert.doesNotMatch(source, /`\\?set ON_ERROR_STOP on/u);
});

test("schema probe covers the complete direct workout-session read contract", () => {
  for (const column of [
    "scheduled_session_id",
    "history_revision",
    "derived_record_schema_version",
    "derived_record_formula_version",
    "derived_records_evaluated_at",
  ]) {
    assert.equal(REQUIRED_WORKOUT_SESSION_COLUMNS.includes(column), true);
  }

  const url = new URL(
    workoutHistorySchemaProbeUrl("http://127.0.0.1:54321"),
  );
  assert.equal(url.pathname, "/rest/v1/workout_sessions");
  assert.equal(url.searchParams.get("limit"), "1");
  assert.deepEqual(
    url.searchParams.get("select")?.split(","),
    [...REQUIRED_WORKOUT_SESSION_COLUMNS],
  );
});

test("schema readiness retries PostgREST and preserves service-role authorization", async () => {
  const calls = [];
  const sleeps = [];
  const responses = [
    { ok: false, status: 400, body: '{"message":"schema cache stale"}' },
    { ok: true, status: 200, body: "[]" },
  ];

  await waitForWorkoutHistorySchema({
    apiUrl: "http://127.0.0.1:54321",
    serviceRoleKey: "local-service-role",
    attempts: 2,
    delayMs: 10,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      const response = responses.shift();
      return {
        ok: response.ok,
        status: response.status,
        text: async () => response.body,
      };
    },
    sleepImpl: async (delayMs) => {
      sleeps.push(delayMs);
    },
  });

  assert.equal(calls.length, 2);
  assert.deepEqual(sleeps, [10]);
  assert.equal(
    calls[0].init.headers.Authorization,
    "Bearer local-service-role",
  );
  assert.equal(calls[0].init.headers.apikey, "local-service-role");
});

test("schema readiness reports the underlying PostgREST failure without exposing credentials", async () => {
  await assert.rejects(
    waitForWorkoutHistorySchema({
      apiUrl: "http://127.0.0.1:54321",
      serviceRoleKey: "do-not-print-this-secret",
      attempts: 1,
      fetchImpl: async () => ({
        ok: false,
        status: 400,
        text: async () => '{"code":"PGRST204","message":"missing column"}',
      }),
      sleepImpl: async () => {},
    }),
    (error) => {
      assert.match(error.message, /HTTP 400/u);
      assert.match(error.message, /PGRST204/u);
      assert.match(error.message, /missing column/u);
      assert.doesNotMatch(error.message, /do-not-print-this-secret/u);
      return true;
    },
  );
});

test("benchmark starts only the missing API service plane", () => {
  const calls = [];
  const result = ensureLocalSupabaseServicePlane((command, args) => {
    calls.push({ command, args });
    return { status: 0 };
  });
  assert.deepEqual(calls, [{ command: "supabase", args: ["start"] }]);
  assert.deepEqual(result, { status: 0 });
});

test("benchmark preserves the migrated database while activating PostgREST", async () => {
  const source = await readFile(
    new URL("./measure-workout-history-performance.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /execute\("supabase", \["stop"/u);
  assert.doesNotMatch(source, /execute\("supabase", \["db", "reset"/u);
  assert.match(
    source,
    /ensureLocalSupabaseServicePlane\(\);\n  const local = localSupabaseEnvironment\(\);\n  runPsql\(databaseUrl, "notify pgrst, 'reload schema';\\n"\);\n  await waitForWorkoutHistorySchema\(local\);\n\n  runPsql\(databaseUrl, cleanupSql\);/u,
  );
});

test("real benchmark executes the versioned list and detail services", async () => {
  const source = await readFile(
    new URL("./workout-history-performance.integration.test.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /listWorkoutHistoryKeyset/u);
  assert.match(source, /getWorkoutHistorySessionDetail/u);
  assert.match(source, /readSharedWorkoutHistorySessionMetrics/u);
  assert.match(source, /instrumentedFetch/u);
  assert.match(source, /maxRowsTransferred/u);
  assert.match(source, /queryCounts/u);
  assert.doesNotMatch(source, /bounded:\s*true/u);
  assert.doesNotMatch(source, /nPlusOne:\s*false/u);
});
