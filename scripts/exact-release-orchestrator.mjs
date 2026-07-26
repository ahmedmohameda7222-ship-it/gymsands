import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { deriveMigrationLedgerState } from "./check-migration-ledger.mjs";
import { numericRunId, validationRequestId } from "./quality-evidence-contract.mjs";
import { validateCanonicalQualityArtifact } from "./release-preflight.mjs";
import { deriveReleaseTarget, STAGE1_VALIDATION_CONTEXT } from "./release-identity-contract.mjs";

const SHA = /^[0-9a-f]{40}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{7,127}$/i;
const RUN_ID = /^\d+$/;
const REPOSITORY = "ahmedmohameda7222-ship-it/gymsands";
const DIAGNOSTICS_DIR = resolve("exact-release-diagnostics");
const OUTPUT_DIR = resolve("exact-release-output");
const QUALITY_DIR = resolve("exact-quality");
const PREFLIGHT_DIR = resolve("exact-preflight");

function requiredEnv(name, pattern) {
  const value = String(process.env[name] ?? "").trim();
  if (!value || (pattern && !pattern.test(value))) {
    throw new Error(`${name} is missing or invalid.`);
  }
  return value;
}

function command(commandName, args, { allowFailure = false, environment = {}, quiet = false } = {}) {
  const result = spawnSync(commandName, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...environment },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (!quiet && result.stdout) process.stdout.write(result.stdout);
  if (!quiet && result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    const error = new Error(`${commandName} ${args.join(" ")} failed with exit code ${result.status}.`);
    error.stdout = result.stdout;
    error.stderr = result.stderr;
    error.exitCode = result.status;
    throw error;
  }
  return result;
}

function commandText(commandName, args, options = {}) {
  const result = command(commandName, args, { ...options, quiet: true });
  return String(result.stdout ?? "").trim();
}

