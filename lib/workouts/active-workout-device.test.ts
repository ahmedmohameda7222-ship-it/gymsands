import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  activeWorkoutDeviceStorageKey,
  getActiveWorkoutDeviceId,
  isValidActiveWorkoutDeviceId
} from "./active-workout-device";

function storage(initial: string | null = null) {
  const values = new Map<string, string>();
  if (initial !== null) values.set(activeWorkoutDeviceStorageKey, initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    values
  };
}

const fallbackCrypto = {
  getRandomValues<T extends ArrayBufferView | null>(array: T): T {
    if (array instanceof Uint8Array) array.forEach((_value, index) => { array[index] = index + 1; });
    return array;
  }
};

describe("active workout device identifier", () => {
  it("keeps a valid stored random UUID", () => {
    const existing = "11111111-1111-4111-8111-111111111111";
    expect(getActiveWorkoutDeviceId(storage(existing), fallbackCrypto)).toBe(existing);
  });

  it("regenerates malformed values with a cryptographically random UUID fallback", () => {
    const store = storage("fingerprint-like-value");
    const value = getActiveWorkoutDeviceId(store, fallbackCrypto);
    expect(isValidActiveWorkoutDeviceId(value)).toBe(true);
    expect(store.values.get(activeWorkoutDeviceStorageKey)).toBe(value);
  });

  it("uses crypto.randomUUID when available", () => {
    const value = getActiveWorkoutDeviceId(storage(), {
      randomUUID: () => "22222222-2222-4222-8222-222222222222",
      getRandomValues: fallbackCrypto.getRandomValues
    });
    expect(value).toBe("22222222-2222-4222-8222-222222222222");
  });

  it("contains no browser, hardware, network, or user-agent fingerprint input", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/workouts/active-workout-device.ts"), "utf8").toLowerCase();
    for (const forbidden of ["navigator", "useragent", "screen.", "hardwareconcurrency", "device memory", "ip address", "advertising"]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
