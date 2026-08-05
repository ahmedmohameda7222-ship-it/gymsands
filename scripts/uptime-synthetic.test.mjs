import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  FAILURE_CODES,
  parseOptions,
  runSynthetic,
} from "./uptime-synthetic.mjs";

const EXPECTED_COMMIT = "a".repeat(40);
const STALE_COMMIT = "b".repeat(40);
const PRIVATE_CONTENT = "secret@example.com Bearer private-token cookie=session user=11111111-1111-4111-8111-111111111111 /private?token=abc";
const STREAM_PRIVATE_CONTENT = "stream-secret@example.com Bearer stream-private-token partial-private-content";
const ENDPOINT_PATHS = [
  "/api/health",
  "/api/version",
  "/",
  "/login",
  "/legal/privacy",
  "/legal/terms",
];
const workflowUrl = new URL("../.github/workflows/uptime-synthetic.yml", import.meta.url);

function healthBody(overrides = {}) {
  const { release: releaseOverrides = {}, ...bodyOverrides } = overrides;
  return {
    status: "ok",
    checkedAt: "2026-08-05T12:00:00.000Z",
    release: {
      commitSha: EXPECTED_COMMIT,
      environment: "production",
      schemaCompatibilityVersion: "2",
      ...releaseOverrides,
    },
    injectedPrivateContent: PRIVATE_CONTENT,
    ...bodyOverrides,
  };
}

function versionBody(overrides = {}) {
  return {
    commitSha: EXPECTED_COMMIT,
    buildTimestamp: "2026-08-05T11:59:00.000Z",
    environment: "production",
    schemaCompatibilityVersion: "2",
    expectedDatabaseMigrationVersion: "20260724232734",
    migrationLedgerReconciliationState: "reconciled",
    pendingMigrationCount: 0,
    schemaAppliedUntrackedCount: 0,
    unresolvedMigrationCount: 0,
    expectedSchemaCompatibilityVersion: "2",
    databaseSchemaCompatibilityVersion: "2",
    databaseMigrationVersion: "20260724232734",
    artifactIdentityValid: true,
    schemaMarkerCompatible: true,
    migrationVersionCompatible: true,
    migrationLedgerReconciled: true,
    releaseReady: true,
    schemaCompatible: true,
    injectedPrivateContent: PRIVATE_CONTENT,
    ...overrides,
  };
}

async function withServer(handler, callback) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    return await callback(origin);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function defaultHandler({
  health = () => ({ status: 200, body: healthBody() }),
  version = () => ({ status: 200, body: versionBody() }),
  publicStatus = () => 200,
  invalidJsonPath = null,
} = {}) {
  let healthRequests = 0;
  return (request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    if (path === "/api/health") {
      healthRequests += 1;
      if (invalidJsonPath === path) {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end("not-json");
        return;
      }
      const result = health(healthRequests);
      sendJson(response, result.status, result.body);
      return;
    }
    if (path === "/api/version") {
      if (invalidJsonPath === path) {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end("not-json");
        return;
      }
      const result = version(healthRequests);
      sendJson(response, result.status, result.body);
      return;
    }
    const status = publicStatus(path, healthRequests);
    response.writeHead(status, { "Content-Type": "text/html" });
    response.end(`<html><body>${PRIVATE_CONTENT}</body></html>`);
  };
}

