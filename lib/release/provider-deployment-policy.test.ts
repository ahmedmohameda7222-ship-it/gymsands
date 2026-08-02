import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const netlifyScript = fileURLToPath(new URL("../../scripts/netlify-production-release-gate.mjs", import.meta.url));
const obsoleteVercelScript = fileURLToPath(new URL("../../scripts/vercel-production-release-gate.mjs", import.meta.url));
const exactReleaseWorkflow = fileURLToPath(new URL("../../.github/workflows/exact-release-quality-validation.yml", import.meta.url));
const releasePreflightWorkflow = fileURLToPath(new URL("../../.github/workflows/release-preflight.yml", import.meta.url));
const exactReleaseOrchestrator = fileURLToPath(new URL("../../scripts/exact-release-orchestrator.mjs", import.meta.url));
const SHA = "8481ab3ce43b9866f01d8ba0331abf6368f68956";
const OTHER_SHA = "1111111111111111111111111111111111111111";

type EnvironmentOverrides = Record<string, string | undefined>;

function runNetlify(overrides: EnvironmentOverrides = {}) {
  const env = {
    NODE_ENV: "test",
    PATH: process.env.PATH ?? "",
    ...overrides
  } as NodeJS.ProcessEnv;
  return spawnSync(process.execPath, [netlifyScript], { env, encoding: "utf8" });
}

describe("provider deployment policy", () => {
  it("declares repository Vercel policy intent for main only without a repository-side deployment gate", () => {
    const vercelConfig = JSON.parse(readFileSync(`${repositoryRoot}/vercel.json`, "utf8")) as {
      ignoreCommand?: string;
      git?: { deploymentEnabled?: Record<string, boolean> };
      crons?: Array<{ path: string; schedule: string }>;
    };
    const envExample = readFileSync(`${repositoryRoot}/.env.example`, "utf8");

    expect(vercelConfig.git?.deploymentEnabled).toEqual({ "**": false, main: true });
    expect(vercelConfig.ignoreCommand).toBeUndefined();
    expect(vercelConfig.crons).toEqual([
      { path: "/api/internal/maintenance/oauth-cleanup", schedule: "17 3 * * *" },
      { path: "/api/internal/maintenance/privacy-lifecycle", schedule: "47 3 * * *" },
      { path: "/api/internal/maintenance/workout-history-lifecycle", schedule: "37 3 * * *" },
      { path: "/api/internal/maintenance/billing-events", schedule: "7 4 * * *" }
    ]);
    expect(existsSync(obsoleteVercelScript)).toBe(false);
    expect(envExample).not.toContain("PLAIVRA_PREVIEW_RELEASE_SHA");
    expect(envExample).toContain("# Netlify production deployment release hold");
    expect(envExample).toContain("# Vercel does not use this variable.");
    expect(envExample).toMatch(/^PLAIVRA_PRODUCTION_RELEASE_SHA=$/m);
  });

  it("binds Exact Release to one canonical Quality artifact and a read-only preflight", () => {
    const exactWorkflow = readFileSync(exactReleaseWorkflow, "utf8");
    const preflightWorkflow = readFileSync(releasePreflightWorkflow, "utf8");
    const orchestrator = readFileSync(exactReleaseOrchestrator, "utf8");

    expect(exactWorkflow).toContain("reviewed_commit:");
    expect(exactWorkflow).toContain("comparison_base:");
    expect(exactWorkflow).toContain("quality_run_id:");
    expect(exactWorkflow).toContain("node scripts/exact-release-orchestrator.mjs");

    const verifyQuality = orchestrator.indexOf("const qualityEvidence = verifyQualityArtifact({");
    const dispatchPreflight = orchestrator.indexOf('"release-preflight.yml"');
    const waitForPreflight = orchestrator.indexOf('label: "preflight"');
    const verifyPreflight = orchestrator.indexOf("preflightArtifact = verifyPreflightArtifact({");
    const finalEvidence = orchestrator.indexOf("writeFinalEvidence({", verifyPreflight);

    expect(verifyQuality).toBeGreaterThanOrEqual(0);
    expect(dispatchPreflight).toBeGreaterThan(verifyQuality);
    expect(waitForPreflight).toBeGreaterThan(dispatchPreflight);
    expect(verifyPreflight).toBeGreaterThan(waitForPreflight);
    expect(finalEvidence).toBeGreaterThan(verifyPreflight);
    expect(orchestrator).toContain('qualityExecutionMode: "reused-canonical-run"');
    expect(orchestrator).toContain("productionWritePerformed: false");
    expect(orchestrator).toContain("deploymentPerformed: false");

    expect(preflightWorkflow).toContain("actions: read");
    expect(preflightWorkflow).toContain("contents: read");
    expect(preflightWorkflow).toContain("Download exact canonical Quality artifact");
    expect(preflightWorkflow).toContain("Validate migration ledger");
    expect(preflightWorkflow).toContain("Run strict non-deploying release preflight");
    expect(preflightWorkflow).toContain("Assert selected mode remains read-only");
    expect(preflightWorkflow).not.toMatch(/\b(?:vercel|netlify)\s+deploy\b|supabase\s+db\s+push/i);
  });

  it("keeps the Netlify ignore command and local build behavior", () => {
    const netlifyConfig = readFileSync(`${repositoryRoot}/netlify.toml`, "utf8");
    expect(netlifyConfig).toContain('ignore = "node ./scripts/netlify-production-release-gate.mjs"');
    expect(runNetlify().status).toBe(1);
  });

  it.each(["deploy-preview", "branch-deploy", "dev"])(
    "keeps Netlify %s behavior unchanged",
    (context) => {
      const result = runNetlify({
        NETLIFY: "true",
        CONTEXT: context,
        BRANCH: "feature/provider-policy",
        COMMIT_REF: SHA
      });
      expect(result.status).toBe(1);
      expect(result.stdout).toMatch(/preview\/branch deployment allowed/i);
    }
  );

  it.each([
    ["missing approval", undefined, SHA],
    ["mismatched approval", OTHER_SHA, SHA],
    ["abbreviated identities", "8481ab3", "8481ab3"],
    ["malformed approval", `${SHA}00`, SHA]
  ])("holds Netlify production for %s", (_label, approval, commit) => {
    const result = runNetlify({
      NETLIFY: "true",
      CONTEXT: "production",
      BRANCH: "main",
      COMMIT_REF: commit,
      PLAIVRA_PRODUCTION_RELEASE_SHA: approval
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/production deployment held/i);
  });

  it("allows Netlify production only for the exact valid 40-character SHA", () => {
    const result = runNetlify({
      NETLIFY: "true",
      CONTEXT: "production",
      BRANCH: "main",
      COMMIT_REF: SHA.toUpperCase(),
      PLAIVRA_PRODUCTION_RELEASE_SHA: SHA
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/approved for exact commit/i);
  });

  it("holds ambiguous Netlify provider targets fail-closed", () => {
    const result = runNetlify({ NETLIFY: "true", COMMIT_REF: SHA });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/ambiguous/i);
  });
});
