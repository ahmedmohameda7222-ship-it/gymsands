#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const DATABASE_VERIFICATION_FILES = Object.freeze([
  "supabase/verification/muscle-intelligence-phase1.sql",
  "supabase/verification/train-phase2a-program-architecture.sql",
  "supabase/verification/active-workout-aw2a-execution-state.sql",
  "supabase/verification/active-workout-aw2a-integration.sql",
  "supabase/verification/active-workout-aw3a-structured-metrics.sql",
  "supabase/verification/active-workout-aw3a-integration.sql",
  "supabase/verification/active-workout-aw3a-final-completion.sql",
  "supabase/verification/active-workout-aw3b-structured-set-details.sql",
  "supabase/verification/active-workout-aw3b-integration.sql",
  "supabase/verification/active-workout-aw3c-immutable-prescription-snapshots.sql",
  "supabase/verification/active-workout-aw3c-integration.sql",
  "supabase/verification/active-workout-aw4-session-engine.sql",
  "supabase/verification/active-workout-aw4-integration.sql",
  "supabase/verification/active-workout-aw9-offline-multi-device.sql",
  "supabase/verification/workout-history-verified-records.sql",
  "supabase/verification/workout-history-correction-delete.sql",
  "supabase/verification/workout-history-correction-muscle-reconcile.sql",
  "supabase/verification/workout-history-keyset-read.sql",
  "supabase/verification/workout-history-repeat.sql",
  "supabase/verification/train-atomic-rpc-security.sql",
  "supabase/verification/nutrition-v1-reusable-domains.sql",
  "supabase/verification/nutrition-v1-plan-diary-targets.sql",
  "supabase/verification/nutrition-v1-cooking-sessions.sql",
  "supabase/verification/nutrition-v1-food-search-and-curation.sql",
  "supabase/verification/nutrition-v1-meal-plan-week-start.sql",
  "supabase/verification/nutrition-v1-privacy-purge.sql",
  "supabase/verification/nutrition-v1-user-food-authority.sql",
  "supabase/verification/nutrition-v1-legacy-reconciliation.sql",
  "supabase/verification/nutrition-v1-review-atomicity.sql",
  "supabase/verification/nutrition-v1-long-term-architecture.sql",
  "supabase/verification/nutrition-v1-final-architecture-corrections.sql",
  "supabase/verification/nutrition-v1-cooking-command-authority.sql",
  "supabase/verification/nutrition-v1-final-closure.sql",
  "supabase/verification/nutrition-v1-working-draft-command.sql",
  "supabase/verification/nutrition-v1-recipe-draft-revision.sql",
  "supabase/verification/nutrition-v1-recipe-draft-graph-identity.sql",
  "supabase/verification/nutrition-v1-recipe-preseed-idempotency.sql",
  "supabase/verification/nutrition-v1-meal-plan-mutation-idempotency.sql",
  "supabase/verification/nutrition-v1-saved-meal-create-idempotency.sql",
  "supabase/verification/nutrition-v1-nullable-meal-plan-snapshots.sql",
  "supabase/verification/food-catalog-population-readiness.sql",
  "supabase/verification/food-catalog-ingestion-concurrency.sql",
  "supabase/verification/food-catalog-intelligence-core.sql",
  "supabase/verification/food-catalog-plan1-semantic-corrections.sql",
  "supabase/verification/food-catalog-generation-authority.sql",
  "supabase/verification/food-catalog-verification-chain-roots.sql",
  "supabase/verification/food-catalog-activation-eligibility.sql",
  "supabase/verification/food-catalog-validation-report-checksum.sql",
  "supabase/verification/food-catalog-service-role-table-boundary.sql",
  "supabase/verification/food-catalog-ingestion-v2-authority.sql",
  "supabase/verification/food-catalog-ingestion-v2-inherited-service-role-boundary.sql",
  "supabase/verification/food-catalog-ingestion-v2-batch-freeze.sql",
  "supabase/verification/food-catalog-ingestion-v2-zero-record.sql",
  "supabase/verification/production-release-migration-preflight.sql",
]);

export function assertDisposableLocalDatabaseUrl(value) {
  const parsed = new URL(String(value ?? ""));
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error("Database verification requires a PostgreSQL URL.");
  }
  if (!new Set(["127.0.0.1", "localhost"]).has(parsed.hostname) || parsed.port !== "54322") {
    throw new Error("Refusing database verification outside disposable local Supabase on port 54322.");
  }
  return parsed.toString();
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    env,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}.`);
}

export function runDatabaseVerification({
  databaseUrl = process.env.PLAIVRA_LOCAL_DATABASE_URL,
  env = process.env,
} = {}) {
  const localUrl = assertDisposableLocalDatabaseUrl(databaseUrl);
  const executionEnv = { ...env, PGPASSWORD: "postgres" };
  for (const file of DATABASE_VERIFICATION_FILES.slice(0, -1)) {
    run("psql", [localUrl, "-X", "-v", "ON_ERROR_STOP=1", "-f", file], executionEnv);
  }
  run(process.execPath, ["scripts/test-food-catalog-grant-promotion-concurrency.mjs"], {
    ...executionEnv,
    PLAIVRA_GRANT_PROMOTION_CONCURRENCY_TEST_DATABASE_URL: localUrl,
  });
  run(process.execPath, ["scripts/test-database-preflight-control.mjs"], {
    ...executionEnv,
    PLAIVRA_PREFLIGHT_TEST_DATABASE_URL: localUrl,
  });
  run("psql", [localUrl, "-X", "-v", "ON_ERROR_STOP=1", "-f", DATABASE_VERIFICATION_FILES.at(-1)], executionEnv);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runDatabaseVerification();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
