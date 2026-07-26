import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyQualityEvidence } from "./create-release-manifest.mjs";
import {
  EXPECTED_DATABASE_MIGRATION,
  EXPECTED_REPOSITORY,
  REQUIRED_QUALITY_GATES,
} from "./quality-evidence-contract.mjs";
import {
  selectCanonicalQualityArtifact,
  validateCanonicalQualityRun,
} from "./exact-release-orchestrator.mjs";
import { validateCanonicalQualityArtifact } from "./release-preflight.mjs";

const root = new URL("../", import.meta.url);
const reviewedCommit = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const comparisonBase = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const buildTimestamp = "2026-07-21T16:00:00.000Z";
const capturedAt = "2026-07-21T16:01:00.000Z";
const runId = "123456";
const validationRequest = "stage1-test-request-123";

function source(path) {
  return readFileSync(new URL(path, root), "utf8");
}

function manifestSkeleton() {
  return {
    release: {
      commitSha: reviewedCommit,
      buildTimestamp,
      environment: "ci",
      schemaCompatibilityVersion: "2",
      expectedDatabaseMigrationVersion: EXPECTED_DATABASE_MIGRATION,
      migrationLedgerReconciliationState: "reconciled",
      pendingMigrationCount: 0,
      schemaAppliedUntrackedCount: 0,
      unresolvedMigrationCount: 0,
    },
    runtime: { nextVersion: "16.2.10" },
    qualityGates: {},
    qualityArtifact: {},
    deployment: { status: "pending" },
    smoke: {
      anonymous: { status: "pending", evidence: null },
      authenticatedPopulated: { status: "pending", evidence: null },
      authenticatedEmpty: { status: "pending", evidence: null },
    },
  };
}

function createReports({ failedGate = null, staleGate = null } = {}) {
  const reportsPath = mkdtempSync(join(tmpdir(), "stage1-quality-artifact-"));
  for (const evidenceName of Object.values(REQUIRED_QUALITY_GATES)) {
    const exitCode = evidenceName === failedGate ? 7 : 0;
    const gateCapturedAt = evidenceName === staleGate ? "2026-07-21T15:59:59.000Z" : capturedAt;
    writeFileSync(join(reportsPath, `${evidenceName}.log`), `gate ${evidenceName}\n`, "utf8");
    writeFileSync(join(reportsPath, `${evidenceName}.exit`), `${exitCode}\n`, "utf8");
    writeFileSync(join(reportsPath, `${evidenceName}.meta.json`), `${JSON.stringify({
      schemaVersion: 1,
      name: evidenceName,
      commitSha: reviewedCommit,
      qualityBuildTimestamp: buildTimestamp,
      startedAt: buildTimestamp,
      capturedAt: gateCapturedAt,
      executable: "node",
      argumentCount: 0,
      exitCode,
      passed: exitCode === 0,
      spawnError: null,
    }, null, 2)}\n`, "utf8");
  }
  writeFileSync(join(reportsPath, "artifact-metadata.json"), `${JSON.stringify({
    schemaVersion: 1,
    repository: EXPECTED_REPOSITORY,
    workflowRunId: runId,
    workflowRunAttempt: "1",
    reviewedCommit,
    comparisonBase,
    validationRequestId: validationRequest,
    expectedDatabaseMigrationVersion: EXPECTED_DATABASE_MIGRATION,
    eventType: "pull_request",
    qualityBuildTimestamp: buildTimestamp,
    capturedAt,
    fullReleaseQuality: true,
  }, null, 2)}\n`, "utf8");
  writeFileSync(join(reportsPath, "database-validation.log"), "database validation\n", "utf8");
  writeFileSync(join(reportsPath, "unit-failure-parity.json"), `${JSON.stringify({
    headSha: reviewedCommit,
    baseSha: comparisonBase,
    introducedFailureIdentities: [],
    removedFailureIdentities: [],
    passed: true,
  }, null, 2)}\n`, "utf8");
  return reportsPath;
}

function migrationState(overrides = {}) {
  return {
    latestAppliedMigrationVersion: EXPECTED_DATABASE_MIGRATION,
    reconciliationState: "reconciled",
    pendingCount: 0,
    schemaAppliedUntrackedCount: 0,
    unresolvedCount: 0,
    releaseReady: true,
    ...overrides,
  };
}