async function runCase(handler, {
  maxAttempts = 1,
  retryDelayMs = 0,
  requestTimeoutMs = null,
} = {}) {
  return withServer(handler, async (origin) => {
    const directory = await mkdtemp(join(tmpdir(), "pcs5a-"));
    const output = join(directory, "evidence.json");
    try {
      const parsed = parseOptions([
        "--url", origin,
        "--expected-commit", EXPECTED_COMMIT.toUpperCase(),
        "--expected-environment", "production",
        "--output", output,
        "--max-attempts", String(maxAttempts),
        "--retry-delay-ms", String(retryDelayMs),
      ], {});
      const options = requestTimeoutMs === null
        ? parsed
        : { ...parsed, requestTimeoutMs };
      const result = await runSynthetic(options);
      const evidenceText = await readFile(output, "utf8");
      return { ...result, evidenceText, output };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

function assertFailure(result, code) {
  assert.equal(result.passed, false);
  assert.equal(result.evidence.outcome, "failed");
  assert.equal(result.evidence.final_failure_code, code);
}

test("rejects malformed expected commit before network work", () => {
  assert.throws(
    () => parseOptions([
      "--url", "https://app.plaivra.com",
      "--expected-commit", "not-a-sha",
      "--expected-environment", "production",
      "--max-attempts", "1",
      "--retry-delay-ms", "0",
    ], {}),
    /INVALID_INPUT/,
  );
});

test("rejects unsafe non-local HTTP Production target", () => {
  assert.throws(
    () => parseOptions([
      "--url", "http://app.plaivra.com",
      "--expected-commit", EXPECTED_COMMIT,
      "--expected-environment", "production",
      "--max-attempts", "1",
      "--retry-delay-ms", "0",
    ], {}),
    /INVALID_INPUT/,
  );
});

test("passes when health, version, and public surfaces match", async () => {
  const result = await runCase(defaultHandler());
  assert.equal(result.passed, true);
  assert.equal(result.evidence.expected_commit, EXPECTED_COMMIT);
  assert.equal(result.evidence.attempt_count, 1);
  assert.deepEqual(
    result.evidence.attempts[0].endpoints.map((endpoint) => endpoint.path),
    ENDPOINT_PATHS,
  );
});

test("retries an initially stale commit and passes after convergence", async () => {
  const result = await runCase(defaultHandler({
    health: (attempt) => ({ status: 200, body: healthBody({ release: { commitSha: attempt === 1 ? STALE_COMMIT : EXPECTED_COMMIT } }) }),
    version: (attempt) => ({ status: 200, body: versionBody({ commitSha: attempt === 1 ? STALE_COMMIT : EXPECTED_COMMIT }) }),
  }), { maxAttempts: 3, retryDelayMs: 1 });
  assert.equal(result.passed, true);
  assert.equal(result.evidence.attempt_count, 2);
  assert.equal(result.evidence.attempts[0].failure_code, FAILURE_CODES.DEPLOYMENT_COMMIT_NOT_CONVERGED);
});

test("fails closed after bounded attempts when commit never converges", async () => {
  const result = await runCase(defaultHandler({
    health: () => ({ status: 200, body: healthBody({ release: { commitSha: STALE_COMMIT } }) }),
    version: () => ({ status: 200, body: versionBody({ commitSha: STALE_COMMIT }) }),
  }), { maxAttempts: 2, retryDelayMs: 1 });
  assertFailure(result, FAILURE_CODES.DEPLOYMENT_COMMIT_NOT_CONVERGED);
  assert.equal(result.evidence.attempt_count, 2);
});

test("fails when environment differs", async () => {
  const result = await runCase(defaultHandler({
    health: () => ({ status: 200, body: healthBody({ release: { environment: "preview" } }) }),
    version: () => ({ status: 200, body: versionBody({ environment: "preview" }) }),
  }));
  assertFailure(result, FAILURE_CODES.ENVIRONMENT_MISMATCH);
});

test("fails when release readiness is false", async () => {
  const result = await runCase(defaultHandler({
    version: () => ({ status: 200, body: versionBody({ releaseReady: false }) }),
  }));
  assertFailure(result, FAILURE_CODES.RELEASE_NOT_READY);
});

test("fails when schema identities disagree", async () => {
  const result = await runCase(defaultHandler({
    version: () => ({ status: 200, body: versionBody({ databaseSchemaCompatibilityVersion: "3" }) }),
  }));
  assertFailure(result, FAILURE_CODES.SCHEMA_IDENTITY_MISMATCH);
});

test("fails when migration identities disagree", async () => {
  const result = await runCase(defaultHandler({
    version: () => ({ status: 200, body: versionBody({ databaseMigrationVersion: "20260724232735" }) }),
  }));
  assertFailure(result, FAILURE_CODES.MIGRATION_IDENTITY_MISMATCH);
});

test("fails when migration ledger facts are not reconciled", async () => {
  const result = await runCase(defaultHandler({
    version: () => ({ status: 200, body: versionBody({ pendingMigrationCount: 1, migrationLedgerReconciled: false }) }),
  }));
  assertFailure(result, FAILURE_CODES.MIGRATION_LEDGER_NOT_RECONCILED);
});

test("fails when health and version release identities disagree", async () => {
  const result = await runCase(defaultHandler({
    version: () => ({ status: 200, body: versionBody({ commitSha: STALE_COMMIT }) }),
  }));
  assertFailure(result, FAILURE_CODES.HEALTH_VERSION_IDENTITY_MISMATCH);
});

test("fails on invalid JSON", async () => {
  const result = await runCase(defaultHandler({ invalidJsonPath: "/api/health" }));
  assertFailure(result, FAILURE_CODES.INVALID_JSON);
});

test("fails on unavailable public surface", async () => {
  const result = await runCase(defaultHandler({
    publicStatus: (path) => path === "/legal/terms" ? 503 : 200,
  }));
  assertFailure(result, FAILURE_CODES.PUBLIC_SURFACE_UNAVAILABLE);
});

test("writes sanitized evidence on success", async () => {
  const result = await runCase(defaultHandler());
  assert.match(result.evidenceText, /"outcome": "passed"/);
  assert.match(result.evidenceText, /"schema_version": "pcs5a-production-deployment-convergence-v1"/);
});

test("writes sanitized evidence on failure", async () => {
  const result = await runCase(defaultHandler({ invalidJsonPath: "/api/version" }));
  assert.match(result.evidenceText, /"outcome": "failed"/);
  assert.match(result.evidenceText, /"final_failure_code": "INVALID_JSON"/);
});

test("evidence excludes bodies and injected private content", async () => {
  const result = await runCase(defaultHandler());
  for (const forbidden of [
    PRIVATE_CONTENT,
    "secret@example.com",
    "private-token",
    "cookie=session",
    "Authorization",
    "/private?token=abc",
    "injectedPrivateContent",
  ]) {
    assert.equal(result.evidenceText.includes(forbidden), false, forbidden);
  }
  assert.equal(result.evidenceText.includes("<html>"), false);
});

test("durations and attempt counts are bounded numeric values", async () => {
  const result = await runCase(defaultHandler());
  assert.equal(Number.isSafeInteger(result.evidence.attempt_count), true);
  assert.equal(result.evidence.attempt_count >= 1 && result.evidence.attempt_count <= 30, true);
  assert.equal(Number.isSafeInteger(result.evidence.convergence_duration_ms), true);
  for (const attempt of result.evidence.attempts) {
    assert.equal(Number.isSafeInteger(attempt.duration_ms), true);
    assert.equal(attempt.duration_ms >= 0, true);
    for (const endpoint of attempt.endpoints) {
      assert.equal(Number.isSafeInteger(endpoint.duration_ms), true);
      assert.equal(endpoint.duration_ms >= 0 && endpoint.duration_ms <= 60_000, true);
    }
  }
});

test("runs all six endpoint timeouts concurrently within one request window", async () => {
  const attempted = [];
  const requestTimeoutMs = 80;
  const handler = (request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    attempted.push(path);
    setTimeout(() => {
      if (response.destroyed) return;
      if (path === "/api/health") {
        sendJson(response, 200, healthBody());
      } else if (path === "/api/version") {
        sendJson(response, 200, versionBody());
      } else {
        response.writeHead(200, { "Content-Type": "text/html" });
        response.end("<html>late</html>");
      }
    }, requestTimeoutMs * 4);
  };

  const startedAt = Date.now();
  const result = await runCase(handler, { requestTimeoutMs });
  const elapsed = Date.now() - startedAt;

  assertFailure(result, FAILURE_CODES.REQUEST_TIMEOUT);
  assert.deepEqual([...attempted].sort(), [...ENDPOINT_PATHS].sort());
  assert.deepEqual(
    result.evidence.attempts[0].endpoints.map((endpoint) => endpoint.path),
    ENDPOINT_PATHS,
  );
  assert.equal(
    result.evidence.attempts[0].endpoints.every(
      (endpoint) => endpoint.failure_code === FAILURE_CODES.REQUEST_TIMEOUT,
    ),
    true,
  );
  assert.equal(result.evidenceText.includes('"outcome": "failed"'), true);
  assert.ok(
    result.evidence.attempts[0].duration_ms < requestTimeoutMs * 4,
    `attempt duration ${result.evidence.attempts[0].duration_ms}ms exceeded concurrent bound`,
  );
  assert.ok(elapsed < requestTimeoutMs * 5, `total elapsed ${elapsed}ms exceeded concurrent bound`);
});

test("catches public response-body termination and writes sanitized failure evidence", async () => {
  const handler = (request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    if (path === "/api/health") {
      sendJson(response, 200, healthBody());
      return;
    }
    if (path === "/api/version") {
      sendJson(response, 200, versionBody());
      return;
    }
    if (path === "/legal/privacy") {
      response.writeHead(200, {
        "Content-Type": "text/html",
        "Content-Length": "4096",
      });
      response.write(`<html><body>${STREAM_PRIVATE_CONTENT}`);
      response.socket.destroy();
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end("<html><body>ok</body></html>");
  };

  const result = await runCase(handler, { requestTimeoutMs: 500 });
  assert.equal(result.passed, false);
  const endpoint = result.evidence.attempts[0].endpoints.find(
    (candidate) => candidate.path === "/legal/privacy",
  );
  assert.ok(endpoint);
  assert.ok([
    FAILURE_CODES.NETWORK_ERROR,
    FAILURE_CODES.REQUEST_TIMEOUT,
  ].includes(endpoint.failure_code));
  assert.match(result.evidenceText, /"outcome": "failed"/);
  for (const forbidden of [
    STREAM_PRIVATE_CONTENT,
    "stream-secret@example.com",
    "stream-private-token",
    "partial-private-content",
    "UND_ERR_SOCKET",
    "other side closed",
    "terminated",
  ]) {
    assert.equal(result.evidenceText.includes(forbidden), false, forbidden);
  }
});

test("workflow budget leaves material margin below the job timeout", async () => {
  const workflow = await readFile(workflowUrl, "utf8");
  const identity = workflow.match(
    /if \[\[ "\$\{\{ github\.event_name \}\}" == "push" \]\]; then\s+max_attempts=(\d+)\s+retry_delay_ms=(\d+)\s+else\s+max_attempts=(\d+)\s+retry_delay_ms=(\d+)\s+fi/s,
  );
  assert.ok(identity, "workflow retry identity block not found");
  const timeout = workflow.match(/timeout-minutes:\s*(\d+)/);
  assert.ok(timeout, "workflow timeout not found");

  const pushAttempts = Number(identity[1]);
  const pushDelayMs = Number(identity[2]);
  const continuityAttempts = Number(identity[3]);
  const continuityDelayMs = Number(identity[4]);
  const timeoutMinutes = Number(timeout[1]);

  assert.equal(pushAttempts, 16);
  assert.equal(pushDelayMs, 55_000);
  assert.equal(continuityAttempts, 3);
  assert.equal(continuityDelayMs, 10_000);
  assert.equal(timeoutMinutes, 25);

  const requestTimeoutMs = 15_000;
  const worstCaseSyntheticMs = (
    pushAttempts * requestTimeoutMs
    + (pushAttempts - 1) * pushDelayMs
  );
  const jobBudgetMs = timeoutMinutes * 60_000;
  const evidenceUploadMarginMs = jobBudgetMs - worstCaseSyntheticMs;

  assert.equal(worstCaseSyntheticMs, 1_065_000);
  assert.ok(
    evidenceUploadMarginMs >= 5 * 60_000,
    `expected material job margin, received ${evidenceUploadMarginMs}ms`,
  );
});

test("workflow preserves scheduled continuity and adds exact main convergence", async () => {
  const workflow = await readFile(workflowUrl, "utf8");
  assert.match(workflow, /^name: Production uptime synthetic$/m);
  assert.match(workflow, /push:\n    branches:\n      - main/);
  assert.match(workflow, /schedule:\n    - cron: "23 \* \* \* \*"/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /node-version: 24/);
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /git rev-parse HEAD/);
  assert.match(workflow, /--expected-commit \$\{\{ steps\.identity\.outputs\.expected_commit \}\}/);
  assert.match(workflow, /--expected-environment production/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /retention-days: 30/);
  assert.match(workflow, /cancel-in-progress: \$\{\{ github\.event_name == 'push' \}\}/);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./);
  assert.doesNotMatch(workflow, /supabase/i);
  assert.doesNotMatch(workflow, /vercel/i);
  assert.doesNotMatch(workflow, /post-deploy-smoke|smoke:authenticated/i);
  assert.doesNotMatch(workflow, /issues:\s*write|actions\/github-script|gh\s+workflow\s+run/i);
});
