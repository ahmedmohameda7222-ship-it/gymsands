#!/usr/bin/env node

/**
 * Vercel ignoreCommand contract:
 * - exit 0: ignore/skip this deployment
 * - exit 1: continue building
 *
 * vercel.json requests that automatic Git-connected deployments run only for
 * main. This script is the authoritative build authorization check as provider
 * behavior can still create a deployment record for a branch push. Preview,
 * development, pull-request, and other non-main builds proceed only when the
 * owner-controlled PLAIVRA_PREVIEW_RELEASE_SHA exactly matches Vercel's commit
 * SHA. Production main builds use the separate PLAIVRA_PRODUCTION_RELEASE_SHA.
 */

const environment = process.env.VERCEL_TARGET_ENV || process.env.VERCEL_ENV || "";
const branch = process.env.VERCEL_GIT_COMMIT_REF || "";
const commitSha = (process.env.VERCEL_GIT_COMMIT_SHA || "").trim().toLowerCase();
const previewApprovedSha = (process.env.PLAIVRA_PREVIEW_RELEASE_SHA || "").trim().toLowerCase();
const productionApprovedSha = (process.env.PLAIVRA_PRODUCTION_RELEASE_SHA || "").trim().toLowerCase();
const pullRequestId = (process.env.VERCEL_GIT_PULL_REQUEST_ID || "").trim();
const runningOnVercel = process.env.VERCEL === "1";

const isPreview = environment === "preview"
  || environment === "development"
  || Boolean(pullRequestId)
  || (Boolean(branch) && branch !== "main");
const isProduction = environment === "production" && branch === "main" && !pullRequestId;
const contradictoryTarget = environment === "production" && (branch !== "main" || Boolean(pullRequestId));
const validSha = /^[a-f0-9]{40}$/.test(commitSha);
const validPreviewApproval = validSha
  && /^[a-f0-9]{40}$/.test(previewApprovedSha)
  && previewApprovedSha === commitSha;
const validProductionApproval = validSha
  && /^[a-f0-9]{40}$/.test(productionApprovedSha)
  && productionApprovedSha === commitSha;

if (!runningOnVercel) {
  console.log("Not running on Vercel; continue the local or CI build.");
  process.exit(1);
}

if (contradictoryTarget || (isPreview && isProduction)) {
  console.log("Ambiguous Vercel deployment target held fail-closed.");
  process.exit(0);
}

if (isProduction) {
  if (validProductionApproval) {
    console.log(`Production deployment approved for exact commit ${commitSha}.`);
    process.exit(1);
  }
  console.log("Production deployment held: PLAIVRA_PRODUCTION_RELEASE_SHA must equal the exact 40-character VERCEL_GIT_COMMIT_SHA.");
  process.exit(0);
}

if (isPreview) {
  if (validPreviewApproval) {
    console.log(`Preview deployment approved for exact commit ${commitSha}.`);
    process.exit(1);
  }
  console.log("Preview deployment held: PLAIVRA_PREVIEW_RELEASE_SHA must equal the exact 40-character VERCEL_GIT_COMMIT_SHA.");
  process.exit(0);
}

console.log("Ambiguous Vercel deployment target held fail-closed.");
process.exit(0);
