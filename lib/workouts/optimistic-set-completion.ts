import type { WorkoutSessionExecutionState } from "@/types";
import type { SessionCommandIntent, SessionEngineContext } from "@/lib/workouts/session-engine/contracts";
import { reduceSessionCommand, type SessionAfterSetCompletionPlan } from "@/lib/workouts/session-engine/reducer";

export type OptimisticSetCompletionProjection = {
  commandId: string;
  exerciseIndex: number;
  setIndex: number;
  previousExerciseIndex: number;
  previousSetIndex: number;
  projectedExecutionState: WorkoutSessionExecutionState;
  transition: SessionAfterSetCompletionPlan;
  acceptedAtMs: number;
};

export function projectOptimisticSetCompletion(input: {
  current: WorkoutSessionExecutionState;
  transition: SessionAfterSetCompletionPlan;
  context: SessionEngineContext;
  commandId: string;
  nowMs: number;
}) {
  const intent: SessionCommandIntent = {
    userId: input.current.user_id,
    workoutSessionId: input.current.workout_session_id,
    commandId: input.commandId,
    commandType: "complete_set_transition",
    payload: {
      active_snapshot_item_id: input.transition.patch.active_snapshot_item_id,
      active_item_order: input.transition.patch.active_item_order,
      active_set_number: input.transition.patch.active_set_number,
      view_state: input.transition.patch.view_state,
      rest_duration_seconds: input.transition.patch.rest_duration_seconds,
      controller_device_id: input.transition.patch.controller_device_id,
    },
  };
  return reduceSessionCommand(input.current, intent, input.context, input.nowMs).state;
}
