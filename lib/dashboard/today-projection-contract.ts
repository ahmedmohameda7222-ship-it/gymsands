export const TODAY_PROJECTION_CONTRACT_VERSION = 1 as const;

export const TODAY_PROJECTION_ERROR_CODES = [
  "workout_unavailable",
  "meals_unavailable",
  "nutrition_logs_unavailable",
  "nutrition_targets_unavailable",
  "hydration_unavailable",
  "shopping_unavailable",
  "habits_unavailable",
  "supplements_unavailable",
  "sleep_unavailable",
  "profile_context_unavailable",
  "progress_context_unavailable",
] as const;

export type TodayProjectionErrorCode =
  (typeof TODAY_PROJECTION_ERROR_CODES)[number];

export type TodayProjectionEnvelope<T> =
  | { state: "loaded"; value: T; errorCode: null }
  | { state: "failed"; value: null; errorCode: TodayProjectionErrorCode };

export type TodayWorkoutProjection = {
  hasPlan: boolean;
  planId: string | null;
  sessionDurationMinutes: number | null;
  dayId: string | null;
  dayName: string | null;
  exerciseCount: number | null;
  previewExercises: Array<{
    id: string;
    name: string;
    sets: number | null;
    reps: string | number | null;
  }>;
  state: "none" | "scheduled" | "active" | "completed" | "skipped";
  actionHref: string | null;
  activeSessionId: string | null;
  completedSessionId: string | null;
  recentCompletedCount: number | null;
};

export type TodayMealPlanItemProjection = {
  id: string;
  mealType: "Breakfast" | "Lunch" | "Dinner" | "Snack";
  name: string;
  calories: number;
  proteinG: number;
  status: "planned" | "done" | "skipped";
};

export type TodayMealsProjection = {
  items: TodayMealPlanItemProjection[];
  itemCount: number;
  plannedCount: number;
};

export type TodayNutritionLogProjection = {
  totals: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
  foodLogCount: number;
};

export type TodayNutritionTargetProjection = {
  hasTarget: boolean;
  dailyCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterMl: number;
  sourceType:
    | "default_day"
    | "training_day"
    | "rest_day"
    | "high_activity_day"
    | "base"
    | "none";
};

export type TodayHydrationProjection = {
  totalMl: number;
  logCount: number;
};

export type TodayShoppingItemProjection = {
  id: string;
  weekStart: string;
  itemName: string;
  quantity: number | null;
  unit: string | null;
  storeSection: string;
  checked: boolean;
  alreadyHave: boolean;
};

export type TodayShoppingProjection = {
  items: TodayShoppingItemProjection[];
  itemCount: number;
};

export type TodayHabitProjection = {
  plannedCount: number;
  completedCount: number;
  openCount: number;
  openPreviewNames: string[];
};

export type TodaySupplementProjection = {
  plannedCount: number;
  takenCount: number;
  remainingCount: number;
  remainingPreviewNames: string[];
};

export type TodaySleepProjection = {
  hasData: boolean;
  hoursSlept: number | null;
  recoveryLevel: string | null;
  fatigueLevel: string | null;
  poorRecovery: boolean;
};

export type TodayProfileContextProjection = {
  state: "loaded";
  hasGoals: boolean;
  hasTrainingPreferences: boolean;
  hasNutritionPreferences: boolean;
  hasConstraints: boolean;
};

export type TodayProgressContextProjection = {
  state: "loaded";
  entryCount: number;
};

export type TodayPromptSourceState = "loaded" | "failed";

export type TodayPromptContextProjection = {
  workout: {
    state: TodayPromptSourceState;
    hasPlan: boolean | null;
    scheduled: boolean;
    active: boolean;
    completed: boolean;
    skipped: boolean;
    title: string | null;
    exerciseCount: number | null;
    durationMinutes: number | null;
    historyCount: number | null;
  };
  nutrition: {
    targetsState: TodayPromptSourceState;
    foodLogsState: TodayPromptSourceState;
    hasTargets: boolean;
    remainingCalories: number | null;
    remainingProtein: number | null;
    remainingCarbs: number | null;
    remainingFat: number | null;
    foodLogCount: number | null;
    mealPlanCount: number | null;
    plannedMealCount: number | null;
  };
  grocery: {
    state: TodayPromptSourceState;
    itemCount: number | null;
  };
  hydration: {
    state: TodayPromptSourceState;
    hasTarget: boolean;
    logCount: number | null;
    remainingMl: number | null;
  };
  recovery: {
    state: TodayPromptSourceState;
    hasData: boolean;
    sleepHours: number | null;
    poorRecovery: boolean;
  };
  wellness: {
    state: TodayPromptSourceState;
    habitCount: number | null;
    supplementCount: number | null;
  };
  progress: {
    state: TodayPromptSourceState;
    entryCount: number | null;
  };
  profile: {
    state: TodayPromptSourceState;
    hasGoals: boolean;
    hasTrainingPreferences: boolean;
    hasNutritionPreferences: boolean;
    hasConstraints: boolean;
  };
  endOfWeek: boolean;
};

