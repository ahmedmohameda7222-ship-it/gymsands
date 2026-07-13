from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one match in {path}, found {count}: {old[:140]!r}")
    write(path, content.replace(old, new, 1))


# Shared app-shell bottom-stack contract.
replace_once(
    "components/layout/app-shell.tsx",
    'import { useEffect, useState, type ComponentType, type ReactNode } from "react";',
    'import { useEffect, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";'
)
replace_once(
    "components/layout/app-shell.tsx",
    'const adminItems: NavItem[] = [\n  { href: "/admin", labelKey: "settings.accountSession", icon: Shield }\n];',
    '''const adminItems: NavItem[] = [
  { href: "/admin", labelKey: "settings.accountSession", icon: Shield }
];

const appShellBottomLayout = {
  "--mobile-nav-height": "4.5rem",
  "--mobile-nav-bottom-offset": "0.75rem",
  "--active-workout-controller-gap": "0.5rem",
  "--active-workout-controller-bottom": "calc(env(safe-area-inset-bottom) + var(--mobile-nav-bottom-offset) + var(--mobile-nav-height) + var(--active-workout-controller-gap))",
  "--app-bottom-overlay-stack": "calc(var(--active-workout-controller-bottom) + var(--active-workout-controller-height, 0px))",
  "--app-bottom-reserved-space": "calc(var(--app-bottom-overlay-stack) + 2rem)",
  "--train-sticky-footer-bottom": "calc(var(--app-bottom-overlay-stack) + 0.5rem)"
} as CSSProperties;'''
)
replace_once(
    "components/layout/app-shell.tsx",
    '<div className="premium-page-bg min-h-screen text-foreground">',
    '<div className="premium-page-bg min-h-screen text-foreground" data-app-shell style={appShellBottomLayout}>'
)
replace_once(
    "components/layout/app-shell.tsx",
    '<main id="main-content" className="pb-[calc(env(safe-area-inset-bottom)+8rem)] lg:ml-72 lg:pb-0">',
    '<main id="main-content" className="pb-[var(--app-bottom-reserved-space)] lg:ml-72 lg:pb-0">'
)

replace_once(
    "components/layout/mobile-floating-nav.tsx",
    '<div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-[80] lg:hidden" dir={dir}>',
    '<div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+var(--mobile-nav-bottom-offset))] z-[80] lg:hidden" dir={dir} data-mobile-floating-nav>'
)
replace_once(
    "components/layout/mobile-floating-nav.tsx",
    '<nav className="relative grid h-[72px] grid-cols-5 items-stretch rounded-[24px]',
    '<nav className="relative grid h-[var(--mobile-nav-height)] grid-cols-5 items-stretch rounded-[24px]'
)

