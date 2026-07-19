import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const text = (path: string) => readFileSync(path, "utf8");

describe("Muscle Intelligence Phase 4C.2", () => {
  it("adds active persisted-set analysis while preserving frozen completion", () => {
    const contracts = text("lib/train/muscle-intelligence/contracts.ts");
    const session = text("lib/train/muscle-intelligence/session-analysis.ts");
    const advanced = text("lib/train/muscle-intelligence/advanced-session-analysis.ts");
    expect(contracts).toContain('["planned", "active", "completed"]');
    expect(session).toContain("completed_at,set_type");
    expect(advanced).toContain('input.mode !== "active" || log.set_type !== "warmup"');
    expect(advanced).toContain("item.performed_qualifying_sets");
  });

  it("shows active muscle load only in plan-day execution", () => {
    const day = text("components/workouts/workout-day-focus-session.tsx");
    const direct = text("components/workouts/workout-session-form.tsx");
    const panel = text("components/workouts/session-muscle-load-panel.tsx");
    expect(day).toContain("SessionMuscleLoadPanel");
    expect(day).toContain("muscleLoadRevision");
    expect(panel).toContain("data-phase4c2-active-muscle-load");
    expect(panel).toContain("mode=active");
    expect(panel).toContain("requestGenerationRef");
    expect(direct).not.toContain("SessionMuscleLoadPanel");
  });

  it("includes EN DE AR copy and safe failure messaging", () => {
    const copy = text("lib/train/muscle-intelligence/active-session-muscle-load-copy.ts");
    expect(copy).toContain("Muscle Load So Far");
    expect(copy).toContain("Muskelbelastung bisher");
    expect(copy).toContain("حمل العضلات حتى الآن");
    expect(copy).toContain("Your workout and saved sets are unaffected");
  });

  it("keeps tiny-screen Train actions clear of the active workout controller", () => {
    const trainUi = text("components/workouts/train-ui.tsx");
    expect(trainUi).toContain("max-[340px]:pb-[var(--active-workout-controller-height,0px)]");
  });
});
