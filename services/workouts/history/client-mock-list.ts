"use client";

import { summarizeWorkoutHistory } from "@/lib/workouts/history/metrics";
import { presentWorkoutHistorySession } from "@/lib/workouts/history/presentation";
import {
  mockHistory,
  renderedQaScenario,
} from "@/services/workouts/history/client-mock-shared";
import { WorkoutHistoryClientError } from "@/services/workouts/history/client-error";
import {
  WORKOUT_HISTORY_CONTRACT_VERSION,
  type WorkoutHistoryListRequest,
  type WorkoutHistoryListResponse,
} from "@/types/workout-history";

export function mockHistoryList(
  userId: string,
  request: WorkoutHistoryListRequest,
): WorkoutHistoryListResponse {
  const search =
    request.search?.toLocaleLowerCase("en-US") ?? "";
  const items = mockHistory(userId, 100)
    .activities.map((activity) =>
      presentWorkoutHistorySession(activity, {
        exerciseCount:
          activity.lifecycle === "completed" ? 4 : null,
        completedSetCount:
          activity.lifecycle === "completed" ? 8 : null,
        reliableVolume:
          activity.lifecycle === "completed" ? 5_420 : null,
        exerciseNames:
          activity.lifecycle === "completed"
            ? ["Bench press", "Row"]
            : [],
        exerciseIds:
          activity.lifecycle === "completed"
            ? [
                "global:40000000-0000-4000-8000-000000000001",
                "global:40000000-0000-4000-8000-000000000002",
              ]
            : [],
        muscleIds:
          activity.lifecycle === "completed"
            ? ["pectoralis_major_sternal"]
            : [],
      }),
    )
    .filter((item) => {
      const effectiveAt = Date.parse(item.effectiveAt);
      if (
        effectiveAt < Date.parse(request.from) ||
        effectiveAt >= Date.parse(request.to)
      ) {
        return false;
      }
      if (
        request.statuses?.length &&
        !request.statuses.includes(item.lifecycle)
      ) {
        return false;
      }
      if (request.progressOnly && !item.hasMeaningfulPerformance) {
        return false;
      }
      if (
        request.workoutTypes?.length &&
        (!item.category ||
          !request.workoutTypes.includes(item.category))
      ) {
        return false;
      }
      if (
        request.muscleIds?.length &&
        !request.muscleIds.some((id) =>
          item.muscleIds.includes(id),
        )
      ) {
        return false;
      }
      if (
        request.exerciseIds?.length &&
        !request.exerciseIds.some((id) =>
          item.exerciseIds.includes(id),
        )
      ) {
        return false;
      }
      if (
        request.planIds?.length &&
        (!item.planId || !request.planIds.includes(item.planId))
      ) {
        return false;
      }
      return (
        !search ||
        [item.title, ...item.exerciseNames]
          .join(" ")
          .toLocaleLowerCase("en-US")
          .includes(search)
      );
    });
  return {
    contractVersion: WORKOUT_HISTORY_CONTRACT_VERSION,
    period: {
      from: request.from,
      to: request.to,
      timezone: request.timezone,
    },
    summary: summarizeWorkoutHistory(items),
    items: items.slice(0, request.limit ?? 20),
    nextCursor: null,
    notices: [],
    filterOptions: {
      workoutTypes: [{ value: "strength", label: "Strength" }],
      muscles: [
        {
          value: "pectoralis_major_sternal",
          label: "Pectoralis major",
        },
      ],
      exercises: [
        {
          value:
            "global:40000000-0000-4000-8000-000000000001",
          label: "Bench press",
        },
        {
          value:
            "global:40000000-0000-4000-8000-000000000002",
          label: "Row",
        },
      ],
      plans: [],
    },
  };
}

function qaSummary(
  items: WorkoutHistoryListResponse["items"],
): WorkoutHistoryListResponse["summary"] {
  return summarizeWorkoutHistory(items);
}

