"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toaster";
import { getWorkoutHistoryCorrectionCopy } from "@/lib/i18n/workout-history-correction";
import { useTrainTranslation } from "@/lib/i18n/train";
import { workoutSetTypeLabel } from "@/lib/workouts/metric-presentation";
import { validateWorkoutSetEffortInput } from "@/services/database/workout-set-details";
import type {
  WorkoutHistoryExerciseDetail,
  WorkoutHistoryExerciseSetDetail,
  WorkoutHistoryMetricValue,
} from "@/types/workout-history";

const setTypes = [
  "warmup",
  "working",
  "normal",
  "failure",
  "drop",
  "backoff",
  "amrap",
  "timed",
  "other",
] as const;

type EditableSet = {
  key: string;
  id: string | null;
  original: WorkoutHistoryExerciseSetDetail | null;
  setNumber: number;
  reps: string;
  weightKg: string;
  setType: string;
  rpe: string;
  rir: string;
  notes: string;
  metrics: WorkoutHistoryMetricValue[];
  completedAt: string | null;
  added: boolean;
  removed: boolean;
};

type EditableExercise = {
  identity: string;
  name: string;
  snapshotItemId: string | null;
  supportsResistanceEditing: boolean;
  sets: EditableSet[];
};

class HistoryMutationRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
    this.name = "HistoryMutationRequestError";
  }
}

function key(kind: string) {
  return `${kind}:${crypto.randomUUID()}`;
}

function numberText(value: number | null) {
  return value === null ? "" : String(value);
}

function resistanceMetric(set: WorkoutHistoryExerciseSetDetail) {
  return set.reps !== null
    || set.weightKg !== null
    || set.metrics.some((metric) =>
      metric.metricKey === "repetitions"
      || metric.metricKey === "external_load_kg");
}

function supportsResistance(exercise: WorkoutHistoryExerciseDetail) {
  return exercise.performedSets.some(resistanceMetric)
    || exercise.missingPlannedSets.some((planned) =>
      planned.targets.some((target) =>
        target.metricKey === "repetitions"
        || target.metricKey === "external_load_kg"));
}

function editableExercises(
  exercises: WorkoutHistoryExerciseDetail[],
): EditableExercise[] {
  return exercises.map((exercise) => ({
    identity: exercise.identity,
    name: exercise.name,
    snapshotItemId: exercise.snapshotItemId,
    supportsResistanceEditing: supportsResistance(exercise),
    sets: exercise.performedSets.map((set) => ({
      key: set.id,
      id: set.id,
      original: set,
      setNumber: set.setNumber,
      reps: numberText(set.reps),
      weightKg: numberText(set.weightKg),
      setType: set.setType ?? "normal",
      rpe: numberText(set.rpe),
      rir: numberText(set.rir),
      notes: set.notes ?? "",
      metrics: set.metrics,
      completedAt: set.completedAt,
      added: false,
      removed: false,
    })),
  }));
}

function draftHasChanges(draft: EditableExercise[]) {
  return draft.some((exercise) => exercise.sets.some((set) => {
    if (set.added || set.removed) return true;
    if (!set.original) return false;
    return set.reps !== numberText(set.original.reps)
      || set.weightKg !== numberText(set.original.weightKg)
      || set.setType !== (set.original.setType ?? "normal")
      || set.rpe !== numberText(set.original.rpe)
      || set.rir !== numberText(set.original.rir)
      || set.notes !== (set.original.notes ?? "");
  }));
}

function parseNonNegativeNumber(value: string): number | null | undefined {
  const normalized = value.trim();
  if (!normalized) return null;
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(normalized)) return undefined;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function parseRepetitions(value: string): number | null | undefined {
  const normalized = value.trim();
  if (!normalized) return null;
  if (!/^(?:0|[1-9]\d*)$/.test(normalized)) return undefined;
  const number = Number(normalized);
  return Number.isSafeInteger(number) && number >= 0 ? number : undefined;
}

function sameNullableNumber(left: number | null, right: number | null) {
  return left === right;
}

function performanceMetricsFor(
  set: EditableSet,
  reps: number | null,
  weightKg: number | null,
) {
  const retained = set.metrics
    .filter((metric) =>
      metric.metricKey !== "repetitions"
      && metric.metricKey !== "external_load_kg")
    .map((metric) => ({
      metricKey: metric.metricKey,
      value: metric.value,
      side: metric.side,
    }));
  if (reps !== null) {
    retained.push({
      metricKey: "repetitions",
      value: reps,
      side: set.metrics.find((metric) => metric.metricKey === "repetitions")?.side ?? "none",
    });
  }
  if (weightKg !== null) {
    retained.push({
      metricKey: "external_load_kg",
      value: weightKg,
      side: set.metrics.find((metric) => metric.metricKey === "external_load_kg")?.side ?? "none",
    });
  }
  return retained;
}

