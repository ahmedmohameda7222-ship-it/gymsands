import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { STRENGTH_DETAIL_RECORD_KEYS } from "./performance";

const serverSource = readFileSync(new URL("../../services/exercise-detail/performance-server.ts", import.meta.url), "utf8");
const clientSource = readFileSync(new URL("../../services/exercise-detail/performance-client.ts", import.meta.url), "utf8");
const viewSource = readFileSync(new URL("../../components/exercise-detail/exercise-performance-v2.tsx", import.meta.url), "utf8");
const clientFormulaPattern = /\b(?:epley|brzycki)\b|(?:load|weight)\s*[*\/+\-]\s*(?:reps|repetitions)|1\s*\+\s*(?:reps|repetitions)\s*\/\s*30/i;

describe("Exercise Performance authority", () => {
  it("uses all four current Strength record definitions", () => {
    expect(STRENGTH_DETAIL_RECORD_KEYS).toEqual([
      "highest_load",
      "estimated_one_rep_max",
      "same_load_max_repetitions",
      "exercise_session_volume",
    ]);
  });

  it("projects record events on the server and never recalculates strength formulas in the client", () => {
    expect(serverSource).toContain("canonicalizePersonalRecordRows");
    expect(serverSource).toContain("STRENGTH_DETAIL_RECORD_KEYS");
    expect(clientSource).not.toMatch(clientFormulaPattern);
    expect(viewSource).not.toMatch(clientFormulaPattern);
    expect(viewSource).toContain('key === "estimated_one_rep_max"');
  });

  it("gets recent sessions from Workout History occurrence semantics with bounded stable identities", () => {
    expect(serverSource).toContain("listWorkoutHistoryKeyset");
    expect(serverSource).toContain("exerciseIds: identities");
    expect(serverSource).toContain('statuses: ["completed", "partial"]');
    expect(serverSource).toContain("limit: input.limit");
    expect(serverSource).not.toMatch(/normalize[^\n]*exercise_name|exercise_name[^\n]*(?:===|includes|localeCompare)/i);
  });

  it("uses recentWorkoutId for canonical Workout History navigation", () => {
    expect(serverSource).toContain("recentWorkoutId: last?.canonicalSessionId ?? null");
    expect(viewSource).toContain("data?.recentWorkoutId");
    expect(viewSource).toContain("/workout-history/${encodeURIComponent(data.recentWorkoutId)}");
  });
});
