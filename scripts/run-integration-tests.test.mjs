import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_INTEGRATION_DATABASE,
  DEFAULT_INTEGRATION_POSTGRES_IMAGE,
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
