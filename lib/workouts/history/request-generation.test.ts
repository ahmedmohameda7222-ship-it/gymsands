import { describe, expect, it } from "vitest";

import { WorkoutHistoryRequestGeneration } from "@/lib/workouts/history/request-generation";

describe("Workout History request generations", () => {
  it("rejects an older response after a newer request begins", async () => {
    const gate = new WorkoutHistoryRequestGeneration();
    const olderController = new AbortController();
    const newerController = new AbortController();
    const accepted: string[] = [];
    const older = gate.begin();
    const olderResponse = Promise.resolve().then(() => {
      if (gate.accepts(older, olderController.signal)) accepted.push("older");
    });
    const newer = gate.begin();
    if (gate.accepts(newer, newerController.signal)) accepted.push("newer");
    await olderResponse;
    expect(accepted).toEqual(["newer"]);
  });

  it("rejects the current generation after it is aborted", () => {
    const gate = new WorkoutHistoryRequestGeneration();
    const controller = new AbortController();
    const generation = gate.begin();
    controller.abort();
    expect(gate.accepts(generation, controller.signal)).toBe(false);
  });
});
