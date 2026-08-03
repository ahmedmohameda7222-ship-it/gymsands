// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  TodayMealPlanItemProjection,
  TodayProjectionResponseV1,
  TodayShoppingItemProjection,
} from "@/lib/dashboard/today-projection-contract";
import { createTodayProjectionFixture } from "@/lib/dashboard/testing/today-projection-fixture";

const ownerA = "11111111-1111-4111-8111-111111111111";
const mealA = "11111111-1111-4111-8111-111111111131";
const mealB = "11111111-1111-4111-8111-111111111132";
const mealC = "11111111-1111-4111-8111-111111111133";
const groceryA = "11111111-1111-4111-8111-111111111141";
const groceryB = "11111111-1111-4111-8111-111111111142";

function meal(id: string, name: string): TodayMealPlanItemProjection {
  return {
    id,
    mealType: "Dinner",
    name,
    calories: 600,
    proteinG: 45,
    status: "planned",
  };
}

function grocery(id: string, itemName: string): TodayShoppingItemProjection {
  return {
    id,
    weekStart: "2026-08-03",
    itemName,
    quantity: 1,
    unit: "item",
    storeSection: "Pantry",
    checked: false,
    alreadyHave: false,
  };
}

function fixture(calories = 100): TodayProjectionResponseV1 {
  const base = createTodayProjectionFixture({
    date: "2026-08-03",
    timezone: "Europe/Berlin",
  });
  return {
    ...base,
    meals: {
      state: "loaded",
      errorCode: null,
      value: {
        items: [meal(mealA, "Meal A"), meal(mealB, "Meal B"), meal(mealC, "Meal C")],
        itemCount: 3,
        plannedCount: 3,
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
        items: [grocery(groceryA, "Rice"), grocery(groceryB, "Beans")],
        itemCount: 2,
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
        mealPlanCount: 3,
        plannedMealCount: 3,
      },
      grocery: { state: "loaded", itemCount: 2 },
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
  getProjection: vi.fn(),
  markDone: vi.fn(),
  markSkipped: vi.fn(),
  markSkippedMany: vi.fn(),
  toggleShopping: vi.fn(),
  toast: vi.fn(),
  publishContext: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/hooks/use-today-date", () => ({ useTodayDate: () => "2026-08-03" }));
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
    openPrompts: vi.fn(),
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
  subscribeToTodayNutritionTargetChanges: () => () => undefined,
}));
vi.mock("@/components/layout/page-heading", () => ({
  PageHeading: ({ action }: { action?: ReactNode }) => <header>{action}</header>,
}));
vi.mock("@/components/dashboard/today-progress", () => ({
  TodayProgress: ({ totals }: { totals: { calories: number } | null }) => (
    <output data-calories={totals?.calories ?? "none"} />
  ),
}));
vi.mock("@/components/dashboard/wellness-today", () => ({
  WellnessToday: () => <div />,
}));
vi.mock("@/components/brand/openai-blossom", () => ({
  OpenAiBlossom: () => <span />,
}));
vi.mock("@/components/motion", () => ({
  InlineFeedback: ({ message }: { message: string }) => <div>{message}</div>,
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
  CardTitle: ({ children, id }: { children?: ReactNode; id?: string }) => (
    <h3 id={id}>{children}</h3>
  ),
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
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<TodayDashboard />));
  await flush();
}

function exactButton(label: string) {
  return Array.from(container?.querySelectorAll("button") ?? []).find(
    (node) => node.textContent?.trim() === label,
  ) as HTMLButtonElement | undefined;
}

function containingButton(label: string) {
  return Array.from(container?.querySelectorAll("button") ?? []).find((node) =>
    node.textContent?.includes(label),
  ) as HTMLButtonElement | undefined;
}

async function clickExact(label: string) {
  const target = exactButton(label);
  expect(target, `Expected ${label} button`).toBeDefined();
  await act(async () => target!.click());
  await flush();
}

async function expandShopping() {
  const target = containingButton("Shopping list");
  expect(target).toBeDefined();
  await act(async () => target!.click());
  await flush();
}

async function clickFirstCheckbox() {
  const target = container?.querySelector<HTMLInputElement>('input[type="checkbox"]');
  expect(target).not.toBeNull();
  await act(async () => target!.click());
  await flush();
}

