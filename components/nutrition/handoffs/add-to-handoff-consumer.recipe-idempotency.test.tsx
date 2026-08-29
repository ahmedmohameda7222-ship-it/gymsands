// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  refresh: vi.fn(),
  searchParams: {
    toString: () => "destination=recipe&ingredientFoodId=55555555-5555-4555-8555-555555555555&source=catalog&quantity=2&serving=100%20g",
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, back: mocks.back, refresh: mocks.refresh }),
  useSearchParams: () => mocks.searchParams,
}));
vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } }),
}));
vi.mock("@/components/nutrition/food-library/food-library-api", () => ({
  foodLibraryApi: mocks.api,
}));

import { AddToHandoffConsumer } from "@/components/nutrition/handoffs/add-to-handoff-consumer";

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function actionButton(host: HTMLElement) {
  const button = Array.from(host.querySelectorAll("button")).find((candidate) => candidate.textContent?.includes("Add to new Recipe"));
  if (!(button instanceof HTMLButtonElement)) throw new Error("New Recipe handoff button not rendered.");
  return button;
}

function commitOperationIds() {
  return mocks.api.mock.calls
    .filter(([input, init]) => String(input) === "/api/nutrition/v1/handoffs/commit" && (init as RequestInit | undefined)?.method === "POST")
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)).operationId as string | undefined);
}

describe("AddToHandoffConsumer new Recipe retry identity", () => {
  let host: HTMLDivElement;
  let root: Root;
  let uuidSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let commitCount = 0;
    mocks.api.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/nutrition/v1/foods/") && url.includes("/handoff")) {
        return new Response(JSON.stringify({ name: "Atomic chicken" }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url === "/api/nutrition/v1/recipes?limit=100") {
        return new Response(JSON.stringify({ recipes: [] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url === "/api/nutrition/v1/handoffs/commit" && init?.method === "POST") {
        commitCount += 1;
        return new Response(JSON.stringify({ error: `ambiguous-${commitCount}` }), { status: 503, headers: { "content-type": "application/json" } });
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

  async function renderConsumer() {
    await act(async () => { root.render(createElement(AddToHandoffConsumer, { destination: "recipe" })); });
    await flush();
  }

  it("reuses one operation ID when an ambiguous new-Recipe command is retried", async () => {
    await renderConsumer();
    await act(async () => { actionButton(host).click(); });
    await flush();
    await act(async () => { actionButton(host).click(); });
    await flush();

    const ids = commitOperationIds();
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBe(ids[0]);
  });

  it("retains the pending new-Recipe operation ID across a remount", async () => {
    await renderConsumer();
    await act(async () => { actionButton(host).click(); });
    await flush();
    const firstId = commitOperationIds()[0];
    expect(firstId).toBeTruthy();

    await act(async () => { root.unmount(); });
    root = createRoot(host);
    await renderConsumer();
    await act(async () => { actionButton(host).click(); });
    await flush();

    expect(commitOperationIds().at(-1)).toBe(firstId);
  });
});