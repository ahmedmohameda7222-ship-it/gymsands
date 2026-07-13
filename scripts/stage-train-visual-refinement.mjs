import { execFileSync, execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

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

function replaceOnce(path, before, after, label) {
  const current = readFileSync(path, "utf8");
  if (!current.includes(before)) throw new Error(`Missing finalization target: ${label}`);
  writeFileSync(path, current.replace(before, after), "utf8");
}

execFileSync("python", ["scripts/apply-train-visual-refinement.py"], { stdio: "inherit" });

replaceOnce(
  "components/workouts/exercise-picker-dialog.tsx",
  "Check, Dumbbell, ExternalLink, Plus, Search, X",
  "Check, Dumbbell, ExternalLink, Plus, Search",
  "unused picker icon"
);
replaceOnce(
  "components/ui/action-menu.tsx",
  'visibleLabel ?? label.split(":")[0]',
  "visibleLabel ?? label",
  "concise menu fallback"
);
replaceOnce(
  "components/ui/dialog.tsx",
  'fixed inset-0 z-[110] flex h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col overflow-hidden overscroll-contain rounded-none border-0 p-0 shadow-luxe outline-none lg:inset-y-0 lg:left-auto lg:right-0 lg:top-0 lg:h-dvh lg:max-h-dvh lg:w-[min(54rem,100vw)] lg:max-w-[54rem] lg:border-y-0 lg:border-l lg:rtl:left-0 lg:rtl:right-auto lg:rtl:border-l-0 lg:rtl:border-r',
  'fixed inset-x-0 bottom-0 top-auto z-[110] flex max-h-[85dvh] w-full max-w-full translate-x-0 translate-y-0 flex-col overflow-hidden overscroll-contain rounded-b-none rounded-t-[24px] border-x-0 border-b-0 p-0 shadow-luxe outline-none lg:inset-y-0 lg:left-auto lg:right-0 lg:top-0 lg:h-dvh lg:max-h-dvh lg:w-[min(32rem,100vw)] lg:max-w-[32rem] lg:rounded-none lg:border-y-0 lg:border-r-0 lg:translate-x-0 lg:translate-y-0 lg:rtl:left-0 lg:rtl:right-auto lg:rtl:border-l-0 lg:rtl:border-r',
  "shared responsive drawer geometry"
);
replaceOnce(
  "components/workouts/exercise-picker-dialog.tsx",
  'className="w-screen max-w-none lg:w-[min(54rem,100vw)] lg:max-w-[54rem]"',
  'className="inset-x-0 bottom-0 top-0 h-dvh max-h-dvh w-screen max-w-none rounded-none border-0 sm:inset-x-0 sm:bottom-0 sm:top-0 sm:h-dvh sm:max-h-dvh sm:w-screen sm:max-w-none sm:translate-x-0 sm:translate-y-0 sm:rounded-none sm:p-0 lg:inset-y-0 lg:left-auto lg:right-0 lg:top-0 lg:h-dvh lg:max-h-dvh lg:w-[min(54rem,100vw)] lg:max-w-[54rem] lg:translate-x-0 lg:translate-y-0 lg:rounded-none lg:border-y-0 lg:border-l lg:rtl:left-0 lg:rtl:right-auto lg:rtl:border-l-0 lg:rtl:border-r"',
  "picker full-screen override"
);
replaceOnce(
  "components/workouts/exercise-picker-dialog.tsx",
  'className="shrink-0 border-t bg-background/95 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur sm:px-5" data-picker-footer',
  'className="absolute inset-x-0 bottom-0 border-t bg-background/95 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur sm:px-5" data-picker-footer',
  "picker fixed footer"
);
replaceOnce(
  "components/workouts/workout-plan-editor.tsx",
  'className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)] xl:items-start"',
  'className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start"',
  "editor desktop grid"
);
replaceOnce(
  "components/workouts/workout-plan-editor.tsx",
  'className="space-y-3 xl:sticky xl:top-6"',
  'className="space-y-3 lg:sticky lg:top-6"',
  "editor sticky day navigation"
);
replaceOnce(
  "components/workouts/workout-plan-editor.tsx",
  'className="grid grid-flow-col auto-cols-[minmax(190px,1fr)] gap-2 overflow-x-auto pb-2 xl:grid-flow-row xl:auto-cols-auto xl:overflow-visible"',
  'className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible"',
  "editor day navigation layout"
);
replaceOnce(
  "components/workouts/workout-plan-editor.tsx",
  'className={`flex min-w-0 items-center gap-1 rounded-2xl border p-1 ${selected ?',
  'className={`flex min-w-48 items-center gap-1 rounded-2xl border p-1 lg:min-w-0 ${selected ?',
  "editor day card width"
);
replaceOnce(
  "lib/product/train-post-merge-visual-refinement.test.ts",
  "visibleLabel ?? label.split(\":\")[0]",
  "visibleLabel ?? label",
  "menu-label test"
);
replaceOnce(
  "lib/product/train-post-merge-visual-refinement.test.ts",
  `    const dialog = source("components/ui/dialog.tsx");\n    const picker = source("components/workouts/exercise-picker-dialog.tsx");\n    expect(dialog).toContain("fixed inset-0");\n    expect(dialog).toContain("h-dvh");\n    expect(picker).toContain("grid grid-cols-1 gap-3 lg:grid-cols-2");\n    expect(picker).not.toContain("xl:grid-cols-3");`,
  `    const picker = source("components/workouts/exercise-picker-dialog.tsx");\n    expect(picker).toContain("top-0 h-dvh max-h-dvh w-screen");\n    expect(picker).toContain("grid grid-cols-1 gap-3 lg:grid-cols-2");\n    const resultGrid = picker.match(/className="([^"]*grid-cols-1[^"]*)" data-picker-results/)?.[1] ?? "";\n    expect(resultGrid).toContain("lg:grid-cols-2");\n    expect(resultGrid).not.toMatch(/grid-cols-3/);`,
  "picker visual test"
);

mkdirSync("quality-reports", { recursive: true });
writeFileSync(
  "quality-reports/train-visual-refinement.patch",
  execSync("git diff --binary", { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }),
  "utf8"
);
execFileSync("tar", ["-czf", "quality-reports/train-visual-implementation.tgz", ...implementationFiles]);
console.log(`Staged ${implementationFiles.length} Train visual-refinement files for validation.`);
