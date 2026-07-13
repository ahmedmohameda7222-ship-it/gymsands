import { describe, expect, it } from "vitest";
import {
  deriveDashboardProfileContext,
  getDashboardWorkoutData,
  resolveDashboardWellnessResults,
  type DashboardWorkoutDependencies
} from "@/services/database/dashboard-today-sources";
import type { FitnessHabit, UserWorkoutPlan } from "@/types";

const emptyDependencies: DashboardWorkoutDependencies = {
  loadPlan: async () => null,
  loadHistory: async () => [],
  loadOpenSession: async () => null
};

describe("strict Dashboard workout loading", () => {
  it("rejects when the plan query fails instead of reporting a rest day", async () => {
    await expect(getDashboardWorkoutData("user", "2026-07-13", {
      ...emptyDependencies,
      loadPlan: async () => { throw new Error("plan unavailable"); }
    })).rejects.toThrow("plan unavailable");
  });

  it("rejects when workout history fails instead of using an empty list", async () => {
    await expect(getDashboardWorkoutData("user", "2026-07-13", {
      ...emptyDependencies,
      loadHistory: async () => { throw new Error("history unavailable"); }
    })).rejects.toThrow("history unavailable");
  });

  it("rejects when the open-session query fails", async () => {
    const plan = {
      id: "plan",
      user_id: "user",
      name: "Plan",
      is_active: true,
      created_at: "2026-07-01T00:00:00Z",
      updated_at: "2026-07-01T00:00:00Z",
      days: [{ id: "day", plan_id: "plan", day_number: 1, day_name: "Monday", weekday: "Monday", notes: null, exercises: [{ id: "exercise", plan_day_id: "day" }] }]
    } as UserWorkoutPlan;
    await expect(getDashboardWorkoutData("user", "2026-07-13", {
      ...emptyDependencies,
      loadPlan: async () => plan,
      loadOpenSession: async () => { throw new Error("open session unavailable"); }
    })).rejects.toThrow("open session unavailable");
  });

  it("returns a genuine empty workout state after successful empty queries", async () => {
    await expect(getDashboardWorkoutData("user", "2026-07-13", emptyDependencies)).resolves.toEqual({
      plan: null,
      day: null,
      sessions: [],
      openSessionId: null
    });
  });
});

describe("minimum prompt profile context", () => {
  it("derives goals, training preferences, nutrition preferences, and constraints independently", () => {
    expect(deriveDashboardProfileContext({
      onboarding: { goals: ["Build muscle"], training_days_per_week: 3 },
      nutritionPreferences: { preferred_cuisines: ["Egyptian"] },
      constraints: { pain_sensitive_areas: ["lower back"] }
    })).toEqual({
      state: "loaded",
      hasGoals: true,
      hasTrainingPreferences: true,
      hasNutritionPreferences: true,
      hasConstraints: true
    });
  });

  it("does not hardcode nutrition preferences when a saved profile exists", () => {
    expect(deriveDashboardProfileContext({
      onboarding: {},
      nutritionPreferences: { meals_per_day: 4 },
      constraints: null
    }).hasNutritionPreferences).toBe(true);
  });
});

describe("partial wellness source resolution", () => {
  it("preserves successful groups when one wellness source fails", () => {
    const habit = { id: "habit", name: "Walk", completed: false } as FitnessHabit;
    const result = resolveDashboardWellnessResults({
      habits: { status: "fulfilled", value: [habit] },
      supplements: { status: "rejected", reason: new Error("failed") },
      sleep: { status: "fulfilled", value: [] },
      unavailableMessage: "Unavailable"
    });
    expect(result.habits).toEqual([habit]);
    expect(result.supplements).toEqual([]);
    expect(result.errors).toEqual({ habits: undefined, supplements: "Unavailable", sleep: undefined });
  });
});