# Active controller reports its actual rendered height to the shell.
replace_once(
    "components/workouts/active-workout-indicator.tsx",
    'import { useCallback, useEffect, useState } from "react";',
    'import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";'
)
replace_once(
    "components/workouts/active-workout-indicator.tsx",
    '  const [loadError, setLoadError] = useState("");',
    '  const [loadError, setLoadError] = useState("");\n  const controllerRef = useRef<HTMLDivElement>(null);'
)
replace_once(
    "components/workouts/active-workout-indicator.tsx",
    '''  useEffect(() => {
    if (!state) return;
    const tick = () => setElapsed(activeWorkoutElapsed(state));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [state]);

  async function togglePause() {''',
    '''  useEffect(() => {
    if (!state) return;
    const tick = () => setElapsed(activeWorkoutElapsed(state));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [state]);

  const controllerVisible = Boolean(loadError || (session && state)) && !pathname.startsWith("/workouts/session");

  useLayoutEffect(() => {
    const shell = document.querySelector<HTMLElement>("[data-app-shell]");
    if (!shell) return;

    const updateHeight = () => {
      const height = controllerVisible && controllerRef.current
        ? Math.ceil(controllerRef.current.getBoundingClientRect().height)
        : 0;
      shell.style.setProperty("--active-workout-controller-height", `${height}px`);
      shell.dataset.activeWorkoutController = height > 0 ? "present" : "absent";
    };

    updateHeight();
    const observer = typeof ResizeObserver === "undefined" || !controllerRef.current
      ? null
      : new ResizeObserver(updateHeight);
    if (observer && controllerRef.current) observer.observe(controllerRef.current);
    window.addEventListener("resize", updateHeight);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateHeight);
      shell.style.removeProperty("--active-workout-controller-height");
      shell.dataset.activeWorkoutController = "absent";
    };
  }, [actionError, controllerVisible, loadError, pathname, state?.label, state?.paused]);

  async function togglePause() {'''
)
replace_once(
    "components/workouts/active-workout-indicator.tsx",
    '  if (((!session || !state) && !loadError) || pathname.startsWith("/workouts/session")) return dialog;',
    '  if (!controllerVisible) return dialog;'
)
replace_once(
    "components/workouts/active-workout-indicator.tsx",
    '<div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] z-[70] mx-auto max-w-2xl rounded-[18px] border border-primary/25 bg-card/95 p-3 shadow-xl backdrop-blur lg:inset-x-auto lg:bottom-5 lg:right-5 lg:w-[34rem]">',
    '<div ref={controllerRef} data-active-workout-controller className="fixed inset-x-3 bottom-[var(--active-workout-controller-bottom)] z-[70] mx-auto max-w-2xl rounded-[18px] border border-primary/25 bg-card/95 p-3 shadow-xl backdrop-blur lg:inset-x-auto lg:bottom-5 lg:right-5 lg:w-[34rem]">'
)

# Builder/editor footers join the same stack instead of independently using bottom: 0.
replace_once(
    "components/workouts/workout-plan-builder.tsx",
    '<div className="space-y-6 pb-28" dir={dir} data-train-builder>',
    '<div className="space-y-6" dir={dir} data-train-builder>'
)
replace_once(
    "components/workouts/workout-plan-builder.tsx",
    '<div className="sticky bottom-0 z-20 -mx-4 border-t bg-background/95 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur sm:static sm:mx-auto sm:flex sm:w-full sm:max-w-5xl sm:items-center sm:justify-between sm:rounded-2xl sm:border sm:px-4 sm:pb-3">',
    '<div className="sticky bottom-[var(--train-sticky-footer-bottom)] z-20 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-auto sm:flex sm:w-full sm:max-w-5xl sm:items-center sm:justify-between sm:rounded-2xl sm:border sm:px-4" data-train-sticky-footer>'
)
replace_once(
    "components/workouts/workout-plan-editor.tsx",
    '<div className="space-y-6 pb-32" dir={dir} data-train-editor>',
    '<div className="space-y-6" dir={dir} data-train-editor>'
)
replace_once(
    "components/workouts/workout-plan-editor.tsx",
    '<div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-3 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur sm:static sm:rounded-2xl sm:border">',
    '<div className="fixed inset-x-0 bottom-[var(--train-sticky-footer-bottom)] z-30 border-t bg-background/95 px-3 py-3 backdrop-blur sm:static sm:rounded-2xl sm:border" data-train-sticky-footer>'
)

