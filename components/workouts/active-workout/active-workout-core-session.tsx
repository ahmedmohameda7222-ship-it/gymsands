"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toaster";
import {
  activeWorkoutCacheFromExecution,
  clearActiveWorkoutState,
  isValidActiveWorkoutRoute,
  readActiveWorkoutState,
  writeActiveWorkoutState
} from "@/lib/active-workout";
import { userSafeError } from "@/lib/error-formatting";
import { useActiveWorkoutTranslation } from "@/lib/i18n/active-workout";
import { readStoredTimestamp, workoutStorageKey } from "@/lib/workout-persistence";
import { getActiveWorkoutDeviceId } from "@/lib/workouts/active-workout-device";
import { activeSessionClock } from "@/lib/workouts/active-session-store/clock";
import {
  getActiveSessionStore,
  type ActiveSessionStore
} from "@/lib/workouts/active-session-store/store";
import { createSessionCommandId } from "@/lib/workouts/session-engine/commands";
import { planSessionAfterSetCompletion } from "@/lib/workouts/session-engine/reducer";
import { restTimerSelector, sessionTimerSelector } from "@/lib/workouts/session-engine/selectors";
import { getOrStartWorkoutSession } from "@/services/database/direct-workout-sessions";
import { activeSessionPersistenceAdapter } from "@/services/database/active-session-persistence-adapter";
import { getOrStartWorkoutDaySession } from "@/services/database/workout-sessions";
import {
  frozenLogCompatibility,
  frozenRepetitionsEntryDefault
} from "@/services/database/workout-session-prescriptions";
import {
  canUpdateWorkoutSetNote,
  parseWorkoutSetEffortInput,
  validateWorkoutSetEffortInput,
  WORKOUT_SET_NOTE_MAX_CODE_POINTS,
  workoutSetNoteCodePointLength
} from "@/services/database/workout-set-details";
import type {
  ExerciseLog,
  Workout,
  WorkoutPlanDaySession,
  WorkoutSession,
  WorkoutSessionExecutionState,
  WorkoutSessionPrescriptionItem,
  WorkoutSetType
} from "@/types";

import { ActiveWorkoutExecutionShell } from "./active-workout-execution-shell";
import {
  activeWorkoutNumber,
  activeWorkoutSetIsCompletable,
  type ActiveWorkoutCoreExercise,
  type ActiveWorkoutCoreLabels,
  type ActiveWorkoutCoreSet
} from "./active-workout-ui-model";

type ActiveWorkoutSource =
  | { kind: "plan-day"; day: WorkoutPlanDaySession }
  | { kind: "direct"; workout: Workout };

type ActiveWorkoutCoreSessionProps = {
  source: ActiveWorkoutSource;
  onOpenLegacySurface: (surface: "details" | "review") => void;
};

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase();
}

function setLogFor(
  logs: readonly ExerciseLog[],
  item: WorkoutSessionPrescriptionItem,
  setNumber: number
) {
  const name = normalizeName(item.activityName);
  return logs.find((log) =>
    log.set_number === setNumber
    && (
      Boolean(item.sourcePlanExerciseId && log.plan_exercise_id === item.sourcePlanExerciseId)
      || normalizeName(log.exercise_name) === name
    )
  ) ?? null;
}

function liveCategory(source: ActiveWorkoutSource, item: WorkoutSessionPrescriptionItem) {
  if (source.kind === "direct") {
    return source.workout.category || source.workout.target_muscle || source.workout.equipment || "Workout";
  }
  const exercise = source.day.exercises.find((candidate) => candidate.id === item.sourcePlanExerciseId);
  return exercise?.category || exercise?.target_muscle || exercise?.equipment || "Workout";
}

