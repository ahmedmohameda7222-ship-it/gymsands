import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import test from "node:test";

const root = process.cwd();
const netlifyGate = resolve(root, "scripts/netlify-production-release-gate.mjs");
const obsoleteVercelGate = resolve(root, "scripts/vercel-production-release-gate.mjs");
const sha = "60a204d5fc20fc396be1b1b47e748c42ebba6abf";
const otherSha = "fce4f9dacd16ade098d1bbfc1eb6793d50cb5eb9";
const textExtensions = new Set([".cjs", ".example", ".js", ".json", ".md", ".mjs", ".toml", ".ts", ".tsx", ".yaml", ".yml"]);

function runNetlify(environment = {}) {
  return spawnSync(process.execPath, [netlifyGate], {
    cwd: root,
    env: { PATH: process.env.PATH, ...environment },
    encoding: "utf8"
  });
}

function trackedFilesContaining(needle) {
  const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => file === ".env.example" || textExtensions.has(extname(file)));
  return tracked
    .filter((file) => readFileSync(resolve(root, file), "utf8").includes(needle))
    .sort();
}

test("repository config declares Vercel main-only policy intent without claiming provider enforcement", () => {
  const config = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8"));

  assert.deepEqual(config.git?.deploymentEnabled, { "**": false, main: true });
  assert.equal(config.ignoreCommand, undefined);
  assert.deepEqual(config.crons, [
    { path: "/api/internal/maintenance/oauth-cleanup", schedule: "17 3 * * *" },
    { path: "/api/internal/maintenance/privacy-lifecycle", schedule: "47 3 * * *" },
    { path: "/api/internal/maintenance/billing-events", schedule: "7 4 * * *" }
  ]);
  assert.equal(existsSync(obsoleteVercelGate), false);
});

test("release documentation distinguishes repository intent from actual provider verification", () => {
  const releaseReadme = readFileSync(resolve(root, "docs/release/README.md"), "utf8");
  const launchRunbook = readFileSync(resolve(root, "docs/operations/launch-runbook.md"), "utf8");

  assert.match(releaseReadme, /Repository configuration and tests verify policy intent only\./);
  assert.match(releaseReadme, /They do not prove actual Vercel provider enforcement\./);
  assert.match(releaseReadme, /inspect the Vercel deployment list for the exact pushed SHA/);
  assert.match(launchRunbook, /Repository configuration and green repository tests prove policy intent only/);
  assert.match(launchRunbook, /actual provider behavior requires post-push Vercel verification/);
});

test("launch documentation places reconciliation, strict preflight, and owner approval before merge", () => {
  const releaseReadme = readFileSync(resolve(root, "docs/release/README.md"), "utf8");
  const launchRunbook = readFileSync(resolve(root, "docs/operations/launch-runbook.md"), "utf8");
  const documents = [releaseReadme, launchRunbook];

  for (const document of documents) {
    const reconciliation = document.indexOf("2. Complete migration-history reconciliation");
    const preflight = document.indexOf("5. Run `npm run release:preflight");
    const releaseMode = document.indexOf("--mode release", preflight);
    const approval = document.indexOf("6. Obtain explicit release-owner approval");
    const merge = document.indexOf("7. Merge the approved exact change to `main`");

    assert.ok(reconciliation >= 0, "migration reconciliation step is missing");
    assert.ok(preflight > reconciliation, "release preflight must follow migration reconciliation");
    assert.ok(releaseMode > preflight, "production preflight must explicitly select strict release mode");
    assert.ok(approval > releaseMode, "owner approval must follow a passing strict release preflight");
    assert.ok(merge > approval, "the production-triggering merge must follow approval");
    assert.match(document, /Any failed or blocked strict release preflight is a no-go before merge/);
    assert.match(document, /migration ledger must be reconciled before/);
    assert.match(document, /A provider `READY` state alone is not acceptance/);
    assert.match(document, /Netlify remains separate/);
  }

  assert.match(releaseReadme, /A passing review preflight is not production release authorization/);
  assert.match(launchRunbook, /Pull-request review preflight is CI evidence only/);
});