function finalizeManifest(reportsPath, manifest = manifestSkeleton()) {
  applyQualityEvidence(manifest, reportsPath);
  writeFileSync(join(reportsPath, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

test("Quality workflow is the single canonical PR producer with all release gates", () => {
  const workflow = source(".github/workflows/quality.yml");
  assert.doesNotMatch(workflow, /workflow_dispatch:/);
  assert.match(workflow, /pull_request:[\s\S]*branches:[\s\S]*- main/);
  assert.match(workflow, /\^\[0-9a-fA-F\]\{40\}\$/);
  assert.match(workflow, /ref: \$\{\{ steps\.identity\.outputs\.reviewed_commit \}\}/);
  assert.match(workflow, /--base "\$PLAIVRA_COMPARISON_BASE"/);
  assert.doesNotMatch(workflow, /workflow_dispatch has no pull-request base SHA|Record workflow-dispatch parity skip/);
  for (const evidenceName of Object.values(REQUIRED_QUALITY_GATES)) {
    assert.match(workflow, new RegExp(`--name ${evidenceName.replaceAll("-", "\\-")}`));
  }
  assert.ok(workflow.indexOf("Generate authoritative release manifest last") > workflow.indexOf("Gate — rendered browser QA"));
  assert.match(workflow, /name: quality-reports-\$\{\{ github\.run_id \}\}/);
  assert.match(workflow, /quality-reports\/release-manifest\.json/);
  assert.match(workflow, /quality-reports\/unit-failure-parity\.json/);
  assert.match(workflow, /quality-reports\/database-validation\.log/);
  assert.match(workflow, /SUPABASE_TELEMETRY_DISABLED: "1"/);
  assert.match(workflow, /DO_NOT_TRACK: "1"/);
});

test("Release preflight workflow consumes the exact run-keyed artifact read-only", () => {
  const workflow = source(".github/workflows/release-preflight.yml");
  assert.match(workflow, /name: quality-reports-\$\{\{ inputs\.quality_run_id \}\}/);
  assert.match(workflow, /--quality-run-id "\$\{\{ inputs\.quality_run_id \}\}"/);
  assert.match(workflow, /productionMutationPerformed !== false/);
  assert.doesNotMatch(workflow, /deploy_to_vercel|apply_migration|supabase db push/i);
});

test("canonical artifact validation accepts exact matching evidence", () => {
  const reportsPath = createReports();
  try {
    finalizeManifest(reportsPath);
    const result = validateCanonicalQualityArtifact({
      reportsPath,
      expectedCommit: reviewedCommit,
      expectedRepository: EXPECTED_REPOSITORY,
      qualityRunId: runId,
      migrationState: migrationState(),
      now: Date.parse("2026-07-21T16:02:00.000Z"),
    });
    assert.equal(result.valid, true);
    assert.deepEqual(result.failures, []);
  } finally {
    rmSync(reportsPath, { recursive: true, force: true });
  }
});

test("failed or stale gate cannot generate a release-valid manifest", () => {
  for (const options of [{ failedGate: "lint" }, { staleGate: "unit" }]) {
    const reportsPath = createReports(options);
    try {
      assert.throws(() => applyQualityEvidence(manifestSkeleton(), reportsPath), /missing, failed, or stale evidence/);
    } finally {
      rmSync(reportsPath, { recursive: true, force: true });
    }
  }
});

test("preflight rejects wrong commit, base, run, missing evidence, nonzero exit and tampering", () => {
  const cases = [
    (reportsPath) => {
      const metadataPath = join(reportsPath, "artifact-metadata.json");
      const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
      metadata.reviewedCommit = comparisonBase;
      writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + "\n");
    },
    (reportsPath) => {
      const metadataPath = join(reportsPath, "artifact-metadata.json");
      const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
      metadata.comparisonBase = reviewedCommit;
      writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + "\n");
    },
    (reportsPath) => {
      const metadataPath = join(reportsPath, "artifact-metadata.json");
      const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
      metadata.workflowRunId = "999999";
      writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + "\n");
    },
    (reportsPath) => unlinkSync(join(reportsPath, "typecheck.log")),
    (reportsPath) => writeFileSync(join(reportsPath, "integration.exit"), "4\n"),
    (reportsPath) => writeFileSync(join(reportsPath, "lint.log"), "tampered\n"),
  ];
  for (const mutate of cases) {
    const reportsPath = createReports();
    try {
      finalizeManifest(reportsPath);
      mutate(reportsPath);
      const result = validateCanonicalQualityArtifact({
        reportsPath,
        expectedCommit: reviewedCommit,
        expectedRepository: EXPECTED_REPOSITORY,
        qualityRunId: runId,
        migrationState: migrationState(),
      });
      assert.equal(result.valid, false);
      assert.ok(result.failures.length > 0);
    } finally {
      rmSync(reportsPath, { recursive: true, force: true });
    }
  }
});

