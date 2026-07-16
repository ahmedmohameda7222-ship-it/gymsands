import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { ActivitySearchParams } from "@/lib/activity-catalog/types";
import { HttpActivityCatalogProvider } from "./http-provider";

describe("external Activity Catalog compatibility filters", () => {
  it.each([
    ["activityTypes", ["strength", "cardio"]],
    ["difficulties", ["beginner", "advanced"]],
    ["primaryMuscles", ["chest"]],
    ["secondaryMuscles", ["triceps"]],
    ["muscleCategories", ["upper_body"]],
    ["movementPatterns", ["horizontal_push"]],
    ["forceTypes", ["push"]]
  ] as const)("fails closed instead of forwarding or ignoring %s", async (field, value) => {
    const fetchSpy = vi.fn();
    const provider = new HttpActivityCatalogProvider({
      baseUrl: "https://catalog-api.plaivra.com",
      apiKey: "server-only-key",
      fetchImpl: fetchSpy as unknown as typeof fetch
    });
    const params = { limit: 60, offset: 0, [field]: [...value] } as ActivitySearchParams;

    await expect(provider.searchActivities(params))
      .rejects.toMatchObject({ code: "catalog_bad_request", allowLegacyFallback: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
