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

test("permanent verification chain covers current Active Workout and Nutrition authorities", () => {
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
    "nutrition-v1-cooking-sessions.sql",
    "nutrition-v1-food-search-and-curation.sql",
    "nutrition-v1-meal-plan-week-start.sql",
    "nutrition-v1-privacy-purge.sql",
    "nutrition-v1-legacy-reconciliation.sql",
    "nutrition-v1-final-architecture-corrections.sql",
    "nutrition-v1-cooking-command-authority.sql",
    "nutrition-v1-final-closure.sql",
    "nutrition-v1-nullable-meal-plan-snapshots.sql",
    "production-release-migration-preflight.sql",
  ]) {
    assert.equal(DATABASE_VERIFICATION_FILES.some((file) => file.endsWith(required)), true, required);
  }

  const finalCorrection = DATABASE_VERIFICATION_FILES.indexOf(
    "supabase/verification/nutrition-v1-final-architecture-corrections.sql",
  );
  const commandAuthority = DATABASE_VERIFICATION_FILES.indexOf(
    "supabase/verification/nutrition-v1-cooking-command-authority.sql",
  );
  const finalClosure = DATABASE_VERIFICATION_FILES.indexOf(
    "supabase/verification/nutrition-v1-final-closure.sql",
  );
  const nullableMealPlan = DATABASE_VERIFICATION_FILES.indexOf(
    "supabase/verification/nutrition-v1-nullable-meal-plan-snapshots.sql",
  );
  const productionPreflight = DATABASE_VERIFICATION_FILES.indexOf(
    "supabase/verification/production-release-migration-preflight.sql",
  );
  assert.equal(finalCorrection >= 0 && finalCorrection < productionPreflight, true);
  assert.equal(commandAuthority >= 0 && commandAuthority < finalClosure, true);
  assert.equal(finalClosure >= 0 && finalClosure < productionPreflight, true);
  assert.equal(nullableMealPlan >= 0 && nullableMealPlan < productionPreflight, true);
});
