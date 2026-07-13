import { afterEach, describe, expect, it, vi } from "vitest";
import { localDateToIso } from "@/lib/date-utils";
import { millisecondsUntilNextLocalMidnight, resolveTrainWeekSelection, startTrainLocalDateRefresh, type TrainDateEventTarget } from "@/lib/workouts/train-local-date";

class EventTargetHarness implements TrainDateEventTarget {
  private listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, listener: () => void) {
    const listeners = this.listeners.get(type) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string) {
    this.listeners.get(type)?.forEach((listener) => listener());
  }

  count(type: string) {
    return this.listeners.get(type)?.size ?? 0;
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Train local-midnight refresh", () => {
  it("schedules the refresh at the next local midnight", () => {
    const now = new Date(2026, 6, 13, 23, 59, 30, 0);
    expect(millisecondsUntilNextLocalMidnight(now)).toBe(30_050);
  });

  it("changes Today and weekday after local midnight", () => {
    vi.useFakeTimers();
    const before = new Date(2026, 6, 13, 23, 59, 59, 900);
    vi.setSystemTime(before);
    const initialDate = localDateToIso(before);
    const nextDates: string[] = [];
    const windowTarget = new EventTargetHarness();
    const documentTarget = new EventTargetHarness();
    const cleanup = startTrainLocalDateRefresh({
      initialDate,
      onDateChange: (date) => nextDates.push(date),
      dependencies: {
        getNow: () => new Date(),
        setTimer: (callback, delayMs) => setTimeout(callback, delayMs) as unknown as number,
        clearTimer: (timer) => clearTimeout(timer as unknown as ReturnType<typeof setTimeout>),
        windowTarget,
        documentTarget,
        isDocumentVisible: () => true
      }
    });

    vi.advanceTimersByTime(200);
    expect(nextDates).toEqual(["2026-07-14"]);
    expect(new Date(`${nextDates[0]}T12:00:00`).getDay()).not.toBe(new Date(`${initialDate}T12:00:00`).getDay());
    cleanup();
  });

  it("resets the week-strip selection to the new Today when it is in the displayed week", () => {
    const week = ["2026-07-13", "2026-07-14", "2026-07-15"];
    expect(resolveTrainWeekSelection("2026-07-13", "2026-07-14", week)).toBe("2026-07-14");
  });

  it("checks for a stale date when the window regains focus", () => {
    vi.useFakeTimers();
    let now = new Date(2026, 6, 13, 12, 0, 0);
    const dates: string[] = [];
    const windowTarget = new EventTargetHarness();
    const documentTarget = new EventTargetHarness();
    const cleanup = startTrainLocalDateRefresh({
      initialDate: "2026-07-13",
      onDateChange: (date) => dates.push(date),
      dependencies: {
        getNow: () => now,
        setTimer: (callback, delayMs) => setTimeout(callback, delayMs) as unknown as number,
        clearTimer: (timer) => clearTimeout(timer as unknown as ReturnType<typeof setTimeout>),
        windowTarget,
        documentTarget,
        isDocumentVisible: () => true
      }
    });
    now = new Date(2026, 6, 14, 8, 0, 0);
    windowTarget.dispatch("focus");
    expect(dates).toEqual(["2026-07-14"]);
    cleanup();
  });

  it("checks for a stale date when a sleeping tab becomes visible", () => {
    vi.useFakeTimers();
    let now = new Date(2026, 6, 13, 12, 0, 0);
    let visible = false;
    const dates: string[] = [];
    const windowTarget = new EventTargetHarness();
    const documentTarget = new EventTargetHarness();
    const cleanup = startTrainLocalDateRefresh({
      initialDate: "2026-07-13",
      onDateChange: (date) => dates.push(date),
      dependencies: {
        getNow: () => now,
        setTimer: (callback, delayMs) => setTimeout(callback, delayMs) as unknown as number,
        clearTimer: (timer) => clearTimeout(timer as unknown as ReturnType<typeof setTimeout>),
        windowTarget,
        documentTarget,
        isDocumentVisible: () => visible
      }
    });
    now = new Date(2026, 6, 14, 8, 0, 0);
    documentTarget.dispatch("visibilitychange");
    expect(dates).toEqual([]);
    visible = true;
    documentTarget.dispatch("visibilitychange");
    expect(dates).toEqual(["2026-07-14"]);
    cleanup();
  });

  it("cleans up the midnight timer and focus/visibility listeners", () => {
    vi.useFakeTimers();
    const windowTarget = new EventTargetHarness();
    const documentTarget = new EventTargetHarness();
    const onDateChange = vi.fn();
    const cleanup = startTrainLocalDateRefresh({
      initialDate: "2026-07-13",
      onDateChange,
      dependencies: {
        getNow: () => new Date(2026, 6, 13, 23, 59, 59, 900),
        setTimer: (callback, delayMs) => setTimeout(callback, delayMs) as unknown as number,
        clearTimer: (timer) => clearTimeout(timer as unknown as ReturnType<typeof setTimeout>),
        windowTarget,
        documentTarget,
        isDocumentVisible: () => true
      }
    });
    expect(windowTarget.count("focus")).toBe(1);
    expect(documentTarget.count("visibilitychange")).toBe(1);
    cleanup();
    expect(windowTarget.count("focus")).toBe(0);
    expect(documentTarget.count("visibilitychange")).toBe(0);
    vi.advanceTimersByTime(500);
    expect(onDateChange).not.toHaveBeenCalled();
  });
});
