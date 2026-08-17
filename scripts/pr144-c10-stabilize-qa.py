from pathlib import Path

path = Path("scripts/run-active-workout-full-authority-qa.mjs")
text = path.read_text()

marker = "async function assertCorrectionMobileHierarchy(page, width, language) {"
helper = '''async function waitForSettledExecutionLayout(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => {
    const scroll = document.querySelector("[data-workout-session-scroll]");
    const surface = scroll?.parentElement;
    if (!(surface instanceof HTMLElement)) return false;
    const transform = getComputedStyle(surface).transform;
    if (transform && transform !== "none") {
      const matrix = new DOMMatrixReadOnly(transform);
      if (Math.abs(matrix.m42) > 0.5) return false;
    }
    return true;
  }, undefined, { timeout: 5_000 });

  let previous = null;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const current = await page.evaluate(() => [
      "#active-set-reps",
      "#active-set-weight",
      "[data-aw5-primary-action]",
    ].map((selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }));
    if (previous && current.every((rect, index) => {
      const prior = previous[index];
      if (!rect || !prior) return rect === prior;
      return Math.abs(rect.x - prior.x) <= 0.5
        && Math.abs(rect.y - prior.y) <= 0.5
        && Math.abs(rect.width - prior.width) <= 0.5
        && Math.abs(rect.height - prior.height) <= 0.5;
    })) return;
    previous = current;
    await page.waitForTimeout(50);
  }
  throw new Error("Active Workout execution layout did not settle before geometry verification.");
}

'''
if marker not in text:
    raise SystemExit("assertCorrectionMobileHierarchy marker missing")
if "async function waitForSettledExecutionLayout(page)" in text:
    raise SystemExit("settled-layout helper already present")
text = text.replace(marker, helper + marker, 1)

old = '''async function assertCorrectionMobileHierarchy(page, width, language) {
  await waitForPreviousPerformanceValue(page);
  await page.evaluate(() => document.fonts.ready);'''
new = '''async function assertCorrectionMobileHierarchy(page, width, language) {
  await waitForPreviousPerformanceValue(page);
  await waitForSettledExecutionLayout(page);'''
if text.count(old) != 1:
    raise SystemExit(f"mobile hierarchy stabilization replacement count={text.count(old)}")
text = text.replace(old, new, 1)

old_ar = '''    run: async ({ page }) => {
      const title = visible(page, "[data-aw10-exercise-details-trigger]");
      await page.evaluate(() => document.fonts.ready);
      check(await title.getAttribute("aria-label") === (await title.innerText()).trim(), "Arabic long title lost its full accessible name.");'''
new_ar = '''    run: async ({ page }) => {
      const title = visible(page, "[data-aw10-exercise-details-trigger]");
      await waitForSettledExecutionLayout(page);
      check(await title.getAttribute("aria-label") === (await title.innerText()).trim(), "Arabic long title lost its full accessible name.");'''
if text.count(old_ar) != 1:
    raise SystemExit(f"Arabic long-title stabilization replacement count={text.count(old_ar)}")
text = text.replace(old_ar, new_ar, 1)

path.write_text(text)
