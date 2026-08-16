from pathlib import Path

path = Path('scripts/run-active-workout-full-authority-qa.mjs')
text = path.read_text()


def replace_once(old: str, new: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'expected one QA replacement, found {count}: {old[:160]!r}')
    text = text.replace(old, new, 1)


replace_once(
    '  const observation = { name: scenario.name, failures: [], screenshot: null };',
    '  const observation = { name: scenario.name, failures: [], screenshot: null, previousPerformanceRequests: [] };'
)
replace_once(
    '  const requestHistory = [];\n  let fixture;',
    '  const requestHistory = [];\n  const previousPerformanceRequests = observation.previousPerformanceRequests;\n  let fixture;'
)
replace_once(
'''    await context.route(/\\/api\\/personal-records\\/exercise(?:\\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "cache-control": "private, no-store" },
        body: JSON.stringify({ performed: false, lastPerformedAt: null, highestLoad: null, estimatedOneRepMax: null, recentWorkoutId: null })
      });
    });
    if (scenario.multiExercise) await installMultiExerciseOverrides(context);''',
'''    await context.route(/\\/api\\/personal-records\\/exercise(?:\\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "cache-control": "private, no-store" },
        body: JSON.stringify({ performed: false, lastPerformedAt: null, highestLoad: null, estimatedOneRepMax: null, recentWorkoutId: null })
      });
    });
    if (scenario.previousPerformance) {
      await context.route(/\\/api\\/workouts\\/active\\/previous-performance(?:\\?.*)?$/, async (route) => {
        const url = new URL(route.request().url());
        const request = {
          kind: url.searchParams.get("kind"),
          identity: url.searchParams.get("identity"),
          session: url.searchParams.get("session"),
          setNumber: Number(url.searchParams.get("set") || 0),
        };
        previousPerformanceRequests.push(request);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "cache-control": "private, no-store" },
          body: JSON.stringify({
            data: {
              weightKg: request.setNumber === 2 ? 31 : 30,
              reps: request.setNumber === 2 ? 9 : 8,
              performedAt: "2026-08-10T08:00:00.000Z"
            }
          })
        });
      });
    }
    if (scenario.multiExercise) await installMultiExerciseOverrides(context);''')
replace_once(
    '    await scenario.run({ page, context, fixture, replacementAuthority });',
    '    await scenario.run({ page, context, fixture, replacementAuthority, previousPerformanceRequests });'
)

