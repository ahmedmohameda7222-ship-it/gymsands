import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { addDiaryWater } from "@/services/nutrition-v1/server/diary";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OPERATION_ID = "22222222-2222-4222-8222-222222222222";

describe("Nutrition V1 water logging idempotency", () => {
  it("routes one water intent through the owner-derived idempotent RPC with the caller operation ID", async () => {
    const water = {
      id: "33333333-3333-4333-8333-333333333333",
      amount_ml: 250,
      created_at: "2026-08-29T09:30:00.000Z",
      alreadyLogged: false,
    };
    const rpc = vi.fn(async () => ({ data: water, error: null }));
    const client = { rpc } as unknown as SupabaseClient;

    const result = await addDiaryWater(client, USER_ID, "2026-08-29", 250, OPERATION_ID);

    expect(result).toEqual(water);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("log_nutrition_water", {
      p_operation_id: OPERATION_ID,
      p_log_date: "2026-08-29",
      p_amount_ml: 250,
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(USER_ID);
  });
});
