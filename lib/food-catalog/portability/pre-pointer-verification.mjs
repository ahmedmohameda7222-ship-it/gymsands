import { buildPrePointerVerificationSql as buildSql } from "./restore-assertions.ts";
import {
  loadCanonicalGenerationValidationSnapshot,
  verifyCanonicalPrePointerGeneration,
} from "./pre-pointer-generation-runtime.mjs";

export function buildPrePointerVerificationSql(input, databaseUrl) {
  if (input.currentGenerationId !== null) {
    if (typeof databaseUrl !== "string" || databaseUrl.length === 0) {
      throw new Error("Plan7 canonical pre-pointer validation requires the explicit disposable restore database URL.");
    }
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