helpers = r'''const localizedCorrectionCopy = {
  en: { sets: "Sets", rest: "Rest" },
  de: { sets: "Sätze", rest: "Pause" },
  ar: { sets: "المجموعات", rest: "راحة" },
};

async function waitForPreviousPerformanceRequestCount(requests, expected) {
  const deadline = Date.now() + 10_000;
  while (requests.length < expected && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  check(requests.length === expected, `Previous Performance request count ${requests.length}, expected ${expected}.`);
}

async function waitForPreviousPerformanceValue(page) {
  const surface = visible(page, "[data-aw10-previous-performance]");
  await surface.waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForFunction(() => {
    const surface = document.querySelector("[data-aw10-previous-performance]");
    if (!surface) return false;
    return !surface.querySelector(".animate-pulse") && /\d/.test(surface.textContent || "");
  }, undefined, { timeout: 10_000 });
  return surface;
}

async function assertCorrectionMobileHierarchy(page, width, language) {
  await waitForPreviousPerformanceValue(page);
  const metrics = await page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) return null;
      const value = element.getBoundingClientRect();
      return { top: value.top, bottom: value.bottom, left: value.left, right: value.right, width: value.width, height: value.height };
    };
    const labelMetrics = (id) => {
      const label = document.querySelector(`label[for="${id}"]`);
      if (!(label instanceof HTMLElement)) return null;
      return { text: (label.textContent || "").trim(), clientWidth: label.clientWidth, scrollWidth: label.scrollWidth };
    };
    const title = document.querySelector("[data-aw10-exercise-details-trigger]");
    const setPosition = title?.closest("div")?.querySelector("h2 + p");
    return {
      viewportHeight: innerHeight,
      session: rect("[data-aw5-session-title]"),
      exercisePosition: rect("[data-aw-exercise-navigator-trigger]"),
      title: rect("[data-aw10-exercise-details-trigger]"),
      setPosition: setPosition instanceof HTMLElement ? (() => { const value = setPosition.getBoundingClientRect(); return { top: value.top, bottom: value.bottom }; })() : null,
      target: rect("[data-aw10-current-target]"),
      previous: rect("[data-aw10-previous-performance]"),
      reps: rect("#active-set-reps"),
      weight: rect("#active-set-weight"),
      setsLabel: rect("[data-aw10-sets-label]"),
      setPath: rect("[data-aw10-set-path]"),
      cta: rect("[data-aw5-primary-action]"),
      repsLabel: labelMetrics("active-set-reps"),
      weightLabel: labelMetrics("active-set-weight"),
      direction: document.documentElement.dir || getComputedStyle(document.documentElement).direction,
      previousText: (document.querySelector("[data-aw10-previous-performance]")?.textContent || "").trim(),
    };
  });
  for (const [name, value] of Object.entries({
    session: metrics.session,
    exercisePosition: metrics.exercisePosition,
    title: metrics.title,
    setPosition: metrics.setPosition,
    target: metrics.target,
    previous: metrics.previous,
    reps: metrics.reps,
    weight: metrics.weight,
    setsLabel: metrics.setsLabel,
    setPath: metrics.setPath,
    cta: metrics.cta,
  })) check(Boolean(value), `${width}px hierarchy is missing ${name}.`);
  check(Math.abs(metrics.reps.top - metrics.weight.top) <= 3, `${width}px Reps and Weight are not on the same row.`);
  check(metrics.reps.width >= 110 && metrics.weight.width >= 110, `${width}px execution inputs are too narrow.`);
  const fieldGap = Math.max(metrics.weight.left - metrics.reps.right, metrics.reps.left - metrics.weight.right);
  check(fieldGap >= 8, `${width}px execution input gutter is only ${fieldGap}px.`);
  check(metrics.reps.bottom <= metrics.viewportHeight && metrics.weight.bottom <= metrics.viewportHeight, `${width}px execution inputs are outside the initial usable viewport.`);
  check(metrics.setsLabel.top < metrics.viewportHeight, `${width}px Sets progression label is not quickly perceivable.`);
  check(metrics.cta.top < metrics.viewportHeight && metrics.cta.bottom <= metrics.viewportHeight + 1, `${width}px Complete Set CTA is not visible in the execution viewport.`);
  check(metrics.repsLabel.text.length > 0 && metrics.weightLabel.text.length > 0, `${width}px execution labels are empty.`);
  check(metrics.repsLabel.scrollWidth <= metrics.repsLabel.clientWidth + 1, `${width}px Reps label is clipped.`);
  check(metrics.weightLabel.scrollWidth <= metrics.weightLabel.clientWidth + 1, `${width}px Weight label is clipped.`);
  check(metrics.previousText.length > 0, `${width}px Previous Performance is not readable.`);
  if (language === "ar") check(metrics.direction === "rtl", `${width}px Arabic execution direction is not RTL.`);
  const weight = page.locator("#active-set-weight");
  check(await weight.inputValue() === "", `${width}px Weight did not start visually blank.`);
  check(await weight.getAttribute("placeholder") !== "0", `${width}px blank Weight is visually indistinguishable from 0.`);
  await weight.fill("0");
  check(await weight.inputValue() === "0", `${width}px actual 0 kg was not preserved.`);
  await weight.fill("");
  check(await weight.inputValue() === "", `${width}px Weight could not return to a distinct blank state.`);
  check((await page.locator("[data-aw10-sets-label]").innerText()).trim() === localizedCorrectionCopy[language].sets, `${width}px localized Sets label is incorrect.`);
}

'''
if text.count('const scenarios = [') != 1:
    raise SystemExit('scenario marker mismatch')
text = text.replace('const scenarios = [', helpers + 'const scenarios = [', 1)

