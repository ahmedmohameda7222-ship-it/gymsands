import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  AW3C_VERSION,
  CORRECTION_AW2A_VERSION,
  MARKER_AFTER_AW3B_PROMOTION,
  MARKER_AFTER_BRIDGE,
  MARKER_BEFORE_BRIDGE,
  ORIGINAL_AW2A_VERSION,
  assertLocalOnly,
  nextSyntheticVersion,
  validateMigrationHistory,
} from "./replay-local-migration-chain.mjs";
import { REQUIRED_QUALITY_GATES } from "./quality-evidence-contract.mjs";

const quality = readFileSync(".github/workflows/quality.yml", "utf8").replaceAll("\r\n", "\n");
const prQuality = readFileSync(".github/workflows/pr-quality.yml", "utf8").replaceAll("\r\n", "\n");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const integrationRunner = readFileSync("scripts/run-integration-tests.mjs", "utf8").replaceAll("\r\n", "\n");
const helper = [
  readFileSync("scripts/replay-local-migration-chain.mjs", "utf8"),
  readFileSync("scripts/replay-local-migration-chain-legacy.mjs", "utf8")
].join("\n").replaceAll("\r\n", "\n");
const databaseVerification = readFileSync("scripts/run-database-verification.mjs", "utf8").replaceAll("\r\n", "\n");
const parity = readFileSync("scripts/check-unit-failure-parity.mjs", "utf8").replaceAll("\r\n", "\n");
const aw2bSqlIntegration = readFileSync(
  "services/database/workout-session-execution-sql.integration.test.ts",
  "utf8",
).replaceAll("\r\n", "\n");

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

test("phase-close Quality delegates chronological replay to the permanent helper", () => {
  assert.match(quality, /--name full-migration-chain[\s\S]*-- node scripts\/replay-local-migration-chain\.mjs[\s\S]*--log quality-reports\/database-validation\.log[\s\S]*--prove-future-order/);
  assert.match(helper, /\["db", "reset", "--local", "--no-seed", "--version", ORIGINAL_AW2A_VERSION\]/);
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

test("AW-3C replay reproduces the released AW-3B marker before the pending migration", () => {
  assert.match(helper, new RegExp(AW3C_VERSION));
  assert.match(helper, new RegExp(MARKER_AFTER_AW3B_PROMOTION));
  assert.match(helper, /aw3cReleasedContext/);
  assert.match(helper, /setMarker\(repositoryRoot, logPath, MARKER_AFTER_AW3B_PROMOTION\)/);
});

test("canonical full Quality is PR-bound and runs only at ready-for-review phase closure", () => {
  assert.doesNotMatch(quality, /workflow_dispatch:/);
  assert.match(quality, /pull_request:[\s\S]*branches:[\s\S]*- main[\s\S]*types:[\s\S]*- ready_for_review/);
  assert.doesNotMatch(quality, /^\s*- (?:opened|reopened|synchronize|labeled)\s*$/m);
  assert.doesNotMatch(quality, /contains\(github\.event\.pull_request\.labels/);
  assert.match(quality, /PR_HEAD_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.match(quality, /PR_BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.match(quality, /--base "\$PLAIVRA_COMPARISON_BASE"/);
  assert.match(quality, /group: quality-pr-\$\{\{ github\.event\.pull_request\.number \}\}/);
  assert.match(quality, /cancel-in-progress: true/);
  assert.match(quality, /SUPABASE_TELEMETRY_DISABLED: "1"/);
  assert.match(quality, /DO_NOT_TRACK: "1"/);
});

test("automatic PR Quality is path-scoped, parallel and fail-safe", () => {
  assert.match(prQuality, /name: PR Quality/);
  assert.match(prQuality, /node scripts\/ci-change-scope\.mjs/);
  for (const job of ["integrity", "core", "database", "ui-and-i18n", "ci-contracts", "build", "dependency-audit", "required-summary"]) {
    assert.match(prQuality, new RegExp(`name: ${job.replaceAll("-", "\\-")}`));
  }
  assert.match(prQuality, /group: pr-quality-\$\{\{ github\.event\.pull_request\.number \}\}/);
  assert.match(prQuality, /cancel-in-progress: true/);
  assert.match(prQuality, /node scripts\/run-ci-check\.mjs/);
  assert.match(prQuality, /if: always\(\)/);
  assert.match(prQuality, /value\.result === "failure" \|\| value\.result === "cancelled"/);
});

test("integration validation isolates legacy fixtures and exports both database authorities", () => {
  assert.equal(packageJson.scripts["test:integration"], "node scripts/run-integration-tests.mjs");
  assert.match(integrationRunner, /postgres:15-alpine/);
  assert.match(integrationRunner, /"run"[\s\S]*"--detach"[\s\S]*POSTGRES_DB=/);
  assert.match(integrationRunner, /docker\(\["port", containerName, "5432\/tcp"\]\)/);
  assert.match(integrationRunner, /pg_isready/);
  assert.match(integrationRunner, /runVitest\(disposable\.databaseUrl, config\.aw2aDatabaseUrl\)/);
  assert.match(integrationRunner, /DATABASE_URL: databaseUrl/);
  assert.match(integrationRunner, /PLAIVRA_AW2A_TEST_DATABASE_URL: aw2aDatabaseUrl/);
  assert.match(integrationRunner, /dockerBestEffort\(\["inspect", "--format", "\{\{json \.State\}\}", containerName\]\)/);
  assert.match(integrationRunner, /dockerBestEffort\(\["logs", "--timestamps", containerName\]\)/);
  assert.match(integrationRunner, /isRetryableContainerState\(diagnostics\.inspect\.state\)/);
  assert.match(quality, /npm run test:integration/);
  assert.match(prQuality, /npm run test:integration/);
});

test("permanent validation names are generic and every release gate is retained", () => {
  for (const evidenceName of Object.values(REQUIRED_QUALITY_GATES)) {
    assert.match(quality, new RegExp(`--name ${evidenceName.replaceAll("-", "\\-")}`));
    assert.match(quality, new RegExp(`quality-reports/\\$\\{evidence\\}\\.log|quality-reports/${evidenceName.replaceAll("-", "\\-")}\\.log`));
  }
  assert.match(quality, /name: quality-reports-\$\{\{ github\.run_id \}\}/);
  assert.match(quality, /quality-reports\/database-validation\.log/);
  assert.match(quality, /quality-reports\/unit-failure-parity\.json/);
  assert.doesNotMatch(quality, /aw2a-database-validation|aw2a-unit-failure-parity|aw2a-validation-/);
  assert.doesNotMatch(parity, /aw2a-/i);
  assert.match(quality, /node scripts\/run-database-verification\.mjs/);
  assert.match(databaseVerification, /active-workout-aw2a-execution-state\.sql/);
  assert.match(databaseVerification, /active-workout-aw4-session-engine\.sql/);
  assert.match(quality, /npm run test:integration/);
});

test("Quality executes the permanent AW-2B schema and command integration SQL", () => {
  assert.match(aw2bSqlIntegration, /PLAIVRA_AW2A_TEST_DATABASE_URL/);
  assert.match(aw2bSqlIntegration, /active-workout-aw2b-command-authority\.sql/);
  assert.match(aw2bSqlIntegration, /active-workout-aw2b-integration\.sql/);
  assert.match(aw2bSqlIntegration, /execFileSync\([\s\S]*"psql"/);
  assert.match(aw2bSqlIntegration, /ON_ERROR_STOP=1/);
  assert.match(aw2bSqlIntegration, /describe\.skipIf\(!databaseUrl\)/);
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