test("active configuration has no Vercel preview or production SHA approval dependency", () => {
  const envExample = readFileSync(resolve(root, ".env.example"), "utf8");
  const releaseReadme = readFileSync(resolve(root, "docs/release/README.md"), "utf8");
  const launchRunbook = readFileSync(resolve(root, "docs/operations/launch-runbook.md"), "utf8");

  assert.doesNotMatch(envExample, /PLAIVRA_PREVIEW_RELEASE_SHA/);
  assert.match(envExample, /# Netlify production deployment release hold/);
  assert.match(envExample, /# Vercel does not use this variable\./);
  assert.match(envExample, /^PLAIVRA_PRODUCTION_RELEASE_SHA=$/m);
  assert.match(releaseReadme, /Vercel does not use `ignoreCommand`/);
  assert.match(releaseReadme, /Vercel does not use preview or production exact-SHA approval environment variables/);
  assert.match(launchRunbook, /Vercel does not use `PLAIVRA_PREVIEW_RELEASE_SHA` or `PLAIVRA_PRODUCTION_RELEASE_SHA`/);
});

test("tracked references contain no active obsolete Vercel gate dependency", () => {
  assert.deepEqual(trackedFilesContaining("scripts/vercel-production-release-gate.mjs"), [
    "lib/release/provider-deployment-policy.test.ts",
    "release/prelaunch-handoff-manifest.json",
    "scripts/provider-release-gates.test.mjs"
  ]);

  assert.deepEqual(trackedFilesContaining("PLAIVRA_PREVIEW_RELEASE_SHA"), [
    "docs/operations/launch-runbook.md",
    "docs/release/README.md",
    "lib/release/provider-deployment-policy.test.ts",
    "scripts/provider-release-gates.test.mjs"
  ]);

  assert.deepEqual(trackedFilesContaining("PLAIVRA_PRODUCTION_RELEASE_SHA"), [
    ".env.example",
    "docs/operations/launch-runbook.md",
    "docs/release/README.md",
    "lib/release/provider-deployment-policy.test.ts",
    "scripts/netlify-production-release-gate.mjs",
    "scripts/provider-release-gates.test.mjs",
    "scripts/release-metadata-bundle.test.mjs"
  ]);

  const historicalManifest = readFileSync(resolve(root, "release/prelaunch-handoff-manifest.json"), "utf8");
  assert.match(historicalManifest, /scripts\/vercel-production-release-gate\.mjs/);
});

test("git diff checks pass for the working tree and branch range", () => {
  const workingTree = spawnSync("git", ["diff", "--check"], { cwd: root, encoding: "utf8" });
  assert.equal(workingTree.status, 0, `${workingTree.stdout}\n${workingTree.stderr}`);

  const remoteMain = spawnSync("git", ["rev-parse", "--verify", "origin/main"], { cwd: root, encoding: "utf8" });
  const base = remoteMain.status === 0 ? "origin/main" : "main";
  const branchRange = spawnSync("git", ["diff", "--check", `${base}...HEAD`], { cwd: root, encoding: "utf8" });
  assert.equal(branchRange.status, 0, `${branchRange.stdout}\n${branchRange.stderr}`);
});

test("Netlify keeps its exact-SHA ignore command and local behavior", () => {
  const netlifyConfig = readFileSync(resolve(root, "netlify.toml"), "utf8");
  assert.match(netlifyConfig, /ignore = "node \.\/scripts\/netlify-production-release-gate\.mjs"/);

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
      COMMIT_REF: sha
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
    COMMIT_REF: sha
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
    PLAIVRA_PRODUCTION_RELEASE_SHA: otherSha
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /production deployment held/i);
});

test("Netlify production is held for abbreviated or malformed identities", () => {
  for (const [commit, approval] of [
    ["60a204d", "60a204d"],
    [`${sha}00`, `${sha}00`],
    [sha, `${sha}00`]
  ]) {
    const result = runNetlify({
      NETLIFY: "true",
      CONTEXT: "production",
      BRANCH: "main",
      COMMIT_REF: commit,
      PLAIVRA_PRODUCTION_RELEASE_SHA: approval
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
    PLAIVRA_PRODUCTION_RELEASE_SHA: sha
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /approved for exact commit/i);
});

test("Netlify ambiguous provider targets fail closed", () => {
  const result = runNetlify({ NETLIFY: "true", COMMIT_REF: sha });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Ambiguous Netlify deployment target held fail-closed/);
});
