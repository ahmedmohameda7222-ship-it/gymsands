import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { buildVersionResponse, getDatabaseSchemaCompatibility, getReleaseVersion } = vi.hoisted(() => ({
  buildVersionResponse: vi.fn(),
  getDatabaseSchemaCompatibility: vi.fn(),
  getReleaseVersion: vi.fn(),
}));

vi.mock("@/lib/release/database-compatibility", () => ({ getDatabaseSchemaCompatibility }));
vi.mock("@/lib/release/version", () => ({ getReleaseVersion }));
vi.mock("@/lib/release/version-response", () => ({ buildVersionResponse }));

import { GET } from "@/app/api/version/route";

describe("version compute-region diagnostic", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL_REGION", "fra1");
    getReleaseVersion.mockReturnValue({ commitSha: "a".repeat(40) });
    getDatabaseSchemaCompatibility.mockResolvedValue({ available: true });
    buildVersionResponse.mockReturnValue({ status: 200, body: { releaseReady: true } });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("exposes the actual Vercel function region on every readiness response", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("x-plaivra-compute-region")).toBe("fra1");
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
  });
});
