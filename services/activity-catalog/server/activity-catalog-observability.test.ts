import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CatalogError } from "@/lib/activity-catalog/errors";
import type { CatalogResult, PaginatedTrainingActivities, TrainingActivity } from "@/lib/activity-catalog/types";
import { createActivityCatalogExecutionObserver } from "./observability";
import type { ActivityCatalogProvider } from "./provider";
import { createActivityCatalogProvider } from "./selector";

function searchResult(source: "legacy" | "external", count = 0): CatalogResult<PaginatedTrainingActivities> {
  return {
    data: {
      activities: Array.from({ length: count }, (_, index) => ({ id: `activity-${index}` } as TrainingActivity)),
      pagination: { limit: 30, offset: 0, returned: count, nextOffset: null }
    },
    meta: { source, degraded: false, catalogVersion: source === "legacy" ? "legacy" : "v1" }
  };
}

function provider(overrides: Partial<ActivityCatalogProvider> = {}): ActivityCatalogProvider {
  return {
    listSports: vi.fn(async () => ({ data: [], meta: { source: "external" as const, degraded: false, catalogVersion: "v1" } })),
    getSportSessionTemplate: vi.fn(async () => { throw new CatalogError("catalog_not_found"); }),
    getFilters: vi.fn(async () => ({
      data: { sports: [], activityTypes: [], sessionTypes: [], sessionPhases: [], equipment: [], trainingGoals: [], difficulties: [] },
      meta: { source: "external" as const, degraded: false, catalogVersion: "v1" }
    })),
    searchActivities: vi.fn(async () => searchResult("external")),
    getActivity: vi.fn(async () => { throw new CatalogError("catalog_not_found"); }),
    getActivityAlternatives: vi.fn(async () => ({ data: [], meta: { source: "external" as const, degraded: false, catalogVersion: "v1" } })),
    ...overrides
  };
}

const supabase = {} as SupabaseClient;

