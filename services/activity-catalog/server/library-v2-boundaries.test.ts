import { describe, expect, it, vi } from "vitest";
import type { LibraryActivityProvider } from "./library-provider";
import { HttpLibraryActivityProvider } from "./library-http-provider";
import { LibraryProviderError } from "./library-errors";
import { FallbackLibraryActivityProvider } from "./library-selector";

const catalogKey = "p10f-catalog-key-must-remain-server-only";
const libraryRelease = {
  id: "d985375c-a97e-592b-832c-ccf6226e1ae9",
  version: "p10e-library-v1",
  checksum: "6524498fd6a888ee3f4495516c38e7ad27332a5d04dcbbb3bc86b8469165e31e",
  publishedAt: "2026-08-11T00:00:00.000Z",
  strengthSemanticFingerprint: "73092422c4ef3bb6f386b7081fdeaaacb65778a29d449ba42fa2dda8fd9d142a"
};
const catalogRelease = {
  id: "fc92eca8-c2ab-5366-ba83-5c64c904aaca",
  version: "p10e-library-v1",
  checksum: "a3f4707871d41efa50de8e56d7760dc06c45765aa35ac4c42f179186176c5271"
};
const meta = { apiVersion: "v2" as const, locale: "en", libraryRelease, catalogRelease, source: "library_v2" as const, degraded: false };

function response(data: unknown, status = 200, pagination?: unknown) {
  return new Response(JSON.stringify({ data, meta: { apiVersion: "v2", locale: "en", libraryRelease, catalogRelease }, ...(pagination ? { pagination } : {}) }), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function provider(overrides: Partial<LibraryActivityProvider> = {}): LibraryActivityProvider {
  const notFound = async () => { throw new LibraryProviderError("catalog_not_found"); };
  return {
    listDomains: vi.fn(async () => ({ data: [], meta })),
    getDomain: vi.fn(notFound),
    getFilters: vi.fn(async () => ({ data: [], meta })),
    getArchetypes: vi.fn(async () => ({ data: [], meta })),
    searchActivities: vi.fn(async () => ({ data: [], pagination: { limit: 50, returned: 0, nextCursor: null }, meta })),
    getActivity: vi.fn(notFound),
    getActivityAlternatives: vi.fn(async () => ({ data: [], meta })),
    ...overrides
  };
}

describe("P10F Library V2 HTTP provider", () => {
  it("sends only allowlisted Library query state and never uses upstream offsets or user identity", async () => {
    const fetchSpy = vi.fn(async () => response([], 200, { limit: 50, returned: 0, nextCursor: "opaque-next" }));
    const http = new HttpLibraryActivityProvider({
      baseUrl: "https://catalog-api.plaivra.com",
      apiKey: catalogKey,
      fetchImpl: fetchSpy as unknown as typeof fetch
    });

    const result = await http.searchActivities({ domain: "strength", query: "press", visibility: "searchable", limit: 50, cursor: "opaque-current", locale: "de" });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [requestUrl, init] = fetchSpy.mock.calls[0] as unknown as [URL, RequestInit];
    const url = new URL(requestUrl);
    expect(url.pathname).toBe("/v2/library-domains/strength/activities");
    expect(Array.from(url.searchParams.keys()).sort()).toEqual(["cursor", "limit", "locale", "query", "visibility"]);
    expect(url.searchParams.has("offset")).toBe(false);
    expect(init.cache).toBe("no-store");
    expect(init.headers).toEqual({ Accept: "application/json", Authorization: `Bearer ${catalogKey}` });
    expect(JSON.stringify({ url: url.toString(), init })).not.toContain("user_id");
    expect(JSON.stringify(result)).not.toContain(catalogKey);
    expect(result.pagination.nextCursor).toBe("opaque-next");
  });

  it.each([
    [400, "bad_request", "catalog_bad_request", false],
    [401, "unauthorized", "catalog_unauthorized", false],
    [403, "forbidden", "catalog_forbidden", false],
    [404, "activity_not_found", "catalog_not_found", false],
    [429, "rate_limited", "catalog_rate_limited", true],
    [500, "internal_error", "catalog_upstream_error", true]
  ] as const)("maps upstream %s to %s without leaking payloads", async (status, upstream, code, fallback) => {
    const http = new HttpLibraryActivityProvider({
      baseUrl: "https://catalog-api.plaivra.com",
      apiKey: catalogKey,
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ error: { code: upstream, message: "raw database secret" } }), { status })) as unknown as typeof fetch
    });
    await expect(http.listDomains()).rejects.toMatchObject({ code, allowLegacyFallback: fallback, upstreamCode: upstream });
  });

  it("classifies an incompatible release-bound cursor as non-fallback request state", async () => {
    const http = new HttpLibraryActivityProvider({
      baseUrl: "https://catalog-api.plaivra.com",
      apiKey: catalogKey,
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ error: { code: "invalid_cursor", message: "release changed" } }), { status: 400 })) as unknown as typeof fetch
    });
    await expect(http.searchActivities({ domain: "strength", cursor: "old", limit: 50 })).rejects.toMatchObject({
      code: "catalog_incompatible_cursor",
      allowLegacyFallback: false
    });
  });
});

