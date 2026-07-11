#!/usr/bin/env node

/**
 * Netlify ignore contract:
 * - exit 0: stop/skip this build
 * - exit 1: continue building
 *
 * Deploy previews and branch deploys remain available. A production build
 * proceeds only when PLAIVRA_PRODUCTION_RELEASE_SHA exactly matches COMMIT_REF.
 */

const context = (process.env.CONTEXT || "").trim();
const branch = (process.env.BRANCH || "").trim();
const commitSha = (process.env.COMMIT_REF || "").trim().toLowerCase();
const approvedSha = (process.env.PLAIVRA_PRODUCTION_RELEASE_SHA || "").trim().toLowerCase();
const runningOnNetlify = process.env.NETLIFY === "true" || Boolean(context || branch || commitSha);

const isPreview = context === "deploy-preview" || context === "branch-deploy" || context === "dev";
const isProduction = context === "production";
const validSha = /^[a-f0-9]{40}$/.test(commitSha);
const validApproval = /^[a-f0-9]{40}$/.test(approvedSha) && approvedSha === commitSha;

if (!runningOnNetlify) {
  console.log("Not running on Netlify; continue the local or CI build.");
  process.exit(1);
}

if (isPreview) {
  console.log("Netlify preview/branch deployment allowed.");
  process.exit(1);
}

if (isProduction) {
  if (validSha && validApproval) {
    console.log(`Netlify production deployment approved for exact commit ${commitSha}.`);
    process.exit(1);
  }
  console.log("Netlify production deployment held: PLAIVRA_PRODUCTION_RELEASE_SHA must equal the exact 40-character COMMIT_REF.");
  process.exit(0);
}

console.log("Ambiguous Netlify deployment target held fail-closed.");
process.exit(0);
