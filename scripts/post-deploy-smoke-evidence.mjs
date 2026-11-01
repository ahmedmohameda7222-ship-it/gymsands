function requireEvidence(condition, reason) {
  if (!condition) throw new Error("POST_DEPLOY_SMOKE_INCOMPLETE: " + reason);
}
const REQUIRED_ANONYMOUS_CHECKS = Object.freeze([
  "landing", "versionEndpoint", "commitMatch", "buildTimestamp", "artifactIdentity",
  "schemaMarkerCompatibility", "migrationVersionCompatibility",
  "migrationLedgerReconciliation", "releaseReadiness", "health", "login", "legalLinks",
]);
const REQUIRED_AUTHENTICATED_ROUTES = Object.freeze([
  "dashboard", "train", "active-workout", "eat", "meal-plan", "progress",
  "settings", "privacy-controls",
]);

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
    REQUIRED_ANONYMOUS_CHECKS.every(name => anonymous.checks[name] === "passed") &&
    Object.values(anonymous.checks).every(status => status === "passed"),
    "Anonymous smoke or release assertions are missing or failed");
  for (const [name, report] of [["populated", populated], ["empty", empty]]) {
    requireEvidence(report && report.passed === true &&
      report.accountState === name &&
      report.expectedCommit === expectedCommit &&
      report.expectedMigration === expectedMigration &&
      report.credentialsLogged === false &&
      report.syntheticDataOnly === true &&
      report.version?.commitSha === expectedCommit &&
      report.version?.expectedDatabaseMigrationVersion === expectedMigration &&
      report.version?.releaseReady === true,
      "Authenticated " + name + " smoke is absent or failed");
    requireEvidence(Array.isArray(report.routes) &&
      report.routes.length === REQUIRED_AUTHENTICATED_ROUTES.length &&
      REQUIRED_AUTHENTICATED_ROUTES.every(id =>
        report.routes.filter(route => route?.id === id && route.passed === true).length === 1),
      "Authenticated " + name + " route evidence is incomplete");
    requireEvidence(name === "populated"
      ? Number.isFinite(report.incidentState?.foodLogCount) &&
        report.incidentState.foodLogCount >= 1 &&
        report.incidentState.nutritionLoaded === true &&
        report.incidentState.activeTarget === true &&
        report.incidentState.remainingValuesRendered === true
      : report.incidentState?.foodLogCount === 0,
      "Authenticated " + name + " incident state evidence is incomplete");
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
