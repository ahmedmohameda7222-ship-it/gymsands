#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
export const DEFAULT_INTEGRATION_DATABASE = "plaivra_ci_test";
export const DEFAULT_INTEGRATION_POSTGRES_IMAGE = "postgres:15-alpine";
const MAX_DOCKER_ATTEMPTS = 2;

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

export function buildDisposablePostgresArgs(containerName, image) {
  return [
    "run",
    "--detach",
    "--name",
    containerName,
    "--label",
    "plaivra.scope=integration-test",
    "--env",
    "POSTGRES_PASSWORD=postgres",
    "--env",
    `POSTGRES_DB=${DEFAULT_INTEGRATION_DATABASE}`,
    "--health-cmd",
    `pg_isready -U postgres -d ${DEFAULT_INTEGRATION_DATABASE}`,
    "--health-interval",
    "1s",
    "--health-timeout",
    "5s",
    "--health-retries",
    "30",
    "--publish",
    "127.0.0.1::5432",
    image,
  ];
}

export function isRetryableContainerState(state) {
  if (!state || typeof state !== "object") return false;
  return state.Running === false || state.Health?.Status === "unhealthy";
}

function docker(args, options = {}) {
  return execFileSync("docker", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
}

function dockerBestEffort(args) {
  return spawnSync("docker", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: "pipe",
  });
}

async function waitForDisposablePostgres(containerName) {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    const readiness = dockerBestEffort([
      "exec",
      containerName,
      "pg_isready",
      "-U",
      "postgres",
      "-d",
      DEFAULT_INTEGRATION_DATABASE,
    ]);
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
    docker(buildDisposablePostgresArgs(containerName, config.image));
    await waitForDisposablePostgres(containerName);
    const port = parsePublishedPostgresPort(docker(["port", containerName, "5432/tcp"]));
    return {
      containerName,
      databaseUrl: `postgresql://postgres:postgres@127.0.0.1:${port}/${DEFAULT_INTEGRATION_DATABASE}`,
    };
  } catch (error) {
    dockerBestEffort(["rm", "--force", containerName]);
    throw error;
  }
}

export function stopDisposablePostgres(containerName) {
  if (!containerName) return;
  const result = dockerBestEffort(["rm", "--force", containerName]);
  if (result.error) throw result.error;
  if (result.status !== 0 && !result.stderr.includes("No such container")) {
    throw new Error(`Unable to remove disposable PostgreSQL container ${containerName}: ${result.stderr.trim()}`);
  }
}

function inspectDisposablePostgres(containerName) {
  if (!containerName) return { available: false, state: null, error: "explicit database mode" };
  const result = dockerBestEffort(["inspect", "--format", "{{json .State}}", containerName]);
  if (result.error) {
    return { available: false, state: null, error: result.error.message };
  }
  if (result.status !== 0) {
    return { available: false, state: null, error: result.stderr.trim() || `docker inspect exited ${result.status}` };
  }
  try {
    return { available: true, state: JSON.parse(result.stdout.trim()), error: null };
  } catch (error) {
    return {
      available: false,
      state: null,
      error: `Invalid docker inspect JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function collectDisposablePostgresDiagnostics(containerName, attempt) {
  const inspect = inspectDisposablePostgres(containerName);
  const logsResult = containerName
    ? dockerBestEffort(["logs", "--timestamps", containerName])
    : { status: null, stdout: "", stderr: "" };
  const diagnostics = {
    attempt,
    containerName,
    collectedAt: new Date().toISOString(),
    inspect,
    logsExitCode: logsResult.status,
  };

  process.stderr.write(`\n=== Disposable PostgreSQL diagnostics (attempt ${attempt}) ===\n`);
  process.stderr.write(`${JSON.stringify(diagnostics, null, 2)}\n`);
  if (logsResult.stdout) process.stderr.write(`--- docker logs stdout ---\n${logsResult.stdout}\n`);
  if (logsResult.stderr) process.stderr.write(`--- docker logs stderr ---\n${logsResult.stderr}\n`);
  process.stderr.write("=== End disposable PostgreSQL diagnostics ===\n");
  return diagnostics;
}

function runVitest(databaseUrl, aw2aDatabaseUrl) {
  const executable = process.execPath;
  const args = [
    resolve("node_modules/vitest/vitest.mjs"),
    "run",
    "--config",
    "vitest.integration.config.mjs",
    ...process.argv.slice(2),
  ];

  return spawnSync(executable, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      PLAIVRA_AW2A_TEST_DATABASE_URL: aw2aDatabaseUrl,
    },
  });
}

async function main() {
  const config = resolveIntegrationDatabaseConfig();
  const maximumAttempts = config.mode === "docker" ? MAX_DOCKER_ATTEMPTS : 1;
  let finalResult;

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    const disposable = await startDisposablePostgres(config);
    let result;
    let cleanupError;
    try {
      result = runVitest(disposable.databaseUrl, config.aw2aDatabaseUrl);
      const failed = Boolean(result.error) || result.status !== 0;
      if (failed) {
        const diagnostics = collectDisposablePostgresDiagnostics(disposable.containerName, attempt);
        const retryable =
          config.mode === "docker" &&
          attempt < maximumAttempts &&
          diagnostics.inspect.available &&
          isRetryableContainerState(diagnostics.inspect.state);
        if (retryable) {
          process.stderr.write(
            `Disposable PostgreSQL terminated during integration attempt ${attempt}; retrying once with a fresh isolated container.\n`,
          );
          continue;
        }
      }
      finalResult = result;
      break;
    } finally {
      try {
        stopDisposablePostgres(disposable.containerName);
      } catch (error) {
        cleanupError = error;
        process.stderr.write(
          `Disposable PostgreSQL cleanup failed: ${error instanceof Error ? error.message : String(error)}\n`,
        );
      }
      if (cleanupError && result && !result.error && result.status === 0) throw cleanupError;
    }
  }

  if (finalResult?.error) throw finalResult.error;
  process.exitCode = finalResult?.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
