import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runner = readFileSync("scripts/run-aw10-active-workout-closure-qa.mjs", "utf8");
const fixture = readFileSync("scripts/train-layout-qa-fixture.mjs", "utf8");
const workflow = readFileSync(".github/workflows/pr-quality.yml", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

describe("AW-10 canonical Active Workout closure", () => {
  it("defines exactly thirty production exact-head scenarios", () => {
    expect(runner.match(/^\s*\["\d{2}-/gm)).toHaveLength(30);
    expect(runner).toContain("QA_HEAD_SHA is required for exact-head AW-10 evidence");
    expect(runner).toContain("AW-10 requires production server mode");
    for (const required of [
      "320x568", "768x1024", "1440x900", "mobile-ar-rtl", "desktop-en-dark",
      "direct-mobile", "completion-metrics", "offline-refresh", "reconnect-flush",
      "terminal-pending", "server-terminal-wins", "same-tab-explicit-continue",
      "device-conflict-readonly", "takeover-confirmation", "conflict-server", "conflict-local"
    ]) expect(runner).toContain(required);
  });

  it("uses durable fixture authority instead of DOM-only simulation", () => {
    expect(runner).toContain("indexedDB.open(\"plaivra-active-workout-v1\", 1)");
    expect(runner).toContain("mutateFirstOperation");
    expect(runner).toContain("mutateCachedController");
    expect(runner).toContain("fixture.setServerRootStatus(\"completed\")");
    expect(fixture).toContain("let performedLogs = []");
    expect(fixture).toContain("performedLogsSnapshot");
    expect(fixture).toContain("setServerRootStatus(status)");
  });

  it("runs once in canonical PR Quality and uploads the same evidence artifact", () => {
    expect(workflow.match(/npm run qa:active-workout:aw10/g)).toHaveLength(1);
    expect(workflow.match(/ci-reports\/active-workout-aw10-evidence/g)).toHaveLength(2);
    expect(workflow).toContain("QA_AW10_EVIDENCE_DIR=ci-reports/active-workout-aw10-evidence");
    expect(packageJson.scripts["qa:active-workout:aw10"]).toBe(
      "node scripts/run-aw10-active-workout-closure-qa.mjs",
    );
  });
});
