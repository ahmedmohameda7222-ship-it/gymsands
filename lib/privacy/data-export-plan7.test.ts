import { describe, expect, it } from "vitest";
import { PLAN7_PERSONAL_OVERRIDE_EXPORT_SPECS } from "./data-export";

describe("Plan 7 owner privacy export coverage", () => {
  it("exports the complete Plan 6 personal override authority for the authenticated owner", () => {
    expect(PLAN7_PERSONAL_OVERRIDE_EXPORT_SPECS).toEqual([
      {
        table: "food_personal_override_revisions",
        exportKey: "personal_food_override_revisions",
        orderColumns: ["food_id", "revision_number", "id"],
      },
      {
        table: "food_personal_overrides",
        exportKey: "personal_food_overrides",
        orderColumns: ["food_id"],
      },
      {
        table: "food_personal_override_operations",
        exportKey: "personal_food_override_operations",
        orderColumns: ["operation_id"],
      },
    ]);
  });

  it("does not classify service credentials as portable owner data", () => {
    const tables = PLAN7_PERSONAL_OVERRIDE_EXPORT_SPECS.map((entry) => entry.table);
    expect(tables).not.toContain("food_catalog_service_credentials");
    expect(tables).not.toContain("mcp_oauth_access_tokens");
  });
});
