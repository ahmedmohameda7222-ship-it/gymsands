// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTodayProjectionFixture } from "@/lib/dashboard/testing/today-projection-fixture";
import type { TodayProjectionResponseV1 } from "@/lib/dashboard/today-projection-contract";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const mealId = "11111111-1111-4111-8111-111111111126";
const groceryId = "11111111-1111-4111-8111-111111111127";

function populatedFixture(
  calories = 100,
  date = "2026-08-03",
  timezone = "Europe/Berlin",
): TodayProjectionResponseV1 {
  const base = createTodayProjectionFixture({ date, timezone });
  return {
    ...base,
    meals: {
      state: "loaded",
      errorCode: null,
      value: {
        items: [
          {
            id: mealId,
            mealType: "Dinner",
            name: "Chicken bowl",
            calories: 600,
            proteinG: 45,
            status: "planned",
          },
        ],
        itemCount: 1,
        plannedCount: 1,
      },
    },
    nutrition: {
      logs: {
        state: "loaded",
        errorCode: null,
        value: {
          totals: { calories, proteinG: 20, carbsG: 30, fatG: 10 },
          foodLogCount: 1,
        },
      },
      targets: {
        state: "loaded",
        errorCode: null,
        value: {
          hasTarget: true,
          dailyCalories: 2000,
          proteinG: 150,
          carbsG: 220,
          fatG: 70,
          waterMl: 2500,
          sourceType: "training_day",
        },
      },
    },
    shopping: {
      state: "loaded",
      errorCode: null,
      value: {
        items: [
          {
            id: groceryId,
            weekStart: "2026-08-03",
            itemName: "Rice",
            quantity: 1,
            unit: "kg",
            storeSection: "Pantry",
            checked: false,
            alreadyHave: false,
          },
        ],
        itemCount: 1,
      },
    },
    promptContext: {
      ...base.promptContext,
      nutrition: {
        ...base.promptContext.nutrition,
        hasTargets: true,
        remainingCalories: 2000 - calories,
        remainingProtein: 130,
        remainingCarbs: 190,
        remainingFat: 60,
        foodLogCount: 1,
        mealPlanCount: 1,
        plannedMealCount: 1,
      },
      grocery: { state: "loaded", itemCount: 1 },
      hydration: {
        state: "loaded",
        hasTarget: true,
        logCount: 0,
        remainingMl: 2500,
      },
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const mocks = vi.hoisted(() => ({
  auth: {
    user: { id: ownerA },
    profile: { full_name: "Ahmed Mohamed" },
    session: { access_token: "token-a" },
  } as {
    user: { id: string } | null;
    profile: { full_name: string | null } | null;
    session: { access_token: string } | null;
  },
  date: "2026-08-03",
  timezone: "Europe/Berlin",
  getProjection: vi.fn(),
  markDone: vi.fn(),
  markSkipped: vi.fn(),
  markSkippedMany: vi.fn(),
  toggleShopping: vi.fn(),
  toast: vi.fn(),
  openPrompts: vi.fn(),
  publishContext: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/hooks/use-today-date", () => ({ useTodayDate: () => mocks.date }));
vi.mock("@/lib/i18n/use-translation", () => ({
  useTranslation: () => ({ language: "en", dir: "ltr" }),
}));
vi.mock("@/lib/settings/user-settings-context", () => ({
  useUserSettings: () => ({
    settings: { energyUnit: "kcal", liquidUnit: "ml", weightUnit: "kg" },
  }),
}));
vi.mock("@/components/ui/toaster", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));
vi.mock("@/components/ai/quick-chatgpt-provider", () => ({
  useQuickChatGpt: () => ({
    openPrompts: mocks.openPrompts,
    setDashboardContext: mocks.publishContext,
  }),
}));
vi.mock("@/services/dashboard/today-client", () => ({
  getTodayProjection: mocks.getProjection,
}));
vi.mock("@/services/dashboard/today-mutations", () => ({
  markTodayMealDone: mocks.markDone,
  markTodayMealSkipped: mocks.markSkipped,
  markTodayMealsSkipped: mocks.markSkippedMany,
  toggleTodayShoppingItem: mocks.toggleShopping,
}));
vi.mock("@/services/database/today-nutrition", () => ({
  subscribeToTodayNutritionTargetChanges: (
    target: EventTarget,
    today: string,
    refresh: () => void,
  ) => {
    const listener = (event: Event) => {
      const date = (event as CustomEvent<{ date?: string }>).detail?.date;
      if (!date || date === today) refresh();
    };
    target.addEventListener("test-target-change", listener);
    return () => target.removeEventListener("test-target-change", listener);
  },
}));
vi.mock("@/components/layout/page-heading", () => ({
  PageHeading: ({ title, action }: { title: string; action?: ReactNode }) => (
    <header data-heading={title}>{action}</header>
  ),
}));
vi.mock("@/components/dashboard/today-progress", () => ({
  TodayProgress: ({
    totals,
    logsState,
  }: {
    totals: { calories: number } | null;
    logsState: string;
  }) => (
    <output data-progress data-calories={totals?.calories ?? "none"} data-state={logsState} />
  ),
}));
vi.mock("@/components/dashboard/wellness-today", () => ({
  WellnessToday: ({ state }: { state: string }) => <div data-wellness={state} />,
}));
vi.mock("@/components/brand/openai-blossom", () => ({
  OpenAiBlossom: () => <span />,
}));
vi.mock("@/components/motion", () => ({
  InlineFeedback: ({ message }: { message: string }) => <div data-feedback={message} />,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({
    asChild,
    children,
    variant: _variant,
    className: _className,
    ...props
  }: {
    asChild?: boolean;
    children?: ReactNode;
    variant?: string;
    className?: string;
  } & Record<string, unknown>) =>
    asChild ? <>{children}</> : <button {...props}>{children}</button>,
}));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children?: ReactNode }) => <section>{children}</section>,
  CardContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children, id }: { children?: ReactNode; id?: string }) => <h3 id={id}>{children}</h3>,
}));

