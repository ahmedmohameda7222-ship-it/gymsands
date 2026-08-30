import assert from "node:assert/strict";
import test from "node:test";

import { DATABASE_VERIFICATION_FILES } from "./run-database-verification.mjs";

const FOOD_CATALOG_BATCH0_VERIFICATION = "supabase/verification/food-catalog-population-readiness.sql";
const RELEASE_PREFLIGHT_VERIFICATION = "supabase/verification/production-release-migration-preflight.sql";

test("full database verification executes Food Catalog Batch 0 before release preflight", () => {
  const batch0Index = DATABASE_VERIFICATION_FILES.indexOf(FOOD_CATALOG_BATCH0_VERIFICATION);
  const releasePreflightIndex = DATABASE_VERIFICATION_FILES.indexOf(RELEASE_PREFLIGHT_VERIFICATION);

  assert.notEqual(batch0Index, -1, "Food Catalog Batch 0 verification must be registered");
  assert.notEqual(releasePreflightIndex, -1, "release preflight verification must remain registered");
  assert.ok(batch0Index < releasePreflightIndex, "Batch 0 verification must run before release preflight");
});
