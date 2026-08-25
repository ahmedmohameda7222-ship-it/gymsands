import assert from "node:assert/strict";
import test from "node:test";
import {
  DATABASE_VERIFICATION_FILES,
  assertDisposableLocalDatabaseUrl,
} from "./run-database-verification.mjs";

test("database verification remains local-only", () => {
  assert.doesNotThrow(() => assertDisposableLocalDatabaseUrl(
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  ));
  for (const url of [
    "postgresql://postgres:secret@db.bkwezjxvapaeasfvlhvv.supabase.co:5432/postgres",
    "postgresql://postgres:postgres@127.0.0.1:5432/postgres",
    "https://127.0.0.1:54322/postgres",
  ]) {
    assert.throws(() => assertDisposableLocalDatabaseUrl(url));
  }
});

test("permanent verification chain covers the current Active Workout authority", () => {
  for (const required of [
    "active-workout-aw2a-execution-state.sql",
    "active-workout-aw3a-structured-metrics.sql",
    "active-workout-aw3b-structured-set-details.sql",
    "active-workout-aw3c-immutable-prescription-snapshots.sql",
    "active-workout-aw4-session-engine.sql",
    "active-workout-aw4-integration.sql",
    "workout-history-verified-records.sql",
    "workout-history-correction-delete.sql",
    "workout-history-correction-muscle-reconcile.sql",
    "workout-history-keyset-read.sql",
    "workout-history-repeat.sql",
    "nutrition-v1-reusable-domains.sql",
    "nutrition-v1-plan-diary-targets.sql",
    "production-release-migration-preflight.sql",
  ]) {
    assert.equal(DATABASE_VERIFICATION_FILES.some((file) => file.endsWith(required)), true, required);
  }
});