old_menu = r'''  {
    name: "transient-menu-mutual-exclusion-390x844",
    run: async ({ page }) => {
      await openSessionMenu(page);
      const exerciseTrigger = visible(page, '[data-aw10-exercise-actions] [data-aw-menu-trigger="exercise"]');
      await exerciseTrigger.evaluate((element) => element.click());
      await page.waitForFunction(() => document.querySelector("[data-aw10-exercise-actions]")?.getAttribute("data-state") === "open");
      check(await page.locator("[data-aw10-session-menu]").getAttribute("data-state") === "closed", "Session menu stayed open behind Exercise menu.");
      check(await page.locator("[data-aw10-exercise-actions]").getAttribute("data-state") === "open", "Exercise menu did not open.");
      const sessionTrigger = visible(page, '[data-aw10-session-menu] [data-aw-menu-trigger="session"]');
      await sessionTrigger.evaluate((element) => element.click());
      await page.waitForFunction(() => document.querySelector("[data-aw10-session-menu]")?.getAttribute("data-state") === "open");
      check(await page.locator("[data-aw10-exercise-actions]").getAttribute("data-state") === "closed", "Exercise menu stayed open behind Session menu.");
      await page.locator("#active-set-reps").click();
      check(await page.locator("[data-aw10-session-menu]").getAttribute("data-state") === "closed", "Outside click did not close Session menu.");
      const trigger = visible(page, '[data-aw10-session-menu] [data-aw-menu-trigger="session"]');
      await trigger.click();
      await page.keyboard.press("Escape");
      check(await page.locator("[data-aw10-session-menu]").getAttribute("data-state") === "closed", "Escape did not close Session menu.");
      await page.waitForTimeout(50);
      check(await page.evaluate(() => document.activeElement?.getAttribute("data-aw-menu-trigger")) === "session", "Escape did not restore focus to the menu trigger.");
      const exerciseMenu = await openExerciseMenu(page);
      await exerciseMenu.locator('[role="menuitem"]').first().click();
      await visible(page, "[data-aw6-details-adjust-today]").waitFor({ state: "visible", timeout: 10_000 });
      check(await page.locator("[data-aw10-exercise-actions]").getAttribute("data-state") === "closed", "Exercise menu stayed open behind replacement surface.");
    },
  },'''
new_menu = r'''  {
    name: "transient-menu-mutual-exclusion-keyboard-390x844",
    run: async ({ page }) => {
      const keyboardMenu = await openSessionMenu(page);
      const keyboardItems = keyboardMenu.locator('[role="menuitem"]');
      check(await keyboardItems.count() >= 2, "Session menu does not expose enough items for keyboard navigation.");
      await page.keyboard.press("ArrowDown");
      check(await keyboardItems.first().evaluate((element) => element === document.activeElement), "ArrowDown did not focus the first enabled item.");
      await page.keyboard.press("ArrowDown");
      check(await keyboardItems.nth(1).evaluate((element) => element === document.activeElement), "ArrowDown did not move to the next enabled item.");
      await page.keyboard.press("ArrowUp");
      check(await keyboardItems.first().evaluate((element) => element === document.activeElement), "ArrowUp did not move to the previous enabled item.");
      await page.keyboard.press("End");
      check(await keyboardItems.last().evaluate((element) => element === document.activeElement), "End did not focus the last enabled item.");
      await keyboardItems.first().evaluate((element) => { element.disabled = true; });
      await page.keyboard.press("Home");
      check(await keyboardItems.nth(1).evaluate((element) => element === document.activeElement), "Home did not skip a disabled menu item.");
      await keyboardItems.first().evaluate((element) => { element.disabled = false; });
      await page.keyboard.press("Escape");
      check(await page.locator("[data-aw10-session-menu]").getAttribute("data-state") === "closed", "Escape did not close Session menu.");
      await page.waitForTimeout(50);
      check(await page.evaluate(() => document.activeElement?.getAttribute("data-aw-menu-trigger")) === "session", "Escape did not restore focus to the menu trigger.");

      await openSessionMenu(page);
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Space");
      await visible(page, "[data-aw10-paused-state]").waitFor({ state: "visible", timeout: 10_000 });
      await visible(page, "[data-aw10-paused-state]").getByRole("button").click();
      await page.waitForFunction(() => document.querySelector("[data-aw5-execution-shell]")?.getAttribute("data-aw5-session-state") === "set-entry");

      await openSessionMenu(page);
      const exerciseTrigger = visible(page, '[data-aw10-exercise-actions] [data-aw-menu-trigger="exercise"]');
      await exerciseTrigger.evaluate((element) => element.click());
      await page.waitForFunction(() => document.querySelector("[data-aw10-exercise-actions]")?.getAttribute("data-state") === "open");
      check(await page.locator("[data-aw10-session-menu]").getAttribute("data-state") === "closed", "Session menu stayed open behind Exercise menu.");
      check(await page.locator("[data-aw10-exercise-actions]").getAttribute("data-state") === "open", "Exercise menu did not open.");
      const sessionTrigger = visible(page, '[data-aw10-session-menu] [data-aw-menu-trigger="session"]');
      await sessionTrigger.evaluate((element) => element.click());
      await page.waitForFunction(() => document.querySelector("[data-aw10-session-menu]")?.getAttribute("data-state") === "open");
      check(await page.locator("[data-aw10-exercise-actions]").getAttribute("data-state") === "closed", "Exercise menu stayed open behind Session menu.");
      await page.locator("#active-set-reps").click();
      check(await page.locator("[data-aw10-session-menu]").getAttribute("data-state") === "closed", "Outside click did not close Session menu.");

      const exerciseMenu = await openExerciseMenu(page);
      await page.keyboard.press("ArrowDown");
      check(await exerciseMenu.locator('[role="menuitem"]').first().evaluate((element) => element === document.activeElement), "Exercise-menu ArrowDown did not focus the first item.");
      await page.keyboard.press("Enter");
      await visible(page, "[data-aw6-details-adjust-today]").waitFor({ state: "visible", timeout: 10_000 });
      check(await page.locator("[data-aw10-exercise-actions]").getAttribute("data-state") === "closed", "Exercise menu stayed open behind replacement surface.");
    },
  },'''
