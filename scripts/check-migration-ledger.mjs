import { pathToFileURL } from "node:url";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ALLOWED_STATES = new Set([
  "applied",
  "pending",
  "applied_version_alias",
  "ledger_drift_review",
  "applied_schema_untracked"
]);
const RESOLVED_STATES = new Set(["applied", "applied_version_alias"]);
const EXACT_SHA = /^[a-f0-9]{40}$/i;
const MIGRATION_FILE = /^\d{12,14}_[a-z0-9_]+\.sql$/;
const PRODUCTION_VERSION = /^\d{12,14}$/;
const PRODUCTION_NAME = /^[a-z0-9_]+$/;
const UTC_CAPTURE_TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?)(?:Z|\+00(?::?00)?)$/;

export function canonicalizeLedgerTimestamp(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(UTC_CAPTURE_TIMESTAMP);
  if (!match) return null;
  const canonical = `${match[1]}Z`;
  return Number.isNaN(Date.parse(canonical)) ? null : canonical;
}

function hasValidProductionIdentity(entry) {
  if (!entry || !RESOLVED_STATES.has(entry.state)) return false;
  if (!PRODUCTION_VERSION.test(entry.productionVersion ?? "")) return false;
  if (!PRODUCTION_NAME.test(entry.productionName ?? "")) return false;
  if (entry.state === "applied") {
    return entry.localFile === `${entry.productionVersion}_${entry.productionName}.sql`;
  }
  return true;
}

export function deriveMigrationLedgerState(ledger) {
  const entries = Array.isArray(ledger.entries) ? ledger.entries : [];
  const appliedCount = entries.filter((entry) => entry.state === "applied").length;
  const pendingCount = entries.filter((entry) => entry.state === "pending").length;
  const schemaAppliedUntrackedCount = entries.filter(
    (entry) => entry.state === "applied_schema_untracked"
  ).length;
  const ledgerDriftReviewCount = entries.filter(
    (entry) => entry.state === "ledger_drift_review"
  ).length;
  const unresolvedCount = entries.filter(
    (entry) => !RESOLVED_STATES.has(entry.state)
  ).length;
  const invalidAppliedProductionIdentityCount = entries.filter(
    (entry) => RESOLVED_STATES.has(entry.state) && !hasValidProductionIdentity(entry)
  ).length;
  const reconciliationState = ledger.historyRepair?.state === "reconciled"
    ? "reconciled"
    : ledger.historyRepair?.state === "pending"
      ? "pending"
      : "unknown";
  // The release target is the newest reconciled physical production record,
  // including generated production aliases whose immutable repository filename differs.
  const latestAppliedMigrationVersion = entries
    .filter((entry) => RESOLVED_STATES.has(entry.state) && typeof entry.productionVersion === "string")
    .map((entry) => entry.productionVersion)
    .sort()
    .at(-1) ?? null;
  const releaseReady = reconciliationState === "reconciled"
    && pendingCount === 0
    && schemaAppliedUntrackedCount === 0
    && ledgerDriftReviewCount === 0
    && unresolvedCount === 0
    && invalidAppliedProductionIdentityCount === 0;

  return {
    appliedCount,
    pendingCount,
    schemaAppliedUntrackedCount,
    ledgerDriftReviewCount,
    unresolvedCount,
    invalidAppliedProductionIdentityCount,
    reconciliationState,
    latestAppliedMigrationVersion,
    releaseReady
  };
}

