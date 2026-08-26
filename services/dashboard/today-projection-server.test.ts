import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readTodayNutritionTargetsProjection,
  readTodayProjectionV1,
  readTodayWorkoutProjection,
} from "@/services/dashboard/today-projection-server";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const planA = "11111111-1111-4111-8111-111111111121";
const emptyDay = "11111111-1111-4111-8111-111111111122";
const populatedDay = "11111111-1111-4111-8111-111111111123";
const otherDay = "11111111-1111-4111-8111-111111111124";

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
        error: new Error(`raw ${this.table} database failure token=private`),
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

function workoutDataset(cardinality = 4): Dataset {
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
        id: "private-plan-b",
        user_id: ownerB,
        is_active: true,
        archived_at: null,
        updated_at: "2026-08-03T02:00:00Z",
        session_duration_minutes: 99,
      },
    ],
    user_workout_plan_days: [
      {
        id: emptyDay,
        plan_id: planA,
        weekday: "Monday",
        day_number: 1,
        day_name: "Empty Monday",
      },
      {
        id: populatedDay,
        plan_id: planA,
        weekday: "Monday",
        day_number: 2,
        day_name: "Populated Monday",
      },
      {
        id: otherDay,
        plan_id: planA,
        weekday: "Tuesday",
        day_number: 3,
        day_name: "Other day",
      },
    ],
    user_workout_plan_exercises: Array.from(
      { length: cardinality },
      (_, index) => ({
        id: `exercise-${index}`,
        plan_day_id: populatedDay,
        exercise_name: `Exercise ${index}`,
        sets: 3,
        reps: "8-10",
        sort_order: index,
      }),
    ),
    workout_sessions: [
      {
        id: "active-today",
        user_id: ownerA,
        plan_day_id: populatedDay,
        status: "started",
        deleted_at: null,
        started_at: "2026-08-03T06:00:00Z",
        completed_at: null,
        skipped_at: null,
      },
      {
        id: "legacy-completed-other-day",
        user_id: ownerA,
        plan_day_id: otherDay,
        status: "completed",
        deleted_at: null,
        started_at: "2026-08-01T06:00:00Z",
        completed_at: "2026-08-01T07:00:00Z",
        skipped_at: null,
      },
      {
        id: "legacy-completed-cross-midnight",
        user_id: ownerA,
        plan_day_id: populatedDay,
        status: "completed",
        deleted_at: null,
        started_at: "2026-08-02T22:30:00Z",
        completed_at: "2026-08-02T23:30:00Z",
        skipped_at: null,
      },
      {
        id: "legacy-deleted",
        user_id: ownerA,
        plan_day_id: populatedDay,
        status: "completed",
        deleted_at: "2026-08-03T09:00:00Z",
        started_at: "2026-08-03T07:00:00Z",
        completed_at: "2026-08-03T08:00:00Z",
        skipped_at: null,
      },
      {
        id: "legacy-private-b",
        user_id: ownerB,
        plan_day_id: populatedDay,
        status: "completed",
        deleted_at: null,
        started_at: "2026-08-03T07:00:00Z",
        completed_at: "2026-08-03T08:00:00Z",
        skipped_at: null,
      },
    ],
    user_workout_sessions: [
      {
        id: "scheduled-completed-today",
        user_id: ownerA,
        plan_day_id: populatedDay,
        scheduled_date: "2026-08-03",
        status: "completed",
        started_at: "2026-08-03T08:00:00Z",
        completed_at: "2026-08-03T09:00:00Z",
        skipped_at: null,
      },
      {
        id: "scheduled-completed-other-day",
        user_id: ownerA,
        plan_day_id: otherDay,
        scheduled_date: "2026-08-01",
        status: "completed",
        started_at: "2026-08-01T08:00:00Z",
        completed_at: "2026-08-01T09:00:00Z",
        skipped_at: null,
      },
      {
        id: "scheduled-skipped-today",
        user_id: ownerA,
        plan_day_id: populatedDay,
        scheduled_date: "2026-08-03",
        status: "skipped",
        started_at: null,
        completed_at: null,
        skipped_at: "2026-08-03T07:00:00Z",
      },
      {
        id: "scheduled-private-b",
        user_id: ownerB,
        plan_day_id: populatedDay,
        scheduled_date: "2026-08-03",
        status: "completed",
        started_at: "2026-08-03T08:00:00Z",
        completed_at: "2026-08-03T09:00:00Z",
        skipped_at: null,
      },
    ],
  };
}

