import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import {
  installWorkoutHistoryQaFixture,
  WORKOUT_HISTORY_QA_SCENARIOS,
  WORKOUT_HISTORY_QA_VIEWPORTS,
} from "./workout-history-qa-fixture.mjs";

const baseUrl = process.env.QA_BASE_URL || "http://localhost:3000";
const outputDir = path.resolve(
  process.env.QA_WORKOUT_HISTORY_EVIDENCE_DIR ||
    path.join(process.cwd(), "quality-reports", "workout-history-qa-evidence"),
);
const serverMode = process.env.QA_SERVER_MODE || "production";
const buildCommand =
  process.env.QA_BUILD_COMMAND ||
  "NEXT_PUBLIC_USE_MOCK_AUTH=true NEXT_PUBLIC_PLAIVRA_PRODUCTION_QA=true npm run build";
const startCommand = process.env.QA_START_COMMAND || "npm run start";
const mockAuthBuildValue = process.env.QA_MOCK_AUTH_BUILD_VALUE || "true";
const headSha = process.env.QA_HEAD_SHA || process.env.GITHUB_SHA || "";
const workflowRunId =
  process.env.QA_WORKFLOW_RUN_ID || process.env.GITHUB_RUN_ID || null;
const developmentVerification = buildCommand.startsWith("development ");

if (!/^[a-f0-9]{40}$/iu.test(headSha)) {
  throw new Error(
    "QA_HEAD_SHA must be the exact 40-character head under inspection.",
  );
}
if (serverMode !== "production") {
  throw new Error(
    `Workout History rendered QA requires production server mode, received ${serverMode}.`,
  );
}
if (mockAuthBuildValue !== "true") {
  throw new Error(
    "Workout History rendered QA requires the explicit mock-auth QA build.",
  );
}

function safeText(value, limit = 1_000) {
  return String(value ?? "")
    .replace(/\bBearer\s+\S+/giu, "Bearer [REDACTED]")
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/gu, "[REDACTED]")
    .slice(0, limit);
}

function expectedConsoleError(scenario, message) {
  return scenario.action === "correction-conflict"
    && /Failed to load resource: the server responded with a status of 409 \(Conflict\)/iu.test(message);
}

async function openCorrection(page) {
  await page
    .getByRole("button", {
      name: /more actions|weitere aktionen|إجراءات إضافية/iu,
    })
    .click();
  await page
    .getByRole("menuitem", {
      name: /correct session|training korrigieren|تصحيح الجلسة/iu,
    })
    .click();
  await page.waitForSelector("[data-workout-history-correction-dialog]");
}

async function saveCorrection(page) {
  await page
    .getByRole("button", {
      name: /save correction|korrektur speichern|حفظ التصحيح/iu,
    })
    .click();
}

