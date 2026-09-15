import assert from "node:assert/strict";
import test from "node:test";

import { buildFoodCatalogSchemaIdentitySql } from "./schema-identity.mjs";

function section(sql, start, end) {
  const startIndex = sql.indexOf(start);
  const endIndex = sql.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Missing ${start} section.`);
  assert.notEqual(endIndex, -1, `Missing ${end} section.`);
  return sql.slice(startIndex, endIndex);
}

test("schema identity fingerprints user_food_items through the canonical relation pipeline", () => {
  const sql = buildFoodCatalogSchemaIdentitySql();
  const relationScope = section(sql, "relation_scope AS (", "), column_parts AS (");

  assert.match(relationScope, /'user_food_items'/);
  for (const fingerprintSection of ["column_parts AS (", "relation_parts AS (", "constraint_parts AS (", "policy_parts AS (", "trigger_parts AS ("]) {
    const start = sql.indexOf(fingerprintSection);
    assert.notEqual(start, -1, `Missing ${fingerprintSection} section.`);
    assert.match(sql.slice(start), /relation_scope/);
  }
  assert.match(sql, /:generated=/);
  assert.match(sql, /:identity=/);
  assert.match(sql, /:rls=/);
  assert.match(sql, /:force_rls=/);
  assert.match(sql, /pg_get_constraintdef/);
  assert.match(sql, /pg_get_triggerdef/);
});

test("schema identity preserves public Food Catalog functions and adds only private.food_catalog_* helpers with ACLs", () => {
  const sql = buildFoodCatalogSchemaIdentitySql();
  const functionScope = section(sql, "function_scope AS (", "), function_parts AS (");

  assert.match(functionScope, /n\.nspname = 'public'[\s\S]*p\.proname LIKE 'food_%'[\s\S]*p\.proname LIKE '%food_catalog%'/);
  assert.match(functionScope, /n\.nspname = 'private'[\s\S]*p\.proname LIKE 'food_catalog_%'/);
  assert.doesNotMatch(functionScope, /n\.nspname\s+IN\s*\([^)]*'private'/i);
  assert.doesNotMatch(functionScope, /n\.nspname = 'private'\s+AND\s+p\.proname\s+LIKE\s+'%'/i);

  assert.match(sql, /pg_get_function_identity_arguments\(f\.oid\)/);
  assert.match(sql, /pg_get_functiondef\(f\.oid\)/);
  assert.match(sql, /function_acl_parts AS \([\s\S]*FROM function_scope f[\s\S]*aclexplode/);
  assert.match(sql, /ORDER BY part_kind COLLATE "C", part_identity COLLATE "C"/);
});
