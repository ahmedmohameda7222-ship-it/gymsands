import { readFileSync, rmSync, writeFileSync } from "node:fs";

const path = "components/workouts/exercise-picker-dialog.tsx";
const source = readFileSync(path, "utf8");
const before = 'className="absolute inset-x-0 bottom-0 border-t bg-background/95 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur sm:px-5" data-picker-footer';
const after = 'className="absolute inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur sm:px-5" data-picker-footer';
if (!source.includes(before)) throw new Error("Picker footer class contract not found");
writeFileSync(path, `${source.replace(before, after).trimEnd()}\n`, "utf8");
rmSync("scripts/pr59-picker-followup.mjs", { force: true });
console.log("Raised the picker footer above scroll-region action layers.");