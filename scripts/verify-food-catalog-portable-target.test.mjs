import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import {
  buildPortableTargetProfileSql,
  evaluatePortableTargetProfile,
} from "./verify-food-catalog-portable-target.mjs";

const expected = {
  migrationCount: "123",
  latestMigration: "20260910071241",
  migrationLedgerIdentity: "a".repeat(64),
  schemaFingerprintSha256: "b".repeat(64),
};

const compatibleObserved = {
  serverVersionNum: "170011",
  extensions: ["pgcrypto", "pg_trgm", "uuid-ossp"],
  roles: ["anon", "authenticated", "service_role", "authenticator"],
  authUsersPresent: true,
  ...expected,
};

describe("Plan 7 portable restore target profile", () => {
  it("checks PostgreSQL 17, required extensions, auth/RLS compatibility roles and schema/migration identity", () => {
    const sql = buildPortableTargetProfileSql();
    for (const fragment of [
      "server_version_num",
      "pgcrypto",
      "pg_trgm",
      "uuid-ossp",
      "authenticated",
      "service_role",
      "anon",
      "auth.users",
      "supabase_migrations.schema_migrations",
    ]) assert.ok(sql.includes(fragment), `Expected target profile SQL to contain ${fragment}`);
  });

  it("uses the same authoritative non-column schema identity definition as export", async () => {
    const source = await readFile(new URL("./verify-food-catalog-portable-target.mjs", import.meta.url), "utf8");
    assert.match(source, /schema-identity\.mjs/);
    assert.match(source, /buildFoodCatalogSchemaIdentitySql/);
    const sql = buildPortableTargetProfileSql();
    for (const fragment of [
      "user_food_favorites",
      "pg_get_expr",
      "attgenerated",
      "attidentity",
      "pg_constraint",
      "pg_get_constraintdef",
      "pg_policies",
      "pg_trigger",
      "pg_get_triggerdef",
      "pg_proc",
      "pg_get_functiondef",
      "aclexplode",
    ]) assert.ok(sql.includes(fragment), `Expected target schema fingerprint SQL to contain ${fragment}`);
  });

  it("accepts only an exact compatible target profile", () => {
    const result = evaluatePortableTargetProfile(compatibleObserved, expected);
    assert.equal(result.compatible, true);
    assert.equal(result.postgresMajor, 17);
  });

  const failureCases = [
    ["PostgreSQL 16", { serverVersionNum: "160009" }],
    ["missing extension", { extensions: ["pgcrypto", "pg_trgm"] }],
    ["missing auth role", { roles: ["anon", "authenticated", "service_role"] }],
    ["missing auth.users", { authUsersPresent: false }],
    ["wrong migration ledger", { migrationLedgerIdentity: "c".repeat(64) }],
    ["wrong schema fingerprint", { schemaFingerprintSha256: "d".repeat(64) }],
  ];

  for (const [label, patch] of failureCases) {
    it(`fails closed on ${label}`, () => {
      assert.throws(() => evaluatePortableTargetProfile({ ...compatibleObserved, ...patch }, expected));
    });
  }
});
