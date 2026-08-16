import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const write = (path, value) => fs.writeFileSync(path, value);
function replaceOnce(path, before, after) {
  const source = read(path);
  if (!source.includes(before)) throw new Error(`Missing repair anchor in ${path}: ${before.slice(0, 120)}`);
  write(path, source.replace(before, after));
}

replaceOnce(
  "components/workouts/active-workout/active-workout-execution-shell.tsx",
  "  pauseLabel: string;\n  resumeLabel: string;",
  "  pauseLabel: string;\n  pausedStateLabel: string;\n  resumeLabel: string;",
);
replaceOnce(
  "components/workouts/active-workout/active-workout-execution-shell.tsx",
  "  pauseLabel,\n  resumeLabel,",
  "  pauseLabel,\n  pausedStateLabel,\n  resumeLabel,",
);
replaceOnce(
  "components/workouts/active-workout/active-workout-execution-shell.tsx",
  '<p className="mt-4 text-sm font-semibold uppercase tracking-[0.1em] text-muted-foreground">{pauseLabel}</p>\n            <p className="mt-3 max-w-lg text-xl font-semibold text-foreground"><bdi>{exerciseName}</bdi></p>',
  '<p className="mt-4 text-sm font-semibold uppercase tracking-[0.1em] text-muted-foreground">{pausedStateLabel}</p>\n            <p data-aw10-paused-elapsed dir="ltr" className="mt-2 text-3xl font-semibold tabular-nums text-foreground">{elapsedLabel}</p>\n            <p className="mt-3 max-w-lg text-xl font-semibold text-foreground"><bdi>{exerciseName}</bdi></p>',
);
replaceOnce(
  "components/workouts/active-workout/active-workout-execution-shell.tsx",
  "      <MobileStickyActionsSpacer />\n      <MobileStickyActions data-aw10-sticky-actions>",
  '      <MobileStickyActionsSpacer placement="session" />\n      <MobileStickyActions placement="session" data-aw10-sticky-actions>',
);

replaceOnce(
  "components/workouts/active-workout/active-workout-core-session-implementation.tsx",
  '        pauseLabel={tr("common.pause")}\n        resumeLabel={tr("common.resume")}',
  '        pauseLabel={tr("common.pause")}\n        pausedStateLabel={tr("common.paused")}\n        resumeLabel={tr("common.resume")}',
);

replaceOnce(
  "scripts/train-layout-qa-fixture.mjs",
  "function catalogPayload(url, includeGuide) {",
  "function catalogPayload(url, includeGuide, activityName = directExerciseName) {",
);
replaceOnce(
  "scripts/train-layout-qa-fixture.mjs",
  '    name: directExerciseName,',
  '    name: activityName,',
);
replaceOnce(
  "scripts/train-layout-qa-fixture.mjs",
  '    source_plan_activity_id: direct ? activityId : null,',
  '    source_plan_activity_id: activityId,',
);
replaceOnce(
  "scripts/train-layout-qa-fixture.mjs",
  '      body: JSON.stringify(catalogPayload(new URL(route.request().url()), includeGuide))',
  '      body: JSON.stringify(catalogPayload(new URL(route.request().url()), includeGuide, exerciseName))',
);

replaceOnce(
  "scripts/run-aw5-correction-layout-qa.mjs",
  '  ["plan-day-set-entry-en-390x844", 390, 844, "en", "light", false],',
  '  ["plan-day-set-entry-en-360x800", 360, 800, "en", "light", false],\n  ["plan-day-set-entry-en-390x844", 390, 844, "en", "light", false],',
);
replaceOnce(
  "scripts/run-aw5-correction-layout-qa.mjs",
  '  if (!await visible(page, "[data-aw10-session-menu] > summary").count()) failures.push("Session menu trigger is missing");',
  '  if (!await visible(page, \'[data-aw10-session-menu] [data-aw-menu-trigger="session"]\').count()) failures.push("Session menu trigger is missing");',
);
replaceOnce(
  "scripts/run-aw5-correction-layout-qa.mjs",
  '  if (!scenario.direct && !await visible(page, "[data-aw10-exercise-actions] > summary").count()) failures.push("Exercise actions trigger is missing");',
  '  if (!scenario.direct && !await visible(page, \'[data-aw10-exercise-actions] [data-aw-menu-trigger="exercise"]\').count()) failures.push("Exercise actions trigger is missing");',
);
replaceOnce(
  "scripts/run-aw5-correction-layout-qa.mjs",
  'async function openSessionMenu(page) {\n  await visible(page, "[data-aw10-session-menu] > summary").click({ timeout: 10_000 });\n  const menu = visible(page, "[data-aw10-session-menu]");\n  await page.waitForFunction(() => {\n    const element = document.querySelector("[data-aw10-session-menu]");\n    return element instanceof HTMLDetailsElement && element.open;\n  }, undefined, { timeout: 5_000 });\n  return menu;\n}',
  'async function openSessionMenu(page) {\n  await visible(page, \'[data-aw10-session-menu] [data-aw-menu-trigger="session"]\').click({ timeout: 10_000 });\n  const menu = visible(page, "[data-aw10-session-menu]");\n  await page.waitForFunction(() => document.querySelector("[data-aw10-session-menu]")?.getAttribute("data-state") === "open", undefined, { timeout: 5_000 });\n  return menu;\n}',
);
replaceOnce(
  "scripts/run-aw5-correction-layout-qa.mjs",
  '  } else if (scenario.action === "details") {\n    await visible(page, "[data-aw10-exercise-details-trigger]").click();\n    await visible(page, "[data-active-set-details-dialog]").waitFor({ state: "visible", timeout: 10_000 });\n    if (!await visible(page, "[data-aw6-details-overview]").count()) failures.push("Exercise Name did not open Exercise Overview");',
  '  } else if (scenario.action === "details") {\n    await visible(page, "[data-aw10-exercise-details-trigger]").click();\n    await page.waitForURL((url) => url.pathname === `/workouts/${activityId}` && url.searchParams.get("returnTo") === dayRoute, { timeout: 15_000 });\n    if (page.url().includes("/workouts/session/")) failures.push("Exercise Name did not leave Active Workout for canonical Exercise Detail");',
);
replaceOnce(
  "scripts/run-aw5-correction-layout-qa.mjs",
  '  } else if (scenario.action === "exercise-actions") {\n    await visible(page, "[data-aw10-exercise-actions] > summary").click();\n    const menu = visible(page, "[data-aw10-exercise-actions]");',
  '  } else if (scenario.action === "exercise-actions") {\n    await visible(page, \'[data-aw10-exercise-actions] [data-aw-menu-trigger="exercise"]\').click();\n    await page.waitForFunction(() => document.querySelector("[data-aw10-exercise-actions]")?.getAttribute("data-state") === "open", undefined, { timeout: 5_000 });\n    const menu = visible(page, "[data-aw10-exercise-actions]");',
);
replaceOnce(
  "scripts/run-aw5-correction-layout-qa.mjs",
  'import {\n  baseUrl,\n  contract,',
  'import {\n  activityId,\n  baseUrl,\n  contract,',
);

replaceOnce(
  "scripts/train-mock-fixture-contract.test.mjs",
  '    "390x844",',
  '    "360x800",\n    "390x844",',
);

console.log("Applied Active Workout rendered contract repair.");
