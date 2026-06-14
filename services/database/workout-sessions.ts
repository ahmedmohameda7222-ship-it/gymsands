"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import { autoDetectPersonalRecordsFromExerciseLogs } from "@/services/database/progress";
import type {
  ExerciseLog,
  UserExerciseLog,
  UserWorkoutSession,
  Weekday,
  Workout,
  WorkoutPlanDaySession,
  WorkoutSession,
  WorkoutSessionSummary
} from "@/types";

function mockDelay<T>(value: T) {
  return Promise.resolve(value);
}

const skippedNotePrefix = "[skipped]";

function canUseUserData(userId: string | null | undefined) {
  return Boolean(supabase && isUuid(userId));
}

function requireWorkoutPersistence(userIdOrSessionId: string | null | undefined, label: string) {
  if (!supabase || !isUuid(userIdOrSessionId)) {
    throw new Error(`${label} could not be saved. Please refresh, sign in again, and try once more.`);
  }
}

function summarizeWorkoutCategory(
  day: { exercises?: Array<{ category?: string | null; target_muscle?: string | null; equipment?: string | null }> } | null | undefined
) {
  const categories = new Set(
    (day?.exercises ?? [])
      .map((exercise) => exercise.category || exercise.target_muscle || exercise.equipment)
      .filter(Boolean)
  );
  const values = Array.from(categories) as string[];
  if (!values.length) return "Workout";
  return values.slice(0, 2).join(", ");
}

type SkipWorkoutDayInput = {
  id: string;
  plan_id?: string | null;
  planId?: string | null;
  day_name?: string;
  dayName?: string;
  weekday: Weekday | null;
  exercises: Array<{ category?: string | null; target_muscle?: string | null; equipment?: string | null }>;
};

function skipDayName(day: SkipWorkoutDayInput) {
  return day.day_name || day.dayName || "Workout day";
}

