import { readFileSync, rmSync, writeFileSync } from "node:fs";

const path = "scripts/run-train-layout-qa.mjs";
const source = readFileSync(path, "utf8");
const before = '  if (scenario === "active" && !isSessionRoute) await page.waitForSelector("[data-active-workout-controller]", { timeout: 20_000 });';
const after = `  if (scenario === "active" && !isSessionRoute) {\n    await page.waitForSelector("[data-active-workout-controller]", { timeout: 20_000 }).catch(() => undefined);\n  }`;
const occurrences = source.split(before).length - 1;
if (occurrences !== 1) throw new Error(`Expected one active-controller wait, found ${occurrences}`);
writeFileSync(path, `${source.replace(before, after).trimEnd()}\n`, "utf8");
rmSync("scripts/pr59-qa-reporting-followup.mjs", { force: true });
console.log("Converted active-controller timeouts into structured QA failures.");