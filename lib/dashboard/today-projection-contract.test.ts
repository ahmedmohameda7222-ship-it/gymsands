import { describe, expect, it } from "vitest";
import {
  parseTodayProjectionResponseV1,
  TodayProjectionContractError,
} from "@/lib/dashboard/today-projection-contract";
import { createTodayProjectionFixture } from "@/lib/dashboard/testing/today-projection-fixture";

describe("Today projection contract", () => {
  it("accepts successful empty and partial-domain responses", () => {
    const empty = createTodayProjectionFixture();
    expect(parseTodayProjectionResponseV1(empty)).toEqual(empty);

    const partial = {
      ...empty,
      workout: {
        state: "failed" as const,
        value: null,
        errorCode: "workout_unavailable" as const,
      },
      wellness: {
        ...empty.wellness,
        state: "loaded" as const,
        sleep: {
          state: "failed" as const,
          value: null,
          errorCode: "sleep_unavailable" as const,
        },
      },
      promptContext: {
        ...empty.promptContext,
        workout: {
          ...empty.promptContext.workout,
          state: "failed" as const,
          hasPlan: null,
        },
        recovery: {
          ...empty.promptContext.recovery,
          state: "failed" as const,
        },
      },
    };
    expect(parseTodayProjectionResponseV1(partial)).toEqual(partial);
  });

  it.each([
    ["wrong version", (value: Record<string, unknown>) => ({ ...value, contractVersion: 2 })],
    ["missing field", (value: Record<string, unknown>) => {
      const copy = { ...value };
      delete copy.workout;
      return copy;
    }],
    ["unexpected raw object", (value: Record<string, unknown>) => ({
      ...value,
      rawDatabaseError: { table: "profiles", message: "private" },
    })],
    ["token field", (value: Record<string, unknown>) => ({ ...value, accessToken: "secret" })],
    ["user field", (value: Record<string, unknown>) => ({ ...value, userId: "owner" })],
  ])("rejects %s", (_label, mutate) => {
    const invalid = mutate(
      createTodayProjectionFixture() as unknown as Record<string, unknown>,
    );
    expect(() => parseTodayProjectionResponseV1(invalid)).toThrow(
      TodayProjectionContractError,
    );
  });

  it("rejects unsafe failed-envelope codes and oversized previews", () => {
    const fixture = createTodayProjectionFixture();
    const unsafe = {
      ...fixture,
      workout: {
        state: "failed",
        value: null,
        errorCode: "relation_profiles_does_not_exist",
      },
    };
    expect(() => parseTodayProjectionResponseV1(unsafe)).toThrow(
      TodayProjectionContractError,
    );

    const oversized = {
      ...fixture,
      workout: {
        ...fixture.workout,
        value: {
          ...fixture.workout.value,
          previewExercises: Array.from({ length: 4 }, (_, index) => ({
            id: `exercise-${index}`,
            name: "Exercise",
            sets: 3,
            reps: 8,
          })),
        },
      },
    };
    expect(() => parseTodayProjectionResponseV1(oversized)).toThrow(
      TodayProjectionContractError,
    );
  });
});