export type TodayProjectionResponseV1 = {
  contractVersion: 1;
  date: string;
  timezone: string;
  generatedAt: string;
  workout: TodayProjectionEnvelope<TodayWorkoutProjection>;
  meals: TodayProjectionEnvelope<TodayMealsProjection>;
  nutrition: {
    logs: TodayProjectionEnvelope<TodayNutritionLogProjection>;
    targets: TodayProjectionEnvelope<TodayNutritionTargetProjection>;
  };
  hydration: TodayProjectionEnvelope<TodayHydrationProjection>;
  shopping: TodayProjectionEnvelope<TodayShoppingProjection>;
  wellness: {
    state: "loaded" | "failed";
    habits: TodayProjectionEnvelope<TodayHabitProjection>;
    supplements: TodayProjectionEnvelope<TodaySupplementProjection>;
    sleep: TodayProjectionEnvelope<TodaySleepProjection>;
  };
  profileContext: TodayProjectionEnvelope<TodayProfileContextProjection>;
  progressContext: TodayProjectionEnvelope<TodayProgressContextProjection>;
  promptContext: TodayPromptContextProjection;
};

export class TodayProjectionContractError extends Error {
  readonly code = "today_projection_invalid";

  constructor() {
    super("Today could not load.");
    this.name = "TodayProjectionContractError";
  }
}

const errorCodes = new Set<string>(TODAY_PROJECTION_ERROR_CODES);
const mealTypes = new Set(["Breakfast", "Lunch", "Dinner", "Snack"]);
const mealStates = new Set(["planned", "done", "skipped"]);
const workoutStates = new Set([
  "none",
  "scheduled",
  "active",
  "completed",
  "skipped",
]);
const targetSources = new Set([
  "default_day",
  "training_day",
  "rest_day",
  "high_activity_day",
  "base",
  "none",
]);

function fail(): never {
  throw new TodayProjectionContractError();
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  if (
    expected.length !== actual.length ||
    expected.some((key, index) => key !== actual[index])
  ) {
    fail();
  }
}

function string(value: unknown): string {
  if (typeof value !== "string") fail();
  return value;
}

function nullableString(value: unknown): string | null {
  if (value === null) return null;
  return string(value);
}

function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail();
  return value;
}

function nonNegative(value: unknown): number {
  const parsed = number(value);
  if (parsed < 0) fail();
  return parsed;
}

function nullableNumber(value: unknown): number | null {
  if (value === null) return null;
  return number(value);
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") fail();
  return value;
}

function oneOf<T extends string>(value: unknown, allowed: Set<string>): T {
  const parsed = string(value);
  if (!allowed.has(parsed)) fail();
  return parsed as T;
}

function stringArray(value: unknown, maximum: number): string[] {
  if (!Array.isArray(value) || value.length > maximum) fail();
  return value.map(string);
}

function envelope<T>(
  value: unknown,
  loaded: (loadedValue: unknown) => T,
): TodayProjectionEnvelope<T> {
  const row = object(value);
  exactKeys(row, ["state", "value", "errorCode"]);
  if (row.state === "loaded") {
    if (row.errorCode !== null) fail();
    return { state: "loaded", value: loaded(row.value), errorCode: null };
  }
  if (row.state === "failed") {
    if (row.value !== null) fail();
    return {
      state: "failed",
      value: null,
      errorCode: oneOf<TodayProjectionErrorCode>(row.errorCode, errorCodes),
    };
  }
  return fail();
}

