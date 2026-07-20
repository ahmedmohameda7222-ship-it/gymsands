"use client";

export const activeWorkoutDeviceStorageKey = "plaivra.active-workout.device.v1";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidActiveWorkoutDeviceId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 128 && uuidPattern.test(value);
}

function randomUuid(cryptoSource: Pick<Crypto, "getRandomValues"> & Partial<Pick<Crypto, "randomUUID">>) {
  if (typeof cryptoSource.randomUUID === "function") return cryptoSource.randomUUID();
  const bytes = new Uint8Array(16);
  cryptoSource.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getActiveWorkoutDeviceId(
  storage: Pick<Storage, "getItem" | "setItem"> | null = typeof window === "undefined" ? null : window.localStorage,
  cryptoSource: (Pick<Crypto, "getRandomValues"> & Partial<Pick<Crypto, "randomUUID">>) | null = typeof crypto === "undefined" ? null : crypto
) {
  if (!storage || !cryptoSource) return null;
  const existing = storage.getItem(activeWorkoutDeviceStorageKey);
  if (isValidActiveWorkoutDeviceId(existing)) return existing;
  const generated = randomUuid(cryptoSource);
  storage.setItem(activeWorkoutDeviceStorageKey, generated);
  return generated;
}
