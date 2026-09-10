import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createProtectedSegmentNonceReuseGuard,
  decryptProtectedSegment,
  encryptProtectedSegment,
} from "./protected-segments";
import type { ProtectedSegmentKeyProvider } from "./key-provider";

function providerFor(key: Uint8Array): ProtectedSegmentKeyProvider {
  return { getKey: async () => key };
}

describe("Plan 7 FULL_DR protected segments", () => {
  it("encrypts protected plaintext with AES-256-GCM and fresh random nonces", async () => {
    const key = randomBytes(32);
    const keyProvider = providerFor(key);
    const plaintext = Buffer.from('{"owner":"u1","note":"private-fixture"}\n', "utf8");

    const first = await encryptProtectedSegment({ segment: "food_personal_overrides", plaintext, keyId: "ephemeral-ci", keyProvider });
    const second = await encryptProtectedSegment({ segment: "food_personal_overrides", plaintext, keyId: "ephemeral-ci", keyProvider });

    expect(first.algorithm).toBe("AES-256-GCM");
    expect(first.plaintextSemanticSha256).toBe(second.plaintextSemanticSha256);
    expect(first.nonceBase64).not.toBe(second.nonceBase64);
    expect(first.ciphertextBase64).not.toBe(second.ciphertextBase64);
    expect(first.transportSha256).not.toBe(second.transportSha256);
    expect(await decryptProtectedSegment(first, keyProvider)).toEqual(plaintext);
    expect(await decryptProtectedSegment(second, keyProvider)).toEqual(plaintext);
  });

  it("round-trips an empty protected segment without treating zero-length ciphertext as missing", async () => {
    const keyProvider = providerFor(randomBytes(32));
    const plaintext = Buffer.alloc(0);
    const envelope = await encryptProtectedSegment({
      segment: "food_personal_override_operations",
      plaintext,
      keyId: "ephemeral-ci",
      keyProvider,
    });

    expect(envelope.ciphertextBase64).toBe("");
    expect(await decryptProtectedSegment(envelope, keyProvider)).toEqual(plaintext);
  });

  it("never includes plaintext or key material in the protected envelope", async () => {
    const key = randomBytes(32);
    const secret = "do-not-publish-protected-plaintext";
    const envelope = await encryptProtectedSegment({
      segment: "food_catalog_governance_principals",
      plaintext: Buffer.from(secret, "utf8"),
      keyId: "external-key-reference",
      keyProvider: providerFor(key),
    });
    const serialized = JSON.stringify(envelope);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain(key.toString("base64"));
    expect(envelope).not.toHaveProperty("plaintext");
    expect(envelope.keyId).toBe("external-key-reference");
  });

  it("fails closed when the key provider is missing or malformed", async () => {
    await expect(encryptProtectedSegment({
      segment: "protected",
      plaintext: Buffer.from("x"),
      keyId: "missing",
      keyProvider: null,
    })).rejects.toThrow(/provider/i);

    await expect(encryptProtectedSegment({
      segment: "protected",
      plaintext: Buffer.from("x"),
      keyId: "bad",
      keyProvider: providerFor(randomBytes(16)),
    })).rejects.toThrow(/32|AES-256|key/i);
  });

  it("rejects nonce reuse for the same key identifier", () => {
    const guard = createProtectedSegmentNonceReuseGuard();
    const nonce = randomBytes(12);
    expect(guard.claim("key-a", nonce)).toBe(true);
    expect(() => guard.claim("key-a", nonce)).toThrow(/nonce.*reuse|reuse.*nonce/i);
    expect(guard.claim("key-b", nonce)).toBe(true);
  });

  it("detects ciphertext/transport tampering before returning protected plaintext", async () => {
    const keyProvider = providerFor(randomBytes(32));
    const envelope = await encryptProtectedSegment({
      segment: "food_personal_override_operations",
      plaintext: Buffer.from("owner-history", "utf8"),
      keyId: "ephemeral-ci",
      keyProvider,
    });
    const tampered = { ...envelope, ciphertextBase64: Buffer.from("tampered").toString("base64") };
    await expect(decryptProtectedSegment(tampered, keyProvider)).rejects.toThrow(/transport|integrity|auth|decrypt/i);
  });
});
