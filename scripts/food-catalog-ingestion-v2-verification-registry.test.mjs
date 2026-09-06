import test from "node:test";
import assert from "node:assert/strict";
import { DATABASE_VERIFICATION_FILES } from "./run-database-verification.mjs";

test("registers Plan 4 ingestion V2 verifiers after Plan 3 authority and before release preflight", () => {
  const plan4 = DATABASE_VERIFICATION_FILES.indexOf(
    "supabase/verification/food-catalog-ingestion-v2-authority.sql",
  );
  const serviceRoleBoundary = DATABASE_VERIFICATION_FILES.indexOf(
    "supabase/verification/food-catalog-ingestion-v2-inherited-service-role-boundary.sql",
  );
  const batchFreeze = DATABASE_VERIFICATION_FILES.indexOf(
    "supabase/verification/food-catalog-ingestion-v2-batch-freeze.sql",
  );
  const plan3Boundary = DATABASE_VERIFICATION_FILES.indexOf(
    "supabase/verification/food-catalog-service-role-table-boundary.sql",
  );
  const preflight = DATABASE_VERIFICATION_FILES.indexOf(
    "supabase/verification/production-release-migration-preflight.sql",
  );

  assert.ok(plan4 >= 0, "Plan 4 ingestion V2 verifier is not registered");
  assert.ok(serviceRoleBoundary >= 0, "Plan 4 inherited service-role verifier is not registered");
  assert.ok(plan4 > plan3Boundary, "Plan 4 verifier must run after Plan 3 Food Catalog authority verification");
  assert.ok(serviceRoleBoundary > plan4, "Inherited service-role verifier must run after core Plan 4 authority verification");
  assert.ok(serviceRoleBoundary < batchFreeze, "Inherited service-role verifier must run before batch-freeze verification");
  assert.ok(batchFreeze < preflight, "Plan 4 verifiers must run before release preflight");
});
