import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { deriveMigrationLedgerState } from "./check-migration-ledger.mjs";
import {
  EXPECTED_REPOSITORY, exactCommit, numericRunId,
} from "./quality-evidence-contract.mjs";
import { expectedMigrationVersion } from "./release-identity-contract.mjs";
import { validateCanonicalQualityArtifact } from "./release-preflight.mjs";

const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;

function demand(condition, message) {
  if (!condition) throw new Error("POST_DEPLOY_PROVENANCE_INVALID: " + message);
}
function exact(value, label) {
  return exactCommit(value, label);
}
function treeSha(object) {
  const sha = object?.commit?.tree?.sha;
  demand(typeof sha === "string" && SHA.test(sha), "Git commit tree is missing or invalid");
  return sha;
}

export function verifyPostDeployProvenance(evidence) {
  const {
    repository, reviewedCommit, deployedCommit, comparisonBase, qualityRunId,
    expectedMigration, prNumber, pr, reviewedGitCommit, deployedGitCommit,
    qualityRun, qualityArtifact, qualityValidation,
    expectedProjectId, expectedDeploymentId, expectedEnvironment, deploymentHost,
    providerDeployment, providerAlias, version, health,
  } = evidence;
  demand(repository === EXPECTED_REPOSITORY, "Unexpected repository");
  const reviewed = exact(reviewedCommit, "Reviewed source commit");
  const deployed = exact(deployedCommit, "Deployed commit");
  const base = exact(comparisonBase, "Comparison base");
  const runId = numericRunId(qualityRunId);
  const migration = expectedMigrationVersion(expectedMigration);
  const sameCommit = reviewed === deployed;

  demand(qualityRun?.id != null && String(qualityRun.id) === runId, "Canonical Quality run ID mismatch");
  demand(qualityRun?.repository?.full_name === repository, "Canonical Quality repository mismatch");
  demand(qualityRun?.head_sha === reviewed, "Canonical Quality source commit mismatch");
  demand(qualityRun?.status === "completed" && qualityRun?.conclusion === "success",
    "Canonical Quality was not successful");
  demand(qualityRun?.event === "pull_request" &&
    qualityRun?.path === ".github/workflows/quality.yml" &&
    qualityRun?.run_attempt === 1, "Canonical Quality workflow, event or attempt mismatch");
  demand(qualityArtifact?.name === "quality-reports-" + runId &&
    qualityArtifact?.expired === false &&
    Number.isSafeInteger(qualityArtifact?.id) &&
    DIGEST.test(qualityArtifact?.digest ?? ""), "Missing, expired or invalid canonical Quality artifact");
  demand(String(qualityArtifact.workflow_run?.id) === runId &&
    qualityArtifact.workflow_run?.head_sha === reviewed, "Canonical Quality artifact origin mismatch");
  demand(qualityValidation?.valid === true && Array.isArray(qualityValidation.failures) &&
    qualityValidation.failures.length === 0, "Canonical Quality file/hash/gate verification failed");
  const qm = qualityValidation.metadata;
  const qmRelease = qualityValidation.manifest?.release;
  demand(qm?.repository === repository && qm?.reviewedCommit === reviewed &&
    qm?.comparisonBase === base && String(qm?.workflowRunId) === runId &&
    String(qm?.workflowRunAttempt) === "1" &&
    qm?.expectedDatabaseMigrationVersion === migration &&
    qmRelease?.commitSha === reviewed &&
    qmRelease?.expectedDatabaseMigrationVersion === migration &&
    String(qmRelease?.schemaCompatibilityVersion) === "2",
    "Canonical Quality manifest or artifact metadata identity mismatch");

  const sourceTree = treeSha(reviewedGitCommit);
  demand(reviewedGitCommit?.sha === reviewed, "Reviewed Git commit identity mismatch");
  if (!sameCommit || prNumber != null) {
    demand(Number.isSafeInteger(Number(prNumber)) && Number(prNumber) > 0,
      "Squash release requires an exact PR number");
    demand(pr?.number === Number(prNumber) && pr?.state === "closed" && pr?.merged === true,
      "Identified PR is not the exact merged PR");
    demand(pr?.head?.repo?.full_name === repository && pr?.base?.repo?.full_name === repository,
      "Identified PR belongs to a different repository");
    demand(pr?.head?.sha === reviewed && pr?.base?.sha === base,
      "PR head or comparison base differs from canonical Quality");
    demand(pr?.merge_commit_sha === deployed, "PR merge SHA is not the deployed commit");
  }
  if (!sameCommit) {
    demand(deployedGitCommit?.sha === deployed, "Squash commit identity mismatch");
    demand(treeSha(deployedGitCommit) === sourceTree, "Squash commit source tree differs from reviewed tree");
    demand(Array.isArray(deployedGitCommit.parents) &&
      deployedGitCommit.parents.length === 1 &&
      deployedGitCommit.parents[0]?.sha === base, "Squash first parent differs from approved base");
  }

  demand(typeof expectedProjectId === "string" && expectedProjectId.length > 0 &&
    typeof expectedDeploymentId === "string" && expectedDeploymentId.length > 0,
    "Vercel deployment and project IDs are required");
  demand(providerDeployment?.id === expectedDeploymentId &&
    providerDeployment?.projectId === expectedProjectId &&
    providerDeployment?.target === "production" &&
    providerDeployment?.readyState === "READY", "Vercel Production deployment is not exact and READY");
  const [org, repo] = repository.split("/");
  demand(providerDeployment?.meta?.githubCommitSha === deployed &&
    providerDeployment?.meta?.githubCommitRef === "main" &&
    providerDeployment?.meta?.githubOrg === org &&
    providerDeployment?.meta?.githubRepo === repo,
    "Vercel provider Git identity mismatch");
  demand(providerAlias?.alias === deploymentHost &&
    providerAlias?.deploymentId === expectedDeploymentId &&
    providerAlias?.projectId === expectedProjectId,
    "Live Vercel alias does not point at exact deployment");
  demand(expectedEnvironment === "production" &&
    version?.commitSha === deployed && version?.environment === expectedEnvironment &&
    version?.artifactIdentityValid === true &&
    String(version?.schemaCompatibilityVersion) === "2" &&
    String(version?.expectedSchemaCompatibilityVersion) === "2" &&
    String(version?.databaseSchemaCompatibilityVersion) === "2" &&
    version?.schemaCompatible === true &&
    version?.expectedDatabaseMigrationVersion === migration &&
    version?.databaseMigrationVersion === migration &&
    version?.migrationVersionCompatible === true &&
    version?.migrationLedgerReconciliationState === "reconciled" &&
    version?.migrationLedgerReconciled === true &&
    version?.pendingMigrationCount === 0 &&
    version?.schemaAppliedUntrackedCount === 0 &&
    version?.unresolvedMigrationCount === 0 &&
    version?.releaseReady === true, "Live /api/version identity, schema or ledger mismatch");
  demand(health?.status === "ok" && health?.release?.commitSha === deployed &&
    health?.release?.environment === expectedEnvironment &&
    String(health?.release?.schemaCompatibilityVersion) === "2",
    "Live /api/health identity mismatch");
  return Object.freeze({
    schemaVersion: 1, mode: sameCommit ? "same-commit" : "verified-squash",
    repository, pullRequest: sameCommit && prNumber == null ? null : Number(prNumber),
    reviewedCommit: reviewed, deployedCommit: deployed, comparisonBase: base,
    sourceTree, deployedTree: sameCommit ? sourceTree : treeSha(deployedGitCommit),
    qualityRunId: runId, qualityRunAttempt: 1,
    qualityArtifactId: qualityArtifact.id, qualityArtifactDigest: qualityArtifact.digest,
    expectedDatabaseMigrationVersion: migration, schemaCompatibilityVersion: "2",
    deploymentId: expectedDeploymentId, vercelProjectId: expectedProjectId,
    deploymentHost, providerCommitSha: deployed, versionCommitSha: deployed,
    deploymentState: "READY", releaseReady: true,
    productionMutationPerformed: false, deploymentPerformed: false,
  });
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    demand(argv[i]?.startsWith("--") && argv[i + 1] !== undefined, "Invalid CLI arguments");
    args[argv[i].slice(2)] = argv[i + 1];
  }
  return args;
}
function origin(urlValue) {
  const u = new URL(urlValue);
  demand(u.protocol === "https:" && !u.username && !u.password && !u.search &&
    !u.hash && (u.pathname === "/" || u.pathname === ""),
    "Production URL must be a clean HTTPS origin");
  return u;
}
async function jsonGet(url, token, label) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: "Bearer " + token,
      "user-agent": "Plaivra-Release-Provenance/1",
    },
    signal: AbortSignal.timeout(20000),
  });
  demand(response.ok, label + " returned HTTP " + response.status);
  return response.json();
}
async function publicJson(url, label) {
  const response = await fetch(url, {
    method: "GET", redirect: "error",
    signal: AbortSignal.timeout(20000),
    headers: { "user-agent": "Plaivra-Release-Provenance/1" },
  });
  demand(response.status === 200, label + " returned non-200");
  return response.json();
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const x = parseArgs(argv);
  const repository = EXPECTED_REPOSITORY;
  demand(env.GITHUB_TOKEN, "Missing GITHUB_TOKEN");
  demand(env.VERCEL_TOKEN, "Missing VERCEL_TOKEN Production read access");
  const deploymentHost = origin(x["deployment-url"]).hostname;
  const reviewed = exact(x["reviewed-commit"], "Reviewed commit");
  const deployed = exact(x["deployed-commit"], "Deployed commit");
  const base = exact(x["comparison-base"], "Comparison base");
  const id = numericRunId(x["quality-run-id"]);
  demand(x["deployment-id"] && x["vercel-project-id"], "Missing Vercel deployment/project ID");
  const prNumber = x["pr-number"] ? Number(x["pr-number"]) : null;
  demand(reviewed === deployed || (Number.isSafeInteger(prNumber) && prNumber > 0),
    "Squash requires a merged PR number");
  demand(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() === deployed,
    "Checkout does not equal deployed commit");

  const gh = "https://api.github.com/repos/" + repository;
  const auth = env.GITHUB_TOKEN;
  const api = (path, label) => jsonGet(gh + path, auth, label);
  const [pr, reviewedGitCommit, deployedGitCommit, qualityRun, listing] = await Promise.all([
    prNumber ? api("/pulls/" + prNumber, "Merged PR") : Promise.resolve(null),
    api("/commits/" + reviewed, "Reviewed commit"),
    reviewed === deployed ? Promise.resolve(null) : api("/commits/" + deployed, "Squash commit"),
    api("/actions/runs/" + id, "Canonical Quality"),
    api("/actions/runs/" + id + "/artifacts?per_page=100", "Quality artifacts"),
  ]);
  const artifactList = listing.artifacts ?? [];
  demand(artifactList.filter(a => a.name === "quality-reports-" + id).length === 1,
    "Expected exactly one canonical run-keyed artifact");

  const reportsPath = resolve(x["quality-reports"]);
  const ledger = JSON.parse(readFileSync(resolve("supabase/migration-ledger.json"), "utf8"));
  const metadata = JSON.parse(readFileSync(resolve(reportsPath, "artifact-metadata.json"), "utf8"));
  const qualityValidation = validateCanonicalQualityArtifact({
    reportsPath, expectedCommit: reviewed, expectedRepository: repository,
    qualityRunId: id, migrationState: deriveMigrationLedgerState(ledger),
    expectedComparisonBase: base, expectedValidationRequestId: metadata.validationRequestId,
    expectedMigration: x["expected-migration"],
  });

  const deployApi = new URL(
    "https://api.vercel.com/v13/deployments/" + encodeURIComponent(x["deployment-id"]),
  );
  if (env.VERCEL_TEAM_ID) deployApi.searchParams.set("teamId", env.VERCEL_TEAM_ID);
  const aliasApi = new URL("https://api.vercel.com/v4/aliases/" + deploymentHost);
  if (env.VERCEL_TEAM_ID) aliasApi.searchParams.set("teamId", env.VERCEL_TEAM_ID);
  const [providerDeployment, providerAlias] = await Promise.all([
    jsonGet(deployApi.toString(), env.VERCEL_TOKEN, "Vercel deployment"),
    jsonGet(aliasApi.toString(), env.VERCEL_TOKEN, "Vercel alias"),
  ]);
  // Verify the canonical alias against Vercel before requesting the live application.
  demand(providerAlias?.deploymentId === x["deployment-id"] &&
    providerAlias?.projectId === x["vercel-project-id"], "Unverified deployment host");
  const [version, health] = await Promise.all([
    publicJson("https://" + deploymentHost + "/api/version", "/api/version"),
    publicJson("https://" + deploymentHost + "/api/health", "/api/health"),
  ]);
  const evidence = verifyPostDeployProvenance({
    repository, reviewedCommit: reviewed, deployedCommit: deployed,
    comparisonBase: base, qualityRunId: id, prNumber, pr,
    reviewedGitCommit, deployedGitCommit, qualityRun,
    qualityArtifact: artifactList[0].name === "quality-reports-" + id
      ? artifactList[0] : artifactList.find(a => a.name === "quality-reports-" + id),
    qualityValidation, expectedMigration: x["expected-migration"],
    expectedProjectId: x["vercel-project-id"],
    expectedDeploymentId: x["deployment-id"], expectedEnvironment: x.environment,
    deploymentHost, providerDeployment, providerAlias, version, health,
  });
  const outputPath = resolve(x.output);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(evidence, null, 2) + "\n");
  process.stdout.write("POST_DEPLOY_PROVENANCE_VERIFIED\n");
  return evidence;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
