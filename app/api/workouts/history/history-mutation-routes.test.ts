import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeFiles = ["correct", "delete", "restore", "purge"] as const;
const routes = Object.fromEntries(
  routeFiles.map((name) => [
    name,
    readFileSync(
      `app/api/workouts/history/[sessionId]/${name}/route.ts`,
      "utf8",
    ),
  ]),
) as Record<(typeof routeFiles)[number], string>;
const maintenance = readFileSync(
  "app/api/internal/maintenance/workout-history-lifecycle/route.ts",
  "utf8",
);

describe("WH-7 history mutation routes", () => {
  it("requires authenticated users, UUID roots, and private no-store responses", () => {
    for (const source of Object.values(routes)) {
      expect(source).toContain("requireUser(request)");
      expect(source).toContain("rateLimit(request");
      expect(source).toContain("isUuid(sessionId)");
      expect(source).toContain('"Cache-Control": "private, no-store"');
    }
  });

  it("keeps permanent deletion behind an exact boolean confirmation", () => {
    expect(routes.purge).toContain("body.confirmPermanent === true");
    expect(routes.purge).toContain("purgeSession");
  });

  it("keeps lifecycle cleanup secret-authenticated and fail-closed to dry-run", () => {
    expect(maintenance).toContain("serverEnv.cronSecret");
    expect(maintenance).toContain("workoutHistoryPurgeExecutionEnabled");
    expect(maintenance).toContain(
      "const dryRun = !serverEnv.workoutHistoryPurgeExecutionEnabled",
    );
    expect(maintenance).toContain("p_dry_run: dryRun");
  });
});