# Strict rest-day action predicate and compact restored action.
replace_once(
    "lib/workouts/train-visual.ts",
    '''export function mergeUserFacingExerciseNote(original: string | null | undefined, nextUserText: string) {
  const hiddenLines = noteLines(original).filter(isInternalExerciseNoteLine);
  const visibleLines = noteLines(nextUserText).filter((line) => !isInternalExerciseNoteLine(line));
  return [...hiddenLines, ...visibleLines].join("\\n") || null;
}
''',
    '''export function mergeUserFacingExerciseNote(original: string | null | undefined, nextUserText: string) {
  const hiddenLines = noteLines(original).filter(isInternalExerciseNoteLine);
  const visibleLines = noteLines(nextUserText).filter((line) => !isInternalExerciseNoteLine(line));
  return [...hiddenLines, ...visibleLines].join("\\n") || null;
}

export function shouldShowRestDayPlanAction(input: {
  resolutionState: "none" | "scheduled" | "active" | "completed" | "skipped";
  hasOpenSession: boolean;
  hasWorkoutDay: boolean;
  hasPlan: boolean;
  statusState: "idle" | "loading" | "loaded" | "failed";
  statusError: string | null;
}) {
  return input.resolutionState === "none"
    && !input.hasOpenSession
    && !input.hasWorkoutDay
    && input.hasPlan
    && input.statusState === "loaded"
    && !input.statusError;
}
'''
)
replace_once(
    "components/workouts/my-workout-plans.tsx",
    'import { resolveTrainWeekSelection, startTrainLocalDateRefresh } from "@/lib/workouts/train-local-date";',
    'import { resolveTrainWeekSelection, startTrainLocalDateRefresh } from "@/lib/workouts/train-local-date";\nimport { shouldShowRestDayPlanAction } from "@/lib/workouts/train-visual";'
)
replace_once(
    "components/workouts/my-workout-plans.tsx",
    '''  const showActiveAction = active && Boolean(actionHref);
  const showWorkoutAction = showActiveAction || (statusState !== "loading" && !statusError && Boolean(actionHref));''',
    '''  const showActiveAction = active && Boolean(actionHref);
  const showWorkoutAction = showActiveAction || (statusState !== "loading" && !statusError && Boolean(actionHref));
  const showRestDayPlanAction = shouldShowRestDayPlanAction({
    resolutionState: resolution.state,
    hasOpenSession: Boolean(openSession),
    hasWorkoutDay: Boolean(day),
    hasPlan: Boolean(plan),
    statusState,
    statusError
  });'''
)
replace_once(
    "components/workouts/my-workout-plans.tsx",
    '''            {statusState !== "loading" && !statusError && !actionHref ? <div className="text-center"><Dumbbell className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 text-sm font-semibold">{tr("restDay")}</p></div> : null}''',
    '''            {showRestDayPlanAction ? (
              <div className="space-y-3 text-center" data-rest-day-weekly-plan>
                <div><Dumbbell className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 text-sm font-semibold">{tr("restDay")}</p>{subtitle ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{subtitle}</p> : null}</div>
                <Button asChild variant="outline" className="min-h-12 w-full"><Link href={`/my-workout/plans/${plan!.id}`}>{tr("viewWeeklyPlan")}</Link></Button>
              </div>
            ) : null}
            {statusState !== "loading" && !statusError && !actionHref && !showRestDayPlanAction ? <div className="text-center"><Dumbbell className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 text-sm font-semibold">{tr("restDay")}</p></div> : null}'''
)

