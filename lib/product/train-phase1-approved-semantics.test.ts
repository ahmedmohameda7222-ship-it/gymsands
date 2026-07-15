import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getTrainLocaleMetadata, translateTrain } from "@/lib/i18n/train";
import { buildTrainWeek } from "@/lib/workouts/train-week";

const source = (path: string) => readFileSync(path, "utf8");

describe("approved Train Phase 1 semantic contracts", () => {
  it("keeps Activity Catalog configuration server-only and validates external modes fail-closed", () => {
    const example = source(".env.example");
    const environment = source("lib/integrations/env.ts");
    const validator = source("scripts/validate-production-env.mjs");
    const combined = `${example}\n${environment}\n${validator}`;
    for (const key of [
      "PLAIVRA_ACTIVITY_CATALOG_MODE",
      "PLAIVRA_ACTIVITY_CATALOG_BASE_URL",
      "PLAIVRA_ACTIVITY_CATALOG_API_KEY",
    ]) {
      expect(combined).toContain(key);
      expect(combined).not.toContain(`NEXT_PUBLIC_${key}`);
    }
    expect(validator).toContain('["legacy", "external", "external_with_legacy_fallback"]');
    expect(validator).toContain('validHttpsUrl(environment.PLAIVRA_ACTIVITY_CATALOG_BASE_URL)');
    expect(validator).toContain('nonEmpty(environment.PLAIVRA_ACTIVITY_CATALOG_API_KEY, 20)');
  });

  it("builds exactly one user-local week from the configured Monday or Sunday boundary", () => {
    const wednesday = new Date(2026, 6, 15, 12, 0, 0);
    const mondayWeek = buildTrainWeek("monday", wednesday);
    const sundayWeek = buildTrainWeek("sunday", wednesday);

    expect(mondayWeek).toHaveLength(7);
    expect(mondayWeek.map((day) => day.iso)).toEqual([
      "2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16", "2026-07-17", "2026-07-18", "2026-07-19",
    ]);
    expect(mondayWeek.map((day) => day.weekday)).toEqual([
      "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
    ]);
    expect(sundayWeek[0]).toMatchObject({ iso: "2026-07-12", weekday: "Sunday" });
    expect(new Set(sundayWeek.map((day) => day.iso))).toHaveLength(7);
  });

  it("keeps Today and Selected as independent, non-color-only tab semantics", () => {
    const weekSelector = source("components/workouts/train-week-selector.tsx");
    expect(weekSelector).toContain('role="tablist"');
    expect(weekSelector).toContain('role="tab"');
    expect(weekSelector).toContain("aria-selected={selected}");
    expect(weekSelector).toContain('aria-current={item.isToday ? "date" : undefined}');
    expect(weekSelector).toContain("todayLabel");
    expect(weekSelector).toContain("selectedLabel");
    expect(weekSelector).toContain("data-week-state={item.status}");
  });

  it("uses a connected three-step progress model and omits Back entirely on step one", () => {
    const builder = source("components/workouts/workout-plan-builder.tsx");
    expect(builder).toContain('<ol className="mx-auto grid min-h-14');
    expect(builder).toContain('aria-label={tr("builderProgress")}');
    expect(builder).toContain('[tr("planDetailsStep"), tr("trainingDaysStep"), tr("reviewStep")]');
    expect(builder).toContain('aria-current={active ? "step" : undefined}');
    expect(builder).toContain('data-step-state={complete ? "complete" : active ? "current" : "upcoming"}');
    expect(builder).toContain('step > 1 ? <Button variant="outline"');
    expect(builder).not.toMatch(/step\s*===\s*1[\s\S]{0,160}disabled/);
    expect(builder).toContain('<TrainStickyFooter className="max-w-[1120px]">');
    expect(builder).toContain('tr("stepOf", { step, total: 3 })');
  });

  it("keeps picker selection truthful, keyboard-focus-safe, and reachable above mobile safe areas", () => {
    const picker = source("components/workouts/exercise-picker-dialog.tsx");
    expect(picker).toContain('layout="responsive-drawer"');
    expect(picker).toContain("h-dvh max-h-dvh w-screen");
    expect(picker).toContain("lg:w-[min(54rem,100vw)]");
    expect(picker).toContain("onCloseAutoFocus");
    expect(picker).toContain("returnTarget.focus()");
    expect(picker).toContain("aria-pressed={isSelected}");
    expect(picker).toContain("disabled={duplicate}");
    expect(picker).toContain('tr("alreadyAdded")');
    expect(picker).toContain("env(safe-area-inset-bottom)");
    expect(picker).toContain('className="absolute inset-x-0 bottom-0 z-30');
    expect(picker).toContain("data-picker-footer");
  });

  it("uses the official local OpenAI brand component and no generic AI glyph on Train launch actions", () => {
    const trainUi = source("components/workouts/train-ui.tsx");
    const overview = source("components/workouts/my-workout-plans.tsx");
    expect(trainUi).toContain('import { OpenAiBlossom } from "@/components/brand/openai-blossom"');
    expect(trainUi).toContain("<OpenAiBlossom");
    expect(overview).toContain("<OpenAiActionContent>");
    expect(overview).toContain("<OpenAiActionContent primary>");
    expect(`${trainUi}\n${overview}`).not.toMatch(/\b(Sparkles|Bot|Wand|MessageCircle)\b/);
  });

  it("hides the normal app shell on session routes while keeping the shared bottom stack elsewhere", () => {
    const shell = source("components/layout/app-shell.tsx");
    const sessionBranch = shell.slice(shell.indexOf("if (isWorkoutSessionRoute)"), shell.indexOf('data-app-shell'));
    expect(shell).toContain('pathname.startsWith("/workouts/session")');
    expect(sessionBranch).toContain('<main id="main-content" className="min-h-dvh">{children}</main>');
    expect(sessionBranch).not.toContain("MobileFloatingNav");
    expect(sessionBranch).not.toContain("ActiveWorkoutIndicator");
    expect(shell).toContain("<ActiveWorkoutIndicator />");
    expect(shell).toContain("<MobileFloatingNav pathname={pathname} />");
  });

  it("keeps skipped legacy history and stable catalog identity across localized exercise names", () => {
    const sessions = source("services/database/workout-sessions.ts");
    const detail = source("app/(private)/workouts/[id]/page.tsx");
    expect(sessions).toContain('.in("status", ["completed", "skipped"])');
    expect(sessions).toContain('session.status === "completed" || session.status === "skipped"');
    expect(sessions).toContain('from("user_workout_plan_exercises")');
    expect(sessions).toContain("source_workout_id: log.plan_exercise_id");
    expect(detail).toContain("if (log.source_workout_id) return log.source_workout_id === workout.id");
    expect(detail).toContain("if (session.workout_id) return session.workout_id === workout.id");
    expect(detail).toContain("normalizeExerciseName(log.exercise_name) === target");
  });

  it("starts local workouts by FK and keeps external direct starts fail-closed", () => {
    const sessions = source("services/database/workout-sessions.ts");
    const directStart = sessions.slice(sessions.indexOf("export async function getOrStartWorkoutSession"), sessions.indexOf("export async function cancelWorkoutSession"));
    expect(sessions).toContain('from("workouts")');
    expect(sessions).toContain("const workoutId = resolvedWorkoutId === undefined ? await persistedLegacyWorkoutId(workout.id) : resolvedWorkoutId");
    expect(sessions).toContain("workout_id: workoutId");
    expect(directStart).toContain('.eq("user_id", userId)');
    expect(directStart).toContain('.eq("status", "started")');
    expect(directStart).toContain('.eq("workout_id", workoutId)');
    expect(directStart).toContain('if (workout.catalog_source === "custom")');
    expect(directStart).toContain("An open direct workout session already exists");
    expect(directStart).toContain("directSessionStartPromises");
  });

  it("resumes null-FK external sessions only by owner-scoped direct session ID", () => {
    const sessions = source("services/database/workout-sessions.ts");
    const form = source("components/workouts/workout-session-form.tsx");
    const active = source("components/workouts/active-workout-indicator.tsx");
    const functionStart = sessions.indexOf("export async function getOrStartWorkoutSession");
    const candidateStart = sessions.indexOf("if (candidateSessionId && isUuid(candidateSessionId))", functionStart);
    const localBranch = sessions.indexOf("if (workoutId)", candidateStart);
    const customBranch = sessions.indexOf('if (workout.catalog_source === "custom")', localBranch);
    const unresolvedBranch = sessions.indexOf("const { data: unresolved", customBranch);
    expect(candidateStart).toBeGreaterThan(functionStart);
    expect(localBranch).toBeGreaterThan(candidateStart);
    expect(customBranch).toBeGreaterThan(localBranch);
    expect(unresolvedBranch).toBeGreaterThan(customBranch);
    const candidateBlock = sessions.slice(candidateStart, localBranch);
    expect(candidateBlock).toContain('.eq("id", candidateSessionId)');
    expect(candidateBlock).toContain('.eq("user_id", userId)');
    expect(candidateBlock).toContain('.eq("status", "started")');
    expect(candidateBlock).toContain('.is("plan_day_id", null)');
    expect(candidateBlock).not.toContain("workout.name");
    const customBlock = sessions.slice(customBranch, unresolvedBranch);
    expect(customBlock).toContain('.eq("workout_name", workout.name)');
    expect(form).toContain("storedActiveWorkout.route === sessionRoute");
    expect(form).toContain("getOrStartWorkoutSession(user.id, workout, candidateSessionId)");
    expect(active).toContain("getOpenWorkoutSessionWithStatus(userId, null, candidateSessionId)");
    expect(active).toContain("stored?.sessionId === open.id && isValidActiveWorkoutRoute(stored.route)");
  });

  it.each(["en", "de", "ar"] as const)("localizes builder, picker, save, and state semantics for %s", (language) => {
    const keys = [
      "planDetailsStep", "trainingDaysStep", "reviewStep", "stepOf", "back", "continue", "savePlan",
      "todayLabel", "selectedDay", "complete", "incomplete", "alreadyAdded", "addNExercises",
      "unsavedChanges", "saving", "saved", "saveFailed",
    ] as const;
    for (const key of keys) {
      const value = translateTrain(language, key, { step: 1, total: 3, count: 2 });
      expect(value.trim(), `${language}:${key}`).not.toBe("");
      expect(value, `${language}:${key}`).not.toMatch(/\{\w+\}/);
    }
    expect(getTrainLocaleMetadata(language).dir).toBe(language === "ar" ? "rtl" : "ltr");
  });
});