import { buildPrePointerVerificationSql as buildSql } from "./restore-assertions.ts";
import {
  loadCanonicalGenerationValidationSnapshot,
  verifyCanonicalPrePointerGeneration,
} from "./pre-pointer-generation-runtime.mjs";

function restoreDatabaseUrlFromProcess() {
  const entrypoint = process.argv[1] ?? "";
  if (!entrypoint.endsWith("restore-food-catalog-portable.mjs")) return null;
  const targetIndex = process.argv.indexOf("--target-url");
  if (targetIndex >= 0) {
    const value = process.argv[targetIndex + 1];
    if (!value) throw new Error("Plan7 restore --target-url requires a value.");
    return value;
  }
  const value = process.env.PLAN7_RESTORE_DATABASE_URL;
  if (!value) throw new Error("Plan7 canonical pre-pointer validation requires the disposable restore database URL.");
  return value;
}

export function buildPrePointerVerificationSql(input) {
  const databaseUrl = restoreDatabaseUrlFromProcess();
  if (databaseUrl && input.currentGenerationId !== null) {
    if (!input.currentEventId || !input.currentValidationReportId) {
      throw new Error("Plan7 non-null current generation requires event and validation-report identities.");
    }
    const snapshot = loadCanonicalGenerationValidationSnapshot(databaseUrl, input.currentGenerationId);
    const expectedChecksum = snapshot.generation.compositionChecksumSha256;
    verifyCanonicalPrePointerGeneration({
      databaseUrl,
      generationId: input.currentGenerationId,
      eventId: input.currentEventId,
      reportId: input.currentValidationReportId,
      expectedChecksum,
    });
  }
  return buildSql(input);
}