function parseWorkout(value: unknown): TodayWorkoutProjection {
  const row = object(value);
  exactKeys(row, [
    "hasPlan",
    "planId",
    "sessionDurationMinutes",
    "dayId",
    "dayName",
    "exerciseCount",
    "previewExercises",
    "state",
    "actionHref",
    "activeSessionId",
    "completedSessionId",
    "recentCompletedCount",
  ]);
  if (!Array.isArray(row.previewExercises) || row.previewExercises.length > 3) fail();
  const previewExercises = row.previewExercises.map((entry) => {
    const exercise = object(entry);
    exactKeys(exercise, ["id", "name", "sets", "reps"]);
    const reps = exercise.reps;
    if (reps !== null && typeof reps !== "string" && typeof reps !== "number") fail();
    return {
      id: string(exercise.id),
      name: string(exercise.name),
      sets: nullableNumber(exercise.sets),
      reps: reps as string | number | null,
    };
  });
  return {
    hasPlan: boolean(row.hasPlan),
    planId: nullableString(row.planId),
    sessionDurationMinutes: nullableNumber(row.sessionDurationMinutes),
    dayId: nullableString(row.dayId),
    dayName: nullableString(row.dayName),
    exerciseCount: nullableNumber(row.exerciseCount),
    previewExercises,
    state: oneOf<TodayWorkoutProjection["state"]>(row.state, workoutStates),
    actionHref: nullableString(row.actionHref),
    activeSessionId: nullableString(row.activeSessionId),
    completedSessionId: nullableString(row.completedSessionId),
    recentCompletedCount: nullableNumber(row.recentCompletedCount),
  };
}

function parseMeals(value: unknown): TodayMealsProjection {
  const row = object(value);
  exactKeys(row, ["items", "itemCount", "plannedCount"]);
  if (!Array.isArray(row.items) || row.items.length > 100) fail();
  const items = row.items.map((entry) => {
    const item = object(entry);
    exactKeys(item, ["id", "mealType", "name", "calories", "proteinG", "status"]);
    return {
      id: string(item.id),
      mealType: oneOf<TodayMealPlanItemProjection["mealType"]>(item.mealType, mealTypes),
      name: string(item.name),
      calories: nonNegative(item.calories),
      proteinG: nonNegative(item.proteinG),
      status: oneOf<TodayMealPlanItemProjection["status"]>(item.status, mealStates),
    };
  });
  return {
    items,
    itemCount: nonNegative(row.itemCount),
    plannedCount: nonNegative(row.plannedCount),
  };
}

function parseNutritionLogs(value: unknown): TodayNutritionLogProjection {
  const row = object(value);
  exactKeys(row, ["totals", "foodLogCount"]);
  const totals = object(row.totals);
  exactKeys(totals, ["calories", "proteinG", "carbsG", "fatG"]);
  return {
    totals: {
      calories: nonNegative(totals.calories),
      proteinG: nonNegative(totals.proteinG),
      carbsG: nonNegative(totals.carbsG),
      fatG: nonNegative(totals.fatG),
    },
    foodLogCount: nonNegative(row.foodLogCount),
  };
}

function parseNutritionTargets(value: unknown): TodayNutritionTargetProjection {
  const row = object(value);
  exactKeys(row, [
    "hasTarget",
    "dailyCalories",
    "proteinG",
    "carbsG",
    "fatG",
    "waterMl",
    "sourceType",
  ]);
  return {
    hasTarget: boolean(row.hasTarget),
    dailyCalories: nonNegative(row.dailyCalories),
    proteinG: nonNegative(row.proteinG),
    carbsG: nonNegative(row.carbsG),
    fatG: nonNegative(row.fatG),
    waterMl: nonNegative(row.waterMl),
    sourceType: oneOf<TodayNutritionTargetProjection["sourceType"]>(row.sourceType, targetSources),
  };
}

function parseHydration(value: unknown): TodayHydrationProjection {
  const row = object(value);
  exactKeys(row, ["totalMl", "logCount"]);
  return { totalMl: nonNegative(row.totalMl), logCount: nonNegative(row.logCount) };
}

function parseShopping(value: unknown): TodayShoppingProjection {
  const row = object(value);
  exactKeys(row, ["items", "itemCount"]);
  if (!Array.isArray(row.items) || row.items.length > 200) fail();
  const items = row.items.map((entry) => {
    const item = object(entry);
    exactKeys(item, [
      "id",
      "weekStart",
      "itemName",
      "quantity",
      "unit",
      "storeSection",
      "checked",
      "alreadyHave",
    ]);
    return {
      id: string(item.id),
      weekStart: string(item.weekStart),
      itemName: string(item.itemName),
      quantity: nullableNumber(item.quantity),
      unit: nullableString(item.unit),
      storeSection: string(item.storeSection),
      checked: boolean(item.checked),
      alreadyHave: boolean(item.alreadyHave),
    };
  });
  return { items, itemCount: nonNegative(row.itemCount) };
}