replace_once(old_menu, new_menu)

replace_once(
'''      const replacement = visible(page, "[data-aw-replacement-recommendations]");
      await replacement.waitFor({ state: "visible", timeout: 10_000 });
      const recommendations = replacement.locator("ol li");''',
'''      const replacement = visible(page, "[data-aw-replacement-recommendations]");
      await replacement.waitFor({ state: "visible", timeout: 10_000 });
      const dialog = visible(page, "[data-active-set-details-dialog]");
      check(await dialog.getByRole("heading", { name: "Replace for today", exact: true }).count() === 1, "Replacement surface does not expose exactly one primary title.");
      check(((await dialog.innerText()).match(/Adjust today/gi) || []).length === 0, "Replacement surface still repeats Adjust today terminology.");
      check(await dialog.getByText("Use an alternative now. Your saved plan will not change.", { exact: true }).count() === 1, "Replacement supporting description is duplicated or missing.");
      const recommendations = replacement.locator("ol li");''')

old_optimistic = r'''  {
    name: "optimistic-complete-network-delay-390x844",
    delayCanonical: true,
    run: async ({ page, fixture }) => {
      await completeCurrentSet(page, "8", "32.5");
      await page.waitForFunction(() => document.querySelector("[data-aw5-execution-shell]")?.getAttribute("data-aw5-session-state") === "rest", undefined, { timeout: 750 });
      check(fixture.canonicalSettled() === false, "Canonical request settled before optimistic-state assertion could prove latency independence.");
      check(fixture.performedLogsSnapshot().length === 0, "Canonical log existed before delayed persistence was released.");
      fixture.releaseCanonical();
      await fixture.waitForCanonical();
      await page.waitForTimeout(150);
      check(fixture.performedLogsSnapshot().length === 1, `Canonical reconciliation produced ${fixture.performedLogsSnapshot().length} logs instead of one.`);
    },
  },'''
