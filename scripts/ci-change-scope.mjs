#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SHA = /^[0-9a-f]{40}$/i;
const matchesAny = (path, patterns) => patterns.some((pattern) => pattern.test(path));
const isTestPath = (path) => /(^|\/)(?:__tests__\/|[^/]+\.(?:test|spec)\.[^/]+$)/i.test(path);
const isIntegrationTestPath = (path) => /\.integration\.(?:test|spec)\.[^/]+$/i.test(path);

const DOC_PATTERNS = [
  /(^|\/)README\.md$/i,
  /^docs\//,
  /\.md$/i,
  /^\.github\/(ISSUE_TEMPLATE|PULL_REQUEST_TEMPLATE)\//,
];

const MACHINE_DOCUMENT_CONTRACT_PATTERNS = [
  /^docs\/.*\.(?:json|ya?ml)$/i,
];

const DATABASE_DOCUMENT_CONTRACT_PATTERNS = [
  /^README\.md$/i,
  /^docs\/architecture\/migration-ledger-reconciliation\.md$/i,
];

const DATABASE_PATTERNS = [
  /^supabase\//,
  /^services\/database\//,
  /^services\/database[^/]*\.(?:ts|tsx|js|mjs)$/,
  /^types\/database[^/]*\.(?:ts|tsx)$/,
  /^scripts\/(?:check-migration-ledger|quality-ledger-target|replay-local-migration-chain(?:-legacy)?|run-database-verification|test-database-preflight-control|release-preflight|release-identity-contract)\.mjs$/,
  /^lib\/privacy\//,
];

const INTEGRATION_AUTHORITY_PATTERNS = [
  /^scripts\/run-integration-tests\.mjs$/,
  /^vitest\.integration\.config\.(?:js|mjs|cjs|ts)$/i,
];

const UI_PATTERNS = [
  /^app\//,
  /^components\//,
  /^messages\//,
  /^public\//,
  /^lib\/(?:i18n|train|active-workout|workouts)\//,
  /(?:^|\/)(?:globals|theme)\.css$/,
  /(?:playwright|rendered-qa|train-layout-qa)/i,
];

const STYLE_BUILD_PATTERNS = [
  /^(?:postcss|tailwind)\.config\.(?:js|mjs|cjs|ts)$/i,
];

const PERFORMANCE_BUILD_PATTERNS = [
  /^vercel\.json$/i,
  /^config\/performance-budgets\.json$/i,
];

const BUILD_AUTHORITY_PATTERNS = [
  ...STYLE_BUILD_PATTERNS,
  ...PERFORMANCE_BUILD_PATTERNS,
  /^scripts\/(?:validate-production-env|verify-built-release-metadata)\.mjs$/,
];

const BROAD_CI_AUTHORITY_PATTERNS = [
  /^\.github\/workflows\//,
  /^scripts\/(?:ci-change-scope|run-ci-check)\.mjs$/,
];

const CI_SELECTION_PATTERNS = [
  /^\.github\/workflows\//,
  /^\.gitignore$/,
  /^scripts\//,
  /^AGENTS\.md$/,
  /^(?:package|tsconfig|vitest|eslint|next|postcss|tailwind)[^/]*\.(?:json|js|mjs|cjs|ts)$/,
  ...PERFORMANCE_BUILD_PATTERNS,
  /^\.nvmrc$/,
  /^\.node-version$/,
];

const RECOGNIZED_CI_PATTERNS = [
  /^\.github\/workflows\//,
  /^\.gitignore$/,
  /^AGENTS\.md$/,
  /^(?:package|tsconfig|vitest|eslint|next|postcss|tailwind)[^/]*\.(?:json|js|mjs|cjs|ts)$/,
  ...PERFORMANCE_BUILD_PATTERNS,
  /^\.nvmrc$/,
  /^\.node-version$/,
];

