#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";
import { exactCommit, exactTimestamp, safeRelativePath } from "./quality-evidence-contract.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const options = {
    reportsDir: "quality-reports",
    commit: process.env.PLAIVRA_COMMIT_SHA,
    buildTimestamp: process.env.PLAIVRA_QUALITY_BUILD_TIMESTAMP,
  };
  let index = 0;
  for (; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") {
      index += 1;
      break;
    }
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    if (key === "name") options.name = value;
    else if (key === "reports-dir") options.reportsDir = value;
    else if (key === "commit") options.commit = value;
    else if (key === "build-timestamp") options.buildTimestamp = value;
    else throw new Error(`Unknown option: --${key}`);
    index += 1;
  }
  const command = argv.slice(index);
  if (!options.name) throw new Error("--name is required.");
  if (command.length === 0) throw new Error("A command is required after --.");
  return { ...options, command };
}

function atomicWrite(path, content) {
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporary, content, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, path);
}

export async function runQualityGate({
  name,
  reportsDir = "quality-reports",
  commit,
  buildTimestamp,
  command,
  cwd = root,
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
}) {
  const safeName = safeRelativePath(name, "Gate evidence name");
  if (safeName.includes("/")) throw new Error("Gate evidence name must not contain a directory separator.");
  const exactReviewedCommit = exactCommit(commit, "Gate commit");
  const qualityBuildTimestamp = exactTimestamp(buildTimestamp, "Quality build timestamp");
  if (!Array.isArray(command) || command.length === 0 || command.some((part) => typeof part !== "string")) {
    throw new Error("Gate command must be a non-empty string array.");
  }

  const reportsPath = isAbsolute(reportsDir) ? reportsDir : resolve(cwd, reportsDir);
  mkdirSync(reportsPath, { recursive: true });
  const logPath = resolve(reportsPath, `${safeName}.log`);
  const exitPath = resolve(reportsPath, `${safeName}.exit`);
  const metaPath = resolve(reportsPath, `${safeName}.meta.json`);
  const temporaryLog = `${logPath}.tmp-${process.pid}-${Date.now()}`;
  for (const path of [exitPath, metaPath]) rmSync(path, { force: true });

  const capturedAtStart = new Date().toISOString();
  const logStream = createWriteStream(temporaryLog, { flags: "wx", mode: 0o600 });
  logStream.write(`Quality gate: ${safeName}\n`);
  logStream.write(`Reviewed commit: ${exactReviewedCommit}\n`);
  logStream.write(`Started at: ${capturedAtStart}\n\n`);

  let exitCode = 1;
  let spawnError = null;
  try {
    exitCode = await new Promise((resolveExit) => {
      let settled = false;
      const finish = (code) => {
        if (settled) return;
        settled = true;
        resolveExit(code);
      };
      const child = spawn(command[0], command.slice(1), {
        cwd,
        env,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.on("data", (chunk) => {
        stdout.write(chunk);
        logStream.write(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr.write(chunk);
        logStream.write(chunk);
      });
      child.on("error", (error) => {
        spawnError = error;
        const message = `${error.stack ?? error.message}\n`;
        stderr.write(message);
        logStream.write(message);
        finish(1);
      });
      child.on("close", (code, signal) => {
        if (!settled && signal) logStream.write(`\nTerminated by signal: ${signal}\n`);
        finish(Number.isInteger(code) ? code : 1);
      });
    });
  } finally {
    const capturedAt = new Date().toISOString();
    logStream.write(`\nCompleted at: ${capturedAt}\nExit code: ${exitCode}\n`);
    await new Promise((resolveClose, rejectClose) => {
      logStream.on("error", rejectClose);
      logStream.end(resolveClose);
    });
    renameSync(temporaryLog, logPath);
    atomicWrite(exitPath, `${exitCode}\n`);
    atomicWrite(metaPath, `${JSON.stringify({
      schemaVersion: 1,
      name: safeName,
      commitSha: exactReviewedCommit,
      qualityBuildTimestamp,
      startedAt: capturedAtStart,
      capturedAt,
      executable: command[0],
      argumentCount: command.length - 1,
      exitCode,
      passed: exitCode === 0,
      spawnError: spawnError ? spawnError.name : null,
    }, null, 2)}\n`);
  }

  return {
    name: safeName,
    exitCode,
    passed: exitCode === 0,
    logPath,
    exitPath,
    metaPath,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runQualityGate(options);
  if (!result.passed) process.exitCode = result.exitCode || 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
