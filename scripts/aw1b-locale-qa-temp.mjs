import { readFile, writeFile } from "node:fs/promises";

let source = await readFile("scripts/run-train-layout-qa.mjs", "utf8");

source = source.replace(
  '{ name: "360x800", width: 360, height: 800 },',
  '{ name: "360x780", width: 360, height: 780 },'
);

source = source.replace(
  '  await page.waitForSelector(isSessionRoute ? "main#main-content" : "[data-app-shell]", { timeout: 20_000 });',
  '  await page.waitForSelector(isSessionRoute ? "main#main-content" : "[data-app-shell]", { timeout: 20_000 });\n  await page.waitForFunction((expected) => document.documentElement.lang === expected, language, { timeout: 20_000 });'
);

source = source.replace(
  '  const item = {',
  `  const bodyText = await page.locator("body").innerText();
  const expectedSessionAction = language === "de" ? "abschließen" : language === "ar" ? "إنهاء المجموعة" : "Finish set";
  const localizedSessionActionVisible = !isSessionRoute || bodyText.includes(expectedSessionAction);
  const oldEnglishActiveCopyVisible = language === "en" || !isSessionRoute
    ? false
    : ["Finish set", "Session details", "Finish workout", "Workout complete"].some((value) => bodyText.includes(value));
  const numericInputs = page.locator('input[inputmode="numeric"]');
  const numericInputsReadable = !isSessionRoute || (
    (await numericInputs.count()) > 0 &&
    await numericInputs.evaluateAll((elements) => elements.every((element) => {
      const style = getComputedStyle(element);
      return style.direction === "ltr" && element.scrollWidth <= element.clientWidth + 2;
    }))
  );
  const dynamicExerciseBidiIsolated = !isSessionRoute || (await page.locator("main h2 bdi").count()) > 0;
  const heatMapNotMirrored = !isSessionRoute || await page.locator('[data-muscle-heat-map-mode]').evaluateAll((elements) =>
    elements.every((element) => {
      const transform = getComputedStyle(element).transform;
      return !transform.includes("-1") && !transform.includes("matrix(-1");
    })
  );
  const item = {`
);

source = source.replace(
  '    pageErrors,\n    keyboard,',
  '    pageErrors,\n    htmlLang: await page.locator("html").getAttribute("lang"),\n    htmlDirection: await page.locator("html").getAttribute("dir"),\n    localizedSessionActionVisible,\n    oldEnglishActiveCopyVisible,\n    numericInputsReadable,\n    dynamicExerciseBidiIsolated,\n    heatMapNotMirrored,\n    keyboard,'
);

source = source.replace(
  '    || item.horizontalOverflowPx > 1',
  '    || item.horizontalOverflowPx > 1\n    || item.htmlLang !== item.language\n    || item.htmlDirection !== (item.language === "ar" ? "rtl" : "ltr")\n    || !item.localizedSessionActionVisible\n    || item.oldEnglishActiveCopyVisible\n    || !item.numericInputsReadable\n    || !item.dynamicExerciseBidiIsolated\n    || !item.heatMapNotMirrored'
);

const matrixStart = source.indexOf("// Exercise the longest connected builder interaction first");
const matrixEnd = source.indexOf("await browser.close();", matrixStart);
if (matrixStart < 0 || matrixEnd < 0) throw new Error("Could not locate Train QA matrix boundaries");

const focusedMatrix = `const requiredLocaleViewports = viewports.filter((item) => ["360x780", "390x844", "430x932", "1440x900"].includes(item.name));
for (const language of ["en", "de", "ar"]) {
  for (const viewport of requiredLocaleViewports) {
    observations.push(await openScenario({ viewport, scenario: "active", language, route: \`/workouts/session/day/\${activeDayId}\` }));
  }
}
observations.push(await openScenario({
  viewport: viewports.find((item) => item.name === "390x844"),
  scenario: "active",
  language: "ar",
  route: "/my-workout/plans"
}));
`;

source = source.slice(0, matrixStart) + focusedMatrix + source.slice(matrixEnd);
await writeFile("scripts/.aw1b-locale-qa.mjs", source, "utf8");
console.log("Focused AW-1B locale QA runner created.");
