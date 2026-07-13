import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();
const gate = resolve(root, "scripts/vercel-production-release-gate.mjs");
const sha = "60a204d5fc20fc396be1b1b47e748c42ebba6abf";

function run(environment) {
  return spawnSync(process.execPath, [gate], {
    cwd: root,
    env: { PATH: process.env.PATH, ...environment },
    encoding: "utf8"
  });
}

test("vercel.json enables automatic Git deployments only for main", () => {
  const config = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8"));
  assert.deepEqual(config.git?.deploymentEnabled, { "*": false, main: true });
  assert.equal(config.ignoreCommand, "node scripts/vercel-production-release-gate.mjs");
});

test("production proceeds only for the exact approved 40-character SHA", () => {
  const approved = run({
    VERCEL: "1",
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "main",
    VERCEL_GIT_COMMIT_SHA: sha,
    PLAIVRA_PRODUCTION_RELEASE_SHA: sha
  });
  assert.equal(approved.status, 1);
  assert.match(approved.stdout, /approved for exact commit/);

  const wrong = run({
    VERCEL: "1",
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "main",
    VERCEL_GIT_COMMIT_SHA: sha,
    PLAIVRA_PRODUCTION_RELEASE_SHA: "fce4f9dacd16ade098d1bbfc1eb6793d50cb5eb9"
  });
  assert.equal(wrong.status, 0);
  assert.match(wrong.stdout, /held/);

  const abbreviated = run({
    VERCEL: "1",
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "main",
    VERCEL_GIT_COMMIT_SHA: "60a204d",
    PLAIVRA_PRODUCTION_RELEASE_SHA: "60a204d"
  });
  assert.equal(abbreviated.status, 0);
});

test("an explicitly invoked preview may build while automatic branch deployment remains disabled", () => {
  const preview = run({
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "approved-preview",
    VERCEL_GIT_COMMIT_SHA: sha
  });
  assert.equal(preview.status, 1);
  assert.match(preview.stdout, /Explicit preview/);
});

test("ambiguous provider targets fail closed", () => {
  const ambiguous = run({ VERCEL: "1" });
  assert.equal(ambiguous.status, 0);
  assert.match(ambiguous.stdout, /fail-closed/);
});
