import {
  activityId,
  baseUrl,
  contract,
  createDeferred,
  directExerciseName,
  itemId,
  requestRecord,
  setIds,
  snapshotId
} from "./aw5-correction-qa-shared.mjs";

function catalogPayload(url, includeGuide) {
  const activity = {
    id: activityId,
    slug: "barbell_squat",
    name: directExerciseName,
    shortDescription: "Deterministic AW-5 rendered verification activity.",
    instructions: includeGuide ? [{ order: 1, text: "Brace and move with control." }] : [],
    difficulty: "intermediate",
    movementPattern: "squat",
    version: 1,
    activityType: {
      id: "22222222-2222-4222-8222-222222222222",
      slug: "strength",
      name: "Strength"
    },
    metricSchema: null,
    sports: [],
    sessionTypes: [],
    sessionPhases: [],
    equipment: [{
      id: "33333333-3333-4333-8333-333333333333",
      slug: "barbell",
      name: "Barbell",
      isRequired: true
    }],
    muscles: [{
      id: "44444444-4444-4444-8444-444444444444",
      slug: "quadriceps",
      name: "Quadriceps",
      role: "primary"
    }],
    trainingGoals: [],
    translations: {},
    guideUrl: includeGuide ? "https://example.com/catalog-guide" : null,
    videoUrl: includeGuide ? "https://example.com/catalog-video" : null,
    updatedAt: "2026-07-27T00:00:00.000Z"
  };
  const meta = { source: "external", degraded: false, catalogVersion: "v1", locale: "en" };
  if (url.pathname.endsWith("/filters")) {
    return {
      data: {
        sports: [],
        activityTypes: [activity.activityType],
        sessionTypes: [],
        sessionPhases: [],
        equipment: activity.equipment,
        trainingGoals: [],
        difficulties: ["intermediate"]
      },
      meta
    };
  }
  if (url.pathname.endsWith("/alternatives")) return { data: [], meta };
  if (/\/activities\/[^/]+$/.test(url.pathname)) return { data: activity, meta };
  if (url.pathname.endsWith("/activities")) {
    return {
      data: [activity],
      pagination: { limit: 30, offset: 0, returned: 1, nextOffset: null },
      meta
    };
  }
  if (url.pathname.endsWith("/sports")) return { data: [], meta };
  return { data: { sport: activity.activityType, sessionTypes: [], sessionPhases: [] }, meta };
}

function activeMuscleAnalysisPayload(sessionId, scenario, mode = "active") {
  const inactive = scenario === "empty";
  const partial = scenario === "partial";
  return {
    sessionId,
    snapshotId: "24000000-0000-4000-8000-000000000001",
    snapshotSchemaVersion: "workout_session_muscle_snapshot_v1",
    frozenAt: "2026-07-27T08:00:00.000Z",
    source: "session_start",
    snapshotCompleteness: partial ? "partial" : "complete",
    reasonCodes: partial ? ["unmapped_items"] : [],
    effectiveCompleteness: partial ? "partial" : "complete",
    effectiveWarnings: partial ? ["unmapped_items"] : [],
    analysis: {
      schemaVersion: "muscle_analysis_result_v1",
      taxonomyVersion: "muscle_taxonomy_v1",
      engineVersion: "muscle_load_resistance_sets_v1",
      thresholdVersion: "muscle_load_thresholds_v1",
      mode,
      period: { kind: "session" },
      completeness: partial ? "partial" : "complete",
      muscles: [{
        muscleId: "quadriceps",
        rawScore: inactive ? 0 : 4,
        levelInputScore: inactive ? 0 : 4,
        level: inactive ? "inactive" : "medium"
      }],
      contributionBreakdown: [],
      mappingVersionsUsed: [],
      coverage: {
        totalItemCount: 1,
        includedItemCount: 1,
        unmappedItemCount: partial ? 1 : 0,
        unsupportedItemCount: 0
      },
      warnings: partial ? ["unmapped_items"] : []
    }
  };
}

