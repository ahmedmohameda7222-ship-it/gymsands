"use client";

import { env } from "@/lib/env";
import { getMockTrainActivity } from "@/lib/fixtures/train-mock";
import { isMockAuthUserId } from "@/lib/fixtures/mock-auth";
import { currentMonthWorkoutHistoryRange } from "@/lib/workouts/history/date-range";
import {
  readWorkoutHistoryCache,
  writeWorkoutHistoryCache,
} from "@/lib/workouts/history/offline-cache";
import { resolveCanonicalWorkoutActivity } from "@/lib/workouts/history/resolve-activity";
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
      completedSetCount: 0,
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
