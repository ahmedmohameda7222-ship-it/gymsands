"use client";

import { supabase } from "@/lib/supabase/client";
import { env } from "@/lib/env";
import { isUuid } from "@/lib/utils";
import { todayIso } from "@/lib/date-utils";
import { getMockTrainActivity } from "@/lib/fixtures/train-mock";
import { isMockAuthUserId } from "@/lib/fixtures/mock-auth";
import { autoDetectPersonalRecordsFromExerciseLogs } from "@/services/database/progress";
import type {
  ExerciseLog,
  UserExerciseLog,
  UserWorkoutSession,
  Workout,
  WorkoutPlanDaySession,
  WorkoutSession,
  WorkoutSessionSummary
} from "@/types";
import { serializeWorkoutSetLogs } from "./workout-set-log-serialization";
import type { WorkoutSetLogInput } from "./workout-set-log-serialization";

export type { WorkoutSetLogInput } from "./workout-set-log-serialization";

const skippedNotePrefix = "[skipped]";

function canUseUserData(userId: string | null | undefined) {
  return Boolean(supabase && isUuid(userId));
}

function requireWorkoutPersistence(userIdOrSessionId: string | null | undefined, label: string) {
  if (!supabase || !isUuid(userIdOrSessionId)) {
    throw new Error(`${label} could not be saved. Please refresh, sign in again, and try once more.`);
  }
}

type WorkoutSessionIdentity = Pick<WorkoutSession, "id" | "user_id" | "plan_day_id" | "status">;

async function getWorkoutSessionIdentity(sessionId: string): Promise<WorkoutSessionIdentity> {
  requireWorkoutPersistence(sessionId, "Workout session");
  const { data, error } = await supabase!
    .from("workout_sessions")
    .select("id,user_id,plan_day_id,status")
    .eq("id", sessionId)
    .single();
  if (error) throw error;
  return data as WorkoutSessionIdentity;
}

function isSchemaCompatibilityError(error: { message?: string; code?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "PGRST204" ||
    message.includes("workout_category") ||
    message.includes("skipped") ||
    message.includes("skipped_at") ||
    message.includes("exercise_category") ||
    message.includes("exercise_order") ||
    message.includes("invalid input value for enum")
  );
}

function isMissingTemplateSchemaError(error: { message?: string; code?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "PGRST204" ||
    error?.code === "42P01" ||
    message.includes("user_workout_sessions") ||
    message.includes("user_exercise_logs") ||
    message.includes("source") ||
    message.includes("source_workout_id") ||
    message.includes("instructions") ||
    message.includes("exercise_url") ||
    message.includes("video_url") ||
    message.includes("custom_video_url") ||
    message.includes("is_default")
  );
}

function normalizeWorkoutSession(session: WorkoutSession): WorkoutSession {
  if (session.status === "skipped" || session.notes?.startsWith(skippedNotePrefix)) {
    return {
      ...session,
      status: "skipped",
      skipped_at: session.skipped_at ?? session.completed_at ?? session.started_at,
      notes: session.notes?.startsWith(skippedNotePrefix)
        ? session.notes.replace(skippedNotePrefix, "").trim() || null
        : session.notes
    };
  }
  return session;
}

async function attachLegacyCatalogIdentity(sessions: WorkoutSessionSummary[]) {
  const planExerciseIds = Array.from(new Set(sessions.flatMap((session) => session.exercise_logs ?? []).map((log) => log.plan_exercise_id).filter((id): id is string => Boolean(id))));
  if (!planExerciseIds.length) return sessions;

  let { data, error } = await supabase!
    .from("user_workout_plan_exercises")
    .select("id,source_workout_id,workout_id")
    .in("id", planExerciseIds);
  if (error && isMissingTemplateSchemaError(error)) {
    const compatible = await supabase!
      .from("user_workout_plan_exercises")
      .select("id,workout_id")
      .in("id", planExerciseIds);
    data = compatible.data as typeof data;
    error = compatible.error;
  }
  if (error) {
    console.warn("Plaivra could not attach stable exercise identities to workout history.", error.message);
    return sessions;
  }

  const sourceByPlanExercise = new Map((data ?? []).map((row) => [row.id, row.source_workout_id ?? row.workout_id ?? null]));
  return sessions.map((session) => ({
    ...session,
    exercise_logs: (session.exercise_logs ?? []).map((log) => ({
      ...log,
      source_workout_id: log.plan_exercise_id ? sourceByPlanExercise.get(log.plan_exercise_id) ?? null : null
    }))
  }));
}

