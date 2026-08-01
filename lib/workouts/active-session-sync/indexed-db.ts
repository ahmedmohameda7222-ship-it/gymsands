import {
  ACTIVE_WORKOUT_INDEXED_DB_NAME,
  ACTIVE_WORKOUT_OFFLINE_RETENTION_MS,
  ACTIVE_WORKOUT_SYNC_SCHEMA_VERSION,
  type ActiveWorkoutOperation,
  type ActiveWorkoutSessionCache,
} from "./contracts";

const SESSION_STORE = "session_snapshots";
const OPERATION_STORE = "operations";

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

function onlineOrNonBrowser() {
  return typeof navigator === "undefined" || navigator.onLine;
}

export function activeWorkoutSessionCacheKey(
  userId: string,
  workoutSessionId: string,
) {
  return `${userId}:${workoutSessionId}`;
}

export async function openActiveWorkoutDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return null;
  const request = indexedDB.open(ACTIVE_WORKOUT_INDEXED_DB_NAME, 1);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(SESSION_STORE)) {
      const sessions = database.createObjectStore(SESSION_STORE, {
        keyPath: "key",
      });
      sessions.createIndex("by_user", "userId");
      sessions.createIndex("by_expiry", "expiresAt");
    }
    if (!database.objectStoreNames.contains(OPERATION_STORE)) {
      const operations = database.createObjectStore(OPERATION_STORE, {
        keyPath: "id",
      });
      operations.createIndex(
        "by_session_sequence",
        ["userId", "workoutSessionId", "sequence"],
        { unique: true },
      );
      operations.createIndex("by_user", "userId");
      operations.createIndex("by_state", "state");
    }
  };
  return requestResult(request);
}

export async function readActiveWorkoutSessionCache(
  userId: string,
  workoutSessionId: string,
) {
  // The durable snapshot is an offline recovery authority, not an online
  // hydration dependency. Keeping IndexedDB off the connected critical path
  // prevents local disk latency from delaying canonical server reads.
  if (onlineOrNonBrowser()) return null;
  const database = await openActiveWorkoutDatabase();
  if (!database) return null;
  const transaction = database.transaction(SESSION_STORE, "readonly");
  const value = await requestResult(
    transaction
      .objectStore(SESSION_STORE)
      .get(activeWorkoutSessionCacheKey(userId, workoutSessionId)),
  );
  await transactionDone(transaction);
  database.close();
  const cache = value as ActiveWorkoutSessionCache | undefined;
  if (!cache || Date.parse(cache.expiresAt) <= Date.now()) return null;
  return cache;
}

export async function writeActiveWorkoutSessionCache(
  cache: Omit<ActiveWorkoutSessionCache, "key" | "updatedAt" | "expiresAt">,
) {
  const database = await openActiveWorkoutDatabase();
  if (!database) return;
  const now = new Date();
  const value: ActiveWorkoutSessionCache = {
    ...cache,
    key: activeWorkoutSessionCacheKey(cache.userId, cache.workoutSessionId),
    updatedAt: now.toISOString(),
    expiresAt: new Date(
      now.getTime() + ACTIVE_WORKOUT_OFFLINE_RETENTION_MS,
    ).toISOString(),
  };
  const transaction = database.transaction(SESSION_STORE, "readwrite");
  transaction.objectStore(SESSION_STORE).put(value);
  await transactionDone(transaction);
  database.close();
}

export async function addActiveWorkoutOperation(
  operation: Omit<
    ActiveWorkoutOperation,
    "schemaVersion" | "sequence" | "state" | "attemptCount" | "nextRetryAt"
      | "lastErrorCode" | "createdAt" | "updatedAt"
  >,
) {
  const database = await openActiveWorkoutDatabase();
  if (!database) throw new Error("IndexedDB is unavailable.");
  const transaction = database.transaction(OPERATION_STORE, "readwrite");
  const store = transaction.objectStore(OPERATION_STORE);
  const index = store.index("by_session_sequence");
  const range = IDBKeyRange.bound(
    [operation.userId, operation.workoutSessionId, 0],
    [operation.userId, operation.workoutSessionId, Number.MAX_SAFE_INTEGER],
  );
  const latest = await requestResult(index.openCursor(range, "prev"));
  const sequence =
    ((latest?.value as ActiveWorkoutOperation | undefined)?.sequence ?? 0) + 1;
  const now = new Date().toISOString();
  const value: ActiveWorkoutOperation = {
    ...operation,
    schemaVersion: ACTIVE_WORKOUT_SYNC_SCHEMA_VERSION,
    sequence,
    state: "pending",
    attemptCount: 0,
    nextRetryAt: null,
    lastErrorCode: null,
    createdAt: now,
    updatedAt: now,
  };
  store.add(value);
  await transactionDone(transaction);
  database.close();
  return value;
}

