import { readFileSync } from "node:fs";
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
const OWNER_EXPORT_MIGRATION = "supabase/migrations/20260915170012_food_catalog_owner_correction_export.sql";

function emptyPersonalOverrideExport() {
  return {
    personal_food_override_revisions: [],
    personal_food_overrides: [],
    personal_food_override_operations: [],
  };
}

function createSupabaseFake(
  memberPayloadRows: Record<string, unknown>[],
  personalOverrideExport: Record<string, unknown> = emptyPersonalOverrideExport(),
) {
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
        if (name === "food_catalog_export_owner_personal_overrides_v1") {
          return { data: personalOverrideExport, error: null };
        }
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

  it("exports personal override authority only through the authenticated owner RPC", async () => {
    const overrideExport = {
      personal_food_override_revisions: [{ id: "revision-1", user_id: OWNER_ID }],
      personal_food_overrides: [{ food_id: "food-1", user_id: OWNER_ID }],
      personal_food_override_operations: [{ operation_id: "operation-1", user_id: OWNER_ID }],
    };
    const fake = createSupabaseFake([], overrideExport);

    const exported = await buildCurrentUserDataExport(
      fake.client as never,
      { id: OWNER_ID, email: "owner@example.test", created_at: "2026-01-01T00:00:00Z" },
    );
    const nutrition = exported.data.nutrition as Record<string, unknown>;

    expect(fake.rpcCalls).toContainEqual({
      name: "food_catalog_export_owner_personal_overrides_v1",
      args: undefined,
    });
    for (const spec of PLAN7_PERSONAL_OVERRIDE_EXPORT_SPECS) {
      expect(nutrition[spec.exportKey]).toEqual(overrideExport[spec.exportKey]);
      expect(fake.fromCalls).not.toContain(spec.table);
    }
  });

  it("fails closed when the owner personal override RPC fails", async () => {
    const fake = createSupabaseFake([]);
    fake.client.rpc = vi.fn(async (name: string) => {
      if (name === "food_catalog_export_owner_personal_overrides_v1") {
        return { data: null, error: new Error("owner override export denied") };
      }
      if (name === "food_catalog_export_owner_correction_report_payloads_v1") {
        return { data: [], error: null };
      }
      return { data: null, error: new Error(`Unexpected RPC ${name}`) };
    });

    await expect(buildCurrentUserDataExport(
      fake.client as never,
      { id: OWNER_ID, email: "owner@example.test", created_at: "2026-01-01T00:00:00Z" },
    )).rejects.toThrow(/personal override/i);
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

    expect(fake.rpcCalls).toContainEqual(
      { name: "food_catalog_export_owner_correction_report_payloads_v1", args: undefined },
    );
    expect((exported.data.nutrition as Record<string, unknown>).correction_report_member_payloads).toEqual([
      memberPayload,
    ]);
    expect(fake.fromCalls).not.toContain("food_catalog_correction_report_member_payloads");
    expect(fake.fromCalls).not.toContain("food_catalog_correction_reports");
    expect(fake.fromCalls).not.toContain("food_catalog_correction_cases");
  });

  it("returns correction member payloads as one scalar JSONB array so PostgREST row caps cannot truncate owner history", () => {
    const sql = readFileSync(OWNER_EXPORT_MIGRATION, "utf8").toLowerCase();
    const start = sql.indexOf("create or replace function public.food_catalog_export_owner_correction_report_payloads_v1()");
    expect(start).toBeGreaterThanOrEqual(0);
    const body = sql.slice(start);

    expect(body).toContain("returns jsonb");
    expect(body).toContain("jsonb_agg");
    expect(body).toContain("coalesce(");
    expect(body).toContain("'[]'::jsonb");
    expect(body).not.toContain("returns table");
  });

  it("fails closed when the owner correction member payload RPC fails", async () => {
    const fake = createSupabaseFake([]);
    fake.client.rpc = vi.fn(async (name: string) => {
      if (name === "food_catalog_export_owner_personal_overrides_v1") {
        return { data: emptyPersonalOverrideExport(), error: null };
      }
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

  it("defines an authenticated owner-scoped RPC for the locked personal override tables", () => {
    const sql = readFileSync(OWNER_EXPORT_MIGRATION, "utf8").toLowerCase();

    expect(sql).toContain("create or replace function public.food_catalog_export_owner_personal_overrides_v1()");
    expect(sql).toContain("returns jsonb");
    expect(sql).toContain("security definer");
    expect(sql).toContain("v_user uuid := auth.uid()");
    expect(sql).toContain("private.food_catalog_governance_require_active_member_account(v_user)");
    for (const table of PLAN7_PERSONAL_OVERRIDE_EXPORT_SPECS.map((entry) => entry.table)) {
      expect(sql).toContain(`from public.${table}`);
      expect(sql).toMatch(new RegExp(`from public\\.${table}[\\s\\S]*where [^;]*user_id = v_user`));
    }
    expect(sql).toContain("grant execute on function public.food_catalog_export_owner_personal_overrides_v1() to authenticated");
  });

  it("does not classify service credentials or global correction governance as portable owner data", () => {
    const tables = PLAN7_PERSONAL_OVERRIDE_EXPORT_SPECS.map((entry) => entry.table);
    expect(tables).not.toContain("food_catalog_service_credentials");
    expect(tables).not.toContain("mcp_oauth_access_tokens");
    expect(tables).not.toContain("food_catalog_correction_reports");
    expect(tables).not.toContain("food_catalog_correction_cases");
  });
});
