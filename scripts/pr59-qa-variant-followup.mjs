import { readFileSync, rmSync, writeFileSync } from "node:fs";

const path = "scripts/run-train-layout-qa.mjs";
const source = readFileSync(path, "utf8");
const before = 'observations.push(await openScenario({ viewport, scenario: "active", route, variant }));';
const after = 'observations.push(await openScenario({ viewport, scenario: "scheduled", route, variant }));';
const occurrences = source.split(before).length - 1;
if (occurrences !== 1) throw new Error(`Expected one data-shape scenario call, found ${occurrences}`);
writeFileSync(path, `${source.replace(before, after).trimEnd()}\n`, "utf8");
rmSync("scripts/pr59-qa-variant-followup.mjs", { force: true });
console.log("Isolated Train data-shape snapshots from active-controller timing.");