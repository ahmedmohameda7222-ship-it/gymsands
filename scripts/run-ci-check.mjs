#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function parseArgs(argv) {
  const options = { reportsDir: "ci-reports", tailLines: 120 };
  let index = 0;
  for (; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") {
      index += 1;
      break;
    }
    const value = argv[index + 1];
    if (argument === "--name") options.name = value;
    else if (argument === "--reports-dir") options.reportsDir = value;
    else if (argument === "--tail-lines") options.tailLines = Number(value);
    else throw new Error(`Unknown option: ${argument}`);
    index += 1;
  }
  const command = argv.slice(index);
  if (!options.name || !/^[a-z0-9][a-z0-9._-]*$/i.test(options.name)) throw new Error("--name is required and must be safe.");
  if (!Number.isInteger(options.tailLines) || options.tailLines < 20 || options.tailLines > 1000) {
    throw new Error("--tail-lines must be an integer between 20 and 1000.");
  }
  if (command.length === 0) throw new Error("A command is required after --.");
  return { ...options, command };
}

function appendTail(state, chunk, limit) {
  state.partial += chunk.toString("utf8");
  const lines = state.partial.split(/\r?\n/);
  state.partial = lines.pop() ?? "";
  state.lines.push(...lines);
  if (state.lines.length > limit) state.lines.splice(0, state.lines.length - limit);
}

export async function runCiCheck({
  name,
  command,
  reportsDir = "ci-reports",
  tailLines = 120,
  cwd = process.cwd(),
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
}) {
  const reportsPath = resolve(cwd, reportsDir);
  mkdirSync(reportsPath, { recursive: true });
  const logPath = resolve(reportsPath, `${name}.log`);
  const summaryPath = resolve(reportsPath, `${name}-failure-summary.txt`);
  const log = createWriteStream(logPath, { flags: "w", mode: 0o600 });
  const tail = { lines: [], partial: "" };
  const startedAt = new Date().toISOString();
  log.write(`CI check: ${name}\nStarted: ${startedAt}\nCommand: ${command.join(" ")}\n\n`);

  let spawnError = null;
  const exitCode = await new Promise((resolveExit) => {
    const child = spawn(command[0], command.slice(1), {
      cwd,
      env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    for (const stream of [child.stdout, child.stderr]) {
      stream.on("data", (chunk) => {
        log.write(chunk);
        appendTail(tail, chunk, tailLines);
      });
    }
    child.on("error", (error) => {
      spawnError = error;
      const message = `${error.stack ?? error.message}\n`;
      log.write(message);
      appendTail(tail, Buffer.from(message), tailLines);
      resolveExit(1);
    });
    child.on("close", (code) => resolveExit(Number.isInteger(code) ? code : 1));
  });

  if (tail.partial) tail.lines.push(tail.partial);
  const completedAt = new Date().toISOString();
  log.write(`\nCompleted: ${completedAt}\nExit code: ${exitCode}\n`);
  await new Promise((resolveClose, rejectClose) => {
    log.on("error", rejectClose);
    log.end(resolveClose);
  });

  if (exitCode === 0 && !spawnError) {
    stdout.write(`PASS ${name}\n`);
    return { passed: true, exitCode: 0, logPath, summaryPath: null };
  }

  const summary = [
    `FAILED CHECK: ${name}`,
    `COMMAND: ${command.join(" ")}`,
    `EXIT CODE: ${exitCode}`,
    `FULL LOG ARTIFACT: ${reportsDir}/${name}.log`,
    "",
    `LAST ${Math.min(tail.lines.length, tailLines)} RELEVANT LINES:`,
    ...tail.lines.slice(-tailLines),
    "",
  ].join("\n");
  writeFileSync(summaryPath, summary, { encoding: "utf8", mode: 0o600 });
  stderr.write(summary);
  return { passed: false, exitCode: exitCode || 1, logPath, summaryPath };
}

async function main() {
  const result = await runCiCheck(parseArgs(process.argv.slice(2)));
  if (!result.passed) process.exitCode = result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
