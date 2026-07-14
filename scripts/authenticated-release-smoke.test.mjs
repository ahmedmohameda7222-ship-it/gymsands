import assert from "node:assert/strict";
import test from "node:test";
import {
  sanitizeEvidence,
  sanitizeEvidenceArtifactPath,
  sanitizeEvidencePath,
  sanitizeEvidenceUrl,
  sanitizedText
} from "./authenticated-release-smoke.mjs";

const dynamicCases = [
  ["/settings/connections/usr_Zx9Qm2Kp7Vw4Rt8Ny6Bc3Hd1", "/settings/connections/id", "usr_Zx9Qm2Kp7Vw4Rt8Ny6Bc3Hd1"],
  ["/api/items/record_GHJKLmnop987654321XYZ", "/api/items/id", "record_GHJKLmnop987654321XYZ"],
  ["/workouts/01JABCDEF9XYZ0123456789QRS", "/workouts/id", "01JABCDEF9XYZ0123456789QRS"],
  ["/orders/1234567890", "/orders/id", "1234567890"],
  ["/users/550e8400-e29b-41d4-a716-446655440000", "/users/id", "550e8400-e29b-41d4-a716-446655440000"]
];

test("redacts every required opaque path example segment-by-segment", () => {
  for (const [input, expected, identifier] of dynamicCases) {
    const sanitized = sanitizeEvidencePath(`${input}?token=secret#raw-fragment`);
    assert.equal(sanitized, expected);
    assert.doesNotMatch(sanitized, new RegExp(identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(sanitized, /token|secret|fragment/);
  }
});

test("redacts URL-safe base64-like and opaque nonhex path identifiers", () => {
  assert.equal(sanitizeEvidencePath("/files/QWxhZGRpbjpvcGVuX3Nlc2FtZQ"), "/files/id");
  assert.equal(sanitizeEvidencePath("/records/Zyxwvutsrqponmlkjihgfedcba987"), "/records/id");
});

test("safe URLs strip credentials, query, fragment, and dynamic identifiers", () => {
  const sanitized = sanitizeEvidenceUrl("https://user:password@example.test/api/items/record_GHJKLmnop987654321XYZ?token=secret#raw");
  assert.equal(sanitized, "https://example.test/api/items/id");
});

test("known static paths remain readable", () => {
  for (const path of ["/dashboard", "/my-workout/plans", "/settings/data-privacy"]) {
    assert.equal(sanitizeEvidencePath(path), path);
  }
});

test("success and failure evidence use the same sanitizer", () => {
  const rawIdentifier = "usr_Zx9Qm2Kp7Vw4Rt8Ny6Bc3Hd1";
  const evidence = sanitizeEvidence({
    passed: false,
    deploymentUrl: `https://example.test/settings/connections/${rawIdentifier}?access=secret#raw`,
    routes: [{ route: `/settings/connections/${rawIdentifier}`, finalPath: `/settings/connections/${rawIdentifier}?x=y` }],
    failedRequests: [{ url: `https://example.test/api/items/${rawIdentifier}?token=secret` }],
    serverErrors: [{ url: `https://example.test/workouts/${rawIdentifier}#raw`, status: 500 }],
    screenshots: [`screenshots/failure-${rawIdentifier}.png`],
    failure: `Navigation failed at /settings/connections/${rawIdentifier}?token=secret#raw`
  });
  const serialized = JSON.stringify(evidence);
  assert.doesNotMatch(serialized, new RegExp(rawIdentifier));
  assert.doesNotMatch(serialized, /token=secret|access=secret|#raw/);
  assert.equal(evidence.routes[0].route, "/settings/connections/id");
  assert.equal(evidence.routes[0].finalPath, "/settings/connections/id");
  assert.equal(evidence.failedRequests[0].url, "https://example.test/api/items/id");
  assert.equal(evidence.serverErrors[0].url, "https://example.test/workouts/id");
  assert.equal(evidence.screenshots[0], "screenshots/id");
  assert.match(evidence.failure, /\/settings\/connections\/id/);
});

test("text and screenshot failure metadata cannot bypass segment redaction", () => {
  const identifier = "record_GHJKLmnop987654321XYZ";
  assert.equal(sanitizeEvidenceArtifactPath(`screenshots/failure-${identifier}.png`), "screenshots/id");
  const failure = sanitizedText(`Request https://example.test/api/items/${identifier}?raw=1#fragment failed`, 500);
  assert.equal(failure, "Request https://example.test/api/items/id failed");
  assert.equal(sanitizedText(`Record ${identifier} failed`, 500), "Record [REDACTED] failed");
});

test("structured artifact SHA identity remains available", () => {
  const commitSha = "eb14163f5c8158443a6915b71e03bbcaabfccc9f";
  assert.equal(sanitizeEvidence({ commitSha }).commitSha, commitSha);
});
