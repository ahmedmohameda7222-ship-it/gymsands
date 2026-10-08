import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const LEDGER = "supabase/migration-ledger.json";

describe("Food Catalog Plan 7 Production alignment evidence", () => {
  it("records all six exact Production aliases with a reconciled ledger", () => {
    const ledger = JSON.parse(readFileSync(LEDGER, "utf8")) as {
      productionMigrationCount: number;
      productionRecordCount: number;
      pendingCount: number;
      unresolvedCount: number;
      schemaVerifiedUntrackedCount: number;
      historyRepair: {
        state: string;
        pendingCount: number;
        unresolvedCount: number;
        schemaAppliedUntrackedCount: number;
      };
      entries: Array<{
        localFile: string;
        state: string;
        productionVersion?: string;
        productionName?: string;
      }>;
    };

    const expectedAliases = [
      ["20260915170011_food_catalog_governance_outbox_reconciliation_gate.sql", "20261008014113", "food_catalog_governance_outbox_reconciliation_gate"],
      ["20260915170012_food_catalog_owner_correction_export.sql", "20261008014144", "food_catalog_owner_correction_export"],
      ["20260917023000_food_catalog_ingestion_restore_reactivation_gate.sql", "20261008014204", "food_catalog_ingestion_restore_reactivation_gate"],
      ["20260919034630_food_catalog_owner_override_read_authority.sql", "20261008014223", "food_catalog_owner_override_read_authority"],
      ["20260924051500_food_catalog_plan7_owner_reconciliation_expand.sql", "20261008022805", "food_catalog_plan7_owner_reconciliation_expand"],
    ] as const;

    for (const [localFile, productionVersion, productionName] of expectedAliases) {
      expect(ledger.entries.find((entry) => entry.localFile === localFile)).toEqual(expect.objectContaining({
        localFile,
        state: "applied_version_alias",
        productionVersion,
        productionName,
      }));
    }

    expect(ledger.productionMigrationCount).toBe(63);
    expect(ledger.productionRecordCount).toBe(129);
    expect(ledger.entries.find((entry) => entry.localFile === "20261008060000_food_catalog_plan7_retirement_prerequisite.sql"))
      .toEqual(expect.objectContaining({
        state: "applied_version_alias",
        productionVersion: "20261008123814",
        productionName: "food_catalog_plan7_retirement_prerequisite",
      }));
    expect(ledger.schemaVerifiedUntrackedCount).toBe(0);
    expect(ledger.pendingCount).toBe(0);
    expect(ledger.unresolvedCount).toBe(0);
    expect(ledger.historyRepair).toEqual(expect.objectContaining({
      state: "reconciled",
      schemaAppliedUntrackedCount: 0,
      pendingCount: 0,
      unresolvedCount: 0,
    }));
  });
});