# Mock-only deterministic scenarios for rendered QA.
replace_once(
    "lib/fixtures/train-mock.ts",
    '''const planIds = {
  active: "10000000-0000-4000-8000-000000000001",
  inactive: "10000000-0000-4000-8000-000000000002",
  archived: "10000000-0000-4000-8000-000000000003"
};''',
    '''const planIds = {
  active: "10000000-0000-4000-8000-000000000001",
  inactive: "10000000-0000-4000-8000-000000000002",
  archived: "10000000-0000-4000-8000-000000000003"
};

export type MockTrainScenario = "active" | "scheduled" | "rest";

export function getMockTrainScenario(): MockTrainScenario {
  if (typeof window === "undefined") return "active";
  const value = window.localStorage.getItem("plaivra.qa.train-scenario");
  return value === "scheduled" || value === "rest" ? value : "active";
}'''
)
replace_once(
    "lib/fixtures/train-mock.ts",
    '''export function getMockTrainPlans(): UserWorkoutPlan[] {
  const todayIndex = new Date().getDay();''',
    '''export function getMockTrainPlans(): UserWorkoutPlan[] {
  const scenario = getMockTrainScenario();
  const todayIndex = new Date().getDay();
  const activeOffsets = scenario === "rest" ? [1, 3, 5] : [0, 2, 4];'''
)
replace_once(
    "lib/fixtures/train-mock.ts",
    '''    day(planIds.active, "11", 1, weekdays[todayIndex], "Strength A", [["Back Squat", "Legs", "Barbell"], ["Bench Press", "Chest", "Barbell"], ["Row", "Back", "Cable"], ["Plank", "Core", "Bodyweight"]]),
    day(planIds.active, "12", 2, weekdays[(todayIndex + 2) % 7], "Strength B", [["Deadlift", "Back", "Barbell"], ["Overhead Press", "Shoulders", "Dumbbells"], ["Pulldown", "Back", "Cable"]]),
    day(planIds.active, "13", 3, weekdays[(todayIndex + 4) % 7], "Strength C", [["Split Squat", "Legs", "Dumbbells"], ["Incline Press", "Chest", "Dumbbells"], ["Face Pull", "Shoulders", "Cable"]])''',
    '''    day(planIds.active, "11", 1, weekdays[(todayIndex + activeOffsets[0]) % 7], "Strength A", [["Back Squat", "Legs", "Barbell"], ["Bench Press", "Chest", "Barbell"], ["Row", "Back", "Cable"], ["Plank", "Core", "Bodyweight"]]),
    day(planIds.active, "12", 2, weekdays[(todayIndex + activeOffsets[1]) % 7], "Strength B", [["Deadlift", "Back", "Barbell"], ["Overhead Press", "Shoulders", "Dumbbells"], ["Pulldown", "Back", "Cable"]]),
    day(planIds.active, "13", 3, weekdays[(todayIndex + activeOffsets[2]) % 7], "Strength C", [["Split Squat", "Legs", "Dumbbells"], ["Incline Press", "Chest", "Dumbbells"], ["Face Pull", "Shoulders", "Cable"]])'''
)
replace_once(
    "lib/fixtures/train-mock.ts",
    '''export function getMockTrainActivity(): WorkoutSession[] {
  const plans = getMockTrainPlans();
  const todayDay = plans[0].days[0];
  return [
    { id: "20000000-0000-4000-8000-000000000001", user_id: "mock-user", workout_id: null, plan_id: planIds.active, plan_day_id: todayDay.id, workout_day_name: todayDay.day_name, workout_category: "strength", workout_name: todayDay.day_name, started_at: `${todayIso()}T08:00:00.000Z`, completed_at: null, skipped_at: null, duration_minutes: null, notes: null, status: "started" },
    { id: "20000000-0000-4000-8000-000000000002", user_id: "mock-user", workout_id: null, plan_id: planIds.active, plan_day_id: plans[0].days[1].id, workout_day_name: plans[0].days[1].day_name, workout_category: "strength", workout_name: plans[0].days[1].day_name, started_at: `${addDays(todayIso(), -5)}T08:00:00.000Z`, completed_at: `${addDays(todayIso(), -5)}T08:52:00.000Z`, skipped_at: null, duration_minutes: 52, notes: "Completed fixture session", status: "completed" },
    { id: "20000000-0000-4000-8000-000000000003", user_id: "mock-user", workout_id: null, plan_id: planIds.active, plan_day_id: plans[0].days[2].id, workout_day_name: plans[0].days[2].day_name, workout_category: "strength", workout_name: plans[0].days[2].day_name, started_at: `${addDays(todayIso(), -3)}T08:00:00.000Z`, completed_at: null, skipped_at: `${addDays(todayIso(), -3)}T08:05:00.000Z`, duration_minutes: null, notes: "[skipped] Fixture", status: "skipped" }
  ];
}''',
    '''export function getMockTrainActivity(): WorkoutSession[] {
  const scenario = getMockTrainScenario();
  const plans = getMockTrainPlans();
  const todayDay = plans[0].days[0];
  const history: WorkoutSession[] = [
    { id: "20000000-0000-4000-8000-000000000002", user_id: "mock-user", workout_id: null, plan_id: planIds.active, plan_day_id: plans[0].days[1].id, workout_day_name: plans[0].days[1].day_name, workout_category: "strength", workout_name: plans[0].days[1].day_name, started_at: `${addDays(todayIso(), -5)}T08:00:00.000Z`, completed_at: `${addDays(todayIso(), -5)}T08:52:00.000Z`, skipped_at: null, duration_minutes: 52, notes: "Completed fixture session", status: "completed" },
    { id: "20000000-0000-4000-8000-000000000003", user_id: "mock-user", workout_id: null, plan_id: planIds.active, plan_day_id: plans[0].days[2].id, workout_day_name: plans[0].days[2].day_name, workout_category: "strength", workout_name: plans[0].days[2].day_name, started_at: `${addDays(todayIso(), -3)}T08:00:00.000Z`, completed_at: null, skipped_at: `${addDays(todayIso(), -3)}T08:05:00.000Z`, duration_minutes: null, notes: "[skipped] Fixture", status: "skipped" }
  ];
  if (scenario !== "active") return history;
  return [
    { id: "20000000-0000-4000-8000-000000000001", user_id: "mock-user", workout_id: null, plan_id: planIds.active, plan_day_id: todayDay.id, workout_day_name: todayDay.day_name, workout_category: "strength", workout_name: todayDay.day_name, started_at: `${todayIso()}T08:00:00.000Z`, completed_at: null, skipped_at: null, duration_minutes: null, notes: null, status: "started" },
    ...history
  ];
}'''
)

