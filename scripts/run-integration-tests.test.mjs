import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_INTEGRATION_DATABASE,
  DEFAULT_INTEGRATION_POSTGRES_IMAGE,
  buildDisposablePostgresArgs,
  isRetryableContainerState,
  parsePublishedPostgresPort,
  requireLocalPostgresUrl,
  resolveIntegrationDatabaseConfig,
} from "./run-integration-tests.mjs";

test("rejects remote or ambiguously named explicit test databases", () => {
  assert.throws(
    () => requireLocalPostgresUrl("postgresql://postgres:secret@db.example.com/app_test", "DATABASE_URL", { requireTestName: true }),
    /loopback/,
  );
  assert.throws(
    () => requireLocalPostgresUrl("postgresql://postgres:postgres@127.0.0.1:54322/app", "DATABASE_URL", { requireTestName: true }),
    /clearly disposable test database/,
  );
});

test("CI local authority selects an isolated PostgreSQL container and preserves the replayed AW-2A URL", () => {
  const config = resolveIntegrationDatabaseConfig({
    PLAIVRA_LOCAL_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  });

  assert.equal(config.mode, "docker");
  assert.equal(config.databaseUrl, null);
  assert.equal(config.databaseName, DEFAULT_INTEGRATION_DATABASE);
  assert.equal(config.image, DEFAULT_INTEGRATION_POSTGRES_IMAGE);
  assert.equal(new URL(config.aw2aDatabaseUrl).pathname, "/postgres");
});

test("explicit local test and AW-2A URLs run without creating a container", () => {
  const config = resolveIntegrationDatabaseConfig({
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/manual_test",
    PLAIVRA_AW2A_TEST_DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/replayed",
  });

  assert.equal(config.mode, "explicit");
  assert.equal(config.databaseName, "manual_test");
  assert.equal(new URL(config.databaseUrl).pathname, "/manual_test");
  assert.equal(new URL(config.aw2aDatabaseUrl).pathname, "/replayed");
});

test("published Docker ports are parsed fail closed", () => {
  assert.equal(parsePublishedPostgresPort("127.0.0.1:49153\n"), 49153);
  assert.equal(parsePublishedPostgresPort("[::]:54329"), 54329);
  assert.throws(() => parsePublishedPostgresPort("not-a-port"), /Unable to resolve/);
  assert.throws(() => parsePublishedPostgresPort("127.0.0.1:70000"), /Invalid/);
});

test("integration execution fails closed without a replayed local database authority", () => {
  assert.throws(
    () => resolveIntegrationDatabaseConfig({}),
    /PLAIVRA_AW2A_TEST_DATABASE_URL or PLAIVRA_LOCAL_DATABASE_URL is required/,
  );
});

test("disposable PostgreSQL remains inspectable until explicit cleanup", () => {
  const args = buildDisposablePostgresArgs("plaivra-integration-postgres-test", DEFAULT_INTEGRATION_POSTGRES_IMAGE);
  assert.equal(args.includes("--rm"), false);
  assert.equal(args.includes("--health-cmd"), true);
  assert.equal(args.includes("plaivra.scope=integration-test"), true);
});

test("only proven container termination or unhealthy state is retryable", () => {
  assert.equal(isRetryableContainerState(null), false);
  assert.equal(isRetryableContainerState({ Running: true, Health: { Status: "healthy" } }), false);
  assert.equal(isRetryableContainerState({ Running: false, ExitCode: 0 }), true);
  assert.equal(isRetryableContainerState({ Running: false, ExitCode: 137, OOMKilled: true }), true);
  assert.equal(isRetryableContainerState({ Running: true, Health: { Status: "unhealthy" } }), true);
});

test("integration execution launches the installed Vitest entrypoint without a platform shell shim", () => {
  const runner = readFileSync(new URL("./run-integration-tests.mjs", import.meta.url), "utf8");
  assert.match(runner, /const executable = process\.execPath/);
  assert.match(runner, /resolve\("node_modules\/vitest\/vitest\.mjs"\)/);
  assert.match(runner, /collectDisposablePostgresDiagnostics/);
  assert.match(runner, /retrying once with a fresh isolated container/);
  assert.doesNotMatch(runner, /npx\.cmd/);
});
