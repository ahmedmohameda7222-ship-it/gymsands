export const WORKOUT_HISTORY_QA_VIEWPORTS = Object.freeze([
  { name: "320x568", width: 320, height: 568 },
  { name: "360x800", width: 360, height: 800 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1440x900", width: 1440, height: 900 },
]);

const DETAIL_ID = "20000000-0000-4000-8000-000000000002";
const SCHEDULED_ID = "21000000-0000-4000-8000-000000000001";

export const WORKOUT_HISTORY_QA_SCENARIOS = Object.freeze(
  [
    ["initial-loading", 0, "en", "light", "/workout-history", "initial"],
    ["first-use-empty", 1, "de", "light", "/workout-history", "list"],
    ["normal-month", 2, "en", "light", "/workout-history", "list"],
    ["long-history", 3, "ar", "dark", "/workout-history", "list"],
    ["incremental-load", 4, "en", "light", "/workout-history", "load-more"],
    ["active-filters", 5, "de", "dark", "/workout-history", "filters"],
    ["filtered-empty", 6, "en", "light", "/workout-history?q=no-match", "list"],
    ["partial-session", 7, "ar", "light", "/workout-history", "list"],
    ["cancelled-meaningful", 0, "en", "dark", "/workout-history", "list"],
    [
      "scheduled-fallback",
      1,
      "de",
      "light",
      `/workout-history/scheduled/${SCHEDULED_ID}`,
      "detail",
    ],
    ["blocking-error", 2, "ar", "light", "/workout-history", "list"],
    ["stale-cached-data", 3, "en", "dark", "/workout-history", "list"],
    ["offline-cached-read", 4, "de", "light", "/workout-history", "list", true],
    ["desktop-layout", 5, "en", "light", "/workout-history", "list"],
    [
      "session-details",
      6,
      "ar",
      "dark",
      `/workout-history/${DETAIL_ID}`,
      "detail",
    ],
    [
      "flat-activity-results",
      7,
      "en",
      "light",
      `/workout-history/${DETAIL_ID}`,
      "detail",
    ],
    ["long-notes", 0, "de", "light", `/workout-history/${DETAIL_ID}`, "detail"],
    [
      "v1-muscle-snapshot",
      1,
      "en",
      "dark",
      `/workout-history/${DETAIL_ID}`,
      "detail",
    ],
    [
      "v2-muscle-snapshot",
      2,
      "ar",
      "light",
      `/workout-history/${DETAIL_ID}`,
      "detail",
    ],
    [
      "verified-pr",
      3,
      "en",
      "light",
      `/workout-history/${DETAIL_ID}`,
      "detail",
    ],
    [
      "correction-dialog",
      4,
      "de",
      "dark",
      `/workout-history/${DETAIL_ID}`,
      "correction",
    ],
    [
      "correction-edit-set",
      2,
      "en",
      "light",
      `/workout-history/${DETAIL_ID}`,
      "correction-edit",
    ],
    [
      "correction-add-set",
      3,
      "de",
      "dark",
      `/workout-history/${DETAIL_ID}`,
      "correction-add",
    ],
    [
      "correction-remove-set",
      4,
      "ar",
      "light",
      `/workout-history/${DETAIL_ID}`,
      "correction-remove",
    ],
    [
      "correction-revision-conflict",
      5,
      "en",
      "dark",
      `/workout-history/${DETAIL_ID}`,
      "correction-conflict",
    ],
    [
      "post-correction-detail",
      5,
      "en",
      "light",
      `/workout-history/${DETAIL_ID}`,
      "detail",
    ],
    [
      "soft-delete-confirmation",
      6,
      "ar",
      "light",
      `/workout-history/${DETAIL_ID}`,
      "delete-confirmation",
    ],
    [
      "recently-deleted",
      7,
      "en",
      "dark",
      "/settings/data-privacy",
      "recently-deleted",
    ],
    ["restore", 0, "de", "light", "/settings/data-privacy", "restore"],
    ["permanent-delete", 1, "en", "light", "/settings/data-privacy", "purge"],
    [
      "repeat-immediate-start",
      2,
      "ar",
      "dark",
      `/workout-history/${DETAIL_ID}`,
      "repeat",
    ],
    [
      "repeat-replacement-review",
      3,
      "en",
      "light",
      `/workout-history/${DETAIL_ID}`,
      "repeat",
    ],
    [
      "active-session-conflict",
      4,
      "de",
      "light",
      `/workout-history/${DETAIL_ID}`,
      "repeat",
    ],
    ["long-translations", 5, "ar", "dark", "/workout-history", "list"],
    ["stale-session-detail", 0, "en", "light", `/workout-history/${DETAIL_ID}`, "stale-detail"],
    ["semantic-non-strength-list", 1, "de", "light", "/workout-history", "semantic-list"],
    ["semantic-non-strength-detail", 2, "ar", "dark", `/workout-history/${DETAIL_ID}`, "semantic-detail"],
    ["list-200-percent", 0, "en", "light", "/workout-history", "zoom-list", false, 2],
    ["detail-200-percent", 2, "de", "light", `/workout-history/${DETAIL_ID}`, "zoom-detail", false, 2],
    ["keyboard-focus", 6, "en", "light", "/workout-history", "keyboard"],
    ["reduced-motion", 7, "de", "dark", "/workout-history", "reduced-motion"],
  ].map(
    ([
      name,
      viewportIndex,
      language,
      theme,
      route,
      action,
      offline = false,
      zoom = 1,
    ]) => ({
      name,
      viewport: WORKOUT_HISTORY_QA_VIEWPORTS[viewportIndex],
      language,
      theme,
      route,
      action,
      offline,
      zoom,
    }),
  ),
);

function repeatPreview(scenario) {
  const replacement = scenario === "repeat-replacement-review";
  return {
    sourceSessionId: DETAIL_ID,
    sourceTitle: "Strength B",
    canStartImmediately: !replacement && scenario !== "active-session-conflict",
    activeSessionConflict:
      scenario === "active-session-conflict"
        ? {
            sessionId: "20000000-0000-4000-8000-000000000001",
            title: "Strength A",
          }
        : null,
    items: [
      {
        sourceSnapshotItemId: "24000000-0000-4000-8000-000000000001",
        order: 1,
        historicalName: "Bench press",
        currentResolution: replacement
          ? {
              state: "replacement-required",
              reason: "catalog_identity_retired",
              alternatives: [
                {
                  identity: {
                    targetType: "global_exercise",
                    identity: "40000000-0000-4000-8000-000000000003",
                  },
                  name: "Dumbbell bench press",
                },
              ],
            }
          : {
              state: "available",
              identity: {
                targetType: "global_exercise",
                identity: "40000000-0000-4000-8000-000000000001",
              },
              name: "Bench press",
            },
        plannedPrescription: { sets: 4, repetitions: "8-10", restSeconds: 90 },
        normalizedSets: [],
      },
    ],
  };
}

function trainingFocusPayload(scenario) {
  const advanced = scenario === "v2-muscle-snapshot";
  return {
    sessionId: DETAIL_ID,
    snapshotId: "24000000-0000-4000-8000-000000000001",
    snapshotSchemaVersion: advanced
      ? "workout_session_muscle_snapshot_v2"
      : "workout_session_muscle_snapshot_v1",
    frozenAt: "2026-08-08T09:52:00.000Z",
    source: "session_start",
    snapshotCompleteness: "complete",
    reasonCodes: [],
    effectiveCompleteness: "complete",
    effectiveWarnings: [],
    analysis: advanced
      ? {
          kind: "advanced",
          schemaVersion: "advanced_muscle_analysis_result_v1",
          atlasVersion: "advanced_muscle_atlas_v1",
          mappingSchemaVersion: "advanced_muscle_mapping_v1",
          engineVersion: "advanced_muscle_exposure_v1",
          heatScaleVersion: "advanced_muscle_heat_scale_v1",
          workloadModelVersion: "resistance_sets_v1",
          scope: "single_session",
          completeness: "complete",
          targets: [
            { targetId: "pectoralis.middle", rawExposure: 6, heatLevel: "high" },
            { targetId: "triceps.lateral_head", rawExposure: 3, heatLevel: "moderate" },
          ],
          mappingVersionsUsed: [],
          coverage: { totalItemCount: 2, includedItemCount: 2, unmappedItemCount: 0 },
          warnings: [],
        }
      : {
          schemaVersion: "muscle_analysis_result_v1",
          taxonomyVersion: "muscle_taxonomy_v1",
          engineVersion: "muscle_load_resistance_sets_v1",
          thresholdVersion: "muscle_load_thresholds_v1",
          mode: "completed",
          period: { kind: "session" },
          completeness: "complete",
          muscles: [
            { muscleId: "pectoralis_major", rawScore: 6, levelInputScore: 6, level: "high" },
            { muscleId: "triceps_brachii", rawScore: 3, levelInputScore: 3, level: "medium" },
          ],
          contributionBreakdown: [],
          mappingVersionsUsed: [],
          coverage: { totalItemCount: 2, includedItemCount: 2, unmappedItemCount: 0, unsupportedItemCount: 0 },
          warnings: [],
        },
  };
}

export async function installWorkoutHistoryQaFixture(
  context,
  scenario,
  baseUrl,
) {
  const origin = new URL(baseUrl).origin;
  await context.addCookies([
    {
      name: "plaivra.language.v1",
      value: scenario.language,
      url: origin,
    },
  ]);
  await context.addInitScript(
    ({ name, language, theme, offline }) => {
      localStorage.setItem("plaivra.qa.workout-history-scenario", name);
      localStorage.setItem("plaivra.language.v1", language);
      localStorage.setItem(
        "plaivra-theme-id",
        theme === "dark" ? "elite-noir" : "olive",
      );
      Object.defineProperty(window.navigator, "onLine", {
        configurable: true,
        get: () => !offline,
      });
    },
    {
      name: scenario.name,
      language: scenario.language,
      theme: scenario.theme,
      offline: scenario.offline,
    },
  );

  const state = { deletedItems: 1, requests: [] };
  await context.route(/^https:\/\/[^/]+\.supabase\.co\//u, async (route) => {
    const request = route.request();
    const method = request.method();
    let requestBody = null;
    if (method !== "GET" && method !== "HEAD") {
      try {
        requestBody = request.postDataJSON();
      } catch {
        requestBody = {};
      }
    }
    const responseBody =
      method === "GET" || method === "HEAD"
        ? []
        : Array.isArray(requestBody)
          ? (requestBody[0] ?? {})
          : (requestBody ?? {});
    await route.fulfill({
      status: method === "POST" ? 201 : 200,
      contentType: "application/json",
      headers: {
        "content-range": "0-0/0",
        "x-plaivra-qa-fixture": "workout-history-v1",
      },
      body: method === "HEAD" ? "" : JSON.stringify(responseBody),
    });
  });
  await context.route(
    /\/api\/workouts\/sessions\/[^/]+\/muscle-analysis(?:\?.*)?$/u,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(trainingFocusPayload(scenario.name)),
      });
    },
  );
  await context.route(`${origin}/api/workouts/history/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let body = null;
    if (request.method() !== "GET" && request.method() !== "HEAD") {
      try {
        body = request.postDataJSON();
      } catch {
        body = {};
      }
    }
    state.requests.push({ method: request.method(), path: url.pathname, body });
    if (url.pathname.endsWith("/repeat-preview")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(repeatPreview(scenario.name)),
      });
      return;
    }
    if (url.pathname.endsWith("/repeat") && request.method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          session: { id: "25000000-0000-4000-8000-000000000001" },
        }),
      });
      return;
    }
    if (url.pathname.endsWith("/recently-deleted")) {
      const items = state.deletedItems
        ? [
            {
              id: DETAIL_ID,
              workout_name: "Strength B",
              started_at: "2026-07-20T08:00:00.000Z",
              days_remaining: 24,
            },
          ]
        : [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items }),
      });
      return;
    }
    if (url.pathname.endsWith("/restore") || url.pathname.endsWith("/purge")) {
      state.deletedItems = 0;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          restored: url.pathname.endsWith("/restore"),
          purged: url.pathname.endsWith("/purge"),
        }),
      });
      return;
    }
    if (url.pathname.endsWith("/correct")) {
      if (scenario.name === "correction-revision-conflict") {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Workout history revision conflict.",
            code: "40001",
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          history_revision: 2,
          projection_refresh_pending: false,
        }),
      });
      return;
    }
    if (url.pathname.endsWith("/delete")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ history_revision: 2 }),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Unmatched deterministic WH-10 fixture route.",
      }),
    });
  });
  return state;
}