write("lib/workouts/train-visual.test.ts", '''import { describe, expect, test } from "vitest";
import { mergeUserFacingExerciseNote, shouldShowRestDayPlanAction, userFacingExerciseNote } from "@/lib/workouts/train-visual";

describe("Train user-facing exercise notes", () => {
  test("hides the legacy source marker while keeping user notes", () => {
    expect(userFacingExerciseNote("Source: plaivra_legacy_workouts\\nKeep two reps in reserve.")).toBe("Keep two reps in reserve.");
  });
  test("hides bracketed internal source metadata as well", () => {
    expect(userFacingExerciseNote("[source: plaivra_legacy_workouts]\\nControlled tempo.")).toBe("Controlled tempo.");
  });
  test("preserves hidden metadata when the visible note is edited", () => {
    expect(mergeUserFacingExerciseNote("Source: plaivra_legacy_workouts\\nOld note", "New note")).toBe("Source: plaivra_legacy_workouts\\nNew note");
  });
  test("does not allow the internal source marker to be reintroduced as visible text", () => {
    expect(mergeUserFacingExerciseNote(null, "Source: plaivra_legacy_workouts\\nUser note")).toBe("User note");
  });
});

describe("rest-day weekly-plan action", () => {
  const restDay = {
    resolutionState: "none" as const,
    hasOpenSession: false,
    hasWorkoutDay: false,
    hasPlan: true,
    statusState: "loaded" as const,
    statusError: null
  };
  test("shows only for a genuine loaded rest day with an active plan", () => {
    expect(shouldShowRestDayPlanAction(restDay)).toBe(true);
  });
  test.each(["active", "scheduled", "completed", "skipped"] as const)("does not replace the %s action", (resolutionState) => {
    expect(shouldShowRestDayPlanAction({ ...restDay, resolutionState })).toBe(false);
  });
  test("keeps an open session authoritative", () => {
    expect(shouldShowRestDayPlanAction({ ...restDay, hasOpenSession: true })).toBe(false);
  });
  test("does not show without a plan or when plan-day data exists", () => {
    expect(shouldShowRestDayPlanAction({ ...restDay, hasPlan: false })).toBe(false);
    expect(shouldShowRestDayPlanAction({ ...restDay, hasWorkoutDay: true })).toBe(false);
  });
  test("does not show during loading or after an activity failure", () => {
    expect(shouldShowRestDayPlanAction({ ...restDay, statusState: "loading" })).toBe(false);
    expect(shouldShowRestDayPlanAction({ ...restDay, statusState: "failed", statusError: "Unavailable" })).toBe(false);
  });
});
''')

