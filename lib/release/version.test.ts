import { describe, expect, it } from "vitest";
import { getReleaseVersion } from "./version";

describe("release version metadata", () => {
  it("returns only normalized public build identifiers", () => {
    expect(
      getReleaseVersion({
        PLAIVRA_COMMIT_SHA: "60a204d5fc20fc396be1b1b47e748c42ebba6abf",
        PLAIVRA_BUILD_TIMESTAMP: "2026-07-10T12:30:00.000Z",
        PLAIVRA_RELEASE_ENVIRONMENT: "production",
        PLAIVRA_SCHEMA_COMPATIBILITY_VERSION: "1"
      })
    ).toEqual({
      commitSha: "60a204d5fc20fc396be1b1b47e748c42ebba6abf",
      buildTimestamp: "2026-07-10T12:30:00.000Z",
      environment: "production",
      schemaCompatibilityVersion: "1"
    });
  });

  it("rejects malformed or secret-shaped values instead of reflecting them", () => {
    expect(
      getReleaseVersion({
        PLAIVRA_COMMIT_SHA: "secret value",
        PLAIVRA_BUILD_TIMESTAMP: "not-a-date",
        PLAIVRA_RELEASE_ENVIRONMENT: "production;token=secret",
        PLAIVRA_SCHEMA_COMPATIBILITY_VERSION: "1 secret"
      })
    ).toEqual({
      commitSha: "unknown",
      buildTimestamp: "unknown",
      environment: "unknown",
      schemaCompatibilityVersion: "2"
    });
  });

  it("uses provider commit and environment fallbacks", () => {
    expect(
      getReleaseVersion({
        VERCEL_GIT_COMMIT_SHA: "abcdef1234567",
        PLAIVRA_BUILD_TIMESTAMP: "2026-07-10T12:30:00Z",
        VERCEL_ENV: "preview"
      })
    ).toEqual({
      commitSha: "abcdef1234567",
      buildTimestamp: "2026-07-10T12:30:00.000Z",
      environment: "preview",
      schemaCompatibilityVersion: "2"
    });
  });
});
