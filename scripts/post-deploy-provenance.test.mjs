import assert from "node:assert/strict";
import test from "node:test";
import { verifyPostDeployProvenance } from "./post-deploy-provenance.mjs";

const REPO = "ahmedmohameda7222-ship-it/gymsands";
const BASE = "b".repeat(40);
const REVIEWED = "a".repeat(40);
const DEPLOYED = "c".repeat(40);
const TREE = "d".repeat(40);
const MIGRATION = "20260724232734";

function fixture() {
  return {
    repository: REPO, reviewedCommit: REVIEWED, deployedCommit: DEPLOYED,
    comparisonBase: BASE, qualityRunId: "123456", prNumber: 77,
    expectedMigration: MIGRATION, expectedProjectId: "prj-verified",
    expectedDeploymentId: "dpl-verified", expectedEnvironment: "production",
    deploymentHost: "app.plaivra.com",
    pr: {
      state: "closed", merged: true, number: 77, merge_commit_sha: DEPLOYED,
      head: { sha: REVIEWED, repo: { full_name: REPO } },
      base: { sha: BASE, repo: { full_name: REPO } },
      base_repo: { full_name: REPO },
    },
    reviewedGitCommit: { sha: REVIEWED, commit: { tree: { sha: TREE } } },
    deployedGitCommit: {
      sha: DEPLOYED, commit: { tree: { sha: TREE } },
      parents: [{ sha: BASE }],
    },
    qualityRun: {
      id: 123456, head_sha: REVIEWED, status: "completed", conclusion: "success",
      event: "pull_request", run_attempt: 1,
      path: ".github/workflows/quality.yml",
      repository: { full_name: REPO },
    },
    qualityArtifact: {
      id: 654321, name: "quality-reports-123456", expired: false,
      digest: "sha256:" + "f".repeat(64),
      workflow_run: { id: 123456, head_sha: REVIEWED },
    },
    qualityValidation: {
      valid: true, failures: [],
      manifest: {
        release: { commitSha: REVIEWED, expectedDatabaseMigrationVersion: MIGRATION,
          schemaCompatibilityVersion: "2" },
      },
      metadata: {
        repository: REPO, reviewedCommit: REVIEWED, comparisonBase: BASE,
        workflowRunId: "123456", workflowRunAttempt: "1",
        expectedDatabaseMigrationVersion: MIGRATION,
      },
    },
    providerDeployment: {
      id: "dpl-verified", projectId: "prj-verified", target: "production",
      readyState: "READY", meta: {
        githubCommitSha: DEPLOYED, githubCommitRef: "main",
        githubRepo: "gymsands", githubOrg: "ahmedmohameda7222-ship-it",
      },
    },
    providerAlias: { alias: "app.plaivra.com", deploymentId: "dpl-verified",
      projectId: "prj-verified" },
    version: {
      commitSha: DEPLOYED, environment: "production", artifactIdentityValid: true,
      schemaCompatibilityVersion: "2", databaseSchemaCompatibilityVersion: "2",
      expectedSchemaCompatibilityVersion: "2", schemaCompatible: true,
      expectedDatabaseMigrationVersion: MIGRATION, databaseMigrationVersion: MIGRATION,
      migrationVersionCompatible: true, migrationLedgerReconciled: true,
      migrationLedgerReconciliationState: "reconciled", pendingMigrationCount: 0,
      schemaAppliedUntrackedCount: 0, unresolvedMigrationCount: 0, releaseReady: true,
    },
    health: { status: "ok", release: { commitSha: DEPLOYED, environment: "production",
      schemaCompatibilityVersion: "2" } },
  };
}
const patch = (edit) => { const f = fixture(); edit(f); return f; };
const accepted = (f) => verifyPostDeployProvenance(f);

test("verified squash retains distinct source and deployed SHA, tree and PR lineage", () => {
  const result = accepted(fixture());
  assert.equal(result.reviewedCommit, REVIEWED);
  assert.equal(result.deployedCommit, DEPLOYED);
  assert.equal(result.sourceTree, TREE);
  assert.equal(result.comparisonBase, BASE);
  assert.equal(result.mode, "verified-squash");
  assert.equal(result.qualityArtifactId, 654321);
  assert.equal(result.deploymentId, "dpl-verified");
  assert.equal(result.productionMutationPerformed, false);
  assert.equal(result.deploymentPerformed, false);
});

