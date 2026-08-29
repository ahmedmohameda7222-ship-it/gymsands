"use client";

import { env } from "@/lib/env";
import { isMockAuthUserId } from "@/lib/fixtures/mock-auth";
import {
  TODAY_PROJECTION_CONTRACT_VERSION,
  parseTodayProjectionResponseV1,
  TodayProjectionContractError,
  type TodayProjectionResponseV1,
} from "@/lib/dashboard/today-projection-contract";
import { isUuid } from "@/lib/utils";

export type TodayProjectionRequestContext = {
  accessToken: string | null | undefined;
  signal?: AbortSignal;
};

export class TodayProjectionClientError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "TodayProjectionClientError";
    this.code = code;
    this.status = status;
  }
}

function safeError(status: number, code?: unknown) {
  if (status === 401) {
    return new TodayProjectionClientError(
      "sign_in_required",
      "Please sign in to view Today.",
      status,
    );
  }
  if (status === 403) {
    return new TodayProjectionClientError(
      typeof code === "string" ? code : "today_access_denied",
      "Today is not available for this account.",
      status,
    );
  }
  if (status === 429) {
    return new TodayProjectionClientError(
      "today_rate_limited",
      "Too many Today requests. Please try again shortly.",
      status,
    );
  }
  return new TodayProjectionClientError(
    "today_projection_unavailable",
    "Today could not load.",
    status || 503,
  );
}

function mockTodayProjection(
  date: string,
  timezone: string,
): TodayProjectionResponseV1 {
  return {
    contractVersion: TODAY_PROJECTION_CONTRACT_VERSION,
    date,
    timezone,
    generatedAt: `${date}T08:00:00.000Z`,
    workout: {
      state: "loaded",
      errorCode: null,
      value: {
        hasPlan: true,
        planId: "11111111-1111-4111-8111-111111111121",
        sessionDurationMinutes: 55,
        dayId: "11111111-1111-4111-8111-111111111122",
        dayName: "Upper body strength",
        exerciseCount: 4,
        previewExercises: [
          {
            id: "11111111-1111-4111-8111-111111111123",
            name: "Bench press",
            sets: 4,
            reps: "6-8",
          },
          {
            id: "11111111-1111-4111-8111-111111111124",
            name: "Lat pulldown",
            sets: 3,
            reps: "8-10",
          },
          {
            id: "11111111-1111-4111-8111-111111111125",
            name: "Seated row",
            sets: 3,
            reps: 10,
          },
        ],
        state: "scheduled",
        actionHref:
          "/workouts/session/day/11111111-1111-4111-8111-111111111122",
        activeSessionId: null,
        completedSessionId: null,
        recentCompletedCount: 6,
      },
    },
    meals: {
      state: "loaded",
      errorCode: null,
      value: {
        items: [
          {
            id: "11111111-1111-4111-8111-111111111126",
            mealSlotKey: "Dinner",
            name: "Chicken rice bowl",
            calories: 690,
            proteinG: 52,
            status: "planned",
          },
        ],
        itemCount: 1,
        plannedCount: 1,
      },
    },
    nutrition: {
      logs: {
        state: "loaded",
        errorCode: null,
        value: {
          totals: {
            calories: 1260,
            proteinG: 96,
            carbsG: 132,
            fatG: 38,
          },
          foodLogCount: 3,
        },
      },
      targets: {
        state: "loaded",
        errorCode: null,
        value: {
          hasTarget: true,
          dailyCalories: 2400,
          proteinG: 180,
          carbsG: 260,
          fatG: 80,
          waterMl: 3000,
          sourceType: "training_day",
        },
      },
    },
    hydration: {
      state: "loaded",
      errorCode: null,
      value: { totalMl: 1750, logCount: 4 },
    },
    shopping: {
      state: "loaded",
      errorCode: null,
      value: {
        items: [
          {
            id: "11111111-1111-4111-8111-111111111127",
            weekStart: date,
            itemName: "Greek yogurt",
            quantity: 2,
            unit: "cups",
            storeSection: "Dairy",
            checked: false,
            alreadyHave: false,
          },
          {
            id: "11111111-1111-4111-8111-111111111128",
            weekStart: date,
            itemName: "Rice",
            quantity: 1,
            unit: "kg",
            storeSection: "Pantry",
            checked: true,
            alreadyHave: false,
          },
        ],
        itemCount: 2,
      },
    },
    wellness: {
      state: "loaded",
      habits: {
        state: "loaded",
        errorCode: null,
        value: {
          plannedCount: 3,
          completedCount: 2,
          openCount: 1,
          openPreviewNames: ["Stretch for ten minutes"],
        },
      },
      supplements: {
        state: "loaded",
        errorCode: null,
        value: {
          plannedCount: 2,
          takenCount: 1,
          remainingCount: 1,
          remainingPreviewNames: ["Creatine"],
        },
      },
      sleep: {
        state: "loaded",
        errorCode: null,
        value: {
          hasData: true,
          hoursSlept: 7.5,
          recoveryLevel: "medium",
          fatigueLevel: "low",
          poorRecovery: false,
        },
      },
    },
    profileContext: {
      state: "loaded",
      errorCode: null,
      value: {
        state: "loaded",
        hasGoals: true,
        hasTrainingPreferences: true,
        hasNutritionPreferences: true,
        hasConstraints: false,
      },
    },
    progressContext: {
      state: "loaded",
      errorCode: null,
      value: { state: "loaded", entryCount: 5 },
    },
    promptContext: {
      workout: {
        state: "loaded",
        hasPlan: true,
        scheduled: true,
        active: false,
        completed: false,
        skipped: false,
        title: "Upper body strength",
        exerciseCount: 4,
        durationMinutes: 55,
        historyCount: 6,
      },
      nutrition: {
        targetsState: "loaded",
        foodLogsState: "loaded",
        hasTargets: true,
        remainingCalories: 1140,
        remainingProtein: 84,
        remainingCarbs: 128,
        remainingFat: 42,
        foodLogCount: 3,
        mealPlanCount: 1,
        plannedMealCount: 1,
      },
      grocery: { state: "loaded", itemCount: 2 },
      hydration: {
        state: "loaded",
        hasTarget: true,
        logCount: 4,
        remainingMl: 1250,
      },
      recovery: {
        state: "loaded",
        hasData: true,
        sleepHours: 7.5,
        poorRecovery: false,
      },
      wellness: {
        state: "loaded",
        habitCount: 3,
        supplementCount: 2,
      },
      progress: { state: "loaded", entryCount: 5 },
      profile: {
        state: "loaded",
        hasGoals: true,
        hasTrainingPreferences: true,
        hasNutritionPreferences: true,
        hasConstraints: false,
      },
      endOfWeek: false,
    },
  };
}

