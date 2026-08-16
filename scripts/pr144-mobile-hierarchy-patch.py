from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one replacement, found {count}: {old!r}')
    target.write_text(text.replace(old, new, 1))


shell = 'components/workouts/active-workout/active-workout-execution-shell.tsx'
replace_once(shell, '<main className="mt-3 sm:mt-6">', '<main className="mt-2 sm:mt-6">')
replace_once(shell, 'className="flex items-start gap-3 border-b border-border/70 pb-3 sm:pb-4"', 'className="flex items-start gap-3 border-b border-border/70 pb-2 sm:pb-4"')
replace_once(shell, 'className="flex flex-wrap gap-x-5 gap-y-2 border-b border-border/70 py-2.5 text-sm sm:py-3"', 'className="flex flex-wrap gap-x-5 gap-y-2 border-b border-border/70 py-2 text-sm sm:py-3"')
replace_once(shell, 'data-aw10-previous-performance className="border-b border-border/70 py-3 sm:py-4"', 'data-aw10-previous-performance className="border-b border-border/70 py-2 sm:py-4"')
replace_once(shell, '<section data-aw5-primary-editor className="py-4 sm:py-5" aria-label={currentSetLabel}>', '<section data-aw5-primary-editor className="py-3 sm:py-5" aria-label={currentSetLabel}>')

qa = 'scripts/run-active-workout-full-authority-qa.mjs'
replace_once(qa, '''async function assertCorrectionMobileHierarchy(page, width, language) {
  await waitForPreviousPerformanceValue(page);
  const metrics = await page.evaluate(() => {''', '''async function assertCorrectionMobileHierarchy(page, width, language) {
  await waitForPreviousPerformanceValue(page);
  await page.evaluate(() => document.fonts.ready);
  const metrics = await page.evaluate(() => {''')
replace_once(qa, '''      const text = (await title.innerText()).trim();
      check(text.length > 40, "Long exercise title fixture was not rendered.");''', '''      await page.evaluate(() => document.fonts.ready);
      const text = (await title.innerText()).trim();
      check(text.length > 40, "Long exercise title fixture was not rendered.");''')
replace_once(qa, '''      check((await page.locator("[data-aw10-rest-label]").innerText()).trim() === localizedCorrectionCopy[language].rest, `Localized Rest label is incorrect for ${language}.`);''', '''      check((await page.locator("[data-aw10-rest-label]").textContent())?.trim() === localizedCorrectionCopy[language].rest, `Localized Rest label is incorrect for ${language}.`);''')
replace_once(qa, '''      const title = visible(page, "[data-aw10-exercise-details-trigger]");
      check(await title.getAttribute("aria-label") === (await title.innerText()).trim(), "Arabic long title lost its full accessible name.");''', '''      const title = visible(page, "[data-aw10-exercise-details-trigger]");
      await page.evaluate(() => document.fonts.ready);
      check(await title.getAttribute("aria-label") === (await title.innerText()).trim(), "Arabic long title lost its full accessible name.");''')
