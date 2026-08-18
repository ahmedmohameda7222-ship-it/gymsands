import { ACTIVE_WORKOUT_OFFLINE_RETENTION_MS } from "./contracts";
import { openActiveWorkoutDatabase } from "./indexed-db";

export const ACTIVE_WORKOUT_SET_DRAFT_STORE = "set_drafts" as const;

export type ActiveWorkoutSetDraftPayload = {
  reps: string;
  weightKg: string;
  rpe: string;
  rir: string;
  setType: string;
  notes: string;
};

export type ActiveWorkoutSetDraftRecord = ActiveWorkoutSetDraftPayload & {
  key: string;
  userId: string;
  workoutSessionId: string;
  snapshotItemId: string;
  setNumber: number;
  updatedAt: string;
  expiresAt: string;
};

export function activeWorkoutSetDraftKey(
  userId: string,
  workoutSessionId: string,
  snapshotItemId: string,
  setNumber: number,
) {
  return `${userId}:${workoutSessionId}:${snapshotItemId}:${setNumber}`;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

export async function writeActiveWorkoutSetDrafts(input: {
  userId: string;
  workoutSessionId: string;
  drafts: Array<{
    snapshotItemId: string;
    setNumber: number;
    draft: ActiveWorkoutSetDraftPayload;
  }>;
}) {
  if (!input.drafts.length) return;
  const database = await openActiveWorkoutDatabase();
  if (!database || !database.objectStoreNames.contains(ACTIVE_WORKOUT_SET_DRAFT_STORE)) return;
  const transaction = database.transaction(ACTIVE_WORKOUT_SET_DRAFT_STORE, "readwrite");
  const store = transaction.objectStore(ACTIVE_WORKOUT_SET_DRAFT_STORE);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ACTIVE_WORKOUT_OFFLINE_RETENTION_MS).toISOString();
  for (const item of input.drafts) {
    const value: ActiveWorkoutSetDraftRecord = {
      key: activeWorkoutSetDraftKey(input.userId, input.workoutSessionId, item.snapshotItemId, item.setNumber),
      userId: input.userId,
      workoutSessionId: input.workoutSessionId,
      snapshotItemId: item.snapshotItemId,
      setNumber: item.setNumber,
      ...item.draft,
      updatedAt: now.toISOString(),
      expiresAt,
    };
    store.put(value);
  }
  await transactionDone(transaction);
  database.close();
}

export async function readActiveWorkoutSetDrafts(userId: string, workoutSessionId: string) {
  const database = await openActiveWorkoutDatabase();
  if (!database || !database.objectStoreNames.contains(ACTIVE_WORKOUT_SET_DRAFT_STORE)) return [];
  const transaction = database.transaction(ACTIVE_WORKOUT_SET_DRAFT_STORE, "readonly");
  const range = IDBKeyRange.only([userId, workoutSessionId]);
  const records = await requestResult(
    transaction.objectStore(ACTIVE_WORKOUT_SET_DRAFT_STORE).index("by_session").getAll(range),
  ) as ActiveWorkoutSetDraftRecord[];
  await transactionDone(transaction);
  database.close();
  const now = Date.now();
  return records.filter((record) => Date.parse(record.expiresAt) > now);
}

export async function clearActiveWorkoutSetDraft(
  userId: string,
  workoutSessionId: string,
  snapshotItemId: string,
  setNumber: number,
) {
  const database = await openActiveWorkoutDatabase();
  if (!database || !database.objectStoreNames.contains(ACTIVE_WORKOUT_SET_DRAFT_STORE)) return;
  const transaction = database.transaction(ACTIVE_WORKOUT_SET_DRAFT_STORE, "readwrite");
  transaction.objectStore(ACTIVE_WORKOUT_SET_DRAFT_STORE)
    .delete(activeWorkoutSetDraftKey(userId, workoutSessionId, snapshotItemId, setNumber));
  await transactionDone(transaction);
  database.close();
}

export async function clearActiveWorkoutSessionDrafts(userId: string, workoutSessionId: string) {
  const database = await openActiveWorkoutDatabase();
  if (!database || !database.objectStoreNames.contains(ACTIVE_WORKOUT_SET_DRAFT_STORE)) return;
  const transaction = database.transaction(ACTIVE_WORKOUT_SET_DRAFT_STORE, "readwrite");
  const store = transaction.objectStore(ACTIVE_WORKOUT_SET_DRAFT_STORE);
  const records = await requestResult(
    store.index("by_session").getAll(IDBKeyRange.only([userId, workoutSessionId])),
  ) as ActiveWorkoutSetDraftRecord[];
  for (const record of records) store.delete(record.key);
  await transactionDone(transaction);
  database.close();
}

export async function clearActiveWorkoutUserDrafts(userId: string) {
  const database = await openActiveWorkoutDatabase();
  if (!database || !database.objectStoreNames.contains(ACTIVE_WORKOUT_SET_DRAFT_STORE)) return;
  const transaction = database.transaction(ACTIVE_WORKOUT_SET_DRAFT_STORE, "readwrite");
  const store = transaction.objectStore(ACTIVE_WORKOUT_SET_DRAFT_STORE);
  const records = await requestResult(store.index("by_user").getAll(userId)) as ActiveWorkoutSetDraftRecord[];
  for (const record of records) store.delete(record.key);
  await transactionDone(transaction);
  database.close();
}

export function mergeActiveWorkoutSetDrafts<Exercise extends {
  prescriptionItem: { id: string };
  sets: Array<ActiveWorkoutSetDraftPayload & { setNumber: number; completedAt: string | null }>;
}>(exercises: Exercise[], drafts: readonly ActiveWorkoutSetDraftRecord[]): Exercise[] {
  const byKey = new Map(drafts.map((draft) => [`${draft.snapshotItemId}:${draft.setNumber}`, draft]));
  return exercises.map((exercise) => ({
    ...exercise,
    sets: exercise.sets.map((set) => {
      if (set.completedAt) return set;
      const draft = byKey.get(`${exercise.prescriptionItem.id}:${set.setNumber}`);
      if (!draft) return set;
      return {
        ...set,
        reps: draft.reps,
        weightKg: draft.weightKg,
        rpe: draft.rpe,
        rir: draft.rir,
        setType: draft.setType as typeof set.setType,
        notes: draft.notes,
      };
    }),
  }));
}
