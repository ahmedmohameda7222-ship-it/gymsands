import { chromium } from "@playwright/test";

import {
  baseUrl,
  dayRoute,
  directRoute,
  errorMessage,
  observations,
  reportPayload,
  requestRecord,
  writeReport
} from "./aw5-correction-qa-shared.mjs";
import { installAw5CorrectionFixture } from "./train-layout-qa-fixture.mjs";
import { captureFailure, record } from "./aw5-correction-qa-diagnostics.mjs";

let browser;

async function openSession({ name, route = dayRoute, viewport, language = "en", theme = "light", delayCanonical = false }) {
  const direct = route === directRoute;
  const context = await browser.newContext({ viewport, reducedMotion: "reduce", colorScheme: theme });
  const session = {
    name, direct, context, page: null, response: null, fixture: null,
    pageErrors: [], consoleErrors: [], consoleWarnings: [], requestFailures: [], requestHistory: []
  };
  try {
    const page = await context.newPage();
    session.page = page;
    session.fixture = await installAw5CorrectionFixture(
      context,
      { direct, language, theme, delayCanonical },
      session.requestHistory
    );
    page.on("pageerror", (error) => session.pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") session.consoleErrors.push(message.text());
      if (message.type() === "warning") session.consoleWarnings.push(message.text());
    });
    page.on("requestfailed", (request) => {
      session.requestFailures.push({
        ...requestRecord(request, "failed"),
        failure: request.failure()?.errorText ?? "unknown request failure"
      });
    });
    page.on("request", (request) => {
      if (/supabase\.co|\/api\//.test(request.url())) session.requestHistory.push(requestRecord(request));
    });
    page.on("response", (response) => {
      const request = response.request();
      if (/supabase\.co|\/api\//.test(request.url())) {
        session.requestHistory.push({
          ...requestRecord(request, `response:${response.status()}`),
          status: response.status()
        });
      }
    });
    session.response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForSelector("[data-aw5-execution-shell]", { state: "visible", timeout: 20_000 });
    await page.waitForFunction(
      (expected) => document.documentElement.lang === expected,
      language,
      { timeout: 10_000 }
    );
    await page.waitForTimeout(150);
    return session;
  } catch (error) {
    if (session.page) {
      await captureFailure(session, error, { bootstrapFailed: true });
      error.aw5Recorded = true;
    }
    error.aw5Session = session;
    throw error;
  }
}

function visiblePrimary(page) {
  return page.locator("[data-aw5-primary-action]:visible").first();
}

async function enterSet(page, reps = "8", weight = "80") {
  await page.locator("#active-set-reps").fill(reps, { timeout: 10_000 });
  await page.locator("#active-set-weight").fill(weight, { timeout: 10_000 });
}

async function runScenario(config, exercise, recordOptions = {}) {
  const startedAt = Date.now();
  console.log(`[AW5-QA] START ${config.name}`);
  let session;
  try {
    session = await openSession(config);
    const outcome = await exercise(session);
    const failures = await record(session, outcome?.recordOptions ?? recordOptions, outcome?.failures ?? []);
    if (failures.length) console.error(`[AW5-QA] FAIL ${config.name} rendered assertion failure ${failures.join(" | ")}`);
    else console.log(`[AW5-QA] PASS ${config.name} ${Date.now() - startedAt}`);
  } catch (error) {
    session = session ?? error.aw5Session;
    let classification = "unhandled application error";
    let reason = errorMessage(error);
    if (!error.aw5Recorded && session?.page) {
      const captured = await captureFailure(session, error);
      classification = captured.classification;
      reason = captured.failure;
    } else if (error.aw5Recorded) {
      classification = observations.at(-1)?.classification ?? classification;
    }
    console.error(`[AW5-QA] FAIL ${config.name} ${classification} ${reason}`);
  } finally {
    if (session?.fixture && !session.fixture.canonicalSettled()) {
      session.fixture.releaseCanonical();
      await session.fixture.waitForCanonical();
    }
    await session?.context?.close().catch(() => undefined);
    await writeReport();
  }
}