function lastPlannedCount() {
  const context = mocks.publishContext.mock.calls.at(-1)?.[0] as
    | { nutrition?: { plannedMealCount?: number | null } }
    | undefined;
  return context?.nutrition?.plannedMealCount;
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mocks.auth = {
    user: { id: ownerA },
    profile: { full_name: "Ahmed Mohamed" },
    session: { access_token: "token-a" },
  };
  mocks.getProjection.mockResolvedValue(fixture());
  mocks.markDone.mockImplementation(async (_userId: string, itemId: string) => ({
    item: { ...meal(itemId, itemId === mealA ? "Meal A" : "Meal"), status: "done" },
    log: {
      id: `log-${itemId}`,
      calories: 600,
      proteinG: 45,
      carbsG: 60,
      fatG: 20,
    },
    alreadyDone: false,
  }));
  mocks.markSkipped.mockImplementation(async (_userId: string, itemId: string) => ({
    ...meal(
      itemId,
      itemId === mealA ? "Meal A" : itemId === mealB ? "Meal B" : "Meal C",
    ),
    status: "skipped",
  }));
  mocks.markSkippedMany.mockImplementation(
    async (_userId: string, itemIds: string[]) =>
      itemIds.map((itemId) => ({
        ...meal(
          itemId,
          itemId === mealA ? "Meal A" : itemId === mealB ? "Meal B" : "Meal C",
        ),
        status: "skipped" as const,
      })),
  );
  mocks.toggleShopping.mockImplementation(
    async (_userId: string, item: TodayShoppingItemProjection) => ({
      ...item,
      checked: !item.checked,
    }),
  );
  const original = Intl.DateTimeFormat.prototype.resolvedOptions;
  resolvedOptionsSpy = vi
    .spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions")
    .mockImplementation(function (this: Intl.DateTimeFormat) {
      return { ...original.call(this), timeZone: "Europe/Berlin" };
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

describe("Today domain-scoped optimistic rollback", () => {
  it("keeps grocery success when a concurrent meal skip fails", async () => {
    const skip = deferred<TodayMealPlanItemProjection>();
    mocks.markSkipped.mockReturnValueOnce(skip.promise);
    await renderDashboard();

    await clickExact("Skip");
    await expandShopping();
    await clickFirstCheckbox();
    skip.reject(new Error("meal skip failed"));
    await flush();

    expect(container?.textContent).toContain("1 bought");
    expect(lastPlannedCount()).toBe(3);
    expect(mocks.getProjection).toHaveBeenCalledOnce();
  });

  it("keeps meal and nutrition success when a concurrent grocery toggle fails", async () => {
    const toggle = deferred<TodayShoppingItemProjection>();
    mocks.toggleShopping.mockReturnValueOnce(toggle.promise);
    await renderDashboard();

    await expandShopping();
    await clickFirstCheckbox();
    await clickExact("Done");
    toggle.reject(new Error("grocery failed"));
    await flush();

    expect(
      container?.querySelector("[data-calories]")?.getAttribute("data-calories"),
    ).toBe("700");
    expect(lastPlannedCount()).toBe(2);
    expect(mocks.getProjection).toHaveBeenCalledOnce();
  });

  it("keeps one concurrent grocery toggle when the other fails", async () => {
    const first = deferred<TodayShoppingItemProjection>();
    const second = deferred<TodayShoppingItemProjection>();
    mocks.toggleShopping.mockImplementation(
      (_userId: string, item: TodayShoppingItemProjection) =>
        item.id === groceryA ? first.promise : second.promise,
    );
    await renderDashboard();

    await expandShopping();
    await clickFirstCheckbox();
    await clickFirstCheckbox();
    second.resolve({ ...grocery(groceryB, "Beans"), checked: true });
    first.reject(new Error("first grocery failed"));
    await flush();

    expect(container?.textContent).toContain("1 bought");
    expect(container?.textContent).toContain("1 remaining");
  });

  it("keeps one concurrent meal skip when the other fails", async () => {
    const first = deferred<TodayMealPlanItemProjection>();
    const second = deferred<TodayMealPlanItemProjection>();
    mocks.markSkipped.mockImplementation(
      (_userId: string, itemId: string) =>
        itemId === mealA ? first.promise : second.promise,
    );
    await renderDashboard();

    await clickExact("Skip");
    await clickExact("Skip");
    second.resolve({ ...meal(mealB, "Meal B"), status: "skipped" });
    first.reject(new Error("first meal failed"));
    await flush();

    expect(container?.textContent).toContain("Meal A");
    expect(lastPlannedCount()).toBe(2);
  });

  it("restores unconfirmed items after a partial multi-skip response", async () => {
    mocks.markSkippedMany.mockResolvedValueOnce([
      { ...meal(mealA, "Meal A"), status: "skipped" },
    ]);
    await renderDashboard();

    await clickExact("Skip all");
    expect(container?.textContent).toContain("Meal B");
    expect(lastPlannedCount()).toBe(2);
    expect(mocks.getProjection).toHaveBeenCalledOnce();
  });
});
