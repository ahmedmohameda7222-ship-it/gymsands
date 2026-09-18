import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFoodCatalogSchemaIdentitySql } from "./schema-identity.mjs";

test("schema identity includes every direct trigger helper attached to an in-scope Food Catalog relation", () => {
  const sql = buildFoodCatalogSchemaIdentitySql();
  assert.match(sql, /trigger_function_scope\s+AS\s*\(/i,
    "Schema identity must derive trigger helper functions from in-scope relation triggers.");
  assert.match(sql, /SELECT\s+DISTINCT\s+t\.tgfoid\s+AS\s+oid[\s\S]*JOIN\s+relation_scope\s+r\s+ON\s+r\.oid\s*=\s*t\.tgrelid[\s\S]*NOT\s+t\.tgisinternal/i,
    "Every non-internal trigger function OID for an in-scope relation must be collected.");
  assert.match(sql, /p\.oid\s+IN\s*\(\s*SELECT\s+oid\s+FROM\s+trigger_function_scope\s*\)/i,
    "Function definitions and ACLs must include trigger helpers regardless of private helper naming.");
});