function makeCoreExercises(
  source: ActiveWorkoutSource,
  prescription: readonly WorkoutSessionPrescriptionItem[],
  logs: readonly ExerciseLog[]
): ActiveWorkoutCoreExercise[] {
  return prescription.map((item) => {
    const frozenSets = item.prescriptionSets.length ? item.prescriptionSets : [null];
    return {
      item,
      name: item.activityName,
      category: liveCategory(source, item),
      sets: frozenSets.map((prescriptionSet, index) => {
        const setNumber = prescriptionSet?.setOrder ?? index + 1;
        const log = setLogFor(logs, item, setNumber);
        const details = log?.set_details;
        return {
          setNumber,
          reps: log?.reps === null || log?.reps === undefined
            ? frozenRepetitionsEntryDefault(prescriptionSet)
            : String(log.reps),
          weightKg: log?.weight_kg === null || log?.weight_kg === undefined
            ? ""
            : String(log.weight_kg),
          notes: details?.notes ?? log?.notes ?? "",
          rpe: details?.rpe === null || details?.rpe === undefined ? "" : String(details.rpe),
          rir: details?.rir === null || details?.rir === undefined ? "" : String(details.rir),
          setType: details?.set_type ?? prescriptionSet?.setType ?? "other",
          sideMode: details?.side_mode ?? prescriptionSet?.sideMode ?? "none",
          plannedTempo: details?.planned_tempo ?? prescriptionSet?.tempoTarget ?? null,
          performedTempo: details?.performed_tempo ?? null,
          tempoAdherence: details?.tempo_adherence ?? "not_recorded",
          completedAt: log?.completed_at ?? null,
          prescriptionSet,
          hasPersistedDetails: Boolean(details)
        } satisfies ActiveWorkoutCoreSet;
      })
    };
  });
}

function cursorIndexes(
  state: WorkoutSessionExecutionState,
  exercises: readonly ActiveWorkoutCoreExercise[]
) {
  const exerciseIndex = Math.max(0, exercises.findIndex((exercise) =>
    exercise.item.id === state.active_snapshot_item_id
    || exercise.item.itemOrder === state.active_item_order
  ));
  const setIndex = Math.max(0, exercises[exerciseIndex]?.sets.findIndex((set) =>
    set.setNumber === state.active_set_number
  ) ?? 0);
  return { exerciseIndex, setIndex };
}

function updateExerciseSet(
  exercises: readonly ActiveWorkoutCoreExercise[],
  exerciseIndex: number,
  setIndex: number,
  patch: Partial<ActiveWorkoutCoreSet>
) {
  return exercises.map((exercise, currentExerciseIndex) =>
    currentExerciseIndex === exerciseIndex
      ? {
          ...exercise,
          sets: exercise.sets.map((set, currentSetIndex) =>
            currentSetIndex === setIndex ? { ...set, ...patch } : set
          )
        }
      : exercise
  );
}

function sourceRoute(source: ActiveWorkoutSource) {
  return source.kind === "plan-day"
    ? `/workouts/session/day/${source.day.id}`
    : `/workouts/session/${source.workout.id}`;
}

function sourceLabel(source: ActiveWorkoutSource) {
  return source.kind === "plan-day" ? source.day.day_name : source.workout.name;
}

