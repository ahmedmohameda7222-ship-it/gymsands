import { describe, expect, it } from "vitest";
import { translateTrain } from "@/lib/i18n/train";
import { archivedPlanEditorRedirect, canEditWorkoutPlan, workoutPlanDetailActions } from "@/lib/workouts/train-overview-runtime";

describe("archived Train plan behavior", () => {
  const archived = { id: "archived-1", archived_at: "2026-07-01T00:00:00.000Z", is_active: false };

  it("exposes only Duplicate, Restore/activate, Delete, and Back", () => {
    expect(workoutPlanDetailActions(archived)).toEqual(["duplicate", "activate", "delete", "back"]);
  });

  it("does not expose Adjust Plan", () => {
    expect(workoutPlanDetailActions(archived)).not.toContain("adjust");
  });

  it("does not expose Edit Plan", () => {
    expect(workoutPlanDetailActions(archived)).not.toContain("edit");
    expect(canEditWorkoutPlan(archived)).toBe(false);
  });

  it("does not expose Start or Resume", () => {
    expect(workoutPlanDetailActions(archived)).not.toContain("start");
    expect(workoutPlanDetailActions(archived)).not.toContain("resume");
  });

  it("keeps duplicate, restore/activate, and history-safe delete available", () => {
    const actions = workoutPlanDetailActions(archived);
    expect(actions).toContain("duplicate");
    expect(actions).toContain("activate");
    expect(actions).toContain("delete");
  });

  it("redirects an archived editor deep link back to read-only plan detail", () => {
    expect(archivedPlanEditorRedirect(archived)).toBe("/my-workout/plans/archived-1");
    expect(archivedPlanEditorRedirect({ id: "active-1", archived_at: null })).toBeNull();
  });

  it("keeps German archived actions localized", () => {
    expect(translateTrain("de", "archived")).toBe("Archiviert");
    expect(translateTrain("de", "restoreActivate")).toBe("Wiederherstellen oder aktivieren");
    expect(translateTrain("de", "deletePermanently")).toBe("Dauerhaft löschen");
  });

  it("keeps Arabic archived actions localized and RTL metadata intact", async () => {
    expect(translateTrain("ar", "archived")).not.toBe("Archived");
    expect(translateTrain("ar", "restoreActivate")).not.toBe("Restore or activate");
    const { getTrainLocaleMetadata } = await import("@/lib/i18n/train");
    expect(getTrainLocaleMetadata("ar").dir).toBe("rtl");
  });

  it("keeps the full action set for a non-archived plan", () => {
    const actions = workoutPlanDetailActions({ archived_at: null, is_active: true });
    expect(actions).toEqual(expect.arrayContaining(["edit", "start", "resume", "adjust", "duplicate", "archive", "delete", "back"]));
  });
});