import { TodayDashboard } from "@/components/dashboard/today-dashboard";

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let resolvedOptionsSpy: ReturnType<typeof vi.spyOn>;

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderDashboard() {
  if (!root) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  }
  await act(async () => {
    root!.render(<TodayDashboard />);
  });
  await flush();
}

function button(label: string) {
  return Array.from(container?.querySelectorAll("button") ?? []).find((node) =>
    node.textContent?.includes(label),
  ) as HTMLButtonElement | undefined;
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.auth = {
    user: { id: ownerA },
    profile: { full_name: "Ahmed Mohamed" },
    session: { access_token: "token-a" },
  };
  mocks.date = "2026-08-03";
  mocks.timezone = "Europe/Berlin";
  vi.clearAllMocks();
  mocks.getProjection.mockResolvedValue(populatedFixture());
  mocks.markDone.mockResolvedValue({
    item: {
      id: mealId,
      mealType: "Dinner",
      name: "Chicken bowl",
      calories: 600,
      proteinG: 45,
      status: "done",
    },
    log: { id: "log-new", calories: 600, proteinG: 45, carbsG: 60, fatG: 20 },
    alreadyDone: false,
  });
  mocks.markSkipped.mockResolvedValue({
    id: mealId,
    mealType: "Dinner",
    name: "Chicken bowl",
    calories: 600,
    proteinG: 45,
    status: "skipped",
  });
  mocks.markSkippedMany.mockResolvedValue([]);
  mocks.toggleShopping.mockResolvedValue({
    id: groceryId,
    weekStart: "2026-08-03",
    itemName: "Rice",
    quantity: 1,
    unit: "kg",
    storeSection: "Pantry",
    checked: true,
    alreadyHave: false,
  });
  const original = Intl.DateTimeFormat.prototype.resolvedOptions;
  resolvedOptionsSpy = vi
    .spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions")
    .mockImplementation(function () {
      return { ...original.call(this), timeZone: mocks.timezone };
    });
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  container?.remove();
  container = null;
  resolvedOptionsSpy.mockRestore();
  document.body.replaceChildren();
});

