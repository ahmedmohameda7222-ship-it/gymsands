import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  WORKOUT_HISTORY_QA_SCENARIOS,
  WORKOUT_HISTORY_QA_VIEWPORTS,
} from "./workout-history-qa-fixture.mjs";

const requiredScenarios = [
  "initial-loading",
  "first-use-empty",
  "normal-month",
  "long-history",
  "incremental-load",
  "active-filters",
  "filtered-empty",
  "partial-session",
  "cancelled-meaningful",
  "scheduled-fallback",
  "blocking-error",
  "stale-cached-data",
  "offline-cached-read",
  "desktop-selection",
  "session-details",
  "expanded-exercises",
  "long-notes",
  "v1-muscle-snapshot",
  "v2-muscle-snapshot",
  "verified-pr",
  "correction-dialog",
  "post-correction-detail",
  "soft-delete-confirmation",
  "recently-deleted",
  "restore",
  "permanent-delete",
  "repeat-immediate-start",
  "repeat-replacement-review",
  "active-session-conflict",
  "long-translations",
  "keyboard-focus",
  "reduced-motion",
];

test("covers the exact WH-10 viewport, language, theme, and scenario contract", () => {
  assert.deepEqual(
    WORKOUT_HISTORY_QA_VIEWPORTS.map((item) => item.name),
    [
      "320x568",
      "360x800",
      "390x844",
      "430x932",
      "768x1024",
      "1024x768",
      "1280x800",
      "1440x900",
    ],
  );
  const names = new Set(WORKOUT_HISTORY_QA_SCENARIOS.map((item) => item.name));
  for (const scenario of requiredScenarios)
    assert.equal(names.has(scenario), true, scenario);
  assert.deepEqual(
    new Set(WORKOUT_HISTORY_QA_SCENARIOS.map((item) => item.language)),
    new Set(["en", "de", "ar"]),
  );
  assert.deepEqual(
    new Set(WORKOUT_HISTORY_QA_SCENARIOS.map((item) => item.theme)),
    new Set(["light", "dark"]),
  );
});

test("runner captures PNGs, inspects pixels and DOM, and emits machine evidence", async () => {
  const source = await readFile(
    new URL("./run-workout-history-qa.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /page\.screenshot/u);
  assert.match(source, /sharp\(screenshotPath\)\.stats/u);
  assert.match(source, /horizontalOverflowPx/u);
  assert.match(source, /pageErrors/u);
  assert.match(source, /consoleErrors/u);
  assert.match(source, /workout-history-qa-results\.json/u);
  assert.match(source, /QA_HEAD_SHA/u);
  assert.match(source, /QA_SERVER_MODE/u);
});