function buildSetOperations(draft: EditableExercise[]) {
  const operations: Array<Record<string, unknown>> = [];
  for (const exercise of draft) {
    for (const set of exercise.sets) {
      if (set.removed) {
        if (set.id) operations.push({ kind: "remove", exerciseLogId: set.id });
        continue;
      }
      const reps = parseRepetitions(set.reps);
      const weightKg = parseNonNegativeNumber(set.weightKg);
      if (reps === undefined || weightKg === undefined) {
        throw new Error("invalid_number");
      }
      const rpe = validateWorkoutSetEffortInput(set.rpe, "rpe");
      const rir = validateWorkoutSetEffortInput(set.rir, "rir");
      if (rpe.error) throw new Error("invalid_rpe");
      if (rir.error) throw new Error("invalid_rir");

      const setDetails = {
        setType: set.setType,
        rpe: rpe.value,
        rir: rir.value,
        notes: set.notes || null,
      };
      if (set.added) {
        if (!exercise.snapshotItemId) continue;
        operations.push({
          kind: "add",
          snapshotItemId: exercise.snapshotItemId,
          setNumber: set.setNumber,
          values: {
            reps,
            weightKg,
            setType: set.setType,
            notes: set.notes || null,
            completedAt: set.completedAt,
            performanceMetrics: performanceMetricsFor(set, reps, weightKg),
            setDetails,
          },
        });
        continue;
      }
      if (!set.id || !set.original) continue;
      const original = set.original;
      const repsChanged = !sameNullableNumber(reps, original.reps);
      const weightChanged = !sameNullableNumber(weightKg, original.weightKg);
      const setTypeChanged = set.setType !== (original.setType ?? "normal");
      const rpeChanged = !sameNullableNumber(rpe.value, original.rpe);
      const rirChanged = !sameNullableNumber(rir.value, original.rir);
      const notesChanged = set.notes !== (original.notes ?? "");
      if (!repsChanged && !weightChanged && !setTypeChanged
          && !rpeChanged && !rirChanged && !notesChanged) continue;
      const patch: Record<string, unknown> = {};
      if (repsChanged) patch.reps = reps;
      if (weightChanged) patch.weightKg = weightKg;
      if (repsChanged || weightChanged) {
        patch.performanceMetrics = performanceMetricsFor(set, reps, weightKg);
      }
      const detailPatch: Record<string, unknown> = {};
      if (setTypeChanged) detailPatch.setType = set.setType;
      if (rpeChanged) detailPatch.rpe = rpe.value;
      if (rirChanged) detailPatch.rir = rir.value;
      if (notesChanged) detailPatch.notes = set.notes || null;
      if (Object.keys(detailPatch).length) patch.setDetails = detailPatch;
      operations.push({ kind: "update", exerciseLogId: set.id, patch });
    }
  }
  return operations;
}

