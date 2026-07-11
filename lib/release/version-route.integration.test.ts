import { describe, expect, it, vi } from "vitest";

describe("GET /api/version", () => {
  it("returns deployment identity without cacheable or secret fields", async () => {
    vi.stubEnv("PLAIVRA_COMMIT_SHA", "60a204d5fc20fc396be1b1b47e748c42ebba6abf");
    vi.stubEnv("PLAIVRA_BUILD_TIMESTAMP", "2026-07-10T12:30:00.000Z");
    vi.stubEnv("PLAIVRA_RELEASE_ENVIRONMENT", "test");
    vi.stubEnv("PLAIVRA_SCHEMA_COMPATIBILITY_VERSION", "1");

    const { GET } = await import("@/app/api/version/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(body).toEqual({
      commitSha: "60a204d5fc20fc396be1b1b47e748c42ebba6abf",
      buildTimestamp: "2026-07-10T12:30:00.000Z",
      environment: "test",
      schemaCompatibilityVersion: "1"
    });
    expect(Object.keys(body).sort()).toEqual(
      ["buildTimestamp", "commitSha", "environment", "schemaCompatibilityVersion"].sort()
    );

    vi.unstubAllEnvs();
  });
});
