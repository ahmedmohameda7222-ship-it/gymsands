"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import type {
  FrozenWorkoutPrescriptionMetricTarget,
  FrozenWorkoutPrescriptionSet,
  PlannedActivityPrescription,
  WorkoutPrescriptionMetricTargetMode,
  WorkoutPrescriptionNormalizationStatus,
  WorkoutPrescriptionSetTargetMode,
  WorkoutPrescriptionSetType,
  WorkoutPrescriptionSide,
  WorkoutPrescriptionSideMode,
  WorkoutSessionPrescriptionItem
} from "@/types/workout-prescription";

const setTypes = new Set<WorkoutPrescriptionSetType>([
  "warmup", "working", "normal", "failure", "drop", "backoff", "amrap", "timed", "other"
]);
const setTargetModes = new Set<WorkoutPrescriptionSetTargetMode>([
  "exact", "range", "minimum", "maximum", "amrap", "timed", "distance", "rounds", "mixed", "custom"
]);
const metricTargetModes = new Set<WorkoutPrescriptionMetricTargetMode>([
  "exact", "range", "minimum", "maximum", "amrap", "timed", "distance", "rounds", "custom"
]);
const sides = new Set<WorkoutPrescriptionSide>(["none", "bilateral", "left", "right"]);
const sideModes = new Set<WorkoutPrescriptionSideMode>(["none", "bilateral", "left", "right", "alternating"]);
const executionStates = new Set(["planned", "completed", "adjusted", "skipped"] as const);

export type WorkoutPrescriptionSnapshotRow = {
  id: unknown;
  workout_session_id: unknown;
  user_id: unknown;
};

export type WorkoutPrescriptionItemRow = {
  id: unknown;
  snapshot_id: unknown;
  user_id: unknown;
  item_order: unknown;
  source_plan_exercise_id: unknown;
  source_plan_activity_id: unknown;
  activity_name_snapshot: unknown;
  planned_prescription: unknown;
  planned_sets: unknown;
  state: unknown;
};

export type WorkoutPrescriptionSetRow = {
  id: unknown;
  snapshot_item_id: unknown;
  snapshot_id: unknown;
  workout_session_id: unknown;
  user_id: unknown;
  set_order: unknown;
  performed_order_hint: unknown;
  set_type: unknown;
  target_mode: unknown;
  side_mode: unknown;
  rest_seconds: unknown;
  tempo_target: unknown;
  schema_version: unknown;
  created_at: unknown;
};

export type WorkoutPrescriptionTargetRow = {
  id: unknown;
  prescription_set_id: unknown;
  snapshot_item_id: unknown;
  workout_session_id: unknown;
  user_id: unknown;
  metric_key: unknown;
  metric_version: unknown;
  side: unknown;
  target_value: unknown;
  minimum_value: unknown;
  maximum_value: unknown;
  target_mode: unknown;
  created_at: unknown;
};

export type WorkoutMetricDefinitionRow = {
  metric_key: unknown;
  metric_version: unknown;
  value_kind: unknown;
  minimum_value: unknown;
  maximum_value: unknown;
  supports_side: unknown;
};

function fail(message: string): never {
  throw new Error(`Invalid frozen workout prescription: ${message}`);
}

function stringValue(value: unknown, label: string, nullable = false): string | null {
  if (value === null && nullable) return null;
  if (typeof value !== "string" || !value) fail(`${label} must be a non-empty string.`);
  return value as string;
}

function integerValue(value: unknown, label: string, nullable = false): number | null {
  if (value === null && nullable) return null;
  const parsed = typeof value === "number" ? value : typeof value === "string" && /^-?\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed)) fail(`${label} must be an integer.`);
  return parsed;
}

function numericValue(value: unknown, label: string, nullable = false): number | null {
  if (value === null && nullable) return null;
  const parsed = typeof value === "number" ? value : typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) fail(`${label} must be numeric.`);
  return parsed;
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function enumValue<T extends string>(value: unknown, allowed: Set<T>, label: string): T {
  if (typeof value !== "string" || !allowed.has(value as T)) fail(`${label} is unsupported.`);
  return value as T;
}

