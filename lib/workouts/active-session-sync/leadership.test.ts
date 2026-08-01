// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createActiveWorkoutTabLeadership } from "./leadership";

describe("AW-9 same-device tab leadership", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("keeps the second tab read-only until explicit takeover", async () => {
    const first = createActiveWorkoutTabLeadership({
      userId: "user-1",
      workoutSessionId: "session-1",
    });
    const second = createActiveWorkoutTabLeadership({
      userId: "user-1",
      workoutSessionId: "session-1",
    });

    expect(await first.acquire()).toBe(true);
    expect(first.isLeader()).toBe(true);
    expect(await second.acquire()).toBe(false);
    expect(second.isLeader()).toBe(false);

    expect(await second.acquire(true)).toBe(true);
    expect(second.isLeader()).toBe(true);
    expect(first.isLeader()).toBe(false);
    expect(first.renew()).toBe(false);

    first.dispose();
    second.dispose();
  });

  it("releases page ownership without permanently disposing the controller", async () => {
    const leadership = createActiveWorkoutTabLeadership({
      userId: "user-1",
      workoutSessionId: "session-1",
    });

    expect(await leadership.acquire()).toBe(true);
    leadership.release();
    expect(leadership.isLeader()).toBe(false);
    expect(await leadership.acquire()).toBe(true);

    leadership.dispose();
    expect(await leadership.acquire()).toBe(false);
  });
});
