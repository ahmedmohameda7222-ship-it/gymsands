import {
  TODAY_PROJECTION_CONTRACT_VERSION,
  type TodayProjectionResponseV1,
} from "@/lib/dashboard/today-projection-contract";

export function createTodayProjectionFixture(
  overrides: Partial<
    Pick<TodayProjectionResponseV1, "date" | "timezone" | "generatedAt">
  > = {},
): TodayProjectionResponseV1 {
  const date = overrides.date ?? "2026-08-03";
  const timezone = overrides.timezone ?? "Europe/Berlin";
  return {
    contractVersion: TODAY_PROJECTION_CONTRACT_VERSION,
    date,
    timezone,
    generatedAt: overrides.generatedAt ?? "2026-08-03T08:00:00.000Z",
    workout: {
      state: "loaded",
      value: {
        hasPlan: false,
        planId: null,
        sessionDurationMinutes: null,
        dayId: null,
        dayName: null,
        exerciseCount: null,
        previewExercises: [],
        state: "none",
        actionHref: null,
        activeSessionId: null,
        completedSessionId: null,
        recentCompletedCount: 0,
      },
      errorCode: null,
    },
    meals: {
      state: "loaded",
      value: { items: [], itemCount: 0, plannedCount: 0 },
      errorCode: null,
    },
    nutrition: {
      logs: {
        state: "loaded",
        value: {
          totals: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
          foodLogCount: 0,
        },
        errorCode: null,
      },
      targets: {
        state: "loaded",
        value: {
          hasTarget: false,
          dailyCalories: 0,
          proteinG: 0,
          carbsG: 0,
          fatG: 0,
          waterMl: 0,
          sourceType: "none",
        },
        errorCode: null,
      },
    },
    hydration: {
      state: "loaded",
      value: { totalMl: 0, logCount: 0 },
      errorCode: null,
    },
    shopping: {
      state: "loaded",
      value: { items: [], itemCount: 0 },
      errorCode: null,
    },
    wellness: {
      state: "loaded",
      habits: {
        state: "loaded",
        value: {
          plannedCount: 0,
          completedCount: 0,
          openCount: 0,
          openPreviewNames: [],
        },
        errorCode: null,
      },
      supplements: {
        state: "loaded",
        value: {
          plannedCount: 0,
          takenCount: 0,
          remainingCount: 0,
          remainingPreviewNames: [],
        },
        errorCode: null,
      },
      sleep: {
        state: "loaded",
        value: {
          hasData: false,
          hoursSlept: null,
          recoveryLevel: null,
          fatigueLevel: null,
          poorRecovery: false,
        },
        errorCode: null,
      },
    },
    profileContext: {
      state: "loaded",
      value: {
        state: "loaded",
        hasGoals: false,
        hasTrainingPreferences: false,
        hasNutritionPreferences: false,
        hasConstraints: false,
      },
      errorCode: null,
    },
    progressContext: {
      state: "loaded",
      value: { state: "loaded", entryCount: 0 },
      errorCode: null,
    },
    promptContext: {
      workout: {
        state: "loaded",
        hasPlan: false,
        scheduled: false,
        active: false,
        completed: false,
        skipped: false,
        title: null,
        exerciseCount: null,
        durationMinutes: null,
        historyCount: 0,
      },
      nutrition: {
        targetsState: "loaded",
        foodLogsState: "loaded",
        hasTargets: false,
        remainingCalories: null,
        remainingProtein: null,
        remainingCarbs: null,
        remainingFat: null,
        foodLogCount: 0,
        mealPlanCount: 0,
        plannedMealCount: 0,
      },
      grocery: { state: "loaded", itemCount: 0 },
      hydration: {
        state: "loaded",
        hasTarget: false,
        logCount: 0,
        remainingMl: null,
      },
      recovery: {
        state: "loaded",
        hasData: false,
        sleepHours: null,
        poorRecovery: false,
      },
      wellness: {
        state: "loaded",
        habitCount: 0,
        supplementCount: 0,
      },
      progress: { state: "loaded", entryCount: 0 },
      profile: {
        state: "loaded",
        hasGoals: false,
        hasTrainingPreferences: false,
        hasNutritionPreferences: false,
        hasConstraints: false,
      },
      endOfWeek: false,
    },
  };
}