function scheduledSessionDate(session: UserWorkoutSession) {
  return session.completed_at || session.skipped_at || session.started_at || `${session.scheduled_date}T00:00:00.000Z`;
}

function mapScheduledSessionToWorkoutSession(session: UserWorkoutSession): WorkoutSession {
  const date = scheduledSessionDate(session);
  return {
    id: session.id,
    user_id: session.user_id,
    workout_id: null,
    plan_id: session.user_workout_plan_id,
    plan_day_id: session.plan_day_id,
    workout_day_name: session.day_title,
    workout_category: "Imported plan",
    workout_name: session.day_title,
    started_at: session.started_at || date,
    completed_at: session.completed_at,
    skipped_at: session.skipped_at,
    duration_minutes: session.duration_minutes,
    notes: session.notes,
    status: session.status === "skipped" ? "skipped" : session.status === "completed" ? "completed" : "started"
  };
}

type RawScheduledSession = {
  id: string;
  user_id: string;
  user_workout_plan_id: string;
  plan_day_id: string | null;
  week_index: number;
  day_index: number;
  session_number: number;
  scheduled_date: string;
  day_title: string;
  status: UserWorkoutSession["status"];
  started_at: string | null;
  completed_at: string | null;
  skipped_at: string | null;
  duration_minutes: number | null;
  notes: string | null;
  user_exercise_logs?: UserExerciseLog[] | null;
};

export type WorkoutHistorySourceStatus = {
  source: "legacy" | "scheduled";
  state: "loaded" | "failed" | "unavailable";
  message?: string;
};

export type WorkoutHistorySourceResult<T> = {
  data: T;
  status: WorkoutHistorySourceStatus;
};

function normalizeScheduledSession(session: RawScheduledSession): UserWorkoutSession {
  return {
    id: session.id,
    user_id: session.user_id,
    user_workout_plan_id: session.user_workout_plan_id,
    plan_day_id: session.plan_day_id,
    week_index: session.week_index,
    day_index: session.day_index,
    session_number: session.session_number,
    scheduled_date: session.scheduled_date,
    day_title: session.day_title,
    status: session.status,
    started_at: session.started_at,
    completed_at: session.completed_at,
    skipped_at: session.skipped_at,
    duration_minutes: session.duration_minutes,
    notes: session.notes,
    logs: [...(session.user_exercise_logs ?? [])].sort((a, b) => a.exercise_order - b.exercise_order)
  };
}

function sessionDateForSort(session: WorkoutSession) {
  return new Date(session.completed_at || session.skipped_at || session.started_at);
}

function sortExerciseLogsByWorkoutOrder(logs: ExerciseLog[]) {
  return [...logs].sort((a, b) => {
    const orderA = a.exercise_order ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.exercise_order ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    const createdSort = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return createdSort || a.set_number - b.set_number;
  });
}

