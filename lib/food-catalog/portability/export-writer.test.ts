import { describe, expect, it } from "vitest";
import { createStreamingSegmentWriter } from "./export-writer";
import type { LosslessPostgresRow } from "./export-reader";
import { sha256Hex } from "./canonicalize";

const scalar = (pgType: string, text: string | null) => ({ pgType, text });

describe("Plan 7 streaming export writer", () => {
  it("emits deterministic canonical NDJSON and hashes incrementally", async () => {
    const chunks: string[] = [];
    const writer = createStreamingSegmentWriter((chunk) => { chunks.push(chunk); });
    const rows: LosslessPostgresRow[] = [
      { amount: scalar("numeric", "001.2300"), id: scalar("int8", "9007199254740993") },
      { amount: scalar("numeric", null), id: scalar("int8", "9007199254740994") },
    ];
    for (const value of rows) writer.write(value);
    const result = writer.finalize();
    const bytes = chunks.join("");

    expect(result.rowCount).toBe(2);
    expect(result.plaintextSemanticSha256).toBe(sha256Hex(bytes));
    expect(bytes).toContain('"9007199254740993"');
    expect(bytes).toContain('"1.23"');
    expect(bytes).toContain('"null"');
  });

  it("does not require whole-catalog buffering in its sink contract", () => {
    let maxChunk = 0;
    const writer = createStreamingSegmentWriter((chunk) => { maxChunk = Math.max(maxChunk, chunk.length); });
    for (let index = 0; index < 1000; index += 1) {
      writer.write({ id: scalar("int8", String(9_000_000 + index)) });
    }
    writer.finalize();
    expect(maxChunk).toBeLessThan(256);
  });
});
