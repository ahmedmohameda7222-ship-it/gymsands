import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createActivityCatalogProvider } from "@/services/activity-catalog/server/selector";

export type RepeatWorkoutIdentity = {
  targetType: "global_exercise" | "custom_exercise" | "provider_activity";
  identity: string;
  provider?: string | null;
};

export type RepeatWorkoutPreview = {
  sourceSessionId: string;
  sourceTitle: string;
  canStartImmediately: boolean;
  activeSessionConflict: { sessionId: string; title: string } | null;
  items: Array<{
    sourceSnapshotItemId: string;
    order: number;
    historicalName: string;
    currentResolution:
      | { state: "available"; identity: RepeatWorkoutIdentity; name: string }
      | { state: "unavailable"; reason: string }
      | {
          state: "replacement-required";
          reason: string;
          alternatives: Array<{
            identity: RepeatWorkoutIdentity;
            name: string;
          }>;
        };
    plannedPrescription: Record<string, unknown>;
    normalizedSets: Array<Record<string, unknown>>;
  }>;
};

type SnapshotItemRow = {
  id: string;
  item_order: number;
  activity_name_snapshot: string;
  actual_name_snapshot: string | null;
  actual_global_exercise_id: string | null;
  actual_custom_exercise_id: string | null;
  actual_provider: string | null;
  actual_provider_activity_id: string | null;
  planned_global_exercise_id: string | null;
  planned_custom_exercise_id: string | null;
  planned_provider: string | null;
  planned_provider_activity_id: string | null;
  planned_prescription: Record<string, unknown> | null;
};

function stableIdentity(item: SnapshotItemRow): RepeatWorkoutIdentity | null {
  const provider = item.actual_provider ?? item.planned_provider;
  const providerActivityId =
    item.actual_provider_activity_id ?? item.planned_provider_activity_id;
  if (provider && providerActivityId)
    return {
      targetType: "provider_activity",
      identity: providerActivityId,
      provider,
    };
  const globalId =
    item.actual_global_exercise_id ?? item.planned_global_exercise_id;
  if (globalId) return { targetType: "global_exercise", identity: globalId };
  const customId =
    item.actual_custom_exercise_id ?? item.planned_custom_exercise_id;
  if (customId) return { targetType: "custom_exercise", identity: customId };
  return null;
}

export class RepeatWorkoutError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RepeatWorkoutError";
  }
}