test("ordinary same-commit release remains accepted without a PR", () => {
  const f = fixture();
  f.deployedCommit = REVIEWED;
  f.prNumber = null; f.pr = null;
  f.providerDeployment.meta.githubCommitSha = REVIEWED;
  f.version.commitSha = REVIEWED; f.health.release.commitSha = REVIEWED;
  f.deployedGitCommit = null;
  const result = accepted(f);
  assert.equal(result.mode, "same-commit");
  assert.equal(result.deployedCommit, REVIEWED);
});

for (const [name, mutate] of [
  ["unknown repository", f => { f.repository = "attacker/gymsands"; }],
  ["foreign PR head repository", f => { f.pr.head.repo.full_name = "attacker/gymsands"; }],
  ["unmerged PR", f => { f.pr.merged = false; }],
  ["wrong PR number", f => { f.pr.number = 76; }],
  ["wrong PR HEAD", f => { f.pr.head.sha = "e".repeat(40); }],
  ["wrong approved comparison base", f => { f.pr.base.sha = "e".repeat(40); }],
  ["wrong merge commit", f => { f.pr.merge_commit_sha = "e".repeat(40); }],
  ["wrong squash first parent", f => { f.deployedGitCommit.parents[0].sha = "e".repeat(40); }],
  ["octopus merge", f => { f.deployedGitCommit.parents.push({ sha: "e".repeat(40) }); }],
  ["different source tree", f => { f.deployedGitCommit.commit.tree.sha = "e".repeat(40); }],
  ["arbitrary same-tree commit", f => { f.pr.merge_commit_sha = "e".repeat(40); }],
  ["Quality run failed", f => { f.qualityRun.conclusion = "failure"; }],
  ["Quality run incomplete", f => { f.qualityRun.status = "in_progress"; }],
  ["wrong Quality HEAD", f => { f.qualityRun.head_sha = DEPLOYED; }],
  ["wrong Quality repository", f => { f.qualityRun.repository.full_name = "attacker/gymsands"; }],
  ["wrong Quality attempt", f => { f.qualityRun.run_attempt = 2; }],
  ["wrong Quality workflow", f => { f.qualityRun.path = ".github/workflows/other.yml"; }],
  ["missing Quality artifact", f => { f.qualityArtifact = null; }],
  ["tampered Quality artifact digest", f => { f.qualityArtifact.digest = "not-a-digest"; }],
  ["expired Quality artifact", f => { f.qualityArtifact.expired = true; }],
  ["artifact run mismatch", f => { f.qualityArtifact.workflow_run.id = 1; }],
  ["invalid Quality artifact index", f => { f.qualityValidation.valid = false; f.qualityValidation.failures = ["evidence_index_digest_mismatch"]; }],
  ["wrong Quality metadata commit", f => { f.qualityValidation.metadata.reviewedCommit = DEPLOYED; }],
  ["wrong Quality migration target", f => { f.qualityValidation.metadata.expectedDatabaseMigrationVersion = "20260724232735"; }],
  ["provider SHA mismatch", f => { f.providerDeployment.meta.githubCommitSha = REVIEWED; }],
  ["provider project mismatch", f => { f.providerDeployment.projectId = "other"; }],
  ["provider not READY", f => { f.providerDeployment.readyState = "BUILDING"; }],
  ["provider alias mismatch", f => { f.providerAlias.deploymentId = "other"; }],
  ["version SHA mismatch", f => { f.version.commitSha = REVIEWED; }],
  ["health SHA mismatch", f => { f.health.release.commitSha = REVIEWED; }],
  ["wrong compatibility schema", f => { f.version.databaseSchemaCompatibilityVersion = "3"; }],
  ["wrong released migration marker", f => { f.version.databaseMigrationVersion = "20260724232735"; }],
  ["unreconciled migrations", f => { f.version.migrationLedgerReconciled = false; }],
  ["unready release", f => { f.version.releaseReady = false; }],
]) {
  test("fail closed on " + name, () => {
    assert.throws(() => accepted(patch(mutate)));
  });
}

test("squash requires identifiable reviewed PR and may not use tree-only authority", () => {
  assert.throws(() => accepted(patch(f => { f.prNumber = null; f.pr = null; })));
});
