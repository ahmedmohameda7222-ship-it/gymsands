import { readFile, writeFile } from "node:fs/promises";

const pendingFiles = [
  "20260801140043_workout_history_verified_records.sql",
  "20260801160000_workout_history_correction_and_soft_delete.sql",
  "20260801180000_workout_history_repeat_session.sql",
  "20260801194500_workout_history_verified_record_authority_hardening.sql",
  "20260801201500_workout_history_verified_record_rebuild.sql",
  "20260801203000_workout_history_set_detail_patch_semantics.sql",
  "20260801210000_workout_history_correction_muscle_reconcile.sql",
  "20260801220000_workout_history_keyset_read_authority.sql",
  "20260801223000_workout_history_filter_options.sql",
];

const ledgerPath = "supabase/migration-ledger.json";
const readmePath = "README.md";
const reconciliationPath = "docs/architecture/migration-ledger-reconciliation.md";
const packagePath = "package.json";
const completionPath = "services/database/workout-sessions-legacy-implementation.ts";

const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
const byFile = new Map(ledger.entries.map((entry) => [entry.localFile, entry]));
for (const localFile of pendingFiles) {
  if (!byFile.has(localFile)) {
    ledger.entries.push({
      localFile,
      state: "pending",
      note: "Repository-only Workout History forward migration. It has not been applied to Production. Do not replay or apply without a separately approved release operation.",
    });
  }
}
ledger.entries.sort((left, right) => left.localFile.localeCompare(right.localFile));
const pendingCount = ledger.entries.filter((entry) => entry.state === "pending").length;
const unresolvedCount = ledger.entries.filter((entry) => !["applied", "applied_version_alias"].includes(entry.state)).length;
ledger.pendingCount = pendingCount;
ledger.unresolvedCount = unresolvedCount;
ledger.historyRepair = {
  ...ledger.historyRepair,
  state: "pending",
  pendingCount,
  unresolvedCount,
  schemaAppliedUntrackedCount: ledger.schemaVerifiedUntrackedCount ?? 0,
  note: `Production history remains reconciled through the latest applied AW-9 identity. ${pendingFiles.join(", ")} are repository-only pending Workout History migrations. Do not replay or apply any pending migration without explicit release authorization.`,
};
await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");

const pendingInline = pendingFiles.map((file) => `\`${file}\``).join(", ");
let readme = await readFile(readmePath, "utf8");
readme = readme.replace(
  /^- Plaivra Production contains 76 physical migration records\..*$/mu,
  `- Plaivra Production contains 76 physical migration records. The ledger classifies 63 exact applications and 13 generated-version aliases. ${pendingInline} are repository-only pending and have not been applied to Production.`,
);
await writeFile(readmePath, readme, "utf8");

let reconciliation = await readFile(reconciliationPath, "utf8");
reconciliation = reconciliation
  .replace(/\*\*Status:\*\*.*$/mu, `**Status:** AW-9 applied; ${pendingCount} Workout History migrations pending`)
  .replace(/- Repository classifications: \*\*\d+\*\*/u, `- Repository classifications: **${ledger.entries.length}**`)
  .replace(/- Repository-only pending migrations: \*\*\d+\*\*/u, `- Repository-only pending migrations: **${pendingCount}**`)
  .replace(/- `pendingCount = \d+`/u, `- \`pendingCount = ${pendingCount}\``)
  .replace(/- `unresolvedCount = \d+`/u, `- \`unresolvedCount = ${unresolvedCount}\``)
  .replace(
    /`20260801140043_workout_history_verified_records\.sql`.*?Production writes\./su,
    `${pendingInline} are approved forward repository migrations for the Workout History program and its independent QA/QC corrections. They exist only in the repository, are classified as pending, and have not been applied to Production. Applying them requires separate explicit authorization; this implementation program does not authorize Production writes.`,
  );
await writeFile(reconciliationPath, reconciliation, "utf8");

const packageDocument = JSON.parse(await readFile(packagePath, "utf8"));
const keysetTest = "services/workouts/history/server-list-reader.integration.test.ts";
if (!packageDocument.scripts["test:workout-history:integration"].includes(keysetTest)) {
  packageDocument.scripts["test:workout-history:integration"] =
    `${packageDocument.scripts["test:workout-history:integration"]} ${keysetTest}`;
}
await writeFile(packagePath, `${JSON.stringify(packageDocument, null, 2)}\n`, "utf8");

let completion = await readFile(completionPath, "utf8");
if (!completion.includes('from "@/services/workouts/history/verified-records-client"')) {
  completion = completion.replace(
    'import { getCanonicalWorkoutActivity } from "@/services/workouts/history/client";',
    'import { getCanonicalWorkoutActivity } from "@/services/workouts/history/client";\nimport { refreshVerifiedRecordsAuthenticated } from "@/services/workouts/history/verified-records-client";',
  );
}
const refreshPattern = /export async function refreshVerifiedRecordsAfterWorkoutCompletion\(sessionId: string\) \{[\s\S]*?\n\}\n\nexport async function getOpenWorkoutSession/u;
if (!refreshPattern.test(completion)) {
  throw new Error("Legacy verified-record refresh function boundary was not found.");
}
completion = completion.replace(
  refreshPattern,
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
await writeFile(completionPath, completion, "utf8");

console.log(`Updated migration ledger: pending=${pendingCount} unresolved=${unresolvedCount} entries=${ledger.entries.length}`);
