import { createHash } from "node:crypto";
import { canonicalizeLosslessRow } from "./canonicalize";
import type { LosslessPostgresRow } from "./export-reader";

export type StreamingSegmentResult = Readonly<{
  rowCount: number;
  plaintextSemanticSha256: string;
}>;

export function createStreamingSegmentWriter(
  sink: (chunk: string) => void,
): Readonly<{
  write: (row: LosslessPostgresRow) => void;
  finalize: () => StreamingSegmentResult;
}> {
  const hash = createHash("sha256");
  let rowCount = 0;
  let finalized = false;

  return {
    write(row) {
      if (finalized) throw new Error("Cannot write after portable segment finalization.");
      const line = `${canonicalizeLosslessRow(row)}\n`;
      hash.update(line, "utf8");
      sink(line);
      rowCount += 1;
    },
    finalize() {
      if (finalized) throw new Error("Portable segment writer was already finalized.");
      finalized = true;
      return Object.freeze({ rowCount, plaintextSemanticSha256: hash.digest("hex") });
    },
  };
}
