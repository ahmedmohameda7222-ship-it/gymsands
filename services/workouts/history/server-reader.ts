import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { WorkoutHistoryEligibilityOptions } from "@/lib/workouts/history/contracts";
import { readCanonicalWorkoutActivityWithClient } from "@/services/workouts/history/reader";

export function readCanonicalWorkoutActivity(input: {
  supabase: SupabaseClient;
  userId: string;
  limit?: number;
  eligibility?: WorkoutHistoryEligibilityOptions;
}) {
  return readCanonicalWorkoutActivityWithClient(input);
}
