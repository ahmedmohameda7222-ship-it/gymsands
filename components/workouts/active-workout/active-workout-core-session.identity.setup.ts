import { vi } from "vitest";

vi.mock("@/components/workouts/active-workout/active-workout-execution-capability", () => ({
  resolveActiveWorkoutExecutionCapability: () => ({
    supported: true,
    contract: "strength_reps_weight_v1",
    source: "legacy_compatibility"
  })
}));

vi.mock("@/services/workouts/active-workout/previous-performance-client", () => ({
  readActiveWorkoutPreviousPerformanceClient: vi.fn(async () => null)
}));
