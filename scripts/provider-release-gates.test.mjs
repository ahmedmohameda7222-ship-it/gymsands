import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import test from "node:test";

const root = process.cwd();
const netlifyGate = resolve(
  root,
  "scripts/netlify-production-release-gate.mjs",
);
const obsoleteVercelGate = resolve(
  root,
  "scripts/vercel-production-release-gate.mjs",
);
const exactReleaseWorkflow = resolve(
  root,
  ".github/workflows/exact-release-quality-validation.yml",
);
const releasePreflightWorkflow = resolve(
  root,
  ".github/workflows/release-preflight.yml",
);
const exactReleaseOrchestrator = resolve(
  root,
  "scripts/exact-release-orchestrator.mjs",
);
const sha = "60a204d5fc20fc396be1b1b47e748c42ebba6abf";
const otherSha = "fce4f9dacd16ade098d1bbfc1eb6793d50cb5eb9";
const textExtensions = new Set([
  ".cjs",
  ".example",
  ".js",
  ".json",
  ".mjs",
  ".toml",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

function runNetlify(environment = {}) {
  return spawnSync(process.execPath, [netlifyGate], {
    cwd: root,
    env: { PATH: process.env.PATH, ...environment },
    encoding: "utf8",
  });
}

function isTestFile(file) {
  return /(?:^|\/)[^/]+\.(?:test|spec)\.(?:ts|tsx|js|mjs|cjs)$/i.test(file);
}

function trackedRuntimeFilesContaining(needle) {
  const tracked = execFileSync("git", ["ls-files"], {
    cwd: root,
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .filter(Boolean)
    .filter(
      (file) => file === ".env.example" || textExtensions.has(extname(file)),
    )
    .filter((file) => !file.startsWith("docs/") && !isTestFile(file));
  return tracked
    .filter((file) =>
      readFileSync(resolve(root, file), "utf8").includes(needle),
    )
    .sort();
}

test("repository config keeps main deployment policy with only the bounded P10F Preview branch", () => {
  const config = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8"));

  assert.deepEqual(config.git?.deploymentEnabled, {
    "**": false,
    main: true,
    "feat/p10f-activity-catalog-v2-cutover": true,
  });
  assert.equal(config.ignoreCommand, undefined);
  assert.deepEqual(config.crons, [
    { path: "/api/internal/maintenance/oauth-cleanup", schedule: "17 3 * * *" },
    {
      path: "/api/internal/maintenance/privacy-lifecycle",
      schedule: "47 3 * * *",
    },
    {
      path: "/api/internal/maintenance/workout-history-lifecycle",
      schedule: "37 3 * * *",
    },
    { path: "/api/internal/maintenance/billing-events", schedule: "7 4 * * *" },
  ]);
  assert.equal(existsSync(obsoleteVercelGate), false);
});

test("Exact Release reuses canonical Quality and dispatches one read-only preflight", () => {
  const exactWorkflow = readFileSync(exactReleaseWorkflow, "utf8");
  const preflightWorkflow = readFileSync(releasePreflightWorkflow, "utf8");
  const orchestrator = readFileSync(exactReleaseOrchestrator, "utf8");

  assert.match(exactWorkflow, /quality_run_id:/);
  assert.match(exactWorkflow, /node scripts\/exact-release-orchestrator\.mjs/);
  assert.match(orchestrator, /qualityExecutionMode: "reused-canonical-run"/);
  assert.match(orchestrator, /"release-preflight\.yml"/);
  assert.match(
    orchestrator,
    /validation_context=\$\{STAGE1_VALIDATION_CONTEXT\}/,
  );
  assert.match(orchestrator, /productionWritePerformed: false/);
  assert.match(orchestrator, /deploymentPerformed: false/);

  const verifyQuality = orchestrator.indexOf(
    "const qualityEvidence = verifyQualityArtifact({",
  );
  const dispatchPreflight = orchestrator.indexOf('"release-preflight.yml"');
  const verifyPreflight = orchestrator.indexOf(
    "preflightArtifact = verifyPreflightArtifact({",
  );
  const finalEvidence = orchestrator.indexOf(
    "writeFinalEvidence({",
    verifyPreflight,
  );
  assert.ok(verifyQuality >= 0, "canonical Quality verification is missing");
  assert.ok(
    dispatchPreflight > verifyQuality,
    "preflight must follow canonical Quality verification",
  );
  assert.ok(
    verifyPreflight > dispatchPreflight,
    "preflight evidence must be verified after dispatch",
  );
  assert.ok(
    finalEvidence > verifyPreflight,
    "final exact evidence must follow preflight verification",
  );

  assert.match(
    preflightWorkflow,
    /permissions:\s+actions: read\s+contents: read/,
  );
  assert.match(preflightWorkflow, /Download exact canonical Quality artifact/);
  assert.match(preflightWorkflow, /Validate migration ledger/);
  assert.match(preflightWorkflow, /Run strict non-deploying release preflight/);
  assert.match(preflightWorkflow, /Assert selected mode remains read-only/);
  assert.doesNotMatch(
    preflightWorkflow,
    /\b(?:vercel|netlify)\s+deploy\b|supabase\s+db\s+push/i,
  );
});

test("active configuration has no obsolete Vercel SHA approval dependency", () => {
  const envExample = readFileSync(resolve(root, ".env.example"), "utf8");

  assert.doesNotMatch(envExample, /PLAIVRA_PREVIEW_RELEASE_SHA/);
  assert.match(envExample, /# Netlify production deployment release hold/);
  assert.match(envExample, /# Vercel does not use this variable\./);
  assert.match(envExample, /^PLAIVRA_PRODUCTION_RELEASE_SHA=$/m);
});

test("runtime references contain no active obsolete Vercel gate dependency", () => {
  assert.deepEqual(
    trackedRuntimeFilesContaining("scripts/vercel-production-release-gate.mjs"),
    [],
  );
  assert.deepEqual(
    trackedRuntimeFilesContaining("PLAIVRA_PREVIEW_RELEASE_SHA"),
    [],
  );
  assert.deepEqual(
    trackedRuntimeFilesContaining("PLAIVRA_PRODUCTION_RELEASE_SHA"),
    [".env.example", "scripts/netlify-production-release-gate.mjs"],
  );
});

test("git diff checks pass for the working tree and branch range", () => {
  const workingTree = spawnSync("git", ["diff", "--check"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(
    workingTree.status,
    0,
    `${workingTree.stdout}\n${workingTree.stderr}`,
  );

  const remoteMain = spawnSync(
    "git",
    ["rev-parse", "--verify", "origin/main"],
    { cwd: root, encoding: "utf8" },
  );
  const base = remoteMain.status === 0 ? "origin/main" : "main";
  const branchRange = spawnSync("git", ["diff", "--check", `${base}...HEAD`], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(
    branchRange.status,
    0,
    `${branchRange.stdout}\n${branchRange.stderr}`,
  );
});

test("Netlify keeps its exact-SHA ignore command and local behavior", () => {
  const netlifyConfig = readFileSync(resolve(root, "netlify.toml"), "utf8");
  assert.match(
    netlifyConfig,
    /ignore = "node \.\/scripts\/netlify-production-release-gate\.mjs"/,
  );

  const local = runNetlify();
  assert.equal(local.status, 1);
  assert.match(local.stdout, /Not running on Netlify/);
});

for (const context of ["deploy-preview", "branch-deploy", "dev"]) {
  test(`Netlify ${context} behavior remains unchanged`, () => {
    const result = runNetlify({
      NETLIFY: "true",
      CONTEXT: context,
      BRANCH: "feature/provider-policy",
      COMMIT_REF: sha,
    });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /preview\/branch deployment allowed/i);
  });
}

test("Netlify production is held without exact approval", () => {
  const result = runNetlify({
    NETLIFY: "true",
    CONTEXT: "production",
    BRANCH: "main",
    COMMIT_REF: sha,
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /production deployment held/i);
});

test("Netlify production is held for a mismatched approval", () => {
  const result = runNetlify({
    NETLIFY: "true",
    CONTEXT: "production",
    BRANCH: "main",
    COMMIT_REF: sha,
    PLAIVRA_PRODUCTION_RELEASE_SHA: otherSha,
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /production deployment held/i);
});

test("Netlify production is held for abbreviated or malformed identities", () => {
  for (const [commit, approval] of [
    ["60a204d", "60a204d"],
    [`${sha}00`, `${sha}00`],
    [sha, `${sha}00`],
  ]) {
    const result = runNetlify({
      NETLIFY: "true",
      CONTEXT: "production",
      BRANCH: "main",
      COMMIT_REF: commit,
      PLAIVRA_PRODUCTION_RELEASE_SHA: approval,
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /production deployment held/i);
  }
});

test("Netlify production proceeds only for the exact valid 40-character SHA", () => {
  const result = runNetlify({
    NETLIFY: "true",
    CONTEXT: "production",
    BRANCH: "main",
    COMMIT_REF: sha.toUpperCase(),
    PLAIVRA_PRODUCTION_RELEASE_SHA: sha,
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /approved for exact commit/i);
});

test("Netlify ambiguous provider targets fail closed", () => {
  const result = runNetlify({ NETLIFY: "true", COMMIT_REF: sha });
  assert.equal(result.status, 0);
  assert.match(
    result.stdout,
    /Ambiguous Netlify deployment target held fail-closed/,
  );
});
