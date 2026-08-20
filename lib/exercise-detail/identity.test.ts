import { describe, expect, it } from "vitest";

import {
  catalogProviderIdentity,
  customExerciseIdentity,
  globalExerciseIdentity,
  identityCandidates,
  resolveFrozenPlanExerciseIdentity,
  workoutHistoryHrefForExercise,
} from "./identity";
import { parseWorkoutHistoryNavigationState } from "@/lib/workouts/history/navigation-state";
import {
  parseWorkoutHistoryListRequest,
  workoutHistoryRequestSearchParams,
} from "@/lib/workouts/history/request";

describe("canonical Exercise Detail identity", () => {
  it("uses provider identity for Library V2 with only the explicit historical alias", () => {
    const identity = catalogProviderIdentity("activity-1");
    expect(identity.canonical).toBe("provider:plaivra_activity_catalog:activity-1");
    expect(identity.aliases).toEqual(["global:activity-1"]);
    expect(identityCandidates(identity)).toEqual([
      "provider:plaivra_activity_catalog:activity-1",
      "global:activity-1",
    ]);
  });

  it("keeps custom and true global identities distinct", () => {
    expect(customExerciseIdentity("same-id").canonical).toBe("custom:same-id");
    expect(globalExerciseIdentity("same-id").canonical).toBe("global:same-id");
  });

  it("uses frozen provider provenance instead of display-name inference", () => {
    expect(resolveFrozenPlanExerciseIdentity({ activityId: "activity-2", catalogSource: "external", isGlobal: true })?.canonical)
      .toBe("provider:plaivra_activity_catalog:activity-2");
    expect(resolveFrozenPlanExerciseIdentity({ activityId: "activity-2", catalogSource: "custom", isGlobal: false })?.canonical)
      .toBe("custom:activity-2");
  });

  it("navigates All Sessions through the public Workout History exercise filter while preserving the API exerciseId contract", () => {
    const identity = catalogProviderIdentity("activity-3");
    const href = workoutHistoryHrefForExercise(identity);
    expect(href).toBe(
      "/workout-history?exercise=provider%3Aplaivra_activity_catalog%3Aactivity-3",
    );
    expect(href).not.toContain("exerciseId=");

    const navigationUrl = new URL(href, "https://plaivra.test");
    const navigation = parseWorkoutHistoryNavigationState(
      navigationUrl.searchParams,
      new Date("2026-08-20T08:00:00.000Z"),
      "UTC",
    );
    expect(navigation.exercise).toBe(identity.canonical);

    const requestParams = workoutHistoryRequestSearchParams({
      ...navigation.range,
      limit: 20,
      exerciseIds: [navigation.exercise],
      statuses: navigation.statuses,
      sort: navigation.sort,
    });
    expect(requestParams.getAll("exerciseId")).toEqual([identity.canonical]);
    expect(requestParams.has("exercise")).toBe(false);

    const parsedRequest = parseWorkoutHistoryListRequest(
      new URL(`/api/workouts/history?${requestParams.toString()}`, "https://plaivra.test"),
      new Date("2026-08-20T08:00:00.000Z"),
    );
    expect(parsedRequest.exerciseIds).toEqual([identity.canonical]);
  });
});
