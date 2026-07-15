import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationFiles = [
  "supabase/migrations/20260711213000_adaptive_onboarding_v2.sql",
  "supabase/migrations/20260712173000_persistent_meal_plan_skip_status.sql",
  "supabase/migrations/20260712195000_nutrition_target_date_overrides.sql",
  "supabase/migrations/20260713153000_meal_plan_atomic_execution.sql",
  "supabase/migrations/20260713160000_train_section_atomic_integrity.sql",
  "supabase/migrations/20260713170000_finalize_train_schedule_delete_integrity.sql",
  "supabase/migrations/20260714030000_harden_train_plan_rpc_execution.sql",
  "supabase/migrations/20260715010000_restrict_nutrition_target_override_acl.sql"
];

test("captures SHA-256 for the exact reconciliation migration bytes", () => {
  const hashes = Object.fromEntries(migrationFiles.map((file) => [
    file,
    createHash("sha256").update(readFileSync(file)).digest("hex")
  ]));

  assert.equal(Object.keys(hashes).length, 8);
  assert.equal(new Set(Object.values(hashes)).size, 8);
  for (const [file, digest] of Object.entries(hashes)) {
    assert.match(digest, /^[a-f0-9]{64}$/, file);
  }

  console.log(`MIGRATION_RECONCILIATION_SHA256=${JSON.stringify(hashes)}`);
});
