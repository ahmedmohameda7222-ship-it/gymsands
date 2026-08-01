import { describe, expect, it } from "vitest";

import { translateTrain, type TrainKey } from "@/lib/i18n/train";

const requiredKeys = [
  "historyPageTitle", "historyPageDescription", "historyPeriodWeek", "historyPeriodMonth",
  "historyPeriodThreeMonths", "historyPeriodCustom", "historyPreviousPeriod", "historyNextPeriod",
  "historyWorkoutsMetric", "historyTrainingTimeMetric", "historyCompletedSetsMetric",
  "historyReliableVolumeMetric", "historyFrequencyMetric", "historySearchLabel",
  "historySearchPlaceholder", "historyFiltersAction", "historyClearFilters", "historyToday",
  "historyYesterday", "historyPartial", "historySkipped", "historyCancelled",
  "historyOpenDetails", "historyLoadingLabel", "historyEmptyTitle", "historyEmptyDescription",
  "historyStartWorkout", "historyCreatePlan", "historyFilteredEmptyTitle",
  "historyFilteredEmptyDescription", "historyLoadFailedTitle", "historyLoadFailedDescription",
  "historyRetry", "historyLoadMore", "historyLoadingMore", "historyLoadMoreFailed",
  "historyStaleNotice", "historyPartialNotice", "historyActionRequiredNotice",
  "historyFilterTitle", "historyFilterDescription", "historyStatusLabel",
  "historyCompletedStatus", "historyPartialStatus", "historySkippedStatus",
  "historyCancelledStatus", "historyProgressOnly", "historyApplyFilters", "historyCloseFilters",
] as const satisfies readonly TrainKey[];

describe("Workout History message contract", () => {
  it("has a non-empty safe value for every visible key in English, German, and Arabic", () => {
    for (const locale of ["en", "de", "ar"] as const) {
      for (const key of requiredKeys) {
        const value = translateTrain(locale, key, { count: 3 });
        expect(value.trim(), `${locale}:${key}`).not.toBe("");
        expect(value, `${locale}:${key}`).not.toMatch(/<script|javascript:|onerror\s*=/iu);
      }
    }
  });

  it("preserves interpolation values across locales", () => {
    for (const locale of ["en", "de", "ar"] as const) {
      expect(translateTrain(locale, "historyApplyFilters", { count: 17 })).toContain("17");
      expect(translateTrain(locale, "historyMinutesShort", { count: 45 })).toContain("45");
    }
  });
});
