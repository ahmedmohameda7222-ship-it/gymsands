from pathlib import Path

path = Path("scripts/run-train-layout-qa.mjs")
source = path.read_text()
needle = '''    if (method === "GET" && requestUrl.pathname.includes("/rest/v1/exercise_logs")) {
'''
fixture = '''    if (method === "GET" && requestUrl.pathname.includes("/rest/v1/workout_sessions")) {
      const wantsObject = (requestRoute.request().headers().accept || "").includes("application/vnd.pgrst.object");
      const owner = { user_id: "00000000-0000-4000-8000-000000000001" };
      await requestRoute.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "content-range": "0-0/1", "x-plaivra-qa-fixture": "workout-session-owner" },
        body: JSON.stringify(wantsObject ? owner : [owner])
      });
      return;
    }
'''
if source.count(needle) != 1:
    raise SystemExit("Expected one exercise-log fixture insertion point.")
if 'x-plaivra-qa-fixture": "workout-session-owner' in source:
    raise SystemExit("Workout-session owner fixture is already materialized.")
path.write_text(source.replace(needle, fixture + needle, 1))
