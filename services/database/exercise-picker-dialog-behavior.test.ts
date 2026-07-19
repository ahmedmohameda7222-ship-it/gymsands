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
    language: "en",
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
  return { Check: Icon, Dumbbell: Icon, ExternalLink: Icon, Eye: Icon, Plus: Icon, Search: Icon, X: Icon };
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
  return { CardGridSkeleton: () => ReactModule.createElement("div", null, "loading") };
});

vi.mock("@/services/database/workout-replacement-eligibility", () => ({
  getWorkoutReplacementEligibility: vi.fn().mockResolvedValue(new Map()),
  isReplacementCandidateActionable: () => true,
  replacementEligibilityMessage: () => "",
  shouldClosePickerAfterAdd: () => false
}));

import { ExercisePickerDialog, exerciseKey } from "@/components/workouts/exercise-picker-dialog";

const workout = (id: string, name: string, slug = id): Workout => ({
  id,
  name,
  category: "strength",
  target_muscle: "chest",
  equipment: "barbell",
  instructions: "Controlled repetition",
  catalog_slug: slug,
  catalog_source: "external",
  difficulty: "intermediate",
  exercise_url: null,
  video_url: null,
  custom_video_url: null
});

async function flush() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

describe("ExercisePickerDialog request generations", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    mocks.createGroup.mockReset();
    mocks.getFilters.mockReset();
    mocks.getWorkouts.mockReset();
    mocks.createGroup.mockReturnValueOnce("group-initial").mockReturnValue("group-next");
    mocks.getFilters.mockResolvedValue({ data: {
      muscleCategories: [], primaryMuscles: [], equipmentRequired: [], mechanics: [], exerciseTypes: [], forceTypes: [], experienceLevels: [], secondaryMuscles: []
    } });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("shares the initial group, loads one page, appends one cursor page, deduplicates, and preserves selection", async () => {
    const first = workout("one", "One");
    const duplicate = workout("one-new", "One localized", "one");
    const second = workout("two", "Two");
    mocks.getWorkouts
      .mockResolvedValueOnce({ data: [first], pagination: { hasMore: true, nextOffset: 1 } })
      .mockResolvedValueOnce({ data: [duplicate, second], pagination: { hasMore: false, nextOffset: null } });
    const onAdd = vi.fn();

    await act(async () => {
      root.render(<ExercisePickerDialog open onOpenChange={() => undefined} dayName="Push" existingKeys={[]} onAdd={onAdd} />);
    });
    await act(async () => { vi.advanceTimersByTime(180); });
    await flush();

    expect(mocks.getFilters).toHaveBeenCalledWith("en", expect.objectContaining({ requestGroupId: "group-initial" }));
    expect(mocks.getWorkouts).toHaveBeenCalledWith("", expect.any(Object), 0, "en", expect.objectContaining({ requestGroupId: "group-initial" }));

    const buttons = Array.from(container.querySelectorAll("button"));
    const selectButton = buttons.find((button) => button.textContent?.includes("select"));
    expect(selectButton).toBeTruthy();
    await act(async () => selectButton!.click());

    const loadMore = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("loadMore"));
    expect(loadMore).toBeTruthy();
    await act(async () => loadMore!.click());
    await flush();

    expect(mocks.getWorkouts).toHaveBeenLastCalledWith("", expect.any(Object), 1, "en", expect.objectContaining({ requestGroupId: "group-initial" }));
    expect(container.textContent).toContain("One");
    expect(container.textContent).toContain("Two");
    expect(container.textContent?.match(/One localized/g)).toBeNull();
    expect(container.textContent).toContain("selectedCount:1");

    const addButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("addNExercises"));
    await act(async () => addButton!.click());
    expect(onAdd).toHaveBeenCalledWith([first]);
    expect(exerciseKey(first)).toBe("catalog:one");
  });

  it("aborts the previous generation and prevents a slow stale response from replacing the latest result", async () => {
    const slow = workout("slow", "Slow");
    const fast = workout("fast", "Fast");
    let resolveSlow!: (value: unknown) => void;
    const slowPromise = new Promise((resolve) => { resolveSlow = resolve; });
    mocks.getWorkouts.mockReturnValueOnce(slowPromise).mockResolvedValueOnce({ data: [fast], pagination: { hasMore: false, nextOffset: null } });

    await act(async () => {
      root.render(<ExercisePickerDialog open onOpenChange={() => undefined} dayName="Push" existingKeys={[]} onAdd={() => undefined} />);
    });
    await act(async () => { vi.advanceTimersByTime(180); });
    const input = container.querySelector('input[placeholder="searchExercises"]') as HTMLInputElement;
    await act(async () => {
      input.value = "fast";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { vi.advanceTimersByTime(180); });
    await flush();
    resolveSlow({ data: [slow], pagination: { hasMore: false, nextOffset: null } });
    await flush();

    expect(container.textContent).toContain("Fast");
    expect(container.textContent).not.toContain("Slow");
  });
});
