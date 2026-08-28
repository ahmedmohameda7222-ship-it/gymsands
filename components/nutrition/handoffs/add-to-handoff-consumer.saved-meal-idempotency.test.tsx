// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  api: vi.fn(), back: vi.fn(), refresh: vi.fn(), replace: vi.fn(),
  searchParams: { toString: () => "destination=saved_meal&source=recipe&recipeId=11111111-1111-4111-8111-111111111111&recipeVersionId=22222222-2222-4222-8222-222222222222&quantity=2" },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, back: mocks.back, refresh: mocks.refresh }),
  useSearchParams: () => mocks.searchParams,
}));
vi.mock("@/components/nutrition/food-library/food-library-api", () => ({ foodLibraryApi: mocks.api }));

import { AddToHandoffConsumer } from "@/components/nutrition/handoffs/add-to-handoff-consumer";

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function setInput(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) throw new Error("Input setter unavailable.");
  setter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function payloads() {
  return mocks.api.mock.calls
    .filter(([input, init]) => String(input) === "/api/nutrition/v1/handoffs/commit" && (init as RequestInit | undefined)?.method === "POST")
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>);
}

describe("Recipe to Saved Meal uncertain-completion identity", () => {
  let host: HTMLDivElement;
  let root: Root;
  let uuidSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.api.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/nutrition/v1/recipes/") && url.includes("/handoff")) {
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

  async function renderAndFill() {
    await act(async () => { root.render(createElement(AddToHandoffConsumer, { destination: "saved_meal" })); });
    await flush();
    const name = Array.from(host.querySelectorAll("input")).find((input) => input.type !== "number");
    if (!(name instanceof HTMLInputElement)) throw new Error("Saved Meal name input not rendered.");
    await act(async () => { setInput(name, "Cooked chicken meal"); });
    await flush();
  }

  async function commit() {
    const button = Array.from(host.querySelectorAll("button")).find((candidate) => candidate.textContent?.includes("Create Saved Meal"));
    if (!(button instanceof HTMLButtonElement)) throw new Error("Create Saved Meal button not rendered.");
    await act(async () => { button.click(); });
    await flush();
    return payloads().at(-1);
  }

  it("retains one operation ID across ambiguous failure and remount", async () => {
    await renderAndFill();
    const first = await commit();
    expect(first?.operationId).toBeTruthy();
    expect(first?.source).toEqual(expect.objectContaining({ type: "recipe", quantity: 2 }));

    await act(async () => { root.unmount(); });
    root = createRoot(host);
    await renderAndFill();
    const second = await commit();

    expect(second?.operationId).toBe(first?.operationId);
  });
});
