"use client";

import { env } from "@/lib/env";
import { getMockTrainActivity } from "@/lib/fixtures/train-mock";
import { isMockAuthUserId } from "@/lib/fixtures/mock-auth";
import { currentMonthWorkoutHistoryRange } from "@/lib/workouts/history/date-range";
import { summarizeWorkoutHistory } from "@/lib/workouts/history/metrics";
import {
  readWorkoutHistoryCache,
  writeWorkoutHistoryCache,
} from "@/lib/workouts/history/offline-cache";
import { resolveCanonicalWorkoutActivity } from "@/lib/workouts/history/resolve-activity";
import { presentWorkoutHistorySession } from "@/lib/workouts/history/presentation";
import { workoutHistoryRequestSearchParams } from "@/lib/workouts/history/request";
import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import {
  WORKOUT_HISTORY_CONTRACT_VERSION,
  type CanonicalWorkoutActivityReadResult,
  type WorkoutHistoryListRequest,
  type WorkoutHistoryListResponse,
  type WorkoutHistorySessionDetailResponse,
} from "@/types/workout-history";

export class WorkoutHistoryClientError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "WorkoutHistoryClientError";
    this.code = code;
    this.status = status;
  }
}

const cacheRequestGenerations = new Map<string, number>();

function beginCacheRequest(ownerId: string, kind: "list" | "detail", requestKey: string) {
  const key = `${ownerId}:${kind}:${requestKey}`;
  const generation = (cacheRequestGenerations.get(key) ?? 0) + 1;
  cacheRequestGenerations.set(key, generation);
  return { key, generation };
}

function cacheRequestIsCurrent(request: { key: string; generation: number }): boolean {
  return cacheRequestGenerations.get(request.key) === request.generation;
}

function mockHistory(userId: string, limit: number): CanonicalWorkoutActivityReadResult {
  const performed = getMockTrainActivity().map((session) => ({
    session: {
      ...session,
      user_id: userId,
      scheduled_session_id: null,
      cancelled_at: null,
    },
    metadata: {
      completedSetCount: session.status === "completed" ? 8 : 0,
      structuredPerformedMetricCount: 0,
      actualPerformedSnapshotCount: 0,
      plannedSetCount: null,
    },
  }));
  return {
    contractVersion: WORKOUT_HISTORY_CONTRACT_VERSION,
    activities: resolveCanonicalWorkoutActivity({
      ownerUserId: userId,
      performed,
      scheduledTerminal: [],
    }).slice(0, limit),
    sources: {
      performed: { source: "performed", state: "loaded" },
      scheduledFallback: { source: "scheduled_fallback", state: "loaded" },
    },
  };
}

function mockHistoryList(userId: string, request: WorkoutHistoryListRequest): WorkoutHistoryListResponse {
  const search = request.search?.toLocaleLowerCase("en-US") ?? "";
  const items = mockHistory(userId, 100).activities
    .map((activity) => presentWorkoutHistorySession(activity, {
      exerciseCount: activity.lifecycle === "completed" ? 4 : null,
      completedSetCount: activity.lifecycle === "completed" ? 8 : null,
      reliableVolume: activity.lifecycle === "completed" ? 5_420 : null,
      exerciseNames: activity.lifecycle === "completed" ? ["Bench press", "Row"] : [],
      exerciseIds: activity.lifecycle === "completed"
        ? ["global:40000000-0000-4000-8000-000000000001", "global:40000000-0000-4000-8000-000000000002"]
        : [],
      muscleIds: activity.lifecycle === "completed" ? ["pectoralis_major_sternal"] : [],
    }))
    .filter((item) => {
      const effectiveAt = Date.parse(item.effectiveAt);
      if (effectiveAt < Date.parse(request.from) || effectiveAt >= Date.parse(request.to)) return false;
      if (request.statuses?.length && !request.statuses.includes(item.lifecycle)) return false;
      if (request.progressOnly && !item.hasMeaningfulPerformance) return false;
      if (request.workoutTypes?.length && (!item.category || !request.workoutTypes.includes(item.category))) return false;
      if (request.muscleIds?.length && !request.muscleIds.some((id) => item.muscleIds.includes(id))) return false;
      if (request.exerciseIds?.length && !request.exerciseIds.some((id) => item.exerciseIds.includes(id))) return false;
      if (request.planIds?.length && (!item.planId || !request.planIds.includes(item.planId))) return false;
      return !search || [item.title, ...item.exerciseNames]
        .join(" ")
        .toLocaleLowerCase("en-US")
        .includes(search);
    });
  return {
    contractVersion: WORKOUT_HISTORY_CONTRACT_VERSION,
    period: { from: request.from, to: request.to, timezone: request.timezone },
    summary: summarizeWorkoutHistory(items),
    items: items.slice(0, request.limit ?? 20),
    nextCursor: null,
    notices: [],
    filterOptions: {
      workoutTypes: [{ value: "strength", label: "Strength" }],
      muscles: [{ value: "pectoralis_major_sternal", label: "Pectoralis major" }],
      exercises: [
        { value: "global:40000000-0000-4000-8000-000000000001", label: "Bench press" },
        { value: "global:40000000-0000-4000-8000-000000000002", label: "Row" },
      ],
      plans: [],
    },
  };
}

