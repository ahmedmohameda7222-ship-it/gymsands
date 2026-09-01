import assert from "node:assert/strict";
import test from "node:test";
import { DATABASE_VERIFICATION_FILES } from "./run-database-verification.mjs";

const CORE = "supabase/verification/food-catalog-intelligence-core.sql";
const PREFLIGHT = "supabase/verification/production-release-migration-preflight.sql";

test("Food Catalog Intelligence core verification runs before release preflight", () => {
  const core = DATABASE_VERIFICATION_FILES.indexOf(CORE);
  const preflight = DATABASE_VERIFICATION_FILES.indexOf(PREFLIGHT);
  assert.ok(core >= 0);
  assert.ok(preflight > core);
});
