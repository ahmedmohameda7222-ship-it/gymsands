import { describe, expect, it } from "vitest";
import { assertStrictStableKeyOrder, stableKeyToken, type LosslessPostgresRow } from "./export-reader";

const scalar = (pgType: string, text: string | null) => ({ pgType, text });
const row = (id: string): LosslessPostgresRow => ({ id: scalar("uuid", id), n: scalar("int8", "9007199254740993") });

describe("Plan 7 stable-key export reader", () => {
  it("orders from canonical lossless PostgreSQL tokens rather than JS numbers", () => {
    expect(stableKeyToken(row("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), ["id"]))
      .toBe('["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]');
  });

  it("accepts strictly increasing stable keys", () => {
    expect(() => assertStrictStableKeyOrder([
      row("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
      row("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
    ], ["id"])).not.toThrow();
  });

  it("rejects duplicate and non-monotonic stable keys", () => {
    const a = row("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const b = row("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(() => assertStrictStableKeyOrder([a, a], ["id"])).toThrow(/duplicate|strict/i);
    expect(() => assertStrictStableKeyOrder([b, a], ["id"])).toThrow(/monotonic|order/i);
  });

  it("rejects missing stable-key scalar rather than synthesizing an offset identity", () => {
    expect(() => stableKeyToken({ n: scalar("int8", "1") }, ["id"])).toThrow(/stable key|missing/i);
  });
});
