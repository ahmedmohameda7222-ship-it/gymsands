const { readFileSync, writeFileSync } = require("node:fs");

function replaceExactly(path, before, after, expectedCount = 1) {
  const source = readFileSync(path, "utf8");
  const count = source.split(before).length - 1;
  if (count !== expectedCount) {
    throw new Error(`${path}: expected ${expectedCount} target(s), found ${count}`);
  }
  writeFileSync(path, source.split(before).join(after), "utf8");
}

const fixturePath = "scripts/train-layout-qa-fixture.mjs";
replaceExactly(
  fixturePath,
  `  await context.addInitScript(({ languageValue, themeId }) => {
    localStorage.setItem("plaivra.qa.train-scenario", "active");
    localStorage.setItem("plaivra.qa.train-variant", "active-default-success");
    localStorage.setItem("plaivra.language.v1", languageValue);
    localStorage.setItem("plaivra-theme-id", themeId);
  }, {`,
  `  await context.addInitScript(({ languageValue, themeId }) => {
    try {
      localStorage.setItem("plaivra.qa.train-scenario", "active");
      localStorage.setItem("plaivra.qa.train-variant", "active-default-success");
      localStorage.setItem("plaivra.language.v1", languageValue);
      localStorage.setItem("plaivra-theme-id", themeId);
    } catch {
      // Playwright also evaluates init scripts in origin-less documents.
      // Those documents have no storage authority and are intentionally ignored.
    }
  }, {`
);

const runnerPath = "scripts/run-aw10-active-workout-closure-qa.mjs";
replaceExactly(
  runnerPath,
  `      controllerCount: [...document.querySelectorAll("[data-active-workout-controller]")].filter(isVisible).length,`,
  `      controllerCount: document.querySelectorAll("[data-active-workout-controller]").length,`
);

const testPath = "lib/product/active-workout-aw10-closure.test.ts";
replaceExactly(
  testPath,
  `    expect(fixture).not.toContain("payload?.p_final_logs");`,
  `    expect(fixture).not.toContain("payload?.p_final_logs");
    expect(fixture).toContain("Those documents have no storage authority");
    expect(runner).toContain(
      'controllerCount: document.querySelectorAll("[data-active-workout-controller]").length',
    );`
);
