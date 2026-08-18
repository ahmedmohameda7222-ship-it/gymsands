import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runner = readFileSync("scripts/run-active-workout-data-conflict-behavioral-qa.mjs", "utf8");
const entry = readFileSync("scripts/run-aw10-active-workout-closure-qa-entry.mjs", "utf8");

describe("Active Workout behavioral data-conflict regression authority", () => {
  it("is permanently wired into the canonical Active Workout rendered-QA entry", () => {
    expect(entry).toContain('await import("./run-active-workout-data-conflict-behavioral-qa.mjs")');
    expect(runner).toContain('import { chromium } from "@playwright/test"');
    expect(runner).toContain("installAw5CorrectionFixture");
    expect(runner).toContain("QA_HEAD_SHA is required for exact-head Active Workout data-conflict behavioral evidence");
    expect(runner).toContain("requires production mode");
  });

  it("covers the required conflict viewports, recovery choices, priority case, and real RTL fixture", () => {
    for (const required of [
      "data-conflict-keep-server-mobile-en-320x568",
      "data-conflict-use-local-mobile-ar-rtl-390x844",
      "data-conflict-pending-sync-mobile-en-430x932",
      "data-conflict-desktop-sanity-en-1280x800",
      'resolution: "server"',
      'resolution: "local"',
      'language: "ar"',
      'direction !== "rtl"'
    ]) expect(runner).toContain(required);
  });

  it("measures all rendered mutation classes without counting conflict-resolution actions", () => {
    for (const selector of [
      "#active-set-reps",
      "#active-set-weight",
      "[data-aw5-primary-action]",
      "[data-aw5-set-path-number]",
      "[data-aw5-rest-presets] button",
      "#active-set-rpe",
      "#active-set-rir",
      "#active-set-type",
      "#active-set-note",
      "[data-aw10-session-menu]",
      "[data-aw10-exercise-actions]",
      "[data-aw-exercise-navigator]"
    ]) expect(runner).toContain(selector);
    expect(runner).toContain("enabledExecutionMutationsBeforeResolution");
    expect(runner).toContain("enabled execution mutations");
    expect(runner).toContain("expected 0");
    expect(runner).not.toContain('removeAttribute("disabled")');
    expect(runner).not.toContain("disabled = false");
  });

  it("behaviorally attempts blocked interactions and requires post-resolution mutation recovery", () => {
    expect(runner).toContain("attemptBlockedInteractions");
    expect(runner).toContain('await reps.fill(result.reps.before === "9" ? "10" : "9"');
    expect(runner).toContain("blocked Set Path interaction changed execution cursor");
    expect(runner).toContain("blocked primary action changed execution state");
    expect(runner).toContain("proveExecutionRecovery");
    expect(runner).toContain('await reps.fill("9")');
    expect(runner).toContain('await weight.fill("82.5")');
    expect(runner).toContain("executionRecovered");
  });

  it("persists exact-head machine-readable and screenshot evidence in the canonical AW10 artifact", () => {
    for (const field of [
      "scenarioName",
      "exactHeadSha",
      "viewport",
      "locale",
      "direction",
      "conflictState",
      "blockerCount",
      "standaloneSyncCount",
      "enabledExecutionMutationsBeforeResolution",
      "keepServerEnabled",
      "useLocalEnabled",
      "attemptedBlockedInteractionResult",
      "chosenResolution",
      "pendingOperationsAtConflict",
      "pendingOperationsAfterResolution",
      "conflictVisibleAfterResolution",
      "executionRecovered",
      "horizontalOverflow",
      "blockerCtaOverlap",
      "failures"
    ]) expect(runner).toContain(field);
    expect(runner).toContain("active-workout-data-conflict-behavioral-results.json");
    expect(runner).toContain("-unresolved.png");
    expect(runner).toContain("-resolved.png");
  });
});
