import { chromium } from "@playwright/test";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
const outputDir = path.resolve(
  process.env.QA_TRAIN_EVIDENCE_DIR ||
    path.join(process.cwd(), "quality-reports", "train-phase0b-phase1"),
);
const serverMode = process.env.QA_SERVER_MODE || "production";
const buildCommand =
  process.env.QA_BUILD_COMMAND ||
  "NEXT_PUBLIC_USE_MOCK_AUTH=true NEXT_PUBLIC_PLAIVRA_PRODUCTION_QA=true npm run build";
const startCommand = process.env.QA_START_COMMAND || "npm run start";
const mockAuthBuildValue = process.env.QA_MOCK_AUTH_BUILD_VALUE || "true";
const headSha = process.env.QA_HEAD_SHA || process.env.GITHUB_SHA || null;
const workflowRunId =
  process.env.QA_WORKFLOW_RUN_ID || process.env.GITHUB_RUN_ID || null;
const trainMockContract = JSON.parse(
  await readFile(
    new URL("../lib/fixtures/train-mock-contract.json", import.meta.url),
    "utf8",
  ),
);
const activePlanId = trainMockContract.planIds.active;
const inactivePlanId = trainMockContract.planIds.inactive;
const archivedPlanId = trainMockContract.planIds.archived;
const activeDayId = trainMockContract.activeDayId;
const catalogActivityId = "11111111-1111-4111-8111-111111111111";
const viewports = [
  { name: "320x568", width: 320, height: 568 },
  { name: "360x800", width: 360, height: 800 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "360x780", width: 360, height: 780 },
  { name: "393x852", width: 393, height: 852 },
];
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const observations = [];

