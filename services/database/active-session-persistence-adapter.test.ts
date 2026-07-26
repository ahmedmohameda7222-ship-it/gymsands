import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("AW-4 Supabase persistence adapter boundary", () => {
  it("delegates writes to reviewed domain services and the atomic command RPC service", () => {
    const source = readFileSync(
      "services/database/active-session-persistence-adapter.ts",
      "utf8"
    );
    expect(source).toContain("executeWorkoutSessionExecutionCommand");
    expect(source).toContain("saveWorkoutSetLogs");
    expect(source).toContain("completeWorkoutSession");
    expect(source).toContain("replaceWorkoutSessionExercise");
    expect(source).toContain("skipWorkoutSessionSnapshotItem");
    expect(source).toContain("cancelWorkoutSession");
    expect(source).not.toMatch(/\.from\(|\.update\(|\.insert\(|\.upsert\(|\.delete\(/);
    expect(source).not.toMatch(/service[_-]?role/i);
  });
});
