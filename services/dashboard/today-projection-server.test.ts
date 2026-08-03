import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readTodayProjectionV1,
  readTodayWorkoutProjection,
} from "@/services/dashboard/today-projection-server";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const planA = "11111111-1111-4111-8111-111111111121";
const planB = "22222222-2222-4222-8222-222222222221";
const dayA = "11111111-1111-4111-8111-111111111122";
const dayB = "22222222-2222-4222-8222-222222222222";

type Row = Record<string, unknown>;
type Dataset = Record<string, Row[]>;
type Filter =
  | { kind: "eq"; column: string; value: unknown }
  | { kind: "is"; column: string; value: unknown }
  | { kind: "in"; column: string; value: unknown[] }
  | { kind: "lte"; column: string; value: unknown }
  | { kind: "gte"; column: string; value: unknown };

class FakeQuery implements PromiseLike<unknown> {
  private filters: Filter[] = [];
  private selectedColumns: string[] = [];
  private maximum: number | null = null;
  private single = false;
  private countMode = false;
  private head = false;

  constructor(
    private readonly client: FakeSupabase,
    private readonly table: string,
  ) {}

  select(columns: string, options?: { count?: string; head?: boolean }) {
    this.selectedColumns = columns.split(",").map((column) => column.trim());
    this.client.selects.push({ table: this.table, columns });
    this.countMode = options?.count === "exact";
    this.head = options?.head === true;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ kind: "eq", column, value });
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push({ kind: "is", column, value });
    return this;
  }

  in(column: string, value: unknown[]) {
    this.filters.push({ kind: "in", column, value });
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push({ kind: "lte", column, value });
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push({ kind: "gte", column, value });
    return this;
  }

  order() {
    return this;
  }

  limit(value: number) {
    this.maximum = value;
    return this;
  }

  maybeSingle() {
    this.single = true;
    return Promise.resolve(this.execute());
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute() {
    if (this.client.failTables.has(this.table)) {
      return {
        data: null,
        count: null,
        error: new Error(`raw ${this.table} database failure`),
      };
    }

    let rows = [...(this.client.dataset[this.table] ?? [])];
    for (const filter of this.filters) {
      rows = rows.filter((row) => {
        const value = row[filter.column];
        if (filter.kind === "eq") return value === filter.value;
        if (filter.kind === "is") return value === filter.value;
        if (filter.kind === "in") return filter.value.includes(value);
        if (filter.kind === "lte") return String(value) <= String(filter.value);
        return String(value) >= String(filter.value);
      });
    }
    if (this.maximum !== null) rows = rows.slice(0, this.maximum);
    if (this.head) return { data: null, count: rows.length, error: null };

    const projected = rows.map((row) =>
      Object.fromEntries(
        this.selectedColumns.map((column) => [column, row[column]]),
      ),
    );
    return {
      data: this.single ? projected[0] ?? null : projected,
      count: this.countMode ? projected.length : null,
      error: null,
    };
  }
}

class FakeSupabase {
  operations = 0;
  writes = 0;
  selects: Array<{ table: string; columns: string }> = [];
  failTables = new Set<string>();

  constructor(readonly dataset: Dataset) {}

  from(table: string) {
    this.operations += 1;
    return new FakeQuery(this, table);
  }

  rpc() {
    this.writes += 1;
    throw new Error("Writes are forbidden in the Today projection reader.");
  }
}