const catalogActivities = Array.from({ length: 8 }, (_, index) => ({
  id:
    index === 0
      ? catalogActivityId
      : `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
  slug: index === 0 ? "barbell_squat" : `catalog_activity_${index + 1}`,
  name:
    index === 0
      ? "Barbell squat with a deliberately long activity name for responsive verification"
      : `Catalog activity ${index + 1}`,
  shortDescription:
    index === 0
      ? "A catalog-backed strength movement used for deterministic rendered verification."
      : null,
  instructions: [
    {
      order: 1,
      text: "Brace, move with control, and stop if the movement feels painful.",
    },
  ],
  difficulty: index % 2 ? "beginner" : "intermediate",
  movementPattern: index % 2 ? "push" : "squat",
  version: 1,
  activityType: {
    id: "22222222-2222-4222-8222-222222222222",
    slug: "strength",
    name: "Strength",
  },
  metricSchema: null,
  sports: [],
  sessionTypes: [],
  sessionPhases: [],
  equipment: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      slug: index % 2 ? "bodyweight" : "barbell",
      name: index % 2 ? "Bodyweight" : "Barbell",
      isRequired: true,
    },
  ],
  muscles: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      slug: index % 2 ? "chest" : "quadriceps",
      name: index % 2 ? "Chest" : "Quadriceps",
      role: "primary",
    },
  ],
  trainingGoals: [],
  translations: {},
  guideUrl: index === 0 ? "https://example.com/catalog-guide" : null,
  videoUrl: index === 0 ? "https://example.com/catalog-video" : null,
  updatedAt: "2026-07-15T00:00:00.000Z",
}));

function catalogPayload(url, scenario) {
  const libraryMeta = {
    apiVersion: "v2",
    locale: url.searchParams.get("locale") || "en",
    libraryRelease: {
      id: "d985375c-a97e-592b-832c-ccf6226e1ae9",
      version: "p10e-library-v1",
      checksum: "6524498fd6a888ee3f4495516c38e7ad27332a5d04dcbbb3bc86b8469165e31e",
      publishedAt: "2026-08-11T20:46:59.000Z",
      strengthSemanticFingerprint: "73092422c4ef3bb6f386b7081fdeaaacb65778a29d449ba42fa2dda8fd9d142a",
    },
    catalogRelease: {
      id: "fc92eca8-c2ab-5366-ba83-5c64c904aaca",
      version: "p10e-library-v1",
      checksum: "a3f4707871d41efa50de8e56d7760dc06c45765aa35ac4c42f179186176c5271",
    },
    source: scenario === "fallback" ? "legacy" : "library_v2",
    degraded: scenario === "fallback",
  };
  const toLibraryActivity = (item, index = 0) => ({
    id: item.id,
    revisionId: `66666666-6666-4666-8666-${String(index + 1).padStart(12, "0")}`,
    revisionNumber: item.version,
    revisionLifecycle: "published",
    revisionChecksum: null,
    slug: item.slug,
    name: item.name,
    shortDescription: item.shortDescription,
    instructions: item.instructions,
    difficulty: item.difficulty,
    movementPattern: item.movementPattern,
    activityType: { slug: "strength", name: "Strength" },
    membership: {
      kind: "owned",
      visibility: "default",
      domainPriority: index + 1,
      primaryDomain: true,
    },
    aliases: [],
    equipment: item.equipment.map((equipment) => ({
      slug: equipment.slug,
      name: equipment.name,
      requirement: equipment.isRequired ? "required" : "optional",
    })),
    coverage: item.muscles.map((muscle) => ({
      name: muscle.name,
      muscleName: muscle.name,
      role: muscle.role,
      bodyRegion: "Upper Body",
      broadGroup: "Upper Body",
    })),
    executionProfiles: [{
      filterProfile: {
        difficulty: item.difficulty,
        movementFamily: item.movementPattern,
      },
    }],
    bodyEffects: [],
  });
  const toLibraryDetail = (item, index = 0) => ({
    ...toLibraryActivity(item, index),
    prescriptionSchema: {
      id: "77777777-7777-4777-8777-777777777777",
      key: "resistance_sets",
      version: 1,
      checksum: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      fields: [],
    },
    performedMetricSchema: null,
    recordDefinitions: [],
    heatMap: {
      mapping: item.muscles.map((muscle) => ({
        muscleName: muscle.name,
        role: muscle.role,
        broadGroup: "Upper Body",
      })),
    },
    publicationPolicy: {
      id: "88888888-8888-4888-8888-888888888888",
      key: "published_library",
      version: 1,
      checksum: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    },
    capabilityContract: {
      id: "99999999-9999-4999-8999-999999999999",
      version: "main-activity-catalog-v2-capability-v2",
      compatibleCatalogApiVersion: "v2",
      checksum: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    },
    authority: {
      libraryRelease: {
        id: libraryMeta.libraryRelease.id,
        version: libraryMeta.libraryRelease.version,
        checksum: libraryMeta.libraryRelease.checksum,
      },
      catalogRelease: {
        id: libraryMeta.catalogRelease.id,
        version: libraryMeta.catalogRelease.version,
        checksum: libraryMeta.catalogRelease.checksum,
      },
      activityId: item.id,
      revisionId: `66666666-6666-4666-8666-${String(index + 1).padStart(12, "0")}`,
      revisionNumber: item.version,
    },
  });
  const libraryDomainPath = "/api/activity-catalog/library-domains/strength";
  if (url.pathname === `${libraryDomainPath}/filters`) {
    return { data: [], meta: libraryMeta };
  }
  if (url.pathname === `${libraryDomainPath}/archetypes`) {
    return { data: [], meta: libraryMeta };
  }
  if (url.pathname === `${libraryDomainPath}/activities`) {
    const data = scenario === "empty" ? [] : catalogActivities.map(toLibraryActivity);
    return {
      data,
      pagination: {
        limit: Math.min(Number(url.searchParams.get("limit") || 50), 50),
        returned: data.length,
        nextCursor: null,
      },
      meta: libraryMeta,
    };
  }
  if (url.pathname.startsWith(`${libraryDomainPath}/activities/`)) {
    const parts = url.pathname.split("/");
    const identifier = parts.at(-1) === "alternatives" ? parts.at(-2) : parts.at(-1);
    const foundIndex = catalogActivities.findIndex(
      (item) => item.id === identifier || item.slug === identifier,
    );
    const index = foundIndex >= 0 ? foundIndex : 0;
    const selected = catalogActivities[index];
    if (url.pathname.endsWith("/alternatives")) {
      return {
        data: scenario === "empty" ? [] : [{
          relationshipType: "progression",
          rationale: "Deterministic rendered QA progression fixture.",
          prescriptionTransfer: { mode: "partial" },
          activity: toLibraryDetail(catalogActivities[1], 1),
        }],
        meta: libraryMeta,
      };
    }
    return { data: toLibraryDetail(selected, index), meta: libraryMeta };
  }
  const meta = {
    source: scenario === "fallback" ? "legacy" : "external",
    degraded: scenario === "fallback",
    catalogVersion: scenario === "fallback" ? "legacy" : "v1",
    locale: "en",
  };
  if (url.pathname.endsWith("/filters"))
    return {
      data: {
        sports: [],
        activityTypes: [catalogActivities[0].activityType],
        sessionTypes: [],
        sessionPhases: [],
        equipment: catalogActivities.slice(0, 2).map((item) => ({
          id: item.equipment[0].id,
          slug: item.equipment[0].slug,
          name: item.equipment[0].name,
        })),
        trainingGoals: [],
        difficulties: ["beginner", "intermediate"],
      },
      meta,
    };
  if (url.pathname.endsWith("/alternatives"))
    return {
      data:
        scenario === "empty"
          ? []
          : [
              {
                sourceActivityId: catalogActivityId,
                alternativeActivityId: catalogActivities[1].id,
                alternativeSlug: catalogActivities[1].slug,
                alternativeName: catalogActivities[1].name,
                reasonCode: "same_pattern",
                prescriptionTransfer: "partial",
                compatibilityScore: 0.8,
                priority: 1,
              },
            ],
      meta,
    };
  if (/\/activities\/[^/]+$/.test(url.pathname))
    return {
      data:
        catalogActivities.find(
          (item) =>
            item.id === url.pathname.split("/").at(-1) ||
            item.slug === url.pathname.split("/").at(-1),
        ) ?? catalogActivities[0],
      meta,
    };
  if (url.pathname.endsWith("/activities")) {
    const data = scenario === "empty" ? [] : catalogActivities;
    return {
      data,
      pagination: {
        limit: Number(url.searchParams.get("limit") || 30),
        offset: Number(url.searchParams.get("offset") || 0),
        returned: data.length,
        nextOffset: null,
      },
      meta,
    };
  }
  if (url.pathname.endsWith("/sports")) return { data: [], meta };
  return {
    data: {
      sport: {
        id: "55555555-5555-4555-8555-555555555555",
        slug: "strength",
        name: "Strength",
      },
      sessionTypes: [],
      sessionPhases: [],
    },
    meta,
  };
}

function intersects(a, b) {
  if (!a || !b) return false;
  return (
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  );
}

function workoutSessionFixture({
  planDayId = null,
  workoutId = null,
  workoutName = "Strength A",
} = {}) {
  return {
    id: trainMockContract.activeSessionId,
    user_id: trainMockContract.userId,
    workout_id: workoutId,
    plan_id: planDayId ? activePlanId : null,
    plan_day_id: planDayId,
    workout_name: workoutName,
    workout_day_name: planDayId ? "Strength A" : null,
    workout_category: "strength",
    started_at: "2026-07-22T08:00:00.000Z",
    completed_at: null,
    skipped_at: null,
    duration_minutes: null,
    notes: null,
    status: "started",
  };
}

async function openScenario({
  viewport,
  scenario,
  language = "en",
  route,
  step = null,
  theme = "light",
  catalogScenario = "success",
  zoom = 1,
  openPicker = false,
  openSetDetails = false,
  keyboardCheck = false,
  mobileKeyboard = false,
  variant = "default",
}) {
  const renderedViewport =
    zoom === 1
      ? viewport
      : {
          ...viewport,
          width: Math.max(160, Math.floor(viewport.width / zoom)),
          height: Math.max(284, Math.floor(viewport.height / zoom)),
        };
  const themeId = theme === "dark" ? "elite-noir" : "olive";
  const directSession =
    route.startsWith("/workouts/session/") &&
    !route.startsWith("/workouts/session/day/");
  const sessionRoot = directSession
    ? workoutSessionFixture({
        workoutId: catalogActivityId,
        workoutName: catalogActivities[0].name,
      })
    : workoutSessionFixture({ planDayId: activeDayId });
  const frozenActivities = directSession
    ? [
        {
          sourceId: catalogActivityId,
          sourceKind: "activity",
          name: catalogActivities[0].name,
          sets: 3,
          reps: "8-10",
          restSeconds: 90,
        },
      ]
    : [
        {
          sourceId: `${activeDayId.slice(0, -1)}1`,
          sourceKind: "exercise",
          name: "Back Squat",
          sets: 4,
          reps: "6-8",
          restSeconds: 120,
        },
        {
          sourceId: `${activeDayId.slice(0, -1)}2`,
          sourceKind: "exercise",
          name: "Bench Press",
          sets: 3,
          reps: "8-12",
          restSeconds: 75,
        },
        {
          sourceId: `${activeDayId.slice(0, -1)}3`,
          sourceKind: "exercise",
          name: "Row",
          sets: 3,
          reps: "8-12",
          restSeconds: 75,
        },
        {
          sourceId: `${activeDayId.slice(0, -1)}4`,
          sourceKind: "exercise",
          name: "Plank",
          sets: 3,
          reps: "8-12",
          restSeconds: 75,
        },
      ];
  const prescriptionSnapshotId = "21000000-0000-4000-8000-000000000001";
  const prescriptionItems = frozenActivities.map((activity, index) => ({
    id: `22000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    snapshot_id: prescriptionSnapshotId,
    user_id: trainMockContract.userId,
    item_order: index + 1,
    source_plan_exercise_id:
      activity.sourceKind === "exercise" ? activity.sourceId : null,
    source_plan_activity_id:
      activity.sourceKind === "activity" ? activity.sourceId : null,
    activity_name_snapshot: activity.name,
    planned_prescription: {
      sets: activity.sets,
      reps: activity.reps,
      rest_seconds: activity.restSeconds,
    },
    planned_sets: activity.sets,
    state: "planned",
  }));
  const prescriptionSets = prescriptionItems.flatMap((item, itemIndex) =>
    Array.from({ length: frozenActivities[itemIndex].sets }, (_, setIndex) => ({
      id: `23000000-0000-4000-${String(itemIndex + 1).padStart(4, "8")}-${String(setIndex + 1).padStart(12, "0")}`,
      snapshot_item_id: item.id,
      snapshot_id: prescriptionSnapshotId,
      workout_session_id: trainMockContract.activeSessionId,
      user_id: trainMockContract.userId,
      set_order: setIndex + 1,
      performed_order_hint: null,
      set_type: "other",
      target_mode: "custom",
      side_mode: "none",
      rest_seconds: frozenActivities[itemIndex].restSeconds,
      tempo_target: null,
      schema_version: 1,
      created_at: "2026-07-22T08:00:00.000Z",
    })),
  );
  const context = await browser.newContext({
    viewport: renderedViewport,
    reducedMotion: "reduce",
    colorScheme: theme,
  });
  const setWritePayloads = [];
  await context.addCookies([
    {
      name: "plaivra.language.v1",
      value: language,
      url: baseUrl,
      sameSite: "Lax",
    },
  ]);
  await context.route(
    /\/api\/workouts\/sessions\/[^/]+\/muscle-analysis(?:\?.*)?$/,
    async (requestRoute) => {
      await requestRoute.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "cache-control": "private, no-store",
          "x-plaivra-qa-fixture": "session-muscle-analysis",
        },
        body: JSON.stringify({
          sessionId: trainMockContract.activeSessionId,
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
            coverage: {
              totalItemCount: 1,
              includedItemCount: 1,
              unmappedItemCount: 0,
              unsupportedItemCount: 0,
            },
            warnings: [],
          },
        }),
      });
    },
  );
  await context.route("**/api/activity-catalog/**", async (requestRoute) => {
    const url = new URL(requestRoute.request().url());
    await requestRoute.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "cache-control": "private, no-store",
        "x-plaivra-qa-fixture": catalogScenario,
      },
      body: JSON.stringify(catalogPayload(url, catalogScenario)),
    });
  });
  await context.route(
    /^https:\/\/[^/]+\.supabase\.co\//,
    async (requestRoute) => {
      const method = requestRoute.request().method();
      const requestUrl = new URL(requestRoute.request().url());
      if (
        method === "POST" &&
        requestUrl.pathname.includes(
          "/rest/v1/rpc/start_or_resume_workout_session_atomic",
        )
      ) {
        await requestRoute.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "x-plaivra-qa-fixture": "active-workout-day-session" },
          body: JSON.stringify({
            session: workoutSessionFixture({ planDayId: activeDayId }),
            resumed: true,
          }),
        });
        return;
      }
      if (
        method === "POST" &&
        requestUrl.pathname.includes(
          "/rest/v1/rpc/start_or_resume_direct_workout_session_atomic",
        )
      ) {
        await requestRoute.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "x-plaivra-qa-fixture": "active-workout-direct-session" },
          body: JSON.stringify({
            session: workoutSessionFixture({
              workoutId: catalogActivityId,
              workoutName: catalogActivities[0].name,
            }),
            resumed: true,
          }),
        });
        return;
      }
      if (
        method === "GET" &&
        requestUrl.pathname.includes("/rest/v1/workout_sessions")
      ) {
        const wantsObject = (
          requestRoute.request().headers().accept || ""
        ).includes("application/vnd.pgrst.object");
        const hasOpenSession = scenario === "active";
        await requestRoute.fulfill({
          status: 200,
          contentType: "application/json",
          headers: {
            "content-range": hasOpenSession ? "0-0/1" : "*/0",
            "x-plaivra-qa-fixture": "workout-session-owner",
          },
          body: JSON.stringify(
            hasOpenSession ? (wantsObject ? sessionRoot : [sessionRoot]) : [],
          ),
        });
        return;
      }
      if (
        method === "GET" &&
        requestUrl.pathname.includes(
          "/rest/v1/workout_session_muscle_snapshots",
        )
      ) {
        const snapshot = {
          id: prescriptionSnapshotId,
          workout_session_id: trainMockContract.activeSessionId,
          user_id: trainMockContract.userId,
        };
        const wantsObject = (
          requestRoute.request().headers().accept || ""
        ).includes("application/vnd.pgrst.object");
        await requestRoute.fulfill({
          status: 200,
          contentType: "application/json",
          headers: {
            "content-range": "0-0/1",
            "x-plaivra-qa-fixture": "aw4-prescription-snapshot",
          },
          body: JSON.stringify(wantsObject ? snapshot : [snapshot]),
        });
        return;
      }
      if (
        method === "GET" &&
        requestUrl.pathname.includes(
          "/rest/v1/workout_session_muscle_snapshot_items",
        )
      ) {
        await requestRoute.fulfill({
          status: 200,
          contentType: "application/json",
          headers: {
            "content-range": `0-${Math.max(0, prescriptionItems.length - 1)}/${prescriptionItems.length}`,
            "x-plaivra-qa-fixture": "aw4-prescription-items",
          },
          body: JSON.stringify(prescriptionItems),
        });
        return;
      }
      if (
        method === "GET" &&
        requestUrl.pathname.includes(
          "/rest/v1/workout_session_prescription_sets",
        )
      ) {
        await requestRoute.fulfill({
          status: 200,
          contentType: "application/json",
          headers: {
            "content-range": `0-${Math.max(0, prescriptionSets.length - 1)}/${prescriptionSets.length}`,
            "x-plaivra-qa-fixture": "aw4-prescription-sets",
          },
          body: JSON.stringify(prescriptionSets),
        });
        return;
      }
      if (
        method === "GET" &&
        (requestUrl.pathname.includes(
          "/rest/v1/workout_session_prescription_metric_targets",
        ) ||
          requestUrl.pathname.includes(
            "/rest/v1/workout_performance_metric_definitions",
          ))
      ) {
        await requestRoute.fulfill({
          status: 200,
          contentType: "application/json",
          headers: {
            "content-range": "*/0",
            "x-plaivra-qa-fixture": "aw4-empty-prescription-targets",
          },
          body: "[]",
        });
        return;
      }
      if (
        method === "GET" &&
        requestUrl.pathname.includes("/rest/v1/exercise_logs")
      ) {
        const persistedLog = {
          id: trainMockContract.activeExerciseLogId,
          workout_session_id: trainMockContract.activeSessionId,
          plan_exercise_id: trainMockContract.activeFirstExerciseId,
          exercise_order: 1,
          exercise_name: trainMockContract.activeFirstExerciseName,
          exercise_category: "strength",
          planned_sets: 3,
          planned_reps: "8-10",
          planned_rest_seconds: 90,
          set_number: 1,
          reps: 8,
          weight_kg: 80,
          notes: "Hydrated set note",
          set_type: "working",
          completed_at: "2026-07-22T08:05:00.000Z",
          created_at: "2026-07-22T08:05:00.000Z",
          updated_at: "2026-07-22T08:05:00.000Z",
          set_details: [
            {
              exercise_log_id: "30000000-0000-4000-8000-000000000001",
              workout_session_id: "20000000-0000-4000-8000-000000000001",
              user_id: "00000000-0000-4000-8000-000000000001",
              schema_version: 1,
              set_type: "working",
              rpe: 7.5,
              rir: 3,
              notes: "Hydrated set note",
              side_mode: "left",
              planned_tempo: "3-1-1-0",
              performed_tempo: "2-1-1-0",
              tempo_adherence: "adjusted",
              source: "backfill",
              source_provider: null,
              source_version: null,
              created_at: "2026-07-22T08:05:00.000Z",
              updated_at: "2026-07-22T08:05:00.000Z",
            },
          ],
          segments: [
            {
              id: "40000000-0000-4000-8000-000000000002",
              exercise_log_id: "30000000-0000-4000-8000-000000000001",
              workout_session_id: "20000000-0000-4000-8000-000000000001",
              user_id: "00000000-0000-4000-8000-000000000001",
              segment_order: 2,
              segment_kind: "drop",
              side: "left",
              completed_at: "2026-07-22T08:05:30.000Z",
              source: "backfill",
              source_provider: null,
              source_version: null,
              created_at: "2026-07-22T08:05:30.000Z",
              updated_at: "2026-07-22T08:05:30.000Z",
              metric_values: [
                {
                  id: "50000000-0000-4000-8000-000000000002",
                  segment_id: "40000000-0000-4000-8000-000000000002",
                  exercise_log_id: "30000000-0000-4000-8000-000000000001",
                  workout_session_id: "20000000-0000-4000-8000-000000000001",
                  user_id: "00000000-0000-4000-8000-000000000001",
                  metric_key: "repetitions",
                  metric_version: 1,
                  side: "left",
                  value: 6,
                  source: "backfill",
                  source_provider: null,
                  source_version: null,
                  captured_at: "2026-07-22T08:05:30.000Z",
                  created_at: "2026-07-22T08:05:30.000Z",
                  updated_at: "2026-07-22T08:05:30.000Z",
                },
                {
                  id: "50000000-0000-4000-8000-000000000001",
                  segment_id: "40000000-0000-4000-8000-000000000002",
                  exercise_log_id: "30000000-0000-4000-8000-000000000001",
                  workout_session_id: "20000000-0000-4000-8000-000000000001",
                  user_id: "00000000-0000-4000-8000-000000000001",
                  metric_key: "external_load_kg",
                  metric_version: 1,
                  side: "left",
                  value: 60,
                  source: "backfill",
                  source_provider: null,
                  source_version: null,
                  captured_at: "2026-07-22T08:05:30.000Z",
                  created_at: "2026-07-22T08:05:30.000Z",
                  updated_at: "2026-07-22T08:05:30.000Z",
                },
              ],
            },
            {
              id: "40000000-0000-4000-8000-000000000001",
              exercise_log_id: "30000000-0000-4000-8000-000000000001",
              workout_session_id: "20000000-0000-4000-8000-000000000001",
              user_id: "00000000-0000-4000-8000-000000000001",
              segment_order: 1,
              segment_kind: "primary",
              side: "left",
              completed_at: "2026-07-22T08:05:00.000Z",
              source: "backfill",
              source_provider: null,
              source_version: null,
              created_at: "2026-07-22T08:05:00.000Z",
              updated_at: "2026-07-22T08:05:00.000Z",
              metric_values: [],
            },
          ],
        };
        await requestRoute.fulfill({
          status: 200,
          contentType: "application/json",
          headers: {
            "content-range": "0-0/1",
            "x-plaivra-qa-fixture": "aw3b-hydrated-set",
          },
          body: JSON.stringify([persistedLog]),
        });
        return;
      }
      if (
        method === "POST" &&
        requestUrl.pathname.includes(
          "/rest/v1/rpc/upsert_workout_set_logs_atomic",
        )
      ) {
        const payload = requestRoute.request().postDataJSON();
        setWritePayloads.push(payload);
        await requestRoute.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "x-plaivra-qa-fixture": "aw3b-autosave" },
          body: JSON.stringify({
            saved: payload?.p_logs?.length ?? 0,
            deleted: 0,
          }),
        });
        return;
      }
      if (
        requestUrl.pathname.includes("/rest/v1/user_app_settings") &&
        (method === "GET" || method === "HEAD")
      ) {
        const wantsObject = (
          requestRoute.request().headers().accept || ""
        ).includes("application/vnd.pgrst.object");
        const now = "2026-07-20T00:00:00.000Z";
        const row = {
          id: "22222222-2222-4222-8222-222222222222",
          user_id: "00000000-0000-4000-8000-000000000001",
          theme_id: themeId,
          theme,
          accent_color: themeId,
          language,
          weight_unit: "kg",
          height_unit: "cm",
          distance_unit: "km",
          liquid_unit: "ml",
          energy_unit: "kcal",
          body_measurement_unit: "cm",
          week_starts_on: "monday",
          default_start_page: "today",
          compact_mode: false,
          reduce_animations: true,
          large_text_mode: false,
          quick_log_sections: ["workout"],
          created_at: now,
          updated_at: now,
        };
        await requestRoute.fulfill({
          status: 200,
          contentType: "application/json",
          headers: {
            "content-range": "0-0/1",
            "x-plaivra-qa-fixture": "localized-settings",
          },
          body:
            method === "HEAD" ? "" : JSON.stringify(wantsObject ? row : [row]),
        });
        return;
      }
      let body = {};
      if (method !== "GET" && method !== "HEAD") {
        try {
          body = requestRoute.request().postDataJSON();
        } catch {
          body = {};
        }
      }
      await requestRoute.fulfill({
        status: method === "POST" ? 201 : 200,
        contentType: "application/json",
        headers: {
          "content-range": "0-0/0",
          "x-plaivra-qa-fixture": "empty-user-data",
        },
        body:
          method === "HEAD"
            ? ""
            : JSON.stringify(
                Array.isArray(body)
                  ? (body[0] ?? {})
                  : method === "GET"
                    ? []
                    : body,
              ),
      });
    },
  );
  await context.addInitScript(
    ({ scenarioValue, languageValue, variantValue, themeIdValue }) => {
      localStorage.setItem("plaivra.qa.train-scenario", scenarioValue);
      localStorage.setItem("plaivra.language.v1", languageValue);
      localStorage.setItem("plaivra.qa.train-variant", variantValue);
      localStorage.setItem("plaivra-theme-id", themeIdValue);
    },
    {
      scenarioValue: scenario,
      languageValue: language,
      variantValue: variant,
      themeIdValue: themeId,
    },
  );
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const consoleWarnings = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
    if (message.type() === "warning") consoleWarnings.push(message.text());
  });
  const response = await page.goto(`${baseUrl}${route}`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  const isSessionRoute = route.startsWith("/workouts/session");
  await page.waitForSelector(
    isSessionRoute ? "main#main-content" : "[data-app-shell]",
    { timeout: 20_000 },
  );
  await page.waitForFunction(
    (expected) => document.documentElement.lang === expected,
    language,
    { timeout: 20_000 },
  );
  await page.waitForFunction(
    ({ expectedThemeId, expectedDark }) =>
      document.documentElement.dataset.theme === expectedThemeId &&
      document.documentElement.classList.contains("dark") === expectedDark,
    { expectedThemeId: themeId, expectedDark: theme === "dark" },
    { timeout: 20_000 },
  );
  if (scenario === "active" && !isSessionRoute) {
    await page
      .waitForSelector("[data-active-workout-controller]", { timeout: 20_000 })
      .catch(() => undefined);
  }
  if (step === 2) {
    await page.waitForSelector('[data-builder-step="details"]', {
      timeout: 20_000,
    });
    const continueButton = page
      .locator("[data-train-sticky-footer] button")
      .last();
    if (step === 3) await continueButton.click();
    else {
      await continueButton.focus();
      await continueButton.press("Enter");
    }
    await page.waitForSelector('[data-builder-step="days"]', {
      timeout: 20_000,
    });
  }
  if (step === 3 || openPicker) {
    await page.waitForSelector('[data-builder-step="details"]', {
      timeout: 20_000,
    });
    const continueButton = page
      .locator("[data-train-sticky-footer] button")
      .last();
    await continueButton.focus();
    await continueButton.press("Enter");
    await page.waitForSelector('[data-builder-step="days"]', {
      timeout: 20_000,
    });
    if (step === 3) {
      const dayButtons = page.locator("[data-builder-day-tabs] > button");
      const trainingDayCount = Math.max(1, (await dayButtons.count()) - 1);
      for (let dayIndex = 0; dayIndex < trainingDayCount; dayIndex += 1) {
        if (dayIndex > 0) {
          const dayButton = dayButtons.nth(dayIndex);
          await dayButton.focus();
          await dayButton.press("Enter");
        }
        const addExercisesButton = page
          .getByRole("button", { name: /add exercises/i })
          .first();
        await addExercisesButton.focus();
        await addExercisesButton.press("Enter");
        await page.waitForSelector("[data-train-exercise-picker]", {
          timeout: 20_000,
        });
        const firstPickerCard = page
          .locator("[data-picker-results] article button[aria-pressed]")
          .first();
        await firstPickerCard.click();
        const addSelectedButton = page
          .locator("[data-picker-footer] button")
          .last();
        await addSelectedButton.click();
        await page.waitForSelector("[data-train-exercise-picker]", {
          state: "hidden",
          timeout: 20_000,
        });
      }
      const reviewButton = page
        .locator("[data-train-sticky-footer] button")
        .last();
      await reviewButton.click();
      await page.waitForTimeout(100);
      if (!(await page.locator('[data-builder-step="review"]').count())) {
        const debugState = await page.evaluate(() => ({
          dayButtons: [
            ...document.querySelectorAll("[data-builder-day-tabs] > button"),
          ].map((item) => item.textContent?.trim()),
          selectedExercises: document.querySelectorAll(
            "[data-exercise-prescription]",
          ).length,
          alerts: [...document.querySelectorAll('[role="alert"]')].map((item) =>
            item.textContent?.trim(),
          ),
          footerButtons: [
            ...document.querySelectorAll("[data-train-sticky-footer] button"),
          ].map((item) => ({
            text: item.textContent?.trim(),
            disabled: item instanceof HTMLButtonElement && item.disabled,
          })),
        }));
        console.error(
          "Builder review transition debug",
          JSON.stringify(debugState),
        );
      }
      await page.waitForSelector('[data-builder-step="review"]', {
        timeout: 20_000,
      });
    } else {
      const addExercisesButton = page
        .getByRole("button", { name: /add exercises/i })
        .first();
      await addExercisesButton.focus();
      await addExercisesButton.press("Enter");
      await page.waitForSelector("[data-train-exercise-picker]", {
        timeout: 20_000,
      });
    }
  }
  let keyboard = {
    checked: false,
    focusVisible: null,
    tabSelectionChanged: null,
    pickerFocusReturned: null,
  };
  if (keyboardCheck) {
    await page.keyboard.press("Tab");
    const focusVisible = await page.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || active === document.body)
        return false;
      const style = getComputedStyle(active);
      return style.outlineStyle !== "none" || style.boxShadow !== "none";
    });
    const tab = page.locator('[role="tab"]').first();
    let tabSelectionChanged = null;
    if (await tab.count()) {
      await tab.focus();
      const before = await tab.getAttribute("aria-selected");
      await page.keyboard.press("ArrowRight");
      const after = await tab.getAttribute("aria-selected");
      tabSelectionChanged =
        before !== after ||
        (await page.locator('[role="tab"][aria-selected="true"]').count()) ===
          1;
    }
    let pickerFocusReturned = null;
    if (openPicker) {
      await page.keyboard.press("Escape");
      await page.waitForSelector("[data-train-exercise-picker]", {
        state: "hidden",
        timeout: 10_000,
      });
      const addExercise = page
        .getByRole("button", { name: /add exercises/i })
        .first();
      pickerFocusReturned = await addExercise.evaluate(
        (element) => element === document.activeElement,
      );
      await addExercise.press("Enter");
      await page.waitForSelector("[data-train-exercise-picker]", {
        timeout: 10_000,
      });
    }
    keyboard = {
      checked: true,
      focusVisible,
      tabSelectionChanged,
      pickerFocusReturned,
    };
  }
  let setDetailsTrigger = null;
  let setDetailsState = {
    checked: false,
    dialogFocused: null,
    inputContract: null,
    invalidEffortBlocked: null,
    validCorrectionCleared: null,
    numericValues: null,
    setTypeValues: null,
    setTypeTraversalPassed: null,
    noteCodePoints: null,
    noteLimitEnforced: null,
    noteDescribedBy: null,
    labelledCoreInputs: null,
    drawerWithinViewport: null,
    drawerHorizontalOverflowPx: null,
    focusReturned: null,
    hydrationPrecondition: null,
    artifact: null,
  };
  if (openSetDetails) {
    if (!isSessionRoute)
      throw new Error(
        "Set-details QA requires an Active Workout session route.",
      );
    const persistedSetStep = page
      .locator('[data-aw5-set-path-number="1"]')
      .first();
    try {
      await persistedSetStep.waitFor({ state: "visible", timeout: 20_000 });
    } catch (error) {
      const bootstrapEvidence = await page.evaluate(() => ({
        url: window.location.href,
        title: document.title,
        mainText:
          document.querySelector("main")?.textContent?.trim().slice(0, 1200) ??
          null,
        alerts: [...document.querySelectorAll('[role="alert"]')].map((item) =>
          item.textContent?.trim().slice(0, 500),
        ),
        shellCount: document.querySelectorAll("[data-aw5-execution-shell]")
          .length,
        setPathCount: document.querySelectorAll("[data-aw5-set-path-number]")
          .length,
      }));
      const artifact = "failure-aw3b-autosave-bootstrap.png";
      await page.screenshot({
        path: path.join(outputDir, artifact),
        fullPage: true,
      });
      await writeFile(
        path.join(outputDir, "failure-aw3b-autosave-bootstrap.json"),
        `${JSON.stringify(
          {
            ...bootstrapEvidence,
            pageErrors,
            consoleErrors,
            consoleWarnings,
            artifact,
            error: error instanceof Error ? error.message : String(error),
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      await context.close();
      throw error;
    }
    await persistedSetStep.click();
    await page.waitForFunction(
      () =>
        document
          .querySelector("[data-active-set-state]")
          ?.getAttribute("data-active-set-persisted") === "true",
    );
    setDetailsTrigger = page
      .locator("[data-active-set-details-trigger]:visible")
      .first();
    await setDetailsTrigger.waitFor({ state: "visible", timeout: 20_000 });
    await setDetailsTrigger.focus();
    await setDetailsTrigger.click();
    const dialog = page.locator("[data-active-set-details-dialog]");
    await dialog.waitFor({ state: "visible", timeout: 20_000 });
    const dialogFocused = await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    );

    const activeSetState = page.locator("[data-active-set-state]").first();
    const activeSetIdentity = {
      number: await activeSetState.getAttribute("data-active-set-number"),
      persisted: await activeSetState.getAttribute("data-active-set-persisted"),
      completed: await activeSetState.getAttribute("data-active-set-completed"),
      hasDetails: await activeSetState.getAttribute(
        "data-active-set-has-details",
      ),
    };
    const rpe = page.locator("#active-set-rpe");
    const rir = page.locator("#active-set-rir");
    const setType = page.locator("#active-set-type");
    const note = page.locator("#active-set-note");
    const hydratedValues = {
      rpe: await rpe.inputValue(),
      rir: await rir.inputValue(),
      setType: await setType.inputValue(),
      note: await note.inputValue(),
    };
    const hydrationPrecondition = {
      identity: activeSetIdentity,
      values: hydratedValues,
      passed:
        activeSetIdentity.number === "1" &&
        activeSetIdentity.persisted === "true" &&
        activeSetIdentity.completed === "true" &&
        activeSetIdentity.hasDetails === "true" &&
        hydratedValues.rpe === "7.5" &&
        hydratedValues.rir === "3" &&
        hydratedValues.setType === "working" &&
        hydratedValues.note === "Hydrated set note",
    };
    if (!hydrationPrecondition.passed) {
      throw new Error(
        `AW-3B autosave fixture hydration failed: ${JSON.stringify(hydrationPrecondition)}`,
      );
    }
    const inputContract = {
      rpe: {
        type: await rpe.getAttribute("type"),
        inputMode: await rpe.getAttribute("inputmode"),
      },
      rir: {
        type: await rir.getAttribute("type"),
        inputMode: await rir.getAttribute("inputmode"),
      },
    };
    await rpe.fill("8.25");
    await rir.fill("20.1");
    const invalidEffortBlocked = {
      rpeInvalid: await rpe.getAttribute("aria-invalid"),
      rirInvalid: await rir.getAttribute("aria-invalid"),
      rpeError: await page.locator("#active-set-rpe-error").isVisible(),
      rirError: await page.locator("#active-set-rir-error").isVisible(),
    };
    await rpe.fill("8.5");
    await rir.fill("2.5");
    const validCorrectionCleared = {
      rpeInvalid: await rpe.getAttribute("aria-invalid"),
      rirInvalid: await rir.getAttribute("aria-invalid"),
      rpeErrorCount: await page.locator("#active-set-rpe-error").count(),
      rirErrorCount: await page.locator("#active-set-rir-error").count(),
    };
    const numericValues = {
      rpe: await rpe.inputValue(),
      rir: await rir.inputValue(),
    };

    const expectedSetTypeValues = [
      "normal",
      "warmup",
      "working",
      "failure",
      "drop",
      "backoff",
      "amrap",
      "timed",
      "other",
    ];
    const setTypeValues = await setType
      .locator("option")
      .evaluateAll((options) => options.map((option) => option.value));
    let setTypeTraversalPassed =
      JSON.stringify(setTypeValues) === JSON.stringify(expectedSetTypeValues);
    for (const value of expectedSetTypeValues) {
      await setType.selectOption(value);
      setTypeTraversalPassed =
        setTypeTraversalPassed && (await setType.inputValue()) === value;
    }

    const maximumNote = "😀".repeat(4000);
    await note.fill(maximumNote);
    const noteCodePoints = await note.evaluate(
      (element) => Array.from(element.value).length,
    );
    await note.press("End");
    await page.keyboard.insertText("😀");
    await page.waitForTimeout(50);
    const noteLimitEnforced = await note.evaluate(
      (element) => Array.from(element.value).length === 4000,
    );
    const noteDescribedBy = await note.getAttribute("aria-describedby");
    const labelledCoreInputs = await page.evaluate(() =>
      [
        "active-set-reps",
        "active-set-weight",
        "active-set-rpe",
        "active-set-rir",
        "active-set-type",
        "active-set-note",
      ].every((id) => {
        const element = document.getElementById(id);
        return element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLSelectElement
          ? Boolean(element.labels?.length)
          : false;
      }),
    );
    const drawerLayout = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        withinViewport:
          rect.left >= -1 &&
          rect.top >= -1 &&
          rect.right <= window.innerWidth + 1 &&
          rect.bottom <= window.innerHeight + 1,
        horizontalOverflowPx: Math.max(
          0,
          element.scrollWidth - element.clientWidth,
        ),
      };
    });
    setDetailsState = {
      checked: true,
      dialogFocused,
      inputContract,
      invalidEffortBlocked,
      validCorrectionCleared,
      numericValues,
      setTypeValues,
      setTypeTraversalPassed,
      noteCodePoints,
      noteLimitEnforced,
      noteDescribedBy,
      labelledCoreInputs,
      drawerWithinViewport: drawerLayout.withinViewport,
      drawerHorizontalOverflowPx: drawerLayout.horizontalOverflowPx,
      focusReturned: null,
      hydrationPrecondition,
      autosaveFlushed: null,
      autosavePayload: null,
      artifact: null,
    };
  }
  let mobileKeyboardState = {
    checked: false,
    focused: false,
    visualViewport: null,
    diagnostic: null,
  };
  if (mobileKeyboard) {
    const editableSelector =
      'input:not([type="hidden"]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly])';
    const input = page
      .locator(editableSelector)
      .filter({ visible: true })
      .first();
    try {
      await input.waitFor({ state: "visible", timeout: 20_000 });
      const focusedInput = await input.elementHandle();
      if (!focusedInput)
        throw new Error(
          "Editable control disappeared before the keyboard viewport check.",
        );
      const keyboardViewport = {
        width: renderedViewport.width,
        height: Math.max(280, Math.floor(renderedViewport.height * 0.55)),
      };
      await page.setViewportSize(keyboardViewport);
      await focusedInput.focus();
      await page.waitForTimeout(100);
      const focused = await focusedInput.evaluate(
        (element) => element.isConnected && element === document.activeElement,
      );
      mobileKeyboardState = {
        checked: true,
        focused,
        visualViewport: `${keyboardViewport.width}x${keyboardViewport.height}`,
        diagnostic: focused
          ? null
          : "Editable control rendered but did not retain focus after keyboard viewport resize.",
      };
    } catch (error) {
      const editableCount = await page.locator(editableSelector).count();
      mobileKeyboardState = {
        checked: true,
        focused: false,
        visualViewport: null,
        diagnostic: `Editable control did not become focusable: ${error instanceof Error ? error.message : String(error)}; matching controls: ${editableCount}`,
      };
    }
  }
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  await page.waitForTimeout(250);
  const metrics = await page.evaluate(() => {
    const visible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const value = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        value.width > 0 &&
        value.height > 0
      );
    };
    const rect = (element) => {
      if (!visible(element)) return null;
      const value = element.getBoundingClientRect();
      return {
        left: value.left,
        right: value.right,
        top: value.top,
        bottom: value.bottom,
        width: value.width,
        height: value.height,
      };
    };
    const main = document.querySelector("#main-content");
    const controller = document.querySelector(
      "[data-active-workout-controller]",
    );
    const nav = document.querySelector("[data-mobile-floating-nav]");
    const footer = document.querySelector("[data-train-sticky-footer]");
    const aw5Shell = document.querySelector("[data-aw5-execution-shell]");
    const aw5StickyActions = document.querySelector(
      "[data-aw5-sticky-actions]",
    );
    const restAction = document.querySelector("[data-rest-day-weekly-plan] a");
    const actions = main
      ? [...main.querySelectorAll("a,button")].filter(
          (element) =>
            visible(element)
            && !element.closest("[data-train-sticky-footer]")
            && !element.closest("[data-active-workout-controller]")
            && !element.closest("details:not([open])"),
        )
      : [];
    const lastMainAction = actions.at(-1) ?? null;
    let frameworkOverlayDetected = false;
    const frameworkOverlayDetails = [];
    for (const portal of document.querySelectorAll("nextjs-portal")) {
      const root = portal.shadowRoot;
      if (!root) continue;
      const candidate = root.querySelector(
        "nextjs-errors-dialog, nextjs-error-dialog, [data-nextjs-error-dialog], [data-nextjs-dialog-overlay], [data-nextjs-error-overlay]",
      );
      const portalText = root.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const textSignalsError =
        /(?:Build Error|Unhandled Runtime Error|Runtime Error|Failed to compile)/i.test(
          portalText,
        );
      const candidateVisible =
        candidate instanceof HTMLElement
          ? visible(candidate)
          : candidate !== null;
      if (candidateVisible || textSignalsError) {
        frameworkOverlayDetected = true;
        frameworkOverlayDetails.push(portalText.slice(0, 500));
      }
    }
    return {
      controller: rect(controller),
      nav: rect(nav),
      footer: rect(footer),
      aw5StickyActions: rect(aw5StickyActions),
      lastMainAction: rect(lastMainAction),
      lastMainActionIdentity: lastMainAction
        ? {
            tagName: lastMainAction.tagName.toLowerCase(),
            text: lastMainAction.textContent?.replace(/\s+/g, " ").trim() ?? "",
            href: lastMainAction.getAttribute("href"),
            ariaLabel: lastMainAction.getAttribute("aria-label"),
          }
        : null,
      aw5: {
        present: Boolean(aw5Shell),
        state: aw5Shell?.getAttribute("data-aw5-session-state") ?? null,
        primaryActionCount: document.querySelectorAll(
          "[data-aw5-primary-action]",
        ).length,
        detailsTriggerCount: [
          ...document.querySelectorAll("[data-active-set-details-trigger]"),
        ].filter(visible).length,
        miniHeatMapCount: document.querySelectorAll(
          "[data-aw5-mini-heat-map-slot]",
        ).length,
        coreInputCount: ["active-set-reps", "active-set-weight"].filter((id) =>
          document.getElementById(id),
        ).length,
      },
      shellState:
        document
          .querySelector("[data-app-shell]")
          ?.getAttribute("data-active-workout-controller-state") ?? null,
      restActionHref: restAction?.getAttribute("href") ?? null,
      direction:
        document
          .querySelector("[data-train-today-card]")
          ?.closest("[dir]")
          ?.getAttribute("dir") ?? document.documentElement.dir,
      horizontalOverflowPx: Math.max(
        0,
        document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
      appliedThemeId: document.documentElement.dataset.theme ?? null,
      darkThemeApplied: document.documentElement.classList.contains("dark"),
      frameworkOverlayDetected,
      frameworkOverlayDetails,
    };
  });
  const item = {
    viewport: viewport.name,
    scenario,
    language,
    theme,
    themeId,
    catalogScenario,
    zoom,
    variant,
    mobileKeyboard,
    renderedViewport: `${renderedViewport.width}x${renderedViewport.height}`,
    openPicker,
    openSetDetails,
    route,
    step,
    status: response?.status() ?? null,
    ...metrics,
    intersections: {
      controllerFooter: intersects(metrics.controller, metrics.footer),
      controllerNav: intersects(metrics.controller, metrics.nav),
      controllerLastMainAction: intersects(
        metrics.controller,
        metrics.lastMainAction,
      ),
      footerNav: intersects(metrics.footer, metrics.nav),
      aw5StickyNav: intersects(metrics.aw5StickyActions, metrics.nav),
    },
    pageErrors,
    consoleErrors,
    consoleWarnings,
    unexpectedConsoleErrors: consoleErrors,
    unexpectedConsoleWarnings: consoleWarnings.filter(
      (message) => !/Reduced Motion enabled on your device/is.test(message),
    ),
    keyboard,
    mobileKeyboardState,
    setDetailsState,
  };
  const safeRoute = route.replaceAll("/", "-").replace(/^-/, "") || "root";
  const artifact = `${scenario}-${variant}-${catalogScenario}-${theme}-${language}-${viewport.name}-${safeRoute}${step ? `-step${step}` : ""}${openPicker ? "-picker" : ""}${openSetDetails ? "-set-details" : ""}${mobileKeyboard ? "-mobile-keyboard" : ""}${zoom !== 1 ? `-zoom${zoom}` : ""}.png`;
  await page.screenshot({
    path: path.join(outputDir, artifact),
    fullPage: true,
  });
  item.artifact = artifact;
  if (openSetDetails && setDetailsTrigger) {
    item.setDetailsState.artifact = artifact;
    await page.keyboard.press("Escape");
    await page
      .locator("[data-active-set-details-dialog]")
      .waitFor({ state: "hidden", timeout: 10_000 });
    await page.waitForFunction(() => true, null, { timeout: 25 });
    for (
      let attempt = 0;
      attempt < 40 && setWritePayloads.length === 0;
      attempt += 1
    ) {
      await page.waitForTimeout(50);
    }
    const latestSetWrite = setWritePayloads.at(-1) ?? null;
    const savedDetails = latestSetWrite?.p_logs?.[0]?.set_details ?? null;
    item.setDetailsState.focusReturned = await setDetailsTrigger.evaluate(
      (element) => element === document.activeElement,
    );
    item.setDetailsState.autosaveFlushed = Boolean(latestSetWrite);
    item.setDetailsState.autosavePayload = savedDetails
      ? {
          source: savedDetails.source,
          sourceProvider: savedDetails.source_provider,
          sourceVersion: savedDetails.source_version,
          sideMode: savedDetails.side_mode,
          plannedTempo: savedDetails.planned_tempo,
          performedTempo: savedDetails.performed_tempo,
          tempoAdherence: savedDetails.tempo_adherence,
        }
      : null;
  }
  await context.close();
  return item;
}

async function captureNamedEvidence({ filename, ...scenario }) {
  const item = await openScenario(scenario);
  await copyFile(
    path.join(outputDir, item.artifact),
    path.join(outputDir, filename),
  );
  item.requiredArtifact = filename;
  return item;
}

// Prove the persisted-set hydration and autosave contract before the expensive
// visual matrix so fixture drift fails in minutes, not near the end of Quality.
const autosaveSmoke = await openScenario({
  viewport: viewports[2],
  scenario: "active",
  language: "en",
  route: `/workouts/session/day/${activeDayId}`,
  openSetDetails: true,
});
if (!autosaveSmoke.setDetailsState.autosaveFlushed) {
  throw new Error(
    `AW-3B autosave smoke failed: ${JSON.stringify(autosaveSmoke.setDetailsState)}`,
  );
}
observations.push(autosaveSmoke);

// Exercise the longest connected builder interaction next.
observations.push(
  await openScenario({
    viewport: viewports[2],
    scenario: "scheduled",
    route: "/my-workout/plans/builder",
    step: 3,
  }),
);

for (const viewport of viewports) {
  for (const target of [
    { route: "/my-workout/plans" },
    { route: "/my-workout/plans/builder", step: 1 },
    { route: "/my-workout/plans/builder", step: 2 },
    { route: `/my-workout/plans/${activePlanId}` },
    { route: `/my-workout/plans/${activePlanId}/edit` },
    { route: "/workouts" },
    { route: `/workouts/${catalogActivityId}` },
    { route: "/workout-history" },
    { route: `/workouts/session/${catalogActivityId}` },
    { route: `/workouts/session/day/${activeDayId}` },
  ])
    observations.push(
      await openScenario({ viewport, scenario: "active", ...target }),
    );
  observations.push(
    await openScenario({
      viewport,
      scenario: "active",
      route: "/my-workout/plans/builder",
      openPicker: true,
    }),
  );
}
for (const viewport of viewports.filter((item) =>
  ["320x568", "390x844", "768x1024", "1440x900"].includes(item.name),
)) {
  observations.push(
    await openScenario({
      viewport,
      scenario: "scheduled",
      route: "/my-workout/plans",
    }),
  );
  observations.push(
    await openScenario({
      viewport,
      scenario: "scheduled",
      route: "/my-workout/plans/builder",
      step: 2,
    }),
  );
  observations.push(
    await openScenario({
      viewport,
      scenario: "scheduled",
      route: `/my-workout/plans/${activePlanId}/edit`,
    }),
  );
}
for (const language of ["en", "de", "ar"]) {
  for (const viewport of viewports.filter((item) =>
    ["390x844", "1440x900"].includes(item.name),
  )) {
    observations.push(
      await openScenario({
        viewport,
        scenario: "rest",
        language,
        route: "/my-workout/plans",
      }),
    );
  }
}
for (const route of [
  "/my-workout/plans",
  "/my-workout/plans/builder",
  `/my-workout/plans/${activePlanId}/edit`,
]) {
  observations.push(
    await openScenario({
      viewport: viewports[2],
      scenario: "active",
      language: "ar",
      route,
      step: route.endsWith("builder") ? 2 : null,
    }),
  );
}
for (const route of [
  "/my-workout/plans",
  `/my-workout/plans/${activePlanId}`,
  `/my-workout/plans/${activePlanId}/edit`,
  "/workouts",
  `/workouts/${catalogActivityId}`,
  "/workout-history",
  `/workouts/session/${catalogActivityId}`,
  `/workouts/session/day/${activeDayId}`,
]) {
  observations.push(
    await openScenario({
      viewport: viewports[2],
      scenario: "active",
      language: "ar",
      route,
    }),
  );
  observations.push(
    await openScenario({
      viewport: viewports[2],
      scenario: "active",
      theme: "dark",
      route,
    }),
  );
}
for (const target of [
  { route: "/my-workout/plans" },
  { route: "/my-workout/plans/builder", step: 2 },
  { route: `/my-workout/plans/${activePlanId}` },
  { route: `/my-workout/plans/${activePlanId}/edit` },
  { route: "/workouts" },
  { route: `/workouts/${catalogActivityId}` },
  { route: "/workout-history" },
  { route: `/workouts/session/${catalogActivityId}` },
  { route: `/workouts/session/day/${activeDayId}` },
  { route: "/my-workout/plans/builder", openPicker: true },
]) {
  observations.push(
    await openScenario({
      viewport: viewports[6],
      scenario: "active",
      ...target,
      zoom: 2,
      keyboardCheck: true,
    }),
  );
}
for (const catalogScenario of ["fallback", "empty"]) {
  for (const route of ["/workouts", `/workouts/${catalogActivityId}`]) {
    observations.push(
      await openScenario({
        viewport: viewports[2],
        scenario: "scheduled",
        route,
        catalogScenario,
      }),
    );
  }
}
observations.push(
  await openScenario({
    viewport: viewports[2],
    scenario: "scheduled",
    route: `/my-workout/plans/${inactivePlanId}`,
  }),
);
observations.push(
  await openScenario({
    viewport: viewports[2],
    scenario: "scheduled",
    route: `/my-workout/plans/${archivedPlanId}`,
  }),
);
for (const variant of [
  "one-day-one-exercise",
  "seven-day-many-exercises",
  "long-names",
]) {
  for (const viewport of [viewports[2], viewports[7]]) {
    for (const route of [
      "/my-workout/plans",
      `/my-workout/plans/${activePlanId}`,
      `/my-workout/plans/${activePlanId}/edit`,
    ]) {
      observations.push(
        await openScenario({ viewport, scenario: "scheduled", route, variant }),
      );
    }
  }
}
observations.push(
  await openScenario({
    viewport: viewports[2],
    scenario: "active",
    route: `/workouts/${catalogActivities[1].id}`,
  }),
);
for (const target of [
  { route: "/my-workout/plans/builder", step: 2 },
  { route: "/workouts" },
  { route: `/workouts/session/${catalogActivityId}` },
  { route: `/workouts/session/day/${activeDayId}` },
]) {
  observations.push(
    await openScenario({
      viewport: viewports[2],
      scenario: "active",
      ...target,
      mobileKeyboard: true,
    }),
  );
}
const requiredRenderedEvidence = [];
for (const language of ["en", "de", "ar"]) {
  for (const viewport of [
    viewports.find((item) => item.name === "390x844"),
    viewports.find((item) => item.name === "1440x900"),
  ]) {
    if (!viewport)
      throw new Error("Required Active Workout evidence viewport is missing.");
    const filename = `active-workout-${language}-${viewport.name}.png`;
    const item = await captureNamedEvidence({
      filename,
      viewport,
      scenario: "active",
      language,
      route: `/workouts/session/day/${activeDayId}`,
    });
    observations.push(item);
    requiredRenderedEvidence.push({
      filename,
      language,
      viewport: viewport.name,
      route: item.route,
      horizontalOverflowPx: item.horizontalOverflowPx,
      direction: item.direction,
    });
  }
}
for (const drawerScenario of [
  {
    filename: "active-workout-set-details-ar-390x844.png",
    language: "ar",
    theme: "light",
    viewportName: "390x844",
  },
  {
    filename: "active-workout-set-details-dark-en-1440x900.png",
    language: "en",
    theme: "dark",
    viewportName: "1440x900",
  },
]) {
  const viewport = viewports.find(
    (item) => item.name === drawerScenario.viewportName,
  );
  if (!viewport)
    throw new Error(
      `Required set-details evidence viewport ${drawerScenario.viewportName} is missing.`,
    );
  const item = await captureNamedEvidence({
    filename: drawerScenario.filename,
    viewport,
    scenario: "active",
    language: drawerScenario.language,
    theme: drawerScenario.theme,
    route: `/workouts/session/day/${activeDayId}`,
    openSetDetails: true,
  });
  observations.push(item);
  requiredRenderedEvidence.push({
    filename: drawerScenario.filename,
    language: drawerScenario.language,
    theme: drawerScenario.theme,
    themeId: item.appliedThemeId,
    viewport: viewport.name,
    route: item.route,
    horizontalOverflowPx: item.horizontalOverflowPx,
    drawerHorizontalOverflowPx: item.setDetailsState.drawerHorizontalOverflowPx,
    direction: item.direction,
    focusReturned: item.setDetailsState.focusReturned,
  });
}
{
  const viewport = viewports.find((item) => item.name === "390x844");
  if (!viewport)
    throw new Error(
      "Required minimized-controller evidence viewport is missing.",
    );
  const filename = "active-workout-indicator-ar-390x844.png";
  const item = await captureNamedEvidence({
    filename,
    viewport,
    scenario: "active",
    language: "ar",
    route: "/my-workout/plans",
  });
  observations.push(item);
  requiredRenderedEvidence.push({
    filename,
    language: "ar",
    viewport: viewport.name,
    route: item.route,
    horizontalOverflowPx: item.horizontalOverflowPx,
    direction: item.direction,
  });
}

const horizontalOverflowViewports = viewports.filter((viewport) =>
  [
    "320x568",
    "360x780",
    "390x844",
    "393x852",
    "430x932",
    "768x1024",
    "1024x768",
    "1280x800",
    "1440x900",
  ].includes(viewport.name),
);
const horizontalOverflowMatrix = [];
for (const language of ["en", "de", "ar"]) {
  for (const viewport of horizontalOverflowViewports) {
    const item = await openScenario({
      viewport,
      scenario: "active",
      language,
      route: `/workouts/session/day/${activeDayId}`,
    });
    item.evidenceKind = "horizontal-overflow";
    observations.push(item);
    horizontalOverflowMatrix.push({
      language,
      viewport: viewport.name,
      horizontalOverflowPx: item.horizontalOverflowPx,
      passed: item.horizontalOverflowPx <= 1,
      direction: item.direction,
      artifact: item.artifact,
    });
  }
}

await browser.close();

const failures = observations.filter((item) => {
  const sessionRoute = item.route.startsWith("/workouts/session");
  const expectedController = item.scenario === "active" && !sessionRoute;
  const expectedThemeId = item.theme === "dark" ? "elite-noir" : "olive";
  const setDetailsFailed =
    item.openSetDetails &&
    (!item.setDetailsState.checked ||
      !item.setDetailsState.dialogFocused ||
      !item.setDetailsState.hydrationPrecondition?.passed ||
      JSON.stringify(item.setDetailsState.inputContract) !==
        JSON.stringify({
          rpe: { type: "text", inputMode: "decimal" },
          rir: { type: "text", inputMode: "decimal" },
        }) ||
      JSON.stringify(item.setDetailsState.invalidEffortBlocked) !==
        JSON.stringify({
          rpeInvalid: "true",
          rirInvalid: "true",
          rpeError: true,
          rirError: true,
        }) ||
      JSON.stringify(item.setDetailsState.validCorrectionCleared) !==
        JSON.stringify({
          rpeInvalid: "false",
          rirInvalid: "false",
          rpeErrorCount: 0,
          rirErrorCount: 0,
        }) ||
      JSON.stringify(item.setDetailsState.numericValues) !==
        JSON.stringify({ rpe: "8.5", rir: "2.5" }) ||
      JSON.stringify(item.setDetailsState.setTypeValues) !==
        JSON.stringify([
          "normal",
          "warmup",
          "working",
          "failure",
          "drop",
          "backoff",
          "amrap",
          "timed",
          "other",
        ]) ||
      !item.setDetailsState.setTypeTraversalPassed ||
      item.setDetailsState.noteCodePoints !== 4000 ||
      !item.setDetailsState.noteLimitEnforced ||
      item.setDetailsState.noteDescribedBy !== "active-set-note-limit" ||
      !item.setDetailsState.labelledCoreInputs ||
      !item.setDetailsState.drawerWithinViewport ||
      item.setDetailsState.drawerHorizontalOverflowPx > 1 ||
      !item.setDetailsState.focusReturned ||
      !item.setDetailsState.autosaveFlushed ||
      JSON.stringify(item.setDetailsState.autosavePayload) !==
        JSON.stringify({
          source: "manual",
          sourceProvider: "plaivra",
          sourceVersion: "aw3b-v1",
          sideMode: "left",
          plannedTempo: "3-1-1-0",
          performedTempo: "2-1-1-0",
          tempoAdherence: "adjusted",
        }));
  return (
    item.status !== 200 ||
    item.pageErrors.length > 0 ||
    item.unexpectedConsoleErrors.length > 0 ||
    item.unexpectedConsoleWarnings.length > 0 ||
    item.frameworkOverlayDetected ||
    item.horizontalOverflowPx > 1 ||
    item.appliedThemeId !== expectedThemeId ||
    item.darkThemeApplied !== (item.theme === "dark") ||
    setDetailsFailed ||
    Boolean(item.controller) !== expectedController ||
    (!sessionRoute &&
      item.shellState !== (expectedController ? "present" : "absent")) ||
    item.intersections.controllerFooter ||
    item.intersections.controllerNav ||
    item.intersections.controllerLastMainAction ||
    item.intersections.footerNav ||
    item.intersections.aw5StickyNav ||
    (sessionRoute &&
      (!item.aw5.present ||
        item.aw5.primaryActionCount !== 2 ||
        item.aw5.detailsTriggerCount !== 1 ||
        item.aw5.miniHeatMapCount !== 1 ||
        item.aw5.coreInputCount !== 2)) ||
    (item.scenario === "rest" &&
      item.route === "/my-workout/plans" &&
      item.restActionHref !== `/my-workout/plans/${activePlanId}`) ||
    (item.language === "ar" && item.direction !== "rtl") ||
    (item.keyboard.checked &&
      (!item.keyboard.focusVisible ||
        item.keyboard.tabSelectionChanged === false ||
        item.keyboard.pickerFocusReturned === false)) ||
    (item.mobileKeyboardState.checked && !item.mobileKeyboardState.focused)
  );
});
const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  serverMode,
  buildCommand,
  startCommand,
  mockAuthBuildValue,
  headSha,
  workflowRunId,
  viewports,
  summary: {
    observations: observations.length,
    failures: failures.length,
    passed: failures.length === 0,
  },
  requiredRenderedEvidence,
  horizontalOverflowMatrix,
  failures,
  observations,
};
await writeFile(
  path.join(outputDir, "train-layout-qa-results.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
console.log(
  `Train layout QA: ${observations.length} observations, ${failures.length} failures.`,
);
if (failures.length) process.exitCode = 1;
