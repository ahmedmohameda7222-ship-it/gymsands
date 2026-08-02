import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ACTIVITY_CATALOG_PROJECT_REF,
  PLAIVRA_PROJECT_REF,
  PRODUCTION_AUTHORIZATION_CONTEXT,
  STAGE1_VALIDATION_CONTEXT,
  authorizeProductionPromotion,
  deriveReleaseReadyTarget,
  deriveReleaseTarget,
  productionAuthorizationToken,
  validateSupabaseProductionTarget,
} from "./release-identity-contract.mjs";

const root = new URL("../", import.meta.url);
const commit = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const base = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const runId = "987654";
const migration = "20260721012814";

function source(path) {
  return readFileSync(new URL(path, root), "utf8");
}

test("Stage-1 cannot authorize and exact Production token is identity bound", () => {
  assert.equal(authorizeProductionPromotion({
    context: STAGE1_VALIDATION_CONTEXT,
    token: "",
    reviewedCommit: commit,
    qualityRunId: runId,
    expectedMigration: migration,
  }), false);
  const exact = productionAuthorizationToken({ reviewedCommit: commit, qualityRunId: runId, expectedMigration: migration });
  assert.equal(authorizeProductionPromotion({
    context: PRODUCTION_AUTHORIZATION_CONTEXT,
    token: exact,
    reviewedCommit: commit,
    qualityRunId: runId,
    expectedMigration: migration,
  }), true);
  for (const token of ["yes", "production", exact.replace(commit, base), exact.replace(runId, "1"), exact.replace(migration, "20260721012815")]) {
    assert.throws(() => authorizeProductionPromotion({
      context: PRODUCTION_AUTHORIZATION_CONTEXT,
      token,
      reviewedCommit: commit,
      qualityRunId: runId,
      expectedMigration: migration,
    }), /exact release identity/);
  }
});

test("Plaivra direct and recognized pooler targets are accepted with redacted identity", () => {
  const direct = validateSupabaseProductionTarget(
    "postgresql://postgres:secret@db.bkwezjxvapaeasfvlhvv.supabase.co:5432/postgres?sslmode=require",
    PLAIVRA_PROJECT_REF,
  );
  assert.equal(direct.connectionKind, "supabase-direct");
  assert.equal(JSON.stringify(direct).includes("secret"), false);
  const pooler = validateSupabaseProductionTarget(
    "postgresql://postgres.bkwezjxvapaeasfvlhvv:secret@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require",
    PLAIVRA_PROJECT_REF,
  );
  assert.equal(pooler.connectionKind, "supabase-pooler");
});

test("Activity Catalog, other projects, generic hosts and localhost are rejected", () => {
  const rejected = [
    ["postgresql://postgres:secret@db.khlcctuefiuhunqymkbp.supabase.co/postgres?sslmode=require", PLAIVRA_PROJECT_REF],
    ["postgresql://postgres.khlcctuefiuhunqymkbp:secret@aws-0-eu.pooler.supabase.com/postgres?sslmode=require", PLAIVRA_PROJECT_REF],
    ["postgresql://postgres:secret@db.otherprojectref.supabase.co/postgres?sslmode=require", PLAIVRA_PROJECT_REF],
    ["postgresql://postgres:secret@example.com/postgres?sslmode=require", PLAIVRA_PROJECT_REF],
    ["postgresql://postgres:secret@localhost/postgres?sslmode=require", PLAIVRA_PROJECT_REF],
    ["postgresql://postgres:secret@db.bkwezjxvapaeasfvlhvv.supabase.co/postgres?sslmode=require", ACTIVITY_CATALOG_PROJECT_REF],
  ];
  for (const [url, projectRef] of rejected) {
    assert.throws(() => validateSupabaseProductionTarget(url, projectRef));
  }
});

test("synthetic pending ledgers remain reviewable but cannot become release-ready", () => {
  const current = JSON.parse(readFileSync(new URL("../supabase/migration-ledger.json", import.meta.url), "utf8"));
  const pending = structuredClone(current);
  const currentTarget = deriveReleaseTarget(current);
  const resolvedTarget = currentTarget.expectedMigration;
  const expectedPendingCount = currentTarget.pendingCount + 1;
  const futureVersion = (BigInt(currentTarget.latestAppliedMigrationVersion) + 1n)
    .toString()
    .padStart(currentTarget.latestAppliedMigrationVersion.length, "0");
  pending.entries.push({
    productionVersion: null,
    productionName: null,
    localFile: `${futureVersion}_synthetic_pending_release.sql`,
    state: "pending",
    note: "Synthetic forward-only migration pending application.",
  });
  pending.pendingCount = expectedPendingCount;
  pending.unresolvedCount = expectedPendingCount;
  pending.historyRepair = {
    ...pending.historyRepair,
    state: "pending",
    pendingCount: expectedPendingCount,
    unresolvedCount: expectedPendingCount,
    note: "Synthetic pending ledger fixture.",
  };

  const target = deriveReleaseTarget(pending);
  assert.equal(target.expectedMigration, resolvedTarget);
  assert.equal(target.reconciliationState, "pending");
  assert.equal(target.pendingCount, expectedPendingCount);
  assert.equal(target.releaseReady, false);
  assert.throws(() => deriveReleaseReadyTarget(pending), /not release-ready/);
});

