import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFoodCatalogSchemaIdentitySql } from "./schema-identity.mjs";

test("schema identity fingerprints every index attached to an in-scope Food Catalog relation", () => {
  const sql = buildFoodCatalogSchemaIdentitySql();
  assert.match(sql, /index_parts\s+AS\s*\(/i,
    "Schema identity must include an explicit index identity class.");
  assert.match(sql, /FROM\s+pg_index\s+i[\s\S]*JOIN\s+relation_scope\s+r\s+ON\s+r\.oid\s*=\s*i\.indrelid/i,
    "Every index attached to an in-scope relation must be collected from pg_index.");
  for (const fragment of [
    "indisunique",
    "indisprimary",
    "indisexclusion",
    "indisvalid",
    "indisready",
    "pg_get_indexdef",
    "i.indpred",
    "i.indexprs",
  ]) assert.ok(sql.includes(fragment), `Expected index identity SQL to include ${fragment}.`);
  assert.match(sql, /UNION\s+ALL\s+SELECT\s+\*\s+FROM\s+index_parts/i,
    "Index identity must contribute to the final schema fingerprint input.");
});
