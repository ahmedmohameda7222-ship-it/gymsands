import { describe, expect, it } from "vitest";
import { executionFixture } from "./fixtures";
import { activityTimerProjection, restSecondsRemaining, sessionElapsedSeconds } from "./timers";

const now = Date.parse("2026-07-26T08:01:00.000Z");

describe("AW-4 timestamp timer projections", () => {
  it("projects active and paused session time without allowing backward time", () => {
    expect(sessionElapsedSeconds(executionFixture(), now)).toBe(70);
    expect(sessionElapsedSeconds(executionFixture(), now - 120_000)).toBe(10);
    expect(sessionElapsedSeconds(executionFixture({
      session_state: "paused",
      session_running_since: null,
      session_elapsed_seconds: 45
    }), now + 10_000_000)).toBe(45);
  });

  it("projects active and paused rest countdowns", () => {
    expect(restSecondsRemaining(executionFixture({
      view_state: "rest",
      rest_started_at: "2026-07-26T08:00:00.000Z",
      rest_duration_seconds: 90,
      rest_ends_at: "2026-07-26T08:01:30.000Z"
    }), now)).toBe(30);
    expect(restSecondsRemaining(executionFixture({
      session_state: "paused",
      session_running_since: null,
      view_state: "rest",
      rest_started_at: "2026-07-26T08:00:00.000Z",
      rest_duration_seconds: 25,
      rest_ends_at: "2026-07-26T08:00:25.000Z"
    }), now)).toBe(25);
  });

  it("projects unbounded count-up and bounded countdown activity timers", () => {
    expect(activityTimerProjection(executionFixture({
      activity_timer_kind: "timed_set",
      activity_timer_elapsed_seconds: 5,
      activity_timer_running_since: "2026-07-26T08:00:30.000Z"
    }), now)).toMatchObject({
      elapsedSeconds: 35,
      remainingSeconds: null,
      bounded: false
    });
    expect(activityTimerProjection(executionFixture({
      activity_timer_kind: "block",
      activity_timer_elapsed_seconds: 10,
      activity_timer_running_since: "2026-07-26T08:00:30.000Z",
      activity_timer_duration_seconds: 60,
      activity_timer_ends_at: "2026-07-26T08:01:20.000Z"
    }), now)).toMatchObject({
      elapsedSeconds: 40,
      remainingSeconds: 20,
      complete: false
    });
  });

  it("clamps zero-duration and far-forward projections without persisting anything", () => {
    expect(activityTimerProjection(executionFixture({
      activity_timer_kind: "block",
      activity_timer_elapsed_seconds: 0,
      activity_timer_running_since: "2026-07-26T08:00:00.000Z",
      activity_timer_duration_seconds: 0,
      activity_timer_ends_at: "2026-07-26T08:00:00.000Z"
    }), now + 86_400_000)).toMatchObject({
      elapsedSeconds: 0,
      remainingSeconds: 0,
      complete: true
    });
  });
});
