import { describe, expect, it } from "vitest";
import { canonicalStringify, sha256Canonical } from "./canonical-hash";

describe("Plan 3 canonical hashing", () => {
  it("sorts object keys recursively", () => {
    expect(canonicalStringify({ b: 2, a: { d: 4, c: 3 } })).toBe(
      '{"a":{"c":3,"d":4},"b":2}',
    );
    expect(sha256Canonical({ b: 2, a: 1 })).toBe(sha256Canonical({ a: 1, b: 2 }));
  });

  it("preserves array order instead of generically sorting arrays", () => {
    expect(sha256Canonical({ a: ["x", "y"] })).not.toBe(
      sha256Canonical({ a: ["y", "x"] }),
    );
  });

  it("returns lowercase SHA-256 hex", () => {
    expect(sha256Canonical({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects unsupported JavaScript values at any depth", () => {
    expect(() => canonicalStringify(undefined)).toThrow(/undefined/i);
    expect(() => canonicalStringify({ value: undefined })).toThrow(/undefined/i);
    expect(() => canonicalStringify(() => "x")).toThrow(/function/i);
    expect(() => canonicalStringify(Symbol("x"))).toThrow(/symbol/i);
  });

  it("rejects non-finite numbers", () => {
    expect(() => canonicalStringify(Number.NaN)).toThrow(/finite/i);
    expect(() => canonicalStringify(Number.POSITIVE_INFINITY)).toThrow(/finite/i);
    expect(() => canonicalStringify({ n: Number.NEGATIVE_INFINITY })).toThrow(/finite/i);
  });

  it("rejects cyclic structures", () => {
    const value: { self?: unknown } = {};
    value.self = value;
    expect(() => canonicalStringify(value)).toThrow(/cyclic/i);
  });
});