export function SessionCorrectionDialog({
  sessionId,
  open,
  onOpenChange,
  historyRevision,
  notes,
  durationMinutes,
  exercises,
  onChanged,
}: {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  historyRevision: number;
  notes: string | null;
  durationMinutes: number | null;
  exercises: WorkoutHistoryExerciseDetail[];
  onChanged: () => void;
}) {
  const { session } = useAuth();
  const { toast } = useToast();
  const { language, locale, tr } = useTrainTranslation();
  const copy = getWorkoutHistoryCorrectionCopy(language);
  const [note, setNote] = useState(notes ?? "");
  const [duration, setDuration] = useState(durationMinutes?.toString() ?? "");
  const [draft, setDraft] = useState<EditableExercise[]>(() => editableExercises(exercises));
  const [busy, setBusy] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const [revisionConflict, setRevisionConflict] = useState(false);
  const discard = useConfirm();

  useEffect(() => {
    if (!open) return;
    setNote(notes ?? "");
    setDuration(durationMinutes?.toString() ?? "");
    setDraft(editableExercises(exercises));
    setValidation(null);
    setRevisionConflict(false);
  }, [durationMinutes, exercises, notes, open]);

  const preview = useMemo(() => {
    try {
      return buildSetOperations(draft);
    } catch {
      return [];
    }
  }, [draft]);
  const sessionChanged = note !== (notes ?? "")
    || duration !== (durationMinutes?.toString() ?? "");
  const hasChanges = sessionChanged || draftHasChanges(draft);

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen && hasChanges && !busy) {
      discard.ask({
        title: tr("historyDiscardCorrectionTitle"),
        description: tr("historyDiscardCorrectionDescription"),
        confirmLabel: tr("historyDiscardCorrection"),
        cancelLabel: tr("historyKeepEditing"),
        variant: "destructive",
        onConfirm: () => onOpenChange(false),
      });
      return;
    }
    onOpenChange(nextOpen);
  }

  async function request(path: string, body: unknown) {
    const token = session?.access_token;
    if (!token) {
      throw new HistoryMutationRequestError(
        "Sign in is required to update workout history.",
        401,
        "unauthorized",
      );
    }
    const response = await fetch(path, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new HistoryMutationRequestError(
        data.error ?? "Workout history could not be updated.",
        response.status,
        typeof data.code === "string" ? data.code : null,
      );
    }
    return data as Record<string, unknown>;
  }

  function updateSet(
    exerciseIdentity: string,
    setKey: string,
    patch: Partial<EditableSet>,
  ) {
    setDraft((current) => current.map((exercise) =>
      exercise.identity !== exerciseIdentity
        ? exercise
        : {
            ...exercise,
            sets: exercise.sets.map((set) =>
              set.key === setKey ? { ...set, ...patch } : set),
          }));
  }

  function toggleRemoved(exerciseIdentity: string, setKey: string) {
    setDraft((current) => current.map((exercise) => {
      if (exercise.identity !== exerciseIdentity) return exercise;
      const target = exercise.sets.find((set) => set.key === setKey);
      if (target?.added) {
        return {
          ...exercise,
          sets: exercise.sets.filter((set) => set.key !== setKey),
        };
      }
      return {
        ...exercise,
        sets: exercise.sets.map((set) =>
          set.key === setKey ? { ...set, removed: !set.removed } : set),
      };
    }));
  }

  function addSet(exerciseIdentity: string) {
    setDraft((current) => current.map((exercise) => {
      if (exercise.identity !== exerciseIdentity || !exercise.snapshotItemId)
        return exercise;
      const setNumber = Math.max(0, ...exercise.sets.map((set) => set.setNumber)) + 1;
      return {
        ...exercise,
        sets: [...exercise.sets, {
          key: crypto.randomUUID(),
          id: null,
          original: null,
          setNumber,
          reps: "",
          weightKg: "",
          setType: "working",
          rpe: "",
          rir: "",
          notes: "",
          metrics: [],
          completedAt: null,
          added: true,
          removed: false,
        }],
      };
    }));
  }

  function validationMessage(error: unknown) {
    if (!(error instanceof Error)) return tr("historyCorrectionFailed");
    if (error.message === "invalid_number") return copy.invalidNumber;
    if (error.message === "invalid_rpe") return copy.invalidRpe;
    if (error.message === "invalid_rir") return copy.invalidRir;
    return error.message;
  }

  async function save() {
    setValidation(null);
    setRevisionConflict(false);
    let setOperations: Array<Record<string, unknown>>;
    const parsedDuration = parseNonNegativeNumber(duration);
    try {
      if (parsedDuration === undefined) throw new Error("invalid_number");
      setOperations = buildSetOperations(draft);
    } catch (error) {
      setValidation(validationMessage(error));
      return;
    }
    if (!sessionChanged && !setOperations.length) return;
    setBusy(true);
    try {
      const result = await request(`/api/workouts/history/${sessionId}/correct`, {
        expectedHistoryRevision: historyRevision,
        idempotencyKey: key("history-correct"),
        sessionPatch: {
          notes: note || null,
          durationMinutes: parsedDuration,
        },
        setOperations,
      });
      onOpenChange(false);
      toast({
        title: tr("historyWorkoutUpdated"),
        description: result.projection_refresh_pending === true
          ? copy.projectionPending
          : tr("historyWorkoutUpdatedDescription"),
      });
      onChanged();
    } catch (error) {
      if (error instanceof HistoryMutationRequestError && error.status === 409) {
        setRevisionConflict(true);
        return;
      }
      toast({
        title: tr("historyCorrectionFailed"),
        description:
          error instanceof Error ? error.message : tr("historyRetry"),
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent data-workout-history-correction-dialog className="h-[100dvh] max-h-[100dvh] overflow-y-auto rounded-none pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:h-auto sm:max-h-[90dvh] sm:max-w-3xl sm:rounded-[24px]">
          <DialogHeader>
            <DialogTitle>{tr("historyCorrectTitle")}</DialogTitle>
            <DialogDescription>
              {tr("historyCorrectDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              {tr("historyDurationInput")}
              <Input
                inputMode="decimal"
                min={0}
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium sm:col-span-2">
              {tr("historySessionNoteInput")}
              <textarea
                className="min-h-24 rounded-xl border border-input bg-background px-3 py-2 text-sm"
                maxLength={4000}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
          </div>

          <section className="mt-4 space-y-3" aria-label={copy.performedSets}>
            <h3 className="text-sm font-semibold text-foreground">{copy.performedSets}</h3>
            {draft.map((exercise) => (
              <div key={exercise.identity} className="rounded-2xl border border-border/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-foreground">{exercise.name}</p>
                  {exercise.supportsResistanceEditing && exercise.snapshotItemId ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => addSet(exercise.identity)}>
                      <Plus className="size-4" />
                      {copy.addSet}
                    </Button>
                  ) : null}
                </div>
                <div className="mt-3 space-y-3">
                  {exercise.sets.map((set) => (
                    <fieldset
                      key={set.key}
                      aria-disabled={set.removed}
                      className={`rounded-xl border border-border/60 bg-muted/15 p-3 ${set.removed ? "opacity-55" : ""}`}
                    >
                      <legend className="px-1 text-xs font-semibold text-muted-foreground">
                        {tr("historySetNumber", { count: set.setNumber })}
                      </legend>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {exercise.supportsResistanceEditing ? (
                          <>
                            <label className="grid gap-1 text-xs font-medium">
                              {copy.repetitions}
                              <Input disabled={set.removed} inputMode="numeric" value={set.reps} onChange={(event) => updateSet(exercise.identity, set.key, { reps: event.target.value })} />
                            </label>
                            <label className="grid gap-1 text-xs font-medium">
                              {copy.loadKg}
                              <Input disabled={set.removed} inputMode="decimal" value={set.weightKg} onChange={(event) => updateSet(exercise.identity, set.key, { weightKg: event.target.value })} />
                            </label>
                          </>
                        ) : null}
                        <label className="grid gap-1 text-xs font-medium">
                          {copy.setType}
                          <select disabled={set.removed} className="min-h-10 rounded-lg border border-input bg-background px-2 text-sm" value={set.setType} onChange={(event) => updateSet(exercise.identity, set.key, { setType: event.target.value })}>
                            {setTypes.map((type) => <option key={type} value={type}>{workoutSetTypeLabel(type, locale) ?? tr("historyNoMetric")}</option>)}
                          </select>
                        </label>
                        <label className="grid gap-1 text-xs font-medium">
                          {copy.rpe}
                          <Input disabled={set.removed} inputMode="decimal" value={set.rpe} onChange={(event) => updateSet(exercise.identity, set.key, { rpe: event.target.value })} />
                        </label>
                        <label className="grid gap-1 text-xs font-medium">
                          {copy.rir}
                          <Input disabled={set.removed} inputMode="decimal" value={set.rir} onChange={(event) => updateSet(exercise.identity, set.key, { rir: event.target.value })} />
                        </label>
                        <label className="grid gap-1 text-xs font-medium sm:col-span-3">
                          {copy.setNote}
                          <Input disabled={set.removed} maxLength={4000} value={set.notes} onChange={(event) => updateSet(exercise.identity, set.key, { notes: event.target.value })} />
                        </label>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant={set.removed ? "outline" : "ghost"}
                        className="mt-2"
                        onClick={() => toggleRemoved(exercise.identity, set.key)}
                      >
                        {set.removed ? <RotateCcw className="size-4" /> : <Trash2 className="size-4" />}
                        {set.removed ? copy.undoRemove : copy.removeSet}
                      </Button>
                    </fieldset>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <p className="mt-4 text-xs text-muted-foreground" role="status">
            {preview.length ? copy.changedSets(preview.length) : copy.noSetChanges}
          </p>
          {validation ? <p className="mt-2 text-sm text-destructive" role="alert">{validation}</p> : null}
          {revisionConflict ? (
            <div className="mt-3 rounded-xl border border-warning/30 bg-warning/5 p-3" role="alert">
              <p className="text-sm text-foreground">{copy.revisionConflict}</p>
              <Button type="button" variant="outline" className="mt-2" onClick={() => {
                onOpenChange(false);
                onChanged();
              }}>
                <RotateCcw className="size-4" />
                {copy.reloadLatest}
              </Button>
            </div>
          ) : null}
          <Button
            type="button"
            className="mt-4 min-h-12 w-full"
            disabled={busy || !hasChanges}
            onClick={() => void save()}
          >
            {busy ? tr("historySaving") : tr("historySaveCorrection")}
          </Button>
        </DialogContent>
      </Dialog>
      {discard.dialog}
    </>
  );
}