test("Exact Release accepts only the supplied successful canonical PR Quality run", () => {
  const canonicalRun = {
    id: Number(runId),
    name: `Quality / pr-87-${runId}-1-${reviewedCommit}`,
    workflow_id: 42,
    path: ".github/workflows/quality.yml",
    event: "pull_request",
    run_attempt: 1,
    head_sha: reviewedCommit,
    status: "completed",
    conclusion: "success",
    html_url: "https://github.example/runs/123456",
    repository: { full_name: EXPECTED_REPOSITORY },
  };
  const canonicalWorkflow = {
    id: 42,
    name: "Quality",
    path: ".github/workflows/quality.yml",
  };
  assert.equal(validateCanonicalQualityRun(canonicalRun, {
    qualityRunId: runId,
    reviewedCommit,
    workflow: canonicalWorkflow,
  }).event, "pull_request");

  for (const mutate of [
    (run) => { run.id = 999; },
    (run) => { run.repository.full_name = "other/repository"; },
    (run) => { run.workflow_id = 99; },
    (run, workflow) => { workflow.name = "Other"; },
    (run, workflow) => { workflow.path = ".github/workflows/other.yml"; },
    (run) => { run.path = ".github/workflows/other.yml"; },
    (run) => { run.event = "workflow_dispatch"; },
    (run) => { run.run_attempt = 2; },
    (run) => { run.head_sha = comparisonBase; },
    (run) => { run.status = "in_progress"; },
    (run) => { run.conclusion = "failure"; },
  ]) {
    const run = structuredClone(canonicalRun);
    const workflow = structuredClone(canonicalWorkflow);
    mutate(run, workflow);
    assert.throws(() => validateCanonicalQualityRun(run, {
      qualityRunId: runId,
      reviewedCommit,
      workflow,
    }));
  }
});

test("Exact Release accepts exactly one immutable run-keyed Quality artifact", () => {
  const canonicalArtifact = {
    id: 789,
    name: `quality-reports-${runId}`,
    expired: false,
    digest: `sha256:${"a".repeat(64)}`,
  };
  assert.equal(selectCanonicalQualityArtifact(
    { artifacts: [canonicalArtifact] },
    { qualityRunId: runId },
  ).id, "789");

  for (const artifacts of [
    [],
    [canonicalArtifact, { ...canonicalArtifact, id: 790 }],
    [{ ...canonicalArtifact, expired: true }],
    [{ ...canonicalArtifact, digest: null }],
    [{ ...canonicalArtifact, digest: "sha256:not-a-digest" }],
  ]) {
    assert.throws(() => selectCanonicalQualityArtifact({ artifacts }, { qualityRunId: runId }));
  }
});

test("preflight rejects an unexpected migration while accepting exact pending metadata", () => {
  const reportsPath = createReports();
  try {
    const manifest = finalizeManifest(reportsPath);
    manifest.release.expectedDatabaseMigrationVersion = "20260721012813";
    manifest.release.migrationLedgerReconciliationState = "pending";
    manifest.release.pendingMigrationCount = 1;
    manifest.release.unresolvedMigrationCount = 1;
    writeFileSync(join(reportsPath, "release-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    const result = validateCanonicalQualityArtifact({
      reportsPath,
      expectedCommit: reviewedCommit,
      expectedRepository: EXPECTED_REPOSITORY,
      qualityRunId: runId,
      migrationState: migrationState({
        reconciliationState: "pending",
        pendingCount: 1,
        unresolvedCount: 1,
        releaseReady: false,
      }),
    });
    assert.equal(result.valid, false);
    assert.ok(result.failures.includes("release_manifest_unexpected_migration"));
    assert.equal(result.failures.includes("release_manifest_reconciliation_state_mismatch"), false);
    assert.equal(result.failures.includes("release_manifest_pending_count_mismatch"), false);
    assert.equal(result.failures.includes("release_manifest_unresolved_count_mismatch"), false);
  } finally {
    rmSync(reportsPath, { recursive: true, force: true });
  }
});

