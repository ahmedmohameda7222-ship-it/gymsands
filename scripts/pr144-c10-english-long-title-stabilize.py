from pathlib import Path

path = Path("scripts/run-active-workout-full-authority-qa.mjs")
text = path.read_text()
old = '''    run: async ({ page }) => {
      const title = visible(page, "[data-aw10-exercise-details-trigger]");
      await page.evaluate(() => document.fonts.ready);
      const text = (await title.innerText()).trim();
      check(text.length > 40, "Long exercise title fixture was not rendered.");'''
new = '''    run: async ({ page }) => {
      const title = visible(page, "[data-aw10-exercise-details-trigger]");
      await waitForSettledExecutionLayout(page);
      const text = (await title.innerText()).trim();
      check(text.length > 40, "Long exercise title fixture was not rendered.");'''
count = text.count(old)
if count != 1:
    raise SystemExit(f"English long-title stabilization replacement count={count}")
path.write_text(text.replace(old, new, 1))