new_optimistic = r'''  {
    name: "optimistic-complete-network-delay-interaction-390x844",
    delayCanonical: true,
    multiExercise: true,
    run: async ({ page, fixture }) => {
      await completeCurrentSet(page, "8", "32.5");
      await page.waitForFunction(() => document.querySelector("[data-aw5-execution-shell]")?.getAttribute("data-aw5-session-state") === "rest", undefined, { timeout: 750 });
      check(fixture.canonicalSettled() === false, "Canonical request settled before optimistic-state assertion could prove latency independence.");
      check(fixture.performedLogsSnapshot().length === 0, "Canonical log existed before delayed persistence was released.");
      const primary = visible(page, "[data-aw5-primary-action]");
      check(await primary.isEnabled(), "Optimistic Rest painted but Skip Rest remained globally frozen.");
      const restControls = visible(page, "[data-aw5-rest-presets]");
      const addThirty = restControls.getByRole("button", { name: /30/ }).first();
      check(await addThirty.isEnabled(), "Add 30 seconds remained frozen during optimistic Rest.");
      const presetButtons = restControls.getByRole("button");
      for (let index = 0; index < await presetButtons.count(); index += 1) {
        check(await presetButtons.nth(index).isEnabled(), `Rest preset ${index + 1} remained frozen during optimistic Rest.`);
      }
      const timerBefore = (await visible(page, "[data-aw10-rest-state]").innerText()).trim();
      await addThirty.click();
      await page.waitForTimeout(50);
      check(fixture.canonicalSettled() === false, "Add 30 seconds incorrectly waited for canonical acknowledgement before local interaction.");
      const timerAfter = (await visible(page, "[data-aw10-rest-state]").innerText()).trim();
      check(timerAfter !== timerBefore, "Add 30 seconds did not update optimistic Rest locally.");
      await visible(page, "[data-aw-exercise-navigator-trigger]").click();
      const navigatorRows = visible(page, "[data-aw-exercise-navigator]").locator("ol button");
      check(await navigatorRows.nth(1).isDisabled(), "Unsafe Exercise Navigator mutation was enabled before canonical set acknowledgement.");
      await page.keyboard.press("Escape");
      await primary.click();
      await page.waitForFunction(() => document.querySelector("[data-aw5-execution-shell]")?.getAttribute("data-aw5-session-state") === "set-entry", undefined, { timeout: 1_000 });
      check(fixture.canonicalSettled() === false, "Skip Rest incorrectly waited for canonical acknowledgement before local interaction.");
      check(await page.locator("#active-set-reps").isDisabled(), "Unsafe next-set editing was enabled before canonical set acknowledgement.");
      fixture.releaseCanonical();
      await fixture.waitForCanonical();
      await page.waitForTimeout(250);
      check(fixture.performedLogsSnapshot().length === 1, `Canonical reconciliation produced ${fixture.performedLogsSnapshot().length} logs instead of one.`);
      await page.waitForFunction(() => !document.querySelector("#active-set-reps")?.disabled, undefined, { timeout: 5_000 });
      check(fixture.performedLogsSnapshot().length === 1, "Queued Rest follow-ups duplicated the canonical set command.");
    },
  },'''
replace_once(old_optimistic, new_optimistic)

old_long = r'''  {
    name: "long-exercise-title-chevron-mobile-320x568",
    viewport: { width: 320, height: 568 },
    direct: true,
    run: async ({ page }) => {
      const title = visible(page, "[data-aw10-exercise-details-trigger]");
      const text = (await title.innerText()).trim();
      check(text.length > 40, "Long exercise title fixture was not rendered.");
      const box = await title.boundingBox();
      check(Boolean(box) && box.width <= 320, "Long exercise title/chevron target exceeds the mobile viewport.");
      check(await title.locator("svg").count() === 1, "Exercise Detail navigation chevron is missing beside the title.");
    },
  },'''
new_long = r'''  {
    name: "long-exercise-title-chevron-mobile-320x568",
    viewport: { width: 320, height: 568 },
    direct: true,
    run: async ({ page }) => {
      const title = visible(page, "[data-aw10-exercise-details-trigger]");
      const text = (await title.innerText()).trim();
      check(text.length > 40, "Long exercise title fixture was not rendered.");
      check(await title.getAttribute("aria-label") === text, "Long exercise title does not preserve its full accessible name.");
      const box = await title.boundingBox();
      check(Boolean(box) && box.width <= 320, "Long exercise title/chevron target exceeds the mobile viewport.");
      const clamp = await title.locator("bdi").evaluate((element) => {
        const style = getComputedStyle(element);
        const lineHeight = Number.parseFloat(style.lineHeight);
        const rect = element.getBoundingClientRect();
        return { height: rect.height, lineHeight };
      });
      check(clamp.lineHeight > 0 && clamp.height <= clamp.lineHeight * 2.25, `Long title consumed more than two compact lines (${clamp.height}px).`);
      const chevron = title.locator("svg");
      check(await chevron.count() === 1 && await chevron.isVisible(), "Exercise Detail navigation chevron is missing beside the title.");
      const reps = await page.locator("#active-set-reps").boundingBox();
      const weight = await page.locator("#active-set-weight").boundingBox();
      check(Boolean(reps) && Boolean(weight) && reps.y + reps.height <= 568 && weight.y + weight.height <= 568, "Long title pushed execution inputs out of the initial usable viewport.");
      check(Math.abs(reps.y - weight.y) <= 3, "Long-title layout separated Reps and Weight vertically.");
    },
  },'''
