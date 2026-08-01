import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/i18n/train", () => ({
  useTrainTranslation: () => ({
    locale: "en-US",
    tr: (key: string, values?: Record<string, string | number>) =>
      values?.count === undefined ? key : `${key}:${values.count}`,
  }),
}));

import { WorkoutHistoryCard } from "@/components/workouts/history/workout-history-card";
import type { WorkoutHistorySessionSummary } from "@/types/workout-history";

function item(overrides: Partial<WorkoutHistorySessionSummary> = {}): WorkoutHistorySessionSummary {
  return {
    contractVersion: 1,
    activityId: "11111111-1111-4111-8111-111111111111",
    canonicalSessionId: "11111111-1111-4111-8111-111111111111",
    scheduledSessionId: null,
    userId: "22222222-2222-4222-8222-222222222222",
    sourceKind: "performed",
    lifecycle: "completed",
    title: "Push day",
    category: "Strength",
    effectiveAt: "2026-08-01T08:45:00.000Z",
    startedAt: "2026-08-01T08:00:00.000Z",
    completedAt: "2026-08-01T08:45:00.000Z",
    skippedAt: null,
    cancelledAt: null,
    durationMinutes: 45,
    notes: null,
    planId: null,
    planDayId: null,
    planWeekId: null,
    planSessionId: null,
    hasPerformedSets: true,
    hasMeaningfulPerformance: true,
    capabilities: {
      openDetails: true,
      showPerformedSets: true,
      showPlannedVsActual: true,
      showMuscleAnalysis: true,
      calculatePerformanceMetrics: true,
      calculateVerifiedRecords: false,
      repeatWorkout: false,
      correctSession: false,
      softDeleteSession: false,
    },
    exerciseCount: 4,
    completedSetCount: 12,
    reliableVolume: 5_200,
    verifiedRecordCount: null,
    exerciseIds: [],
    exerciseNames: ["Bench press", "Row", "Shoulder press"],
    muscleIds: [],
    insight: null,
    ...overrides,
  };
}

describe("Workout History mobile card", () => {
  it("renders a compact full-card detail link with no expanded data graph", () => {
    const markup = renderToStaticMarkup(<WorkoutHistoryCard item={item()} />);

    expect(markup).toContain("data-workout-history-card");
    expect(markup).toContain("min-h-[158px]");
    expect(markup).toContain('/workout-history/11111111-1111-4111-8111-111111111111');
    expect(markup).toContain("Push day");
    expect(markup).not.toContain("5200");
    expect(markup).not.toContain("notes");
    expect((markup.match(/<dl/g) ?? [])).toHaveLength(1);
    expect((markup.match(/<dd/g) ?? [])).toHaveLength(3);
  });

  it("shows a lifecycle indicator only for an exceptional state", () => {
    const completed = renderToStaticMarkup(<WorkoutHistoryCard item={item()} />);
    const partial = renderToStaticMarkup(<WorkoutHistoryCard item={item({ lifecycle: "partial" })} />);

    expect(completed).not.toContain("historyPartial");
    expect(partial).toContain("historyPartial");
  });
});
