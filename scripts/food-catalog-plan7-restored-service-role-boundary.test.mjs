import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("reads rotation history before entering rotated service_role while keeping the real claim inside it", () => {
  const capture = readFileSync("scripts/capture-food-catalog-restored-service-authority.mjs", "utf8");
  const historyRead = capture.indexOf("Plan7 generation 1 reconciliation history disappeared before rotation proof");
  const rotatedRole = capture.indexOf("set local role service_role;\nselect set_config('request.jwt.claims','${rotatedServiceClaims}',true);");
  const rotatedClaim = capture.indexOf("Plan7 rotated Service unexpectedly claimed before generation 2 reconciliation");

  assert.notEqual(historyRead, -1, "generation-1 reconciliation history evidence must remain present");
  assert.notEqual(rotatedRole, -1, "rotated Service must still enter service_role with rotated JWT claims");
  assert.notEqual(rotatedClaim, -1, "rotated Service must still call the real outbox claim path");
  assert.ok(historyRead < rotatedRole, "rotation-history ledger evidence must be read before entering restricted service_role");
  assert.ok(rotatedRole < rotatedClaim, "rotated claim must execute only after service_role and rotated JWT claims are installed");
});