export function validateMigrationLedger({ ledger, files, documentation = {} }) {
  const errors = [];
  if (ledger.schemaVersion !== 1) errors.push("Unsupported migration ledger schemaVersion.");
  if (!/^[a-z0-9]{20}$/.test(ledger.projectRef ?? "")) errors.push("Invalid Supabase projectRef.");
  if (!EXACT_SHA.test(ledger.auditedRepositoryCommit ?? "")) errors.push("auditedRepositoryCommit must be an exact 40-character Git SHA.");
  if (!canonicalizeLedgerTimestamp(ledger.capturedAt)) errors.push("capturedAt must be a valid ISO-8601 timestamp.");

  const entries = Array.isArray(ledger.entries) ? ledger.entries : [];
  const classified = new Map();
  const productionKeys = new Set();
  const localFileOrder = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      errors.push("Migration ledger entries must be objects.");
      continue;
    }
    if (!files.includes(entry.localFile)) errors.push(`Ledger references missing migration: ${entry.localFile}`);
    if (classified.has(entry.localFile)) errors.push(`Migration classified more than once: ${entry.localFile}`);
    if (!ALLOWED_STATES.has(entry.state)) errors.push(`Unsupported migration state for ${entry.localFile}: ${entry.state}`);
    if (!MIGRATION_FILE.test(entry.localFile ?? "")) errors.push(`Invalid migration filename: ${entry.localFile}`);
    classified.set(entry.localFile, entry.state);
    localFileOrder.push(entry.localFile);

    if (entry.productionVersion || entry.productionName) {
      if (!entry.productionVersion || !entry.productionName) {
        errors.push(`Incomplete production identity for ${entry.localFile}`);
      } else {
        if (!PRODUCTION_VERSION.test(entry.productionVersion)) errors.push(`Invalid production version for ${entry.localFile}`);
        if (!PRODUCTION_NAME.test(entry.productionName)) errors.push(`Invalid production name for ${entry.localFile}`);
        const key = `${entry.productionVersion}:${entry.productionName}`;
        if (productionKeys.has(key)) errors.push(`Duplicate production ledger identity: ${key}`);
        productionKeys.add(key);
        if (entry.state === "applied") {
          const expectedFile = `${entry.productionVersion}_${entry.productionName}.sql`;
          if (entry.localFile !== expectedFile) errors.push(`Applied migration identity does not match filename: ${entry.localFile}`);
        }
      }
    }

    if (entry.state === "applied" && (!entry.productionVersion || !entry.productionName)) {
      errors.push(`Applied migration lacks a production identity: ${entry.localFile}`);
    }
    if (entry.state === "pending" && (entry.productionVersion || entry.productionName)) {
      errors.push(`Pending migration must not have a production identity: ${entry.localFile}`);
    }
    if (entry.state === "applied_version_alias" && !entry.note?.includes("differs")) {
      errors.push(`Version alias lacks an explicit preservation note: ${entry.localFile}`);
    }
    if (entry.state === "ledger_drift_review" && !entry.note) {
      errors.push(`Ledger drift entry lacks an evidence note: ${entry.localFile}`);
    }
    if (entry.state === "applied_schema_untracked") {
      if (entry.productionVersion || entry.productionName) {
        errors.push(`Schema-untracked migration must not claim a production identity: ${entry.localFile}`);
      }
      if (!entry.note?.includes("Absent from Supabase migration history") || !entry.note?.includes("Do not replay")) {
        errors.push(`Schema-untracked migration lacks the required verification and replay warning: ${entry.localFile}`);
      }
      if (entry.note.length < 120) errors.push(`Schema-untracked migration evidence note is too short: ${entry.localFile}`);
    }
    if (!RESOLVED_STATES.has(entry.state)) {
      for (const [documentName, document] of Object.entries(documentation)) {
        if (!document.includes(entry.localFile)) {
          errors.push(`${documentName} does not list unresolved migration ${entry.localFile}`);
        }
      }
    }
  }

  for (const file of files) {
    if (!classified.has(file)) errors.push(`Unclassified repository migration: ${file}`);
    if (!MIGRATION_FILE.test(file)) errors.push(`Invalid migration filename: ${file}`);
  }

  const sortedOrder = [...localFileOrder].sort();
  if (JSON.stringify(localFileOrder) !== JSON.stringify(sortedOrder)) errors.push("Migration ledger entries are not ordered by filename.");

  const derived = deriveMigrationLedgerState(ledger);
  if (ledger.productionMigrationCount !== derived.appliedCount) {
    errors.push(`productionMigrationCount=${ledger.productionMigrationCount} does not match applied entries=${derived.appliedCount}.`);
  }
  if (ledger.schemaVerifiedUntrackedCount !== derived.schemaAppliedUntrackedCount) {
    errors.push(`schemaVerifiedUntrackedCount=${ledger.schemaVerifiedUntrackedCount} does not match untracked entries=${derived.schemaAppliedUntrackedCount}.`);
  }
  if (ledger.pendingCount !== derived.pendingCount) {
    errors.push(`pendingCount=${ledger.pendingCount} does not match pending entries=${derived.pendingCount}.`);
  }
  if (ledger.unresolvedCount !== derived.unresolvedCount) {
    errors.push(`unresolvedCount=${ledger.unresolvedCount} does not match unresolved entries=${derived.unresolvedCount}.`);
  }
  if (ledger.historyRepair?.schemaAppliedUntrackedCount !== derived.schemaAppliedUntrackedCount) {
    errors.push(`historyRepair.schemaAppliedUntrackedCount=${ledger.historyRepair?.schemaAppliedUntrackedCount} does not match untracked entries=${derived.schemaAppliedUntrackedCount}.`);
  }
  if (ledger.historyRepair?.pendingCount !== derived.pendingCount) {
    errors.push(`historyRepair.pendingCount=${ledger.historyRepair?.pendingCount} does not match pending entries=${derived.pendingCount}.`);
  }
  if (ledger.historyRepair?.unresolvedCount !== derived.unresolvedCount) {
    errors.push(`historyRepair.unresolvedCount=${ledger.historyRepair?.unresolvedCount} does not match unresolved entries=${derived.unresolvedCount}.`);
  }
  if (!ledger.historyRepair?.note?.includes("Do not replay")) errors.push("historyRepair note must include the replay prohibition.");
  if (derived.reconciliationState === "reconciled" && derived.unresolvedCount !== 0) {
    errors.push("Reconciled migration history cannot retain unresolved migration entries.");
  }
  if (derived.reconciliationState === "reconciled" && derived.invalidAppliedProductionIdentityCount !== 0) {
    errors.push("Reconciled migration history requires valid applied production identities.");
  }
  if (derived.reconciliationState === "pending" && derived.releaseReady) {
    errors.push("Pending migration reconciliation cannot be release-ready.");
  }
  if (derived.reconciliationState === "unknown") errors.push("Unsupported migration history-repair state.");

  return { errors, derived };
}

async function main() {
  const root = process.cwd();
  const migrationsDir = path.join(root, "supabase", "migrations");
  const ledgerPath = path.join(root, "supabase", "migration-ledger.json");
  const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
  const documentation = {
    "README.md": await readFile(path.join(root, "README.md"), "utf8"),
    "docs/architecture/migration-ledger-reconciliation.md": await readFile(
      path.join(root, "docs", "architecture", "migration-ledger-reconciliation.md"),
      "utf8"
    )
  };
  const { errors, derived } = validateMigrationLedger({ ledger, files, documentation });

  if (errors.length) {
    console.error(errors.map((error) => `- ${error}`).join("\n"));
    process.exit(1);
  }

  console.log(`Migration ledger valid: ${files.length} repository migrations classified.`);
  console.log(
    `applied=${derived.appliedCount} pending=${derived.pendingCount} `
    + `applied_schema_untracked=${derived.schemaAppliedUntrackedCount} `
    + `unresolved=${derived.unresolvedCount}`
  );
  console.log(`reconciliation=${derived.reconciliationState} release_ready=${derived.releaseReady}`);
  console.log(`expected_database_migration=${derived.latestAppliedMigrationVersion}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
