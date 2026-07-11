import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function encryptionKey(encodedKey: string) {
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) throw new Error("privacy_notification_key_invalid");
  return key;
}

export function encryptDeletionNotificationRecipient(email: string, encodedKey: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized || normalized.length > 320) throw new Error("privacy_notification_recipient_invalid");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(encodedKey), iv);
  const encrypted = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptDeletionNotificationRecipient(ciphertext: string, encodedKey: string) {
  const [version, ivText, tagText, payloadText] = ciphertext.split(".");
  if (version !== "v1" || !ivText || !tagText || !payloadText) throw new Error("privacy_notification_ciphertext_invalid");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(encodedKey), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(payloadText, "base64url")),
    decipher.final()
  ]).toString("utf8");
}
