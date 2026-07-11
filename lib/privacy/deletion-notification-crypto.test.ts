import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptDeletionNotificationRecipient, encryptDeletionNotificationRecipient } from "./deletion-notification-crypto";

describe("deletion completion notification recipient encryption", () => {
  it("round-trips a normalized address without storing plaintext", () => {
    const key = randomBytes(32).toString("base64");
    const encrypted = encryptDeletionNotificationRecipient(" Member@Example.Test ", key);
    expect(encrypted).not.toContain("member@example.test");
    expect(decryptDeletionNotificationRecipient(encrypted, key)).toBe("member@example.test");
  });

  it("fails closed with the wrong key", () => {
    const encrypted = encryptDeletionNotificationRecipient("member@example.test", randomBytes(32).toString("base64"));
    expect(() => decryptDeletionNotificationRecipient(encrypted, randomBytes(32).toString("base64"))).toThrow();
  });
});
