import type { SupabaseClient, User } from "@supabase/supabase-js";

export * from "./data-export-legacy";

import { buildCurrentUserDataExport as buildLegacyCurrentUserDataExport } from "./data-export-legacy";

export async function buildCurrentUserDataExport(
  supabase: SupabaseClient,
  user: Pick<User, "id" | "email" | "created_at">
) {
  const result = await buildLegacyCurrentUserDataExport(supabase, user);
  const timelineResult = await supabase
    .from("workout_session_timeline_events")
    .select("workout_session_id,sequence_number,event_type,occurred_at,source,exercise_log_id,snapshot_item_id,payload_version,payload,created_at")
    .eq("user_id", user.id)
    .order("sequence_number", { ascending: true })
    .limit(5000);
  if (timelineResult.error) {
    result.warnings.push("Workout session timeline events could not be included in this export.");
  }
  const workouts = result.data.workouts as Record<string, unknown>;
  workouts.timeline_events = timelineResult.data ?? [];
  return result;
}
