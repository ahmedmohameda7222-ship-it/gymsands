import assert from "node:assert/strict";
import test from "node:test";
import * as restore from "./restore-food-catalog-portable.mjs";

function canonicalRun({ id, executionMode, status, leaseEpoch }) {
  return JSON.stringify([
    ["id", "uuid", id],
    ["execution_mode", "text", executionMode],
    ["status", "text", status],
    ["lease_epoch", "int8", String(leaseEpoch)],
    ["lease_owner", "text", null],
    ["lease_token", "uuid", null],
    ["lease_acquired_at", "timestamptz", null],
    ["lease_heartbeat_at", "timestamptz", null],
    ["lease_expires_at", "timestamptz", null],
  ]);
}

const build = restore.buildRestoredIngestionRunBlockSql;

test("restored Production running and prepared runs require target-local operational blocks", () => {
  assert.equal(typeof build, "function", "restore block builder must exist");
  for (const [status, epoch] of [["running", 9], ["prepared", 4]]) {
    const id = status === "running" ? "71000000-0000-4000-8000-000000000001" : "71000000-0000-4000-8000-000000000002";
    const sql = build(canonicalRun({ id, executionMode: "production", status, leaseEpoch: epoch }));
    assert.equal(typeof sql, "string");
    assert.match(sql, /food_catalog_ingestion_restore_blocks/);
    assert.match(sql, new RegExp(id));
    assert.match(sql, new RegExp(status));
    assert.match(sql, new RegExp(String(epoch)));
  }
});

test("terminal and non-Production runs do not receive restore blocks", () => {
  assert.equal(typeof build, "function", "restore block builder must exist");
  for (const status of ["completed", "failed", "cancelled"]) {
    assert.equal(build(canonicalRun({ id: "71000000-0000-4000-8000-000000000010", executionMode: "production", status, leaseEpoch: 3 })), null);
  }
  assert.equal(build(canonicalRun({ id: "71000000-0000-4000-8000-000000000011", executionMode: "dry_run", status: "running", leaseEpoch: 3 })), null);
});