write("lib/product/train-final-visual-corrections.test.ts", '''import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const source = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Train final visual correction contracts", () => {
  test("uses one shell-aware bottom stack", () => {
    const shell = source("components/layout/app-shell.tsx");
    const controller = source("components/workouts/active-workout-indicator.tsx");
    const mobileNav = source("components/layout/mobile-floating-nav.tsx");
    expect(shell).toContain("--app-bottom-reserved-space");
    expect(shell).toContain("--train-sticky-footer-bottom");
    expect(shell).toContain("--active-workout-controller-height, 0px");
    expect(controller).toContain("ResizeObserver");
    expect(controller).toContain("data-active-workout-controller");
    expect(mobileNav).toContain("data-mobile-floating-nav");
  });
  test("builder and editor footers consume the shared offset", () => {
    for (const file of ["components/workouts/workout-plan-builder.tsx", "components/workouts/workout-plan-editor.tsx"]) {
      const content = source(file);
      expect(content).toContain("bottom-[var(--train-sticky-footer-bottom)]");
      expect(content).toContain("data-train-sticky-footer");
      expect(content).not.toContain("sticky bottom-0");
      expect(content).not.toContain("fixed inset-x-0 bottom-0");
    }
  });
  test("rest days expose the localized active-plan route without weakening Today precedence", () => {
    const overview = source("components/workouts/my-workout-plans.tsx");
    const translations = source("lib/i18n/train.ts");
    expect(overview).toContain("shouldShowRestDayPlanAction");
    expect(overview).toContain("data-rest-day-weekly-plan");
    expect(overview).toContain("/my-workout/plans/${plan!.id}");
    expect(translations.match(/viewWeeklyPlan:/g)?.length).toBe(3);
  });
});
''')

