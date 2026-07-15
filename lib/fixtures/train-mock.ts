import { addDays, todayIso } from "@/lib/date-utils";
import { MOCK_AUTH_USER_ID } from "@/lib/fixtures/mock-auth";
import type { UserWorkoutPlan, UserWorkoutPlanDay, UserWorkoutPlanExercise, Weekday, WorkoutSession } from "@/types";

const weekdays: Weekday[] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const planIds = {
  active: "10000000-0000-4000-8000-000000000001",
  inactive: "10000000-0000-4000-8000-000000000002",
  archived: "10000000-0000-4000-8000-000000000003"
};

export type MockTrainScenario = "active" | "scheduled" | "rest";
export type MockTrainVariant = "default" | "one-day-one-exercise" | "seven-day-many-exercises" | "long-names";

export function getMockTrainScenario(): MockTrainScenario {
  if (typeof window === "undefined") return "active";
  const value = window.localStorage.getItem("plaivra.qa.train-scenario");
  return value === "scheduled" || value === "rest" ? value : "active";
}

export function getMockTrainVariant(): MockTrainVariant {
  if (typeof window === "undefined") return "default";
  const value = window.localStorage.getItem("plaivra.qa.train-variant");
  if (value === "one-day-one-exercise" || value === "seven-day-many-exercises" || value === "long-names") return value;
  return "default";
}

function exercise(dayId: string, index: number, name: string, target: string, equipment: string): UserWorkoutPlanExercise {
  return {
    id: `${dayId.slice(0, -1)}${index + 1}`,
    plan_day_id: dayId,
    workout_id: null,
    source_workout_id: null,
    exercise_name: name,
    category: "strength",
    target_muscle: target,
    equipment,
    sets: index === 0 ? 4 : 3,
    reps: index === 0 ? "6-8" : "8-12",
    rest_seconds: index === 0 ? 120 : 75,
    instructions: `Controlled ${name.toLowerCase()} with stable form.`,
    exercise_url: index === 0 ? "https://example.com/exercise-guide" : null,
    video_url: null,
    custom_video_url: null,
    sort_order: index + 1,
    notes: index === 0 ? "Leave two repetitions in reserve." : null
  };
}

function day(planId: string, suffix: string, dayNumber: number, weekday: Weekday, name: string, items: Array<[string, string, string]>): UserWorkoutPlanDay {
  const id = `${planId.slice(0, -2)}${suffix}`;
  return {
    id,
    plan_id: planId,
    day_number: dayNumber,
    day_name: name,
    weekday,
    notes: dayNumber === 1 ? "Quality repetitions before added load." : null,
    exercises: items.map((item, index) => exercise(id, index, ...item))
  };
}