export async function mockHistoryListForRenderedQa(
  userId: string,
  request: WorkoutHistoryListRequest,
): Promise<WorkoutHistoryListResponse> {
  const scenario = renderedQaScenario();
  if (scenario === "initial-loading") {
    await new Promise((resolve) =>
      window.setTimeout(resolve, 1_200),
    );
  }
  if (scenario === "blocking-error") {
    throw new WorkoutHistoryClientError(
      "history_unavailable",
      "Workout history could not load.",
      503,
    );
  }

  let base = mockHistoryList(userId, request);
  const renderedQaPrototype =
    base.items[0] ??
    mockHistoryList(userId, {
      ...request,
      from: "2000-01-01T00:00:00.000Z",
      to: "2100-01-01T00:00:00.000Z",
      cursor: undefined,
      limit: 1,
    }).items[0] ??
    null;
  if (
    scenario === "first-use-empty" ||
    scenario === "filtered-empty"
  ) {
    return {
      ...base,
      items: [],
      summary: qaSummary([]),
      nextCursor: null,
    };
  }
  if (scenario && base.items.length === 0 && renderedQaPrototype) {
    const fallbackItems = [
      {
        ...renderedQaPrototype,
        effectiveAt: new Date(
          Date.parse(request.to) - 60 * 60 * 1000,
        ).toISOString(),
      },
    ];
    base = {
      ...base,
      items: fallbackItems,
      summary: qaSummary(fallbackItems),
    };
  }
  if (
    scenario === "stale-cached-data" ||
    scenario === "offline-cached-read"
  ) {
    return { ...base, notices: ["stale-data"] };
  }
  if (scenario === "partial-session" && base.items[0]) {
    const items = [
      { ...base.items[0], lifecycle: "partial" as const },
      ...base.items.slice(1),
    ];
    return { ...base, items, summary: qaSummary(items) };
  }
  if (scenario === "cancelled-meaningful" && base.items[0]) {
    const items = [
      {
        ...base.items[0],
        lifecycle: "cancelled" as const,
        cancelledAt: base.items[0].effectiveAt,
        completedAt: null,
        hasMeaningfulPerformance: true,
      },
      ...base.items.slice(1),
    ];
    return { ...base, items, summary: qaSummary(items) };
  }
  if (scenario === "scheduled-fallback" && base.items[0]) {
    const scheduledId =
      "21000000-0000-4000-8000-000000000001";
    const items = [
      {
        ...base.items[0],
        activityId: `scheduled:${scheduledId}`,
        canonicalSessionId: null,
        scheduledSessionId: scheduledId,
        sourceKind: "scheduled_fallback" as const,
        title: "Saved scheduled workout",
        hasPerformedSets: false,
        hasMeaningfulPerformance: false,
        reliableVolume: null,
        completedSetCount: null,
      },
    ];
    return { ...base, items, summary: qaSummary(items) };
  }
  if (
    (scenario === "long-history" ||
      scenario === "incremental-load") &&
    renderedQaPrototype
  ) {
    const offset = request.cursor ? 20 : 0;
    const count = request.cursor ? 12 : 20;
    const rangeEnd = Date.parse(request.to) - 60 * 60 * 1000;
    const items = Array.from({ length: count }, (_, index) => {
      const ordinal = offset + index + 1;
      const id = `22000000-0000-4000-8000-${String(
        ordinal,
      ).padStart(12, "0")}`;
      return {
        ...renderedQaPrototype,
        activityId: `performed:${id}`,
        canonicalSessionId: id,
        title: `Progressive strength session ${ordinal}`,
        effectiveAt: new Date(
          rangeEnd - (ordinal - 1) * 6 * 60 * 60 * 1000,
        ).toISOString(),
      };
    });
    return {
      ...base,
      items,
      summary: qaSummary(items),
      nextCursor: request.cursor
        ? null
        : "qa-workout-history-next-page",
    };
  }
  if (scenario === "long-translations" && base.items[0]) {
    const language = document.documentElement.lang;
    const title =
      language === "ar"
        ? "جلسة قوة طويلة متعددة المراحل مع اسم مترجم ممتد لاختبار الالتفاف الصحيح"
        : language === "de"
          ? "Mehrstufiges progressives Krafttraining mit besonders langer übersetzter Bezeichnung"
          : "Multi-stage progressive strength workout with a deliberately long translated title";
    const items = [
      {
        ...base.items[0],
        title,
        exerciseNames: [title],
      },
    ];
    return { ...base, items, summary: qaSummary(items) };
  }
  if (scenario === "semantic-non-strength-list" && base.items[0]) {
    const items = [{
      ...base.items[0],
      title: "City endurance run",
      category: "running",
      resultKind: "semantic_metrics" as const,
      resultFacts: [
        { metricKey: "distance_meters", side: "none" as const, value: 5_000, unit: "m" },
        { metricKey: "duration_seconds", side: "none" as const, value: 2_100, unit: "s" },
      ],
      capabilities: {
        ...base.items[0].capabilities,
        showPerformedSets: false,
        showPlannedVsActual: false,
        showMuscleAnalysis: false,
        repeatWorkout: false,
        correctSession: false,
      },
    }];
    return { ...base, items, summary: qaSummary(items) };
  }
  return base;
}