try {
  browser = await chromium.launch({ headless: true });

  for (const scenario of [
    { name: "plan-day-set-entry-en-320x568", viewport: { width: 320, height: 568 }, options: { initial320: true } },
    { name: "plan-day-set-entry-en-390x844", viewport: { width: 390, height: 844 } },
    { name: "direct-set-entry-en-390x844", route: directRoute, viewport: { width: 390, height: 844 } },
    { name: "direct-set-entry-en-1440x900", route: directRoute, viewport: { width: 1440, height: 900 } },
    { name: "plan-day-set-entry-de-390x844", viewport: { width: 390, height: 844 }, language: "de" },
    { name: "plan-day-set-entry-ar-390x844", viewport: { width: 390, height: 844 }, language: "ar" },
    { name: "plan-day-set-entry-dark-en-1440x900", viewport: { width: 1440, height: 900 }, theme: "dark" }
  ]) {
    await runScenario(scenario, async (session) => {
      const failures = [];
      if (session.direct) {
        const label = (await session.page.locator("[data-aw5-session-title]").innerText({ timeout: 10_000 })).trim();
        if (label !== "Workout session") failures.push(`direct session label is ${JSON.stringify(label)}`);
      }
      return { failures, recordOptions: scenario.options };
    });
  }

  await runScenario(
    { name: "plan-day-validation-error-en-390x844", viewport: { width: 390, height: 844 } },
    async (session) => {
      await session.page.locator("#active-set-reps").fill("", { timeout: 10_000 });
      await session.page.locator("#active-set-weight").fill("40", { timeout: 10_000 });
      const before = await session.page.locator("[data-active-set-state]").getAttribute("data-active-set-number");
      await visiblePrimary(session.page).click({ timeout: 10_000 });
      await session.page.waitForFunction(
        () => (document.querySelector("[data-aw5-feedback]")?.textContent?.trim().length ?? 0) > 0,
        null,
        { timeout: 10_000 }
      );
      const after = await session.page.locator("[data-active-set-state]").getAttribute("data-active-set-number");
      return { failures: before === after ? [] : ["validation error advanced the canonical cursor"] };
    }
  );

  await runScenario(
    { name: "plan-day-busy-en-390x844", viewport: { width: 390, height: 844 }, delayCanonical: true },
    async (session) => {
      await enterSet(session.page);
      await visiblePrimary(session.page).click({ timeout: 10_000 });
      await session.page.waitForFunction(
        () => document.querySelector("[data-aw5-sticky-actions]")?.getAttribute("aria-busy") === "true",
        null,
        { timeout: 10_000 }
      );
      const busy = await session.page.evaluate(() => ({
        repsDisabled: document.querySelector("#active-set-reps")?.disabled,
        weightDisabled: document.querySelector("#active-set-weight")?.disabled,
        text: document.querySelector("[data-aw5-execution-shell]")?.textContent ?? ""
      }));
      const failures = [];
      if (!busy.repsDisabled || !busy.weightDisabled) failures.push("busy completion did not disable the primary editor");
      if (/Saving\.\.\.|Saved/i.test(busy.text)) failures.push("busy completion exposed rejected save-state chrome");
      return { failures };
    }
  );

  await runScenario(
    { name: "plan-day-rest-en-390x844", viewport: { width: 390, height: 844 } },
    async (session) => {
      await enterSet(session.page);
      await visiblePrimary(session.page).click({ timeout: 10_000 });
      await session.page.waitForSelector('[data-aw5-session-state="rest"]', { state: "visible", timeout: 15_000 });
      const failures = [];
      const restText = (await visiblePrimary(session.page).innerText({ timeout: 10_000 })).trim();
      if (!/skip/i.test(restText)) failures.push(`rest CTA is ${JSON.stringify(restText)}`);
      const presets = session.page.locator("[data-aw5-rest-presets] button");
      if (await presets.count() < 1) failures.push("rest presets are missing");
      const addThirty = session.page.getByRole("button", { name: /30/ }).last();
      if (await addThirty.count()) {
        await addThirty.click({ timeout: 10_000 });
        const state = await session.page.locator("[data-aw5-execution-shell]").getAttribute("data-aw5-session-state");
        if (state !== "rest") failures.push("Add 30 left the authoritative rest state");
      } else failures.push("Add 30 control is missing");
      await session.page.locator("[data-aw5-rest-presets]").evaluate((element) => element.scrollIntoView({ block: "center" }));
      return { failures, recordOptions: { restPresets: true } };
    }
  );

  await runScenario(
    { name: "plan-day-paused-en-390x844", viewport: { width: 390, height: 844 } },
    async (session) => {
      await session.page.locator("[data-aw5-pause-resume]").click({ timeout: 10_000 });
      await session.page.waitForSelector('[data-aw5-session-state="paused"]', { state: "visible", timeout: 10_000 });
      const label = (await visiblePrimary(session.page).innerText({ timeout: 10_000 })).trim();
      return { failures: /resume/i.test(label) ? [] : [`paused primary action is ${JSON.stringify(label)}`] };
    }
  );

  for (const scenario of [
    { name: "plan-day-details-ar-390x844", viewport: { width: 390, height: 844 }, language: "ar" },
    { name: "plan-day-details-dark-en-1440x900", viewport: { width: 1440, height: 900 }, theme: "dark" }
  ]) {
    await runScenario(scenario, async (session) => {
      await session.page.locator("[data-active-set-details-trigger]").click({ timeout: 10_000 });
      await session.page.waitForSelector("[data-active-set-details-dialog]", { state: "visible", timeout: 10_000 });
    });
  }

  await runScenario(
    { name: "plan-day-session-review-en-1440x900", viewport: { width: 1440, height: 900 } },
    async (session) => {
      await session.page.getByRole("button", { name: /^Finish$/i }).click({ timeout: 10_000 });
      await session.page.waitForSelector("[data-aw5-session-review]", { state: "visible", timeout: 10_000 });
    }
  );

  await runScenario(
    { name: "plan-day-completed-summary-en-1440x900", viewport: { width: 1440, height: 900 } },
    async (session) => {
      await enterSet(session.page, "8", "80");
      await visiblePrimary(session.page).click({ timeout: 10_000 });
      await session.page.waitForSelector('[data-aw5-session-state="rest"]', { state: "visible", timeout: 15_000 });
      await visiblePrimary(session.page).click({ timeout: 10_000 });
      await session.page.waitForSelector('[data-active-set-number="2"]', { state: "visible", timeout: 15_000 });
      await enterSet(session.page, "9", "82.5");
      await visiblePrimary(session.page).click({ timeout: 10_000 });
      await session.page.waitForSelector('[data-aw5-session-state="completed"]', { state: "visible", timeout: 15_000 });
      await visiblePrimary(session.page).click({ timeout: 10_000 });
      const review = session.page.locator("[data-aw5-session-review]");
      await review.waitFor({ state: "visible", timeout: 10_000 });
      await review.getByRole("button", { name: /save.*finish/i }).click({ timeout: 10_000 });
      await session.page.waitForSelector("[data-aw5-completed-summary]", { state: "visible", timeout: 15_000 });
    }
  );

  for (const keyboard of ["reps", "weight"]) {
    await runScenario(
      { name: `plan-day-keyboard-${keyboard}-en-390x844`, viewport: { width: 390, height: 844 } },
      async (session) => {
        await session.page.setViewportSize({ width: 390, height: 464 });
        const input = session.page.locator(`#active-set-${keyboard}`);
        await input.focus({ timeout: 10_000 });
        await input.evaluate((element) => element.scrollIntoView({ block: "center" }));
        await session.page.waitForTimeout(100);
        return { recordOptions: { keyboard } };
      }
    );
  }
} finally {
  await browser?.close().catch(() => undefined);
  await writeReport();
}

const failures = reportPayload().failures;
if (failures.length) {
  console.error(`AW-5 correction layout QA failed:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(`AW-5 correction layout QA passed with ${observations.length} clean rendered observations.`);
}
