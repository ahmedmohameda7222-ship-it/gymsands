import { describe, expect, it, vi } from "vitest";
import { ActivityCatalogError } from "@/lib/activity-catalog/errors";
import { HttpActivityCatalogProvider } from "./http-provider";

const activity = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "barbell_back_squat",
  name: "Barbell Back Squat",
  shortDescription: "A controlled bilateral squat performed with a barbell.",
  instructions: [
    { order: 1, text: "Set the bar securely across the upper back." },
    { order: 2, text: "Brace, descend with control, then stand tall." }
  ],
  difficulty: "intermediate",
  movementPattern: "squat",
  version: 3,
  activityType: { id: "22222222-2222-4222-8222-222222222222", slug: "strength_exercise", name: "Strength Exercise" },
  metricSchema: {
    slug: "strength_repetitions",
    name: "Strength repetitions",
    fields: [
      { key: "sets", label: "Sets", type: "integer", unit: "set", required: false },
      { key: "reps", label: "Repetitions", type: "integer", unit: "rep", required: false },
      { key: "weight", label: "Weight", type: "number", unit: "kg", required: false }
    ]
  },
  sports: [{ id: "33333333-3333-4333-8333-333333333333", slug: "strength_training", name: "Strength Training", isPrimary: true }],
  sessionTypes: [{ id: "44444444-4444-4444-8444-444444444444", slug: "strength_session", name: "Strength Session", sportId: "33333333-3333-4333-8333-333333333333" }],
  sessionPhases: [{ id: "55555555-5555-4555-8555-555555555555", slug: "main", name: "Main", sportId: "33333333-3333-4333-8333-333333333333", isOptional: false }],
  equipment: [
    { id: "66666666-6666-4666-8666-666666666666", slug: "barbell", name: "Barbell", isRequired: true },
    { id: "77777777-7777-4777-8777-777777777777", slug: "squat_rack", name: "Squat Rack", isRequired: false }
  ],
  muscles: [
    { id: "88888888-8888-4888-8888-888888888888", slug: "quadriceps", name: "Quadriceps", bodyRegion: "Lower body", role: "primary" },
    { id: "99999999-9999-4999-8999-999999999999", slug: "gluteus_maximus", name: "Gluteus Maximus", bodyRegion: "Lower body", role: "secondary" },
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", slug: "erector_spinae", name: "Erector Spinae", bodyRegion: "Back", role: "stabilizer" }
  ],
  trainingGoals: [
    { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", slug: "strength", name: "Strength", relevanceWeight: 0.9 },
    { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", slug: "hypertrophy", name: "Hypertrophy", relevanceWeight: 0.85 }
  ],
  translations: {
    de: { name: "Langhantel-Kniebeuge", shortDescription: "Eine kontrollierte Kniebeuge mit Langhantel." },
    ar: { name: "قرفصاء بالبار", shortDescription: "قرفصاء محكومة باستخدام البار." }
  },
  publishedAt: null,
  updatedAt: "2026-07-10T08:00:00.000Z"
};

const meta = { apiVersion: "v1", locale: "en", requestId: "request-1" };

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

describe("HttpActivityCatalogProvider", () => {
  it("sends only allowlisted query fields and server catalog headers", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({
      data: [activity],
      pagination: { limit: 30, offset: 0, returned: 1, nextOffset: null },
      meta
    }));
    const provider = new HttpActivityCatalogProvider({
      baseUrl: "https://catalog.example.test/",
      apiKey: "server-only-test-key",
      fetch: fetchMock as typeof fetch
    });
    const response = await provider.searchActivities({ query: "squat", difficulty: "intermediate", limit: 30, offset: 0 });
    expect(response.meta).toMatchObject({ source: "external", degraded: false, requestId: "request-1" });
    expect(response.data[0]).toMatchObject({
      trainingGoals: [
        expect.objectContaining({ relevanceWeight: 0.9 }),
        expect.objectContaining({ relevanceWeight: 0.85 })
      ],
      translations: activity.translations
    });
    const [input, init] = fetchMock.mock.calls[0];
    const url = input as URL;
    expect(url.origin).toBe("https://catalog.example.test");
    expect(url.pathname).toBe("/v1/activities");
    expect(Object.fromEntries(url.searchParams)).toEqual({ query: "squat", difficulty: "intermediate", limit: "30", offset: "0", locale: "en" });
    expect(init).toMatchObject({ method: "GET", cache: "no-store" });
    expect(init?.headers).toEqual({ Accept: "application/json", Authorization: "Bearer server-only-test-key" });
    expect(JSON.stringify(init)).not.toContain("user_id");
    expect(JSON.stringify(init)).not.toContain("profile");
  });

  it.each([
    [400, "invalid_request"],
    [401, "upstream_unauthorized"],
    [403, "upstream_forbidden"],
    [404, "not_found"],
    [429, "rate_limited"],
    [500, "unavailable"]
  ])("maps HTTP %i to %s without leaking the key or upstream body", async (status, code) => {
    const provider = new HttpActivityCatalogProvider({
      baseUrl: "https://catalog.example.test",
      apiKey: "never-print-this-key",
      fetch: vi.fn(async () => jsonResponse({ error: { message: "raw upstream detail" } }, status)) as typeof fetch
    });
    let caught: unknown;
    try {
      await provider.getActivity(activity.id);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ActivityCatalogError);
    expect((caught as ActivityCatalogError).code).toBe(code);
    expect((caught as Error).message).not.toContain("never-print-this-key");
    expect((caught as Error).message).not.toContain("raw upstream detail");
  });

  it("maps malformed successful JSON and invalid decimal weights to invalid_response", async () => {
    const malformedIdProvider = new HttpActivityCatalogProvider({
      baseUrl: "https://catalog.example.test",
      apiKey: "key",
      fetch: vi.fn(async () => jsonResponse({ data: [{ ...activity, id: "bad" }], pagination: { limit: 1, offset: 0, returned: 1, nextOffset: null }, meta })) as typeof fetch
    });
    await expect(malformedIdProvider.searchActivities({ limit: 1 })).rejects.toMatchObject({ code: "invalid_response" });

    const malformedWeightProvider = new HttpActivityCatalogProvider({
      baseUrl: "https://catalog.example.test",
      apiKey: "key",
      fetch: vi.fn(async () => jsonResponse({
        data: [{ ...activity, trainingGoals: [{ ...activity.trainingGoals[0], relevanceWeight: 1.2 }] }],
        pagination: { limit: 1, offset: 0, returned: 1, nextOffset: null },
        meta
      })) as typeof fetch
    });
    await expect(malformedWeightProvider.searchActivities({ limit: 1 })).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("accepts contract-valid omitted optional activity and alternative fields", async () => {
    const { shortDescription: _shortDescription, publishedAt: _publishedAt, ...minimalActivity } = activity;
    const activityProvider = new HttpActivityCatalogProvider({
      baseUrl: "https://catalog.example.test",
      apiKey: "test-value",
      fetch: vi.fn(async () => jsonResponse({ data: { ...minimalActivity, metricSchema: {} }, meta })) as typeof fetch
    });
    await expect(activityProvider.getActivity(activity.id)).resolves.toMatchObject({
      data: { shortDescription: null, publishedAt: null, metricSchema: {} }
    });

    const alternativesProvider = new HttpActivityCatalogProvider({
      baseUrl: "https://catalog.example.test",
      apiKey: "test-value",
      fetch: vi.fn(async () => jsonResponse({
        data: [{
          sourceActivityId: activity.id,
          alternativeActivityId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          alternativeSlug: "front_squat",
          alternativeName: "Front Squat",
          reasonCode: "similar_pattern",
          prescriptionTransfer: "partial",
          compatibilityScore: 0.8,
          priority: 1
        }],
        meta
      })) as typeof fetch
    });
    await expect(alternativesProvider.getActivityAlternatives(activity.id)).resolves.toMatchObject({
      data: [{ alternativeDifficulty: null, differenceSummary: null }]
    });
  });

  it("rejects response metadata from an unsupported API version", async () => {
    const provider = new HttpActivityCatalogProvider({
      baseUrl: "https://catalog.example.test",
      apiKey: "test-value",
      fetch: vi.fn(async () => jsonResponse({ data: activity, meta: { ...meta, apiVersion: "v2" } })) as typeof fetch
    });
    await expect(provider.getActivity(activity.id)).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("enforces bounded activity and alternatives limits before fetch", async () => {
    const fetchMock = vi.fn();
    const provider = new HttpActivityCatalogProvider({ baseUrl: "https://catalog.example.test", apiKey: "key", fetch: fetchMock as typeof fetch });
    await expect(provider.searchActivities({ limit: 101 })).rejects.toMatchObject({ code: "invalid_request" });
    await expect(provider.getActivityAlternatives(activity.id, { limit: 21 })).rejects.toMatchObject({ code: "invalid_request" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps bounded aborts to timeout without retrying", async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }));
    const provider = new HttpActivityCatalogProvider({
      baseUrl: "https://catalog.example.test",
      apiKey: "key",
      fetch: fetchMock as typeof fetch,
      timeoutMs: 5
    });
    await expect(provider.getActivity(activity.id)).rejects.toMatchObject({ code: "timeout" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("keeps successful empty results empty", async () => {
    const provider = new HttpActivityCatalogProvider({
      baseUrl: "https://catalog.example.test",
      apiKey: "key",
      fetch: vi.fn(async () => jsonResponse({ data: [], pagination: { limit: 30, offset: 0, returned: 0, nextOffset: null }, meta })) as typeof fetch
    });
    await expect(provider.searchActivities({})).resolves.toMatchObject({ data: [], meta: { source: "external", degraded: false } });
  });
});
