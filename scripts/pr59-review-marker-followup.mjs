import { readFileSync, rmSync, writeFileSync } from "node:fs";

const path = "components/workouts/workout-plan-builder.tsx";
const source = readFileSync(path, "utf8");
const before = '{step === 3 ? <div className="space-y-4">';
const after = '{step === 3 ? <div className="space-y-4" data-builder-step="review">';
if (!source.includes(before)) throw new Error("Builder review state block not found");
writeFileSync(path, `${source.replace(before, after).trimEnd()}\n`, "utf8");
rmSync("scripts/pr59-review-marker-followup.mjs", { force: true });
console.log("Added the explicit builder review-state marker.");