function commandJson(commandName, args, options = {}) {
  const text = commandText(commandName, args, options);
  return text ? JSON.parse(text) : null;
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeOutput(name, value) {
  const output = requiredEnv("GITHUB_OUTPUT");
  writeFileSync(output, `${name}=${value}\n`, { encoding: "utf8", flag: "a" });
}

export function validateCanonicalQualityRun(run, {
  qualityRunId,
  reviewedCommit,
  repository = REPOSITORY,
} = {}) {
  const expectedRunId = numericRunId(qualityRunId, "Quality run ID");
  const expectedCommit = String(reviewedCommit ?? "").trim().toLowerCase();
  if (!SHA.test(expectedCommit)) throw new Error("Reviewed commit is missing or invalid.");
  if (String(run?.id ?? "") !== expectedRunId) throw new Error("Canonical Quality run ID mismatch.");
  if (run?.repository?.full_name !== repository) throw new Error("Canonical Quality repository mismatch.");
  if (run?.name !== "Quality" || run?.path !== ".github/workflows/quality.yml") {
    throw new Error("Supplied run is not the canonical Quality workflow.");
  }
  if (run?.event !== "pull_request") throw new Error("Canonical Quality run must be PR-triggered.");
  if (Number(run?.run_attempt) !== 1) throw new Error("Canonical Quality run must be the first execution attempt.");
  if (run?.head_sha !== expectedCommit) throw new Error("Canonical Quality head SHA mismatch.");
  if (run?.status !== "completed" || run?.conclusion !== "success") {
    throw new Error("Canonical Quality run is not completed successfully.");
  }
  return {
    id: expectedRunId,
    status: run.status,
    conclusion: run.conclusion,
    event: run.event,
    runAttempt: String(run.run_attempt),
    headSha: run.head_sha,
    url: run.html_url,
  };
}

export function selectCanonicalQualityArtifact(response, {
  qualityRunId,
  expectedName = `quality-reports-${qualityRunId}`,
} = {}) {
  const runId = numericRunId(qualityRunId, "Quality run ID");
  const matches = (response?.artifacts ?? []).filter((artifact) => artifact.name === expectedName);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${expectedName} artifact for run ${runId}; found ${matches.length}.`);
  }
  const artifact = matches[0];
  if (artifact.expired === true) throw new Error(`${expectedName} artifact is expired.`);
  if (!/^sha256:[0-9a-f]{64}$/i.test(String(artifact.digest ?? ""))) {
    throw new Error(`${expectedName} artifact has no canonical SHA-256 digest.`);
  }
  if (!RUN_ID.test(String(artifact.id ?? ""))) throw new Error(`${expectedName} artifact ID is invalid.`);
  return {
    id: String(artifact.id),
    name: artifact.name,
    digest: artifact.digest.toLowerCase(),
  };
}

function artifactFor(runId, expectedName) {
  const response = commandJson("gh", [
    "api",
    `repos/${REPOSITORY}/actions/runs/${runId}/artifacts`,
  ]);
  return selectCanonicalQualityArtifact(response, { qualityRunId: runId, expectedName });
}

async function findRun({ workflow, branch, expectedTitle, reviewedCommit }) {
  for (let attempt = 1; attempt <= 120; attempt += 1) {
    const runs = commandJson("gh", [
      "run",
      "list",
      "--repo",
      REPOSITORY,
      "--workflow",
      workflow,
      "--branch",
      branch,
      "--event",
      "workflow_dispatch",
      "--limit",
      "100",
      "--json",
      "databaseId,headSha,displayTitle,status,conclusion,url,createdAt",
    ], { allowFailure: true }) ?? [];
    const matches = runs.filter(
      (run) => run.headSha === reviewedCommit && run.displayTitle === expectedTitle,
    );
    if (matches.length === 1 && RUN_ID.test(String(matches[0].databaseId))) {
      return matches[0];
    }
    if (matches.length > 1) {
      throw new Error(`Found multiple workflow runs for exact request ${expectedTitle}.`);
    }
    await sleep(2000);
  }
  throw new Error(`Timed out locating workflow run ${expectedTitle}.`);
}

function failedStepSummary(run) {
  const failures = [];
  for (const job of run?.jobs ?? []) {
    if (job.conclusion && job.conclusion !== "success" && job.conclusion !== "skipped") {
      failures.push({ job: job.name, conclusion: job.conclusion });
    }
    for (const step of job.steps ?? []) {
      if (step.conclusion && step.conclusion !== "success" && step.conclusion !== "skipped") {
        failures.push({ job: job.name, step: step.name, conclusion: step.conclusion });
      }
    }
  }
  return failures;
}

function collectRunDiagnostics({ label, runId, run, failureArtifactName }) {
  mkdirSync(DIAGNOSTICS_DIR, { recursive: true });
  writeJson(resolve(DIAGNOSTICS_DIR, `${label}-run.json`), run);
  const artifacts = commandJson("gh", [
    "api",
    `repos/${REPOSITORY}/actions/runs/${runId}/artifacts`,
  ], { allowFailure: true }) ?? { artifacts: [] };
  writeJson(resolve(DIAGNOSTICS_DIR, `${label}-artifacts.json`), artifacts);
  writeJson(resolve(DIAGNOSTICS_DIR, `${label}-failed-steps.json`), failedStepSummary(run));

  if (failureArtifactName && (artifacts.artifacts ?? []).some((artifact) => artifact.name === failureArtifactName)) {
    const destination = resolve(DIAGNOSTICS_DIR, failureArtifactName);
    mkdirSync(destination, { recursive: true });
    command("gh", [
      "run",
      "download",
      String(runId),
      "--repo",
      REPOSITORY,
      "--name",
      failureArtifactName,
      "--dir",
      destination,
    ], { allowFailure: true });
  }
}

async function waitForRun({ label, runId, maxPolls, failureArtifactName }) {
  let consecutiveApiFailures = 0;
  let lastRun = null;
  for (let poll = 1; poll <= maxPolls; poll += 1) {
    const result = command("gh", [
      "run",
      "view",
      String(runId),
      "--repo",
      REPOSITORY,
      "--json",
      "databaseId,displayTitle,headSha,status,conclusion,url,createdAt,updatedAt,jobs",
    ], { allowFailure: true, quiet: true });

    if (result.status !== 0) {
      consecutiveApiFailures += 1;
      mkdirSync(DIAGNOSTICS_DIR, { recursive: true });
      writeJson(resolve(DIAGNOSTICS_DIR, `${label}-poll-error.json`), {
        poll,
        consecutiveApiFailures,
        stderr: result.stderr,
        stdout: result.stdout,
      });
      if (consecutiveApiFailures >= 12) {
        throw new Error(`GitHub API polling failed 12 consecutive times for ${label} run ${runId}.`);
      }
      await sleep(10000);
      continue;
    }

    consecutiveApiFailures = 0;
    lastRun = JSON.parse(result.stdout);
    mkdirSync(DIAGNOSTICS_DIR, { recursive: true });
    writeJson(resolve(DIAGNOSTICS_DIR, `${label}-run.json`), lastRun);

    if (lastRun.status === "completed") {
      if (lastRun.conclusion === "success") return lastRun;
      collectRunDiagnostics({ label, runId, run: lastRun, failureArtifactName });
      const failures = failedStepSummary(lastRun);
      throw new Error(
        `${label} run ${runId} concluded ${lastRun.conclusion}. Failed steps: ${JSON.stringify(failures)}`,
      );
    }
    await sleep(10000);
  }

  collectRunDiagnostics({ label, runId, run: lastRun, failureArtifactName });
  throw new Error(`${label} run ${runId} exceeded the orchestration polling limit.`);
}

function verifyQualityArtifact({
  runId,
  reviewedCommit,
  comparisonBase,
  expectedMigration,
  migrationState,
}) {
  const run = commandJson("gh", [
    "api",
    `repos/${REPOSITORY}/actions/runs/${runId}`,
  ]);
  const canonicalRun = validateCanonicalQualityRun(run, {
    qualityRunId: runId,
    reviewedCommit,
  });
  const artifact = artifactFor(runId, `quality-reports-${runId}`);

  rmSync(QUALITY_DIR, { recursive: true, force: true });
  mkdirSync(QUALITY_DIR, { recursive: true });
  command("gh", [
    "run",
    "download",
    String(runId),
    "--repo",
    REPOSITORY,
    "--name",
    `quality-reports-${runId}`,
    "--dir",
    QUALITY_DIR,
  ]);

  const metadata = JSON.parse(readFileSync(resolve(QUALITY_DIR, "artifact-metadata.json"), "utf8"));
  const qualityValidationRequestId = validationRequestId(metadata.validationRequestId);
  const validation = validateCanonicalQualityArtifact({
    reportsPath: QUALITY_DIR,
    expectedCommit: reviewedCommit,
    expectedRepository: REPOSITORY,
    qualityRunId: runId,
    migrationState,
    expectedComparisonBase: comparisonBase,
    expectedValidationRequestId: qualityValidationRequestId,
    expectedMigration,
  });
  if (!validation.valid) {
    throw new Error(`Canonical Quality artifact validation failed: ${validation.failures.join(", ")}.`);
  }
  return { artifact, canonicalRun, qualityValidationRequestId };
}

function verifyPreflightArtifact({
  runId,
  artifactName,
  reviewedCommit,
  comparisonBase,
  qualityRunId,
  validationRequestId,
  preflightRequestId,
  expectedMigration,
}) {
  rmSync(PREFLIGHT_DIR, { recursive: true, force: true });
  mkdirSync(PREFLIGHT_DIR, { recursive: true });
  command("gh", [
    "run",
    "download",
    String(runId),
    "--repo",
    REPOSITORY,
    "--name",
    artifactName,
    "--dir",
    PREFLIGHT_DIR,
  ]);

  const evidence = JSON.parse(readFileSync(resolve(PREFLIGHT_DIR, "release-preflight.json"), "utf8"));
  const expected = {
    expectedCommit: reviewedCommit,
    comparisonBase,
    qualityRunId: String(qualityRunId),
    validationRequestId,
    preflightRequestId,
    expectedDatabaseMigrationVersion: expectedMigration,
    validationContext: STAGE1_VALIDATION_CONTEXT,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (String(evidence[key]) !== value) throw new Error(`Preflight ${key} mismatch.`);
  }
  if (evidence.ready !== true || evidence.qualityArtifactValid !== true) throw new Error("Preflight not ready.");
  if (evidence.productionPromotionAuthorized !== false) throw new Error("Stage-1 preflight authorized promotion.");
  if (evidence.productionMutationPerformed !== false || evidence.deploymentPerformed !== false) {
    throw new Error("Stage-1 preflight was not read-only.");
  }
  return artifactFor(runId, artifactName);
}

function writeFinalEvidence({
  target,
  reviewedCommit,
  comparisonBase,
  qualityValidationRequestId,
  preflightRequestId,
  qualityRunId,
  canonicalQualityRun,
  qualityArtifact,
  preflightRunId,
  preflightArtifact,
  exactRunId,
  exactRunAttempt,
}) {
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const releaseReady = target.releaseReady === true;
  const artifactName = releaseReady
    ? `stage1-exact-release-validation-${reviewedCommit}`
    : `pre-application-exact-release-validation-${reviewedCommit}`;

  let evidence;
  if (releaseReady) {
    evidence = {
      schemaVersion: 3,
      repository: REPOSITORY,
      reviewedCommit,
      comparisonBase,
      qualityExecutionMode: "reused-canonical-run",
      qualityRunId: String(qualityRunId),
      qualityArtifactId: qualityArtifact.id,
      qualityArtifactName: qualityArtifact.name,
      qualityArtifactDigest: qualityArtifact.digest,
      qualityValidationRequestId,
      preflightRequestId,
      expectedDatabaseMigrationVersion: target.expectedMigration,
      canonicalQualityRun,
      canonicalArtifact: qualityArtifact,
      releasePreflight: {
        runId: String(preflightRunId),
        status: "success",
        context: STAGE1_VALIDATION_CONTEXT,
        productionAuthorization: false,
      },
      preflightArtifact,
      exactValidation: {
        runId: String(exactRunId),
        runAttempt: String(exactRunAttempt),
        status: "success",
        artifactName,
      },
      productionWritePerformed: false,
      deploymentPerformed: false,
    };
  } else {
    if (target.pendingCount < 1) throw new Error("Pre-application validation requires pending migrations.");
    if (target.schemaAppliedUntrackedCount !== 0 || target.unresolvedCount !== target.pendingCount) {
      throw new Error("Pre-application migration ledger state is unsafe.");
    }
    evidence = {
      schemaVersion: 1,
      validationMode: "pre-application",
      repository: REPOSITORY,
      reviewedCommit,
      comparisonBase,
      qualityExecutionMode: "reused-canonical-run",
      qualityRunId: String(qualityRunId),
      qualityArtifactId: qualityArtifact.id,
      qualityArtifactName: qualityArtifact.name,
      qualityArtifactDigest: qualityArtifact.digest,
      qualityValidationRequestId,
      expectedDatabaseMigrationVersion: target.expectedMigration,
      ledger: {
        pendingCount: target.pendingCount,
        schemaAppliedUntrackedCount: target.schemaAppliedUntrackedCount,
        unresolvedCount: target.unresolvedCount,
        releaseReady: false,
      },
      canonicalQualityRun,
      canonicalArtifact: qualityArtifact,
      exactValidation: {
        runId: String(exactRunId),
        runAttempt: String(exactRunAttempt),
        status: "success",
        artifactName,
      },
      releasePreflightDispatched: false,
      productionAuthorization: false,
      productionWritePerformed: false,
      deploymentPerformed: false,
    };
  }

  const artifactPath = resolve(OUTPUT_DIR, "exact-release-validation.json");
  writeJson(artifactPath, evidence);
  writeOutput("artifact_name", artifactName);
  writeOutput("artifact_path", artifactPath);
  writeOutput("quality_run_id", String(qualityRunId));
  if (preflightRunId) writeOutput("preflight_run_id", String(preflightRunId));
}

async function main() {
  rmSync(DIAGNOSTICS_DIR, { recursive: true, force: true });
  mkdirSync(DIAGNOSTICS_DIR, { recursive: true });

  const repository = requiredEnv("GITHUB_REPOSITORY");
  if (repository !== REPOSITORY) throw new Error("Unexpected repository identity.");
  const reviewedCommit = requiredEnv("REVIEWED_COMMIT", SHA).toLowerCase();
  const comparisonBase = requiredEnv("COMPARISON_BASE", SHA).toLowerCase();
  const qualityRunId = requiredEnv("QUALITY_RUN_ID", RUN_ID);
  const headRef = requiredEnv("HEAD_REF");
  const exactRunId = requiredEnv("GITHUB_RUN_ID", RUN_ID);
  const exactRunAttempt = requiredEnv("GITHUB_RUN_ATTEMPT", RUN_ID);
  if (commandText("git", ["rev-parse", "HEAD"]) !== reviewedCommit) {
    throw new Error("Exact Release checkout identity mismatch.");
  }

  const ledger = JSON.parse(readFileSync("supabase/migration-ledger.json", "utf8"));
  const target = deriveReleaseTarget(ledger);
  const migrationState = deriveMigrationLedgerState(ledger);
  const preflightRequestId = `stage1-p-${exactRunId}-${exactRunAttempt}-${reviewedCommit}`;
  if (!SAFE_ID.test(preflightRequestId)) {
    throw new Error("Generated orchestration request identity is invalid.");
  }

  writeJson(resolve(DIAGNOSTICS_DIR, "orchestration-identity.json"), {
    repository,
    reviewedCommit,
    comparisonBase,
    headRef,
    exactRunId,
    exactRunAttempt,
    qualityRunId,
    preflightRequestId,
    target,
  });

  writeOutput("quality_run_id", qualityRunId);
  const qualityEvidence = verifyQualityArtifact({
    runId: qualityRunId,
    reviewedCommit,
    comparisonBase,
    expectedMigration: target.expectedMigration,
    migrationState,
  });
  const {
    artifact: qualityArtifact,
    canonicalRun: canonicalQualityRun,
    qualityValidationRequestId,
  } = qualityEvidence;
  writeJson(resolve(DIAGNOSTICS_DIR, "orchestration-identity.json"), {
    repository,
    reviewedCommit,
    comparisonBase,
    headRef,
    exactRunId,
    exactRunAttempt,
    qualityRunId,
    qualityValidationRequestId,
    preflightRequestId,
    target,
  });

  let preflightRunId = null;
  let preflightArtifact = null;
  if (target.releaseReady === true) {
    command("gh", [
      "workflow",
      "run",
      "release-preflight.yml",
      "--repo",
      REPOSITORY,
      "--ref",
      headRef,
      "-f",
      `reviewed_commit=${reviewedCommit}`,
      "-f",
      `comparison_base=${comparisonBase}`,
      "-f",
      `quality_run_id=${qualityRunId}`,
      "-f",
      `validation_request_id=${qualityValidationRequestId}`,
      "-f",
      `preflight_request_id=${preflightRequestId}`,
      "-f",
      `expected_migration=${target.expectedMigration}`,
      "-f",
      `validation_context=${STAGE1_VALIDATION_CONTEXT}`,
    ]);

    const preflightRun = await findRun({
      workflow: "release-preflight.yml",
      branch: headRef,
      expectedTitle: `Release preflight / ${preflightRequestId}`,
      reviewedCommit,
    });
    preflightRunId = String(preflightRun.databaseId);
    writeOutput("preflight_run_id", preflightRunId);
    await waitForRun({
      label: "preflight",
      runId: preflightRunId,
      maxPolls: 240,
      failureArtifactName: `release-preflight-${preflightRequestId}`,
    });
    const preflightArtifactName = `release-preflight-${preflightRequestId}`;
    preflightArtifact = verifyPreflightArtifact({
      runId: preflightRunId,
      artifactName: preflightArtifactName,
      reviewedCommit,
      comparisonBase,
      qualityRunId,
      validationRequestId: qualityValidationRequestId,
      preflightRequestId,
      expectedMigration: target.expectedMigration,
    });
  }

  writeFinalEvidence({
    target,
    reviewedCommit,
    comparisonBase,
    qualityValidationRequestId,
    preflightRequestId,
    qualityRunId,
    canonicalQualityRun,
    qualityArtifact,
    preflightRunId,
    preflightArtifact,
    exactRunId,
    exactRunAttempt,
  });

  rmSync(DIAGNOSTICS_DIR, { recursive: true, force: true });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    mkdirSync(DIAGNOSTICS_DIR, { recursive: true });
    writeJson(resolve(DIAGNOSTICS_DIR, "orchestrator-failure.json"), {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
      timestamp: new Date().toISOString(),
    });
    console.error(error);
    process.exitCode = 1;
  });
}
