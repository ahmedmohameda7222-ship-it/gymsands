const { readFileSync, writeFileSync } = require("node:fs");

function replaceExactly(path, before, after, expectedCount = 1) {
  const source = readFileSync(path, "utf8");
  const count = source.split(before).length - 1;
  if (count !== expectedCount) {
    throw new Error(`${path}: expected ${expectedCount} replacement target(s), found ${count}`);
  }
  writeFileSync(path, source.split(before).join(after), "utf8");
}

const fixturePath = "scripts/train-layout-qa-fixture.mjs";
const helperAnchor = `export async function installAw5CorrectionFixture(context, {`;
const helper = `function persistedExerciseLogRow(log, sessionId, userId) {
  const setNumber = Number(log.set_number ?? 0);
  const exerciseLogId = log.id
    ?? "25000000-0000-4000-8000-" + String(setNumber).padStart(12, "0");
  const ownership = {
    exercise_log_id: exerciseLogId,
    workout_session_id: sessionId,
    user_id: userId
  };
  const timestamp = log.completed_at ?? "2026-07-27T08:00:00.000Z";
  const setDetails = log.set_details
    ? {
        ...log.set_details,
        id: log.set_details.id
          ?? "26000000-0000-4000-8000-" + String(setNumber).padStart(12, "0"),
        ...ownership,
        created_at: log.set_details.created_at ?? timestamp,
        updated_at: log.set_details.updated_at ?? timestamp
      }
    : null;
  const segments = (Array.isArray(log.segments) ? log.segments : []).map(
    (segment, segmentIndex) => {
      const segmentOrder = Number(segment.segment_order ?? segmentIndex + 1);
      const segmentId = segment.id
        ?? "27000000-0000-4000-8000-" + String(setNumber * 100 + segmentOrder).padStart(12, "0");
      const metricValues = (
        Array.isArray(segment.metric_values) ? segment.metric_values : []
      ).map((metric, metricIndex) => ({
        ...metric,
        id: metric.id
          ?? "28000000-0000-4000-8000-" + String(
            setNumber * 10000 + segmentOrder * 100 + metricIndex + 1
          ).padStart(12, "0"),
        segment_id: segmentId,
        ...ownership,
        created_at: metric.created_at ?? timestamp,
        updated_at: metric.updated_at ?? timestamp
      }));
      return {
        ...segment,
        id: segmentId,
        ...ownership,
        segment_order: segmentOrder,
        metric_values: metricValues,
        created_at: segment.created_at ?? timestamp,
        updated_at: segment.updated_at ?? timestamp
      };
    }
  );
  return {
    id: exerciseLogId,
    workout_session_id: sessionId,
    user_id: userId,
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
    set_details: setDetails,
    performance_metrics: log.performance_metrics ?? [],
    segments,
    created_at: log.created_at ?? timestamp,
    updated_at: log.updated_at ?? timestamp
  };
}

${helperAnchor}`;
replaceExactly(fixturePath, helperAnchor, helper);

const oldRow = `        const row = {
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
        };`;
replaceExactly(
  fixturePath,
  oldRow,
  `        const row = persistedExerciseLogRow(log, sessionId, contract.userId);`,
  2
);
replaceExactly(
  fixturePath,
  `const incoming = Array.isArray(payload?.p_final_logs) ? payload.p_final_logs : [];`,
  `const incoming = Array.isArray(payload?.p_logs) ? payload.p_logs : [];`
);

const testPath = "lib/product/active-workout-aw10-closure.test.ts";
replaceExactly(
  testPath,
  `    expect(fixture).toContain("setServerRootStatus(status)");`,
  `    expect(fixture).toContain("setServerRootStatus(status)");
    expect(fixture).toContain("function persistedExerciseLogRow");
    expect(fixture).toContain("exercise_log_id: exerciseLogId");
    expect(fixture).toContain("workout_session_id: sessionId");
    expect(fixture).toContain("user_id: userId");
    expect(fixture).toContain("segment_id: segmentId");
    expect(fixture).toContain("payload?.p_logs");
    expect(fixture).not.toContain("payload?.p_final_logs");`
);
