"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Clock3, Mic, Pause, Play, RotateCcw, SkipForward, Square } from "lucide-react";

import { CookingResume } from "@/components/nutrition/cooking/cooking-resume";
import {
  deriveCookingTimeline,
  type CookingActionFact,
} from "@/lib/nutrition-v1/cooking-engine";
import {
  acknowledgeCookingMutations,
  completeLocalCookingSession,
  cookingLocalStorageKey,
  endLocalCookingSession,
  materializeCookingLocalSession,
  parseCookingLocalSession,
  queueCookingMutation,
  recoverCookingLocalSession,
  serializeCookingLocalSession,
  startOverLocalCookingSession,
  type CookingLocalActionStateValue,
  type CookingLocalSession,
  type CookingLocalTimer,
  type CookingOfflineMutation,
} from "@/lib/nutrition-v1/cooking-local-store";
import { reconstructCookingTimer } from "@/lib/nutrition-v1/cooking-timers";
import { supabase } from "@/lib/supabase/client";
import {
  completeCookingSession,
  endCookingSession,
  getActiveCookingSession,
  startCookingSession,
  startOverCookingSession,
  syncCookingSessionState,
} from "@/services/nutrition-v1/server/cooking-sessions";

type WakeLockHandle = { release(): Promise<void> };
type WakeLockManager = { request(type: "screen"): Promise<WakeLockHandle> };

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function actionFacts(session: CookingLocalSession): CookingActionFact[] {
  return session.frozenRecipeSnapshot.actions.flatMap((row, index) => {
    const id = asString(row.id);
    const instruction = asString(row.instruction);
    if (!id || !instruction) return [];
    return [{
      id,
      position: Number.isFinite(Number(row.position)) ? Number(row.position) : index,
      instruction,
      trackKey: asString(row.track_key ?? row.trackKey),
      dependencyActionIds: asStringArray(row.dependency_action_ids ?? row.dependencyActionIds),
      canRunInBackground: row.can_run_in_background === true || row.canRunInBackground === true,
      conditionCue: asString(row.doneness_or_result_cue ?? row.conditionCue),
    }];
  });
}

function stateIds(session: CookingLocalSession, state: CookingLocalActionStateValue) {
  return session.actionStates.filter((item) => item.state === state).map((item) => item.actionKey);
}

function nowIso() {
  return new Date().toISOString();
}

function timerSyncRows(session: CookingLocalSession) {
  return session.timers.map((timer) => ({
    id: timer.id,
    actionStateId: timer.actionStateId,
    timerName: timer.name,
    durationSeconds: timer.durationSeconds,
    status: timer.status,
    startedAt: timer.startedAt,
    targetAt: timer.targetAt,
    pausedAt: timer.pausedAt,
    pausedRemainingSeconds: timer.pausedRemainingSeconds,
    completedAt: timer.completedAt,
    cancelledAt: timer.cancelledAt ?? null,
  }));
}

function actionSyncRows(session: CookingLocalSession) {
  return session.actionStates.map((item) => ({
    id: item.id,
    actionKey: item.actionKey,
    state: item.state,
    stateRevision: item.stateRevision,
    activatedAt: item.activatedAt ?? null,
    completedAt: item.completedAt ?? null,
    deferredAt: item.deferredAt ?? null,
    skippedAt: item.skippedAt ?? null,
  }));
}

