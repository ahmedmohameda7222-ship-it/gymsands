#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import process from "node:process";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
export const DEFAULT_INTEGRATION_DATABASE = "plaivra_ci_test";

export function requireLocalPostgresUrl(value, label, { requireTestName = false } = {}) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${label} must be a valid PostgreSQL URL.`);
  }

  if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)) {
    throw new Error(`${label} must use the postgres or postgresql protocol.`);
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`${label} must target localhost or a loopback address.`);
  }

  const databaseName = url.pathname.replace(/^\//, "");
  if (!databaseName) throw new Error(`${label} must include a database name.`);
  if (requireTestName && !/(^|[_-])test($|[_-])/i.test(databaseName)) {
    throw new Error(`${label} must name a clearly disposable test database.`);
  }

  return url;
}

export function buildDisposableDatabaseUrl(adminDatabaseUrl, databaseName = DEFAULT_INTEGRATION_DATABASE) {
  if (!/(^|[_-])test($|[_-])/i.test(databaseName)) {
    throw new Error("Disposable integration database names must contain the token 'test'.");
  }
  const url = requireLocalPostgresUrl(adminDatabaseUrl, "Integration database administrator URL");
  if (url.pathname.replace(/^\//, "") === databaseName) {
    throw new Error("The administrator database and disposable integration database must be different.");
  }
  url.pathname = `/${databaseName}`;
  return url.toString();
}

export function resolveIntegrationDatabaseConfig(env = process.env) {
  const localAdmin = env.PLAIVRA_LOCAL_DATABASE_URL?.trim();

  if (localAdmin) {
    const adminUrl = requireLocalPostgresUrl(localAdmin, "PLAIVRA_LOCAL_DATABASE_URL").toString();
    const aw2aUrl = requireLocalPostgresUrl(
      env.PLAIVRA_AW2A_TEST_DATABASE_URL?.trim() || adminUrl,
      "PLAIVRA_AW2A_TEST_DATABASE_URL",
    ).toString();
    return {
      provision: true,
      adminDatabaseUrl: adminUrl,
      databaseUrl: buildDisposableDatabaseUrl(adminUrl),
      aw2aDatabaseUrl: aw2aUrl,
      databaseName: DEFAULT_INTEGRATION_DATABASE,
    };
  }

  const explicitDatabaseUrl = requireLocalPostgresUrl(
    env.DATABASE_URL,
    "DATABASE_URL",
    { requireTestName: true },
  ).toString();
  const aw2aDatabaseUrl = requireLocalPostgresUrl(
    env.PLAIVRA_AW2A_TEST_DATABASE_URL,
    "PLAIVRA_AW2A_TEST_DATABASE_URL",
  ).toString();

  return {
    provision: false,
    adminDatabaseUrl: null,
    databaseUrl: explicitDatabaseUrl,
    aw2aDatabaseUrl,
    databaseName: new URL(explicitDatabaseUrl).pathname.replace(/^\//, ""),
  };
}

function runPsql(databaseUrl, sql) {
  execFileSync(
    "psql",
    [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-c", sql],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD ?? "postgres" },
      stdio: "pipe",
    },
  );
}

export function provisionDisposableDatabase(config) {
  if (!config.provision || !config.adminDatabaseUrl) return;
  runPsql(config.adminDatabaseUrl, `drop database if exists ${config.databaseName} with (force);`);
  runPsql(config.adminDatabaseUrl, `create database ${config.databaseName} template template0 encoding 'UTF8';`);
}

export function removeDisposableDatabase(config) {
  if (!config.provision || !config.adminDatabaseUrl) return;
  runPsql(config.adminDatabaseUrl, `drop database if exists ${config.databaseName} with (force);`);
}

function main() {
  const config = resolveIntegrationDatabaseConfig();
  provisionDisposableDatabase(config);

  const executable = process.platform === "win32" ? "npx.cmd" : "npx";
  const args = [
    "vitest",
    "run",
    "--config",
    "vitest.integration.config.mjs",
    ...process.argv.slice(2),
  ];

  let result;
  try {
    result = spawnSync(executable, args, {
      cwd: process.cwd(),
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: config.databaseUrl,
        PLAIVRA_AW2A_TEST_DATABASE_URL: config.aw2aDatabaseUrl,
      },
    });
  } finally {
    removeDisposableDatabase(config);
  }

  if (result?.error) throw result.error;
  process.exitCode = result?.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
