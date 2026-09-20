import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  rpc: vi.fn(),
  getSession: vi.fn(async () => ({ data: { session: { access_token: "test-token" } }, error: null })),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: { rpc: db.rpc, auth: { getSession: db.getSession } },
}));

import { getFoodCategories } from "@/services/database/nutrition";

function candidate(index: number, category: string) {
  return {
    id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    source: "catalog",
    name: `Food ${index}`,
    brand: null,
    category,
    cuisine: null,
    servingLabel: "100 g",
    verified: true,
    locale: "en",
    nutrition: {
      calories: 100,
      protein_g: 10,
      carbs_g: 10,
      fat_g: 2,
      saturated_fat_g: null,
      fiber_g: null,
      sugars_g: null,
      sodium_mg: null,
      basis_amount: 100,
      basis_unit: "g",
    },
  };
}

describe("Plan 7 browser category facet enumeration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not lose a category that exists only after the first 80 current Catalog search rows", async () => {
    const pages = [
      Array.from({ length: 20 }, (_, index) => candidate(index + 1, "common")),
      Array.from({ length: 20 }, (_, index) => candidate(index + 21, "common")),
      Array.from({ length: 20 }, (_, index) => candidate(index + 41, "common")),
      Array.from({ length: 20 }, (_, index) => candidate(index + 61, "common")),
      [candidate(81, "late-category")],
    ];
    db.rpc.mockImplementation(async (_name: string, args: Record<string, unknown>) => {
      const cursor = typeof args.p_cursor === "string" ? Number(args.p_cursor) : 0;
      const items = pages[cursor] ?? [];
      return {
        data: {
          items,
          nextCursor: cursor + 1 < pages.length ? String(cursor + 1) : null,
        },
        error: null,
      };
    });

    await expect(getFoodCategories()).resolves.toEqual(["common", "late-category"]);
    expect(db.rpc).toHaveBeenCalledTimes(5);
  });
});
