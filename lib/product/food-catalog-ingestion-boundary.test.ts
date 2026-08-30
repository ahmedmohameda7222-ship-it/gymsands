import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const APPROVED_BASE_SHA = "488203fdee566b82c30a51ca9b6cbc050cfaf61f";
const BATCH0_MIGRATION = "20260830011407_food_catalog_population_readiness.sql";

type LedgerEntry = Record<string, unknown> & { localFile: string; state: string };
type MigrationLedger = {
  pendingCount: number;
  unresolvedCount: number;
  historyRepair: {
    state: string;
    pendingCount: number;
    unresolvedCount: number;
  };
  entries: LedgerEntry[];
};

function readBaseLedger(): MigrationLedger {
  return JSON.parse(
    execFileSync(
      "git",
      ["show", `${APPROVED_BASE_SHA}:supabase/migration-ledger.json`],
      { encoding: "utf8" }
    )
  ) as MigrationLedger;
}

function readCurrentLedger(): MigrationLedger {
  return JSON.parse(readFileSync("supabase/migration-ledger.json", "utf8")) as MigrationLedger;
}

describe("Food Catalog Batch 0 ingestion boundary", () => {
  it("preserves every historical migration-ledger entry and adds only the readiness migration as pending", () => {
    const base = readBaseLedger();
    const current = readCurrentLedger();
    const batch0Entries = current.entries.filter((entry) => entry.localFile === BATCH0_MIGRATION);
    const historicalEntries = current.entries.filter((entry) => entry.localFile !== BATCH0_MIGRATION);

    expect(historicalEntries).toEqual(base.entries);
    expect(batch0Entries).toEqual([
      expect.objectContaining({
        localFile: BATCH0_MIGRATION,
        state: "pending"
      })
    ]);
    expect(current.pendingCount).toBe(1);
    expect(current.unresolvedCount).toBe(1);
    expect(current.historyRepair).toEqual(
      expect.objectContaining({
        state: "pending",
        pendingCount: 1,
        unresolvedCount: 1
      })
    );
  });
});
