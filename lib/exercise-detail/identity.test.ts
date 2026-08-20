import { describe, expect, it } from "vitest";

import {
  catalogProviderIdentity,
  customExerciseIdentity,
  globalExerciseIdentity,
  identityCandidates,
  resolveFrozenPlanExerciseIdentity,
  workoutHistoryHrefForExercise,
} from "./identity";

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

  it("navigates All Sessions with the canonical Workout History exercise filter", () => {
    const identity = catalogProviderIdentity("activity-3");
    expect(workoutHistoryHrefForExercise(identity)).toBe(
      "/workout-history?exerciseId=provider%3Aplaivra_activity_catalog%3Aactivity-3",
    );
    expect(workoutHistoryHrefForExercise(identity)).not.toBe("/workout-history");
  });
});
