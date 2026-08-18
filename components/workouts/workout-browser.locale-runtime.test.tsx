// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Workout } from "@/types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  getFilters: vi.fn(),
  getWorkouts: vi.fn(),
  getFavorites: vi.fn(),
  getCustom: vi.fn(),
  toast: vi.fn(),
  tr: vi.fn((key: string, variables?: Record<string, unknown>) => variables?.count !== undefined ? `${key}:${variables.count}` : key),
  language: "en" as "en" | "de" | "ar"
}));

vi.mock("next/link", async () => {
  const ReactModule = await import("react");
  return { default: ({ children, href, ...props }: { children?: React.ReactNode; href: string; [key: string]: unknown }) => ReactModule.createElement("a", { href, ...props }, children) };
});

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ user: { id: "user-1" }, profile: { role: "user" } })
}));

vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({ toast: mocks.toast })
}));

vi.mock("@/components/ui/confirm-dialog", () => ({
  useConfirm: () => ({ dialog: null, ask: vi.fn() })
}));

vi.mock("@/lib/i18n/train", () => ({
  useTrainTranslation: () => ({
    language: mocks.language,
    dir: mocks.language === "ar" ? "rtl" : "ltr",
    locale: mocks.language === "en" ? "en-US" : mocks.language === "de" ? "de-DE" : "ar",
    tr: mocks.tr
  })
}));

vi.mock("@/lib/error-formatting", () => ({
  userSafeError: (_error: unknown, fallback: string) => fallback
}));

vi.mock("@/lib/train/exercise-display", () => ({
  formatExerciseDisplayList: (value: unknown) => Array.isArray(value) ? value.join(", ") : String(value ?? ""),
  formatExerciseDisplayValue: (value: unknown) => String(value ?? "")
}));

vi.mock("@/services/workouts/exercise-library-store", () => ({
  getFavoriteExerciseIdsWithStatus: mocks.getFavorites,
  getCustomExercisesWithStatus: mocks.getCustom,
  saveCustomExercise: vi.fn(),
  setFavoriteExercise: vi.fn()
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
    matchesWorkoutRecord: () => true,
    mergeCanonicalWorkoutFilterOptions: (current: unknown) => current,
    normalizeWorkoutFilterText: (value: string) => value.trim().toLowerCase(),
    resolveCanonicalWorkoutFilterValues: (filters: unknown) => filters
  };
});

