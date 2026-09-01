import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearWorkoutHistoryOwnerCache,
  readWorkoutHistoryCache,
  WORKOUT_HISTORY_CACHE_DATABASE,
  WORKOUT_HISTORY_CACHE_RETENTION_MS,
  WORKOUT_HISTORY_CACHE_STORE,
  writeWorkoutHistoryCache,
} from "@/lib/workouts/history/offline-cache";
import type { WorkoutHistoryListResponse } from "@/types/workout-history";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const now = Date.parse("2026-08-01T12:00:00.000Z");

function response(): WorkoutHistoryListResponse {
  return {
    contractVersion: 1,
    period: {
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-09-01T00:00:00.000Z",
      timezone: "UTC",
    },
    summary: {
      eligibleWorkoutCount: 0,
      trustedDurationMinutes: null,
      completedSetCount: null,
      reliableVolume: null,
      verifiedRecordCount: null,
    },
    items: [],
    nextCursor: null,
    notices: [],
  };
}

async function corruptSchemaVersion(key: string): Promise<void> {
  const request = indexedDB.open(WORKOUT_HISTORY_CACHE_DATABASE, 1);
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const transaction = database.transaction(WORKOUT_HISTORY_CACHE_STORE, "readwrite");
  const store = transaction.objectStore(WORKOUT_HISTORY_CACHE_STORE);
  const getRequest = store.get(key);
  const entry = await new Promise<Record<string, unknown>>((resolve, reject) => {
    getRequest.onsuccess = () => resolve(getRequest.result as Record<string, unknown>);
    getRequest.onerror = () => reject(getRequest.error);
  });
  store.put({ ...entry, schemaVersion: 999 });
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

describe("Workout History offline cache", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: new IDBFactory(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a compatible offline hit without sharing mutable response state", async () => {
    const value = response();
    await writeWorkoutHistoryCache(ownerA, "list", "month=august", value, now);

    const hit = await readWorkoutHistoryCache<WorkoutHistoryListResponse>(
      ownerA,
      "list",
      "month=august",
      now + 1,
    );

    expect(hit).toEqual(value);
    expect(hit).not.toBe(value);
  });

  it("expires and removes responses after the bounded retention period", async () => {
    await writeWorkoutHistoryCache(ownerA, "list", "expired", response(), now);

    expect(await readWorkoutHistoryCache(
      ownerA,
      "list",
      "expired",
      now + WORKOUT_HISTORY_CACHE_RETENTION_MS,
    )).toBeNull();
    expect(await readWorkoutHistoryCache(ownerA, "list", "expired", now + 1))
      .toBeNull();
  });

  it("isolates owners and clears only the previous owner on user switch", async () => {
    await writeWorkoutHistoryCache(ownerA, "list", "same-request", response(), now);
    await writeWorkoutHistoryCache(ownerB, "list", "same-request", response(), now);

    expect(await readWorkoutHistoryCache(ownerB, "list", "same-request", now + 1))
      .not.toBeNull();
    expect(await readWorkoutHistoryCache(ownerA, "list", "same-request", now + 1))
      .not.toBeNull();

    await clearWorkoutHistoryOwnerCache(ownerA);

    expect(await readWorkoutHistoryCache(ownerA, "list", "same-request", now + 1))
      .toBeNull();
    expect(await readWorkoutHistoryCache(ownerB, "list", "same-request", now + 1))
      .not.toBeNull();
  });

  it("fails closed and evicts a schema-incompatible response", async () => {
    const requestKey = "schema-mismatch";
    await writeWorkoutHistoryCache(ownerA, "list", requestKey, response(), now);
    await corruptSchemaVersion(`${ownerA}:list:${requestKey}`);

    expect(await readWorkoutHistoryCache(ownerA, "list", requestKey, now + 1))
      .toBeNull();
    expect(await readWorkoutHistoryCache(ownerA, "list", requestKey, now + 1))
      .toBeNull();
  });
});