async function prepareScenario(page, scenario, observation) {
  if (scenario.action === "initial") {
    await page.waitForSelector("[data-workout-history-page]", {
      timeout: 15_000,
    });
    return;
  }
  const rootSelector =
    scenario.action === "recently-deleted" ||
    scenario.action === "restore" ||
    scenario.action === "purge"
      ? "main"
      : scenario.route.includes("/workout-history/")
        ? "[data-session-history-page]"
        : "[data-workout-history-page]";
  await page.waitForSelector(rootSelector, { timeout: 20_000 });
  await page.waitForTimeout(150);

  if (scenario.name === "v1-muscle-snapshot") {
    await page.waitForSelector(
      '[data-history-muscle-analysis-kind="v1-broad"]',
      { timeout: 10_000 },
    );
  } else if (scenario.name === "v2-muscle-snapshot") {
    await page.waitForSelector(
      '[data-history-muscle-analysis-kind="v2-advanced"]',
      { timeout: 10_000 },
    );
  }

  if (scenario.action === "load-more") {
    await page
      .getByRole("button", { name: /load more|mehr laden|تحميل المزيد/iu })
      .click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll("[data-workout-history-row]").length > 20,
    );
  } else if (scenario.action === "filters") {
    await page
      .getByRole("button", { name: /filters|filter/iu })
      .first()
      .click();
  } else if (scenario.action === "correction") {
    await openCorrection(page);
  } else if (scenario.action === "correction-edit") {
    await openCorrection(page);
    await page.getByLabel(/repetitions|wiederholungen|التكرارات/iu).first().fill("11");
    await page.getByLabel(/load \(kg\)|gewicht \(kg\)|الوزن \(كجم\)/iu).first().fill("72.5");
    await page.getByLabel(/^RPE$/iu).first().fill("8.5");
    await page.getByLabel(/^RIR$/iu).first().fill("1.5");
    await page.getByLabel(/set note|satznotiz|ملاحظة المجموعة/iu).first().fill("Controlled corrected set");
    await saveCorrection(page);
    await page.locator("[data-workout-history-correction-dialog]").waitFor({ state: "hidden" });
  } else if (scenario.action === "correction-add") {
    await openCorrection(page);
    const addButton = page
      .getByRole("button", { name: /add set|satz hinzufügen|إضافة مجموعة/iu })
      .first();
    const exerciseCard = addButton.locator("xpath=ancestor::div[.//fieldset][1]");
    await addButton.click();
    const addedSet = exerciseCard.locator("fieldset").last();
    await addedSet.getByLabel(/repetitions|wiederholungen|التكرارات/iu).fill("12");
    await addedSet.getByLabel(/load \(kg\)|gewicht \(kg\)|الوزن \(كجم\)/iu).fill("55");
    await addedSet.getByLabel(/^RPE$/iu).fill("8");
    await addedSet.getByLabel(/^RIR$/iu).fill("2");
    await saveCorrection(page);
    await page.locator("[data-workout-history-correction-dialog]").waitFor({ state: "hidden" });
  } else if (scenario.action === "correction-remove") {
    await openCorrection(page);
    await page
      .getByRole("button", { name: /remove set|satz entfernen|حذف المجموعة/iu })
      .first()
      .click();
    await saveCorrection(page);
    await page.locator("[data-workout-history-correction-dialog]").waitFor({ state: "hidden" });
  } else if (scenario.action === "correction-conflict") {
    await openCorrection(page);
    await page
      .getByLabel(/session note|trainingsnotiz|ملاحظة الجلسة/iu)
      .fill("Concurrent correction attempt");
    await saveCorrection(page);
    await page
      .getByRole("button", {
        name: /reload latest workout|aktuellen stand laden|تحميل أحدث نسخة/iu,
      })
      .waitFor();
  } else if (scenario.action === "delete-confirmation") {
    await page
      .getByRole("button", {
        name: /more actions|weitere aktionen|إجراءات إضافية/iu,
      })
      .click();
    await page
      .getByRole("menuitem", {
        name: /delete workout|training löschen|حذف التمرين/iu,
      })
      .click();
    await page
      .getByRole("dialog", {
        name: /delete workout|training löschen|حذف التمرين/iu,
      })
      .waitFor();
  } else if (scenario.action === "recently-deleted") {
    const item = page.getByText("Strength B", { exact: true });
    await item.waitFor();
    await item.scrollIntoViewIfNeeded();
  } else if (scenario.action === "restore") {
    const item = page.getByText("Strength B", { exact: true });
    await item.waitFor();
    await item.scrollIntoViewIfNeeded();
    await page
      .getByRole("button", { name: /restore|wiederherstellen|استعادة/iu })
      .click();
    await page
      .getByText(
        /no recently deleted workouts|keine kürzlich gelöschten trainings|لا توجد تمارين محذوفة/iu,
      )
      .waitFor();
  } else if (scenario.action === "purge") {
    const item = page.getByText("Strength B", { exact: true });
    await item.waitFor();
    await item.scrollIntoViewIfNeeded();
    await page
      .getByRole("button", { name: "Delete permanently", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Delete permanently" })
      .getByRole("button", { name: "Delete permanently", exact: true })
      .click();
    await page
      .getByText("No recently deleted workouts.", { exact: true })
      .waitFor();
  } else if (scenario.action === "repeat") {
    await page
      .getByRole("button", { name: /repeat workout|wiederholen|تكرار/iu })
      .click();
    await page.waitForSelector('[role="dialog"]');
    await page.waitForTimeout(100);
  } else if (scenario.action === "stale-detail") {
    await page.waitForSelector("[data-stale-history-action-notice]");
    observation.repeatActionAvailable = await page.getByRole("button", { name: /repeat workout|wiederholen|ØªÙƒØ±Ø§Ø±/iu }).count() > 0;
    await page.getByRole("button", { name: /more actions|weitere aktionen|Ø¥Ø¬Ø±Ø§Ø¡Ø§Øª Ø¥Ø¶Ø§ÙÙŠØ©/iu }).click();
    observation.correctActionAvailable = await page.getByRole("menuitem", { name: /correct session|training korrigieren|ØªØµØ­ÙŠØ­ Ø§Ù„Ø¬Ù„Ø³Ø©/iu }).count() > 0;
    observation.deleteActionAvailable = await page.getByRole("menuitem", { name: /delete workout|training lÃ¶schen|Ø­Ø°Ù Ø§Ù„ØªÙ…Ø±ÙŠÙ†/iu }).count() > 0;
    await page.keyboard.press("Escape");
  } else if (scenario.action === "semantic-detail") {
    observation.repeatActionAvailable = await page.getByRole("button", { name: /repeat workout|wiederholen|ØªÙƒØ±Ø§Ø±/iu }).count() > 0;
    const moreActions = page.getByRole("button", { name: /more actions|weitere aktionen|Ø¥Ø¬Ø±Ø§Ø¡Ø§Øª Ø¥Ø¶Ø§ÙÙŠØ©/iu });
    if (await moreActions.count() > 0) {
      await moreActions.click();
      observation.correctActionAvailable = await page.getByRole("menuitem", { name: /correct session|training korrigieren|ØªØµØ­ÙŠØ­ Ø§Ù„Ø¬Ù„Ø³Ø©/iu }).count() > 0;
      await page.keyboard.press("Escape");
    } else {
      observation.correctActionAvailable = false;
    }
  } else if (scenario.action === "zoom-list") {
    await page.waitForSelector("[data-workout-history-row]");
    observation.zoomControlsReachable = await page.locator("button:visible, input:visible, a:visible").count() > 2;
  } else if (scenario.action === "zoom-detail") {
    await page.waitForSelector("[data-set-history-row]");
    observation.zoomControlsReachable = await page.locator("button:visible, input:visible, a:visible").count() > 2;
  } else if (scenario.action === "keyboard") {
    for (let count = 0; count < 5; count += 1) await page.keyboard.press("Tab");
  }
}

function correctionRequest(fixtureRequests) {
  return fixtureRequests.find((candidate) =>
    candidate.method === "POST" && candidate.path.endsWith("/correct")) ?? null;
}

function metricValue(operation, metricKey) {
  return operation?.values?.performanceMetrics?.find((metric) =>
    metric?.metricKey === metricKey)?.value ?? null;
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const observations = [];
let failed = false;

try {
  for (const scenario of WORKOUT_HISTORY_QA_SCENARIOS) {
    const context = await browser.newContext({
      viewport: {
        width: scenario.viewport.width,
        height: scenario.viewport.height,
      },
      colorScheme: scenario.theme,
      reducedMotion: "reduce",
      locale:
        scenario.language === "de"
          ? "de-DE"
          : scenario.language === "ar"
            ? "ar"
            : "en-US",
    });
    const fixtureState = await installWorkoutHistoryQaFixture(
      context,
      scenario,
      baseUrl,
    );
    const page = await context.newPage();
    const observation = {
      scenario: scenario.name,
      viewport: scenario.viewport.name,
      language: scenario.language,
      theme: scenario.theme,
      route: scenario.route,
      action: scenario.action,
      pageErrors: [],
      consoleErrors: [],
      expectedConflictResponses: 0,
      nativeDialog: null,
    };
    page.on("pageerror", (error) =>
      observation.pageErrors.push(safeText(error.message)),
    );
    page.on("console", (message) => {
      const text = message.text();
      if (
        message.type() === "error" &&
        !(
          developmentVerification &&
          /React requires eval\(\) in development mode/iu.test(text)
        ) &&
        !expectedConsoleError(scenario, text)
      ) {
        observation.consoleErrors.push(safeText(text));
      }
    });
    page.on("response", (networkResponse) => {
      if (
        scenario.action === "correction-conflict"
        && networkResponse.status() === 409
        && networkResponse.url().endsWith("/correct")
      ) {
        observation.expectedConflictResponses += 1;
      }
    });
    const response = await page.goto(`${baseUrl}${scenario.route}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    if (scenario.zoom !== 1) {
      await page.evaluate((zoom) => {
        document.documentElement.style.zoom = String(zoom);
      }, scenario.zoom);
    }
    await prepareScenario(page, scenario, observation);
    const fileName = `${String(observations.length + 1).padStart(2, "0")}-${scenario.name}-${scenario.viewport.name}-${scenario.language}-${scenario.theme}.png`;
    const screenshotPath = path.join(outputDir, fileName);
    await page.screenshot({
      path: screenshotPath,
      animations: "disabled",
      fullPage: false,
    });
    const image = await sharp(screenshotPath).stats();
    const dom = await page.evaluate(() => {
      const active = document.activeElement;
      const activeStyle =
        active instanceof HTMLElement ? getComputedStyle(active) : null;
      const muscleSummary = document.querySelector(
        "[data-session-history-muscle-summary]",
      );
      return {
        lang: document.documentElement.lang,
        dir: document.documentElement.dir,
        dark: document.documentElement.classList.contains("dark"),
        reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
        horizontalOverflowPx: Math.max(
          0,
          document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        ),
        cards: document.querySelectorAll("[data-workout-history-row]").length,
        detail: Boolean(document.querySelector("[data-session-history-page]")),
        zoom: document.documentElement.style.zoom || "1",
        staleActionNotice: Boolean(document.querySelector("[data-stale-history-action-notice]")),
        setRows: document.querySelectorAll("[data-set-history-row]").length,
        rawMetricKeysVisible: /future_unknown_metric|distance_meters|duration_seconds/u.test(document.querySelector("main")?.textContent ?? ""),
        snapshotVersion:
          document
            .querySelector("[data-session-history-page]")
            ?.getAttribute("data-snapshot-version") || null,
        muscleSummary: Boolean(muscleSummary),
        muscleAnalysisKind:
          muscleSummary?.getAttribute("data-history-muscle-analysis-kind") || null,
        muscleSvgCount: muscleSummary?.querySelectorAll("svg").length ?? 0,
        focused:
          active && active !== document.body
            ? {
                tag: active.tagName.toLowerCase(),
                visibleOutline:
                  activeStyle?.outlineStyle !== "none" ||
                  activeStyle?.boxShadow !== "none",
              }
            : null,
        hasDialog: Boolean(document.querySelector('[role="dialog"]')),
        alertText:
          document.querySelector('[role="alert"]')?.textContent
            ?.replace(/\s+/gu, " ")
            .trim()
            .slice(0, 500) || "",
        text:
          document
            .querySelector("main")
            ?.textContent?.replace(/\s+/gu, " ")
            .trim()
            .slice(0, 500) || "",
      };
    });
    const request = correctionRequest(fixtureState.requests);
    const requestBody = request?.body ?? null;
    const setOperations = requestBody?.setOperations ?? null;
    Object.assign(observation, {
      httpStatus: response?.status() ?? null,
      screenshot: fileName,
      pngInspection: {
        width: image.channels[0]?.width ?? scenario.viewport.width,
        height: image.channels[0]?.height ?? scenario.viewport.height,
        entropy: Number(image.entropy.toFixed(4)),
        opaque: image.isOpaque,
      },
      dom,
      correctionRequestBody: requestBody,
      correctionSetOperations: setOperations,
      fixtureRequests: fixtureState.requests,
    });
    const exactOperation = (kind) =>
      Array.isArray(setOperations)
      && setOperations.length === 1
      && setOperations[0]?.kind === kind
      ? setOperations[0]
      : null;
    const editOperation = exactOperation("update");
    const addOperation = exactOperation("add");
    const removeOperation = exactOperation("remove");
    const editPayloadValid =
      editOperation?.patch?.reps === 11
      && editOperation?.patch?.weightKg === 72.5
      && editOperation?.patch?.setDetails?.rpe === 8.5
      && editOperation?.patch?.setDetails?.rir === 1.5
      && editOperation?.patch?.setDetails?.notes === "Controlled corrected set";
    const addPayloadValid =
      addOperation?.values?.reps === 12
      && addOperation?.values?.weightKg === 55
      && addOperation?.values?.setDetails?.rpe === 8
      && addOperation?.values?.setDetails?.rir === 2
      && metricValue(addOperation, "repetitions") === 12
      && metricValue(addOperation, "external_load_kg") === 55;
    const removePayloadValid = Boolean(removeOperation?.exerciseLogId);
    const conflictPayloadValid =
      requestBody?.expectedHistoryRevision === 0
      && /^history-correct:[0-9a-f-]{36}$/iu.test(String(requestBody?.idempotencyKey ?? ""))
      && requestBody?.sessionPatch?.notes === "Concurrent correction attempt"
      && requestBody?.sessionPatch?.durationMinutes === 52
      && Array.isArray(setOperations)
      && setOperations.length === 0;
    const scenarioFailed =
      observation.httpStatus !== 200 ||
      observation.pageErrors.length > 0 ||
      observation.consoleErrors.length > 0 ||
      dom.horizontalOverflowPx > 1 ||
      image.entropy < 0.5 ||
      (scenario.language === "ar" && dom.dir !== "rtl") ||
      (scenario.theme === "dark" && !dom.dark) ||
      (scenario.action === "keyboard" && !dom.focused) ||
      (scenario.action === "reduced-motion" && !dom.reducedMotion) ||
      (scenario.name === "v1-muscle-snapshot" &&
        (
          dom.snapshotVersion !== "workout_session_muscle_snapshot_v1" ||
          dom.muscleAnalysisKind !== "v1-broad" ||
          !dom.muscleSummary ||
          dom.muscleSvgCount < 2
        )) ||
      (scenario.name === "v2-muscle-snapshot" &&
        (
          dom.snapshotVersion !== "workout_session_muscle_snapshot_v2" ||
          dom.muscleAnalysisKind !== "v2-advanced" ||
          !dom.muscleSummary ||
          dom.muscleSvgCount < 2
        )) ||
      (scenario.action === "stale-detail" &&
        (!dom.staleActionNotice || observation.repeatActionAvailable || observation.correctActionAvailable || observation.deleteActionAvailable)) ||
      (scenario.action === "semantic-list" &&
        (dom.cards !== 1 || dom.rawMetricKeysVisible)) ||
      (scenario.action === "semantic-detail" &&
        (dom.setRows !== 0 || dom.muscleSummary || dom.rawMetricKeysVisible || observation.repeatActionAvailable || observation.correctActionAvailable)) ||
      ((scenario.action === "zoom-list" || scenario.action === "zoom-detail") &&
        (dom.zoom !== "2" || !observation.zoomControlsReachable)) ||
      (scenario.action === "correction-edit" && !editPayloadValid) ||
      (scenario.action === "correction-add" && !addPayloadValid) ||
      (scenario.action === "correction-remove" && !removePayloadValid) ||
      (scenario.action === "correction-conflict" &&
        (
          !conflictPayloadValid
          || !dom.hasDialog
          || !dom.alertText
          || observation.expectedConflictResponses !== 1
        ));
    observation.passed = !scenarioFailed;
    failed ||= scenarioFailed;
    observations.push(observation);
    await context.close();
  }
} finally {
  await browser.close();
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  headSha,
  workflowRunId,
  server: {
    mode: serverMode,
    baseUrl,
    buildCommand,
    startCommand,
    mockAuthBuildValue,
  },
  requiredViewports: WORKOUT_HISTORY_QA_VIEWPORTS.map(
    (viewport) => viewport.name,
  ),
  requiredLanguages: ["en", "de", "ar"],
  requiredThemes: ["light", "dark"],
  scenarioCount: WORKOUT_HISTORY_QA_SCENARIOS.length,
  passed: !failed,
  observations,
};
await writeFile(
  path.join(outputDir, "workout-history-qa-results.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
process.stdout.write(
  `Workout History rendered QA: ${report.passed ? "PASS" : "FAIL"} (${report.scenarioCount} scenarios)\nEvidence: ${outputDir}\n`,
);
if (failed) process.exitCode = 1;
