import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertDisposableLocalDatabaseUrl,
  evaluatePerformanceBudgets,
  parseDatabaseReport,
} from "./measure-workout-history-performance.mjs";

test("permits only the disposable local Supabase database", () => {
  assert.equal(
    assertDisposableLocalDatabaseUrl(
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    ),
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  );
  assert.throws(
    () =>
      assertDisposableLocalDatabaseUrl(
        "postgresql://postgres:secret@db.example.com:5432/postgres",
      ),
    /disposable local Supabase database/u,
  );
  assert.throws(
    () =>
      assertDisposableLocalDatabaseUrl(
        "postgresql://postgres:postgres@localhost:5432/postgres",
      ),
    /disposable local Supabase database/u,
  );
});

test("evaluates every locked WH-9 acceptance budget", () => {
  const timings = Object.fromEntries(
    [
      "default_month",
      "three_month",
      "multi_year",
      "period_summary",
      "session_detail",
      "filter_status",
      "filter_type",
      "filter_exercise",
      "filter_repeated",
      "search",
    ].map((label) => [label, { p95Ms: 1 }]),
  );
  const passing = evaluatePerformanceBudgets({
    timings,
    payloadBytes: { list_20: 1024, session_detail: 2048 },
    queryCounts: { bounded: true, nPlusOne: false },
  });
  assert.equal(passing.passed, true);

  timings.search.p95Ms = 301;
  assert.equal(
    evaluatePerformanceBudgets({
      timings,
      payloadBytes: { list_20: 1024, session_detail: 2048 },
      queryCounts: { bounded: true, nPlusOne: false },
    }).passed,
    false,
  );
});

test("parses the prefixed database report", () => {
  assert.deepEqual(
    parseDatabaseReport(
      'noise\nPLAIVRA_WH9_REPORT:{"fixture":{"sessions":5000}}\n',
    ),
    {
      fixture: { sessions: 5000 },
    },
  );
});

test("fixture is deterministic, scaled, mutation-complete, and rolled back", async () => {
  const sql = await readFile(
    new URL("./workout-history-performance-fixture.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /generate_series\(1, 5000\)/u);
  assert.match(sql, /generate_series\(1, 11\)/u);
  assert.match(sql, /exercise_log_metric_values/u);
  assert.match(sql, /workout_session_prescription_metric_targets/u);
  assert.match(sql, /replace_workout_derived_records_atomic/u);
  assert.match(sql, /correct_completed_workout_session_atomic/u);
  assert.match(sql, /soft_delete_workout_session_atomic/u);
  assert.match(sql, /restore_workout_session_atomic/u);
  assert.match(sql, /purge_expired_workout_sessions/u);
  assert.match(sql, /start_repeated_workout_session_atomic/u);
  assert.match(sql, /explain \(analyze,buffers,format json\)/u);
  assert.match(sql, /rollback;\s*$/u);
});
