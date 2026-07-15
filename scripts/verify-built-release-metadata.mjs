import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXACT_SHA = /^[a-f0-9]{40}$/i;
const SAFE_IDENTIFIER = /^[a-z0-9][a-z0-9._-]*$/i;
const MIGRATION_VERSION = /^\d{12,14}$/;

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}`);
    options[argument.slice(2)] = value;
    index += 1;
  }
  return options;
}

function exactSha(value) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || !EXACT_SHA.test(normalized)) throw new Error("Expected commit must be an exact 40-character SHA.");
  return normalized;
}

function exactTimestamp(value) {
  const parsed = new Date(value ?? "");
  if (Number.isNaN(parsed.getTime())) throw new Error("Expected build timestamp must be valid.");
  return parsed.toISOString();
}

function safeIdentifier(value, label) {
  const normalized = value?.trim();
  if (!normalized || !SAFE_IDENTIFIER.test(normalized)) throw new Error(`${label} must be a safe identifier.`);
  return normalized;
}

export function validateBuiltReleaseMetadata({ body, status, expected }) {
  const exactFields = {
    commitSha: expected.commitSha,
    buildTimestamp: expected.buildTimestamp,
    environment: expected.environment,
    expectedDatabaseMigrationVersion: expected.expectedDatabaseMigrationVersion,
    migrationLedgerReconciliationState: expected.migrationLedgerReconciliationState,
    pendingMigrationCount: expected.pendingMigrationCount,
    schemaAppliedUntrackedCount: expected.schemaAppliedUntrackedCount,
    unresolvedMigrationCount: expected.unresolvedMigrationCount
  };
  for (const [field, value] of Object.entries(exactFields)) {
    if (body?.[field] !== value) throw new Error(`Built /api/version field ${field} did not match the build identity.`);
  }
  if (body.artifactIdentityValid !== true) throw new Error("Built /api/version did not retain valid artifact identity.");
  if (status !== 200 && status !== 503) throw new Error(`Built /api/version returned unexpected HTTP ${status}.`);
  if (status === 200 && body.releaseReady !== true) throw new Error("Built /api/version returned 200 without release readiness.");
  if (status === 503 && body.releaseReady !== false) throw new Error("Built /api/version returned 503 without fail-closed readiness.");
  return true;
}

async function waitForVersion(url, child, output) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Built server exited before readiness. ${output().slice(-2000)}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      const body = await response.json();
      return { status: response.status, body };
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    }
  }
  throw new Error(`Built server did not expose /api/version in time. ${output().slice(-2000)}`);
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    new Promise((resolveDelay) => setTimeout(resolveDelay, 5_000))
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!existsSync(resolve(root, ".next", "BUILD_ID"))) throw new Error("Run the production build before built metadata verification.");
  const ledger = JSON.parse(readFileSync(resolve(root, "supabase", "migration-ledger.json"), "utf8"));
  const expectedMigration = options["expected-migration"]?.trim();
  if (!expectedMigration || !MIGRATION_VERSION.test(expectedMigration)) throw new Error("Expected migration must be a migration version.");
  const expected = {
    commitSha: exactSha(options.commit),
    buildTimestamp: exactTimestamp(options["build-timestamp"]),
    environment: safeIdentifier(options.environment, "Expected environment"),
    expectedDatabaseMigrationVersion: expectedMigration,
    migrationLedgerReconciliationState: ledger.historyRepair?.state ?? "unknown",
    pendingMigrationCount: ledger.pendingCount,
    schemaAppliedUntrackedCount: ledger.schemaVerifiedUntrackedCount,
    unresolvedMigrationCount: ledger.unresolvedCount
  };
  const port = Number(options.port || "3210");
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Verification port is invalid.");

  let capturedOutput = "";
  const child = spawn(process.execPath, [resolve(root, "node_modules", "next", "dist", "bin", "next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "production",
      SUPABASE_SERVICE_ROLE_KEY: "",
      PLAIVRA_COMMIT_SHA: "0000000000000000000000000000000000000000",
      PLAIVRA_BUILD_TIMESTAMP: "2000-01-01T00:00:00.000Z",
      PLAIVRA_RELEASE_ENVIRONMENT: "runtime-poison",
      PLAIVRA_EXPECTED_DATABASE_MIGRATION_VERSION: "00000000000000",
      PLAIVRA_MIGRATION_LEDGER_RECONCILIATION_STATE: "reconciled",
      PLAIVRA_PENDING_MIGRATION_COUNT: "0",
      PLAIVRA_SCHEMA_APPLIED_UNTRACKED_COUNT: "0",
      PLAIVRA_UNRESOLVED_MIGRATION_COUNT: "0"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const capture = (chunk) => {
    capturedOutput = `${capturedOutput}${chunk}`.slice(-8_000);
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);

  try {
    const result = await waitForVersion(`http://127.0.0.1:${port}/api/version`, child, () => capturedOutput);
    validateBuiltReleaseMetadata({ ...result, expected });
    console.log(JSON.stringify({
      passed: true,
      status: result.status,
      commitSha: result.body.commitSha,
      buildTimestamp: result.body.buildTimestamp,
      environment: result.body.environment,
      expectedDatabaseMigrationVersion: result.body.expectedDatabaseMigrationVersion,
      migrationLedgerReconciliationState: result.body.migrationLedgerReconciliationState,
      pendingMigrationCount: result.body.pendingMigrationCount,
      schemaAppliedUntrackedCount: result.body.schemaAppliedUntrackedCount,
      unresolvedMigrationCount: result.body.unresolvedMigrationCount,
      releaseReady: result.body.releaseReady
    }));
  } finally {
    await stopChild(child);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
