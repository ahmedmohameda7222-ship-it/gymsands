export const DEFAULT_SCHEMA_COMPATIBILITY_VERSION = "2";

export type MigrationLedgerReconciliationState = "reconciled" | "pending" | "unknown";

export type ReleaseVersion = {
  commitSha: string;
  buildTimestamp: string;
  environment: string;
  schemaCompatibilityVersion: string;
  expectedDatabaseMigrationVersion: string;
  migrationLedgerReconciliationState: MigrationLedgerReconciliationState;
  schemaAppliedUntrackedCount: number;
};

export type ReleaseEnvironment = {
  PLAIVRA_COMMIT_SHA?: string;
  VERCEL_GIT_COMMIT_SHA?: string;
  GITHUB_SHA?: string;
  PLAIVRA_BUILD_TIMESTAMP?: string;
  PLAIVRA_RELEASE_ENVIRONMENT?: string;
  VERCEL_ENV?: string;
  NODE_ENV?: string;
  PLAIVRA_SCHEMA_COMPATIBILITY_VERSION?: string;
  PLAIVRA_EXPECTED_DATABASE_MIGRATION_VERSION?: string;
  PLAIVRA_MIGRATION_LEDGER_RECONCILIATION_STATE?: string;
  PLAIVRA_SCHEMA_APPLIED_UNTRACKED_COUNT?: string;
};

const SAFE_IDENTIFIER = /^[a-z0-9][a-z0-9._-]*$/i;
export const EXACT_GIT_COMMIT_SHA = /^[a-f0-9]{40}$/i;

// These direct property reads are intentionally bundled by Next.js from
// nextConfig.env. Do not replace them with dynamic process.env indexing.
const bundledReleaseEnvironment: ReleaseEnvironment = {
  PLAIVRA_COMMIT_SHA: process.env.PLAIVRA_COMMIT_SHA,
  PLAIVRA_BUILD_TIMESTAMP: process.env.PLAIVRA_BUILD_TIMESTAMP,
  PLAIVRA_RELEASE_ENVIRONMENT: process.env.PLAIVRA_RELEASE_ENVIRONMENT,
  PLAIVRA_SCHEMA_COMPATIBILITY_VERSION: process.env.PLAIVRA_SCHEMA_COMPATIBILITY_VERSION,
  PLAIVRA_EXPECTED_DATABASE_MIGRATION_VERSION: process.env.PLAIVRA_EXPECTED_DATABASE_MIGRATION_VERSION,
  PLAIVRA_MIGRATION_LEDGER_RECONCILIATION_STATE: process.env.PLAIVRA_MIGRATION_LEDGER_RECONCILIATION_STATE,
  PLAIVRA_SCHEMA_APPLIED_UNTRACKED_COUNT: process.env.PLAIVRA_SCHEMA_APPLIED_UNTRACKED_COUNT
};

function safeIdentifier(value: string | undefined, fallback: string) {
  const normalized = value?.trim();
  return normalized && normalized.length <= 64 && SAFE_IDENTIFIER.test(normalized) ? normalized : fallback;
}

function safeCommitSha(value: string | undefined) {
  const normalized = value?.trim();
  return normalized && EXACT_GIT_COMMIT_SHA.test(normalized) ? normalized.toLowerCase() : "unknown";
}

function safeIsoTimestamp(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) return "unknown";
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? "unknown" : parsed.toISOString();
}

function safeCount(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized || !/^\d{1,6}$/.test(normalized)) return -1;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : -1;
}

function safeReconciliationState(value: string | undefined): MigrationLedgerReconciliationState {
  return value === "reconciled" || value === "pending" ? value : "unknown";
}

export function getReleaseVersion(environment: ReleaseEnvironment = bundledReleaseEnvironment): ReleaseVersion {
  return {
    commitSha: safeCommitSha(
      environment.PLAIVRA_COMMIT_SHA || environment.VERCEL_GIT_COMMIT_SHA || environment.GITHUB_SHA
    ),
    buildTimestamp: safeIsoTimestamp(environment.PLAIVRA_BUILD_TIMESTAMP),
    environment: safeIdentifier(
      environment.PLAIVRA_RELEASE_ENVIRONMENT || environment.VERCEL_ENV || environment.NODE_ENV,
      "unknown"
    ),
    schemaCompatibilityVersion: safeIdentifier(
      environment.PLAIVRA_SCHEMA_COMPATIBILITY_VERSION,
      DEFAULT_SCHEMA_COMPATIBILITY_VERSION
    ),
    expectedDatabaseMigrationVersion: safeIdentifier(
      environment.PLAIVRA_EXPECTED_DATABASE_MIGRATION_VERSION,
      "unknown"
    ),
    migrationLedgerReconciliationState: safeReconciliationState(
      environment.PLAIVRA_MIGRATION_LEDGER_RECONCILIATION_STATE
    ),
    schemaAppliedUntrackedCount: safeCount(environment.PLAIVRA_SCHEMA_APPLIED_UNTRACKED_COUNT)
  };
}

export function isReleaseArtifactIdentityValid(release: ReleaseVersion) {
  return EXACT_GIT_COMMIT_SHA.test(release.commitSha)
    && release.buildTimestamp !== "unknown"
    && !Number.isNaN(Date.parse(release.buildTimestamp))
    && release.environment !== "unknown"
    && release.expectedDatabaseMigrationVersion !== "unknown"
    && release.schemaAppliedUntrackedCount >= 0;
}