describe("Today projection request authority", () => {
  it("performs one initial request and zero for rerender, token refresh, prompt publication, and shopping expansion", async () => {
    await renderDashboard();
    expect(mocks.getProjection).toHaveBeenCalledOnce();
    expect(mocks.getProjection).toHaveBeenCalledWith(
      ownerA,
      "2026-08-03",
      "Europe/Berlin",
      expect.objectContaining({ accessToken: "token-a" }),
    );

    await renderDashboard();
    expect(mocks.getProjection).toHaveBeenCalledOnce();

    mocks.auth = { ...mocks.auth, session: { access_token: "token-b" } };
    await renderDashboard();
    expect(mocks.getProjection).toHaveBeenCalledOnce();

    button("Shopping list")?.click();
    await flush();
    expect(mocks.getProjection).toHaveBeenCalledOnce();
    expect(mocks.publishContext).toHaveBeenCalled();
  });

  it("uses the latest token on one forced retry and shares an in-flight retry", async () => {
    const partial = populatedFixture();
    partial.workout = {
      state: "failed",
      value: null,
      errorCode: "workout_unavailable",
    };
    partial.promptContext.workout = {
      ...partial.promptContext.workout,
      state: "failed",
      hasPlan: null,
    };
    mocks.getProjection.mockResolvedValueOnce(partial);
    await renderDashboard();

    mocks.auth = { ...mocks.auth, session: { access_token: "token-b" } };
    await renderDashboard();
    const retry = deferred<TodayProjectionResponseV1>();
    mocks.getProjection.mockReturnValueOnce(retry.promise);
    await act(async () => button("Retry")!.click());
    await act(async () => button("Retry")!.click());
    expect(mocks.getProjection).toHaveBeenCalledTimes(2);
    expect(mocks.getProjection.mock.calls[1][3]).toMatchObject({ accessToken: "token-b" });
    retry.resolve(populatedFixture());
    await flush();
    expect(mocks.getProjection).toHaveBeenCalledTimes(2);
  });

  it("keeps usable content after repeated retry failures and allows another retry", async () => {
    const partial = populatedFixture();
    partial.workout = { state: "failed", value: null, errorCode: "workout_unavailable" };
    mocks.getProjection.mockResolvedValueOnce(partial);
    await renderDashboard();
    mocks.getProjection.mockRejectedValueOnce(new Error("temporary one"));
    await act(async () => button("Retry")!.click());
    await flush();
    expect(container?.querySelector("[data-calories]")?.getAttribute("data-calories")).toBe("100");
    mocks.getProjection.mockRejectedValueOnce(new Error("temporary two"));
    await act(async () => button("Retry")!.click());
    await flush();
    expect(mocks.getProjection).toHaveBeenCalledTimes(3);
    expect(button("Retry")).toBeDefined();
  });

  it("treats successful empty as resolved without a request loop", async () => {
    mocks.getProjection.mockResolvedValue(createTodayProjectionFixture());
    await renderDashboard();
    await renderDashboard();
    await flush();
    expect(mocks.getProjection).toHaveBeenCalledOnce();
  });

  it("clears A immediately, starts one B request, and rejects stale A publication", async () => {
    const requestA = deferred<TodayProjectionResponseV1>();
    const requestB = deferred<TodayProjectionResponseV1>();
    mocks.getProjection.mockReturnValueOnce(requestA.promise).mockReturnValueOnce(requestB.promise);
    await renderDashboard();
    expect(mocks.getProjection).toHaveBeenCalledOnce();

    mocks.auth = {
      user: { id: ownerB },
      profile: { full_name: "User B" },
      session: { access_token: "token-b" },
    };
    await renderDashboard();
    expect(mocks.getProjection).toHaveBeenCalledTimes(2);
    expect(container?.querySelector("[data-calories]")?.getAttribute("data-calories")).toBe("none");

    requestB.resolve(populatedFixture(222));
    await flush();
    expect(container?.querySelector("[data-calories]")?.getAttribute("data-calories")).toBe("222");
    requestA.resolve(populatedFixture(111));
    await flush();
    expect(container?.querySelector("[data-calories]")?.getAttribute("data-calories")).toBe("222");
  });

  it("starts exactly one request for date, timezone, and current target changes but none for another date", async () => {
    await renderDashboard();
    mocks.date = "2026-08-04";
    mocks.getProjection.mockResolvedValue(populatedFixture(100, "2026-08-04"));
    await renderDashboard();
    expect(mocks.getProjection).toHaveBeenCalledTimes(2);

    mocks.timezone = "Europe/London";
    mocks.getProjection.mockResolvedValue(populatedFixture(100, "2026-08-04", "Europe/London"));
    await renderDashboard();
    expect(mocks.getProjection).toHaveBeenCalledTimes(3);

    window.dispatchEvent(new CustomEvent("test-target-change", { detail: { date: "2026-08-03" } }));
    await flush();
    expect(mocks.getProjection).toHaveBeenCalledTimes(3);
    window.dispatchEvent(new CustomEvent("test-target-change", { detail: { date: "2026-08-04" } }));
    await flush();
    expect(mocks.getProjection).toHaveBeenCalledTimes(4);
  });

  it("updates meal done, meal skip, and grocery toggle locally with zero projection reloads", async () => {
    await renderDashboard();
    await act(async () => button("Mark done")!.click());
    await flush();
    expect(mocks.markDone).toHaveBeenCalledOnce();
    expect(mocks.getProjection).toHaveBeenCalledOnce();
    expect(container?.querySelector("[data-calories]")?.getAttribute("data-calories")).toBe("700");

    mocks.getProjection.mockResolvedValue(populatedFixture());
    mocks.date = "2026-08-04";
    await renderDashboard();
    await act(async () => button("Skip")!.click());
    await flush();
    expect(mocks.markSkipped).toHaveBeenCalledOnce();
    expect(mocks.getProjection).toHaveBeenCalledTimes(2);

    button("Shopping list")?.click();
    await flush();
    const checkbox = container?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(checkbox).not.toBeNull();
    await act(async () => checkbox!.click());
    await flush();
    expect(mocks.toggleShopping).toHaveBeenCalledOnce();
    expect(mocks.getProjection).toHaveBeenCalledTimes(2);
  });

  it("prevents an old mutation result from publishing into a new owner", async () => {
    const mutation = deferred<Awaited<ReturnType<typeof mocks.markDone>>>();
    mocks.markDone.mockReturnValueOnce(mutation.promise);
    await renderDashboard();
    await act(async () => button("Mark done")!.click());

    mocks.auth = {
      user: { id: ownerB },
      profile: { full_name: "User B" },
      session: { access_token: "token-b" },
    };
    mocks.getProjection.mockResolvedValue(populatedFixture(222));
    await renderDashboard();
    mutation.resolve({
      item: {
        id: mealId,
        mealType: "Dinner",
        name: "Chicken bowl",
        calories: 600,
        proteinG: 45,
        status: "done",
      },
      log: { id: "old-log", calories: 600, proteinG: 45, carbsG: 60, fatG: 20 },
      alreadyDone: false,
    });
    await flush();
    expect(container?.querySelector("[data-calories]")?.getAttribute("data-calories")).toBe("222");
  });
});
