import test from "node:test";
import assert from "node:assert/strict";
import { DATABASE_VERIFICATION_FILES } from "./run-database-verification.mjs";

test("registers Plan 3 verifier before release preflight", () => {
  const plan3 = DATABASE_VERIFICATION_FILES.indexOf(
    "supabase/verification/food-catalog-generation-authority.sql",
  );
  const plan1 = DATABASE_VERIFICATION_FILES.indexOf(
    "supabase/verification/food-catalog-plan1-semantic-corrections.sql",
  );
  const preflight = DATABASE_VERIFICATION_FILES.indexOf(
    "supabase/verification/production-release-migration-preflight.sql",
  );

  assert.ok(plan3 >= 0, "Plan 3 verifier is not registered");
  assert.ok(plan3 > plan1, "Plan 3 verifier must run after Plan 1 Food Catalog verification");
  assert.ok(plan3 < preflight, "Plan 3 verifier must run before release preflight");
});
