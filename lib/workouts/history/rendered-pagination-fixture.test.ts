import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Workout History rendered pagination fixture", () => {
  it("keeps incremental-load pagination available when the active month has no base history item", () => {
    const source = readFileSync(
      resolve(process.cwd(), "services/workouts/history/client-mock-list.ts"),
      "utf8",
    );

    expect(source).toMatch(
      /const renderedQaPrototype =\s*base\.items\[0\]\s*\?\?[\s\S]*mockHistoryList\(userId,[\s\S]*from:\s*"2000-01-01T00:00:00\.000Z",[\s\S]*to:\s*"2100-01-01T00:00:00\.000Z",[\s\S]*limit:\s*1,[\s\S]*\)\.items\[0\]\s*\?\?\s*null;/,
    );
    expect(source).toMatch(
      /\(scenario === "long-history" \|\|\s*scenario === "incremental-load"\) &&\s*renderedQaPrototype/,
    );
    expect(source).toMatch(/\.\.\.renderedQaPrototype,/);
  });
});
