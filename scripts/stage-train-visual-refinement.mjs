import { execFileSync, execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const pickerPath = "components/workouts/exercise-picker-dialog.tsx";
const implementationFiles = [
  "components/ui/action-menu.tsx",
  "components/ui/dialog.tsx",
  "components/workouts/exercise-picker-dialog.tsx",
  "components/workouts/my-workout-plans.tsx",
  "components/workouts/workout-plan-builder.tsx",
  "components/workouts/workout-plan-editor.tsx",
  "lib/i18n/train.ts",
  "lib/workouts/train-visual.ts",
  "lib/workouts/train-visual.test.ts",
  "lib/product/train-post-merge-visual-refinement.test.ts"
];

execFileSync("python", ["scripts/apply-train-visual-refinement.py"], { stdio: "inherit" });

const picker = readFileSync(pickerPath, "utf8").replace(
  "Check, Dumbbell, ExternalLink, Plus, Search, X",
  "Check, Dumbbell, ExternalLink, Plus, Search"
);
writeFileSync(pickerPath, picker, "utf8");

mkdirSync("quality-reports", { recursive: true });
writeFileSync(
  "quality-reports/train-visual-refinement.patch",
  execSync("git diff --binary", { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }),
  "utf8"
);
execFileSync("tar", ["-czf", "quality-reports/train-visual-implementation.tgz", ...implementationFiles]);
console.log(`Staged ${implementationFiles.length} Train visual-refinement files for validation.`);
