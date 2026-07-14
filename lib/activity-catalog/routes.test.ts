import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireEligibleUser: vi.fn(),
  createActivityCatalogProvider: vi.fn()
}));

vi.mock("@/lib/integrations/env", () => ({
  requireEligibleUser: mocks.requireEligibleUser
}));

vi.mock("@/services/activity-catalog/server/factory", () => ({
  createActivityCatalogProvider: mocks.createActivityCatalogProvider
}));

import { GET as getSports } from "@/app/api/activity-catalog/sports/route";
import { GET as getSessionTemplate } from "@/app/api/activity-catalog/sports/[sportSlug]/session-template/route";
import { GET as getFilters } from "@/app/api/activity-catalog/filters/route";
import { GET as searchActivities } from "@/app/api/activity-catalog/activities/route";
import { GET as getActivity } from "@/app/api/activity-catalog/activities/[identifier]/route";
import { GET as getAlternatives } from "@/app/api/activity-catalog/activities/[identifier]/alternatives/route";

const supabase = { marker: "authenticated-user-client" };
const userId = "11111111-1111-4111-8111-111111111111";
const activityId = "22222222-2222-4222-8222-222222222222";

const provider = {
  listSports: vi.fn(),
  getSportSessionTemplate: vi.fn(),
  getFilters: vi.fn(),
  searchActivities: vi.fn(),
  getActivity: vi.fn(),
  getActivityAlternatives: vi.fn()
};

type ProviderMethod = keyof typeof provider;

type RouteCase = {
  name: string;
  method: ProviderMethod;
  invokeValid: () => Promise<Response>;
  invokeInvalid: () => Promise<Response>;
};

const routeCases: RouteCase[] = [
  {
    name: "sports",
    method: "listSports",
    invokeValid: () => getSports(new Request("https://plaivra.test/api/activity-catalog/sports?locale=en-US")),
    invokeInvalid: () => getSports(new Request("https://plaivra.test/api/activity-catalog/sports?locale=EN-us"))
  },
  {
    name: "sport session template",
    method: "getSportSessionTemplate",
    invokeValid: () => getSessionTemplate(
      new Request("https://plaivra.test/api/activity-catalog/sports/strength_training/session-template?locale=de"),
      { params: Promise.resolve({ sportSlug: "strength_training" }) }
    ),
    invokeInvalid: () => getSessionTemplate(
      new Request("https://plaivra.test/api/activity-catalog/sports/invalid/session-template"),
      { params: Promise.resolve({ sportSlug: "../private" }) }
    )
  },
  {
    name: "filters",
    method: "getFilters",
    invokeValid: () => getFilters(new Request("https://plaivra.test/api/activity-catalog/filters?sport=strength_training&locale=ar")),
    invokeInvalid: () => getFilters(new Request("https://plaivra.test/api/activity-catalog/filters?locale=en&locale=de"))
  },
  {
    name: "activity search",
    method: "searchActivities",
    invokeValid: () => searchActivities(new Request(
      "https://plaivra.test/api/activity-catalog/activities?query=squat&sport=strength_training&difficulty=beginner&equipment=barbell,power_rack&limit=25&offset=0&locale=en"
    )),
    invokeInvalid: () => searchActivities(new Request("https://plaivra.test/api/activity-catalog/activities?limit=101"))
  },
  {
    name: "activity detail",
    method: "getActivity",
    invokeValid: () => getActivity(
      new Request(`https://plaivra.test/api/activity-catalog/activities/${activityId}?locale=en`),
      { params: Promise.resolve({ identifier: activityId }) }
    ),
    invokeInvalid: () => getActivity(
      new Request("https://plaivra.test/api/activity-catalog/activities/invalid"),
      { params: Promise.resolve({ identifier: "private/path" }) }
    )
  },
  {
    name: "activity alternatives",
    method: "getActivityAlternatives",
    invokeValid: () => getAlternatives(
      new Request("https://plaivra.test/api/activity-catalog/activities/barbell_back_squat/alternatives?locale=de-DE&limit=5"),
      { params: Promise.resolve({ identifier: "barbell_back_squat" }) }
    ),
    invokeInvalid: () => getAlternatives(
      new Request("https://plaivra.test/api/activity-catalog/activities/invalid/alternatives?unexpected=true"),
      { params: Promise.resolve({ identifier: "valid_identifier" }) }
    )
  }
];

function providerMethod(method: ProviderMethod) {
  return provider[method];
}