function skipDayPlanId(day: SkipWorkoutDayInput) {
  return day.plan_id ?? day.planId ?? null;
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

function markSkippedNote(notes = "") {
  return `${skippedNotePrefix}${notes ? ` ${notes}` : ""}`.trim();
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

export async function startWorkoutSession(userId: string, workout: Workout) {
  const payload = {
    user_id: userId,
    workout_id: isUuid(workout.id) ? workout.id : null,
    workout_category: workout.category || workout.target_muscle || "Workout",
    workout_name: workout.name,
    started_at: new Date().toISOString(),
    completed_at: null,
    duration_minutes: null,
    notes: null,
    status: "started"
  };
  requireWorkoutPersistence(userId, "Workout session");
  let { data, error } = await supabase!.from("workout_sessions").insert(payload).select("*").single();
  if (error && isSchemaCompatibilityError(error)) {
    const { workout_category: _category, ...compatiblePayload } = payload;
    const compatible = await supabase!.from("workout_sessions").insert(compatiblePayload).select("*").single();
    data = compatible.data;
    error = compatible.error;
  }
  if (error) {
    console.warn("FitLife Hub could not start a Supabase workout session.", error.message);
    throw error;
  }
  return normalizeWorkoutSession(data as WorkoutSession);
}

export async function startWorkoutDaySession(userId: string, day: WorkoutPlanDaySession) {
  const payload = {
    user_id: userId,
    workout_id: null,
    plan_id: day.plan_id,
    plan_day_id: day.id,
    workout_day_name: day.day_name,
    workout_category: summarizeWorkoutCategory(day),
    workout_name: day.weekday ? `${day.day_name} - ${day.weekday}` : day.day_name,
    started_at: new Date().toISOString(),
    completed_at: null,
    duration_minutes: null,
    notes: null,
    status: "started"
  };
  requireWorkoutPersistence(userId, "Workout session");
  let { data, error } = await supabase!.from("workout_sessions").insert(payload).select("*").single();
  if (error && isSchemaCompatibilityError(error)) {
    const { workout_category: _category, ...compatiblePayload } = payload;
    const compatible = await supabase!.from("workout_sessions").insert(compatiblePayload).select("*").single();
    data = compatible.data;
    error = compatible.error;
  }
  if (error) {
    console.warn("FitLife Hub could not start a workout day session.", error.message);
    throw error;
  }
  return normalizeWorkoutSession(data as WorkoutSession);
}

export async function getOpenWorkoutDaySession(userId: string, planDayId: string) {
  if (!canUseUserData(userId)) return mockDelay<WorkoutSession | null>(null);
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
    console.warn("FitLife Hub could not load the open workout session.", error.message);
    return null;
  }

  return data ? normalizeWorkoutSession(data as WorkoutSession) : null;
}

export async function getOrStartWorkoutDaySession(userId: string, day: WorkoutPlanDaySession) {
  const open = await getOpenWorkoutDaySession(userId, day.id);
  if (open) return open;
  return startWorkoutDaySession(userId, day);
}

export async function getWorkoutSessionLogs(sessionId: string) {
  if (!supabase || !isUuid(sessionId)) return mockDelay<ExerciseLog[]>([]);
  const { data, error } = await supabase!
    .from("exercise_logs")
    .select("*")
    .eq("workout_session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("FitLife Hub could not load workout session logs.", error.message);
    return [];
  }

  return (data ?? []) as ExerciseLog[];
}

export async function updateWorkoutSessionDuration(sessionId: string, durationMinutes: number) {
  if (!supabase || !isUuid(sessionId)) return mockDelay(true);
  const { error } = await supabase!
    .from("workout_sessions")
    .update({ duration_minutes: Math.max(0, durationMinutes) })
    .eq("id", sessionId)
    .eq("status", "started");
  if (error) {
    console.warn("FitLife Hub could not update workout duration.", error.message);
  }
  return true;
}

export type WorkoutSetLogInput = {
  planExerciseId?: string | null;
  exerciseOrder?: number | null;
  exerciseName: string;
  exerciseCategory?: string | null;
  plannedSets?: number | null;
  plannedReps?: string | null;
  plannedRestSeconds?: number | null;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  notes?: string | null;
  completedAt?: string | null;
};

export async function saveWorkoutSetLogs(sessionId: string, logs: WorkoutSetLogInput[]) {
  requireWorkoutPersistence(sessionId, "Workout sets");
  const rows = logs.map((log) => ({
    workout_session_id: sessionId,
    plan_exercise_id: log.planExerciseId ?? null,
    exercise_order: log.exerciseOrder ?? null,
    exercise_name: log.exerciseName,
    exercise_category: log.exerciseCategory ?? null,
    planned_sets: log.plannedSets ?? null,
    planned_reps: log.plannedReps ?? null,
    planned_rest_seconds: log.plannedRestSeconds ?? null,
    set_number: log.setNumber,
    reps: log.reps,
    weight_kg: log.weightKg,
    notes: log.notes ?? null,
    completed_at: log.completedAt ?? null
  }));

  if (!rows.length) return true;
  const existingResult = await supabase!
    .from("exercise_logs")
    .select("id,exercise_name,set_number")
    .eq("workout_session_id", sessionId);
  if (existingResult.error) throw existingResult.error;

  const existingByKey = new Map(
    ((existingResult.data ?? []) as Array<{ id: string; exercise_name: string; set_number: number }>).map((log) => [
      `${log.exercise_name.toLowerCase()}::${log.set_number}`,
      log.id
    ])
  );

  const inserts = rows.filter((row) => !existingByKey.has(`${row.exercise_name.toLowerCase()}::${row.set_number}`));
  const updates = rows
    .map((row) => ({ row, id: existingByKey.get(`${row.exercise_name.toLowerCase()}::${row.set_number}`) }))
    .filter((item): item is { row: typeof rows[number]; id: string } => Boolean(item.id));

  let error = null as { message?: string; code?: string } | null;
  if (inserts.length) {
    const insertResult = await supabase!.from("exercise_logs").insert(inserts);
    error = insertResult.error;
  }
  if (error && isSchemaCompatibilityError(error)) {
    const compatibleRows = inserts.map(({ exercise_category: _category, exercise_order: _order, ...row }) => row);
    error = (await supabase!.from("exercise_logs").insert(compatibleRows)).error;
  }
  if (error) throw error;

  for (const { row, id } of updates) {
    const updateResult = await supabase!
      .from("exercise_logs")
      .update({
        plan_exercise_id: row.plan_exercise_id,
        exercise_order: row.exercise_order,
        exercise_category: row.exercise_category,
        planned_sets: row.planned_sets,
        planned_reps: row.planned_reps,
        planned_rest_seconds: row.planned_rest_seconds,
        reps: row.reps,
        weight_kg: row.weight_kg,
        notes: row.notes,
        completed_at: row.completed_at
      })
      .eq("id", id)
      .eq("workout_session_id", sessionId);
    if (updateResult.error && isSchemaCompatibilityError(updateResult.error)) {
      const compatibleUpdate = await supabase!
        .from("exercise_logs")
        .update({
          plan_exercise_id: row.plan_exercise_id,
          planned_sets: row.planned_sets,
          planned_reps: row.planned_reps,
          planned_rest_seconds: row.planned_rest_seconds,
          reps: row.reps,
          weight_kg: row.weight_kg,
          notes: row.notes,
          completed_at: row.completed_at
        })
        .eq("id", id)
        .eq("workout_session_id", sessionId);
      if (compatibleUpdate.error) throw compatibleUpdate.error;
    } else if (updateResult.error) {
      throw updateResult.error;
    }
  }

  const sessionResult = await supabase!.from("workout_sessions").select("user_id").eq("id", sessionId).single();
  if (sessionResult.error) throw sessionResult.error;
  await autoDetectPersonalRecordsFromExerciseLogs(sessionResult.data.user_id, rows, new Date().toISOString().slice(0, 10));
  return true;
}

export async function completeWorkoutSession(sessionId: string, notes: string, durationMinutes: number) {
  requireWorkoutPersistence(sessionId, "Workout session");
  const { error } = await supabase!
    .from("workout_sessions")
    .update({ status: "completed", completed_at: new Date().toISOString(), notes, duration_minutes: durationMinutes })
    .eq("id", sessionId);
  if (error) {
    console.warn("FitLife Hub could not complete this workout session.", error.message);
    throw error;
  }
  return true;
}

export async function skipWorkoutDay(userId: string, day: SkipWorkoutDayInput, notes = "") {
  const skippedAt = new Date().toISOString();
  const existing = await getOpenWorkoutDaySession(userId, day.id);
  const dayName = skipDayName(day);
  const planId = skipDayPlanId(day);
  const workoutName = day.weekday ? `${dayName} - ${day.weekday}` : dayName;

  if (!canUseUserData(userId)) {
    return mockDelay({
      id: `mock-${crypto.randomUUID()}`,
      user_id: userId,
      workout_id: null,
      plan_id: planId,
      plan_day_id: day.id,
      workout_day_name: dayName,
      workout_category: summarizeWorkoutCategory(day),
      workout_name: workoutName,
      started_at: skippedAt,
      completed_at: skippedAt,
      skipped_at: skippedAt,
      duration_minutes: 0,
      notes: notes || null,
      status: "skipped"
    } as WorkoutSession);
  }

  if (existing) {
    let { data, error } = await supabase!
      .from("workout_sessions")
      .update({
        status: "skipped",
        completed_at: skippedAt,
        skipped_at: skippedAt,
        duration_minutes: 0,
        notes: notes || existing.notes || null
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error && isSchemaCompatibilityError(error)) {
      const compatible = await supabase!
        .from("workout_sessions")
        .update({
          status: "completed",
          completed_at: skippedAt,
          duration_minutes: 0,
          notes: markSkippedNote(notes || existing.notes || "")
        })
        .eq("id", existing.id)
        .select("*")
        .single();
      data = compatible.data;
      error = compatible.error;
    }
    if (error) throw error;
    return normalizeWorkoutSession(data as WorkoutSession);
  }

  const payload = {
    user_id: userId,
    workout_id: null,
    plan_id: planId,
    plan_day_id: day.id,
    workout_day_name: dayName,
    workout_category: summarizeWorkoutCategory(day),
    workout_name: workoutName,
    started_at: skippedAt,
    completed_at: skippedAt,
    skipped_at: skippedAt,
    duration_minutes: 0,
    notes: notes || null,
    status: "skipped"
  };

  let { data, error } = await supabase!.from("workout_sessions").insert(payload).select("*").single();
  if (error && isSchemaCompatibilityError(error)) {
    const compatiblePayload = {
      user_id: payload.user_id,
      workout_id: payload.workout_id,
      plan_id: payload.plan_id,
      plan_day_id: payload.plan_day_id,
      workout_day_name: payload.workout_day_name,
      workout_name: payload.workout_name,
      started_at: payload.started_at,
      completed_at: payload.completed_at,
      duration_minutes: payload.duration_minutes,
      notes: markSkippedNote(notes),
      status: "completed"
    };
    const compatible = await supabase!.from("workout_sessions").insert(compatiblePayload).select("*").single();
    data = compatible.data;
    error = compatible.error;
  }
  if (error) {
    console.warn("FitLife Hub could not skip this workout day.", error.message);
    throw error;
  }
  return normalizeWorkoutSession(data as WorkoutSession);
}

export async function getWorkoutHistory(userId: string) {
  if (!canUseUserData(userId)) return mockDelay<WorkoutSession[]>([]);
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
    console.warn("FitLife Hub could not load workout history.", error.message);
    return getScheduledWorkoutActivity(userId, 20);
  }
  const legacyHistory = ((data ?? []) as WorkoutSession[]).map(normalizeWorkoutSession);
  const scheduledHistory = await getScheduledWorkoutActivity(userId, 20);
  return [...legacyHistory, ...scheduledHistory]
    .sort((a, b) => sessionDateForSort(b).getTime() - sessionDateForSort(a).getTime())
    .slice(0, 20);
}

export async function getWorkoutHistoryDetailed(userId: string, limit = 100) {
  if (!canUseUserData(userId)) return mockDelay<WorkoutSessionSummary[]>([]);
  const { data, error } = await supabase!
    .from("workout_sessions")
    .select("*, exercise_logs(*)")
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("FitLife Hub could not load workout history details.", error.message);
    return [];
  }
  return ((data ?? []) as WorkoutSessionSummary[])
    .map((session) => ({
      ...normalizeWorkoutSession(session),
      exercise_logs: sortExerciseLogsByWorkoutOrder(session.exercise_logs ?? [])
    }))
    .filter((session) => session.status === "completed");
}