export async function getRepeatWorkoutPreview(
  supabase: SupabaseClient,
  userId: string,
  sourceSessionId: string,
  locale = "en",
): Promise<RepeatWorkoutPreview> {
  const sourceResult = await supabase
    .from("workout_sessions")
    .select("id,workout_name,status,deleted_at")
    .eq("id", sourceSessionId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (sourceResult.error)
    throw new RepeatWorkoutError(
      "preview_failed",
      "Repeat preview could not load.",
      503,
    );
  if (
    !sourceResult.data ||
    !["completed", "cancelled"].includes(sourceResult.data.status)
  ) {
    throw new RepeatWorkoutError(
      "source_unavailable",
      "This workout is not available to repeat.",
      404,
    );
  }
  if (sourceResult.data.status === "cancelled") {
    const performedResult = await supabase
      .from("exercise_logs")
      .select("id")
      .eq("workout_session_id", sourceSessionId)
      .not("completed_at", "is", null)
      .limit(1);
    if (performedResult.error)
      throw new RepeatWorkoutError(
        "preview_failed",
        "Repeat preview could not load.",
        503,
      );
    if (!performedResult.data?.length) {
      throw new RepeatWorkoutError(
        "source_unavailable",
        "This cancelled workout has no performed work to repeat.",
        409,
      );
    }
  }

  const snapshotResult = await supabase
    .from("workout_session_muscle_snapshots")
    .select("id")
    .eq("workout_session_id", sourceSessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (snapshotResult.error || !snapshotResult.data) {
    throw new RepeatWorkoutError(
      "snapshot_unavailable",
      "This workout has no frozen prescription to repeat.",
      409,
    );
  }
  const itemResult = await supabase
    .from("workout_session_muscle_snapshot_items")
    .select(
      "id,item_order,activity_name_snapshot,actual_name_snapshot,actual_global_exercise_id,actual_custom_exercise_id,actual_provider,actual_provider_activity_id,planned_global_exercise_id,planned_custom_exercise_id,planned_provider,planned_provider_activity_id,planned_prescription",
    )
    .eq("snapshot_id", snapshotResult.data.id)
    .eq("user_id", userId)
    .order("item_order", { ascending: true });
  if (itemResult.error)
    throw new RepeatWorkoutError(
      "preview_failed",
      "Repeat preview could not load.",
      503,
    );
  const snapshotItems = (itemResult.data ?? []) as SnapshotItemRow[];
  if (snapshotItems.length === 0 || snapshotItems.length > 100) {
    throw new RepeatWorkoutError(
      "snapshot_unavailable",
      "This workout has no repeatable frozen items.",
      409,
    );
  }

  const itemIds = snapshotItems.map((item) => item.id);
  const setResult = await supabase
    .from("workout_session_prescription_sets")
    .select(
      "id,snapshot_item_id,set_order,set_type,side_mode,rest_seconds,tempo",
    )
    .in("snapshot_item_id", itemIds)
    .order("set_order", { ascending: true });
  if (setResult.error)
    throw new RepeatWorkoutError(
      "preview_failed",
      "Frozen prescription sets could not load.",
      503,
    );
  const setIds = (setResult.data ?? []).map((set) => set.id);
  const targetResult =
    setIds.length > 0
      ? await supabase
          .from("workout_session_prescription_metric_targets")
          .select(
            "prescription_set_id,metric_key,metric_version,side,target_value,minimum_value,maximum_value,target_mode",
          )
          .in("prescription_set_id", setIds)
      : { data: [], error: null };
  if (targetResult.error)
    throw new RepeatWorkoutError(
      "preview_failed",
      "Frozen prescription targets could not load.",
      503,
    );
  const targetsBySet = new Map<string, Array<Record<string, unknown>>>();
  for (const target of targetResult.data ?? []) {
    targetsBySet.set(target.prescription_set_id, [
      ...(targetsBySet.get(target.prescription_set_id) ?? []),
      target,
    ]);
  }
  const setsByItem = new Map<string, Array<Record<string, unknown>>>();
  for (const set of setResult.data ?? []) {
    setsByItem.set(set.snapshot_item_id, [
      ...(setsByItem.get(set.snapshot_item_id) ?? []),
      { ...set, targets: targetsBySet.get(set.id) ?? [] },
    ]);
  }

  const identities = snapshotItems.map(stableIdentity);
  const globalIds = identities
    .filter(
      (value): value is RepeatWorkoutIdentity =>
        value?.targetType === "global_exercise",
    )
    .map((value) => value.identity);
  const customIds = identities
    .filter(
      (value): value is RepeatWorkoutIdentity =>
        value?.targetType === "custom_exercise",
    )
    .map((value) => value.identity);
  const [globals, customs, active] = await Promise.all([
    globalIds.length
      ? supabase
          .from("exercises")
          .select("id,name")
          .in("id", globalIds)
          .eq("is_global", true)
          .eq("is_approved", true)
      : Promise.resolve({ data: [], error: null }),
    customIds.length
      ? supabase
          .from("user_custom_exercises")
          .select("id,name")
          .eq("user_id", userId)
          .in("id", customIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("workout_sessions")
      .select("id,workout_name")
      .eq("user_id", userId)
      .eq("status", "started")
      .is("deleted_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (globals.error || customs.error || active.error)
    throw new RepeatWorkoutError(
      "preview_failed",
      "Repeat availability could not be checked.",
      503,
    );
  const globalById = new Map(
    (globals.data ?? []).map((row) => [row.id, row.name]),
  );
  const customById = new Map(
    (customs.data ?? []).map((row) => [row.id, row.name]),
  );
  const catalog = createActivityCatalogProvider(supabase);

  const items = await Promise.all(
    snapshotItems.map(async (item, index) => {
      const identity = identities[index];
      const historicalName =
        item.actual_name_snapshot ?? item.activity_name_snapshot;
      let currentResolution: RepeatWorkoutPreview["items"][number]["currentResolution"];
      if (!identity) {
        currentResolution = {
          state: "unavailable",
          reason: "stable_identity_missing",
        };
      } else if (identity.targetType === "global_exercise") {
        const name = globalById.get(identity.identity);
        currentResolution = name
          ? { state: "available", identity, name }
          : {
              state: "replacement-required",
              reason: "global_exercise_removed",
              alternatives: [],
            };
      } else if (identity.targetType === "custom_exercise") {
        const name = customById.get(identity.identity);
        currentResolution = name
          ? { state: "available", identity, name }
          : {
              state: "replacement-required",
              reason: "custom_exercise_removed",
              alternatives: [],
            };
      } else {
        try {
          const resolved = await catalog.getActivity(identity.identity, {
            locale,
          });
          currentResolution = {
            state: "available",
            identity,
            name: resolved.data.name,
          };
        } catch {
          let alternatives: Array<{
            identity: RepeatWorkoutIdentity;
            name: string;
          }> = [];
          try {
            const result = await catalog.getActivityAlternatives(
              identity.identity,
              { locale, limit: 5 },
            );
            alternatives = result.data.map((alternative) => ({
              identity: {
                targetType: "provider_activity",
                identity: alternative.alternativeActivityId,
                provider: identity.provider,
              },
              name: alternative.alternativeName,
            }));
          } catch {
            /* unavailable catalog has no safe name fallback */
          }
          currentResolution = {
            state: "replacement-required",
            reason: "provider_activity_unavailable",
            alternatives,
          };
        }
      }
      return {
        sourceSnapshotItemId: item.id,
        order: item.item_order,
        historicalName,
        currentResolution,
        plannedPrescription: item.planned_prescription ?? {},
        normalizedSets: setsByItem.get(item.id) ?? [],
      };
    }),
  );

  const activeSessionConflict = active.data
    ? {
        sessionId: active.data.id,
        title: active.data.workout_name ?? "Active workout",
      }
    : null;
  return {
    sourceSessionId,
    sourceTitle: sourceResult.data.workout_name ?? "Workout",
    canStartImmediately:
      !activeSessionConflict &&
      items.some((item) => item.currentResolution.state === "available"),
    activeSessionConflict,
    items,
  };
}

export type RepeatWorkoutChoice = {
  sourceSnapshotItemId: string;
  action: "use" | "replace" | "omit";
  identity?: RepeatWorkoutIdentity;
};

export async function startRepeatedWorkout(
  supabase: SupabaseClient,
  userId: string,
  sourceSessionId: string,
  input: unknown,
) {
  const payload =
    input && typeof input === "object"
      ? (input as Partial<{
          candidateSessionId: string;
          idempotencyKey: string;
          items: RepeatWorkoutChoice[];
        }>)
      : {};
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      payload.candidateSessionId ?? "",
    ) ||
    !/^[A-Za-z0-9][A-Za-z0-9:._-]{15,199}$/.test(
      payload.idempotencyKey ?? "",
    ) ||
    !Array.isArray(payload.items) ||
    payload.items.length === 0 ||
    payload.items.length > 100 ||
    new TextEncoder().encode(JSON.stringify(payload)).byteLength > 65_536
  ) {
    throw new RepeatWorkoutError(
      "invalid_repeat_request",
      "Repeat workout request is invalid.",
      400,
    );
  }
  const result = await supabase.rpc("start_repeated_workout_session_atomic", {
    p_user_id: userId,
    p_source_session_id: sourceSessionId,
    p_candidate_session_id: payload.candidateSessionId,
    p_idempotency_key: payload.idempotencyKey,
    p_item_choices: payload.items,
  });
  if (result.error) {
    const status =
      result.error.code === "23505" || result.error.code === "40001"
        ? 409
        : result.error.code === "P0002"
          ? 404
          : result.error.code === "42501"
            ? 403
            : 400;
    throw new RepeatWorkoutError(
      result.error.code ?? "repeat_failed",
      result.error.message,
      status,
    );
  }
  return result.data;
}
