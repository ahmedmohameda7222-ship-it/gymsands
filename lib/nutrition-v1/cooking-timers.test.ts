import { describe, expect, it } from "vitest";

import { reconstructCookingTimer } from "@/lib/nutrition-v1/cooking-timers";

describe("Nutrition V1 Cooking Mode timestamp timers", () => {
  it("reconstructs a running timer from persisted timestamps instead of UI countdown state", () => {
    const timer = Object.freeze({
      id: "timer-pasta",
      actionId: "pasta",
      name: "Pasta",
      durationSeconds: 10,
      status: "running" as const,
      startedAt: "2026-08-26T06:00:00.000Z",
      targetAt: "2026-08-26T06:00:10.000Z",
      pausedAt: null,
      pausedRemainingSeconds: null,
      completedAt: null,
    });

    expect(reconstructCookingTimer(timer, "2026-08-26T06:00:04.200Z")).toMatchObject({
      status: "running",
      remainingSeconds: 6,
      expired: false,
      attentionEvent: null,
    });
  });

  it("turns target-time expiry into timer session truth without claiming the action condition is complete", () => {
    const timer = {
      id: "timer-chicken",
      actionId: "chicken",
      name: "Chicken side A",
      durationSeconds: 240,
      status: "running" as const,
      startedAt: "2026-08-26T06:00:00.000Z",
      targetAt: "2026-08-26T06:04:00.000Z",
      pausedAt: null,
      pausedRemainingSeconds: null,
      completedAt: null,
    };

    expect(reconstructCookingTimer(timer, "2026-08-26T06:04:01.000Z")).toEqual(expect.objectContaining({
      status: "completed",
      remainingSeconds: 0,
      expired: true,
      attentionEvent: expect.objectContaining({
        kind: "timer_finished",
        timerId: "timer-chicken",
        actionId: "chicken",
        timerName: "Chicken side A",
      }),
    }));
  });

  it("preserves paused remaining time regardless of wall-clock movement", () => {
    const timer = {
      id: "timer-rest",
      actionId: "rest",
      name: "Chicken rest",
      durationSeconds: 120,
      status: "paused" as const,
      startedAt: "2026-08-26T06:00:00.000Z",
      targetAt: "2026-08-26T06:02:00.000Z",
      pausedAt: "2026-08-26T06:00:40.000Z",
      pausedRemainingSeconds: 80,
      completedAt: null,
    };

    expect(reconstructCookingTimer(timer, "2026-08-26T08:00:00.000Z")).toMatchObject({
      status: "paused",
      remainingSeconds: 80,
      expired: false,
      attentionEvent: null,
    });
  });
});