export async function getWorkoutActivity(userId: string, limit = 180) {
  if (!canUseUserData(userId)) return mockDelay<WorkoutSession[]>([]);
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
    console.warn("FitLife Hub could not load workout activity.", error.message);
    return getScheduledWorkoutActivity(userId, limit);
  }

  const legacyActivity = ((data ?? []) as WorkoutSession[]).map(normalizeWorkoutSession);
  const scheduledActivity = await getScheduledWorkoutActivity(userId, limit);
  return [...legacyActivity, ...scheduledActivity]
    .sort((a, b) => sessionDateForSort(b).getTime() - sessionDateForSort(a).getTime())
    .slice(0, limit);
}

export async function getScheduledWorkoutHistory(userId: string, limit = 100) {
  if (!canUseUserData(userId)) return mockDelay<UserWorkoutSession[]>([]);
  const { data, error } = await supabase!
    .from("user_workout_sessions")
    .select(
      "id,user_id,user_workout_plan_id,plan_day_id,week_index,day_index,session_number,scheduled_date,day_title,status,started_at,completed_at,skipped_at,duration_minutes,notes,user_exercise_logs(id,user_workout_session_id,plan_exercise_id,exercise_order,exercise_name,planned_sets,planned_reps,weight_kg,reps,notes,completed,completed_at,created_at,updated_at)"
    )
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (!isMissingTemplateSchemaError(error)) console.warn("FitLife Hub could not load workout history.", error.message);
    return [];
  }

  return ((data ?? []) as unknown as RawScheduledSession[]).map(normalizeScheduledSession);
}

export async function getScheduledWorkoutActivity(userId: string, limit = 180) {
  if (!canUseUserData(userId)) return mockDelay<WorkoutSession[]>([]);
  const { data, error } = await supabase!
    .from("user_workout_sessions")
    .select("id,user_id,user_workout_plan_id,plan_day_id,week_index,day_index,session_number,scheduled_date,day_title,status,started_at,completed_at,skipped_at,duration_minutes,notes")
    .eq("user_id", userId)
    .in("status", ["completed", "skipped"])
    .order("scheduled_date", { ascending: false })
    .limit(limit);

  if (error) {
    if (!isMissingTemplateSchemaError(error)) console.warn("FitLife Hub could not load workout activity.", error.message);
    return [];
  }

  return ((data ?? []) as unknown as RawScheduledSession[]).map((session) => mapScheduledSessionToWorkoutSession(normalizeScheduledSession(session)));
}
