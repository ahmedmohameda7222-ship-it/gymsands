import type {
  WorkoutHistoryListResponse,
  WorkoutHistorySessionDetailResponse,
} from "@/types/workout-history";

export const WORKOUT_HISTORY_CACHE_DATABASE = "plaivra-workout-history-cache-v1";
export const WORKOUT_HISTORY_CACHE_STORE = "history-responses";
export const WORKOUT_HISTORY_CACHE_VERSION = 1;
export const WORKOUT_HISTORY_CACHE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;
const MAX_CACHE_BYTES = 5 * 1024 * 1024;

type CacheKind = "list" | "detail";
type CachedResponse = WorkoutHistoryListResponse | WorkoutHistorySessionDetailResponse;

type WorkoutHistoryCacheEntry = {
  key: string;
  ownerId: string;
  kind: CacheKind;
  requestKey: string;
  response: CachedResponse;
  storedAt: number;
  expiresAt: number;
  byteSize: number;
  schemaVersion: typeof WORKOUT_HISTORY_CACHE_VERSION;
};

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function requestPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("History cache request failed."));
  });
}

function transactionPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("History cache transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("History cache transaction was aborted."));
  });
}

async function openDatabase(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return null;
  const request = indexedDB.open(WORKOUT_HISTORY_CACHE_DATABASE, WORKOUT_HISTORY_CACHE_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (database.objectStoreNames.contains(WORKOUT_HISTORY_CACHE_STORE)) {
      database.deleteObjectStore(WORKOUT_HISTORY_CACHE_STORE);
    }
    const store = database.createObjectStore(WORKOUT_HISTORY_CACHE_STORE, { keyPath: "key" });
    store.createIndex("ownerId", "ownerId", { unique: false });
    store.createIndex("storedAt", "storedAt", { unique: false });
  };
  return requestPromise(request);
}

function entryKey(ownerId: string, kind: CacheKind, requestKey: string): string {
  return `${ownerId}:${kind}:${requestKey}`;
}

async function trimStore(store: IDBObjectStore): Promise<void> {
  const entries = await requestPromise(store.getAll()) as WorkoutHistoryCacheEntry[];
  entries.sort((left, right) => right.storedAt - left.storedAt);
  let bytes = 0;
  entries.forEach((entry, index) => {
    bytes += entry.byteSize;
    if (index >= MAX_CACHE_ENTRIES || bytes > MAX_CACHE_BYTES || entry.expiresAt <= Date.now()) {
      store.delete(entry.key);
    }
  });
}

export async function writeWorkoutHistoryCache(
  ownerId: string,
  kind: CacheKind,
  requestKey: string,
  response: CachedResponse,
  now = Date.now(),
): Promise<void> {
  if (!ownerId || response.contractVersion !== 1) return;
  const database = await openDatabase();
  if (!database) return;
  try {
    const serialized = JSON.stringify(response);
    const transaction = database.transaction(WORKOUT_HISTORY_CACHE_STORE, "readwrite");
    const store = transaction.objectStore(WORKOUT_HISTORY_CACHE_STORE);
    store.put({
      key: entryKey(ownerId, kind, requestKey),
      ownerId,
      kind,
      requestKey,
      response,
      storedAt: now,
      expiresAt: now + WORKOUT_HISTORY_CACHE_RETENTION_MS,
      byteSize: new TextEncoder().encode(serialized).byteLength,
      schemaVersion: WORKOUT_HISTORY_CACHE_VERSION,
    } satisfies WorkoutHistoryCacheEntry);
    await trimStore(store);
    await transactionPromise(transaction);
  } finally {
    database.close();
  }
}

export async function readWorkoutHistoryCache<T extends CachedResponse>(
  ownerId: string,
  kind: CacheKind,
  requestKey: string,
  now = Date.now(),
): Promise<T | null> {
  const database = await openDatabase();
  if (!database) return null;
  try {
    const transaction = database.transaction(WORKOUT_HISTORY_CACHE_STORE, "readwrite");
    const store = transaction.objectStore(WORKOUT_HISTORY_CACHE_STORE);
    const entry = await requestPromise(store.get(entryKey(ownerId, kind, requestKey))) as WorkoutHistoryCacheEntry | undefined;
    if (!entry || entry.ownerId !== ownerId || entry.schemaVersion !== WORKOUT_HISTORY_CACHE_VERSION || entry.expiresAt <= now) {
      if (entry) store.delete(entry.key);
      await transactionPromise(transaction);
      return null;
    }
    await transactionPromise(transaction);
    return structuredClone(entry.response) as T;
  } finally {
    database.close();
  }
}

export async function clearWorkoutHistoryOwnerCache(ownerId: string): Promise<void> {
  if (!ownerId) return;
  const database = await openDatabase();
  if (!database) return;
  try {
    const transaction = database.transaction(WORKOUT_HISTORY_CACHE_STORE, "readwrite");
    const store = transaction.objectStore(WORKOUT_HISTORY_CACHE_STORE);
    const index = store.index("ownerId");
    const keys = await requestPromise(index.getAllKeys(ownerId));
    keys.forEach((key) => store.delete(key));
    await transactionPromise(transaction);
  } finally {
    database.close();
  }
}
