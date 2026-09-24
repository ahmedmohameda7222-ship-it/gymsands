import { beforeEach, describe, expect, it, vi } from "vitest";

const userId = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";
const savedMealId = "33333333-3333-4333-8333-333333333333";
const foodItem = { kind: "food", food_id: "44444444-4444-4444-8444-444444444444" };
const ownerSupabase = { authority: "owner" };
const catalogSupabase = { authority: "catalog" };

const mocks = vi.hoisted(() => ({
  requireNutritionUser: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  canonicalizeSavedMealItems: vi.fn(),
  createSavedMeal: vi.fn(),
  updateSavedMeal: vi.fn(),
  resolveSavedMealBundleSnapshot: vi.fn(),
  softDeleteSavedMeal: vi.fn(),
}));

vi.mock("@/lib/nutrition-v1/http", async () => {
  const actual = await vi.importActual<typeof import("@/lib/nutrition-v1/http")>("@/lib/nutrition-v1/http");
  return { ...actual, requireNutritionUser: mocks.requireNutritionUser };
});
vi.mock("@/lib/integrations/env", async () => {
  const actual = await vi.importActual<typeof import("@/lib/integrations/env")>("@/lib/integrations/env");
  return { ...actual, createSupabaseServerClient: mocks.createSupabaseServerClient };
});
vi.mock("@/services/nutrition-v1/server/saved-meal-write-authority", () => ({ canonicalizeSavedMealItems: mocks.canonicalizeSavedMealItems }));
vi.mock("@/services/nutrition-v1/server/saved-meals", () => ({
  createSavedMeal: mocks.createSavedMeal,
  updateSavedMeal: mocks.updateSavedMeal,
  resolveSavedMealBundleSnapshot: mocks.resolveSavedMealBundleSnapshot,
  softDeleteSavedMeal: mocks.softDeleteSavedMeal,
}));

import { POST } from "@/app/api/nutrition/v1/saved-meals/route";
import { PATCH } from "@/app/api/nutrition/v1/saved-meals/[savedMealId]/route";

describe("Saved Meal write transport identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireNutritionUser.mockResolvedValue({ supabase: ownerSupabase, user: { id: userId }, accessToken: "test" });
    mocks.createSupabaseServerClient.mockReturnValue(catalogSupabase);
    mocks.canonicalizeSavedMealItems.mockResolvedValue([foodItem]);
    mocks.createSavedMeal.mockResolvedValue({ id: savedMealId, user_id: userId, name: "Breakfast", note: null, is_favorite: false });
    mocks.updateSavedMeal.mockResolvedValue({ id: savedMealId, user_id: userId, name: "Breakfast", note: null, is_favorite: false });
  });

  it("requires and forwards the caller operation ID plus current write locale into canonical creation", async () => {
    const response = await POST(new Request("http://localhost/api/nutrition/v1/saved-meals", {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({ operationId, name: "Breakfast", writeLanguageTag: "de", items: [foodItem] }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.canonicalizeSavedMealItems).toHaveBeenCalledWith(ownerSupabase, catalogSupabase, userId, [foodItem], "de");
    expect(mocks.createSavedMeal).toHaveBeenCalledWith(ownerSupabase, userId, expect.objectContaining({
      operationId,
      name: "Breakfast",
      items: [foodItem],
    }));
  });

  it("forwards the current write locale into PATCH recanonicalization without persisting transport metadata", async () => {
    const response = await PATCH(new Request(`http://localhost/api/nutrition/v1/saved-meals/${savedMealId}`, {
      method: "PATCH",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({ name: "Breakfast", writeLanguageTag: "en", items: [foodItem] }),
    }), { params: Promise.resolve({ savedMealId }) });

    expect(response.ok).toBe(true);
    expect(mocks.canonicalizeSavedMealItems).toHaveBeenCalledWith(ownerSupabase, catalogSupabase, userId, [foodItem], "en");
    expect(mocks.updateSavedMeal).toHaveBeenCalledWith(ownerSupabase, userId, savedMealId, expect.objectContaining({
      name: "Breakfast",
      items: [foodItem],
    }));
    expect(mocks.updateSavedMeal.mock.calls[0]?.[3]).not.toHaveProperty("writeLanguageTag");
  });
});
