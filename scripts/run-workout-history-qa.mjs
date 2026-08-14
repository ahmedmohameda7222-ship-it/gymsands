import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const coreScript = "scripts/run-workout-history-core-qa.mjs";
const zoomPeriodScript = "scripts/run-workout-history-zoom-period-qa.mjs";
const reportScript = "scripts/run-workout-report-qa.mjs";
const coreSource = readFileSync(
  new URL("./run-workout-history-core-qa.mjs", import.meta.url),
  "utf8",
);

for (const requiredAuthority of [
  "page.screenshot",
  "sharp(screenshotPath).stats",
  "horizontalOverflowPx",
  "pageErrors",
  "consoleErrors",
  "workout-history-qa-results.json",
  "QA_HEAD_SHA",
  "QA_SERVER_MODE",
]) {
  if (!coreSource.includes(requiredAuthority)) {
    throw new Error(
      `Canonical Workout History QA authority is incomplete: ${requiredAuthority}`,
    );
  }
}

for (const script of [coreScript, zoomPeriodScript, reportScript]) {
  const result = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
