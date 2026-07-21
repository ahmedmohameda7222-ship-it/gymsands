import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";
import { deriveMigrationLedgerState } from "./check-migration-ledger.mjs";
import {
  EXPECTED_REPOSITORY,
  REQUIRED_CANONICAL_FILES,
  REQUIRED_QUALITY_GATES,
  exactCommit,
  exactTimestamp,
  numericRunId,
  safeRelativePath,
  sha256File,
} from "./quality-evidence-contract.mjs";
import {
  PRODUCTION_AUTHORIZATION_CONTEXT,
  STAGE1_VALIDATION_CONTEXT,
  authorizeProductionPromotion,
  deriveReleaseTarget,
  expectedMigrationVersion,
  validationContext,
  validationRequestId,
} from "./release-identity-contract.mjs";
import { installedNextVersion as readInstalledNextVersion } from "./release-runtime-versions.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PREFLIGHT_MODES = new Set(["release", "review"]);

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    options[key] = value;
    index += 1;
  }
  return options;
}

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function safeRepository(value) {
  const normalized = value?.trim();
  if (!normalized || !/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(normalized)) {
    throw new Error("Repository must use owner/name form.");
  }
  return normalized;
}

function readJson(path, label = path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function normalizePreflightMode(value) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || !PREFLIGHT_MODES.has(normalized)) {
    throw new Error(`Preflight mode must be one of: ${[...PREFLIGHT_MODES].join(", ")}.`);
  }
  return normalized;
}

export function resolvePreflightMode(value) {
  return normalizePreflightMode(value?.trim() ? value : "release");
}

function unique(values) {
  return [...new Set(values)];
}

function reviewMigrationFailures(migrationState) {
  const failures = [];
  if (migrationState.releaseReady) {
    if (
      migrationState.reconciliationState !== "reconciled"
      || migrationState.pendingCount !== 0
      || migrationState.schemaAppliedUntrackedCount !== 0
      || migrationState.unresolvedCount !== 0
    ) failures.push("migration_ledger_inconsistent");
    return failures;
  }
  if (migrationState.reconciliationState !== "pending") failures.push("migration_ledger_not_reviewable");
  if (!Number.isInteger(migrationState.pendingCount) || migrationState.pendingCount <= 0) {
    failures.push("migration_pending_count_invalid");
  }
  if (migrationState.schemaAppliedUntrackedCount !== 0) failures.push("migration_schema_applied_untracked");
  if (migrationState.unresolvedCount !== migrationState.pendingCount) failures.push("migration_unresolved_count_mismatch");
  return failures;
}

function requiredFile(reportsPath, relativePath, failures, code) {
  let safePath;
  try {
    safePath = safeRelativePath(relativePath);
  } catch {
    failures.push(`${code}_path_invalid`);
    return null;
  }
  const absolutePath = resolve(reportsPath, safePath);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    failures.push(`${code}_missing`);
    return null;
  }
  return { safePath, absolutePath };
}