const RUNTIME_PATTERNS = [
  /^app\//,
  /^components\//,
  /^lib\//,
  /^messages\//,
  /^services\//,
  /^types\//,
  /^public\//,
  /^middleware\.(?:ts|js)$/,
  /^next\.config\.(?:js|mjs|ts)$/,
];

const WORKOUT_HISTORY_RENDERED_PATTERNS = [
  /^components\/workouts\/history\//,
  /^lib\/workouts\/history\//,
  /^services\/workouts\/history\//,
  /^app\/api\/workouts\/history\//,
  /^app\/.*\/workout-history(?:\/|$)/,
  /^scripts\/run-workout-history-qa\.mjs$/,
];

const ACTIVE_WORKOUT_RENDERED_PATTERNS = [
  /^components\/workouts\/active-workout\//,
  /^components\/workouts\/active-workout-minimized-bar\.[^/]+$/,
  /^lib\/workouts\/session-engine\//,
  /^lib\/workouts\/active-session-store\//,
  /^lib\/workouts\/active-session-sync\//,
  /^services\/database\/active-session-[^/]+$/,
  /^services\/database\/workout-session-execution[^/]*$/,
  /^app\/.*\/active-workout(?:\/|$)/,
];

const TRAIN_RENDERED_PATTERNS = [
  /^components\/train\//,
  /^lib\/train\//,
  /^app\/.*\/train(?:\/|$)/,
  /^scripts\/run-train-layout-qa\.mjs$/,
];

const SHARED_RENDERED_PATTERNS = [
  /^app\/(?:\([^/]+\)\/)*(?:layout|loading|error|global-error|not-found)\.(?:ts|tsx|js|jsx)$/,
  /^components\/ui\//,
  /^components\/layout\//,
  /^messages\//,
  /^public\//,
  /(?:^|\/)(?:globals|theme)\.css$/,
  ...STYLE_BUILD_PATTERNS,
  /^scripts\/run-rendered-qa\.mjs$/,
];

const CENTRAL_RENDERED_AUTHORITY_PATTERNS = [
  /^\.github\/workflows\/pr-quality\.yml$/,
  /^scripts\/ci-change-scope\.mjs$/,
  /^scripts\/run-ci-check\.mjs$/,
];

const EXPLICIT_RENDERED_PATTERNS = [
  ...WORKOUT_HISTORY_RENDERED_PATTERNS,
  ...ACTIVE_WORKOUT_RENDERED_PATTERNS,
  ...TRAIN_RENDERED_PATTERNS,
  ...SHARED_RENDERED_PATTERNS,
  ...CENTRAL_RENDERED_AUTHORITY_PATTERNS,
];

const DEPENDENCY_LOCK_PATTERNS = [/^package-lock\.json$/];
const DEPENDENCY_MANIFEST_KEYS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
  "overrides",
  "resolutions",
  "packageManager",
];
const QA_VALIDATION_SCRIPT = /^(?:qa:|test(?::|$)|lint$|typecheck$|build$|prebuild$|validate:)/;

function parseManifest(value, label) {
  try {
    return JSON.parse(String(value));
  } catch {
    throw new Error(`${label} package.json is not valid JSON.`);
  }
}

export function dependencyManifestChanged(baseValue, headValue) {
  const base = parseManifest(baseValue, "Base");
  const head = parseManifest(headValue, "Head");
  return DEPENDENCY_MANIFEST_KEYS.some(
    (key) =>
      JSON.stringify(base[key] ?? null) !== JSON.stringify(head[key] ?? null),
  );
}

export function qaValidationScriptsChanged(baseValue, headValue) {
  const base = parseManifest(baseValue, "Base");
  const head = parseManifest(headValue, "Head");
  const names = new Set([
    ...Object.keys(base.scripts ?? {}),
    ...Object.keys(head.scripts ?? {}),
  ]);
  return [...names]
    .filter((name) => QA_VALIDATION_SCRIPT.test(name))
    .some(
      (name) =>
        String(base.scripts?.[name] ?? "") !== String(head.scripts?.[name] ?? ""),
    );
}

