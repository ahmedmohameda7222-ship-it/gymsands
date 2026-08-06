import { chromium } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const baseUrl = process.env.QA_BASE_URL || "http://localhost:3000";
const outputDir = path.resolve(
  process.env.QA_WORKOUT_HISTORY_EVIDENCE_DIR ||
    path.join(process.cwd(), "quality-reports", "workout-history-qa-evidence"),
  "p8a-single-workout-report",
);
const headSha = process.env.QA_HEAD_SHA || process.env.GITHUB_SHA || "";
const DETAIL_ID = "20000000-0000-4000-8000-000000000002";
const SCHEDULED_ID = "21000000-0000-4000-8000-000000000001";
const QA_TOKEN = "plaivra-rendered-qa-access-token";

if (!/^[a-f0-9]{40}$/iu.test(headSha)) {
  throw new Error("QA_HEAD_SHA must be the exact 40-character head under inspection.");
}


async function generatePdfEvidence() {
  const pdfDirectory = path.join(outputDir, "pdf-evidence");
  await mkdir(pdfDirectory, { recursive: true });
  const vitest = path.join(process.cwd(), "node_modules", "vitest", "vitest.mjs");
  const result = spawnSync(
    process.execPath,
    [
      vitest,
      "run",
      "lib/reports/workout/render-evidence.test.ts",
      "--config",
      "vitest.unit.config.mjs",
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, P8A_PDF_EVIDENCE_DIR: pdfDirectory },
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error("P8A PDF evidence generation failed.");
  }

  const pdfFiles = (await readdir(pdfDirectory))
    .filter((file) => file.endsWith(".pdf"))
    .sort();
  if (pdfFiles.length !== 3) {
    throw new Error(`Expected three P8A PDF evidence files, found ${pdfFiles.length}.`);
  }
  const renderedPages = [];
  for (const pdfFile of pdfFiles) {
    const source = path.join(pdfDirectory, pdfFile);
    const prefix = path.join(pdfDirectory, pdfFile.replace(/\.pdf$/u, ""));
    const render = spawnSync(
      "pdftoppm",
      ["-png", "-r", "150", source, prefix],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    if (render.error) throw render.error;
    if (render.status !== 0) {
      throw new Error(
        `P8A PDF page rendering failed for ${pdfFile}: ${render.stderr || "unknown error"}`,
      );
    }
  }
  for (const file of (await readdir(pdfDirectory))
    .filter((candidate) => candidate.endsWith(".png"))
    .sort()) {
    const image = sharp(path.join(pdfDirectory, file));
    const [metadata, stats] = await Promise.all([
      image.metadata(),
      image.stats(),
    ]);
    renderedPages.push({
      file,
      width: metadata.width ?? null,
      height: metadata.height ?? null,
      entropy: Number(stats.entropy.toFixed(4)),
    });
  }
  if (!renderedPages.length) {
    throw new Error("P8A PDF evidence did not produce rendered page images.");
  }
  if (
    renderedPages.some(
      (page) =>
        page.width === null ||
        page.height === null ||
        page.width < 1_000 ||
        page.height < 1_400 ||
        page.entropy < 0.05,
    )
  ) {
    throw new Error(
      "P8A PDF rendered-page evidence failed basic image integrity bounds.",
    );
  }
  await writeFile(
    path.join(pdfDirectory, "evidence.json"),
    `${JSON.stringify({ exactHead: headSha, pdfFiles, renderedPages }, null, 2)}\n`,
  );
}
const scenarios = [
  { name: "desktop-en-success", width: 1280, height: 800, language: "en", theme: "light", outcome: "success" },
  { name: "desktop-de-success", width: 1440, height: 900, language: "de", theme: "dark", outcome: "success" },
  { name: "tablet-ar-success", width: 768, height: 1024, language: "ar", theme: "light", outcome: "success" },
  { name: "mobile-en-success", width: 360, height: 780, language: "en", theme: "light", outcome: "success" },
  { name: "mobile-ar-failure", width: 390, height: 844, language: "ar", theme: "dark", outcome: "failure" },
  { name: "mobile-de-slow", width: 430, height: 932, language: "de", theme: "light", outcome: "slow" },
  { name: "scheduled-no-action", width: 768, height: 1024, language: "en", theme: "light", outcome: "scheduled" },
];

function detail(sourceKind = "performed") {
  const performed = sourceKind === "performed";
  return {
    contractVersion: 1,
    activity: {
      contractVersion: 1,
      activityId: performed ? DETAIL_ID : SCHEDULED_ID,
      canonicalSessionId: performed ? DETAIL_ID : null,
      scheduledSessionId: performed ? null : SCHEDULED_ID,
      userId: "00000000-0000-4000-8000-000000000001",
      sourceKind,
      lifecycle: performed ? "completed" : "partial",
      title: performed ? "Push & Pull — تمرين" : "Scheduled mobility",
      category: "strength",
      effectiveAt: "2026-08-05T18:30:00.000Z",
      startedAt: performed ? "2026-08-05T18:00:00.000Z" : null,
      completedAt: performed ? "2026-08-05T18:45:00.000Z" : null,
      skippedAt: null,
      cancelledAt: null,
      durationMinutes: performed ? 45 : null,
      notes: "Saved QA note.",
      planId: null,
      planDayId: null,
      planWeekId: null,
      planSessionId: null,
      hasPerformedSets: performed,
      hasMeaningfulPerformance: performed,
      capabilities: {
        openDetails: true,
        showPerformedSets: performed,
        showPlannedVsActual: performed,
        showMuscleAnalysis: false,
        calculatePerformanceMetrics: performed,
        calculateVerifiedRecords: performed,
        repeatWorkout: performed,
        correctSession: performed,
        softDeleteSession: performed,
      },
    },
    historyRevision: 1,
    summary: {
      exerciseCount: 1,
      completedSetCount: performed ? 2 : null,
      reliableVolume: performed ? 1200 : null,
      verifiedRecordCount: performed ? 1 : null,
    },
    snapshot: performed
      ? { id: "snapshot", schemaVersion: "v2", frozenAt: "2026-08-05T18:45:00.000Z" }
      : null,
    exercises: [
      {
        identity: "qa-bench",
        exerciseId: null,
        snapshotItemId: null,
        name: "Bench Press",
        plannedName: null,
        state: performed ? "completed" : "planned",
        category: "strength",
        plannedSetCount: 2,
        performedSets: performed
          ? [
              {
                id: "qa-set-1",
                setNumber: 1,
                reps: 8,
                weightKg: 75,
                completedAt: "2026-08-05T18:10:00.000Z",
                notes: null,
                setType: "working",
                rpe: 8,
                rir: 2,
                matchState: "matched",
                plannedSet: null,
                metrics: [],
                segments: [],
                verifiedRecords: [],
              },
              {
                id: "qa-set-2",
                setNumber: 2,
                reps: 10,
                weightKg: 60,
                completedAt: "2026-08-05T18:15:00.000Z",
                notes: "Controlled tempo.",
                setType: "working",
                rpe: 7,
                rir: 3,
                matchState: "matched",
                plannedSet: null,
                metrics: [],
                segments: [],
                verifiedRecords: [],
              },
            ]
          : [],
        missingPlannedSets: [],
      },
    ],
    timeline: [],
    notices: [],
  };
}

async function installFixture(context, scenario, state) {
  const origin = new URL(baseUrl).origin;
  await context.addCookies([
    { name: "plaivra.language.v1", value: scenario.language, url: origin },
  ]);
  await context.addInitScript(
    ({ language, theme }) => {
      localStorage.setItem("plaivra.language.v1", language);
      localStorage.setItem("plaivra-theme-id", theme === "dark" ? "elite-noir" : "olive");
    },
    { language: scenario.language, theme: scenario.theme },
  );
  await context.route(/^https:\/\/[^/]+\.supabase\.co\//u, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await context.route(`${origin}/api/workouts/history/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith("/report")) {
      state.reportRequests.push({
        url: request.url(),
        authorization: request.headers().authorization ?? null,
      });
      if (scenario.outcome === "failure") {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Report unavailable", code: "report_unavailable" }),
        });
        return;
      }
      if (scenario.outcome === "slow") await new Promise((resolve) => setTimeout(resolve, 800));
      await route.fulfill({
        status: 200,
        contentType: "application/pdf",
        headers: {
          "Content-Disposition": 'attachment; filename="plaivra-workout-report-2026-08-05.pdf"',
          "Cache-Control": "private, no-store, max-age=0",
        },
        body: "%PDF-1.7\n% Plaivra QA\n%%EOF",
      });
      return;
    }
    if (url.pathname === `/api/workouts/history/${DETAIL_ID}`) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detail("performed")) });
      return;
    }
    if (url.pathname === `/api/workouts/history/scheduled/${SCHEDULED_ID}`) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detail("scheduled_fallback")) });
      return;
    }
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Unmatched P8A QA route" }) });
  });
}