vi.mock("lucide-react", async () => {
  const ReactModule = await import("react");
  const Icon = () => ReactModule.createElement("span", { "aria-hidden": "true" });
  return {
    AlertTriangle: Icon, CheckCircle2: Icon, ChevronDown: Icon, ExternalLink: Icon,
    Heart: Icon, MoreHorizontal: Icon, Play: Icon, Plus: Icon, RotateCcw: Icon,
    Search: Icon, SlidersHorizontal: Icon, X: Icon
  };
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

vi.mock("@/components/ui/card", async () => {
  const ReactModule = await import("react");
  const Wrapper = ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => ReactModule.createElement("div", props, children);
  return { Card: Wrapper, CardContent: Wrapper, CardHeader: Wrapper, CardTitle: Wrapper };
});

vi.mock("@/components/ui/dialog", async () => {
  const ReactModule = await import("react");
  const Wrapper = ({ children }: { children?: React.ReactNode }) => ReactModule.createElement("div", null, children);
  return {
    Dialog: ({ open, children }: { open: boolean; children?: React.ReactNode }) => open ? ReactModule.createElement(ReactModule.Fragment, null, children) : null,
    DialogContent: Wrapper, DialogDescription: Wrapper, DialogHeader: Wrapper, DialogTitle: Wrapper
  };
});

vi.mock("@/components/ui/input", async () => {
  const ReactModule = await import("react");
  return { Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => ReactModule.createElement("input", props) };
});

vi.mock("@/components/ui/label", async () => {
  const ReactModule = await import("react");
  return { Label: ({ children }: { children?: React.ReactNode }) => ReactModule.createElement("label", null, children) };
});

vi.mock("@/components/ui/state-views", async () => {
  const ReactModule = await import("react");
  return {
    CardGridSkeleton: () => ReactModule.createElement("div", { "data-skeleton": true }, "loading"),
    EmptyState: ({ title, description, actionLabel, onAction }: { title: string; description: string; actionLabel?: string; onAction?: () => void }) => ReactModule.createElement("section", { "data-empty-state": true },
      ReactModule.createElement("h2", null, title),
      ReactModule.createElement("p", null, description),
      actionLabel && onAction ? ReactModule.createElement("button", { type: "button", "data-empty-action": true, onClick: onAction }, actionLabel) : null
    ),
    ErrorState: ({ title, description, onRetry }: { title: string; description: string; onRetry?: () => void }) => ReactModule.createElement("section", { "data-error-state": true, role: "alert" },
      ReactModule.createElement("h2", null, title),
      ReactModule.createElement("p", null, description),
      onRetry ? ReactModule.createElement("button", { type: "button", "data-error-retry": true, onClick: onRetry }, "retry") : null
    )
  };
});

import { WorkoutBrowser } from "./workout-browser";

function workout(id: string, name: string): Workout {
  return {
    id,
    name,
    category: "strength",
    target_muscle: "chest",
    equipment: "barbell",
    difficulty: "intermediate",
    sets: null,
    reps: null,
    rest_seconds: null,
    instructions: "Controlled repetition",
    notes: null,
    catalog_slug: id,
    catalog_source: "library_v2",
    exercise_url: null,
    video_url: null,
    custom_video_url: null,
    is_global: true
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function inputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("WorkoutBrowser locale, recovery, and Reset runtime contract", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    window.history.replaceState(null, "", "/workouts");
    mocks.language = "en";
    mocks.toast.mockReset();
    mocks.tr.mockClear();
    mocks.getFilters.mockReset().mockResolvedValue({
      data: { muscleCategories: [], primaryMuscles: [], equipmentRequired: [], mechanics: [], exerciseTypes: [], forceTypes: [], experienceLevels: [], secondaryMuscles: [] },
      status: { source: "live" }
    });
    mocks.getFavorites.mockReset().mockResolvedValue({ data: [], status: { source: "live" } });
    mocks.getCustom.mockReset().mockResolvedValue({ data: [], status: { source: "live" } });
    mocks.getWorkouts.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it.each([
    ["en", "en"],
    ["de", "de"],
    ["ar", "ar"]
  ] as const)("maps %s UI language to %s Catalog locale for filters and Show All", async (language, expectedLocale) => {
    mocks.language = language;
    mocks.getWorkouts.mockResolvedValue({ data: [workout(`${language}-1`, `${language} exercise`)], status: { source: "live" }, pagination: { hasMore: false, nextCursor: null } });

    await act(async () => root.render(React.createElement(WorkoutBrowser)));
    await flush();
    await act(async () => (container.querySelector("[data-empty-action]") as HTMLButtonElement).click());
    await act(async () => { vi.advanceTimersByTime(220); });
    await flush();

    expect(mocks.getFilters).toHaveBeenCalledWith(expectedLocale);
    expect(mocks.getWorkouts).toHaveBeenCalledWith("", expect.any(Object), null, expectedLocale);
    expect(container.textContent).toContain(`${language} exercise`);
    expect(container.firstElementChild?.getAttribute("dir")).toBe(language === "ar" ? "rtl" : "ltr");
  });

  it("enables Reset for Show All and restores the neutral browse state", async () => {
    mocks.getWorkouts.mockResolvedValue({ data: [workout("bench", "Bench Press")], status: { source: "live" }, pagination: { hasMore: false, nextCursor: null } });

    await act(async () => root.render(React.createElement(WorkoutBrowser)));
    await flush();
    const resetBefore = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === "reset") as HTMLButtonElement;
    expect(resetBefore.disabled).toBe(true);

    await act(async () => (container.querySelector("[data-empty-action]") as HTMLButtonElement).click());
    await act(async () => { vi.advanceTimersByTime(220); });
    await flush();

    const resetActive = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === "reset") as HTMLButtonElement;
    expect(resetActive.disabled).toBe(false);
    expect(window.location.search).toContain("all=1");

    await act(async () => resetActive.click());
    await flush();

    const resetNeutral = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === "reset") as HTMLButtonElement;
    expect(resetNeutral.disabled).toBe(true);
    expect(window.location.search).not.toContain("all=1");
    expect(container.querySelector("[data-empty-state]")?.textContent).toContain("startBrowsing");
  });

  it("keeps prior results and query on failure, shows one persistent recovery surface, emits no duplicate toast, and retry recovers", async () => {
    mocks.getWorkouts
      .mockResolvedValueOnce({ data: [workout("bench", "Bench Press")], status: { source: "live" }, pagination: { hasMore: false, nextCursor: null } })
      .mockRejectedValueOnce(new Error("catalog unavailable"))
      .mockResolvedValueOnce({ data: [workout("incline", "Incline Press")], status: { source: "live" }, pagination: { hasMore: false, nextCursor: null } });

    await act(async () => root.render(React.createElement(WorkoutBrowser)));
    await flush();
    await act(async () => (container.querySelector("[data-empty-action]") as HTMLButtonElement).click());
    await act(async () => { vi.advanceTimersByTime(220); });
    await flush();
    expect(container.textContent).toContain("Bench Press");

    const search = container.querySelector('input[placeholder="searchExercisesLong"]') as HTMLInputElement;
    await act(async () => inputValue(search, "bench"));
    await act(async () => { vi.advanceTimersByTime(220); });
    await flush();

    expect(search.value).toBe("bench");
    expect(container.textContent).toContain("Bench Press");
    expect(container.querySelectorAll("[data-error-state]")).toHaveLength(1);
    expect(container.querySelector("[data-error-state]")?.textContent).toContain("exerciseSearchFailed");
    expect(container.textContent).not.toContain("exercisesShown:");
    expect(mocks.toast).not.toHaveBeenCalled();

    await act(async () => (container.querySelector("[data-error-retry]") as HTMLButtonElement).click());
    await act(async () => { vi.advanceTimersByTime(220); });
    await flush();

    expect(container.querySelectorAll("[data-error-state]")).toHaveLength(0);
    expect(search.value).toBe("bench");
    expect(container.textContent).toContain("Incline Press");
  });
});
