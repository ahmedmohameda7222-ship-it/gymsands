import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260904100000_food_catalog_ingestion_v2_authority.sql",
  "utf8",
).toLowerCase();
const verification = readFileSync(
  "supabase/verification/food-catalog-ingestion-v2-authority.sql",
  "utf8",
).toLowerCase();
const commandStore = readFileSync(
  "services/food-catalog/server/ingestion-store.ts",
  "utf8",
);
const supabaseStore = readFileSync(
  "services/food-catalog/server/supabase-ingestion-command-store.ts",
  "utf8",
);

describe("Food Catalog Plan 4 final independent-review regressions", () => {
  it("preserves simultaneous exact gram-weight and milliliter serving evidence", () => {
    const servingInsertCount = migration.match(
      /insert\s+into\s+public\.food_serving_options\b/g,
    )?.length ?? 0;

    expect(servingInsertCount).toBeGreaterThanOrEqual(2);
    expect(migration).toMatch(
      /gramweight[\s\S]*millilitervolume[\s\S]*insert\s+into\s+public\.food_serving_options[\s\S]*'ml'/i,
    );
    expect(verification).toContain("dual gram and milliliter serving evidence");
  });

  it("does not expose a generic operational-event writer", () => {
    expect(migration).not.toContain("food_catalog_ingestion_append_event_v2");
    expect(commandStore).not.toContain("appendEvent(");
    expect(supabaseStore).not.toContain("appendEvent:");
    expect(supabaseStore).not.toContain("food_catalog_ingestion_append_event_v2");
    expect(verification).toContain("generic append event unavailable");
  });
});