function populatedDataset(cardinality = 5): Dataset {
  return {
    user_workout_plans: [
      {
        id: planA,
        user_id: ownerA,
        is_active: true,
        archived_at: null,
        updated_at: "2026-08-03T01:00:00Z",
        session_duration_minutes: 50,
      },
      {
        id: planB,
        user_id: ownerB,
        is_active: true,
        archived_at: null,
        updated_at: "2026-08-03T02:00:00Z",
        session_duration_minutes: 99,
      },
    ],
    user_workout_plan_days: [
      {
        id: dayA,
        plan_id: planA,
        weekday: "Monday",
        day_number: 1,
        day_name: "Owner A strength",
      },
      {
        id: dayB,
        plan_id: planB,
        weekday: "Monday",
        day_number: 1,
        day_name: "Owner B private plan",
      },
    ],
    user_workout_plan_exercises: [
      ...Array.from({ length: cardinality }, (_, index) => ({
        id: `exercise-a-${index}`,
        plan_day_id: dayA,
        exercise_name: `Owner A exercise ${index}`,
        sets: 3,
        reps: "8-10",
        sort_order: index,
      })),
      {
        id: "exercise-b-private",
        plan_day_id: dayB,
        exercise_name: "Owner B private exercise",
        sets: 9,
        reps: 99,
        sort_order: 0,
      },
    ],
    workout_sessions: [
      {
        id: "active-a",
        user_id: ownerA,
        plan_day_id: dayA,
        status: "started",
        deleted_at: null,
        started_at: "2026-08-03T06:00:00Z",
        completed_at: null,
        skipped_at: null,
      },
      {
        id: "completed-cross-midnight-a",
        user_id: ownerA,
        plan_day_id: dayA,
        status: "completed",
        deleted_at: null,
        started_at: "2026-08-02T22:30:00Z",
        completed_at: "2026-08-02T23:30:00Z",
        skipped_at: null,
      },
      {
        id: "private-b",
        user_id: ownerB,
        plan_day_id: dayB,
        status: "completed",
        deleted_at: null,
        started_at: "2026-08-03T07:00:00Z",
        completed_at: "2026-08-03T08:00:00Z",
        skipped_at: null,
      },
    ],
    user_workout_sessions: [
      {
        id: "scheduled-completed-a",
        user_id: ownerA,
        plan_day_id: dayA,
        scheduled_date: "2026-08-03",
        status: "completed",
        started_at: "2026-08-03T08:00:00Z",
        completed_at: "2026-08-03T09:00:00Z",
        skipped_at: null,
      },
      {
        id: "scheduled-skipped-a",
        user_id: ownerA,
        plan_day_id: dayA,
        scheduled_date: "2026-08-03",
        status: "skipped",
        started_at: null,
        completed_at: null,
        skipped_at: "2026-08-03T07:00:00Z",
      },
    ],
    user_meal_plan_items: [
      ...Array.from({ length: cardinality }, (_, index) => ({
        id: `meal-a-${index}`,
        user_id: ownerA,
        plan_date: "2026-08-03",
        meal_type: index % 2 ? "Lunch" : "Breakfast",
        food_name: `Owner A meal ${index}`,
        calories: 300,
        protein_g: 25,
        status: index === 0 ? "planned" : "done",
        created_at: `2026-08-03T0${index}:00:00Z`,
      })),
      {
        id: "meal-b-private",
        user_id: ownerB,
        plan_date: "2026-08-03",
        meal_type: "Dinner",
        food_name: "Owner B private meal",
        calories: 999,
        protein_g: 99,
        status: "planned",
        created_at: "2026-08-03T00:00:00Z",
      },
    ],
    food_logs: [
      {
        user_id: ownerA,
        log_date: "2026-08-03",
        calories: 500,
        protein_g: 40,
        carbs_g: 50,
        fat_g: 15,
      },
      {
        user_id: ownerA,
        log_date: "2026-08-03",
        calories: 250,
        protein_g: 20,
        carbs_g: 25,
        fat_g: 8,
      },
      {
        user_id: ownerB,
        log_date: "2026-08-03",
        calories: 9999,
        protein_g: 999,
        carbs_g: 999,
        fat_g: 999,
      },
    ],
    calorie_targets: [
      {
        user_id: ownerA,
        daily_calories: 2400,
        protein_g: 180,
        carbs_g: 260,
        fat_g: 80,
        water_ml: 3000,
      },
      {
        user_id: ownerB,
        daily_calories: 9999,
        protein_g: 999,
        carbs_g: 999,
        fat_g: 999,
        water_ml: 9999,
      },
    ],
    user_nutrition_target_profiles: [
      {
        id: "target-a",
        user_id: ownerA,
        target_type: "training_day",
        calories: 2500,
        protein_g: 190,
        carbs_g: 275,
        fat_g: 82,
        water_ml: 3200,
        created_at: "2026-08-01T00:00:00Z",
        updated_at: "2026-08-01T00:00:00Z",
      },
    ],
    user_nutrition_target_date_overrides: [],
    water_logs: [
      { user_id: ownerA, log_date: "2026-08-03", amount_ml: 500 },
      { user_id: ownerA, log_date: "2026-08-03", amount_ml: 750 },
      { user_id: ownerB, log_date: "2026-08-03", amount_ml: 9999 },
    ],
    user_grocery_items: [
      ...Array.from({ length: cardinality }, (_, index) => ({
        id: `grocery-a-${index}`,
        user_id: ownerA,
        week_start: "2026-08-03",
        item_name: `Owner A grocery ${index}`,
        quantity: 1,
        unit: "item",
        store_section: "Produce",
        checked: false,
        already_have: false,
      })),
      {
        id: "grocery-b-private",
        user_id: ownerB,
        week_start: "2026-08-03",
        item_name: "Owner B private grocery",
        quantity: 1,
        unit: "item",
        store_section: "Private",
        checked: false,
        already_have: false,
      },
    ],
    fitness_habits: [
      ...Array.from({ length: cardinality }, (_, index) => ({
        user_id: ownerA,
        habit_date: "2026-08-03",
        name: `Owner A habit ${index}`,
        completed: index % 2 === 0,
        created_at: `2026-08-03T0${index}:00:00Z`,
      })),
      {
        user_id: ownerB,
        habit_date: "2026-08-03",
        name: "Owner B private habit",
        completed: false,
        created_at: "2026-08-03T00:00:00Z",
      },
    ],
    supplement_logs: [
      ...Array.from({ length: cardinality }, (_, index) => ({
        user_id: ownerA,
        supplement_date: "2026-08-03",
        name: `Owner A supplement ${index}`,
        taken_today: index % 2 === 0,
        created_at: `2026-08-03T0${index}:00:00Z`,
      })),
      {
        user_id: ownerB,
        supplement_date: "2026-08-03",
        name: "Owner B private supplement",
        taken_today: false,
        created_at: "2026-08-03T00:00:00Z",
      },
    ],
    sleep_recovery_logs: [
      {
        user_id: ownerA,
        log_date: "2026-08-03",
        hours_slept: 6,
        recovery_level: "low",
        fatigue_level: "high",
      },
      {
        user_id: ownerB,
        log_date: "2026-08-03",
        hours_slept: 12,
        recovery_level: "high",
        fatigue_level: "low",
      },
    ],
    onboarding_answers: [
      {
        user_id: ownerA,
        goals: ["strength"],
        training_level: "intermediate",
        nutrition_preferences: [],
      },
      {
        user_id: ownerB,
        goals: ["private"],
        training_level: "private",
        nutrition_preferences: ["private"],
      },
    ],
    user_nutrition_preference_profiles: [
      { user_id: ownerA, preferred_cuisines: ["Mediterranean"] },
      { user_id: ownerB, preferred_cuisines: ["Private"] },
    ],
    user_fitness_constraints: [
      { user_id: ownerA, injury_or_limitation_labels: [] },
      { user_id: ownerB, injury_or_limitation_labels: ["Private injury"] },
    ],
    progress_entries: [
      { id: "progress-a-1", user_id: ownerA },
      { id: "progress-a-2", user_id: ownerA },
      { id: "progress-b-private", user_id: ownerB },
    ],
  };
}