function assertTargetShape(target: FrozenWorkoutPrescriptionMetricTarget) {
  const { targetMode, targetValue, minimumValue, maximumValue, metricKey } = target;
  if (targetMode === "exact" && (targetValue === null || minimumValue !== null || maximumValue !== null)) fail("exact target shape is invalid.");
  if (targetMode === "range" && (targetValue !== null || minimumValue === null || maximumValue === null || minimumValue > maximumValue)) fail("range target shape is invalid.");
  if (targetMode === "minimum" && (targetValue !== null || minimumValue === null || maximumValue !== null)) fail("minimum target shape is invalid.");
  if (targetMode === "maximum" && (targetValue !== null || minimumValue !== null || maximumValue === null)) fail("maximum target shape is invalid.");
  if ((targetMode === "amrap" || targetMode === "custom") && (targetValue !== null || minimumValue !== null || maximumValue !== null)) fail(`${targetMode} target shape is invalid.`);
  if (["timed", "distance", "rounds"].includes(targetMode) && (targetValue === null || minimumValue !== null || maximumValue !== null)) fail(`${targetMode} target shape is invalid.`);
  if (targetMode === "amrap" && metricKey !== "repetitions") fail("AMRAP must use repetitions.");
  if (targetMode === "timed" && metricKey !== "duration_seconds") fail("timed must use duration_seconds.");
  if (targetMode === "distance" && metricKey !== "distance_meters") fail("distance must use distance_meters.");
  if (targetMode === "rounds" && metricKey !== "rounds") fail("rounds must use rounds.");
}

function registryKey(metricKey: string, metricVersion: number) {
  return `${metricKey}:${metricVersion}`;
}

function derivedSetTargetMode(
  targets: FrozenWorkoutPrescriptionMetricTarget[]
): WorkoutPrescriptionSetTargetMode {
  if (!targets.length) return "custom";
  if (targets.length > 1) return "mixed";
  const [target] = targets;
  if (target.targetMode === "amrap") return "amrap";
  if (target.metricKey === "duration_seconds") return "timed";
  if (target.metricKey === "distance_meters") return "distance";
  if (target.metricKey === "rounds") return "rounds";
  return target.targetMode;
}

function normalizationStatus(sets: FrozenWorkoutPrescriptionSet[]): WorkoutPrescriptionNormalizationStatus {
  if (!sets.length) return "unavailable";
  return sets.some((set) => set.targetMode === "custom") ? "partial" : "complete";
}