function renderedScopes(paths, { qaValidationScriptsChanged: packageQaChanged = false } = {}) {
  const implementationPaths = paths.filter((path) => !isTestPath(path));
  const central =
    packageQaChanged
    || implementationPaths.some((path) =>
      matchesAny(path, CENTRAL_RENDERED_AUTHORITY_PATTERNS)
    );
  const shared = central || implementationPaths.some((path) =>
    matchesAny(path, SHARED_RENDERED_PATTERNS)
  );
  const history = implementationPaths.some((path) =>
    matchesAny(path, WORKOUT_HISTORY_RENDERED_PATTERNS)
  );
  const active = implementationPaths.some((path) =>
    matchesAny(path, ACTIVE_WORKOUT_RENDERED_PATTERNS)
  );
  const train = implementationPaths.some((path) =>
    matchesAny(path, TRAIN_RENDERED_PATTERNS)
  );
  const genericUi = implementationPaths.some(
    (path) =>
      matchesAny(path, UI_PATTERNS)
      && !matchesAny(path, EXPLICIT_RENDERED_PATTERNS),
  );

  if (shared || genericUi) {
    return {
      renderedGeneral: true,
      renderedTrain: true,
      renderedActiveWorkout: true,
      renderedWorkoutHistory: true,
    };
  }

  return {
    renderedGeneral: false,
    renderedTrain: train,
    renderedActiveWorkout: active,
    renderedWorkoutHistory: history,
  };
}

export function classifyChangedPaths(
  inputPaths,
  {
    dependencyManifestChanged: manifestDependenciesChanged = false,
    qaValidationScriptsChanged: packageQaChanged = false,
  } = {},
) {
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
      renderedGeneral: true,
      renderedTrain: true,
      renderedActiveWorkout: true,
      renderedWorkoutHistory: true,
    };
  }

  const machineDocumentContract = paths.some((path) => matchesAny(path, MACHINE_DOCUMENT_CONTRACT_PATTERNS));
  const databaseDocumentContract = paths.some((path) => matchesAny(path, DATABASE_DOCUMENT_CONTRACT_PATTERNS));
  const docsOnly = !machineDocumentContract
    && !databaseDocumentContract
    && paths.every((path) => matchesAny(path, DOC_PATTERNS));
  const database = databaseDocumentContract || paths.some((path) => matchesAny(path, DATABASE_PATTERNS));
  const integrationAuthority = manifestDependenciesChanged
    || paths.some((path) => matchesAny(path, INTEGRATION_AUTHORITY_PATTERNS));
  const integrationTest = paths.some((path) => isIntegrationTestPath(path));
  const styleBuild = paths.some((path) => matchesAny(path, STYLE_BUILD_PATTERNS));
  const buildAuthority = paths.some((path) => matchesAny(path, BUILD_AUTHORITY_PATTERNS));
  const broadCiAuthority = paths.some((path) => matchesAny(path, BROAD_CI_AUTHORITY_PATTERNS));
  const selectedRendered = docsOnly
    ? {
        renderedGeneral: false,
        renderedTrain: false,
        renderedActiveWorkout: false,
        renderedWorkoutHistory: false,
      }
    : renderedScopes(paths, { qaValidationScriptsChanged: packageQaChanged });
  const anyRendered = Object.values(selectedRendered).some(Boolean);
  const ui = anyRendered
    || styleBuild
    || broadCiAuthority
    || paths.some((path) => !isTestPath(path) && matchesAny(path, UI_PATTERNS));
  const ci = paths.some((path) => matchesAny(path, CI_SELECTION_PATTERNS));
  const runtime = buildAuthority || broadCiAuthority || paths.some((path) => !isTestPath(path) && matchesAny(path, RUNTIME_PATTERNS));
  const dependencies = manifestDependenciesChanged
    || paths.some((path) => matchesAny(path, DEPENDENCY_LOCK_PATTERNS));
  const recognized = paths.every((path) => (
    isTestPath(path)
    || matchesAny(path, DOC_PATTERNS)
    || matchesAny(path, MACHINE_DOCUMENT_CONTRACT_PATTERNS)
    || matchesAny(path, DATABASE_DOCUMENT_CONTRACT_PATTERNS)
    || matchesAny(path, DATABASE_PATTERNS)
    || matchesAny(path, INTEGRATION_AUTHORITY_PATTERNS)
    || matchesAny(path, UI_PATTERNS)
    || matchesAny(path, STYLE_BUILD_PATTERNS)
    || matchesAny(path, BUILD_AUTHORITY_PATTERNS)
    || matchesAny(path, BROAD_CI_AUTHORITY_PATTERNS)
    || matchesAny(path, RECOGNIZED_CI_PATTERNS)
    || matchesAny(path, RUNTIME_PATTERNS)
    || matchesAny(path, DEPENDENCY_LOCK_PATTERNS)
    || matchesAny(path, EXPLICIT_RENDERED_PATTERNS)
  ));
  const fallback = !docsOnly && !recognized;
  const fallbackRendered = fallback
    ? {
        renderedGeneral: true,
        renderedTrain: true,
        renderedActiveWorkout: true,
        renderedWorkoutHistory: true,
      }
    : selectedRendered;
  const rendered = docsOnly
    ? {
        renderedGeneral: false,
        renderedTrain: false,
        renderedActiveWorkout: false,
        renderedWorkoutHistory: false,
      }
    : fallbackRendered;
  const renderedSelected = Object.values(rendered).some(Boolean);

  return {
    paths,
    docsOnly,
    core: !docsOnly || renderedSelected,
    database: database || integrationAuthority || integrationTest || broadCiAuthority || fallback,
    ui: (ui || fallback || renderedSelected) && !docsOnly,
    ci: ci || fallback,
    build: (runtime || dependencies || fallback || renderedSelected) && !docsOnly,
    dependencies,
    fallback,
    ...rendered,
  };
}

