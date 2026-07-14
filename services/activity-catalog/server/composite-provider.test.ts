import { describe, expect, it, vi } from "vitest";
import { ActivityCatalogError } from "@/lib/activity-catalog/errors";
import type { ActivityCatalogProvider } from "./provider";
import { CompositeActivityCatalogProvider } from "./composite-provider";

function result<T>(data: T, source: "external" | "legacy") {
  return { data, meta: { source, degraded: false, apiVersion: "v1", locale: "en" } } as const;
}

function provider(overrides: Partial<ActivityCatalogProvider> = {}): ActivityCatalogProvider {
  return {
    listSports: vi.fn(async () => result([], "external")),
    getSportSessionTemplate: vi.fn(),
    getFilters: vi.fn(),
    searchActivities: vi.fn(async () => result([], "external")),
    getActivity: vi.fn(),
    getActivityAlternatives: vi.fn(),
    ...overrides
  } as ActivityCatalogProvider;
}

describe("CompositeActivityCatalogProvider fallback matrix", () => {
  it.each(["unavailable", "timeout", "rate_limited"] as const)("falls back once for %s and marks the response degraded", async (code) => {
    const external = provider({ searchActivities: vi.fn(async () => { throw new ActivityCatalogError(code); }) });
    const legacy = provider({ searchActivities: vi.fn(async () => result([], "legacy")) });
    const composite = new CompositeActivityCatalogProvider("external_with_legacy_fallback", external, legacy);
    await expect(composite.searchActivities({})).resolves.toMatchObject({
      data: [],
      meta: { source: "legacy", degraded: true, fallbackReason: code }
    });
    expect(external.searchActivities).toHaveBeenCalledOnce();
    expect(legacy.searchActivities).toHaveBeenCalledOnce();
  });

  it.each(["invalid_request", "invalid_response", "upstream_unauthorized", "upstream_forbidden", "configuration_error"] as const)("does not hide %s with fallback", async (code) => {
    const external = provider({ searchActivities: vi.fn(async () => { throw new ActivityCatalogError(code); }) });
    const legacy = provider({ searchActivities: vi.fn(async () => result([], "legacy")) });
    const composite = new CompositeActivityCatalogProvider("external_with_legacy_fallback", external, legacy);
    await expect(composite.searchActivities({})).rejects.toMatchObject({ code });
    expect(legacy.searchActivities).not.toHaveBeenCalled();
  });

  it("uses legacy for a genuine detail 404 but not a list 404", async () => {
    const external = provider({
      getActivity: vi.fn(async () => { throw new ActivityCatalogError("not_found"); }),
      searchActivities: vi.fn(async () => { throw new ActivityCatalogError("not_found"); })
    });
    const legacyActivity = { id: "legacy-id" } as never;
    const legacy = provider({
      getActivity: vi.fn(async () => result(legacyActivity, "legacy")),
      searchActivities: vi.fn(async () => result([], "legacy"))
    });
    const composite = new CompositeActivityCatalogProvider("external_with_legacy_fallback", external, legacy);
    await expect(composite.getActivity("legacy-id")).resolves.toMatchObject({ meta: { source: "legacy", degraded: true, fallbackReason: "not_found" } });
    await expect(composite.searchActivities({})).rejects.toMatchObject({ code: "not_found" });
    expect(legacy.searchActivities).not.toHaveBeenCalled();
  });

  it("does not replace a successful external empty result", async () => {
    const external = provider({ searchActivities: vi.fn(async () => result([], "external")) });
    const legacy = provider({ searchActivities: vi.fn(async () => result([{} as never], "legacy")) });
    const composite = new CompositeActivityCatalogProvider("external_with_legacy_fallback", external, legacy);
    await expect(composite.searchActivities({})).resolves.toMatchObject({ data: [], meta: { source: "external", degraded: false } });
    expect(legacy.searchActivities).not.toHaveBeenCalled();
  });

  it("never invokes external in legacy mode", async () => {
    const external = provider();
    const legacy = provider({ searchActivities: vi.fn(async () => result([], "legacy")) });
    const composite = new CompositeActivityCatalogProvider("legacy", external, legacy);
    await composite.searchActivities({});
    expect(external.searchActivities).not.toHaveBeenCalled();
  });
});