export function normalizeWorkoutSessionPrescriptionRows(input: {
  snapshot: WorkoutPrescriptionSnapshotRow;
  items: WorkoutPrescriptionItemRow[];
  sets: WorkoutPrescriptionSetRow[];
  targets: WorkoutPrescriptionTargetRow[];
  definitions: WorkoutMetricDefinitionRow[];
}): WorkoutSessionPrescriptionItem[] {
  const snapshotId = stringValue(input.snapshot.id, "snapshot.id")!;
  const workoutSessionId = stringValue(input.snapshot.workout_session_id, "snapshot.workout_session_id")!;
  const userId = stringValue(input.snapshot.user_id, "snapshot.user_id")!;
  const definitionByIdentity = new Map<string, { valueKind: string; minimum: number; maximum: number; supportsSide: boolean }>();

  for (const row of input.definitions) {
    const metricKey = stringValue(row.metric_key, "definition.metric_key")!;
    const metricVersion = integerValue(row.metric_version, "definition.metric_version")!;
    const key = registryKey(metricKey, metricVersion);
    if (definitionByIdentity.has(key)) fail(`duplicate metric registry identity ${key}.`);
    const valueKind = stringValue(row.value_kind, "definition.value_kind")!;
    if (valueKind !== "integer" && valueKind !== "decimal") fail(`invalid value_kind for ${key}.`);
    definitionByIdentity.set(key, {
      valueKind,
      minimum: numericValue(row.minimum_value, "definition.minimum_value")!,
      maximum: numericValue(row.maximum_value, "definition.maximum_value")!,
      supportsSide: row.supports_side === true
    });
  }

  const itemOrderKeys = new Set<number>();
  const itemById = new Map<string, WorkoutSessionPrescriptionItem>();
  for (const row of input.items) {
    const id = stringValue(row.id, "item.id")!;
    if (itemById.has(id)) fail(`duplicate item identity ${id}.`);
    if (stringValue(row.snapshot_id, "item.snapshot_id") !== snapshotId) fail("item snapshot owner mismatch.");
    if (stringValue(row.user_id, "item.user_id") !== userId) fail("item user owner mismatch.");
    const itemOrder = integerValue(row.item_order, "item.item_order")!;
    if (itemOrderKeys.has(itemOrder)) fail(`duplicate item order ${itemOrder}.`);
    itemOrderKeys.add(itemOrder);
    const rawCompatibilityPrescription = objectValue(row.planned_prescription, "item.planned_prescription") as PlannedActivityPrescription;
    const plannedSets = integerValue(row.planned_sets, "item.planned_sets", true);
    if (plannedSets !== null && (plannedSets < 1 || plannedSets > 100)) fail("item.planned_sets is outside 1 through 100.");
    const item: WorkoutSessionPrescriptionItem = {
      snapshotId,
      id,
      workoutSessionId,
      userId,
      itemOrder,
      sourcePlanExerciseId: stringValue(row.source_plan_exercise_id, "item.source_plan_exercise_id", true),
      sourcePlanActivityId: stringValue(row.source_plan_activity_id, "item.source_plan_activity_id", true),
      activityName: stringValue(row.activity_name_snapshot, "item.activity_name_snapshot")!,
      rawCompatibilityPrescription,
      plannedSets,
      executionState: enumValue(row.state, executionStates, "item.state"),
      normalizationStatus: "unavailable",
      prescriptionSets: []
    };
    itemById.set(id, item);
  }

  const setById = new Map<string, FrozenWorkoutPrescriptionSet>();
  const setOrderByItem = new Map<string, Set<number>>();
  for (const row of input.sets) {
    const id = stringValue(row.id, "set.id")!;
    if (setById.has(id)) fail(`duplicate set identity ${id}.`);
    const snapshotItemId = stringValue(row.snapshot_item_id, "set.snapshot_item_id")!;
    const item = itemById.get(snapshotItemId);
    if (!item) fail("set points outside the loaded item graph.");
    if (stringValue(row.snapshot_id, "set.snapshot_id") !== snapshotId) fail("set snapshot mismatch.");
    if (stringValue(row.workout_session_id, "set.workout_session_id") !== workoutSessionId) fail("set session mismatch.");
    if (stringValue(row.user_id, "set.user_id") !== userId) fail("set owner mismatch.");
    const setOrder = integerValue(row.set_order, "set.set_order")!;
    if (setOrder < 1 || setOrder > 100) fail("set.set_order is outside 1 through 100.");
    const seenOrders = setOrderByItem.get(snapshotItemId) ?? new Set<number>();
    if (seenOrders.has(setOrder)) fail(`duplicate set order ${setOrder}.`);
    seenOrders.add(setOrder);
    setOrderByItem.set(snapshotItemId, seenOrders);
    const schemaVersion = integerValue(row.schema_version, "set.schema_version")!;
    if (schemaVersion !== 1) fail("unsupported prescription set schema version.");
    const prescriptionSet: FrozenWorkoutPrescriptionSet = {
      id,
      snapshotItemId,
      snapshotId,
      workoutSessionId,
      userId,
      setOrder,
      performedOrderHint: integerValue(row.performed_order_hint, "set.performed_order_hint", true),
      setType: enumValue(row.set_type, setTypes, "set.set_type"),
      targetMode: enumValue(row.target_mode, setTargetModes, "set.target_mode"),
      sideMode: enumValue(row.side_mode, sideModes, "set.side_mode"),
      restSeconds: integerValue(row.rest_seconds, "set.rest_seconds", true),
      tempoTarget: stringValue(row.tempo_target, "set.tempo_target", true),
      schemaVersion: 1,
      createdAt: stringValue(row.created_at, "set.created_at")!,
      targets: []
    };
    if (prescriptionSet.performedOrderHint !== null
        && (prescriptionSet.performedOrderHint < 1 || prescriptionSet.performedOrderHint > 100)) {
      fail("set.performed_order_hint is outside 1 through 100.");
    }
    if (prescriptionSet.restSeconds !== null
        && (prescriptionSet.restSeconds < 0 || prescriptionSet.restSeconds > 86400)) {
      fail("set.rest_seconds is outside 0 through 86400.");
    }
    if (prescriptionSet.tempoTarget !== null
        && ([...prescriptionSet.tempoTarget].length > 64 || /[\u0000-\u001f\u007f]/u.test(prescriptionSet.tempoTarget))) {
      fail("set.tempo_target is invalid.");
    }
    item.prescriptionSets.push(prescriptionSet);
    setById.set(id, prescriptionSet);
  }

  const targetIdentityBySet = new Map<string, Set<string>>();
  const targetIds = new Set<string>();
  for (const row of input.targets) {
    const targetId = stringValue(row.id, "target.id")!;
    if (targetIds.has(targetId)) fail(`duplicate target identity row ${targetId}.`);
    targetIds.add(targetId);
    const prescriptionSetId = stringValue(row.prescription_set_id, "target.prescription_set_id")!;
    const prescriptionSet = setById.get(prescriptionSetId);
    if (!prescriptionSet) fail("target points outside the loaded set graph.");
    const snapshotItemId = stringValue(row.snapshot_item_id, "target.snapshot_item_id")!;
    const targetWorkoutSessionId = stringValue(row.workout_session_id, "target.workout_session_id")!;
    const targetUserId = stringValue(row.user_id, "target.user_id")!;
    if (snapshotItemId !== prescriptionSet.snapshotItemId || targetWorkoutSessionId !== workoutSessionId || targetUserId !== userId) fail("target owner/session path mismatch.");
    const metricKey = stringValue(row.metric_key, "target.metric_key")!;
    const metricVersion = integerValue(row.metric_version, "target.metric_version")!;
    const side = enumValue(row.side, sides, "target.side");
    const identity = `${metricKey}:${metricVersion}:${side}`;
    const identities = targetIdentityBySet.get(prescriptionSetId) ?? new Set<string>();
    if (identities.has(identity)) fail(`duplicate target identity ${identity}.`);
    identities.add(identity);
    targetIdentityBySet.set(prescriptionSetId, identities);

    const definition = definitionByIdentity.get(registryKey(metricKey, metricVersion));
    if (!definition) fail(`unknown metric registry identity ${metricKey}:${metricVersion}.`);
    if (!definition.supportsSide && side !== "none") fail(`metric ${metricKey} does not support side.`);
    const target: FrozenWorkoutPrescriptionMetricTarget = {
      id: targetId,
      prescriptionSetId,
      snapshotItemId,
      workoutSessionId,
      userId,
      metricKey,
      metricVersion,
      side,
      targetValue: numericValue(row.target_value, "target.target_value", true),
      minimumValue: numericValue(row.minimum_value, "target.minimum_value", true),
      maximumValue: numericValue(row.maximum_value, "target.maximum_value", true),
      targetMode: enumValue(row.target_mode, metricTargetModes, "target.target_mode"),
      createdAt: stringValue(row.created_at, "target.created_at")!
    };
    for (const value of [target.targetValue, target.minimumValue, target.maximumValue]) {
      if (value === null) continue;
      if (value < definition.minimum || value > definition.maximum) fail(`metric ${metricKey} is outside registry bounds.`);
      if (definition.valueKind === "integer" && !Number.isInteger(value)) fail(`metric ${metricKey} requires integer values.`);
    }
    assertTargetShape(target);
    prescriptionSet.targets.push(target);
  }

  const items = [...itemById.values()].sort((a, b) => a.itemOrder - b.itemOrder || a.id.localeCompare(b.id));
  for (const item of items) {
    item.prescriptionSets.sort((a, b) => a.setOrder - b.setOrder || a.id.localeCompare(b.id));
    for (const set of item.prescriptionSets) {
      set.targets.sort((a, b) => a.metricKey.localeCompare(b.metricKey)
        || a.metricVersion - b.metricVersion || a.side.localeCompare(b.side) || a.id.localeCompare(b.id));
      const derivedMode = derivedSetTargetMode(set.targets);
      if (set.targetMode !== derivedMode) {
        fail(`set ${set.id} target_mode does not match its immutable targets.`);
      }
    }
    if (item.plannedSets !== null && item.prescriptionSets.length !== item.plannedSets) {
      fail(`item ${item.id} normalized set count does not match planned_sets.`);
    }
    item.normalizationStatus = normalizationStatus(item.prescriptionSets);
  }
  return items;
}

