import { describe, expect, it, vi } from "vitest";

vi.mock("./data-export-legacy", () => ({
  buildCurrentUserDataExport: vi.fn(async () => ({
    data: {
      workouts: {},
      nutrition: {},
    },
    warnings: [],
  })),
}));

import {
  buildCurrentUserDataExport,
  PLAN7_PERSONAL_OVERRIDE_EXPORT_SPECS,
} from "./data-export";

const OWNER_ID = "81000000-0000-4000-8000-000000000001";

function createSupabaseFake(memberPayloadRows: Record<string, unknown>[]) {
  const fromCalls: string[] = [];
  const rpcCalls: Array<{ name: string; args: unknown }> = [];

  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn(async () => ({ data: [], error: null })),
  };

  return {
    client: {
      from: vi.fn((table: string) => {
        fromCalls.push(table);
        return query;
      }),
      rpc: vi.fn(async (name: string, args?: unknown) => {
        rpcCalls.push({ name, args });
        if (name === "food_catalog_export_owner_correction_report_payloads_v1") {
          return { data: memberPayloadRows, error: null };
        }
        return { data: null, error: new Error(`Unexpected RPC ${name}`) };
      }),
    },
    fromCalls,
    rpcCalls,
  };
}

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

  it("exports reporter-owned correction member payloads only through the authenticated RPC", async () => {
    const memberPayload = {
      report_id: "82000000-0000-4000-8000-000000000001",
      reporter_user_id: OWNER_ID,
      claim_text: "Owner-authored claim text",
      description: "Owner-authored description",
      evidence: { source: "owner", nested: { preserved: true } },
      created_at: "2026-09-15T20:45:00.123456Z",
    };
    const fake = createSupabaseFake([memberPayload]);

    const exported = await buildCurrentUserDataExport(
      fake.client as never,
      { id: OWNER_ID, email: "owner@example.test", created_at: "2026-01-01T00:00:00Z" },
    );

    expect(fake.rpcCalls).toEqual([
      { name: "food_catalog_export_owner_correction_report_payloads_v1", args: undefined },
    ]);
    expect((exported.data.nutrition as Record<string, unknown>).correction_report_member_payloads).toEqual([
      memberPayload,
    ]);
    expect(fake.fromCalls).not.toContain("food_catalog_correction_report_member_payloads");
    expect(fake.fromCalls).not.toContain("food_catalog_correction_reports");
    expect(fake.fromCalls).not.toContain("food_catalog_correction_cases");
  });

  it("fails closed when the owner correction member payload RPC fails", async () => {
    const fake = createSupabaseFake([]);
    fake.client.rpc = vi.fn(async (name: string) => {
      if (name === "food_catalog_export_owner_correction_report_payloads_v1") {
        return { data: null, error: new Error("owner export denied") };
      }
      return { data: null, error: new Error(`Unexpected RPC ${name}`) };
    });

    await expect(buildCurrentUserDataExport(
      fake.client as never,
      { id: OWNER_ID, email: "owner@example.test", created_at: "2026-01-01T00:00:00Z" },
    )).rejects.toThrow(/correction report member payload/i);
  });

  it("does not classify service credentials or global correction governance as portable owner data", () => {
    const tables = PLAN7_PERSONAL_OVERRIDE_EXPORT_SPECS.map((entry) => entry.table);
    expect(tables).not.toContain("food_catalog_service_credentials");
    expect(tables).not.toContain("mcp_oauth_access_tokens");
    expect(tables).not.toContain("food_catalog_correction_reports");
    expect(tables).not.toContain("food_catalog_correction_cases");
  });
});
