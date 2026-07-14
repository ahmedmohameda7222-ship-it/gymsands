import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();
const netlifyGate = resolve(root, "scripts/netlify-production-release-gate.mjs");
const obsoleteVercelGate = resolve(root, "scripts/vercel-production-release-gate.mjs");
const sha = "60a204d5fc20fc396be1b1b47e748c42ebba6abf";
const otherSha = "fce4f9dacd16ade098d1bbfc1eb6793d50cb5eb9";

function runNetlify(environment = {}) {
  return spawnSync(process.execPath, [netlifyGate], {
    cwd: root,
    env: { PATH: process.env.PATH, ...environment },
    encoding: "utf8"
  });
}

test("Vercel requests Git-connected deployments only for main without an ignore command", () => {
  const config = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8"));

  assert.deepEqual(config.git?.deploymentEnabled, { "*": false, main: true });
  assert.equal(config.ignoreCommand, undefined);
  assert.deepEqual(config.crons, [
    { path: "/api/internal/maintenance/oauth-cleanup", schedule: "17 3 * * *" },
    { path: "/api/internal/maintenance/privacy-lifecycle", schedule: "47 3 * * *" },
    { path: "/api/internal/maintenance/billing-events", schedule: "7 4 * * *" }
  ]);
  assert.equal(existsSync(obsoleteVercelGate), false);
});

test("active configuration has no Vercel preview or production SHA approval dependency", () => {
  const envExample = readFileSync(resolve(root, ".env.example"), "utf8");
  const releaseReadme = readFileSync(resolve(root, "docs/release/README.md"), "utf8");
  const launchRunbook = readFileSync(resolve(root, "docs/operations/launch-runbook.md"), "utf8");

  assert.doesNotMatch(envExample, /PLAIVRA_PREVIEW_RELEASE_SHA/);
  assert.match(envExample, /# Netlify production deployment release hold/);
  assert.match(envExample, /# Vercel does not use this variable\./);
  assert.match(envExample, /^PLAIVRA_PRODUCTION_RELEASE_SHA=$/m);
  assert.match(releaseReadme, /Vercel does not use `ignoreCommand`, `PLAIVRA_PREVIEW_RELEASE_SHA`, or `PLAIVRA_PRODUCTION_RELEASE_SHA`/);
  assert.match(launchRunbook, /Vercel does not use `PLAIVRA_PREVIEW_RELEASE_SHA` or `PLAIVRA_PRODUCTION_RELEASE_SHA`/);
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
