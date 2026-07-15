import { describe, expect, it, vi } from "vitest";
import { activityToWorkout } from "@/lib/activity-catalog/adapter";
import { CatalogError } from "@/lib/activity-catalog/errors";
import type {
  ActivityCatalogProvider,
} from "@/services/activity-catalog/server/provider";
import type {
  ActivitySearchParams,
  CatalogResult,
  PaginatedTrainingActivities,
  TrainingActivity,
} from "@/lib/activity-catalog/types";
import { HttpActivityCatalogProvider } from "./http-provider";
import { FallbackActivityCatalogProvider, parseCatalogProviderMode } from "./selector";

const catalogKey = "catalog-key-must-stay-server-side";
const activityId = "11111111-1111-4111-8111-111111111111";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function emptySearch(source: "external" | "legacy" = "external", degraded = false): CatalogResult<PaginatedTrainingActivities> {
  return {
    data: { activities: [], pagination: { limit: 30, offset: 0, returned: 0, nextOffset: null } },
    meta: { source, degraded, catalogVersion: source === "external" ? "v1" : "legacy" },
  };
}

function provider(overrides: Partial<ActivityCatalogProvider> = {}): ActivityCatalogProvider {
  return {
    listSports: vi.fn(async () => ({ data: [], meta: { source: "external" as const, degraded: false, catalogVersion: "v1" } })),
    getSportSessionTemplate: vi.fn(async () => { throw new CatalogError("catalog_not_found"); }),
    getFilters: vi.fn(async () => ({
      data: { sports: [], activityTypes: [], sessionTypes: [], sessionPhases: [], equipment: [], trainingGoals: [], difficulties: [] },
      meta: { source: "external" as const, degraded: false, catalogVersion: "v1" },
    })),
    searchActivities: vi.fn(async () => emptySearch()),
    getActivity: vi.fn(async () => { throw new CatalogError("catalog_not_found"); }),
    getActivityAlternatives: vi.fn(async () => ({ data: [], meta: { source: "external" as const, degraded: false, catalogVersion: "v1" } })),
    ...overrides,
  };
}

