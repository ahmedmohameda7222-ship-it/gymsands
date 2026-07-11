#!/usr/bin/env node

/**
 * Vercel ignoreCommand contract:
 * - exit 0: ignore/skip this deployment
 * - exit 1: continue building
 *
 * Preview and development builds remain available. A production build proceeds
 * only when the owner-controlled PLAIVRA_PRODUCTION_RELEASE_SHA exactly matches
 * Vercel's commit SHA. This makes merging independent from production release.
 */

const environment = process.env.VERCEL_TARGET_ENV || process.env.VERCEL_ENV || "";
const branch = process.env.VERCEL_GIT_COMMIT_REF || "";
const commitSha = (process.env.VERCEL_GIT_COMMIT_SHA || "").trim().toLowerCase();
const approvedSha = (process.env.PLAIVRA_PRODUCTION_RELEASE_SHA || "").trim().toLowerCase();
const pullRequestId = (process.env.VERCEL_GIT_PULL_REQUEST_ID || "").trim();
const runningOnVercel = process.env.VERCEL === "1" || Boolean(environment || branch || commitSha || pullRequestId);

const isPreview = environment === "preview"
  || environment === "development"
  || Boolean(pullRequestId)
  || (Boolean(branch) && branch !== "main");
const isProduction = environment === "production" || branch === "main";
const validSha = /^[a-f0-9]{40}$/.test(commitSha);
const validApproval = /^[a-f0-9]{40}$/.test(approvedSha) && approvedSha === commitSha;

if (!runningOnVercel) {
  console.log("Not running on Vercel; continue the local or CI build.");
  process.exit(1);
}

if (isPreview && !isProduction) {
  console.log("Preview/development deployment allowed.");
  process.exit(1);
}

if (isProduction) {
  if (validSha && validApproval) {
    console.log(`Production deployment approved for exact commit ${commitSha}.`);
    process.exit(1);
  }
  console.log("Production deployment held: PLAIVRA_PRODUCTION_RELEASE_SHA must equal the exact 40-character VERCEL_GIT_COMMIT_SHA.");
  process.exit(0);
}

console.log("Ambiguous Vercel deployment target held fail-closed.");
process.exit(0);
