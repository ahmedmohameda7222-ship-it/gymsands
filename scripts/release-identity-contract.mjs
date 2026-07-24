import { deriveMigrationLedgerState } from "./check-migration-ledger.mjs";

export const PLAIVRA_PROJECT_REF = "bkwezjxvapaeasfvlhvv";
export const ACTIVITY_CATALOG_PROJECT_REF = "khlcctuefiuhunqymkbp";
export const STAGE1_VALIDATION_CONTEXT = "stage1-infrastructure-validation";
export const PRODUCTION_AUTHORIZATION_CONTEXT = "production-marker-promotion-authorization";
export const VALIDATION_CONTEXTS = Object.freeze([
  STAGE1_VALIDATION_CONTEXT,
  PRODUCTION_AUTHORIZATION_CONTEXT,
]);

const SAFE_REQUEST_ID = /^[a-z0-9][a-z0-9._-]{7,127}$/i;
const MIGRATION_VERSION = /^\d{12,14}$/;

export function validationRequestId(value, label = "Validation request ID") {
  const normalized = String(value ?? "").trim();
  if (!SAFE_REQUEST_ID.test(normalized)) {
    throw new Error(`${label} must be 8-128 safe identifier characters.`);
  }
  return normalized;
}

export function expectedMigrationVersion(value, label = "Expected migration") {
  const normalized = String(value ?? "").trim();
  if (!MIGRATION_VERSION.test(normalized)) {
    throw new Error(`${label} must be a 12- or 14-digit migration version.`);
  }
  return normalized;
}

export function deriveReleaseTarget(ledger) {
  const state = deriveMigrationLedgerState(ledger);
  return Object.freeze({
    expectedMigration: expectedMigrationVersion(
      state.latestAppliedMigrationVersion,
      "Latest resolved Production migration",
    ),
    reconciliationState: state.reconciliationState,
    pendingCount: state.pendingCount,
    schemaAppliedUntrackedCount: state.schemaAppliedUntrackedCount,
    unresolvedCount: state.unresolvedCount,
    releaseReady: state.releaseReady,
  });
}

export function deriveReleaseReadyTarget(ledger) {
  const target = deriveReleaseTarget(ledger);
  if (
    target.releaseReady !== true
    || target.reconciliationState !== "reconciled"
    || target.pendingCount !== 0
    || target.schemaAppliedUntrackedCount !== 0
    || target.unresolvedCount !== 0
  ) {
    throw new Error("Migration ledger is not release-ready.");
  }
  return target;
}

export function validationContext(value) {
  const normalized = String(value ?? "").trim();
  if (!VALIDATION_CONTEXTS.includes(normalized)) {
    throw new Error(`Validation context must be one of: ${VALIDATION_CONTEXTS.join(", ")}.`);
  }
  return normalized;
}

export function productionAuthorizationToken({ reviewedCommit, qualityRunId, expectedMigration }) {
  return `AUTHORIZE_PRODUCTION_MARKER_PROMOTION_${reviewedCommit}_${qualityRunId}_${expectedMigration}`;
}

export function authorizeProductionPromotion({
  context,
  token,
  reviewedCommit,
  qualityRunId,
  expectedMigration,
}) {
  const normalizedContext = validationContext(context);
  if (normalizedContext === STAGE1_VALIDATION_CONTEXT) return false;
  const required = productionAuthorizationToken({ reviewedCommit, qualityRunId, expectedMigration });
  if (token !== required) {
    throw new Error("Production authorization token does not match the exact release identity.");
  }
  return true;
}

function redactedHost(hostname) {
  const parts = hostname.split(".");
  if (parts.length < 3) return "[redacted]";
  return `${parts[0]}.${parts[1]}.…${parts.at(-1)}`;
}

export function validateSupabaseProductionTarget(databaseUrl, projectRef) {
  if (projectRef === ACTIVITY_CATALOG_PROJECT_REF) {
    throw new Error("Activity Catalog database target is forbidden.");
  }
  if (projectRef !== PLAIVRA_PROJECT_REF) {
    throw new Error("Unexpected Supabase project ref.");
  }

  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("Release database URL is malformed.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("Release database URL must use PostgreSQL.");
  }
  if (!url.password || !url.username || !url.hostname || !url.pathname.replace(/^\//, "")) {
    throw new Error("Release database URL is incomplete.");
  }
  const sslmode = url.searchParams.get("sslmode");
  if (sslmode && !["require", "verify-ca", "verify-full"].includes(sslmode)) {
    throw new Error("Release database URL must require TLS.");
  }

  const directHost = `db.${projectRef}.supabase.co`;
  const username = decodeURIComponent(url.username);
  let connectionKind;
  if (url.hostname === directHost && username === "postgres") {
    connectionKind = "supabase-direct";
  } else if (
    url.hostname.endsWith(".pooler.supabase.com")
    && username === `postgres.${projectRef}`
    && /^[a-z0-9-]+\.pooler\.supabase\.com$/i.test(url.hostname)
  ) {
    connectionKind = "supabase-pooler";
  } else {
    throw new Error("Release database URL is not bound to the Plaivra Supabase project.");
  }

  return Object.freeze({
    projectRef,
    connectionKind,
    redactedHost: redactedHost(url.hostname),
  });
}
