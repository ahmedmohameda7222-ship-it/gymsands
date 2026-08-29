// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  refresh: vi.fn(),
  searchValue: "",
  searchParams: { toString: () => mocks.searchValue },
  ownerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, back: mocks.back, refresh: mocks.refresh }),
  useSearchParams: () => mocks.searchParams,
}));
vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ user: { id: mocks.ownerId } }),
}));
vi.mock("@/components/nutrition/food-library/food-library-api", () => ({
  foodLibraryApi: mocks.api,
}));

import { AddToHandoffConsumer } from "@/components/nutrition/handoffs/add-to-handoff-consumer";
import type { AddToDestination } from "@/lib/nutrition-v1/add-to-handoff";

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function setNativeValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) throw new Error("Native value setter unavailable.");
  setter.call(element, value);
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function actionButton(host: HTMLElement, destination: AddToDestination) {
  const expected = destination === "diary" ? "Add to Diary" : "Add to plan";
  const button = Array.from(host.querySelectorAll("button")).find((candidate) => candidate.textContent?.includes(expected));
  if (!(button instanceof HTMLButtonElement)) throw new Error(`${destination} handoff button not rendered.`);
  return button;
}

function commitPayloads() {
  return mocks.api.mock.calls
    .filter(([input, init]) => String(input) === "/api/nutrition/v1/handoffs/commit" && (init as RequestInit | undefined)?.method === "POST")
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>);
}

describe("AddToHandoffConsumer canonical command retry identity", () => {
  let host: HTMLDivElement;
  let root: Root;
  let uuidSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mocks.ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.api.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes(`/api/nutrition/v1/recipes/`) && url.includes(`/handoff`)) {
        return new Response(JSON.stringify({ name: "Frozen chicken bowl" }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url === "/api/nutrition/v1/handoffs/commit" && init?.method === "POST") {
        return new Response(JSON.stringify({ error: "ambiguous transport failure" }), { status: 503, headers: { "content-type": "application/json" } });
      }
      throw new Error(`Unexpected request ${url}`);
    });
    uuidSpy = vi.spyOn(globalThis.crypto, "randomUUID");
    let sequence = 0;
    uuidSpy.mockImplementation(() => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++sequence).padStart(12, "0")}` as `${string}-${string}-${string}-${string}-${string}`);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    host.remove();
    uuidSpy.mockRestore();
    sessionStorage.clear();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  async function renderDestination(destination: "diary" | "meal_plan", quantity = 2) {
    mocks.searchValue = `destination=${destination}&source=recipe&recipeId=11111111-1111-4111-8111-111111111111&recipeVersionId=22222222-2222-4222-8222-222222222222&quantity=${quantity}`;
    await act(async () => { root.render(createElement(AddToHandoffConsumer, { destination })); });
    await flush();
    const date = host.querySelector('input[type="date"]');
    const meal = host.querySelector("select");
    if (!(date instanceof HTMLInputElement) || !(meal instanceof HTMLSelectElement)) throw new Error("Destination context controls not rendered.");
    await act(async () => {
      setNativeValue(date, "2026-08-28");
      setNativeValue(meal, destination === "diary" ? "Lunch" : "lunch");
    });
    await flush();
  }

  async function ambiguousCommit(destination: "diary" | "meal_plan") {
    await act(async () => { actionButton(host, destination).click(); });
    await flush();
    return commitPayloads().at(-1);
  }

  async function remount() {
    await act(async () => { root.unmount(); });
    root = createRoot(host);
  }

  for (const destination of ["diary", "meal_plan"] as const) {
    it(`retains ${destination} operation identity across an ambiguous retry and remount`, async () => {
      await renderDestination(destination, 2);
      const first = await ambiguousCommit(destination);
      expect(first?.operationId).toBeTruthy();
      expect(first?.source).toEqual(expect.objectContaining({ type: "recipe", quantity: 2 }));

      await remount();
      await renderDestination(destination, 2);
      const second = await ambiguousCommit(destination);

      expect(second?.operationId).toBe(first?.operationId);
    });
  }

  it("does not reuse another owner's persisted handoff operation identity", async () => {
    await renderDestination("diary", 2);
    const first = await ambiguousCommit("diary");
    expect(first?.operationId).toBeTruthy();

    await remount();
    mocks.ownerId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    await renderDestination("diary", 2);
    const second = await ambiguousCommit("diary");

    expect(second?.operationId).toBeTruthy();
    expect(second?.operationId).not.toBe(first?.operationId);
  });

  it("uses a new Diary operation identity when the resolved Recipe quantity changes", async () => {
    await renderDestination("diary", 2);
    const first = await ambiguousCommit("diary");

    await remount();
    await renderDestination("diary", 3);
    const second = await ambiguousCommit("diary");

    expect(second?.source).toEqual(expect.objectContaining({ type: "recipe", quantity: 3 }));
    expect(second?.operationId).not.toBe(first?.operationId);
  });
});