describe("Activity Catalog provider execution observability", () => {
  it("records direct legacy mode without external access", async () => {
    const observer = createActivityCatalogExecutionObserver();
    const legacySearch = vi.fn(async () => searchResult("legacy", 2));
    const externalSearch = vi.fn(async () => searchResult("external"));
    const selected = createActivityCatalogProvider(supabase, {
      mode: "legacy",
      legacy: provider({ searchActivities: legacySearch }),
      external: provider({ searchActivities: externalSearch }),
      observer
    });

    await expect(selected.searchActivities({})).resolves.toMatchObject({ meta: { source: "legacy" } });
    expect(legacySearch).toHaveBeenCalledOnce();
    expect(externalSearch).not.toHaveBeenCalled();
    expect(observer.metadata).toMatchObject({
      providerRequested: "legacy",
      providerUsed: "legacy",
      fallbackOccurred: false,
      fallbackReason: "none",
      fallbackStage: "none"
    });
    expect(observer.metadata.providerDurationMs).toBeGreaterThanOrEqual(0);
  });

  it.each([
    ["external", "external"],
    ["external_with_legacy_fallback", "external"]
  ] as const)("records %s success through the external provider", async (mode) => {
    const observer = createActivityCatalogExecutionObserver();
    const legacySearch = vi.fn(async () => searchResult("legacy"));
    const selected = createActivityCatalogProvider(supabase, {
      mode,
      legacy: provider({ searchActivities: legacySearch }),
      external: provider({ searchActivities: vi.fn(async () => searchResult("external", 3)) }),
      observer
    });

    await expect(selected.searchActivities({ query: "press" })).resolves.toMatchObject({ meta: { source: "external" } });
    expect(legacySearch).not.toHaveBeenCalled();
    expect(observer.metadata).toMatchObject({
      providerRequested: mode,
      providerUsed: "external",
      fallbackOccurred: false,
      fallbackReason: "none",
      fallbackStage: "none"
    });
  });

  it.each([
    ["catalog_timeout", "external_timeout", "provider_request"],
    ["catalog_network_error", "external_network_error", "provider_request"],
    ["catalog_rate_limited", "external_rate_limited", "response_status"],
    ["catalog_upstream_error", "external_upstream_5xx", "response_status"]
  ] as const)("records successful legacy fallback for %s", async (code, reason, stage) => {
    const observer = createActivityCatalogExecutionObserver();
    const legacySearch = vi.fn(async () => searchResult("legacy", 1));
    const selected = createActivityCatalogProvider(supabase, {
      mode: "external_with_legacy_fallback",
      legacy: provider({ searchActivities: legacySearch }),
      external: provider({
        searchActivities: vi.fn(async () => {
          throw new CatalogError(code, { allowLegacyFallback: true, failureStage: stage });
        })
      }),
      observer
    });

    await expect(selected.searchActivities({})).resolves.toMatchObject({ meta: { source: "legacy", degraded: true } });
    expect(legacySearch).toHaveBeenCalledOnce();
    expect(observer.metadata).toMatchObject({
      providerRequested: "external_with_legacy_fallback",
      providerUsed: "legacy",
      fallbackOccurred: true,
      fallbackReason: reason,
      fallbackStage: stage
    });
  });

  it.each([
    ["catalog_unauthorized", "response_status"],
    ["catalog_forbidden", "response_status"],
    ["catalog_invalid_response", "response_validation"]
  ] as const)("records fail-closed %s without fallback", async (code, stage) => {
    const observer = createActivityCatalogExecutionObserver();
    const legacySearch = vi.fn(async () => searchResult("legacy"));
    const selected = createActivityCatalogProvider(supabase, {
      mode: "external_with_legacy_fallback",
      legacy: provider({ searchActivities: legacySearch }),
      external: provider({
        searchActivities: vi.fn(async () => { throw new CatalogError(code, { failureStage: stage }); })
      }),
      observer
    });

    await expect(selected.searchActivities({})).rejects.toMatchObject({ code });
    expect(legacySearch).not.toHaveBeenCalled();
    expect(observer.metadata).toMatchObject({
      providerUsed: "none",
      fallbackOccurred: false,
      fallbackReason: "none",
      fallbackStage: stage,
      errorCode: code
    });
  });

  it("keeps a valid empty external result as external success", async () => {
    const observer = createActivityCatalogExecutionObserver();
    const legacySearch = vi.fn(async () => searchResult("legacy"));
    const selected = createActivityCatalogProvider(supabase, {
      mode: "external_with_legacy_fallback",
      external: provider({ searchActivities: vi.fn(async () => searchResult("external", 0)) }),
      legacy: provider({ searchActivities: legacySearch }),
      observer
    });

    const result = await selected.searchActivities({ query: "no-match" });
    expect(result.data.activities).toHaveLength(0);
    expect(legacySearch).not.toHaveBeenCalled();
    expect(observer.metadata).toMatchObject({ providerUsed: "external", fallbackOccurred: false });
  });

  it("keeps 404 fallback lookup-only and records external_not_found when used", async () => {
    const observer = createActivityCatalogExecutionObserver();
    const activity = { id: "legacy-id" } as TrainingActivity;
    const legacyLookup = vi.fn(async () => ({
      data: activity,
      meta: { source: "legacy" as const, degraded: false, catalogVersion: "legacy" }
    }));
    const external = provider({
      searchActivities: vi.fn(async () => {
        throw new CatalogError("catalog_not_found", { allowLegacyFallback: true, failureStage: "response_status" });
      }),
      getActivity: vi.fn(async () => {
        throw new CatalogError("catalog_not_found", { allowLegacyFallback: true, failureStage: "response_status" });
      })
    });
    const selected = createActivityCatalogProvider(supabase, {
      mode: "external_with_legacy_fallback",
      external,
      legacy: provider({ getActivity: legacyLookup }),
      observer
    });

    await expect(selected.searchActivities({ query: "missing" })).rejects.toMatchObject({ code: "catalog_not_found" });
    expect(observer.metadata).toMatchObject({ providerUsed: "none", fallbackOccurred: false });

    await expect(selected.getActivity("legacy-id")).resolves.toMatchObject({ data: activity, meta: { source: "legacy", degraded: true } });
    expect(legacyLookup).toHaveBeenCalledOnce();
    expect(observer.metadata).toMatchObject({
      providerUsed: "legacy",
      fallbackOccurred: true,
      fallbackReason: "external_not_found",
      fallbackStage: "response_status"
    });
  });
});