describe("P10F Library V2 fallback matrix", () => {
  it.each(["catalog_timeout", "catalog_network_error", "catalog_rate_limited", "catalog_upstream_error"] as const)("allows degraded legacy fallback only for %s", async (code) => {
    const legacySearch = vi.fn(async () => ({ data: [], pagination: { limit: 50, returned: 0, nextCursor: null }, meta: { ...meta, apiVersion: "v1-compat" as const, source: "legacy" as const, libraryRelease: null, catalogRelease: null } }));
    const composite = new FallbackLibraryActivityProvider(
      provider({ searchActivities: vi.fn(async () => { throw new LibraryProviderError(code, { allowLegacyFallback: true }); }) }),
      provider({ searchActivities: legacySearch as LibraryActivityProvider["searchActivities"] })
    );
    const result = await composite.searchActivities({ domain: "strength", query: "press" });
    expect(result.meta.source).toBe("legacy");
    expect(result.meta.degraded).toBe(true);
    expect(legacySearch).toHaveBeenCalledOnce();
  });

  it.each(["catalog_bad_request", "catalog_unauthorized", "catalog_forbidden", "catalog_incompatible_cursor", "catalog_invalid_response", "catalog_not_configured"] as const)("fails closed for %s", async (code) => {
    const legacySearch = vi.fn();
    const composite = new FallbackLibraryActivityProvider(
      provider({ searchActivities: vi.fn(async () => { throw new LibraryProviderError(code); }) }),
      provider({ searchActivities: legacySearch as LibraryActivityProvider["searchActivities"] })
    );
    await expect(composite.searchActivities({ domain: "strength" })).rejects.toMatchObject({ code });
    expect(legacySearch).not.toHaveBeenCalled();
  });

  it("never reinterprets a successful empty V2 search as missing data", async () => {
    const externalResult = { data: [], pagination: { limit: 50, returned: 0, nextCursor: null }, meta };
    const legacySearch = vi.fn();
    const composite = new FallbackLibraryActivityProvider(
      provider({ searchActivities: vi.fn(async () => externalResult) }),
      provider({ searchActivities: legacySearch as LibraryActivityProvider["searchActivities"] })
    );
    await expect(composite.searchActivities({ domain: "strength", query: "no-match" })).resolves.toBe(externalResult);
    expect(legacySearch).not.toHaveBeenCalled();
  });

  it("allows detail 404 compatibility only after the old identifier is proven in legacy", async () => {
    const legacyDetail = { data: { id: "11111111-1111-4111-8111-111111111111" } as never, meta: { ...meta, apiVersion: "v1-compat" as const, source: "legacy" as const, libraryRelease: null, catalogRelease: null } };
    const external = provider({ getActivity: vi.fn(async () => { throw new LibraryProviderError("catalog_not_found"); }) });
    const missingLegacy = provider({ getActivity: vi.fn(async () => { throw new LibraryProviderError("catalog_not_found"); }) });
    await expect(new FallbackLibraryActivityProvider(external, missingLegacy).getActivity("strength", "new-v2-id")).rejects.toMatchObject({ code: "catalog_not_found" });

    const provenLegacyLookup = vi.fn(async () => legacyDetail);
    const result = await new FallbackLibraryActivityProvider(external, provider({ getActivity: provenLegacyLookup as LibraryActivityProvider["getActivity"] })).getActivity("strength", "old-legacy-id");
    expect(result.meta.source).toBe("legacy");
    expect(result.meta.degraded).toBe(true);
    expect(provenLegacyLookup).toHaveBeenCalledTimes(2);
  });
});
