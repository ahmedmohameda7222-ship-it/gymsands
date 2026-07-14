import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createActivityCatalogProvider } from "./factory";
import { LegacyActivityCatalogProvider } from "./legacy-provider";

function catalogClient() {
  const tables: string[] = [];
  const from = vi.fn((table: string) => {
    tables.push(table);
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      limit: vi.fn(async () => ({ data: [], error: null }))
    };
    return builder;
  });
  return { client: { from } as unknown as SupabaseClient, tables };
}

describe("LegacyActivityCatalogProvider", () => {
  it("queries only the three approved global legacy sources", async () => {
    const database = catalogClient();
    const provider = new LegacyActivityCatalogProvider(database.client);
    const response = await provider.getFilters();
    expect(database.tables).toEqual(["workouts", "exercise_videos", "exercises"]);
    expect(response.meta.source).toBe("legacy");
    expect(database.tables).not.toContain("profiles");
    expect(database.tables.every((table) => !table.startsWith("user_"))).toBe(true);
  });

  it("uses deterministic local compatibility data when the database is unavailable", async () => {
    const provider = new LegacyActivityCatalogProvider(null);
    const response = await provider.searchActivities({ query: "Barbell Back Squat", limit: 10 });
    expect(response.data[0]).toMatchObject({ id: "workout-barbell-back-squat", name: "Barbell Back Squat" });
    expect(response.meta).toMatchObject({ source: "legacy", degraded: true });
    expect(response.pagination?.returned).toBeGreaterThanOrEqual(1);
  });

  it("resolves legacy identifiers and bounds deterministic alternatives", async () => {
    const provider = new LegacyActivityCatalogProvider(null);
    const detail = await provider.getActivity("workout-barbell-back-squat");
    expect(detail.data.id).toBe("workout-barbell-back-squat");
    const alternatives = await provider.getActivityAlternatives("workout-barbell-back-squat", { limit: 2 });
    expect(alternatives.data.length).toBeLessThanOrEqual(2);
    await expect(provider.getActivityAlternatives("workout-barbell-back-squat", { limit: 21 }))
      .rejects.toMatchObject({ code: "invalid_request" });
  });
});

describe("createActivityCatalogProvider", () => {
  it("keeps legacy mode buildable without an external key", async () => {
    const provider = createActivityCatalogProvider({ supabase: null, mode: "legacy", apiKey: "" });
    await expect(provider.searchActivities({ query: "squat", limit: 1 })).resolves.toMatchObject({ meta: { source: "legacy" } });
  });

  it("fails closed when an external mode has no server key", () => {
    expect(() => createActivityCatalogProvider({
      supabase: null,
      mode: "external",
      baseUrl: "https://catalog.example.test",
      apiKey: ""
    })).toThrow(/not configured/i);
  });
});