function parseHabits(value: unknown): TodayHabitProjection {
  const row = object(value);
  exactKeys(row, ["plannedCount", "completedCount", "openCount", "openPreviewNames"]);
  return {
    plannedCount: nonNegative(row.plannedCount),
    completedCount: nonNegative(row.completedCount),
    openCount: nonNegative(row.openCount),
    openPreviewNames: stringArray(row.openPreviewNames, 2),
  };
}

function parseSupplements(value: unknown): TodaySupplementProjection {
  const row = object(value);
  exactKeys(row, ["plannedCount", "takenCount", "remainingCount", "remainingPreviewNames"]);
  return {
    plannedCount: nonNegative(row.plannedCount),
    takenCount: nonNegative(row.takenCount),
    remainingCount: nonNegative(row.remainingCount),
    remainingPreviewNames: stringArray(row.remainingPreviewNames, 2),
  };
}

function parseSleep(value: unknown): TodaySleepProjection {
  const row = object(value);
  exactKeys(row, ["hasData", "hoursSlept", "recoveryLevel", "fatigueLevel", "poorRecovery"]);
  return {
    hasData: boolean(row.hasData),
    hoursSlept: nullableNumber(row.hoursSlept),
    recoveryLevel: nullableString(row.recoveryLevel),
    fatigueLevel: nullableString(row.fatigueLevel),
    poorRecovery: boolean(row.poorRecovery),
  };
}

function parseProfile(value: unknown): TodayProfileContextProjection {
  const row = object(value);
  exactKeys(row, ["state", "hasGoals", "hasTrainingPreferences", "hasNutritionPreferences", "hasConstraints"]);
  if (row.state !== "loaded") fail();
  return {
    state: "loaded",
    hasGoals: boolean(row.hasGoals),
    hasTrainingPreferences: boolean(row.hasTrainingPreferences),
    hasNutritionPreferences: boolean(row.hasNutritionPreferences),
    hasConstraints: boolean(row.hasConstraints),
  };
}

function parseProgress(value: unknown): TodayProgressContextProjection {
  const row = object(value);
  exactKeys(row, ["state", "entryCount"]);
  if (row.state !== "loaded") fail();
  return { state: "loaded", entryCount: nonNegative(row.entryCount) };
}