function canonicalDataset(cardinality = 4): Dataset {
  return {
    ...workoutDataset(cardinality),
    nutrition_planned_occurrences: Array.from(
      { length: cardinality },
      (_, index) => ({
        id: `meal-${index}`,
        user_id: ownerA,
        plan_date: "2026-08-03",
        meal_slot_key: index % 2 ? "Lunch" : "Breakfast",
        position: index,
        frozen_name: `Meal ${index}`,
        frozen_snapshot: {
          frozen_nutrition: {
            calories: 300,
            protein_g: 25,
            carbs_g: 30,
            fat_g: 10,
          },
        },
        status: index === 0 ? "planned" : "completed",
      }),
    ),
    nutrition_log_groups: [
      {
        id: "group-a-1",
        user_id: ownerA,
        log_date: "2026-08-03",
        created_at: "2026-08-03T07:00:00Z",
      },
      {
        id: "group-a-2",
        user_id: ownerA,
        log_date: "2026-08-03",
        created_at: "2026-08-03T08:00:00Z",
      },
      {
        id: "group-private-b",
        user_id: ownerB,
        log_date: "2026-08-03",
        created_at: "2026-08-03T09:00:00Z",
      },
    ],
    nutrition_log_group_items: [
      {
        group_id: "group-a-1",
        user_id: ownerA,
        position: 0,
        frozen_item_snapshot: {
          nutrition: {
            caloriesKcal: 500,
            proteinG: 40,
            carbsG: 50,
            fatG: 15,
          },
        },
      },
      {
        group_id: "group-a-2",
        user_id: ownerA,
        position: 0,
        frozen_item_snapshot: {
          nutrition: {
            caloriesKcal: 250,
            proteinG: 20,
            carbsG: 25,
            fatG: 8,
          },
        },
      },
      {
        group_id: "group-private-b",
        user_id: ownerB,
        position: 0,
        frozen_item_snapshot: {
          nutrition: {
            caloriesKcal: 9999,
            proteinG: 999,
            carbsG: 999,
            fatG: 999,
          },
        },
      },
    ],
    nutrition_target_periods: [
      {
        id: "target-period-a",
        user_id: ownerA,
        effective_from: "2026-08-01",
        effective_to: null,
        calories: 2500,
        protein_g: 190,
        carbs_g: 275,
        fat_g: 82,
        water_ml: 3200,
        source: "training_day",
        source_evidence: { authority: "test-cutover" },
      },
      {
        id: "target-period-private-b",
        user_id: ownerB,
        effective_from: "2026-08-01",
        effective_to: null,
        calories: 9999,
        protein_g: 999,
        carbs_g: 999,
        fat_g: 999,
        water_ml: 9999,
        source: "private-b",
        source_evidence: {},
      },
    ],
    water_logs: [
      { user_id: ownerA, log_date: "2026-08-03", amount_ml: 500 },
      { user_id: ownerA, log_date: "2026-08-03", amount_ml: 750 },
    ],
    user_grocery_items: Array.from({ length: cardinality }, (_, index) => ({
      id: `grocery-${index}`,
      user_id: ownerA,
      week_start: "2026-08-03",
      item_name: `Grocery ${index}`,
      quantity: 1,
      unit: "item",
      store_section: "Produce",
      checked: false,
      already_have: false,
    })),
    fitness_habits: Array.from({ length: cardinality }, (_, index) => ({
      user_id: ownerA,
      habit_date: "2026-08-03",
      name: `Habit ${index}`,
      completed: index % 2 === 0,
      created_at: `2026-08-03T0${index}:00:00Z`,
    })),
    supplement_logs: Array.from({ length: cardinality }, (_, index) => ({
      user_id: ownerA,
      supplement_date: "2026-08-03",
      name: `Supplement ${index}`,
      taken_today: index % 2 === 0,
      created_at: `2026-08-03T0${index}:00:00Z`,
    })),
    sleep_recovery_logs: [
      {
        user_id: ownerA,
        log_date: "2026-08-03",
        hours_slept: 6,
        recovery_level: "low",
        fatigue_level: "high",
      },
    ],
    onboarding_answers: [
      {
        user_id: ownerA,
        goals: ["strength"],
        training_level: "intermediate",
        nutrition_preferences: [],
      },
    ],
    user_nutrition_preference_profiles: [
      { user_id: ownerA, preferred_cuisines: ["Mediterranean"] },
    ],
    user_fitness_constraints: [
      { user_id: ownerA, injury_or_limitation_labels: [] },
    ],
    progress_entries: [
      { id: "progress-a-1", user_id: ownerA },
      { id: "progress-a-2", user_id: ownerA },
    ],
    // Legacy Nutrition tables deliberately contain contradictory data. Today must
    // not inspect them after the Nutrition V1 cutover.
    user_meal_plan_items: [
      {
        id: "legacy-meal-sentinel",
        user_id: ownerA,
        plan_date: "2026-08-03",
        food_name: "legacy-9999",
        calories: 9999,
      },
    ],
    food_logs: [
      {
        id: "legacy-log-sentinel",
        user_id: ownerA,
        log_date: "2026-08-03",
        calories: 9999,
      },
    ],
    calorie_targets: [
      { user_id: ownerA, daily_calories: 9999 },
    ],
    user_nutrition_target_profiles: [
      { id: "legacy-target-sentinel", user_id: ownerA, calories: 9999 },
    ],
    user_nutrition_target_date_overrides: [
      { user_id: ownerA, target_date: "2026-08-03", target_type: "default_day" },
    ],
  };
}

