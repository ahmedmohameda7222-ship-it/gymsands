import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CatalogError } from "@/lib/activity-catalog/errors";
import type { ActivityCatalogProvider } from "./provider";
import { createActivityCatalogExecutionObserver } from "./observability";
import { createActivityCatalogProvider } from "./selector";

function provider(overrides: Partial<ActivityCatalogProvider> = {}): ActivityCatalogProvider {
  const externalMeta = { source: "external" as const, degraded: false, catalogVersion: "v1" };
  return {
    listSports: vi.fn(async () => ({ data: [], meta: externalMeta })),
    getSportSessionTemplate: vi.fn(async () => { throw new CatalogError("catalog_not_found"); }),
    getFilters: vi.fn(async () => ({
      data: { sports: [], activityTypes: [], sessionTypes: [], sessionPhases: [], equipment: [], trainingGoals: [], difficulties: [] },
      meta: externalMeta
    })),
    searchActivities: vi.fn(async () => ({
      data: { activities: [], pagination: { limit: 30, offset: 0, returned: 0, nextOffset: null } },
      meta: externalMeta
    })),
    getActivity: vi.fn(async () => { throw new CatalogError("catalog_not_found"); }),
    getActivityAlternatives: vi.fn(async () => ({ data: [], meta: externalMeta })),
    ...overrides
  };
}

function externalNotFound() {
  return new CatalogError("catalog_not_found", {
    allowLegacyFallback: true,
    failureStage: "response_status"
  });
}

describe("Activity Catalog 404 list and filter observability", () => {
  it("keeps list and filter 404 responses fail closed without legacy fallback", async () => {
    const observer = createActivityCatalogExecutionObserver();
    const legacyList = vi.fn(async () => ({
      data: [],
      meta: { source: "legacy" as const, degraded: false, catalogVersion: "legacy" }
    }));
    const legacyFilters = vi.fn(async () => ({
      data: { sports: [], activityTypes: [], sessionTypes: [], sessionPhases: [], equipment: [], trainingGoals: [], difficulties: [] },
      meta: { source: "legacy" as const, degraded: false, catalogVersion: "legacy" }
    }));
    const selected = createActivityCatalogProvider({} as SupabaseClient, {
      mode: "external_with_legacy_fallback",
      external: provider({
        listSports: vi.fn(async () => { throw externalNotFound(); }),
        getFilters: vi.fn(async () => { throw externalNotFound(); })
      }),
      legacy: provider({ listSports: legacyList, getFilters: legacyFilters }),
      observer
    });

    await expect(selected.listSports()).rejects.toMatchObject({ code: "catalog_not_found" });
    expect(legacyList).not.toHaveBeenCalled();
    expect(observer.metadata).toMatchObject({
      providerRequested: "external_with_legacy_fallback",
      providerUsed: "none",
      fallbackOccurred: false,
      fallbackReason: "none",
      fallbackStage: "response_status",
      errorCode: "catalog_not_found"
    });

    await expect(selected.getFilters()).rejects.toMatchObject({ code: "catalog_not_found" });
    expect(legacyFilters).not.toHaveBeenCalled();
    expect(observer.metadata).toMatchObject({
      providerUsed: "none",
      fallbackOccurred: false,
      fallbackReason: "none",
      fallbackStage: "response_status",
      errorCode: "catalog_not_found"
    });
  });
});
