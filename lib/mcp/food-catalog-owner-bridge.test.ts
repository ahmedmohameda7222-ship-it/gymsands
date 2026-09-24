import { describe, expect, it, vi } from "vitest";
import { listFoodLibraryForMcp } from "@/services/nutrition-v1/server/food-library";
import { readCurrentPersonalOverrideForMcp } from "@/services/nutrition-v1/server/personal-overrides";

const CONNECTION_ID = "30000000-0000-4000-8000-000000000001";
const FOOD_ID = "40000000-0000-4000-8000-000000000001";

describe("Plan 7 MCP connection-derived Food owner authority", () => {
  it("derives owner-aware search from connection_id rather than a supplied user id", async () => {
    const rpc = vi.fn(async () => ({ data: { items: [], nextCursor: null }, error: null }));
    const supabase = { rpc } as never;

    await listFoodLibraryForMcp(supabase, CONNECTION_ID, { query: "banana", locale: "en", limit: 5 });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("search_food_catalog_v2_for_mcp_v1", expect.objectContaining({
      p_connection_id: CONNECTION_ID,
      p_query: "banana",
      p_language_tag: "en",
      p_limit: 5,
    }));
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_user_id");
  });

  it("reads Personal Override authority through the service-role MCP bridge", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        foodId: FOOD_ID,
        hasOverride: false,
        revisionId: null,
        pointerRevision: 0,
        isDeleted: false,
        nutritionOverride: null,
        servingLabel: null,
        note: null,
      },
      error: null,
    }));
    const supabase = { rpc } as never;

    const result = await readCurrentPersonalOverrideForMcp(supabase, CONNECTION_ID, FOOD_ID);

    expect(result.foodId).toBe(FOOD_ID);
    expect(rpc).toHaveBeenCalledWith("food_catalog_get_current_personal_override_for_mcp_v1", {
      p_connection_id: CONNECTION_ID,
      p_food_id: FOOD_ID,
    });
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_user_id");
  });
});