function mockHistoryDetail(
  userId: string,
  source: "performed" | "scheduled_fallback",
  id: string,
): WorkoutHistorySessionDetailResponse {
  if (source === "scheduled_fallback") {
    return {
      contractVersion: WORKOUT_HISTORY_CONTRACT_VERSION,
      activity: {
        contractVersion: WORKOUT_HISTORY_CONTRACT_VERSION,
        activityId: `scheduled:${id}`,
        canonicalSessionId: null,
        scheduledSessionId: id,
        userId,
        sourceKind: "scheduled_fallback",
        lifecycle: "completed",
        title: "Saved scheduled workout",
        category: null,
        effectiveAt: "2026-07-20T09:00:00.000Z",
        startedAt: null,
        completedAt: "2026-07-20T09:00:00.000Z",
        skippedAt: null,
        cancelledAt: null,
        durationMinutes: 40,
        notes: "Older scheduled record.",
        planId: null,
        planDayId: null,
        planWeekId: null,
        planSessionId: null,
        hasPerformedSets: false,
        hasMeaningfulPerformance: false,
        capabilities: {
          openDetails: true,
          showPerformedSets: false,
          showPlannedVsActual: false,
          showMuscleAnalysis: false,
          calculatePerformanceMetrics: false,
          calculateVerifiedRecords: false,
          repeatWorkout: false,
          correctSession: false,
          softDeleteSession: false,
        },
      },
      summary: { exerciseCount: null, completedSetCount: null, reliableVolume: null, verifiedRecordCount: null },
      snapshot: null,
      exercises: [{
        identity: "compatibility:1:bench-press",
        exerciseId: null,
        snapshotItemId: null,
        name: "Bench press",
        plannedName: "Bench press",
        state: null,
        category: null,
        plannedSetCount: null,
        performedSets: [],
        missingPlannedSets: [],
      }],
      timeline: [],
      notices: ["partial-availability"],
    };
  }
  const activity = mockHistory(userId, 100).activities.find((candidate) => candidate.canonicalSessionId === id);
  if (!activity) throw new WorkoutHistoryClientError("history_not_found", "Workout history item was not found.", 404);
  const plannedSet = (setOrder: number) => ({
    id: `30000000-0000-4000-8000-${String(setOrder).padStart(12, "0")}`,
    setOrder,
    setType: "working",
    targetMode: "range",
    sideMode: "bilateral",
    restSeconds: 90,
    tempoTarget: null,
    targets: [{
      metricKey: "repetitions",
      side: "none" as const,
      targetMode: "range",
      targetValue: null,
      minimumValue: 8,
      maximumValue: 10,
    }],
  });
  const exercises = ["Bench press", "Row"].map((name, exerciseIndex) => ({
    identity: `40000000-0000-4000-8000-${String(exerciseIndex + 1).padStart(12, "0")}`,
    exerciseId: null,
    snapshotItemId: `40000000-0000-4000-8000-${String(exerciseIndex + 1).padStart(12, "0")}`,
    name,
    plannedName: name,
    state: "completed" as const,
    category: "strength",
    plannedSetCount: 4,
    performedSets: [1, 2, 3, 4].map((setNumber) => ({
      id: `50000000-0000-4000-${String(exerciseIndex + 1).padStart(4, "0")}-${String(setNumber).padStart(12, "0")}`,
      setNumber,
      reps: 10 - (setNumber % 2),
      weightKg: exerciseIndex === 0 ? 70 : 60,
      completedAt: activity.completedAt,
      notes: setNumber === 4 && exerciseIndex === 0 ? "Controlled finish." : null,
      setType: setNumber === 1 ? "warmup" : "working",
      rpe: setNumber === 4 ? 8 : null,
      rir: setNumber === 4 ? 2 : null,
      matchState: "matched" as const,
      plannedSet: plannedSet(setNumber),
      metrics: [],
      segments: [],
      verifiedRecords: exerciseIndex === 0 && setNumber === 2 ? [{
        id: "70000000-0000-4000-8000-000000000001",
        recordType: "highest_load" as const,
        currentValue: 82.5,
        previousValue: 80,
        unit: "kg" as const,
        estimated: false,
      }] : [],
    })),
    missingPlannedSets: [],
  }));
  return {
    contractVersion: WORKOUT_HISTORY_CONTRACT_VERSION,
    activity: { ...activity, notes: "Good control and consistent tempo." },
    summary: { exerciseCount: 2, completedSetCount: 8, reliableVolume: 5_420, verifiedRecordCount: 1 },
    snapshot: null,
    exercises,
    timeline: [
      { id: "60000000-0000-4000-8000-000000000001", type: "workout_started", occurredAt: activity.startedAt ?? activity.effectiveAt, exerciseName: null },
      { id: "60000000-0000-4000-8000-000000000002", type: "workout_completed", occurredAt: activity.completedAt ?? activity.effectiveAt, exerciseName: null },
    ],
    notices: [],
  };
}

