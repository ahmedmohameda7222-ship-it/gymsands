import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("AW-5 Active Workout UI core source contract", () => {
  const controller = source(
    "components/workouts/active-workout/active-workout-core-session.tsx"
  );
  const shell = source(
    "components/workouts/active-workout/active-workout-execution-shell.tsx"
  );
  const dayRoute = source("components/workouts/workout-day-focus-session.tsx");
  const directRoute = source("components/workouts/workout-session-form.tsx");

  it("converges both routes on one shared controller and shell", () => {
    expect(dayRoute).toContain("ActiveWorkoutCoreSession");
    expect(directRoute).toContain("ActiveWorkoutCoreSession");
    expect(controller).toContain("ActiveWorkoutExecutionShell");
    expect(controller).toContain('kind: "plan-day"');
    expect(controller).toContain('kind: "direct"');
  });

  it("preserves AW-4 authority for clock, transitions, canonical sets, and terminal completion", () => {
    expect(controller).toContain("getActiveSessionStore");
    expect(controller).toContain("activeSessionClock");
    expect(controller).toContain("planSessionAfterSetCompletion");
    expect(controller).toContain("completeCanonicalSet");
    expect(controller).toContain("store.completeSession");
    expect(controller).not.toContain("window.setInterval");
    expect(controller).not.toMatch(/switch\s*\(\s*commandType/);
    expect(controller).not.toContain("createWorkoutSessionExecutionWriteQueue");
    expect(controller).not.toContain("supabase.from");
    expect(controller).not.toMatch(/from\(\s*["'](?:exercise_logs|workout_session_execution_state|workout_set_details)/);
  });

  it("keeps the compact primary shell free of rejected legacy presentation", () => {
    expect(shell).toContain("data-aw5-execution-shell");
    expect(shell).toContain("data-aw5-mini-heat-map-slot");
    expect(shell).toContain("data-active-set-details-trigger");
    expect(shell).toContain("active-set-reps");
    expect(shell).toContain("active-set-weight");
    expect(shell).toContain('aria-current={item.state === "active" ? "step"');
    expect(shell).not.toContain("SessionMuscleLoadPanel");
    expect(shell).not.toContain("Saving...");
    expect(shell).not.toContain("Saved");
    expect(shell).not.toContain("carousel");
    expect(shell).not.toMatch(/>\s*\{progressPercent\}%\s*</);
  });
});
