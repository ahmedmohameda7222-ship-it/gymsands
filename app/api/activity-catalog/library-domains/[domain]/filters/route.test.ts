import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryDomainFilters, LibraryProviderMeta } from "@/lib/activity-catalog/library-types";

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  requireEligibleUser: vi.fn(),
  createProvider: vi.fn(),
  getFilters: vi.fn(),
  logOperationalEvent: vi.fn()
}));

vi.mock("@/lib/integrations/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/integrations/env", () => ({
  requireEligibleUser: mocks.requireEligibleUser,
  serverEnv: {
    plaivraActivityCatalogMode: "library_v2",
    plaivraActivityCatalogBaseUrl: "https://plaivra-activity-catalog-api.vercel.app",
    plaivraActivityCatalogApiKey: "test-catalog-key"
  }
}));
vi.mock("@/services/activity-catalog/server/library-selector", () => ({ createLibraryActivityProvider: mocks.createProvider }));
vi.mock("@/lib/observability/structured-log", () => ({ logOperationalEvent: mocks.logOperationalEvent }));

import { GET as getDomainFilters } from "./route";

const meta: LibraryProviderMeta = {
  apiVersion: "v2",
  locale: "en",
  libraryRelease: {
    id: "d985375c-a97e-592b-832c-ccf6226e1ae9",
    version: "p10e-library-v1",
    checksum: "6524498fd6a888ee3f4495516c38e7ad27332a5d04dcbbb3bc86b8469165e31e",
    publishedAt: "2026-08-11T00:00:00.000Z",
    strengthSemanticFingerprint: "73092422c4ef3bb6f386b7081fdeaaacb65778a29d449ba42fa2dda8fd9d142a"
  },
  catalogRelease: {
    id: "fc92eca8-c2ab-5366-ba83-5c64c904aaca",
    version: "p10e-library-v1",
    checksum: "a3f4707871d41efa50de8e56d7760dc06c45765aa35ac4c42f179186176c5271"
  },
  source: "library_v2",
  degraded: false
};

const emptyFilters: LibraryDomainFilters = {
  domain: "strength",
  filters: [],
  environmentCapabilities: [],
  availableTodayPrimaryControl: false
};

describe("Exercise Library V2 domain filter route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockReturnValue(null);
    mocks.requireEligibleUser.mockResolvedValue({ user: { id: "member-id" }, accessToken: "member-token", supabase: {} });
    mocks.getFilters.mockResolvedValue({ data: emptyFilters, meta });
    mocks.createProvider.mockReturnValue({ getFilters: mocks.getFilters });
  });

  it("returns 200 for the canonical object-shaped V2 response when filters are empty", async () => {
    const response = await getDomainFilters(
      new Request("https://app.plaivra.com/api/activity-catalog/library-domains/strength/filters?locale=en", {
        headers: { Authorization: "Bearer member-token" }
      }),
      { params: Promise.resolve({ domain: "strength" }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: emptyFilters, meta });
    expect(mocks.getFilters).toHaveBeenCalledWith("strength", { locale: "en" });
  });
});