function emptyDataset(): Dataset {
  return Object.fromEntries(
    Object.keys(canonicalDataset()).map((table) => [table, []]),
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
  it("maps canonical owner-scoped Nutrition summaries with bounded previews and read-only operations", async () => {
    const client = new FakeSupabase(canonicalDataset());
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const result = await readTodayProjectionV1(input(client));

    expect(result.response.workout).toMatchObject({
      state: "loaded",
      value: {
        state: "active",
        dayId: populatedDay,
        exerciseCount: 4,
        activeSessionId: "active-today",
        recentCompletedCount: 4,
      },
    });
    expect(
      result.response.workout.state === "loaded" &&
        result.response.workout.value.previewExercises,
    ).toHaveLength(3);
    expect(result.response.meals).toMatchObject({
      state: "loaded",
      value: {
        itemCount: 4,
        plannedCount: 1,
        items: [
          {
            id: "meal-0",
            mealSlotKey: "Breakfast",
            name: "Meal 0",
            calories: 300,
            proteinG: 25,
            status: "planned",
          },
        ],
      },
    });
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
    expect(result.response.nutrition.targets).toMatchObject({
      state: "loaded",
      value: {
        sourceType: "training_day",
        dailyCalories: 2500,
        proteinG: 190,
        carbsG: 275,
        fatG: 82,
        waterMl: 3200,
      },
    });

    const selectedTables = client.selects.map(({ table }) => table);
    expect(selectedTables).not.toContain("user_meal_plan_items");
    expect(selectedTables).not.toContain("food_logs");
    expect(selectedTables).not.toContain("calorie_targets");
    expect(selectedTables).not.toContain("user_nutrition_target_profiles");
    expect(selectedTables).not.toContain("user_nutrition_target_date_overrides");
    expect(JSON.stringify(result.response)).not.toMatch(/9999|private-b|legacy-meal-sentinel/i);
    expect(client.operations).toBe(19);
    expect(client.writes).toBe(0);
    expect(client.selects.every(({ columns }) => !columns.includes("*"))).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns successful empty values with the truthful empty operation count", async () => {
    const client = new FakeSupabase(emptyDataset());
    const result = await readTodayProjectionV1(input(client));
    expect(result.response.workout).toMatchObject({
      state: "loaded",
      value: { state: "none", recentCompletedCount: 0 },
    });
    expect(result.response.meals).toMatchObject({
      state: "loaded",
      value: { itemCount: 0 },
    });
    expect(result.response.nutrition.logs).toMatchObject({
      state: "loaded",
      value: {
        foodLogCount: 0,
        totals: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      },
    });
    expect(result.response.nutrition.targets).toMatchObject({
      state: "loaded",
      value: { hasTarget: false, sourceType: "none" },
    });
    expect(client.operations).toBe(15);
  });

  it("preserves safe partial-domain failure for the canonical Meal Plan reader", async () => {
    const client = new FakeSupabase(canonicalDataset());
    client.failTables.add("nutrition_planned_occurrences");
    const result = await readTodayProjectionV1(input(client));
    expect(result.response.meals).toEqual({
      state: "failed",
      value: null,
      errorCode: "meals_unavailable",
    });
    expect(result.response.workout.state).toBe("loaded");
    expect(result.response.nutrition.logs.state).toBe("loaded");
    expect(JSON.stringify(result.response)).not.toMatch(/raw|token=private/);
    expect(client.operations).toBe(19);
  });

  it("keeps full projection operation count constant as Nutrition cardinality grows", async () => {
    const typical = new FakeSupabase(canonicalDataset(4));
    const high = new FakeSupabase(canonicalDataset(80));
    await readTodayProjectionV1(input(typical));
    await readTodayProjectionV1(input(high));
    expect(typical.operations).toBe(19);
    expect(high.operations).toBe(19);
  });

  it("propagates unknown actual Nutrition independently instead of coercing it to zero", async () => {
    const dataset = canonicalDataset();
    const first = dataset.nutrition_log_group_items[0];
    first.frozen_item_snapshot = {
      nutrition: {
        caloriesKcal: 500,
        proteinG: null,
        carbsG: 50,
        fatG: 15,
      },
    };
    const result = await readTodayProjectionV1(input(new FakeSupabase(dataset)));
    expect(result.response.nutrition.logs).toMatchObject({
      state: "loaded",
      value: {
        totals: {
          calories: 750,
          proteinG: null,
          carbsG: 75,
          fatG: 23,
        },
      },
    });
  });

  it("counts legacy and scheduled workout completions across plan days with owner and deletion bounds", async () => {
    const client = new FakeSupabase(workoutDataset());
    const result = await readTodayWorkoutProjection(input(client));
    expect(result.recentCompletedCount).toBe(4);
    expect(result.dayId).toBe(populatedDay);
    expect(result.dayName).toBe("Populated Monday");
    expect(client.operations).toBe(6);
  });

  it("returns bounded workout history count without an active plan", async () => {
    const dataset = workoutDataset();
    dataset.user_workout_plans = [];
    const client = new FakeSupabase(dataset);
    await expect(readTodayWorkoutProjection(input(client))).resolves.toMatchObject({
      hasPlan: false,
      state: "none",
      recentCompletedCount: 4,
    });
    expect(client.operations).toBe(3);
  });

  it("does not let the first empty weekday day hide a later populated workout day", async () => {
    const client = new FakeSupabase(workoutDataset());
    await expect(readTodayWorkoutProjection(input(client))).resolves.toMatchObject({
      dayId: populatedDay,
      dayName: "Populated Monday",
      exerciseCount: 4,
    });
    expect(client.operations).toBe(6);
  });

  it("keeps workout query count constant as sessions, days, and exercises grow", async () => {
    const typicalData = workoutDataset(4);
    const highData = workoutDataset(200);
    highData.user_workout_plan_days.push(
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `extra-day-${index}`,
        plan_id: planA,
        weekday: "Monday",
        day_number: index + 3,
        day_name: `Extra ${index}`,
      })),
    );
    highData.workout_sessions.push(
      ...Array.from({ length: 100 }, (_, index) => ({
        id: `legacy-extra-${index}`,
        user_id: ownerA,
        plan_day_id: otherDay,
        status: "completed",
        deleted_at: null,
        started_at: "2026-07-01T00:00:00Z",
        completed_at: "2026-07-01T01:00:00Z",
        skipped_at: null,
      })),
    );
    highData.user_workout_sessions.push(
      ...Array.from({ length: 100 }, (_, index) => ({
        id: `scheduled-extra-${index}`,
        user_id: ownerA,
        plan_day_id: otherDay,
        scheduled_date: "2026-07-01",
        status: "completed",
        started_at: "2026-07-01T00:00:00Z",
        completed_at: "2026-07-01T01:00:00Z",
        skipped_at: null,
      })),
    );
    const typical = new FakeSupabase(typicalData);
    const high = new FakeSupabase(highData);
    await readTodayWorkoutProjection(input(typical));
    await readTodayWorkoutProjection(input(high));
    expect(typical.operations).toBe(6);
    expect(high.operations).toBe(6);
  });

  it("preserves active, skipped, completed, scheduled and timezone workout precedence", async () => {
    await expect(
      readTodayWorkoutProjection(input(new FakeSupabase(workoutDataset()))),
    ).resolves.toMatchObject({ state: "active" });

    const skippedData = workoutDataset();
    skippedData.workout_sessions = skippedData.workout_sessions.filter(
      (row) => row.id !== "active-today",
    );
    await expect(
      readTodayWorkoutProjection(input(new FakeSupabase(skippedData))),
    ).resolves.toMatchObject({ state: "skipped" });

    const completedData = workoutDataset();
    completedData.workout_sessions = completedData.workout_sessions.filter(
      (row) => row.id !== "active-today",
    );
    completedData.user_workout_sessions =
      completedData.user_workout_sessions.filter((row) => row.status !== "skipped");
    await expect(
      readTodayWorkoutProjection(input(new FakeSupabase(completedData))),
    ).resolves.toMatchObject({
      state: "completed",
      completedSessionId: "scheduled-completed-today",
    });

    const timezoneData = workoutDataset();
    timezoneData.workout_sessions = timezoneData.workout_sessions.filter(
      (row) => row.id !== "active-today",
    );
    timezoneData.user_workout_sessions = [];
    await expect(
      readTodayWorkoutProjection(input(new FakeSupabase(timezoneData))),
    ).resolves.toMatchObject({
      state: "completed",
      completedSessionId: "legacy-completed-cross-midnight",
    });

    const scheduledData = workoutDataset();
    scheduledData.workout_sessions = [];
    scheduledData.user_workout_sessions = [];
    await expect(
      readTodayWorkoutProjection(input(new FakeSupabase(scheduledData))),
    ).resolves.toMatchObject({ state: "scheduled" });
  });

  it("reads the single effective target period without reclassifying workout state", async () => {
    const client = new FakeSupabase(canonicalDataset());
    await expect(
      readTodayNutritionTargetsProjection(input(client)),
    ).resolves.toEqual({
      hasTarget: true,
      dailyCalories: 2500,
      proteinG: 190,
      carbsG: 275,
      fatG: 82,
      waterMl: 3200,
      sourceType: "training_day",
    });
    expect(client.operations).toBe(1);
    expect(client.selects.map(({ table }) => table)).toEqual([
      "nutrition_target_periods",
    ]);
  });

  it("preserves nullable target nutrients and does not guess unknown values", async () => {
    const dataset = canonicalDataset();
    dataset.nutrition_target_periods[0].protein_g = null;
    dataset.nutrition_target_periods[0].water_ml = null;
    await expect(
      readTodayNutritionTargetsProjection(input(new FakeSupabase(dataset))),
    ).resolves.toMatchObject({
      hasTarget: true,
      dailyCalories: 2500,
      proteinG: null,
      waterMl: null,
    });
  });

  it("returns no target when the latest candidate period ended before Today", async () => {
    const dataset = canonicalDataset();
    dataset.nutrition_target_periods[0].effective_to = "2026-08-03";
    await expect(
      readTodayNutritionTargetsProjection(input(new FakeSupabase(dataset))),
    ).resolves.toEqual({
      hasTarget: false,
      dailyCalories: null,
      proteinG: null,
      carbsG: null,
      fatG: null,
      waterMl: null,
      sourceType: "none",
    });
  });

  it("keeps target query count fixed as workout cardinality grows", async () => {
    const typicalData = canonicalDataset(4);
    const highData = canonicalDataset(200);
    highData.user_workout_plan_days.push(
      ...Array.from({ length: 12 }, (_, index) => ({
        id: `target-extra-day-${index}`,
        plan_id: planA,
        weekday: "Monday",
        day_number: index + 3,
        day_name: `Target extra ${index}`,
      })),
    );
    const typical = new FakeSupabase(typicalData);
    const high = new FakeSupabase(highData);
    await readTodayNutritionTargetsProjection(input(typical));
    await readTodayNutritionTargetsProjection(input(high));

    expect(typical.operations).toBe(1);
    expect(high.operations).toBe(1);
    expect(high.selects).toEqual([
      expect.objectContaining({ table: "nutrition_target_periods" }),
    ]);
  });
});