export async function installAw5CorrectionFixture(context, {
  direct,
  language,
  theme,
  delayCanonical,
  muscleScenario = "ready",
  includeGuide = true
}, requestHistory) {
  const sessionId = contract.activeSessionId;
  const exerciseName = direct ? directExerciseName : contract.activeFirstExerciseName;
  const sourceExerciseId = direct ? null : contract.activeFirstExerciseId;
  const delayedCanonical = createDeferred();
  const canonicalFinished = createDeferred();
  let root = {
    id: sessionId,
    user_id: contract.userId,
    workout_id: direct ? activityId : null,
    plan_id: direct ? null : contract.planIds.active,
    plan_day_id: direct ? null : contract.activeDayId,
    workout_name: direct ? directExerciseName : contract.activeDayName,
    workout_day_name: direct ? null : contract.activeDayName,
    workout_category: "strength",
    started_at: "2026-07-27T08:00:00.000Z",
    completed_at: null,
    skipped_at: null,
    duration_minutes: null,
    notes: null,
    status: "started",
    source: direct ? "manual" : "schedule"
  };
  let performedLogs = [];
  let muscleRequestCount = 0;
  const snapshot = {
    id: snapshotId,
    workout_session_id: sessionId,
    user_id: contract.userId
  };
  const item = {
    id: itemId,
    snapshot_id: snapshotId,
    user_id: contract.userId,
    item_order: 1,
    source_plan_exercise_id: sourceExerciseId,
    source_plan_activity_id: direct ? activityId : null,
    activity_name_snapshot: exerciseName,
    planned_prescription: { sets: 2, reps: "8-10", rest_seconds: 90 },
    planned_sets: 2,
    state: "planned"
  };
  const sets = [1, 2].map((setOrder) => ({
    id: setIds[setOrder - 1],
    snapshot_item_id: itemId,
    snapshot_id: snapshotId,
    workout_session_id: sessionId,
    user_id: contract.userId,
    set_order: setOrder,
    performed_order_hint: null,
    set_type: "working",
    target_mode: "custom",
    side_mode: "none",
    rest_seconds: 90,
    tempo_target: null,
    schema_version: 1,
    created_at: "2026-07-27T08:00:00.000Z"
  }));
  const settings = {
    id: "22222222-2222-4222-8222-222222222222",
    user_id: contract.userId,
    theme_id: theme === "dark" ? "elite-noir" : "olive",
    theme,
    accent_color: theme === "dark" ? "elite-noir" : "olive",
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
    created_at: "2026-07-27T00:00:00.000Z",
    updated_at: "2026-07-27T00:00:00.000Z"
  };

  await context.addCookies([{
    name: "plaivra.language.v1",
    value: language,
    url: baseUrl,
    sameSite: "Lax"
  }]);
  await context.addInitScript(({ languageValue, themeId }) => {
    localStorage.setItem("plaivra.qa.train-scenario", "active");
    localStorage.setItem("plaivra.qa.train-variant", "active-default-success");
    localStorage.setItem("plaivra.language.v1", languageValue);
    localStorage.setItem("plaivra-theme-id", themeId);
  }, {
    languageValue: language,
    themeId: theme === "dark" ? "elite-noir" : "olive"
  });

  await context.route("**/api/activity-catalog/**", async (route) => {
    requestHistory.push(requestRecord(route.request(), "fulfilled:activity-catalog"));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "cache-control": "private, no-store",
        "x-plaivra-qa-fixture": "aw5-correction-catalog"
      },
      body: JSON.stringify(catalogPayload(new URL(route.request().url()), includeGuide))
    });
  });

  await context.route(/\/api\/workouts\/sessions\/[^/]+\/muscle-analysis(?:\?.*)?$/, async (route) => {
    const analysisMode = new URL(route.request().url()).searchParams.get("mode") === "completed"
      ? "completed"
      : "active";
    muscleRequestCount += 1;
    const refreshFailure = muscleScenario === "cached-refresh-error" && muscleRequestCount > 1;
    requestHistory.push(requestRecord(
      route.request(),
      refreshFailure ? "response:503:heat-map" : "fulfilled:heat-map"
    ));
    await route.fulfill({
      status: refreshFailure ? 503 : 200,
      contentType: "application/json",
      headers: {
        "cache-control": "private, no-store",
        "x-plaivra-qa-fixture": "aw5-correction-heat-map"
      },
      body: JSON.stringify(
        refreshFailure
          ? { error: "Active muscle load request failed.", code: "qa_refresh_failed" }
          : activeMuscleAnalysisPayload(sessionId, muscleScenario, analysisMode)
      )
    });
  });

  await context.route(/^https:\/\/[^/]+\.supabase\.co\//, async (route) => {
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;
    const wantsObject = (request.headers().accept || "").includes("application/vnd.pgrst.object");
    const respond = (body, status = 200, headers = {}) => route.fulfill({
      status,
      contentType: "application/json",
      headers,
      body: JSON.stringify(body)
    });
    requestHistory.push(requestRecord(request, `intercepted:${pathname}`));

    if (method === "POST" && pathname.includes("/rest/v1/rpc/start_or_resume_workout_session_atomic")) {
      return respond({ session: root, resumed: true });
    }
    if (method === "POST" && pathname.includes("/rest/v1/rpc/start_or_resume_direct_workout_session_atomic")) {
      return respond({ session: root, resumed: true });
    }
    if (method === "GET" && pathname.includes("/rest/v1/workout_sessions")) {
      return respond(wantsObject ? root : [root], 200, { "content-range": "0-0/1" });
    }
    if (method === "GET" && pathname.includes("/rest/v1/workout_session_muscle_snapshots")) {
      return respond(wantsObject ? snapshot : [snapshot], 200, { "content-range": "0-0/1" });
    }
    if (method === "GET" && pathname.includes("/rest/v1/workout_session_muscle_snapshot_items")) {
      return respond([item], 200, { "content-range": "0-0/1" });
    }
    if (method === "GET" && pathname.includes("/rest/v1/workout_session_prescription_sets")) {
      return respond(sets, 200, { "content-range": "0-1/2" });
    }
    if (method === "GET" && pathname.includes("/rest/v1/exercise_logs")) {
      return respond(performedLogs, 200, {
        "content-range": performedLogs.length
          ? "0-" + (performedLogs.length - 1) + "/" + performedLogs.length
          : "*/0"
      });
    }
    if (method === "GET" && (
      pathname.includes("/rest/v1/workout_session_prescription_metric_targets")
      || pathname.includes("/rest/v1/workout_performance_metric_definitions")
      || pathname.includes("/rest/v1/user_exercise_alternatives")
      || pathname.includes("/rest/v1/user_progression_targets")
    )) {
      return respond([], 200, { "content-range": "*/0" });
    }
    if (method === "POST" && pathname.includes("/rest/v1/rpc/upsert_workout_set_logs_atomic")) {
      if (delayCanonical) await delayedCanonical.promise;
      const payload = request.postDataJSON();
      const incoming = Array.isArray(payload?.p_logs) ? payload.p_logs : [];
      for (const log of incoming) {
        const exerciseIdentity = log.plan_exercise_id
          ?? String(log.exercise_order ?? "none") + ":" + String(log.exercise_name ?? "").trim().toLowerCase();
        const identity = exerciseIdentity + ":set:" + log.set_number;
        const row = {
          id: log.id
            ?? "25000000-0000-4000-8000-" + String(log.set_number ?? 0).padStart(12, "0"),
          workout_session_id: sessionId,
          user_id: contract.userId,
          plan_exercise_id: log.plan_exercise_id ?? null,
          exercise_order: log.exercise_order ?? null,
          exercise_name: log.exercise_name,
          exercise_category: log.exercise_category ?? null,
          planned_sets: log.planned_sets ?? null,
          planned_reps: log.planned_reps ?? null,
          planned_rest_seconds: log.planned_rest_seconds ?? null,
          set_number: log.set_number,
          reps: log.reps ?? null,
          weight_kg: log.weight_kg ?? null,
          notes: log.notes ?? null,
          completed_at: log.completed_at ?? null,
          set_details: log.set_details ?? null,
          performance_metrics: log.performance_metrics ?? [],
          segments: log.segments ?? []
        };
        const index = performedLogs.findIndex((existing) => {
          const existingExercise = existing.plan_exercise_id
            ?? String(existing.exercise_order ?? "none") + ":" + String(existing.exercise_name ?? "").trim().toLowerCase();
          return existingExercise + ":set:" + existing.set_number === identity;
        });
        if (index >= 0) performedLogs[index] = row;
        else performedLogs.push(row);
      }
      await respond({ saved: incoming.length, deleted: 0 });
      canonicalFinished.resolve();
      return;
    }
    if (method === "POST" && pathname.includes("/rest/v1/rpc/complete_workout_session_atomic")) {
      const payload = request.postDataJSON();
      const incoming = Array.isArray(payload?.p_final_logs) ? payload.p_final_logs : [];
      for (const log of incoming) {
        const exerciseIdentity = log.plan_exercise_id
          ?? String(log.exercise_order ?? "none") + ":" + String(log.exercise_name ?? "").trim().toLowerCase();
        const identity = exerciseIdentity + ":set:" + log.set_number;
        const row = {
          id: log.id
            ?? "25000000-0000-4000-8000-" + String(log.set_number ?? 0).padStart(12, "0"),
          workout_session_id: sessionId,
          user_id: contract.userId,
          plan_exercise_id: log.plan_exercise_id ?? null,
          exercise_order: log.exercise_order ?? null,
          exercise_name: log.exercise_name,
          exercise_category: log.exercise_category ?? null,
          planned_sets: log.planned_sets ?? null,
          planned_reps: log.planned_reps ?? null,
          planned_rest_seconds: log.planned_rest_seconds ?? null,
          set_number: log.set_number,
          reps: log.reps ?? null,
          weight_kg: log.weight_kg ?? null,
          notes: log.notes ?? null,
          completed_at: log.completed_at ?? null,
          set_details: log.set_details ?? null,
          performance_metrics: log.performance_metrics ?? [],
          segments: log.segments ?? []
        };
        const index = performedLogs.findIndex((existing) => {
          const existingExercise = existing.plan_exercise_id
            ?? String(existing.exercise_order ?? "none") + ":" + String(existing.exercise_name ?? "").trim().toLowerCase();
          return existingExercise + ":set:" + existing.set_number === identity;
        });
        if (index >= 0) performedLogs[index] = row;
        else performedLogs.push(row);
      }
      root = {
        ...root,
        status: "completed",
        completed_at: "2026-07-27T09:00:00.000Z",
        duration_minutes: payload?.p_duration_minutes ?? root.duration_minutes,
        notes: payload?.p_notes ?? root.notes
      };
      return respond(root);
    }
    if (pathname.includes("/rest/v1/user_app_settings") && (method === "GET" || method === "HEAD")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "content-range": "0-0/1",
          "x-plaivra-qa-fixture": "localized-settings"
        },
        body: method === "HEAD" ? "" : JSON.stringify(wantsObject ? settings : [settings])
      });
    }

    let body = {};
    if (method !== "GET" && method !== "HEAD") {
      try {
        body = request.postDataJSON();
      } catch {
        body = {};
      }
    }
    return route.fulfill({
      status: method === "POST" ? 201 : 200,
      contentType: "application/json",
      headers: {
        "content-range": "0-0/0",
        "x-plaivra-qa-fixture": "aw5-correction-empty"
      },
      body: method === "HEAD" ? "" : JSON.stringify(method === "GET" ? [] : body)
    });
  });

  return {
    sessionId,
    setServerRootStatus(status) {
      root = {
        ...root,
        status,
        completed_at: status === "completed"
          ? root.completed_at ?? "2026-07-27T09:00:00.000Z"
          : null
      };
    },
    performedLogsSnapshot: () => JSON.parse(JSON.stringify(performedLogs)),
    muscleRequestCount: () => muscleRequestCount,
    releaseCanonical: delayedCanonical.resolve,
    canonicalSettled: () => delayedCanonical.settled,
    waitForCanonical: async () => {
      if (!delayCanonical) return;
      await Promise.race([
        canonicalFinished.promise,
        new Promise((resolve) => setTimeout(resolve, 2_000))
      ]);
    }
  };
}
