import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/release/version", () => ({
  getReleaseVersion: () => ({ commitSha: "60a204d5fc20fc396be1b1b47e748c42ebba6abf", buildTimestamp: "2026-07-11T00:00:00.000Z", environment: "test", schemaCompatibilityVersion: "1" })
}));

import { GET } from "@/app/api/health/route";

describe("public health endpoint", () => {
  it("reports safe release compatibility fields without configuration or secrets", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ status: "ok", release: { environment: "test", schemaCompatibilityVersion: "1" } });
    expect(JSON.stringify(body)).not.toMatch(/service_role|secret|token|supabaseUrl/i);
  });
});
