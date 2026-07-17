import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Workout } from "@/types";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));

import { getOrStartWorkoutSession, getStableWorkoutIdentity } from "./direct-workout-sessions";

function workout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Stable exercise",
    category: "Strength",
    target_muscle: "Chest",
    equipment: "Barbell",
    difficulty: "Intermediate",
    sets: 3,
    reps: "8",
    rest_seconds: 90,
    instructions: "",
    notes: null,
    is_global: true,
    ...overrides
  };
}

describe("authoritative direct workout sessions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses provider identity for Activity Catalog sessions", () => {
    expect(getStableWorkoutIdentity(workout({
      id: "provider-activity-1",
      catalog_source: "external",
      catalog_slug: "provider-activity"
    }))).toEqual({
      targetType: "provider_activity",
      identity: "provider-activity-1",
      provider: "plaivra_activity_catalog"
    });
  });

  it("uses owner custom UUID and canonical UUID without name matching", () => {
    expect(getStableWorkoutIdentity(workout({ catalog_source: "custom" }))).toMatchObject({
      targetType: "custom_exercise"
    });
    expect(getStableWorkoutIdentity(workout({ catalog_source: null, catalog_slug: null, catalog_version: null }))).toMatchObject({
      targetType: "global_exercise"
    });
  });

  it("delegates start and resume to one server-authoritative RPC", async () => {
    const session = {
      id: "22222222-2222-4222-8222-222222222222",
      user_id: "33333333-3333-4333-8333-333333333333",
      status: "started"
    };
    mocks.rpc.mockResolvedValue({ data: { session, resumed: true }, error: null });
    await expect(getOrStartWorkoutSession(
      session.user_id,
      workout({ id: "provider-activity-1", catalog_source: "external" }),
      session.id
    )).resolves.toMatchObject({ id: session.id });

    expect(mocks.rpc).toHaveBeenCalledWith("start_or_resume_direct_workout_session_atomic", expect.objectContaining({
      p_user_id: session.user_id,
      p_target_type: "provider_activity",
      p_identity: "provider-activity-1",
      p_provider: "plaivra_activity_catalog",
      p_candidate_session_id: session.id,
      p_planned_prescription: { sets: 3, reps: "8", restSeconds: 90 }
    }));
  });
});
