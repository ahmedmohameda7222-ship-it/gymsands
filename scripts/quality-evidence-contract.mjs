import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveReleaseTarget, validationRequestId } from "./release-identity-contract.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const EXPECTED_REPOSITORY = "ahmedmohameda7222-ship-it/gymsands";
export const EXPECTED_SCHEMA_COMPATIBILITY = "2";

export function currentExpectedDatabaseMigration() {
  const ledger = JSON.parse(readFileSync(resolve(root, "supabase/migration-ledger.json"), "utf8"));
  return deriveReleaseTarget(ledger).expectedMigration;
}

// Backward-compatible dynamic export for existing tests. It is derived from the exact ledger,
 // never pinned in generic evidence code.
export const EXPECTED_DATABASE_MIGRATION = currentExpectedDatabaseMigration();

export const REQUIRED_QUALITY_GATES = Object.freeze({
  repositoryIntegrity: "integrity",
  fullMigrationChain: "full-migration-chain",
  databaseLint: "database-lint",
  databasePreflight: "database-preflight",
  migrationLedger: "migration-ledger",
  dependencyAudit: "dependency-audit",
  lint: "lint",
  typecheck: "typecheck",
  unitTests: "unit",
  integrationTests: "integration",
  scriptTests: "script-tests",
  telemetryTests: "telemetry-tests",
  environmentValidation: "environment-validation",
  releaseMetadata: "release-metadata",
  productionBuild: "build",
  renderedBrowserQa: "rendered-qa",
});

export const REQUIRED_QUALITY_GATE_NAMES = Object.freeze(Object.keys(REQUIRED_QUALITY_GATES));
export const REQUIRED_QUALITY_EVIDENCE_NAMES = Object.freeze(Object.values(REQUIRED_QUALITY_GATES));

export const REQUIRED_CANONICAL_FILES = Object.freeze([
  "artifact-metadata.json",
  "database-validation.log",
  "unit-failure-parity.json",
]);

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function safeRelativePath(value, label = "Evidence path") {
  const normalized = value?.replaceAll("\\", "/").replace(/^\.\//, "");
  if (
    !normalized
    || normalized.startsWith("/")
    || normalized.includes("..")
    || !/^[a-z0-9][a-z0-9._/-]{0,240}$/i.test(normalized)
  ) {
    throw new Error(`${label} must be a safe relative path.`);
  }
  return normalized;
}

export function exactCommit(value, label = "Commit SHA") {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || !/^[a-f0-9]{40}$/.test(normalized)) {
    throw new Error(`${label} must be an exact 40-character Git SHA.`);
  }
  return normalized;
}

export function numericRunId(value, label = "Workflow run ID") {
  const normalized = String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) throw new Error(`${label} must be numeric.`);
  return normalized;
}

export function exactTimestamp(value, label = "Timestamp") {
  const parsed = new Date(value ?? "");
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} must be valid.`);
  return parsed.toISOString();
}

export { validationRequestId };
