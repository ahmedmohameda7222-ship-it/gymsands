import { describe, expect, it } from "vitest";
import { isMockAuthUserId, MOCK_AUTH_USER_ID } from "./mock-auth";

describe("mock authentication identity", () => {
  it("uses a UUID-compatible identity only outside production", () => {
    expect(isMockAuthUserId(MOCK_AUTH_USER_ID, "development")).toBe(true);
    expect(isMockAuthUserId(MOCK_AUTH_USER_ID, "test")).toBe(true);
    expect(isMockAuthUserId(MOCK_AUTH_USER_ID, "production")).toBe(false);
  });

  it("does not classify another valid UUID as the mock member", () => {
    expect(isMockAuthUserId("00000000-0000-4000-8000-000000000002", "development")).toBe(false);
  });
});
