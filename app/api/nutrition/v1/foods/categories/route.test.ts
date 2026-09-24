import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireNutritionUser: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  listCurrentFoodCatalogCategoryFacets: vi.fn(),
}));

vi.mock("@/lib/nutrition-v1/http", async () => {
  const actual = await vi.importActual<typeof import("@/lib/nutrition-v1/http")>("@/lib/nutrition-v1/http");
  return { ...actual, requireNutritionUser: mocks.requireNutritionUser };
});
vi.mock("@/lib/integrations/env", async () => {
  const actual = await vi.importActual<typeof import("@/lib/integrations/env")>("@/lib/integrations/env");
  return { ...actual, createSupabaseServerClient: mocks.createSupabaseServerClient };
});
vi.mock("@/services/food-catalog/server/current-search-category-facets", () => ({
  listCurrentFoodCatalogCategoryFacets: mocks.listCurrentFoodCatalogCategoryFacets,
}));

import { GET } from "@/app/api/nutrition/v1/foods/categories/route";

describe("Plan 7 authenticated current Catalog category facets route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an unauthenticated request before creating or using privileged Catalog read authority", async () => {
    mocks.requireNutritionUser.mockResolvedValue(new NextResponse(null, { status: 401 }));

    const response = await GET(new Request("http://localhost/api/nutrition/v1/foods/categories"));

    expect(response.status).toBe(401);
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
    expect(mocks.listCurrentFoodCatalogCategoryFacets).not.toHaveBeenCalled();
  });

  it("creates the service-role Catalog client only after authentication and returns the facet list", async () => {
    const ownerSupabase = { authority: "owner" };
    const catalogSupabase = { authority: "catalog" };
    mocks.requireNutritionUser.mockResolvedValue({
      supabase: ownerSupabase,
      user: { id: "11111111-1111-4111-8111-111111111111" },
      accessToken: "token",
    });
    mocks.createSupabaseServerClient.mockReturnValue(catalogSupabase);
    mocks.listCurrentFoodCatalogCategoryFacets.mockResolvedValue(["dairy", "fruit"]);

    const response = await GET(new Request("http://localhost/api/nutrition/v1/foods/categories", {
      headers: { authorization: "Bearer token" },
    }));

    expect(response.ok).toBe(true);
    await expect(response.json()).resolves.toEqual({ categories: ["dairy", "fruit"] });
    expect(mocks.createSupabaseServerClient).toHaveBeenCalledWith(null, true);
    expect(mocks.listCurrentFoodCatalogCategoryFacets).toHaveBeenCalledWith(catalogSupabase);
    expect(mocks.requireNutritionUser.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createSupabaseServerClient.mock.invocationCallOrder[0],
    );
  });

  it("fails the request rather than returning partial categories when the server facet read fails", async () => {
    mocks.requireNutritionUser.mockResolvedValue({
      supabase: { authority: "owner" },
      user: { id: "11111111-1111-4111-8111-111111111111" },
      accessToken: "token",
    });
    mocks.createSupabaseServerClient.mockReturnValue({ authority: "catalog" });
    mocks.listCurrentFoodCatalogCategoryFacets.mockRejectedValue(new Error("facet read failed"));

    const response = await GET(new Request("http://localhost/api/nutrition/v1/foods/categories"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ code: "nutrition_unavailable" });
  });
});