export async function listActiveWorkoutOperations(
  userId: string,
  workoutSessionId: string,
) {
  const database = await openActiveWorkoutDatabase();
  if (!database) return [];
  const transaction = database.transaction(OPERATION_STORE, "readonly");
  const range = IDBKeyRange.bound(
    [userId, workoutSessionId, 0],
    [userId, workoutSessionId, Number.MAX_SAFE_INTEGER],
  );
  const all = (await requestResult(
    transaction
      .objectStore(OPERATION_STORE)
      .index("by_session_sequence")
      .getAll(range),
  )) as ActiveWorkoutOperation[];
  await transactionDone(transaction);
  database.close();
  return all
    .filter(
      (item) =>
        item.userId === userId &&
        item.workoutSessionId === workoutSessionId &&
        item.state !== "applied"
        && item.state !== "discarded",
    )
    .sort((left, right) => left.sequence - right.sequence);
}

export async function updateActiveWorkoutOperation(
  operation: ActiveWorkoutOperation,
  patch: Partial<ActiveWorkoutOperation>,
) {
  const database = await openActiveWorkoutDatabase();
  if (!database) return;
  const transaction = database.transaction(OPERATION_STORE, "readwrite");
  transaction.objectStore(OPERATION_STORE).put({
    ...operation,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
  await transactionDone(transaction);
  database.close();
}

export async function clearActiveWorkoutSessionData(
  userId: string,
  workoutSessionId: string,
) {
  const database = await openActiveWorkoutDatabase();
  if (!database) return;
  const transaction = database.transaction(
    [SESSION_STORE, OPERATION_STORE],
    "readwrite",
  );
  transaction
    .objectStore(SESSION_STORE)
    .delete(activeWorkoutSessionCacheKey(userId, workoutSessionId));
  const range = IDBKeyRange.bound(
    [userId, workoutSessionId, 0],
    [userId, workoutSessionId, Number.MAX_SAFE_INTEGER],
  );
  const operations = (await requestResult(
    transaction
      .objectStore(OPERATION_STORE)
      .index("by_session_sequence")
      .getAll(range),
  )) as ActiveWorkoutOperation[];
  for (const operation of operations) {
    if (
      operation.userId === userId &&
      operation.workoutSessionId === workoutSessionId
    )
      transaction.objectStore(OPERATION_STORE).delete(operation.id);
  }
  await transactionDone(transaction);
  database.close();
}

export async function clearActiveWorkoutUserData(userId: string) {
  const database = await openActiveWorkoutDatabase();
  if (!database) return;
  const transaction = database.transaction(
    [SESSION_STORE, OPERATION_STORE],
    "readwrite",
  );
  const sessions = (await requestResult(
    transaction.objectStore(SESSION_STORE).getAll(),
  )) as ActiveWorkoutSessionCache[];
  const operations = (await requestResult(
    transaction.objectStore(OPERATION_STORE).getAll(),
  )) as ActiveWorkoutOperation[];
  for (const session of sessions)
    if (session.userId === userId)
      transaction.objectStore(SESSION_STORE).delete(session.key);
  for (const operation of operations)
    if (operation.userId === userId)
      transaction.objectStore(OPERATION_STORE).delete(operation.id);
  await transactionDone(transaction);
  database.close();
}

async function clearStaleActiveWorkoutDataNow(now: number) {
  const database = await openActiveWorkoutDatabase();
  if (!database) return;
  const transaction = database.transaction(
    [SESSION_STORE, OPERATION_STORE],
    "readwrite",
  );
  const sessionStore = transaction.objectStore(SESSION_STORE);
  const operationStore = transaction.objectStore(OPERATION_STORE);
  const expiredSessions = (await requestResult(
    sessionStore
      .index("by_expiry")
      .getAll(IDBKeyRange.upperBound(new Date(now).toISOString())),
  )) as ActiveWorkoutSessionCache[];
  const expiredKeys = new Set(expiredSessions.map((session) => session.key));
  for (const session of expiredSessions) sessionStore.delete(session.key);
  const operations = (await requestResult(operationStore.getAll())) as ActiveWorkoutOperation[];
  for (const operation of operations) {
    const key = activeWorkoutSessionCacheKey(
      operation.userId,
      operation.workoutSessionId,
    );
    if (
      expiredKeys.has(key)
      || Date.parse(operation.createdAt) + ACTIVE_WORKOUT_OFFLINE_RETENTION_MS <= now
    ) {
      operationStore.delete(operation.id);
    }
  }
  await transactionDone(transaction);
  database.close();
}

export function clearStaleActiveWorkoutData(now = Date.now()): Promise<void> {
  if (onlineOrNonBrowser()) {
    // Retention cleanup is maintenance work while connected. Run it in the
    // background and never place it ahead of canonical server hydration.
    void clearStaleActiveWorkoutDataNow(now).catch(() => undefined);
    return Promise.resolve();
  }
  return clearStaleActiveWorkoutDataNow(now);
}
