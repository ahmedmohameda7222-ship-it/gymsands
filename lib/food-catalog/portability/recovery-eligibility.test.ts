import { describe, expect, it } from "vitest";
import { evaluateRecoveryEligibility } from "./recovery-eligibility";

describe("Plan 7 recovery eligibility policy", () => {
  it("has no implicit global artifact TTL", () => {
    expect(evaluateRecoveryEligibility({
      artifactValid: true,
      capturedAt: "2000-01-01T00:00:00.000000Z",
      evaluationTime: "2026-09-10T20:00:00.000000Z",
    })).toMatchObject({ artifactValid: true, eligible: true, agePolicyApplied: false });
  });

  it("can reject an otherwise valid artifact under caller maxArtifactAge policy", () => {
    const result = evaluateRecoveryEligibility({
      artifactValid: true,
      capturedAt: "2026-09-01T00:00:00.000000Z",
      evaluationTime: "2026-09-10T00:00:00.000000Z",
      maxArtifactAgeMs: 24 * 60 * 60 * 1000,
    });
    expect(result).toMatchObject({ artifactValid: true, eligible: false, agePolicyApplied: true, reason: "ARTIFACT_TOO_OLD" });
  });

  it("never makes an invalid artifact recovery-eligible", () => {
    expect(evaluateRecoveryEligibility({
      artifactValid: false,
      capturedAt: "2026-09-10T19:59:59.000000Z",
      evaluationTime: "2026-09-10T20:00:00.000000Z",
    }).eligible).toBe(false);
  });

  it("rejects invalid caller age policies and future capture timestamps", () => {
    expect(() => evaluateRecoveryEligibility({
      artifactValid: true,
      capturedAt: "2026-09-10T00:00:00.000000Z",
      evaluationTime: "2026-09-10T20:00:00.000000Z",
      maxArtifactAgeMs: -1,
    })).toThrow(/maxArtifactAge/i);
    expect(evaluateRecoveryEligibility({
      artifactValid: true,
      capturedAt: "2026-09-11T00:00:00.000000Z",
      evaluationTime: "2026-09-10T20:00:00.000000Z",
    }).eligible).toBe(false);
  });
});
