import { describe, expect, it } from "vitest";
import {
  createOperationalCorrelationId,
  isValidOperationalCorrelationId,
  resolveOperationalCorrelationId
} from "./correlation-id";

describe("operational correlation IDs", () => {
  it("accepts bounded low-cardinality-safe IDs", () => {
    expect(isValidOperationalCorrelationId("request-1:catalog.load_2")).toBe(true);
    expect(resolveOperationalCorrelationId(" request-1 ")).toBe("request-1");
  });

  it.each(["", "contains spaces", "x".repeat(129), "email@example.com/unsafe"])("replaces invalid value %j", (value) => {
    const resolved = resolveOperationalCorrelationId(value);
    expect(resolved).not.toBe(value);
    expect(isValidOperationalCorrelationId(resolved)).toBe(true);
  });

  it("generates unique secure IDs", () => {
    const first = createOperationalCorrelationId();
    const second = createOperationalCorrelationId();
    expect(first).not.toBe(second);
    expect(isValidOperationalCorrelationId(first)).toBe(true);
    expect(isValidOperationalCorrelationId(second)).toBe(true);
  });
});
