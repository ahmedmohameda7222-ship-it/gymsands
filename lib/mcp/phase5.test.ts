import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { safeInternalRedirectPath } from "@/lib/auth/redirect";
import { getMcpActivityForUser, toPublicMcpActivity } from "@/lib/mcp/activity";
import { AI_PERMISSION_SECTION_DETAILS, FULL_ACCESS_WARNING, permissionGroupsForScopes } from "@/lib/mcp/permission-presentation";
import { getDefaultAiPermissionConfig } from "@/services/database/ai-permissions";

describe("Phase 5 consent and permission presentation", () => {
  it("keeps full access opt-in and defaults to no permissions", () => {
    const defaults = getDefaultAiPermissionConfig();
    expect(defaults.accessMode).toBe("custom");
    expect(Object.values(defaults.sections).every((permission) => !permission.read && !permission.write)).toBe(true);
    expect(FULL_ACCESS_WARNING).toContain("Broad access");
  });

  it("explains read, write, and sensitivity for every permission group", () => {
    expect(Object.keys(AI_PERMISSION_SECTION_DETAILS)).toHaveLength(8);
    for (const details of Object.values(AI_PERMISSION_SECTION_DETAILS)) {
      expect(details.label.length).toBeGreaterThan(0);
      expect(details.readDescription.length).toBeGreaterThan(15);
      expect(details.writeDescription.length).toBeGreaterThan(15);
      expect(typeof details.sensitive).toBe("boolean");
    }
    const groups = permissionGroupsForScopes("plaivra.workouts.read plaivra.progress.write");
    expect(groups.fullAccess).toBe(false);
    expect(groups.groups.find((group) => group.section === "workouts")?.canWrite).toBe(false);
    expect(groups.groups.find((group) => group.section === "progress")?.canWrite).toBe(true);
  });

  it("allows only safe internal post-login destinations", () => {
    expect(safeInternalRedirectPath("/oauth/authorize?state=abc")).toBe("/oauth/authorize?state=abc");
    expect(safeInternalRedirectPath("https://evil.example")).toBe("/dashboard");
    expect(safeInternalRedirectPath("//evil.example")).toBe("/dashboard");
    expect(safeInternalRedirectPath("/\\evil.example")).toBe("/dashboard");
  });
});

describe("Phase 5 user-visible MCP activity", () => {
  it("returns a redacted public activity shape", () => {
    const activity = toPublicMcpActivity({
      id: "11111111-1111-4111-8111-111111111111",
      tool_name: "add_body_measurement",
      status: "error",
      created_at: "2026-07-02T00:00:00.000Z",
      output_summary: { denied: true, reason_code: "missing_scope" },
      input: { token: "plaivra_mcp_at_secret", weight_kg: 99 },
      error_message: "private note"
    } as never);
    const serialized = JSON.stringify(activity);
    expect(activity.status).toBe("denied");
    expect(activity.category).toBe("write");
    expect(serialized).not.toContain("plaivra_mcp_at_secret");
    expect(serialized).not.toContain("99");
    expect(serialized).not.toContain("private note");
  });

  it("always constrains the activity query to the authenticated user", async () => {
    const eq = vi.fn(() => builder);
    const builder = {
      select: vi.fn(() => builder),
      eq,
      order: vi.fn(() => builder),
      limit: vi.fn(async () => ({ data: [], error: null }))
    };
    const supabase = { from: vi.fn(() => builder) } as unknown as SupabaseClient;
    await getMcpActivityForUser(supabase, "22222222-2222-4222-8222-222222222222");
    expect(eq).toHaveBeenCalledWith("user_id", "22222222-2222-4222-8222-222222222222");
    expect(builder.select).toHaveBeenCalledWith("id,tool_name,output_summary,status,created_at");
  });

  it("shows the Client ID and revoke effect without legacy setup or security-banner copy", () => {
    const source = readFileSync("components/settings/connected-apps.tsx", "utf8");
    expect(source).toContain("Plaivra OAuth client ID");
    expect(source).not.toContain("ChatGPT connection updated for security");
    expect(source).toContain("Existing ChatGPT access tokens will stop working");
    expect(source).not.toContain("data.token");
  });
});
