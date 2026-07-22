"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import type {
  WorkoutSessionExerciseSkipReason,
  WorkoutSessionTimelineEvent,
  WorkoutSessionTimelinePage
} from "@/types";

const DEFAULT_TIMELINE_LIMIT = 50;
const MAX_TIMELINE_LIMIT = 200;

export async function getWorkoutSessionTimeline(
  userId: string,
  workoutSessionId: string,
  options?: { afterSequence?: number | null; limit?: number }
): Promise<WorkoutSessionTimelinePage> {
  if (!supabase || !isUuid(userId) || !isUuid(workoutSessionId)) {
    throw new Error("Workout session timeline is unavailable because the session identity is invalid.");
  }
  const requestedLimit = Number.isFinite(options?.limit) ? Math.trunc(options!.limit!) : DEFAULT_TIMELINE_LIMIT;
  const limit = Math.min(MAX_TIMELINE_LIMIT, Math.max(1, requestedLimit));
  const afterSequence = options?.afterSequence == null
    ? null
    : Math.max(0, Math.trunc(options.afterSequence));

  let query = supabase
    .from("workout_session_timeline_events")
    .select("id,workout_session_id,user_id,sequence_number,event_type,occurred_at,source,command_id,exercise_log_id,snapshot_item_id,payload_version,payload,idempotency_key,created_at")
    .eq("user_id", userId)
    .eq("workout_session_id", workoutSessionId)
    .order("sequence_number", { ascending: true })
    .limit(limit + 1);
  if (afterSequence !== null) query = query.gt("sequence_number", afterSequence);

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as WorkoutSessionTimelineEvent[];
  const hasMore = rows.length > limit;
  const events = hasMore ? rows.slice(0, limit) : rows;
  return {
    events,
    nextAfterSequence: hasMore ? events.at(-1)?.sequence_number ?? null : null
  };
}

export async function skipWorkoutSessionSnapshotItem(
  userId: string,
  workoutSessionId: string,
  snapshotItemId: string,
  reason: WorkoutSessionExerciseSkipReason = "user_skipped"
) {
  if (!supabase || !isUuid(userId) || !isUuid(workoutSessionId) || !isUuid(snapshotItemId)) {
    throw new Error("Workout exercise skip request is invalid.");
  }
  const { data, error } = await supabase.rpc("skip_workout_session_snapshot_item_atomic", {
    p_user_id: userId,
    p_session_id: workoutSessionId,
    p_snapshot_item_id: snapshotItemId,
    p_reason: reason
  });
  if (error) throw error;
  return data;
}
