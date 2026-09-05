import test from "node:test";
import assert from "node:assert/strict";
import { DATABASE_VERIFICATION_FILES } from "./run-database-verification.mjs";

test("registers Plan 4 ingestion V2 verifier after Plan 3 authority and before release preflight", () => {
  const plan4 = DATABASE_VERIFICATION_FILES.indexOf(
    "supabase/verification/food-catalog-ingestion-v2-authority.sql",
  );
  const plan3Boundary = DATABASE_VERIFICATION_FILES.indexOf(
    "supabase/verification/food-catalog-service-role-table-boundary.sql",
  );
  const preflight = DATABASE_VERIFICATION_FILES.indexOf(
    "supabase/verification/production-release-migration-preflight.sql",
  );

  assert.ok(plan4 >= 0, "Plan 4 ingestion V2 verifier is not registered");
  assert.ok(plan4 > plan3Boundary, "Plan 4 verifier must run after Plan 3 Food Catalog authority verification");
  assert.ok(plan4 < preflight, "Plan 4 verifier must run before release preflight");
});
