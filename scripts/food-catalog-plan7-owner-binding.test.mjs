import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildOwnerBindingEvidenceSql } from "./verify-food-catalog-integrated-restore.mjs";

describe("Plan 7 protected owner binding coverage", () => {
  it("binds transitional favorites and correction member-payload owners before certification", () => {
    const sql = buildOwnerBindingEvidenceSql();

    assert.match(
      sql,
      /SELECT\s+user_id,\s*'transitional_favorite'::text\s+AS\s+source\s+FROM\s+public\.user_food_favorites/i,
      "Transitional user_food_favorites owners must participate in external identity binding.",
    );
    assert.match(
      sql,
      /SELECT\s+reporter_user_id\s+AS\s+user_id,\s*'correction_report_member_payload'::text\s+AS\s+source\s+FROM\s+public\.food_catalog_correction_report_member_payloads/i,
      "Correction member-payload reporter owners must participate in external identity binding.",
    );
  });
});
