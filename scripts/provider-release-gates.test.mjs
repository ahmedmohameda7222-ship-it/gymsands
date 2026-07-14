import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();
const gate = resolve(root, "scripts/vercel-production-release-gate.mjs");
const sha = "60a204d5fc20fc396be1b1b47e748c42ebba6abf";
const otherSha = "fce4f9dacd16ade098d1bbfc1eb6793d50cb5eb9";

function run(environment) {
  return spawnSync(process.execPath, [gate], {
    cwd: root,
    env: { PATH: process.env.PATH, ...environment },
    encoding: "utf8"
  });
}

test("vercel.json enables automatic Git deployments only for main without an ignore command", () => {
  const config = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8"));

  assert.deepEqual(config.git?.deploymentEnabled, {
    "*": false,
    main: true
  });
  assert.equal(config.ignoreCommand, undefined);
});

test("local builds continue without provider authorization", () => {
  const result = run({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_SHA: sha });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Not running on Vercel/);
});

test("an exact approved preview proceeds", () => {
  const result = run({
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "feature/approved-preview",
    VERCEL_GIT_COMMIT_SHA: sha,
    PLAIVRA_PREVIEW_RELEASE_SHA: sha
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Preview deployment approved for exact commit/);
});

test("a preview without approval is skipped", () => {
  const result = run({
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "feature/unapproved-preview",
    VERCEL_GIT_COMMIT_SHA: sha
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Preview deployment held/);
});

test("a pull-request preview without approval is skipped", () => {
  const result = run({
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "feature/pr-preview",
    VERCEL_GIT_PULL_REQUEST_ID: "54",
    VERCEL_GIT_COMMIT_SHA: sha
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Preview deployment held/);
});

test("a preview with a mismatched approval is skipped", () => {
  const result = run({
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "feature/wrong-preview",
    VERCEL_GIT_COMMIT_SHA: sha,
    PLAIVRA_PREVIEW_RELEASE_SHA: otherSha
  });
  assert.equal(result.status, 0);
});

test("preview approval for another commit does not authorize the current commit", () => {
  const result = run({
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "feature/different-current-commit",
    VERCEL_GIT_COMMIT_SHA: otherSha,
    PLAIVRA_PREVIEW_RELEASE_SHA: sha
  });
  assert.equal(result.status, 0);
});

test("a preview with an abbreviated commit and approval is skipped", () => {
  const result = run({
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "feature/short-preview",
    VERCEL_GIT_COMMIT_SHA: "60a204d",
    PLAIVRA_PREVIEW_RELEASE_SHA: "60a204d"
  });
  assert.equal(result.status, 0);
});

test("a preview with a malformed approval is skipped", () => {
  const result = run({
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "feature/malformed-preview",
    VERCEL_GIT_COMMIT_SHA: sha,
    PLAIVRA_PREVIEW_RELEASE_SHA: `${sha}00`
  });
  assert.equal(result.status, 0);
});

test("an approved non-main build without an explicit target environment proceeds as preview", () => {
  const result = run({
    VERCEL: "1",
    VERCEL_GIT_COMMIT_REF: "feature/non-main",
    VERCEL_GIT_COMMIT_SHA: sha,
    PLAIVRA_PREVIEW_RELEASE_SHA: sha
  });
  assert.equal(result.status, 1);
});

test("an approved pull-request build proceeds as preview", () => {
  const result = run({
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "main",
    VERCEL_GIT_PULL_REQUEST_ID: "54",
    VERCEL_GIT_COMMIT_SHA: sha,
    PLAIVRA_PREVIEW_RELEASE_SHA: sha
  });
  assert.equal(result.status, 1);
});

test("production main proceeds for its exact production approval", () => {
  const result = run({
    VERCEL: "1",
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "main",
    VERCEL_GIT_COMMIT_SHA: sha,
    PLAIVRA_PRODUCTION_RELEASE_SHA: sha
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Production deployment approved for exact commit/);
});

test("production main without approval is skipped", () => {
  const result = run({
    VERCEL: "1",
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "main",
    VERCEL_GIT_COMMIT_SHA: sha
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Production deployment held/);
});

test("production main with preview approval only is skipped", () => {
  const result = run({
    VERCEL: "1",
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "main",
    VERCEL_GIT_COMMIT_SHA: sha,
    PLAIVRA_PREVIEW_RELEASE_SHA: sha
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Production deployment held/);
});

test("production main with a mismatched approval is skipped", () => {
  const result = run({
    VERCEL: "1",
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "main",
    VERCEL_GIT_COMMIT_SHA: sha,
    PLAIVRA_PRODUCTION_RELEASE_SHA: otherSha
  });
  assert.equal(result.status, 0);
});

test("production main with abbreviated identities is skipped", () => {
  const result = run({
    VERCEL: "1",
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "main",
    VERCEL_GIT_COMMIT_SHA: "60a204d",
    PLAIVRA_PRODUCTION_RELEASE_SHA: "60a204d"
  });
  assert.equal(result.status, 0);
});

test("a production target on a non-main branch is ambiguous and skipped even with preview approval", () => {
  const result = run({
    VERCEL: "1",
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "feature/contradictory",
    VERCEL_GIT_COMMIT_SHA: sha,
    PLAIVRA_PREVIEW_RELEASE_SHA: sha
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Ambiguous/);
});

test("a production target attached to a pull request is ambiguous and skipped", () => {
  const result = run({
    VERCEL: "1",
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "main",
    VERCEL_GIT_PULL_REQUEST_ID: "54",
    VERCEL_GIT_COMMIT_SHA: sha,
    PLAIVRA_PREVIEW_RELEASE_SHA: sha,
    PLAIVRA_PRODUCTION_RELEASE_SHA: sha
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Ambiguous/);
});

test("an unidentified Vercel target is skipped fail-closed", () => {
  const result = run({ VERCEL: "1" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /fail-closed/);
});

test("a main-branch target without an environment is skipped fail-closed", () => {
  const result = run({
    VERCEL: "1",
    VERCEL_GIT_COMMIT_REF: "main",
    VERCEL_GIT_COMMIT_SHA: sha,
    PLAIVRA_PRODUCTION_RELEASE_SHA: sha
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /fail-closed/);
});