replace_once(old_long, new_long)

new_scenarios = r'''  {
    name: "mobile-hierarchy-en-320x568",
    viewport: { width: 320, height: 568 },
    language: "en",
    previousPerformance: true,
    run: async ({ page, previousPerformanceRequests }) => {
      await waitForPreviousPerformanceRequestCount(previousPerformanceRequests, 1);
      await assertCorrectionMobileHierarchy(page, 320, "en");
    },
  },
  {
    name: "mobile-hierarchy-de-360x800",
    viewport: { width: 360, height: 800 },
    language: "de",
    previousPerformance: true,
    run: async ({ page, previousPerformanceRequests }) => {
      await waitForPreviousPerformanceRequestCount(previousPerformanceRequests, 1);
      await assertCorrectionMobileHierarchy(page, 360, "de");
    },
  },
  {
    name: "mobile-hierarchy-ar-rtl-390x844",
    viewport: { width: 390, height: 844 },
    language: "ar",
    previousPerformance: true,
    run: async ({ page, previousPerformanceRequests }) => {
      await waitForPreviousPerformanceRequestCount(previousPerformanceRequests, 1);
      await assertCorrectionMobileHierarchy(page, 390, "ar");
    },
  },
  {
    name: "mobile-hierarchy-dark-en-430x932",
    viewport: { width: 430, height: 932 },
    theme: "dark",
    language: "en",
    previousPerformance: true,
    run: async ({ page, previousPerformanceRequests }) => {
      await waitForPreviousPerformanceRequestCount(previousPerformanceRequests, 1);
      await assertCorrectionMobileHierarchy(page, 430, "en");
    },
  },
  {
    name: "previous-performance-draft-stability-semantic-refetch-390x844",
    viewport: { width: 390, height: 844 },
    previousPerformance: true,
    multiExercise: true,
    run: async ({ page, previousPerformanceRequests }) => {
      await waitForPreviousPerformanceRequestCount(previousPerformanceRequests, 1);
      const previous = await waitForPreviousPerformanceValue(page);
      const initialText = (await previous.innerText()).trim();
      const initialIdentity = previousPerformanceRequests[0].identity;
      const reps = page.locator("#active-set-reps");
      const weight = page.locator("#active-set-weight");
      await reps.fill("");
      await reps.pressSequentially("123");
      await weight.fill("");
      await weight.pressSequentially("45.5");
      await page.waitForTimeout(100);
      check(previousPerformanceRequests.length === 1, `Reps/Weight editing triggered ${previousPerformanceRequests.length - 1} Previous Performance refetches.`);
      check((await previous.innerText()).trim() === initialText, "Previous Performance disappeared or changed while editing Reps/Weight.");
      check(await previous.locator(".animate-pulse").count() === 0, "Previous Performance returned to a skeleton while typing.");

      await visible(page, "[data-active-set-details-trigger]").click();
      await page.locator("#active-set-rpe").fill("8");
      await page.locator("#active-set-rir").fill("2");
      await page.locator("#active-set-note").fill("steady");
      await page.waitForTimeout(100);
      check(previousPerformanceRequests.length === 1, "RPE/RIR/Notes editing triggered a Previous Performance refetch.");
      await page.keyboard.press("Escape");
      check((await previous.innerText()).trim() === initialText, "Previous Performance did not remain stable after set-detail draft edits.");

      await page.locator('[data-aw5-set-path-number="2"]').click();
      await waitForPreviousPerformanceRequestCount(previousPerformanceRequests, 2);
      check(previousPerformanceRequests[1].setNumber === 2, "Set navigation did not refetch Previous Performance for set 2.");
      await page.waitForTimeout(100);
      check(previousPerformanceRequests.length === 2, "Set navigation produced more than one semantic Previous Performance refetch.");

      await visible(page, "[data-aw-exercise-navigator-trigger]").click();
      await visible(page, "[data-aw-exercise-navigator]").locator("ol button").nth(1).click();
      await waitForPreviousPerformanceRequestCount(previousPerformanceRequests, 3);
      check(previousPerformanceRequests[2].identity !== initialIdentity, "Exercise navigation did not change Previous Performance stable identity.");
      await page.waitForTimeout(100);
      check(previousPerformanceRequests.length === 3, "Exercise navigation produced more than one semantic Previous Performance refetch.");
    },
  },
  {
    name: "previous-performance-replacement-identity-refetch-390x844",
    viewport: { width: 390, height: 844 },
    previousPerformance: true,
    replacementCatalog: true,
    replacementApply: true,
    run: async ({ page, replacementAuthority, previousPerformanceRequests }) => {
      await waitForPreviousPerformanceRequestCount(previousPerformanceRequests, 1);
      await waitForPreviousPerformanceValue(page);
      const initialIdentity = previousPerformanceRequests[0].identity;
      const menu = await openExerciseMenu(page);
      await menu.locator('[role="menuitem"]').first().click();
      const replacement = visible(page, "[data-aw-replacement-recommendations]");
      await replacement.locator("ol li").first().waitFor({ state: "visible", timeout: 15_000 });
      const candidate = replacement.locator("ol li").filter({ hasText: replacementAuthority.replacementDetailName }).first();
      await candidate.getByRole("button", { name: /^Replace$/i }).click();
      await page.getByRole("heading", { name: replacementAuthority.replacementDetailName, exact: true }).waitFor({ state: "visible", timeout: 15_000 });
      await waitForPreviousPerformanceRequestCount(previousPerformanceRequests, 2);
      check(previousPerformanceRequests[1].identity === replacementAuthority.replacementDetailId, `Replacement Previous Performance identity ${previousPerformanceRequests[1].identity} did not match canonical replacement ${replacementAuthority.replacementDetailId}.`);
      check(previousPerformanceRequests[1].identity !== initialIdentity, "Replacement did not change Previous Performance semantic identity.");
      await page.waitForTimeout(100);
      check(previousPerformanceRequests.length === 2, "Replacement produced more than one semantic Previous Performance refetch.");
    },
  },
  ...["en", "de", "ar"].map((language) => ({
    name: `localized-rest-${language}-390x844`,
    viewport: { width: 390, height: 844 },
    language,
    run: async ({ page }) => {
      await completeCurrentSet(page);
      await visible(page, "[data-aw10-rest-state]").waitFor({ state: "visible", timeout: 5_000 });
      check((await page.locator("[data-aw10-rest-label]").innerText()).trim() === localizedCorrectionCopy[language].rest, `Localized Rest label is incorrect for ${language}.`);
    },
  })),
  {
    name: "long-exercise-title-chevron-mobile-ar-320x568",
    viewport: { width: 320, height: 568 },
    direct: true,
    language: "ar",
    run: async ({ page }) => {
      const title = visible(page, "[data-aw10-exercise-details-trigger]");
      check(await title.getAttribute("aria-label") === (await title.innerText()).trim(), "Arabic long title lost its full accessible name.");
      check(await title.locator("svg").isVisible(), "Arabic long-title Exercise Detail chevron is not visible.");
      check(await page.evaluate(() => (document.documentElement.dir || getComputedStyle(document.documentElement).direction) === "rtl"), "Arabic long-title execution is not RTL.");
      const reps = await page.locator("#active-set-reps").boundingBox();
      const weight = await page.locator("#active-set-weight").boundingBox();
      check(Boolean(reps) && Boolean(weight) && reps.y + reps.height <= 568 && weight.y + weight.height <= 568, "Arabic long title pushed execution inputs out of the initial viewport.");
      check(Math.abs(reps.y - weight.y) <= 3, "Arabic long-title layout separated Reps and Weight vertically.");
    },
  },
'''
tail_marker = '];\n\nconst browser = await chromium.launch({ headless: true });'
if text.count(tail_marker) != 1:
    raise SystemExit('scenario tail marker mismatch')
text = text.replace(tail_marker, new_scenarios + '];\n\nconst browser = await chromium.launch({ headless: true });', 1)
replace_once(
    '  requiredViewportComplement: ["320x568", "390x844", "430x932"],',
    '  requiredViewportComplement: ["320x568", "360x800", "390x844", "430x932"],'
)

path.write_text(text)
