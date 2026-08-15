import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  installWorkoutHistoryQaFixture,
  WORKOUT_HISTORY_QA_SCENARIOS,
} from "./workout-history-qa-fixture.mjs";

const baseUrl = process.env.QA_BASE_URL || "http://localhost:3000";
const outputDir = path.resolve(
  process.env.QA_WORKOUT_HISTORY_EVIDENCE_DIR ||
    path.join(process.cwd(), "quality-reports", "workout-history-qa-evidence"),
);
const headSha = process.env.QA_HEAD_SHA || process.env.GITHUB_SHA || "";
const serverMode = process.env.QA_SERVER_MODE || "production";
const scenario = WORKOUT_HISTORY_QA_SCENARIOS.find((candidate) => candidate.name === "list-200-percent");

if (!scenario) throw new Error("Missing list-200-percent Workout History QA scenario.");
if (!/^[a-f0-9]{40}$/iu.test(headSha)) throw new Error("QA_HEAD_SHA must be the exact 40-character head under inspection.");
if (serverMode !== "production") throw new Error(`Workout History zoom QA requires production server mode, received ${serverMode}.`);

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
let report;

try {
  const context = await browser.newContext({
    viewport: { width: scenario.viewport.width, height: scenario.viewport.height },
    colorScheme: scenario.theme,
    reducedMotion: "reduce",
    locale: scenario.language === "de" ? "de-DE" : scenario.language === "ar" ? "ar" : "en-US",
  });
  await installWorkoutHistoryQaFixture(context, scenario, baseUrl);
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  const response = await page.goto(`${baseUrl}${scenario.route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await page.waitForSelector("[data-workout-history-row]", { timeout: 20_000 });
  await page.waitForSelector("[data-workout-history-period-controls]", { timeout: 20_000 });
  await page.waitForTimeout(150);

  const layout = await page.evaluate(() => {
    const group = document.querySelector("[data-workout-history-period-controls]");
    const buttons = group ? Array.from(group.querySelectorAll("button")) : [];
    const viewportWidth = window.innerWidth;
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.left >= -1 && rect.right <= viewportWidth + 1;
    };
    return {
      zoom: document.documentElement.style.zoom,
      labels: buttons.map((button) => button.textContent?.replace(/\s+/gu, " ").trim() ?? ""),
      buttonCount: buttons.length,
      allButtonsVisible: buttons.length === 4 && buttons.every(visible),
      allLabelsUnclipped: buttons.length === 4 && buttons.every((button) => button.scrollWidth <= button.clientWidth + 1 && button.scrollHeight <= button.clientHeight + 1),
      groupVisible: visible(group),
      groupHorizontalOverflowPx: group instanceof HTMLElement ? Math.max(0, group.scrollWidth - group.clientWidth) : Number.POSITIVE_INFINITY,
      documentHorizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    };
  });

  const expectedLabels = scenario.language === "en" ? ["Week", "Month", "3 months", "Custom"] : null;
  const labelsMatch = expectedLabels === null || expectedLabels.every((label) => layout.labels.includes(label));
  const passed = response?.status() === 200
    && pageErrors.length === 0
    && consoleErrors.length === 0
    && layout.zoom === "2"
    && layout.buttonCount === 4
    && layout.allButtonsVisible
    && layout.allLabelsUnclipped
    && layout.groupVisible
    && layout.groupHorizontalOverflowPx <= 1
    && layout.documentHorizontalOverflowPx <= 1
    && labelsMatch;

  const screenshot = `period-reflow-${scenario.name}-${scenario.viewport.name}-${scenario.language}-${scenario.theme}.png`;
  await page.screenshot({ path: path.join(outputDir, screenshot), animations: "disabled", fullPage: false });
  report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    headSha,
    scenario: scenario.name,
    viewport: scenario.viewport.name,
    language: scenario.language,
    theme: scenario.theme,
    screenshot,
    pageErrors,
    consoleErrors,
    layout,
    passed,
  };
  await context.close();
} finally {
  await browser.close();
}

await writeFile(
  path.join(outputDir, "workout-history-zoom-period-qa.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`Workout History 200% period reflow QA: ${report?.passed ? "PASS" : "FAIL"}\n`);
if (!report?.passed) process.exitCode = 1;
