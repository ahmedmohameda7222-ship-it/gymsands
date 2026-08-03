import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    user: {
      id: "11111111-1111-4111-8111-111111111111",
    },
    session: { access_token: "owner-token" },
  }),
}));
vi.mock("@/lib/i18n/train", () => ({
  useTrainTranslation: () => ({
    dir: "ltr",
    locale: "en-US",
    tr: (
      key: string,
      values?: Record<string, string | number>,
    ) =>
      values?.count === undefined
        ? key
        : `${key}:${values.count}`,
  }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/workout-history",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/services/workouts/history/client", () => ({
  getWorkoutHistoryList: vi.fn(),
}));

import { WorkoutHistoryPage } from "@/components/workouts/history/workout-history-page";

describe("Workout History mobile page", () => {
  it("renders the approved mobile information hierarchy and initial skeleton", () => {
    const markup = renderToStaticMarkup(<WorkoutHistoryPage />);
    const source = readFileSync(
      "components/workouts/history/workout-history-page.tsx",
      "utf8",
    );

    expect(markup).toContain("data-workout-history-page");
    expect(markup).toContain("data-workout-history-header");
    expect(markup).toContain("historySearchPlaceholder");
    expect(markup).toContain("historyFiltersAction");
    expect(markup).toContain('aria-busy="true"');
    expect(
      source.lastIndexOf("<WorkoutHistoryHeader"),
    ).toBeLessThan(
      source.lastIndexOf("<WorkoutHistoryPeriodControl"),
    );
    expect(
      source.lastIndexOf("<WorkoutHistoryPeriodControl"),
    ).toBeLessThan(
      source.lastIndexOf("<WorkoutHistorySummary"),
    );
    expect(
      source.lastIndexOf("<WorkoutHistorySummary"),
    ).toBeLessThan(
      source.lastIndexOf("<WorkoutHistorySearch"),
    );
    expect(source).not.toContain("TrainStickyFooter");
  });

  it("keeps draft search debounced while canonical keys coordinate first-page and cursor reads", () => {
    const source = readFileSync(
      "components/workouts/history/workout-history-page.tsx",
      "utf8",
    );

    expect(source).toContain("}, 300)");
    expect(source).toContain(
      "workoutHistoryFirstPageRequestKey",
    );
    expect(source).toContain("workoutHistoryCursorRequestKey");
    expect(source).toContain(
      "WorkoutHistoryFirstPageRequestCoordinator",
    );
    expect(source).toContain("cursor: nextCursor");
    expect(source).toContain("current.response!.items.some");
    expect(source).toContain(
      "accessToken: accessTokenRef.current",
    );
    expect(source).not.toContain(
      "WorkoutHistoryRequestGeneration",
    );
    expect(source).not.toContain("setResponse(null)");
  });

  it("leaves the old component as one compatibility export", () => {
    const legacy = readFileSync(
      "components/workouts/workout-history.tsx",
      "utf8",
    );
    expect(legacy.trim()).toBe(
      'export { WorkoutHistoryPage as WorkoutHistory } from "@/components/workouts/history/workout-history-page";',
    );
  });
});
