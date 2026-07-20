import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const text = (path: string) => readFileSync(path, "utf8");

const messages = (locale: "en" | "de" | "ar") =>
  JSON.parse(text(`messages/${locale}.json`)) as {
    ActiveWorkout: {
      heatMap: {
        currentSessionHeat: string;
        currentSessionDescription: string;
        savedSetsOnly: string;
        refreshFailedDescription: string;
      };
    };
  };

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

  it("uses the canonical EN DE AR ActiveWorkout heat-map messages and safe failure copy", () => {
    const adapter = text("lib/train/muscle-intelligence/active-session-muscle-load-copy.ts");
    expect(adapter).toContain('enMessages.ActiveWorkout.heatMap');
    expect(adapter).toContain('deMessages.ActiveWorkout.heatMap');
    expect(adapter).toContain('arMessages.ActiveWorkout.heatMap');
    expect(adapter).not.toContain("Muscle Load So Far");

    const en = messages("en").ActiveWorkout.heatMap;
    const de = messages("de").ActiveWorkout.heatMap;
    const ar = messages("ar").ActiveWorkout.heatMap;

    for (const copy of [en, de, ar]) {
      expect(copy.currentSessionHeat.trim()).not.toBe("");
      expect(copy.currentSessionDescription.trim()).not.toBe("");
      expect(copy.savedSetsOnly.trim()).not.toBe("");
      expect(copy.refreshFailedDescription.trim()).not.toBe("");
    }

    expect(en.currentSessionDescription).toContain("saved completed sets");
    expect(de.currentSessionDescription).toContain("gespeicherten");
    expect(de.currentSessionDescription).toContain("abgeschlossenen Sätzen");
    expect(ar.currentSessionDescription).toContain("المجموعات المكتملة");
    expect(ar.currentSessionDescription).toContain("المحفوظة");
  });

  it("keeps tiny-screen Train actions clear of the active workout controller", () => {
    const trainUi = text("components/workouts/train-ui.tsx");
    expect(trainUi).toContain("max-[340px]:pb-[calc(var(--active-workout-controller-height)+4rem)]");
  });
});
