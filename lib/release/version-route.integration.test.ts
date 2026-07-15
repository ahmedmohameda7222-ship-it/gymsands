import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getDatabaseSchemaCompatibility = vi.fn();
vi.mock("@/lib/release/database-compatibility", () => ({ getDatabaseSchemaCompatibility }));

const fullSha = "60a204d5fc20fc396be1b1b47e748c42ebba6abf";
const expectedMigration = "20260715010000";
const compatibleDatabase = { available: true, version: "2", migrationVersion: expectedMigration };

describe("GET /api/version", () => {
  beforeEach(() => {
    vi.resetModules();
    getDatabaseSchemaCompatibility.mockReset();
    vi.stubEnv("PLAIVRA_COMMIT_SHA", fullSha);
    vi.stubEnv("PLAIVRA_BUILD_TIMESTAMP", "2026-07-10T12:30:00.000Z");
    vi.stubEnv("PLAIVRA_RELEASE_ENVIRONMENT", "test");
    vi.stubEnv("PLAIVRA_SCHEMA_COMPATIBILITY_VERSION", "2");
    vi.stubEnv("PLAIVRA_EXPECTED_DATABASE_MIGRATION_VERSION", expectedMigration);
    vi.stubEnv("PLAIVRA_MIGRATION_LEDGER_RECONCILIATION_STATE", "reconciled");
    vi.stubEnv("PLAIVRA_PENDING_MIGRATION_COUNT", "0");
    vi.stubEnv("PLAIVRA_SCHEMA_APPLIED_UNTRACKED_COUNT", "0");
    vi.stubEnv("PLAIVRA_UNRESOLVED_MIGRATION_COUNT", "0");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("returns 200 only for a complete artifact and matching database readiness contract", async () => {
    getDatabaseSchemaCompatibility.mockResolvedValue(compatibleDatabase);
    const { GET } = await import("@/app/api/version/route");
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(body).toMatchObject({
      commitSha: fullSha,
      buildTimestamp: "2026-07-10T12:30:00.000Z",
      environment: "test",
      schemaCompatibilityVersion: "2",
      expectedSchemaCompatibilityVersion: "2",
      expectedDatabaseMigrationVersion: expectedMigration,
      databaseSchemaCompatibilityVersion: "2",
      databaseMigrationVersion: expectedMigration,
      migrationLedgerReconciliationState: "reconciled",
      pendingMigrationCount: 0,
      schemaAppliedUntrackedCount: 0,
      unresolvedMigrationCount: 0,
      artifactIdentityValid: true,
      schemaMarkerCompatible: true,
      migrationVersionCompatible: true,
      migrationLedgerReconciled: true,
      releaseReady: true
    });
  });

  it.each([
    {
      name: "pending migration reconciliation",
      environment: { PLAIVRA_MIGRATION_LEDGER_RECONCILIATION_STATE: "pending" },
      database: compatibleDatabase,
      expected: { migrationLedgerReconciled: false }
    },
    {
      name: "nonzero pending migrations",
      environment: { PLAIVRA_PENDING_MIGRATION_COUNT: "1", PLAIVRA_UNRESOLVED_MIGRATION_COUNT: "1" },
      database: compatibleDatabase,
      expected: { migrationLedgerReconciled: false }
    },
    {
      name: "nonzero schema-applied untracked migrations",
      environment: { PLAIVRA_SCHEMA_APPLIED_UNTRACKED_COUNT: "7", PLAIVRA_UNRESOLVED_MIGRATION_COUNT: "7" },
      database: compatibleDatabase,
      expected: { migrationLedgerReconciled: false }
    },
    {
      name: "unchanged database compatibility marker",
      environment: {},
      database: { ...compatibleDatabase, migrationVersion: "20260711014500" },
      expected: { migrationVersionCompatible: false }
    },
    {
      name: "schema marker mismatch",
      environment: {},
      database: { ...compatibleDatabase, version: "3" },
      expected: { schemaMarkerCompatible: false }
    },
    {
      name: "unavailable database marker",
      environment: {},
      database: { available: false, version: "unavailable", migrationVersion: null },
      expected: { schemaMarkerCompatible: false, migrationVersionCompatible: false }
    },
    {
      name: "invalid artifact SHA",
      environment: { PLAIVRA_COMMIT_SHA: "abcdef1" },
      database: compatibleDatabase,
      expected: { artifactIdentityValid: false }
    },
    {
      name: "invalid build timestamp",
      environment: { PLAIVRA_BUILD_TIMESTAMP: "not-a-time" },
      database: compatibleDatabase,
      expected: { artifactIdentityValid: false }
    },
    {
      name: "missing build timestamp",
      environment: { PLAIVRA_BUILD_TIMESTAMP: "" },
      database: compatibleDatabase,
      expected: { artifactIdentityValid: false }
    }
  ])("returns 503 for $name", async ({ environment, database, expected }) => {
    for (const [key, value] of Object.entries(environment)) vi.stubEnv(key, value);
    getDatabaseSchemaCompatibility.mockResolvedValue(database);
    const { GET } = await import("@/app/api/version/route");
    const response = await GET();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ ...expected, releaseReady: false });
  });
});
