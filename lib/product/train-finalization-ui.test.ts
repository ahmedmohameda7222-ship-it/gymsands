import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Train finalization UI contracts", () => {
  it("redirects every obsolete workout editor to the one canonical plan editor", () => {
    const day = source("app/(private)/my-workout/day/[dayId]/page.tsx");
    const picker = source("app/(private)/my-workout/day/[dayId]/add-exercise/page.tsx");
    const today = source("app/(private)/today-workout/page.tsx");

    for (const route of [day, picker]) {
      expect(route).toContain("getUserWorkoutPlanDay");
      expect(route).toContain("router.replace(`/my-workout/plans/${day.plan_id}/edit?day=${encodeURIComponent(day.id)}");
    }
    expect(picker).toContain("&picker=exercise");
    expect(today).toContain('redirect("/my-workout/plans")');
  });

  it("uses authorized route-scoped Plaivra ChatGPT surfaces and contains no external ChatGPT homepage link", () => {
    const overview = source("components/workouts/my-workout-plans.tsx");
    const detail = source("components/workouts/workout-plan-detail.tsx");
    const context = source("lib/workouts/train-overview-runtime.ts");

    expect(overview).toContain("useQuickChatGpt");
    expect(overview).toContain("setDashboardContext(trainPromptContext)");
    expect(overview).toContain("openPrompts(promptId)");
    expect(overview).toContain('openTrainPrompts("create-workout-plan")');
    expect(context).toContain("buildTrainQuickPromptContext");
    expect(context).toContain('route: TRAIN_ROUTE');
    expect(context).toContain("selection: { exercise: null, meal: null, plannedMeal: null }");
    expect(detail).toContain("<WorkoutAiActionPanel");
    expect(detail).toContain("selected_day: selectedDay");
    expect(detail).toContain('allowedActions.includes("adjust")');
    expect(`${overview}\n${detail}`).not.toContain("https://chatgpt.com");
  });

  it("keeps Today contextual, prioritizes an open session, and renders a compact selectable seven-day week", () => {
    const overview = source("components/workouts/my-workout-plans.tsx");
    expect(overview).toContain('activePlan?.days.find((day) => day.weekday === todayWeekday');
    expect(overview).not.toContain("activeDays[0]");
    expect(overview).toContain("findOpenSessionPlanContext(visiblePlans, visibleOpenSession)");
    expect(overview).toContain("visibleOpenSession ? openPlanContext.plan : activePlan");
    expect(overview).toContain("openSessionId: visibleOpenSession?.id ?? null");
    expect(overview).toContain('resolution.state === "active" ? tr("resumeWorkout")');
    expect(overview).toContain('resolution.state === "completed" ? tr("viewCompletedWorkout")');
    expect(overview).toContain('tr("startWorkout")');
    expect(overview).toContain("grid-flow-col");
    expect(overview).toContain("overflow-x-auto");
    expect(overview).toContain("lg:grid-cols-7");
    expect(overview).toContain("buildCurrentWeek(weekStartsOn, new Date(`${today}T12:00:00`))");
    expect(overview).toContain("resolveTrainWeekSelection");
  });

  it("shows a full seven-day read-only plan and restricts archived plans through the action policy", () => {
    const detail = source("components/workouts/workout-plan-detail.tsx");
    const editorRoute = source("app/(private)/my-workout/plans/[planId]/edit/page.tsx");
    expect(detail).toContain("weekdays.map((weekday, index)");
    expect(detail).toContain("weekdays[new Date().getDay()]");
    expect(detail).toContain('day?.day_name ?? tr("restDay")');
    expect(detail).toContain("workoutPlanDetailActions(plan)");
    expect(detail).toContain('allowedActions.includes("edit")');
    expect(detail).toContain('allowedActions.includes("adjust")');
    expect(detail).toContain('archived ? tr("archived") : tr("reviewOnly")');
    expect(detail).toContain('tr("archivedMessage")');
    expect(editorRoute).toContain("archivedPlanEditorRedirect(plan)");
    expect(editorRoute).toContain("router.replace(redirect)");
    expect(detail).not.toContain("Add Day");
  });

  it("uses localized direction, weekdays, statuses, and exercise metadata on overview and detail", () => {
    const overview = source("components/workouts/my-workout-plans.tsx");
    const detail = source("components/workouts/workout-plan-detail.tsx");
    for (const route of [overview, detail]) {
      expect(route).toContain("useTrainTranslation");
      expect(route).toContain("dir={dir}");
      expect(route).toContain("Intl.DateTimeFormat(locale");
    }
    expect(overview).toContain('tr("inProgress")');
    expect(overview).toContain('tr("completed")');
    expect(overview).toContain('tr("scheduled")');
    expect(detail).toContain('tr("general")');
    expect(detail).toContain('tr("noEquipment")');
    expect(detail).toContain('tr("setsReps"');
    expect(detail).toContain('tr("secondsRest"');
    expect(detail).not.toMatch(/\|\| "General"|\|\| "No equipment"|\} sets|\} reps|\}s rest/);
  });

  it("keeps one canonical full-plan draft with picker-first empty days and atomic save states", () => {
    const editor = source("components/workouts/workout-plan-editor.tsx");
    expect(editor).toContain('searchParams.get("picker") === "exercise"');
    expect(editor).toContain("workout-plan-draft");
    expect(editor).toContain("readStoredJson<StoredEditorDraft>");
    expect(editor).toContain("storeJson(draftKey");
    expect(editor).toContain("useUnsavedChangesGuard");
    expect(editor).toContain("saveWorkoutPlan(user.id, draft.id, toSavePlan(draft), draftBaseUpdatedAt)");
    expect(editor).toContain("clearStoredValue(draftKey)");
    expect(editor).toContain('setSaveState("failed")');
    expect(editor).toContain("exercises: []");
    expect(editor).toContain("<ExercisePickerDialog");
    expect(editor).toContain('tr("noExercisesYet")');
    expect(editor).toContain('tr("equipment")');
    expect(editor).toContain('tr("notes")');
    expect(editor).toContain("lg:grid-cols-[280px_minmax(0,1fr)]");
    expect(editor).toContain("overflow-x-auto pb-2 lg:flex-col lg:overflow-visible");
    expect(editor).not.toMatch(/exercises:\s*\[\s*\{\s*exercise_name:\s*["']{2}/);
  });

  it("uses exactly three manual-builder stages and reviews final prescription values before one save", () => {
    const builder = source("components/workouts/workout-plan-builder.tsx");
    expect(builder).toContain('const [step, setStep] = useState(1)');
    expect(builder).toContain('[tr("planDetailsStep"), tr("trainingDaysStep"), tr("reviewStep")]');
    expect(builder).toContain("step === 1");
    expect(builder).toContain("step === 2");
    expect(builder).toContain("step === 3");
    expect(builder).toContain("patchExercise(activeDayIndex, index");
    expect(builder).toContain("moveExercise(index");
    expect(builder).toContain("removeExercise(index)");
    expect(builder).toContain("exercise.sets");
    expect(builder).toContain("exercise.reps");
    expect(builder).toContain("exercise.rest_seconds");
    expect(builder).toContain("<ExercisePickerDialog");
    expect(builder).toContain("createUserWorkoutPlan({");
    expect(builder).toContain("clearStoredValue(draftKey)");
    expect(builder.indexOf("clearStoredValue(draftKey)")).toBeGreaterThan(builder.indexOf("await createUserWorkoutPlan({"));
    expect(builder).toContain("useUnsavedChangesGuard");
    expect(builder).toContain('tr("planCreateDraftPreserved")');
    expect(builder).toContain('draft.sessionMinutes ? <Badge');
    expect(builder).toContain('tr("savePlan")');
  });

  it("shares a responsive multi-select picker that prevents duplicates and keeps confirmation reachable", () => {
    const editor = source("components/workouts/workout-plan-editor.tsx");
    const builder = source("components/workouts/workout-plan-builder.tsx");
    const picker = source("components/workouts/exercise-picker-dialog.tsx");
    expect(editor).toContain("<ExercisePickerDialog");
    expect(builder).toContain("<ExercisePickerDialog");
    expect(picker).toContain('layout="responsive-drawer"');
    expect(picker).toContain("const [selected, setSelected] = useState<Map<string, Workout>>(new Map())");
    expect(picker).toContain("if (existing.has(key)) return");
    expect(picker).toContain("aria-pressed={isSelected}");
    expect(picker).toContain("setSelected(new Map())");
    expect(picker).toContain("absolute inset-x-0 bottom-0");
    expect(picker).toContain("pb-[calc(env(safe-area-inset-bottom)+1rem)]");
    expect(picker).toContain("onAdd(Array.from(selected.values()))");
    expect(picker).toContain('tr("moreFilters")');
    expect(picker).toContain("getWorkoutFilterOptions");
    expect(picker).toContain("secondaryMuscles:");
    expect(picker).toContain("forceTypes:");
    expect(picker).toContain("exerciseTypes:");
    expect(picker).toContain("mechanics:");
    for (const label of ["primaryMuscle", "equipment", "difficulty", "muscleCategory", "secondaryMuscle", "forceType", "exerciseType", "mechanics"]) {
      expect(picker).toContain(`aria-label={tr("${label}")}`);
    }
    expect(picker).toContain("const guideUrl =");
    expect(picker).toContain('guideUrl ? <Button asChild');
    expect(picker).toContain('tr("viewGuide")');
  });

  it("keeps populated Train fixtures behind the explicit mock-auth development gate", () => {
    const loader = source("services/database/workout-plan-loader.ts");
    const fixture = source("lib/fixtures/train-mock.ts");
    expect(loader).toContain('env.useMockAuth && userId === "mock-user"');
    expect(loader).toContain("getMockTrainPlans");
    expect(fixture).toContain('active: "10000000-0000-4000-8000-000000000001"');
    expect(fixture).toContain('inactive: "10000000-0000-4000-8000-000000000002"');
    expect(fixture).toContain('archived: "10000000-0000-4000-8000-000000000003"');
  });
});
