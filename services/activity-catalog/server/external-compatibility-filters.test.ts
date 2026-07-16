import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { HttpActivityCatalogProvider } from "./http-provider";

describe("external Activity Catalog compatibility filters", () => {
  it.each([
    ["primaryMuscle", "chest"],
    ["secondaryMuscle", "triceps"],
    ["muscleCategory", "upper_body"],
    ["movementPattern", "horizontal_push"],
    ["forceType", "push"]
  ] as const)("fails closed instead of forwarding or ignoring %s", async (field, value) => {
    const fetchSpy = vi.fn();
    const provider = new HttpActivityCatalogProvider({
      baseUrl: "https://catalog-api.plaivra.com",
      apiKey: "server-only-key",
      fetchImpl: fetchSpy as unknown as typeof fetch
    });

    await expect(provider.searchActivities({ limit: 60, offset: 0, [field]: value }))
      .rejects.toMatchObject({ code: "catalog_bad_request", allowLegacyFallback: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