function emptyDataset(): Dataset {
  return Object.fromEntries(
    Object.keys(populatedDataset()).map((table) => [table, []]),
  );
}

function input(client: FakeSupabase) {
  return {
    supabase: client as unknown as SupabaseClient,
    userId: ownerA,
    date: "2026-08-03",
    timezone: "Europe/Berlin",
    now: new Date("2026-08-03T10:00:00.000Z"),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Today server projection", () => {
  it("maps populated owner-scoped summaries with bounded previews and aggregates", async () => {
    const client = new FakeSupabase(populatedDataset());
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const result = await readTodayProjectionV1(input(client));

    expect(result.response.workout).toMatchObject({
      state: "loaded",
      value: {
        state: "active",
        exerciseCount: 5,
        activeSessionId: "active-a",
      },
    });
    expect(
      result.response.workout.state === "loaded" &&
        result.response.workout.value.previewExercises,
    ).toHaveLength(3);
    expect(
      result.response.meals.state === "loaded" &&
        result.response.meals.value.items,
    ).toHaveLength(5);
    expect(JSON.stringify(result.response)).not.toMatch(
      /Owner B private|9999|Private injury/,
    );
    expect(result.response.nutrition.logs).toMatchObject({
      state: "loaded",
      value: {
        totals: {
          calories: 750,
          proteinG: 60,
          carbsG: 75,
          fatG: 23,
        },
        foodLogCount: 2,
      },
    });
    expect(result.response.hydration).toMatchObject({
      state: "loaded",
      value: { totalMl: 1250, logCount: 2 },
    });
    expect(
      result.response.wellness.habits.state === "loaded" &&
        result.response.wellness.habits.value.openPreviewNames,
    ).toHaveLength(2);
    expect(
      result.response.wellness.supplements.state === "loaded" &&
        result.response.wellness.supplements.value.remainingPreviewNames,
    ).toHaveLength(2);
    expect(result.response.wellness.sleep).toMatchObject({
      state: "loaded",
      value: { hasData: true, poorRecovery: true, hoursSlept: 6 },
    });
    expect(result.response.profileContext).toMatchObject({
      state: "loaded",
      value: {
        hasGoals: true,
        hasTrainingPreferences: true,
        hasNutritionPreferences: true,
        hasConstraints: false,
      },
    });
    expect(result.response.progressContext).toMatchObject({
      state: "loaded",
      value: { entryCount: 2 },
    });
    expect(client.operations).toBe(23);
    expect(client.writes).toBe(0);
    expect(
      client.selects.every(({ columns }) => !columns.includes("*")),
    ).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns successful empty values with the exact empty operation count", async () => {
    const client = new FakeSupabase(emptyDataset());
    const result = await readTodayProjectionV1(input(client));
    expect(result.response.workout).toMatchObject({
      state: "loaded",
      value: { state: "none" },
    });
    expect(result.response.meals).toMatchObject({
      state: "loaded",
      value: { itemCount: 0 },
    });
    expect(result.response.nutrition.logs).toMatchObject({
      state: "loaded",
      value: { foodLogCount: 0 },
    });
    expect(result.response.hydration).toMatchObject({
      state: "loaded",
      value: { totalMl: 0, logCount: 0 },
    });
    expect(client.operations).toBe(16);
  });

  it("preserves a partial-domain failure and its populated operation count", async () => {
    const client = new FakeSupabase(populatedDataset());
    client.failTables.add("user_meal_plan_items");
    const result = await readTodayProjectionV1(input(client));
    expect(result.response.meals).toEqual({
      state: "failed",
      value: null,
      errorCode: "meals_unavailable",
    });
    expect(result.response.workout.state).toBe("loaded");
    expect(result.response.nutrition.logs.state).toBe("loaded");
    expect(JSON.stringify(result.response)).not.toContain(
      "raw user_meal_plan_items",
    );
    expect(client.operations).toBe(23);
  });

  it("keeps operation count constant as collection cardinality grows", async () => {
    const typical = new FakeSupabase(populatedDataset(5));
    const high = new FakeSupabase(populatedDataset(80));
    await readTodayProjectionV1(input(typical));
    await readTodayProjectionV1(input(high));
    expect(typical.operations).toBe(23);
    expect(high.operations).toBe(23);
  });

  it("preserves active, skipped, completed, scheduled and timezone precedence", async () => {
    await expect(
      readTodayWorkoutProjection(input(new FakeSupabase(populatedDataset()))),
    ).resolves.toMatchObject({ state: "active" });

    const skippedData = populatedDataset();
    skippedData.workout_sessions = skippedData.workout_sessions.filter(
      (row) => row.id !== "active-a",
    );
    await expect(
      readTodayWorkoutProjection(input(new FakeSupabase(skippedData))),
    ).resolves.toMatchObject({ state: "skipped" });

    const completedData = populatedDataset();
    completedData.workout_sessions = completedData.workout_sessions.filter(
      (row) => row.id !== "active-a",
    );
    completedData.user_workout_sessions =
      completedData.user_workout_sessions.filter(
        (row) => row.status !== "skipped",
      );
    await expect(
      readTodayWorkoutProjection(input(new FakeSupabase(completedData))),
    ).resolves.toMatchObject({
      state: "completed",
      completedSessionId: "scheduled-completed-a",
    });

    const timezoneData = populatedDataset();
    timezoneData.workout_sessions = timezoneData.workout_sessions.filter(
      (row) => row.id !== "active-a",
    );
    timezoneData.user_workout_sessions = [];
    await expect(
      readTodayWorkoutProjection(input(new FakeSupabase(timezoneData))),
    ).resolves.toMatchObject({
      state: "completed",
      completedSessionId: "completed-cross-midnight-a",
    });

    const scheduledData = populatedDataset();
    scheduledData.workout_sessions =
      scheduledData.workout_sessions.filter((row) => row.user_id === ownerB);
    scheduledData.user_workout_sessions = [];
    await expect(
      readTodayWorkoutProjection(input(new FakeSupabase(scheduledData))),
    ).resolves.toMatchObject({ state: "scheduled" });
  });
});
