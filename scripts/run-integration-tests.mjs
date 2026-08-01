#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
export const DEFAULT_INTEGRATION_DATABASE = "plaivra_ci_test";
export const DEFAULT_INTEGRATION_POSTGRES_IMAGE = "postgres:15-alpine";

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

export function resolveIntegrationDatabaseConfig(env = process.env) {
  const replayedDatabaseUrl = requireLocalPostgresUrl(
    env.PLAIVRA_AW2A_TEST_DATABASE_URL?.trim() || env.PLAIVRA_LOCAL_DATABASE_URL?.trim(),
    "PLAIVRA_AW2A_TEST_DATABASE_URL or PLAIVRA_LOCAL_DATABASE_URL",
  ).toString();

  if (env.DATABASE_URL?.trim()) {
    return {
      mode: "explicit",
      databaseUrl: requireLocalPostgresUrl(
        env.DATABASE_URL,
        "DATABASE_URL",
        { requireTestName: true },
      ).toString(),
      aw2aDatabaseUrl: replayedDatabaseUrl,
      databaseName: new URL(env.DATABASE_URL).pathname.replace(/^\//, ""),
      image: null,
    };
  }

  return {
    mode: "docker",
    databaseUrl: null,
    aw2aDatabaseUrl: replayedDatabaseUrl,
    databaseName: DEFAULT_INTEGRATION_DATABASE,
    image: env.PLAIVRA_INTEGRATION_POSTGRES_IMAGE?.trim() || DEFAULT_INTEGRATION_POSTGRES_IMAGE,
  };
}

export function parsePublishedPostgresPort(value) {
  const match = String(value ?? "").trim().match(/(?:127\.0\.0\.1|0\.0\.0\.0|\[::\]|::):(\d+)$/);
  if (!match) throw new Error(`Unable to resolve the disposable PostgreSQL port from: ${value}`);
  const port = Number(match[1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid disposable PostgreSQL port: ${match[1]}`);
  }
  return port;
}

function docker(args, options = {}) {
  return execFileSync("docker", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
}

async function waitForDisposablePostgres(containerName) {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    const readiness = spawnSync(
      "docker",
      ["exec", containerName, "pg_isready", "-U", "postgres", "-d", DEFAULT_INTEGRATION_DATABASE],
      { cwd: process.cwd(), encoding: "utf8", stdio: "pipe" },
    );
    if (readiness.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Disposable PostgreSQL did not become ready within 60 seconds.");
}

export async function startDisposablePostgres(config) {
  if (config.mode !== "docker") {
    return { containerName: null, databaseUrl: config.databaseUrl };
  }

  const containerName = `plaivra-integration-postgres-${process.pid}-${Date.now()}`;
  try {
    docker([
      "run",
      "--detach",
      "--rm",
      "--name",
      containerName,
      "--env",
      "POSTGRES_PASSWORD=postgres",
      "--env",
      `POSTGRES_DB=${DEFAULT_INTEGRATION_DATABASE}`,
      "--publish",
      "127.0.0.1::5432",
      config.image,
    ]);
    await waitForDisposablePostgres(containerName);
    const port = parsePublishedPostgresPort(docker(["port", containerName, "5432/tcp"]));
    return {
      containerName,
      databaseUrl: `postgresql://postgres:postgres@127.0.0.1:${port}/${DEFAULT_INTEGRATION_DATABASE}`,
    };
  } catch (error) {
    try {
      docker(["rm", "--force", containerName]);
    } catch {
      // Preserve the original startup failure.
    }
    throw error;
  }
}

export function stopDisposablePostgres(containerName) {
  if (!containerName) return;
  docker(["rm", "--force", containerName]);
}

async function main() {
  const config = resolveIntegrationDatabaseConfig();
  const disposable = await startDisposablePostgres(config);
  const executable = process.execPath;
  const args = [
    resolve("node_modules/vitest/vitest.mjs"),
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
        DATABASE_URL: disposable.databaseUrl,
        PLAIVRA_AW2A_TEST_DATABASE_URL: config.aw2aDatabaseUrl,
      },
    });
  } finally {
    stopDisposablePostgres(disposable.containerName);
  }

  if (result?.error) throw result.error;
  process.exitCode = result?.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