export function validateCanonicalQualityArtifact({
  reportsPath,
  expectedCommit,
  expectedRepository,
  qualityRunId,
  migrationState,
  expectedComparisonBase,
  expectedValidationRequestId,
  expectedMigration,
  now = Date.now(),
}) {
  const failures = [];
  const expectedSha = exactCommit(expectedCommit, "Reviewed commit");
  const expectedRepo = safeRepository(expectedRepository);
  const expectedRun = numericRunId(qualityRunId);
  const expectedTarget = expectedMigrationVersion(
    expectedMigration || migrationState.latestAppliedMigrationVersion,
  );
  const manifestFile = requiredFile(reportsPath, "release-manifest.json", failures, "release_manifest");
  const metadataFile = requiredFile(reportsPath, "artifact-metadata.json", failures, "artifact_metadata");
  const indexFile = requiredFile(reportsPath, "evidence-index.json", failures, "evidence_index");
  if (!manifestFile || !metadataFile || !indexFile) return { valid: false, failures: unique(failures) };

  const manifest = readJson(manifestFile.absolutePath, "release manifest");
  const metadata = readJson(metadataFile.absolutePath, "artifact metadata");
  const index = readJson(indexFile.absolutePath, "evidence index");
  const expectedBase = exactCommit(expectedComparisonBase || metadata.comparisonBase, "Expected comparison base");
  const expectedRequest = validationRequestId(
    expectedValidationRequestId || metadata.validationRequestId || "legacy-test-request",
  );

  if (manifest.release?.commitSha !== expectedSha) failures.push("release_manifest_commit_mismatch");
  if (manifest.release?.environment !== "ci") failures.push("release_manifest_environment_mismatch");
  if (String(manifest.release?.schemaCompatibilityVersion ?? "") !== "2") {
    failures.push("release_manifest_schema_compatibility_mismatch");
  }
  if (manifest.release?.expectedDatabaseMigrationVersion !== expectedTarget) {
    failures.push("release_manifest_unexpected_migration");
  }
  if (expectedTarget !== migrationState.latestAppliedMigrationVersion) {
    failures.push("expected_migration_ledger_mismatch");
  }
  if (manifest.release?.migrationLedgerReconciliationState !== "reconciled") {
    failures.push("release_manifest_unreconciled");
  }
  if (manifest.release?.pendingMigrationCount !== 0) failures.push("release_manifest_pending_count_mismatch");
  if (manifest.release?.schemaAppliedUntrackedCount !== 0) failures.push("release_manifest_untracked_count_mismatch");
  if (manifest.release?.unresolvedMigrationCount !== 0) failures.push("release_manifest_unresolved_count_mismatch");

  const metadataRun = String(metadata.workflowRunId ?? "");
  if (metadata.repository !== expectedRepo) failures.push("artifact_repository_mismatch");
  if (metadata.fullReleaseQuality !== true) failures.push("artifact_not_full_release_quality");
  if (metadataRun !== expectedRun) failures.push("artifact_run_id_mismatch");
  if (metadata.reviewedCommit !== expectedSha) failures.push("artifact_commit_mismatch");
  if (metadata.comparisonBase !== expectedBase) failures.push("artifact_comparison_base_mismatch");
  if ((metadata.validationRequestId || "legacy-test-request") !== expectedRequest) {
    failures.push("artifact_validation_request_mismatch");
  }
  if ((metadata.expectedDatabaseMigrationVersion || expectedTarget) !== expectedTarget) {
    failures.push("artifact_expected_migration_mismatch");
  }

  let qualityBuildTimestamp = Number.NaN;
  try { qualityBuildTimestamp = Date.parse(exactTimestamp(metadata.qualityBuildTimestamp, "Quality build timestamp")); }
  catch { failures.push("artifact_build_timestamp_invalid"); }
  let capturedAt = Number.NaN;
  try { capturedAt = Date.parse(exactTimestamp(metadata.capturedAt, "Artifact captured timestamp")); }
  catch { failures.push("artifact_captured_timestamp_invalid"); }
  if (!Number.isNaN(capturedAt) && capturedAt > now + 5 * 60_000) failures.push("artifact_timestamp_future");
  if (!Number.isNaN(qualityBuildTimestamp) && !Number.isNaN(capturedAt) && capturedAt < qualityBuildTimestamp) {
    failures.push("artifact_timestamp_stale");
  }

  if (index.repository !== expectedRepo) failures.push("evidence_index_repository_mismatch");
  if (String(index.workflowRunId ?? "") !== expectedRun) failures.push("evidence_index_run_id_mismatch");
  if (index.reviewedCommit !== expectedSha) failures.push("evidence_index_commit_mismatch");
  if (index.comparisonBase !== expectedBase) failures.push("evidence_index_comparison_base_mismatch");
  if ((index.validationRequestId || "legacy-test-request") !== expectedRequest) {
    failures.push("evidence_index_validation_request_mismatch");
  }
  if ((index.expectedDatabaseMigrationVersion || expectedTarget) !== expectedTarget) {
    failures.push("evidence_index_expected_migration_mismatch");
  }
  if (index.qualityBuildTimestamp !== metadata.qualityBuildTimestamp) failures.push("evidence_index_timestamp_mismatch");

  if (manifest.qualityArtifact?.evidenceIndex !== "evidence-index.json") failures.push("release_manifest_evidence_index_missing");
  if (manifest.qualityArtifact?.evidenceIndexSha256 !== sha256File(indexFile.absolutePath)) {
    failures.push("evidence_index_digest_mismatch");
  }
  if (manifest.qualityArtifact?.metadataSha256 !== sha256File(metadataFile.absolutePath)) {
    failures.push("artifact_metadata_digest_mismatch");
  }
  if (manifest.qualityArtifact?.repository !== expectedRepo) failures.push("release_manifest_artifact_repository_mismatch");
  if (String(manifest.qualityArtifact?.workflowRunId ?? "") !== expectedRun) {
    failures.push("release_manifest_artifact_run_mismatch");
  }
  if (manifest.qualityArtifact?.reviewedCommit !== expectedSha) failures.push("release_manifest_artifact_commit_mismatch");
  if (manifest.qualityArtifact?.comparisonBase !== expectedBase) {
    failures.push("release_manifest_artifact_comparison_base_mismatch");
  }
  if ((manifest.qualityArtifact?.validationRequestId || "legacy-test-request") !== expectedRequest) {
    failures.push("release_manifest_artifact_validation_request_mismatch");
  }
  if ((manifest.qualityArtifact?.expectedDatabaseMigrationVersion || expectedTarget) !== expectedTarget) {
    failures.push("release_manifest_artifact_expected_migration_mismatch");
  }
  if (manifest.qualityArtifact?.qualityBuildTimestamp !== metadata.qualityBuildTimestamp) {
    failures.push("release_manifest_artifact_timestamp_mismatch");
  }
  if (manifest.qualityArtifact?.fullReleaseQuality !== true) {
    failures.push("release_manifest_artifact_not_full_release_quality");
  }

  const indexedFiles = index.files && typeof index.files === "object" ? index.files : {};
  for (const [relativePath, fileEvidence] of Object.entries(indexedFiles)) {
    const code = `indexed_file_${relativePath.replaceAll(/[^a-z0-9]/gi, "_")}`;
    const file = requiredFile(reportsPath, relativePath, failures, code);
    if (!file) continue;
    if (fileEvidence?.sha256 !== sha256File(file.absolutePath)) failures.push(`${code}_digest_mismatch`);
    if (fileEvidence?.bytes !== statSync(file.absolutePath).size) failures.push(`${code}_size_mismatch`);
  }

  for (const required of REQUIRED_CANONICAL_FILES) {
    if (!indexedFiles[required]) failures.push(`canonical_file_${required}_not_indexed`);
    requiredFile(reportsPath, required, failures, `canonical_file_${required.replaceAll(/[^a-z0-9]/gi, "_")}`);
  }

  for (const [gate, evidenceName] of Object.entries(REQUIRED_QUALITY_GATES)) {
    const evidence = manifest.qualityGates?.[gate];
    if (!evidence || evidence.status !== "passed") {
      failures.push(`quality_gate_${gate}_not_passed`);
      continue;
    }
    if (evidence.exitCode !== 0) failures.push(`quality_gate_${gate}_exit_nonzero`);
    if (evidence.commitSha !== expectedSha) failures.push(`quality_gate_${gate}_commit_mismatch`);
    if (evidence.stale === true) failures.push(`quality_gate_${gate}_stale`);
    const paths = {
      evidence: `${evidenceName}.log`,
      exitEvidence: `${evidenceName}.exit`,
      metadata: `${evidenceName}.meta.json`,
    };
    for (const [field, expectedPath] of Object.entries(paths)) {
      if (evidence[field] !== expectedPath) failures.push(`quality_gate_${gate}_${field}_mismatch`);
      const file = requiredFile(reportsPath, expectedPath, failures, `quality_gate_${gate}_${field}`);
      if (!file) continue;
      if (!indexedFiles[expectedPath]) failures.push(`quality_gate_${gate}_${field}_not_indexed`);
      const digestField = field === "evidence" ? "logSha256" : field === "exitEvidence" ? "exitSha256" : "metadataSha256";
      if (evidence[digestField] !== sha256File(file.absolutePath)) failures.push(`quality_gate_${gate}_${field}_digest_mismatch`);
    }
    const exitFile = resolve(reportsPath, `${evidenceName}.exit`);
    if (existsSync(exitFile) && readFileSync(exitFile, "utf8").trim() !== "0") {
      failures.push(`quality_gate_${gate}_exit_file_nonzero`);
    }
  }

  const parityPath = resolve(reportsPath, "unit-failure-parity.json");
  if (existsSync(parityPath)) {
    const parity = readJson(parityPath, "unit failure parity");
    if (parity.headSha !== expectedSha) failures.push("unit_parity_head_mismatch");
    if (parity.baseSha !== expectedBase) failures.push("unit_parity_base_mismatch");
    if (parity.passed !== true) failures.push("unit_parity_failed");
  }

  return {
    valid: failures.length === 0,
    failures: unique(failures),
    manifest,
    metadata,
    evidenceIndex: index,
  };
}

