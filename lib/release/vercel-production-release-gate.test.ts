import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const script = fileURLToPath(new URL("../../scripts/vercel-production-release-gate.mjs", import.meta.url));
const SHA = "8481ab3ce43b9866f01d8ba0331abf6368f68956";

function run(overrides: NodeJS.ProcessEnv = {}) {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, ...overrides };
  return spawnSync(process.execPath, [script], { env, encoding: "utf8" });
}

describe("Vercel production release gate", () => {
  it("is wired into vercel.json and documented as an empty-by-default production variable", () => {
    const config = JSON.parse(readFileSync(`${repositoryRoot}/vercel.json`, "utf8")) as { ignoreCommand?: string };
    const envExample = readFileSync(`${repositoryRoot}/.env.example`, "utf8");
    expect(config.ignoreCommand).toBe("node scripts/vercel-production-release-gate.mjs");
    expect(envExample).toMatch(/^PLAIVRA_PRODUCTION_RELEASE_SHA=$/m);
  });

  it("allows non-Vercel local and CI builds", () => {
    expect(run().status).toBe(1);
  });

  it("allows preview deployments without a production approval", () => {
    const result = run({
      VERCEL: "1",
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "prelaunch-remediation-2026-07",
      VERCEL_GIT_COMMIT_SHA: SHA,
      VERCEL_GIT_PULL_REQUEST_ID: "40"
    });
    expect(result.status).toBe(1);
  });

  it("holds a production deployment when approval is missing", () => {
    const result = run({
      VERCEL: "1",
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "main",
      VERCEL_GIT_COMMIT_SHA: SHA
    });
    expect(result.status).toBe(0);
  });

  it("holds a production deployment when approval targets a different commit", () => {
    const result = run({
      VERCEL: "1",
      VERCEL_TARGET_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "main",
      VERCEL_GIT_COMMIT_SHA: SHA,
      PLAIVRA_PRODUCTION_RELEASE_SHA: "1111111111111111111111111111111111111111"
    });
    expect(result.status).toBe(0);
  });

  it("allows production only for an exact reviewed 40-character SHA", () => {
    const result = run({
      VERCEL: "1",
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "main",
      VERCEL_GIT_COMMIT_SHA: SHA.toUpperCase(),
      PLAIVRA_PRODUCTION_RELEASE_SHA: SHA
    });
    expect(result.status).toBe(1);
  });

  it("fails closed for an ambiguous Vercel target", () => {
    const result = run({ VERCEL: "1", VERCEL_GIT_COMMIT_SHA: SHA });
    expect(result.status).toBe(0);
  });
});
