import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  requireEligibleUser: vi.fn(),
  createProvider: vi.fn(),
  logEvent: vi.fn()
}));

vi.mock("@/lib/integrations/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/integrations/env", () => ({ requireEligibleUser: mocks.requireEligibleUser }));
vi.mock("@/services/activity-catalog/server/selector", () => ({ createActivityCatalogProvider: mocks.createProvider }));
vi.mock("@/lib/observability/structured-log", () => ({ logOperationalEvent: mocks.logEvent }));

import { CatalogError } from "@/lib/activity-catalog/errors";
import {
  CATALOG_REQUEST_GROUP_ID_HEADER,
  REQUEST_ID_HEADER,
  isValidOperationalCorrelationId
} from "@/lib/observability/correlation-id";
import { GET as getActivities } from "@/app/api/activity-catalog/activities/route";
import { GET as getFilters } from "@/app/api/activity-catalog/filters/route";

const externalMeta = { source: "external" as const, degraded: false, catalogVersion: "v1" };
const legacyMeta = { source: "legacy" as const, degraded: true, catalogVersion: "legacy" };

function request(path: string, headers: Record<string, string> = {}) {
  return new Request(`https://app.plaivra.com${path}`, {
    headers: { Authorization: "Bearer member-token", ...headers }
  });
}

function observedProvider(options: {
  mode?: "legacy" | "external" | "external_with_legacy_fallback";
  source?: "legacy" | "external";
  fallbackError?: CatalogError;
  failure?: CatalogError;
  activityCount?: number;
} = {}) {
  return (_supabase: unknown, creationOptions: { observer: {
    providerRequested(mode: "legacy" | "external" | "external_with_legacy_fallback"): void;
    providerStarted(): void;
    fallbackSucceeded(error: CatalogError): void;
    providerCompleted(result: { meta: typeof externalMeta | typeof legacyMeta }, durationMs: number): void;
    providerFailed(error: unknown, durationMs: number): void;
  } }) => {
    const observer = creationOptions.observer;
    const mode = options.mode ?? "external";
    const source = options.source ?? "external";
    observer.providerRequested(mode);
    const execute = async <T extends { meta: typeof externalMeta | typeof legacyMeta }>(result: T) => {
      observer.providerStarted();
      if (options.failure) {
        observer.providerFailed(options.failure, 9);
        throw options.failure;
      }
      if (options.fallbackError) observer.fallbackSucceeded(options.fallbackError);
      observer.providerCompleted(result, 12);
      return result;
    };
    return {
      searchActivities: vi.fn(async () => execute({
        data: {
          activities: Array.from({ length: options.activityCount ?? 2 }, (_, index) => ({ id: `activity-${index}` })),
          pagination: { limit: 100, offset: 100, returned: options.activityCount ?? 2, nextOffset: null }
        },
        meta: source === "legacy" ? legacyMeta : externalMeta
      })),
      getFilters: vi.fn(async () => execute({
        data: {
          sports: [{ id: "sport" }],
          activityTypes: [{ id: "type-1" }, { id: "type-2" }],
          sessionTypes: [],
          sessionPhases: [],
          equipment: [{ id: "equipment" }],
          trainingGoals: [],
          difficulties: ["beginner"]
        },
        meta: source === "legacy" ? legacyMeta : externalMeta
      }))
    };
  };
}