export function changedPathDiffArgs(base, head) {
  return [
    "diff",
    "--name-only",
    "--no-renames",
    "--diff-filter=ACMRD",
    `${base}...${head}`,
  ];
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
    rendered_general: result.renderedGeneral,
    rendered_train: result.renderedTrain,
    rendered_active_workout: result.renderedActiveWorkout,
    rendered_workout_history: result.renderedWorkoutHistory,
  };
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value ? "true" : "false"}`);
  lines.push(`changed_count=${result.paths.length}`);
  lines.push(`scope_summary=${JSON.stringify(values)}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`, "utf8");
  process.stdout.write(`${lines.join("\n")}\n`);
}

function packageJsonAt(ref) {
  return execFileSync("git", ["show", `${ref}:package.json`], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

function main() {
  const base = exactSha(process.env.PLAIVRA_PR_BASE_SHA, "PR base");
  const head = exactSha(process.env.PLAIVRA_PR_HEAD_SHA, "PR head");
  const stdout = execFileSync("git", changedPathDiffArgs(base, head), {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  const paths = stdout.split(/\r?\n/);
  const packageChanged = paths.some((path) => path.trim() === "package.json");
  const basePackage = packageChanged ? packageJsonAt(base) : null;
  const headPackage = packageChanged ? packageJsonAt(head) : null;
  const manifestDependenciesChanged = packageChanged
    ? dependencyManifestChanged(basePackage, headPackage)
    : false;
  const packageQaChanged = packageChanged
    ? qaValidationScriptsChanged(basePackage, headPackage)
    : false;
  emit(
    classifyChangedPaths(paths, {
      dependencyManifestChanged: manifestDependenciesChanged,
      qaValidationScriptsChanged: packageQaChanged,
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