export async function getTodayProjection(
  userId: string,
  date: string,
  timezone: string,
  context: TodayProjectionRequestContext,
): Promise<TodayProjectionResponseV1> {
  if (!isUuid(userId)) {
    throw new TodayProjectionClientError(
      "sign_in_required",
      "Please sign in to view Today.",
      401,
    );
  }

  if (env.useMockAuth && isMockAuthUserId(userId)) {
    return mockTodayProjection(date, timezone);
  }

  if (!context.accessToken) {
    throw new TodayProjectionClientError(
      "sign_in_required",
      "Please sign in to view Today.",
      401,
    );
  }

  const params = new URLSearchParams({ date, timezone });
  const response = await fetch(`/api/dashboard/today?${params.toString()}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${context.accessToken}` },
    credentials: "same-origin",
    cache: "no-store",
    signal: context.signal,
  });

  const payload = (await response.json().catch(() => null)) as
    | { code?: unknown }
    | null;
  if (!response.ok) throw safeError(response.status, payload?.code);

  try {
    const projection = parseTodayProjectionResponseV1(payload);
    if (projection.date !== date || projection.timezone !== timezone) {
      throw new TodayProjectionContractError();
    }
    return projection;
  } catch (error) {
    if (error instanceof TodayProjectionContractError) {
      throw new TodayProjectionClientError(
        error.code,
        "Today could not load.",
        503,
      );
    }
    throw new TodayProjectionClientError(
      "today_projection_invalid",
      "Today could not load.",
      503,
    );
  }
}
