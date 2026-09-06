import fs from "node:fs";
import { describe, expect, it } from "vitest";
import type {
  FoodCatalogCandidateInput,
  FoodCatalogSourceDescriptor,
} from "@/lib/food-catalog/ingestion/contracts";
import { buildFoodCatalogDryRun } from "@/lib/food-catalog/ingestion/engine";
import type { FoodCatalogMatchIndex } from "@/lib/food-catalog/ingestion/matching";
import { createSyntheticFoodCatalogAdapter } from "@/lib/food-catalog/ingestion/synthetic-adapter";
import { createSupabaseFoodCatalogIngestionCommandStore } from "@/services/food-catalog/server/supabase-ingestion-command-store";

const read = (path: string) => fs.readFileSync(path, "utf8");

const source = (overrides: Partial<FoodCatalogSourceDescriptor> = {}): FoodCatalogSourceDescriptor => ({
  provider: "synthetic-reference",
  dataset: "plan4-boundary-fixture",
  sourceVersion: "2026.09",
  sourceReleaseDate: "2026-09-04",
  licenseName: "Fixture License",
  licenseReference: "fixture-license",
  sourceReference: "fixture://plan4-boundary",
  sourceChecksumSha256: "a".repeat(64),
  importerVersion: "plan4-boundary-1",
  configChecksumSha256: "b".repeat(64),
  ...overrides,
});

const candidate = (
  sourceRecordId: string,
  overrides: Partial<FoodCatalogCandidateInput> = {},
): FoodCatalogCandidateInput => ({
  sourceRecordId,
  sourceReference: null,
  sourceRecordChecksumSha256: "c".repeat(64),
  canonicalName: `Fixture ${sourceRecordId}`,
  brandName: null,
  servingLabel: null,
  category: null,
  cuisine: null,
  nutrition: {
    calories: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    saturated_fat_g: null,
    fiber_g: null,
    sugars_g: null,
    sodium_mg: null,
    basis_amount: null,
    basis_unit: null,
  },
  aliases: [],
  names: [],
  identityEvidence: {
    semanticSignature: null,
    preparation: null,
    state: null,
    form: null,
    structuredEvidenceKey: null,
  },
  servings: [],
  taxonomyEvidence: [],
  gtins: [],
  marketScopes: [],
  globallyRelevant: false,
  sourceNutrition: null,
  sourceServing: null,
  ...overrides,
});

const emptyIndex = (): FoodCatalogMatchIndex => ({
  sourceIdentities: [],
  gtinOwners: [],
  redirects: [],
  semanticIdentities: [],
  qualifiedAliases: [],
  possibleDuplicateNames: [],
});

const plan4RuntimePaths = [
  "lib/food-catalog/ingestion/adapter.ts",
  "lib/food-catalog/ingestion/normalize.ts",
  "lib/food-catalog/ingestion/validate.ts",
  "lib/food-catalog/ingestion/manifest.ts",
  "lib/food-catalog/ingestion/matching.ts",
  "lib/food-catalog/ingestion/quarantine.ts",
  "lib/food-catalog/ingestion/reconciliation.ts",
  "lib/food-catalog/ingestion/release-diff.ts",
  "lib/food-catalog/ingestion/engine.ts",
  "lib/food-catalog/ingestion/synthetic-adapter.ts",
  "services/food-catalog/server/ingestion-contracts.ts",
  "services/food-catalog/server/ingestion-store.ts",
  "services/food-catalog/server/ingestion-command-service.ts",
  "services/food-catalog/server/supabase-ingestion-command-store.ts",
];

const serverOnlyPlan4Paths = [
  "services/food-catalog/server/ingestion-contracts.ts",
  "services/food-catalog/server/ingestion-store.ts",
  "services/food-catalog/server/ingestion-command-service.ts",
  "services/food-catalog/server/supabase-ingestion-command-store.ts",
];

