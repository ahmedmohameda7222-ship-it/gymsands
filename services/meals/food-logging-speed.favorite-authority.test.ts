import { beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "10000000-0000-4000-8000-000000000001";
const FOOD = "20000000-0000-4000-8000-000000000001";

const db = vi.hoisted(() => {
  type ErrorLike = { message: string; code?: string } | null;
  type MyFood = { id: string; user_id: string; deleted_at: string | null };
  const state = {
    legacy: new Set<string>(),
    catalog: new Set<string>(),
    myFoods: [] as MyFood[],
    failMyFoodRead: false,
    deleteCalls: [] as Array<{ table: string; key: string }>,
  };

  class Query {
    private operation: "select" | "delete" | "insert" | "upsert" = "select";
    private payload: Record<string, unknown> | null = null;
    private filters = new Map<string, unknown>();

    constructor(private table: string) {}

    select() {
      this.operation = "select";
      return this;
    }

    delete() {
      this.operation = "delete";
      return this;
    }

    insert(payload: Record<string, unknown>) {
      this.operation = "insert";
      this.payload = payload;
      return this;
    }

    upsert(payload: Record<string, unknown>) {
      this.operation = "upsert";
      this.payload = payload;
      return this;
    }

    eq(column: string, value: unknown) {
      this.filters.set(column, value);
      return this;
    }

    order() {
      return this;
    }

    is(column: string, value: unknown) {
      this.filters.set(column, value);
      return this;
    }

    maybeSingle() {
      return this;
    }

    then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: { data: unknown; error: ErrorLike }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
    }

    private execute(): { data: unknown; error: ErrorLike } {
      if (this.table === "user_food_items") {
        if (state.failMyFoodRead) return { data: null, error: { message: "collision lookup failed" } };
        const rows = state.myFoods.filter((row) => (
          (!this.filters.has("user_id") || row.user_id === this.filters.get("user_id"))
          && (!this.filters.has("id") || row.id === this.filters.get("id"))
          && (!this.filters.has("deleted_at") || row.deleted_at === this.filters.get("deleted_at"))
        ));
        return { data: rows, error: null };
      }

      const userId = String(this.filters.get("user_id") ?? this.payload?.user_id ?? "");
      if (userId && userId !== OWNER) return { data: [], error: null };

      if (this.table === "user_food_favorites") {
        if (this.operation === "select") {
          return { data: [...state.legacy].map((food_key) => ({ food_key })), error: null };
        }
        const key = String(this.filters.get("food_key") ?? this.payload?.food_key ?? "");
        if (this.operation === "delete") {
          state.deleteCalls.push({ table: this.table, key });
          state.legacy.delete(key);
        } else if (this.operation === "upsert") {
          state.legacy.add(key);
        }
        return { data: null, error: null };
      }

      if (this.table === "food_favorites") {
        if (this.operation === "select") {
          return { data: [...state.catalog].map((food_id) => ({ food_id })), error: null };
        }
        const key = String(this.filters.get("food_id") ?? this.payload?.food_id ?? "");
        if (this.operation === "delete") {
          state.deleteCalls.push({ table: this.table, key });
          state.catalog.delete(key);
        } else if (this.operation === "insert" || this.operation === "upsert") {
          state.catalog.add(key);
        }
        return { data: null, error: null };
      }

      throw new Error(`Unexpected favorite test table ${this.table}`);
    }
  }

  return {
    state,
    from: vi.fn((table: string) => new Query(table)),
  };
});

vi.mock("@/lib/supabase/client", () => ({
  supabase: { from: db.from },
}));

import {
  getFavoriteFoodKeysAsync,
  setFavoriteFoodAsync,
} from "@/services/meals/food-logging-speed";

describe("Plan 7 source-aware favorite authority", () => {
  beforeEach(() => {
    db.state.legacy.clear();
    db.state.catalog.clear();
    db.state.myFoods = [];
    db.state.failMyFoodRead = false;
    db.state.deleteCalls = [];
    db.from.mockClear();
  });

  it("preserves ambiguous same-owner My Food state when Catalog is unfavorited", async () => {
    db.state.catalog.add(FOOD);
    db.state.legacy.add(FOOD);
    db.state.myFoods.push({ id: FOOD, user_id: OWNER, deleted_at: null });

    await setFavoriteFoodAsync(OWNER, FOOD, false, { authority: "catalog" });

    expect(db.state.catalog.has(FOOD)).toBe(false);
    expect(db.state.legacy.has(FOOD)).toBe(true);
  });

  it("treats even a soft-deleted same-owner My Food collision as unsafe to clean", async () => {
    db.state.catalog.add(FOOD);
    db.state.legacy.add(FOOD);
    db.state.myFoods.push({ id: FOOD, user_id: OWNER, deleted_at: "2026-09-26T00:00:00Z" });

    await setFavoriteFoodAsync(OWNER, FOOD, false, { authority: "catalog" });

    expect(db.state.catalog.has(FOOD)).toBe(false);
    expect(db.state.legacy.has(FOOD)).toBe(true);
  });

  it("keeps canonical Catalog state independent when the colliding My Food is unfavorited", async () => {
    db.state.catalog.add(FOOD);
    db.state.legacy.add(FOOD);
    db.state.myFoods.push({ id: FOOD, user_id: OWNER, deleted_at: null });

    await setFavoriteFoodAsync(OWNER, FOOD, false, { authority: "legacy" });

    expect(db.state.catalog.has(FOOD)).toBe(true);
    expect(db.state.legacy.has(FOOD)).toBe(false);
  });

  it("clears an exact retained legacy Catalog compatibility row only when collision lookup proves it unambiguous", async () => {
    db.state.catalog.add(FOOD);
    db.state.legacy.add(FOOD);

    await setFavoriteFoodAsync(OWNER, FOOD, false, { authority: "catalog" });

    expect(db.state.catalog.has(FOOD)).toBe(false);
    expect(db.state.legacy.has(FOOD)).toBe(false);
  });

  it("preserves the legacy row when collision safety cannot be established", async () => {
    db.state.catalog.add(FOOD);
    db.state.legacy.add(FOOD);
    db.state.failMyFoodRead = true;

    await setFavoriteFoodAsync(OWNER, FOOD, false, { authority: "catalog" });

    expect(db.state.catalog.has(FOOD)).toBe(false);
    expect(db.state.legacy.has(FOOD)).toBe(true);
  });

  it("keeps combined favorite-key semantics for Eat repeat ranking", async () => {
    db.state.catalog.add(FOOD);
    db.state.legacy.add("banana|100 g");

    await expect(getFavoriteFoodKeysAsync(OWNER)).resolves.toEqual(
      expect.arrayContaining([FOOD, "banana|100 g"]),
    );
  });

  it("does not mutate owner favorite rows merely by reading them", async () => {
    db.state.catalog.add(FOOD);
    db.state.legacy.add(FOOD);

    await getFavoriteFoodKeysAsync(OWNER);

    expect(db.state.deleteCalls).toEqual([]);
  });
});