export function evaluateReleasePreflight({
  mode = "release",
  expectedCommit,
  checkedOutCommit,
  expectedRepository,
  remoteUrl,
  packageJson,
  nodeVersion,
  nvmVersion,
  nodeFileVersion,
  installedNextVersion,
  migrationState,
  manifest,
  artifactFailures = [],
}) {
  const normalizedMode = normalizePreflightMode(mode);
  const commonFailures = [...artifactFailures];
  if (!/^[a-f0-9]{40}$/i.test(expectedCommit)) commonFailures.push("expected_commit_invalid");
  if (checkedOutCommit !== expectedCommit) commonFailures.push("checkout_commit_mismatch");
  if (!remoteUrl.includes(expectedRepository)) commonFailures.push("repository_origin_mismatch");
  if (packageJson.engines?.node !== "24.x") commonFailures.push("package_node_engine_mismatch");
  if (!nodeVersion.startsWith("v24.")) commonFailures.push("runtime_node_major_mismatch");
  if (nvmVersion.trim() !== "24" || nodeFileVersion.trim() !== "24") commonFailures.push("developer_node_pin_mismatch");
  if (!manifest || manifest.release?.commitSha !== expectedCommit) commonFailures.push("release_manifest_commit_mismatch");
  if (manifest?.runtime?.nextVersion !== installedNextVersion) commonFailures.push("release_manifest_next_version_mismatch");
  if (manifest?.release?.expectedDatabaseMigrationVersion !== migrationState.latestAppliedMigrationVersion) {
    commonFailures.push("release_manifest_migration_mismatch");
  }
  if (manifest?.release?.migrationLedgerReconciliationState !== migrationState.reconciliationState) {
    commonFailures.push("release_manifest_reconciliation_mismatch");
  }
  if (manifest?.release?.pendingMigrationCount !== migrationState.pendingCount) commonFailures.push("release_manifest_pending_count_mismatch");
  if (manifest?.release?.schemaAppliedUntrackedCount !== migrationState.schemaAppliedUntrackedCount) {
    commonFailures.push("release_manifest_untracked_count_mismatch");
  }
  if (manifest?.release?.unresolvedMigrationCount !== migrationState.unresolvedCount) {
    commonFailures.push("release_manifest_unresolved_count_mismatch");
  }

  const manifestBuildTimestamp = Date.parse(manifest?.release?.buildTimestamp ?? "");
  for (const gate of Object.keys(REQUIRED_QUALITY_GATES)) {
    const evidence = manifest?.qualityGates?.[gate];
    if (!evidence || !evidence.evidence) {
      commonFailures.push(`quality_gate_${gate}_missing`);
      continue;
    }
    if (evidence.status !== "passed") commonFailures.push(`quality_gate_${gate}_failed`);
    if (evidence.commitSha !== expectedCommit) commonFailures.push(`quality_gate_${gate}_commit_mismatch`);
    const capturedAt = Date.parse(evidence.capturedAt ?? "");
    if (evidence.stale === true || Number.isNaN(capturedAt) || (!Number.isNaN(manifestBuildTimestamp) && capturedAt < manifestBuildTimestamp)) {
      commonFailures.push(`quality_gate_${gate}_stale`);
    }
  }

  const reviewFailures = reviewMigrationFailures(migrationState);
  const releaseBlockers = migrationState.releaseReady === true ? [] : ["migration_ledger_not_reconciled"];
  const reviewReady = commonFailures.length === 0 && reviewFailures.length === 0;
  const releaseReady = commonFailures.length === 0 && releaseBlockers.length === 0;
  const failures = normalizedMode === "review"
    ? unique([...commonFailures, ...reviewFailures])
    : unique([...commonFailures, ...releaseBlockers]);

  return {
    mode: normalizedMode,
    ready: normalizedMode === "review" ? reviewReady : releaseReady,
    reviewReady,
    releaseReady,
    failures,
    releaseBlockers,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const expectedCommit = exactCommit(options.commit || process.env.PLAIVRA_COMMIT_SHA);
  const checkedOutCommit = exactCommit(git("rev-parse", "HEAD"), "Checked-out commit");
  const expectedRepository = safeRepository(options.repository || EXPECTED_REPOSITORY);
  const qualityRunId = numericRunId(options["quality-run-id"]);
  const comparisonBase = exactCommit(options["comparison-base"], "Expected comparison base");
  const requestId = validationRequestId(options["validation-request-id"]);
  const preflightId = validationRequestId(options["preflight-request-id"], "Preflight request ID");
  const context = validationContext(options["validation-context"] || STAGE1_VALIDATION_CONTEXT);
  const requestedMigration = expectedMigrationVersion(options["expected-migration"]);

  const reportsPath = isAbsolute(options["quality-reports"] ?? "")
    ? options["quality-reports"]
    : resolve(process.cwd(), options["quality-reports"] || "quality-reports");
  const ledger = readJson(resolve(root, "supabase/migration-ledger.json"), "migration ledger");
  const migrationState = deriveMigrationLedgerState(ledger);
  const releaseTarget = deriveReleaseTarget(ledger);
  if (requestedMigration !== releaseTarget.expectedMigration) {
    throw new Error("Expected migration does not equal the checked-out reconciled ledger head.");
  }

  const artifact = validateCanonicalQualityArtifact({
    reportsPath,
    expectedCommit,
    expectedRepository,
    qualityRunId,
    migrationState,
    expectedComparisonBase: comparisonBase,
    expectedValidationRequestId: requestId,
    expectedMigration: requestedMigration,
  });

  const manifest = artifact.manifest || readJson(resolve(reportsPath, "release-manifest.json"), "release manifest");
  const evaluation = evaluateReleasePreflight({
    mode: options.mode || "release",
    expectedCommit,
    checkedOutCommit,
    expectedRepository,
    remoteUrl: git("remote", "get-url", "origin"),
    packageJson: readJson(resolve(root, "package.json"), "package.json"),
    nodeVersion: process.version,
    nvmVersion: readFileSync(resolve(root, ".nvmrc"), "utf8"),
    nodeFileVersion: readFileSync(resolve(root, ".node-version"), "utf8"),
    installedNextVersion: readInstalledNextVersion(root),
    migrationState,
    manifest,
    artifactFailures: artifact.failures,
  });

  const authorizationFailures = [];
  let productionPromotionAuthorized = false;
  try {
    productionPromotionAuthorized = authorizeProductionPromotion({
      context,
      token: options["production-authorization-token"] || "",
      reviewedCommit: expectedCommit,
      qualityRunId,
      expectedMigration: requestedMigration,
    });
  } catch (error) {
    authorizationFailures.push("production_authorization_token_mismatch");
    if (context === PRODUCTION_AUTHORIZATION_CONTEXT) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
  const failures = unique([...evaluation.failures, ...authorizationFailures]);
  const ready = evaluation.ready && failures.length === 0;
  if (!ready) productionPromotionAuthorized = false;

  const evidence = {
    schemaVersion: 2,
    checkedAt: new Date().toISOString(),
    expectedCommit,
    checkedOutCommit,
    comparisonBase,
    qualityRunId,
    validationRequestId: requestId,
    preflightRequestId: preflightId,
    expectedDatabaseMigrationVersion: requestedMigration,
    migrationLedgerReconciliationState: migrationState.reconciliationState,
    pendingMigrationCount: migrationState.pendingCount,
    schemaAppliedUntrackedCount: migrationState.schemaAppliedUntrackedCount,
    unresolvedMigrationCount: migrationState.unresolvedCount,
    validationContext: context,
    qualityArtifactValid: artifact.valid,
    ready,
    reviewReady: evaluation.reviewReady,
    releaseReady: evaluation.releaseReady,
    failures,
    artifactFailures: artifact.failures,
    productionPromotionAuthorized,
    deploymentPerformed: false,
    productionMutationPerformed: false,
  };

  const outputPath = isAbsolute(options.output ?? "")
    ? options.output
    : resolve(process.cwd(), options.output || "quality-reports/release-preflight.json");
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  process.stdout.write(`${outputPath}\n`);
  if (!ready) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
