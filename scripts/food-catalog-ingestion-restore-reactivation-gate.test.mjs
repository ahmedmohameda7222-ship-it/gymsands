import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import * as restore from "./restore-food-catalog-portable.mjs";

const MIGRATION = "supabase/migrations/20260917023000_food_catalog_ingestion_restore_reactivation_gate.sql";
const AUTHORITATIVE = "supabase/migrations/20260904100000_food_catalog_ingestion_v2_authority.sql";

function ingestionRow({ id, status, leaseEpoch, executionMode = "production" }) {
  return JSON.stringify([
    ["id", "uuid", id],
    ["execution_mode", "text", executionMode],
    ["status", "text", status],
    ["lease_epoch", "bigint", String(leaseEpoch)],
    ["lease_owner", "text", null],
    ["lease_token", "uuid", null],
    ["lease_acquired_at", "timestamp with time zone", null],
    ["lease_heartbeat_at", "timestamp with time zone", null],
    ["lease_expires_at", "timestamp with time zone", null],
  ]);
}

function acquireDefinition(sql) {
  const marker = "create or replace function public.food_catalog_ingestion_acquire_lease_v2(p_command jsonb)";
  const start = sql.toLowerCase().indexOf(marker);
  assert.notEqual(start, -1, "acquire-lease authority definition must exist");
  const tail = sql.slice(start);
  const endMarker = "\n$function$;";
  const end = tail.indexOf(endMarker);
  assert.notEqual(end, -1, "acquire-lease authority definition must terminate with $function$;");
  return tail.slice(0, end + endMarker.length);
}

function normalizeFunction(sql) {
  return sql.replace(/\r\n/gu, "\n").replace(/[ \t]+$/gmu, "").trim();
}

test("restore reconstructs blocks only for nonterminal Production ingestion history", () => {
  assert.equal(typeof restore.buildRestoredIngestionRunBlockSql, "function", "restore block SQL builder must exist");
  const running = "71000000-0000-4000-8000-000000000001";
  const prepared = "71000000-0000-4000-8000-000000000002";
  const completed = "71000000-0000-4000-8000-000000000003";
  const failed = "71000000-0000-4000-8000-000000000004";
  const cancelled = "71000000-0000-4000-8000-000000000005";
  const dryRun = "71000000-0000-4000-8000-000000000006";
  const sql = restore.buildRestoredIngestionRunBlockSql([
    ingestionRow({ id: running, status: "running", leaseEpoch: 9 }),
    ingestionRow({ id: prepared, status: "prepared", leaseEpoch: 3 }),
    ingestionRow({ id: completed, status: "completed", leaseEpoch: 4 }),
    ingestionRow({ id: failed, status: "failed", leaseEpoch: 5 }),
    ingestionRow({ id: cancelled, status: "cancelled", leaseEpoch: 6 }),
    ingestionRow({ id: dryRun, status: "running", leaseEpoch: 7, executionMode: "dry_run" }),
  ]);

  assert.match(sql, new RegExp(running));
  assert.match(sql, /'running'/u);
  assert.match(sql, /\b9\b/u);
  assert.match(sql, new RegExp(prepared));
  assert.match(sql, /'prepared'/u);
  assert.match(sql, /\b3\b/u);
  for (const id of [completed, failed, cancelled, dryRun]) assert.doesNotMatch(sql, new RegExp(id));
  assert.match(sql, /food_catalog_ingestion_restore_blocks/u);
  assert.match(sql, /restored_status/u);
  assert.match(sql, /restored_lease_epoch/u);
  assert.match(sql, /ON CONFLICT \(run_id\) DO NOTHING/u);
  assert.match(sql, /IF NOT EXISTS/u);
  assert.match(sql, /55000/u);
  assert.match(sql, /conflict|mismatch/iu);
});

test("restore block reconstruction is empty without nonterminal Production history", () => {
  assert.equal(restore.buildRestoredIngestionRunBlockSql([
    ingestionRow({ id: "71000000-0000-4000-8000-000000000010", status: "completed", leaseEpoch: 1 }),
    ingestionRow({ id: "71000000-0000-4000-8000-000000000011", status: "running", leaseEpoch: 2, executionMode: "dry_run" }),
  ]), "");
});

test("forward migration supplies the target-local guard before replay", () => {
  assert.equal(existsSync(MIGRATION), true, `${MIGRATION} must exist`);
  const sql = readFileSync(MIGRATION, "utf8");
  assert.match(sql, /create table public\.food_catalog_ingestion_restore_blocks/iu);
  assert.match(sql, /alter table public\.food_catalog_ingestion_restore_blocks enable row level security/iu);
  assert.match(sql, /references public\.food_ingestion_runs\(id\) on delete restrict/iu);
  assert.match(sql, /restored_lease_epoch bigint not null check \(restored_lease_epoch >= 0\)/iu);
  assert.match(sql, /food_catalog_ingestion_require_not_restore_blocked_v1/iu);
  const acquire = acquireDefinition(sql);
  const guard = acquire.indexOf("private.food_catalog_ingestion_require_not_restore_blocked_v1(v_run_id)");
  const replay = acquire.indexOf("private.food_catalog_ingestion_replay_operation_v2(");
  assert.notEqual(guard, -1, "acquire authority must call restore guard");
  assert.notEqual(replay, -1, "acquire authority must preserve replay");
  assert.ok(guard < replay, "restore guard must execute before operation replay");
});

test("acquire authority is byte-preserved after removing only the restore guard", () => {
  assert.equal(existsSync(MIGRATION), true, `${MIGRATION} must exist`);
  const oldDefinition = acquireDefinition(readFileSync(AUTHORITATIVE, "utf8"));
  const newDefinition = acquireDefinition(readFileSync(MIGRATION, "utf8"));
  const stripped = newDefinition.replace(/\n\s*perform private\.food_catalog_ingestion_require_not_restore_blocked_v1\(v_run_id\);/u, "");
  assert.equal(normalizeFunction(stripped), normalizeFunction(oldDefinition));
});

test("restore-block relation remains target-local and outside portable registry", () => {
  const registry = readFileSync("lib/food-catalog/portability/relation-registry.ts", "utf8");
  assert.doesNotMatch(registry, /food_catalog_ingestion_restore_blocks/u);
});
