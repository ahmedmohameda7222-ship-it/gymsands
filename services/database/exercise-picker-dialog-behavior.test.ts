// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Workout } from "@/types";

const mocks = vi.hoisted(() => ({
  createGroup: vi.fn(),
  getFilters: vi.fn(),
  getWorkouts: vi.fn()
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ user: { id: "47000000-0000-4000-8000-000000000007" } })
}));

vi.mock("@/services/activity-catalog/client", () => ({
  createCatalogRequestGroupId: mocks.createGroup
}));

vi.mock("@/services/database/workout-library", () => {
  const empty = () => ({
    muscleCategories: [], primaryMuscles: [], equipmentRequired: [], mechanics: [],
    exerciseTypes: [], forceTypes: [], experienceLevels: [], secondaryMuscles: []
  });
  return {
    emptyCanonicalWorkoutFilterOptions: empty,
    getCanonicalWorkoutFilterOptionsWithStatus: mocks.getFilters,
    getWorkoutsWithStatus: mocks.getWorkouts,
    mergeCanonicalWorkoutFilterOptions: (current: unknown, incoming: unknown) => ({ ...(current as object), ...(incoming as object) })
  };
});

vi.mock("@/lib/i18n/train", () => ({
  useTrainTranslation: () => ({
    dir: "ltr",
    locale: "en",
    tr: (key: string, variables?: Record<string, unknown>) => variables?.count !== undefined ? `${key}:${variables.count}` : key
  })
}));

vi.mock("@/lib/error-formatting", () => ({
  userSafeError: (_error: unknown, fallback: string) => fallback
}));

vi.mock("lucide-react", async () => {
  const ReactModule = await import("react");
  const Icon = () => ReactModule.createElement("span", { "aria-hidden": "true" });
  return { Check: Icon, Dumbbell: Icon, ExternalLink: Icon, Plus: Icon, Search: Icon, X: Icon };
});

vi.mock("@/components/ui/badge", async () => {
  const ReactModule = await import("react");
  return { Badge: ({ children }: { children?: React.ReactNode }) => ReactModule.createElement("span", null, children) };
});