async function accessToken(): Promise<string> {
  if (!supabase) throw new WorkoutHistoryClientError("sign_in_required", "Please sign in to view workout history.", 401);
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new WorkoutHistoryClientError("sign_in_required", "Please sign in to view workout history.", 401);
  return token;
}

async function parseResponse<T extends { contractVersion: number }>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as ({ error?: string; code?: string } & Partial<T>) | null;
  if (!response.ok) {
    throw new WorkoutHistoryClientError(
      payload?.code ?? "history_unavailable",
      payload?.error ?? "Workout history could not load.",
      response.status,
    );
  }
  if (!payload || payload.contractVersion !== WORKOUT_HISTORY_CONTRACT_VERSION) {
    throw new WorkoutHistoryClientError("history_contract_mismatch", "Workout history could not load.", 503);
  }
  return payload as T;
}

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function withStaleNotice(response: WorkoutHistoryListResponse): WorkoutHistoryListResponse {
  return {
    ...response,
    notices: [...new Set([...response.notices, "stale-data" as const])],
  };
}

export async function getWorkoutHistoryList(
  userId: string,
  request: WorkoutHistoryListRequest,
  options?: { signal?: AbortSignal },
): Promise<WorkoutHistoryListResponse> {
  if (!isUuid(userId)) throw new WorkoutHistoryClientError("sign_in_required", "Please sign in to view workout history.", 401);
  if (env.useMockAuth && isMockAuthUserId(userId)) return mockHistoryList(userId, request);
  const params = workoutHistoryRequestSearchParams(request);
  const requestKey = params.toString();
  if (isOffline()) {
    const cached = await readWorkoutHistoryCache<WorkoutHistoryListResponse>(userId, "list", requestKey);
    if (cached) return withStaleNotice(cached);
    throw new WorkoutHistoryClientError("history_offline_unavailable", "Workout history is unavailable while offline.", 503);
  }
  const cacheRequest = beginCacheRequest(userId, "list", requestKey);

  try {
    const token = await accessToken();
    const response = await fetch(`/api/workouts/history?${requestKey}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: options?.signal,
    });
    const result = await parseResponse<WorkoutHistoryListResponse>(response);
    if (cacheRequestIsCurrent(cacheRequest)) {
      void writeWorkoutHistoryCache(userId, "list", requestKey, result).catch(() => undefined);
    }
    return result;
  } catch (error) {
    if (options?.signal?.aborted) throw error;
    const cached = await readWorkoutHistoryCache<WorkoutHistoryListResponse>(userId, "list", requestKey);
    if (cached) return withStaleNotice(cached);
    throw error;
  }
}

export async function getWorkoutHistoryDetail(
  userId: string,
  source: "performed" | "scheduled_fallback",
  id: string,
  options?: { signal?: AbortSignal },
): Promise<WorkoutHistorySessionDetailResponse> {
  if (!isUuid(userId) || !isUuid(id)) throw new WorkoutHistoryClientError("history_not_found", "Workout history item was not found.", 404);
  if (env.useMockAuth && isMockAuthUserId(userId)) return mockHistoryDetail(userId, source, id);
  const path = source === "performed"
    ? `/api/workouts/history/${encodeURIComponent(id)}`
    : `/api/workouts/history/scheduled/${encodeURIComponent(id)}`;
  const requestKey = `${source}:${id}`;
  if (isOffline()) {
    const cached = await readWorkoutHistoryCache<WorkoutHistorySessionDetailResponse>(userId, "detail", requestKey);
    if (cached) return { ...cached, notices: [...new Set([...cached.notices, "stale-data" as const])] };
    throw new WorkoutHistoryClientError("history_offline_unavailable", "Workout details are unavailable while offline.", 503);
  }
  const cacheRequest = beginCacheRequest(userId, "detail", requestKey);
  try {
    const token = await accessToken();
    const response = await fetch(path, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: options?.signal,
    });
    const result = await parseResponse<WorkoutHistorySessionDetailResponse>(response);
    if (cacheRequestIsCurrent(cacheRequest)) {
      void writeWorkoutHistoryCache(userId, "detail", requestKey, result).catch(() => undefined);
    }
    return result;
  } catch (error) {
    if (options?.signal?.aborted) throw error;
    const cached = await readWorkoutHistoryCache<WorkoutHistorySessionDetailResponse>(userId, "detail", requestKey);
    if (cached) return { ...cached, notices: [...new Set([...cached.notices, "stale-data" as const])] };
    throw error;
  }
}

function oneYearRange(timezone: string) {
  const to = new Date();
  const from = new Date(to);
  from.setUTCFullYear(from.getUTCFullYear() - 1);
  return { from: from.toISOString(), to: to.toISOString(), timezone };
}

export async function getCanonicalWorkoutActivity(
  userId: string,
  limit = 180,
): Promise<CanonicalWorkoutActivityReadResult> {
  if (env.useMockAuth && isMockAuthUserId(userId)) return mockHistory(userId, limit);
  if (!isUuid(userId)) {
    return {
      contractVersion: WORKOUT_HISTORY_CONTRACT_VERSION,
      activities: [],
      sources: {
        performed: { source: "performed", state: "failed", message: "Workout history requires an active user session." },
        scheduledFallback: { source: "scheduled_fallback", state: "failed", message: "Workout history requires an active user session." },
      },
    };
  }
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const range = limit <= 50 ? currentMonthWorkoutHistoryRange(new Date(), timezone) : oneYearRange(timezone);
  const activities: WorkoutHistoryListResponse["items"] = [];
  let cursor: string | undefined;
  let partial = false;
  do {
    const page = await getWorkoutHistoryList(userId, {
      ...range,
      cursor,
      limit: Math.min(50, Math.max(1, limit - activities.length)),
      statuses: ["completed", "partial", "cancelled", "skipped"],
      sort: "newest",
    });
    activities.push(...page.items);
    partial ||= page.notices.includes("partial-availability");
    cursor = page.nextCursor ?? undefined;
  } while (cursor && activities.length < limit);
  return {
    contractVersion: WORKOUT_HISTORY_CONTRACT_VERSION,
    activities: activities.slice(0, limit),
    sources: {
      performed: { source: "performed", state: partial ? "failed" : "loaded", ...(partial ? { message: "Workout history is partially available." } : {}) },
      scheduledFallback: { source: "scheduled_fallback", state: partial ? "failed" : "loaded", ...(partial ? { message: "Workout history is partially available." } : {}) },
    },
  };
}