export function CookingMode({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [session, setSession] = useState<CookingLocalSession | null>(null);
  const [resumeCandidate, setResumeCandidate] = useState<CookingLocalSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [direction, setDirection] = useState<"ltr" | "rtl">("ltr");
  const [clock, setClock] = useState(() => Date.now());
  const wakeLockRef = useRef<WakeLockHandle | null>(null);
  const storageKey = useMemo(() => cookingLocalStorageKey(recipeId), [recipeId]);

  const writeLocal = useCallback((next: CookingLocalSession) => {
    window.localStorage.setItem(storageKey, serializeCookingLocalSession(next));
  }, [storageKey]);

  const materialize = useCallback((bundle: Awaited<ReturnType<typeof getActiveCookingSession>>) => {
    if (!bundle) return null;
    const local = materializeCookingLocalSession({
      session: bundle.session as unknown as Record<string, unknown>,
      actionStates: bundle.actionStates as unknown as Record<string, unknown>[],
      timers: bundle.timers.map((timer) => {
        const actionState = bundle.actionStates.find((item) => item.id === timer.actionStateId);
        return {
          ...timer,
          actionId: actionState?.actionKey ?? "",
        } as unknown as Record<string, unknown>;
      }),
    });
    return local;
  }, []);

  const initialize = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDirection(document.documentElement.dir === "rtl" ? "rtl" : "ltr");
    const recovered = recoverCookingLocalSession(window.localStorage.getItem(storageKey), new Date());
    if (recovered?.session.status === "active" && recovered.session.recipeId === recipeId) {
      setResumeCandidate(recovered.session);
      setLoading(false);
      return;
    }
    if (!supabase) {
      setError("Cooking Mode is unavailable until the app connection is configured.");
      setLoading(false);
      return;
    }
    try {
      const auth = await supabase.auth.getUser();
      if (auth.error) throw auth.error;
      if (!auth.data.user) throw new Error("Sign in to start Cooking Mode.");
      const ownerId = auth.data.user.id;
      setUserId(ownerId);
      const active = await getActiveCookingSession(supabase, ownerId, recipeId);
      if (active) {
        const local = materialize(active);
        if (!local) throw new Error("Cooking Session could not be recovered.");
        writeLocal(local);
        setResumeCandidate(local);
        return;
      }
      const started = await startCookingSession(supabase, ownerId, { recipeId });
      const created = await getActiveCookingSession(supabase, ownerId, recipeId);
      if (!created) throw new Error(`Cooking Session ${started.sessionId} could not be loaded.`);
      const local = materialize(created);
      if (!local) throw new Error("Cooking Session could not be materialized.");
      writeLocal(local);
      setSession(local);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Cooking Mode could not be started.");
    } finally {
      setLoading(false);
    }
  }, [materialize, recipeId, storageKey, writeLocal]);

  useEffect(() => { void initialize(); }, [initialize]);

  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function releaseWakeLock() {
      const wakeLock = wakeLockRef.current;
      wakeLockRef.current = null;
      if (wakeLock) await wakeLock.release();
    }
    async function acquireWakeLock() {
      if (cancelled || document.visibilityState !== "visible" || wakeLockRef.current) return;
      // navigator.wakeLock is optional; Cooking Mode remains fully usable without it.
      const manager = (navigator as Navigator & { wakeLock?: WakeLockManager }).wakeLock;
      if (!manager) return;
      try {
        wakeLockRef.current = await manager.request("screen");
      } catch {
        wakeLockRef.current = null;
      }
    }
    function visibilitychange() {
      if (document.visibilityState === "visible") void acquireWakeLock();
      else void releaseWakeLock();
    }
    document.addEventListener("visibilitychange", visibilitychange);
    void acquireWakeLock();
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", visibilitychange);
      void releaseWakeLock();
    };
  }, []);

  const recoveredTimers = useMemo(() => {
    if (!session) return [];
    return session.timers.map((timer) => {
      const { actionStateId, cancelledAt, ...snapshot } = timer;
      return { ...reconstructCookingTimer(snapshot, new Date(clock)), actionStateId, cancelledAt };
    });
  }, [clock, session]);

  const facts = useMemo(() => session ? actionFacts(session) : [], [session]);
  const timeline = useMemo(() => {
    if (!session) return null;
    return deriveCookingTimeline(
      { actions: facts },
      {
        completedActionIds: stateIds(session, "completed"),
        deferredActionIds: stateIds(session, "deferred"),
        skippedActionIds: stateIds(session, "skipped"),
        runningBackgroundActionIds: stateIds(session, "running_background"),
        waitingForConditionActionIds: stateIds(session, "waiting_for_condition"),
        timers: recoveredTimers.map((timer) => ({
          id: timer.id,
          actionId: timer.actionId,
          name: timer.name,
          status: timer.status,
          completedAt: timer.completedAt,
        })),
      },
    );
  }, [facts, recoveredTimers, session]);

  const persistAndSync = useCallback(async (
    next: CookingLocalSession,
    operation: CookingOfflineMutation,
  ) => {
    const queued = queueCookingMutation(next, operation);
    writeLocal(queued);
    setSession(queued);
    if (!supabase || !userId || !navigator.onLine || queued.status !== "active") return queued;
    try {
      const result = await syncCookingSessionState(supabase, userId, queued.sessionId, {
        expectedRevision: queued.stateRevision,
        currentActionKey: queued.currentActionKey,
        lastActiveAt: queued.lastActiveAt,
        actionStates: actionSyncRows(queued),
        timers: timerSyncRows(queued),
      });
      const acknowledged = acknowledgeCookingMutations({ ...queued, stateRevision: result.stateRevision }, [operation.operationId]);
      writeLocal(acknowledged);
      setSession(acknowledged);
      return acknowledged;
    } catch {
      setStatusMessage("Saved on this device · server sync will retry when available.");
      return queued;
    }
  }, [userId, writeLocal]);

  useEffect(() => {
    if (!session || session.status !== "active") return;
    const newlyExpired = recoveredTimers.filter((timer) => {
      const original = session.timers.find((item) => item.id === timer.id);
      return timer.expired && timer.status === "completed" && original?.status === "running";
    });
    if (!newlyExpired.length) return;
    const now = nowIso();
    let next = {
      ...session,
      lastActiveAt: now,
      timers: session.timers.map((timer) => {
        const expired = newlyExpired.find((item) => item.id === timer.id);
        return expired ? { ...timer, status: "completed" as const, completedAt: expired.completedAt ?? now } : timer;
      }),
    };
    for (const timer of newlyExpired) {
      next = queueCookingMutation(next, {
        operationId: crypto.randomUUID(),
        type: "timer",
        payload: { timerId: timer.id, status: "completed" },
        createdAt: now,
      });
    }
    writeLocal(next);
    setSession(next);
  }, [recoveredTimers, session, writeLocal]);

  const flushPending = useCallback(async (candidate: CookingLocalSession) => {
    if (!candidate.pendingMutations.length || !supabase || !userId || !navigator.onLine || candidate.status !== "active") return candidate;
    try {
      const result = await syncCookingSessionState(supabase, userId, candidate.sessionId, {
        expectedRevision: candidate.stateRevision,
        currentActionKey: candidate.currentActionKey,
        lastActiveAt: candidate.lastActiveAt,
        actionStates: actionSyncRows(candidate),
        timers: timerSyncRows(candidate),
      });
      const acknowledged = acknowledgeCookingMutations(
        { ...candidate, stateRevision: result.stateRevision },
        candidate.pendingMutations.map((item) => item.operationId),
      );
      writeLocal(acknowledged);
      return acknowledged;
    } catch {
      return candidate;
    }
  }, [userId, writeLocal]);

  const onResume = useCallback(() => {
    if (!resumeCandidate) return;
    setSession(resumeCandidate);
    setResumeCandidate(null);
    void flushPending(resumeCandidate).then((next) => setSession(next));
  }, [flushPending, resumeCandidate]);

  const onStartOver = useCallback(async () => {
    if (!resumeCandidate) return;
    if (!supabase || !navigator.onLine) {
      setError("Start Over needs a connection so the previous session can be ended safely. You can still Resume offline.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let ownerId = userId;
      if (!ownerId) {
        const auth = await supabase.auth.getUser();
        if (auth.error) throw auth.error;
        ownerId = auth.data.user?.id ?? null;
        if (!ownerId) throw new Error("Sign in to restart Cooking Mode.");
        setUserId(ownerId);
      }
      const restarted = await startOverCookingSession(supabase, ownerId, resumeCandidate.sessionId);
      const active = await getActiveCookingSession(supabase, ownerId, recipeId);
      if (!active) throw new Error("Restarted Cooking Session could not be loaded.");
      const fromServer = materialize(active);
      const fresh = fromServer ?? startOverLocalCookingSession(resumeCandidate, restarted.sessionId);
      writeLocal(fresh);
      setSession(fresh);
      setResumeCandidate(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Cooking Session could not be restarted.");
    } finally {
      setBusy(false);
    }
  }, [materialize, recipeId, resumeCandidate, userId, writeLocal]);

  const updateAction = useCallback(async (state: CookingLocalActionStateValue) => {
    if (!session || !timeline?.now) return;
    const now = nowIso();
    const actionKey = timeline.now.id;
    const nextRevision = session.stateRevision + 1;
    const actionStates = session.actionStates.map((item) => item.actionKey !== actionKey ? item : {
      ...item,
      state,
      stateRevision: nextRevision,
      activatedAt: item.activatedAt ?? now,
      completedAt: state === "completed" ? now : item.completedAt ?? null,
      deferredAt: state === "deferred" ? now : item.deferredAt ?? null,
      skippedAt: state === "skipped" ? now : item.skippedAt ?? null,
    });
    const nextFacts = facts;
    const preview = deriveCookingTimeline(
      { actions: nextFacts },
      {
        completedActionIds: actionStates.filter((item) => item.state === "completed").map((item) => item.actionKey),
        deferredActionIds: actionStates.filter((item) => item.state === "deferred").map((item) => item.actionKey),
        skippedActionIds: actionStates.filter((item) => item.state === "skipped").map((item) => item.actionKey),
        runningBackgroundActionIds: actionStates.filter((item) => item.state === "running_background").map((item) => item.actionKey),
        waitingForConditionActionIds: actionStates.filter((item) => item.state === "waiting_for_condition").map((item) => item.actionKey),
        timers: recoveredTimers,
      },
    );
    const next: CookingLocalSession = {
      ...session,
      actionStates,
      currentActionKey: preview.now?.id ?? null,
      lastActiveAt: now,
    };
    const operation: CookingOfflineMutation = {
      operationId: crypto.randomUUID(),
      type: "action_state",
      payload: { actionKey, state },
      createdAt: now,
    };
    const persisted = await persistAndSync(next, operation);
    if (state === "completed" && !preview.now && !preview.running.length) {
      const completed = completeLocalCookingSession(persisted, now);
      writeLocal(completed);
      setSession(completed);
      if (supabase && userId && navigator.onLine) {
        try { await completeCookingSession(supabase, userId, completed.sessionId, now); } catch { /* local completion remains recoverable */ }
      }
    }
  }, [facts, persistAndSync, recoveredTimers, session, timeline, userId, writeLocal]);

  const startTimer = useCallback(async () => {
    if (!session || !timeline?.now) return;
    const raw = session.frozenRecipeSnapshot.actions.find((item) => item.id === timeline.now?.id);
    const duration = Number(raw?.duration_seconds ?? raw?.durationSeconds);
    if (!Number.isFinite(duration) || duration <= 0) return;
    const actionState = session.actionStates.find((item) => item.actionKey === timeline.now?.id);
    if (!actionState) return;
    const now = new Date();
    const timer: CookingLocalTimer = {
      id: crypto.randomUUID(),
      actionId: timeline.now.id,
      actionStateId: actionState.id,
      name: `Step ${timeline.now.position + 1}`,
      durationSeconds: Math.ceil(duration),
      status: "running",
      startedAt: now.toISOString(),
      targetAt: new Date(now.getTime() + duration * 1000).toISOString(),
      pausedAt: null,
      pausedRemainingSeconds: null,
      completedAt: null,
      cancelledAt: null,
    };
    const next = { ...session, timers: [...session.timers, timer], lastActiveAt: now.toISOString() };
    await persistAndSync(next, {
      operationId: crypto.randomUUID(),
      type: "timer",
      payload: { timerId: timer.id, status: "running" },
      createdAt: now.toISOString(),
    });
  }, [persistAndSync, session, timeline]);

  const toggleTimer = useCallback(async (timerId: string) => {
    if (!session) return;
    const timer = session.timers.find((item) => item.id === timerId);
    if (!timer || (timer.status !== "running" && timer.status !== "paused")) return;
    const now = new Date();
    let updated: CookingLocalTimer;
    if (timer.status === "running") {
      const reconstructed = reconstructCookingTimer(timer, now);
      updated = {
        ...timer,
        status: "paused",
        pausedAt: now.toISOString(),
        pausedRemainingSeconds: reconstructed.remainingSeconds,
      };
    } else {
      const remaining = timer.pausedRemainingSeconds ?? 0;
      updated = {
        ...timer,
        status: "running",
        pausedAt: null,
        pausedRemainingSeconds: null,
        targetAt: new Date(now.getTime() + remaining * 1000).toISOString(),
        startedAt: timer.startedAt ?? now.toISOString(),
      };
    }
    const next = { ...session, timers: session.timers.map((item) => item.id === timerId ? updated : item), lastActiveAt: now.toISOString() };
    await persistAndSync(next, {
      operationId: crypto.randomUUID(),
      type: "timer",
      payload: { timerId, status: updated.status },
      createdAt: now.toISOString(),
    });
  }, [persistAndSync, session]);

  const onBack = useCallback(() => router.back(), [router]);

  const onEndCooking = useCallback(async () => {
    if (!session) return;
    const now = nowIso();
    const ended = endLocalCookingSession(session, now);
    writeLocal(ended);
    setSession(ended);
    if (supabase && userId && navigator.onLine) {
      try { await endCookingSession(supabase, userId, session.sessionId, now); } catch { /* local End Cooking truth is retained */ }
    }
    router.back();
  }, [router, session, userId, writeLocal]);

  async function requestMicrophone() {
    setStatusMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setStatusMessage("Voice permission is ready. Touch controls remain fully available.");
    } catch {
      setStatusMessage("Microphone unavailable. Continue with the complete touch controls.");
    }
  }

  if (loading) {
    return <main className="mx-auto max-w-[720px] px-4 py-8"><div className="h-28 animate-pulse rounded-2xl bg-muted" /></main>;
  }

  if (resumeCandidate) {
    return <><CookingResume session={resumeCandidate} onResume={onResume} onStartOver={() => void onStartOver()} busy={busy} />{error ? <p className="mx-auto max-w-[620px] px-4 text-sm text-destructive" role="alert">{error}</p> : null}</>;
  }

  if (error || !session) {
    return <main className="mx-auto max-w-[620px] px-4 py-8"><p className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive" role="alert">{error ?? "Cooking Session unavailable."}</p><button type="button" onClick={() => void initialize()} className="mt-3 min-h-[44px] rounded-xl border border-border px-4 text-sm font-medium">Retry</button></main>;
  }

  if (session.status === "completed") {
    return <main className="mx-auto max-w-[620px] px-4 py-8"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Cooking complete</p><h1 className="mt-2 text-2xl font-semibold">Session complete</h1><p className="mt-2 text-sm text-muted-foreground">Cooking completion is separate from adding anything to your Diary.</p><button type="button" onClick={onBack} className="mt-5 min-h-[44px] rounded-xl border border-border px-4 text-sm font-medium">Back</button></main>;
  }

  const rawNow = session.frozenRecipeSnapshot.actions.find((item) => item.id === timeline?.now?.id);
  const currentDuration = Number(rawNow?.duration_seconds ?? rawNow?.durationSeconds);
  const canStartTimer = Number.isFinite(currentDuration) && currentDuration > 0;
  const canDefer = Boolean(timeline?.now && (timeline.upNext || timeline.now.canRunInBackground || timeline.now.conditionCue));
  const runningTimers = recoveredTimers.filter((timer) => timer.status === "running" || timer.status === "paused");
  const recipeName = asString(session.frozenRecipeSnapshot.recipe.name) ?? "Recipe";

  return (
    <main dir={direction} className="mx-auto w-full max-w-[720px] space-y-5 px-4 py-4 sm:px-6 sm:py-6">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-3">
        <button type="button" onClick={onBack} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl px-3 text-sm font-medium hover:bg-muted"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back</button>
        <p className="min-w-0 flex-1 break-words text-center text-sm font-semibold">{recipeName}</p>
        <button type="button" onClick={onEndCooking} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl px-3 text-sm font-medium text-muted-foreground hover:bg-muted"><Square className="h-4 w-4" aria-hidden="true" />End Cooking</button>
      </header>

      <section aria-labelledby="attention-heading" className="border-b border-border/70 pb-4">
        <h2 id="attention-heading" className="text-xs font-bold tracking-[0.16em] text-foreground">ATTENTION</h2>
        {timeline?.attention.length ? <div className="mt-2 space-y-2">{timeline.attention.map((item) => <div key={item.timerId} className="rounded-xl border border-foreground/20 px-4 py-3"><p className="break-words text-sm font-semibold">{item.timerName} timer finished</p><p className="mt-1 text-xs text-muted-foreground">Timer finished. Confirm the Recipe condition yourself before marking the step Done.</p></div>)}</div> : <p className="mt-2 text-sm text-muted-foreground">No timer needs attention.</p>}
      </section>

      <section aria-labelledby="now-heading" className="border-b border-border/70 pb-5">
        <h2 id="now-heading" className="text-xs font-bold tracking-[0.16em] text-foreground">NOW</h2>
        {timeline?.now ? <div className="mt-3"><p className="break-words text-xl font-semibold leading-8">{timeline.now.instruction}</p>{timeline.now.conditionCue ? <p className="mt-2 break-words text-sm text-muted-foreground">Recipe cue: {timeline.now.conditionCue}</p> : null}<div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={() => setStatusMessage(`Repeat: ${timeline.now?.instruction ?? ""}`)} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium"><RotateCcw className="h-4 w-4" aria-hidden="true" />Repeat</button>{canStartTimer ? <button type="button" onClick={() => void startTimer()} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium"><Clock3 className="h-4 w-4" aria-hidden="true" />Start timer</button> : null}{canDefer ? <button type="button" onClick={() => void updateAction("deferred")} className="inline-flex min-h-[44px] items-center rounded-xl border border-border px-4 text-sm font-medium">Later</button> : null}<button type="button" onClick={() => void updateAction("completed")} className="inline-flex min-h-[44px] items-center rounded-xl bg-foreground px-5 text-sm font-semibold text-background">Done</button><button type="button" onClick={() => void updateAction("skipped")} className="inline-flex min-h-[44px] items-center gap-1 rounded-xl px-3 text-sm font-medium text-muted-foreground hover:bg-muted"><SkipForward className="h-4 w-4" aria-hidden="true" />Skip</button></div></div> : <p className="mt-2 text-sm text-muted-foreground">No step is ready right now.</p>}
      </section>

      <section aria-labelledby="running-heading" className="border-b border-border/70 pb-4">
        <h2 id="running-heading" className="text-xs font-bold tracking-[0.16em] text-foreground">RUNNING</h2>
        {timeline?.running.length || runningTimers.length ? <div className="mt-2 space-y-2">{timeline?.running.filter((item) => item.kind === "action").map((item) => <p key={`action-${item.actionId}`} className="break-words rounded-xl bg-muted px-4 py-3 text-sm">{item.kind === "action" ? item.instruction : ""}</p>)}{runningTimers.map((timer) => <div key={timer.id} className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl bg-muted px-4 py-2"><div><p className="break-words text-sm font-medium">{timer.name}</p><p className="text-xs tabular-nums text-muted-foreground">{timer.status === "paused" ? "Paused" : `${timer.remainingSeconds}s remaining`}</p></div><button type="button" onClick={() => void toggleTimer(timer.id)} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg hover:bg-background" aria-label={timer.status === "paused" ? `Resume ${timer.name}` : `Pause ${timer.name}`}>{timer.status === "paused" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</button></div>)}</div> : <p className="mt-2 text-sm text-muted-foreground">Nothing is running in the background.</p>}
      </section>

      <section aria-labelledby="up-next-heading" className="border-b border-border/70 pb-4">
        <h2 id="up-next-heading" className="text-xs font-bold tracking-[0.16em] text-foreground">UP NEXT</h2>
        <p className="mt-2 break-words text-sm leading-6 text-muted-foreground">{timeline?.upNext?.instruction ?? "No next step is available yet."}</p>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 pb-6">
        <p className="text-xs text-muted-foreground">{session.pendingMutations.length ? `Offline-safe · ${session.pendingMutations.length} change${session.pendingMutations.length === 1 ? "" : "s"} waiting to sync` : "Session saved"}</p>
        <button type="button" onClick={requestMicrophone} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium"><Mic className="h-4 w-4" aria-hidden="true" />Voice</button>
      </footer>
      {statusMessage ? <p className="sr-only" role="status">{statusMessage}</p> : null}
    </main>
  );
}