test("future reconciled physical migrations do not silently promote the compatibility marker", () => {
  const current = JSON.parse(readFileSync(new URL("../supabase/migration-ledger.json", import.meta.url), "utf8"));
  const reconciled = structuredClone(current);
  reconciled.entries = reconciled.entries.filter((entry) => entry.state !== "pending");
  reconciled.pendingCount = 0;
  reconciled.unresolvedCount = 0;
  reconciled.historyRepair = {
    ...reconciled.historyRepair,
    state: "reconciled",
    pendingCount: 0,
    unresolvedCount: 0,
    note: "Synthetic future physical-head fixture with every migration resolved.",
  };
  const currentTarget = deriveReleaseTarget(reconciled);
  const futureVersion = (BigInt(currentTarget.latestAppliedMigrationVersion) + 1n)
    .toString()
    .padStart(currentTarget.latestAppliedMigrationVersion.length, "0");
  const future = structuredClone(reconciled);
  future.entries.push({
    productionVersion: futureVersion,
    productionName: "synthetic_future_release",
    localFile: `${futureVersion}_synthetic_future_release.sql`,
    state: "applied",
  });
  future.productionMigrationCount += 1;
  const futureTarget = deriveReleaseTarget(future);
  assert.equal(futureTarget.expectedMigration, currentTarget.expectedMigration);
  assert.equal(futureTarget.latestAppliedMigrationVersion, futureVersion);
});

test("generic workflow and evidence code derive release identity without a pinned AW-2A migration", () => {
  for (const path of [
    ".github/workflows/quality.yml",
    "scripts/quality-evidence-contract.mjs",
    "scripts/release-preflight.mjs",
  ]) {
    assert.equal(source(path).includes("20260721012814"), false, `${path} must derive the target`);
  }
  const quality = source(".github/workflows/quality.yml");
  assert.match(quality, /quality-ledger-target\.mjs/);
  assert.match(quality, /validation_request_id/);
  const qualityTarget = source("scripts/quality-ledger-target.mjs");
  assert.match(qualityTarget, /deriveReleaseTarget/);
  assert.match(qualityTarget, /latestAppliedMigrationVersion/);
  const releaseAuthority = source("scripts/release-identity-contract.mjs");
  assert.match(releaseAuthority, /resolveReleaseCompatibilityContract/);
  assert.match(releaseAuthority, /deriveReleaseTarget/);
  const preflight = source(".github/workflows/release-preflight.yml");
  assert.match(preflight, /type: choice[\s\S]*stage1-infrastructure-validation[\s\S]*production-marker-promotion-authorization/);
  assert.match(preflight, /comparison_base/);
  assert.match(preflight, /validation_request_id/);
  assert.match(preflight, /expected_migration/);
  const preflightScript = source("scripts/release-preflight.mjs");
  assert.match(preflightScript, /PRODUCTION_AUTHORIZATION_CONTEXT[\s\S]*deriveReleaseReadyTarget/);
});

test("same-head orchestration is exact, fail-closed, and diagnostically complete", () => {
  const workflow = source(".github/workflows/exact-release-quality-validation.yml");
  const orchestrator = source("scripts/exact-release-orchestrator.mjs");

  assert.match(workflow, /node scripts\/exact-release-orchestrator\.mjs/);
  assert.match(workflow, /actions: write/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /workflow_dispatch:[\s\S]*quality_run_id:/);
  assert.doesNotMatch(workflow, /^\s*pull_request:/m);
  assert.match(workflow, /Upload exact release diagnostics/);
  assert.doesNotMatch(workflow, /plaivra_aw2a_post_merge_release_closure_implementation_report\.md/);
  assert.doesNotMatch(workflow, /plaivra_aw2b_command_authority_implementation_report\.md/);
  assert.doesNotMatch(workflow, /issues:\s*write|pull-requests:\s*write|pull_request_target|contents:\s*write/);

  assert.match(orchestrator, /requiredEnv\("QUALITY_RUN_ID", RUN_ID\)/);
  assert.match(orchestrator, /displayTitle === expectedTitle/);
  assert.match(orchestrator, /failedStepSummary/);
  assert.match(orchestrator, /consecutiveApiFailures >= 12/);
  assert.match(orchestrator, /releasePreflightDispatched: false/);
  assert.match(orchestrator, /schemaVersion: 3/);
  assert.match(orchestrator, /qualityExecutionMode: "reused-canonical-run"/);
  assert.match(orchestrator, /qualityArtifactDigest/);
  assert.match(orchestrator, /qualityValidationRequestId/);
  assert.match(orchestrator, /canonicalArtifact: qualityArtifact/);
  assert.match(orchestrator, /preflightArtifact/);
  assert.match(orchestrator, /productionWritePerformed: false/);
  assert.match(orchestrator, /deploymentPerformed: false/);
  assert.doesNotMatch(orchestrator, /"workflow",\s*"run",\s*"quality\.yml"/);
  assert.doesNotMatch(orchestrator, /gh run watch|issues\//);
});

test("promotion target validation precedes adapter construction", () => {
  const sourceText = source("scripts/promote-release-schema-compatibility.mjs");
  assert.ok(sourceText.indexOf("validateSupabaseProductionTarget(databaseUrl") < sourceText.indexOf("adapter: productionAdapter(databaseUrl, targetIdentity)"));
  assert.match(sourceText, /databaseTarget = targetIdentity/);
});
