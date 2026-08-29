// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    session: {
      access_token: "test-token",
      user: { id: "11111111-1111-4111-8111-111111111111" },
    },
  }),
}));
vi.mock("@/lib/i18n/eat", () => ({
  useEatTranslation: () => ({
    et: (key: string) => key,
    language: "en",
    dir: "ltr",
    mealLabel: (meal: string) => meal,
  }),
}));

import { LoggingSession } from "@/components/nutrition/diary/logging-session";

const ownerId = "11111111-1111-4111-8111-111111111111";
const occurrenceId = "22222222-2222-4222-8222-222222222222";
const draftKey = `plaivra:nutrition-v1:diary-draft:${ownerId}:2026-08-28:Lunch:planned:${occurrenceId}`;

const plannedOccurrence = {
  id: occurrenceId,
  sourceType: "food",
  sourceId: "33333333-3333-4333-8333-333333333333",
  sourceVersionId: null,
  name: "Chicken bowl",
  mealType: "Lunch",
  status: "planned",
  frozenSnapshot: {
    items: [{
      foodName: "Chicken bowl",
      servingLabel: "1 bowl",
      quantity: 1,
      nutrition: { calories: 540, protein_g: 48, carbs_g: 63, fat_g: 12 },
      foodItemId: "33333333-3333-4333-8333-333333333333",
    }],
  },
} as never;

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function logButton(host: HTMLElement) {
  const button = Array.from(host.querySelectorAll("button")).find((candidate) => candidate.textContent?.includes("Log 1 item"));
  if (!(button instanceof HTMLButtonElement)) throw new Error("Diary Plate log button not rendered.");
  return button;
}

function quantityInput(host: HTMLElement) {
  const input = host.querySelector('input[aria-label="Quantity for Chicken bowl"]');
  if (!(input instanceof HTMLInputElement)) throw new Error("Diary quantity input not rendered.");
  return input;
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) throw new Error("Input value setter unavailable.");
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function loggedOperationIds() {
  return mocks.fetch.mock.calls
    .filter(([input]) => String(input).includes("/api/nutrition/v1/log"))
    .map(([, init]) => JSON.parse(String((init as RequestInit | undefined)?.body)).operationId as string);
}

describe("LoggingSession uncertain-submit idempotency", () => {
  let host: HTMLDivElement;
  let root: Root;
  let uuidSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.fetch.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/nutrition/v1/foods")) return new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200, headers: { "Content-Type": "application/json" } });
      if (String(input).includes("/api/nutrition/v1/log")) return new Response(JSON.stringify({ error: "ambiguous response" }), { status: 503, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
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
    vi.unstubAllGlobals();
    localStorage.clear();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  async function renderSession() {
    await act(async () => {
      root.render(createElement(LoggingSession, {
        date: "2026-08-28",
        meal: "Lunch",
        savedMeals: [],
        plannedOccurrence,
        onClose: vi.fn(),
        onConfirmed: vi.fn(),
      }));
    });
    await flush();
  }

  it("reuses the same operation ID when an ambiguous submit is retried without editing the Plate", async () => {
    await renderSession();

    await act(async () => { logButton(host).click(); });
    await flush();
    await act(async () => { logButton(host).click(); });
    await flush();

    const ids = loggedOperationIds();
    expect(ids).toHaveLength(2);
    expect(ids[1]).toBe(ids[0]);
  });

  it("persists the pending operation ID across a logger reload", async () => {
    await renderSession();
    await act(async () => { logButton(host).click(); });
    await flush();
    const firstId = loggedOperationIds()[0];
    expect(firstId).toBeTruthy();
    expect(localStorage.getItem(draftKey)).toBeTruthy();

    await act(async () => { root.unmount(); });
    root = createRoot(host);
    await renderSession();
    await act(async () => { logButton(host).click(); });
    await flush();

    expect(loggedOperationIds().at(-1)).toBe(firstId);
  });

  it("rotates the operation ID after the Plate is edited following an ambiguous submit", async () => {
    await renderSession();
    await act(async () => { logButton(host).click(); });
    await flush();
    const firstId = loggedOperationIds()[0];

    await act(async () => { setInputValue(quantityInput(host), "1.5"); });
    await flush();
    await act(async () => { logButton(host).click(); });
    await flush();

    const secondId = loggedOperationIds().at(-1);
    expect(secondId).toBeTruthy();
    expect(secondId).not.toBe(firstId);
  });
});
