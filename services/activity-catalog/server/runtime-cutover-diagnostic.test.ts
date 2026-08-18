import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryActivityProvider } from "./library-provider";
import { LibraryProviderError } from "./library-errors";
import { __resetLegacyCatalogSnapshotCacheForTests } from "./legacy-provider";
import { FallbackLibraryActivityProvider, createLibraryActivityProvider } from "./library-selector";

function legacyRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    name: `Legacy Exercise ${String(index + 1).padStart(2, "0")}`,
    slug: `legacy_exercise_${index + 1}`,
    is_global: true,
    is_approved: true,
    version: 1
  }));
}

function legacySupabase(count = 60): SupabaseClient {
  const exercises = legacyRows(count);
  return {
    from(table: string) {
      const rows = table === "exercises" ? exercises : [];
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: async () => ({ data: rows, error: null })
      };
      return query;
    }
  } as unknown as SupabaseClient;
}

function unavailableV2(): LibraryActivityProvider {
  const fail = vi.fn(async () => {
    throw new LibraryProviderError("catalog_network_error", { allowLegacyFallback: true });
  });
  return {
    listDomains: fail,
    getDomain: fail,
    getFilters: fail,
    getArchetypes: fail,
    searchActivities: fail,
    getActivity: fail,
    getActivityAlternatives: fail
  } as unknown as LibraryActivityProvider;
}

describe("P10F runtime cutover diagnostics", () => {
  beforeEach(() => __resetLegacyCatalogSnapshotCacheForTests());

  it("proves the real legacy selector/provider stack terminates at 50 + 10 for a 60-identity universe", async () => {
    const provider = createLibraryActivityProvider(legacySupabase(), "legacy");
    const first = await provider.searchActivities({ domain: "strength", locale: "en", limit: 50 });

    expect(first.meta.source).toBe("legacy");
    expect(first.meta.degraded).toBe(false);
    expect(first.data).toHaveLength(50);
    expect(first.pagination.nextCursor).toEqual(expect.any(String));

    const second = await provider.searchActivities({
      domain: "strength",
      locale: "en",
      limit: 50,
      cursor: first.pagination.nextCursor ?? undefined
    });
    const identities = new Set([...first.data, ...second.data].map((activity) => activity.id));

    expect(second.meta.source).toBe("legacy");
    expect(second.data).toHaveLength(10);
    expect(second.pagination.nextCursor).toBeNull();
    expect(identities.size).toBe(60);
  });

  it("distinguishes controlled V2 failure from direct legacy by proving the primary attempt before degraded legacy fallback", async () => {
    const external = unavailableV2();
    const legacy = createLibraryActivityProvider(legacySupabase(), "legacy");
    const provider = new FallbackLibraryActivityProvider(external, legacy);

    const result = await provider.searchActivities({ domain: "strength", locale: "en", limit: 50 });

    expect(external.searchActivities).toHaveBeenCalledTimes(1);
    expect(result.meta.source).toBe("legacy");
    expect(result.meta.degraded).toBe(true);
    expect(result.data).toHaveLength(50);
    expect(result.pagination.nextCursor).toEqual(expect.any(String));
  });
});
