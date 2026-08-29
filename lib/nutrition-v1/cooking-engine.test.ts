import { describe, expect, it } from "vitest";

import { deriveCookingTimeline } from "@/lib/nutrition-v1/cooking-engine";

const action = (
  id: string,
  position: number,
  instruction: string,
  overrides: Record<string, unknown> = {},
) => ({
  id,
  position,
  instruction,
  trackKey: null,
  dependencyActionIds: [] as string[],
  canRunInBackground: false,
  conditionCue: null as string | null,
  ...overrides,
});

const session = (overrides: Record<string, unknown> = {}) => ({
  completedActionIds: [] as string[],
  deferredActionIds: [] as string[],
  skippedActionIds: [] as string[],
  runningBackgroundActionIds: [] as string[],
  waitingForConditionActionIds: [] as string[],
  timers: [] as Array<Record<string, unknown>>,
  ...overrides,
});

describe("Nutrition V1 deterministic Cooking Mode engine", () => {
  it("orchestrates independent parallel tracks without unlocking unmet dependencies", () => {
    const recipeFacts = {
      actions: [
        action("water", 0, "Heat the pasta water.", { trackKey: "pasta", canRunInBackground: true }),
        action("season", 1, "Season the chicken.", { trackKey: "chicken" }),
        action("add-pasta", 2, "Add the pasta.", { trackKey: "pasta", dependencyActionIds: ["water"] }),
      ],
    };

    const duringWater = deriveCookingTimeline(
      recipeFacts,
      session({ runningBackgroundActionIds: ["water"] }),
    );

    expect(duringWater.now?.id).toBe("season");
    expect(duringWater.running).toContainEqual(expect.objectContaining({ kind: "action", actionId: "water" }));
    expect(duringWater.upNext).toBeNull();

    const afterIndependentWork = deriveCookingTimeline(
      recipeFacts,
      session({ completedActionIds: ["water", "season"] }),
    );
    expect(afterIndependentWork.now?.id).toBe("add-pasta");
  });

  it("falls back to safe linear order when orchestration metadata is absent", () => {
    const recipeFacts = {
      actions: [
        action("a", 0, "First supplied instruction."),
        action("b", 1, "Second supplied instruction."),
        action("c", 2, "Third supplied instruction."),
      ],
    };

    const first = deriveCookingTimeline(recipeFacts, session());
    expect(first.now?.id).toBe("a");
    expect(first.upNext?.id).toBe("b");

    const second = deriveCookingTimeline(recipeFacts, session({ completedActionIds: ["a"] }));
    expect(second.now?.id).toBe("b");
    expect(second.upNext?.id).toBe("c");
  });

  it("keeps a condition-based action waiting even when its timer expires", () => {
    const recipeFacts = {
      actions: [
        action("sauce", 0, "Cook until the supplied result cue is reached.", {
          conditionCue: "Sauce thickens",
        }),
        action("serve", 1, "Serve.", { dependencyActionIds: ["sauce"] }),
      ],
    };

    const timeline = deriveCookingTimeline(
      recipeFacts,
      session({
        waitingForConditionActionIds: ["sauce"],
        timers: [
          {
            id: "timer-sauce",
            actionId: "sauce",
            name: "Sauce timer",
            status: "completed",
            completedAt: "2026-08-26T06:00:00.000Z",
          },
        ],
      }),
    );

    expect(timeline.attention).toContainEqual(expect.objectContaining({
      kind: "timer_finished",
      actionId: "sauce",
      timerId: "timer-sauce",
    }));
    expect(timeline.now?.id).toBe("sauce");
    expect(timeline.upNext).toBeNull();

    const userConfirmed = deriveCookingTimeline(
      recipeFacts,
      session({ completedActionIds: ["sauce"] }),
    );
    expect(userConfirmed.now?.id).toBe("serve");
  });

  it("treats Later as still-required work and Skip as removed work", () => {
    const recipeFacts = {
      actions: [
        action("a", 0, "Optional timing, still required if deferred."),
        action("b", 1, "Other available work."),
      ],
    };

    const deferredWhileOtherWorkExists = deriveCookingTimeline(
      recipeFacts,
      session({ deferredActionIds: ["a"] }),
    );
    expect(deferredWhileOtherWorkExists.now?.id).toBe("b");

    const deferredReturns = deriveCookingTimeline(
      recipeFacts,
      session({ completedActionIds: ["b"], deferredActionIds: ["a"] }),
    );
    expect(deferredReturns.now?.id).toBe("a");

    const skippedDoesNotReturn = deriveCookingTimeline(
      recipeFacts,
      session({ completedActionIds: ["b"], skippedActionIds: ["a"] }),
    );
    expect(skippedDoesNotReturn.now).toBeNull();
  });

  it("never converts deterministic elapsed time into physical-state completion", () => {
    const recipeFacts = {
      actions: [
        action("water", 0, "Wait for the supplied condition cue.", {
          conditionCue: "Water boils",
        }),
        action("pasta", 1, "Add pasta.", { dependencyActionIds: ["water"] }),
      ],
    };

    const timeline = deriveCookingTimeline(
      recipeFacts,
      session({
        waitingForConditionActionIds: ["water"],
        timers: [
          {
            id: "timer-water",
            actionId: "water",
            name: "Water timer",
            status: "completed",
            completedAt: "2026-08-26T06:00:00.000Z",
          },
        ],
      }),
    );

    expect(timeline.now?.id).toBe("water");
    expect(timeline.upNext).toBeNull();
    expect(timeline.attention.every((item) => item.kind === "timer_finished")).toBe(true);
  });
});