await mkdir(outputDir, { recursive: true });
await generatePdfEvidence();
const browser = await chromium.launch({ headless: true });
const observations = [];
let failed = false;

try {
  for (const scenario of scenarios) {
    const context = await browser.newContext({
      viewport: { width: scenario.width, height: scenario.height },
      colorScheme: scenario.theme,
      reducedMotion: "reduce",
      locale: scenario.language === "de" ? "de-DE" : scenario.language === "ar" ? "ar" : "en-US",
      acceptDownloads: true,
    });
    const state = { reportRequests: [] };
    await installFixture(context, scenario, state);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        !(
          scenario.outcome === "failure" &&
          /Failed to load resource: the server responded with a status of 503/iu.test(message.text())
        )
      ) {
        errors.push(message.text());
      }
    });
    const route = scenario.outcome === "scheduled"
      ? `/workout-history/scheduled/${SCHEDULED_ID}`
      : `/workout-history/${DETAIL_ID}`;
    const response = await page.goto(`${baseUrl}${route}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await page.waitForSelector("[data-session-history-page]", { timeout: 20_000 });
    const button = page.locator("[data-workout-report-download]");
    const before = await page.evaluate(() => ({ href: location.href, scrollY: scrollY }));
    let suggestedFilename = null;
    let busyObserved = false;
    let failureToast = null;
    let actionRestored = true;

    if (scenario.outcome === "scheduled") {
      if ((await button.count()) !== 0) throw new Error("Scheduled fallback exposed the P8A report action.");
    } else if (scenario.outcome === "failure") {
      await button.click();
      const failedTitle = scenario.language === "de"
        ? "PDF konnte nicht erstellt werden"
        : scenario.language === "ar"
          ? "تعذر إعداد ملف PDF"
          : "Could not prepare PDF";
      const alert = page.getByText(failedTitle, { exact: true });
      await alert.waitFor({ timeout: 10_000 });
      failureToast =
        (await alert.textContent())?.replace(/\s+/gu, " ").trim() ?? failedTitle;
      actionRestored = await button.isEnabled();
    } else {
      const downloadPromise = page.waitForEvent("download", { timeout: 15_000 });
      await button.click();
      if (scenario.outcome === "slow") {
        busyObserved = await button.isDisabled();
        if (!busyObserved) throw new Error("Slow report request did not expose a disabled busy state.");
        await button.click({ force: true });
      }
      const download = await downloadPromise;
      suggestedFilename = download.suggestedFilename();
      await download.cancel().catch(() => undefined);
    }

    const after = await page.evaluate(() => ({
      href: location.href,
      scrollY: scrollY,
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      buttonCount: document.querySelectorAll("[data-workout-report-download]").length,
      buttonMinHeight: document.querySelector("[data-workout-report-download]") instanceof HTMLElement
        ? getComputedStyle(document.querySelector("[data-workout-report-download]")).minHeight
        : null,
    }));

    const fileName = `${String(observations.length + 1).padStart(2, "0")}-${scenario.name}.png`;
    const screenshotPath = path.join(outputDir, fileName);
    await page.screenshot({ path: screenshotPath, animations: "disabled", fullPage: false });
    const screenshot = sharp(screenshotPath);
    const [imageMetadata, imageStats] = await Promise.all([
      screenshot.metadata(),
      screenshot.stats(),
    ]);
    const observation = {
      ...scenario,
      httpStatus: response?.status() ?? null,
      screenshot: fileName,
      suggestedFilename,
      busyObserved,
      failureToast,
      actionRestored,
      reportRequests: state.reportRequests,
      before,
      after,
      errors,
      png: {
        width: imageMetadata.width ?? scenario.width,
        height: imageMetadata.height ?? scenario.height,
        entropy: Number(imageStats.entropy.toFixed(4)),
      },
    };
    observations.push(observation);

    const performed = scenario.outcome !== "scheduled";
    const requestValid = state.reportRequests.length === (performed ? 1 : 0);
    const authValid = state.reportRequests.every((item) => item.authorization === `Bearer ${QA_TOKEN}`);
    const filenameValid = !suggestedFilename || /^plaivra-workout-report-\d{4}-\d{2}-\d{2}\.pdf$/u.test(suggestedFilename);
    const actionValid = performed ? after.buttonCount === 1 : after.buttonCount === 0;
    const minHeightValid =
      !performed || Number.parseFloat(after.buttonMinHeight ?? "0") >= 44;
    const languageValid = after.lang === scenario.language;
    const directionValid =
      after.dir === (scenario.language === "ar" ? "rtl" : "ltr");
    const failureValid =
      scenario.outcome !== "failure" ||
      (Boolean(failureToast) && actionRestored);
    const successValid =
      !["success", "slow"].includes(scenario.outcome) ||
      Boolean(suggestedFilename);
    if (
      response?.status() !== 200 ||
      errors.length ||
      after.overflow !== 0 ||
      before.href !== after.href ||
      Math.abs(before.scrollY - after.scrollY) > 2 ||
      !requestValid ||
      !authValid ||
      !filenameValid ||
      !actionValid ||
      !minHeightValid ||
      !languageValid ||
      !directionValid ||
      !failureValid ||
      !successValid
    ) {
      failed = true;
    }
    await context.close();
  }
} finally {
  await browser.close();
}

const report = {
  authority: "P8A single performed-workout PDF rendered QA",
  exactHead: headSha,
  workflowRunId: process.env.QA_WORKFLOW_RUN_ID || null,
  generatedAt: new Date().toISOString(),
  scenarios: observations,
  passed: !failed,
};
await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
if (failed) throw new Error("P8A workout report rendered QA failed. Inspect the evidence report.");
console.log(`P8A workout report rendered QA passed: ${observations.length} scenarios.`);
