import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  BENCHMARK_API_EXCLUDES,
  assertDisposableLocalDatabaseUrl,
  benchmarkApiStartArgs,
  buildCommittedFixtureSql,
  cleanupFixtureSql,
  parseSupabaseStatusEnv,
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
  assert.match(
    source,
    /\[databaseUrl, "-X", "-v", "ON_ERROR_STOP=1"\]/u,
  );
  assert.doesNotMatch(source, /`\\?set ON_ERROR_STOP on/u);
});

test("benchmark starts only the local API services required for real PostgREST reads", () => {
  assert.deepEqual(benchmarkApiStartArgs(), [
    "start",
    "--exclude",
    BENCHMARK_API_EXCLUDES.join(","),
  ]);
  for (const service of ["realtime", "storage-api", "studio", "edge-runtime", "logflare", "vector", "supavisor"]) {
    assert.equal(BENCHMARK_API_EXCLUDES.includes(service), true);
  }
  for (const requiredService of ["gotrue", "kong", "postgrest"]) {
    assert.equal(BENCHMARK_API_EXCLUDES.includes(requiredService), false);
  }
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
