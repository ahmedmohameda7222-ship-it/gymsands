import { describe, expect, it, vi } from "vitest";
import { createActiveSessionClock } from "./clock";

describe("AW-4 shared Active Workout clock", () => {
  it("uses one interval and disposes every listener at zero subscribers", () => {
    let now = 1_000;
    let tick: (() => void) | null = null;
    let visibility: (() => void) | null = null;
    let focus: (() => void) | null = null;
    const clearInterval = vi.fn();
    const removeVisibility = vi.fn();
    const removeFocus = vi.fn();
    const clock = createActiveSessionClock({
      now: () => now,
      setInterval: vi.fn((listener) => { tick = listener; return "interval"; }),
      clearInterval,
      addVisibilityListener: vi.fn((listener) => {
        visibility = listener;
        return removeVisibility;
      }),
      addFocusListener: vi.fn((listener) => {
        focus = listener;
        return removeFocus;
      })
    });
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = clock.subscribe(first);
    const unsubscribeSecond = clock.subscribe(second);
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(1);
    now = 2_000;
    tick!();
    expect(clock.getSnapshot()).toBe(2_000);
    visibility!();
    focus!();
    unsubscribeFirst();
    expect(clearInterval).not.toHaveBeenCalled();
    unsubscribeSecond();
    expect(clearInterval).toHaveBeenCalledWith("interval");
    expect(removeVisibility).toHaveBeenCalledTimes(1);
    expect(removeFocus).toHaveBeenCalledTimes(1);
  });

  it("publishes immediately on focus and visibility restoration", () => {
    let now = 5_000;
    let visibility!: () => void;
    let focus!: () => void;
    const listener = vi.fn();
    const clock = createActiveSessionClock({
      now: () => now,
      setInterval: () => "interval",
      clearInterval: () => undefined,
      addVisibilityListener: (next) => { visibility = next; return () => undefined; },
      addFocusListener: (next) => { focus = next; return () => undefined; }
    });
    const unsubscribe = clock.subscribe(listener);
    now = 9_000;
    visibility();
    expect(clock.getSnapshot()).toBe(9_000);
    now = 12_000;
    focus();
    expect(clock.getSnapshot()).toBe(12_000);
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
  });
});
