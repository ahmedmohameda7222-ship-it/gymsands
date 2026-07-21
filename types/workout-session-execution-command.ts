import type { WorkoutSessionExecutionState } from "./database";

export type WorkoutSessionExecutionCommandReceipt = {
  workout_session_id: string;
  user_id: string;
  command_id: string;
  command_type: string;
  expected_revision: number;
  request_payload: Record<string, unknown>;
  request_hash: string;
  outcome: "applied" | "no_op" | "revision_conflict";
  revision_before: number;
  revision_after: number;
  result_state: WorkoutSessionExecutionState;
  reason: string | null;
  created_at: string;
};

export type ApplyWorkoutSessionExecutionCommandAtomicArgs = {
  p_user_id: string;
  p_workout_session_id: string;
  p_command_id: string;
  p_expected_revision: number;
  p_command_type: string;
  p_payload: Record<string, unknown>;
};