describe("Food Catalog Plan 4 cross-boundary security and replay", () => {
  it("contains only the synthetic/reference adapter and no real-provider download runtime", () => {
    const adapterFiles = fs.readdirSync("lib/food-catalog/ingestion")
      .filter((name) => name.endsWith("-adapter.ts"))
      .sort();
    const dataFiles = fs.readdirSync("lib/food-catalog/ingestion")
      .filter((name) => /\.(?:csv|tsv|json|zip|gz|parquet)$/i.test(name))
      .sort();
    const runtime = plan4RuntimePaths.map(read).join("\n").toLowerCase();

    expect(adapterFiles).toEqual(["synthetic-adapter.ts"]);
    expect(dataFiles).toEqual([]);
    for (const forbidden of ["usda", "fooddata central", "fndds", "openfoodfacts", "open food facts"]) {
      expect(runtime).not.toContain(forbidden);
    }
    expect(runtime).not.toMatch(/\bfetch\s*\(/);
    expect(runtime).not.toMatch(/\baxios\b/);
  });

  it("keeps the Plan 4 command surface server-only and outside member, activation, My Foods, and historical authorities", () => {
    for (const path of serverOnlyPlan4Paths) {
      expect(read(path)).toMatch(/^import "server-only";/);
    }

    const runtime = plan4RuntimePaths.map(read).join("\n");
    const publicIndex = read("services/food-catalog/server/index.ts");
    const forbidden = [
      "food_catalog_create_activation_set_v1",
      "food_catalog_grant_activation_set_v1",
      "food_catalog_invalidate_activation_grant_v1",
      "food_catalog_create_generation_v1",
      "food_catalog_promote_generation_v1",
      "food_catalog_rollback_generation_v1",
      "food_catalog_revoke_generation_v1",
      "FoodCatalogWriteStore",
      "user_food_items",
      "food_logs",
      "custom_meals",
      "user_meal_plan_items",
    ];
    for (const token of forbidden) expect(runtime).not.toContain(token);
    expect(publicIndex).not.toContain('from "./supabase-ingestion-command-store"');
  });

  it("does not infer market scope from provider naming or localized evidence", () => {
    const adapter = createSyntheticFoodCatalogAdapter();
    const result = buildFoodCatalogDryRun(adapter, {
      source: source({ provider: "de-locale-fixture" }),
      candidates: [candidate("market-none", {
        names: [{ locale: "de-DE", script: "Latn", role: "source", value: "Beispiel" }],
        aliases: [{ locale: "de-DE", value: "Beispiel Alias" }],
        marketScopes: [],
        globallyRelevant: false,
      })],
    }, emptyIndex());

    expect(result.manifestContent.candidates[0]?.candidate.marketScopes).toEqual([]);
    expect(result.manifestContent.candidates[0]?.candidate.globallyRelevant).toBe(false);
  });

  it("replays more than 1,000 provider-neutral candidates deterministically", () => {
    const adapter = createSyntheticFoodCatalogAdapter();
    const candidates = Array.from({ length: 1001 }, (_, index) =>
      candidate(`record-${String(index).padStart(4, "0")}`));
    const first = buildFoodCatalogDryRun(adapter, { source: source(), candidates }, emptyIndex());
    const second = buildFoodCatalogDryRun(adapter, {
      source: source(),
      candidates: [...candidates].reverse(),
    }, emptyIndex());

    expect(first.manifestContent.expectedMutations.input).toBe(1001);
    expect(second.manifestContentChecksumSha256).toBe(first.manifestContentChecksumSha256);
    expect(second.semanticBatchIdentityChecksumSha256).toBe(first.semanticBatchIdentityChecksumSha256);
  });

  it("fails closed when one provider release contains a duplicate normalized source identity", () => {
    const adapter = createSyntheticFoodCatalogAdapter();
    expect(() => buildFoodCatalogDryRun(adapter, {
      source: source(),
      candidates: [
        candidate(" duplicate-record "),
        candidate("duplicate-record", {
          canonicalName: "Conflicting duplicate record",
          sourceRecordChecksumSha256: "d".repeat(64),
        }),
      ],
    }, emptyIndex())).toThrow(/duplicate.*source.*identity/i);
  });

  it("keeps narrow command replay idempotent and rejects changed semantic reuse of one operation ID", async () => {
    const seen = new Map<string, string>();
    const rpc = async (_name: string, args: Record<string, unknown>) => {
      const command = args.p_command as Record<string, unknown>;
      const operationId = String(command.operationId);
      const checksum = String(command.commandChecksumSha256);
      const previous = seen.get(operationId);
      if (previous && previous !== checksum) {
        return { data: null, error: { message: "Food Catalog ingestion operation replay conflict." } };
      }
      seen.set(operationId, checksum);
      return { data: { releaseDiffId: "66000000-0000-4000-8000-000000000001" }, error: null };
    };
    const client = { rpc } as unknown as Parameters<typeof createSupabaseFoodCatalogIngestionCommandStore>[0];
    const store = createSupabaseFoodCatalogIngestionCommandStore(client);
    const operationId = "66000000-0000-4000-8000-000000000002";
    const first = {
      batchId: "batch-1",
      previousBatchId: null,
      records: [{ sourceRecordId: "fixture-1", classifications: ["unchanged"] }],
      diffChecksumSha256: "a".repeat(64),
    };

    await expect(store.recordReleaseDiff(operationId, first)).resolves.toBeDefined();
    await expect(store.recordReleaseDiff(operationId, first)).resolves.toBeDefined();
    await expect(store.recordReleaseDiff(operationId, {
      ...first,
      diffChecksumSha256: "b".repeat(64),
    })).rejects.toMatchObject({ code: "OPERATION_ID_CONFLICT" });
  });

  it("pins executable lease takeover and database idempotency proof into canonical verification", () => {
    const verification = read("supabase/verification/food-catalog-ingestion-v2-authority.sql");
    const registry = read("scripts/run-database-verification.mjs");
    const migration = read("supabase/migrations/20260904100000_food_catalog_ingestion_v2_authority.sql");

    expect(registry).toContain("supabase/verification/food-catalog-ingestion-v2-authority.sql");
    expect(verification).toContain("live lease cannot be stolen");
    expect(verification).toContain("stale takeover increments epoch");
    expect(verification).toContain("lease_heartbeat");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("Food Catalog ingestion operation replay conflict.");
  });
});