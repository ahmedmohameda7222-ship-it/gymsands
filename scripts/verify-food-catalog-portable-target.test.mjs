import { describe, expect, it } from "vitest";
import {
  buildPortableTargetProfileSql,
  evaluatePortableTargetProfile,
} from "./verify-food-catalog-portable-target.mjs";

describe("Plan 7 portable restore target profile", () => {
  it("checks PostgreSQL 17, required extensions, auth/RLS compatibility roles and schema/migration identity", () => {
    const sql = buildPortableTargetProfileSql();
    expect(sql).toContain("server_version_num");
    expect(sql).toContain("pgcrypto");
    expect(sql).toContain("pg_trgm");
    expect(sql).toContain("uuid-ossp");
    expect(sql).toContain("authenticated");
    expect(sql).toContain("service_role");
    expect(sql).toContain("anon");
    expect(sql).toContain("auth.users");
    expect(sql).toContain("supabase_migrations.schema_migrations");
  });

  it("accepts only an exact compatible target profile", () => {
    expect(evaluatePortableTargetProfile({
      serverVersionNum: "170011",
      extensions: ["pgcrypto", "pg_trgm", "uuid-ossp"],
      roles: ["anon", "authenticated", "service_role", "authenticator"],
      authUsersPresent: true,
      migrationCount: "123",
      latestMigration: "20260910071241",
      migrationLedgerIdentity: "a".repeat(64),
      schemaFingerprintSha256: "b".repeat(64),
    }, {
      migrationCount: "123",
      latestMigration: "20260910071241",
      migrationLedgerIdentity: "a".repeat(64),
      schemaFingerprintSha256: "b".repeat(64),
    })).toMatchObject({ compatible: true, postgresMajor: 17 });
  });

  it.each([
    ["PostgreSQL 16", { serverVersionNum: "160009" }],
    ["missing extension", { extensions: ["pgcrypto", "pg_trgm"] }],
    ["missing auth role", { roles: ["anon", "authenticated", "service_role"] }],
    ["missing auth.users", { authUsersPresent: false }],
    ["wrong migration ledger", { migrationLedgerIdentity: "c".repeat(64) }],
    ["wrong schema fingerprint", { schemaFingerprintSha256: "d".repeat(64) }],
  ])("fails closed on %s", (_label, patch) => {
    const observed = {
      serverVersionNum: "170011",
      extensions: ["pgcrypto", "pg_trgm", "uuid-ossp"],
      roles: ["anon", "authenticated", "service_role", "authenticator"],
      authUsersPresent: true,
      migrationCount: "123",
      latestMigration: "20260910071241",
      migrationLedgerIdentity: "a".repeat(64),
      schemaFingerprintSha256: "b".repeat(64),
      ...patch,
    };
    expect(() => evaluatePortableTargetProfile(observed, {
      migrationCount: "123",
      latestMigration: "20260910071241",
      migrationLedgerIdentity: "a".repeat(64),
      schemaFingerprintSha256: "b".repeat(64),
    })).toThrow();
  });
});
