import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CORRECTION_AW2A_VERSION,
  MARKER_AFTER_BRIDGE,
  MARKER_BEFORE_BRIDGE,
  ORIGINAL_AW2A_VERSION,
  assertLocalOnly,
  nextSyntheticVersion,
  validateMigrationHistory,
} from "./replay-local-migration-chain.mjs";

const quality = readFileSync(".github/workflows/quality.yml", "utf8").replaceAll("\r\n", "\n");
const helper = readFileSync("scripts/replay-local-migration-chain.mjs", "utf8").replaceAll("\r\n", "\n");
const parity = readFileSync("scripts/check-unit-failure-parity.mjs", "utf8").replaceAll("\r\n", "\n");

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

test("Quality delegates chronological replay to the permanent helper", () => {
  assert.match(
    quality,
    /node scripts\/replay-local-migration-chain\.mjs --log quality-reports\/database-validation\.log --prove-future-order/,
  );
  assert.match(
    helper,
    /\["db", "reset", "--local", "--no-seed", "--version", ORIGINAL_AW2A_VERSION\]/,
  );
  assert.match(helper, /\["migration", "up", "--local", "--include-all"\]/);
  assert.match(helper, /\["start", "--exclude", DATABASE_ONLY_EXCLUDES\]/);
  assert.doesNotMatch(quality, /restore_correction|temporary_correction|cp "\$correction_migration"|rm "\$correction_migration"/);
  assert.doesNotMatch(helper, /migration", "repair|db", "push|--linked/);
});

test("synthetic future migration version sorts after the complete repository chain", () => {
  const version = nextSyntheticVersion([
    { version: ORIGINAL_AW2A_VERSION },
    { version: CORRECTION_AW2A_VERSION },
    { version: "20260722000000" },
  ]);
  assert.equal(version, "20260722000001");
  assert.ok(ORIGINAL_AW2A_VERSION < CORRECTION_AW2A_VERSION);
  assert.ok(CORRECTION_AW2A_VERSION < version);
  assert.match(helper, /synthetic future-migration chronological replay proof/);
  assert.match(helper, /assertSyntheticOrder\(versions, syntheticVersion\)/);
  assert.match(helper, /final repository migration replay/);
});

test("helper rejects a linked Supabase repository", () => {
  const root = mkdtempSync(join(tmpdir(), "plaivra-linked-replay-test-"));
  try {
    const linkedDirectory = join(root, "supabase", ".temp");
    mkdirSync(linkedDirectory, { recursive: true });
    writeFileSync(join(linkedDirectory, "project-ref"), "remote-project-ref\n", "utf8");
    assert.throws(() => assertLocalOnly(root), /Refusing to run against a linked Supabase project/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("migration-history validation requires every migration exactly once", () => {
  assert.doesNotThrow(() => validateMigrationHistory(["1", "2", "3"], ["1", "2", "3"]));
  assert.throws(() => validateMigrationHistory(["1", "2", "3"], ["1", "3"]), /missing local records: 2/);
  assert.throws(() => validateMigrationHistory(["1", "2"], ["1", "2", "2"]), /duplicate local records: 2 \(2\)/);
  assert.throws(() => validateMigrationHistory(["1", "2"], ["1", "2", "3"]), /unexpected local records: 3/);
});

test("compatibility bridge is explicit, exact, and local-only", () => {
  assert.match(helper, new RegExp(MARKER_BEFORE_BRIDGE));
  assert.match(helper, new RegExp(MARKER_AFTER_BRIDGE));
  assert.match(helper, /127\.0\.0\.1:54322/);
  assert.match(helper, /update public\.release_schema_compatibility/);
  assert.match(helper, /Replay helper changed the repository working tree/);
});

test("workflow_dispatch never passes an empty pull-request base to parity", () => {
  assert.match(
    quality,
    /- name: Verify full unit failure parity\n\s+if: github\.event_name == 'pull_request' && steps\.scope\.outputs\.database == 'true'/,
  );
  assert.match(
    quality,
    /- name: Record workflow-dispatch parity skip\n\s+if: github\.event_name == 'workflow_dispatch' && steps\.scope\.outputs\.database == 'true'/,
  );
  assert.match(quality, /node scripts\/check-unit-failure-parity\.mjs --base "\$\{\{ github\.event\.pull_request\.base\.sha \}\}"/);
});

test("permanent validation names are generic and AW-2A verification remains enforced", () => {
  assert.match(quality, /quality-reports\/database-validation\.log/);
  assert.match(quality, /quality-reports\/unit-failure-parity\.json/);
  assert.match(quality, /name: database-validation-\$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.doesNotMatch(quality, /aw2a-database-validation|aw2a-unit-failure-parity|aw2a-validation-/);
  assert.doesNotMatch(parity, /aw2a-/i);
  assert.match(quality, /supabase\/verification\/active-workout-aw2a-execution-state\.sql/);
  assert.match(quality, /services\/database\/workout-session-execution\.integration\.test\.ts/);
});

test("applied AW-2A migrations remain byte-for-byte immutable", () => {
  assert.equal(
    sha256("supabase/migrations/20260720213000_active_workout_aw2a_execution_state.sql"),
    "c8f21655226d51a2157fa1b8c272edc5fac1f84f0a2214376a16e225a1f04f2e",
  );
  assert.equal(
    sha256("supabase/migrations/20260721012814_active_workout_aw2a_execution_state_corrections.sql"),
    "b79920d0f9155b0c076d602b10924846409efdac54a485333242a03bbd5e5e18",
  );
});
