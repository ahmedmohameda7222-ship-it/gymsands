import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  requireEligibleUser: vi.fn(),
  createProvider: vi.fn()
}));

vi.mock("@/lib/integrations/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/integrations/env", () => ({ requireEligibleUser: mocks.requireEligibleUser }));
vi.mock("@/services/activity-catalog/server/selector", () => ({ createActivityCatalogProvider: mocks.createProvider }));

import { GET as getSports } from "@/app/api/activity-catalog/sports/route";
import { GET as getTemplate } from "@/app/api/activity-catalog/sports/[sportSlug]/session-template/route";
import { GET as getFilters } from "@/app/api/activity-catalog/filters/route";
import { GET as getActivities } from "@/app/api/activity-catalog/activities/route";
import { GET as getActivity } from "@/app/api/activity-catalog/activities/[identifier]/route";
import { GET as getAlternatives } from "@/app/api/activity-catalog/activities/[identifier]/alternatives/route";

const meta = { source: "external" as const, degraded: false, catalogVersion: "v1" };
const provider = {
  listSports: vi.fn(async () => ({ data: [], meta })),
  getSportSessionTemplate: vi.fn(async () => ({ data: { sport: {}, sessionTypes: [], sessionPhases: [] }, meta })),
  getFilters: vi.fn(async () => ({ data: { sports: [], activityTypes: [], sessionTypes: [], sessionPhases: [], equipment: [], trainingGoals: [], difficulties: [] }, meta })),
  searchActivities: vi.fn(async () => ({ data: { activities: [], pagination: { limit: 30, offset: 0, returned: 0, nextOffset: null } }, meta })),
  getActivity: vi.fn(async () => ({ data: {}, meta })),
  getActivityAlternatives: vi.fn(async () => ({ data: [], meta }))
};

function request(path: string, token = "member-token") {
  return new Request(`https://app.plaivra.com${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

describe("authenticated Activity Catalog routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockReturnValue(null);
    mocks.requireEligibleUser.mockResolvedValue({ user: { id: "member-id" }, accessToken: "member-token", supabase: {} });
    mocks.createProvider.mockReturnValue(provider);
  });

  it("denies anonymous and ineligible requests before provider access", async () => {
    mocks.requireEligibleUser.mockResolvedValueOnce(NextResponse.json({ error: "Sign in" }, { status: 401 }));
    expect((await getSports(request("/api/activity-catalog/sports", ""))).status).toBe(401);
    mocks.requireEligibleUser.mockResolvedValueOnce(NextResponse.json({ error: "Age review", code: "age_review_required" }, { status: 403 }));
    expect((await getSports(request("/api/activity-catalog/sports"))).status).toBe(403);
    expect(mocks.createProvider).not.toHaveBeenCalled();
  });

  it("keeps rate limiting ahead of authentication", async () => {
    mocks.rateLimit.mockReturnValueOnce(NextResponse.json({ error: "Too many" }, { status: 429 }));
    expect((await getSports(request("/api/activity-catalog/sports"))).status).toBe(429);
    expect(mocks.requireEligibleUser).not.toHaveBeenCalled();
  });

  it("validates the activity allowlist and pagination before calling the provider", async () => {
    const invalid = await getActivities(request("/api/activity-catalog/activities?limit=101&privateNote=secret"));
    expect(invalid.status).toBe(400);
    expect(mocks.createProvider).not.toHaveBeenCalled();
    expect(provider.searchActivities).not.toHaveBeenCalled();
    const valid = await getActivities(request("/api/activity-catalog/activities?query=squat&equipment=barbell,rack&difficulty=intermediate&limit=100&offset=10&locale=de-DE"));
    expect(valid.status).toBe(200);
    expect(provider.searchActivities).toHaveBeenCalledWith({ query: "squat", equipment: ["barbell", "rack"], difficulty: "intermediate", limit: 100, offset: 10, locale: "de-DE" });
  });

  it("enforces OpenAPI slug bounds locally before any upstream call", async () => {
    const overlong = "a".repeat(101);
    const responses = await Promise.all([
      getActivities(request(`/api/activity-catalog/activities?equipment=${overlong}`)),
      getFilters(request(`/api/activity-catalog/filters?sport=${overlong}`)),
      getTemplate(request("/api/activity-catalog/sports/Strength-Training/session-template"), { params: Promise.resolve({ sportSlug: "Strength-Training" }) }),
    ]);
    responses.forEach((response) => expect(response.status).toBe(400));
    expect(provider.searchActivities).not.toHaveBeenCalled();
    expect(provider.getFilters).not.toHaveBeenCalled();
    expect(provider.getSportSessionTemplate).not.toHaveBeenCalled();
  });

  it.each([
    "/api/activity-catalog/activities?limit=-1",
    "/api/activity-catalog/activities?limit=10&limit=20",
    "/api/activity-catalog/activities?locale=english",
    "/api/activity-catalog/activities?difficulty=expert",
    "/api/activity-catalog/activities?unknown=value",
  ])("rejects malformed local query %s", async (path) => {
    expect((await getActivities(request(path))).status).toBe(400);
    expect(provider.searchActivities).not.toHaveBeenCalled();
  });

  it("serves all six explicit routes with private no-store responses", async () => {
    const responses = await Promise.all([
      getSports(request("/api/activity-catalog/sports?locale=en")),
      getTemplate(request("/api/activity-catalog/sports/strength/session-template"), { params: Promise.resolve({ sportSlug: "strength" }) }),
      getFilters(request("/api/activity-catalog/filters?sport=strength")),
      getActivities(request("/api/activity-catalog/activities")),
      getActivity(request("/api/activity-catalog/activities/barbell_squat"), { params: Promise.resolve({ identifier: "barbell_squat" }) }),
      getAlternatives(request("/api/activity-catalog/activities/barbell_squat/alternatives?limit=20"), { params: Promise.resolve({ identifier: "barbell_squat" }) })
    ]);
    responses.forEach((response) => {
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("private, no-store");
      expect(response.headers.get("vary")).toBe("Authorization");
    });
    expect(provider.getActivityAlternatives).toHaveBeenCalledWith("barbell_squat", { limit: 20 });
  });

  it("never returns the local Plaivra bearer token", async () => {
    const response = await getSports(request("/api/activity-catalog/sports"));
    expect(JSON.stringify(await response.json())).not.toContain("member-token");
  });

  it("returns a stable safe error for unexpected route-level provider failures", async () => {
    provider.listSports.mockRejectedValueOnce(new Error("raw-stack secret-catalog-key member-token"));
    const response = await getSports(request("/api/activity-catalog/sports"));
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body).toEqual({
      error: "The exercise catalog is temporarily unavailable.",
      code: "catalog_upstream_error",
    });
    expect(JSON.stringify(body)).not.toMatch(/raw-stack|secret-catalog-key|member-token/);
  });
});
