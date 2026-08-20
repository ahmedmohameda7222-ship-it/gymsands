import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const clientSource = readFileSync(new URL("./client.ts", import.meta.url), "utf8");
const customSource = readFileSync(new URL("./custom-exercise.ts", import.meta.url), "utf8");
const moreSource = readFileSync(new URL("../../components/exercise-detail/exercise-more-dialog.tsx", import.meta.url), "utf8");

describe("Exercise Detail resolver architecture", () => {
  it("uses one semantic Catalog resolver instead of domain discovery", () => {
    expect(clientSource).toContain("getLibraryActivity(identifier");
    expect(clientSource).not.toContain("listLibraryDomains");
    expect(clientSource).not.toMatch(/for\s*\([^)]*domain/i);
  });

  it("resolves an account-backed custom exercise by owner plus identifier", () => {
    expect(customSource).toContain('.from("user_custom_exercises")');
    expect(customSource).toContain('.eq("user_id", userId)');
    expect(customSource).toContain('.eq("id", exerciseId)');
    expect(customSource).toContain("custom_video_url,video_url");
    const coreSelect = customSource.match(/const detailCustomSelect = ([^;]+);/)?.[1] ?? "";
    expect(coreSelect).not.toContain("video_url");
  });

  it("keeps video loading behind the More action instead of core resolution", () => {
    expect(clientSource).not.toContain("getOwnedCustomExerciseVideoDirect");
    expect(moreSource).toContain("getOwnedCustomExerciseVideoDirect");
  });

  it("keeps alternatives route-specific instead of loading them in core resolution", () => {
    const coreBody = clientSource.slice(clientSource.indexOf("export async function resolveExerciseDetail"), clientSource.indexOf("export async function loadExerciseAlternatives"));
    expect(coreBody).not.toContain("getLibraryDomainActivityAlternatives");
    expect(clientSource).toContain("export async function loadExerciseAlternatives");
  });
});
