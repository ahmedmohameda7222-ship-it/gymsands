import { describe, expect, it } from "vitest";

import { activeWorkoutSetDraftKey, mergeActiveWorkoutSetDrafts } from "./set-drafts";

describe("Active Workout session-scoped set drafts", () => {
  it("keys drafts by user, session, frozen snapshot item, and set", () => {
    expect(activeWorkoutSetDraftKey("user-a", "session-a", "item-a", 2)).toBe("user-a:session-a:item-a:2");
    expect(activeWorkoutSetDraftKey("user-b", "session-a", "item-a", 2)).not.toBe(activeWorkoutSetDraftKey("user-a", "session-a", "item-a", 2));
  });

  it("restores only incomplete sets and never overwrites canonical completed work", () => {
    const exercises = [{
      prescriptionItem: { id: "item-a" },
      sets: [
        { setNumber: 1, reps: "10", weightKg: "20", rpe: "", rir: "", setType: "working", notes: "saved", completedAt: "2026-08-16T00:00:00Z" },
        { setNumber: 2, reps: "", weightKg: "", rpe: "", rir: "", setType: "working", notes: "", completedAt: null },
      ],
    }];
    const drafts = [{
      key: "user-a:session-a:item-a:2", userId: "user-a", workoutSessionId: "session-a", snapshotItemId: "item-a", setNumber: 2,
      reps: "8", weightKg: "32.5", rpe: "8", rir: "2", setType: "working", notes: "draft",
      updatedAt: "2026-08-16T00:00:00Z", expiresAt: "2026-08-17T00:00:00Z",
    }, {
      key: "user-a:session-a:item-a:1", userId: "user-a", workoutSessionId: "session-a", snapshotItemId: "item-a", setNumber: 1,
      reps: "1", weightKg: "1", rpe: "1", rir: "1", setType: "working", notes: "must-not-overwrite",
      updatedAt: "2026-08-16T00:00:00Z", expiresAt: "2026-08-17T00:00:00Z",
    }];
    const merged = mergeActiveWorkoutSetDrafts(exercises, drafts);
    expect(merged[0]?.sets[0]?.reps).toBe("10");
    expect(merged[0]?.sets[0]?.notes).toBe("saved");
    expect(merged[0]?.sets[1]?.reps).toBe("8");
    expect(merged[0]?.sets[1]?.weightKg).toBe("32.5");
    expect(merged[0]?.sets[1]?.notes).toBe("draft");
  });
});
