from pathlib import Path

path = Path("scripts/run-train-layout-qa.mjs")
source = path.read_text()
needle = '  await context.addCookies([{ name: "plaivra.language.v1", value: language, url: baseUrl, sameSite: "Lax" }]);\n'
fixture = '''  await context.route(/\\/api\\/workouts\\/sessions\\/[^/]+\\/muscle-analysis(?:\\?.*)?$/, async (requestRoute) => {
    await requestRoute.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "cache-control": "private, no-store", "x-plaivra-qa-fixture": "session-muscle-analysis" },
      body: JSON.stringify({
        sessionId: "20000000-0000-4000-8000-000000000001",
        snapshotId: "60000000-0000-4000-8000-000000000001",
        snapshotSchemaVersion: "workout_session_muscle_snapshot_v1",
        frozenAt: "2026-07-22T08:00:00.000Z",
        source: "session_start",
        snapshotCompleteness: "complete",
        reasonCodes: [],
        effectiveCompleteness: "complete",
        effectiveWarnings: [],
        analysis: {
          schemaVersion: "muscle_analysis_result_v1",
          taxonomyVersion: "muscle_taxonomy_v1",
          engineVersion: "muscle_load_resistance_sets_v1",
          thresholdVersion: "muscle_load_thresholds_v1",
          mode: "planned",
          period: { kind: "session" },
          completeness: "complete",
          muscles: [],
          contributionBreakdown: [],
          mappingVersionsUsed: [],
          coverage: { totalItemCount: 1, includedItemCount: 1, unmappedItemCount: 0, unsupportedItemCount: 0 },
          warnings: []
        }
      })
    });
  });
'''
if source.count(needle) != 1:
    raise SystemExit("Expected one language-cookie insertion point.")
if 'x-plaivra-qa-fixture": "session-muscle-analysis' in source:
    raise SystemExit("Fixture is already materialized.")
path.write_text(source.replace(needle, needle + fixture, 1))
