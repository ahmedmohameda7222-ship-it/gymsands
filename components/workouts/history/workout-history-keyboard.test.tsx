// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/i18n/train", () => ({
  useTrainTranslation: () => ({
    locale: "en-US",
    tr: (key: string, values?: Record<string, string | number>) =>
      values?.count === undefined ? key : `${key}:${values.count}`,
  }),
}));

import { WorkoutHistoryCard } from "@/components/workouts/history/workout-history-card";
import type { WorkoutHistorySessionSummary } from "@/types/workout-history";

const item: WorkoutHistorySessionSummary = {
  contractVersion: 1,
  activityId: "11111111-1111-4111-8111-111111111111",
  canonicalSessionId: "11111111-1111-4111-8111-111111111111",
  scheduledSessionId: null,
  userId: "22222222-2222-4222-8222-222222222222",
  sourceKind: "performed",
  lifecycle: "completed",
  title: "Keyboard workout",
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
  exerciseNames: [],
  muscleIds: [],
  insight: null,
};

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("Workout History keyboard selection", () => {
  it("keeps a semantic detail link and treats keyboard-style desktop activation as preview selection", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: true })),
    });
    const onSelect = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<WorkoutHistoryCard item={item} onSelect={onSelect} />);
    });
    const link = container.querySelector<HTMLAnchorElement>("a");
    expect(link?.getAttribute("href")).toBe("/workout-history/11111111-1111-4111-8111-111111111111");
    expect(link?.className).toContain("focus-visible:ring-2");

    await act(async () => {
      link?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }));
    });
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(item);

    await act(async () => root.unmount());
  });
});
