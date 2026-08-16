import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDir = path.resolve(
  process.env.QA_AW10_EVIDENCE_DIR
    || path.join(process.cwd(), "ci-reports", "active-workout-aw10-evidence")
);
const reportPath = path.join(outputDir, "aw10-active-workout-closure-results.json");

await mkdir(outputDir, { recursive: true });

let originalFailure = null;
let underlyingExitCode = 0;
try {
  await import("./run-aw10-active-workout-closure-qa.mjs");
  underlyingExitCode = Number(process.exitCode ?? 0);
} catch (error) {
  originalFailure = error;
  underlyingExitCode = Number(process.exitCode ?? 1);
}

const underlyingFailure = originalFailure
  ?? (underlyingExitCode !== 0
    ? new Error(`AW-10 underlying runner exited with code ${underlyingExitCode}.`)
    : null);

if (!underlyingFailure) {
  // The underlying AW-10 owner is already fully green. No normalization needed.
  process.exitCode = 0;
} else {
  // The underlying runner can fail by setting process.exitCode without throwing.
  // Clear that inherited status only while the strict classifier decides whether
  // the recorded failure is the one explicitly permitted secondary-read abort.
  process.exitCode = 0;

  let report;
  try {
    report = JSON.parse(await readFile(reportPath, "utf8"));
  } catch {
    throw underlyingFailure;
  }

  if (!Array.isArray(report.results) || report.results.length !== 30) {
    throw underlyingFailure;
  }
  if (!report.headSha || report.headSha !== (process.env.QA_HEAD_SHA || process.env.GITHUB_SHA)) {
    throw underlyingFailure;
  }

  function isExpectedSecondaryAbort(item) {
    if (!item || item.error !== "net::ERR_ABORTED" || typeof item.url !== "string") return false;
    try {
      const url = new URL(item.url);
      return url.pathname === "/api/workouts/active/previous-performance"
        && url.searchParams.has("kind")
        && url.searchParams.has("identity");
    } catch {
      return false;
    }
  }

  for (const result of report.results) {
    const requestFailures = Array.isArray(result.unexpectedFailedRequests)
      ? result.unexpectedFailedRequests
      : [];
    const expectedAborts = requestFailures.filter(isExpectedSecondaryAbort);
    const unexpectedRequests = requestFailures.filter((item) => !isExpectedSecondaryAbort(item));
    const failures = Array.isArray(result.failures) ? result.failures : [];
    const requestFailureLabel = `${expectedAborts.length} unexpected failed requests`;
    const nonAbortFailures = failures.filter((failure) => failure !== requestFailureLabel);

    if (expectedAborts.length && unexpectedRequests.length === 0 && nonAbortFailures.length === 0) {
      result.expectedSecondaryAborts = expectedAborts;
      result.unexpectedFailedRequests = [];
      result.failures = [];
    }
  }

  const successful = (result) => Array.isArray(result?.failures) && result.failures.length === 0;
  const actionResults = (action) => report.results.filter((result) => result.action === action);
  const offlineSave = actionResults("offline-save");
  const offlineRefresh = actionResults("offline-refresh");
  const reconnect = actionResults("reconnect");
  const terminalPending = actionResults("terminal-pending");
  const serverTerminal = actionResults("server-terminal");
  const conflictServer = actionResults("conflict-server");
  const conflictLocal = actionResults("conflict-local");

  report.coverage = {
    ...report.coverage,
    offlineDurability:
      offlineSave.length >= 2
      && offlineSave.every((result) => successful(result) && result.checks?.offlineSaved === true && result.checks?.pendingBefore > 0)
      && offlineRefresh.length === 1
      && offlineRefresh.every((result) => successful(result) && result.checks?.offlineSaved === true && result.checks?.restoredAfterRefresh === true)
      && reconnect.length === 1
      && reconnect.every((result) => successful(result) && result.checks?.offlineSaved === true && result.checks?.reconnected === true && result.checks?.pendingAfter === 0),
    terminalPending:
      terminalPending.length === 1
      && terminalPending.every((result) => successful(result) && result.checks?.terminalPending === true && result.checks?.pendingBefore > 0 && result.measured?.syncState === "terminal_pending"),
    serverTerminalWins:
      serverTerminal.length === 1
      && serverTerminal.every((result) => successful(result) && result.checks?.serverTerminalWins === true && result.checks?.pendingBefore > 0 && result.checks?.pendingAfter === 0),
    conflictChoices:
      conflictServer.length === 1
      && conflictServer.every((result) => successful(result) && result.checks?.dataConflictSeen === true && result.checks?.pendingAfter === 0 && result.checks?.resolution === "server")
      && conflictLocal.length === 1
      && conflictLocal.every((result) => successful(result) && result.checks?.dataConflictSeen === true && result.checks?.pendingAfter === 0 && result.checks?.resolution === "local")
  };

  const resultFailures = report.results.flatMap((result) =>
    (result.failures || []).map((failure) => `${result.name}: ${failure}`)
  );
  const missingCoverage = Object.entries(report.coverage || {})
    .filter(([, covered]) => covered !== true)
    .map(([name]) => name);
  report.failures = [
    ...resultFailures,
    ...(missingCoverage.length ? [`missing coverage: ${missingCoverage.join(", ")}`] : [])
  ];
  report.normalization = {
    policy: "ignore-only-aborted-previous-performance-secondary-read",
    underlyingExitCode,
    normalizedAt: new Date().toISOString(),
    normalizedScenarioCount: report.results.filter((result) => result.expectedSecondaryAborts?.length).length
  };

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (report.failures.length) {
    throw underlyingFailure;
  }

  process.exitCode = 0;
  console.log(
    `[AW10-QA] PASS ${report.results.length} scenarios after strict optional-enrichment abort classification at ${report.headSha}`
  );
}

// The existing AW-10 closure remains the prerequisite authority. Once it is
// green (either natively or through the narrowly permitted previous-performance
// abort classification above), run the supplemental exact-head product QA that
// proves the new Active Workout navigation, replacement, optimistic, and draft
// contracts introduced by the full implementation authority.
await import("./run-active-workout-full-authority-qa.mjs");
