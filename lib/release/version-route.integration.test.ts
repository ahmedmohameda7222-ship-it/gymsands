import { beforeEach, describe, expect, it, vi } from "vitest";

const getDatabaseSchemaCompatibility = vi.fn();
vi.mock("@/lib/release/database-compatibility", () => ({ getDatabaseSchemaCompatibility }));

describe("GET /api/version", () => {
  beforeEach(() => {
    vi.resetModules();
    getDatabaseSchemaCompatibility.mockReset();
    vi.stubEnv("PLAIVRA_COMMIT_SHA", "60a204d5fc20fc396be1b1b47e748c42ebba6abf");
    vi.stubEnv("PLAIVRA_BUILD_TIMESTAMP", "2026-07-10T12:30:00.000Z");
    vi.stubEnv("PLAIVRA_RELEASE_ENVIRONMENT", "test");
    vi.stubEnv("PLAIVRA_SCHEMA_COMPATIBILITY_VERSION", "2");
  });

  it("returns 200 only when the database-owned marker matches the release requirement", async () => {
    getDatabaseSchemaCompatibility.mockResolvedValue({ available: true, version: "2", migrationVersion: "20260711013000" });
    const { GET } = await import("@/app/api/version/route");
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(body).toMatchObject({
      commitSha: "60a204d5fc20fc396be1b1b47e748c42ebba6abf",
      buildTimestamp: "2026-07-10T12:30:00.000Z",
      environment: "test",
      schemaCompatibilityVersion: "2",
      expectedSchemaCompatibilityVersion: "2",
      databaseSchemaCompatibilityVersion: "2",
      databaseMigrationVersion: "20260711013000",
      schemaCompatible: true
    });
  });

  it("fails closed when the database marker is missing or mismatched", async () => {
    getDatabaseSchemaCompatibility.mockResolvedValue({ available: false, version: "unavailable", migrationVersion: null });
    const { GET } = await import("@/app/api/version/route");
    const response = await GET();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ schemaCompatible: false, databaseSchemaCompatibilityVersion: "unavailable" });
  });
});
