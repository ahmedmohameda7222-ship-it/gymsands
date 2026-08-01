import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/i18n/train", () => ({
  useTrainTranslation: () => ({
    locale: "en-US",
    tr: (key: string, values?: Record<string, string | number>) =>
      values?.count === undefined ? key : `${key}:${values.count}`,
  }),
}));

import { WorkoutHistoryDesktopPreview } from "@/components/workouts/history/workout-history-desktop-preview";
import type { WorkoutHistorySessionSummary } from "@/types/workout-history";

const range = {
  from: "2026-06-01T00:00:00.000Z",
  to: "2026-09-01T00:00:00.000Z",
  timezone: "UTC",
};
const summary = {
  eligibleWorkoutCount: 3,
  trustedDurationMinutes: 140,
  completedSetCount: 28,
  reliableVolume: 12_400,
  verifiedRecordCount: null,
};

function item(): WorkoutHistorySessionSummary {
  return {
    contractVersion: 1,
    activityId: "11111111-1111-4111-8111-111111111111",
    canonicalSessionId: "11111111-1111-4111-8111-111111111111",
    scheduledSessionId: null,
    userId: "22222222-2222-4222-8222-222222222222",
    sourceKind: "performed",
    lifecycle: "completed",
    title: "Strength B",
    category: "Strength",
    effectiveAt: "2026-07-27T09:00:00.000Z",
    startedAt: "2026-07-27T08:08:00.000Z",
    completedAt: "2026-07-27T09:00:00.000Z",
    skippedAt: null,
    cancelledAt: null,
    durationMinutes: 52,
    notes: "Private note that must not appear in preview",
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
    completedSetCount: 8,
    reliableVolume: 5_420,
    verifiedRecordCount: null,
    exerciseIds: [],
    exerciseNames: ["Squat", "Row", "Bench press", "Curl"],
    muscleIds: [],
    insight: "Steady work across all exercises.",
  };
}

describe("Workout History desktop preview", () => {
  it("shows period context and a compact four-cell aggregate before selection", () => {
    const markup = renderToStaticMarkup(
      <WorkoutHistoryDesktopPreview item={null} summary={summary} range={range} periodDays={92} />,
    );

    expect(markup).toContain("historyPeriodContext");
    expect(markup).toContain("historyNoPreviewSelection");
    expect((markup.match(/<section/g) ?? [])).toHaveLength(1);
    expect((markup.match(/<bdi/g) ?? [])).toHaveLength(4);
  });

  it("shows only compact trusted selection data and the canonical detail link", () => {
    const markup = renderToStaticMarkup(
      <WorkoutHistoryDesktopPreview item={item()} summary={summary} range={range} periodDays={92} />,
    );

    expect(markup).toContain("historySelectedWorkout");
    expect(markup).toContain("Strength B");
    expect(markup).toContain("Steady work across all exercises.");
    expect(markup).toContain('/workout-history/11111111-1111-4111-8111-111111111111');
    expect(markup).not.toContain("Private note");
    expect(markup).not.toContain("5420");
    expect((markup.match(/<dd/g) ?? [])).toHaveLength(3);
    expect((markup.match(/rounded-full/g) ?? [])).toHaveLength(3);
  });
});
