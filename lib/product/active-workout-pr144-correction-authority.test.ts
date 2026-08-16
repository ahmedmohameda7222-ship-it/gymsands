import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shell = readFileSync("components/workouts/active-workout/active-workout-execution-shell.tsx", "utf8");
const core = readFileSync("components/workouts/active-workout/active-workout-core-session-implementation.tsx", "utf8");
const details = readFileSync("components/workouts/active-workout/active-workout-details-bridge.tsx", "utf8");
const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
const de = JSON.parse(readFileSync("messages/de.json", "utf8"));
const ar = JSON.parse(readFileSync("messages/ar.json", "utf8"));

describe("PR #144 focused correction authority", () => {
  it("keeps execution inputs together and bounds compact exercise titles", () => {
    expect(shell).toContain('grid grid-cols-2 gap-3 sm:gap-4');
    expect(shell.match(/text-center text-xl font-semibold tabular-nums/g)).toHaveLength(2);
    expect(shell).toContain('line-clamp-2 min-w-0 break-words lg:line-clamp-none');
    expect(shell).toContain('aria-label={exerciseName}');
    expect(shell).toContain('data-aw10-reps-field');
    expect(shell).toContain('data-aw10-weight-field');
  });

  it("keys Previous Performance only from stable semantic primitives", () => {
    expect(core.indexOf('if (item.exercise.source_workout_id)')).toBeLessThan(core.indexOf('if (item.prescriptionItem.sourcePlanActivityId)'));
    expect(core).toContain('const previousPerformanceLookupKey =');
    expect(core).toContain('previousPerformanceIdentityKind,');
    expect(core).toContain('previousPerformanceIdentityValue,');
    expect(core).toContain('previousPerformanceSetNumber,');
    expect(core).not.toContain('}, [activeExercise, activeSet, executionCapability.supported, sessionId]);');
    expect(core).toContain('previousPerformanceReadForCurrentKey');
    expect(core).toContain('previousPerformanceResolvedKey !== previousPerformanceLookupKey');
  });

  it("queues safe Rest follow-ups behind pending set acknowledgement without opening navigation", () => {
    expect(core).toContain('pendingSetCompletionPromiseRef = useRef<Promise<boolean> | null>(null)');
    expect(core).toContain('function queueAfterPendingSetCompletion(action: () => void)');
    expect(core).toContain('if (acknowledged) action();');
    expect(core).toContain('const optimisticRestInteraction = Boolean(restActive && optimisticCompletion && isSaving)');
    expect(core).toContain('const restControlsDisabled = Boolean(');
    expect(core).toContain('isSaving || isStarting || !sessionId || !userId || !executionHydratedRef.current');
    expect(shell).toContain('disabled={restControlsDisabled}');
  });

  it("uses one replacement hierarchy and member-facing localized Rest/Sets language", () => {
    expect(details).toContain('? tr("actions.replaceToday")');
    expect(details).toContain('? tr("actions.replaceTodayDescription")');
    expect(details).not.toContain('{tr("details.adjustToday")}');
    expect(core).toContain('setPathLabel={tr("set.labelPlural")}');
    expect(core).toContain('restPresetSectionLabel={tr("rest.label")}');
    expect(en.ActiveWorkout.rest.label).toBe("Rest");
    expect(de.ActiveWorkout.rest.label).toBe("Pause");
    expect(ar.ActiveWorkout.rest.label).toBe("راحة");
    expect(en.ActiveWorkout.set.labelPlural).toBe("Sets");
    expect(de.ActiveWorkout.set.labelPlural).toBe("Sätze");
    expect(ar.ActiveWorkout.set.labelPlural).toBe("المجموعات");
  });

  it("completes the declared ARIA menu keyboard model and skips disabled items", () => {
    for (const key of ["ArrowDown", "ArrowUp", "Home", "End", "Escape"]) expect(shell).toContain(key);
    expect(shell).toContain("filter((item) => !item.disabled)");
    expect(shell).toContain("enabledItems[nextIndex]?.focus()");
    expect(shell).toContain('role="menu"');
    expect(shell).toContain('role="menuitem"');
  });
});
