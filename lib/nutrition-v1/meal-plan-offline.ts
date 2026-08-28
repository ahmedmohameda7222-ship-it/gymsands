export type MealPlanMutationTarget =
  | { kind: "occurrence"; id: string; field?: string }
  | { kind: "meal_slot"; id: string; field?: string }
  | { kind: "shopping_item"; id: string; field?: string }
  | { kind: "week_override"; id: string; field?: string };

export type MealPlanOfflineMutationStatus = "queued" | "conflict" | "needs_attention";

export type MealPlanOfflineMutation = {
  operationId: string;
  weekId: string;
  baseRevision: number;
  target: MealPlanMutationTarget;
  payload: Record<string, unknown>;
  status: MealPlanOfflineMutationStatus;
  lastError?: string;
};

export type MealPlanQueueReconciliation = {
  serverRevision: number;
  changedTargets: MealPlanMutationTarget[];
};

function validText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validTarget(value: unknown): value is MealPlanMutationTarget {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const target = value as Partial<MealPlanMutationTarget>;
  return (
    (target.kind === "occurrence" || target.kind === "meal_slot" || target.kind === "shopping_item" || target.kind === "week_override") &&
    validText(target.id) &&
    (target.field === undefined || validText(target.field))
  );
}

function validMutation(value: unknown): value is MealPlanOfflineMutation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const mutation = value as Partial<MealPlanOfflineMutation>;
  return (
    validText(mutation.operationId) &&
    validText(mutation.weekId) &&
    Number.isInteger(mutation.baseRevision) &&
    Number(mutation.baseRevision) >= 0 &&
    validTarget(mutation.target) &&
    Boolean(mutation.payload) && typeof mutation.payload === "object" && !Array.isArray(mutation.payload) &&
    (mutation.status === "queued" || mutation.status === "conflict" || mutation.status === "needs_attention") &&
    (mutation.lastError === undefined || typeof mutation.lastError === "string")
  );
}

function targetsConflict(local: MealPlanMutationTarget, changed: MealPlanMutationTarget) {
  if (local.kind !== changed.kind || local.id !== changed.id) return false;
  if (!local.field || !changed.field) return true;
  return local.field === changed.field;
}

export function enqueueMealPlanMutation(
  queue: MealPlanOfflineMutation[],
  mutation: MealPlanOfflineMutation,
): MealPlanOfflineMutation[] {
  if (!validMutation(mutation)) throw new Error("Meal Plan offline mutation is invalid.");
  if (queue.some((item) => item.operationId === mutation.operationId)) return queue;
  return [...queue, { ...mutation, target: { ...mutation.target }, payload: { ...mutation.payload } }];
}

export function reconcileMealPlanQueue(
  queue: MealPlanOfflineMutation[],
  reconciliation: MealPlanQueueReconciliation,
): MealPlanOfflineMutation[] {
  if (!Number.isInteger(reconciliation.serverRevision) || reconciliation.serverRevision < 0) {
    throw new Error("Server Meal Plan revision is invalid.");
  }
  return queue.map((mutation) => {
    if (mutation.status !== "queued") return mutation;
    const conflict = reconciliation.changedTargets.some((target) => targetsConflict(mutation.target, target));
    if (conflict) return { ...mutation, status: "conflict" as const };
    return { ...mutation, baseRevision: reconciliation.serverRevision };
  });
}

export function markMealPlanMutationFailed(
  mutation: MealPlanOfflineMutation,
  message: string,
): MealPlanOfflineMutation {
  if (!validMutation(mutation)) throw new Error("Meal Plan offline mutation is invalid.");
  const lastError = message.trim() || "Meal Plan mutation could not be synchronized.";
  return { ...mutation, status: "needs_attention", lastError };
}

export function markMealPlanMutationRetryable(
  mutation: MealPlanOfflineMutation,
  message: string,
): MealPlanOfflineMutation {
  if (!validMutation(mutation)) throw new Error("Meal Plan offline mutation is invalid.");
  const lastError = message.trim() || "Meal Plan mutation could not be synchronized yet.";
  return { ...mutation, status: "queued", lastError };
}

export function serializeMealPlanQueue(queue: MealPlanOfflineMutation[]) {
  if (!queue.every(validMutation)) throw new Error("Meal Plan offline queue contains invalid data.");
  return JSON.stringify(queue);
}

export function deserializeMealPlanQueue(value: string): MealPlanOfflineMutation[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.every(validMutation)) return [];
    return parsed.map((mutation) => ({ ...mutation, target: { ...mutation.target }, payload: { ...mutation.payload } }));
  } catch {
    return [];
  }
}
