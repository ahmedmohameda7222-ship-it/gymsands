#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SHA = /^[0-9a-f]{40}$/i;
const matchesAny = (path, patterns) => patterns.some((pattern) => pattern.test(path));

const DOC_PATTERNS = [
  /(^|\/)README\.md$/i,
  /^docs\//,
  /\.md$/i,
  /^\.github\/(ISSUE_TEMPLATE|PULL_REQUEST_TEMPLATE)\//,
];

const DATABASE_PATTERNS = [
  /^supabase\//,
  /^services\/database\//,
  /^services\/database[^/]*\.(?:ts|tsx|js|mjs)$/,
  /^types\/database[^/]*\.(?:ts|tsx)$/,
  /^scripts\/(?:check-migration-ledger|quality-ledger-target|replay-local-migration-chain|test-database-preflight-control|release-preflight|release-identity-contract)\.mjs$/,
  /^lib\/privacy\//,
];

const UI_PATTERNS = [
  /^app\//,
  /^components\//,
  /^public\//,
  /^lib\/(?:i18n|train|active-workout|workouts)\//,
  /(?:^|\/)(?:globals|theme)\.css$/,
  /(?:playwright|rendered-qa|train-layout-qa)/i,
];

const CI_PATTERNS = [
  /^\.github\/workflows\//,
  /^scripts\//,
  /^AGENTS\.md$/,
  /^CHATGPT_CODEX_PROMPT_RULES\.md$/,
  /^\.agents\//,
  /^(?:package|tsconfig|vitest|eslint|next|postcss|tailwind)[^/]*\.(?:json|js|mjs|cjs|ts)$/,
  /^\.nvmrc$/,
  /^\.node-version$/,
];

const RUNTIME_PATTERNS = [
  /^app\//,
  /^components\//,
  /^lib\//,
  /^services\//,
  /^types\//,
  /^public\//,
  /^middleware\.(?:ts|js)$/,
  /^next\.config\.(?:js|mjs|ts)$/,
];

const DEPENDENCY_PATTERNS = [/^package\.json$/, /^package-lock\.json$/];

export function classifyChangedPaths(inputPaths) {
  const paths = [...new Set(inputPaths
    .map((path) => String(path).trim().replaceAll("\\", "/"))
    .filter(Boolean))];

  if (paths.length === 0) {
    return {
      paths,
      docsOnly: false,
      core: true,
      database: true,
      ui: true,
      ci: true,
      build: true,
      dependencies: true,
      fallback: true,
    };
  }

  const docsOnly = paths.every((path) => matchesAny(path, DOC_PATTERNS));
  const database = paths.some((path) => matchesAny(path, DATABASE_PATTERNS));
  const ui = paths.some((path) => matchesAny(path, UI_PATTERNS));
  const ci = paths.some((path) => matchesAny(path, CI_PATTERNS));
  const runtime = paths.some((path) => matchesAny(path, RUNTIME_PATTERNS));
  const dependencies = paths.some((path) => matchesAny(path, DEPENDENCY_PATTERNS));
  const recognized = paths.every((path) => (
    matchesAny(path, DOC_PATTERNS)
    || matchesAny(path, DATABASE_PATTERNS)
    || matchesAny(path, UI_PATTERNS)
    || matchesAny(path, CI_PATTERNS)
    || matchesAny(path, RUNTIME_PATTERNS)
    || matchesAny(path, DEPENDENCY_PATTERNS)
  ));
  const fallback = !docsOnly && !recognized;

  return {
    paths,
    docsOnly,
    core: !docsOnly,
    database: database || fallback,
    ui: ui || fallback,
    ci: ci || fallback,
    build: runtime || dependencies || fallback,
    dependencies,
    fallback,
  };
}

function exactSha(value, label) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!SHA.test(normalized)) throw new Error(`${label} must be an exact 40-character commit SHA.`);
  return normalized;
}

function emit(result) {
  const values = {
    docs_only: result.docsOnly,
    core: result.core,
    database: result.database,
    ui: result.ui,
    ci: result.ci,
    build: result.build,
    dependencies: result.dependencies,
    fallback: result.fallback,
  };
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value ? "true" : "false"}`);
  lines.push(`changed_count=${result.paths.length}`);
  lines.push(`scope_summary=${JSON.stringify(values)}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`, "utf8");
  process.stdout.write(`${lines.join("\n")}\n`);
}

function main() {
  const base = exactSha(process.env.PLAIVRA_PR_BASE_SHA, "PR base");
  const head = exactSha(process.env.PLAIVRA_PR_HEAD_SHA, "PR head");
  const stdout = execFileSync("git", ["diff", "--name-only", "--diff-filter=ACMR", `${base}...${head}`], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  emit(classifyChangedPaths(stdout.split(/\r?\n/)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
