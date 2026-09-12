import { canonicalizePostgresScalar, type LosslessPostgresScalar } from "./canonicalize.ts";

export type LosslessPostgresRow = Readonly<Record<string, LosslessPostgresScalar>>;

export function stableKeyToken(row: LosslessPostgresRow, stableKey: readonly string[]): string {
  if (stableKey.length === 0) throw new Error("A stable key is required for authoritative export ordering.");
  return JSON.stringify(stableKey.map((column) => {
    const scalar = row[column];
    if (!scalar) throw new Error(`Missing stable key column ${column}.`);
    if (scalar.text === null) throw new Error(`Stable key column ${column} cannot be NULL.`);
    return canonicalizePostgresScalar(scalar);
  }));
}

function compareCodeUnits(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function assertStrictStableKeyOrder(
  rows: Iterable<LosslessPostgresRow>,
  stableKey: readonly string[],
): void {
  let previous: string | undefined;
  for (const row of rows) {
    const current = stableKeyToken(row, stableKey);
    if (previous !== undefined) {
      const comparison = compareCodeUnits(previous, current);
      if (comparison === 0) throw new Error(`Duplicate stable key ${current}.`);
      if (comparison > 0) throw new Error(`Non-monotonic stable key order: ${current} followed ${previous}.`);
    }
    previous = current;
  }
}

export async function streamStrictStableKeyRows(
  rows: AsyncIterable<LosslessPostgresRow>,
  stableKey: readonly string[],
  consume: (row: LosslessPostgresRow) => void | Promise<void>,
): Promise<number> {
  let previous: string | undefined;
  let count = 0;
  for await (const row of rows) {
    const current = stableKeyToken(row, stableKey);
    if (previous !== undefined) {
      const comparison = compareCodeUnits(previous, current);
      if (comparison === 0) throw new Error(`Duplicate stable key ${current}.`);
      if (comparison > 0) throw new Error(`Non-monotonic stable key order: ${current} followed ${previous}.`);
    }
    await consume(row);
    previous = current;
    count += 1;
  }
  return count;
}