describe("authenticated activity catalog routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireEligibleUser.mockResolvedValue({ user: { id: userId }, supabase });
    mocks.createActivityCatalogProvider.mockReturnValue(provider);
  });

  it("requires authentication across all six explicit routes", async () => {
    for (const route of routeCases) {
      mocks.requireEligibleUser.mockResolvedValueOnce(
        NextResponse.json({ error: "Please sign in before using this feature." }, { status: 401 })
      );
      const response = await route.invokeValid();
      expect(response.status, route.name).toBe(401);
      expect(response.headers.get("cache-control"), route.name).toBe("private, no-store");
    }
    expect(mocks.createActivityCatalogProvider).not.toHaveBeenCalled();
  });

  it("returns the controlled expired-session response across all six routes", async () => {
    for (const route of routeCases) {
      mocks.requireEligibleUser.mockResolvedValueOnce(
        NextResponse.json({ error: "Your session expired. Please sign in again." }, { status: 401 })
      );
      const response = await route.invokeValid();
      expect(response.status, route.name).toBe(401);
      expect(await response.json(), route.name).toEqual({ error: "Your session expired. Please sign in again." });
      expect(response.headers.get("cache-control"), route.name).toBe("private, no-store");
    }
    expect(mocks.createActivityCatalogProvider).not.toHaveBeenCalled();
  });

  it("returns provider results verbatim with source and degraded metadata", async () => {
    for (const route of routeCases) {
      const result = {
        data: { route: route.name },
        meta: { source: "legacy", degraded: true }
      };
      providerMethod(route.method).mockResolvedValueOnce(result);

      const response = await route.invokeValid();

      expect(response.status, route.name).toBe(200);
      expect(await response.json(), route.name).toEqual(result);
      expect(response.headers.get("cache-control"), route.name).toBe("private, no-store");
      expect(mocks.createActivityCatalogProvider).toHaveBeenLastCalledWith({ supabase });
    }
  });

  it("rejects invalid or non-allowlisted input before provider creation", async () => {
    for (const route of routeCases) {
      mocks.createActivityCatalogProvider.mockClear();
      const response = await route.invokeInvalid();
      expect(response.status, route.name).toBe(400);
      expect(await response.json(), route.name).toMatchObject({
        error: { code: "invalid_request" }
      });
      expect(response.headers.get("cache-control"), route.name).toBe("private, no-store");
      expect(mocks.createActivityCatalogProvider, route.name).not.toHaveBeenCalled();
    }
  });

  it("maps provider unavailability safely across all six routes", async () => {
    for (const route of routeCases) {
      providerMethod(route.method).mockRejectedValueOnce({
        name: "ActivityCatalogError",
        code: "unavailable",
        message: `raw upstream failure with catalog-secret-${route.name}`
      });

      const response = await route.invokeValid();
      const serialized = JSON.stringify(await response.json());
      expect(response.status, route.name).toBe(503);
      expect(serialized, route.name).toContain('"code":"unavailable"');
      expect(serialized, route.name).not.toContain("catalog-secret");
      expect(serialized, route.name).not.toContain("raw upstream");
      expect(response.headers.get("cache-control"), route.name).toBe("private, no-store");
    }
  });

  it("does not hide or leak upstream authorization failures", async () => {
    for (const route of routeCases) {
      providerMethod(route.method).mockRejectedValueOnce({
        name: "ActivityCatalogError",
        code: "UPSTREAM_UNAUTHORIZED",
        message: `Bearer catalog-secret-${route.name}`
      });

      const response = await route.invokeValid();
      const body = await response.json();
      const serialized = JSON.stringify(body);
      expect(response.status, route.name).toBe(502);
      expect(body, route.name).toEqual({
        error: {
          code: "upstream_unauthorized",
          message: "The activity catalog connection could not be authorized."
        }
      });
      expect(serialized, route.name).not.toContain("Bearer");
      expect(serialized, route.name).not.toContain("catalog-secret");
      expect(response.headers.get("cache-control"), route.name).toBe("private, no-store");
    }
  });

  it("passes only the allowlisted, normalized search contract to the provider", async () => {
    provider.searchActivities.mockResolvedValueOnce({
      data: [],
      meta: { source: "external", degraded: false }
    });

    await searchActivities(new Request(
      "https://plaivra.test/api/activity-catalog/activities?query=squat&sport=strength_training&sessionType=strength&phase=main_work&activityType=exercise&difficulty=advanced&equipment=barbell,power_rack,barbell&goal=max_strength&limit=50&offset=100&locale=de-DE"
    ));

    expect(provider.searchActivities).toHaveBeenCalledWith({
      query: "squat",
      sport: "strength_training",
      sessionType: "strength",
      phase: "main_work",
      activityType: "exercise",
      difficulty: "advanced",
      equipment: ["barbell", "power_rack"],
      goal: "max_strength",
      limit: 50,
      offset: 100,
      locale: "de-DE"
    });
  });

  it("uses awaited Next 16 params and forwards only validated route values", async () => {
    provider.getSportSessionTemplate.mockResolvedValueOnce({ data: {}, meta: { source: "external", degraded: false } });
    provider.getActivity.mockResolvedValueOnce({ data: {}, meta: { source: "external", degraded: false } });
    provider.getActivityAlternatives.mockResolvedValueOnce({ data: [], meta: { source: "external", degraded: false } });

    await routeCases[1].invokeValid();
    await routeCases[4].invokeValid();
    await routeCases[5].invokeValid();

    expect(provider.getSportSessionTemplate).toHaveBeenCalledWith("strength_training", { locale: "de" });
    expect(provider.getActivity).toHaveBeenCalledWith(activityId, { locale: "en" });
    expect(provider.getActivityAlternatives).toHaveBeenCalledWith("barbell_back_squat", { locale: "de-DE", limit: 5 });
  });
});
