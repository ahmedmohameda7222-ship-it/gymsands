import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/i18n/train", () => ({
  useTrainTranslation: () => ({
    language: "en",
    dir: "ltr",
    locale: "en-US",
    tr: (key: string, values?: Record<string, string | number>) => values
      ? `${key}:${Object.values(values).join(":")}`
      : key,
  }),
}));

import { ExerciseHistorySection } from "@/components/workouts/history/exercise-history-section";
import { SessionHistorySummary } from "@/components/workouts/history/session-history-summary";
import type { WorkoutHistorySessionDetailResponse } from "@/types/workout-history";

function detail(sourceKind: "performed" | "scheduled_fallback" = "performed"): WorkoutHistorySessionDetailResponse {
  const performed = sourceKind === "performed";
  return {
    contractVersion: 1,
    resultKind: performed ? "strength_sets" : "limited",
    activity: {
      contractVersion: 1,
      activityId: performed ? "11111111-1111-4111-8111-111111111111" : "scheduled:11111111-1111-4111-8111-111111111111",
      canonicalSessionId: performed ? "11111111-1111-4111-8111-111111111111" : null,
      scheduledSessionId: performed ? null : "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222",
      sourceKind,
      lifecycle: "completed",
      title: "Strength day",
      category: "strength",
      effectiveAt: "2026-08-01T09:00:00.000Z",
      startedAt: "2026-08-01T08:00:00.000Z",
      completedAt: "2026-08-01T09:00:00.000Z",
      skippedAt: null,
      cancelledAt: null,
      durationMinutes: 60,
      notes: "Member note",
      planId: null,
      planDayId: null,
      planWeekId: null,
      planSessionId: null,
      hasPerformedSets: performed,
      hasMeaningfulPerformance: performed,
      capabilities: {
        openDetails: true,
        showPerformedSets: performed,
        showPlannedVsActual: performed,
        showMuscleAnalysis: performed,
        calculatePerformanceMetrics: performed,
        calculateVerifiedRecords: performed,
        repeatWorkout: performed,
        correctSession: performed,
        softDeleteSession: performed,
      },
    },
    summary: performed
      ? { exerciseCount: 1, completedSetCount: 1, reliableVolume: 640, verifiedRecordCount: null }
      : { exerciseCount: null, completedSetCount: null, reliableVolume: null, verifiedRecordCount: null },
    snapshot: null,
    exercises: [{
      identity: "exercise-1",
      exerciseId: null,
      snapshotItemId: performed ? "snapshot-item-1" : null,
      name: "Bench press",
      plannedName: "Bench press",
      state: performed ? "completed" : null,
      category: "strength",
      plannedSetCount: performed ? 2 : null,
      performedSets: performed ? [{
        id: "set-1", setNumber: 1, reps: 8, weightKg: 80, completedAt: "2026-08-01T08:15:00.000Z",
        notes: "Controlled", setType: "working", rpe: 8, rir: 2, matchState: "matched",
        plannedSet: { id: "planned-1", setOrder: 1, setType: "working", targetMode: "range", sideMode: "bilateral", restSeconds: 90, tempoTarget: null, targets: [] },
        metrics: [], segments: [], verifiedRecords: [],
      }] : [],
      missingPlannedSets: performed ? [{ id: "planned-2", setOrder: 2, setType: "working", targetMode: "range", sideMode: "bilateral", restSeconds: 90, tempoTarget: null, targets: [] }] : [],
    }],
    timeline: [],
    notices: sourceKind === "scheduled_fallback" ? ["partial-availability"] : [],
  };
}

describe("Workout History session detail surface", () => {
  it("renders trusted summary values and distinguishes actual, missing, and planned set data", () => {
    const value = detail();
    const summary = renderToStaticMarkup(<SessionHistorySummary detail={value} />);
    const exercise = renderToStaticMarkup(<ExerciseHistorySection exercise={value.exercises[0]!} defaultOpen />);

    expect(summary).toContain("historyCompletedSetsCount");
    expect(summary).toContain("historyExercisesCount");
    expect(exercise).toContain("historyActualResult");
    expect(exercise).toContain("historyMissingPlannedSet");
    expect(exercise).toContain("Controlled");
    expect(exercise).not.toContain("deviceId");
  });

  it("keeps scheduled fallback exercise labels free of performed metrics", () => {
    const value = detail("scheduled_fallback");
    const summary = renderToStaticMarkup(<SessionHistorySummary detail={value} />);
    const exercise = renderToStaticMarkup(<ExerciseHistorySection exercise={value.exercises[0]!} defaultOpen={false} />);
    expect(summary).toContain("historyMinutesShort");
    expect(summary).not.toContain("historyReliableVolumeMetric");
    expect(exercise).toContain("Bench press");
    expect(exercise).not.toContain("historyActualResult");
    expect(exercise).not.toContain("historyRpeLabel");
  });

  it("preserves the approved information hierarchy and direct-route namespaces", () => {
    const page = readFileSync("components/workouts/history/session-history-page.tsx", "utf8");
    const performedRoute = readFileSync("app/(private)/workout-history/[sessionId]/page.tsx", "utf8");
    const scheduledRoute = readFileSync("app/(private)/workout-history/scheduled/[scheduledSessionId]/page.tsx", "utf8");
    const order = [
      "<SessionHistorySummary", "<ExerciseHistorySection", "<SessionHistoryMuscleSummary",
      "<SessionHistoryNotes", "<SessionHistoryTimeline", "<SessionHistoryActions",
    ].map((token) => page.indexOf(token));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((left, right) => left - right));
    expect(performedRoute).toContain('source="performed"');
    expect(scheduledRoute).toContain('source="scheduled_fallback"');
  });

  it("uses Workout History-owned training focus semantics without the Active Workout controller", () => {
    const source = readFileSync("components/workouts/history/session-history-muscle-summary.tsx", "utf8");
    expect(source).toContain("MuscleHeatMap");
    expect(source).toContain("historyHighestExposure");
    expect(source).toContain("historyAlsoTrained");
    expect(source).not.toContain("active-session-muscle-analysis");
    expect(source).not.toContain("reasonCodes");
  });
});