write("scripts/run-train-layout-qa.mjs", '''import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
const outputDir = path.join(process.cwd(), "qa-artifacts", "pr53-final");
const activePlanId = "10000000-0000-4000-8000-000000000001";
const viewports = [
  { name: "360x780", width: 360, height: 780 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1440x900", width: 1440, height: 900 }
];
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const observations = [];

function intersects(a, b) {
  if (!a || !b) return false;
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

async function openScenario({ viewport, scenario, language = "en", route, step = null }) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce", colorScheme: "light" });
  await context.addInitScript(({ scenarioValue, languageValue }) => {
    localStorage.setItem("plaivra.qa.train-scenario", scenarioValue);
    localStorage.setItem("plaivra.language.v1", languageValue);
  }, { scenarioValue: scenario, languageValue: language });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForSelector("[data-app-shell]", { timeout: 20_000 });
  if (scenario === "active") await page.waitForSelector("[data-active-workout-controller]", { timeout: 20_000 });
  if (step === 2) {
    await page.waitForSelector('[data-builder-step="details"]', { timeout: 20_000 });
    await page.locator("[data-train-sticky-footer] button").last().click();
    await page.waitForSelector('[data-builder-step="days"]', { timeout: 20_000 });
  }
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(250);
  const metrics = await page.evaluate(() => {
    const visible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const value = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && value.width > 0 && value.height > 0;
    };
    const rect = (element) => {
      if (!visible(element)) return null;
      const value = element.getBoundingClientRect();
      return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height };
    };
    const main = document.querySelector("#main-content");
    const controller = document.querySelector("[data-active-workout-controller]");
    const nav = document.querySelector("[data-mobile-floating-nav]");
    const footer = document.querySelector("[data-train-sticky-footer]");
    const restAction = document.querySelector("[data-rest-day-weekly-plan] a");
    const actions = main ? [...main.querySelectorAll("a,button")].filter((element) => visible(element) && !element.closest("[data-train-sticky-footer]")) : [];
    return {
      controller: rect(controller),
      nav: rect(nav),
      footer: rect(footer),
      lastMainAction: rect(actions.at(-1) ?? null),
      shellState: document.querySelector("[data-app-shell]")?.getAttribute("data-active-workout-controller") ?? null,
      restActionHref: restAction?.getAttribute("href") ?? null,
      direction: document.querySelector("[data-train-today-card]")?.closest("[dir]")?.getAttribute("dir") ?? document.documentElement.dir,
      horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
    };
  });
  const item = {
    viewport: viewport.name,
    scenario,
    language,
    route,
    step,
    status: response?.status() ?? null,
    ...metrics,
    intersections: {
      controllerFooter: intersects(metrics.controller, metrics.footer),
      controllerNav: intersects(metrics.controller, metrics.nav),
      controllerLastMainAction: intersects(metrics.controller, metrics.lastMainAction),
      footerNav: intersects(metrics.footer, metrics.nav)
    },
    pageErrors
  };
  const safeRoute = route.replaceAll("/", "-").replace(/^-/, "") || "root";
  await page.screenshot({ path: path.join(outputDir, `${scenario}-${language}-${viewport.name}-${safeRoute}${step ? `-step${step}` : ""}.png`), fullPage: true });
  await context.close();
  return item;
}

for (const viewport of viewports) {
  observations.push(await openScenario({ viewport, scenario: "active", route: "/my-workout/plans" }));
  observations.push(await openScenario({ viewport, scenario: "active", route: "/my-workout/plans/builder", step: 1 }));
  observations.push(await openScenario({ viewport, scenario: "active", route: "/my-workout/plans/builder", step: 2 }));
  observations.push(await openScenario({ viewport, scenario: "active", route: `/my-workout/plans/${activePlanId}/edit` }));
}
for (const viewport of viewports.filter((item) => ["390x844", "768x1024", "1440x900"].includes(item.name))) {
  observations.push(await openScenario({ viewport, scenario: "scheduled", route: "/my-workout/plans" }));
  observations.push(await openScenario({ viewport, scenario: "scheduled", route: "/my-workout/plans/builder", step: 2 }));
  observations.push(await openScenario({ viewport, scenario: "scheduled", route: `/my-workout/plans/${activePlanId}/edit` }));
}
for (const language of ["en", "de", "ar"]) {
  for (const viewport of viewports.filter((item) => ["390x844", "1440x900"].includes(item.name))) {
    observations.push(await openScenario({ viewport, scenario: "rest", language, route: "/my-workout/plans" }));
  }
}
for (const route of ["/my-workout/plans", "/my-workout/plans/builder", `/my-workout/plans/${activePlanId}/edit`]) {
  observations.push(await openScenario({ viewport: viewports[1], scenario: "active", language: "ar", route, step: route.endsWith("builder") ? 2 : null }));
}
await browser.close();

const failures = observations.filter((item) => {
  const expectedController = item.scenario === "active";
  return item.status !== 200
    || item.pageErrors.length > 0
    || item.horizontalOverflowPx > 1
    || Boolean(item.controller) !== expectedController
    || item.shellState !== (expectedController ? "present" : "absent")
    || item.intersections.controllerFooter
    || item.intersections.controllerNav
    || item.intersections.controllerLastMainAction
    || item.intersections.footerNav
    || (item.scenario === "rest" && item.restActionHref !== `/my-workout/plans/${activePlanId}`)
    || (item.language === "ar" && item.direction !== "rtl");
});
const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  viewports,
  summary: { observations: observations.length, failures: failures.length, passed: failures.length === 0 },
  failures,
  observations
};
await writeFile(path.join(outputDir, "train-layout-qa-results.json"), `${JSON.stringify(report, null, 2)}\\n`, "utf8");
console.log(`Train layout QA: ${observations.length} observations, ${failures.length} failures.`);
if (failures.length) process.exitCode = 1;
''')