function parsePromptContext(value: unknown): TodayPromptContextProjection {
  const row = object(value);
  exactKeys(row, [
    "workout",
    "nutrition",
    "grocery",
    "hydration",
    "recovery",
    "wellness",
    "progress",
    "profile",
    "endOfWeek",
  ]);

  const workout = object(row.workout);
  exactKeys(workout, [
    "state",
    "hasPlan",
    "scheduled",
    "active",
    "completed",
    "skipped",
    "title",
    "exerciseCount",
    "durationMinutes",
    "historyCount",
  ]);
  const nutrition = object(row.nutrition);
  exactKeys(nutrition, [
    "targetsState",
    "foodLogsState",
    "hasTargets",
    "remainingCalories",
    "remainingProtein",
    "remainingCarbs",
    "remainingFat",
    "foodLogCount",
    "mealPlanCount",
    "plannedMealCount",
  ]);
  const grocery = object(row.grocery);
  exactKeys(grocery, ["state", "itemCount"]);
  const hydration = object(row.hydration);
  exactKeys(hydration, ["state", "hasTarget", "logCount", "remainingMl"]);
  const recovery = object(row.recovery);
  exactKeys(recovery, ["state", "hasData", "sleepHours", "poorRecovery"]);
  const wellness = object(row.wellness);
  exactKeys(wellness, ["state", "habitCount", "supplementCount"]);
  const progress = object(row.progress);
  exactKeys(progress, ["state", "entryCount"]);
  const profile = object(row.profile);
  exactKeys(profile, ["state", "hasGoals", "hasTrainingPreferences", "hasNutritionPreferences", "hasConstraints"]);
  const sourceStates = new Set(["loaded", "failed"]);

  return {
    workout: {
      state: oneOf<TodayPromptSourceState>(workout.state, sourceStates),
      hasPlan: workout.hasPlan === null ? null : boolean(workout.hasPlan),
      scheduled: boolean(workout.scheduled),
      active: boolean(workout.active),
      completed: boolean(workout.completed),
      skipped: boolean(workout.skipped),
      title: nullableString(workout.title),
      exerciseCount: nullableNumber(workout.exerciseCount),
      durationMinutes: nullableNumber(workout.durationMinutes),
      historyCount: nullableNumber(workout.historyCount),
    },
    nutrition: {
      targetsState: oneOf<TodayPromptSourceState>(nutrition.targetsState, sourceStates),
      foodLogsState: oneOf<TodayPromptSourceState>(nutrition.foodLogsState, sourceStates),
      hasTargets: boolean(nutrition.hasTargets),
      remainingCalories: nullableNumber(nutrition.remainingCalories),
      remainingProtein: nullableNumber(nutrition.remainingProtein),
      remainingCarbs: nullableNumber(nutrition.remainingCarbs),
      remainingFat: nullableNumber(nutrition.remainingFat),
      foodLogCount: nullableNumber(nutrition.foodLogCount),
      mealPlanCount: nullableNumber(nutrition.mealPlanCount),
      plannedMealCount: nullableNumber(nutrition.plannedMealCount),
    },
    grocery: {
      state: oneOf<TodayPromptSourceState>(grocery.state, sourceStates),
      itemCount: nullableNumber(grocery.itemCount),
    },
    hydration: {
      state: oneOf<TodayPromptSourceState>(hydration.state, sourceStates),
      hasTarget: boolean(hydration.hasTarget),
      logCount: nullableNumber(hydration.logCount),
      remainingMl: nullableNumber(hydration.remainingMl),
    },
    recovery: {
      state: oneOf<TodayPromptSourceState>(recovery.state, sourceStates),
      hasData: boolean(recovery.hasData),
      sleepHours: nullableNumber(recovery.sleepHours),
      poorRecovery: boolean(recovery.poorRecovery),
    },
    wellness: {
      state: oneOf<TodayPromptSourceState>(wellness.state, sourceStates),
      habitCount: nullableNumber(wellness.habitCount),
      supplementCount: nullableNumber(wellness.supplementCount),
    },
    progress: {
      state: oneOf<TodayPromptSourceState>(progress.state, sourceStates),
      entryCount: nullableNumber(progress.entryCount),
    },
    profile: {
      state: oneOf<TodayPromptSourceState>(profile.state, sourceStates),
      hasGoals: boolean(profile.hasGoals),
      hasTrainingPreferences: boolean(profile.hasTrainingPreferences),
      hasNutritionPreferences: boolean(profile.hasNutritionPreferences),
      hasConstraints: boolean(profile.hasConstraints),
    },
    endOfWeek: boolean(row.endOfWeek),
  };
}

export function parseTodayProjectionResponseV1(
  value: unknown,
): TodayProjectionResponseV1 {
  const row = object(value);
  exactKeys(row, [
    "contractVersion",
    "date",
    "timezone",
    "generatedAt",
    "workout",
    "meals",
    "nutrition",
    "hydration",
    "shopping",
    "wellness",
    "profileContext",
    "progressContext",
    "promptContext",
  ]);
  if (row.contractVersion !== TODAY_PROJECTION_CONTRACT_VERSION) fail();

  const nutrition = object(row.nutrition);
  exactKeys(nutrition, ["logs", "targets"]);
  const wellness = object(row.wellness);
  exactKeys(wellness, ["state", "habits", "supplements", "sleep"]);
  if (wellness.state !== "loaded" && wellness.state !== "failed") fail();

  return {
    contractVersion: TODAY_PROJECTION_CONTRACT_VERSION,
    date: string(row.date),
    timezone: string(row.timezone),
    generatedAt: string(row.generatedAt),
    workout: envelope(row.workout, parseWorkout),
    meals: envelope(row.meals, parseMeals),
    nutrition: {
      logs: envelope(nutrition.logs, parseNutritionLogs),
      targets: envelope(nutrition.targets, parseNutritionTargets),
    },
    hydration: envelope(row.hydration, parseHydration),
    shopping: envelope(row.shopping, parseShopping),
    wellness: {
      state: wellness.state,
      habits: envelope(wellness.habits, parseHabits),
      supplements: envelope(wellness.supplements, parseSupplements),
      sleep: envelope(wellness.sleep, parseSleep),
    },
    profileContext: envelope(row.profileContext, parseProfile),
    progressContext: envelope(row.progressContext, parseProgress),
    promptContext: parsePromptContext(row.promptContext),
  };
}
