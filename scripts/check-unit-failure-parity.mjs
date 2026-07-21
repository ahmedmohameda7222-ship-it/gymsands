#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";

function parseArguments(argv) {
  const result = {
    base: null,
    outputDir: "quality-reports",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--base") {
      result.base = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (argument === "--output-dir") {
      result.outputDir = argv[index + 1] ?? result.outputDir;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!result.base) {
    throw new Error("--base <commit-sha> is required.");
  }

  return result;
}

function runVitest(cwd, outputFile) {
  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    [
      "vitest",
      "run",
      "--config",
      "vitest.unit.config.mjs",
      "--reporter=json",
      `--outputFile=${outputFile}`,
    ],
    {
      cwd,
      encoding: "utf8",
      env: process.env,
      stdio: ["ignore", "inherit", "inherit"],
    },
  );

  if (result.error) throw result.error;
  return result.status ?? 1;
}

function loadReport(path) {
  if (!existsSync(path)) {
    throw new Error(`Missing Vitest JSON report: ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function failedIdentities(report) {
  const identities = [];
  for (const file of report.testResults ?? []) {
    for (const assertion of file.assertionResults ?? []) {
      if (assertion.status !== "failed") continue;
      identities.push(
        assertion.fullName
          ?? [...(assertion.ancestorTitles ?? []), assertion.title]
            .filter(Boolean)
            .join(" > "),
      );
    }
  }
  return [...new Set(identities)].sort();
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function main() {
  const { base, outputDir } = parseArguments(process.argv.slice(2));
  const repositoryRoot = git("rev-parse", "--show-toplevel");
  const resolvedOutputDir = isAbsolute(outputDir)
    ? outputDir
    : resolve(repositoryRoot, outputDir);
  mkdirSync(resolvedOutputDir, { recursive: true });

  const headReportPath = join(resolvedOutputDir, "head-unit.json");
  const baseReportPath = join(resolvedOutputDir, "base-unit.json");
  const parityReportPath = join(resolvedOutputDir, "unit-failure-parity.json");
  const baseWorktreeRoot = mkdtempSync(join(tmpdir(), "plaivra-unit-parity-base-"));
  const baseWorktree = join(baseWorktreeRoot, "repository");

  let baseWorktreeAdded = false;
  try {
    const headStatus = runVitest(repositoryRoot, headReportPath);

    execFileSync("git", ["worktree", "add", "--detach", baseWorktree, base], {
      cwd: repositoryRoot,
      stdio: "inherit",
    });
    baseWorktreeAdded = true;

    const headNodeModules = join(repositoryRoot, "node_modules");
    const baseNodeModules = join(baseWorktree, "node_modules");
    if (!existsSync(headNodeModules)) {
      throw new Error(`Missing installed dependencies: ${headNodeModules}`);
    }
    symlinkSync(headNodeModules, baseNodeModules, "dir");

    const baseStatus = runVitest(baseWorktree, baseReportPath);
    const headReport = loadReport(headReportPath);
    const baseReport = loadReport(baseReportPath);
    const headFailures = failedIdentities(headReport);
    const baseFailures = failedIdentities(baseReport);
    const introduced = headFailures.filter((identity) => !baseFailures.includes(identity));
    const removed = baseFailures.filter((identity) => !headFailures.includes(identity));
    const passed = introduced.length === 0 && removed.length === 0;

    const summary = {
      headSha: process.env.PLAIVRA_COMMIT_SHA ?? git("rev-parse", "HEAD"),
      baseSha: base,
      headExitStatus: headStatus,
      baseExitStatus: baseStatus,
      headTotalTests: headReport.numTotalTests ?? null,
      baseTotalTests: baseReport.numTotalTests ?? null,
      headFailedTests: headReport.numFailedTests ?? headFailures.length,
      baseFailedTests: baseReport.numFailedTests ?? baseFailures.length,
      headFailureIdentities: headFailures,
      baseFailureIdentities: baseFailures,
      introducedFailureIdentities: introduced,
      removedFailureIdentities: removed,
      passed,
    };

    writeFileSync(parityReportPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

    if (!passed) process.exitCode = 1;
  } finally {
    if (baseWorktreeAdded) {
      try {
        execFileSync("git", ["worktree", "remove", "--force", baseWorktree], {
          cwd: repositoryRoot,
          stdio: "inherit",
        });
      } catch (error) {
        process.stderr.write(`Failed to remove temporary base worktree: ${String(error)}\n`);
      }
    }
    rmSync(baseWorktreeRoot, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
}