export function ActiveWorkoutCoreSession({
  source,
  onOpenLegacySurface
}: ActiveWorkoutCoreSessionProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t, direction, formatters } = useActiveWorkoutTranslation();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [executionState, setExecutionState] = useState<WorkoutSessionExecutionState | null>(null);
  const [exercises, setExercises] = useState<ActiveWorkoutCoreExercise[]>([]);
  const [activeExerciseIndex, setActiveExerciseIndex] = useState(0);
  const [activeSetIndex, setActiveSetIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [restSecondsLeft, setRestSecondsLeft] = useState(0);
  const [isStarting, setIsStarting] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const storeRef = useRef<ActiveSessionStore | null>(null);
  const controllerDeviceIdRef = useRef<string | null>(null);
  const restExpiryRef = useRef<string | null>(null);

  const route = useMemo(() => sourceRoute(source), [source]);
  const label = useMemo(() => sourceLabel(source), [source]);
  const sourceIdentity = source.kind === "plan-day" ? source.day.id : source.workout.id;
  const timerKey = useMemo(
    () => workoutStorageKey(["aw5-session", user?.id ?? "anonymous", source.kind, sourceIdentity]),
    [source.kind, sourceIdentity, user?.id]
  );
  const restTimerKey = useMemo(
    () => workoutStorageKey(["aw5-rest", user?.id ?? "anonymous", source.kind, sourceIdentity]),
    [source.kind, sourceIdentity, user?.id]
  );

  const mirrorState = useCallback((next: WorkoutSessionExecutionState) => {
    setExecutionState(next);
    const now = activeSessionClock.getSnapshot();
    setElapsedSeconds(sessionTimerSelector(next, now));
    setRestSecondsLeft(restTimerSelector(next, now));
    if (user?.id) {
      writeActiveWorkoutState(user.id, activeWorkoutCacheFromExecution(next, {
        route,
        label,
        controllerDeviceId: controllerDeviceIdRef.current
      }, now));
    }
  }, [label, route, user?.id]);

  const rebuildFromStore = useCallback((store: ActiveSessionStore) => {
    const snapshot = store.getSnapshot();
    const nextState = snapshot.executionState;
    if (!nextState) throw new Error("The active workout has no execution state.");
    const nextExercises = makeCoreExercises(source, snapshot.prescription, snapshot.performedLogs);
    if (!nextExercises.length) throw new Error("The active workout has no frozen prescription.");
    const cursor = cursorIndexes(nextState, nextExercises);
    setExercises(nextExercises);
    setActiveExerciseIndex(Math.min(cursor.exerciseIndex, nextExercises.length - 1));
    setActiveSetIndex(Math.min(cursor.setIndex, Math.max(0, nextExercises[cursor.exerciseIndex]?.sets.length - 1)));
    mirrorState(nextState);
  }, [mirrorState, source]);

  useEffect(() => {
    let active = true;
    setIsStarting(true);
    setFeedback("");
    setSession(null);
    setExercises([]);
    if (!user?.id) {
      setIsStarting(false);
      toast({ title: t("header.signInRequired"), description: t("header.signInBeforeSaving") });
      return () => { active = false; };
    }

    const start = async () => {
      const candidate = source.kind === "direct"
        ? (() => {
            const stored = readActiveWorkoutState(user.id);
            return stored && stored.route === route && isValidActiveWorkoutRoute(stored.route)
              ? stored.sessionId
              : null;
          })()
        : null;
      const nextSession = source.kind === "plan-day"
        ? await getOrStartWorkoutDaySession(user.id, source.day)
        : await getOrStartWorkoutSession(user.id, source.workout, candidate);
      if (!active) return;

      controllerDeviceIdRef.current = getActiveWorkoutDeviceId();
      const store = getActiveSessionStore({
        userId: user.id,
        workoutSessionId: nextSession.id,
        adapter: activeSessionPersistenceAdapter,
        clearCompatibilityCache: () => clearActiveWorkoutState(user.id)
      });
      storeRef.current = store;
      await store.hydrate({
        legacyCache: {
          userId: user.id,
          sessionId: nextSession.id,
          startedAtMs: readStoredTimestamp(timerKey),
          restEndsAtMs: readStoredTimestamp(restTimerKey),
          restDurationSeconds: 75,
          controllerDeviceId: controllerDeviceIdRef.current
        }
      });
      let authoritative = store.getSnapshot().executionState;
      if (!authoritative) throw new Error("The active workout has no execution state.");

      if (controllerDeviceIdRef.current && authoritative.controller_device_id !== controllerDeviceIdRef.current) {
        const response = await store.dispatch({
          userId: user.id,
          workoutSessionId: nextSession.id,
          commandId: createSessionCommandId(),
          commandType: "move_cursor",
          payload: {
            active_snapshot_item_id: authoritative.active_snapshot_item_id,
            active_item_order: authoritative.active_item_order,
            active_set_number: authoritative.active_set_number,
            controller_device_id: controllerDeviceIdRef.current
          }
        });
        authoritative = response.state;
      }

      if (authoritative.view_state === "rest" && restTimerSelector(authoritative, activeSessionClock.getSnapshot()) <= 0) {
        const response = await store.dispatch({
          userId: user.id,
          workoutSessionId: nextSession.id,
          commandId: createSessionCommandId(),
          commandType: "clear_rest",
          payload: {
            view_state: "set_entry",
            completion_reason: "natural_expiration",
            controller_device_id: controllerDeviceIdRef.current
          }
        });
        authoritative = response.state;
      }

      store.reconcile(authoritative);
      if (!active) return;
      setSession(nextSession);
      rebuildFromStore(store);
    };

    void start().catch((error) => {
      if (!active) return;
      const message = userSafeError(error, t("header.loadFailedDescription"));
      setFeedback(message);
      toast({ title: t("header.loadFailedTitle"), description: message });
    }).finally(() => {
      if (active) setIsStarting(false);
    });

    return () => { active = false; };
  }, [rebuildFromStore, restTimerKey, route, source, t, timerKey, toast, user?.id]);

  useEffect(() => {
    const tick = () => {
      if (!executionState) return;
      const now = activeSessionClock.getSnapshot();
      setElapsedSeconds(sessionTimerSelector(executionState, now));
      const nextRest = restTimerSelector(executionState, now);
      setRestSecondsLeft(nextRest);
      if (executionState.view_state !== "rest" || nextRest > 0 || !user?.id || !session?.id) return;
      const expiryKey = `${executionState.revision}:${executionState.rest_ends_at}`;
      if (restExpiryRef.current === expiryKey) return;
      restExpiryRef.current = expiryKey;
      const store = storeRef.current;
      if (!store) return;
      void store.dispatch({
        userId: user.id,
        workoutSessionId: session.id,
        commandId: createSessionCommandId(),
        commandType: "clear_rest",
        payload: {
          view_state: "set_entry",
          completion_reason: "natural_expiration",
          controller_device_id: controllerDeviceIdRef.current
        }
      }).then((response) => {
        mirrorState(response.state);
        toast({ title: t("notifications.restFinished"), description: t("notifications.nextSetReady") });
      }).catch((error) => {
        console.warn("Plaivra could not close the expired rest period.", error);
      });
    };
    return activeSessionClock.subscribe(tick);
  }, [executionState, mirrorState, session?.id, t, toast, user?.id]);

  const activeExercise = exercises[activeExerciseIndex] ?? null;
  const activeSet = activeExercise?.sets[activeSetIndex] ?? null;
  const completedSets = exercises.reduce(
    (sum, exercise) => sum + exercise.sets.filter((set) => Boolean(set.completedAt)).length,
    0
  );
  const totalSets = exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
  const isResting = Boolean(executionState?.view_state === "rest" && restSecondsLeft > 0);
  const isPaused = executionState?.session_state === "paused";
  const currentRpe = validateWorkoutSetEffortInput(activeSet?.rpe ?? "", "rpe");
  const currentRir = validateWorkoutSetEffortInput(activeSet?.rir ?? "", "rir");

  const labels: ActiveWorkoutCoreLabels = {
    workoutContext: t("header.workoutDay"),
    exercises: t("navigation.exercises"),
    sets: t("set.labelPlural"),
    set: (number) => t("set.label", { count: formatters.integer(number) }),
    reps: t("set.reps"),
    weightKg: t("set.weightKg"),
    pause: t("common.pause"),
    resume: t("common.resume"),
    finish: t("common.finish"),
    more: t("common.more"),
    completeSet: (number) => t("set.finishNumbered", { count: formatters.integer(number) }),
    rest: t("rest.resting"),
    skipRest: t("rest.skip"),
    addThirtySeconds: t("rest.addThirtySeconds"),
    startRest: t("rest.start"),
    currentSessionHeat: t("heatMap.currentSessionHeat"),
    openDetails: t("accessibility.openSessionMenu"),
    advancedDetails: t("details.advancedDetails"),
    setType: t("set.type"),
    note: t("set.note"),
    optional: t("common.optional"),
    previousSet: t("exercise.previousSet"),
    fullDetails: t("actions.sessionDetails"),
    close: t("common.close"),
    invalidRpe: t("set.rpeInvalid"),
    invalidRir: t("set.rirInvalid")
  };

  function patchActiveSet(patch: Partial<ActiveWorkoutCoreSet>) {
    if (!activeSet) return;
    setExercises((current) => updateExerciseSet(current, activeExerciseIndex, activeSetIndex, patch));
  }

  async function moveToSet(nextSetIndex: number) {
    if (!activeExercise || !session?.id || !user?.id || isBusy) return;
    const nextSet = activeExercise.sets[nextSetIndex];
    if (!nextSet) return;
    setActiveSetIndex(nextSetIndex);
    const store = storeRef.current;
    if (!store) return;
    try {
      const response = await store.dispatch({
        userId: user.id,
        workoutSessionId: session.id,
        commandId: createSessionCommandId(),
        commandType: "move_cursor",
        payload: {
          active_snapshot_item_id: activeExercise.item.id,
          active_item_order: activeExercise.item.itemOrder,
          active_set_number: nextSet.setNumber,
          view_state: "set_entry",
          controller_device_id: controllerDeviceIdRef.current
        }
      });
      mirrorState(response.state);
    } catch (error) {
      const snapshot = store.getSnapshot().executionState;
      if (snapshot) {
        const cursor = cursorIndexes(snapshot, exercises);
        setActiveExerciseIndex(cursor.exerciseIndex);
        setActiveSetIndex(cursor.setIndex);
      }
      toast({ title: t("completion.saveFailedTitle"), description: userSafeError(error) });
    }
  }

  async function completeCurrentSet() {
    if (!activeExercise || !activeSet || !session?.id || !user?.id || isBusy || isStarting) return;
    if (!activeWorkoutSetIsCompletable(activeSet)) return;
    if (currentRpe.error || currentRir.error) {
      setDetailsOpen(true);
      return;
    }
    const store = storeRef.current;
    if (!store) return;
    const completedAt = new Date().toISOString();
    const previousExercises = exercises;
    const optimistic = updateExerciseSet(exercises, activeExerciseIndex, activeSetIndex, { completedAt });
    let transition;
    try {
      const snapshot = store.getSnapshot();
      transition = planSessionAfterSetCompletion({
        userId: user.id,
        workoutSessionId: session.id,
        currentSnapshotItemId: activeExercise.item.id,
        currentSetNumber: activeSet.setNumber,
        prescription: snapshot.prescription,
        performedLogs: snapshot.performedLogs,
        restDurationSeconds: activeSet.prescriptionSet?.restSeconds ?? 75,
        controllerDeviceId: controllerDeviceIdRef.current
      });
    } catch (error) {
      toast({ title: t("completion.saveFailedTitle"), description: userSafeError(error) });
      return;
    }

    setIsBusy(true);
    setFeedback("");
    setExercises(optimistic);
    try {
      const response = await store.completeCanonicalSet({
        logs: [{
          planExerciseId: activeExercise.item.sourcePlanExerciseId,
          exerciseOrder: activeExercise.item.itemOrder,
          exerciseName: activeExercise.item.activityName,
          exerciseCategory: activeExercise.category,
          ...frozenLogCompatibility(activeExercise.item, activeSet.prescriptionSet),
          setNumber: activeSet.setNumber,
          reps: activeWorkoutNumber(activeSet.reps),
          weightKg: activeWorkoutNumber(activeSet.weightKg),
          notes: activeSet.notes || null,
          completedAt,
          setDetails: {
            schemaVersion: 1,
            setType: activeSet.setType,
            rpe: parseWorkoutSetEffortInput(activeSet.rpe, "rpe"),
            rir: parseWorkoutSetEffortInput(activeSet.rir, "rir"),
            notes: activeSet.notes || null,
            sideMode: activeSet.sideMode,
            plannedTempo: activeSet.plannedTempo,
            performedTempo: activeSet.performedTempo,
            tempoAdherence: activeSet.tempoAdherence,
            source: "manual",
            sourceProvider: "plaivra",
            sourceVersion: "aw5-v1"
          }
        }],
        executionIntent: {
          userId: user.id,
          workoutSessionId: session.id,
          commandId: createSessionCommandId(),
          commandType: "complete_set_transition",
          payload: {
            active_snapshot_item_id: transition.patch.active_snapshot_item_id,
            active_item_order: transition.patch.active_item_order,
            active_set_number: transition.patch.active_set_number,
            view_state: transition.patch.view_state,
            rest_duration_seconds: transition.patch.rest_duration_seconds,
            controller_device_id: transition.patch.controller_device_id
          }
        }
      });
      mirrorState(response.state);
      setActiveExerciseIndex(transition.nextExerciseIndex);
      setActiveSetIndex(transition.nextSetIndex);
      setExercises((current) => updateExerciseSet(current, activeExerciseIndex, activeSetIndex, {
        completedAt,
        hasPersistedDetails: true
      }));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "canonical_set_saved_execution_sync_failed") {
        try {
          await store.hydrate({ force: true });
          rebuildFromStore(store);
        } catch (reconcileError) {
          console.warn("Plaivra saved the set but could not reconcile the session cursor.", reconcileError);
        }
      } else {
        setExercises(previousExercises);
      }
      const message = userSafeError(error, t("offline.keepOpenRetry"));
      setFeedback(message);
      toast({ title: t("completion.saveFailedTitle"), description: message });
    } finally {
      setIsBusy(false);
    }
  }

  async function dispatchSimple(
    commandType: "pause" | "resume" | "start_rest" | "clear_rest",
    payload: Record<string, unknown>
  ) {
    if (!session?.id || !user?.id || isBusy) return;
    const store = storeRef.current;
    if (!store) return;
    setIsBusy(true);
    try {
      const response = await store.dispatch({
        userId: user.id,
        workoutSessionId: session.id,
        commandId: createSessionCommandId(),
        commandType,
        payload
      } as Parameters<ActiveSessionStore["dispatch"]>[0]);
      mirrorState(response.state);
    } catch (error) {
      const message = userSafeError(error);
      setFeedback(message);
      toast({ title: t("completion.saveFailedTitle"), description: message });
    } finally {
      setIsBusy(false);
    }
  }

  const detailsContent = activeSet ? (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="active-set-rpe">RPE</Label>
          <Input
            id="active-set-rpe"
            dir="ltr"
            inputMode="decimal"
            value={activeSet.rpe}
            onChange={(event) => patchActiveSet({ rpe: event.target.value })}
            aria-invalid={Boolean(currentRpe.error)}
            aria-describedby={currentRpe.error ? "active-set-rpe-error" : undefined}
            disabled={isBusy}
          />
          {currentRpe.error ? <p id="active-set-rpe-error" role="alert" className="text-xs text-destructive">{labels.invalidRpe}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="active-set-rir">RIR</Label>
          <Input
            id="active-set-rir"
            dir="ltr"
            inputMode="decimal"
            value={activeSet.rir}
            onChange={(event) => patchActiveSet({ rir: event.target.value })}
            aria-invalid={Boolean(currentRir.error)}
            aria-describedby={currentRir.error ? "active-set-rir-error" : undefined}
            disabled={isBusy}
          />
          {currentRir.error ? <p id="active-set-rir-error" role="alert" className="text-xs text-destructive">{labels.invalidRir}</p> : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="active-set-type">{labels.setType}</Label>
        <select
          id="active-set-type"
          value={activeSet.setType}
          onChange={(event) => patchActiveSet({ setType: event.target.value as WorkoutSetType })}
          className="flex h-12 w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          disabled={isBusy}
        >
          {(["normal", "warmup", "working", "failure", "drop", "backoff", "amrap", "timed", "other"] as const).map((value) => (
            <option key={value} value={value}>{t(`set.${value}`)}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="active-set-note">{labels.note}</Label>
          <span id="active-set-note-limit" dir="ltr" className="text-xs tabular-nums text-muted-foreground">
            {workoutSetNoteCodePointLength(activeSet.notes)}/{WORKOUT_SET_NOTE_MAX_CODE_POINTS}
          </span>
        </div>
        <textarea
          id="active-set-note"
          dir="auto"
          aria-describedby="active-set-note-limit"
          className="min-h-24 w-full resize-y rounded-xl border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={activeSet.notes}
          onChange={(event) => {
            if (canUpdateWorkoutSetNote(activeSet.notes, event.target.value)) patchActiveSet({ notes: event.target.value });
          }}
          placeholder={labels.optional}
          disabled={isBusy}
        />
      </div>

      <Button type="button" variant="outline" className="min-h-12 w-full" onClick={() => onOpenLegacySurface("details")}>
        <ExternalLink className="h-4 w-4" /> {labels.fullDetails}
      </Button>
    </div>
  ) : null;

  if (!activeExercise || !activeSet) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-border/70 bg-card p-5 text-sm" role="status">
        {feedback || t("header.loadingSession")}
      </div>
    );
  }

  const contextLabel = source.kind === "plan-day"
    ? source.day.weekday || t("header.workoutDay")
    : source.workout.category || source.workout.target_muscle || t("header.workoutDay");

  return (
    <div
      data-active-set-state
      data-active-set-number={activeSet.setNumber}
      data-active-set-persisted={activeSet.completedAt ? "true" : "false"}
      data-active-set-completed={activeSet.completedAt ? "true" : "false"}
      data-active-set-has-details={activeSet.hasPersistedDetails ? "true" : "false"}
    >
      <ActiveWorkoutExecutionShell
        labels={labels}
        direction={direction}
        sessionLabel={label}
        contextLabel={contextLabel}
        exerciseName={activeExercise.name}
        exerciseIndex={activeExerciseIndex}
        exerciseCount={exercises.length}
        setIndex={activeSetIndex}
        setCount={activeExercise.sets.length}
        completedSets={completedSets}
        totalSets={totalSets}
        elapsedLabel={formatters.timer(elapsedSeconds)}
        restLabel={formatters.timer(restSecondsLeft)}
        reps={activeSet.reps}
        weightKg={activeSet.weightKg}
        setPath={activeExercise.sets.map((set, index) => ({
          number: set.setNumber,
          completed: Boolean(set.completedAt),
          active: index === activeSetIndex
        }))}
        isResting={isResting}
        isPaused={isPaused}
        isBusy={isBusy || isStarting}
        canCompleteSet={activeWorkoutSetIsCompletable(activeSet)}
        detailsOpen={detailsOpen}
        onDetailsOpenChange={setDetailsOpen}
        onChangeReps={(value) => patchActiveSet({ reps: value })}
        onChangeWeight={(value) => patchActiveSet({ weightKg: value })}
        onSelectSet={(index) => { void moveToSet(index); }}
        onCompleteSet={() => { void completeCurrentSet(); }}
        onSkipRest={() => { void dispatchSimple("clear_rest", {
          view_state: "set_entry",
          completion_reason: "user_skipped",
          controller_device_id: controllerDeviceIdRef.current
        }); }}
        onAddRest={() => { void dispatchSimple("start_rest", {
          duration_seconds: Math.max(30, restSecondsLeft + 30),
          controller_device_id: controllerDeviceIdRef.current
        }); }}
        onStartRest={(seconds) => { void dispatchSimple("start_rest", {
          duration_seconds: seconds,
          controller_device_id: controllerDeviceIdRef.current
        }); }}
        onTogglePause={() => { void dispatchSimple(isPaused ? "resume" : "pause", {
          controller_device_id: controllerDeviceIdRef.current
        }); }}
        onFinishSession={() => onOpenLegacySurface("review")}
        detailsContent={detailsContent}
        feedback={feedback ? <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">{feedback}</div> : null}
      />
    </div>
  );
}