describe("Activity Catalog route completion observability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockReturnValue(null);
    mocks.requireEligibleUser.mockResolvedValue({ user: { id: "member-id" }, accessToken: "member-token", supabase: {} });
    mocks.createProvider.mockImplementation(observedProvider());
  });

  it("reuses valid correlation IDs and emits one privacy-safe activities completion event", async () => {
    const response = await getActivities(request(
      "/api/activity-catalog/activities?query=private-squat-search&sport=strength&equipment=barbell&difficulty=intermediate&limit=100&offset=100",
      {
        [REQUEST_ID_HEADER]: "request-accepted-1",
        [CATALOG_REQUEST_GROUP_ID_HEADER]: "catalog-load-accepted-1"
      }
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe("request-accepted-1");
    expect(response.headers.get(CATALOG_REQUEST_GROUP_ID_HEADER)).toBe("catalog-load-accepted-1");
    expect(mocks.logEvent).toHaveBeenCalledOnce();
    expect(mocks.logEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: "activity_catalog_request_completed",
      request_id: "request-accepted-1",
      catalog_request_group_id: "catalog-load-accepted-1",
      endpoint: "/api/activity-catalog/activities",
      operation: "list_activities",
      provider_requested: "external",
      provider_used: "external",
      fallback_occurred: false,
      fallback_reason: "none",
      fallback_stage: "none",
      outcome: "success",
      http_status: 200,
      provider_duration_ms: 12,
      result_count: 2,
      page: 2,
      limit: 100,
      has_search: true,
      filter_count: 3,
      cache_status: "bypass"
    }));
    const logged = JSON.stringify(mocks.logEvent.mock.calls[0][0]);
    expect(logged).not.toContain("private-squat-search");
    expect(logged).not.toContain("member-token");
    expect(logged).not.toContain("Authorization");
    expect(mocks.logEvent.mock.calls[0][0].total_duration_ms).toBeGreaterThanOrEqual(0);
    expect(mocks.logEvent.mock.calls[0][0].response_bytes).toBeGreaterThan(0);
  });

  it("replaces missing or oversized correlation IDs and exposes the selected request ID", async () => {
    const response = await getActivities(request("/api/activity-catalog/activities", {
      [REQUEST_ID_HEADER]: "x".repeat(129),
      [CATALOG_REQUEST_GROUP_ID_HEADER]: "group with spaces"
    }));

    const selectedRequestId = response.headers.get(REQUEST_ID_HEADER);
    const selectedGroupId = response.headers.get(CATALOG_REQUEST_GROUP_ID_HEADER);
    expect(isValidOperationalCorrelationId(selectedRequestId)).toBe(true);
    expect(isValidOperationalCorrelationId(selectedGroupId)).toBe(true);
    expect(selectedRequestId).not.toBe("x".repeat(129));
    expect(selectedGroupId).not.toBe("group with spaces");
    expect(mocks.logEvent).toHaveBeenCalledOnce();
    expect(mocks.logEvent.mock.calls[0][0]).toMatchObject({
      request_id: selectedRequestId,
      catalog_request_group_id: selectedGroupId
    });
  });

  it("records successful fallback once with bounded reason and stage", async () => {
    mocks.createProvider.mockImplementation(observedProvider({
      mode: "external_with_legacy_fallback",
      source: "legacy",
      fallbackError: new CatalogError("catalog_timeout", {
        allowLegacyFallback: true,
        failureStage: "provider_request"
      })
    }));

    const response = await getActivities(request("/api/activity-catalog/activities"));
    expect(response.status).toBe(200);
    expect(mocks.logEvent).toHaveBeenCalledOnce();
    expect(mocks.logEvent).toHaveBeenCalledWith(expect.objectContaining({
      provider_requested: "external_with_legacy_fallback",
      provider_used: "legacy",
      fallback_occurred: true,
      fallback_reason: "external_timeout",
      fallback_stage: "provider_request",
      outcome: "success_with_fallback",
      level: "warn"
    }));
  });

  it("records fail-closed provider errors once without false fallback metadata", async () => {
    mocks.createProvider.mockImplementation(observedProvider({
      mode: "external_with_legacy_fallback",
      failure: new CatalogError("catalog_unauthorized", { failureStage: "response_status" })
    }));

    const response = await getActivities(request("/api/activity-catalog/activities"));
    expect(response.status).toBe(502);
    expect(mocks.logEvent).toHaveBeenCalledOnce();
    expect(mocks.logEvent).toHaveBeenCalledWith(expect.objectContaining({
      provider_requested: "external_with_legacy_fallback",
      provider_used: "none",
      fallback_occurred: false,
      fallback_reason: "none",
      fallback_stage: "response_status",
      outcome: "failed_closed",
      http_status: 502,
      result_count: 0,
      error_code: "catalog_unauthorized"
    }));
  });

  it("records invalid requests once without creating a provider", async () => {
    const response = await getActivities(request("/api/activity-catalog/activities?query=secret&limit=101"));
    expect(response.status).toBe(400);
    expect(mocks.createProvider).not.toHaveBeenCalled();
    expect(mocks.logEvent).toHaveBeenCalledOnce();
    expect(mocks.logEvent).toHaveBeenCalledWith(expect.objectContaining({
      provider_used: "none",
      fallback_occurred: false,
      outcome: "invalid_request",
      http_status: 400,
      has_search: true,
      result_count: 0
    }));
    expect(JSON.stringify(mocks.logEvent.mock.calls[0][0])).not.toContain("secret");
  });

  it("uses an aggregate top-level count for filters", async () => {
    const response = await getFilters(request("/api/activity-catalog/filters?sport=strength"));
    expect(response.status).toBe(200);
    expect(mocks.logEvent).toHaveBeenCalledOnce();
    expect(mocks.logEvent).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: "/api/activity-catalog/filters",
      operation: "get_filters",
      result_count: 5,
      has_search: false,
      filter_count: 1
    }));
  });
});
