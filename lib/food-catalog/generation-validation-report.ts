import { sha256Canonical } from "./canonical-hash.ts";

type GenerationValidationReportSemanticInput<
  Finding extends { id?: unknown },
  VerificationState,
> = {
  generationId: string;
  generationChecksumSha256: string;
  validatorSetVersion: string;
  policyVersion: string;
  blockerCount: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  findings: readonly Finding[];
  verificationStates: readonly VerificationState[];
};

export function buildGenerationValidationReportSemanticPayload<
  Finding extends { id?: unknown },
  VerificationState,
>(report: GenerationValidationReportSemanticInput<Finding, VerificationState>) {
  return {
    generationId: report.generationId,
    generationChecksumSha256: report.generationChecksumSha256,
    validatorSetVersion: report.validatorSetVersion,
    policyVersion: report.policyVersion,
    blockerCount: report.blockerCount,
    errorCount: report.errorCount,
    warningCount: report.warningCount,
    infoCount: report.infoCount,
    findings: report.findings.map(({ id: _id, ...finding }) => finding),
    verificationStates: report.verificationStates,
  };
}

export function computeGenerationValidationReportChecksum<
  Finding extends { id?: unknown },
  VerificationState,
>(report: GenerationValidationReportSemanticInput<Finding, VerificationState>) {
  return sha256Canonical(buildGenerationValidationReportSemanticPayload(report));
}
