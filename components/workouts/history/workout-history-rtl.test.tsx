import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/i18n/train", () => ({
  useTrainTranslation: () => ({
    locale: "ar",
    tr: (key: string, values?: Record<string, string | number>) =>
      values?.count === undefined ? key : `${key}:${values.count}`,
  }),
}));

import { WorkoutHistoryDesktopPreview } from "@/components/workouts/history/workout-history-desktop-preview";
import type { WorkoutHistorySessionSummary } from "@/types/workout-history";

const item: WorkoutHistorySessionSummary = {
  contractVersion: 1,
  activityId: "11111111-1111-4111-8111-111111111111",
  canonicalSessionId: "11111111-1111-4111-8111-111111111111",
  scheduledSessionId: null,
  userId: "22222222-2222-4222-8222-222222222222",
  sourceKind: "performed",
  lifecycle: "completed",
  title: "تمرين القوة",
  category: null,
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
  exerciseCount: 3,
  completedSetCount: 9,
  reliableVolume: 2_500,
  verifiedRecordCount: null,
  exerciseIds: [],
  exerciseNames: ["القرفصاء"],
  muscleIds: [],
  insight: null,
};

describe("Workout History RTL behavior", () => {
  it("keeps numeric unit pairs LTR and mirrors the detail chevron", () => {
    const markup = renderToStaticMarkup(
      <div dir="rtl">
        <WorkoutHistoryDesktopPreview
          item={item}
          summary={{ eligibleWorkoutCount: 1, trustedDurationMinutes: 45, completedSetCount: 9, reliableVolume: 2_500, verifiedRecordCount: null }}
          range={{ from: "2026-08-01T00:00:00.000Z", to: "2026-08-02T00:00:00.000Z", timezone: "UTC" }}
          periodDays={1}
        />
      </div>,
    );

    expect(markup).toContain('dir="rtl"');
    expect((markup.match(/<bdi dir="ltr"/g) ?? [])).toHaveLength(3);
    expect(markup).toContain("rtl:rotate-180");
  });

  it("lets CSS direction mirror columns while preserving newest-first logical chronology", () => {
    const page = readFileSync("components/workouts/history/workout-history-page.tsx", "utf8");
    const timeline = readFileSync("components/workouts/history/workout-history-timeline.tsx", "utf8");

    expect(page).toContain('dir={dir}');
    expect(page).toContain("lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]");
    expect(timeline).toContain("newest-first logical order in both LTR and RTL");
    expect(timeline).not.toContain(".reverse(");
  });
});