export function getMockTrainPlans(): UserWorkoutPlan[] {
  const scenario = getMockTrainScenario();
  const variant = getMockTrainVariant();
  const todayIndex = new Date().getDay();
  const activeOffsets = scenario === "rest" ? [1, 3, 5] : [0, 2, 4];
  const createdAt = `${addDays(todayIso(), -30)}T08:00:00.000Z`;
  const updatedAt = `${todayIso()}T08:00:00.000Z`;
  let activeDays = [
    day(planIds.active, "11", 1, weekdays[(todayIndex + activeOffsets[0]) % 7], "Strength A", [["Back Squat", "Legs", "Barbell"], ["Bench Press", "Chest", "Barbell"], ["Row", "Back", "Cable"], ["Plank", "Core", "Bodyweight"]]),
    day(planIds.active, "12", 2, weekdays[(todayIndex + activeOffsets[1]) % 7], "Strength B", [["Deadlift", "Back", "Barbell"], ["Overhead Press", "Shoulders", "Dumbbells"], ["Pulldown", "Back", "Cable"]]),
    day(planIds.active, "13", 3, weekdays[(todayIndex + activeOffsets[2]) % 7], "Strength C", [["Split Squat", "Legs", "Dumbbells"], ["Incline Press", "Chest", "Dumbbells"], ["Face Pull", "Shoulders", "Cable"]])
  ];
  if (variant === "one-day-one-exercise") {
    activeDays = [{ ...activeDays[0], exercises: activeDays[0].exercises.slice(0, 1) }];
  } else if (variant === "seven-day-many-exercises") {
    activeDays = Array.from({ length: 7 }, (_, index) => day(
      planIds.active,
      String(41 + index).padStart(2, "0"),
      index + 1,
      weekdays[(todayIndex + index) % 7],
      `Training Day ${index + 1}`,
      Array.from({ length: 10 }, (__, exerciseIndex): [string, string, string] => [
        `Exercise ${index + 1}.${exerciseIndex + 1}`,
        exerciseIndex % 2 ? "Upper body" : "Lower body",
        exerciseIndex % 3 ? "Dumbbells" : "Barbell"
      ])
    ));
  } else if (variant === "long-names") {
    activeDays = activeDays.map((item, dayIndex) => ({
      ...item,
      day_name: `${item.day_name} with a deliberately long translated-style day name ${dayIndex + 1}`,
      exercises: item.exercises.map((entry, exerciseIndex) => ({
        ...entry,
        exercise_name: `${entry.exercise_name} with a deliberately long catalog activity name ${exerciseIndex + 1}`
      }))
    }));
  }
  const inactiveDays = [day(planIds.inactive, "21", 1, weekdays[(todayIndex + 1) % 7], "Conditioning", [["Kettlebell Swing", "Full body", "Kettlebell"]])];
  const archivedDays = [day(planIds.archived, "31", 1, weekdays[(todayIndex + 3) % 7], "Foundation", [["Goblet Squat", "Legs", "Dumbbell"]])];

  return [
    { id: planIds.active, user_id: MOCK_AUTH_USER_ID, name: variant === "long-names" ? "Strength Foundation with a deliberately long plan name that must wrap without horizontal overflow" : "Strength Foundation", is_active: true, is_default: true, source: "chatgpt", goal: "Strength", description: "A balanced strength plan.", chatgpt_source: true, session_duration_minutes: 55, archived_at: null, program_duration_weeks: 8, days_per_week: activeDays.length, created_at: createdAt, updated_at: updatedAt, days: activeDays },
    { id: planIds.inactive, user_id: MOCK_AUTH_USER_ID, name: "Conditioning Option", is_active: false, is_default: false, source: "manual", goal: "Conditioning", description: "A compact alternative plan.", session_duration_minutes: 35, archived_at: null, program_duration_weeks: 4, days_per_week: 1, created_at: createdAt, updated_at: updatedAt, days: inactiveDays },
    { id: planIds.archived, user_id: MOCK_AUTH_USER_ID, name: "Archived Foundation", is_active: false, is_default: false, source: "manual", goal: "Technique", description: "Preserved historical plan.", session_duration_minutes: 40, archived_at: `${addDays(todayIso(), -14)}T09:00:00.000Z`, program_duration_weeks: 6, days_per_week: 1, created_at: createdAt, updated_at: updatedAt, days: archivedDays }
  ];
}

export function getMockTrainActivity(): WorkoutSession[] {
  const scenario = getMockTrainScenario();
  const plans = getMockTrainPlans();

  const activePlan = plans.find((plan) => plan.id === planIds.active);
  const todayDay = activePlan?.days[0];

  if (!activePlan || !todayDay) {
    return [];
  }

  const completedDay = activePlan.days[1] ?? todayDay;
  const skippedDay = activePlan.days[2] ?? todayDay;

  const history: WorkoutSession[] = [
    {
      id: "20000000-0000-4000-8000-000000000002",
      user_id: MOCK_AUTH_USER_ID,
      workout_id: null,
      plan_id: activePlan.id,
      plan_day_id: completedDay.id,
      workout_day_name: completedDay.day_name,
      workout_category: "strength",
      workout_name: completedDay.day_name,
      started_at: `${addDays(todayIso(), -5)}T08:00:00.000Z`,
      completed_at: `${addDays(todayIso(), -5)}T08:52:00.000Z`,
      skipped_at: null,
      duration_minutes: 52,
      notes: "Completed fixture session",
      status: "completed"
    },
    {
      id: "20000000-0000-4000-8000-000000000003",
      user_id: MOCK_AUTH_USER_ID,
      workout_id: null,
      plan_id: activePlan.id,
      plan_day_id: skippedDay.id,
      workout_day_name: skippedDay.day_name,
      workout_category: "strength",
      workout_name: skippedDay.day_name,
      started_at: `${addDays(todayIso(), -3)}T08:00:00.000Z`,
      completed_at: null,
      skipped_at: `${addDays(todayIso(), -3)}T08:05:00.000Z`,
      duration_minutes: null,
      notes: "[skipped] Fixture",
      status: "skipped"
    }
  ];

  if (scenario !== "active") {
    return history;
  }

  return [
    {
      id: "20000000-0000-4000-8000-000000000001",
      user_id: MOCK_AUTH_USER_ID,
      workout_id: null,
      plan_id: activePlan.id,
      plan_day_id: todayDay.id,
      workout_day_name: todayDay.day_name,
      workout_category: "strength",
      workout_name: todayDay.day_name,
      started_at: `${todayIso()}T08:00:00.000Z`,
      completed_at: null,
      skipped_at: null,
      duration_minutes: null,
      notes: null,
      status: "started"
    },
    ...history
  ];
}
