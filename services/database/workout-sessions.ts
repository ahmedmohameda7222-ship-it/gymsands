"use client";

export * from "./workout-sessions-legacy";

import { env } from "@/lib/env";
import { isMockAuthUserId } from "@/lib/fixtures/mock-auth";
import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import { readActiveWorkoutSessionCache } from "@/lib/workouts/active-session-sync";
import { readActiveWorkoutSessionAuthenticated } from "@/services/workouts/active-session-client";
import type { Weekday, Workout, WorkoutSession } from "@/types";
import {
  getOrStartWorkoutSession as startOrResumeDirectWorkoutSession
} from "./direct-workout-sessions";
import {
  getOpenWorkoutSessionWithStatus as getOpenWorkoutSessionWithStatusLegacy
} from "./workout-sessions-legacy";
import { serializeWorkoutSetLogs } from "./workout-set-log-serialization";
import type { WorkoutSetLogInput } from "./workout-set-log-serialization";

export type { WorkoutSetLogInput } from "./workout-set-log-serialization";

export type SkipWorkoutDayInput = {
  id: string;
  plan_id?: string | null;
  planId?: string | null;
  day_name?: string;
  dayName?: string;
  weekday: Weekday | null;
  exercises: Array<{
    category?: string | null;
    target_muscle?: string | null;
    equipment?: string | null;
  }>;
};

function requireSessionIdentity(value: string, label: string) {
  if (!supabase || !isUuid(value)) throw new Error(`${label} is invalid.`);
}

function directWorkoutIdentity(workout: Workout, resolvedWorkoutId?: string | null): Workout {
  if (resolvedWorkoutId === undefined || resolvedWorkoutId === null) return workout;
  if (!isUuid(resolvedWorkoutId)) throw new Error("Resolved workout identity is invalid.");
  return {
    ...workout,
    id: resolvedWorkoutId,
    catalog_source: null,
    catalog_slug: null,
    catalog_version: null,
    is_global: true
  };
}

export async function getOpenWorkoutSessionWithStatus(
  userId: string,
  planDayId?: string | null,
  candidateSessionId?: string | null,
) {
  let result: Awaited<ReturnType<typeof getOpenWorkoutSessionWithStatusLegacy>>;
  if (env.useMockAuth && isMockAuthUserId(userId) && !env.productionQaBuild) {
    result = await getOpenWorkoutSessionWithStatusLegacy(
      userId,
      planDayId,
      candidateSessionId,
    );
  } else if (!supabase || !isUuid(userId)) {
    result = {
      session: null,
      error:
        "Active workout could not load because the user session is invalid.",
    };
  } else {
    try {
      const auth = await supabase.auth.getSession();
      const session = auth.data.session;
      if (
        auth.error ||
        !session?.access_token ||
        session.user.id !== userId
      ) {
        result = {
          session: null,
          error:
            "Active workout could not load because the user session is invalid.",
        };
      } else {
        result = await readActiveWorkoutSessionAuthenticated({
          userId,
          accessToken: session.access_token,
          workoutId: planDayId,
          candidateSessionId,
        });
      }
    } catch (error) {
      result = {
        session: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (!result.error || !candidateSessionId || typeof indexedDB === "undefined") {
    return result;
  }
  if (typeof navigator !== "undefined" && navigator.onLine) return result;

  const cached = await readActiveWorkoutSessionCache(
    userId,
    candidateSessionId,
  ).catch(() => null);
  const root = cached?.root ?? null;
  if (
    !root
    || root.id !== candidateSessionId
    || root.user_id !== userId
    || root.status !== "started"
    || (planDayId && root.plan_day_id !== planDayId)
  ) return result;

  return { session: root, error: null };
}

export async function startWorkoutSession(
  userId: string,
  workout: Workout,
  resolvedWorkoutId?: string | null
): Promise<WorkoutSession> {
  return startOrResumeDirectWorkoutSession(
    userId,
    directWorkoutIdentity(workout, resolvedWorkoutId),
    null
  );
}

export async function getOrStartWorkoutSession(
  userId: string,
  workout: Workout,
  candidateSessionId?: string | null
): Promise<WorkoutSession> {
  return startOrResumeDirectWorkoutSession(userId, workout, candidateSessionId);
}

export async function getWorkoutSessionRoot(userId: string, sessionId: string) {
  const open = await getOpenWorkoutSessionWithStatus(userId, null, sessionId);
  if (open.error) throw new Error(open.error);
  if (open.session) return open.session;
  if (!supabase || !isUuid(userId) || !isUuid(sessionId)) return null;
  const { data, error } = await supabase
    .from("workout_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as WorkoutSession | null;
}

export async function saveWorkoutSetLogs(
  sessionId: string,
  logs: WorkoutSetLogInput[],
  controllerDeviceId?: string,
) {
  requireSessionIdentity(sessionId, "Workout session");
  if (!logs.length) return true;
  const sessionResult = await supabase!
    .from("workout_sessions")
    .select("user_id")
    .eq("id", sessionId)
    .single();
  if (sessionResult.error) throw sessionResult.error;
  const { error } = await supabase!.rpc("upsert_workout_set_logs_atomic", {
    p_user_id: sessionResult.data.user_id,
    p_session_id: sessionId,
    p_logs: serializeWorkoutSetLogs(logs),
    ...(controllerDeviceId
      ? { p_controller_device_id: controllerDeviceId }
      : {})
  });
  if (error) throw error;
  return true;
}

export async function skipWorkoutDay(userId: string, day: SkipWorkoutDayInput, notes = "") {
  requireSessionIdentity(userId, "User session");
  if (!isUuid(day.id)) throw new Error("Workout day is invalid.");
  const { data, error } = await supabase!.rpc("skip_workout_day_atomic", {
    p_user_id: userId,
    p_plan_day_id: day.id,
    p_reason: null,
    p_followup_action: null,
    p_notes: notes.trim() || null
  });
  if (error) throw error;
  const result = data as { session?: WorkoutSession } | null;
  if (!result?.session) throw new Error("Workout day could not be skipped.");
  return result.session;
}

export async function cancelWorkoutSession(
  sessionId: string,
  controllerDeviceId?: string,
) {
  requireSessionIdentity(sessionId, "Workout session");
  const sessionResult = await supabase!
    .from("workout_sessions")
    .select("user_id")
    .eq("id", sessionId)
    .single();
  if (sessionResult.error) throw sessionResult.error;
  const { error } = await supabase!.rpc("cancel_workout_session_atomic", {
    p_user_id: sessionResult.data.user_id,
    p_session_id: sessionId,
    p_reason: "user_cancelled",
    ...(controllerDeviceId
      ? { p_controller_device_id: controllerDeviceId }
      : {})
  });
  if (error) throw error;
  return true;
}