export async function startWorkoutDaySession(userId: string, day: WorkoutPlanDaySession) {
  requireWorkoutPersistence(userId, "Workout session");
  if (!isUuid(day.id)) throw new Error("Workout day is invalid.");
  const scheduledResult = await supabase!
    .from("user_workout_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("plan_day_id", day.id)
    .eq("scheduled_date", todayIso())
    .in("status", ["scheduled", "started"])
    .limit(1)
    .maybeSingle();
  if (scheduledResult.error) throw scheduledResult.error;
  const { data, error } = await supabase!.rpc("start_or_resume_workout_session_atomic", {
    p_user_id: userId,
    p_plan_day_id: day.id,
    p_scheduled_session_id: scheduledResult.data?.id ?? null
  });
  if (error) {
    console.warn("Plaivra could not start a workout day session.", error.message);
    throw error;
  }
  const result = data as { session?: WorkoutSession } | null;
  if (!result?.session) throw new Error("Workout session could not be started.");
  return normalizeWorkoutSession(result.session);
}

export async function getOpenWorkoutDaySession(userId: string, planDayId: string) {
  if (!canUseUserData(userId)) return null;
  const { data, error } = await supabase!
    .from("workout_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("plan_day_id", planDayId)
    .eq("status", "started")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("Plaivra could not load the open workout session.", error.message);
    return null;
  }

  return data ? normalizeWorkoutSession(data as WorkoutSession) : null;
}

export async function getOrStartWorkoutDaySession(userId: string, day: WorkoutPlanDaySession) {
  return startWorkoutDaySession(userId, day);
}

export async function getWorkoutSessionLogs(sessionId: string) {
  if (!supabase || !isUuid(sessionId)) throw new Error("Database not connected");
  const { data, error } = await supabase!
    .from("exercise_logs")
    .select("*")
    .eq("workout_session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("Plaivra could not load workout session logs.", error.message);
    return [];
  }

  return (data ?? []) as ExerciseLog[];
}

export async function updateWorkoutSessionDuration(sessionId: string, durationMinutes: number) {
  if (!supabase) throw new Error("Database not connected");
  const { error } = await supabase!
    .from("workout_sessions")
    .update({ duration_minutes: Math.max(0, durationMinutes) })
    .eq("id", sessionId)
    .eq("status", "started");
  if (error) {
    console.warn("Plaivra could not update workout duration.", error.message);
  }
  return true;
}

export async function saveWorkoutSetLogs(sessionId: string, logs: WorkoutSetLogInput[]) {
  requireWorkoutPersistence(sessionId, "Workout sets");
  if (!logs.length) return true;
  const session = await getWorkoutSessionIdentity(sessionId);
  const { error } = await supabase!.rpc("upsert_workout_set_logs_atomic", {
    p_user_id: session.user_id,
    p_session_id: sessionId,
    p_logs: serializeWorkoutSetLogs(logs)
  });
  if (error) throw error;
  return true;
}

export async function completeWorkoutSession(sessionId: string, notes: string, durationMinutes: number, finalLogs?: WorkoutSetLogInput[]) {
  requireWorkoutPersistence(sessionId, "Workout session");
  const session = await getWorkoutSessionIdentity(sessionId);
  const rows = finalLogs ? serializeWorkoutSetLogs(finalLogs) : null;
  const { data, error } = await supabase!.rpc("complete_workout_session_atomic", {
    p_user_id: session.user_id,
    p_session_id: sessionId,
    p_logs: rows,
    p_duration_minutes: Math.max(0, durationMinutes),
    p_notes: notes.trim() || null
  });
  if (error) {
    console.warn("Plaivra could not complete this workout session.", error.message);
    throw error;
  }
  const result = data as { logs?: ExerciseLog[] } | null;
  const completedLogs = result?.logs;
  void detectPersonalRecordsAfterWorkoutCompletion(session.user_id, sessionId, completedLogs);
  return true;
}

export async function replaceWorkoutSessionExercise(
  userId: string,
  sessionId: string,
  planExerciseId: string,
  replacement: Workout
) {
  requireWorkoutPersistence(userId, "Workout replacement");
  requireWorkoutPersistence(sessionId, "Workout session");
  requireWorkoutPersistence(planExerciseId, "Plan exercise");
  const replacementType = replacement.catalog_source === "custom"
    ? "custom_exercise"
    : replacement.catalog_source === "external"
      ? "provider_activity"
    : isUuid(replacement.id)
      ? "global_exercise"
      : "provider_activity";
  const { data, error } = await supabase!.rpc("replace_workout_session_snapshot_item_atomic", {
    p_user_id: userId,
    p_session_id: sessionId,
    p_plan_exercise_id: planExerciseId,
    p_replacement_type: replacementType,
    p_replacement_identity: replacement.id,
    p_provider: replacementType === "provider_activity" ? "plaivra_activity_catalog" : null
  });
  if (error) {
    console.warn("Plaivra could not record the stable replacement identity.", error.message);
    throw error;
  }
  return data;
}

export async function detectPersonalRecordsAfterWorkoutCompletion(
  userId: string,
  sessionId: string,
  completedLogs?: ExerciseLog[]
) {
  try {
    const logs = completedLogs ?? await getWorkoutSessionLogs(sessionId);
    return await autoDetectPersonalRecordsFromExerciseLogs(userId, logs, new Date().toISOString().slice(0, 10));
  } catch (error) {
    console.warn("Plaivra saved the workout, but personal records could not be refreshed.", error);
    return [];
  }
}

export async function getOpenWorkoutSession(userId: string, workoutId?: string | null) {
  if (!canUseUserData(userId)) return null;
  let query = supabase!
    .from("workout_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "started");
  if (workoutId && isUuid(workoutId)) query = query.eq("workout_id", workoutId);
  const { data, error } = await query.order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (error) {
    console.warn("Plaivra could not load the active workout session.", error.message);
    return null;
  }
  return data ? normalizeWorkoutSession(data as WorkoutSession) : null;
}

export async function getOpenWorkoutSessionWithStatus(userId: string, workoutId?: string | null, candidateSessionId?: string | null): Promise<{ session: WorkoutSession | null; error?: string }> {
  if (env.useMockAuth && isMockAuthUserId(userId)) {
    const session = getMockTrainActivity().find((item) => item.status === "started" && (!workoutId || item.workout_id === workoutId)) ?? null;
    return { session };
  }
  if (!canUseUserData(userId)) return { session: null, error: "Active workout could not load because the user session is invalid." };
  if (candidateSessionId && isUuid(candidateSessionId)) {
    const candidate = await supabase!
      .from("workout_sessions")
      .select("*")
      .eq("id", candidateSessionId)
      .eq("user_id", userId)
      .eq("status", "started")
      .maybeSingle();
    if (candidate.error) {
      console.warn("Plaivra could not validate the active workout session.", candidate.error.message);
      return { session: null, error: "Active workout could not load. Your current route was left unchanged." };
    }
    if (candidate.data) return { session: normalizeWorkoutSession(candidate.data as WorkoutSession) };
  }
  let query = supabase!
    .from("workout_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "started");
  if (workoutId && isUuid(workoutId)) query = query.eq("workout_id", workoutId);
  const { data, error } = await query.order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (error) {
    console.warn("Plaivra could not load the active workout session.", error.message);
    return { session: null, error: "Active workout could not load. Your current route was left unchanged." };
  }
  return { session: data ? normalizeWorkoutSession(data as WorkoutSession) : null };
}

export async function cancelWorkoutSession(sessionId: string) {
  if (!supabase || !isUuid(sessionId)) throw new Error("Workout session is invalid.");
  const { error } = await supabase.from("workout_sessions").delete().eq("id", sessionId).eq("status", "started");
  if (error) throw error;
  return true;
}

export async function updateSkippedWorkoutFollowup(
  userId: string,
  sessionId: string,
  input: {
    reason: "no_time" | "low_energy" | "sick" | "pain" | "travel" | "gym_closed" | "too_sore" | "other";
    action: "move_to_tomorrow" | "skip_and_continue" | "rebalance_week" | "reduce_next_session";
  }
) {
  requireWorkoutPersistence(userId, "Skipped workout follow-up");
  const { data, error } = await supabase!
    .from("workout_sessions")
    .update({ skip_reason: input.reason, skip_followup_action: input.action })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .eq("status", "skipped")
    .select("*")
    .single();
  if (error) throw error;
  return normalizeWorkoutSession(data as WorkoutSession);
}

export async function getWorkoutHistory(userId: string) {
  if (!canUseUserData(userId)) return [];
  let { data, error } = await supabase!
    .from("workout_sessions")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["completed", "skipped"])
    .order("started_at", { ascending: false })
    .limit(20);
  if (error && isSchemaCompatibilityError(error)) {
    const compatible = await supabase!
      .from("workout_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "completed")
      .order("started_at", { ascending: false })
      .limit(20);
    data = compatible.data;
    error = compatible.error;
  }
  if (error) {
    console.warn("Plaivra could not load workout history.", error.message);
    return getScheduledWorkoutActivity(userId, 20);
  }
  const legacyHistory = ((data ?? []) as WorkoutSession[]).map(normalizeWorkoutSession);
  const scheduledHistory = await getScheduledWorkoutActivity(userId, 20);
  return [...legacyHistory, ...scheduledHistory]
    .sort((a, b) => sessionDateForSort(b).getTime() - sessionDateForSort(a).getTime())
    .slice(0, 20);
}

export async function getWorkoutHistoryDetailed(userId: string, limit = 100) {
  if (!canUseUserData(userId)) return [];
  const { data, error } = await supabase!
    .from("workout_sessions")
    .select("*, exercise_logs(*)")
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("Plaivra could not load workout history details.", error.message);
    return [];
  }
  const normalized = ((data ?? []) as WorkoutSessionSummary[])
    .map((session) => ({
      ...normalizeWorkoutSession(session),
      exercise_logs: sortExerciseLogsByWorkoutOrder(session.exercise_logs ?? [])
    }))
    .filter((session) => session.status === "completed");
  return attachLegacyCatalogIdentity(normalized);
}

export async function getWorkoutHistoryDetailedWithStatus(userId: string, limit = 100): Promise<WorkoutHistorySourceResult<WorkoutSessionSummary[]>> {
  if (!canUseUserData(userId)) {
    return {
      data: [],
      status: {
        source: "legacy",
        state: "failed",
        message: "Completed workout sessions could not load because the user session is invalid."
      }
    };
  }

  let { data, error } = await supabase!
    .from("workout_sessions")
    .select("*, exercise_logs(*)")
    .eq("user_id", userId)
    .in("status", ["completed", "skipped"])
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error && isSchemaCompatibilityError(error)) {
    const compatible = await supabase!
      .from("workout_sessions")
      .select("*, exercise_logs(*)")
      .eq("user_id", userId)
      .eq("status", "completed")
      .order("started_at", { ascending: false })
      .limit(limit);
    data = compatible.data;
    error = compatible.error;
  }
  if (error) {
    console.warn("Plaivra could not load workout history details.", error.message);
    return {
      data: [],
      status: {
        source: "legacy",
        state: "failed",
        message: "Completed workout sessions could not load."
      }
    };
  }

  const normalized = ((data ?? []) as WorkoutSessionSummary[])
      .map((session) => ({
        ...normalizeWorkoutSession(session),
        exercise_logs: sortExerciseLogsByWorkoutOrder(session.exercise_logs ?? [])
      }))
      .filter((session) => session.status === "completed" || session.status === "skipped");
  return {
    data: await attachLegacyCatalogIdentity(normalized),
    status: { source: "legacy", state: "loaded" }
  };
}

export async function getWorkoutActivity(userId: string, limit = 180, options?: { throwOnError?: boolean }) {
  if (env.useMockAuth && isMockAuthUserId(userId)) return getMockTrainActivity().slice(0, limit);
  if (!canUseUserData(userId)) return [];
  let { data, error } = await supabase!
    .from("workout_sessions")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["completed", "skipped"])
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error && isSchemaCompatibilityError(error)) {
    const compatible = await supabase!
      .from("workout_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "completed")
      .order("started_at", { ascending: false })
      .limit(limit);
    data = compatible.data;
    error = compatible.error;
  }

  if (error) {
    console.warn("Plaivra could not load workout activity.", error.message);
    if (options?.throwOnError) throw new Error(`Could not load workout activity. ${error.message}`);
    return getScheduledWorkoutActivity(userId, limit);
  }

  const legacyActivity = ((data ?? []) as WorkoutSession[]).map(normalizeWorkoutSession);
  const scheduledActivity = await getScheduledWorkoutActivity(userId, limit);
  return [...legacyActivity, ...scheduledActivity]
    .sort((a, b) => sessionDateForSort(b).getTime() - sessionDateForSort(a).getTime())
    .slice(0, limit);
}

