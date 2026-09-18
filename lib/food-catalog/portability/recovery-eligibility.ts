export type RecoveryEligibilityInput = Readonly<{
  artifactValid: boolean;
  capturedAt: string;
  evaluationTime: string;
  maxArtifactAgeMs?: number;
}>;

export type RecoveryEligibilityResult = Readonly<{
  artifactValid: boolean;
  capturedAt: string;
  evaluationTime: string;
  maxArtifactAgeMs: number | null;
  eligible: boolean;
  agePolicyApplied: boolean;
  ageMs: number;
  reason: "ELIGIBLE" | "ARTIFACT_INVALID" | "ARTIFACT_TOO_OLD" | "CAPTURE_TIME_IN_FUTURE";
}>;

function parseInstant(value: string, label: string): number {
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) throw new Error(`${label} must be a valid timestamp.`);
  return instant;
}

export function evaluateRecoveryEligibility({
  artifactValid,
  capturedAt,
  evaluationTime,
  maxArtifactAgeMs,
}: RecoveryEligibilityInput): RecoveryEligibilityResult {
  if (maxArtifactAgeMs !== undefined && (!Number.isFinite(maxArtifactAgeMs) || maxArtifactAgeMs < 0)) {
    throw new Error("maxArtifactAgeMs must be a finite non-negative duration.");
  }

  const captured = parseInstant(capturedAt, "capturedAt");
  const evaluated = parseInstant(evaluationTime, "evaluationTime");
  const ageMs = evaluated - captured;
  const agePolicyApplied = maxArtifactAgeMs !== undefined;
  const context = Object.freeze({
    artifactValid,
    capturedAt,
    evaluationTime,
    maxArtifactAgeMs: maxArtifactAgeMs ?? null,
    agePolicyApplied,
    ageMs,
  });

  if (!artifactValid) {
    return Object.freeze({ ...context, eligible: false, reason: "ARTIFACT_INVALID" });
  }
  if (ageMs < 0) {
    return Object.freeze({ ...context, eligible: false, reason: "CAPTURE_TIME_IN_FUTURE" });
  }
  if (maxArtifactAgeMs !== undefined && ageMs > maxArtifactAgeMs) {
    return Object.freeze({ ...context, eligible: false, agePolicyApplied: true, reason: "ARTIFACT_TOO_OLD" });
  }
  return Object.freeze({ ...context, eligible: true, reason: "ELIGIBLE" });
}
