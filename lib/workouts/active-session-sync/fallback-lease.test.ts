import { describe, expect, it } from "vitest";
import { acquireActiveWorkoutFallbackLease } from "./fallback-lease";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

const testClock = {
  now: () => 1_000,
  token: () => "fence-a",
  sleep: async () => undefined,
};

describe("AW-9 fenced localStorage fallback lease", () => {
  it("refuses a live lease owned by another tab", async () => {
    const storage = memoryStorage();
    storage.setItem("lane", JSON.stringify({
      ownerId: "tab-a",
      fenceToken: "fence-a",
      expiresAt: 2_000,
    }));

    const lease = await acquireActiveWorkoutFallbackLease({
      storage,
      key: "lane",
      ownerId: "tab-b",
      leaseMs: 1_000,
      clock: {
        ...testClock,
        token: () => "fence-b",
      },
    });

    expect(lease).toBeNull();
    expect(JSON.parse(storage.getItem("lane") ?? "null")).toMatchObject({
      ownerId: "tab-a",
      fenceToken: "fence-a",
    });
  });

  it("loses acquisition when another contender overwrites during stabilization", async () => {
    const storage = memoryStorage();
    const lease = await acquireActiveWorkoutFallbackLease({
      storage,
      key: "lane",
      ownerId: "tab-a",
      leaseMs: 1_000,
      clock: {
        ...testClock,
        sleep: async () => {
          storage.setItem("lane", JSON.stringify({
            ownerId: "tab-b",
            fenceToken: "fence-b",
            expiresAt: 2_000,
          }));
        },
      },
    });

    expect(lease).toBeNull();
  });

  it("fails closed when browser storage access is denied", async () => {
    const deniedStorage = {
      getItem() {
        throw new DOMException("Blocked", "SecurityError");
      },
      setItem() {
        throw new DOMException("Blocked", "SecurityError");
      },
      removeItem() {
        throw new DOMException("Blocked", "SecurityError");
      },
    };

    await expect(acquireActiveWorkoutFallbackLease({
      storage: deniedStorage,
      key: "lane",
      ownerId: "tab-a",
      leaseMs: 1_000,
      clock: testClock,
    })).resolves.toBeNull();
  });

  it("never renews or releases a lease after its fence token is lost", async () => {
    let now = 1_000;
    const storage = memoryStorage();
    const lease = await acquireActiveWorkoutFallbackLease({
      storage,
      key: "lane",
      ownerId: "tab-a",
      leaseMs: 1_000,
      clock: {
        now: () => now,
        token: () => "fence-a",
        sleep: async () => undefined,
      },
    });
    expect(lease).not.toBeNull();

    now = 1_100;
    storage.setItem("lane", JSON.stringify({
      ownerId: "tab-b",
      fenceToken: "fence-b",
      expiresAt: 2_100,
    }));

    expect(lease?.renew()).toBe(false);
    lease?.release();
    expect(JSON.parse(storage.getItem("lane") ?? "null")).toMatchObject({
      ownerId: "tab-b",
      fenceToken: "fence-b",
    });
  });

  it("renews and releases only the exact fenced lease", async () => {
    let now = 1_000;
    const storage = memoryStorage();
    const lease = await acquireActiveWorkoutFallbackLease({
      storage,
      key: "lane",
      ownerId: "tab-a",
      leaseMs: 1_000,
      clock: {
        now: () => now,
        token: () => "fence-a",
        sleep: async () => undefined,
      },
    });
    expect(lease?.owns()).toBe(true);

    now = 1_500;
    expect(lease?.renew()).toBe(true);
    expect(JSON.parse(storage.getItem("lane") ?? "null")).toMatchObject({
      ownerId: "tab-a",
      fenceToken: "fence-a",
      expiresAt: 2_500,
    });

    lease?.release();
    expect(storage.getItem("lane")).toBeNull();
  });
});