const snapshotSelection = "id,workout_session_id,user_id";
const itemSelection = "id,snapshot_id,user_id,item_order,source_plan_exercise_id,source_plan_activity_id,activity_name_snapshot,planned_prescription,planned_sets,state";
const setSelection = "id,snapshot_item_id,snapshot_id,workout_session_id,user_id,set_order,performed_order_hint,set_type,target_mode,side_mode,rest_seconds,tempo_target,schema_version,created_at";
const targetSelection = "id,prescription_set_id,snapshot_item_id,workout_session_id,user_id,metric_key,metric_version,side,target_value,minimum_value,maximum_value,target_mode,created_at";
const definitionSelection = "metric_key,metric_version,value_kind,minimum_value,maximum_value,supports_side";

export async function getWorkoutSessionPrescriptionItems(userId: string, workoutSessionId: string) {
  if (!supabase || !isUuid(userId) || !isUuid(workoutSessionId)) throw new Error("Workout prescription is unavailable.");
  const snapshotResult = await supabase.from("workout_session_muscle_snapshots")
    .select(snapshotSelection).eq("user_id", userId).eq("workout_session_id", workoutSessionId).single();
  if (snapshotResult.error) throw snapshotResult.error;
  const snapshot = snapshotResult.data as unknown as WorkoutPrescriptionSnapshotRow;
  const snapshotId = stringValue(snapshot.id, "snapshot.id")!;

  const [itemResult, setResult, targetResult, definitionResult] = await Promise.all([
    supabase.from("workout_session_muscle_snapshot_items").select(itemSelection)
      .eq("user_id", userId).eq("snapshot_id", snapshotId)
      .order("item_order", { ascending: true }).order("id", { ascending: true }),
    supabase.from("workout_session_prescription_sets").select(setSelection)
      .eq("user_id", userId).eq("workout_session_id", workoutSessionId)
      .order("snapshot_item_id", { ascending: true }).order("set_order", { ascending: true })
      .order("id", { ascending: true }),
    supabase.from("workout_session_prescription_metric_targets").select(targetSelection)
      .eq("user_id", userId).eq("workout_session_id", workoutSessionId)
      .order("prescription_set_id", { ascending: true }).order("metric_key", { ascending: true })
      .order("metric_version", { ascending: true })
      .order("side", { ascending: true }).order("id", { ascending: true }),
    supabase.from("workout_performance_metric_definitions").select(definitionSelection)
      .order("metric_key", { ascending: true }).order("metric_version", { ascending: true })
  ]);
  for (const result of [itemResult, setResult, targetResult, definitionResult]) {
    if (result.error) throw result.error;
  }
  return normalizeWorkoutSessionPrescriptionRows({
    snapshot,
    items: (itemResult.data ?? []) as unknown as WorkoutPrescriptionItemRow[],
    sets: (setResult.data ?? []) as unknown as WorkoutPrescriptionSetRow[],
    targets: (targetResult.data ?? []) as unknown as WorkoutPrescriptionTargetRow[],
    definitions: (definitionResult.data ?? []) as unknown as WorkoutMetricDefinitionRow[]
  });
}