test("exact release validation binds Quality and preflight to artifact-only evidence", () => {
  const workflow = source(".github/workflows/exact-release-quality-validation.yml");
  const orchestrator = source("scripts/exact-release-orchestrator.mjs");

  assert.match(workflow, /node scripts\/exact-release-orchestrator\.mjs/);
  assert.match(workflow, /Upload exact release validation summary/);
  assert.match(workflow, /Upload exact release diagnostics/);
  assert.match(workflow, /actions: write/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /workflow_dispatch:[\s\S]*reviewed_commit:[\s\S]*comparison_base:[\s\S]*quality_run_id:/);
  assert.doesNotMatch(workflow, /^\s*pull_request:/m);
  assert.match(workflow, /QUALITY_RUN_ID: \$\{\{ inputs\.quality_run_id \}\}/);
  assert.match(workflow, /test "\$\{DISPATCH_COMMIT,,\}" = "\$\{REVIEWED_COMMIT,,\}"/);
  assert.doesNotMatch(workflow, /pull_request_target|pull-requests:\s*write|issues:\s*write|contents:\s*write/);
  assert.doesNotMatch(workflow, /supabase db push|apply_migration|deploy_to_vercel/i);

  assert.match(orchestrator, /requiredEnv\("QUALITY_RUN_ID", RUN_ID\)/);
  assert.match(orchestrator, /validateCanonicalQualityRun/);
  assert.match(orchestrator, /validateCanonicalQualityArtifact/);
  assert.match(orchestrator, /validation_request_id=\$\{qualityValidationRequestId\}/);
  assert.match(orchestrator, /displayTitle === expectedTitle/);
  assert.match(orchestrator, /comparison_base=\$\{comparisonBase\}/);
  assert.match(orchestrator, /expected_migration=\$\{target\.expectedMigration\}/);
  assert.match(orchestrator, /validation_context=\$\{STAGE1_VALIDATION_CONTEXT\}/);
  assert.match(orchestrator, /stage1-exact-release-validation-\$\{reviewedCommit\}/);
  assert.match(orchestrator, /pre-application-exact-release-validation-\$\{reviewedCommit\}/);
  assert.match(orchestrator, /releasePreflightDispatched: false/);
  assert.match(orchestrator, /schemaVersion: 3/);
  assert.match(orchestrator, /preflightArtifact/);
  assert.match(orchestrator, /exactValidation:/);
  assert.match(orchestrator, /qualityExecutionMode: "reused-canonical-run"/);
  assert.match(orchestrator, /qualityValidationRequestId/);
  assert.match(orchestrator, /failedStepSummary/);
  assert.doesNotMatch(orchestrator, /"workflow",\s*"run",\s*"quality\.yml"/);
  assert.doesNotMatch(orchestrator, /gh run watch|issues\//);
  assert.doesNotMatch(orchestrator, /supabase db push|apply_migration|deploy_to_vercel/i);
});

test("Stage-1 preflight cannot authorize marker promotion", () => {
  const workflow = source(".github/workflows/release-preflight.yml");
  const promotion = source("scripts/promote-release-schema-compatibility.mjs");
  assert.match(workflow, /type: choice/);
  assert.match(workflow, /stage1-infrastructure-validation/);
  assert.match(workflow, /production-marker-promotion-authorization/);
  assert.match(workflow, /production_authorization_token/);
  assert.match(promotion, /requireProductionAuthorization: mode === "apply"/);
  assert.match(promotion, /explicit Production marker-promotion authorization evidence/);
});

test("promotion source is guarded and never targets Activity Catalog", () => {
  const promotion = source("scripts/promote-release-schema-compatibility.mjs");
  assert.match(promotion, /bkwezjxvapaeasfvlhvv/);
  assert.match(promotion, /Activity Catalog promotion is forbidden/);
  assert.match(promotion, /compare-and-set updated/);
  assert.match(promotion, /set migration_version = '\$\{targetMarker\}', applied_at = now\(\)/);
  assert.doesNotMatch(promotion, /set\s+version\s*=/i);
});
