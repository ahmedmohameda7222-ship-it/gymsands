import { describe, expect, it } from "vitest";
import {
  canonicalizeDecimalText,
  canonicalizeLosslessJsonText,
  canonicalizeLosslessRow,
  canonicalizePostgresScalar,
  sha256Hex,
  type LosslessPostgresScalar,
} from "./canonicalize";

describe("Plan 7 lossless PostgreSQL scalar canonicalization", () => {
  it.each([
    ["000123.45000", "123.45"],
    ["-000.000", "0"],
    ["+001.2300e3", "1230"],
    ["1.2300e-3", "0.00123"],
    ["90071992547409931234567890.1200", "90071992547409931234567890.12"],
  ])("normalizes decimal %s without binary floating point", (input, expected) => {
    expect(canonicalizeDecimalText(input)).toBe(expected);
  });

  it("preserves bigint beyond the JavaScript safe integer range as database text", () => {
    const scalar: LosslessPostgresScalar = { pgType: "int8", text: "9223372036854775807" };
    expect(canonicalizePostgresScalar(scalar)).toBe("9223372036854775807");
  });

  it("preserves microseconds and canonicalizes a PostgreSQL timestamptz offset to UTC", () => {
    const scalar: LosslessPostgresScalar = {
      pgType: "timestamptz",
      text: "2026-09-10 20:19:20.123456+02",
    };
    expect(canonicalizePostgresScalar(scalar)).toBe("2026-09-10T18:19:20.123456Z");
  });

  it("canonicalizes nested JSONB without parsing precision-bearing numeric tokens as JS numbers", () => {
    const input = '{"z":90071992547409931234567890.1200,"a":[0,-0.00,1.2300],"o":{"b":2,"a":1}}';
    expect(canonicalizeLosslessJsonText(input)).toBe(
      '{"a":[0,0,1.23],"o":{"a":1,"b":2},"z":90071992547409931234567890.12}',
    );
  });

  it("orders semantic JSON keys by an explicit locale-independent Unicode code-unit contract", () => {
    const originalLocaleCompare = String.prototype.localeCompare;
    let canonical = "";
    try {
      String.prototype.localeCompare = function forbiddenLocaleCompare() {
        throw new Error("localeCompare must not participate in Plan 7 semantic canonicalization");
      };
      canonical = canonicalizeLosslessJsonText('{"😀":6,"中":5,"ع":4,"Ω":3,"ä":1,"a":2}');
    } finally {
      String.prototype.localeCompare = originalLocaleCompare;
    }
    expect(canonical).toBe('{"a":2,"ä":1,"Ω":3,"ع":4,"中":5,"😀":6}');
  });

  it("keeps NULL distinct from numeric zero", () => {
    expect(canonicalizePostgresScalar({ pgType: "numeric", text: null })).toBeNull();
    expect(canonicalizePostgresScalar({ pgType: "numeric", text: "0" })).toBe("0");
  });

  it("keeps SQL NULL distinct from the literal text value null in canonical row bytes", () => {
    const sqlNull = canonicalizeLosslessRow({ value: { pgType: "text", text: null } });
    const literalNull = canonicalizeLosslessRow({ value: { pgType: "text", text: "null" } });
    expect(sqlNull).not.toBe(literalNull);
    expect(sqlNull).toBe('[["value","text",null]]');
    expect(literalNull).toBe('[["value","text","null"]]');
  });

  it("normalizes UUID case without changing textual PostgreSQL identity", () => {
    expect(canonicalizePostgresScalar({ pgType: "uuid", text: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" }))
      .toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("produces lowercase SHA-256 digests", () => {
    expect(sha256Hex("plan7")).toMatch(/^[0-9a-f]{64}$/);
  });
});