export function frozenRepetitionsProjection(set: FrozenWorkoutPrescriptionSet | null | undefined): string | null {
  const target = set?.targets.find((candidate) => candidate.metricKey === "repetitions" && candidate.side === "none")
    ?? set?.targets.find((candidate) => candidate.metricKey === "repetitions")
    ?? null;
  if (!target) return null;
  if (target.targetMode === "amrap") return "AMRAP";
  if (target.targetMode === "exact" && target.targetValue !== null) return String(target.targetValue);
  if (target.targetMode === "range" && target.minimumValue !== null && target.maximumValue !== null) return `${target.minimumValue}-${target.maximumValue}`;
  if (target.targetMode === "minimum" && target.minimumValue !== null) return `${target.minimumValue}+`;
  if (target.targetMode === "maximum" && target.maximumValue !== null) return `≤${target.maximumValue}`;
  return null;
}

export function frozenRepetitionsEntryDefault(set: FrozenWorkoutPrescriptionSet | null | undefined): string {
  const target = set?.targets.find((candidate) => candidate.metricKey === "repetitions" && candidate.side === "none")
    ?? set?.targets.find((candidate) => candidate.metricKey === "repetitions")
    ?? null;
  if (!target) return "";
  if (target.targetMode === "exact" && target.targetValue !== null) return String(target.targetValue);
  if ((target.targetMode === "range" || target.targetMode === "minimum") && target.minimumValue !== null) return String(target.minimumValue);
  if (target.targetMode === "maximum" && target.maximumValue !== null) return String(target.maximumValue);
  return "";
}

export function frozenLogCompatibility(item: WorkoutSessionPrescriptionItem, set: FrozenWorkoutPrescriptionSet | null) {
  return {
    plannedSets: item.prescriptionSets.length || item.plannedSets,
    plannedReps: frozenRepetitionsProjection(set),
    plannedRestSeconds: set?.restSeconds ?? null,
    plannedTempo: set?.tempoTarget ?? null
  };
}
