"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";

export function subscribeToActiveSessionInvalidation(input: {
  userId: string;
  workoutSessionId: string;
  onInvalidate: () => void;
}) {
  if (
    !supabase
    || !isUuid(input.userId)
    || !isUuid(input.workoutSessionId)
  ) return () => undefined;

  const client = supabase;
  const channel = client
    .channel(`active-workout:${input.workoutSessionId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "workout_session_execution_states",
        filter: `workout_session_id=eq.${input.workoutSessionId}`,
      },
      input.onInvalidate,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "exercise_logs",
        filter: `workout_session_id=eq.${input.workoutSessionId}`,
      },
      input.onInvalidate,
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "workout_sessions",
        filter: `id=eq.${input.workoutSessionId}`,
      },
      input.onInvalidate,
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}
