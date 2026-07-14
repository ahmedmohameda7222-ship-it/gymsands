import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(
  repositoryRoot,
  "supabase",
  "verification",
  "production-release-migration-preflight-control-fixture.sql"
);
const controlPath = path.join(
  repositoryRoot,
  "supabase",
  "verification",
  "production-release-migration-preflight-control.psql"
);
const databaseUrl =
  process.env.PLAIVRA_PREFLIGHT_TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const psqlCommand = process.env.PSQL ?? "psql";

function sanitizedDiagnostic(value) {
  return String(value ?? "")
    .replace(/postgres(?:ql)?:\/\/[^@\s]+@/gi, "postgresql://[REDACTED]@")
    .replace(/\b(password|passfile|sslpassword)\s*=\s*[^\s]+/gi, "$1=[REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .slice(0, 12_000);
}

function runCase(count) {
  const expectedIdentities = Array.from(
    { length: count },
    (_, index) => `fixture_${index + 1}`
  );
  const result = spawnSync(
    psqlCommand,
    [
      databaseUrl,
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-v",
      `fixture_finding_count=${count}`,
      "-f",
      fixturePath
    ],
    { cwd: repositoryRoot, encoding: "utf8" }
  );

  if (result.error) {
    throw new Error(`Unable to execute psql (${result.error.code ?? "spawn failure"}).`);
  }
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const safeOutput = sanitizedDiagnostic(output);
  const expectedSuccess = count === 0;
  const expectedStatus = expectedSuccess ? 0 : 3;
  if (result.status !== expectedStatus) {
    throw new Error(
      `Preflight control case ${count} returned ${result.status}; expected ${expectedStatus}. Sanitized output:\n${safeOutput}`
    );
  }

  const expectedCountText = expectedSuccess
    ? "0 blocking findings"
    : `${count} blocking finding(s)`;
  if (!output.includes(expectedCountText)) {
    throw new Error(
      `Preflight control case ${count} did not print ${JSON.stringify(expectedCountText)}. Sanitized output:\n${safeOutput}`
    );
  }

  if (expectedSuccess) {
    if (output.includes("Blocking finding evidence") || output.includes("fixture_")) {
      throw new Error(`Zero-finding case printed blocker evidence. Sanitized output:\n${safeOutput}`);
    }
  } else {
    if (output.includes("passed: 0 blocking findings")) {
      throw new Error(`Failing case ${count} printed the success message. Sanitized output:\n${safeOutput}`);
    }
    if (!output.includes('"issue_type": "behavior_test_finding"')) {
      throw new Error(`Failing case ${count} omitted readable issue_type evidence. Sanitized output:\n${safeOutput}`);
    }
    for (const [index, identity] of expectedIdentities.entries()) {
      if (!output.includes(identity)) {
        throw new Error(
          `Preflight control case ${count} omitted ${identity}. Sanitized output:\n${safeOutput}`
        );
      }
      const details = `Executable fail-closed fixture ${index + 1}.`;
      if (!output.includes(details)) {
        throw new Error(
          `Preflight control case ${count} omitted readable details for ${identity}. Sanitized output:\n${safeOutput}`
        );
      }
    }
  }

  // Retain the real psql evidence in CI logs, including every identity in the
  // multi-finding cases, rather than only asserting against captured output.
  process.stdout.write(safeOutput);
  process.stdout.write(
    `database preflight control: findings=${count}, exit=${result.status}, printed_count=${expectedCountText}\n`
  );
}

for (const count of [0, 1, 2, 6]) runCase(count);

function runMissingVariableCase() {
  const result = spawnSync(
    psqlCommand,
    [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-f", controlPath],
    { cwd: repositoryRoot, encoding: "utf8" }
  );
  if (result.error) {
    throw new Error(`Unable to execute psql (${result.error.code ?? "spawn failure"}).`);
  }
  const safeOutput = sanitizedDiagnostic(`${result.stdout ?? ""}${result.stderr ?? ""}`);
  if (result.status !== 3) {
    throw new Error(`Missing-variable control case returned ${result.status}; expected 3. Sanitized output:\n${safeOutput}`);
  }
  if (!safeOutput.includes("Boolean finding state is missing")) {
    throw new Error(`Missing-variable control case omitted its fail-closed reason. Sanitized output:\n${safeOutput}`);
  }
  if (safeOutput.includes("passed: 0 blocking findings")) {
    throw new Error(`Missing-variable control case printed the success message. Sanitized output:\n${safeOutput}`);
  }
  process.stdout.write(safeOutput);
  process.stdout.write("database preflight control: missing_variables=true, exit=3, fail_closed=true\n");
}

runMissingVariableCase();
