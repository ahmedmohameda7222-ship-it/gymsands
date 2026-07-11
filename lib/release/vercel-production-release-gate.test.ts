import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const vercelScript = fileURLToPath(new URL("../../scripts/vercel-production-release-gate.mjs", import.meta.url));
const netlifyScript = fileURLToPath(new URL("../../scripts/netlify-production-release-gate.mjs", import.meta.url));
const SHA = "8481ab3ce43b9866f01d8ba0331abf6368f68956";

type EnvironmentOverrides = Record<string, string | undefined>;

function run(script: string, overrides: EnvironmentOverrides = {}) {
  const env = {
    NODE_ENV: "test",
    PATH: process.env.PATH ?? "",
    ...overrides
  } as NodeJS.ProcessEnv;
  return spawnSync(process.execPath, [script], { env, encoding: "utf8" });
}

describe("production release deployment holds", () => {
  it("wires both providers to exact-SHA gates and documents an empty approval", () => {
    const vercelConfig = JSON.parse(readFileSync(`${repositoryRoot}/vercel.json`, "utf8")) as { ignoreCommand?: string };
    const netlifyConfig = readFileSync(`${repositoryRoot}/netlify.toml`, "utf8");
    const envExample = readFileSync(`${repositoryRoot}/.env.example`, "utf8");
    expect(vercelConfig.ignoreCommand).toBe("node scripts/vercel-production-release-gate.mjs");
    expect(netlifyConfig).toContain('ignore = "node ./scripts/netlify-production-release-gate.mjs"');
    expect(envExample).toMatch(/^PLAIVRA_PRODUCTION_RELEASE_SHA=$/m);
  });

  it("allows non-provider local and CI builds", () => {
    expect(run(vercelScript).status).toBe(1);
    expect(run(netlifyScript).status).toBe(1);
  });

  it("allows preview deployments without production approval", () => {
    expect(run(vercelScript, {
      VERCEL: "1",
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "prelaunch-remediation-2026-07",
      VERCEL_GIT_COMMIT_SHA: SHA,
      VERCEL_GIT_PULL_REQUEST_ID: "40"
    }).status).toBe(1);
    expect(run(netlifyScript, {
      NETLIFY: "true",
      CONTEXT: "deploy-preview",
      BRANCH: "prelaunch-remediation-2026-07",
      COMMIT_REF: SHA
    }).status).toBe(1);
  });

  it("holds production when approval is missing or targets another commit", () => {
    expect(run(vercelScript, {
      VERCEL: "1",
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "main",
      VERCEL_GIT_COMMIT_SHA: SHA
    }).status).toBe(0);
    expect(run(netlifyScript, {
      NETLIFY: "true",
      CONTEXT: "production",
      BRANCH: "main",
      COMMIT_REF: SHA,
      PLAIVRA_PRODUCTION_RELEASE_SHA: "1111111111111111111111111111111111111111"
    }).status).toBe(0);
  });

  it("allows production only for the exact reviewed 40-character SHA", () => {
    expect(run(vercelScript, {
      VERCEL: "1",
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "main",
      VERCEL_GIT_COMMIT_SHA: SHA.toUpperCase(),
      PLAIVRA_PRODUCTION_RELEASE_SHA: SHA
    }).status).toBe(1);
    expect(run(netlifyScript, {
      NETLIFY: "true",
      CONTEXT: "production",
      BRANCH: "main",
      COMMIT_REF: SHA.toUpperCase(),
      PLAIVRA_PRODUCTION_RELEASE_SHA: SHA
    }).status).toBe(1);
  });

  it("fails closed for ambiguous provider targets", () => {
    expect(run(vercelScript, { VERCEL: "1", VERCEL_GIT_COMMIT_SHA: SHA }).status).toBe(0);
    expect(run(netlifyScript, { NETLIFY: "true", COMMIT_REF: SHA }).status).toBe(0);
  });
});