describe("Activity Catalog server boundary", () => {
  it("accepts only the three approved provider modes", () => {
    expect(parseCatalogProviderMode(undefined)).toBe("legacy");
    expect(parseCatalogProviderMode("legacy")).toBe("legacy");
    expect(parseCatalogProviderMode("external")).toBe("external");
    expect(parseCatalogProviderMode("external_with_legacy_fallback")).toBe("external_with_legacy_fallback");
    expect(() => parseCatalogProviderMode("external_and_blend")).toThrowError(CatalogError);
  });

  it("forwards only allowlisted catalog search values and keeps Plaivra identity data out of the upstream request", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({
      data: [],
      pagination: { limit: 20, offset: 5, returned: 0, nextOffset: null },
      meta: { apiVersion: "v1", locale: "de-DE", requestId: "request-1" },
    }));
    const http = new HttpActivityCatalogProvider({
      baseUrl: "https://catalog-api.plaivra.com",
      apiKey: catalogKey,
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });

    const result = await http.searchActivities({
      query: "squat",
      sport: "strength",
      equipment: ["barbell", "rack"],
      difficulty: "intermediate",
      limit: 20,
      offset: 5,
      locale: "de-DE",
      userId: "private-member-id",
      accessToken: "member-access-token",
      notes: "private workout note",
    } as ActivitySearchParams & Record<string, unknown>);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [requestUrl, init] = fetchSpy.mock.calls[0] as unknown as [URL, RequestInit];
    const url = new URL(requestUrl);
    expect(url.origin).toBe("https://catalog-api.plaivra.com");
    expect(url.pathname).toBe("/v1/activities");
    expect(Array.from(url.searchParams.keys()).sort()).toEqual([
      "difficulty", "equipment", "limit", "locale", "offset", "query", "sport",
    ]);
    expect(url.searchParams.get("equipment")).toBe("barbell,rack");
    expect(init.cache).toBe("no-store");
    expect(init.headers).toEqual({ Accept: "application/json", Authorization: `Bearer ${catalogKey}` });
    const serializedRequest = `${url.toString()} ${JSON.stringify(init)}`;
    expect(serializedRequest).not.toContain("private-member-id");
    expect(serializedRequest).not.toContain("member-access-token");
    expect(serializedRequest).not.toContain("private workout note");
    expect(JSON.stringify(result)).not.toContain(catalogKey);
    expect(result.data.activities).toEqual([]);
  });

  it("does not send the bearer key to the public health endpoint", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({
      status: "ok",
      service: "plaivra-activity-catalog",
      apiVersion: "v1",
      database: "connected",
    }));
    const http = new HttpActivityCatalogProvider({
      baseUrl: "https://catalog-api.plaivra.com",
      apiKey: catalogKey,
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });

    await expect(http.getHealth()).resolves.toMatchObject({ status: "ok", database: "connected" });
    const [, init] = fetchSpy.mock.calls[0] as unknown as [URL, RequestInit];
    expect(init.headers).toEqual({ Accept: "application/json" });
  });

  it("runtime-validates upstream JSON and exposes only a stable safe error", async () => {
    const rawUpstreamSecret = "raw-upstream-stack-and-secret";
    const http = new HttpActivityCatalogProvider({
      baseUrl: "https://catalog-api.plaivra.com",
      apiKey: catalogKey,
      fetchImpl: vi.fn(async () => jsonResponse({
        data: [{ id: "not-a-uuid", slug: "bad", name: rawUpstreamSecret }],
        meta: { apiVersion: "v1", locale: "en", requestId: "request-2" },
      })) as unknown as typeof fetch,
    });

    const error = await http.listSports().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(CatalogError);
    expect(error).toMatchObject({ code: "catalog_invalid_response", allowLegacyFallback: false });
    expect(String((error as Error).message)).toBe("The exercise catalog returned an invalid response.");
    expect(String((error as Error).message)).not.toContain(rawUpstreamSecret);
    expect(String((error as Error).message)).not.toContain(catalogKey);
  });

  it.each([
    [401, "catalog_unauthorized", false],
    [403, "catalog_forbidden", false],
    [404, "catalog_not_found", true],
    [429, "catalog_rate_limited", true],
    [500, "catalog_upstream_error", true],
    [503, "catalog_upstream_error", true],
  ] as const)("maps upstream HTTP %s to %s with fallback=%s", async (status, code, allowLegacyFallback) => {
    const http = new HttpActivityCatalogProvider({
      baseUrl: "https://catalog-api.plaivra.com",
      apiKey: catalogKey,
      fetchImpl: vi.fn(async () => jsonResponse({ raw: "must not escape" }, status)) as unknown as typeof fetch,
    });

    await expect(http.listSports()).rejects.toMatchObject({ code, allowLegacyFallback });
  });

  it("classifies an actual fetch rejection as a fallback-eligible network failure", async () => {
    const http = new HttpActivityCatalogProvider({
      baseUrl: "https://catalog-api.plaivra.com",
      apiKey: catalogKey,
      fetchImpl: vi.fn(async () => { throw new TypeError("socket unavailable"); }) as unknown as typeof fetch,
    });

    await expect(http.listSports()).rejects.toMatchObject({
      code: "catalog_network_error",
      allowLegacyFallback: true,
    });
  });

  it("aborts a real pending request at the bounded timeout", async () => {
    const fetchImpl = vi.fn((_url: URL | RequestInfo, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const http = new HttpActivityCatalogProvider({
      baseUrl: "https://catalog-api.plaivra.com",
      apiKey: catalogKey,
      timeoutMs: 5,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(http.listSports()).rejects.toMatchObject({
      code: "catalog_timeout",
      allowLegacyFallback: true,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("requires a key and rejects base URLs that could smuggle credentials or query state", () => {
    expect(() => new HttpActivityCatalogProvider({ baseUrl: "https://catalog-api.plaivra.com", apiKey: "" }))
      .toThrowError(CatalogError);
    for (const baseUrl of [
      "https://user:password@catalog-api.plaivra.com",
      "https://catalog-api.plaivra.com?token=unsafe",
      "https://catalog-api.plaivra.com/#unsafe",
      "file:///tmp/catalog.json",
    ]) {
      expect(() => new HttpActivityCatalogProvider({ baseUrl, apiKey: catalogKey }), baseUrl)
        .toThrowError(CatalogError);
    }
  });

  it.each([
    ["catalog_timeout"],
    ["catalog_network_error"],
    ["catalog_rate_limited"],
    ["catalog_upstream_error"],
  ] as const)("uses marked degraded legacy fallback for %s", async (code) => {
    const legacyResult = emptySearch("legacy");
    const legacySearch = vi.fn(async () => legacyResult);
    const composite = new FallbackActivityCatalogProvider(
      provider({ searchActivities: vi.fn(async () => { throw new CatalogError(code, { allowLegacyFallback: true }); }) }),
      provider({ searchActivities: legacySearch }),
    );

    await expect(composite.searchActivities({ query: "press" })).resolves.toEqual({
      ...legacyResult,
      meta: { ...legacyResult.meta, degraded: true },
    });
    expect(legacySearch).toHaveBeenCalledOnce();
  });

  it.each([
    ["catalog_unauthorized"],
    ["catalog_forbidden"],
    ["catalog_bad_request"],
    ["catalog_invalid_response"],
  ] as const)("fails closed without legacy fallback for %s", async (code) => {
    const legacySearch = vi.fn(async () => emptySearch("legacy"));
    const composite = new FallbackActivityCatalogProvider(
      provider({ searchActivities: vi.fn(async () => { throw new CatalogError(code); }) }),
      provider({ searchActivities: legacySearch }),
    );

    await expect(composite.searchActivities({ query: "press" })).rejects.toMatchObject({ code });
    expect(legacySearch).not.toHaveBeenCalled();
  });

  it("does not reinterpret a successful external empty search as fallback", async () => {
    const externalResult = emptySearch("external");
    const legacySearch = vi.fn(async () => emptySearch("legacy", true));
    const composite = new FallbackActivityCatalogProvider(
      provider({ searchActivities: vi.fn(async () => externalResult) }),
      provider({ searchActivities: legacySearch }),
    );

    await expect(composite.searchActivities({ query: "no-match" })).resolves.toBe(externalResult);
    expect(legacySearch).not.toHaveBeenCalled();
  });

  it("fails closed on unexpected provider exceptions", async () => {
    const legacySearch = vi.fn(async () => emptySearch("legacy"));
    const composite = new FallbackActivityCatalogProvider(
      provider({ searchActivities: vi.fn(async () => { throw new Error("programming failure"); }) }),
      provider({ searchActivities: legacySearch }),
    );

    await expect(composite.searchActivities({ query: "press" })).rejects.toMatchObject({
      code: "catalog_upstream_error",
      allowLegacyFallback: false,
    });
    expect(legacySearch).not.toHaveBeenCalled();
  });

  it("only degrades alternatives after proving the identifier exists in legacy data", async () => {
    const legacyAlternatives = vi.fn(async () => ({
      data: [],
      meta: { source: "legacy" as const, degraded: false, catalogVersion: "legacy" },
    }));
    const external = provider({
      getActivityAlternatives: vi.fn(async () => { throw new CatalogError("catalog_not_found", { allowLegacyFallback: true }); }),
    });
    const missingLegacy = provider({
      getActivity: vi.fn(async () => { throw new CatalogError("catalog_not_found"); }),
      getActivityAlternatives: legacyAlternatives,
    });
    await expect(new FallbackActivityCatalogProvider(external, missingLegacy).getActivityAlternatives("unknown"))
      .rejects.toMatchObject({ code: "catalog_not_found" });
    expect(legacyAlternatives).not.toHaveBeenCalled();
  });

  it("preserves the original external outage when the legacy attempt also fails", async () => {
    const composite = new FallbackActivityCatalogProvider(
      provider({
        getSportSessionTemplate: vi.fn(async () => {
          throw new CatalogError("catalog_timeout", { allowLegacyFallback: true });
        }),
      }),
      provider({
        getSportSessionTemplate: vi.fn(async () => { throw new CatalogError("catalog_not_found"); }),
      }),
    );

    await expect(composite.getSportSessionTemplate("strength")).rejects.toMatchObject({
      code: "catalog_timeout",
      status: 504,
    });
  });

  it("allows genuine external 404 fallback only for identifier lookups", async () => {
    const activity = { id: activityId, name: "Legacy press" } as TrainingActivity;
    const legacyLookup = vi.fn(async () => ({
      data: activity,
      meta: { source: "legacy" as const, degraded: false, catalogVersion: "legacy" },
    }));
    const external = provider({
      searchActivities: vi.fn(async () => { throw new CatalogError("catalog_not_found", { allowLegacyFallback: true }); }),
      getActivity: vi.fn(async () => { throw new CatalogError("catalog_not_found", { allowLegacyFallback: true }); }),
    });
    const legacy = provider({ getActivity: legacyLookup });
    const composite = new FallbackActivityCatalogProvider(external, legacy);

    await expect(composite.searchActivities({ query: "missing" })).rejects.toMatchObject({ code: "catalog_not_found" });
    await expect(composite.getActivity("legacy-id")).resolves.toMatchObject({
      data: activity,
      meta: { source: "legacy", degraded: true },
    });
    expect(legacyLookup).toHaveBeenCalledOnce();
  });
});

describe("Activity Catalog legacy UI adapter", () => {
  it("preserves real metadata and never invents plan prescriptions or media", () => {
    const activity: TrainingActivity = {
      id: activityId,
      slug: "barbell_squat",
      name: "Barbell squat",
      shortDescription: "A real catalog description",
      instructions: [{ order: 2, text: "Stand tall" }, { order: 1, text: "Brace" }],
      difficulty: "intermediate",
      movementPattern: "squat",
      version: 7,
      activityType: { id: "22222222-2222-4222-8222-222222222222", slug: "strength", name: "Strength" },
      metricSchema: { slug: "strength_load", fields: [] },
      sports: [],
      sessionTypes: [],
      sessionPhases: [],
      equipment: [{ id: "33333333-3333-4333-8333-333333333333", slug: "barbell", name: "Barbell", isRequired: true }],
      muscles: [
        { id: "44444444-4444-4444-8444-444444444444", slug: "quadriceps", name: "Quadriceps", role: "primary" },
        { id: "55555555-5555-4555-8555-555555555555", slug: "glutes", name: "Glutes", role: "secondary" },
      ],
      trainingGoals: [],
      translations: {},
      updatedAt: "2026-07-15T00:00:00.000Z",
    };

    const workout = activityToWorkout(activity, { source: "external", degraded: false, catalogVersion: "v1" });
    expect(workout).toMatchObject({
      id: activityId,
      name: "Barbell squat",
      target_muscle: "Quadriceps",
      equipment: "Barbell",
      instructions: "Brace\nStand tall",
      sets: null,
      reps: null,
      rest_seconds: null,
      notes: null,
      video_url: null,
      exercise_url: null,
      catalog_slug: "barbell_squat",
      catalog_version: "7",
      catalog_source: "external",
      catalog_degraded: false,
    });
    expect(workout.force_type).toBeNull();
  });
});
