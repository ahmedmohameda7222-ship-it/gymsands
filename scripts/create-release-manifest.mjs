import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = resolve(root, "release/release-manifest.template.json");
const safeCommit = /^[a-f0-9]{7,64}$/i;
const safeIdentifier = /^[a-z0-9][a-z0-9._-]*$/i;

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

function currentCommit() {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
}

function requiredIdentifier(name, value) {
  const normalized = value?.trim();
  if (!normalized || normalized.length > 64 || !safeIdentifier.test(normalized)) {
    throw new Error(`${name} must be a safe non-empty identifier.`);
  }
  return normalized;
}

function requiredCommit(value) {
  const normalized = value?.trim();
  if (!normalized || !safeCommit.test(normalized)) throw new Error("Commit SHA is missing or malformed.");
  return normalized;
}

function requiredTimestamp(value) {
  const normalized = value?.trim();
  const timestamp = normalized ? new Date(normalized) : new Date(Number.NaN);
  if (Number.isNaN(timestamp.getTime())) throw new Error("Build timestamp must be an ISO-compatible timestamp.");
  return timestamp.toISOString();
}

function applyQualityEvidence(manifest, reportsDirectory) {
  if (!reportsDirectory) return;

  const reportsPath = isAbsolute(reportsDirectory) ? reportsDirectory : resolve(process.cwd(), reportsDirectory);
  const reportNames = {
    integrity: "integrity",
    lint: "lint",
    typecheck: "typecheck",
    unitTests: "unit",
    integrationTests: "integration",
    productionBuild: "build"
  };

  for (const [gate, report] of Object.entries(reportNames)) {
    try {
      const exitCode = readFileSync(resolve(reportsPath, `${report}.exit`), "utf8").trim();
      manifest.qualityGates[gate] = {
        status: exitCode === "0" ? "passed" : "failed",
        evidence: `${report}.log`
      };
    } catch {
      manifest.qualityGates[gate] = { status: "missing", evidence: null };
    }
  }
}

const options = parseArgs(process.argv.slice(2));
const manifest = JSON.parse(readFileSync(templatePath, "utf8"));

manifest.release = {
  commitSha: requiredCommit(
    options.commit || process.env.PLAIVRA_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || currentCommit()
  ),
  buildTimestamp: requiredTimestamp(options["build-timestamp"] || process.env.PLAIVRA_BUILD_TIMESTAMP),
  environment: requiredIdentifier(
    "Environment",
    options.environment || process.env.PLAIVRA_RELEASE_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV
  ),
  schemaCompatibilityVersion: requiredIdentifier(
    "Schema compatibility version",
    options["schema-compatibility"] || process.env.PLAIVRA_SCHEMA_COMPATIBILITY_VERSION || "2"
  )
};

applyQualityEvidence(manifest, options["quality-reports"]);

const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
if (options.output) {
  const outputPath = isAbsolute(options.output) ? options.output : resolve(process.cwd(), options.output);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, serialized, "utf8");
  process.stdout.write(`${outputPath}\n`);
} else {
  process.stdout.write(serialized);
}
