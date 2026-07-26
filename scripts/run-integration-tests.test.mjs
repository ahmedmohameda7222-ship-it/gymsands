import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_INTEGRATION_DATABASE,
  buildDisposableDatabaseUrl,
  requireLocalPostgresUrl,
  resolveIntegrationDatabaseConfig,
} from "./run-integration-tests.mjs";

test("builds a clearly disposable loopback integration database URL", () => {
  const url = buildDisposableDatabaseUrl("postgresql://postgres:postgres@127.0.0.1:54322/postgres");
  assert.equal(new URL(url).pathname, `/${DEFAULT_INTEGRATION_DATABASE}`);
  assert.equal(new URL(url).hostname, "127.0.0.1");
});

test("rejects remote or ambiguously named test databases", () => {
  assert.throws(
    () => requireLocalPostgresUrl("postgresql://postgres:secret@db.example.com/app_test", "DATABASE_URL", { requireTestName: true }),
    /loopback/,
  );
  assert.throws(
    () => requireLocalPostgresUrl("postgresql://postgres:postgres@127.0.0.1:54322/app", "DATABASE_URL", { requireTestName: true }),
    /clearly disposable test database/,
  );
});

test("CI local database authority provisions a separate test database and preserves the replayed AW-2A URL", () => {
  const config = resolveIntegrationDatabaseConfig({
    PLAIVRA_LOCAL_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    PLAIVRA_AW2A_TEST_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  });

  assert.equal(config.provision, true);
  assert.equal(config.databaseName, DEFAULT_INTEGRATION_DATABASE);
  assert.equal(new URL(config.databaseUrl).pathname, `/${DEFAULT_INTEGRATION_DATABASE}`);
  assert.equal(new URL(config.aw2aDatabaseUrl).pathname, "/postgres");
});

test("explicit local test and AW-2A URLs run without automatic database replacement", () => {
  const config = resolveIntegrationDatabaseConfig({
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/manual_test",
    PLAIVRA_AW2A_TEST_DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/replayed",
  });

  assert.equal(config.provision, false);
  assert.equal(config.databaseName, "manual_test");
  assert.equal(new URL(config.aw2aDatabaseUrl).pathname, "/replayed");
});

test("integration execution fails closed when neither database authority is supplied", () => {
  assert.throws(() => resolveIntegrationDatabaseConfig({}), /DATABASE_URL is required/);
});
