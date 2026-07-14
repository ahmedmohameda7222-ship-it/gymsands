import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

const EXACT_COMMIT = /^[a-f0-9]{40}$/i;
const SAFE_MIGRATION = /^\d{12,14}$/;

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    options[key] = value;
    index += 1;
  }
  return options;
}

function deploymentUrl(value) {
  if (!value) throw new Error("Provide --url or PLAIVRA_DEPLOYMENT_URL.");
  const url = new URL(value);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("Deployment URL must use HTTPS (HTTP is allowed only for localhost).");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

async function fetchChecked(url, label) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
    headers: { "User-Agent": "Plaivra-Release-Smoke/2" }
  });
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}.`);
  return response;
}

const options = parseArgs(process.argv.slice(2));
const mode = options.mode || options["expected-environment"] || "local";
if (!new Set(["local", "preview", "production"]).has(mode)) throw new Error("--mode must be local, preview, or production.");
const baseUrl = deploymentUrl(options.url || process.env.PLAIVRA_DEPLOYMENT_URL);
const expectedCommit = (options["expected-commit"] || process.env.PLAIVRA_EXPECTED_COMMIT_SHA || "").trim().toLowerCase();
const expectedMigration = (options["expected-migration"] || process.env.PLAIVRA_EXPECTED_DATABASE_MIGRATION_VERSION || "").trim();
if (!EXACT_COMMIT.test(expectedCommit)) {
  throw new Error("Provide an exact 40-character --expected-commit or PLAIVRA_EXPECTED_COMMIT_SHA.");
}
if (!SAFE_MIGRATION.test(expectedMigration)) {
  throw new Error("Provide a valid --expected-migration or PLAIVRA_EXPECTED_DATABASE_MIGRATION_VERSION.");
}

const versionUrl = new URL("/api/version", baseUrl);
const versionResponse = await fetch(versionUrl, {
  redirect: "follow",
  signal: AbortSignal.timeout(15_000),
  headers: { "User-Agent": "Plaivra-Release-Smoke/2" }
});
if (mode === "production" ? versionResponse.status !== 200 : !new Set([200, 503]).has(versionResponse.status)) {
  throw new Error(`Version readiness endpoint returned HTTP ${versionResponse.status} for ${mode} mode.`);
}
const version = await versionResponse.json();

if (version.commitSha !== expectedCommit) {
  throw new Error(`Deployed commit ${version.commitSha || "missing"} does not match expected commit ${expectedCommit}.`);
}
if (!version.buildTimestamp || version.buildTimestamp === "unknown" || Number.isNaN(Date.parse(version.buildTimestamp))) {
  throw new Error("Deployment did not report a valid build timestamp.");
}
if (!version.environment || version.environment === "unknown") throw new Error("Deployment environment is missing.");
if (options["expected-environment"] && version.environment !== options["expected-environment"]) {
  throw new Error(`Deployment environment ${version.environment} does not match ${options["expected-environment"]}.`);
}
if (version.expectedDatabaseMigrationVersion !== expectedMigration) {
  throw new Error(`Artifact expects migration ${version.expectedDatabaseMigrationVersion || "missing"}, not ${expectedMigration}.`);
}
if (version.artifactIdentityValid !== true) throw new Error("Artifact identity is not valid.");
if (mode === "production") {
  if (version.databaseMigrationVersion !== expectedMigration) {
    throw new Error(`Database marker ${version.databaseMigrationVersion || "missing"} does not match ${expectedMigration}.`);
  }
  if (version.schemaMarkerCompatible !== true) throw new Error("Database schema compatibility marker does not match the release.");
  if (version.migrationVersionCompatible !== true) throw new Error("Database migration marker does not match the release.");
  if (version.migrationLedgerReconciled !== true || version.schemaAppliedUntrackedCount !== 0) {
    throw new Error("Migration ledger reconciliation is incomplete.");
  }
  if (version.releaseReady !== true) throw new Error("Version endpoint did not declare the release ready.");
}

await fetchChecked(baseUrl, "Landing page");
await fetchChecked(new URL("/api/health", baseUrl), "Health endpoint");
await fetchChecked(new URL("/login", baseUrl), "Login page");
await fetchChecked(new URL("/legal/privacy", baseUrl), "Privacy page");
await fetchChecked(new URL("/legal/terms", baseUrl), "Terms page");

const evidence = {
  checkedAt: new Date().toISOString(),
  deploymentUrl: baseUrl.toString(),
  mode,
  expectedCommit,
  expectedMigration,
  version,
  checks: {
    landing: "passed",
    versionEndpoint: "passed",
    commitMatch: "passed",
    buildTimestamp: "passed",
    artifactIdentity: "passed",
    schemaMarkerCompatibility: mode === "production" ? "passed" : "not-applicable",
    migrationVersionCompatibility: mode === "production" ? "passed" : "not-applicable",
    migrationLedgerReconciliation: mode === "production" ? "passed" : "not-applicable",
    releaseReadiness: mode === "production" ? "passed" : "not-applicable",
    health: "passed",
    login: "passed",
    legalLinks: "passed"
  }
};
const serialized = `${JSON.stringify(evidence, null, 2)}\n`;

if (options.output) {
  const outputPath = isAbsolute(options.output) ? options.output : resolve(process.cwd(), options.output);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, serialized, "utf8");
  process.stdout.write(`${outputPath}\n`);
} else {
  process.stdout.write(serialized);
}
