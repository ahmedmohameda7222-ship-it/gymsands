import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const LEDGER = "supabase/migration-ledger.json";

describe("Food Catalog Plan 7 Production alignment evidence", () => {
  it("records the four exact Production aliases already applied while leaving only the expand migration pending", () => {
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
    ] as const;

    for (const [localFile, productionVersion, productionName] of expectedAliases) {
      expect(ledger.entries.find((entry) => entry.localFile === localFile)).toEqual(expect.objectContaining({
        localFile,
        state: "applied_version_alias",
        productionVersion,
        productionName,
      }));
    }

    expect(ledger.entries.find((entry) =>
      entry.localFile === "20260924051500_food_catalog_plan7_owner_reconciliation_expand.sql"
    )).toEqual(expect.objectContaining({
      state: "pending",
    }));

    expect(ledger.productionMigrationCount).toBe(63);
    expect(ledger.productionRecordCount).toBe(127);
    expect(ledger.schemaVerifiedUntrackedCount).toBe(0);
    expect(ledger.pendingCount).toBe(1);
    expect(ledger.unresolvedCount).toBe(1);
    expect(ledger.historyRepair).toEqual(expect.objectContaining({
      state: "pending",
      schemaAppliedUntrackedCount: 0,
      pendingCount: 1,
      unresolvedCount: 1,
    }));
  });
});