export async function getScheduledWorkoutHistory(userId: string, limit = 100) {
  if (!canUseUserData(userId)) return [];
  const { data, error } = await supabase!
    .from("user_workout_sessions")
    .select(
      "id,user_id,user_workout_plan_id,plan_day_id,week_index,day_index,session_number,scheduled_date,day_title,status,started_at,completed_at,skipped_at,duration_minutes,notes,user_exercise_logs(id,user_workout_session_id,plan_exercise_id,exercise_order,exercise_name,planned_sets,planned_reps,weight_kg,reps,notes,completed,completed_at,created_at,updated_at)"
    )
    .eq("user_id", userId)
    .in("status", ["completed", "skipped"])
    .order("scheduled_date", { ascending: false })
    .limit(limit);

  if (error) {
    if (!isMissingTemplateSchemaError(error)) console.warn("Plaivra could not load workout history.", error.message);
    return [];
  }

  return ((data ?? []) as unknown as RawScheduledSession[]).map(normalizeScheduledSession);
}

export async function getScheduledWorkoutHistoryWithStatus(userId: string, limit = 100): Promise<WorkoutHistorySourceResult<UserWorkoutSession[]>> {
  if (!canUseUserData(userId)) {
    return {
      data: [],
      status: {
        source: "scheduled",
        state: "failed",
        message: "Imported-plan workout history could not load because the user session is invalid."
      }
    };
  }

  const { data, error } = await supabase!
    .from("user_workout_sessions")
    .select(
      "id,user_id,user_workout_plan_id,plan_day_id,week_index,day_index,session_number,scheduled_date,day_title,status,started_at,completed_at,skipped_at,duration_minutes,notes,user_exercise_logs(id,user_workout_session_id,plan_exercise_id,exercise_order,exercise_name,planned_sets,planned_reps,weight_kg,reps,notes,completed,completed_at,created_at,updated_at)"
    )
    .eq("user_id", userId)
    .in("status", ["completed", "skipped"])
    .order("scheduled_date", { ascending: false })
    .limit(limit);

  if (error) {
    if (!isMissingTemplateSchemaError(error)) console.warn("Plaivra could not load workout history.", error.message);
    return {
      data: [],
      status: {
        source: "scheduled",
        state: isMissingTemplateSchemaError(error) ? "unavailable" : "failed",
        message: isMissingTemplateSchemaError(error)
          ? "Imported-plan history is unavailable here, so this view shows completed workout sessions only."
          : "Imported-plan workout history could not load."
      }
    };
  }

  return {
    data: ((data ?? []) as unknown as RawScheduledSession[]).map(normalizeScheduledSession),
    status: { source: "scheduled", state: "loaded" }
  };
}

export async function getScheduledWorkoutActivity(userId: string, limit = 180) {
  if (!canUseUserData(userId)) return [];
  const { data, error } = await supabase!
    .from("user_workout_sessions")
    .select("id,user_id,user_workout_plan_id,plan_day_id,week_index,day_index,session_number,scheduled_date,day_title,status,started_at,completed_at,skipped_at,duration_minutes,notes")
    .eq("user_id", userId)
    .in("status", ["completed", "skipped"])
    .order("scheduled_date", { ascending: false })
    .limit(limit);

  if (error) {
    if (!isMissingTemplateSchemaError(error)) console.warn("Plaivra could not load workout activity.", error.message);
    return [];
  }

  return ((data ?? []) as unknown as RawScheduledSession[]).map((session) => mapScheduledSessionToWorkoutSession(normalizeScheduledSession(session)));
}