vi.mock("@/components/ui/button", async () => {
  const ReactModule = await import("react");
  return {
    Button: ({ children, asChild, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
      asChild ? children : ReactModule.createElement("button", props, children)
  };
});

vi.mock("@/components/ui/dialog", async () => {
  const ReactModule = await import("react");
  const Wrapper = ({ children }: { children?: React.ReactNode }) => ReactModule.createElement("div", null, children);
  return {
    Dialog: ({ open, children }: { open: boolean; children?: React.ReactNode }) => open ? ReactModule.createElement(ReactModule.Fragment, null, children) : null,
    DialogContent: ({ children }: { children?: React.ReactNode }) => ReactModule.createElement("section", null, children),
    DialogDescription: ({ children }: { children?: React.ReactNode }) => ReactModule.createElement("p", null, children),
    DialogHeader: Wrapper,
    DialogTitle: ({ children }: { children?: React.ReactNode }) => ReactModule.createElement("h1", null, children)
  };
});

vi.mock("@/components/ui/input", async () => {
  const ReactModule = await import("react");
  return { Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => ReactModule.createElement("input", props) };
});

vi.mock("@/components/ui/select-field", async () => {
  const ReactModule = await import("react");
  return {
    Select: ({ value, onChange, options = [], ...props }: {
      value: string;
      onChange: (value: string) => void;
      options?: Array<{ value: string; label: string }>;
      [key: string]: unknown;
    }) => ReactModule.createElement("select", {
      ...props,
      value,
      onChange: (event: React.ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)
    }, [ReactModule.createElement("option", { key: "empty", value: "" }), ...options.map((option) => ReactModule.createElement("option", { key: option.value, value: option.value }, option.label))])
  };
});

vi.mock("@/components/ui/state-views", async () => {
  const ReactModule = await import("react");
  return { CardGridSkeleton: () => ReactModule.createElement("div", { "data-testid": "skeleton" }) };
});

import { ExercisePickerDialog } from "@/components/workouts/exercise-picker-dialog";

function emptyOptions() {
  return {
    muscleCategories: [], primaryMuscles: [], equipmentRequired: [], mechanics: [],
    exerciseTypes: [], forceTypes: [], experienceLevels: [], secondaryMuscles: []
  };
}

function workout(id: string): Workout {
  return {
    id,
    name: `Exercise ${id}`,
    category: "Strength",
    target_muscle: "Chest",
    equipment: "Barbell",
    difficulty: "Beginner",
    sets: null,
    reps: null,
    rest_seconds: null,
    instructions: "Instructions",
    notes: null,
    is_global: true
  };
}

function result(data: Workout[], hasMore = false, nextOffset: number | null = null) {
  return {
    data,
    status: { source: "live" as const },
    pagination: { hasMore, nextOffset },
    filterOptions: emptyOptions()
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("ExercisePickerDialog request generations", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    mocks.createGroup.mockReset();
    mocks.getFilters.mockReset();
    mocks.getWorkouts.mockReset();
    mocks.createGroup
      .mockReturnValueOnce("picker-open-group")
      .mockReturnValueOnce("picker-search-group")
      .mockReturnValue("picker-later-group");
    mocks.getFilters.mockResolvedValue({ data: emptyOptions(), status: { source: "live" } });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  async function render(open = true) {
    await act(async () => {
      root.render(React.createElement(ExercisePickerDialog, {
        open,
        onOpenChange: vi.fn(),
        dayName: "Monday",
        existingKeys: [],
        onAdd: vi.fn()
      }));
    });
  }

  async function advanceDebounce() {
    await act(async () => {
      vi.advanceTimersByTime(180);
      await Promise.resolve();
    });
  }

  it("shares the initial group, loads one page, appends one cursor page, deduplicates, and preserves selection", async () => {
    mocks.getWorkouts
      .mockResolvedValueOnce(result([workout("a")], true, 60))
      .mockResolvedValueOnce(result([workout("a"), workout("b")], false, null));

    await render();
    await advanceDebounce();

    expect(mocks.getFilters).toHaveBeenCalledTimes(1);
    expect(mocks.getWorkouts).toHaveBeenCalledTimes(1);
    const filterGroup = mocks.getFilters.mock.calls[0]?.[1]?.requestGroupId;
    const initialActivityGroup = mocks.getWorkouts.mock.calls[0]?.[4]?.requestGroupId;
    expect(typeof filterGroup).toBe("string");
    expect(initialActivityGroup).toBe(filterGroup);
    expect(mocks.getWorkouts.mock.calls[0]?.[2]).toBe(0);

    const selectButton = container.querySelector<HTMLButtonElement>('button[aria-pressed="false"]');
    expect(selectButton).not.toBeNull();
    await act(async () => selectButton!.click());
    expect(container.textContent).toContain("selectedCount:1");

    const loadMoreButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("loadMore"));
    expect(loadMoreButton).toBeDefined();
    await act(async () => loadMoreButton!.click());

    expect(mocks.getWorkouts).toHaveBeenCalledTimes(2);
    expect(mocks.getWorkouts.mock.calls[1]?.[2]).toBe(60);
    expect(mocks.getWorkouts.mock.calls[1]?.[4]?.requestGroupId).toBe(initialActivityGroup);
    expect(Array.from(container.querySelectorAll("h3")).map((node) => node.textContent)).toEqual(["Exercise a", "Exercise b"]);
    expect(container.textContent).toContain("selectedCount:1");
  });

  it("aborts the previous generation and prevents a slow stale response from replacing the latest result", async () => {
    const slow = deferred<ReturnType<typeof result>>();
    const fast = deferred<ReturnType<typeof result>>();
    mocks.getWorkouts.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);

    await render();
    await advanceDebounce();
    const firstSignal = mocks.getWorkouts.mock.calls[0]?.[4]?.signal as AbortSignal;
    const firstGroup = mocks.getWorkouts.mock.calls[0]?.[4]?.requestGroupId;

    const input = container.querySelector<HTMLInputElement>('input[placeholder="searchExercises"]');
    expect(input).not.toBeNull();
    const setNativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    expect(setNativeValue).toBeDefined();
    await act(async () => {
      setNativeValue!.call(input, "new");
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await advanceDebounce();

    expect(firstSignal.aborted).toBe(true);
    expect(mocks.getWorkouts).toHaveBeenCalledTimes(2);
    const latestGroup = mocks.getWorkouts.mock.calls[1]?.[4]?.requestGroupId;
    expect(typeof latestGroup).toBe("string");
    expect(latestGroup).not.toBe(firstGroup);

    await act(async () => fast.resolve(result([workout("latest")])));
    expect(Array.from(container.querySelectorAll("h3")).map((node) => node.textContent)).toEqual(["Exercise latest"]);

    await act(async () => slow.resolve(result([workout("stale")])));
    expect(Array.from(container.querySelectorAll("h3")).map((node) => node.textContent)).toEqual(["Exercise latest"]);

    const latestSignal = mocks.getWorkouts.mock.calls[1]?.[4]?.signal as AbortSignal;
    const filtersSignal = mocks.getFilters.mock.calls[0]?.[1]?.signal as AbortSignal;
    await render(false);
    expect(latestSignal.aborted).toBe(true);
    expect(filtersSignal.aborted).toBe(true);
  });
});
