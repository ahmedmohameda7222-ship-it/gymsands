import { beforeEach, describe, expect, it, vi } from "vitest";

const ownerId = "11111111-1111-4111-8111-111111111111";
const barcode = "4006381333931";

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  requireEligibleUser: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  resolveFoodBarcode: vi.fn(),
  logExternalApi: vi.fn(),
  lookupOpenFoodFactsBarcode: vi.fn(),
}));

vi.mock("@/lib/integrations/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/integrations/env", async () => {
  const actual = await vi.importActual<typeof import("@/lib/integrations/env")>("@/lib/integrations/env");
  return { ...actual, requireEligibleUser: mocks.requireEligibleUser, createSupabaseServerClient: mocks.createSupabaseServerClient };
});
vi.mock("@/lib/integrations/api-logger", () => ({ logExternalApi: mocks.logExternalApi }));
vi.mock("@/lib/integrations/open-food-facts", () => ({ lookupOpenFoodFactsBarcode: mocks.lookupOpenFoodFactsBarcode }));
vi.mock("@/services/nutrition-v1/server/barcode-lookup", () => ({ resolveFoodBarcode: mocks.resolveFoodBarcode }));

import { GET, POST } from "@/app/api/food/open-food-facts/route";

function ownerSupabase() {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "insert", "update"]) query[method] = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
  query.single = vi.fn(async () => ({ data: { id: "22222222-2222-4222-8222-222222222222" }, error: null }));
  return { from: vi.fn(() => query) };
}

const providerSuggestion = () => ({
  kind: "provider_suggestion" as const,
  barcode,
  food: {
    source: "open_food_facts",
    source_id: barcode,
    barcode,
    name: "Provider yogurt",
    brand: "Provider",
    serving_size: "170 g",
    calories: 100,
    protein: 10,
    carbs: 12,
    fat: 2,
    fiber: null,
    sugar: null,
    sodium: null,
  },
});

describe("Task 12 barcode provider suggestion policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockReturnValue(null);
    mocks.createSupabaseServerClient.mockReturnValue({ authority: "catalog" });
    mocks.logExternalApi.mockResolvedValue(undefined);
  });

  it("keeps canonical-miss provider data readable as suggestion evidence", async () => {
    const db = ownerSupabase();
    mocks.requireEligibleUser.mockResolvedValue({ supabase: db, user: { id: ownerId }, accessToken: "token" });
    mocks.resolveFoodBarcode.mockResolvedValueOnce(providerSuggestion());

    const response = await GET(new Request(`http://localhost/api/food/open-food-facts?barcode=${barcode}&locale=en`));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      kind: "provider_suggestion",
      food: { source: "provider_suggestion", name: "Provider yogurt" },
    });
    expect(db.from).not.toHaveBeenCalled();
  });

  it("rejects direct provider-suggestion mutation without writing owner data", async () => {
    const db = ownerSupabase();
    mocks.requireEligibleUser.mockResolvedValue({ supabase: db, user: { id: ownerId }, accessToken: "token" });
    mocks.resolveFoodBarcode.mockResolvedValueOnce(providerSuggestion());

    const response = await POST(new Request("http://localhost/api/food/open-food-facts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        barcode,
        saveToLibrary: true,
        addToLog: true,
        addToMealPlan: true,
        quantity: 1,
      }),
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringMatching(/suggestion/i) });
    expect(db.from).not.toHaveBeenCalled();
  });
});
