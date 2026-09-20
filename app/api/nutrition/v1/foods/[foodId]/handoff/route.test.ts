import { beforeEach, describe, expect, it, vi } from "vitest";

const userId = "11111111-1111-4111-8111-111111111111";
const foodId = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  requireNutritionUser: vi.fn(),
  resolveFoodHandoff: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/nutrition-v1/http", async () => {
  const actual = await vi.importActual<typeof import("@/lib/nutrition-v1/http")>(
    "@/lib/nutrition-v1/http",
  );
  return { ...actual, requireNutritionUser: mocks.requireNutritionUser };
});
vi.mock("@/services/nutrition-v1/server/food-handoff", () => ({
  resolveFoodHandoff: mocks.resolveFoodHandoff,
}));
vi.mock("@/lib/integrations/env", async () => {
  const actual = await vi.importActual<typeof import("@/lib/integrations/env")>("@/lib/integrations/env");
  return { ...actual, createSupabaseServerClient: mocks.createSupabaseServerClient };
});

import { GET } from "@/app/api/nutrition/v1/foods/[foodId]/handoff/route";

function request(query: string) {
  return new Request(
    `http://localhost/api/nutrition/v1/foods/${foodId}/handoff?${query}`,
    { headers: { authorization: "Bearer test" } },
  );
}

describe("Task 9 Food handoff GET boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const ownerSupabase = { authority: "owner" };
    const catalogSupabase = { authority: "catalog" };
    mocks.requireNutritionUser.mockResolvedValue({
      supabase: ownerSupabase,
      user: { id: userId },
      accessToken: "test",
    });
    mocks.createSupabaseServerClient.mockReturnValue(catalogSupabase);
    mocks.resolveFoodHandoff.mockResolvedValue({
      foodId,
      source: "catalog",
      name: "Greek yogurt",
      serving: "170 g",
      quantity: 1,
      frozenNutrition: { calories: 100, protein_g: 10, carbs_g: 12, fat_g: 2, fiber_g: null },
    });
  });

  it("forwards exact selected catalog display name, locale, serving and quantity", async () => {
    const response = await GET(
      request("source=catalog&quantity=1&serving=170%20g&displayName=Greek%20yogurt&languageTag=en"),
      { params: Promise.resolve({ foodId }) },
    );

    expect(response.ok).toBe(true);
    expect(mocks.createSupabaseServerClient).toHaveBeenCalledWith(null, true);
    expect(mocks.resolveFoodHandoff).toHaveBeenCalledWith(
      expect.objectContaining({ authority: "owner" }),
      expect.objectContaining({ authority: "catalog" }),
      userId,
      {
        foodId,
        source: "catalog",
        serving: "170 g",
        quantity: 1,
        displayName: "Greek yogurt",
        languageTag: "en",
      },
    );
  });

  it("fails closed when a catalog handoff omits selected display-name context", async () => {
    const response = await GET(
      request("source=catalog&quantity=1&serving=170%20g"),
      { params: Promise.resolve({ foodId }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.resolveFoodHandoff).not.toHaveBeenCalled();
  });

  it("keeps My Food handoff independent from catalog name context", async () => {
    mocks.resolveFoodHandoff.mockResolvedValueOnce({
      foodId,
      source: "my_food",
      name: "My oats",
      serving: "40 g",
      quantity: 2,
      frozenNutrition: { calories: 300, protein_g: null, carbs_g: 50, fat_g: 6, fiber_g: null },
    });

    const response = await GET(
      request("source=my_food&quantity=2&serving=40%20g"),
      { params: Promise.resolve({ foodId }) },
    );

    expect(response.ok).toBe(true);
    expect(mocks.resolveFoodHandoff).toHaveBeenCalledWith(
      expect.objectContaining({ authority: "owner" }),
      expect.objectContaining({ authority: "catalog" }),
      userId,
      {
        foodId,
        source: "my_food",
        serving: "40 g",
        quantity: 2,
        displayName: undefined,
        languageTag: null,
      },
    );
  });
});
