function requireEvidence(condition, reason) {
  if (!condition) throw new Error("POST_DEPLOY_SMOKE_INCOMPLETE: " + reason);
}
export function validateCompletedSmokeEvidence({
  anonymous, populated, empty, exits, expectedCommit, expectedMigration,
}) {
  requireEvidence(exits?.anonymous === "0" && exits?.populated === "0" &&
    exits?.empty === "0", "Every smoke process must exit 0");
  requireEvidence(anonymous && anonymous.expectedCommit === expectedCommit &&
    anonymous.expectedMigration === expectedMigration &&
    anonymous.version?.commitSha === expectedCommit &&
    anonymous.version?.databaseMigrationVersion === expectedMigration &&
    anonymous.version?.releaseReady === true &&
    anonymous.version?.artifactIdentityValid === true &&
    anonymous.checks && typeof anonymous.checks === "object" &&
    Object.keys(anonymous.checks).length > 0 &&
    Object.values(anonymous.checks).every(status => status === "passed"),
    "Anonymous smoke or release assertions are missing or failed");
  for (const [name, report] of [["populated", populated], ["empty", empty]]) {
    requireEvidence(report && report.passed === true &&
      report.accountState === name &&
      report.expectedCommit === expectedCommit &&
      report.expectedMigration === expectedMigration &&
      report.credentialsLogged === false &&
      report.syntheticDataOnly === true,
      "Authenticated " + name + " smoke is absent or failed");
    for (const field of ["pageErrors", "consoleErrors", "failedRequests", "serverErrors"]) {
      requireEvidence(Array.isArray(report[field]) && report[field].length === 0,
        "Authenticated " + name + " smoke contains " + field);
    }
  }
  return {
    anonymous: { status: "passed", evidence: "post-deploy-smoke.json" },
    authenticatedPopulated: {
      status: "passed", evidence: "authenticated-smoke-populated/summary.json",
    },
    authenticatedEmpty: { status: "passed", evidence: "authenticated-smoke-empty/summary.json" },
  };
}
