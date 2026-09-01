import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Workout History rendered month-boundary fixture", () => {
  const source = readFileSync(
    resolve(process.cwd(), "services/workouts/history/client-mock-list.ts"),
    "utf8",
  );

  it("keeps incremental-load pagination available when the active month has no base history item", () => {
    expect(source).toMatch(
      /const renderedQaPrototype =\s*base\.items\[0\]\s*\?\?[\s\S]*mockHistoryList\(userId,[\s\S]*from:\s*"2000-01-01T00:00:00\.000Z",[\s\S]*to:\s*"2100-01-01T00:00:00\.000Z",[\s\S]*limit:\s*1,[\s\S]*\)\.items\[0\]\s*\?\?\s*null;/,
    );
    expect(source).toMatch(
      /\(scenario === "long-history" \|\|\s*scenario === "incremental-load"\) &&\s*renderedQaPrototype/,
    );
    expect(source).toMatch(/\.\.\.renderedQaPrototype,/);
  });

  it("rehydrates only active rendered scenarios inside the requested month", () => {
    expect(source).toMatch(/let base = mockHistoryList\(userId, request\);/);
    expect(source).toMatch(
      /scenario === "first-use-empty" \|\|[\s\S]*scenario === "filtered-empty"[\s\S]*return \{[\s\S]*items: \[\],[\s\S]*nextCursor: null,[\s\S]*\};[\s\S]*if \(scenario && base\.items\.length === 0 && renderedQaPrototype\) \{/,
    );
    expect(source).toMatch(
      /const fallbackItems = \[[\s\S]*\.\.\.renderedQaPrototype,[\s\S]*effectiveAt: new Date\([\s\S]*Date\.parse\(request\.to\) - 60 \* 60 \* 1000,[\s\S]*\)\.toISOString\(\),[\s\S]*\}\];/,
    );
    expect(source).toMatch(
      /base = \{[\s\S]*\.\.\.base,[\s\S]*items: fallbackItems,[\s\S]*summary: qaSummary\(fallbackItems\),[\s\S]*\};/,
    );
  });
});
