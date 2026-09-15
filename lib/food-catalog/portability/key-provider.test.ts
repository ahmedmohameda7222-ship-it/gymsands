import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  loadAes256ProtectedSegmentKey,
  type ProtectedSegmentKeyProvider,
} from "./key-provider";

function providerFor(key: Uint8Array): ProtectedSegmentKeyProvider {
  return { getKey: async () => key };
}

describe("Plan 7 protected segment key provider", () => {
  it("requires an external provider and a non-empty key identifier", async () => {
    await expect(loadAes256ProtectedSegmentKey(null, "plan7-test")).rejects.toThrow(/provider/i);
    await expect(loadAes256ProtectedSegmentKey(providerFor(randomBytes(32)), "")).rejects.toThrow(/key.*id/i);
  });

  it.each([0, 16, 31, 33, 64])("rejects malformed AES-256 key material of %i bytes", async (length) => {
    await expect(loadAes256ProtectedSegmentKey(providerFor(randomBytes(length)), "plan7-test"))
      .rejects.toThrow(/32|AES-256|key/i);
  });

  it("accepts exactly 32 bytes and does not require a repository/cloud KMS implementation", async () => {
    const key = randomBytes(32);
    const loaded = await loadAes256ProtectedSegmentKey(providerFor(key), "ephemeral-ci-key");
    expect(loaded).toHaveLength(32);
    expect(Buffer.from(loaded).equals(key)).toBe(true);
  });
});
