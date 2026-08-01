import { readFile, writeFile } from "node:fs/promises";

async function patchCompletionAuthority() {
  const path = "services/database/workout-sessions-legacy-implementation.ts";
  let source = await readFile(path, "utf8");
  if (!source.includes('from "@/services/workouts/history/verified-records-client"')) {
    source = source.replace(
      'import { getCanonicalWorkoutActivity } from "@/services/workouts/history/client";',
      'import { getCanonicalWorkoutActivity } from "@/services/workouts/history/client";\nimport { refreshVerifiedRecordsAuthenticated } from "@/services/workouts/history/verified-records-client";',
    );
  }
  const pattern = /export async function refreshVerifiedRecordsAfterWorkoutCompletion\(sessionId: string\) \{[\s\S]*?\n\}\n\nexport async function getOpenWorkoutSession/u;
  if (!pattern.test(source)) {
    throw new Error("Verified-record completion helper boundary was not found.");
  }
  source = source.replace(
    pattern,
    `export async function refreshVerifiedRecordsAfterWorkoutCompletion(sessionId: string) {
  try {
    return await refreshVerifiedRecordsAuthenticated(sessionId);
  } catch (error) {
    console.warn(
      "Plaivra saved the workout, but verified records remain pending.",
      error,
    );
    return null;
  }
}

export async function getOpenWorkoutSession`,
  );
  await writeFile(path, source, "utf8");
}

async function removeDuplicateAdapterRefresh() {
  const path = "services/database/active-session-persistence-adapter.ts";
  let source = await readFile(path, "utf8");
  source = source.replace(
    /import \{ refreshVerifiedRecordsAuthenticated \} from "@\/services\/workouts\/history\/verified-records-client";\n/u,
    "",
  );
  source = source.replace(
    /\n    void refreshVerifiedRecordsAuthenticated\(input\.workoutSessionId\)\.catch\(\(error\) => \{[\s\S]*?\n    \}\);/u,
    "",
  );
  await writeFile(path, source, "utf8");
}

async function makeProjectionCheckFailSoft() {
  const path = "app/api/workouts/history/[sessionId]/route.ts";
  let source = await readFile(path, "utf8");
  source = source.replace(
    /workoutHistoryRecordProjectionIsCurrent\(\n        context\.supabase,\n        context\.user\.id,\n        sessionId,\n      \),/u,
    `workoutHistoryRecordProjectionIsCurrent(
        context.supabase,
        context.user.id,
        sessionId,
      ).catch(() => null),`,
  );
  source = source.replace(
    /notices: recordProjectionCurrent\n          \? detail\.notices\n          : \[\.\.\.new Set\(\[\.\.\.detail\.notices, "user-action-required" as const\]\)\],/u,
    `notices: recordProjectionCurrent === true
          ? detail.notices
          : recordProjectionCurrent === false
            ? [...new Set([...detail.notices, "user-action-required" as const])]
            : [...new Set([...detail.notices, "partial-availability" as const])],`,
  );
  await writeFile(path, source, "utf8");
}

async function ensureFocusedIntegrationRegistration() {
  const path = "package.json";
  const document = JSON.parse(await readFile(path, "utf8"));
  const required = [
    "services/workouts/history/server-list-reader.integration.test.ts",
    "services/workouts/history/verified-records-rebuild.behavior.test.ts",
  ];
  for (const test of required) {
    if (!document.scripts["test:workout-history:integration"].includes(test)) {
      document.scripts["test:workout-history:integration"] += ` ${test}`;
    }
  }
  await writeFile(path, `${JSON.stringify(document, null, 2)}\n`, "utf8");
}

await patchCompletionAuthority();
await removeDuplicateAdapterRefresh();
await makeProjectionCheckFailSoft();
await ensureFocusedIntegrationRegistration();
console.log("WH-97 generated authority patches synchronized.");
